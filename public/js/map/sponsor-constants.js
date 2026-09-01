/**
 * Map sponsor bar — shared design tokens and responsive capacity.
 * Adjust values here to tune the public sponsor belt globally.
 */
const MapSponsorConstants = (() => {
  const LOGO_HEIGHT_PX = 16;
  const LOGO_GAP_PX = 28;
  const TRAVERSAL_DURATION_SEC = 30;
  const MOBILE_MAX_VISIBLE = 6;
  const DESKTOP_MAX_VISIBLE = 10;
  /** Matches primary mobile breakpoint in map.css */
  const MOBILE_BREAKPOINT_PX = 480;
  /** Minimum tap target without affecting visual logo height */
  const SLOT_MIN_WIDTH_PX = 44;
  const SLOT_PADDING_X_PX = 4;

  return {
    LOGO_HEIGHT_PX,
    LOGO_GAP_PX,
    TRAVERSAL_DURATION_SEC,
    MOBILE_MAX_VISIBLE,
    DESKTOP_MAX_VISIBLE,
    MOBILE_BREAKPOINT_PX,
    SLOT_MIN_WIDTH_PX,
    SLOT_PADDING_X_PX,
    CSS_VARS: {
      logoHeight: '--map-sponsor-logo-height',
      gap: '--map-sponsor-gap',
      beltDuration: '--map-sponsor-belt-duration',
    },
  };
})();
