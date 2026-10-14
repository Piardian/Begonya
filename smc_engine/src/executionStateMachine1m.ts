import { Candle } from './types';

export type LtfExecutionPhase =
  | 'IDLE'
  | 'WATCHING_POI_TOUCH'
  | 'POI_PENETRATED'
  | 'SWEEP_DETECTED'
  | 'DISPLACEMENT_CONFIRMED'
  | 'LIMIT_ARMED'
  | 'FILLED'
  | 'EXITED'
  | 'INVALIDATED'
  | 'EXPIRED';

export interface LtfPoiContext {
  readonly id: string;
  readonly symbol: string;
  readonly direction: 'long' | 'short';
  readonly poiType: 'OB' | 'FVG';
  readonly zoneLow: number;
  readonly zoneHigh: number;
  readonly invalidationLevel: number;
  readonly pipSize: number;
  readonly maxMonitoringBars?: number; // max 1M bars to monitor (default 60 = 1 hour)
  readonly targetRR?: number; // default 3.0R
  readonly breakEvenAtR?: number; // default 1.0R
}

export interface LtfSweepEvent {
  readonly swept: boolean;
  readonly candleIndex: number;
  readonly timestamp: number;
  readonly sweepExtremePrice: number; // lowest low for long, highest high for short
  readonly sweptLevel: number;
  readonly wickRatio: number;
}

export interface LtfDisplacementEvent {
  readonly displaced: boolean;
  readonly candleIndex: number;
  readonly timestamp: number;
  readonly chochLevel: number;
  readonly bodyRatio: number;
  readonly rangePips: number;
}

export interface LtfFvgImbalance {
  readonly fvgLow: number;
  readonly fvgHigh: number;
  readonly fvgMid: number; // 50% Consequent Encroachment (Equilibrium)
  readonly gapPips: number;
  readonly formedAtIndex: number;
}

export interface LtfOrderDetails {
  readonly entryPrice: number;
  readonly stopLoss: number;
  readonly takeProfit: number;
  readonly riskDistance: number;
  readonly riskPips: number;
  readonly targetRR: number;
  readonly sweepExtreme: number;
  readonly fvgMid: number;
}

export interface LtfMachineSnapshot {
  readonly phase: LtfExecutionPhase;
  readonly barsInMonitoring: number;
  readonly poiPenetratedIndex?: number;
  readonly sweepEvent?: LtfSweepEvent;
  readonly displacementEvent?: LtfDisplacementEvent;
  readonly fvgImbalance?: LtfFvgImbalance;
  readonly order?: LtfOrderDetails;
  readonly entryTimestamp?: number;
  readonly exitTimestamp?: number;
  readonly outcome?: 'TP' | 'SL' | 'BE' | 'EXPIRED' | 'INVALIDATED';
  readonly rrAchieved?: number;
  readonly terminationReason?: string;
}

/**
 * Institutional 1-Minute (1M) Execution State Machine.
 * 
 * Journey:
 * 1. 15M POI Touch (Penetration into zone)
 * 2. 1M Internal Liquidity Sweep (Rejection Wick / False Break)
 * 3. 1M Displacement + MSS (Market Structure Shift / CHoCH)
 * 4. 1M FVG (Fair Value Gap / Consequent Encroachment Detection)
 * 5. Sniper Limit Entry with Ultra-Tight Stop at Sweep Extreme
 */
export class LtfExecutionStateMachine {
  private phase: LtfExecutionPhase = 'IDLE';
  private candles1m: Candle[] = [];
  private context: LtfPoiContext;

  private poiPenetratedIndex = -1;
  private sweepEvent?: LtfSweepEvent;
  private displacementEvent?: LtfDisplacementEvent;
  private fvgImbalance?: LtfFvgImbalance;
  private order?: LtfOrderDetails;

  private entryTimestamp?: number;
  private exitTimestamp?: number;
  private outcome?: 'TP' | 'SL' | 'BE' | 'EXPIRED' | 'INVALIDATED';
  private rrAchieved = 0;
  private terminationReason?: string;

  private beArmed = false;
  private mfeR = 0;
  private maeR = 0;
  private holdingBars = 0;

