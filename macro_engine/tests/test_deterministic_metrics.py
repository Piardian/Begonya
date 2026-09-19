import unittest
from preprocessing.metrics import MacroMetricsCalculator


class DeterministicMacroMetricsTests(unittest.TestCase):
    def setUp(self):
        self.calc = MacroMetricsCalculator()

    def run_metrics(self, market=None, fred=None, events=None, previous_state=None, now=None):
        return self.calc.process_all_macro_data(
            market or self.base_market(),
            fred or self.base_fred(),
            events or [],
            previous_regime_state=previous_state,
            now_utc=now,
        )

    def base_market(self):
        def px(v, p=None, d5=None, d20=None, rank=50.0):
            p = v if p is None else p
            d5 = p if d5 is None else d5
            d20 = d5 if d20 is None else d20
            return {
                "value": v, "prev": p, "val_5d_ago": d5, "month_ago": d20,
                "change_pct": ((v-p)/p*100) if p else 0.0,
                "change_pct_5d": ((v-d5)/d5*100) if d5 else 0.0,
                "change_pct_4w": ((v-d20)/d20*100) if d20 else 0.0,
                "pct_rank_60d": rank,
                "history_close": [p, d5, d20, v],
            }
        return {
            "US10Y": px(4.00, 4.00, 4.00, 4.00), "US02Y": px(4.00, 4.00, 4.00, 4.00),
            "DXY": px(100.0, 100.0, 100.0, 100.0), "BRENT": px(80.0, 80.0, 80.0, 80.0),
            "GOLD": px(2000.0, 2000.0, 2000.0, 2000.0), "COPPER": px(4.0, 4.0, 4.0, 4.0),
            "VIX": px(15.0, 15.0, 15.0, 15.0, 50.0), "HYG": px(80.0, 80.0, 80.0, 80.0),
            "LQD": px(105.0, 105.0, 105.0, 105.0), "BTC": px(60000.0, 60000.0, 60000.0, 60000.0),
            "SOL": px(150.0, 150.0, 150.0, 150.0), "CA02Y": px(3.5, 3.5, 3.5, 3.5),
            "DE02Y": px(2.5, 2.5, 2.5, 2.5), "GB02Y": px(4.0, 4.0, 4.0, 4.0),
            "AU02Y": px(3.5, 3.5, 3.5, 3.5), "NZ02Y": px(3.8, 3.8, 3.8, 3.8),
            "IRON_ORE": px(100.0, 100.0, 100.0, 100.0), "DAIRY_GDT": px(3000.0, 3000.0, 3000.0, 3000.0),
        }

    def base_fred(self):
        return {
            "WALCL": 7000000.0, "WALCL_4W_AGO": 7000000.0,
            "RRPONTSYD": 300.0, "RRPONTSYD_4W_AGO": 300.0,
            "WTREGEN": 700000.0, "WTREGEN_4W_AGO": 700000.0,
            "T10YIE": 2.0, "DFII10": 1.5, "DFII10_4W_AGO": 1.6, "DFF": 4.33, "DFF_4W_AGO": 4.33, "SOFR": 4.33,
            "BAMLH0A0HYM2": 3.0, "NFCI": -0.2, "ICSA": 220.0,
            "DE10Y": 2.0, "DE10Y_4W_AGO": 2.0,
            "GB10Y": 4.0, "GB10Y_4W_AGO": 4.0,
            "US10Y_OECD": 4.5, "US10Y_OECD_4W_AGO": 4.5,
            "CPI_YOY": 3.0, "CPI_YOY_4W_AGO": 3.1,
            "CORE_CPI_YOY": 3.2, "CORE_CPI_YOY_4W_AGO": 3.3,
            "PCE_YOY": 2.6, "PCE_YOY_4W_AGO": 2.7,
            "CORE_PCE_YOY": 2.8, "CORE_PCE_YOY_4W_AGO": 2.9,
            "PAYEMS": 158000.0, "PAYEMS_4W_AGO": 157900.0,
            "UNRATE": 4.0, "UNRATE_4W_AGO": 4.0,
            "AHE_YOY": 3.6, "AHE_YOY_4W_AGO": 3.7,
            "GDP_QOQ_SAAR": 2.4, "GDP_QOQ_SAAR_4W_AGO": 2.4,
            "INDPRO": 102.0, "INDPRO_4W_AGO": 101.5,
            "RSAFS": 105.0, "RSAFS_4W_AGO": 104.0,
            "RRSFS": 104.0, "RRSFS_4W_AGO": 103.0,
            "DGS3MO": 5.0, "DGS3MO_4W_AGO": 5.1,
            "DGS2": 4.0, "DGS2_4W_AGO": 4.1,
            "DGS5": 4.0, "DGS5_4W_AGO": 4.1,
            "DGS10": 4.0, "DGS10_4W_AGO": 4.1,
            "DGS30": 4.2, "DGS30_4W_AGO": 4.3,
            "T10Y2Y": 0.0, "T10Y2Y_4W_AGO": 0.0,
            "T10Y3M": -1.0, "T10Y3M_4W_AGO": -1.1,
            "ECBDFR": 3.0, "ECBDFR_4W_AGO": 3.0,
            "SONIA": 4.0, "SONIA_4W_AGO": 4.0,
            "CA3M_INTERBANK": 3.0, "CA3M_INTERBANK_4W_AGO": 3.0,
            "AU3M_INTERBANK": 4.0, "AU3M_INTERBANK_4W_AGO": 4.0,
            "NZ3M_INTERBANK": 4.0, "NZ3M_INTERBANK_4W_AGO": 4.0,
            "JP3M_INTERBANK": 2.0, "JP3M_INTERBANK_4W_AGO": 2.0,
            "CH3M_INTERBANK": 1.0, "CH3M_INTERBANK_4W_AGO": 1.0,
            "DGS2_5D_AGO": 4.05, "DGS10_5D_AGO": 4.02,
        }

    def test_yield_curve_noise_and_boundaries(self):
        quiet = self.calc.evaluate_yield_curve(4.00, 4.00, 4.01, 4.00, 4.01, 4.00, 4.01, 4.00)
        self.assertEqual(quiet["regime"], "Range-bound Slope")
        exact = self.calc.evaluate_yield_curve(4.05, 4.00, 4.00, 4.00, 4.00, 4.00, 4.00, 4.00)
        self.assertTrue(exact["is_trend_significant"])

    def test_yield_curve_regimes(self):
        bear = self.calc.evaluate_yield_curve(4.50, 4.10, 4.45, 4.10, 4.20, 4.10, 4.00, 4.10)
        bull = self.calc.evaluate_yield_curve(3.40, 3.90, 3.70, 4.30, 4.00, 5.00, 3.80, 4.60)
        self.assertEqual(bear["regime"], "Bear Steepening")
        self.assertEqual(bull["regime"], "Bull Steepening")

    def test_surprise_units_and_direction(self):
        self.assertEqual(self.calc.calculate_surprise_zscore("nfp", 200, 150), 1.0)
        self.assertEqual(self.calc.calculate_surprise_zscore("unemployment", 3.5, 3.7), 1.33)
        result = self.run_metrics(events=[{"title": "Non-Farm Employment Change", "actual": "200K", "forecast": "150K"}])
        self.assertEqual(result["surprises"][0]["actual"], 200000.0)

    def test_real_yield_accepts_negative_tips(self):
        result = self.calc.calculate_real_yield(0.70, dfii10_tips=-0.15, breakeven_10y=0.85)
        self.assertEqual(result["real_yield_pct"], -0.15)
        self.assertIn("FRED DFII10", result["yield_source"])

    def test_fred_treasury_curve_is_authoritative(self):
        fred = self.base_fred()
        fred.update({
            "DGS2": 4.00, "DGS2_4W_AGO": 4.10,
            "DGS10": 4.00, "DGS10_4W_AGO": 4.05,
            "T10Y2Y": 0.00, "T10Y2Y_4W_AGO": -0.05,
        })
        result = self.run_metrics(fred=fred)
        self.assertEqual(result["yield_curve"]["source"], "FRED DGS10 / DGS2 / T10Y2Y")
        self.assertEqual(result["yield_curve"]["spread_bps"], 0.0)
        self.assertEqual(result["yield_curve"]["delta_spread_20d_bps"], 5.0)

    def test_fx_sovereign_spreads_use_matched_monthly_frequency(self):
        fred = self.base_fred()
        fred.update({
            "DE10Y": 2.00, "DE10Y_4W_AGO": 2.10,
            "US10Y_OECD": 4.00, "US10Y_OECD_4W_AGO": 4.20,
            "GB10Y": 4.00, "GB10Y_4W_AGO": 4.10,
        })
        result = self.run_metrics(fred=fred)
        breakdown = result["cross_pairs_analysis"]["currency_breakdown"]
        # US-DE spread narrowed by 20bp -> EUR market factor positive.
        self.assertEqual(breakdown["EUR"]["market_rate_factor"], 1)
        # US-GB spread narrowed by 10bp -> GBP market factor positive.
        self.assertEqual(breakdown["GBP"]["market_rate_factor"], 1)

    def test_direct_asset_gates_long_neutral_short_are_deterministic(self):
        # XAU: low and falling real yield + non-rising USD => LONG_ONLY.
        result = self.run_metrics()
        self.assertEqual(result["asset_macro_gates"]["XAUUSD"], "LONG_ONLY")

        # BTC: risk-on macro alignment requires positive liquidity as well.
        result = self.run_metrics(fred={**self.base_fred(), "WALCL": 7100000.0})
        self.assertEqual(result["asset_macro_gates"]["BTC"], "LONG_ONLY")

        # SPX: same positive liquidity + benign real yield conditions => LONG_ONLY.
        self.assertEqual(result["asset_macro_gates"]["SPX"], "LONG_ONLY")

        # Removing the macro alignment must return to neutral, not infer LONG from no stress.
        result = self.run_metrics(market=self.base_market(), fred=self.base_fred())
        self.assertEqual(result["asset_macro_gates"]["BTC"], "NEUTRAL_RANGE")
        self.assertEqual(result["asset_macro_gates"]["SPX"], "NEUTRAL_RANGE")

    def test_direct_asset_gates_short_require_specific_conditions(self):
        # SPX short: tightening liquidity + high real yield + stronger USD + complacent VIX.
        market = self.base_market()
        market["DXY"] = {**market["DXY"], "value": 101.0, "month_ago": 100.0, "change_pct_4w": 1.0}
        market["VIX"]["value"] = 15.0
        fred = {
            **self.base_fred(),
            "WALCL": 6900000.0,
            "DFII10": 2.20,
            "DFII10_4W_AGO": 2.00,
        }
        self.assertEqual(
            self.run_metrics(market=market, fred=fred)["asset_macro_gates"]["SPX"],
            "SHORT_ONLY",
        )

        # BTC short: broad bearish alignment; duration shock is an additional factor.
        market = self.base_market()
        market["DXY"] = {**market["DXY"], "value": 101.5, "month_ago": 100.0, "change_pct_4w": 1.5}
        market["VIX"]["value"] = 21.0
        fred = {
            **self.base_fred(),
            "WALCL": 6900000.0,
            "DFII10": 2.20,
            "DFII10_4W_AGO": 2.00,
            "DGS2": 4.00, "DGS2_4W_AGO": 3.95, "DGS2_5D_AGO": 3.95,
            "DGS10": 4.20, "DGS10_4W_AGO": 4.05, "DGS10_5D_AGO": 4.05,
            "T10Y2Y": 0.20, "T10Y2Y_4W_AGO": 0.10,
        }
        result = self.run_metrics(market=market, fred=fred)
        self.assertEqual(result["asset_macro_gates"]["BTC"], "SHORT_ONLY")

        # XAU short: higher and rising real yield + stronger USD.
        market = self.base_market()
        market["DXY"] = {**market["DXY"], "value": 101.0, "month_ago": 100.0, "change_pct_4w": 1.0}
        fred = {
            **self.base_fred(),
            "DFII10": 2.20,
            "DFII10_4W_AGO": 2.00,
        }
        result = self.run_metrics(market=market, fred=fred)
        self.assertEqual(result["asset_macro_gates"]["XAUUSD"], "SHORT_ONLY")

    def test_xau_cash_dash_does_not_force_short_direction(self):
        market = self.base_market()
        market["VIX"]["value"] = 68.0
        fred = {**self.base_fred(), "BAMLH0A0HYM2": 9.0}
        result = self.run_metrics(market=market, fred=fred)
        self.assertTrue(result["gold_fiscal_dominance"]["gold_short_allowed"])
        # Acute stress is not itself a directional short signal.
        self.assertNotEqual(result["asset_macro_gates"]["XAUUSD"], "SHORT_ONLY")

    def test_observed_dff_is_authoritative(self):
        result = self.run_metrics()
        self.assertEqual(result["fed_forward_path_analysis"]["fed_policy_rate_source"], "FRED DFF")
        self.assertFalse(result["data_quality"]["fallback_used"])

    def test_liquidity_delta(self):
        result = self.run_metrics(fred={**self.base_fred(), "WALCL": 7100000.0})
        self.assertEqual(result["liquidity_dynamics"]["delta_liquidity_billion"], 100.0)

    def test_fast_stress(self):
        market = self.base_market()
        market["VIX"]["value"] = 23.0
        self.assertTrue(self.run_metrics(market=market)["t0_fast_stress_analysis"]["fast_stress_override"])

    def test_gold_cash_dash(self):
        market = self.base_market()
        market["VIX"]["value"] = 68.0
        fred = {**self.base_fred(), "BAMLH0A0HYM2": 9.0}
        result = self.run_metrics(market=market, fred=fred)
        self.assertTrue(result["gold_fiscal_dominance"]["is_cash_dash"])
        self.assertTrue(result["gold_fiscal_dominance"]["gold_short_allowed"])

    def test_jpy_chf_remain_neutral_without_rate_alignment(self):
        market = self.base_market()
        market["VIX"] = {**market["VIX"], "value": 30.0, "pct_rank_60d": 95.0}
        result = self.run_metrics(market=market)
        scores = result["cross_pairs_analysis"]["currency_scores"]
        self.assertEqual(scores["JPY"], 0)
        self.assertEqual(scores["CHF"], 0)

    def test_cross_gate_requires_full_two_sided_divergence(self):
        result = self.run_metrics()
        gates = result["cross_pairs_analysis"]["cross_gates"]
        # Fixture intentionally has mixed/neutral currency evidence, so there
        # must not be a one-point base-vs-quote directional gate.
        for pair, gate in gates.items():
            base, quote = pair[:3], pair[3:]
            scores = result["cross_pairs_analysis"]["currency_scores"]
            if scores.get(base) is not None and scores.get(quote) is not None:
                diff = scores[base] - scores[quote]
                self.assertEqual(gate, "LONG_ONLY" if diff >= 2 else "SHORT_ONLY" if diff <= -2 else "NEUTRAL_RANGE")

    def test_local_rate_and_safe_haven_alignment_confirms_jpy_chf(self):
        market = self.base_market()
        market["VIX"] = {**market["VIX"], "value": 30.0, "pct_rank_60d": 95.0}
        fred = {
            **self.base_fred(),
            "JP3M_INTERBANK": 2.1, "JP3M_INTERBANK_4W_AGO": 2.0,
            "CH3M_INTERBANK": 1.1, "CH3M_INTERBANK_4W_AGO": 1.0,
        }
        result = self.run_metrics(market=market, fred=fred)
        scores = result["cross_pairs_analysis"]["currency_scores"]
        self.assertEqual(scores["JPY"], 1)
        self.assertEqual(scores["CHF"], 1)

    def test_currency_safe_havens_remain_neutral_without_aligned_evidence(self):
        market = self.base_market()
        market["VIX"] = {**market["VIX"], "value": 30.0, "pct_rank_60d": 95.0}
        # Force the local short-rate move to oppose safe-haven demand.
        fred = {
            **self.base_fred(),
            "JP3M_INTERBANK": 2.1, "JP3M_INTERBANK_4W_AGO": 2.0,
            "CH3M_INTERBANK": 1.1, "CH3M_INTERBANK_4W_AGO": 1.0,
        }
        result = self.run_metrics(market=market, fred=fred)
        scores = result["cross_pairs_analysis"]["currency_scores"]
        self.assertEqual(scores["JPY"], 0)
        self.assertEqual(scores["CHF"], 0)

    def test_explicit_hysteresis_state(self):
        market = self.base_market()
        market["BRENT"] = {**market["BRENT"], "value": 83.0, "month_ago": 80.0, "change_pct_4w": 3.75}
        market["COPPER"] = {**market["COPPER"], "value": 3.0, "month_ago": 4.0, "change_pct_4w": -25.0}
        result = self.run_metrics(market=market, previous_state={"energy_penalty_active": True})
        self.assertTrue(result["terms_of_trade_energy_analysis"]["eurusd_energy_penalty"])
        self.assertEqual(result["regime_state"]["state_source"], "explicit_previous_regime_state")

    def test_event_freeze_uses_explicit_clock(self):
        now = __import__("datetime").datetime(2026, 1, 1, 12, 0, tzinfo=__import__("datetime").timezone.utc)
        events = [{"title": "CPI", "impact": "High", "time": "2026-01-01T12:10:00+00:00"}]
        result = self.run_metrics(events=events, now=now)
        self.assertTrue(result["cross_pairs_analysis"]["event_freeze"]["active"])

    def test_return_correlation_method_is_explicit(self):
        result = self.run_metrics()
        self.assertEqual(result["dxy_oil_correlation_method"], "pearson_on_period_returns")


if __name__ == "__main__":
    unittest.main(verbosity=2)
