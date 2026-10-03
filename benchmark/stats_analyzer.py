import json
from collections import defaultdict
from datetime import datetime

with open('benchmark/benchmark_records.json', 'r', encoding='utf-8') as f:
    records = json.load(f)

print(f'Total records: {len(records)}')

by_symbol = defaultdict(lambda: {'count': 0, 'tp': 0, 'stop': 0, 'averted': 0, 'active': 0, 'pending': 0, 'net_pnl': 0.0, 'net_r': 0.0, 'gross_profit': 0.0, 'gross_loss': 0.0, 'saved_capital': 0.0})
by_day_of_week = defaultdict(lambda: {'count': 0, 'tp': 0, 'stop': 0, 'averted': 0, 'net_pnl': 0.0, 'net_r': 0.0, 'gross_profit': 0.0, 'gross_loss': 0.0})
by_date = defaultdict(lambda: {'count': 0, 'tp': 0, 'stop': 0, 'averted': 0, 'net_pnl': 0.0, 'net_r': 0.0, 'gross_profit': 0.0, 'gross_loss': 0.0})
by_direction = defaultdict(lambda: {'count': 0, 'tp': 0, 'stop': 0, 'averted': 0, 'net_pnl': 0.0, 'net_r': 0.0, 'gross_profit': 0.0, 'gross_loss': 0.0})
by_asset_class = defaultdict(lambda: {'count': 0, 'tp': 0, 'stop': 0, 'averted': 0, 'net_pnl': 0.0, 'net_r': 0.0, 'gross_profit': 0.0, 'gross_loss': 0.0})
by_grade = defaultdict(lambda: {'count': 0, 'tp': 0, 'stop': 0, 'averted': 0, 'net_pnl': 0.0, 'net_r': 0.0, 'gross_profit': 0.0, 'gross_loss': 0.0})
by_session = defaultdict(lambda: {'count': 0, 'tp': 0, 'stop': 0, 'averted': 0, 'net_pnl': 0.0, 'net_r': 0.0, 'gross_profit': 0.0, 'gross_loss': 0.0})

