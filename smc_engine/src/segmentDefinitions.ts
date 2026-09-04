import { ValidatedLabeledSignal } from './validatedDataset';

export type SegmentKey =
  | 'grade'
  | 'session'
  | 'poiType'
  | 'signalQualityStatus'
  | 'direction'
  | 'eventType';

export interface SegmentDefinition {
  key: SegmentKey;
  label: string;
  getSegmentKey(item: ValidatedLabeledSignal): string;
}

export const SEGMENT_DEFINITIONS: readonly SegmentDefinition[] = Object.freeze([
  {
    key: 'grade',
    label: 'Grade',
    getSegmentKey: item => item.snapshot.grade.grade,
  },
  {
    key: 'session',
    label: 'Session',
    getSegmentKey: item => item.snapshot.signalQuality.marketContext.session,
  },
  {
    key: 'poiType',
    label: 'POI Type',
    getSegmentKey: item => item.snapshot.candidate.poiType,
  },
  {
    key: 'signalQualityStatus',
    label: 'Signal Quality Status',
    getSegmentKey: item => item.snapshot.signalQuality.status,
  },
  {
    key: 'direction',
    label: 'Direction',
    getSegmentKey: item => item.snapshot.candidate.tradeDirection,
  },
  {
    key: 'eventType',
    label: 'Event Type',
    getSegmentKey: item => item.snapshot.candidate.relatedEventType,
  },
]);
