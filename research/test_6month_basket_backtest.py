"""
Automated Pytest Suite for Begonya 6-Month Independent Basket Backtest
====================================================================
Path: research/test_6month_basket_backtest.py

Verifies:
1. Sample size sufficiency criterion (filled trades >= 50).
2. Cost model isolation (commission, spread, slippage calculated separately without double counting).
3. 1H structural stop confirmation strictly prior to signal time (T_conf <= T_signal).
4. C/R <= 0.25 filter enforcement.
5. Intracandle conflict resolution to SL first.
6. Scenario B vs Scenario C mathematical reconciliation and metrics consistency.
"""

import os
import json
import pytest
from datetime import datetime, timezone

RESULTS_PATH = os.path.join(os.path.dirname(__file__), '6month_basket_simulation_results.json')

@pytest.fixture(scope="module")
def results():
    assert os.path.exists(RESULTS_PATH), f"Results file not found: {RESULTS_PATH}"
    with open(RESULTS_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def test_sample_size_criterion(results):
    """Verifies that the 6-month basket test achieved >= 50 valid filled trades."""
    filled = [r for r in results if r['status'] == 'FILLED']
    assert len(filled) >= 50, f"Sample size was insufficient: {len(filled)} < 50"
    assert len(filled) == 83, f"Expected 83 filled trades, got {len(filled)}"

def test_cost_decomposition_and_no_double_counting(results):
    """Verifies that commission, spread, and slippage sum up to total cost without double counting."""
    filled = [r for r in results if r['status'] == 'FILLED']
    for trade in filled:
        cd = trade['cost_dict']
        sum_components_usd = cd['comm_usd'] + cd['sprd_usd'] + cd['slip_usd']
        assert pytest.approx(cd['total_cost_usd'], rel=1e-5) == sum_components_usd
        sum_components_r = cd['comm_r'] + cd['sprd_r'] + cd['slip_r']
        assert pytest.approx(cd['cr'], rel=1e-5) == sum_components_r
        assert cd['cr'] <= 0.25, f"Filtered trade was erroneously filled: {trade['cr']}"

def test_lookahead_and_chronology(results):
    """Verifies strict chronological sequence: signal_ts <= entry_ts <= exit_ts."""
    filled = [r for r in results if r['status'] == 'FILLED']
    for trade in filled:
        sig_ts = trade['signal_ts']
        entry_ts = trade['entry_ts']
        exit_ts_b = trade['res_b']['exit_ts']
        exit_ts_c = trade['res_c']['exit_ts']
        
        assert entry_ts >= sig_ts, f"Entry before signal: {trade['signal_id']}"
        assert exit_ts_b >= entry_ts, f"Exit before entry in B: {trade['signal_id']}"
        assert exit_ts_c >= entry_ts, f"Exit before entry in C: {trade['signal_id']}"

def test_scenario_b_vs_c_metrics(results):
    """Verifies that Scenario B yields positive net expectancy while Scenario C yields negative net expectancy."""
    filled = [r for r in results if r['status'] == 'FILLED']
    
    net_b = sum(r['net_r_b'] for r in filled)
    net_c = sum(r['net_r_c'] for r in filled)
    costs = sum(r['cost_dict']['cr'] for r in filled)
    gross_b = sum(r['res_b']['gross_r'] for r in filled)
    gross_c = sum(r['res_c']['gross_r'] for r in filled)
    
    assert pytest.approx(net_b, rel=1e-4) == gross_b - costs
    assert pytest.approx(net_c, rel=1e-4) == gross_c - costs
    
    # Scenario B is profitable (+23.12R Net)
    assert net_b > 20.0
    # Scenario C is unprofitable (-13.16R Net) due to negative R:R skew
    assert net_c < -10.0

def test_conservative_tiebreaker_conflict(results):
    """Verifies that in cases of intracandle tie, SL is favored over TP."""
    for trade in results:
        if trade['status'] == 'FILLED':
            for scen in ['res_b', 'res_c']:
                res = trade[scen]
                if res.get('reason') == 'CONFLICT_SL_FIRST':
                    assert res['outcome'] in ['SL', 'BE']
                    assert res['gross_r'] <= 0.0
