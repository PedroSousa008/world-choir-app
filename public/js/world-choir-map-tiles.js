/**
 * World Choir — shared map basemap tiles
 *
 * Primary: Carto Dark Matter (no labels) via MapLibre vector — deep black tones, no API key.
 * Optional: Carto raster via /api/map-tile when CARTO_API_KEY is set on Vercel.
 */
const WorldChoirMapTiles = (() => {
  const CARTO_DARK_VECTOR_STYLE =
    'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';

  const PROXY_URL = '/api/map-tile?z={z}&x={x}&y={y}&r={r}';

  const SHARED_RASTER_OPTS = {
    subdomains: 'abcd',
    noWrap: true,
    bounds: [[-85, -180], [85, 180]],
  };

  let resolvePromise = null;
  let activeMode = 'vector';
  const basemapLayers = [];

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

  function createVectorLayer() {
    return L.maplibreGL({
      style: CARTO_DARK_VECTOR_STYLE,
      interactive: false,
      padding: 0.04,
      antialias: !isMobileMap(),
      fadeDuration: 0,
      pixelRatio: getMapPixelRatio(),
      refreshExpiredTiles: false,
      maxPitch: 0,
    });
  }

  function createRasterLayer(overrides = {}) {
    return L.tileLayer(PROXY_URL, {
      ...SHARED_RASTER_OPTS,
      ...overrides,
    });
  }

  function addRasterBasemapLayers(map) {
    trackLayer(
      createRasterLayer({
        minZoom: 2,
        maxZoom: 2,
        maxNativeZoom: 19,
        className: 'map-tile-layer map-tile-layer--base',
        updateWhenZooming: false,
        updateWhenIdle: true,
      }).addTo(map)
    );

    trackLayer(
      createRasterLayer({
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

  function addBasemapLayers(map) {
    removeBasemapLayers(map);

    if (canUseMapLibre()) {
      trackLayer(createVectorLayer().addTo(map));
      maybeUpgradeToRaster(map);
      return 'vector';
    }

    addRasterBasemapLayers(map);
    activeMode = 'raster';
    return 'raster';
  }

  function addSingleBasemapLayer(map) {
    removeBasemapLayers(map);

    if (canUseMapLibre()) {
      trackLayer(createVectorLayer().addTo(map));
      maybeUpgradeToRaster(map);
      return 'vector';
    }

    trackLayer(
      createRasterLayer({
        minZoom: 2,
        maxZoom: 19,
      }).addTo(map)
    );
    activeMode = 'raster';
    return 'raster';
  }

  function warmBasemap() {
    try {
      fetch(CARTO_DARK_VECTOR_STYLE, { cache: 'force-cache', mode: 'cors' }).catch(() => {});
      fetch('/api/map-config', { cache: 'force-cache' }).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  return {
    detectMode,
    addBasemapLayers,
    addSingleBasemapLayer,
    warmBasemap,
  };
})();
