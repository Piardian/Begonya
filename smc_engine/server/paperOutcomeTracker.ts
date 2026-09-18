import * as fs from 'fs';
import * as path from 'path';
import { JsonlEvidenceStore } from './evidenceStore';
import type { NotificationCandidate } from './pipeline';
import type { StoredCandle } from './candleStore';
import type { FVG, OrderBlock } from '../src/types';
import type { LiquidityMagnet } from '../src/liquidityMagnetDetector';
import type { OpposingObstacle } from '../src/opposingObstacleDetector';
import { getPipSize } from '../src/assetMetrics';

export type PaperOutcomeType = 'TP' | 'SL' | 'BE' | 'EXPIRED' | 'UNKNOWN';
type Direction = NotificationCandidate['tradeDirection'];
type TargetSource = 'LIQUIDITY_MAGNET' | 'OPPOSING_OBSTACLE' | 'RR_FALLBACK';

export interface TrackedSignal {
  signalId: string; symbol: string; direction: Direction; signalTimestamp: number;
  zoneLow: number; zoneHigh: number; entryPrice: number | null; stopLoss: number | null;
  takeProfit: number | null; riskDistance: number | null; entryTriggeredAt: number | null;
  lastProcessedCandleTimestamp: number; beArmed: boolean;
  maximumFavorableExcursion: number; maximumAdverseExcursion: number;
  status: 'WAITING_ENTRY' | 'OPEN' | 'CLOSED'; outcome?: PaperOutcomeType;
  exitTimestamp?: number; exitReason?: string; targetSource?: TargetSource;
}

interface TrackerState { version: 1; signals: Record<string, TrackedSignal>; }

export interface PaperOutcomeTrackerConfig {
  readonly entryExpiryMs: number; readonly maxHoldBars: number; readonly riskReward: number;
  readonly breakEvenAtR: number; readonly stopBufferPips: number;
}
const DEFAULT_CONFIG: PaperOutcomeTrackerConfig = Object.freeze({
  entryExpiryMs: 48 * 60 * 60 * 1000, maxHoldBars: 96, riskReward: 2, breakEvenAtR: 1, stopBufferPips: 2,
});

export class PaperOutcomeTracker {
  private readonly config: PaperOutcomeTrackerConfig;
  private readonly statePath: string; private readonly evidenceStore: JsonlEvidenceStore;
  private state: TrackerState;
  constructor(options?: { readonly statePath?: string; readonly evidenceStore?: JsonlEvidenceStore; readonly config?: Partial<PaperOutcomeTrackerConfig> }) {
    this.config = Object.freeze({ ...DEFAULT_CONFIG, ...(options?.config ?? {}) });
    this.statePath = options?.statePath ?? process.env.OUTCOME_LEDGER_PATH ?? path.join(process.env.EVIDENCE_DIRECTORY ?? 'evidence', 'outcomes', 'outcome-ledger.json');
    this.evidenceStore = options?.evidenceStore ?? new JsonlEvidenceStore(); this.state = this.loadState();
  }

  registerCandidate(candidate: NotificationCandidate): void {
    const signalId = candidate.signalId ?? candidate.uniqueKey; if (this.state.signals[signalId]) return;
    const poi = candidate.poi as OrderBlock | FVG;
    const zone = candidate.poiType === 'OB' ? { low: (poi as OrderBlock).low, high: (poi as OrderBlock).high } : { low: (poi as FVG).gapLow, high: (poi as FVG).gapHigh };
    const signalTimestamp = candidate.marketDataTimestamp ?? candidate.signalContext?.timestamp ?? Date.now();
    const target = resolveTarget(candidate, zone);
    this.state.signals[signalId] = {
      signalId, symbol: candidate.symbol, direction: candidate.tradeDirection, signalTimestamp,
      zoneLow: zone.low, zoneHigh: zone.high, entryPrice: null, stopLoss: null, takeProfit: null,
      riskDistance: null, entryTriggeredAt: null, lastProcessedCandleTimestamp: signalTimestamp,
      beArmed: false, maximumFavorableExcursion: 0, maximumAdverseExcursion: 0, status: 'WAITING_ENTRY',
      takeProfit: target.price, targetSource: target.source,
    };
    this.persist();
  }

  update(symbol: string, candles: readonly StoredCandle[]): void {
    if (!candles.length) return; let changed = false;
    for (const signal of Object.values(this.state.signals)) {
      if (signal.symbol !== symbol || signal.status === 'CLOSED') continue;
      const newCandles = candles.filter(c => c.timestamp > signal.lastProcessedCandleTimestamp).sort((a,b)=>a.timestamp-b.timestamp);
      for (const candle of newCandles) {
        const result = this.processCandle(signal, candle);
        signal.lastProcessedCandleTimestamp = Math.max(signal.lastProcessedCandleTimestamp, candle.timestamp);
        changed = changed || result.changed; if (result.closed) break;
      }
    }
    if (changed) this.persist();
  }
  get(signalId: string): TrackedSignal | undefined { return this.state.signals[signalId]; }
  listOpen(): readonly TrackedSignal[] { return Object.freeze(Object.values(this.state.signals).filter(s => s.status !== 'CLOSED')); }

