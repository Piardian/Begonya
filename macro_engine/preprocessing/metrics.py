from __future__ import annotations
import datetime as dt, json, tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional
from config import BIAS_GATE_FILE
from core.deterministic_controls import event_freeze_status, normalize_calendar_event, signed_surprise_zscore, validate_freshness, validate_numeric_range
from data_quality import (
    DataUnavailableError,
    REQUIRED_ECONOMIC_FRED_FIELDS,
    REQUIRED_FRED_FIELDS,
    validate_fred_payload,
    validate_market_payload,
)
from preprocessing.metrics_legacy import MacroMetricsCalculator as _LegacyMacroMetricsCalculator

@contextmanager
def _fixed_legacy_date(as_of_date: Optional[dt.date], as_of_datetime: Optional[dt.datetime]=None, state: Optional[Mapping[str,Any]]=None):
    legacy=__import__("preprocessing.metrics_legacy",fromlist=["datetime"]); od,ot,og=legacy.datetime.date,legacy.datetime.datetime,legacy.BIAS_GATE_FILE
    d=as_of_date or (as_of_datetime.date() if as_of_datetime else dt.date.today()); t=as_of_datetime or dt.datetime.combine(d,dt.time.min,tzinfo=dt.timezone.utc)
    class FD(od):
        @classmethod
        def today(cls): return d
    class FDT(ot):
        @classmethod
        def now(cls,tz=None): return t.astimezone(tz) if tz else t.replace(tzinfo=None)
    temp=None
    try:
        if state is not None:
            temp=tempfile.TemporaryDirectory(prefix="begonya_macro_state_"); p=Path(temp.name)/"previous_regime_state.json"; p.write_text(json.dumps({"regime_state":dict(state)})); legacy.BIAS_GATE_FILE=p
        else: legacy.BIAS_GATE_FILE=BIAS_GATE_FILE
        legacy.datetime.date=FD; legacy.datetime.datetime=FDT; yield
    finally:
        legacy.datetime.date=od; legacy.datetime.datetime=ot; legacy.BIAS_GATE_FILE=og
        if temp: temp.cleanup()

