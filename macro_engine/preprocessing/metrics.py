from __future__ import annotations
import datetime as dt, json, tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional
from config import BIAS_GATE_FILE
from core.deterministic_controls import event_freeze_status, normalize_calendar_event, signed_surprise_zscore, validate_freshness, validate_numeric_range
from data_quality import DataUnavailableError, validate_fred_payload, validate_market_payload
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
    # WTREGEN is FRED's weekly, Wednesday-ending Treasury General Account
    # series. Treating it as daily incorrectly rejects legitimate 5-7 day gaps
    # between observations. Keep the weekly freshness contract explicit.
    FRED_FREQUENCIES={"WALCL":"weekly","RRPONTSYD":"daily","WTREGEN":"weekly","T10YIE":"daily","DFII10":"daily","DFF":"daily","BAMLH0A0HYM2":"daily","NFCI":"weekly","ICSA":"weekly","M2SL":"monthly","DE10Y":"monthly"}
    # NFCI is weekly-ending-Friday but the provider vintage can lag the observation date.
    # Keep the generic weekly contract at 10d; allow NFCI up to 14d only for this known release-lag profile.
    FRED_MAX_AGE_DAYS={"NFCI":14}
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
        if dff is None:return {"fed_policy_rate_pct":5.33,"fed_policy_rate_source":"LEGACY_STATIC_5.33_FALLBACK","us02y_yield":us02y,"implied_rate_gap_bps":round((us02y-5.33)*100,1),"delta_02y_5d_bps":None if us02y_5d is None else round((us02y-us02y_5d)*100,1)}
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
        obs=fred_data.get("data_quality",{}).get("observation_dates",{});return {f:validate_freshness(f,dt.date.fromisoformat(str(v)),as_of,self.FRED_FREQUENCIES.get(f,"unknown"),self.FRED_MAX_AGE_DAYS.get(f)) for f,v in obs.items()}
    def process_all_macro_data(self,market_data:Dict[str,Any],fred_data:Dict[str,Any],calendar_events:List[Dict[str,Any]],as_of_date:Optional[dt.date]=None,as_of_datetime:Optional[dt.datetime]=None,previous_regime_state:Optional[Mapping[str,Any]]=None,now_utc:Optional[dt.datetime]=None)->Dict[str,Any]:
        validate_market_payload(market_data);validate_fred_payload(fred_data);self._validate_key_ranges(market_data,fred_data);as_of=as_of_date or self.as_of_date;fresh=self._validate_fred_freshness(fred_data,as_of);ed=as_of_datetime or (dt.datetime.combine(as_of,dt.time.max,tzinfo=dt.timezone.utc) if as_of else None);events=[normalize_calendar_event(e) for e in calendar_events];freeze=event_freeze_status(events,now_utc=now_utc or ed) if (now_utc or ed) else None
        with _fixed_legacy_date(as_of,ed,previous_regime_state):r=super().process_all_macro_data(market_data,fred_data,events)
        if freeze is not None:r.setdefault("cross_pairs_analysis",{})["event_freeze"]=freeze;r.setdefault("regime_state",{})["event_freeze_active"]=bool(freeze["active"])
        r["fed_forward_path_analysis"]=self.calculate_fed_forward_path(float(r.get("fed_forward_path_analysis",{}).get("us02y_yield",market_data["US02Y"]["value"])),fred_data.get("DFF"),market_data["US02Y"].get("val_5d_ago"));r.setdefault("regime_state",{})["state_source"]="explicit_previous_regime_state" if previous_regime_state is not None else "default_inactive_state";r["dxy_oil_correlation_method"]="pearson_on_period_returns";r["data_quality"]={"fallback_used":"DFF" not in fred_data,"synthetic_fallback_used":"DFF" not in fred_data,"fallback_fields":["DFF"] if "DFF" not in fred_data else []};r["validation"]={"fred_freshness_days":fresh}
        if float(market_data.get("VIX",{}).get("value",0) or 0)>=40 and isinstance(r.get("credit_spread_analysis"),dict):
            stress=str(r["credit_spread_analysis"].get("stress_level","")).lower()
            if "distress" in stress or "şiddetli kredi krizi" in stress:r.setdefault("gold_fiscal_dominance",{})["is_cash_dash"]=True;r["gold_fiscal_dominance"]["gold_short_allowed"]=True
        return r
