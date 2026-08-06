/**
 * FoundationsStore — scalable charity catalog for Donate.
 * Admin can later replace the static catalog with Blob/API without UI changes.
 *
 * Future hooks (not implemented):
 * - search / filter by cause / country
 * - pagination / virtualization
 * - donation history / tax receipts
 * - multi-currency / localization
 */
const FoundationsStore = (() => {
  const CATALOG_URL = 'data/foundations.json';
  const PAGE_SIZE = 24;

  let catalog = null;
  let loadPromise = null;
  let loadError = null;

  async function load() {
    if (catalog) return catalog;
    if (loadPromise) return loadPromise;

    loadPromise = fetch(CATALOG_URL, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load foundations.');
        const data = await res.json();
        catalog = {
          version: data.version || 1,
          currency: data.currency || 'EUR',
          suggestedAmounts: data.suggestedAmounts || [5, 10, 25, 50, 100],
          foundations: Array.isArray(data.foundations) ? data.foundations : [],
        };
        loadError = null;
        return catalog;
      })
      .catch((err) => {
        loadError = err;
        loadPromise = null;
        throw err;
      });

    return loadPromise;
  }

  function ready() {
    return load();
  }

  function getCurrency() {
    return catalog?.currency || 'EUR';
  }

  function getSuggestedAmounts() {
    return catalog?.suggestedAmounts || [5, 10, 25, 50, 100];
  }

  function normalize(foundation) {
    return {
      id: foundation.id,
      name: foundation.name,
      logo: foundation.logo || '',
      description: foundation.description || '',
      longDescription: foundation.longDescription || foundation.description || '',
      country: foundation.country || 'Global',
      categories: foundation.categories || [],
      website: foundation.website || '',
      verificationStatus: foundation.verificationStatus || 'unverified',
      impactMetrics: foundation.impactMetrics || [],
      photos: foundation.photos || [],
      howDonationsAreUsed: foundation.howDonationsAreUsed || '',
      transparency: foundation.transparency || '',
      recentUpdates: foundation.recentUpdates || [],
      donationUrl: foundation.donationUrl || '',
      featured: foundation.featured === true,
      active: foundation.active !== false,
      sortOrder: Number.isFinite(foundation.sortOrder) ? foundation.sortOrder : 9999,
      donationsEnabled: foundation.donationsEnabled !== false,
    };
  }

  function listActive(options = {}) {
    const {
      featuredOnly = false,
      category = null,
      country = null,
      query = '',
      page = 1,
      pageSize = PAGE_SIZE,
    } = options;

    if (!catalog) return { items: [], total: 0, page, pageSize, hasMore: false };

    let items = catalog.foundations
      .map(normalize)
      .filter((f) => f.active);

    if (featuredOnly) items = items.filter((f) => f.featured);
    if (category) {
      const needle = String(category).toLowerCase();
      items = items.filter((f) => f.categories.some((c) => c.toLowerCase() === needle));
    }
    if (country) {
      const needle = String(country).toLowerCase();
      items = items.filter((f) => f.country.toLowerCase() === needle);
    }
    if (query) {
      const q = String(query).trim().toLowerCase();
      items = items.filter((f) =>
        f.name.toLowerCase().includes(q)
        || f.description.toLowerCase().includes(q)
        || f.categories.some((c) => c.toLowerCase().includes(q))
        || f.country.toLowerCase().includes(q)
      );
    }

    items.sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });

    const total = items.length;
    const start = Math.max(0, (page - 1) * pageSize);
    const paged = items.slice(start, start + pageSize);

    return {
      items: paged,
      total,
      page,
      pageSize,
      hasMore: start + pageSize < total,
    };
  }

  function getById(id) {
    if (!catalog) return null;
    const found = catalog.foundations.find((f) => f.id === id && f.active !== false);
    return found ? normalize(found) : null;
  }

  function getLoadError() {
    return loadError;
  }

  function isLoaded() {
    return !!catalog;
  }

  /**
   * Admin-ready surface (client stub).
   * Future server admin will mutate Blob-backed catalog; UI keeps using these methods.
   */
  const Admin = {
    listAll() {
      if (!catalog) return [];
      return catalog.foundations.map(normalize);
    },
    // Placeholders for future admin panel — not exposed in UI.
    create() { throw new Error('Admin create not available in this build.'); },
    update() { throw new Error('Admin update not available in this build.'); },
    remove() { throw new Error('Admin remove not available in this build.'); },
    setFeatured() { throw new Error('Admin feature toggle not available in this build.'); },
    setActive() { throw new Error('Admin disable not available in this build.'); },
    reorder() { throw new Error('Admin reorder not available in this build.'); },
  };

  return {
    ready,
    load,
    isLoaded,
    getLoadError,
    getCurrency,
    getSuggestedAmounts,
    listActive,
    getById,
    Admin,
    PAGE_SIZE,
  };
})();
