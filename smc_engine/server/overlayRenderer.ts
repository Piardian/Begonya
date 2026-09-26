import { createCanvas, loadImage } from 'canvas';
import { PRESENTATION_DESIGN_TOKENS } from '../src/presentationDesignSystem';
import { recordRuntimeTrace } from './runtimeTrace';

export interface OverlayPlotArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ChartMetadata {
  imageWidth: number;
  imageHeight: number;
  timeframe: string;
  firstVisibleLogical: number;
  lastVisibleLogical: number;
  visiblePriceRange: {
    min: number;
    max: number;
  };
  plotLeft: number;
  plotTop: number;
  plotWidth: number;
  plotHeight: number;
  devicePixelRatio: number;
  rightPriceScaleWidth: number;
  barSpacing: number;
  timeScaleWidth: number;
}

export interface OrderBlockOverlay {
  type: 'orderBlock';
  startIndex: number;
  endIndex: number;
  high: number;
  low: number;
  direction: 'bullish' | 'bearish';
  label?: string;
}

export interface FvgOverlay {
  type: 'fvg';
  startIndex: number;
  endIndex: number;
  high: number;
  low: number;
  direction: 'bullish' | 'bearish';
  label?: string;
}

export interface BosArrowOverlay {
  type: 'bosArrow';
  index: number;
  price: number;
  direction: 'bullish' | 'bearish';
  label?: string;
}

export interface TextLabelOverlay {
  type: 'label';
  index: number;
  price: number;
  text: string;
}

export interface PriceLineOverlay {
  type: 'priceLine';
  price: number;
  color: string;
  label?: string;
  dashed?: boolean;
}

export interface PremiumDiscountOverlay {
  type: 'premiumDiscount';
  min: number;
  max: number;
  equilibrium: number;
}

export type OverlayAnnotation =
  | OrderBlockOverlay
  | FvgOverlay
  | BosArrowOverlay
  | TextLabelOverlay
  | PriceLineOverlay
  | PremiumDiscountOverlay;

export interface OverlayRenderInput {
  screenshotPng: Buffer;
  metadata: ChartMetadata;
  annotations: OverlayAnnotation[];
}

interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

type LabelTier = 'primary' | 'secondary' | 'context';

export function mapBarIndexToX(index: number, metadata: ChartMetadata): number {
  const denominator = Math.max(1, metadata.lastVisibleLogical - metadata.firstVisibleLogical + 1);
  const ratio = (index - metadata.firstVisibleLogical + 0.5) / denominator;
  return metadata.plotLeft + ratio * metadata.plotWidth;
}

export function mapBarLeftToX(index: number, metadata: ChartMetadata): number {
  const denominator = Math.max(1, metadata.lastVisibleLogical - metadata.firstVisibleLogical + 1);
  const ratio = (index - metadata.firstVisibleLogical) / denominator;
  return metadata.plotLeft + ratio * metadata.plotWidth;
}

export function mapBarRightToX(index: number, metadata: ChartMetadata): number {
  const denominator = Math.max(1, metadata.lastVisibleLogical - metadata.firstVisibleLogical + 1);
  const ratio = (index - metadata.firstVisibleLogical + 1) / denominator;
  return metadata.plotLeft + ratio * metadata.plotWidth;
}

export function mapPriceToY(price: number, metadata: ChartMetadata): number {
  const priceRange = metadata.visiblePriceRange.max - metadata.visiblePriceRange.min;
  if (priceRange <= 0) {
    return metadata.plotTop + metadata.plotHeight / 2;
  }

  const ratio = (price - metadata.visiblePriceRange.min) / priceRange;
  return metadata.plotTop + metadata.plotHeight - ratio * metadata.plotHeight;
}

