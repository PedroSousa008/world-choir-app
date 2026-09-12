/**
 * World Choir — shared map basemap tiles
 *
 * Dark: Carto Dark Matter (no labels)
 * Light: Carto Positron (no labels)
 * Optional: Carto raster via /api/map-tile when CARTO_API_KEY is set on Vercel.
 */
const WorldChoirMapTiles = (() => {
  const CARTO_DARK_VECTOR_STYLE =
    'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';
  const CARTO_LIGHT_VECTOR_STYLE =
    'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json';

  const PROXY_URL = '/api/map-tile?z={z}&x={x}&y={y}&r={r}';

  const SHARED_RASTER_OPTS = {
    subdomains: 'abcd',
    noWrap: true,
    bounds: [[-85, -180], [85, 180]],
  };

  let resolvePromise = null;
  let activeMode = 'vector';
  let boundMap = null;
  const basemapLayers = [];
  /** Per-map theme lock: 'dark' | 'light' | null (follow UI theme). */
  const mapThemeLock = new WeakMap();

  function canUseMapLibre() {
    return typeof L !== 'undefined' && typeof L.maplibreGL === 'function';
  }

  function isMobileMap() {
    return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  }

  function getMapPixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    if (isMobileMap()) return Math.min(dpr, 1.5);
    return Math.min(dpr, 2);
  }

  function uiTheme() {
    if (typeof WorldChoirTheme !== 'undefined' && WorldChoirTheme.get) {
      return WorldChoirTheme.get() === 'light' ? 'light' : 'dark';
    }
    try {
      return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  }

  function themeForMap(map) {
    const locked = map ? mapThemeLock.get(map) : null;
    if (locked === 'dark' || locked === 'light') return locked;
    return uiTheme();
  }

  function vectorStyleUrl(map) {
    return themeForMap(map) === 'light' ? CARTO_LIGHT_VECTOR_STYLE : CARTO_DARK_VECTOR_STYLE;
  }

  function rasterProxyUrl(map) {
    const theme = themeForMap(map) === 'light' ? 'light' : 'dark';
    return `${PROXY_URL}&theme=${theme}`;
  }

  async function detectMode() {
    if (resolvePromise) return resolvePromise;

    resolvePromise = (async () => {
      if (!canUseMapLibre()) {
        activeMode = 'raster';
        return activeMode;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 350);
        const res = await fetch('/api/map-config', {
          cache: 'force-cache',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data?.provider === 'carto') {
            activeMode = 'raster';
            return activeMode;
          }
        }
      } catch {
        /* vector is the default */
      }

      activeMode = 'vector';
      return activeMode;
    })();

    return resolvePromise;
  }

  function trackLayer(layer) {
    basemapLayers.push(layer);
    return layer;
  }

  function removeBasemapLayers(map) {
    basemapLayers.forEach((layer) => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    });
    basemapLayers.length = 0;
  }

  function createVectorLayer(map) {
    return L.maplibreGL({
      style: vectorStyleUrl(map),
      interactive: false,
      // App-tuned padding (library default is 0.1). Keep non-zero so the GL
      // canvas stays aligned with Leaflet marker overlays.
      padding: 0.04,
      antialias: !isMobileMap(),
      fadeDuration: 0,
      pixelRatio: getMapPixelRatio(),
      refreshExpiredTiles: false,
      maxPitch: 0,
    });
  }

  function createRasterLayer(map, overrides = {}) {
    return L.tileLayer(rasterProxyUrl(map), {
      ...SHARED_RASTER_OPTS,
      ...overrides,
    });
  }

  function addRasterBasemapLayers(map) {
    trackLayer(
      createRasterLayer(map, {
        minZoom: 2,
        maxZoom: 2,
        maxNativeZoom: 19,
        className: 'map-tile-layer map-tile-layer--base',
        updateWhenZooming: false,
        updateWhenIdle: true,
      }).addTo(map)
    );

    trackLayer(
      createRasterLayer(map, {
        minZoom: 2,
        maxZoom: 19,
        className: 'map-tile-layer map-tile-layer--detail',
        updateWhenZooming: true,
        updateWhenIdle: true,
        keepBuffer: isMobileMap() ? 2 : 4,
      }).addTo(map)
    );
  }

  function maybeUpgradeToRaster(map) {
    detectMode().then((mode) => {
      if (mode !== 'raster' || !map || basemapLayers.length === 0) return;
      if (activeMode === 'raster' && basemapLayers.some((layer) => layer instanceof L.TileLayer)) return;
      removeBasemapLayers(map);
      addRasterBasemapLayers(map);
    }).catch(() => {});
  }

  function applyThemeLock(map, options = {}) {
    if (!map) return;
    if (options.theme === 'dark' || options.theme === 'light') {
      mapThemeLock.set(map, options.theme);
    } else if (options.theme === 'auto') {
      mapThemeLock.delete(map);
    }
  }

  function addBasemapLayers(map, options = {}) {
    boundMap = map;
    applyThemeLock(map, options);
    removeBasemapLayers(map);

    if (canUseMapLibre()) {
      trackLayer(createVectorLayer(map).addTo(map));
      maybeUpgradeToRaster(map);
      return 'vector';
    }

    addRasterBasemapLayers(map);
    activeMode = 'raster';
    return 'raster';
  }

  function addSingleBasemapLayer(map, options = {}) {
    boundMap = map;
    applyThemeLock(map, options);
    removeBasemapLayers(map);

    if (canUseMapLibre()) {
      trackLayer(createVectorLayer(map).addTo(map));
      maybeUpgradeToRaster(map);
      return 'vector';
    }

    trackLayer(
      createRasterLayer(map, {
        minZoom: 2,
        maxZoom: 19,
      }).addTo(map)
    );
    activeMode = 'raster';
    return 'raster';
  }

  function refreshTheme(map = boundMap) {
    if (!map) return;
    addBasemapLayers(map);
    syncToMap(map);
  }

  /**
   * Hard-resync MapLibre GL to Leaflet's center/zoom.
   * Fixes basemap drift that makes city lights look geographically wrong
   * (e.g. Braga appearing over southern Spain) after extreme zoom-out.
   */
  function syncToMap(map) {
    if (!map) return;
    basemapLayers.forEach((layer) => {
      if (!layer) return;
      try {
        // Clear sticky zooming flag that can block _update after interrupted zooms.
        if (layer._zooming) layer._zooming = false;

        const gl = typeof layer.getMaplibreMap === 'function' ? layer.getMaplibreMap() : null;
        if (gl) {
          const canvas = gl.getCanvas?.() || layer._glMap?._actualCanvas;
          if (canvas) {
            // Drop any leftover CSS zoom transform from maplibre-gl-leaflet.
            L.DomUtil.setTransform(canvas, null, 1);
          }
          const center = map.getCenter();
          gl.jumpTo({
            center: [center.lng, center.lat],
            zoom: map.getZoom() - 1,
          });
        }

        if (typeof layer._update === 'function') {
          layer._update();
        }
      } catch {
        /* ignore sync failures */
      }
    });
  }

  function warmBasemap() {
    try {
      fetch(CARTO_DARK_VECTOR_STYLE, { cache: 'force-cache', mode: 'cors' }).catch(() => {});
      fetch(CARTO_LIGHT_VECTOR_STYLE, { cache: 'force-cache', mode: 'cors' }).catch(() => {});
      fetch('/api/map-config', { cache: 'force-cache' }).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('wc:themechange', () => {
      refreshTheme();
    });
  }

  return {
    detectMode,
    canUseMapLibre,
    addBasemapLayers,
    addSingleBasemapLayer,
    syncToMap,
    warmBasemap,
    refreshTheme,
  };
})();
