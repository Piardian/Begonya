export const PRESENTATION_DESIGN_SYSTEM_VERSION = 'PresentationDesignSystem.v1' as const;

export interface PresentationDesignTokens {
  readonly colors: {
    readonly primaryStructure: string;
    readonly marketShift: string;
    readonly supplyDemand: string;
    readonly liquidity: string;
    readonly imbalance: string;
    readonly historicalMuted: string;
    readonly price: string;
    readonly premium: string;
    readonly discount: string;
    readonly entry: string;
    readonly entryAccent: string;
    readonly badge: string;
    readonly badgeText: string;
    readonly labelBackground: string;
    readonly labelText: string;
    readonly labelMuted: string;
  };
  readonly typography: {
    readonly fontFamily: string;
    readonly fontSizeSmall: number;
    readonly fontSizeMedium: number;
    readonly fontSizeLarge: number;
    readonly fontWeightBold: number;
    readonly letterSpacing: number;
    readonly capitalization: 'UPPERCASE' | 'NONE';
  };
  readonly spacing: {
    readonly labelPaddingX: number;
    readonly labelPaddingY: number;
    readonly boxInset: number;
    readonly labelOffset: number;
    readonly arrowOffset: number;
    readonly badgePaddingX: number;
    readonly badgePaddingY: number;
  };
  readonly opacity: {
    readonly boxFill: number;
    readonly boxBorder: number;
    readonly labelBackground: number;
    readonly premiumDiscount: number;
    readonly badgeBackground: number;
    readonly badgeShadow: number;
  };
  readonly strokeWidth: {
    readonly thin: number;
    readonly medium: number;
    readonly thick: number;
  };
  readonly borderRadius: {
    readonly small: number;
    readonly medium: number;
  };
  readonly layerOrder: readonly string[];
  readonly appliedTokens: readonly string[];
}

export const PRESENTATION_DESIGN_TOKENS: PresentationDesignTokens = Object.freeze({
  colors: Object.freeze({
    primaryStructure: '#42a5f5',
    marketShift: '#f1c40f',
    supplyDemand: '#26a69a',
    liquidity: '#66bb6a',
    imbalance: '#ce93d8',
    historicalMuted: '#78909c',
    price: '#d1d4dc',
    premium: '#ef9a9a',
    discount: '#80cbc4',
    entry: '#42a5f5',
    entryAccent: '#90caf9',
    badge: '#1e293b',
    badgeText: '#f8fafc',
    labelBackground: '#131722',
    labelText: '#ffffff',
    labelMuted: '#d1d4dc',
  }),
  typography: Object.freeze({
    fontFamily: 'sans-serif',
    fontSizeSmall: 11,
    fontSizeMedium: 13,
    fontSizeLarge: 15,
    fontWeightBold: 700,
    letterSpacing: 0.2,
    capitalization: 'UPPERCASE',
  }),
  spacing: Object.freeze({
    labelPaddingX: 6,
    labelPaddingY: 4,
    boxInset: 0,
    labelOffset: 6,
    arrowOffset: 10,
    badgePaddingX: 10,
    badgePaddingY: 5,
  }),
  opacity: Object.freeze({
    boxFill: 0.22,
    boxBorder: 0.95,
    labelBackground: 0.82,
    premiumDiscount: 0.02,
    badgeBackground: 0.78,
    badgeShadow: 0.3,
  }),
  strokeWidth: Object.freeze({
    thin: 1,
    medium: 2,
    thick: 3,
  }),
  borderRadius: Object.freeze({
    small: 4,
    medium: 8,
  }),
  layerOrder: Object.freeze([
    'Price',
    'Current Structure',
    'Current POI',
    'Active Order Blocks',
    'Current Labels',
    'Historical Objects',
    'Historical Labels',
  ]),
  appliedTokens: Object.freeze([
    'ColorPaletteV1',
    'TypographyV1',
    'ShapeV1',
    'LayerOrderingV1',
    'SpacingV1',
  ]),
});

export interface PresentationDesignValidation {
  readonly version: typeof PRESENTATION_DESIGN_SYSTEM_VERSION;
  readonly colorConsistency: number;
  readonly typographyConsistency: number;
  readonly layoutConsistency: number;
  readonly spacingConsistency: number;
  readonly designConsistencyScore: number;
  readonly appliedTokens: readonly string[];
}

export function buildPresentationDesignValidation(input: {
  readonly colorConsistency: number;
  readonly typographyConsistency: number;
  readonly layoutConsistency: number;
  readonly spacingConsistency: number;
}): PresentationDesignValidation {
  const normalized = {
    colorConsistency: clamp01(input.colorConsistency),
    typographyConsistency: clamp01(input.typographyConsistency),
    layoutConsistency: clamp01(input.layoutConsistency),
    spacingConsistency: clamp01(input.spacingConsistency),
  };

  return Object.freeze({
    version: PRESENTATION_DESIGN_SYSTEM_VERSION,
    ...normalized,
    designConsistencyScore: Math.round(((normalized.colorConsistency + normalized.typographyConsistency + normalized.layoutConsistency + normalized.spacingConsistency) / 4) * 100),
    appliedTokens: PRESENTATION_DESIGN_TOKENS.appliedTokens,
  }) as PresentationDesignValidation;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
