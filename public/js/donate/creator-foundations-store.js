/**
 * CreatorFoundationsStore — production-safe Creator Foundations data layer.
 *
 * DATA POLICY
 * - Creator-provided fields: display only as submitted/approved.
 * - Platform stats (supporters, raised totals, progress): calculated from verified donation records only.
 * - Never invent, estimate, or hard-code public statistics.
 * - Mock / demo payments never inflate public totals.
 *
 * Demo catalog loads only when ?cfDemo=1 is present (development).
 */
const CreatorFoundationsStore = (() => {
  const PRODUCTION_URL = '/api/creator-foundations';
  const FALLBACK_URL = 'data/creator-foundations.json';
  const DEMO_URL = 'data/creator-foundations.demo.json';
  const PAGE_SIZE = 24;
  const FOUNDATION_CAUSES = [
    'Food & Hunger',
    'Health',
    'Education',
    'Humanitarian Aid',
    'Environment',
  ];
  const CAUSE_ALIASES = {
    'humanity help': 'Humanitarian Aid',
    humanitarian: 'Humanitarian Aid',
    'humanitarian aid': 'Humanitarian Aid',
    food: 'Food & Hunger',
    hunger: 'Food & Hunger',
    'food & hunger': 'Food & Hunger',
    'food and hunger': 'Food & Hunger',
    health: 'Health',
    education: 'Education',
    environment: 'Environment',
    climate: 'Environment',
    nature: 'Environment',
  };
  const KNOWN_CAUSE_BY_ID = {
    '689fa965-53cd-4c00-be66-36668962e852': 'Humanitarian Aid',
    '1857e734-e1f9-444b-ade9-be550009019e': 'Education',
  };
  const SUCCESS_STATUSES = new Set(['succeeded', 'completed', 'paid']);
  const EXCLUDED_STATUSES = new Set([
    'failed',
    'cancelled',
    'canceled',
    'refunded',
    'reversed',
    'fraudulent',
    'pending',
    'completed_mock',
    'mock',
  ]);

  let catalog = null;
  let loadPromise = null;
  let loadError = null;
  let isDemoCatalog = false;

  function normalizeCause(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    if (CAUSE_ALIASES[lower]) return CAUSE_ALIASES[lower];
    return FOUNDATION_CAUSES.find((c) => c.toLowerCase() === lower) || '';
  }

  function getCauses() {
    return FOUNDATION_CAUSES.slice();
  }

  function isDemoMode() {
    try {
      return new URLSearchParams(window.location.search).get('cfDemo') === '1';
    } catch {
      return false;
    }
  }

  async function load() {
    if (catalog) return catalog;
    if (loadPromise) return loadPromise;

    const useDemo = isDemoMode();

    loadPromise = (async () => {
      let data = null;

      if (useDemo) {
        const res = await fetch(DEMO_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error('Could not load Creator Foundations.');
        data = await res.json();
      } else {
        try {
          const res = await fetch(PRODUCTION_URL, { cache: 'no-store', credentials: 'omit' });
          if (res.ok) data = await res.json();
        } catch {
          data = null;
        }

        if (!data) {
          const res = await fetch(FALLBACK_URL, { cache: 'no-store' });
          if (!res.ok) throw new Error('Could not load Creator Foundations.');
          data = await res.json();
        }
      }

      if (data?.dataPolicy?.demo === true && !useDemo) {
        throw new Error('Demo catalog blocked in production mode.');
      }

      catalog = {
        version: data.version || 3,
        platform: data.platform || { feePercent: 10 },
        currency: data.currency || 'EUR',
        supportedCurrencies: data.supportedCurrencies || ['EUR'],
        suggestedAmounts: data.suggestedAmounts || [5, 10, 25, 50, 100],
        foundations: Array.isArray(data.foundations) ? data.foundations : [],
        donations: Array.isArray(data.donations) ? data.donations : [],
      };
      isDemoCatalog = useDemo || data?.dataPolicy?.demo === true;
      loadError = null;
      return catalog;
    })().catch((err) => {
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
    if (!foundation.foundedDate) return null;
    const founded = new Date(foundation.foundedDate);
    if (Number.isNaN(founded.getTime())) return null;
    const years = new Date().getFullYear() - founded.getFullYear();
    return years >= 0 ? years : null;
  }

  function isSuccessfulDonation(donation) {
    if (!donation) return false;
    const status = String(donation.paymentStatus || '').toLowerCase();
    if (EXCLUDED_STATUSES.has(status)) return false;
    if (donation.mock === true) return false;
    return SUCCESS_STATUSES.has(status);
  }

  function getVerifiedDonations(filter = {}) {
    if (!catalog) return [];
    return catalog.donations.filter((d) => {
      if (!isSuccessfulDonation(d)) return false;
      if (filter.foundationId && d.foundationId !== filter.foundationId) return false;
      if (filter.projectId && d.projectId !== filter.projectId) return false;
      return true;
    });
  }

  /** Unique supporters — one person, many gifts → one supporter. */
  function getUniqueSupporterCount(foundationId) {
    const donors = new Set();
    getVerifiedDonations({ foundationId }).forEach((d) => {
      const key = d.donorId || d.deviceId || d.userId || d.emailHash || null;
      if (key) donors.add(String(key));
    });
    return donors.size;
  }

  function getRaisedAmount(filter = {}) {
    return getVerifiedDonations(filter).reduce((sum, d) => {
      const amount = Number(d.amount);
      return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
    }, 0);
  }

  function hasVerifiedRaisedData(filter = {}) {
    return getVerifiedDonations(filter).length > 0;
  }

  function normalizeImpactMetrics(metrics) {
    if (!Array.isArray(metrics)) return [];
    return metrics.filter((m) =>
      m
      && m.label
      && m.value != null
      && m.value !== ''
      && (m.verified === true || m.approved === true)
    );
  }

  function normalizeProject(project, foundationId) {
    const goalAmount = Number(project.goalAmount);
    const raisedAmount = getRaisedAmount({
      foundationId,
      projectId: project.id,
    });
    const raisedKnown = hasVerifiedRaisedData({
      foundationId,
      projectId: project.id,
    });

    return {
      id: project.id,
      foundationId: project.foundationId || foundationId,
      title: project.title || '',
      description: project.description || '',
      goalAmount: Number.isFinite(goalAmount) && goalAmount > 0 ? goalAmount : null,
      raisedAmount: raisedKnown ? raisedAmount : null,
      raisedKnown,
      currency: project.currency || catalog?.currency || 'EUR',
      location: project.location || '',
      startDate: project.startDate || null,
      expectedCompletion: project.expectedCompletion || null,
      completionDate: project.completionDate || null,
      status: project.status || 'draft',
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
    const completedProjects = projects.filter((p) => p.status === 'completed');
    const uniqueSupporters = getUniqueSupporterCount(foundation.id);
    const totalRaised = getRaisedAmount({ foundationId: foundation.id });
    const raisedKnown = hasVerifiedRaisedData({ foundationId: foundation.id });
    const primaryCategory = normalizeCause(foundation.primaryCategory)
      || normalizeCause((foundation.categories || [])[0])
      || KNOWN_CAUSE_BY_ID[foundation.id]
      || '';

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
      country: foundation.country || '',
      languages: foundation.languages || [],
      categories: foundation.categories || [],
      primaryCategory,
      profileImage: foundation.profileImage || '',
      coverImage: foundation.coverImage || '',
      verificationStatus: foundation.verificationStatus || 'unverified',
      verificationNotes: foundation.verificationNotes || '',
      foundedDate: foundation.foundedDate || null,
      updatedAt: foundation.updatedAt || foundation.foundedDate || null,
      yearsActive: yearsActiveFrom(foundation),
      website: foundation.website || '',
      socialLinks: foundation.socialLinks || {},
      impactMetrics: normalizeImpactMetrics(foundation.impactMetrics),
      legalOrganization: foundation.legalOrganization || null,
      financialAllocation: foundation.financialAllocation || [],
      howDonationsAreUsed: foundation.howDonationsAreUsed || '',
      // Platform-generated — never from hard-coded donorCount / raisedAmount fields.
      // totalRaised is always a real ledger sum (0 until verified donations exist).
      uniqueSupporters,
      totalRaised,
      raisedKnown,
      activeProjectCount: activeProjects.length,
      completedProjectCount: completedProjects.length,
      projects,
      featured: foundation.featured === true,
      active: foundation.active !== false,
      donationsEnabled: foundation.donationsEnabled !== false,
      sortOrder: Number.isFinite(foundation.sortOrder) ? foundation.sortOrder : 9999,
    };
  }

  function getPlatform() {
    return catalog?.platform || { feePercent: 10, feePurpose: '' };
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
      const needle = normalizeCause(category) || String(category).trim();
      const needleLower = needle.toLowerCase();
      items = items.filter((f) => f.primaryCategory.toLowerCase() === needleLower);
    }
    if (country) {
      const needle = String(country).toLowerCase();
      items = items.filter((f) => {
        const c = f.country.toLowerCase();
        return c === needle || c.includes(needle) || needle.includes(c);
      });
    }
    if (query) {
      const q = String(query).trim().toLowerCase();
      items = items.filter((f) =>
        f.creatorName.toLowerCase().includes(q)
        || f.foundationName.toLowerCase().includes(q)
      );
    }

    items.sort((a, b) => {
      if (sort === 'mostActive') {
        return b.activeProjectCount - a.activeProjectCount
          || b.uniqueSupporters - a.uniqueSupporters
          || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      }
      if (sort === 'trending') {
        return b.uniqueSupporters - a.uniqueSupporters
          || b.activeProjectCount - a.activeProjectCount
          || String(b.foundedDate || '').localeCompare(String(a.foundedDate || ''));
      }
      if (sort === 'new') {
        return String(b.foundedDate || '').localeCompare(String(a.foundedDate || ''))
          || a.creatorName.localeCompare(b.creatorName);
      }
      if (sort === 'recent') {
        return String(b.updatedAt || b.foundedDate || '').localeCompare(String(a.updatedAt || a.foundedDate || ''))
          || a.creatorName.localeCompare(b.creatorName);
      }
      if (sort === 'near') {
        // Caller pre-filters by country when known; keep featured/name order.
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        return a.creatorName.localeCompare(b.creatorName);
      }
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.creatorName.localeCompare(b.creatorName);
    });

    const total = items.length;
    const start = Math.max(0, (page - 1) * pageSize);
    const paged = items.slice(start, start + pageSize);

    return { items: paged, total, page, pageSize, hasMore: start + pageSize < total };
  }

  function getFeaturedFoundation(items) {
    const list = Array.isArray(items) ? items : listActive({ page: 1, pageSize: 500 }).items;
    if (!list.length) return null;
    const withVisual = list.filter((f) => f.coverImage || f.profileImage);
    const pool = withVisual.length ? withVisual : list;
    return pool.find((f) => f.featured)
      || [...pool].sort((a, b) =>
        b.uniqueSupporters - a.uniqueSupporters
        || b.activeProjectCount - a.activeProjectCount
        || String(b.foundedDate || '').localeCompare(String(a.foundedDate || ''))
      )[0]
      || null;
  }

  function listActiveProjects(limit = 12) {
    if (!catalog) return [];
    const out = [];
    catalog.foundations.map(normalize).filter((f) => f.active).forEach((f) => {
      (f.projects || []).filter((p) => p.status === 'active').forEach((p) => {
        out.push({
          ...p,
          foundationId: f.id,
          foundationName: f.foundationName,
          foundationCategory: f.primaryCategory,
          foundationCover: f.coverImage || f.profileImage || '',
        });
      });
    });
    out.sort((a, b) => String(b.startDate || b.id || '').localeCompare(String(a.startDate || a.id || '')));
    return out.slice(0, limit);
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

  function usingDemoCatalog() {
    return isDemoCatalog;
  }

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
   * Local user support history only.
   * Mock payments are stored as completed_mock and NEVER counted in public stats.
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
      const entry = {
        id: 'local_' + Date.now().toString(36),
        foundationId,
        projectId,
        amount,
        currency,
        anonymous,
        date: new Date().toISOString(),
        paymentStatus: 'completed_mock',
        mock: true,
      };
      data.donations.push(entry);
      data.supportedFoundationIds = Array.from(new Set([
        ...(data.supportedFoundationIds || []),
        foundationId,
      ]));
      this._write(data);
      return entry;
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
    usingDemoCatalog,
    getPlatform,
    getCurrency,
    getSupportedCurrencies,
    getSuggestedAmounts,
    getUniqueSupporterCount,
    getRaisedAmount,
    getCauses,
    normalizeCause,
    listActive,
    getFeaturedFoundation,
    listActiveProjects,
    getById,
    getBySlug,
    getProject,
    Admin,
    UserSupport,
    PAGE_SIZE,
    FOUNDATION_CAUSES,
  };
})();

const FoundationsStore = CreatorFoundationsStore;