export async function renderOverlay(input: OverlayRenderInput): Promise<Buffer> {
  const image = await loadImage(input.screenshotPng);
  const canvas = createCanvas(input.metadata.imageWidth, input.metadata.imageHeight);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(image, 0, 0, input.metadata.imageWidth, input.metadata.imageHeight);

  const drawOrder: Record<OverlayAnnotation['type'], number> = {
    premiumDiscount: 0,
    priceLine: 1,
    fvg: 2,
    orderBlock: 3,
    bosArrow: 4,
    label: 5,
  };
  const occupiedLabels: LabelBox[] = [];

  // Reserve HUD header space first if a label annotation is present so background labels stay below it
  const sortedAnnotations = [...input.annotations].sort((a, b) => drawOrder[a.type] - drawOrder[b.type]);
  const headerAnnotations = sortedAnnotations.filter((a): a is TextLabelOverlay => a.type === 'label');
  const bodyAnnotations = sortedAnnotations.filter(a => a.type !== 'label');

  for (const header of headerAnnotations) {
    drawLabel(ctx, input.metadata, header, occupiedLabels);
  }

  for (const annotation of bodyAnnotations) {
    switch (annotation.type) {
      case 'orderBlock':
        drawOrderBlock(ctx, input.metadata, annotation, occupiedLabels);
        break;
      case 'fvg':
        drawFvg(ctx, input.metadata, annotation, occupiedLabels);
        break;
      case 'bosArrow':
        drawBosArrow(ctx, input.metadata, annotation, occupiedLabels);
        break;
      case 'priceLine':
        drawPriceLine(ctx, input.metadata, annotation, occupiedLabels);
        break;
      case 'premiumDiscount':
        drawPremiumDiscount(ctx, input.metadata, annotation, occupiedLabels);
        break;
    }
  }

  const buffer = canvas.toBuffer('image/png');
  recordRuntimeTrace({
    signalId: 'unknown',
    file: 'server/overlayRenderer.ts',
    functionName: 'renderOverlay',
    timestamp: new Date().toISOString(),
    input: {
      annotationCount: input.annotations.length,
      imageWidth: input.metadata.imageWidth,
      imageHeight: input.metadata.imageHeight,
      timeframe: input.metadata.timeframe,
    },
    output: {
      imageBytes: buffer.length,
    },
  });
  return buffer;
}

