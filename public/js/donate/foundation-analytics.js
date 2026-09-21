/**
 * First-party Foundation funnel analytics (Donate page).
 * Respects WorldChoirPrivacy.analyticsAllowed() — never tracks without consent.
 * Fire-and-forget; never blocks Donate UI.
 */
const WorldChoirFoundationAnalytics = (() => {
  const ENDPOINT = '/api/foundation-analytics';
  const VISITOR_KEY = 'wc_foundation_visitor_id';
  const VIEW_SESSION_PREFIX = 'wc_fa_view_';

  function analyticsAllowed() {
    return typeof WorldChoirPrivacy !== 'undefined'
      && WorldChoirPrivacy.analyticsAllowed() === true;
  }

  function getVisitorId() {
    if (!analyticsAllowed()) return null;
    try {
      let id = localStorage.getItem(VISITOR_KEY);
      if (!id) {
        id = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `fv_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(VISITOR_KEY, id);
      }
      return id;
    } catch {
      return null;
    }
  }

  function track(eventType, { foundationId, projectId = null, projectTitle = null } = {}) {
    if (!analyticsAllowed()) return;
    const fid = String(foundationId || '').trim();
    if (!fid || !eventType) return;

    const payload = {
      foundationId: fid,
      eventType: String(eventType),
      visitorId: getVisitorId(),
      projectId: projectId ? String(projectId) : null,
      projectTitle: projectTitle ? String(projectTitle).slice(0, 120) : null,
    };

    try {
      const body = JSON.stringify(payload);
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(ENDPOINT, blob)) return;
      }
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        credentials: 'omit',
      }).catch(() => {});
    } catch {
      /* never break Donate */
    }
  }

  /** One page_view per foundation per browser tab session. */
  function trackPageView(foundationId) {
    const fid = String(foundationId || '').trim();
    if (!fid || !analyticsAllowed()) return;
    try {
      const key = VIEW_SESSION_PREFIX + fid;
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
    } catch {
      /* still track once this call */
    }
    track('page_view', { foundationId: fid });
  }

  function trackSupportClick(foundationId, project = null) {
    if (project?.id) {
      track('project_support', {
        foundationId,
        projectId: project.id,
        projectTitle: project.title || '',
      });
      return;
    }
    track('support_click', { foundationId });
  }

  function trackProjectClick(foundationId, project) {
    if (!project?.id) return;
    track('project_click', {
      foundationId,
      projectId: project.id,
      projectTitle: project.title || '',
    });
  }

  function trackCheckoutStart(foundationId) {
    track('checkout_start', { foundationId });
  }

  function trackCheckoutPayment(foundationId) {
    track('checkout_payment', { foundationId });
  }

  function trackCheckoutSuccess(foundationId) {
    track('checkout_success', { foundationId });
  }

  return {
    track,
    trackPageView,
    trackSupportClick,
    trackProjectClick,
    trackCheckoutStart,
    trackCheckoutPayment,
    trackCheckoutSuccess,
  };
})();

if (typeof window !== 'undefined') {
  window.WorldChoirFoundationAnalytics = WorldChoirFoundationAnalytics;
}
