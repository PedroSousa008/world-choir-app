/**
 * World Choir — Local database layer (localStorage)
 * Schema: users, events, pledges, promises, gathering_places, media_submissions
 */
const WorldChoirDB = (() => {
  const KEYS = {
    users: 'wc_users',
    events: 'wc_events',
    pledges: 'wc_pledges',
    promises: 'wc_promises',
    gatheringPlaces: 'wc_gathering_places',
    media: 'wc_media',
    currentUserId: 'wc_current_user_id',
    session: 'wc_session',
  };

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

  /** Remove demo gathering markers/lights left in localStorage from early builds. */
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

  function seed() {
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

    // Gathering places are added via admin only — no fake seed data
  }

  function getOrCreateUser() {
    let userId = localStorage.getItem(KEYS.currentUserId);
    const users = read(KEYS.users);

    if (userId) {
      const existing = users.find((u) => u.id === userId);
      if (existing) return existing;
    }

    userId = generateId();
    const user = {
      id: userId,
      display_name: 'Voice ' + userId.slice(-4).toUpperCase(),
      email: null,
      city: null,
      country: null,
      latitude: null,
      longitude: null,
      created_at: new Date().toISOString(),
    };
    users.push(user);
    write(KEYS.users, users);
    localStorage.setItem(KEYS.currentUserId, userId);
    return user;
  }

  function updateUser(updates) {
    const users = read(KEYS.users);
    const userId = localStorage.getItem(KEYS.currentUserId);
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...updates };
    write(KEYS.users, users);
    return users[idx];
  }

  function getCurrentUser() {
    const userId = localStorage.getItem(KEYS.currentUserId);
    if (!userId) return getOrCreateUser();
    return read(KEYS.users).find((u) => u.id === userId) || getOrCreateUser();
  }

  function createPledge({ displayName, city, country, latitude, longitude, reason }) {
    const user = getOrCreateUser();
    const name = displayName || user.display_name;
    updateUser({ display_name: name, city, country, latitude, longitude });

    const pledges = read(KEYS.pledges);
    const existingIdx = pledges.findIndex(
      (p) => p.user_id === user.id && p.event_id === WorldChoirConfig.CURRENT_EVENT.id
    );

    const pledge = {
      id: existingIdx >= 0 ? pledges[existingIdx].id : generateId(),
      user_id: user.id,
      event_id: WorldChoirConfig.CURRENT_EVENT.id,
      display_name: name,
      city,
      country,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      reason_for_singing: reason || null,
      pledged_at: existingIdx >= 0 ? pledges[existingIdx].pledged_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      pledges[existingIdx] = pledge;
    } else {
      pledges.push(pledge);
    }

    write(KEYS.pledges, pledges);
    window.dispatchEvent(new CustomEvent('wc-pledge-added', { detail: pledge }));
    window.dispatchEvent(new CustomEvent('wc-pledge-updated', { detail: pledge }));
    return pledge;
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

  async function createPledgeWithGeocode({ city, country, displayName }) {
    let coords = { latitude: null, longitude: null };
    try {
      coords = await geocodeCityCountry(city, country);
    } catch (e) {
      console.warn('Geocoding unavailable, saving city without coordinates', e);
    }
    return createPledge({
      displayName,
      city,
      country,
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
  }

  async function updateParticipationLocation({ city, country, displayName }) {
    const user = getCurrentUser();
    let coords = { latitude: null, longitude: null };
    try {
      coords = await geocodeCityCountry(city, country);
    } catch (e) {
      console.warn('Geocoding failed on profile update', e);
    }

    updateUser({
      display_name: displayName ?? user.display_name,
      city,
      country,
      latitude: coords.latitude,
      longitude: coords.longitude,
    });

    if (hasPledged()) {
      createPledge({
        displayName: displayName ?? user.display_name,
        city,
        country,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    }

    return coords;
  }

  function getPledgeForCurrentUser(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    const user = getCurrentUser();
    return read(KEYS.pledges).find((p) => p.user_id === user.id && p.event_id === eventId);
  }

  function hasPledged(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    return !!getPledgeForCurrentUser(eventId);
  }

  function getPledgesForEvent(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    return read(KEYS.pledges).filter((p) => p.event_id === eventId);
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
      display_name: user.display_name,
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

  /** One map light per user — strictly 1:1 with pledges (deduped by user_id). */
  function getUserLights(eventId = WorldChoirConfig.CURRENT_EVENT.id) {
    const pledges = getPledgesForEvent(eventId).filter(
      (p) => p.latitude != null && p.longitude != null && p.city && p.country
    );
    const seenUsers = new Set();
    const unique = pledges.filter((p) => {
      if (seenUsers.has(p.user_id)) return false;
      seenUsers.add(p.user_id);
      return true;
    });

    const perCity = {};
    unique.forEach((p) => {
      const key = `${p.city}|${p.country}`;
      perCity[key] = (perCity[key] || 0) + 1;
    });
    const cityIndex = {};

    return unique.map((p) => {
      const key = `${p.city}|${p.country}`;
      const idx = cityIndex[key] || 0;
      cityIndex[key] = idx + 1;
      const offset = spreadLightOffset(idx, perCity[key]);
      return {
        id: p.id,
        userId: p.user_id,
        city: p.city,
        country: p.country,
        latitude: p.latitude + offset.lat,
        longitude: p.longitude + offset.lng,
      };
    });
  }

  function spreadLightOffset(index, totalInCity) {
    if (totalInCity <= 1) return { lat: 0, lng: 0 };
    const angle = index * 2.399963;
    const r = 0.06 * Math.sqrt(index + 1);
    return { lat: r * Math.cos(angle), lng: r * Math.sin(angle) };
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
    const pledges = read(KEYS.pledges).filter((p) => p.user_id === user.id);
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

  seed();

  return {
    getOrCreateUser,
    updateUser,
    getCurrentUser,
    createPledge,
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
    getUserLights,
    hasGatheringNear,
    getParticipationHistory,
    getCityParticipation,
  };
})();