function drawPriceLine(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  metadata: ChartMetadata,
  annotation: PriceLineOverlay,
  occupiedLabels: LabelBox[]
): void {
  const y = mapPriceToY(annotation.price, metadata);
  if (y < metadata.plotTop || y > metadata.plotTop + metadata.plotHeight) return;

  const label = annotation.label;
  const isEntryTop = label === 'GİRİŞ ÜST' || label === 'GİRİŞ BÖLGESİ';
  const isEntryBottom = label === 'GİRİŞ ALT';
  const isCurrentPrice = label === 'ANLIK FİYAT';

  ctx.save();
  ctx.strokeStyle = annotation.color;
  ctx.globalAlpha = isCurrentPrice ? 0.85 : 0.65;
  ctx.lineWidth = isCurrentPrice ? 1.2 : 1.0;
  ctx.setLineDash(annotation.dashed || isEntryTop || isEntryBottom ? [5, 4] : []);
  ctx.beginPath();
  ctx.moveTo(metadata.plotLeft, y);
  ctx.lineTo(metadata.plotLeft + metadata.plotWidth, y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  if (label) {
    const preferDirection: 'up' | 'down' | 'auto' = isEntryBottom
      ? 'down'
      : isEntryTop
        ? 'up'
        : 'auto';
    const anchorAlign: 'left' | 'center' | 'right' = isCurrentPrice
      ? 'left'
      : (isEntryTop || isEntryBottom)
        ? 'right'
        : 'center';

    drawReadableLabel(
      ctx,
      label,
      resolvePriceLabelX(label, metadata),
      y,
      annotation.color,
      metadata,
      occupiedLabels,
      'secondary',
      preferDirection,
      anchorAlign
    );
  }

  ctx.restore();
}

function drawPremiumDiscount(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  metadata: ChartMetadata,
  annotation: PremiumDiscountOverlay,
  occupiedLabels: LabelBox[]
): void {
  const yMin = mapPriceToY(annotation.min, metadata);
  const yMax = mapPriceToY(annotation.max, metadata);
  const yEq = mapPriceToY(annotation.equilibrium, metadata);
  const top = clamp(Math.min(yMin, yMax), metadata.plotTop, metadata.plotTop + metadata.plotHeight);
  const bottom = clamp(Math.max(yMin, yMax), metadata.plotTop, metadata.plotTop + metadata.plotHeight);
  const eq = clamp(yEq, top, bottom);

  ctx.save();
  ctx.fillStyle = 'rgba(239, 83, 80, 0.038)';
  ctx.fillRect(metadata.plotLeft, top, metadata.plotWidth, Math.max(0, eq - top));
  ctx.fillStyle = 'rgba(38, 166, 154, 0.038)';
  ctx.fillRect(metadata.plotLeft, eq, metadata.plotWidth, Math.max(0, bottom - eq));
  ctx.strokeStyle = 'rgba(209, 212, 220, 0.32)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(metadata.plotLeft, eq);
  ctx.lineTo(metadata.plotLeft + metadata.plotWidth, eq);
  ctx.stroke();
  ctx.setLineDash([]);

  const leftMargin = metadata.plotLeft + 12;
  const topLabelY = Math.max(metadata.plotTop + 46, top + 8);
  const bottomLabelY = Math.max(eq + 14, Math.min(metadata.plotTop + metadata.plotHeight - 24, bottom - 22));

  drawMutedContextLabel(ctx, 'PAHALI', leftMargin, topLabelY, PRESENTATION_DESIGN_TOKENS.colors.premium, metadata, occupiedLabels);
  if (bottom - top >= 90) {
    drawMutedContextLabel(ctx, 'DENGE', leftMargin, eq - 9, PRESENTATION_DESIGN_TOKENS.colors.labelMuted, metadata, occupiedLabels);
  }
  drawMutedContextLabel(ctx, 'UCUZ', leftMargin, bottomLabelY, PRESENTATION_DESIGN_TOKENS.colors.discount, metadata, occupiedLabels);
  ctx.restore();
}

function drawFvg(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  metadata: ChartMetadata,
  annotation: FvgOverlay,
  occupiedLabels: LabelBox[]
): void {
  const minIndex = Math.min(annotation.startIndex, annotation.endIndex);
  const maxIndex = Math.max(annotation.startIndex, annotation.endIndex);
  const left = clamp(mapBarLeftToX(minIndex, metadata), metadata.plotLeft, metadata.plotLeft + metadata.plotWidth - 12);
  const right = clamp(mapBarRightToX(maxIndex, metadata), left + 12, metadata.plotLeft + metadata.plotWidth);
  const y1 = mapPriceToY(annotation.high, metadata);
  const y2 = mapPriceToY(annotation.low, metadata);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const boxHeight = Math.max(6, bottom - top);
  const boxWidth = Math.max(12, right - left);
  const stroke = annotation.direction === 'bullish'
    ? PRESENTATION_DESIGN_TOKENS.colors.liquidity
    : PRESENTATION_DESIGN_TOKENS.colors.imbalance;
  const fill = annotation.direction === 'bullish'
    ? 'rgba(102, 187, 106, 0.14)'
    : 'rgba(206, 147, 216, 0.14)';

  ctx.save();
  ctx.fillStyle = fill;
  ctx.fillRect(left, top, boxWidth, boxHeight);

  // Top & bottom crisp zone borders + left origin accent
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left + boxWidth, top);
  ctx.moveTo(left, top + boxHeight);
  ctx.lineTo(left + boxWidth, top + boxHeight);
  ctx.stroke();

  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, top + boxHeight);
  ctx.stroke();

  if (boxHeight >= 14) {
    const midY = top + boxHeight / 2;
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(left, midY);
    ctx.lineTo(left + boxWidth, midY);
    ctx.stroke();
    ctx.restore();
  }

  if (annotation.label) {
    const safeLeftX = clamp(left + 2, metadata.plotLeft + 76, metadata.plotLeft + metadata.plotWidth - 44);
    drawReadableLabel(
      ctx,
      annotation.label,
      safeLeftX,
      top,
      stroke,
      metadata,
      occupiedLabels,
      'secondary',
      'up',
      'left'
    );
  }

  ctx.restore();
}

