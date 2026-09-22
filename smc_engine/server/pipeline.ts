import { CandleStore } from './candleStore';
import { NotifiedStore } from './notifiedStore';
import { OrderBlock, FVG, Candle, PremiumDiscountState, DisplacementQuality } from '../src/types';
import { detectSwings } from '../src/swingDetector';
import { detectStructure } from '../src/structureDetector';
import { calculatePremiumDiscount } from '../src/premiumDiscountCalculator';
import { detectAllOrderBlocks } from '../src/obDetector';
import { detectAllFVGs } from '../src/fvgDetector';
import { findDisplacementLeg } from '../src/displacementLeg';
import { scoreDisplacementQuality } from '../src/displacementQualityScorer';
import { calculateRange } from '../src/rangeCalculator';
import { detectSweeps } from '../src/sweepDetector';
import { determineModel, ModelState } from '../src/modelDeterminer';
import { countOBTests, countFVGTests } from '../src/poiTestCounter';
import { calculateGrade, GradeInput, GradeResult } from '../src/gradeCalculator';
import { evaluateSignalQuality, SignalQualityResult } from '../src/signalQualityEngine';
import { createSignalContext, createSignalId, SignalContext } from '../src/signalContext';
import { createStructureSnapshot, formatStructureDebugLog } from '../src/structureSnapshot';
import { evaluateSetupIntelligenceV2 } from '../src/setupIntelligenceEvaluator';
import { compareV1GradeWithV2Assessment, SetupAssessmentComparison } from '../src/setupAssessmentComparison';
import { DetectorResult, SetupAssessment } from '../src/setupAssessment';
import { recordPipelineFilterTelemetry, recordPoiLifecycleTelemetry } from './telemetry';
import { Symbol } from './universe';
import { getPipSize, calculateDistance, detectAssetClass } from '../src/assetMetrics';
import { consolidateCandidates } from '../src/poiConsolidator';
import { MacroGateAdapter, MacroGateEvaluation } from './macroGateAdapter';
import { detectLiquidityMagnet, LiquidityMagnet } from '../src/liquidityMagnetDetector';
import { detectOpposingObstacle, OpposingObstacle } from '../src/opposingObstacleDetector';
import { isCryptoSymbol } from './killzone';

export interface NotificationCandidate {
  symbol: Symbol;
  tradeDirection: 'long' | 'short';
  poiType: 'OB' | 'FVG';
  poi: OrderBlock | FVG;
  gradeResult: GradeResult;
  uniqueKey: string;
  dedupeKey?: string;
  signalId?: string;
  signalContext?: SignalContext;
  currentPrice: number;
  marketDataTimestamp?: number;
  poiFormedTimestamp: number;
  /** Timeframe that formed the POI. Current production candidates are 15M. */
  poiTimeframe?: '15m' | '1h' | '4h';
  /** Last completed analysis candle used only for zone invalidation validation. */
  validationClosePrice?: number;
  validationCloseTimestamp?: number;
  bias4H: 'bullish' | 'bearish' | 'range' | 'undefined';
  bias1H: 'bullish' | 'bearish' | 'range' | 'undefined';
  poiTestCount: number;
  pd4H: 'premium' | 'discount' | 'eq';
  pd1H: 'premium' | 'discount' | 'eq';
  pd15M?: 'premium' | 'discount' | 'eq';
  signalQualityResult?: SignalQualityResult;
  setupAssessmentV2?: SetupAssessment;
  setupAssessmentComparison?: SetupAssessmentComparison;
  admissionProfile?: 'PRODUCTION' | 'PVP_ACCELERATION';
  liquidityMagnet?: LiquidityMagnet | null;
  opposingObstacle?: OpposingObstacle | null;
  macroEvaluation?: MacroGateEvaluation;
  allowTrendContinuationPD?: boolean;
}

