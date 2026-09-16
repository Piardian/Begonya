import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from preprocessing.metrics import MacroMetricsCalculator


class DeterministicMacroMetricsTests(unittest.TestCase):
    def setUp(self):
        self.calc = MacroMetricsCalculator()
        self.tmpdir = tempfile.TemporaryDirectory()
        self.gate_path = Path(self.tmpdir.name) / "macro_bias_gate.json"

    def tearDown(self):
        self.tmpdir.cleanup()

    def run_metrics(self, market=None, fred=None, events=None, previous_gate=None):
        if previous_gate is not None:
            self.gate_path.write_text(json.dumps(previous_gate), encoding="utf-8")
        with patch("preprocessing.metrics.BIAS_GATE_FILE", self.gate_path):
            return self.calc.process_all_macro_data(
                market or {},
                fred or {},
                events or [],
            )

    def base_market(self):
        def px(v, p=None, d5=None, d20=None, rank=50.0):
            p = v if p is None else p
            d5 = p if d5 is None else d5
            d20 = d5 if d20 is None else d20
            return {
                "value": v,
                "prev": p,
                "val_5d_ago": d5,
                "month_ago": d20,
                "change_pct": ((v - p) / p * 100) if p else 0.0,
                "change_pct_5d": ((v - d5) / d5 * 100) if d5 else 0.0,
                "change_pct_4w": ((v - d20) / d20 * 100) if d20 else 0.0,
                "pct_rank_60d": rank,
                "history_close": [p, d5, d20, v],
            }

        return {
            "US10Y": px(4.00, 4.00, 4.00, 4.00),
            "US02Y": px(4.00, 4.00, 4.00, 4.00),
            "DXY": px(100.0, 100.0, 100.0, 100.0),
            "BRENT": px(80.0, 80.0, 80.0, 80.0),
            "GOLD": px(2000.0, 2000.0, 2000.0, 2000.0),
            "COPPER": px(4.0, 4.0, 4.0, 4.0),
            "VIX": px(15.0, 15.0, 15.0, 15.0, 50.0),
            "HYG": px(80.0, 80.0, 80.0, 80.0),
            "LQD": px(105.0, 105.0, 105.0, 105.0),
            "BTC": px(60000.0, 60000.0, 60000.0, 60000.0),
            "SOL": px(150.0, 150.0, 150.0, 150.0),
            "CA02Y": px(3.5, 3.5, 3.5, 3.5),
            "DE02Y": px(2.5, 2.5, 2.5, 2.5),
            "GB02Y": px(4.0, 4.0, 4.0, 4.0),
            "AU02Y": px(3.5, 3.5, 3.5, 3.5),
            "NZ02Y": px(3.8, 3.8, 3.8, 3.8),
            "IRON_ORE": px(100.0, 100.0, 100.0, 100.0),
            "DAIRY_GDT": px(3000.0, 3000.0, 3000.0, 3000.0),
        }

    def base_fred(self):
        return {
            "WALCL": 7000000.0,
            "WALCL_4W_AGO": 7000000.0,
            "RRPONTSYD": 300.0,
            "RRPONTSYD_4W_AGO": 300.0,
            "WTREGEN": 700000.0,
            "WTREGEN_4W_AGO": 700000.0,
            "T10YIE": 2.0,
            "DFII10": 1.5,
            "BAMLH0A0HYM2": 3.0,
            "NFCI": -0.2,
            "ICSA": 220.0,
            "DE10Y": 2.0,
            "DE10Y_4W_AGO": 2.0,
        }

    # 1-3: Yield curve regime classification
    def test_yield_curve_range_bound_noise(self):
        r = self.calc.evaluate_yield_curve(4.00, 4.00, 4.01, 4.00, 4.01, 4.00, 4.01, 4.00)
        self.assertEqual(r["regime"], "Range-bound Slope")
        self.assertFalse(r["is_trend_significant"])

    def test_yield_curve_bear_steepening(self):
        r = self.calc.evaluate_yield_curve(4.50, 4.10, 4.45, 4.10, 4.20, 4.10, 4.00, 4.10)
        self.assertEqual(r["regime"], "Bear Steepening")
        self.assertGreaterEqual(r["delta_spread_5d_bps"], 5.0)

    def test_yield_curve_bull_steepening(self):
        r = self.calc.evaluate_yield_curve(3.40, 3.90, 3.70, 4.30, 4.00, 5.00, 3.80, 4.60)
        self.assertEqual(r["regime"], "Bull Steepening")
        self.assertLessEqual(r["delta_02y_5d_bps"], -8.0)

    # 4-5: Yield curve sign boundaries
    def test_yield_curve_exact_5bps_is_significant(self):
        r = self.calc.evaluate_yield_curve(4.05, 4.00, 4.00, 4.00, 4.00, 4.00, 4.00, 4.00)
        self.assertTrue(r["is_trend_significant"])

    def test_yield_curve_exact_8bps_20d_is_significant(self):
        r = self.calc.evaluate_yield_curve(4.08, 4.00, 4.00, 4.00, 4.00, 4.00, 4.00, 3.92)
        self.assertTrue(r["is_trend_significant"])

    # 6-8: Surprise math and parsing
    def test_nfp_zscore(self):
        self.assertEqual(self.calc.calculate_surprise_zscore("nfp", 200, 150), 1.0)

    def test_core_cpi_zscore_is_clipped(self):
        self.assertEqual(self.calc.calculate_surprise_zscore("core_cpi", 1.0, 0.0), 4.0)

    def test_indicator_identification(self):
        self.assertEqual(self.calc.identify_indicator_type("Non-Farm Employment Change"), "nfp")
        self.assertEqual(self.calc.identify_indicator_type("Core CPI m/m"), "core_cpi")
        self.assertEqual(self.calc.identify_indicator_type("Unemployment Rate"), "unemployment")

    # 9-11: Real yield, credit and financial conditions
    def test_real_yield_prefers_direct_tips(self):
        r = self.calc.calculate_real_yield(4.0, dfii10_tips=1.25, breakeven_10y=2.0)
        self.assertEqual(r["real_yield_pct"], 1.25)
        self.assertIn("FRED DFII10", r["yield_source"])

    def test_real_yield_falls_back_to_nominal_minus_breakeven(self):
        r = self.calc.calculate_real_yield(4.0, dfii10_tips=None, breakeven_10y=2.0)
        self.assertEqual(r["real_yield_pct"], 2.0)

    def test_credit_stress_bands(self):
        low = self.run_metrics(fred={**self.base_fred(), "BAMLH0A0HYM2": 3.79})
        mid = self.run_metrics(fred={**self.base_fred(), "BAMLH0A0HYM2": 4.50})
        high = self.run_metrics(fred={**self.base_fred(), "BAMLH0A0HYM2": 5.00})
        self.assertIn("Sakin", low["credit_spread_analysis"]["stress_level"])
        self.assertIn("Orta", mid["credit_spread_analysis"]["stress_level"])
        self.assertIn("Şiddetli", high["credit_spread_analysis"]["stress_level"])

    # 12-14: Liquidity and DXY
    def test_net_liquidity_delta(self):
        fred = {**self.base_fred(), "WALCL": 7100000.0, "WALCL_4W_AGO": 7000000.0}
        r = self.run_metrics(fred=fred)
        self.assertEqual(r["liquidity_dynamics"]["delta_liquidity_billion"], 100.0)

    def test_negative_liquidity_is_draining(self):
        fred = {**self.base_fred(), "WALCL": 6900000.0, "WALCL_4W_AGO": 7000000.0}
        r = self.run_metrics(fred=fred)
        self.assertLess(r["liquidity_dynamics"]["delta_liquidity_billion"], 0)
        self.assertIn("Çekiliyor", r["liquidity_dynamics"]["flow_direction"])

    def test_dxy_negative_momentum_is_weak_dollar(self):
        market = self.base_market()
        market["DXY"] = {
            **market["DXY"], "value": 99.0, "val_5d_ago": 100.0, "month_ago": 101.0,
            "change_pct_5d": -1.0, "change_pct_4w": -1.98,
        }
        r = self.run_metrics(market=market)
        self.assertEqual(r["dxy_trend_analysis"]["momentum_regime"], "Düşüş Trendi / Zayıf Dolar")

    # 15-17: Fast stress
    def test_vix_level_triggers_fast_stress(self):
        market = self.base_market()
        market["VIX"]["value"] = 23.0
        r = self.run_metrics(market=market)
        self.assertTrue(r["t0_fast_stress_analysis"]["fast_stress_override"])

    def test_vix_daily_jump_triggers_fast_stress(self):
        market = self.base_market()
        market["VIX"].update({"value": 20.0, "prev": 17.0, "change_pct": 17.65})
        r = self.run_metrics(market=market)
        self.assertTrue(r["t0_fast_stress_analysis"]["fast_stress_override"])

    def test_quiet_market_does_not_trigger_fast_stress(self):
        r = self.run_metrics()
        self.assertFalse(r["t0_fast_stress_analysis"]["fast_stress_override"])

    # 18-20: BTC and gold stress behavior
    def test_bear_steepening_plus_volatility_activates_btc_decoupling(self):
        market = self.base_market()
        market["US10Y"] = {**market["US10Y"], "value": 4.50, "val_5d_ago": 4.00, "month_ago": 3.90}
        market["US02Y"] = {**market["US02Y"], "value": 4.00, "val_5d_ago": 4.00, "month_ago": 4.00}
        market["VIX"] = {**market["VIX"], "value": 25.0, "pct_rank_60d": 90.0, "change_pct": 5.0, "change_pct_5d": 12.0}
        r = self.run_metrics(market=market)
        self.assertTrue(r["btc_decoupling_analysis"]["btc_decoupling_active"])

    def test_gold_short_is_not_allowed_in_normal_conditions(self):
        r = self.run_metrics()
        self.assertFalse(r["gold_fiscal_dominance"]["gold_short_allowed"])

    def test_gold_short_exception_requires_cash_dash(self):
        market = self.base_market()
        market["VIX"] = {**market["VIX"], "value": 68.0, "change_pct": 20.0}
        fred = {**self.base_fred(), "BAMLH0A0HYM2": 9.0}
        r = self.run_metrics(market=market, fred=fred)
        # This is intentionally strict: current production code is expected to expose
        # whether the Distress label mismatch prevents the emergency exception.
        self.assertTrue(r["gold_fiscal_dominance"]["is_cash_dash"])
        self.assertTrue(r["gold_fiscal_dominance"]["gold_short_allowed"])

    # 21-24: Currency score sanity
    def test_usd_positive_momentum_scores_positive(self):
        market = self.base_market()
        market["US02Y"] = {**market["US02Y"], "value": 4.10, "val_5d_ago": 4.00, "change_pct_5d": 2.5}
        market["DXY"] = {**market["DXY"], "value": 101.0, "val_5d_ago": 100.0, "change_pct_5d": 1.0}
        r = self.run_metrics(market=market)
        self.assertEqual(r["cross_pairs_analysis"]["currency_scores"]["USD"], 1)

    def test_jpy_safe_haven_scores_positive_when_vix_high(self):
        market = self.base_market()
        market["VIX"] = {**market["VIX"], "value": 30.0, "pct_rank_60d": 95.0}
        r = self.run_metrics(market=market)
        self.assertEqual(r["cross_pairs_analysis"]["currency_scores"]["JPY"], 1)

    def test_chf_safe_haven_scores_positive_when_vix_high(self):
        market = self.base_market()
        market["VIX"] = {**market["VIX"], "value": 30.0, "pct_rank_60d": 95.0}
        r = self.run_metrics(market=market)
        self.assertEqual(r["cross_pairs_analysis"]["currency_scores"]["CHF"], 1)

    def test_neutral_currency_cross_produces_neutral_range(self):
        r = self.run_metrics()
        gates = r["cross_pairs_analysis"]["cross_gates"]
        self.assertEqual(gates["AUDCAD"], "NEUTRAL_RANGE")

    # 25-27: Cross and SOL logic
    def test_audcad_short_when_cad_stronger_than_aud(self):
        market = self.base_market()
        market["BRENT"] = {**market["BRENT"], "value": 105.0, "month_ago": 90.0, "change_pct_4w": 16.67}
        market["COPPER"] = {**market["COPPER"], "value": 4.0, "month_ago": 4.0, "change_pct_4w": 0.0}
        r = self.run_metrics(market=market)
        self.assertEqual(r["cross_pairs_analysis"]["cross_gates"]["AUDCAD"], "SHORT_ONLY")

    def test_sol_structure_break_blocks_long(self):
        market = self.base_market()
        market["SOL_BTC_STRUCTURE_BROKEN"] = True
        r = self.run_metrics(market=market)
        self.assertEqual(r["cross_pairs_analysis"]["cross_gates"]["SOL"], "DEFENSIVE_HOLD")

    def test_event_freeze_ignores_irrelevant_event(self):
        r = self.run_metrics(events=[{"title": "GDP", "impact": "LOW", "time": "2099-01-01T00:00:00+00:00"}])
        self.assertFalse(r["cross_pairs_analysis"]["event_freeze"]["active"])

    # 28-30: Hysteresis and defensive state
    def test_energy_penalty_enters_only_above_threshold_with_global_slowdown(self):
        market = self.base_market()
        market["BRENT"] = {**market["BRENT"], "value": 90.0, "month_ago": 80.0, "change_pct_4w": 12.5}
        market["COPPER"] = {**market["COPPER"], "value": 3.0, "month_ago": 4.0, "change_pct_4w": -25.0}
        r = self.run_metrics(market=market)
        self.assertTrue(r["terms_of_trade_energy_analysis"]["eurusd_energy_penalty"])

    def test_energy_penalty_does_not_enter_below_threshold(self):
        market = self.base_market()
        market["BRENT"] = {**market["BRENT"], "value": 84.9, "month_ago": 80.0, "change_pct_4w": 6.1}
        market["COPPER"] = {**market["COPPER"], "value": 3.0, "month_ago": 4.0, "change_pct_4w": -25.0}
        r = self.run_metrics(market=market)
        self.assertFalse(r["terms_of_trade_energy_analysis"]["eurusd_energy_penalty"])

    def test_active_energy_penalty_persists_above_exit_threshold(self):
        market = self.base_market()
        market["BRENT"] = {**market["BRENT"], "value": 83.0, "month_ago": 80.0}
        previous = {"regime_state": {"energy_penalty_active": True}}
        r = self.run_metrics(market=market, previous_gate=previous)
        self.assertTrue(r["terms_of_trade_energy_analysis"]["eurusd_energy_penalty"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
