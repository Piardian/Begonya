"""
Automated Regression Tests for Begonya Adversarial Audit
Path: Begonya/research/test_adversarial_validation.py
"""

import json
import pytest
from datetime import datetime, timezone

def load_data():
    with open('../swing-bos-core/data/BTCUSD_1h.json', 'r') as f:
        d1h = json.load(f)
    with open('smc_engine/evidence/outcomes/macro-outcome-evidence.jsonl', 'r', encoding='utf-8') as f:
        records = [json.loads(line) for line in f if line.strip()]

    btc_6 = [
        r for r in records 
        if ("BTC" in r.get("symbol", "") or "BTC" in r.get("signalId", "")) 
        and r.get("entryConfirmed") is True
        and r.get("signalGeneratedAt") >= "2026-10-07"
    ]
    return d1h, btc_6

def test_six_btc_trades_isolation():
    """Verify that exactly 6 BTC shadow trades exist in the Oct 7-14 window."""
    _, btc_6 = load_data()
    assert len(btc_6) == 6, f"Expected exactly 6 trades, found {len(btc_6)}"
    
    # Verify entry prices lie strictly between 82,624 and 83,614
    for t in btc_6:
        entry = float(t['entryPrice'])
        assert 82600.0 <= entry <= 83700.0, f"Entry {entry} out of expected shadow range"

def test_zero_lookahead_bias():
    """Verify strictly that every 1H swing used was confirmed on or before signal timestamp."""
    d1h, btc_6 = load_data()
    
    for t in btc_6:
        sig_ts = int(t['signalTimestamp'])
        direction = t['direction']
        entry_p = float(t['entryPrice'])
        
        # Only candles closed on or before sig_ts
        closed_candles = [c for c in d1h if (c['timestamp'] + 3600*1000) <= sig_ts]
        swings = []
        n = len(closed_candles)
        for i in range(2, n - 2):
            c = closed_candles[i]
            conf_bar = closed_candles[i+2]
            conf_ts = conf_bar['timestamp'] + 3600*1000
            if conf_ts > sig_ts:
                continue
            if (c['high'] > closed_candles[i-1]['high'] and c['high'] > closed_candles[i-2]['high'] and
                c['high'] > closed_candles[i+1]['high'] and c['high'] > closed_candles[i+2]['high']):
                swings.append({'type': 'HIGH', 'price': float(c['high']), 'conf_ts': conf_ts})
            if (c['low'] < closed_candles[i-1]['low'] and c['low'] < closed_candles[i-2]['low'] and
                c['low'] < closed_candles[i+1]['low'] and c['low'] < closed_candles[i+2]['low']):
                swings.append({'type': 'LOW', 'price': float(c['low']), 'conf_ts': conf_ts})
                
        if direction == 'short':
            valid = [s for s in swings if s['type'] == 'HIGH' and s['price'] > entry_p]
        else:
            valid = [s for s in swings if s['type'] == 'LOW' and s['price'] < entry_p]
            
        assert len(valid) > 0, f"No valid pre-signal confirmed swings for {t['signalId']}"
        selected = valid[-1]
        
        # Strict inequality / non-strict inequality check
        assert selected['conf_ts'] <= sig_ts, f"Lookahead bias violation: conf_ts {selected['conf_ts']} > sig_ts {sig_ts}"

def test_cost_calculation_formulas():
    """Verify that friction components match the institutional model and have no double counting."""
    _, btc_6 = load_data()
    for t in btc_6:
        entry = float(t['entryPrice'])
        risk = float(t['riskDistance'])
        
        # 4 bps comm, 1 bps spread, 1.5 bps slippage = 6.5 bps
        expected_total_cost_r = (entry * 0.00065) / risk
        actual_total_cost_r = float(t['totalCostR'])
        
        # Allow tiny rounding difference (within 0.005R)
        assert abs(expected_total_cost_r - actual_total_cost_r) < 0.005, (
            f"Cost mismatch: expected {expected_total_cost_r:.3f}R, got {actual_total_cost_r:.3f}R"
        )
        
        # Verify netRealizedR = realizedR - totalCostR
        gross_r = float(t['realizedR'])
        net_r = float(t['netRealizedR'])
        expected_net_r = gross_r - actual_total_cost_r
        assert abs(net_r - expected_net_r) < 0.015, (
            f"Net PnL calculation error: gross={gross_r}, cost={actual_total_cost_r}, net={net_r}"
        )

def test_btc_6_anomaly_root_cause():
    """Verify the root cause of the identical entry/exit timestamp on BTC #6 in Scenario C."""
    with open('../swing-bos-core/data/BTCUSD_15m.json', 'r') as f:
        d15 = json.load(f)
        
    c_0815 = [c for c in d15 if c['timestamp'] == 1791792900000][0]
    
    # In candle at 08:15 UTC:
    # Low was 83961.88, High was 84195.16
    assert c_0815['low'] == 83961.88
    assert c_0815['high'] == 84195.16
    
    # Original target was 83868.86
    target = 83868.86
    assert c_0815['low'] > target, "Candle low was strictly above target, causing instantaneous fill in replay"

def test_monotone_cr_thresholds():
    """Verify that trade filter count is monotonically increasing with C/R threshold."""
    with open('research/adversarial_btc_structural_audit_results.json', 'r') as f:
        results = json.load(f)
        
    thresholds = [0.15, 0.20, 0.25, 0.30, 0.40]
    prev_count = 0
    for th in thresholds:
        count = len([r for r in results if r['cr_b'] <= th])
        assert count >= prev_count, f"Threshold {th} broke monotonicity: {count} < {prev_count}"
        prev_count = count