export function runPipeline(
  symbol: Symbol,
  candleStore: CandleStore,
  notifiedStore: NotifiedStore
): NotificationCandidate[] {
  const filterMetrics: {
    evaluatedPois: number;
    rejectionCounts: Record<string, number>;
    directionConflictCounts: Record<string, number>;
    gradeBlockOverlap: Record<string, number>;
    gradeBlockCombinations: Record<string, number>;
    singleRuleAblationCandidates: Record<string, number>;
    gradeBlockFamilyCombinations: Record<string, number>;
    gradeBlockRuleCounts: Record<string, number>;
    gradeBlockPairCounts: Record<string, number>;
    groupAblationCandidates: Record<string, number>;
  } = {
    evaluatedPois: 0,
    rejectionCounts: {},
    directionConflictCounts: {},
    gradeBlockOverlap: {},
    gradeBlockCombinations: {},
    singleRuleAblationCandidates: {},
    gradeBlockFamilyCombinations: {},
    gradeBlockRuleCounts: {},
    gradeBlockPairCounts: {},
    groupAblationCandidates: {},
  };
  const reject = (reason: string): void => {
    filterMetrics.rejectionCounts[reason] = (filterMetrics.rejectionCounts[reason] ?? 0) + 1;
  };
  const recordDirectionConflict = (reasons: readonly string[]): void => {
    for (const reason of reasons) {
      filterMetrics.directionConflictCounts[reason] = (filterMetrics.directionConflictCounts[reason] ?? 0) + 1;
    }
  };
  const recordGradeBlockOverlap = (blockReasons: readonly string[]): void => {
    const bucket = blockReasons.length === 0 ? '0' : blockReasons.length === 1 ? '1' : blockReasons.length === 2 ? '2' : '3_plus';
    filterMetrics.gradeBlockOverlap[bucket] = (filterMetrics.gradeBlockOverlap[bucket] ?? 0) + 1;
    if (blockReasons.length === 0) return;
    const normalized = blockReasons.map(normalizeGradeBlockReason).sort();
    const combination = normalized.join(' + ');
    filterMetrics.gradeBlockCombinations[combination] = (filterMetrics.gradeBlockCombinations[combination] ?? 0) + 1;
    const families = [...new Set(normalized.map(gradeBlockFamily))].sort();
    const familyCombination = families.join(' + ');
    filterMetrics.gradeBlockFamilyCombinations[familyCombination] = (filterMetrics.gradeBlockFamilyCombinations[familyCombination] ?? 0) + 1;
    for (const rule of normalized) {
      filterMetrics.gradeBlockRuleCounts[rule] = (filterMetrics.gradeBlockRuleCounts[rule] ?? 0) + 1;
    }
    for (let index = 0; index < normalized.length; index += 1) {
      for (let other = index + 1; other < normalized.length; other += 1) {
        const pair = `${normalized[index]} + ${normalized[other]}`;
        filterMetrics.gradeBlockPairCounts[pair] = (filterMetrics.gradeBlockPairCounts[pair] ?? 0) + 1;
      }
    }
  };
  const recordSingleRuleAblation = (gradeResult: GradeResult): void => {
    if ((gradeResult.grade !== 'A' && gradeResult.grade !== 'A+') || gradeResult.blockReasons.length !== 1) return;
    const rule = normalizeGradeBlockReason(gradeResult.blockReasons[0]);
    filterMetrics.singleRuleAblationCandidates[rule] = (filterMetrics.singleRuleAblationCandidates[rule] ?? 0) + 1;
  };
  const recordGroupAblation = (gradeResult: GradeResult): void => {
    if (gradeResult.grade !== 'A' && gradeResult.grade !== 'A+') return;
    const rules = gradeResult.blockReasons.map(normalizeGradeBlockReason);
    if (rules.length === 0) return;
    const groups: Readonly<Record<string, ReadonlySet<string>>> = {
      remove_htf_context: new Set(['4h_bias_conflict', '1h_bias_conflict', '4h_pd_conflict', '4h_equilibrium']),
      remove_poi_integrity: new Set(['poi_quality_insufficient', 'poi_over_tested']),
      remove_htf_context_plus_poi_integrity: new Set(['4h_bias_conflict', '1h_bias_conflict', '4h_pd_conflict', '4h_equilibrium', 'poi_quality_insufficient', 'poi_over_tested']),
      remove_liquidity: new Set(['liquidity_model_missing']),
    };
    for (const [name, allowedRules] of Object.entries(groups)) {
      if (rules.every(rule => allowedRules.has(rule))) {
        filterMetrics.groupAblationCandidates[name] = (filterMetrics.groupAblationCandidates[name] ?? 0) + 1;
      }
    }
  };
  const finish = (candidates: NotificationCandidate[]): NotificationCandidate[] => {
    recordPipelineFilterTelemetry({
      type: 'pipeline_filter',
      symbol,
      timeframe: '15m',
      evaluatedPois: filterMetrics.evaluatedPois,
      candidatesCreated: candidates.length,
      rejectionCounts: filterMetrics.rejectionCounts,
      directionConflictCounts: filterMetrics.directionConflictCounts,
      gradeBlockOverlap: filterMetrics.gradeBlockOverlap,
      gradeBlockCombinations: filterMetrics.gradeBlockCombinations,
      singleRuleAblationCandidates: filterMetrics.singleRuleAblationCandidates,
      gradeBlockFamilyCombinations: filterMetrics.gradeBlockFamilyCombinations,
      gradeBlockRuleCounts: filterMetrics.gradeBlockRuleCounts,
      gradeBlockPairCounts: filterMetrics.gradeBlockPairCounts,
      groupAblationCandidates: filterMetrics.groupAblationCandidates,
    });
    return candidates;
  };

  // 1. Pull 4h, 1h, 15m candles
  const candles4H = candleStore.getCandles(symbol, '4h');
  const candles1H = candleStore.getCandles(symbol, '1h');
  const candles15m = candleStore.getCandles(symbol, '15m');

  // Guard: if any is empty or < 15 candles -> return []
  if (candles4H.length < 15 || candles1H.length < 15 || candles15m.length < 15) {
    reject('insufficient_candles');
    return finish([]);
  }

  // Helper typecasts
  const candles4HCast = candles4H as unknown as Candle[];
  const candles1HCast = candles1H as unknown as Candle[];
  const candles15mCast = candles15m as unknown as Candle[];

  // 2. Evaluate 4H Bias
  const swings4H = detectSwings(candles4HCast);
  const structureState4H = detectStructure(candles4HCast, swings4H);
  const bias4H = structureState4H.currentTrend;
  const lastIndex4H = candles4HCast.length - 1;
  const pd4H = calculatePremiumDiscount(candles4HCast, swings4H, lastIndex4H);

  // 3. Evaluate 1H Bias
  const swings1H = detectSwings(candles1HCast);
  const structureState1H = detectStructure(candles1HCast, swings1H);
  const bias1H = structureState1H.currentTrend;
  const lastIndex1H = candles1HCast.length - 1;
  const pd1H = calculatePremiumDiscount(candles1HCast, swings1H, lastIndex1H);

  // 4. Trade direction
  let tradeDirection: 'long' | 'short';
  if (bias4H === 'bullish') {
    tradeDirection = 'long';
  } else if (bias4H === 'bearish') {
    tradeDirection = 'short';
  } else {
    // Range or undefined -> terminate pipeline
    reject('4h_bias_not_directional');
    return finish([]);
  }

  // 5. Evaluate 15m Structure
  const swings15m = detectSwings(candles15mCast);
  const structureState15m = detectStructure(candles15mCast, swings15m);
  maybeLogStructureDebug(candles15mCast, symbol);
  const has15mEvent = structureState15m.events.length > 0;
  const lastIndex15m = candles15mCast.length - 1;
  const pd15M = calculatePremiumDiscount(candles15mCast, swings15m, lastIndex15m);
  const validationCandle = latestCompletedCandle(candles15mCast);

  const observePoiLifecycle = (
    poiType: 'OB' | 'FVG',
    poi: OrderBlock | FVG,
    formedTimestamp: number,
    blockingRules: readonly string[],
    grade: string | null = null,
    candidateEligible = false,
    poiIntegrity?: GradeResult['poiIntegrity'],
  ): void => {
    const zone = poiType === 'OB'
      ? { low: (poi as OrderBlock).low, high: (poi as OrderBlock).high }
      : { low: (poi as FVG).gapLow, high: (poi as FVG).gapHigh };
    const currentPrice = candles15mCast[lastIndex15m].close;
    const distancePips = distanceToZonePips(symbol, currentPrice, zone.low, zone.high);
    const atrPips = averageTrueRangePips(candles15mCast, lastIndex15m, symbol, 14);
    const insideZone = distancePips === 0;
    const origin = poi.relatedEvent;
    const oppositeStructureEventsSinceOrigin = structureState15m.events
      .filter(event => event.breakTimestamp > origin.breakTimestamp && !poiSupportsTradeDirection(tradeDirection, event.direction))
      .map(event => ({ type: event.type, direction: event.direction, timestamp: event.breakTimestamp }));
    const invalidationTolerance = pipSize(symbol);
    const isInvalidated =
      (tradeDirection === 'long' && validationCandle.close < zone.low - invalidationTolerance) ||
      (tradeDirection === 'short' && validationCandle.close > zone.high + invalidationTolerance);
    const poiTestCount = poiType === 'OB'
      ? countOBTests(candles15mCast, poi as OrderBlock, lastIndex15m).testCount
      : countFVGTests(candles15mCast, poi as FVG, lastIndex15m).testCount;

    recordPoiLifecycleTelemetry({
      type: 'poi_lifecycle',
      poiId: createPoiDedupeKey(symbol, tradeDirection, poiType, formedTimestamp, zone.low, zone.high),
      symbol,
      timeframe: '15m',
      poiType,
      direction: tradeDirection,
      poiCreatedAt: formedTimestamp,
      originStructureEvent: { type: origin.type, direction: origin.direction, timestamp: origin.breakTimestamp },
      observedAt: candles15mCast[lastIndex15m].timestamp,
      currentPrice,
      zoneLow: zone.low,
      zoneHigh: zone.high,
      distancePips,
      distanceAtr: atrPips === null || atrPips === 0 ? null : distancePips / atrPips,
      oppositeStructureEventsSinceOrigin,
      poiTestCount,
      grade,
      ...(poiIntegrity ? { poiIntegrity } : {}),
      candidateEligible,
      whyNotCandidateYet: blockingRules,
      isApproaching: distancePips <= 15,
      isTouching: insideZone,
      isInvalidated,
    });
  };

  const candidates: NotificationCandidate[] = [];

  // Collect all OBs and FVGs
  const obs = detectAllOrderBlocks(candles15mCast, structureState15m.events);
  const fvgs = detectAllFVGs(candles15mCast, structureState15m.events, symbol, '15m');

  // Process OBs
  for (const ob of obs) {
    filterMetrics.evaluatedPois += 1;
    const formedTimestamp = candles15mCast[ob.formedAtIndex].timestamp;
    const currentMarketTime = candles15mCast[lastIndex15m].timestamp;

    // 48-Hour POI TTL Filter (Anti-Stale / Anti-Ghost POI with weekend-awareness)
    const poiAgeMs = getEffectiveMarketAgeMs(currentMarketTime, formedTimestamp, symbol);
    if (poiAgeMs > MAX_POI_AGE_MS) {
      reject('poi_expired_ttl_48h');
      observePoiLifecycle('OB', ob, formedTimestamp, ['poi_expired_ttl_48h']);
      continue;
    }

    const directionConflictReasons = getDirectionConflictReasons(tradeDirection, ob.direction, ob.relatedEvent.direction);
    if (directionConflictReasons.length > 0) {
      reject('poi_or_structure_direction_conflict');
      recordDirectionConflict(directionConflictReasons);
      observePoiLifecycle('OB', ob, formedTimestamp, ['poi_or_structure_direction_conflict', ...directionConflictReasons]);
      continue;
    }
    const uniqueKey = createSignalId({
      pair: symbol,
      timeframe: '15m',
      poiType: 'OB',
      formedTimestamp,
      eventTimestamp: ob.relatedEvent.breakTimestamp,
    });
    const dedupeKey = createPoiDedupeKey(symbol, tradeDirection, 'OB', formedTimestamp, ob.low, ob.high);
    if (notifiedStore.hasBeenNotified(uniqueKey) || notifiedStore.hasBeenNotified(dedupeKey)) {
      reject('duplicate_poi');
      observePoiLifecycle('OB', ob, formedTimestamp, ['duplicate_poi']);
      continue;
    }

    // Displacement Quality
    const leg = findDisplacementLeg(candles15mCast, ob.relatedEvent);
    const dq = scoreDisplacementQuality(candles15mCast, leg, symbol, '15m');
    if (dq === null || dq.gradePoints < minimumDisplacementPoints()) {
      reject('15m_displacement_insufficient');
      observePoiLifecycle('OB', ob, formedTimestamp, ['15m_displacement_insufficient']);
      continue;
    }

    // Distance Cap Filter (Anti-Extreme Distance)
    if (isDistanceExcessive(symbol, candles15mCast[lastIndex15m].close, ob.low, ob.high)) {
      reject('distance_exceeds_threshold');
      observePoiLifecycle('OB', ob, formedTimestamp, ['distance_exceeds_threshold']);
      continue;
    }

    // Range, Sweeps, Model
    const rangeStates = candles15mCast.map((_, idx) =>
      calculateRange(candles15mCast, swings15m, structureState15m, idx)
    );
    const sweeps = detectSweeps(candles15mCast, rangeStates, symbol, '15m');
    const modelState = determineModel(structureState15m, sweeps, lastIndex15m);

    // Tests count
    const poiTestResult = countOBTests(candles15mCast, ob, lastIndex15m);

    const liquidityMagnet = detectLiquidityMagnet(swings15m, candles15mCast[lastIndex15m].close, tradeDirection, symbol);
    const opposingObstacle = detectOpposingObstacle({
      symbol,
      tradeDirection,
      entryZone: { low: ob.low, high: ob.high },
      activeOrderBlocks15m: obs,
      activeFVGs15m: fvgs,
    });

    const allowTrendContinuationPD = shouldAllowTrendContinuationPD(
      symbol,
      tradeDirection,
      bias4H,
      bias1H,
      pd15M,
      modelState,
      dq
    );

    // Build GradeInput
    const gradeInput: GradeInput = {
      tradeDirection,
      bias4H,
      pd4H,
      bias1H,
      has15mEvent,
      displacementQuality15m: dq,
      modelState,
      poiTestResultForSweep: modelState.model === 'model1_reversal' ? poiTestResult : null,
      poiTimeframe: '15m',
      poiTestCount: poiTestResult.testCount,
      pd1H: pd1H,
      pd15M,
      liquidityMagnet,
      opposingObstacle,
      allowTrendContinuationPD,
    };

    const gradeResult = calculateGrade(gradeInput);
    if (productionOrPvpAdmission(gradeResult.entryAllowed, gradeResult.totalScore)) {
      observePoiLifecycle('OB', ob, formedTimestamp, [], gradeResult.grade, true);
      const signalQualityResult = maybeEvaluateSignalQuality({
        poiType: 'OB',
        poi: ob,
        currentIndex: lastIndex15m,
        currentPrice: candles15mCast[lastIndex15m].close,
        currentTimestamp: candles15mCast[lastIndex15m].timestamp,
        poiTestCount: poiTestResult.testCount,
      });
      const setupAssessmentV2 = buildSetupAssessmentV2({
        signalId: uniqueKey,
        symbol,
        tradeDirection,
        poiType: 'OB',
        poi: ob,
        gradeResult,
        currentTimestamp: candles15mCast[lastIndex15m].timestamp,
        bias4H,
        bias1H,
        pd4H,
        pd1H,
        pd15M,
        displacementQuality: dq,
        poiTestCount: poiTestResult.testCount,
        structureEventType: ob.relatedEvent.type,
        trend15m: structureState15m.currentTrend,
        sweeps,
      });
      const setupAssessmentComparison = compareV1GradeWithV2Assessment(gradeResult, setupAssessmentV2);

      candidates.push({
        symbol,
        tradeDirection,
        poiType: 'OB',
        poi: ob,
        gradeResult,
        uniqueKey,
        dedupeKey,
        signalId: uniqueKey,
        signalContext: createSignalContext({
          signalId: uniqueKey,
          pair: symbol,
          direction: tradeDirection,
          timeframe: '15m',
          grade: gradeResult.grade,
          score: gradeResult.totalScore,
          timestamp: ob.relatedEvent.breakTimestamp,
          lifecycleStates: ['DETECTED', 'GRADED'],
        }),
        currentPrice: candles15mCast[lastIndex15m].close,
        marketDataTimestamp: candles15mCast[lastIndex15m].timestamp,
        poiFormedTimestamp: candles15mCast[ob.formedAtIndex].timestamp,
        poiTimeframe: '15m',
        validationClosePrice: validationCandle.close,
        validationCloseTimestamp: validationCandle.timestamp,
        bias4H,
        bias1H,
        poiTestCount: poiTestResult.testCount,
        pd4H: pd4H.status === 'eq' ? 'eq' : (pd4H.status === 'premium' ? 'premium' : (pd4H.status === 'discount' ? 'discount' : 'eq')),
        pd1H: pd1H.status === 'eq' ? 'eq' : (pd1H.status === 'premium' ? 'premium' : (pd1H.status === 'discount' ? 'discount' : 'eq')),
        pd15M: pd15M.status === 'eq' ? 'eq' : (pd15M.status === 'premium' ? 'premium' : (pd15M.status === 'discount' ? 'discount' : 'eq')),
        ...(signalQualityResult ? { signalQualityResult } : {}),
        setupAssessmentV2,
        setupAssessmentComparison,
        admissionProfile: admissionProfile(),
        liquidityMagnet,
        opposingObstacle,
        allowTrendContinuationPD,
      });
    } else {
      recordGradeBlockOverlap(gradeResult.blockReasons);
      recordSingleRuleAblation(gradeResult);
      recordGroupAblation(gradeResult);
      recordGradeRejection(gradeResult, reject);
      observePoiLifecycle('OB', ob, formedTimestamp, gradeResult.blockReasons.length ? gradeResult.blockReasons : ['grade_below_A'], gradeResult.grade, false, gradeResult.poiIntegrity);
    }
  }

  // Process FVGs
  for (const fvg of fvgs) {
    filterMetrics.evaluatedPois += 1;
    const formedTimestamp = candles15mCast[fvg.middleCandleIndex].timestamp;
    const currentMarketTime = candles15mCast[lastIndex15m].timestamp;

    // 48-Hour POI TTL Filter (Anti-Stale / Anti-Ghost POI with weekend-awareness)
    const poiAgeMs = getEffectiveMarketAgeMs(currentMarketTime, formedTimestamp, symbol);
    if (poiAgeMs > MAX_POI_AGE_MS) {
      reject('poi_expired_ttl_48h');
      observePoiLifecycle('FVG', fvg, formedTimestamp, ['poi_expired_ttl_48h']);
      continue;
    }

    const directionConflictReasons = getDirectionConflictReasons(tradeDirection, fvg.direction, fvg.relatedEvent.direction);
    if (directionConflictReasons.length > 0) {
      reject('poi_or_structure_direction_conflict');
      recordDirectionConflict(directionConflictReasons);
      observePoiLifecycle('FVG', fvg, formedTimestamp, ['poi_or_structure_direction_conflict', ...directionConflictReasons]);
      continue;
    }
    const uniqueKey = createSignalId({
      pair: symbol,
      timeframe: '15m',
      poiType: 'FVG',
      formedTimestamp,
      eventTimestamp: fvg.relatedEvent.breakTimestamp,
    });
    const dedupeKey = createPoiDedupeKey(symbol, tradeDirection, 'FVG', formedTimestamp, fvg.gapLow, fvg.gapHigh);
    if (notifiedStore.hasBeenNotified(uniqueKey) || notifiedStore.hasBeenNotified(dedupeKey)) {
      reject('duplicate_poi');
      observePoiLifecycle('FVG', fvg, formedTimestamp, ['duplicate_poi']);
      continue;
    }

    // Displacement Quality
    const leg = findDisplacementLeg(candles15mCast, fvg.relatedEvent);
    const dq = scoreDisplacementQuality(candles15mCast, leg, symbol, '15m');
    if (dq === null || dq.gradePoints < minimumDisplacementPoints()) {
      reject('15m_displacement_insufficient');
      observePoiLifecycle('FVG', fvg, formedTimestamp, ['15m_displacement_insufficient']);
      continue;
    }

    // Distance Cap Filter (Anti-Extreme Distance)
    if (isDistanceExcessive(symbol, candles15mCast[lastIndex15m].close, fvg.gapLow, fvg.gapHigh)) {
      reject('distance_exceeds_threshold');
      observePoiLifecycle('FVG', fvg, formedTimestamp, ['distance_exceeds_threshold']);
      continue;
    }

    // Range, Sweeps, Model
    const rangeStates = candles15mCast.map((_, idx) =>
      calculateRange(candles15mCast, swings15m, structureState15m, idx)
    );
    const sweeps = detectSweeps(candles15mCast, rangeStates, symbol, '15m');
    const modelState = determineModel(structureState15m, sweeps, lastIndex15m);

    // Tests count
    const poiTestResult = countFVGTests(candles15mCast, fvg, lastIndex15m);

    const liquidityMagnet = detectLiquidityMagnet(swings15m, candles15mCast[lastIndex15m].close, tradeDirection, symbol);
    const opposingObstacle = detectOpposingObstacle({
      symbol,
      tradeDirection,
      entryZone: { low: fvg.gapLow, high: fvg.gapHigh },
      activeOrderBlocks15m: obs,
      activeFVGs15m: fvgs,
    });

    const allowTrendContinuationPD = shouldAllowTrendContinuationPD(
      symbol,
      tradeDirection,
      bias4H,
      bias1H,
      pd15M,
      modelState,
      dq
    );

    // Build GradeInput
    const gradeInput: GradeInput = {
      tradeDirection,
      bias4H,
      pd4H,
      bias1H,
      has15mEvent,
      displacementQuality15m: dq,
      modelState,
      poiTestResultForSweep: modelState.model === 'model1_reversal' ? poiTestResult : null,
      poiTimeframe: '15m',
      poiTestCount: poiTestResult.testCount,
      pd1H: pd1H,
      pd15M,
      liquidityMagnet,
      opposingObstacle,
      allowTrendContinuationPD,
    };

    const gradeResult = calculateGrade(gradeInput);
    if (productionOrPvpAdmission(gradeResult.entryAllowed, gradeResult.totalScore)) {
      observePoiLifecycle('FVG', fvg, formedTimestamp, [], gradeResult.grade, true);
      const signalQualityResult = maybeEvaluateSignalQuality({
        poiType: 'FVG',
        poi: fvg,
        currentIndex: lastIndex15m,
        currentPrice: candles15mCast[lastIndex15m].close,
        currentTimestamp: candles15mCast[lastIndex15m].timestamp,
        poiTestCount: poiTestResult.testCount,
      });
      const setupAssessmentV2 = buildSetupAssessmentV2({
        signalId: uniqueKey,
        symbol,
        tradeDirection,
        poiType: 'FVG',
        poi: fvg,
        gradeResult,
        currentTimestamp: candles15mCast[lastIndex15m].timestamp,
        bias4H,
        bias1H,
        pd4H,
        pd1H,
        pd15M,
        displacementQuality: dq,
        poiTestCount: poiTestResult.testCount,
        structureEventType: fvg.relatedEvent.type,
        trend15m: structureState15m.currentTrend,
        sweeps,
      });
      const setupAssessmentComparison = compareV1GradeWithV2Assessment(gradeResult, setupAssessmentV2);

      candidates.push({
        symbol,
        tradeDirection,
        poiType: 'FVG',
        poi: fvg,
        gradeResult,
        uniqueKey,
        dedupeKey,
        signalId: uniqueKey,
        signalContext: createSignalContext({
          signalId: uniqueKey,
          pair: symbol,
          direction: tradeDirection,
          timeframe: '15m',
          grade: gradeResult.grade,
          score: gradeResult.totalScore,
          timestamp: fvg.relatedEvent.breakTimestamp,
          lifecycleStates: ['DETECTED', 'GRADED'],
        }),
        currentPrice: candles15mCast[lastIndex15m].close,
        marketDataTimestamp: candles15mCast[lastIndex15m].timestamp,
        poiFormedTimestamp: candles15mCast[fvg.middleCandleIndex].timestamp,
        poiTimeframe: '15m',
        validationClosePrice: validationCandle.close,
        validationCloseTimestamp: validationCandle.timestamp,
        bias4H,
        bias1H,
        poiTestCount: poiTestResult.testCount,
        pd4H: pd4H.status === 'eq' ? 'eq' : (pd4H.status === 'premium' ? 'premium' : (pd4H.status === 'discount' ? 'discount' : 'eq')),
        pd1H: pd1H.status === 'eq' ? 'eq' : (pd1H.status === 'premium' ? 'premium' : (pd1H.status === 'discount' ? 'discount' : 'eq')),
        pd15M: pd15M.status === 'eq' ? 'eq' : (pd15M.status === 'premium' ? 'premium' : (pd15M.status === 'discount' ? 'discount' : 'eq')),
        ...(signalQualityResult ? { signalQualityResult } : {}),
        setupAssessmentV2,
        setupAssessmentComparison,
        admissionProfile: admissionProfile(),
        liquidityMagnet,
        opposingObstacle,
        allowTrendContinuationPD,
      });
    } else {
      recordGradeBlockOverlap(gradeResult.blockReasons);
      recordSingleRuleAblation(gradeResult);
      recordGroupAblation(gradeResult);
      recordGradeRejection(gradeResult, reject);
      observePoiLifecycle('FVG', fvg, formedTimestamp, gradeResult.blockReasons.length ? gradeResult.blockReasons : ['grade_below_A'], gradeResult.grade, false, gradeResult.poiIntegrity);
    }
  }

  return finish(consolidateCandidates(candidates));
}