  constructor(context: LtfPoiContext) {
    this.context = {
      ...context,
      maxMonitoringBars: context.maxMonitoringBars ?? 60,
      targetRR: context.targetRR ?? 3.0,
      breakEvenAtR: context.breakEvenAtR ?? 1.0,
    };
    this.phase = 'WATCHING_POI_TOUCH';
  }

  public getPhase(): LtfExecutionPhase {
    return this.phase;
  }

  public getSnapshot(): LtfMachineSnapshot {
    return {
      phase: this.phase,
      barsInMonitoring: this.candles1m.length,
      poiPenetratedIndex: this.poiPenetratedIndex >= 0 ? this.poiPenetratedIndex : undefined,
      sweepEvent: this.sweepEvent,
      displacementEvent: this.displacementEvent,
      fvgImbalance: this.fvgImbalance,
      order: this.order,
      entryTimestamp: this.entryTimestamp,
      exitTimestamp: this.exitTimestamp,
      outcome: this.outcome,
      rrAchieved: this.rrAchieved,
      terminationReason: this.terminationReason,
    };
  }

  /**
   * Process a new incoming closed 1M candle.
   * Strictly no future lookahead.
   */
  public processCandle(candle: Candle): LtfExecutionPhase {
    this.candles1m.push(candle);
    const cIdx = this.candles1m.length - 1;
    const isLong = this.context.direction === 'long';

    // 0. Check expiration:
    // If waiting for touch, allow reasonable swing horizon (e.g. up to 1440 bars = 24h).
    // Once POI is touched/penetrated, maxMonitoringBars strictly limits time to form 1M confirmation (e.g. 60-120 bars).
    if (
      this.phase !== 'FILLED' &&
      this.phase !== 'EXITED' &&
      this.phase !== 'INVALIDATED' &&
      this.phase !== 'EXPIRED'
    ) {
      if (this.phase === 'WATCHING_POI_TOUCH') {
        const maxWaitTouchBars = 1440; // 24 hours max wait for retest
        if (this.candles1m.length > maxWaitTouchBars) {
          this.phase = 'EXPIRED';
          this.outcome = 'EXPIRED';
          this.exitTimestamp = candle.timestamp;
          this.terminationReason = `15M POI kutusuna ${maxWaitTouchBars} bar (24 saat) boyunca geri çekilme gelmedi (Retest Yok).`;
          return this.phase;
        }
      } else {
        // Once touched, how many bars since penetration?
        const barsSinceTouch = cIdx - this.poiPenetratedIndex;
        const maxConfirmBars = this.context.maxMonitoringBars ?? 60;
        if (barsSinceTouch > maxConfirmBars) {
          this.phase = 'EXPIRED';
          this.outcome = 'EXPIRED';
          this.exitTimestamp = candle.timestamp;
          this.terminationReason = `Kutuya dokunulduktan sonra ${maxConfirmBars} bar içinde 1M teyit/CHoCH oluşmadı; işlem iptal edildi.`;
          return this.phase;
        }
      }
    }

    // 1. Phase: WATCHING_POI_TOUCH
    if (this.phase === 'WATCHING_POI_TOUCH') {
      const touched = isLong
        ? candle.low <= this.context.zoneHigh && candle.high >= this.context.zoneLow
        : candle.high >= this.context.zoneLow && candle.low <= this.context.zoneHigh;

      const breached = isLong
        ? candle.close < this.context.invalidationLevel
        : candle.close > this.context.invalidationLevel;

      if (breached) {
        this.phase = 'INVALIDATED';
        this.outcome = 'INVALIDATED';
        this.exitTimestamp = candle.timestamp;
        this.terminationReason = '15M POI bölgesi test edilmeden doğrudan delindi (Zone Invalidation).';
        return this.phase;
      }

      if (touched) {
        this.phase = 'POI_PENETRATED';
        this.poiPenetratedIndex = cIdx;
      }
      return this.phase;
    }

    // 2. Phase: POI_PENETRATED -> Looking for 1M Sweep
    if (this.phase === 'POI_PENETRATED') {
      // Invalidation check: did price blast right through the 15M zone?
      const breached = isLong
        ? candle.close < this.context.invalidationLevel
        : candle.close > this.context.invalidationLevel;

      if (breached) {
        this.phase = 'INVALIDATED';
        this.outcome = 'INVALIDATED';
        this.exitTimestamp = candle.timestamp;
        this.terminationReason = '15M POI içinde 1M teyidi beklenirken bölge aşağı/yukarı delindi.';
        return this.phase;
      }

      const sweep = this.evaluate1mSweep(cIdx);
      if (sweep && sweep.swept) {
        this.sweepEvent = sweep;
        this.phase = 'SWEEP_DETECTED';
      }
      return this.phase;
    }

    // 3. Phase: SWEEP_DETECTED -> Looking for 1M Displacement & CHoCH
    if (this.phase === 'SWEEP_DETECTED') {
      // Did price violate the sweep extreme? If so, the sweep failed!
      if (this.sweepEvent) {
        const sweepViolated = isLong
          ? candle.close < this.sweepEvent.sweepExtremePrice
          : candle.close > this.sweepEvent.sweepExtremePrice;

        if (sweepViolated) {
          // Reset back to POI_PENETRATED to look for a deeper sweep, unless zone invalidation hit
          const zoneBreached = isLong
            ? candle.close < this.context.invalidationLevel
            : candle.close > this.context.invalidationLevel;

          if (zoneBreached) {
            this.phase = 'INVALIDATED';
            this.outcome = 'INVALIDATED';
            this.terminationReason = 'Sweep ekstrem seviyesi ve 15M tabanı delindi.';
            return this.phase;
          }
          this.phase = 'POI_PENETRATED';
          this.sweepEvent = undefined;
          return this.phase;
        }
      }

      // Check for displacement
      const displacement = this.evaluate1mDisplacement(cIdx);
      if (displacement && displacement.displaced) {
        this.displacementEvent = displacement;
        this.phase = 'DISPLACEMENT_CONFIRMED';

        // Immediately identify FVG from the displacement candle
        const fvg = this.evaluate1mFvg(cIdx);
        if (fvg) {
          this.fvgImbalance = fvg;
          this.order = this.buildLtfOrder(fvg, this.sweepEvent!.sweepExtremePrice);
          this.phase = 'LIMIT_ARMED';
        }
      }
      return this.phase;
    }

    // 4. Phase: LIMIT_ARMED -> Waiting for 1M Retest into FVG
    if (this.phase === 'LIMIT_ARMED') {
      if (!this.order) return this.phase;

      // Invalidation before fill: Did price run beyond stop before entry?
      const stopHitBeforeFill = isLong
        ? candle.low <= this.order.stopLoss
        : candle.high >= this.order.stopLoss;

      if (stopHitBeforeFill) {
        this.phase = 'INVALIDATED';
        this.outcome = 'INVALIDATED';
        this.exitTimestamp = candle.timestamp;
        this.terminationReason = '1M FVG retesti vermeden önce sweep stop seviyesi delindi.';
        return this.phase;
      }

      // Retest fill check:
      // For Long: candle.low <= order.entryPrice
      // For Short: candle.high >= order.entryPrice
      const filled = isLong
        ? candle.low <= this.order.entryPrice
        : candle.high >= this.order.entryPrice;

      if (filled) {
        this.phase = 'FILLED';
        this.entryTimestamp = candle.timestamp;

        // Check if exit occurred on the exact same entry candle
        const hitSL = isLong ? candle.low <= this.order.stopLoss : candle.high >= this.order.stopLoss;
        const hitTP = isLong ? candle.high >= this.order.takeProfit : candle.low <= this.order.takeProfit;

        if (hitSL && hitTP) {
          this.phase = 'EXITED';
          this.outcome = 'SL';
          this.rrAchieved = -1.0;
          this.exitTimestamp = candle.timestamp;
          this.terminationReason = 'Giriş mumu içinde hem TP hem SL görüldü; konservatif SL (-1.0R).';
          return this.phase;
        }

        if (hitTP) {
          this.phase = 'EXITED';
          this.outcome = 'TP';
          this.rrAchieved = this.order.targetRR;
          this.exitTimestamp = candle.timestamp;
          this.terminationReason = `1M giriş mumunda doğrudan +${this.order.targetRR}R Take Profit vuruldu.`;
          return this.phase;
        }

        if (hitSL) {
          this.phase = 'EXITED';
          this.outcome = 'SL';
          this.rrAchieved = -1.0;
          this.exitTimestamp = candle.timestamp;
          this.terminationReason = '1M giriş mumunda sweep stop seviyesi kırıldı (-1.0R).';
          return this.phase;
        }
      }
      return this.phase;
    }

    // 5. Phase: FILLED -> Managing Live Position
    if (this.phase === 'FILLED') {
      if (!this.order) return this.phase;
      this.holdingBars++;

      const favorable = isLong
        ? Math.max(0, candle.high - this.order.entryPrice)
        : Math.max(0, this.order.entryPrice - candle.low);
      const adverse = isLong
        ? Math.max(0, this.order.entryPrice - candle.low)
        : Math.max(0, candle.high - this.order.entryPrice);

      const currentMfe = favorable / this.order.riskDistance;
      const currentMae = adverse / this.order.riskDistance;
      this.mfeR = Math.max(this.mfeR, currentMfe);
      this.maeR = Math.max(this.maeR, currentMae);

      // Arm Break-Even at +1.0R
      if (!this.beArmed && currentMfe >= (this.context.breakEvenAtR ?? 1.0)) {
        this.beArmed = true;
      }

      const activeSL = this.beArmed ? this.order.entryPrice : this.order.stopLoss;
      const hitsTP = isLong ? candle.high >= this.order.takeProfit : candle.low <= this.order.takeProfit;
      const hitsSL = isLong ? candle.low <= activeSL : candle.high >= activeSL;

      if (hitsTP && hitsSL) {
        if (isLong && candle.close >= this.order.takeProfit && candle.open >= activeSL) {
          this.phase = 'EXITED';
          this.outcome = 'TP';
          this.rrAchieved = this.order.targetRR;
          this.exitTimestamp = candle.timestamp;
          this.terminationReason = `1M Sniper Girişi: +${this.order.targetRR.toFixed(1)}R Take Profit tamamlandı!`;
          return this.phase;
        }
        if (!isLong && candle.close <= this.order.takeProfit && candle.open <= activeSL) {
          this.phase = 'EXITED';
          this.outcome = 'TP';
          this.rrAchieved = this.order.targetRR;
          this.exitTimestamp = candle.timestamp;
          this.terminationReason = `1M Sniper Girişi: +${this.order.targetRR.toFixed(1)}R Take Profit tamamlandı!`;
          return this.phase;
        }

        this.phase = 'EXITED';
        this.outcome = this.beArmed ? 'BE' : 'SL';
        this.rrAchieved = this.beArmed ? 0.0 : -1.0;
        this.exitTimestamp = candle.timestamp;
        this.terminationReason = this.beArmed ? 'BE koruması tetiklendi.' : 'Konservatif SL uygulandı.';
        return this.phase;
      }

      if (hitsTP) {
        this.phase = 'EXITED';
        this.outcome = 'TP';
        this.rrAchieved = this.order.targetRR;
        this.exitTimestamp = candle.timestamp;
        this.terminationReason = `1M Sniper Girişi: +${this.order.targetRR.toFixed(1)}R Take Profit tamamlandı!`;
        return this.phase;
      }

      if (hitsSL) {
        this.phase = 'EXITED';
        this.outcome = this.beArmed ? 'BE' : 'SL';
        this.rrAchieved = this.beArmed ? 0.0 : -1.0;
        this.exitTimestamp = candle.timestamp;
        this.terminationReason = this.beArmed
          ? 'Kâr gördükten sonra başabaş (BE) seviyesine döndü (0.0R).'
          : '1M Stop Loss seviyesi tetiklendi (-1.0R).';
        return this.phase;
      }

      // Max holding timeout: 120 bars (2 hours)
      if (this.holdingBars >= 120) {
        this.phase = 'EXITED';
        this.outcome = this.beArmed ? 'BE' : 'EXPIRED';
        this.exitTimestamp = candle.timestamp;
        const currentDiff = isLong ? candle.close - this.order.entryPrice : this.order.entryPrice - candle.close;
        this.rrAchieved = Math.round((currentDiff / this.order.riskDistance) * 100) / 100;
        this.terminationReason = 'Maksimum 1M pozisyon taşıma süresi (120 bar) doldu.';
        return this.phase;
      }
    }

    return this.phase;
  }

