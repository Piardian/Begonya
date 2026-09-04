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
    fvg: 1,
    orderBlock: 2,
    bosArrow: 3,
    priceLine: 4,
    label: 5,
  };
  const occupiedLabels: LabelBox[] = [];

  for (const annotation of [...input.annotations].sort((a, b) => drawOrder[a.type] - drawOrder[b.type])) {
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
      case 'label':
        drawLabel(ctx, input.metadata, annotation, occupiedLabels);
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

  ctx.save();
  ctx.strokeStyle = annotation.color;
  const isPrimary = isPrimaryPriceLabel(annotation.label);
  ctx.lineWidth = isPrimary ? Math.max(2.2, metadata.imageWidth / 460) : Math.max(1, metadata.imageWidth / 980);
  ctx.setLineDash(annotation.dashed ? [6, 4] : []);
  ctx.beginPath();
  ctx.moveTo(metadata.plotLeft, y);
  ctx.lineTo(metadata.plotLeft + metadata.plotWidth, y);
  ctx.stroke();

  if (annotation.label) {
    drawReadableLabel(
      ctx,
      annotation.label,
      resolvePriceLabelX(annotation.label, metadata),
      y,
      annotation.color,
      metadata,
      occupiedLabels,
      isPrimary ? 'primary' : 'secondary'
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
  const top = Math.min(yMin, yMax);
  const bottom = Math.max(yMin, yMax);
  const eq = Math.max(top, Math.min(bottom, yEq));

  ctx.save();
  ctx.fillStyle = 'rgba(239, 83, 80, 0.045)';
  ctx.fillRect(metadata.plotLeft, top, metadata.plotWidth, Math.max(0, eq - top));
  ctx.fillStyle = 'rgba(38, 166, 154, 0.045)';
  ctx.fillRect(metadata.plotLeft, eq, metadata.plotWidth, Math.max(0, bottom - eq));
  ctx.strokeStyle = 'rgba(209, 212, 220, 0.38)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(metadata.plotLeft, eq);
  ctx.lineTo(metadata.plotLeft + metadata.plotWidth, eq);
  ctx.stroke();

  drawMutedContextLabel(ctx, 'PAHALI', metadata.plotLeft + 10, top + 8, PRESENTATION_DESIGN_TOKENS.colors.premium, metadata, occupiedLabels);
  drawMutedContextLabel(ctx, 'DENGE', metadata.plotLeft + 10, eq - 4, PRESENTATION_DESIGN_TOKENS.colors.labelMuted, metadata, occupiedLabels);
  drawMutedContextLabel(ctx, 'UCUZ', metadata.plotLeft + 10, eq + 10, PRESENTATION_DESIGN_TOKENS.colors.discount, metadata, occupiedLabels);
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
  const left = mapBarLeftToX(minIndex, metadata);
  const right = mapBarRightToX(maxIndex, metadata);
  const y1 = mapPriceToY(annotation.high, metadata);
  const y2 = mapPriceToY(annotation.low, metadata);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const stroke = annotation.direction === 'bullish'
    ? PRESENTATION_DESIGN_TOKENS.colors.liquidity
    : PRESENTATION_DESIGN_TOKENS.colors.imbalance;
  const fill = annotation.direction === 'bullish'
    ? 'rgba(102, 187, 106, 0.13)'
    : 'rgba(206, 147, 216, 0.13)';

  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1.8, metadata.imageWidth / 620);
  roundRect(ctx, left, top, Math.max(6, right - left), Math.max(6, bottom - top), PRESENTATION_DESIGN_TOKENS.borderRadius.medium, true, true);

  if (annotation.label) {
    drawReadableLabel(ctx, annotation.label, left, bottom, stroke, metadata, occupiedLabels, 'secondary');
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
  const left = mapBarLeftToX(minIndex, metadata);
  const right = mapBarRightToX(maxIndex, metadata);
  const y1 = mapPriceToY(annotation.high, metadata);
  const y2 = mapPriceToY(annotation.low, metadata);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const isBullish = annotation.direction === 'bullish';
  const stroke = isBullish ? PRESENTATION_DESIGN_TOKENS.colors.supplyDemand : PRESENTATION_DESIGN_TOKENS.colors.marketShift;
  const fill = isBullish
    ? `rgba(38, 166, 154, ${PRESENTATION_DESIGN_TOKENS.opacity.boxFill})`
    : `rgba(239, 83, 80, ${PRESENTATION_DESIGN_TOKENS.opacity.boxFill})`;

  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(2, metadata.imageWidth / 520);
  roundRect(ctx, left, top, Math.max(8, right - left), Math.max(8, bottom - top), PRESENTATION_DESIGN_TOKENS.borderRadius.medium, true, true);

  if (annotation.label) {
    drawReadableLabel(ctx, annotation.label, left, top, stroke, metadata, occupiedLabels, 'secondary');
  }

  ctx.restore();
}

function drawBosArrow(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  metadata: ChartMetadata,
  annotation: BosArrowOverlay,
  occupiedLabels: LabelBox[]
): void {
  const x = mapBarIndexToX(annotation.index, metadata);
  const y = mapPriceToY(annotation.price, metadata);
  const isBullish = annotation.direction === 'bullish';
  const color = PRESENTATION_DESIGN_TOKENS.colors.marketShift;
  const size = Math.max(8, metadata.imageWidth / 96);
  const stem = Math.max(18, metadata.imageHeight / 22);
  const stemStartY = isBullish ? y + stem : y - stem;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, metadata.imageWidth / 700);

  ctx.beginPath();
  ctx.moveTo(x, stemStartY);
  ctx.lineTo(x, y);
  ctx.stroke();

  ctx.beginPath();
  if (isBullish) {
    ctx.moveTo(x, y);
    ctx.lineTo(x - size * 0.62, y + size * 0.92);
    ctx.lineTo(x + size * 0.62, y + size * 0.92);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x - size * 0.62, y - size * 0.92);
    ctx.lineTo(x + size * 0.62, y - size * 0.92);
  }
  ctx.closePath();
  ctx.fill();

  if (annotation.label) {
    drawReadableLabel(
      ctx,
      annotation.label,
      x + size,
      isBullish ? y - size : y + size,
      color,
      metadata,
      occupiedLabels,
      'context'
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
  drawReadableLabel(
    ctx,
    annotation.text,
    mapBarIndexToX(annotation.index, metadata),
    mapPriceToY(annotation.price, metadata),
    PRESENTATION_DESIGN_TOKENS.colors.labelMuted,
    metadata,
    occupiedLabels,
    getLabelTier(annotation.text)
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
  const labelY = clamp(y, 0, Math.max(0, metadata.imageHeight - height));
  const box = { x: labelX, y: labelY, width, height };

  ctx.shadowColor = 'rgba(0, 0, 0, 0.14)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = 'rgba(19, 23, 34, 0.58)';
  roundRect(ctx, labelX, labelY, width, height, radius, true, false);
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  roundRect(ctx, labelX, labelY, width, height, radius, false, true);
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.fillText(text, labelX + paddingX, labelY + paddingY);
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
  tier: LabelTier = 'context'
): void {
  const fontSize = tier === 'primary'
    ? Math.max(PRESENTATION_DESIGN_TOKENS.typography.fontSizeMedium, Math.round(metadata.imageWidth / 64))
    : Math.max(PRESENTATION_DESIGN_TOKENS.typography.fontSizeSmall, Math.round(metadata.imageWidth / (tier === 'secondary' ? 104 : 112)));
  const paddingX = tier === 'primary'
    ? PRESENTATION_DESIGN_TOKENS.spacing.badgePaddingX
    : PRESENTATION_DESIGN_TOKENS.spacing.labelPaddingX;
  const paddingY = tier === 'primary'
    ? PRESENTATION_DESIGN_TOKENS.spacing.badgePaddingY
    : PRESENTATION_DESIGN_TOKENS.spacing.labelPaddingY;
  const radius = tier === 'primary'
    ? PRESENTATION_DESIGN_TOKENS.borderRadius.medium
    : PRESENTATION_DESIGN_TOKENS.borderRadius.small;

  ctx.font = `${PRESENTATION_DESIGN_TOKENS.typography.fontWeightBold} ${fontSize}px ${PRESENTATION_DESIGN_TOKENS.typography.fontFamily}`;
  const width = ctx.measureText(text).width + paddingX * 2;
  const height = fontSize + paddingY * 2;
  const preferredX = clamp(x - width / 2, 0, Math.max(0, metadata.imageWidth - width));
  const preferredY = clamp(
    tier === 'primary'
      ? Math.max(metadata.plotTop + 4, y - height - 4)
      : y - height - paddingY - 1,
    0,
    Math.max(0, metadata.imageHeight - height)
  );
  const labelY = resolveNonOverlappingY(preferredX, preferredY, width, height, metadata, occupiedLabels);
  const labelBox = { x: preferredX, y: labelY, width, height };

  ctx.save();
  ctx.shadowColor = tier === 'primary'
    ? `rgba(0, 0, 0, ${PRESENTATION_DESIGN_TOKENS.opacity.badgeShadow})`
    : 'rgba(0, 0, 0, 0.18)';
  ctx.shadowBlur = tier === 'primary' ? 10 : 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = tier === 'primary'
    ? `rgba(30, 41, 59, ${PRESENTATION_DESIGN_TOKENS.opacity.badgeBackground})`
    : PRESENTATION_DESIGN_TOKENS.colors.labelBackground;
  roundRect(ctx, preferredX, labelY, width, height, radius, true, false);
  ctx.strokeStyle = color;
  ctx.lineWidth = tier === 'primary' ? 1.4 : 1;
  roundRect(ctx, preferredX, labelY, width, height, radius, false, true);
  ctx.fillStyle = tier === 'primary'
    ? PRESENTATION_DESIGN_TOKENS.colors.badgeText
    : PRESENTATION_DESIGN_TOKENS.colors.labelText;
  ctx.textBaseline = 'top';
  ctx.fillText(text, preferredX + paddingX, labelY + paddingY);
  occupiedLabels.push(labelBox);
  ctx.restore();
}

function isPrimaryPriceLabel(label?: string): boolean {
  if (!label) return false;
  return label === 'ANLIK FİYAT' || label === 'GİRİŞ BÖLGESİ' || label === 'GİRİŞ ÜST' || label === 'GİRİŞ ALT';
}

function resolvePriceLabelX(label: string, metadata: ChartMetadata): number {
  const rightEdge = metadata.plotLeft + metadata.plotWidth - 14;
  const leftEdge = metadata.plotLeft + 12;
  if (metadata.timeframe === '1m') return leftEdge;
  if (label === 'ANLIK FİYAT') return rightEdge - 92;
  if (label === 'GİRİŞ ÜST' || label === 'GİRİŞ ALT' || label === 'GİRİŞ BÖLGESİ') return rightEdge - 108;
  return rightEdge - 74;
}

function getLabelTier(text: string): LabelTier {
  if (text.includes('1M') || text.includes('15M') || text.includes('1H')) return 'primary';
  if (text.includes('ANLIK FİYAT') || text.includes('GİRİŞ')) return 'secondary';
  return 'context';
}

function resolveNonOverlappingY(
  x: number,
  preferredY: number,
  width: number,
  height: number,
  metadata: ChartMetadata,
  occupiedLabels: readonly LabelBox[]
): number {
  const step = height + 4;
  const candidates = [preferredY];
  for (let i = 1; i <= 8; i++) {
    candidates.push(preferredY + step * i, preferredY - step * i);
  }

  for (const candidate of candidates) {
    const y = clamp(candidate, 0, metadata.imageHeight - height);
    const box = { x, y, width, height };
    if (!occupiedLabels.some(occupied => overlaps(box, occupied))) return y;
  }

  return clamp(preferredY, 0, metadata.imageHeight - height);
}

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
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