function latestCompletedCandle(candles: readonly Candle[]): Candle {
  const now = Date.now();
  return [...candles].reverse().find(candle => candle.timestamp <= now) ?? candles[Math.max(0, candles.length - 2)];
}

export const MAX_POI_AGE_MS = 48 * 60 * 60 * 1000; // 48 Hours POI TTL (Anti-Stale / Anti-Ghost POI)

/**
 * Calculates total closed weekend duration (Friday 21:00 UTC to Sunday 21:00 UTC)
 * overlapping the interval [startMs, endMs].
 */
export function calculateWeekendDowntimeMs(startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;
  
  let totalDowntime = 0;
  
  // Find the Friday 21:00 UTC preceding or within the startMs week
  const startDate = new Date(startMs);
  const candidate = new Date(Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
    21, 0, 0, 0
  ));
  const day = candidate.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const diffToFriday = (day >= 5) ? (day - 5) : (day + 2);
  candidate.setUTCDate(candidate.getUTCDate() - diffToFriday);

  let closureStart = candidate.getTime();
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const CLOSURE_DURATION_MS = 48 * 60 * 60 * 1000; // Friday 21:00 UTC to Sunday 21:00 UTC (48 hours)

  while (closureStart < endMs) {
    const closureEnd = closureStart + CLOSURE_DURATION_MS;
    const overlapStart = Math.max(startMs, closureStart);
    const overlapEnd = Math.min(endMs, closureEnd);
    if (overlapEnd > overlapStart) {
      totalDowntime += (overlapEnd - overlapStart);
    }
    closureStart += ONE_WEEK_MS;
  }

  return totalDowntime;
}

