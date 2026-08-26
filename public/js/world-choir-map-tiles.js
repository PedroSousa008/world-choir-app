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

  async function detectMode() {
    if (resolvePromise) return resolvePromise;

    resolvePromise = (async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const res = await fetch('/api/map-config', {
          cache: 'no-store',
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
        /* use vector */
      }

      activeMode = canUseMapLibre() ? 'vector' : 'raster';
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
      padding: 0.05,
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
        keepBuffer: 4,
      }).addTo(map)
    );
  }

  async function addBasemapLayers(map) {
    removeBasemapLayers(map);
    const mode = await detectMode();

    if (mode === 'raster') {
      addRasterBasemapLayers(map);
      return mode;
    }

    if (!canUseMapLibre()) {
      addRasterBasemapLayers(map);
      return 'raster';
    }

    trackLayer(createVectorLayer().addTo(map));
    return 'vector';
  }

  async function addSingleBasemapLayer(map) {
    removeBasemapLayers(map);
    const mode = await detectMode();

    if (mode === 'raster') {
      trackLayer(
        createRasterLayer({
          minZoom: 2,
          maxZoom: 19,
        }).addTo(map)
      );
      return mode;
    }

    if (!canUseMapLibre()) {
      trackLayer(
        createRasterLayer({
          minZoom: 2,
          maxZoom: 19,
        }).addTo(map)
      );
      return 'raster';
    }

    trackLayer(createVectorLayer().addTo(map));
    return 'vector';
  }

  return {
    detectMode,
    addBasemapLayers,
    addSingleBasemapLayer,
  };
})();
