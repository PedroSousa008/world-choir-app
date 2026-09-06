/**
 * World Choir — Shared database layer (Vercel API + Blob storage)
 * Voice numbers are global per event — assigned atomically on the server.
 */
const WorldChoirDB = (() => {
  const KEYS = {
    deviceId: 'wc_anonymous_device_id',
    events: 'wc_events',
    promises: 'wc_promises',
    gatheringPlaces: 'wc_gathering_places',
    media: 'wc_media',
    session: 'wc_session',
  };

  let remoteUser = null;
  let myPledgeCache = undefined;
  let cachedPledges = undefined;
  let pledgesLoadError = null;
  let identityPromise = null;
  let myPledgeReadyPromise = null;
  let bootstrapPromise = null;
  let liveSyncTimer = null;
  let liveSyncStarted = false;
  let liveSyncInFlight = false;
  let lastMetaSignature = null;
  let lastCitySnapshot = null;
  let lastVoiceCount = null;
  let cachedWorldStats = null;
  let worldStatsInFlight = null;
  let worldStatsMetaInFlight = null;
  let statsRefreshTimer = null;
  let statsRefreshStarted = false;
  let lastWorldStatsMetaSignature = null;
  let statsVisibilityBound = false;
  let cachedMapAggregate = undefined;
  let mapAggregateLoadError = null;
  let mapAggregateInFlight = null;
  let mapAggregateSyncTimer = null;
  let mapAggregateSyncStarted = false;
  let mapAggregateSyncInFlight = false;
  let lastMapAggregateMetaSignature = null;

  const LIVE_SYNC_INTERVAL_MS = 2000;
  /** Lightweight meta poll cadence (Home/Profile Voice count). Full /api/stats only on change. */
  const STATS_META_POLL_INTERVAL_MS = 2000;
  const PRESENTATION_STATS_KEY = 'wc_presentation_world_stats_v1';
  const PRESENTATION_MAP_AGG_KEY = 'wc_presentation_map_aggregate_v1';

  function apiBase() {
    return '';
  }

  function getDeviceId() {
    let id = localStorage.getItem(KEYS.deviceId);
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'wc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
      localStorage.setItem(KEYS.deviceId, id);
    }
    return id;
  }

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function write(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  function generateId() {
    return 'wc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(`${apiBase()}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.storageUnavailable = !!data.storageUnavailable;
      err.inventory = data.inventory || null;
      throw err;
    }
    return data;
  }

  async function ensureRemoteUser() {
    const data = await apiFetch('/api/user', {
      method: 'POST',
      body: JSON.stringify({ deviceId: getDeviceId() }),
    });
    remoteUser = data.user;
    return remoteUser;
  }

  async function syncMyPledge(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    const data = await apiFetch(
      `/api/my-pledge?deviceId=${encodeURIComponent(getDeviceId())}&eventId=${encodeURIComponent(eventId)}`
    );
    myPledgeCache = data.pledge || null;
    return myPledgeCache;
  }

  async function syncAllPledges(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    try {
      const data = await apiFetch(`/api/pledges?eventId=${encodeURIComponent(eventId)}`);
      cachedPledges = data.pledges || [];
      pledgesLoadError = null;
      lastCitySnapshot = buildCitySnapshot(eventId);
      lastVoiceCount = getMapStats(eventId)?.voices ?? cachedPledges.length;
      window.dispatchEvent(new CustomEvent('wc-pledges-synced', { detail: cachedPledges }));
      window.dispatchEvent(new CustomEvent('wc-map-data-state', { detail: getMapDataState() }));
      return cachedPledges;
    } catch (err) {
      pledgesLoadError = err;
      if (cachedPledges === undefined) {
        window.dispatchEvent(new CustomEvent('wc-map-data-state', { detail: getMapDataState() }));
      }
      throw err;
    }
  }

  function buildCitySnapshot(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    const map = new Map();
    if (!isMapDataReady()) return map;
    getAggregatedCities(eventId).forEach((c) => {
      map.set(`${c.city}|${c.country}`, c.count);
    });
    return map;
  }

  function metaSignature(meta) {
    if (!meta) return '';
    return `${meta.count}|${meta.updated_at || ''}`;
  }

  async function fetchPledgesMeta(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    return apiFetch(`/api/pledges?eventId=${encodeURIComponent(eventId)}&meta=1`);
  }

  function dispatchLiveUpdate(prevSnapshot, nextSnapshot, eventId, prevVoiceCount) {
    if (!prevSnapshot || !nextSnapshot) return;

    const newCityKeys = [];
    const grownCityKeys = [];
    nextSnapshot.forEach((count, key) => {
      if (!prevSnapshot.has(key)) newCityKeys.push(key);
      else if (count > prevSnapshot.get(key)) grownCityKeys.push(key);
    });

    const stats = getMapStats(eventId);
    const voices = stats?.voices ?? null;
    const voiceDelta = voices != null && prevVoiceCount != null ? voices - prevVoiceCount : 0;

    if (!newCityKeys.length && !grownCityKeys.length && voiceDelta <= 0) return;

    window.dispatchEvent(new CustomEvent('wc-voices-live-update', {
      detail: {
        newCityKeys,
        grownCityKeys,
        stats,
        voiceDelta,
      },
    }));
  }

  async function syncAllPledgesIfChanged(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    const meta = await fetchPledgesMeta(eventId);
    const sig = metaSignature(meta);
    if (sig === lastMetaSignature && isPledgesLoaded()) {
      return { changed: false };
    }

    const prevSnapshot = lastCitySnapshot ? new Map(lastCitySnapshot) : null;
    const prevVoiceCount = lastVoiceCount;
    lastMetaSignature = sig;
    await syncAllPledges(eventId);
    dispatchLiveUpdate(prevSnapshot, lastCitySnapshot, eventId, prevVoiceCount);
    return { changed: true };
  }

  function startLiveSync(options = {}) {
    const intervalMs = options.intervalMs ?? LIVE_SYNC_INTERVAL_MS;
    if (liveSyncStarted) return;
    liveSyncStarted = true;

    const tick = () => {
      if (document.hidden || liveSyncInFlight) return;
      liveSyncInFlight = true;
      syncAllPledgesIfChanged()
        .catch(() => {})
        .finally(() => { liveSyncInFlight = false; });
    };

    const arm = () => {
      tick();
      liveSyncTimer = setInterval(tick, intervalMs);
    };

    ready()
      .then(async () => {
        try {
          const meta = await fetchPledgesMeta();
          lastMetaSignature = metaSignature(meta);
        } catch {
          /* first full sync will establish signature */
        }
        lastCitySnapshot = buildCitySnapshot();
        lastVoiceCount = getMapStats()?.voices ?? null;
        arm();
      })
      .catch(arm);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tick();
    });
  }

  function stopLiveSync() {
    if (liveSyncTimer) clearInterval(liveSyncTimer);
    liveSyncTimer = null;
    liveSyncStarted = false;
    liveSyncInFlight = false;
  }

  function readPresentationMapAggregate() {
    try {
      const raw = sessionStorage.getItem(PRESENTATION_MAP_AGG_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.eventId !== WorldChoirConfig.CURRENT_EVENT.id) return null;
      if (!parsed.stats || !Array.isArray(parsed.cities)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writePresentationMapAggregate(aggregate) {
    try {
      sessionStorage.setItem(PRESENTATION_MAP_AGG_KEY, JSON.stringify({
        eventId: WorldChoirConfig.CURRENT_EVENT.id,
        stats: aggregate.stats,
        cities: aggregate.cities,
        meta: aggregate.meta || null,
        at: Date.now(),
      }));
    } catch {
      /* ignore */
    }
  }

  function applyMapAggregate(data, eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    cachedMapAggregate = {
      eventId,
      stats: data.stats || { voices: 0, cities: 0, countries: 0 },
      cities: Array.isArray(data.cities) ? data.cities : [],
      meta: data.meta || null,
    };
    mapAggregateLoadError = null;
    if (data.meta) {
      lastMapAggregateMetaSignature = metaSignature(data.meta);
    }
    lastCitySnapshot = buildCitySnapshot(eventId);
    lastVoiceCount = cachedMapAggregate.stats.voices ?? null;
    writePresentationWorldStats(cachedMapAggregate.stats);
    writePresentationMapAggregate(cachedMapAggregate);
  }

  async function syncMapAggregates(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    if (mapAggregateInFlight) return mapAggregateInFlight;
    mapAggregateInFlight = (async () => {
      try {
        const data = await apiFetch(
          `/api/pledges?eventId=${encodeURIComponent(eventId)}&aggregate=1`
        );
        const prevSnapshot = lastCitySnapshot ? new Map(lastCitySnapshot) : null;
        const prevVoiceCount = lastVoiceCount;
        applyMapAggregate(data, eventId);
        window.dispatchEvent(new CustomEvent('wc-map-aggregate-synced', { detail: cachedMapAggregate }));
        window.dispatchEvent(new CustomEvent('wc-map-data-state', { detail: getMapDataState() }));
        // Keep legacy Map listeners working without shipping full pledges.
        window.dispatchEvent(new CustomEvent('wc-pledges-synced', { detail: null }));
        dispatchLiveUpdate(prevSnapshot, lastCitySnapshot, eventId, prevVoiceCount);
        return cachedMapAggregate;
      } catch (err) {
        mapAggregateLoadError = err;
        if (cachedMapAggregate === undefined) {
          window.dispatchEvent(new CustomEvent('wc-map-data-state', { detail: getMapDataState() }));
        }
        throw err;
      }
    })().finally(() => {
      mapAggregateInFlight = null;
    });
    return mapAggregateInFlight;
  }

  async function syncMapAggregatesIfChanged(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    const meta = await fetchPledgesMeta(eventId);
    const sig = metaSignature(meta);
    if (sig === lastMapAggregateMetaSignature && isMapAggregateLoaded()) {
      return { changed: false };
    }
    lastMapAggregateMetaSignature = sig;
    await syncMapAggregates(eventId);
    return { changed: true };
  }

  function warmMapAggregateFromPresentation() {
    if (cachedMapAggregate !== undefined) return false;
    const cached = readPresentationMapAggregate();
    if (!cached) return false;
    cachedMapAggregate = {
      eventId: cached.eventId,
      stats: cached.stats,
      cities: cached.cities,
      meta: cached.meta || null,
    };
    if (cached.meta) lastMapAggregateMetaSignature = metaSignature(cached.meta);
    lastCitySnapshot = buildCitySnapshot();
    lastVoiceCount = cached.stats?.voices ?? null;
    return true;
  }

  /**
   * Map live path: my-pledge stays separate; city lights come from /api/pledges?aggregate=1.
   * Full /api/pledges remains available via ready()/startLiveSync for rollback.
   */
  function startMapAggregateSync(options = {}) {
    const intervalMs = options.intervalMs ?? LIVE_SYNC_INTERVAL_MS;
    if (mapAggregateSyncStarted) {
      void syncMapAggregatesIfChanged().catch(() => {});
      return;
    }
    mapAggregateSyncStarted = true;

    const tick = () => {
      if (document.hidden || mapAggregateSyncInFlight) return;
      mapAggregateSyncInFlight = true;
      syncMapAggregatesIfChanged()
        .catch(() => {})
        .finally(() => { mapAggregateSyncInFlight = false; });
    };

    const arm = () => {
      tick();
      mapAggregateSyncTimer = setInterval(tick, intervalMs);
    };

    warmMapAggregateFromPresentation();
    if (cachedMapAggregate !== undefined) {
      window.dispatchEvent(new CustomEvent('wc-map-data-state', { detail: getMapDataState() }));
    }

    readyMyPledge()
      .catch(() => {})
      .then(() => syncMapAggregates())
      .then(() => {
        arm();
      })
      .catch(arm);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tick();
    });
  }

  function stopMapAggregateSync() {
    if (mapAggregateSyncTimer) clearInterval(mapAggregateSyncTimer);
    mapAggregateSyncTimer = null;
    mapAggregateSyncStarted = false;
    mapAggregateSyncInFlight = false;
  }

  /**
   * A — device + remote user only (no pledge list).
   * Safe for Daily Acts / World Chain / Song We Sang identity bootstrap.
   */
  function readyIdentity() {
    if (!identityPromise) {
      identityPromise = (async () => {
        getDeviceId();
        await ensureRemoteUser();
        return remoteUser;
      })().catch((err) => {
        console.error('WorldChoirDB readyIdentity failed:', err);
        identityPromise = null;
        throw err;
      });
    }
    return identityPromise;
  }

  /**
   * B — identity + authoritative /api/my-pledge (no full /api/pledges).
   * Safe for Home/Profile pledge CTA + identity when Map/full data is not needed.
   */
  function readyMyPledge() {
    if (!myPledgeReadyPromise) {
      myPledgeReadyPromise = (async () => {
        await readyIdentity();
        await syncMyPledge();
        seedLocalEvents();
        syncActiveEventStatus();
        return myPledgeCache;
      })().catch((err) => {
        console.error('WorldChoirDB readyMyPledge failed:', err);
        myPledgeReadyPromise = null;
        throw err;
      });
    }
    return myPledgeReadyPromise;
  }

  /**
   * C — legacy full bootstrap: identity + my-pledge + FULL /api/pledges.
   * Unchanged semantics for Map / Passport / Memory / any unmigrated caller.
   */
  async function bootstrap() {
    await readyIdentity();
    await Promise.all([
      syncMyPledge(),
      syncAllPledges(),
    ]);
    seedLocalEvents();
    syncActiveEventStatus();
  }

  function ready() {
    if (!bootstrapPromise) {
      bootstrapPromise = bootstrap().catch((err) => {
        console.error('WorldChoirDB bootstrap failed:', err);
        bootstrapPromise = null;
        throw err;
      });
    }
    return bootstrapPromise;
  }

  function readPresentationWorldStats() {
    try {
      const raw = sessionStorage.getItem(PRESENTATION_STATS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.eventId && parsed.eventId !== WorldChoirConfig.CURRENT_EVENT.id) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writePresentationWorldStats(stats) {
    try {
      sessionStorage.setItem(PRESENTATION_STATS_KEY, JSON.stringify({
        eventId: WorldChoirConfig.CURRENT_EVENT.id,
        voices: stats?.voices ?? null,
        cities: stats?.cities ?? null,
        countries: stats?.countries ?? null,
        updatedAt: stats?.updatedAt || new Date().toISOString(),
      }));
    } catch {
      /* ignore */
    }
  }

  function getPresentationVoiceCount() {
    if (cachedWorldStats && cachedWorldStats.voices != null) {
      return Number(cachedWorldStats.voices);
    }
    if (isPledgesLoaded()) {
      const map = getMapStats();
      if (map?.voices != null) return Number(map.voices);
    }
    const cached = readPresentationWorldStats();
    if (cached?.voices != null) return Number(cached.voices);
    return null;
  }

  async function fetchWorldStats(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    if (worldStatsInFlight) return worldStatsInFlight;
    worldStatsInFlight = (async () => {
      const data = await apiFetch(`/api/stats?eventId=${encodeURIComponent(eventId)}`);
      cachedWorldStats = data;
      writePresentationWorldStats(data);
      window.dispatchEvent(new CustomEvent('wc-world-stats', { detail: data }));
      return data;
    })().finally(() => {
      worldStatsInFlight = null;
    });
    return worldStatsInFlight;
  }

  /**
   * Home/Profile Voice-count refresh:
   * initial /api/stats → poll /api/pledges?meta=1 → /api/stats only when meta signature changes.
   * Uses a separate meta signature from Map live sync so the two systems never interfere.
   * Skips work while the tab is hidden; revalidates on visibility.
   */
  async function refreshWorldStatsIfChanged(eventId = WorldChoirConfig.CURRENT_EVENT.id, options = {}) {
    const force = options.force === true;
    if (force) {
      const data = await fetchWorldStats(eventId);
      try {
        const meta = await fetchPledgesMeta(eventId);
        lastWorldStatsMetaSignature = metaSignature(meta);
      } catch {
        /* keep serving stats even if meta fails */
      }
      return { changed: true, stats: data };
    }

    if (worldStatsMetaInFlight) return worldStatsMetaInFlight;

    worldStatsMetaInFlight = (async () => {
      const meta = await fetchPledgesMeta(eventId);
      const sig = metaSignature(meta);
      if (sig && sig === lastWorldStatsMetaSignature && cachedWorldStats) {
        return { changed: false, stats: cachedWorldStats };
      }
      lastWorldStatsMetaSignature = sig || lastWorldStatsMetaSignature;
      const data = await fetchWorldStats(eventId);
      return { changed: true, stats: data };
    })().finally(() => {
      worldStatsMetaInFlight = null;
    });

    return worldStatsMetaInFlight;
  }

  function startWorldStatsRefresh(options = {}) {
    const intervalMs = options.intervalMs ?? STATS_META_POLL_INTERVAL_MS;

    const tick = () => {
      if (document.hidden) return;
      // First paint / no cache: load stats. Later: meta-first.
      if (!cachedWorldStats && !worldStatsInFlight) {
        void fetchWorldStats()
          .then(async () => {
            try {
              const meta = await fetchPledgesMeta();
              lastWorldStatsMetaSignature = metaSignature(meta);
            } catch {
              /* ignore */
            }
          })
          .catch(() => {});
        return;
      }
      void refreshWorldStatsIfChanged().catch(() => {});
    };

    if (!statsRefreshStarted) {
      statsRefreshStarted = true;
      tick();
      statsRefreshTimer = setInterval(tick, intervalMs);
    } else {
      // Another caller (e.g. Profile after Home): force a prompt revalidate, no second interval.
      void refreshWorldStatsIfChanged(undefined, { force: !cachedWorldStats }).catch(() => {});
    }

    if (!statsVisibilityBound) {
      statsVisibilityBound = true;
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && statsRefreshStarted) {
          void refreshWorldStatsIfChanged().catch(() => {});
        }
      });
    }
  }

  function purgeLegacyDemoData() {
    const legacyGatheringIds = new Set(['gp1', 'gp2', 'gp3', 'gp4', 'gp5']);
    const legacyLocations = new Set([
      'Avenida dos Aliados',
      'Hyde Park',
      'Central Park',
      'Praça da República',
      'Shibuya Crossing',
    ]);

    const places = read(KEYS.gatheringPlaces);
    const cleanedPlaces = places.filter(
      (g) => !legacyGatheringIds.has(g.id) && !legacyLocations.has(g.location_name)
    );
    if (cleanedPlaces.length !== places.length) {
      write(KEYS.gatheringPlaces, cleanedPlaces);
    }
  }

  function seedLocalEvents() {
    purgeLegacyDemoData();

    const eventId = WorldChoirConfig.ACTIVE_EVENT.id;
    let events = read(KEYS.events);
    if (!events.some((e) => e.id === eventId)) {
      events.push({
        id: eventId,
        title: WorldChoirConfig.ACTIVE_EVENT.title,
        song_name: WorldChoirConfig.ACTIVE_EVENT.songName,
        artist_name: WorldChoirConfig.ACTIVE_EVENT.artistName,
        event_date_utc: WorldChoirConfig.ACTIVE_EVENT.activeEventDateUTC,
        status: 'upcoming',
        official_hashtag: WorldChoirConfig.ACTIVE_EVENT.hashtag,
        theme: WorldChoirConfig.ACTIVE_EVENT.theme,
        created_at: new Date().toISOString(),
      });
      write(KEYS.events, events);
    }
  }

  function syncActiveEventStatus() {
    const eventId = WorldChoirConfig.ACTIVE_EVENT.id;
    const events = read(KEYS.events);
    const idx = events.findIndex((e) => e.id === eventId);
    if (idx === -1) return;

    // Preview mode can force "completed" for UI work — when preview is off,
    // always sync to the real global timeline so Memory cannot stay unlocked early.
    const status = WorldChoirConfig.isMemoryPreviewMode()
      ? 'completed'
      : WorldChoirConfig.getGlobalEventStatus();
    if (events[idx].status !== status) {
      events[idx].status = status;
      write(KEYS.events, events);
    }
  }

  function hasCompletedEvents() {
    syncActiveEventStatus();
    return read(KEYS.events).some((e) => e.status === 'completed');
  }

  function getCompletedEvents() {
    syncActiveEventStatus();
    return read(KEYS.events)
      .filter((e) => e.status === 'completed')
      .sort((a, b) => new Date(a.event_date_utc) - new Date(b.event_date_utc));
  }

  function getOrCreateUser() {
    getDeviceId();
    if (remoteUser) {
      return buildUserFromCache();
    }
    return {
      id: null,
      display_name: myPledgeCache?.voiceName || null,
      email: null,
      city: myPledgeCache?.city || null,
      country: myPledgeCache?.country || null,
      latitude: myPledgeCache?.latitude ?? null,
      longitude: myPledgeCache?.longitude ?? null,
      created_at: new Date().toISOString(),
    };
  }

  function buildUserFromCache() {
    return {
      id: remoteUser.id,
      display_name: myPledgeCache?.voiceName || null,
      email: null,
      city: myPledgeCache?.city || null,
      country: myPledgeCache?.country || null,
      latitude: myPledgeCache?.latitude ?? null,
      longitude: myPledgeCache?.longitude ?? null,
      created_at: remoteUser.created_at,
      hasCompletedWorldChoirOnboarding: remoteUser.hasCompletedWorldChoirOnboarding === true,
      songWeSangLetterStarted: remoteUser.songWeSangLetterStarted === true,
      songWeSangLetterCompleted: remoteUser.songWeSangLetterCompleted === true,
    };
  }

  function onboardingCompleteKey(userId) {
    return `wc_onboarding_complete_${userId || 'unknown'}`;
  }

  function songWeSangLetterKey(kind) {
    const id = remoteUser?.id || getDeviceId() || 'unknown';
    return `wc_song_we_sang_letter_${kind}_${id}`;
  }

  function readLocalSongWeSangFlag(kind) {
    try {
      return localStorage.getItem(songWeSangLetterKey(kind)) === '1';
    } catch {
      return false;
    }
  }

  function writeLocalSongWeSangFlag(kind) {
    try {
      localStorage.setItem(songWeSangLetterKey(kind), '1');
    } catch {
      /* ignore */
    }
  }

  function hasStartedSongWeSangLetter() {
    if (remoteUser?.songWeSangLetterStarted === true || remoteUser?.songWeSangLetterCompleted === true) {
      return true;
    }
    return readLocalSongWeSangFlag('started') || readLocalSongWeSangFlag('completed');
  }

  function hasCompletedSongWeSangLetter() {
    if (remoteUser?.songWeSangLetterCompleted === true) return true;
    return readLocalSongWeSangFlag('completed');
  }

  function needsWorldChoirOnboarding() {
    if (!remoteUser) return false;
    if (remoteUser.hasCompletedWorldChoirOnboarding === true) return false;
    try {
      // Same-device optimistic completion so a flaky write never re-shows forever.
      if (localStorage.getItem(onboardingCompleteKey(remoteUser.id)) === '1') {
        return false;
      }
    } catch {
      /* ignore */
    }
    return true;
  }

  async function completeWorldChoirOnboarding() {
    const data = await apiFetch('/api/user', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: getDeviceId(),
        action: 'complete-onboarding',
      }),
    });
    remoteUser = data.user;
    if (remoteUser) {
      remoteUser.hasCompletedWorldChoirOnboarding = true;
      try {
        localStorage.setItem(onboardingCompleteKey(remoteUser.id), '1');
      } catch {
        /* ignore */
      }
    }
    return remoteUser;
  }

  async function markSongWeSangLetterStarted() {
    writeLocalSongWeSangFlag('started');
    if (remoteUser) remoteUser.songWeSangLetterStarted = true;
    try {
      const data = await apiFetch('/api/user', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: getDeviceId(),
          action: 'mark-song-we-sang-letter-started',
        }),
      });
      remoteUser = data.user || remoteUser;
      if (remoteUser) remoteUser.songWeSangLetterStarted = true;
    } catch (err) {
      console.warn('markSongWeSangLetterStarted failed:', err);
    }
    return remoteUser;
  }

  async function markSongWeSangLetterCompleted() {
    writeLocalSongWeSangFlag('started');
    writeLocalSongWeSangFlag('completed');
    if (remoteUser) {
      remoteUser.songWeSangLetterStarted = true;
      remoteUser.songWeSangLetterCompleted = true;
    }
    try {
      const data = await apiFetch('/api/user', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: getDeviceId(),
          action: 'mark-song-we-sang-letter-completed',
        }),
      });
      remoteUser = data.user || remoteUser;
      if (remoteUser) {
        remoteUser.songWeSangLetterStarted = true;
        remoteUser.songWeSangLetterCompleted = true;
      }
    } catch (err) {
      console.warn('markSongWeSangLetterCompleted failed:', err);
    }
    return remoteUser;
  }

  function updateUser(updates) {
    const user = getOrCreateUser();
    const merged = { ...user, ...updates };
    if (myPledgeCache) {
      myPledgeCache = { ...myPledgeCache, ...updates };
      if (updates.display_name) myPledgeCache.voiceName = updates.display_name;
    }
    return merged;
  }

  function getCurrentUser() {
    return getOrCreateUser();
  }

  async function geocodeCityCountry(city, country) {
    const geocodeCountry = typeof WorldChoirCountries !== 'undefined'
      ? WorldChoirCountries.getGeocodeCountry(country)
      : country;
    const q = encodeURIComponent(`${city}, ${geocodeCountry}`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error('Geocoding failed');
    const data = await res.json();
    if (!data.length) throw new Error('City not found');
    return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
  }

  async function createPledgeWithGeocode({ city, country }) {
    let coords = { latitude: null, longitude: null };
    try {
      coords = await geocodeCityCountry(city, country);
    } catch (e) {
      console.warn('Geocoding unavailable, saving city without coordinates', e);
    }

    const hadPledge = !!myPledgeCache;
    const data = await apiFetch('/api/join', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: getDeviceId(),
        eventId: WorldChoirConfig.CURRENT_EVENT.id,
        city,
        country,
        latitude: coords.latitude,
        longitude: coords.longitude,
      }),
    });

    myPledgeCache = data.pledge;
    await syncAllPledges();
    if (typeof syncMapAggregates === 'function') {
      try { await syncMapAggregates(); } catch { /* Map aggregate refresh is best-effort */ }
    }

    if (hadPledge) {
      window.dispatchEvent(new CustomEvent('wc-pledge-updated', { detail: myPledgeCache }));
    } else {
      window.dispatchEvent(new CustomEvent('wc-pledge-added', { detail: myPledgeCache }));
    }

    return myPledgeCache;
  }

  async function updateParticipationLocation({ city, country }) {
    let coords = { latitude: null, longitude: null };
    try {
      coords = await geocodeCityCountry(city, country);
    } catch (e) {
      console.warn('Geocoding failed on profile update', e);
    }

    if (hasPledged()) {
      const data = await apiFetch('/api/update-location', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: getDeviceId(),
          eventId: WorldChoirConfig.CURRENT_EVENT.id,
          city,
          country,
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
      });
      myPledgeCache = data.pledge;
      await syncAllPledges();
      if (typeof syncMapAggregates === 'function') {
        try { await syncMapAggregates(); } catch { /* ignore */ }
      }
      window.dispatchEvent(new CustomEvent('wc-pledge-updated', { detail: myPledgeCache }));
    } else {
      updateUser({ city, country, latitude: coords.latitude, longitude: coords.longitude });
    }

    return coords;
  }

  function getPledgeForCurrentUser(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    if (myPledgeCache !== undefined) {
      if (myPledgeCache) {
        const eid = myPledgeCache.event_id || myPledgeCache.eventId;
        if (!eid || eid === eventId) return myPledgeCache;
      }
      return null;
    }

    if (remoteUser?.id) {
      return (cachedPledges || []).find(
        (p) => p.user_id === remoteUser.id && (p.event_id === eventId || p.eventId === eventId)
      ) || null;
    }

    return null;
  }

  function isPledgeLoaded() {
    return myPledgeCache !== undefined;
  }

  function getPledgeState(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    if (!isPledgeLoaded()) return 'loading';
    return hasPledged(eventId) ? 'pledged' : 'not_pledged';
  }

  function hasPledged(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    return !!getPledgeForCurrentUser(eventId);
  }

  function isPledgesLoaded() {
    return cachedPledges !== undefined;
  }

  function isMapAggregateLoaded() {
    return cachedMapAggregate !== undefined;
  }

  /** Map may be ready from full pledges (legacy) OR aggregate endpoint. */
  function isMapDataReady() {
    return isPledgesLoaded() || isMapAggregateLoaded();
  }

  function getMapDataState(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    if (!isMapDataReady()) {
      if (pledgesLoadError || mapAggregateLoadError) return 'error';
      return 'loading';
    }

    const stats = getMapStats(eventId);
    return stats.voices === 0 ? 'loaded_empty' : 'loaded_with_voices';
  }

  function getPledgesForEvent(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    if (!isPledgesLoaded()) return [];
    return cachedPledges.filter((p) => p.event_id === eventId);
  }

  function getVoiceNameForUser(userId = remoteUser?.id, eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    const pledge = userId
      ? (cachedPledges || []).find((p) => p.user_id === userId && p.event_id === eventId)
      : getPledgeForCurrentUser(eventId);
    return pledge?.voiceName || pledge?.display_name || null;
  }

  function createPromise({ promiseText, city, country, latitude, longitude }) {
    const user = getCurrentUser();
    const pledge = getPledgeForCurrentUser();
    const promises = read(KEYS.promises);

    const existing = promises.find(
      (p) => p.user_id === user.id && p.event_id === WorldChoirConfig.CURRENT_EVENT.id
    );
    if (existing) return existing;

    const promise = {
      id: generateId(),
      user_id: user.id,
      event_id: WorldChoirConfig.CURRENT_EVENT.id,
      display_name: pledge?.voiceName || pledge?.display_name || user.display_name,
      voiceName: pledge?.voiceName || null,
      voiceNumber: pledge?.voiceNumber ?? null,
      city: city || pledge?.city || user.city,
      country: country || pledge?.country || user.country,
      latitude: latitude || pledge?.latitude || user.latitude,
      longitude: longitude || pledge?.longitude || user.longitude,
      promise_text: promiseText,
      event_song: WorldChoirConfig.CURRENT_EVENT.songName,
      submitted_at: new Date().toISOString(),
    };
    promises.push(promise);
    write(KEYS.promises, promises);

    apiFetch('/api/promise', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: getDeviceId(),
        eventId: WorldChoirConfig.CURRENT_EVENT.id,
        promiseText,
        city: promise.city,
        country: promise.country,
        voiceNumber: promise.voiceNumber,
        voiceName: promise.voiceName,
      }),
    }).catch((err) => console.warn('Promise sync to server failed:', err));

    return promise;
  }

  function hasSubmittedPromise(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    const user = getCurrentUser();
    return read(KEYS.promises).some((p) => p.user_id === user.id && p.event_id === eventId);
  }

  function getPromiseForCurrentUser(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    const user = getCurrentUser();
    return read(KEYS.promises).find((p) => p.user_id === user.id && p.event_id === eventId);
  }

  function getAllPromises(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    return read(KEYS.promises).filter((p) => p.event_id === eventId);
  }

  function getGatheringPlaces(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    return read(KEYS.gatheringPlaces).filter(
      (g) => g.event_id === eventId && g.is_verified === true
    );
  }

  function getUniquePledgesForEvent(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    const pledges = getPledgesForEvent(eventId);
    const seenUsers = new Set();
    return pledges.filter((p) => {
      if (seenUsers.has(p.user_id)) return false;
      seenUsers.add(p.user_id);
      return true;
    });
  }

  function getMapStats(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    if (isPledgesLoaded()) {
      const pledges = getUniquePledgesForEvent(eventId);
      const withLocation = pledges.filter((p) => p.city && p.country);
      const cities = new Set(withLocation.map((p) => `${p.city}|${p.country}`));
      const countries = new Set(withLocation.map((p) => p.country));
      return {
        voices: pledges.length,
        cities: cities.size,
        countries: countries.size,
      };
    }

    if (isMapAggregateLoaded()) {
      return {
        voices: cachedMapAggregate.stats?.voices ?? 0,
        cities: cachedMapAggregate.stats?.cities ?? 0,
        countries: cachedMapAggregate.stats?.countries ?? 0,
      };
    }

    return null;
  }

  function getAggregatedCities(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    if (isPledgesLoaded()) {
      const pledges = getUniquePledgesForEvent(eventId).filter(
        (p) => p.latitude != null && p.longitude != null && p.city && p.country
      );
      const map = {};
      pledges.forEach((p) => {
        const key = `${p.city}|${p.country}`;
        if (!map[key]) {
          map[key] = {
            city: p.city,
            country: p.country,
            latitude: p.latitude,
            longitude: p.longitude,
            count: 0,
          };
        }
        map[key].count += 1;
      });
      return Object.values(map);
    }

    if (isMapAggregateLoaded()) {
      return Array.isArray(cachedMapAggregate.cities) ? cachedMapAggregate.cities : [];
    }

    return [];
  }

  function hasGatheringNear(city, country, maxKm = 50) {
    const gatherings = getGatheringPlaces();
    const cities = getAggregatedCities();
    const target = cities.find((c) => c.city === city && c.country === country);
    if (!target) return false;
    return gatherings.some((g) => {
      if (g.city === city && g.country === country) return true;
      const d = haversineKm(target.latitude, target.longitude, g.latitude, g.longitude);
      return d <= maxKm;
    });
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getParticipationHistory() {
    const user = getCurrentUser();
    const pledges = (cachedPledges || []).filter((p) => p.user_id === user.id);
    const promises = read(KEYS.promises).filter((p) => p.user_id === user.id);
    const events = read(KEYS.events);

    return pledges.map((pledge) => {
      const event = events.find((e) => e.id === pledge.event_id);
      const promise = promises.find((p) => p.event_id === pledge.event_id);
      return { pledge, promise, event };
    });
  }

  function getCityParticipation() {
    const pledges = getPledgesForEvent();
    const cities = {};
    pledges.forEach((p) => {
      const key = `${p.city}, ${p.country}`;
      if (!cities[key]) {
        cities[key] = { city: p.city, country: p.country, count: 0, lat: p.latitude, lng: p.longitude };
      }
      cities[key].count += 1;
    });
    return Object.values(cities);
  }

  return {
    ready,
    readyIdentity,
    readyMyPledge,
    bootstrap,
    syncAllPledges,
    syncAllPledgesIfChanged,
    startLiveSync,
    stopLiveSync,
    syncMapAggregates,
    syncMapAggregatesIfChanged,
    startMapAggregateSync,
    stopMapAggregateSync,
    warmMapAggregateFromPresentation,
    fetchWorldStats,
    refreshWorldStatsIfChanged,
    getPresentationVoiceCount,
    startWorldStatsRefresh,
    syncMyPledge,
    getDeviceId,
    getOrCreateUser,
    updateUser,
    getCurrentUser,
    needsWorldChoirOnboarding,
    completeWorldChoirOnboarding,
    hasStartedSongWeSangLetter,
    hasCompletedSongWeSangLetter,
    markSongWeSangLetterStarted,
    markSongWeSangLetterCompleted,
    createPledgeWithGeocode,
    updateParticipationLocation,
    geocodeCityCountry,
    getPledgeForCurrentUser,
    isPledgeLoaded,
    getPledgeState,
    hasPledged,
    getPledgesForEvent,
    isPledgesLoaded,
    isMapAggregateLoaded,
    isMapDataReady,
    getMapDataState,
    createPromise,
    hasSubmittedPromise,
    getPromiseForCurrentUser,
    getAllPromises,
    getGatheringPlaces,
    getMapStats,
    getAggregatedCities,
    hasGatheringNear,
    getParticipationHistory,
    getVoiceNameForUser,
    hasCompletedEvents,
    getCompletedEvents,
    syncActiveEventStatus,
    getCityParticipation,
  };
})();