/**
 * Returns the effective active market age in ms between formedTimestamp and currentMarketTime.
 * For 24/7 assets (Crypto), calendar age equals market age.
 * For Forex, Metals, Commodities, and Indices, closed weekend hours are subtracted.
 */
export function getEffectiveMarketAgeMs(currentMarketTime: number, formedTimestamp: number, symbol?: string): number {
  const rawAge = Math.max(0, currentMarketTime - formedTimestamp);
  if (isCryptoSymbol(symbol)) {
    return rawAge;
  }
  const downtime = calculateWeekendDowntimeMs(formedTimestamp, currentMarketTime);
  return Math.max(0, rawAge - downtime);
}

/**
 * Determines whether a setup qualifies for Macro Trend Continuation 4H P/D Relief.
 * When a pair is in a strong runaway trend (aligned 4H+1H, continuation model, non-opposite local 15M entry),
 * being in 4H discount (for shorts) or 4H premium (for longs) should NOT veto the trade if confirmed by
 * macro directional bias or strong institutional displacement.
 */
export function shouldAllowTrendContinuationPD(
  symbol: string,
  tradeDirection: 'long' | 'short',
  bias4H: 'bullish' | 'bearish' | 'range' | 'undefined',
  bias1H: 'bullish' | 'bearish' | 'range' | 'undefined',
  pd15M: PremiumDiscountState | undefined,
  modelState: ModelState,
  dq: DisplacementQuality | null
): boolean {
  // 1. Must be a continuation model (never for reversal or unconfirmed models)
  if (modelState.model !== 'model2_continuation') return false;

  // 2. Both 4H and 1H must align with trade direction
  const expectedBias = tradeDirection === 'long' ? 'bullish' : 'bearish';
  if (bias4H !== expectedBias || bias1H !== expectedBias) return false;

  // 3. Intraday 15M entry must NOT be directly opposite (e.g. short must not enter in 15M discount)
  const is15MPDOpposite = Boolean(
    pd15M &&
    ((tradeDirection === 'long' && pd15M.status === 'premium') ||
     (tradeDirection === 'short' && pd15M.status === 'discount'))
  );
  if (is15MPDOpposite) return false;

  // 4. Check Macro Gate alignment
  try {
    const macroEval = MacroGateAdapter.getInstance().evaluateCandidate(symbol, tradeDirection, 80);
    if (macroEval && macroEval.allowed) {
      return true;
    }
  } catch {
    // If macro gate evaluation fails or in isolated test environments
  }

  // 5. Strong institutional displacement fallback
  return dq !== null && dq.gradePoints >= 2 && dq.quality === 'güçlü';
}

