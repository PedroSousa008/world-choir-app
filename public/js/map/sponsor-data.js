/**
 * Map sponsor data layer — public sponsor records for the Map sponsor bar.
 *
 * Consumes Owner-controlled records when available via /api/map-sponsors.
 * Seed data is isolated for development (?sponsorDemo=1) and must not ship as production truth.
 */
const MapSponsorData = (() => {
  const API_URL = '/api/map-sponsors';
  const SEED_URL = 'data/map-sponsors.seed.json';
  const CACHE_KEY = 'wc_map_sponsors_v1';

  let cache = null;
  let loadPromise = null;

  function isDemoMode() {
    try {
      return new URLSearchParams(window.location.search).get('sponsorDemo') === '1';
    } catch {
      return false;
    }
  }

  function normalizeWebsiteUrl(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    try {
      const parsed = new URL(value.startsWith('http') ? value : `https://${value}`);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      return parsed.href;
    } catch {
      return '';
    }
  }

  /**
   * Normalize a raw sponsor record to the public shape consumed by the sponsor bar.
   * Drops malformed records and never exposes private contract fields.
   */
  function normalizeSponsor(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const id = String(raw.id || '').trim();
    const companyName = String(raw.companyName || '').trim();
    const logo = String(raw.logo || raw.companyLogoUrl || '').trim();

    if (!id || !companyName || !logo) return null;

    const isActive = raw.isActive !== false && raw.isActive !== 0 && raw.isActive !== '0';

    return {
      id,
      companyName,
      logo,
      websiteUrl: normalizeWebsiteUrl(raw.websiteUrl || raw.companyWebsiteUrl),
      isActive,
      displayOrder: Number.isFinite(Number(raw.displayOrder)) ? Number(raw.displayOrder) : 0,
    };
  }

  function sortActiveSponsors(sponsors) {
    return sponsors
      .filter((s) => s && s.isActive)
      .sort((a, b) => {
        if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
        return a.companyName.localeCompare(b.companyName);
      });
  }

  async function fetchJson(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Failed to load sponsors from ${url}`);
    return res.json();
  }

  function extractSponsorList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.sponsors)) return payload.sponsors;
    return [];
  }

  function readLocalCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.sponsors)) return null;
      return sortActiveSponsors(
        parsed.sponsors.map(normalizeSponsor).filter(Boolean)
      );
    } catch {
      return null;
    }
  }

  function writeLocalCache(sponsors) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        sponsors,
        savedAt: Date.now(),
      }));
    } catch {
      /* ignore quota / private mode */
    }
  }

  async function fetchSponsorsFromNetwork() {
    let rows = [];

    if (isDemoMode()) {
      try {
        const seed = await fetchJson(SEED_URL);
        rows = extractSponsorList(seed);
      } catch (err) {
        console.warn('Map sponsor seed data unavailable:', err);
      }
    } else {
      try {
        const api = await fetchJson(API_URL);
        rows = extractSponsorList(api);
      } catch (err) {
        console.warn('Map sponsor API unavailable:', err);
      }
    }

    return sortActiveSponsors(
      rows.map(normalizeSponsor).filter(Boolean)
    );
  }

  function refreshInBackground() {
    fetchSponsorsFromNetwork()
      .then((fresh) => {
        if (!fresh.length) return;
        cache = fresh;
        writeLocalCache(fresh);
      })
      .catch(() => {});
  }

  async function load() {
    if (cache) return cache.slice();
    if (loadPromise) return loadPromise;

    const stale = readLocalCache();
    if (stale?.length) {
      cache = stale;
      refreshInBackground();
      return cache.slice();
    }

    loadPromise = (async () => {
      cache = await fetchSponsorsFromNetwork();
      if (cache.length) writeLocalCache(cache);
      return cache.slice();
    })();

    try {
      return await loadPromise;
    } finally {
      loadPromise = null;
    }
  }

  function prefetch() {
    if (!cache && !loadPromise) load();
  }

  function invalidate() {
    cache = null;
    loadPromise = null;
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch {
      /* ignore */
    }
  }

  if (typeof window !== 'undefined') {
    const warm = () => prefetch();
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(warm, { timeout: 800 });
    } else {
      window.setTimeout(warm, 0);
    }
  }

  return {
    load,
    prefetch,
    invalidate,
    normalizeSponsor,
    normalizeWebsiteUrl,
    isDemoMode,
  };
})();
