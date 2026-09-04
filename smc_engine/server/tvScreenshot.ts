import puppeteer = require('puppeteer');

/**
 * Headlessly navigates to the TradingView lightweight charting widget,
 * loads the real-time chart for the given symbol in dark theme,
 * and takes a PNG screenshot.
 */
export async function captureTradingViewChart(symbol: string, timeframe: string, broker = 'OANDA'): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-dev-shm-usage'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 600 });

    const intervalMap: Record<string, string> = {
      '15m': '15',
      '1h': '60',
      '4h': '240'
    };
    const interval = intervalMap[timeframe] || '15';

    // The broker is explicit so visualization-only profiles can use a feed
    // different from the analysis provider without entering the pipeline.
    const tvSymbol = `${broker}:${symbol}`;
    const url = `https://s.tradingview.com/widgetembed/?symbol=${tvSymbol}&interval=${interval}&theme=dark&style=1`;

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Add a safe sleep delay for the chart canvas/candles to render fully
    await new Promise(resolve => setTimeout(resolve, 3000));

    const screenshot = await page.screenshot({ type: 'png' });
    return screenshot as Buffer;
  } finally {
    await browser.close();
  }
}