  // =========================================================================
  // Helper Detectors: Sweep, Displacement, FVG
  // =========================================================================

  private evaluate1mSweep(currentIdx: number): LtfSweepEvent | null {
    if (this.poiPenetratedIndex < 0 || currentIdx < this.poiPenetratedIndex + 2) {
      return null;
    }

    const isLong = this.context.direction === 'long';
    const c = this.candles1m[currentIdx];
    const range = c.high - c.low;
    if (range <= 0) return null;

    // Lookback window: from POI penetration to current bar
    const windowStart = Math.max(0, this.poiPenetratedIndex);
    const priorBars = this.candles1m.slice(windowStart, currentIdx);
    if (priorBars.length < 2) return null;

    if (isLong) {
      const priorLow = Math.min(...priorBars.map(b => b.low));
      // Sweep Low: candle pierced below priorLow
      if (c.low < priorLow) {
        const lowerWick = Math.min(c.open, c.close) - c.low;
        const wickRatio = lowerWick / range;
        // Strong rejection wick (>= 30% of range) OR closed back above priorLow
        if (wickRatio >= 0.30 || c.close >= priorLow) {
          return {
            swept: true,
            candleIndex: currentIdx,
            timestamp: c.timestamp,
            sweepExtremePrice: c.low,
            sweptLevel: priorLow,
            wickRatio,
          };
        }
      }
    } else {
      const priorHigh = Math.max(...priorBars.map(b => b.high));
      // Sweep High: candle pierced above priorHigh
      if (c.high > priorHigh) {
        const upperWick = c.high - Math.max(c.open, c.close);
        const wickRatio = upperWick / range;
        // Strong rejection wick (>= 30% of range) OR closed back below priorHigh
        if (wickRatio >= 0.30 || c.close <= priorHigh) {
          return {
            swept: true,
            candleIndex: currentIdx,
            timestamp: c.timestamp,
            sweepExtremePrice: c.high,
            sweptLevel: priorHigh,
            wickRatio,
          };
        }
      }
    }

    return null;
  }