export function isDistanceExcessive(
  symbol: string,
  currentPrice: number,
  zoneLow: number,
  zoneHigh: number
): boolean {
  if (process.env.NODE_ENV === 'test' && process.env.ENABLE_DISTANCE_FILTER !== 'true') {
    return false;
  }
  const distInfo = calculateDistance(symbol, currentPrice, zoneLow, zoneHigh);
  const assetClass = detectAssetClass(symbol);
  if (assetClass === 'FOREX') {
    return distInfo.distanceUnits > 35;
  }
  if (assetClass === 'FOREX_JPY') {
    return distInfo.distanceUnits > 50;
  }
  // CRYPTO, COMMODITY, INDEX
  return distInfo.percentDistance > 1.5;
}

function distanceToZonePips(symbol: string, currentPrice: number, low: number, high: number): number {
  if (currentPrice >= low && currentPrice <= high) return 0;
  const distance = currentPrice > high ? currentPrice - high : low - currentPrice;
  return distance / pipSize(symbol);
}

/**
 * Telemetry-only ATR. It is deliberately not used by admission, grading, or
 * validation; it lets later calibration compare distance across volatility.
 */
function averageTrueRangePips(
  candles: readonly Candle[],
  lastIndex: number,
  symbol: string,
  period: number
): number | null {
  if (lastIndex < 1) return null;
  const start = Math.max(1, lastIndex - period + 1);
  const ranges: number[] = [];
  for (let index = start; index <= lastIndex; index += 1) {
    const candle = candles[index];
    const previousClose = candles[index - 1].close;
    ranges.push(Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    ));
  }
  if (ranges.length === 0) return null;
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length / pipSize(symbol);
}

