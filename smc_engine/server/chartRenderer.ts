import { createCanvas } from 'canvas';
import { StoredCandle, Symbol, Timeframe } from './candleStore';
import { NotificationCandidate } from './pipeline';
import { OrderBlock, FVG } from '../src/types';
import { formatPrice } from '../src/assetMetrics';

export function renderCandidateChart(
  candles: StoredCandle[],
  candidate: NotificationCandidate
): Buffer {
  const width = 1000;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Dark background
  ctx.fillStyle = '#121212';
  ctx.fillRect(0, 0, width, height);

  if (!candles || candles.length === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px sans-serif';
    ctx.fillText('No candle data available', width / 2 - 100, height / 2);
    return canvas.toBuffer('image/png');
  }

  const { symbol, tradeDirection, poiType, poi, gradeResult, poiFormedTimestamp, poiTestCount, currentPrice } = candidate;

  // Zone levels
  const zoneHigh = poiType === 'OB' ? (poi as OrderBlock).high : (poi as FVG).gapHigh;
  const zoneLow = poiType === 'OB' ? (poi as OrderBlock).low : (poi as FVG).gapLow;

  // Determine min and max price for scaling
  let minPrice = Math.min(...candles.map(c => c.low), zoneLow, currentPrice ?? zoneLow);
  let maxPrice = Math.max(...candles.map(c => c.high), zoneHigh, currentPrice ?? zoneHigh);
  const priceRange = maxPrice - minPrice;
  
  // Add 10% padding
  minPrice -= priceRange * 0.1;
  maxPrice += priceRange * 0.1;

  // Chart Layout Margins
  const marginLeft = 60;
  const marginRight = 90;
  const marginTop = 70;
  const marginBottom = 50;

  const chartWidth = width - marginLeft - marginRight;
  const chartHeight = height - marginTop - marginBottom;

  // Scaling helpers
  function getX(index: number): number {
    if (candles.length <= 1) return marginLeft + chartWidth / 2;
    return marginLeft + (index / (candles.length - 1)) * chartWidth;
  }

  function getY(price: number): number {
    return marginTop + chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight;
  }

  // Draw Horizontal Gridlines and Price Labels
  ctx.strokeStyle = '#2d2d2d';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#8e8e93';
  ctx.font = '12px sans-serif';

  const gridLineCount = 5;
  for (let i = 0; i <= gridLineCount; i++) {
    const priceVal = minPrice + (i / gridLineCount) * (maxPrice - minPrice);
    const yVal = getY(priceVal);

    // Draw line
    ctx.beginPath();
    ctx.moveTo(marginLeft, yVal);
    ctx.lineTo(marginLeft + chartWidth, yVal);
    ctx.stroke();

    // Draw price text
    ctx.fillText(formatPrice(priceVal, symbol), marginLeft + chartWidth + 10, yVal + 4);
  }

  // Draw POI Box
  const formedIndex = candles.findIndex(c => c.timestamp === poiFormedTimestamp);
  if (formedIndex !== -1) {
    const boxStartX = getX(formedIndex);
    
    // Bounding width calculation
    let boxEndX = getX(candles.length - 1);
    if (poiTestCount > 0) {
      let testIndex = -1;
      for (let i = formedIndex + 1; i < candles.length; i++) {
        const c = candles[i];
        if (c.low <= zoneHigh && c.high >= zoneLow) {
          testIndex = i;
          break;
        }
      }
      if (testIndex !== -1) {
        boxEndX = getX(testIndex);
      }
    } else {
      const targetEndIndex = Math.min(candles.length - 1, formedIndex + 15);
      boxEndX = getX(targetEndIndex);
    }

    const boxYHigh = getY(zoneHigh);
    const boxYLow = getY(zoneLow);

    ctx.fillStyle = poiType === 'OB' ? 'rgba(52, 152, 219, 0.15)' : 'rgba(155, 89, 182, 0.15)';
    ctx.fillRect(boxStartX, boxYHigh, boxEndX - boxStartX, boxYLow - boxYHigh);

    ctx.strokeStyle = poiType === 'OB' ? '#3498db' : '#9b59b6';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxStartX, boxYHigh, boxEndX - boxStartX, boxYLow - boxYHigh);

    // Label POI Box
    ctx.fillStyle = poiType === 'OB' ? '#3498db' : '#9b59b6';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`${poiType} (${formatPrice(zoneLow, symbol)} - ${formatPrice(zoneHigh, symbol)})`, boxStartX + 5, boxYHigh - 6);
  } else {
    console.warn(`[ChartRenderer] POI formed index matching timestamp ${poiFormedTimestamp} not found in chart candles. Box skipped.`);
  }

  // Draw BOS/CHoCH Line
  const breakIndex = candles.findIndex(c => c.timestamp === poi.relatedEvent.breakTimestamp);
  if (breakIndex !== -1) {
    const breakX = getX(breakIndex);
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(breakX, marginTop);
    ctx.lineTo(breakX, marginTop + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash

    // Label BOS/CHoCH
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(poi.relatedEvent.type, breakX - 15, marginTop - 10);
  } else {
    console.warn(`[ChartRenderer] BOS/CHoCH break index matching timestamp ${poi.relatedEvent.breakTimestamp} not found in chart candles. Line skipped.`);
  }

  // Draw Current Price Line
  if (currentPrice !== undefined && currentPrice > 0) {
    const cpY = getY(currentPrice);
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(marginLeft, cpY);
    ctx.lineTo(marginLeft + chartWidth, cpY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ff9800';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`ANLIK: ${formatPrice(currentPrice, symbol)}`, marginLeft + chartWidth + 5, cpY - 4);
  }

  // Draw Candlesticks
  const candleWidth = Math.max(2, (chartWidth / candles.length) * 0.7);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const x = getX(i);
    const yOpen = getY(c.open);
    const yClose = getY(c.close);
    const yHigh = getY(c.high);
    const yLow = getY(c.low);

    const isBullish = c.close >= c.open;
    const candleColor = isBullish ? '#26a69a' : '#ef5350';

    ctx.strokeStyle = candleColor;
    ctx.lineWidth = 1.5;

    // Draw Wick
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();

    // Draw Body
    ctx.fillStyle = candleColor;
    const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
    ctx.fillRect(x - candleWidth / 2, Math.min(yOpen, yClose), candleWidth, bodyHeight);
  }

  // Draw Title text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(`${symbol} — ${tradeDirection.toUpperCase()} — Grade ${gradeResult.grade}`, marginLeft, 40);

  // Draw Action Decision Badge
  const inZone = currentPrice >= zoneLow && currentPrice <= zoneHigh;
  const badgeText = inZone
    ? 'AKTİF BÖLGEDE — 1M ONAY BEKLE'
    : 'BEKLEMEDE — BÖLGEYE RETEST BEKLE';
  const badgeBg = inZone ? '#2e7d32' : '#1565c0';

  ctx.font = 'bold 12px sans-serif';
  const badgeWidth = ctx.measureText(badgeText).width + 20;
  const badgeX = marginLeft + chartWidth - badgeWidth;
  const badgeY = 22;

  ctx.fillStyle = badgeBg;
  ctx.fillRect(badgeX, badgeY, badgeWidth, 24);

  ctx.fillStyle = '#ffffff';
  ctx.fillText(badgeText, badgeX + 10, badgeY + 16);

  return canvas.toBuffer('image/png');
}