function drawOrderBlock(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  metadata: ChartMetadata,
  annotation: OrderBlockOverlay,
  occupiedLabels: LabelBox[]
): void {
  const minIndex = Math.min(annotation.startIndex, annotation.endIndex);
  const maxIndex = Math.max(annotation.startIndex, annotation.endIndex);
  const left = clamp(mapBarLeftToX(minIndex, metadata), metadata.plotLeft, metadata.plotLeft + metadata.plotWidth - 12);
  const right = clamp(mapBarRightToX(maxIndex, metadata), left + 12, metadata.plotLeft + metadata.plotWidth);
  const y1 = mapPriceToY(annotation.high, metadata);
  const y2 = mapPriceToY(annotation.low, metadata);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const boxHeight = Math.max(8, bottom - top);
  const boxWidth = Math.max(12, right - left);
  const isBullish = annotation.direction === 'bullish';
  const stroke = isBullish ? PRESENTATION_DESIGN_TOKENS.colors.supplyDemand : PRESENTATION_DESIGN_TOKENS.colors.marketShift;
  const fill = isBullish
    ? 'rgba(38, 166, 154, 0.15)'
    : 'rgba(239, 83, 80, 0.15)';

  ctx.save();
  ctx.fillStyle = fill;
  ctx.fillRect(left, top, boxWidth, boxHeight);

  // Top & bottom crisp zone borders + left origin accent
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left + boxWidth, top);
  ctx.moveTo(left, top + boxHeight);
  ctx.lineTo(left + boxWidth, top + boxHeight);
  ctx.stroke();

  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, top + boxHeight);
  ctx.stroke();

  if (boxHeight >= 14) {
    const midY = top + boxHeight / 2;
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(left, midY);
    ctx.lineTo(left + boxWidth, midY);
    ctx.stroke();
    ctx.restore();
  }

  if (annotation.label) {
    const safeLeftX = clamp(left + 2, metadata.plotLeft + 76, metadata.plotLeft + metadata.plotWidth - 44);
    drawReadableLabel(
      ctx,
      annotation.label,
      safeLeftX,
      top,
      stroke,
      metadata,
      occupiedLabels,
      'secondary',
      'up',
      'left'
    );
  }

  ctx.restore();
}

function drawBosArrow(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  metadata: ChartMetadata,
  annotation: BosArrowOverlay,
  occupiedLabels: LabelBox[]
): void {
  const x = clamp(mapBarIndexToX(annotation.index, metadata), metadata.plotLeft + 24, metadata.plotLeft + metadata.plotWidth - 12);
  const y = mapPriceToY(annotation.price, metadata);
  const isBullish = annotation.direction === 'bullish';
  const color = PRESENTATION_DESIGN_TOKENS.colors.marketShift;
  const size = Math.max(6, Math.round(metadata.imageWidth / 135));
  const spanWidth = Math.max(44, Math.min(110, metadata.barSpacing * 7));
  const lineStartX = Math.max(metadata.plotLeft + 75, x - spanWidth);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([4, 3]);

  // Horizontal SMC structure break line
  ctx.beginPath();
  ctx.moveTo(lineStartX, y);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Small directional pointer at break candle
  ctx.beginPath();
  if (isBullish) {
    ctx.moveTo(x, y - 2);
    ctx.lineTo(x - size * 0.65, y + size * 0.85);
    ctx.lineTo(x + size * 0.65, y + size * 0.85);
  } else {
    ctx.moveTo(x, y + 2);
    ctx.lineTo(x - size * 0.65, y - size * 0.85);
    ctx.lineTo(x + size * 0.65, y - size * 0.85);
  }
  ctx.closePath();
  ctx.fill();

  if (annotation.label) {
    drawReadableLabel(
      ctx,
      annotation.label,
      lineStartX,
      y,
      color,
      metadata,
      occupiedLabels,
      'context',
      isBullish ? 'up' : 'down',
      'left'
    );
  }

  ctx.restore();
}

