/**
 * WorldChoirMemoryFeed — chronological Memory photo stream (oldest → newest).
 * Keeps a bounded history/current/future window; never loads the full feed.
 */
const WorldChoirMemoryFeed = (() => {
  const PAGE_SIZE = 30;
  const FUTURE_LOW = 8;
  const HISTORY_MAX = 40;
  const LIVE_POLL_MS = 7000;
  const PROGRESS_DEBOUNCE_MS = 600;

  const state = {
    history: [],
    current: null,
    future: [],
    knownIds: new Set(),
    forwardHighWater: null,
    newestKnown: null,
    nextCursor: null,
    hasMore: true,
    isInitialLoading: true,
    isFetchingMore: false,
    isWaitingForLive: false,
    isReconnecting: false,
    canPost: true,
    postedToday: false,
    transitionLocked: false,
    listeners: new Set(),
  };

  let pollTimer = null;
  let progressTimer = null;
  let backoffMs = 1000;
  let destroyed = false;

  function eventId() {
    return (typeof WorldChoirConfig !== 'undefined'
      && (WorldChoirConfig.CURRENT_EVENT?.id || WorldChoirConfig.ACTIVE_EVENT?.id))
      || 'world-choir-2027';
  }

  function deviceId() {
    try {
      if (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.getDeviceId) {
        return WorldChoirDB.getDeviceId() || '';
      }
      return localStorage.getItem('wc_anonymous_device_id') || '';
    } catch {
      return '';
    }
  }

  function compareCursor(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    const ca = String(a.createdAt || '');
    const cb = String(b.createdAt || '');
    if (ca < cb) return -1;
    if (ca > cb) return 1;
    const ia = String(a.id || '');
    const ib = String(b.id || '');
    if (ia < ib) return -1;
    if (ia > ib) return 1;
    return 0;
  }

  function cursorOf(photo) {
    if (!photo) return null;
    return { createdAt: photo.createdAt, id: photo.id };
  }

  function notify() {
    state.listeners.forEach((fn) => {
      try { fn(getSnapshot()); } catch { /* ignore */ }
    });
  }

  function getSnapshot() {
    return {
      history: state.history.slice(),
      current: state.current,
      future: state.future.slice(),
      left: state.history.length ? state.history[state.history.length - 1] : null,
      right: state.future[0] || null,
      isWaitingForLive: !state.future.length && !!state.current && !state.hasMore,
      isEmpty: !state.current && !state.isInitialLoading,
      isInitialLoading: state.isInitialLoading,
      isFetchingMore: state.isFetchingMore,
      isReconnecting: state.isReconnecting,
      canPost: state.canPost,
      postedToday: state.postedToday,
      canGoNext: Boolean(state.future[0]),
      canGoPrev: state.history.length > 0,
      transitionLocked: state.transitionLocked,
    };
  }

  function subscribe(fn) {
    state.listeners.add(fn);
    return () => state.listeners.delete(fn);
  }

  function rememberPhoto(photo) {
    if (!photo?.id) return false;
    if (state.knownIds.has(photo.id)) return false;
    state.knownIds.add(photo.id);
    const c = cursorOf(photo);
    if (!state.newestKnown || compareCursor(c, state.newestKnown) > 0) {
      state.newestKnown = c;
    }
    return true;
  }

  function insertFutureSorted(photos) {
    const hw = state.forwardHighWater;
    for (const photo of photos) {
      if (!photo?.id) continue;
      // Late arrivals behind the high-water mark must not enter the future queue.
      if (hw && compareCursor(cursorOf(photo), hw) <= 0) {
        state.knownIds.add(photo.id);
        continue;
      }
      if (!rememberPhoto(photo)) continue;
      state.future.push(photo);
    }
    state.future.sort((a, b) => compareCursor(cursorOf(a), cursorOf(b)));
  }

  function trimHistory() {
    if (state.history.length > HISTORY_MAX) {
      const drop = state.history.splice(0, state.history.length - HISTORY_MAX);
      drop.forEach((p) => {
        // Keep knownIds so they never reappear as "new" from the right.
        void p;
      });
    }
  }

  function scheduleProgressPersist() {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(() => {
      persistProgress().catch(() => { /* ignore */ });
    }, PROGRESS_DEBOUNCE_MS);
  }

  async function persistProgress() {
    const photo = state.current;
    const id = deviceId();
    if (!photo || !id) return;
    const cursor = cursorOf(photo);
    if (!state.forwardHighWater || compareCursor(cursor, state.forwardHighWater) > 0) {
      state.forwardHighWater = cursor;
    } else {
      return;
    }
    try {
      await fetch('/api/memory-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'progress',
          deviceId: id,
          eventId: eventId(),
          lastConsumedPhotoId: photo.id,
          lastConsumedCreatedAt: photo.createdAt,
        }),
      });
    } catch {
      /* offline — high-water stays local until next success */
    }
  }

  async function fetchPage({ afterCreatedAt = null, afterId = null } = {}) {
    const params = new URLSearchParams({
      eventId: eventId(),
      limit: String(PAGE_SIZE),
    });
    const id = deviceId();
    if (id) params.set('deviceId', id);
    if (afterCreatedAt) {
      params.set('afterCreatedAt', afterCreatedAt);
      if (afterId) params.set('afterId', afterId);
    }
    const res = await fetch(`/api/memory-photos?${params}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('feed_fetch_failed');
    return res.json();
  }

  async function ensureFutureBuffer() {
    if (state.isFetchingMore || !state.hasMore) return;
    if (state.future.length >= FUTURE_LOW) return;
    state.isFetchingMore = true;
    notify();
    try {
      const after = state.nextCursor
        || (state.future.length
          ? cursorOf(state.future[state.future.length - 1])
          : cursorOf(state.current));
      const data = await fetchPage({
        afterCreatedAt: after?.createdAt || null,
        afterId: after?.id || null,
      });
      insertFutureSorted(data.items || []);
      state.nextCursor = data.nextCursor || null;
      state.hasMore = Boolean(data.nextCursor);
      if (typeof data.canPost === 'boolean') state.canPost = data.canPost;
      if (typeof data.postedToday === 'boolean') state.postedToday = data.postedToday;
      backoffMs = 1000;
      state.isReconnecting = false;
    } catch {
      state.isReconnecting = true;
      backoffMs = Math.min(30000, backoffMs * 2);
      setTimeout(() => {
        if (!destroyed) ensureFutureBuffer();
      }, backoffMs);
    } finally {
      state.isFetchingMore = false;
      updateWaitingFlag();
      notify();
    }
  }

  function updateWaitingFlag() {
    state.isWaitingForLive = Boolean(state.current) && !state.future.length && !state.hasMore;
  }

  async function loadInitial() {
    state.isInitialLoading = true;
    notify();
    try {
      const data = await fetchPage({});
      if (typeof data.canPost === 'boolean') state.canPost = data.canPost;
      if (typeof data.postedToday === 'boolean') state.postedToday = data.postedToday;

      if (data.progress?.lastConsumedCreatedAt) {
        state.forwardHighWater = {
          createdAt: data.progress.lastConsumedCreatedAt,
          id: data.progress.lastConsumedPhotoId || '',
        };
      }

      const upcoming = Array.isArray(data.items) ? data.items : [];
      upcoming.forEach((p) => rememberPhoto(p));

      if (data.resumePhoto) {
        rememberPhoto(data.resumePhoto);
        state.current = data.resumePhoto;
        state.future = upcoming.filter((p) => p.id !== data.resumePhoto.id);
        state.history = [];
      } else if (upcoming.length) {
        state.current = upcoming[0];
        state.future = upcoming.slice(1);
        state.history = [];
        state.forwardHighWater = cursorOf(state.current);
        scheduleProgressPersist();
      } else {
        state.current = null;
        state.future = [];
        state.history = [];
      }

      state.nextCursor = data.nextCursor || null;
      state.hasMore = Boolean(data.nextCursor);
      updateWaitingFlag();
      backoffMs = 1000;
      state.isReconnecting = false;
    } catch {
      state.isReconnecting = true;
    } finally {
      state.isInitialLoading = false;
      notify();
      ensureFutureBuffer();
      startLivePoll();
    }
  }

  async function pollNewer() {
    if (destroyed) return;
    if (!state.newestKnown && !state.current) return;
    const after = state.newestKnown || cursorOf(state.current);
    if (!after?.createdAt) return;
    try {
      const params = new URLSearchParams({
        eventId: eventId(),
        limit: String(PAGE_SIZE),
        afterCreatedAt: after.createdAt,
        afterId: after.id || '',
      });
      const id = deviceId();
      if (id) params.set('deviceId', id);
      const res = await fetch(`/api/memory-photos?${params}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('poll_failed');
      const data = await res.json();
      const items = data.items || [];
      if (items.length) {
        insertFutureSorted(items);
        if (data.nextCursor) {
          state.nextCursor = data.nextCursor;
          state.hasMore = true;
        }
        updateWaitingFlag();
        notify();
      }
      if (typeof data.canPost === 'boolean') state.canPost = data.canPost;
      if (typeof data.postedToday === 'boolean') state.postedToday = data.postedToday;
      state.isReconnecting = false;
      backoffMs = 1000;
    } catch {
      state.isReconnecting = true;
      notify();
    }
  }

  function startLivePoll() {
    stopLivePoll();
    pollTimer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      // Always poll for newer than newestKnown — especially important at end of stream.
      pollNewer();
    }, LIVE_POLL_MS);
  }

  function stopLivePoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function goNext() {
    if (state.transitionLocked) return false;
    if (!state.future.length) return false;
    state.transitionLocked = true;
    const leaving = state.current;
    const next = state.future.shift();
    if (leaving) state.history.push(leaving);
    state.current = next;
    trimHistory();
    if (!state.forwardHighWater || compareCursor(cursorOf(next), state.forwardHighWater) > 0) {
      state.forwardHighWater = cursorOf(next);
      scheduleProgressPersist();
    }
    updateWaitingFlag();
    notify();
    ensureFutureBuffer();
    prefetchImages();
    return true;
  }

  function goPrev() {
    if (state.transitionLocked) return false;
    if (!state.history.length) return false;
    state.transitionLocked = true;
    const leaving = state.current;
    const prev = state.history.pop();
    if (leaving) state.future.unshift(leaving);
    state.current = prev;
    // Do NOT move high-water backward.
    updateWaitingFlag();
    notify();
    prefetchImages();
    return true;
  }

  function unlockTransition() {
    state.transitionLocked = false;
    notify();
  }

  function prefetchImages() {
    const urls = [];
    if (state.current?.imageUrl) urls.push(state.current.imageUrl);
    if (state.future[0]?.imageUrl) urls.push(state.future[0].imageUrl);
    if (state.future[1]?.imageUrl) urls.push(state.future[1].imageUrl);
    urls.forEach((src) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
    });
  }

  function removePhotoId(photoId) {
    if (!photoId) return;
    state.future = state.future.filter((p) => p.id !== photoId);
    state.history = state.history.filter((p) => p.id !== photoId);
    if (state.current?.id === photoId) {
      if (state.future.length) {
        state.current = state.future.shift();
        scheduleProgressPersist();
      } else if (state.history.length) {
        state.current = state.history.pop();
      } else {
        state.current = null;
      }
    }
    updateWaitingFlag();
    notify();
  }

  async function createPhoto({ dataUrl, caption, fileName }) {
    const id = deviceId();
    if (!id) {
      const err = new Error('Join World Choir before sharing a memory.');
      err.code = 'NO_DEVICE';
      throw err;
    }
    const res = await fetch('/api/memory-photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        action: 'create',
        deviceId: id,
        eventId: eventId(),
        dataUrl,
        caption,
        fileName,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Could not share memory.');
      err.code = data.code || 'POST_FAILED';
      throw err;
    }
    state.canPost = false;
    state.postedToday = true;
    if (data.photo) {
      insertFutureSorted([data.photo]);
      updateWaitingFlag();
    }
    notify();
    return data.photo;
  }

  function getUserLocationSnapshot() {
    try {
      const pledge = typeof WorldChoirDB !== 'undefined'
        && WorldChoirDB.getPledgeForCurrentUser
        ? WorldChoirDB.getPledgeForCurrentUser(eventId())
        : null;
      const city = String(pledge?.city || '').trim();
      const country = String(pledge?.country || '').trim();
      if (city && country) return { city, country };
    } catch {
      /* ignore */
    }
    return { city: '', country: '' };
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') {
      pollNewer();
      ensureFutureBuffer();
    }
  }

  async function init() {
    destroyed = false;
    document.addEventListener('visibilitychange', onVisibility);
    await loadInitial();
    prefetchImages();
    return getSnapshot();
  }

  function destroy() {
    destroyed = true;
    stopLivePoll();
    clearTimeout(progressTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    state.listeners.clear();
  }

  return {
    init,
    destroy,
    subscribe,
    getSnapshot,
    goNext,
    goPrev,
    unlockTransition,
    createPhoto,
    removePhotoId,
    getUserLocationSnapshot,
    PAGE_SIZE,
  };
})();
