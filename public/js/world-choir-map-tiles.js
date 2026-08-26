/**
 * World Choir — shared map basemap tiles
 *
 * Carto raster tiles now require an API key (watermark without one).
 * We prefer /api/map-tile when CARTO_API_KEY is configured on Vercel;
 * otherwise Esri World Dark Gray Base — free, dark, no labels, no key.
 */
const WorldChoirMapTiles = (() => {
  const ESRI_DARK_URL =
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';

  const PROXY_URL = '/api/map-tile?z={z}&x={x}&y={y}&r={r}';

  const SHARED_OPTS = {
    noWrap: true,
    bounds: [[-85, -180], [85, 180]],
  };

  let resolvedProvider = 'esri';
  let resolvePromise = null;
  let fallbackInProgress = false;

  async function detectProvider() {
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
            resolvedProvider = 'carto';
            return resolvedProvider;
          }
        }
      } catch {
        /* fall through to Esri */
      }

      resolvedProvider = 'esri';
      return resolvedProvider;
    })();

    return resolvePromise;
  }

  function isTileLayer(layer) {
    return layer instanceof L.TileLayer;
  }

  function removeBasemapLayers(map) {
    map.eachLayer((layer) => {
      if (isTileLayer(layer)) map.removeLayer(layer);
    });
  }

  async function switchToEsriFallback(map) {
    if (fallbackInProgress || resolvedProvider === 'esri') return;
    fallbackInProgress = true;
    resolvedProvider = 'esri';
    removeBasemapLayers(map);
    await addBasemapLayers(map);
    fallbackInProgress = false;
  }

  function attachTileFallback(map, layer, provider) {
    if (provider !== 'carto') return;
    layer.on('tileerror', () => {
      switchToEsriFallback(map);
    });
  }

  function getTileUrl(provider) {
    return provider === 'carto' ? PROXY_URL : ESRI_DARK_URL;
  }

  function getTileOptions(provider, overrides = {}) {
    const base =
      provider === 'carto'
        ? { ...SHARED_OPTS, subdomains: 'abcd', maxZoom: 19 }
        : { ...SHARED_OPTS, maxZoom: 16 };

    return { ...base, ...overrides };
  }

  /**
   * Add the standard World Choir basemap layers (low-res underlay + detail).
   * Returns a promise so callers can await provider detection before showing the map.
   */
  async function addBasemapLayers(map) {
    const provider = await detectProvider();
    const tileUrl = getTileUrl(provider);

    const baseLayer = L.tileLayer(tileUrl, getTileOptions(provider, {
      minZoom: 2,
      maxZoom: 2,
      className: 'map-tile-layer map-tile-layer--base',
      updateWhenZooming: false,
      updateWhenIdle: true,
    })).addTo(map);
    attachTileFallback(map, baseLayer, provider);

    const detailLayer = L.tileLayer(tileUrl, getTileOptions(provider, {
      minZoom: 2,
      maxZoom: provider === 'carto' ? 19 : 16,
      className: 'map-tile-layer map-tile-layer--detail',
      updateWhenZooming: true,
      updateWhenIdle: true,
      keepBuffer: 4,
    })).addTo(map);
    attachTileFallback(map, detailLayer, provider);

    return provider;
  }

  /** Single detail layer for simpler maps (e.g. owner dashboard). */
  async function addSingleBasemapLayer(map) {
    const provider = await detectProvider();
    const layer = L.tileLayer(getTileUrl(provider), getTileOptions(provider, {
      minZoom: 2,
      maxZoom: provider === 'carto' ? 19 : 16,
    })).addTo(map);
    attachTileFallback(map, layer, provider);
    return provider;
  }

  return {
    detectProvider,
    addBasemapLayers,
    addSingleBasemapLayer,
  };
})();
