import { assessPresentationV1 } from '../src/presentationAssessment';

describe('PresentationAssessment V1', () => {
  test('classifies a complete, readable 15m overlay as good presentation', () => {
    const assessment = assessPresentationV1({
      timeframe: '15m',
      metadata: {
        imageWidth: 1000,
        imageHeight: 600,
        firstVisibleLogical: 20,
        lastVisibleLogical: 110,
        plotWidth: 860,
        plotHeight: 492,
      },
      annotations: [
        { type: 'premiumDiscount' },
        { type: 'priceLine', label: 'ENTRY' },
        { type: 'priceLine', label: 'ENTRY' },
        { type: 'priceLine', label: 'PRICE' },
        { type: 'orderBlock', label: 'Order Block' },
        { type: 'bosArrow', label: 'BOS' },
        { type: 'label', label: 'EURUSD A' },
      ],
      overlaySimplification: {
        metrics: {
          overlayDensity: 0.7778,
          priorityCoverage: 1,
          hiddenAnnotations: 0,
          hiddenLabels: 0,
          visiblePriorityRatio: 0.4444,
          clutterScore: 0,
          hierarchyScore: 100,
        },
      },
    });

    expect(assessment.version).toBe('PresentationAssessment.v1');
    expect(assessment.visibility).toBe('Good');
    expect(assessment.presentationScore).toBeGreaterThanOrEqual(90);
    expect(assessment.warnings).toHaveLength(0);
  });

  test('warns when presentation lacks core setup overlays', () => {
    const assessment = assessPresentationV1({
      timeframe: '15m',
      metadata: {
        imageWidth: 700,
        imageHeight: 420,
        firstVisibleLogical: 0,
        lastVisibleLogical: 160,
        plotWidth: 350,
        plotHeight: 250,
      },
      annotations: [
        { type: 'premiumDiscount' },
        { type: 'label', label: 'A' },
        { type: 'label', label: 'B' },
        { type: 'label', label: 'C' },
        { type: 'label', label: 'D' },
        { type: 'label', label: 'E' },
        { type: 'label', label: 'F' },
        { type: 'label', label: 'G' },
        { type: 'label', label: 'H' },
      ],
      overlaySimplification: {
        metrics: {
          overlayDensity: 1.0,
          priorityCoverage: 0.5,
          hiddenAnnotations: 4,
          hiddenLabels: 4,
          visiblePriorityRatio: 0.2,
          clutterScore: 32,
          hierarchyScore: 68,
        },
      },
    });

    expect(assessment.visibility).toBe('Weak');
    expect(assessment.readability).toBe('Weak');
    expect(assessment.presentationScore).toBeLessThan(60);
    expect(assessment.warnings).toContain('No POI overlay is visible.');
    expect(assessment.warnings).toContain('No BOS/CHoCH structural marker is visible.');
  });

  test('returns a weak assessment when overlay input is missing', () => {
    const assessment = assessPresentationV1(null);

    expect(assessment.timeframe).toBe('unknown');
    expect(assessment.presentationScore).toBe(0);
    expect(assessment.warnings).toContain('Overlay input could not be built.');
  });
});
