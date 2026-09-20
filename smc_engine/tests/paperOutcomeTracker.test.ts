import { selectPaperTarget, evaluatePaperTradeOutcome } from '../src/paperOutcomeTracker';
import { LiquidityMagnet } from '../src/liquidityMagnetDetector';
import { OpposingObstacle } from '../src/opposingObstacleDetector';
import { Candle } from '../src/types';

describe('PaperOutcomeTracker — 2R–5R Target Selection and Lifecycle', () => {
  const entryPrice = 1.1000;
  const stopLossPrice = 1.0990; // Risk = 10 pips (0.0010)
  const riskDistance = 0.0010;

  describe('Target Selection Rules (2R–5R)', () => {
    it('defaults to exactly 2.0R fallback when no context targets exist', () => {
      const result = selectPaperTarget({
        entryPrice,
        stopLossPrice,
        tradeDirection: 'long',
        symbol: 'EURUSD',
      });

      expect(result.targetSource).toBe('2R_FALLBACK');
      expect(result.targetR).toBe(2.0);
      expect(result.targetPrice).toBeCloseTo(1.1020, 5); // 1.1000 + 2 * 0.0010
    });

    it('rejects Liquidity Magnet closer than 2R (< 2R) and falls back to 2R', () => {
      // 15 pips away = 1.5R (< 2R)
      const magnet: LiquidityMagnet = {
        type: 'EQH',
        priceLevel: 1.1015,
        pointsCount: 2,
        distancePips: 15,
        isActive: true,
        description: 'EQH 15 pips above',
      };

      const result = selectPaperTarget({
        entryPrice,
        stopLossPrice,
        tradeDirection: 'long',
        symbol: 'EURUSD',
        liquidityMagnet: magnet,
      });

      expect(result.targetSource).toBe('2R_FALLBACK');
      expect(result.targetR).toBe(2.0);
      expect(result.targetPrice).toBeCloseTo(1.1020, 5);
    });

    it('rejects Liquidity Magnet further than 5R (> 5R) and falls back to 2R', () => {
      // 60 pips away = 6.0R (> 5R)
      const magnet: LiquidityMagnet = {
        type: 'EQH',
        priceLevel: 1.1060,
        pointsCount: 2,
        distancePips: 60,
        isActive: true,
        description: 'EQH 60 pips above',
      };

      const result = selectPaperTarget({
        entryPrice,
        stopLossPrice,
        tradeDirection: 'long',
        symbol: 'EURUSD',
        liquidityMagnet: magnet,
      });

      expect(result.targetSource).toBe('2R_FALLBACK');
      expect(result.targetR).toBe(2.0);
      expect(result.targetPrice).toBeCloseTo(1.1020, 5);
    });

    it('uses Liquidity Magnet when within [2R, 5R]', () => {
      // 35 pips away = 3.5R
      const magnet: LiquidityMagnet = {
        type: 'EQH',
        priceLevel: 1.1035,
        pointsCount: 2,
        distancePips: 35,
        isActive: true,
        description: 'EQH 35 pips above',
      };

      const result = selectPaperTarget({
        entryPrice,
        stopLossPrice,
        tradeDirection: 'long',
        symbol: 'EURUSD',
        liquidityMagnet: magnet,
      });

      expect(result.targetSource).toBe('LIQUIDITY_MAGNET');
      expect(result.targetR).toBe(3.5);
      expect(result.targetPrice).toBe(1.1035);
    });

    it('rejects Opposing Obstacle closer than 2R (< 2R) and falls back to 2R', () => {
      // 18 pips away = 1.8R
      const obstacle: OpposingObstacle = {
        hasObstacle: true,
        obstacleType: 'OB',
        timeframe: '15m',
        level: { low: 1.1018, high: 1.1025 },
        distancePips: 18,
        warningText: '15M Bearish OB',
      };

      const result = selectPaperTarget({
        entryPrice,
        stopLossPrice,
        tradeDirection: 'long',
        symbol: 'EURUSD',
        opposingObstacle: obstacle,
      });

      expect(result.targetSource).toBe('2R_FALLBACK');
      expect(result.targetR).toBe(2.0);
    });

    it('rejects Opposing Obstacle further than 5R (> 5R) and falls back to 2R', () => {
      // 55 pips away = 5.5R
      const obstacle: OpposingObstacle = {
        hasObstacle: true,
        obstacleType: 'OB',
        timeframe: '15m',
        level: { low: 1.1055, high: 1.1065 },
        distancePips: 55,
        warningText: '15M Bearish OB',
      };

      const result = selectPaperTarget({
        entryPrice,
        stopLossPrice,
        tradeDirection: 'long',
        symbol: 'EURUSD',
        opposingObstacle: obstacle,
      });

      expect(result.targetSource).toBe('2R_FALLBACK');
      expect(result.targetR).toBe(2.0);
    });

    it('uses Opposing Obstacle when within [2R, 5R]', () => {
      // 25 pips away = 2.5R
      const obstacle: OpposingObstacle = {
        hasObstacle: true,
        obstacleType: 'OB',
        timeframe: '15m',
        level: { low: 1.1025, high: 1.1032 },
        distancePips: 25,
        warningText: '15M Bearish OB',
      };

      const result = selectPaperTarget({
        entryPrice,
        stopLossPrice,
        tradeDirection: 'long',
        symbol: 'EURUSD',
        opposingObstacle: obstacle,
      });

      expect(result.targetSource).toBe('OPPOSING_OBSTACLE');
      expect(result.targetR).toBe(2.5);
      expect(result.targetPrice).toBe(1.1025);
    });

    it('selects the closest candidate to entry when both Magnet and Obstacle are in [2R, 5R]', () => {
      // Magnet at 40 pips = 4.0R
      const magnet: LiquidityMagnet = {
        type: 'EQH',
        priceLevel: 1.1040,
        pointsCount: 2,
        distancePips: 40,
        isActive: true,
        description: 'EQH 40 pips above',
      };
      // Obstacle at 24 pips = 2.4R (closer!)
      const obstacle: OpposingObstacle = {
        hasObstacle: true,
        obstacleType: 'OB',
        timeframe: '15m',
        level: { low: 1.1024, high: 1.1030 },
        distancePips: 24,
        warningText: '15M Bearish OB',
      };

      const result = selectPaperTarget({
        entryPrice,
        stopLossPrice,
        tradeDirection: 'long',
        symbol: 'EURUSD',
        liquidityMagnet: magnet,
        opposingObstacle: obstacle,
      });

      expect(result.targetSource).toBe('OPPOSING_OBSTACLE');
      expect(result.targetR).toBe(2.4);
      expect(result.targetPrice).toBe(1.1024);
    });

    it('selects Magnet if closer to entry than Obstacle when both in [2R, 5R]', () => {
      // Magnet at 22 pips = 2.2R (closer!)
      const magnet: LiquidityMagnet = {
        type: 'EQH',
        priceLevel: 1.1022,
        pointsCount: 2,
        distancePips: 22,
        isActive: true,
        description: 'EQH 22 pips above',
      };
      // Obstacle at 35 pips = 3.5R
      const obstacle: OpposingObstacle = {
        hasObstacle: true,
        obstacleType: 'OB',
        timeframe: '15m',
        level: { low: 1.1035, high: 1.1042 },
        distancePips: 35,
        warningText: '15M Bearish OB',
      };

      const result = selectPaperTarget({
        entryPrice,
        stopLossPrice,
        tradeDirection: 'long',
        symbol: 'EURUSD',
        liquidityMagnet: magnet,
        opposingObstacle: obstacle,
      });

      expect(result.targetSource).toBe('LIQUIDITY_MAGNET');
      expect(result.targetR).toBe(2.2);
      expect(result.targetPrice).toBe(1.1022);
    });

    it('correctly calculates short trade targets in [2R, 5R]', () => {
      const shortEntry = 1.1000;
      const shortSL = 1.1010; // Risk = 10 pips (downward trade)
      // Magnet at 1.0970 (30 pips below = 3.0R)
      const magnet: LiquidityMagnet = {
        type: 'EQL',
        priceLevel: 1.0970,
        pointsCount: 2,
        distancePips: 30,
        isActive: true,
        description: 'EQL 30 pips below',
      };

      const result = selectPaperTarget({
        entryPrice: shortEntry,
        stopLossPrice: shortSL,
        tradeDirection: 'short',
        symbol: 'EURUSD',
        liquidityMagnet: magnet,
      });

      expect(result.targetSource).toBe('LIQUIDITY_MAGNET');
      expect(result.targetR).toBe(3.0);
      expect(result.targetPrice).toBe(1.0970);
    });
  });

  describe('Outcome & Lifecycle Evaluation', () => {
    it('reaches TP when take profit price is hit', () => {
      const futureCandles: Candle[] = [
        { timestamp: 1000, open: 1.1005, high: 1.1008, low: 1.0998, close: 1.1002 }, // Retests entry (low <= 1.1000)
        { timestamp: 2000, open: 1.1002, high: 1.1022, low: 1.1001, close: 1.1020 }, // Hits TP (high >= 1.1020)
      ];

      const outcome = evaluatePaperTradeOutcome({
        entryPrice: 1.1000,
        stopLossPrice: 1.0990,
        takeProfitPrice: 1.1020,
        targetR: 2.0,
        targetSource: '2R_FALLBACK',
        tradeDirection: 'long',
        futureCandles,
      });

      expect(outcome.status).toBe('TP');
      expect(outcome.realizedR).toBe(2.0);
      expect(outcome.filled).toBe(true);
    });

    it('reaches SL when stop loss is hit before TP or BE arming', () => {
      const futureCandles: Candle[] = [
        { timestamp: 1000, open: 1.1002, high: 1.1004, low: 1.0988, close: 1.0989 }, // Hits SL (low <= 1.0990)
      ];

      const outcome = evaluatePaperTradeOutcome({
        entryPrice: 1.1000,
        stopLossPrice: 1.0990,
        takeProfitPrice: 1.1020,
        targetR: 2.0,
        targetSource: '2R_FALLBACK',
        tradeDirection: 'long',
        futureCandles,
      });

      expect(outcome.status).toBe('SL');
      expect(outcome.realizedR).toBe(-1.0);
    });

    it('arms BE at +1R and closes at BE (0R) when price retraces to entry', () => {
      const futureCandles: Candle[] = [
        { timestamp: 1000, open: 1.1002, high: 1.1003, low: 1.0999, close: 1.1001 }, // Fill at entry
        { timestamp: 2000, open: 1.1001, high: 1.1012, low: 1.1001, close: 1.1011 }, // Touches +1R (1.1010) -> BE armed!
        { timestamp: 3000, open: 1.1011, high: 1.1012, low: 1.0998, close: 1.1000 }, // Retraces to entry (low <= 1.1000)
      ];

      const outcome = evaluatePaperTradeOutcome({
        entryPrice: 1.1000,
        stopLossPrice: 1.0990,
        takeProfitPrice: 1.1020,
        targetR: 2.0,
        targetSource: '2R_FALLBACK',
        tradeDirection: 'long',
        futureCandles,
      });

      expect(outcome.status).toBe('BE');
      expect(outcome.realizedR).toBe(0.0);
    });

    it('marks UNKNOWN when both TP and SL are touched in the exact same candle', () => {
      const futureCandles: Candle[] = [
        { timestamp: 1000, open: 1.1000, high: 1.1025, low: 1.0985, close: 1.1010 }, // Touches both TP (1.1020) and SL (1.0990)
      ];

      const outcome = evaluatePaperTradeOutcome({
        entryPrice: 1.1000,
        stopLossPrice: 1.0990,
        takeProfitPrice: 1.1020,
        targetR: 2.0,
        targetSource: '2R_FALLBACK',
        tradeDirection: 'long',
        futureCandles,
      });

      expect(outcome.status).toBe('UNKNOWN');
      expect(outcome.realizedR).toBe(0.0);
      expect(outcome.exitReason).toBe('OHLC_AMBIGUITY_SAME_CANDLE_TP_AND_SL');
    });

    it('marks EXPIRED when retest is never filled within maxWaitBars', () => {
      const futureCandles: Candle[] = [
        { timestamp: 1000, open: 1.1050, high: 1.1060, low: 1.1040, close: 1.1055 }, // Price stays far above entry (1.1000)
        { timestamp: 2000, open: 1.1055, high: 1.1065, low: 1.1045, close: 1.1050 },
      ];

      const outcome = evaluatePaperTradeOutcome({
        entryPrice: 1.1000,
        stopLossPrice: 1.0990,
        takeProfitPrice: 1.1020,
        targetR: 2.0,
        targetSource: '2R_FALLBACK',
        tradeDirection: 'long',
        futureCandles,
        maxWaitBars: 2,
      });

      expect(outcome.status).toBe('EXPIRED');
      expect(outcome.filled).toBe(false);
      expect(outcome.exitReason).toBe('UNFILLED_WAIT_EXPIRED');
    });
  });
});
