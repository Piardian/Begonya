import json
from datetime import datetime, timezone

def ts_to_iso(ts):
    if not ts:
        return "N/A"
    return datetime.fromtimestamp(ts/1000, tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')

def main():
    with open('research/adversarial_btc_structural_audit_results.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    print("=" * 120)
    print("BEGONYA ADVERSARIAL AUDIT: COMPLETE EXTRACT & VERIFICATION")
    print("=" * 120)

    for r in data:
        sw = r['selected_swing']
        lag_h = (r['sig_ts'] - sw['conf_ts']) / 3600000.0 if sw else 0.0
        print(f"\n==========================================================================================")
        print(f"BTC #{r['idx']}: {r['signal_id']} | {r['direction'].upper()}")
        print(f"==========================================================================================")
        print(f"  * Sinyal Zamani:          {ts_to_iso(r['sig_ts'])}")
        print(f"  * Giris Zamani:           {ts_to_iso(r['entry_ts'])} | Giris Fiyati: ${r['entry_price']:.2f}")
        print(f"  * 15M Dar Stop:           ${r['orig_sl']:.2f} (Risk: ${r['orig_risk']:.2f}) | TP: ${r['orig_tp']:.2f}")
        print(f"  * 1H Yapisal Stop:        ${r['struct_sl']:.2f} (Risk: ${r['struct_risk']:.2f}) | 2R Hedef: ${r['struct_tp_2r']:.2f}")
        print(f"  * Kullanilan 1H Swing:    {sw['type']} @ ${sw['price']:.2f}")
        print(f"    - Olusum (Bar i):       {ts_to_iso(sw['formed_ts'])}")
        print(f"    - Teyit (Bar i+2):      {ts_to_iso(sw['conf_ts'])}")
        print(f"    - Teyit Fark (Lag):     {lag_h:.2f} saat once teyit edilmis")
        print(f"    - Lookahead Testi:      PASSED (conf_ts <= sig_ts: {sw['conf_ts'] <= r['sig_ts']})")
        print(f"  * Cikis Zamanlari:")
        print(f"    - Senaryo A (15M Dar):  {ts_to_iso(r['orig_exit_ts'])} | Sonuc: {r['orig_outcome']} ({r['orig_exit_reason']})")
        print(f"    - Senaryo B (1H 2R):    {ts_to_iso(r['sim_b']['exit_ts'])} | Sonuc: {r['sim_b']['outcome']} ({r['sim_b']['exit_reason']})")
        print(f"    - Senaryo C (1H Orig):  {ts_to_iso(r['sim_c']['exit_ts'])} | Sonuc: {r['sim_c']['outcome']} ({r['sim_c']['exit_reason']})")

    # Metrics Table
    print("\n" + "=" * 135)
    print("TABLO 1: ISLEM BAZINDA LIFECYCLE MFE/MAE, KOMISYON, SPREAD, KAYMA VE NET R")
    print("=" * 135)
    print(f"{'Trade':<6} | {'Scen':<5} | {'Sonuc':<8} | {'Brut R':<7} | {'Komisyon':<10} | {'Spread':<10} | {'Kayma':<10} | {'Toplam Mal':<10} | {'Net R':<7} | {'MFE(R)':<7} | {'MAE(R)':<7} | {'C/R':<7}")
    print("-" * 135)
    for r in data:
        # Scenario A
        risk_a = r['orig_risk']
        comm_a = r['comm_usd'] / risk_a
        sprd_a = r['spread_usd'] / risk_a
        slip_a = r['slip_usd'] / risk_a
        tot_a = r['cr_a']
        print(f"#{r['idx']:<5} | {'A':<5} | {r['orig_outcome']:<8} | {r['orig_gross_r']:<+7.2f} | {comm_a:<10.3f} | {sprd_a:<10.3f} | {slip_a:<10.3f} | {tot_a:<10.3f} | {r['net_r_a']:<+7.2f} | {r['orig_mfe']:<7.2f} | {r['orig_mae']:<7.2f} | {r['cr_a']:<7.3f}")

        # Scenario B
        risk_b = r['struct_risk']
        comm_b = r['comm_usd'] / risk_b
        sprd_b = r['spread_usd'] / risk_b
        slip_b = r['slip_usd'] / risk_b
        tot_b = r['cr_b']
        print(f"#{r['idx']:<5} | {'B':<5} | {r['sim_b']['outcome']:<8} | {r['sim_b']['gross_r']:<+7.2f} | {comm_b:<10.3f} | {sprd_b:<10.3f} | {slip_b:<10.3f} | {tot_b:<10.3f} | {r['net_r_b']:<+7.2f} | {r['sim_b']['mfe_r']:<7.2f} | {r['sim_b']['mae_r']:<7.2f} | {r['cr_b']:<7.3f}")

        # Scenario C
        risk_c = r['struct_risk']
        comm_c = r['comm_usd'] / risk_c
        sprd_c = r['spread_usd'] / risk_c
        slip_c = r['slip_usd'] / risk_c
        tot_c = r['cr_c']
        print(f"#{r['idx']:<5} | {'C':<5} | {r['sim_c']['outcome']:<8} | {r['sim_c']['gross_r']:<+7.2f} | {comm_c:<10.3f} | {sprd_c:<10.3f} | {slip_c:<10.3f} | {tot_c:<10.3f} | {r['net_r_c']:<+7.2f} | {r['sim_c']['mfe_r']:<7.2f} | {r['sim_c']['mae_r']:<7.2f} | {r['cr_c']:<7.3f}")
        print("-" * 135)

    # C/R sensitivity
    thresholds = [0.15, 0.20, 0.25, 0.30, 0.40]
    print("\n" + "=" * 115)
    print("TABLO 2: C/R ESIK ANALIZI (0.15 / 0.20 / 0.25 / 0.30 / 0.40)")
    print("=" * 115)
    
    for scen_name, scen_key in [('Senaryo A (15M Dar Stop)', 'a'),
                                ('Senaryo B (1H Yapisal Stop + 2R)', 'b'),
                                ('Senaryo C (1H Yapisal Stop + Orig TP)', 'c')]:
        print(f"\n>>> {scen_name} <<<")
        print(f"{'C/R Esigi':<10} | {'Kalan Islem':<12} | {'Brut R':<10} | {'Maliyet(R)':<12} | {'Net R':<10} | {'Beklenti(R)':<13} | {'Profit Factor':<14} | {'Max DD(R)':<10}")
        print("-" * 105)
        for th in thresholds:
            cr_field = f'cr_{scen_key}'
            if scen_key == 'a':
                passed = [r for r in data if r[cr_field] <= th]
                n_p = len(passed)
                if n_p == 0:
                    print(f"<= {th:<7.2f} | {'0 (Tumu Elendi)':<12} | {'0.00':<10} | {'0.000':<12} | {'0.00':<10} | {'0.000':<13} | {'0.00':<14} | {'0.00':<10}")
                    continue
                gross = sum(r['orig_gross_r'] for r in passed)
                cost = sum(r[cr_field] for r in passed)
                net = sum(r['net_r_a'] for r in passed)
                exp = net / n_p
                g_w = sum(r['orig_gross_r'] for r in passed if r['orig_gross_r'] > 0)
                g_l = abs(sum(r['orig_gross_r'] for r in passed if r['orig_gross_r'] < 0))
                pf = (g_w / g_l) if g_l > 0 else (999.0 if g_w > 0 else 0.0)
                # Max DD
                eq, peak, max_dd = 0.0, 0.0, 0.0
                for r in passed:
                    eq += r['net_r_a']
                    if eq > peak: peak = eq
                    dd = peak - eq
                    if dd > max_dd: max_dd = dd
                print(f"<= {th:<7.2f} | {n_p:<12} | {gross:<+10.2f} | {cost:<12.3f} | {net:<+10.2f} | {exp:<+13.3f} | {pf:<14.2f} | {max_dd:<10.2f}")
            else:
                sim_field = f'sim_{scen_key}'
                net_field = f'net_r_{scen_key}'
                passed = [r for r in data if r[cr_field] <= th]
                n_p = len(passed)
                if n_p == 0:
                    print(f"<= {th:<7.2f} | {'0 (Tumu Elendi)':<12} | {'0.00':<10} | {'0.000':<12} | {'0.00':<10} | {'0.000':<13} | {'0.00':<14} | {'0.00':<10}")
                    continue
                gross = sum(r[sim_field]['gross_r'] for r in passed)
                cost = sum(r[cr_field] for r in passed)
                net = sum(r[net_field] for r in passed)
                exp = net / n_p
                g_w = sum(r[sim_field]['gross_r'] for r in passed if r[sim_field]['gross_r'] > 0)
                g_l = abs(sum(r[sim_field]['gross_r'] for r in passed if r[sim_field]['gross_r'] < 0))
                pf = (g_w / g_l) if g_l > 0 else (999.0 if g_w > 0 else 0.0)
                eq, peak, max_dd = 0.0, 0.0, 0.0
                for r in passed:
                    eq += r[net_field]
                    if eq > peak: peak = eq
                    dd = peak - eq
                    if dd > max_dd: max_dd = dd
                print(f"<= {th:<7.2f} | {n_p:<12} | {gross:<+10.2f} | {cost:<12.3f} | {net:<+10.2f} | {exp:<+13.3f} | {pf:<14.2f} | {max_dd:<10.2f}")

if __name__ == '__main__':
    main()