  private evaluate1mDisplacement(currentIdx: number): LtfDisplacementEvent | null {
    if (!this.sweepEvent) return null;
    const sweepIdx = this.sweepEvent.candleIndex;

    // Must happen within 1 to 6 bars after sweep
    if (currentIdx <= sweepIdx || currentIdx > sweepIdx + 6) {
      return null;
    }

    const isLong = this.context.direction === 'long';
    const c = this.candles1m[currentIdx];
    const range = c.high - c.low;
    if (range <= 0) return null;

    const body = Math.abs(c.close - c.open);
    const bodyRatio = body / range;

    // Body must be dominant (>= 50% of candle range)
    if (bodyRatio < 0.50) return null;

    // Identify internal CHoCH level: swing points formed inside POI before the sweep
    let searchBars: Candle[] = [];
    if (this.poiPenetratedIndex >= 0 && sweepIdx > this.poiPenetratedIndex) {
      searchBars = this.candles1m.slice(this.poiPenetratedIndex + 1, sweepIdx);
    }
    if (searchBars.length === 0) {
      searchBars = this.candles1m.slice(Math.max(0, sweepIdx - 2), sweepIdx);
    }
    if (searchBars.length === 0) return null;

    if (isLong) {
      if (c.close <= c.open) return null; // Must be bullish
      const chochLevel = Math.max(...searchBars.map(b => b.high));
      if (c.close > chochLevel) {
        return {
          displaced: true,
          candleIndex: currentIdx,
          timestamp: c.timestamp,
          chochLevel,
          bodyRatio,
          rangePips: range / this.context.pipSize,
        };
      }
    } else {
      if (c.close >= c.open) return null; // Must be bearish
      const chochLevel = Math.min(...searchBars.map(b => b.low));
      if (c.close < chochLevel) {
        return {
          displaced: true,
          candleIndex: currentIdx,
          timestamp: c.timestamp,
          chochLevel,
          bodyRatio,
          rangePips: range / this.context.pipSize,
        };
      }
    }

    return null;
  }