  private processCandle(signal: TrackedSignal, candle: StoredCandle): { changed: boolean; closed: boolean } {
    if (signal.status === 'WAITING_ENTRY') {
      if (candle.timestamp - signal.signalTimestamp >= this.config.entryExpiryMs) {
        this.close(signal,'EXPIRED',candle.timestamp,'Entry zone was not triggered before the configured entry window expired.');
        return {changed:true,closed:true};
      }
      if (!touchesZone(candle,signal.zoneLow,signal.zoneHigh)) return {changed:false,closed:false};
      const entryPrice = resolveEntryPrice(signal.direction,signal.zoneLow,signal.zoneHigh,candle.open);
      const buffer = this.config.stopBufferPips * getPipSize(signal.symbol);
      const stopLoss = signal.direction === 'long' ? signal.zoneLow-buffer : signal.zoneHigh+buffer;
      const riskDistance = Math.abs(entryPrice-stopLoss);
      if (!Number.isFinite(riskDistance) || riskDistance <= 0) {
        this.close(signal,'UNKNOWN',candle.timestamp,'Invalid synthetic risk distance prevented deterministic outcome calculation.');
        return {changed:true,closed:true};
      }
      if (signal.takeProfit === null) signal.takeProfit = signal.direction === 'long' ? entryPrice + riskDistance*this.config.riskReward : entryPrice - riskDistance*this.config.riskReward;
      const targetIsInvalid = signal.direction === 'long' ? signal.takeProfit <= entryPrice : signal.takeProfit >= entryPrice;
      if (targetIsInvalid) {
        this.close(signal,'UNKNOWN',candle.timestamp,'No valid favorable target was available from the liquidity/obstacle model.');
        return {changed:true,closed:true};
      }
      signal.entryPrice=entryPrice; signal.stopLoss=stopLoss; signal.riskDistance=riskDistance; signal.entryTriggeredAt=candle.timestamp; signal.status='OPEN';
      const exit=evaluateOpenCandle(signal,candle,true,this.config);
      if(exit){this.close(signal,exit.type,candle.timestamp,exit.reason);return {changed:true,closed:true};}
      return {changed:true,closed:false};
    }
    if (signal.status !== 'OPEN' || signal.entryPrice === null || signal.stopLoss === null || signal.takeProfit === null || signal.riskDistance === null) return {changed:false,closed:false};
    const favorable=signal.direction==='long'?Math.max(0,candle.high-signal.entryPrice):Math.max(0,signal.entryPrice-candle.low);
    const adverse=signal.direction==='long'?Math.max(0,signal.entryPrice-candle.low):Math.max(0,candle.high-signal.entryPrice);
    signal.maximumFavorableExcursion=Math.max(signal.maximumFavorableExcursion,favorable/signal.riskDistance);
    signal.maximumAdverseExcursion=Math.max(signal.maximumAdverseExcursion,adverse/signal.riskDistance);
    if(!signal.beArmed && favorable >= signal.riskDistance*this.config.breakEvenAtR) signal.beArmed=true;
    const exit=evaluateOpenCandle(signal,candle,false,this.config);
    if(exit){this.close(signal,exit.type,candle.timestamp,exit.reason);return {changed:true,closed:true};}
    const maxHoldMs=this.config.maxHoldBars*15*60*1000;
    if(signal.entryTriggeredAt!==null && candle.timestamp-signal.entryTriggeredAt>=maxHoldMs){
      this.close(signal,'EXPIRED',candle.timestamp,'Maximum configured holding period elapsed before TP, SL or BE.');
      return {changed:true,closed:true};
    }
    return {changed:true,closed:false};
  }

