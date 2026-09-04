export interface Candle {
  timestamp: number; // unix ms
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface SwingPoint {
  type: 'high' | 'low';
  price: number;
  formedAtIndex: number;
  confirmedAtIndex: number;
  timestamp: number; // formedAtIndex'teki mumun timestamp'i
}

export interface StructureEvent {
  type: 'BOS' | 'CHoCH';
  direction: 'bullish' | 'bearish';
  brokenSwing: SwingPoint;
  breakCandleIndex: number;
  breakTimestamp: number;
  breakClosePrice: number;
}

export interface RegimeTransition {
  atIndex: number;
  newTrend: 'bullish' | 'bearish' | 'range' | 'undefined';
  windowStartIndex?: number;
}

export interface StructureState {
  currentTrend: 'bullish' | 'bearish' | 'range' | 'undefined';
  events: StructureEvent[]; // kronolojik sırayla tüm BOS/CHoCH geçmişi
  lastEvent: StructureEvent | null;
  regimeTransitions: RegimeTransition[]; // YENİ ALAN
}

export interface DisplacementLeg {
  startIndex: number;
  endIndex: number;
  direction: 'bullish' | 'bearish';
}

export interface OrderBlock {
  direction: 'bullish' | 'bearish';
  candleIndex: number;
  high: number;
  low: number;
  formedAtIndex: number;
  relatedEvent: StructureEvent;
}

export interface FVG {
  direction: 'bullish' | 'bearish';
  gapHigh: number;
  gapLow: number;
  gapSizePips: number;
  ratioToDisplacementCandle: number;
  middleCandleIndex: number;
  relatedEvent: StructureEvent;
}

export interface PremiumDiscountState {
  status: 'premium' | 'discount' | 'eq' | 'undefined';
  fibValue: number | null;
  rangeHigh: number | null;
  rangeLow: number | null;
}

export interface DisplacementQuality {
  legDirection: 'bullish' | 'bearish';
  bodyRatioScore: number;
  consecutiveScore: number;
  fvgScore: number;
  sizeScore: number;
  totalScore: number;
  quality: 'güçlü' | 'orta' | 'zayıf' | 'yok';
  gradePoints: 2 | 1 | 0 | -2;
}