  private evaluate1mFvg(displacementIdx: number): LtfFvgImbalance | null {
    if (displacementIdx < 2 || displacementIdx >= this.candles1m.length) {
      return null;
    }

    const isLong = this.context.direction === 'long';
    const c1 = this.candles1m[displacementIdx - 2];
    const c2 = this.candles1m[displacementIdx - 1];
    const c3 = this.candles1m[displacementIdx];

    if (isLong) {
      // Classic 3-bar Bullish FVG: c3.low > c1.high
      if (c3.low > c1.high) {
        const gapPips = (c3.low - c1.high) / this.context.pipSize;
        return {
          fvgLow: c1.high,
          fvgHigh: c3.low,
          fvgMid: (c1.high + c3.low) * 0.5,
          gapPips,
          formedAtIndex: displacementIdx,
        };
      }

      // Fallback: 50% retracement of the displacement candle body
      const dispBodyLow = Math.min(c3.open, c3.close);
      const dispBodyHigh = Math.max(c3.open, c3.close);
      const mid = dispBodyLow + (dispBodyHigh - dispBodyLow) * 0.5;
      return {
        fvgLow: dispBodyLow,
        fvgHigh: mid,
        fvgMid: (dispBodyLow + mid) * 0.5,
        gapPips: (dispBodyHigh - dispBodyLow) / this.context.pipSize,
        formedAtIndex: displacementIdx,
      };
    } else {
      // Classic 3-bar Bearish FVG: c3.high < c1.low
      if (c3.high < c1.low) {
        const gapPips = (c1.low - c3.high) / this.context.pipSize;
        return {
          fvgLow: c3.high,
          fvgHigh: c1.low,
          fvgMid: (c1.low + c3.high) * 0.5,
          gapPips,
          formedAtIndex: displacementIdx,
        };
      }

      // Fallback: 50% retracement of the displacement candle body
      const dispBodyLow = Math.min(c3.open, c3.close);
      const dispBodyHigh = Math.max(c3.open, c3.close);
      const mid = dispBodyLow + (dispBodyHigh - dispBodyLow) * 0.5;
      return {
        fvgLow: mid,
        fvgHigh: dispBodyHigh,
        fvgMid: (mid + dispBodyHigh) * 0.5,
        gapPips: (dispBodyHigh - dispBodyLow) / this.context.pipSize,
        formedAtIndex: displacementIdx,
      };
    }
  }

