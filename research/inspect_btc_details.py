import json
from datetime import datetime, timezone

def inspect():
    with open('smc_engine/evidence/outcomes/macro-outcome-evidence.jsonl', 'r', encoding='utf-8') as f:
        records = [json.loads(line) for line in f if line.strip()]

    btc_6 = [
        r for r in records 
        if ("BTC" in r.get("symbol", "") or "BTC" in r.get("signalId", "")) 
        and r.get("entryConfirmed") is True
        and r.get("signalGeneratedAt") >= "2026-10-07"
    ]
    
    for i, t in enumerate(btc_6, 1):
        print(f"=== Trade #{i} ===")
        print(f"signalId: {t['signalId']}")
        print(f"symbol: {t['symbol']}, direction: {t['direction']}")
        print(f"signalTimestamp: {t['signalTimestamp']} ({t['signalGeneratedAt']})")
        print(f"entryTimestamp: {t['entryTimestamp']} ({t['entryTriggeredAt']})")
        print(f"exitTimestamp: {t['exitTimestamp']} ({t['exitOccurredAt']})")
        print(f"entryPrice: {t['entryPrice']}")
        print(f"stopLoss: {t['stopLoss']}")
        print(f"takeProfit: {t['takeProfit']}")
        print(f"riskDistance: {t['riskDistance']}")
        print(f"outcome: {t['outcome']}, realizedR: {t['realizedR']}, netRealizedR: {t['netRealizedR']}")
        print(f"costs: {t['spreadCostR']} (spread), {t['slippageCostR']} (slip), {t['commissionCostR']} (comm), {t['totalCostR']} (total)")
        print(f"MFE: {t['maximumFavorableExcursion']}, MAE: {t['maximumAdverseExcursion']}")
        print(f"exitReason: {t['exitReason']}")

if __name__ == '__main__':
    inspect()