function pipSize(symbol: string): number {
  return getPipSize(symbol);
}

function recordGradeRejection(gradeResult: GradeResult, reject: (reason: string) => void): void {
  if (gradeResult.blockReasons.length === 0) {
    reject('grade_below_A');
    return;
  }

  for (const reason of gradeResult.blockReasons) {
    if (reason.includes('4H bias')) reject('grade_4h_bias_conflict');
    else if (reason.includes('1H bias')) reject('grade_1h_bias_conflict');
    else if (reason.includes('4H premium/discount')) reject('grade_4h_pd_conflict');
    else if (reason.includes('15M structure')) reject('grade_15m_structure_missing');
    else if (reason.includes('15M displacement')) reject('grade_15m_displacement_insufficient');
    else if (reason.includes('liquidity/model')) reject('grade_liquidity_model_missing');
    else if (reason.includes('POI integrity')) reject('grade_poi_integrity_insufficient');
    else if (reason.includes('EQ')) reject('grade_4h_equilibrium');
    else if (reason.includes('3+')) reject('grade_poi_over_tested');
    else reject('grade_other_block');
  }
}

function normalizeGradeBlockReason(reason: string): string {
  if (reason.includes('4H bias')) return '4h_bias_conflict';
  if (reason.includes('1H bias')) return '1h_bias_conflict';
  if (reason.includes('4H premium/discount')) return '4h_pd_conflict';
  if (reason.includes('15M structure')) return '15m_structure_missing';
  if (reason.includes('15M displacement')) return '15m_displacement_insufficient';
  if (reason.includes('liquidity/model')) return 'liquidity_model_missing';
  if (reason.includes('POI integrity')) return 'poi_integrity_insufficient';
  if (reason.includes('EQ')) return '4h_equilibrium';
  if (reason.includes('3+')) return 'poi_over_tested';
  return 'other_grade_block';
}

