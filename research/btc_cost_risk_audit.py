"""
Begonya Research - BTC Cost-to-Risk (C_R) Scenario Audit
========================================================
Audit of BTC trades to calculate:
C_R = Total Expected Transaction Cost / Initial Risk Distance
And evaluate the impact of C_R filtering (0.15R, 0.25R) and Structural Stop sizing.
"""

import json
import os
from datetime import datetime, timezone

def audit_btc_trades():
    with open('benchmark/benchmark_records.json', 'r', encoding='utf-8') as f:
        bench = json.load(f)

    btc_records = [r for r in bench if r.get('symbol') == 'BTCUSD']
    print(f"=== 6 BENCHMARK BTC TRADES AUDIT ===")

    # Institutional standard cost parameters:
    # Commission: 0.05% entry + 0.05% exit = 0.10% total (10 bps round-trip)
    # Average Bid-Ask Spread: $18.00 USD
    # Slippage: 1.5 bps (0.015% = ~$12.50 USD)
    
    results = []
    for i, b in enumerate(btc_records, 1):
        rid = b.get('record_id')
        ts = b.get('timestamp_tsi')
        td = b.get('trade_direction')
        smc = b.get('smc_technical_layer', {})
        zone = smc.get('entry_zone', [])
        entry = (zone[0] + zone[1]) / 2.0 if len(zone) == 2 else smc.get('current_price_at_signal', 0.0)
        stop = smc.get('stop_loss', 0.0)
        risk_dist = abs(entry - stop)
        
        comm_usd = entry * 0.0010
        spread_usd = 18.00
        slip_usd = entry * 0.00015
        total_cost_usd = comm_usd + spread_usd + slip_usd
        
        cr = total_cost_usd / risk_dist if risk_dist > 0 else 999.0
        audit = b.get('post_trade_audit', {})
        outcome = audit.get('actual_outcome')
        realized_r = audit.get('realized_r', 0.0)

        results.append({
            'index': i,
            'record_id': rid,
            'ts': ts,
            'direction': td,
            'entry': entry,
            'stop': stop,
            'risk_usd': risk_dist,
            'risk_pct': (risk_dist / entry) * 100.0,
            'comm_usd': comm_usd,
            'spread_usd': spread_usd,
            'slip_usd': slip_usd,
            'total_cost_usd': total_cost_usd,
            'cr': cr,
            'outcome': outcome,
            'realized_r': realized_r
        })

    for r in results:
        print(f"BTC #{r['index']} ({r['record_id']}) {r['ts']} {r['direction']}")
        print(f"   Fiyat: ${r['entry']:.2f} | Stop: ${r['stop']:.2f} | Risk Mesafesi: ${r['risk_usd']:.2f} (%{r['risk_pct']:.3f})")
        print(f"   Toplam Maliyet: ${r['total_cost_usd']:.2f} [Komisyon: ${r['comm_usd']:.2f}, Spread: ${r['spread_usd']:.2f}, Kayma: ${r['slip_usd']:.2f}]")
        print(f"   C_R Orani: {r['cr']:.3f}R | Sonuc: {r['outcome']}")
        print("-" * 65)

    print("\n=== C_R SENARYO FILTRE ANALIZI ===")
    print(f"Toplam BTC Islem Sayisi: {len(results)}")
    
    pass_15 = [r for r in results if r['cr'] <= 0.15]
    pass_25 = [r for r in results if r['cr'] <= 0.25]
    
    print(f"C_R <= 0.15R Filtresinden Gecen: {len(pass_15)} islem (%{len(pass_15)/len(results)*100:.1f})")
    print(f"C_R <= 0.25R Filtresinden Gecen: {len(pass_25)} islem (%{len(pass_25)/len(results)*100:.1f})")
    
    if pass_25:
        print("  0.25R filtresini gecen tek islem:")
        for p in pass_25:
            print(f"   -> BTC #{p['index']}: Risk: ${p['risk_usd']:.2f}, C_R: {p['cr']:.3f}R")

if __name__ == '__main__':
    audit_btc_trades()
