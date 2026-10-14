/**
 * World Choir — shared map basemap tiles
 *
 * Preferred look (unchanged): MapLibre + Carto vector
 *   Dark → Dark Matter (no labels)
 *   Light → Positron (no labels)
 *
 * Fallback: same-theme Carto raster (public CDN first; /api/map-tile as backup).
 * Never force a vector→raster downgrade — that would change how maps look.
 */
const WorldChoirMapTiles = (() => {
  const CARTO_DARK_VECTOR_STYLE =
    'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';
  const CARTO_LIGHT_VECTOR_STYLE =
    'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json';

  const PROXY_URL = '/api/map-tile?z={z}&x={x}&y={y}&r={r}';
  /** Public Carto CDN — same dark_nolabels / light_nolabels look as the proxy. */
  const PUBLIC_DARK_RASTER =
    'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png';
  const PUBLIC_LIGHT_RASTER =
    'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';

  const SHARED_RASTER_OPTS = {
    subdomains: 'abcd',
    noWrap: true,
    bounds: [[-85, -180], [85, 180]],
  };

  /** Raster path uses public CDN first so maps never flash proxy 503s. */
  let preferPublicRaster = true;
  let proxyKnownGood = false;

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

  function rasterPublicUrl(map) {
    return themeForMap(map) === 'light' ? PUBLIC_LIGHT_RASTER : PUBLIC_DARK_RASTER;
  }

  function rasterProxyUrl(map) {
    const theme = themeForMap(map) === 'light' ? 'light' : 'dark';
    return `${PROXY_URL}&theme=${theme}`;
  }

  function rasterTileUrl(map) {
    if (preferPublicRaster || !proxyKnownGood) return rasterPublicUrl(map);
    return rasterProxyUrl(map);
  }

  /**
   * Preferred mode is always vector when MapLibre is available.
   * map-config is informational only — never downgrades to raster.
   */
  async function detectMode() {
    if (resolvePromise) return resolvePromise;

    resolvePromise = (async () => {
      if (!canUseMapLibre()) {
        activeMode = 'raster';
        return activeMode;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 400);
        const res = await fetch('/api/map-config', {
          cache: 'force-cache',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          // Older servers returned provider:'carto' to force raster — ignore that.
          // Only honor an explicit preferredMode:'raster' (not used in production).
          if (data?.preferredMode === 'raster') {
            activeMode = 'raster';
            return activeMode;
          }
          if (data?.rasterProxy === true) {
            proxyKnownGood = true;
          }
        }
      } catch {
        /* vector stays the default */
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
    return L.tileLayer(rasterTileUrl(map), {
      ...SHARED_RASTER_OPTS,
      ...overrides,
    });
  }

  function bindRasterTileFallback(layer, map) {
    if (!layer || typeof layer.on !== 'function') return layer;
    let flipped = false;
    layer.on('tileerror', () => {
      if (flipped) return;
      // If public CDN failed, try the proxy once (same visual theme).
      if (preferPublicRaster && proxyKnownGood) {
        flipped = true;
        preferPublicRaster = false;
        try {
          removeBasemapLayers(map);
          addRasterBasemapLayers(map);
        } catch {
          /* ignore */
        }
        return;
      }
      // If proxy failed, fall back to public CDN.
      if (!preferPublicRaster) {
        flipped = true;
        preferPublicRaster = true;
        try {
          removeBasemapLayers(map);
          addRasterBasemapLayers(map);
        } catch {
          /* ignore */
        }
      }
    });
    return layer;
  }

  function addRasterBasemapLayers(map) {
    trackLayer(
      bindRasterTileFallback(
        createRasterLayer(map, {
          minZoom: 2,
          maxZoom: 2,
          maxNativeZoom: 19,
          className: 'map-tile-layer map-tile-layer--base',
          updateWhenZooming: false,
          updateWhenIdle: true,
        }),
        map
      ).addTo(map)
    );

    trackLayer(
      bindRasterTileFallback(
        createRasterLayer(map, {
          minZoom: 2,
          maxZoom: 19,
          className: 'map-tile-layer map-tile-layer--detail',
          updateWhenZooming: true,
          updateWhenIdle: true,
          keepBuffer: isMobileMap() ? 2 : 4,
        }),
        map
      ).addTo(map)
    );
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
      try {
        const layer = createVectorLayer(map).addTo(map);
        trackLayer(layer);
        activeMode = 'vector';
        // Warm config in the background (proxy readiness) — do not swap basemap.
        detectMode().catch(() => {});
        // If the GL style fails, fall back to same-theme Carto raster (never blank).
        const gl = typeof layer.getMaplibreMap === 'function' ? layer.getMaplibreMap() : null;
        gl?.on?.('error', () => {
          try {
            preferPublicRaster = true;
            removeBasemapLayers(map);
            addRasterBasemapLayers(map);
            activeMode = 'raster';
          } catch {
            /* ignore */
          }
        });
        return 'vector';
      } catch {
        preferPublicRaster = true;
        addRasterBasemapLayers(map);
        activeMode = 'raster';
        return 'raster';
      }
    }

    preferPublicRaster = true;
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
      activeMode = 'vector';
      detectMode().catch(() => {});
      return 'vector';
    }

    preferPublicRaster = true;
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
    try {
      const size = map.getSize?.();
      if (!size || !(size.x > 0) || !(size.y > 0)) return;
      const center = map.getCenter?.();
      if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;
    } catch {
      return;
    }
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
          if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;
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
      // Soft-probe proxy so fallback knows it is healthy (same visual theme).
      fetch('/api/map-tile?z=0&x=0&y=0&theme=dark', { cache: 'force-cache' })
        .then((res) => {
          if (res.ok) proxyKnownGood = true;
        })
        .catch(() => {});
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