function gradeBlockFamily(rule: string): 'htf_context' | 'poi_integrity' | 'structure' | 'momentum' | 'liquidity' | 'other' {
  if (rule === '4h_bias_conflict' || rule === '1h_bias_conflict' || rule === '4h_pd_conflict' || rule === '4h_equilibrium') return 'htf_context';
  if (rule === 'poi_integrity_insufficient' || rule === 'poi_quality_insufficient' || rule === 'poi_over_tested') return 'poi_integrity';
  if (rule === '15m_structure_missing') return 'structure';
  if (rule === '15m_displacement_insufficient') return 'momentum';
  if (rule === 'liquidity_model_missing') return 'liquidity';
  return 'other';
}

function accelerationEnabled(): boolean {
  return process.env.ENABLE_PVP_SIGNAL_ACCELERATION === 'true';
}

function minimumDisplacementPoints(): number {
  return 1;
}

function productionOrPvpAdmission(entryAllowed: boolean, _score: number): boolean {
  return entryAllowed;
}

function poiSupportsTradeDirection(
  tradeDirection: 'long' | 'short',
  poiDirection: 'bullish' | 'bearish'
): boolean {
  return (tradeDirection === 'long' && poiDirection === 'bullish') ||
    (tradeDirection === 'short' && poiDirection === 'bearish');
}

/**
 * Keeps the existing hard gate intact while making its cause measurable.
 * These labels are telemetry only; they do not alter candidate admission.
 */
function getDirectionConflictReasons(
  tradeDirection: 'long' | 'short',
  poiDirection: 'bullish' | 'bearish',
  relatedEventDirection: 'bullish' | 'bearish'
): string[] {
  const reasons: string[] = [];
  if (!poiSupportsTradeDirection(tradeDirection, poiDirection)) reasons.push('poi_direction_vs_4h');
  if (!poiSupportsTradeDirection(tradeDirection, relatedEventDirection)) reasons.push('related_event_direction_vs_4h');
  if (poiDirection !== relatedEventDirection) reasons.push('poi_vs_related_event_direction');
  return reasons;
}

function createPoiDedupeKey(
  symbol: NotificationCandidate['symbol'],
  tradeDirection: 'long' | 'short',
  poiType: 'OB' | 'FVG',
  formedTimestamp: number,
  low: number,
  high: number
): string {
  const pip = symbol.includes('JPY') ? 0.01 : 0.0001;
  const lowPips = Math.round(low / pip);
  const highPips = Math.round(high / pip);
  return `POI:${symbol}:${tradeDirection}:${poiType}:${formedTimestamp}:${lowPips}-${highPips}`;
}

