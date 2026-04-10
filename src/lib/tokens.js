/**
 * Field Command Design Tokens
 * Matches the Command Suite palette (Sales Command, Schedule Command, AR Command)
 */

// ── Colors ──────────────────────────────────────────────────────────
export const C = {
  // Parchment base (matches AR Command / Sales Command web)
  linen:        '#b5a896',
  linenLight:   '#bfb3a1',
  linenCard:    '#c8bcaa',
  linenDeep:    '#a89b88',

  // Text
  textHead:     '#1c1814',
  textBody:     '#2d2720',
  textMuted:    '#4a4238',
  textLight:    '#6b6358',
  textFaint:    '#887c6e',

  // Borders
  border:       'rgba(28,24,20,0.14)',
  borderStrong: 'rgba(28,24,20,0.22)',

  // Teal accent (primary action for Field Command — teal on dark)
  teal:         '#30cfac',
  tealDark:     '#1a8a72',
  tealDeep:     '#0d5c4d',
  tealGlow:     'rgba(48,207,172,0.12)',
  tealBorder:   'rgba(48,207,172,0.3)',

  // Dark
  dark:         '#1c1814',
  darkRaised:   '#28231d',
  darkBorder:   'rgba(255,255,255,0.10)',

  // Status
  red:          '#e53935',
  green:        '#43a047',
  amber:        '#f9a825',
  purple:       '#8e44ad',

  // Action green (used in Schedule/AR — available but not primary here)
  pop:          '#5BBD3F',
  popDim:       'rgba(91,189,63,0.15)',

  // Prevailing wage indicator
  pw:           '#6d28d9',

  // White (only for text on dark backgrounds)
  white:        '#ffffff',
};

// ── Fonts ───────────────────────────────────────────────────────────
export const F = {
  display:      'BarlowCondensed_700Bold',
  displayMed:   'BarlowCondensed_600SemiBold',
  displayLight: 'BarlowCondensed_500Medium',
  body:         'Barlow_400Regular',
  bodyMed:      'Barlow_500Medium',
  bodySemi:     'Barlow_600SemiBold',
  bodyBold:     'Barlow_700Bold',
};

// ── Spacing ─────────────────────────────────────────────────────────
export const S = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

// ── Common style fragments for reuse ────────────────────────────────
export const COMMON = {
  // Primary button: teal text on dark background
  btnPrimary: {
    backgroundColor: C.dark,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPrimaryText: {
    fontFamily: F.display,
    fontSize: 16,
    color: C.teal,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Card
  card: {
    backgroundColor: C.linenCard,
    borderRadius: 10,
    padding: S.md,
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  // Screen background
  screen: {
    flex: 1,
    backgroundColor: C.linen,
  },
  // Dark header bar
  header: {
    backgroundColor: C.dark,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
  },
};
