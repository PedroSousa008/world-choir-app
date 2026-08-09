/**
 * CreatorFoundationsStore — curated Creator Foundations catalog for Donate.
 *
 * Scales to thousands of foundations / projects via pagination + future API/Blob.
 * Admin, discovery, and user-profile surfaces are stubbed for future expansion.
 */
const CreatorFoundationsStore = (() => {
  const CATALOG_URL = 'data/creator-foundations.json';
  const PAGE_SIZE = 24;

  let catalog = null;
  let loadPromise = null;
  let loadError = null;

  async function load() {
    if (catalog) return catalog;
    if (loadPromise) return loadPromise;

    loadPromise = fetch(CATALOG_URL, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load Creator Foundations.');
        const data = await res.json();
        catalog = {
          version: data.version || 2,
          platform: data.platform || { feePercent: 5 },
          currency: data.currency || 'EUR',
          supportedCurrencies: data.supportedCurrencies || ['EUR'],
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

  function yearsActiveFrom(foundation) {
    if (Number.isFinite(foundation.yearsActive)) return foundation.yearsActive;
    if (!foundation.foundedDate) return null;
    const founded = new Date(foundation.foundedDate);
    if (Number.isNaN(founded.getTime())) return null;
    return Math.max(0, new Date().getFullYear() - founded.getFullYear());
  }

  function normalizeProject(project, foundationId) {
    return {
      id: project.id,
      foundationId: project.foundationId || foundationId,
      title: project.title || '',
      description: project.description || '',
      goalAmount: Number(project.goalAmount) || 0,
      raisedAmount: Number(project.raisedAmount) || 0,
      currency: project.currency || catalog?.currency || 'EUR',
      location: project.location || '',
      startDate: project.startDate || null,
      expectedCompletion: project.expectedCompletion || null,
      completionDate: project.completionDate || null,
      status: project.status || 'active',
      gallery: project.gallery || [],
      videos: project.videos || [],
      beforeImages: project.beforeImages || [],
      afterImages: project.afterImages || [],
      impactSummary: project.impactSummary || '',
      updates: Array.isArray(project.updates) ? project.updates : [],
    };
  }

  function normalize(foundation) {
    const projects = (foundation.projects || []).map((p) => normalizeProject(p, foundation.id));
    const activeProjects = projects.filter((p) => p.status === 'active');

    return {
      id: foundation.id,
      slug: foundation.slug || foundation.id,
      creatorName: foundation.creatorName || '',
      foundationName: foundation.foundationName || '',
      mission: foundation.mission || '',
      biography: foundation.biography || '',
      whyStarted: foundation.whyStarted || '',
      howItWorks: foundation.howItWorks || '',
      coreValues: foundation.coreValues || [],
      country: foundation.country || 'Global',
      languages: foundation.languages || [],
      categories: foundation.categories || [],
      primaryCategory: foundation.primaryCategory || (foundation.categories && foundation.categories[0]) || '',
      profileImage: foundation.profileImage || '',
      coverImage: foundation.coverImage || '',
      verificationStatus: foundation.verificationStatus || 'unverified',
      verificationNotes: foundation.verificationNotes || '',
      foundedDate: foundation.foundedDate || null,
      yearsActive: yearsActiveFrom(foundation),
      website: foundation.website || '',
      socialLinks: foundation.socialLinks || {},
      impactMetrics: foundation.impactMetrics || [],
      legalOrganization: foundation.legalOrganization || null,
      financialAllocation: foundation.financialAllocation || [],
      howDonationsAreUsed: foundation.howDonationsAreUsed || '',
      donorCount: Number(foundation.donorCount) || 0,
      activeProjectCount: activeProjects.length,
      projects,
      featured: foundation.featured === true,
      active: foundation.active !== false,
      donationsEnabled: foundation.donationsEnabled !== false,
      sortOrder: Number.isFinite(foundation.sortOrder) ? foundation.sortOrder : 9999,
    };
  }

  function getPlatform() {
    return catalog?.platform || { feePercent: 5, feePurpose: '' };
  }

  function getCurrency() {
    return catalog?.currency || 'EUR';
  }

  function getSupportedCurrencies() {
    return catalog?.supportedCurrencies || ['EUR'];
  }

  function getSuggestedAmounts() {
    return catalog?.suggestedAmounts || [5, 10, 25, 50, 100];
  }

  /**
   * Discovery API (architecture ready — UI not implemented yet).
   * Supports: creator, foundation, country, category, featured, recentlyUpdated, mostActive, trending.
   */
  function listActive(options = {}) {
    const {
      featuredOnly = false,
      category = null,
      country = null,
      query = '',
      sort = 'featured',
      page = 1,
      pageSize = PAGE_SIZE,
    } = options;

    if (!catalog) return { items: [], total: 0, page, pageSize, hasMore: false };

    let items = catalog.foundations.map(normalize).filter((f) => f.active);

    if (featuredOnly) items = items.filter((f) => f.featured);
    if (category) {
      const needle = String(category).toLowerCase();
      items = items.filter((f) =>
        f.primaryCategory.toLowerCase() === needle
        || f.categories.some((c) => c.toLowerCase() === needle)
      );
    }
    if (country) {
      const needle = String(country).toLowerCase();
      items = items.filter((f) => f.country.toLowerCase() === needle);
    }
    if (query) {
      const q = String(query).trim().toLowerCase();
      items = items.filter((f) =>
        f.creatorName.toLowerCase().includes(q)
        || f.foundationName.toLowerCase().includes(q)
        || f.mission.toLowerCase().includes(q)
        || f.country.toLowerCase().includes(q)
        || f.categories.some((c) => c.toLowerCase().includes(q))
      );
    }

    items.sort((a, b) => {
      if (sort === 'mostActive') return b.activeProjectCount - a.activeProjectCount || b.donorCount - a.donorCount;
      if (sort === 'trending') return b.donorCount - a.donorCount;
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.creatorName.localeCompare(b.creatorName);
    });

    const total = items.length;
    const start = Math.max(0, (page - 1) * pageSize);
    const paged = items.slice(start, start + pageSize);

    return { items: paged, total, page, pageSize, hasMore: start + pageSize < total };
  }

  function getById(id) {
    if (!catalog) return null;
    const found = catalog.foundations.find((f) => (f.id === id || f.slug === id) && f.active !== false);
    return found ? normalize(found) : null;
  }

  function getBySlug(slug) {
    return getById(slug);
  }

  function getProject(foundationId, projectId) {
    const foundation = getById(foundationId);
    if (!foundation) return null;
    return foundation.projects.find((p) => p.id === projectId) || null;
  }

  function isLoaded() {
    return !!catalog;
  }

  function getLoadError() {
    return loadError;
  }

  /** Future admin panel — not exposed in UI. */
  const Admin = {
    listAll() {
      if (!catalog) return [];
      return catalog.foundations.map(normalize);
    },
    approveCreator() { throw new Error('Admin approve not available in this build.'); },
    rejectCreator() { throw new Error('Admin reject not available in this build.'); },
    suspendFoundation() { throw new Error('Admin suspend not available in this build.'); },
    reviewDocumentation() { throw new Error('Admin review not available in this build.'); },
    reviewProjectUpdate() { throw new Error('Admin project review not available in this build.'); },
    approveImpactReport() { throw new Error('Admin impact approval not available in this build.'); },
    setFeatured() { throw new Error('Admin feature toggle not available in this build.'); },
    setVerificationLevel() { throw new Error('Admin verification not available in this build.'); },
    hideContent() { throw new Error('Admin moderation not available in this build.'); },
    generateReports() { throw new Error('Admin reports not available in this build.'); },
  };

  /**
   * Future user profile surface — donation history, favorites, receipts.
   * Persists locally for now; server sync later.
   */
  const UserSupport = {
    KEY: 'wc_creator_foundations_support',
    _read() {
      try {
        return JSON.parse(localStorage.getItem(this.KEY) || '{}');
      } catch {
        return {};
      }
    },
    _write(data) {
      localStorage.setItem(this.KEY, JSON.stringify(data));
    },
    recordDonation({ foundationId, amount, currency, anonymous = false, projectId = null }) {
      const data = this._read();
      data.donations = data.donations || [];
      data.donations.push({
        id: 'local_' + Date.now().toString(36),
        foundationId,
        projectId,
        amount,
        currency,
        anonymous,
        date: new Date().toISOString(),
        paymentStatus: 'completed_mock',
      });
      data.supportedFoundationIds = Array.from(new Set([
        ...(data.supportedFoundationIds || []),
        foundationId,
      ]));
      this._write(data);
      return data.donations[data.donations.length - 1];
    },
    getDonationHistory() {
      return this._read().donations || [];
    },
    getSupportedFoundationIds() {
      return this._read().supportedFoundationIds || [];
    },
    getFavorites() {
      return this._read().favoriteFoundationIds || [];
    },
    toggleFavorite(foundationId) {
      const data = this._read();
      const set = new Set(data.favoriteFoundationIds || []);
      if (set.has(foundationId)) set.delete(foundationId);
      else set.add(foundationId);
      data.favoriteFoundationIds = Array.from(set);
      this._write(data);
      return data.favoriteFoundationIds;
    },
    getSavedProjects() {
      return this._read().savedProjectIds || [];
    },
  };

  return {
    ready,
    load,
    isLoaded,
    getLoadError,
    getPlatform,
    getCurrency,
    getSupportedCurrencies,
    getSuggestedAmounts,
    listActive,
    getById,
    getBySlug,
    getProject,
    Admin,
    UserSupport,
    PAGE_SIZE,
  };
})();

/** Backward-compatible alias while Donate tab migrates. */
const FoundationsStore = CreatorFoundationsStore;
