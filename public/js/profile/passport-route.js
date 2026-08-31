/**
 * PassportRoute — URL persistence for Passport chapter pages.
 * Keeps refresh / hard-refresh on the same chapter (cover, stamps, story, …).
 */
const PassportRoute = (() => {
  function currentFile() {
    const parts = String(window.location.pathname || '').split('/');
    return parts[parts.length - 1] || 'passport.html';
  }

  function getPage() {
    const file = currentFile();
    if (file.includes('passport-story')) return 'story';
    if (file.includes('passport-journey')) return 'journey';
    const param = new URLSearchParams(window.location.search).get('page');
    if (param === 'stamps' || param === 'inside') return 'stamps';
    if (param === 'story') return 'story';
    return 'cover';
  }

  function hrefFor(page) {
    if (page === 'journey') return 'passport-journey.html';
    // Legacy bookmark — keep story.html working via redirect target.
    if (page === 'story') return 'passport.html?page=story';
    if (page === 'stamps' || page === 'inside') return 'passport.html?page=stamps';
    return 'passport.html';
  }

  function go(page, { replace = false } = {}) {
    const href = hrefFor(page);
    if (replace) window.location.replace(href);
    else window.location.assign(href);
  }

  /**
   * Sync cover/stamps/story query on passport.html without a full reload.
   * Prefer this for in-app chapter switches so navigation stays instant.
   */
  function syncPassportHtmlUrl(page, { replace = true } = {}) {
    const url = new URL(window.location.href);
    const file = currentFile();
    if (
      !file.includes('passport.html')
      && file !== ''
      && file !== 'index.html'
      && !file.includes('passport-story')
    ) {
      return;
    }

    // If we're still on the legacy story file, force a same-document path when possible.
    if (file.includes('passport-story')) {
      const target = hrefFor(page);
      if (replace) window.location.replace(target);
      else window.location.assign(target);
      return;
    }

    if (page === 'stamps' || page === 'inside') {
      url.searchParams.set('page', 'stamps');
    } else if (page === 'story') {
      url.searchParams.set('page', 'story');
    } else {
      url.searchParams.delete('page');
    }

    const next = `${url.pathname}${url.search}${url.hash}`;
    const state = { passportPage: page === 'inside' ? 'stamps' : page };
    if (replace) history.replaceState(state, '', next);
    else history.pushState(state, '', next);
  }

  return {
    getPage,
    hrefFor,
    go,
    syncPassportHtmlUrl,
  };
})();