  private close(signal:TrackedSignal,outcome:PaperOutcomeType,timestamp:number,reason:string):void{
    signal.status='CLOSED'; signal.outcome=outcome; signal.exitTimestamp=timestamp; signal.exitReason=reason;
    const rrAchieved=outcome==='TP'?(signal.riskDistance && signal.entryPrice!==null && signal.takeProfit!==null ? Math.abs(signal.takeProfit-signal.entryPrice)/signal.riskDistance : this.config.riskReward):outcome==='SL'?-1:outcome==='BE'?0:null;
    const holdingTimeMs=signal.entryTriggeredAt===null?null:Math.max(0,timestamp-signal.entryTriggeredAt);
    void this.evidenceStore.appendOutcomeEvidence({evidenceSchemaVersion:1,signalId:signal.signalId,appendedAt:new Date(timestamp).toISOString(),outcome:{type:outcome,holdingTimeMs,rrAchieved,maximumFavorableExcursion:signal.maximumFavorableExcursion,maximumAdverseExcursion:signal.maximumAdverseExcursion,exitTimestamp:timestamp,exitReason:reason}}).catch(error=>console.warn(`[PaperOutcomeTracker] Outcome evidence write failed for ${signal.signalId}:`,error));
  }
  private loadState():TrackerState{try{const parsed=JSON.parse(fs.readFileSync(this.statePath,'utf8')) as TrackerState;if(parsed.version===1&&parsed.signals&&typeof parsed.signals==='object')return parsed;}catch{}return {version:1,signals:{}};}
  private persist():void{const dir=path.dirname(this.statePath);fs.mkdirSync(dir,{recursive:true});const temp=`${this.statePath}.${process.pid}.${Date.now()}.tmp`;fs.writeFileSync(temp,JSON.stringify(this.state,null,2),'utf8');try{fs.renameSync(temp,this.statePath);}catch{fs.copyFileSync(temp,this.statePath);try{fs.unlinkSync(temp);}catch{}}}
}

function resolveTarget(candidate: NotificationCandidate, zone:{low:number;high:number}): {price:number|null;source:TargetSource}{
  const direction=candidate.tradeDirection; const entryReference=direction==='long'?zone.high:zone.low;
  const favorableTargets:number[]=[];
  const liquidity=candidate.liquidityMagnet;
  if(liquidity?.isActive){
    const favorable=direction==='long'?liquidity.priceLevel>entryReference:liquidity.priceLevel<entryReference;
    if(favorable) favorableTargets.push(liquidity.priceLevel);
  }
  const obstacle=candidate.opposingObstacle;
  if(obstacle?.hasObstacle && obstacle.level){
    const obstacleTarget=direction==='long'?obstacle.level.low:obstacle.level.high;
    const favorable=direction==='long'?obstacleTarget>entryReference:obstacleTarget<entryReference;
    if(favorable) favorableTargets.push(obstacleTarget);
  }
  if(!favorableTargets.length) return {price:null,source:'RR_FALLBACK'};
  const price=direction==='long'?Math.min(...favorableTargets):Math.max(...favorableTargets);
  const source = liquidity?.isActive && Math.abs(liquidity.priceLevel-price)<Number.EPSILON ? 'LIQUIDITY_MAGNET'
    : obstacle?.hasObstacle ? 'OPPOSING_OBSTACLE' : 'RR_FALLBACK';
  return {price,source};
}

function touchesZone(candle:StoredCandle,zoneLow:number,zoneHigh:number):boolean{return candle.high>=zoneLow&&candle.low<=zoneHigh;}
function resolveEntryPrice(direction:Direction,zoneLow:number,zoneHigh:number,candleOpen:number):number{
  if(direction==='long'){if(candleOpen>zoneHigh)return zoneHigh;if(candleOpen<zoneLow)return zoneLow;}else{if(candleOpen<zoneLow)return zoneLow;if(candleOpen>zoneHigh)return zoneHigh;}
  return (zoneLow+zoneHigh)/2;
}
function evaluateOpenCandle(signal:TrackedSignal,candle:StoredCandle,entryCandle:boolean,config:PaperOutcomeTrackerConfig):{type:PaperOutcomeType;reason:string}|null{
  if(signal.entryPrice===null||signal.stopLoss===null||signal.takeProfit===null)return null;
  const hitsTP=signal.direction==='long'?candle.high>=signal.takeProfit:candle.low<=signal.takeProfit;
  const hitsSL=signal.direction==='long'?candle.low<=signal.stopLoss:candle.high>=signal.stopLoss;
  const hitsBE=signal.beArmed&&(signal.direction==='long'?candle.low<=signal.entryPrice:candle.high>=signal.entryPrice);
  if(hitsTP&&hitsSL)return {type:'UNKNOWN',reason:'TP and SL were both inside the same OHLC candle; execution order is unknowable from candle data alone.'};
  if(hitsTP)return {type:'TP',reason:`Take-profit reached via ${signal.targetSource ?? 'configured target'} target.`};
  if(hitsSL)return {type:signal.beArmed?'BE':'SL',reason:signal.beArmed?'Break-even stop was hit after the BE threshold was armed.':'Stop-loss reached before break-even activation.'};
  if(hitsBE&&!entryCandle)return {type:'BE',reason:'Break-even threshold was armed and price returned to the synthetic entry.'};
  return null;
}
export const paperOutcomeTracker=new PaperOutcomeTracker();
