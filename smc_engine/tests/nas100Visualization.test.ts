import { runNas100Visualization } from '../server/nas100Visualization';

describe('NAS100 visualization profile', () => {
  const original = process.env.ENABLE_NAS100_VISUALIZATION;

  afterEach(() => {
    if (original === undefined) delete process.env.ENABLE_NAS100_VISUALIZATION;
    else process.env.ENABLE_NAS100_VISUALIZATION = original;
  });

  test('is disabled by default and never enters production pipeline', async () => {
    delete process.env.ENABLE_NAS100_VISUALIZATION;
    await expect(runNas100Visualization()).resolves.toMatchObject({
      asset: 'NAS100', mode: 'VISUALIZATION_ONLY', timeframes: ['15M', '1H'],
      chartGeneration: 'DISABLED', overlay: 'DISABLED', telegramAttachment: 'DISABLED',
    });
  });
});
