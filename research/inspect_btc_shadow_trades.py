import json

def main():
    path = "smc_engine/evidence/outcomes/macro-outcome-evidence.jsonl"
    with open(path, "r", encoding="utf-8") as f:
        records = [json.loads(line) for line in f if line.strip()]

    # Filter BTC triggered trades
    btc_triggered = [
        r for r in records 
        if ("BTC" in r.get("symbol", "") or "BTC" in r.get("signalId", "")) 
        and r.get("entryConfirmed") is True
    ]
    print(f"Total triggered BTC trades: {len(btc_triggered)}")
    
    for i, r in enumerate(btc_triggered, 1):
        print(f"\n==================== BTC TRIGGERED TRADE #{i} ====================")
        print(f"Signal ID:        {r.get('signalId')}")
        print(f"Direction:        {r.get('direction')}")
        print(f"POI Type:         {r.get('poiType')}")
        print(f"Entry Price:      {r.get('entryPrice')}")
        print(f"Stop Loss:        {r.get('stopLoss')}")
        print(f"Take Profit:      {r.get('takeProfit')}")
        print(f"Risk Distance:    {r.get('riskDistance')}")
        print(f"Outcome:          {r.get('outcome')}")
        print(f"Gross Realized R: {r.get('realizedR')}")
        print(f"Costs (R):        Spread: {r.get('spreadCostR')}, Slip: {r.get('slippageCostR')}, Comm: {r.get('commissionCostR')}, Total: {r.get('totalCostR')}")
        print(f"Net Realized R:   {r.get('netRealizedR')}")
        print(f"Signal Time:      {r.get('signalGeneratedAt')}")
        print(f"Entry Time:       {r.get('entryTriggeredAt')}")
        print(f"Exit Time:        {r.get('exitOccurredAt')}")
        print(f"Exit Reason:      {r.get('exitReason')}")
        print(f"MFE / MAE:        MFE: {r.get('maximumFavorableExcursion')} / MAE: {r.get('maximumAdverseExcursion')}")

if __name__ == "__main__":
    main()