function admissionProfile(): 'PRODUCTION' | 'PVP_ACCELERATION' {
  return accelerationEnabled() ? 'PVP_ACCELERATION' : 'PRODUCTION';
}

function maybeEvaluateSignalQuality(
  input: Parameters<typeof evaluateSignalQuality>[0]
): SignalQualityResult | undefined {
  if (process.env.ENABLE_SIGNAL_QUALITY_ENGINE !== 'true') {
    return undefined;
  }

  return evaluateSignalQuality(input);
}

function maybeLogStructureDebug(
  candles: Candle[],
  symbol: Symbol
): void {
  if (process.env.ENABLE_STRUCTURE_DEBUG !== 'true') {
    return;
  }

  const snapshot = createStructureSnapshot(candles, symbol, '15m');
  console.log(`[STRUCTURE_SNAPSHOT] ${JSON.stringify({
    symbol: snapshot.symbol,
    timeframe: snapshot.timeframe,
    currentTrend: snapshot.currentTrend,
    currentTimestamp: snapshot.currentTimestamp,
    lastBos: snapshot.lastBos ? {
      direction: snapshot.lastBos.direction,
      breakCandleIndex: snapshot.lastBos.breakCandleIndex,
      breakTimestamp: snapshot.lastBos.breakTimestamp,
    } : null,
    lastChoch: snapshot.lastChoch ? {
      direction: snapshot.lastChoch.direction,
      breakCandleIndex: snapshot.lastChoch.breakCandleIndex,
      breakTimestamp: snapshot.lastChoch.breakTimestamp,
    } : null,
    activeOrderBlock: snapshot.activeOrderBlock ? {
      direction: snapshot.activeOrderBlock.direction,
      formedAtIndex: snapshot.activeOrderBlock.formedAtIndex,
      high: snapshot.activeOrderBlock.high,
      low: snapshot.activeOrderBlock.low,
    } : null,
    activeSweep: snapshot.activeSweep ? {
      type: snapshot.activeSweep.type,
      candleIndex: snapshot.activeSweep.candleIndex,
      sweptLevel: snapshot.activeSweep.sweptLevel,
    } : null,
    premiumDiscount: snapshot.premiumDiscount,
    counts: snapshot.structureState,
  })}`);
  console.log(formatStructureDebugLog(snapshot));
}

function buildSetupAssessmentV2(input: {
  signalId: string;
  symbol: Symbol;
  tradeDirection: 'long' | 'short';
  poiType: 'OB' | 'FVG';
  poi: OrderBlock | FVG;
  gradeResult: GradeResult;
  currentTimestamp: number;
  bias4H: 'bullish' | 'bearish' | 'range' | 'undefined';
  bias1H: 'bullish' | 'bearish' | 'range' | 'undefined';
  pd4H: PremiumDiscountState;
  pd1H: PremiumDiscountState;
  pd15M: PremiumDiscountState;
  displacementQuality: NonNullable<GradeInput['displacementQuality15m']>;
  poiTestCount: number;
  structureEventType: 'BOS' | 'CHoCH';
  trend15m: 'bullish' | 'bearish' | 'range' | 'undefined';
  sweeps: ReturnType<typeof detectSweeps>;
}): SetupAssessment {
  const zone = resolvePoiZone(input.poiType, input.poi);
  const relatedEvent = input.poi.relatedEvent;
  const latestSweep = input.sweeps[input.sweeps.length - 1] ?? null;

  const detector: DetectorResult = {
    signalId: input.signalId,
    symbol: input.symbol,
    timeframe: '15m',
    direction: input.tradeDirection,
    detectedAt: input.currentTimestamp,
    htfBias: {
      fourHour: input.bias4H,
      oneHour: input.bias1H,
    },
    structure: {
      event: relatedEvent,
      eventType: input.structureEventType,
      trend15m: input.trend15m,
    },
    sweep: {
      present: input.gradeResult.breakdown.sweep > 0,
      type: latestSweep?.type === 'sweep_high' ? 'Range High' : latestSweep?.type === 'sweep_low' ? 'Range Low' : 'Unknown',
      timestamp: latestSweep?.timestamp ?? null,
      source: latestSweep ? 'detector' : 'unknown',
    },
    poi: {
      type: input.poiType === 'OB' ? 'Order Block' : 'Fair Value Gap',
      orderBlock: input.poiType === 'OB' ? input.poi as OrderBlock : null,
      fairValueGap: input.poiType === 'FVG' ? input.poi as FVG : null,
      zoneHigh: zone.high,
      zoneLow: zone.low,
      formedAt: input.poiType === 'OB'
        ? (input.poi as OrderBlock).formedAtIndex
        : (input.poi as FVG).middleCandleIndex,
      testCount: input.poiTestCount,
    },
    premiumDiscount: {
      fourHour: input.pd4H,
      oneHour: input.pd1H,
      fifteenMinute: input.pd15M,
    },
    displacement: input.displacementQuality,
    session: {
      name: 'Unknown',
      timestamp: input.currentTimestamp,
      timezone: 'Europe/Istanbul',
    },
    liquidity: {
      events: input.sweeps.map(sweep => sweep.type === 'sweep_high' ? 'Range High' : 'Range Low'),
      notes: [],
    },
  };

  return evaluateSetupIntelligenceV2({
    detector,
    v1Grade: input.gradeResult,
  });
}

function resolvePoiZone(type: 'OB' | 'FVG', poi: OrderBlock | FVG): { high: number; low: number } {
  if (type === 'OB') {
    const ob = poi as OrderBlock;
    return { high: ob.high, low: ob.low };
  }
  const fvg = poi as FVG;
  return { high: fvg.gapHigh, low: fvg.gapLow };
}