  private buildLtfOrder(
    fvg: LtfFvgImbalance,
    sweepExtremePrice: number
  ): LtfOrderDetails {
    const isLong = this.context.direction === 'long';
    const pip = this.context.pipSize;
    const targetRR = this.context.targetRR ?? 3.0;

    // Sniper Entry: %50 Consequent Encroachment (fvgMid)
    const entryPrice = fvg.fvgMid;

    // Stop Loss: 1.5 pip beyond the exact 1M sweep wick extreme
    const buffer = 1.5 * pip;
    const stopLoss = isLong
      ? sweepExtremePrice - buffer
      : sweepExtremePrice + buffer;

    const riskDistance = Math.abs(entryPrice - stopLoss);
    const riskPips = riskDistance / pip;

    const takeProfit = isLong
      ? entryPrice + riskDistance * targetRR
      : entryPrice - riskDistance * targetRR;

    return {
      entryPrice: Math.round(entryPrice * 100000) / 100000,
      stopLoss: Math.round(stopLoss * 100000) / 100000,
      takeProfit: Math.round(takeProfit * 100000) / 100000,
      riskDistance: Math.round(riskDistance * 100000) / 100000,
      riskPips: Math.round(riskPips * 10) / 10,
      targetRR,
      sweepExtreme: sweepExtremePrice,
      fvgMid: fvg.fvgMid,
    };
  }
}
