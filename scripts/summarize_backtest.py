import json
import sys

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

with open('smc_engine/data/full_backtest_report.json', 'r', encoding='utf-8') as f:
    rep = json.load(f)

allowed = [t for t in rep['trades'] if t['macroAllowed']]
print(f"=== ONARILAN / MAKRO ONAYLI ISLEMLER ({len(allowed)} adet) ===")
for t in allowed:
    outcome = t['outcome']
    rr = t['rrAchieved']
    mfe = t['mfeR']
    mae = t['maeR']
    print(f"[{outcome.ljust(7)}] {t['symbol']} {t['direction'].upper()} ({rr:+.1f}R) | Giris: {t['entryTime']} -> Cikis: {t['exitTime']} | MFE: +{mfe}R, MAE: -{mae}R | {t['reason']}")

print("\n=== VETO EDILEN AMA KAZANACAK VEYA KAYBEDECEK ISLEMLER (VETO AUDIT) ===")
vetoed = [t for t in rep['trades'] if not t['macroAllowed']]
sl_prevented = [t for t in vetoed if t['outcome'] == 'SL']
tp_missed = [t for t in vetoed if t['outcome'] == 'TP']
be_vetoed = [t for t in vetoed if t['outcome'] == 'BE']
expired_vetoed = [t for t in vetoed if t['outcome'] == 'EXPIRED']

print(f"Toplam Veto: {len(vetoed)}")
print(f"  -> Engellenen SL (Portfoyu Kurtaran): {len(sl_prevented)} adet (-{len(sl_prevented)}.0R zarar onlendi)")
print(f"  -> Kacirilan TP: {len(tp_missed)} adet (+{len(tp_missed)*2.0}R kar kacirildi)")
print(f"  -> Basabas (BE) ile Kapanan: {len(be_vetoed)} adet")
print(f"  -> Giriş Olmadan Suresi Dolan (Expired): {len(expired_vetoed)} adet")