for r in records:
    sym = r.get('symbol', 'UNKNOWN')
    audit = r.get('post_trade_audit', {})
    outcome = audit.get('actual_outcome', '')
    category = audit.get('outcome_category', '')
    pnl = float(audit.get('realized_usd', 0.0) or 0.0)
    r_val = float(audit.get('realized_r', 0.0) or 0.0)
    saved = float(audit.get('saved_loss_usd', 0.0) or 0.0)
    direction = r.get('trade_direction', 'UNKNOWN')
    grade = r.get('smc_technical_layer', {}).get('grade', 'UNKNOWN')
    dt_str = r.get('timestamp_tsi', '')

    # Standardize outcome
    status = 'PENDING'
    if outcome in ["WIN", "WIN_PARTIAL_TP_AND_BE", "ACTIVE_RUNNER_1ST_TP_HIT"] or category in ["PROFIT", "PROFIT_AND_RUNNER_ACTIVE"]:
        status = 'TP'
    elif outcome == "LOSS" or category == "LOSS":
        status = 'STOP'
    elif outcome in ["INVALID_NO_ENTRY", "BREAK_EVEN"] or category in ["AVERTED_LOSS", "BREAK_EVEN_PROTECTED"]:
        status = 'AVERTED'
    elif outcome in ["PENDING_RETEST"] or "PENDING" in outcome:
        status = 'PENDING'
    elif outcome in ["ACTIVE_IN_TRADE"] or category in ["ACTIVE"]:
        status = 'ACTIVE'

    # Day of week and Date
    dow = 'Unknown'
    date_str = 'Unknown'
    hour = 12
    if dt_str:
        try:
            dt = datetime.strptime(dt_str[:19], '%Y-%m-%d %H:%M:%S')
            dow = dt.strftime('%A')
            date_str = dt.strftime('%Y-%m-%d')
            hour = dt.hour
        except Exception:
            pass

    # Session in TSİ
    if 2 <= hour < 10:
        session = 'Asya / Erken Londra (02-10 TSİ)'
    elif 10 <= hour < 15:
        session = 'Londra Çekirdek (10-15 TSİ)'
    elif 15 <= hour < 20:
        session = 'Londra/NY Kesişimi (15-20 TSİ)'
    elif 20 <= hour < 24:
        session = 'New York Kapanışı (20-24 TSİ)'
    else:
        session = 'Gece / Geceyarısı (00-02 TSİ)'

    # Asset class
    ac = 'FOREX'
    if any(k in sym for k in ['BTC', 'ETH', 'SOL', 'LTC', 'ADA', 'XRP', 'SEI']):
        ac = 'CRYPTO'
    elif 'XAU' in sym or 'GOLD' in sym:
        ac = 'COMMODITY'

    # 1. Symbol
    s = by_symbol[sym]
    s['count'] += 1
    s['net_pnl'] += pnl
    s['net_r'] += r_val
    s['saved_capital'] += saved
    if pnl > 0: s['gross_profit'] += pnl
    elif pnl < 0: s['gross_loss'] += abs(pnl)
    if status == 'TP': s['tp'] += 1
    elif status == 'STOP': s['stop'] += 1
    elif status == 'AVERTED': s['averted'] += 1
    elif status == 'ACTIVE': s['active'] += 1
    elif status == 'PENDING': s['pending'] += 1

    # 2. Day of week
    d = by_day_of_week[dow]
    d['count'] += 1
    d['net_pnl'] += pnl
    d['net_r'] += r_val
    if pnl > 0: d['gross_profit'] += pnl
    elif pnl < 0: d['gross_loss'] += abs(pnl)
    if status == 'TP': d['tp'] += 1
    elif status == 'STOP': d['stop'] += 1
    elif status == 'AVERTED': d['averted'] += 1

    # 3. Date
    d_dt = by_date[date_str]
    d_dt['count'] += 1
    d_dt['net_pnl'] += pnl
    d_dt['net_r'] += r_val
    if pnl > 0: d_dt['gross_profit'] += pnl
    elif pnl < 0: d_dt['gross_loss'] += abs(pnl)
    if status == 'TP': d_dt['tp'] += 1
    elif status == 'STOP': d_dt['stop'] += 1
    elif status == 'AVERTED': d_dt['averted'] += 1

    # 4. Session
    ss = by_session[session]
    ss['count'] += 1
    ss['net_pnl'] += pnl
    ss['net_r'] += r_val
    if pnl > 0: ss['gross_profit'] += pnl
    elif pnl < 0: ss['gross_loss'] += abs(pnl)
    if status == 'TP': ss['tp'] += 1
    elif status == 'STOP': ss['stop'] += 1
    elif status == 'AVERTED': ss['averted'] += 1

    # 5. Direction
    dr = by_direction[direction]
    dr['count'] += 1
    dr['net_pnl'] += pnl
    dr['net_r'] += r_val
    if pnl > 0: dr['gross_profit'] += pnl
    elif pnl < 0: dr['gross_loss'] += abs(pnl)
    if status == 'TP': dr['tp'] += 1
    elif status == 'STOP': dr['stop'] += 1
    elif status == 'AVERTED': dr['averted'] += 1

    # 6. Asset Class
    a = by_asset_class[ac]
    a['count'] += 1
    a['net_pnl'] += pnl
    a['net_r'] += r_val
    if pnl > 0: a['gross_profit'] += pnl
    elif pnl < 0: a['gross_loss'] += abs(pnl)
    if status == 'TP': a['tp'] += 1
    elif status == 'STOP': a['stop'] += 1
    elif status == 'AVERTED': a['averted'] += 1

    # 7. Grade
    g = by_grade[grade]
    g['count'] += 1
    g['net_pnl'] += pnl
    g['net_r'] += r_val
    if pnl > 0: g['gross_profit'] += pnl
    elif pnl < 0: g['gross_loss'] += abs(pnl)
    if status == 'TP': g['tp'] += 1
    elif status == 'STOP': g['stop'] += 1
    elif status == 'AVERTED': g['averted'] += 1

print('=== 1. PARİTE BAZINDA PERFORMANS LİGİ (Net Kâra Göre Sıralı) ===')
for sym, data in sorted(by_symbol.items(), key=lambda x: x[1]['net_pnl'], reverse=True):
    wr = (data['tp'] / (data['tp'] + data['stop']) * 100) if (data['tp'] + data['stop']) > 0 else 0
    pf = (data['gross_profit'] / data['gross_loss']) if data['gross_loss'] > 0 else (99.0 if data['gross_profit'] > 0 else 0.0)
    print(f"{sym:8s} | Net: ${data['net_pnl']:+9.2f} ({data['net_r']:+5.2f}R) | Brüt Kâr: ${data['gross_profit']:7.2f} | Brüt Zarar: ${data['gross_loss']:7.2f} | Toplam: {data['count']:2d} | TP: {data['tp']} | STOP: {data['stop']} | AVERT: {data['averted']} | Aktif: {data['active']} | WR: {wr:5.1f}% | PF: {pf:5.2f} | Kurtarılan: ${data['saved_capital']:.0f}")