function drawLabel(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  metadata: ChartMetadata,
  annotation: TextLabelOverlay,
  occupiedLabels: LabelBox[]
): void {
  // Pin setup summary label as a clean top-left HUD header badge so it never covers candles
  const hudX = metadata.plotLeft + 12;
  const hudY = metadata.plotTop + 10;
  drawReadableLabel(
    ctx,
    annotation.text,
    hudX,
    hudY,
    '#38bdf8',
    metadata,
    occupiedLabels,
    'primary',
    'down',
    'left',
    true
  );
}

function drawMutedContextLabel(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  text: string,
  x: number,
  y: number,
  color: string,
  metadata: ChartMetadata,
  occupiedLabels: LabelBox[]
): void {
  const fontSize = Math.max(9, Math.round(metadata.imageWidth / 112));
  const paddingX = 5;
  const paddingY = 2;
  const radius = 4;

  ctx.save();
  ctx.font = `${PRESENTATION_DESIGN_TOKENS.typography.fontWeightBold} ${fontSize}px ${PRESENTATION_DESIGN_TOKENS.typography.fontFamily}`;
  const width = ctx.measureText(text).width + paddingX * 2;
  const height = fontSize + paddingY * 2;
  const labelX = clamp(x, 0, Math.max(0, metadata.imageWidth - width));
  const preferredY = clamp(y, 0, Math.max(0, metadata.imageHeight - height));
  const pos = resolveNonOverlappingPosition(labelX, preferredY, width, height, metadata, occupiedLabels, 'down');
  const box = { x: pos.x, y: pos.y, width, height };

  ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = 'rgba(19, 23, 34, 0.72)';
  roundRect(ctx, pos.x, pos.y, width, height, radius, true, false);
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  roundRect(ctx, pos.x, pos.y, width, height, radius, false, true);
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.fillText(text, pos.x + paddingX, pos.y + paddingY);
  occupiedLabels.push(box);
  ctx.restore();
}

