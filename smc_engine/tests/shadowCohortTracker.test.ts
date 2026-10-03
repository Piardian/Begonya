import * as fs from 'fs';
import * as path from 'path';
import { ShadowCohortTracker, ShadowPoiRegistration } from '../server/shadowCohortTracker';
import type { Candle } from '../src/types';

describe('ShadowCohortTracker (Quantitative Ledger & 1M Simulation)', () => {
  const testDataDir = path.resolve('tests', 'temp_shadow_data');

  beforeEach(() => {
    fs.rmSync(testDataDir, { recursive: true, force: true });
    fs.mkdirSync(testDataDir, { recursive: true });
    ShadowCohortTracker.resetInstance();
  });

  afterEach(() => {
    fs.rmSync(testDataDir, { recursive: true, force: true });
    ShadowCohortTracker.resetInstance();
  });

  function createTracker(): ShadowCohortTracker {
    return new ShadowCohortTracker(testDataDir);
  }

  test('should register both accepted candidates and rejected candidates into appropriate cohorts', () => {
    const tracker = createTracker();

    // 1. Live Accepted with Sweep
    const liveSweep: ShadowPoiRegistration = {
      symbol: 'EURUSD',
      tradeDirection: 'long',
      poiType: 'OB',
      zoneLow: 1.0500,
      zoneHigh: 1.0520,
      formedTimestamp: 10000,
      observedTimestamp: 15000,
      stage: 'CANDIDATE',
      grade: 'A+',
      smcScore: 8,
      hasSweep: true,
      blockingRules: [],
      bias4H: 'bullish',
      bias1H: 'bullish',
    };
    tracker.registerPoiCandidate(liveSweep);

    // 2. Live Accepted without Sweep
    const liveNoSweep: ShadowPoiRegistration = {
      symbol: 'EURUSD',
      tradeDirection: 'long',
      poiType: 'OB',
      zoneLow: 1.0600,
      zoneHigh: 1.0620,
      formedTimestamp: 20000,
      observedTimestamp: 25000,
      stage: 'CANDIDATE',
      grade: 'A',
      smcScore: 6,
      hasSweep: false,
      blockingRules: [],
      bias4H: 'bullish',
      bias1H: 'bullish',
    };
    tracker.registerPoiCandidate(liveNoSweep);

    // 3. Rejected due to displacement
    const rejDisplacement: ShadowPoiRegistration = {
      symbol: 'GBPUSD',
      tradeDirection: 'short',
      poiType: 'OB',
      zoneLow: 1.2500,
      zoneHigh: 1.2530,
      formedTimestamp: 30000,
      observedTimestamp: 35000,
      stage: 'FILTER_REJECTED',
      grade: null,
      smcScore: null,
      hasSweep: false,
      blockingRules: ['15m_displacement_insufficient'],
      bias4H: 'bearish',
      bias1H: 'bearish',
    };
    tracker.registerPoiCandidate(rejDisplacement);

    expect(tracker.getActiveCount()).toBe(3);
  });

  test('should track retest, target hit (TP), and simulate 1M confirmation', () => {
    const tracker = createTracker();

    const candidate: ShadowPoiRegistration = {
      symbol: 'EURUSD',
      tradeDirection: 'long',
      poiType: 'OB',
      zoneLow: 1.0500,
      zoneHigh: 1.0520,
      formedTimestamp: 10000,
      observedTimestamp: 15000,
      stage: 'CANDIDATE',
      grade: 'A',
      smcScore: 6,
      hasSweep: true,
      blockingRules: [],
      bias4H: 'bullish',
      bias1H: 'bullish',
    };
    tracker.registerPoiCandidate(candidate);

    // Entry is midpoint = 1.0510. Stop is 1.0500 - 0.00015 = 1.04985. Risk = 0.00115. Target (2R) = 1.0510 + 0.0023 = 1.0533.
    const candles: Candle[] = [
      // Candle 1: Touches zone and enters
      { timestamp: 20000, open: 1.0540, high: 1.0545, low: 1.0505, close: 1.0520 },
      // Candle 2: Reaction in favor
      { timestamp: 30000, open: 1.0520, high: 1.0535, low: 1.0515, close: 1.0534 }, // Reaches TP (1.0534 >= 1.0533)
    ];

    const updated = tracker.process('EURUSD', candles);
    expect(updated).toHaveLength(1);
    expect(updated[0].status).toBe('COMPLETED');
    expect(updated[0].outcome).toBe('TP');
    expect(updated[0].realizedR).toBe(2.0);
    expect(updated[0].confirmationHypothesis.demonstratedZoneRejection).toBe(true);
    expect(updated[0].confirmationHypothesis.simulated1MStatus).toBe('CONFIRMED_ENTERED');

    const report = tracker.generateAnalyticsReport();
    expect(report.overall.tpCount).toBe(1);
    expect(report.overall.winRatePct).toBe(100);
    expect(report.sweepComparison.withSweep.count).toBe(1);
    expect(report.sweepComparison.withSweep.winRatePct).toBe(100);
  });

  test('should detect direct blowout loss and record avoided loss under 1M confirmation hypothesis', () => {
    const tracker = createTracker();

    const candidate: ShadowPoiRegistration = {
      symbol: 'GBPUSD',
      tradeDirection: 'short',
      poiType: 'OB',
      zoneLow: 1.2500,
      zoneHigh: 1.2520,
      formedTimestamp: 10000,
      observedTimestamp: 15000,
      stage: 'FILTER_REJECTED',
      grade: null,
      smcScore: null,
      hasSweep: false,
      blockingRules: ['15m_displacement_insufficient'],
      bias4H: 'bearish',
      bias1H: 'bearish',
    };
    tracker.registerPoiCandidate(candidate);

    // Entry = 1.2510, Stop = 1.25215. Target = 1.2487.
    // Candle blows straight through stop with zero favorable excursion
    const candles: Candle[] = [
      { timestamp: 20000, open: 1.2490, high: 1.2515, low: 1.2490, close: 1.2512 }, // touches entry
      { timestamp: 30000, open: 1.2512, high: 1.2540, low: 1.2510, close: 1.2538 }, // blasts through stop (1.2540 > 1.25215)
    ];

    const updated = tracker.process('GBPUSD', candles);
    expect(updated).toHaveLength(1);
    expect(updated[0].status).toBe('COMPLETED');
    expect(updated[0].outcome).toBe('SL');
    expect(updated[0].realizedR).toBe(-1.0);
    expect(updated[0].confirmationHypothesis.directBlowoutWithoutReaction).toBe(true);
    expect(updated[0].confirmationHypothesis.simulated1MStatus).toBe('AVOIDED_LOSS');
    expect(updated[0].confirmationHypothesis.simulated1MR).toBe(0);

    const report = tracker.generateAnalyticsReport();
    expect(report.overall.slCount).toBe(1);
    expect(report.oneMinuteConfirmationSimulation.directBlowoutsAvoided).toBe(1);
    expect(report.filterEfficiency.filterRejected.savedLosses).toBe(1);
    expect(report.filterEfficiency.netFilterBenefitR).toBe(1.0); // +1.0R benefit by rejecting this losing trade
  });
});
