/**
 * WorldChoirMemoryFeed — chronological Memory photo stream (oldest → newest).
 * Photos auto-expire after 24h. New posts appear via continuous live polling.
 */
const WorldChoirMemoryFeed = (() => {
  const PAGE_SIZE = 30;
  const FUTURE_LOW = 8;
  const HISTORY_MAX = 40;
  const PHOTO_TTL_MS = 24 * 60 * 60 * 1000;
  const LIVE_POLL_FAST_MS = 2500;
  const LIVE_POLL_NORMAL_MS = 5000;
  const PROGRESS_DEBOUNCE_MS = 200;

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
    onCooldown: false,
    nextAllowedAt: null,
    transitionLocked: false,
    listeners: new Set(),
  };

  let pollTimer = null;
  let progressTimer = null;
  let backoffMs = 1000;
  let destroyed = false;
  let pollInFlight = false;

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

  function isAlive(photo) {
    if (!photo) return false;
    if (photo.expiresAt) {
      const exp = Date.parse(photo.expiresAt);
      if (Number.isFinite(exp)) return Date.now() < exp;
    }
    const t = Date.parse(photo.createdAt || photo.publishedAt || '');
    if (!Number.isFinite(t)) return false;
    return Date.now() - t < PHOTO_TTL_MS;
  }

  function notify() {
    state.listeners.forEach((fn) => {
      try { fn(getSnapshot()); } catch { /* ignore */ }
    });
  }

  function getSnapshot() {
    const atEnd = Boolean(state.current) && !state.future.length && !state.hasMore && !state.isFetchingMore;
    return {
      history: state.history.slice(),
      current: state.current,
      future: state.future.slice(),
      left: state.history.length ? state.history[state.history.length - 1] : null,
      right: state.future[0] || null,
      isWaitingForLive: atEnd || (!state.current && !state.isInitialLoading),
      isPrefetching: Boolean(state.current) && !state.future.length && (state.hasMore || state.isFetchingMore),
      isEmpty: !state.current && !state.isInitialLoading,
      isInitialLoading: state.isInitialLoading,
      isFetchingMore: state.isFetchingMore,
      isReconnecting: state.isReconnecting,
      canPost: state.canPost,
      postedToday: state.postedToday,
      onCooldown: state.onCooldown,
      nextAllowedAt: state.nextAllowedAt,
      canGoNext: Boolean(state.future[0]),
      canGoPrev: state.history.length > 0,
      transitionLocked: state.transitionLocked,
    };
  }

  function subscribe(fn) {
    state.listeners.add(fn);
    return () => state.listeners.delete(fn);
  }

  function applyStatus(data) {
    if (typeof data?.canPost === 'boolean') state.canPost = data.canPost;
    if (typeof data?.postedToday === 'boolean') state.postedToday = data.postedToday;
    if (typeof data?.onCooldown === 'boolean') state.onCooldown = data.onCooldown;
    if (data?.nextAllowedAt !== undefined) state.nextAllowedAt = data.nextAllowedAt || null;
  }

  function rememberPhoto(photo) {
    if (!photo?.id || !isAlive(photo)) return false;
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
    let added = false;
    for (const photo of photos) {
      if (!photo?.id || !isAlive(photo)) continue;
      if (hw && compareCursor(cursorOf(photo), hw) <= 0) {
        state.knownIds.add(photo.id);
        continue;
      }
      if (state.current?.id === photo.id
        || state.history.some((p) => p.id === photo.id)
        || state.future.some((p) => p.id === photo.id)) {
        state.knownIds.add(photo.id);
        const c = cursorOf(photo);
        if (!state.newestKnown || compareCursor(c, state.newestKnown) > 0) {
          state.newestKnown = c;
        }
        continue;
      }
      if (state.knownIds.has(photo.id)) continue;

      state.knownIds.add(photo.id);
      const c = cursorOf(photo);
      if (!state.newestKnown || compareCursor(c, state.newestKnown) > 0) {
        state.newestKnown = c;
      }
      state.future.push(photo);
      added = true;
    }
    if (added) state.future.sort((a, b) => compareCursor(cursorOf(a), cursorOf(b)));
    return added;
  }

  function trimHistory() {
    if (state.history.length > HISTORY_MAX) {
      state.history.splice(0, state.history.length - HISTORY_MAX);
    }
  }

  function sweepExpired() {
    let changed = false;
    const histLen = state.history.length;
    state.history = state.history.filter(isAlive);
    if (state.history.length !== histLen) changed = true;

    const futLen = state.future.length;
    state.future = state.future.filter(isAlive);
    if (state.future.length !== futLen) changed = true;

    if (state.current && !isAlive(state.current)) {
      changed = true;
      if (state.future.length) {
        state.current = state.future.shift();
        if (!state.forwardHighWater
          || compareCursor(cursorOf(state.current), state.forwardHighWater) > 0) {
          state.forwardHighWater = cursorOf(state.current);
          scheduleProgressPersist();
        }
      } else if (state.history.length) {
        state.current = state.history.pop();
      } else {
        state.current = null;
      }
    }

    if (changed) {
      updateWaitingFlag();
      notify();
    }
    return changed;
  }

  function localProgressKey() {
    return `wc_memory_view_v1_${eventId()}_${deviceId() || 'anon'}`;
  }

  function readLocalProgress() {
    try {
      const raw = localStorage.getItem(localProgressKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.lastViewedCreatedAt) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeLocalProgress(payload) {
    try {
      localStorage.setItem(localProgressKey(), JSON.stringify({
        ...payload,
        updatedAt: new Date().toISOString(),
      }));
    } catch {
      /* ignore quota */
    }
  }

  function scheduleProgressPersist() {
    const photo = state.current;
    if (photo) {
      const cursor = cursorOf(photo);
      if (!state.forwardHighWater || compareCursor(cursor, state.forwardHighWater) > 0) {
        state.forwardHighWater = cursor;
      }
      writeLocalProgress({
        lastViewedPhotoId: photo.id,
        lastViewedCreatedAt: photo.createdAt,
        lastConsumedPhotoId: state.forwardHighWater?.id || photo.id,
        lastConsumedCreatedAt: state.forwardHighWater?.createdAt || photo.createdAt,
      });
    }
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
          lastViewedPhotoId: photo.id,
          lastViewedCreatedAt: photo.createdAt,
          lastConsumedPhotoId: state.forwardHighWater?.id || photo.id,
          lastConsumedCreatedAt: state.forwardHighWater?.createdAt || photo.createdAt,
        }),
      });
    } catch {
      /* offline — local progress still holds place */
    }
  }

  async function fetchPage({
    afterCreatedAt = null,
    afterId = null,
    live = false,
    resumeHint = null,
  } = {}) {
    const params = new URLSearchParams({
      eventId: eventId(),
      limit: String(PAGE_SIZE),
    });
    const id = deviceId();
    if (id) params.set('deviceId', id);
    if (live) params.set('live', '1');
    if (afterCreatedAt) {
      params.set('afterCreatedAt', afterCreatedAt);
      if (afterId) params.set('afterId', afterId);
    }
    if (!live && !afterCreatedAt && resumeHint?.lastViewedCreatedAt) {
      params.set('resumeCreatedAt', resumeHint.lastViewedCreatedAt);
      if (resumeHint.lastViewedPhotoId) {
        params.set('resumeId', resumeHint.lastViewedPhotoId);
      }
    }
    const res = await fetch(`/api/memory-photos?${params}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('feed_fetch_failed');
    return res.json();
  }

  function updateWaitingFlag() {
    state.isWaitingForLive = (
      (!state.current && !state.isInitialLoading)
      || (Boolean(state.current) && !state.future.length && !state.hasMore && !state.isFetchingMore)
    );
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
        live: true,
      });
      insertFutureSorted(data.items || []);
      state.nextCursor = data.nextCursor || null;
      state.hasMore = Boolean(data.nextCursor);
      applyStatus(data);
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

  async function loadInitial() {
    state.isInitialLoading = true;
    notify();
    try {
      const local = readLocalProgress();
      const data = await fetchPage({ resumeHint: local });
      applyStatus(data);

      const progress = data.progress || local || null;
      if (progress?.lastConsumedCreatedAt || progress?.lastViewedCreatedAt) {
        const hwAt = progress.lastConsumedCreatedAt || progress.lastViewedCreatedAt;
        const hwId = progress.lastConsumedPhotoId || progress.lastViewedPhotoId || '';
        state.forwardHighWater = { createdAt: hwAt, id: hwId };
      }
      if (
        local?.lastViewedCreatedAt
        && (
          !progress?.lastViewedCreatedAt
          || compareCursor(
            { createdAt: local.lastViewedCreatedAt, id: local.lastViewedPhotoId || '' },
            {
              createdAt: progress.lastViewedCreatedAt || progress.lastConsumedCreatedAt || '',
              id: progress.lastViewedPhotoId || progress.lastConsumedPhotoId || '',
            }
          ) > 0
        )
      ) {
        // Local is ahead of server (e.g. refresh before POST finished) — keep local high-water.
        if (local.lastConsumedCreatedAt) {
          state.forwardHighWater = {
            createdAt: local.lastConsumedCreatedAt,
            id: local.lastConsumedPhotoId || '',
          };
        }
      }

      const upcoming = (Array.isArray(data.items) ? data.items : []).filter(isAlive);
      upcoming.forEach((p) => rememberPhoto(p));

      let resume = data.resumePhoto && isAlive(data.resumePhoto) ? data.resumePhoto : null;
      // If API resume missing/expired but local still points at an upcoming item, use that.
      if (!resume && local?.lastViewedPhotoId) {
        resume = upcoming.find((p) => p.id === local.lastViewedPhotoId) || null;
      }

      if (resume) {
        rememberPhoto(resume);
        state.current = resume;
        state.future = upcoming.filter((p) => p.id !== resume.id);
        state.history = [];
        scheduleProgressPersist();
      } else if (upcoming.length) {
        // Viewed photo expired/removed → land on the next alive photo after it (never rewind).
        state.current = upcoming[0];
        state.future = upcoming.slice(1);
        state.history = [];
        if (!state.forwardHighWater
          || compareCursor(cursorOf(state.current), state.forwardHighWater) > 0) {
          state.forwardHighWater = cursorOf(state.current);
        }
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
    if (destroyed || pollInFlight) return;
    pollInFlight = true;
    try {
      sweepExpired();

      // Empty feed: discover the first alive photos without progress resume.
      if (!state.current) {
        const data = await fetchPage({ live: true });
        applyStatus(data);
        const items = (data.items || []).filter(isAlive);
        if (items.length) {
          items.forEach((p) => rememberPhoto(p));
          state.current = items[0];
          state.future = items.slice(1);
          state.nextCursor = data.nextCursor || null;
          state.hasMore = Boolean(data.nextCursor);
          state.forwardHighWater = cursorOf(state.current);
          scheduleProgressPersist();
          updateWaitingFlag();
          notify();
          prefetchImages();
        }
        state.isReconnecting = false;
        backoffMs = 1000;
        return;
      }

      const after = state.newestKnown || cursorOf(state.current);
      if (!after?.createdAt) return;

      const data = await fetchPage({
        afterCreatedAt: after.createdAt,
        afterId: after.id || '',
        live: true,
      });
      applyStatus(data);
      const items = (data.items || []).filter(isAlive);
      if (items.length) {
        insertFutureSorted(items);
        if (data.nextCursor) {
          state.nextCursor = data.nextCursor;
          state.hasMore = true;
        } else if (!state.hasMore) {
          state.hasMore = false;
        }
        updateWaitingFlag();
        notify();
        prefetchImages();
      }
      state.isReconnecting = false;
      backoffMs = 1000;
    } catch {
      state.isReconnecting = true;
      notify();
    } finally {
      pollInFlight = false;
    }
  }

  function livePollDelay() {
    const snap = getSnapshot();
    if (snap.isEmpty || snap.isWaitingForLive || !snap.right) return LIVE_POLL_FAST_MS;
    return LIVE_POLL_NORMAL_MS;
  }

  function scheduleNextPoll() {
    stopLivePoll();
    if (destroyed) return;
    pollTimer = setTimeout(async () => {
      if (destroyed) return;
      if (document.visibilityState !== 'hidden') {
        await pollNewer();
      }
      scheduleNextPoll();
    }, livePollDelay());
  }

  function startLivePoll() {
    scheduleNextPoll();
  }

  function stopLivePoll() {
    if (pollTimer) clearTimeout(pollTimer);
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
    scheduleProgressPersist();
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
    // Persist last viewed; high-water mark does not move backward.
    scheduleProgressPersist();
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
      err.nextAllowedAt = data.nextAllowedAt || null;
      throw err;
    }
    state.canPost = false;
    state.postedToday = true;
    state.onCooldown = true;
    state.nextAllowedAt = data.photo?.expiresAt || null;
    if (data.photo) {
      // Enter global stream by timestamp — poll/insert handles position.
      if (!state.current) {
        rememberPhoto(data.photo);
        state.current = data.photo;
        state.forwardHighWater = cursorOf(data.photo);
        scheduleProgressPersist();
      } else {
        insertFutureSorted([data.photo]);
      }
      updateWaitingFlag();
    }
    notify();
    // Force an immediate live check so other tabs / race paths converge.
    pollNewer();
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
      scheduleNextPoll();
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
    PHOTO_TTL_MS,
  };
})();
