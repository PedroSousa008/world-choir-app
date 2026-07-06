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
  let myPledgeCache = null;
  let cachedPledges = [];
  let bootstrapPromise = null;

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
      throw new Error(data.error || `Request failed (${res.status})`);
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
    const data = await apiFetch(`/api/pledges?eventId=${encodeURIComponent(eventId)}`);
    cachedPledges = data.pledges || [];
    window.dispatchEvent(new CustomEvent('wc-pledges-synced', { detail: cachedPledges }));
    return cachedPledges;
  }

  async function bootstrap() {
    getDeviceId();
    await ensureRemoteUser();
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
        event_date_utc: WorldChoirConfig.ACTIVE_EVENT.eventDateUTC,
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
    };
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
    const q = encodeURIComponent(`${city}, ${country}`);
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
      window.dispatchEvent(new CustomEvent('wc-pledge-updated', { detail: myPledgeCache }));
    } else {
      updateUser({ city, country, latitude: coords.latitude, longitude: coords.longitude });
    }

    return coords;
  }

  function getPledgeForCurrentUser(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    if (myPledgeCache && myPledgeCache.event_id === eventId) {
      return myPledgeCache;
    }
    return cachedPledges.find(
      (p) => p.user_id === remoteUser?.id && p.event_id === eventId
    ) || null;
  }

  function hasPledged(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    return !!getPledgeForCurrentUser(eventId);
  }

  function getPledgesForEvent(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    return cachedPledges.filter((p) => p.event_id === eventId);
  }

  function getVoiceNameForUser(userId = remoteUser?.id, eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    const pledge = userId
      ? cachedPledges.find((p) => p.user_id === userId && p.event_id === eventId)
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

  function getAggregatedCities(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
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
    const pledges = cachedPledges.filter((p) => p.user_id === user.id);
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
    bootstrap,
    syncAllPledges,
    syncMyPledge,
    getDeviceId,
    getOrCreateUser,
    updateUser,
    getCurrentUser,
    createPledgeWithGeocode,
    updateParticipationLocation,
    geocodeCityCountry,
    getPledgeForCurrentUser,
    hasPledged,
    getPledgesForEvent,
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