function drawReadableLabel(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  text: string,
  x: number,
  y: number,
  color: string,
  metadata: ChartMetadata,
  occupiedLabels: LabelBox[],
  tier: LabelTier = 'context',
  preferDirection: 'up' | 'down' | 'auto' = 'auto',
  anchorAlign: 'left' | 'center' | 'right' = 'center',
  directY = false
): void {
  const fontSize = tier === 'primary'
    ? Math.max(12, Math.round(metadata.imageWidth / 78))
    : Math.max(10, Math.round(metadata.imageWidth / (tier === 'secondary' ? 98 : 108)));
  const paddingX = tier === 'primary' ? 9 : 6;
  const paddingY = tier === 'primary' ? 4 : 3;
  const radius = tier === 'primary' ? 5 : 4;

  ctx.font = `${PRESENTATION_DESIGN_TOKENS.typography.fontWeightBold} ${fontSize}px ${PRESENTATION_DESIGN_TOKENS.typography.fontFamily}`;
  const width = ctx.measureText(text).width + paddingX * 2;
  const height = fontSize + paddingY * 2;
  const rawX = anchorAlign === 'left'
    ? x
    : anchorAlign === 'right'
      ? x - width
      : x - width / 2;
  const maxRight = metadata.plotLeft + metadata.plotWidth - 6;
  const preferredX = clamp(rawX, metadata.plotLeft + 6, Math.max(metadata.plotLeft + 6, maxRight - width));

  let initialY: number;
  if (directY) {
    initialY = y;
  } else if (preferDirection === 'down') {
    initialY = y + 4;
  } else {
    initialY = y - height - 4;
  }

  const preferredY = clamp(
    initialY,
    metadata.plotTop + 6,
    Math.max(metadata.plotTop + 6, metadata.plotTop + metadata.plotHeight - height - 6)
  );
  const pos = resolveNonOverlappingPosition(preferredX, preferredY, width, height, metadata, occupiedLabels, preferDirection);
  const labelBox = { x: pos.x, y: pos.y, width, height };

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = tier === 'primary' ? 8 : 5;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = tier === 'primary'
    ? 'rgba(15, 23, 42, 0.88)'
    : 'rgba(19, 23, 34, 0.84)';
  roundRect(ctx, pos.x, pos.y, width, height, radius, true, false);
  ctx.strokeStyle = color;
  ctx.lineWidth = tier === 'primary' ? 1.3 : 1;
  roundRect(ctx, pos.x, pos.y, width, height, radius, false, true);
  ctx.fillStyle = tier === 'primary'
    ? PRESENTATION_DESIGN_TOKENS.colors.badgeText
    : PRESENTATION_DESIGN_TOKENS.colors.labelText;
  ctx.textBaseline = 'top';
  ctx.fillText(text, pos.x + paddingX, pos.y + paddingY);
  occupiedLabels.push(labelBox);
  ctx.restore();
}

function resolvePriceLabelX(label: string, metadata: ChartMetadata): number {
  const rightEdge = metadata.plotLeft + metadata.plotWidth - 8;
  if (label === 'ANLIK FİYAT') {
    return metadata.plotLeft + 92;
  }
  return rightEdge;
}

function resolveNonOverlappingPosition(
  preferredX: number,
  preferredY: number,
  width: number,
  height: number,
  metadata: ChartMetadata,
  occupiedLabels: readonly LabelBox[],
  preferDirection: 'up' | 'down' | 'auto' = 'auto'
): { x: number; y: number } {
  const minY = metadata.plotTop + 6;
  const maxY = Math.max(minY, metadata.plotTop + metadata.plotHeight - height - 6);
  const minX = metadata.plotLeft + 6;
  const maxX = Math.max(minX, metadata.plotLeft + metadata.plotWidth - width - 6);

  const stepY = height + 5;
  const yCandidates: number[] = [preferredY];
  for (let i = 1; i <= 10; i++) {
    if (preferDirection === 'down') {
      yCandidates.push(preferredY + stepY * i, preferredY - stepY * i);
    } else if (preferDirection === 'up') {
      yCandidates.push(preferredY - stepY * i, preferredY + stepY * i);
    } else {
      yCandidates.push(preferredY - stepY * i, preferredY + stepY * i);
    }
  }

  const xOffsets = [0, -Math.round(width + 8), Math.round(width + 8), -Math.round((width + 8) * 2)];

  for (const candidateY of yCandidates) {
    const y = clamp(candidateY, minY, maxY);
    for (const dx of xOffsets) {
      const x = clamp(preferredX + dx, minX, maxX);
      const box = { x, y, width, height };
      if (!occupiedLabels.some(occupied => overlaps(box, occupied))) {
        return { x, y };
      }
    }
  }

  return {
    x: clamp(preferredX, minX, maxX),
    y: clamp(preferredY, minY, maxY),
  };
}

function overlaps(a: LabelBox, b: LabelBox): boolean {
  const pad = 4;
  return (a.x - pad) < (b.x + b.width + pad)
    && (a.x + a.width + pad) > (b.x - pad)
    && (a.y - pad) < (b.y + b.height + pad)
    && (a.y + a.height + pad) > (b.y - pad);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundRect(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: boolean,
  stroke: boolean
): void {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}
