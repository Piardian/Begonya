import { LtfExecutionStateMachine, LtfPoiContext } from '../src/executionStateMachine1m';
import { Candle } from '../src/types';

describe('LtfExecutionStateMachine (Model B: 1M State Machine)', () => {
  const baseContext: LtfPoiContext = {
    id: 'POI_TEST_EURUSD_15M',
    symbol: 'EURUSD',
    direction: 'long',
    poiType: 'OB',
    zoneLow: 1.1000,
    zoneHigh: 1.1020,
    invalidationLevel: 1.0990,
    pipSize: 0.0001,
    targetRR: 3.0,
    breakEvenAtR: 1.0,
    maxMonitoringBars: 60,
  };

  it('starts in WATCHING_POI_TOUCH phase', () => {
    const sm = new LtfExecutionStateMachine(baseContext);
    expect(sm.getPhase()).toBe('WATCHING_POI_TOUCH');
  });

  it('transitions to POI_PENETRATED when 1M candle touches the 15M zone', () => {
    const sm = new LtfExecutionStateMachine(baseContext);
    // Candle above zone
    sm.processCandle({ timestamp: 1000, open: 1.1030, high: 1.1035, low: 1.1025, close: 1.1028 });
    expect(sm.getPhase()).toBe('WATCHING_POI_TOUCH');

    // Candle dips into zone [1.1000 - 1.1020]
    sm.processCandle({ timestamp: 2000, open: 1.1025, high: 1.1026, low: 1.1015, close: 1.1018 });
    expect(sm.getPhase()).toBe('POI_PENETRATED');
  });

  it('invalidates immediately if 15M POI is breached through invalidation level without reaction', () => {
    const sm = new LtfExecutionStateMachine(baseContext);
    // Massive drop below invalidation level (1.0990)
    sm.processCandle({ timestamp: 1000, open: 1.1030, high: 1.1030, low: 1.0980, close: 1.0985 });
    expect(sm.getPhase()).toBe('INVALIDATED');
    expect(sm.getSnapshot().outcome).toBe('INVALIDATED');
  });

  it('executes full journey: POI Touch -> Sweep -> Displacement -> Armed -> Fill -> TP', () => {
    const sm = new LtfExecutionStateMachine(baseContext);

    // 1. Touch POI
    sm.processCandle({ timestamp: 1000, open: 1.1025, high: 1.1026, low: 1.1015, close: 1.1018 });
    expect(sm.getPhase()).toBe('POI_PENETRATED');

    // 2. Consolidate and form local low inside zone
    sm.processCandle({ timestamp: 2000, open: 1.1018, high: 1.1020, low: 1.1010, close: 1.1014 });
    sm.processCandle({ timestamp: 3000, open: 1.1014, high: 1.1018, low: 1.1012, close: 1.1016 });

    // 3. Sweep Low: Pierces prior low (1.1010) to 1.1002 with long lower wick rejection
    sm.processCandle({
      timestamp: 4000,
      open: 1.1016,
      high: 1.1017,
      low: 1.1002, // Swept prior 1.1010 low by 8 pips!
      close: 1.1014, // Closed back up, lower wick = 0.0012 out of 0.0015 range (80% wick!)
    });
    expect(sm.getPhase()).toBe('SWEEP_DETECTED');
    expect(sm.getSnapshot().sweepEvent?.sweepExtremePrice).toBe(1.1002);

    // 4. Displacement + CHoCH: Strong green candle breaking CHoCH level (1.1020) with dominant body
    sm.processCandle({
      timestamp: 5000,
      open: 1.1014,
      high: 1.1028,
      low: 1.1013,
      close: 1.1027, // Closed cleanly above 1.1020 CHoCH!
    });
    expect(sm.getPhase()).toBe('LIMIT_ARMED');
    const order = sm.getSnapshot().order;
    expect(order).toBeDefined();
    expect(order!.stopLoss).toBeLessThan(1.1002); // Stop is below the sweep extreme!
    expect(order!.targetRR).toBe(3.0);

    // 5. Retest: Price pulls back into the 1M FVG to fill the limit order
    const entryP = order!.entryPrice;
    sm.processCandle({
      timestamp: 6000,
      open: 1.1027,
      high: 1.1027,
      low: entryP - 0.0001, // Touched entry!
      close: entryP + 0.0002,
    });
    expect(sm.getPhase()).toBe('FILLED');

    // 6. Target Run: Price rallies to Take Profit
    const tp = order!.takeProfit;
    sm.processCandle({
      timestamp: 7000,
      open: entryP + 0.0002,
      high: tp + 0.0005, // Hit TP!
      low: entryP,
      close: tp,
    });
    expect(sm.getPhase()).toBe('EXITED');
    expect(sm.getSnapshot().outcome).toBe('TP');
    expect(sm.getSnapshot().rrAchieved).toBe(3.0);
  });

  it('protects with break-even when price hits +1.0R and then pulls back', () => {
    const sm = new LtfExecutionStateMachine(baseContext);

    // Penetrate
    sm.processCandle({ timestamp: 1000, open: 1.1025, high: 1.1026, low: 1.1015, close: 1.1018 });
    // Structure
    sm.processCandle({ timestamp: 2000, open: 1.1018, high: 1.1020, low: 1.1010, close: 1.1014 });
    // Sweep
    sm.processCandle({ timestamp: 3000, open: 1.1014, high: 1.1015, low: 1.1004, close: 1.1012 });
    // Displacement
    sm.processCandle({ timestamp: 4000, open: 1.1012, high: 1.1024, low: 1.1011, close: 1.1023 });
    expect(sm.getPhase()).toBe('LIMIT_ARMED');

    const order = sm.getSnapshot().order!;
    // Fill
    sm.processCandle({ timestamp: 5000, open: 1.1023, high: 1.1023, low: order.entryPrice, close: order.entryPrice + 0.0001 });
    expect(sm.getPhase()).toBe('FILLED');

    // Rally past +1.0R
    const plus1R = order.entryPrice + order.riskDistance * 1.2;
    sm.processCandle({ timestamp: 6000, open: order.entryPrice, high: plus1R, low: order.entryPrice, close: plus1R });

    // Pullback to entry price -> BE triggered!
    sm.processCandle({ timestamp: 7000, open: plus1R, high: plus1R, low: order.entryPrice - 0.0001, close: order.entryPrice });
    expect(sm.getPhase()).toBe('EXITED');
    expect(sm.getSnapshot().outcome).toBe('BE');
    expect(sm.getSnapshot().rrAchieved).toBe(0.0);
  });

  it('handles Short direction seamlessly', () => {
    const shortContext: LtfPoiContext = {
      id: 'POI_TEST_EURUSD_SHORT',
      symbol: 'EURUSD',
      direction: 'short',
      poiType: 'OB',
      zoneLow: 1.1050,
      zoneHigh: 1.1070,
      invalidationLevel: 1.1080,
      pipSize: 0.0001,
      targetRR: 3.0,
      breakEvenAtR: 1.0,
    };

    const sm = new LtfExecutionStateMachine(shortContext);

    // 1. Touch POI
    sm.processCandle({ timestamp: 1000, open: 1.1040, high: 1.1055, low: 1.1038, close: 1.1052 });
    expect(sm.getPhase()).toBe('POI_PENETRATED');

    // 2. Structure inside POI
    sm.processCandle({ timestamp: 2000, open: 1.1052, high: 1.1060, low: 1.1050, close: 1.1058 });

    // 3. Sweep High: Sweeps prior high (1.1060) to 1.1068 with upper wick rejection
    sm.processCandle({
      timestamp: 3000,
      open: 1.1058,
      high: 1.1068, // Sweeps 1.1060 by 8 pips!
      low: 1.1055,
      close: 1.1057, // Upper wick rejection
    });
    expect(sm.getPhase()).toBe('SWEEP_DETECTED');
    expect(sm.getSnapshot().sweepEvent?.sweepExtremePrice).toBe(1.1068);

    // 4. Displacement down: Breaks below local low (1.1050)
    sm.processCandle({
      timestamp: 4000,
      open: 1.1057,
      high: 1.1058,
      low: 1.1042,
      close: 1.1044, // Bearish displacement!
    });
    expect(sm.getPhase()).toBe('LIMIT_ARMED');
    const order = sm.getSnapshot().order!;
    expect(order.stopLoss).toBeGreaterThan(1.1068); // Stop is above the sweep extreme!

    // 5. Retest fill
    sm.processCandle({
      timestamp: 5000,
      open: 1.1044,
      high: order.entryPrice + 0.0001,
      low: 1.1044,
      close: order.entryPrice,
    });
    expect(sm.getPhase()).toBe('FILLED');

    // 6. Hit Short TP
    sm.processCandle({
      timestamp: 6000,
      open: order.entryPrice,
      high: order.entryPrice,
      low: order.takeProfit - 0.0002,
      close: order.takeProfit,
    });
    expect(sm.getPhase()).toBe('EXITED');
    expect(sm.getSnapshot().outcome).toBe('TP');
    expect(sm.getSnapshot().rrAchieved).toBe(3.0);
  });
});