print('\n=== 2. VARLIK SINIFI (ASSET CLASS) BAZINDA PERFORMANS ===')
for ac, data in sorted(by_asset_class.items(), key=lambda x: x[1]['net_pnl'], reverse=True):
    wr = (data['tp'] / (data['tp'] + data['stop']) * 100) if (data['tp'] + data['stop']) > 0 else 0
    pf = (data['gross_profit'] / data['gross_loss']) if data['gross_loss'] > 0 else 0.0
    print(f"{ac:10s} | Net: ${data['net_pnl']:+9.2f} ({data['net_r']:+5.2f}R) | Brüt Kâr: ${data['gross_profit']:8.2f} | Brüt Zarar: ${data['gross_loss']:8.2f} | Toplam: {data['count']:2d} | TP: {data['tp']} | STOP: {data['stop']} | AVERT: {data['averted']} | WR: {wr:5.1f}% | PF: {pf:5.2f}")

print('\n=== 3. HAFTANIN GÜNLERİ (DAY OF WEEK) BAZINDA PERFORMANS ===')
dow_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
for dow in dow_order:
    if dow in by_day_of_week:
        data = by_day_of_week[dow]
        wr = (data['tp'] / (data['tp'] + data['stop']) * 100) if (data['tp'] + data['stop']) > 0 else 0
        pf = (data['gross_profit'] / data['gross_loss']) if data['gross_loss'] > 0 else (99.0 if data['gross_profit'] > 0 else 0.0)
        print(f"{dow:10s} | Net: ${data['net_pnl']:+9.2f} ({data['net_r']:+5.2f}R) | Toplam: {data['count']:2d} | TP: {data['tp']} | STOP: {data['stop']} | AVERT: {data['averted']} | WR: {wr:5.1f}% | PF: {pf:5.2f}")

print('\n=== 4. TARİH BAZINDA DETAYLI GÜNLÜK BİLANÇO ===')
for d_str, data in sorted(by_date.items(), key=lambda x: x[1]['net_pnl'], reverse=True):
    wr = (data['tp'] / (data['tp'] + data['stop']) * 100) if (data['tp'] + data['stop']) > 0 else 0
    print(f"{d_str:10s} | Net: ${data['net_pnl']:+9.2f} ({data['net_r']:+5.2f}R) | Toplam: {data['count']:2d} | TP: {data['tp']} | STOP: {data['stop']} | AVERT: {data['averted']} | WR: {wr:5.1f}%")

print('\n=== 5. SEANS BAZINDA PERFORMANS ===')
for ss, data in sorted(by_session.items(), key=lambda x: x[1]['net_pnl'], reverse=True):
    wr = (data['tp'] / (data['tp'] + data['stop']) * 100) if (data['tp'] + data['stop']) > 0 else 0
    pf = (data['gross_profit'] / data['gross_loss']) if data['gross_loss'] > 0 else 0.0
    print(f"{ss:32s} | Net: ${data['net_pnl']:+9.2f} ({data['net_r']:+5.2f}R) | Toplam: {data['count']:2d} | TP: {data['tp']} | STOP: {data['stop']} | AVERT: {data['averted']} | WR: {wr:5.1f}% | PF: {pf:5.2f}")

print('\n=== 6. YÖN (LONG vs SHORT) BAZINDA PERFORMANS ===')
for dr, data in sorted(by_direction.items(), key=lambda x: x[1]['net_pnl'], reverse=True):
    wr = (data['tp'] / (data['tp'] + data['stop']) * 100) if (data['tp'] + data['stop']) > 0 else 0
    pf = (data['gross_profit'] / data['gross_loss']) if data['gross_loss'] > 0 else 0.0
    print(f"{dr:6s} | Net: ${data['net_pnl']:+9.2f} ({data['net_r']:+5.2f}R) | Toplam: {data['count']:2d} | TP: {data['tp']} | STOP: {data['stop']} | AVERT: {data['averted']} | WR: {wr:5.1f}% | PF: {pf:5.2f}")

print('\n=== 7. GRADE (A+ vs A vs B+) BAZINDA PERFORMANS ===')
for g, data in sorted(by_grade.items(), key=lambda x: x[1]['net_pnl'], reverse=True):
    wr = (data['tp'] / (data['tp'] + data['stop']) * 100) if (data['tp'] + data['stop']) > 0 else 0
    pf = (data['gross_profit'] / data['gross_loss']) if data['gross_loss'] > 0 else 0.0
    print(f"{g:6s} | Net: ${data['net_pnl']:+9.2f} ({data['net_r']:+5.2f}R) | Toplam: {data['count']:2d} | TP: {data['tp']} | STOP: {data['stop']} | AVERT: {data['averted']} | WR: {wr:5.1f}% | PF: {pf:5.2f}")