class MacroMetricsCalculator(_LegacyMacroMetricsCalculator):
    DEFAULT_SURPRISE_SIGMAS={"cpi":.12,"core_cpi":.10,"nfp":50000.,"unemployment":.15,"pmi":1.5,"gdp":.50,"retail_sales":.40,"generic":1.0}
    FRED_FREQUENCIES={"WALCL":"weekly","RRPONTSYD":"daily","WTREGEN":"daily","T10YIE":"daily","DFII10":"daily","DFF":"daily","BAMLH0A0HYM2":"daily","NFCI":"weekly","ICSA":"weekly","M2SL":"monthly","DE10Y":"monthly","ECBDFR":"daily","SONIA":"daily"}

    @staticmethod
    def _build_fred_yield_curve(fred_data: Mapping[str, Any]) -> Optional[Dict[str, Any]]:
        """Build the Treasury curve from FRED constant-maturity observations only."""
        def num(key: str) -> Optional[float]:
            value = fred_data.get(key)
            return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None

        dgs2 = num("DGS2")
        dgs10 = num("DGS10")
        dgs2_4w = num("DGS2_4W_AGO")
        dgs10_4w = num("DGS10_4W_AGO")
        spread = num("T10Y2Y")
        spread_4w = num("T10Y2Y_4W_AGO")

        if dgs2 is None or dgs10 is None or dgs2_4w is None or dgs10_4w is None:
            return None

        if spread is None:
            spread = dgs10 - dgs2
        if spread_4w is None:
            spread_4w = dgs10_4w - dgs2_4w

        spread_bps = round(spread * 100.0, 1)
        delta_spread_4w = round((spread - spread_4w) * 100.0, 1)
        delta_10y_4w = round((dgs10 - dgs10_4w) * 100.0, 1)
        delta_2y_4w = round((dgs2 - dgs2_4w) * 100.0, 1)
        trend_significant = abs(delta_spread_4w) >= 10.0

        if trend_significant and delta_spread_4w >= 10.0:
            if delta_10y_4w >= abs(delta_2y_4w):
                regime = "Bear Steepening"
                risk_category = "Long-end yield rise"
            else:
                regime = "Bull Steepening"
                risk_category = "Short-end yield decline"
        elif trend_significant and delta_spread_4w <= -10.0:
            if delta_2y_4w >= abs(delta_10y_4w):
                regime = "Bear Flattening"
                risk_category = "Short-end yield rise"
            else:
                regime = "Bull Flattening"
                risk_category = "Long-end yield decline"
        elif spread_bps < 0:
            regime = "Inverted"
            risk_category = "Curve inversion"
        else:
            regime = "Range-bound Slope"
            risk_category = "Stable / low curve momentum"

        return {
            "spread_bps": spread_bps,
            "regime": regime,
            "risk_category": risk_category,
            "description": (
                f"FRED DGS10-DGS2 curve: {spread_bps:+.1f} bps; "
                f"4W change {delta_spread_4w:+.1f} bps; "
                f"DGS10 4W {delta_10y_4w:+.1f} bps; DGS2 4W {delta_2y_4w:+.1f} bps."
            ),
            "delta_spread_1d_bps": None,
            "delta_spread_5d_bps": (None if not isinstance(fred_data.get("DGS2_5D_AGO"), (int, float)) or not isinstance(fred_data.get("DGS10_5D_AGO"), (int, float)) else round(((float(fred_data["DGS10"]) - float(fred_data["DGS2"])) - (float(fred_data["DGS10_5D_AGO"]) - float(fred_data["DGS2_5D_AGO"]))) * 100.0, 1)),
            "delta_spread_20d_bps": delta_spread_4w,
            "delta_10y_4w_bps": delta_10y_4w,
            "delta_02y_4w_bps": delta_2y_4w,
            "delta_10y_5d_bps": None if not isinstance(fred_data.get("DGS10_5D_AGO"), (int, float)) else round((float(fred_data["DGS10"]) - float(fred_data["DGS10_5D_AGO"])) * 100.0, 1),
            "delta_02y_5d_bps": None if not isinstance(fred_data.get("DGS2_5D_AGO"), (int, float)) else round((float(fred_data["DGS2"]) - float(fred_data["DGS2_5D_AGO"])) * 100.0, 1),
            "is_trend_significant": trend_significant,
            "source": "FRED DGS10 / DGS2 / T10Y2Y",
        }

    def __init__(self,as_of_date:Optional[dt.date]=None,surprise_sigmas:Optional[Mapping[str,float]]=None): super().__init__(); self.as_of_date=as_of_date; self.surprise_sigmas=dict(surprise_sigmas or self.DEFAULT_SURPRISE_SIGMAS)
    @classmethod
    def from_calibration_profile(cls,profile_path:Optional[Path]=None,allow_default_fallback:bool=False,**kwargs:Any):
        p=profile_path or Path(__file__).resolve().parent.parent/"calibration"/"surprise_sigma_profile.json"
        if not p.exists():
            if allow_default_fallback:return cls(**kwargs)
            raise DataUnavailableError(f"Calibration profile unavailable: {p}")
        from calibration.surprise_sigma import load_calibration_profile
        return cls(surprise_sigmas=load_calibration_profile(p),**kwargs)
    def calculate_surprise_zscore(self,indicator_type:str,actual:float,forecast:float)->float:
        s=float(self.surprise_sigmas.get(indicator_type.lower(),self.surprise_sigmas.get("generic",1.0)))
        if indicator_type.lower()=="nfp" and max(abs(float(actual)),abs(float(forecast)))<10000:s/=1000
        return signed_surprise_zscore(indicator_type,actual,forecast,s)
    @staticmethod
    def calculate_real_yield(us10y:float,dfii10_tips:Optional[float]=None,breakeven_10y:Optional[float]=None)->Dict[str,Any]:
        if dfii10_tips is not None:y,src=round(dfii10_tips,3),"FRED DFII10 (Doğrudan 10Y TIPS Reel Getirisi)"
        else:
            if breakeven_10y is None:raise ValueError("DFII10 unavailable and no breakeven fallback supplied")
            y,src=round(us10y-breakeven_10y,3),f"Sentetik (US10Y {us10y}% - Breakeven {breakeven_10y}%)"
        p="High Fırsat Maliyeti (Reel Faiz >= %1.90; Yeni Long Kısıtlanır)" if y>=1.9 else "Low (Destekleyici; Negatif/Düşük Reel Faiz)" if y<1 else "Moderate (Dengeli)"
        return {"real_yield_pct":y,"yield_source":src,"pressure_on_gold":p,"description":f"10Y Reel Getiri: %{y} [{src}] (Altın baskısı: {p})"}
    @staticmethod
    def calculate_fed_forward_path(us02y:float,dff:Optional[float],us02y_5d:Optional[float]=None)->Dict[str,Any]:
        if dff is None:return {
            "fed_policy_rate_pct":None,
            "fed_policy_rate_source":"UNAVAILABLE",
            "us02y_yield":us02y,
            "implied_rate_gap_bps":None,
            "delta_02y_5d_bps":None if us02y_5d is None else round((us02y-us02y_5d)*100,1),
            "rate_expectation_signal":"UNAVAILABLE"
        }
        gap=round((us02y-dff)*100,1);return {"fed_policy_rate_pct":round(dff,3),"fed_policy_rate_source":"FRED DFF","implied_rate_gap_bps":gap,"delta_02y_5d_bps":None if us02y_5d is None else round((us02y-us02y_5d)*100,1),"rate_expectation_signal":"Market-implied easing" if gap<=-25 else "Market-implied tightening" if gap>=25 else "Near-policy / neutral pricing"}
    @staticmethod
    def _validate_key_ranges(market_data:Dict[str,Any],fred_data:Dict[str,Any])->None:
        for n,lo,hi in [("DXY",0,500),("GOLD",0,10000),("BRENT",0,500),("US10Y",-5,20),("US02Y",-5,20),("BTC",0,2000000),("COPPER",0,20),("VIX",0,200),("HYG",0,200),("LQD",0,300)]:
            x=market_data.get(n)
            if isinstance(x,dict) and x.get("value") is not None:validate_numeric_range(n,x["value"],lo,hi)
        for n,lo,hi in [("T10YIE",-10,20),("DFII10",-10,20),("DFF",0,20),("BAMLH0A0HYM2",0,50),("NFCI",-10,10),("ICSA",0,10000)]:
            if n in fred_data and fred_data[n] is not None:validate_numeric_range(n,fred_data[n],lo,hi)
    def _validate_fred_freshness(self,fred_data:Dict[str,Any],as_of:Optional[dt.date])->Dict[str,int]:
        if as_of is None:return {}
        obs=fred_data.get("data_quality",{}).get("observation_dates",{});return {f:validate_freshness(f,dt.date.fromisoformat(str(v)),as_of,self.FRED_FREQUENCIES.get(f,"unknown")) for f,v in obs.items()}
    @staticmethod
    def _strict_sign(value: Optional[float], threshold: float) -> int:
        if value is None:
            return 0
        if value >= threshold:
            return 1
        if value <= -threshold:
            return -1
        return 0

    @staticmethod
    def _available_market_number(market_data: Mapping[str, Any], name: str, key: str = "value") -> Optional[float]:
        item = market_data.get(name)
        value = item.get(key) if isinstance(item, Mapping) else None
        return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None

    @classmethod
    def _rebuild_currency_scores(
        cls,
        result: Dict[str, Any],
        market_data: Mapping[str, Any],
        fred_data: Mapping[str, Any],
    ) -> None:
        """Build currency scores from auditable, direction-consistent factors.

        A contradictory pair of factors produces NEUTRAL rather than allowing
        one factor to override another. JPY/CHF remain unavailable until direct
        local policy/rate inputs are provided.
        """
        vix = cls._available_market_number(market_data, "VIX") or 15.0
        dxy_4w = cls._available_market_number(market_data, "DXY", "change_pct_4w")
        brent_20d = cls._available_market_number(market_data, "BRENT", "change_pct_4w")
        copper_gold = result.get("regime_state", {}).get("copper_gold_delta_4w_pct")
        iron_ore = result.get("regime_state", {}).get("iron_ore_roc_20d")
        dairy = result.get("regime_state", {}).get("dairy_gdt_roc_20d")
        energy_penalty = bool(result.get("terms_of_trade_energy_analysis", {}).get("eurusd_energy_penalty"))

        us2 = fred_data.get("DGS2")
        us2_4w = fred_data.get("DGS2_4W_AGO")
        us2_gap_4w = None
        if isinstance(us2, (int, float)) and isinstance(us2_4w, (int, float)):
            us2_gap_4w = float(us2) - float(us2_4w)

        def local_us_spread_delta(field: str) -> Optional[float]:
            now = cls._available_market_number(market_data, field)
            old = cls._available_market_number(market_data, field, "val_5d_ago")
            us_now = float(us2) if isinstance(us2, (int, float)) else None
            us_old = cls._available_market_number({"US02Y": {"value": fred_data.get("DGS2_5D_AGO")}}, "US02Y")
            if None in (now, old, us_now, us_old):
                return None
            return ((now - us_now) - (old - us_old)) * 100.0

        def consensus(factors: list[int]) -> Optional[int]:
            """Require two independent aligned factors for a directional currency state."""
            pos=sum(x > 0 for x in factors)
            neg=sum(x < 0 for x in factors)
            if pos >= 2 and neg == 0:
                return 1
            if neg >= 2 and pos == 0:
                return -1
            if pos > 0 and neg > 0:
                return 0
            return None

        cad_yield = cls._strict_sign(local_us_spread_delta("CA02Y"), 5.0)
        cad_comm = cls._strict_sign(brent_20d, 3.0)
        cad_risk = -1 if vix >= 24.0 else (1 if vix < 16.0 else 0)
        cad_score = consensus([cad_yield, cad_comm, cad_risk])

        aud_yield = cls._strict_sign(local_us_spread_delta("AU02Y"), 5.0)
        aud_comm = 1 if isinstance(copper_gold,(int,float)) and isinstance(iron_ore,(int,float)) and copper_gold > 0 and iron_ore > 0 else (-1 if isinstance(copper_gold,(int,float)) and isinstance(iron_ore,(int,float)) and copper_gold < 0 and iron_ore < 0 else 0)
        aud_risk = -1 if vix >= 22.0 else (1 if vix < 16.0 else 0)
        aud_score = consensus([aud_yield, aud_comm, aud_risk])

        nz_yield = cls._strict_sign(
            ((cls._available_market_number(market_data, "AU02Y", "change_pct_5d") or 0.0) -
             (cls._available_market_number(market_data, "NZ02Y", "change_pct_5d") or 0.0)),
            0.01,
        )
        au_nz_now = cls._available_market_number(market_data, "AU02Y")
        nz_now = cls._available_market_number(market_data, "NZ02Y")
        au_nz_old = cls._available_market_number(market_data, "AU02Y", "val_5d_ago")
        nz_old = cls._available_market_number(market_data, "NZ02Y", "val_5d_ago")
        if None not in (au_nz_now, nz_now, au_nz_old, nz_old):
            nz_yield = cls._strict_sign(((au_nz_now - nz_now) - (au_nz_old - nz_old)) * 100.0, 3.0)
        dairy_factor = cls._strict_sign(dairy, 0.5)
        nz_risk = -1 if vix >= 20.0 else (1 if vix < 16.0 else 0)
        nz_score = consensus([nz_yield, dairy_factor, nz_risk])

        ecb = fred_data.get("ECBDFR")
        ecb_4w = fred_data.get("ECBDFR_4W_AGO")
        sonia = fred_data.get("SONIA")
        sonia_4w = fred_data.get("SONIA_4W_AGO")
        dff = fred_data.get("DFF")
        dff_4w = fred_data.get("DFF_4W_AGO")

        eur_policy = None
        if all(isinstance(x,(int,float)) for x in (ecb,ecb_4w,dff,dff_4w)):
            eur_policy = cls._strict_sign(((float(ecb)-float(dff))-(float(ecb_4w)-float(dff_4w)))*100.0, 5.0)
        de_spread_delta = result.get("regime_state",{}).get("spread_de_us_2y_delta_5d")
        if not isinstance(de_spread_delta,(int,float)):
            de_spread_delta = None
        eur_market = cls._strict_sign(de_spread_delta, 5.0)
        eur_energy = -1 if energy_penalty else 0
        eur_score = consensus([eur_policy or 0, eur_market or 0, eur_energy])

        gb_policy = None
        if all(isinstance(x,(int,float)) for x in (sonia,sonia_4w,dff,dff_4w)):
            gb_policy = cls._strict_sign(((float(sonia)-float(dff))-(float(sonia_4w)-float(dff_4w)))*100.0, 5.0)
        gb_market = cls._strict_sign(result.get("regime_state",{}).get("spread_gb_us_2y_delta_5d"), 5.0)
        gb_risk = -1 if vix >= 25.0 else 0
        gb_score = consensus([gb_policy or 0, gb_market or 0, gb_risk])

        usd_policy = None
        if all(isinstance(x,(int,float)) for x in (us2,us2_4w,dff,dff_4w)):
            usd_policy = cls._strict_sign(((float(us2)-float(dff))-(float(us2_4w)-float(dff_4w)))*100.0, 5.0)
        usd_momentum = cls._strict_sign(dxy_4w, 0.5)
        usd_score = consensus([usd_policy or 0, usd_momentum or 0])

        scores = {
            "CAD": cad_score, "AUD": aud_score, "NZD": nz_score,
            "EUR": eur_score, "GBP": gb_score, "USD": usd_score,
            "JPY": None, "CHF": None,
        }

        cross = result.setdefault("cross_pairs_analysis", {})
        cross["currency_scores"] = scores
        cross["directional_input_status"] = {k: ("AVAILABLE" if v is not None else "UNAVAILABLE") for k,v in scores.items()}

        pair_drivers = {
            "AUDCAD": ("AUD", "CAD"), "CADJPY": ("CAD", "JPY"), "GBPJPY": ("GBP", "JPY"),
            "AUDJPY": ("AUD", "JPY"), "EURGBP": ("EUR", "GBP"), "EURAUD": ("EUR", "AUD"),
            "NZDCAD": ("NZD", "CAD"), "EURJPY": ("EUR", "JPY"), "USDCAD": ("USD", "CAD"),
            "USDJPY": ("USD", "JPY"), "GBPUSD": ("GBP", "USD"), "AUDUSD": ("AUD", "USD"),
            "NZDUSD": ("NZD", "USD"), "USDCHF": ("USD", "CHF"), "EURCHF": ("EUR", "CHF"),
            "GBPCHF": ("GBP", "CHF"), "AUDCHF": ("AUD", "CHF"), "CADCHF": ("CAD", "CHF"),
            "NZDCHF": ("NZD", "CHF"), "CHFJPY": ("CHF", "JPY"), "EURUSD": ("EUR", "USD"),
        }
        gates = {}
        for pair,(base,quote) in pair_drivers.items():
            bs,qs=scores.get(base),scores.get(quote)
            if bs is None or qs is None:
                continue
            diff=bs-qs
            gates[pair]="LONG_ONLY" if diff >= 2 else "SHORT_ONLY" if diff <= -2 else "NEUTRAL_RANGE"
        cross["cross_gates"]=gates
        result.setdefault("regime_state",{})["cross_currency_scores"]=scores
        result["regime_state"]["cross_pair_gates"]=gates

    def process_all_macro_data(self,market_data:Dict[str,Any],fred_data:Dict[str,Any],calendar_events:List[Dict[str,Any]],as_of_date:Optional[dt.date]=None,as_of_datetime:Optional[dt.datetime]=None,previous_regime_state:Optional[Mapping[str,Any]]=None,now_utc:Optional[dt.datetime]=None)->Dict[str,Any]:
        validate_market_payload(market_data);validate_fred_payload(
            fred_data,
            required_fields=(REQUIRED_FRED_FIELDS | REQUIRED_ECONOMIC_FRED_FIELDS),
        );self._validate_key_ranges(market_data,fred_data);as_of=as_of_date or self.as_of_date;fresh=self._validate_fred_freshness(fred_data,as_of);ed=as_of_datetime or (dt.datetime.combine(as_of,dt.time.max,tzinfo=dt.timezone.utc) if as_of else None);events=[normalize_calendar_event(e) for e in calendar_events];freeze=event_freeze_status(events,now_utc=now_utc or ed) if (now_utc or ed) else None
        legacy_market = dict(market_data)
        dgs2 = fred_data.get("DGS2")
        dgs2_4w = fred_data.get("DGS2_4W_AGO")
        if isinstance(dgs2, (int, float)) and isinstance(dgs2_4w, (int, float)):
            legacy_market["US02Y"] = {
                "value": float(dgs2), "prev": float(dgs2), "val_5d_ago": float(fred_data.get("DGS2_5D_AGO", dgs2)),
                "month_ago": float(dgs2_4w), "change_pct": 0.0, "change_pct_5d": 0.0,
                "change_pct_4w": round(((float(dgs2) - float(dgs2_4w)) / float(dgs2_4w)) * 100.0, 2) if dgs2_4w else 0.0,
                "pct_rank_60d": 50.0, "history_close": [float(dgs2_4w), float(dgs2)]
            }
        with _fixed_legacy_date(as_of,ed,previous_regime_state):r=super().process_all_macro_data(legacy_market,fred_data,events)
        # Keep legacy consumers on the same FRED constant-maturity Treasury source.
        if isinstance(fred_data.get("DGS10"), (int, float)):
            legacy_market["US10Y"] = {
                "value": float(fred_data["DGS10"]),
                "prev": float(fred_data.get("DGS10_5D_AGO", fred_data["DGS10"])),
                "val_5d_ago": float(fred_data.get("DGS10_5D_AGO", fred_data["DGS10"])),
                "month_ago": float(fred_data.get("DGS10_4W_AGO", fred_data["DGS10"])),
                "change_pct": 0.0,
                "change_pct_5d": 0.0,
                "change_pct_4w": 0.0,
                "pct_rank_60d": 50.0,
                "history_close": [float(fred_data.get("DGS10_4W_AGO", fred_data["DGS10"])), float(fred_data["DGS10"])]
            }
        fred_curve = self._build_fred_yield_curve(fred_data)
        if fred_curve is not None:
            r["yield_curve"] = fred_curve
        self._rebuild_currency_scores(r, market_data, fred_data)
        if freeze is not None:r.setdefault("cross_pairs_analysis",{})["event_freeze"]=freeze;r.setdefault("regime_state",{})["event_freeze_active"]=bool(freeze["active"])
        dgs2_for_policy = float(dgs2) if isinstance(dgs2, (int, float)) else float(r.get("fed_forward_path_analysis",{}).get("us02y_yield",legacy_market.get("US02Y",{}).get("value",0.0)))
        r["fed_forward_path_analysis"]=self.calculate_fed_forward_path(dgs2_for_policy,fred_data.get("DFF"),None)
        r["fed_forward_path_analysis"]["dgs2_4w_change_bps"] = None if not isinstance(dgs2_4w, (int, float)) else round((dgs2_for_policy - float(dgs2_4w)) * 100.0, 1)
        r["fed_forward_path_analysis"]["policy_rate_gap_2y_dff_bps"] = None if fred_data.get("DFF") is None else round((dgs2_for_policy - float(fred_data["DFF"])) * 100.0, 1)
        r.setdefault("regime_state",{})["state_source"]="explicit_previous_regime_state" if previous_regime_state is not None else "default_inactive_state";r["dxy_oil_correlation_method"]="pearson_on_period_returns";r["data_quality"]={"fallback_used":False,"synthetic_fallback_used":False,"fallback_fields":[],"treasury_curve_source":"FRED_DGS2_DGS10_T10Y2Y","treasury_5d_history_available":bool(fred_data.get("DGS2_5D_AGO") is not None and fred_data.get("DGS10_5D_AGO") is not None)};r["validation"]={"fred_freshness_days":fresh}
        if float(market_data.get("VIX",{}).get("value",0) or 0)>=40 and isinstance(r.get("credit_spread_analysis"),dict):
            stress=str(r["credit_spread_analysis"].get("stress_level","")).lower()
            if "distress" in stress or "şiddetli kredi krizi" in stress:r.setdefault("gold_fiscal_dominance",{})["is_cash_dash"]=True;r["gold_fiscal_dominance"]["gold_short_allowed"]=True
        return r
