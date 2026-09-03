/**
 * WorldChoirMemoryData — post-event Memory tab models + real data loaders.
 * Never invent production counts — load from APIs / local DB only.
 */
const WorldChoirMemoryData = (() => {
  const DEMO_PHOTOS = [
    {
      id: 'mem-photo-1',
      imageUrl: 'images/after-event.png',
      userId: 'demo-1',
      userName: 'Amara Okafor',
      city: 'Lagos',
      country: 'Nigeria',
      createdAt: '2027-09-21T16:12:00.000Z',
      caption: 'Singing with my street',
      eventId: 'world-choir-2027',
    },
    {
      id: 'mem-photo-2',
      imageUrl: 'images/memory-after.png',
      userId: 'demo-2',
      userName: 'Sofia Mendes',
      city: 'Lisbon',
      country: 'Portugal',
      createdAt: '2027-09-21T16:18:00.000Z',
      caption: 'The lights of our city',
      eventId: 'world-choir-2027',
    },
    {
      id: 'mem-photo-3',
      imageUrl: 'images/imagine-after.png',
      userId: 'demo-3',
      userName: 'Kenji Sato',
      city: 'Tokyo',
      country: 'Japan',
      createdAt: '2027-09-21T16:22:00.000Z',
      caption: 'One song across oceans',
      eventId: 'world-choir-2027',
    },
    {
      id: 'mem-photo-4',
      imageUrl: 'images/background-imagine.png',
      userId: 'demo-4',
      userName: 'Maria Silva',
      city: 'São Paulo',
      country: 'Brazil',
      createdAt: '2027-09-21T16:30:00.000Z',
      caption: 'Together on the rooftop',
      eventId: 'world-choir-2027',
    },
    {
      id: 'mem-photo-5',
      imageUrl: 'images/memory-after-card.png',
      userId: 'demo-5',
      userName: 'Noah Berg',
      city: 'Stockholm',
      country: 'Sweden',
      createdAt: '2027-09-21T16:41:00.000Z',
      caption: 'Our window to the world',
      eventId: 'world-choir-2027',
    },
  ];

  const DEMO_STAMPS = [
    {
      id: 'pledged',
      label: 'I Pledged',
      icon: 'heart',
      accent: 'cyan',
      earned: true,
      earnedAt: '2027-09-21',
      detail: '21 Sep 2027',
    },
    {
      id: 'sang',
      label: 'I Sang',
      icon: 'music',
      accent: 'magenta',
      earned: true,
      earnedAt: '2027-09-21',
      detail: '21 Sep 2027',
    },
    {
      id: 'promised',
      label: 'I Promised',
      icon: 'peace',
      accent: 'pink',
      earned: true,
      earnedAt: '2027-09-21',
      detail: '21 Sep 2027',
    },
    {
      id: 'daily-acts',
      label: 'Daily Acts',
      icon: 'sprout',
      accent: 'green',
      earned: true,
      earnedAt: '2027-09-21',
      detail: '7 Days',
    },
    {
      id: 'shared-peace',
      label: 'Shared Peace',
      icon: 'people',
      accent: 'blue',
      earned: false,
      detail: 'Locked',
    },
    {
      id: 'pass-the-world',
      label: 'Pass the World',
      icon: 'globe',
      accent: 'amber',
      earned: false,
      detail: 'Locked',
    },
  ];

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

  function formatEventDateLabel() {
    try {
      if (typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.formatEventDate) {
        return WorldChoirConfig.formatEventDate();
      }
    } catch {
      /* fall through */
    }
    return '—';
  }

  function localEventFallback() {
    const id = eventId();
    const movement = (typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.getMovementStats)
      ? WorldChoirConfig.getMovementStats()
      : { voices: 0, countries: 0 };
    const map = (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.getMapStats)
      ? WorldChoirDB.getMapStats(id)
      : null;
    const promises = (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.getAllPromises)
      ? WorldChoirDB.getAllPromises(id)
      : [];

    return {
      voices: Number(map?.voices ?? movement.voices) || 0,
      countries: Number(map?.countries ?? movement.countries) || 0,
      promisesMade: Array.isArray(promises) ? promises.length : 0,
    };
  }

  /** Sync shell — real numbers filled by loadEventArchive(). */
  function getDefaultEvent() {
    const active = (typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.ACTIVE_EVENT)
      ? WorldChoirConfig.ACTIVE_EVENT
      : {};
    const local = localEventFallback();

    return {
      id: active.id || eventId(),
      eventName: active.title || 'World Choir 2027',
      songTitle: active.songName || 'Imagine',
      songArtwork: 'images/imagine-after.png',
      date: formatEventDateLabel(),
      participantCount: local.voices,
      countryCount: local.countries,
      promisesCount: local.promisesMade,
      dailyActsCompleted: null,
    };
  }

  async function fetchUserDailyActsCompleted() {
    try {
      const id = deviceId();
      if (!id) return 0;
      const date = new Date().toLocaleDateString('en-CA');
      const res = await fetch(
        `/api/daily-peace?deviceId=${encodeURIComponent(id)}&view=impact&date=${encodeURIComponent(date)}`,
        { credentials: 'same-origin', cache: 'no-store' }
      );
      if (!res.ok) return 0;
      const data = await res.json().catch(() => ({}));
      return Number(data?.summary?.totalCompleted) || 0;
    } catch {
      return 0;
    }
  }

  async function loadEventArchive() {
    const base = getDefaultEvent();
    const id = eventId();
    let voices = base.participantCount;
    let countries = base.countryCount;
    let promisesMade = base.promisesCount;
    let dailyActsCompleted = 0;

    try {
      const [statsRes, userActs] = await Promise.all([
        fetch(`/api/stats?eventId=${encodeURIComponent(id)}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetchUserDailyActsCompleted(),
      ]);

      if (statsRes) {
        if (statsRes.voices != null) voices = Number(statsRes.voices) || 0;
        if (statsRes.countries != null) countries = Number(statsRes.countries) || 0;
        if (statsRes.promisesMade != null) {
          promisesMade = Number(statsRes.promisesMade) || 0;
        }
      }
      dailyActsCompleted = Number(userActs) || 0;
    } catch {
      dailyActsCompleted = 0;
    }

    return {
      ...base,
      participantCount: voices,
      countryCount: countries,
      promisesCount: promisesMade,
      dailyActsCompleted,
    };
  }

  function formatRouteDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      const day = d.toLocaleDateString('en-GB', { day: '2-digit', timeZone: 'UTC' });
      const month = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
      return `${day} ${month}`;
    } catch {
      return '—';
    }
  }

  function titleCasePlace(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    // Keep existing casing when already mixed; otherwise soft-normalize ALL CAPS.
    if (raw !== raw.toUpperCase()) return raw;
    return raw
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Chronological Pass the World stops from the live itinerary API.
   * City on top, country under, date under — same aesthetic as the Memory route UI.
   */
  function mapPassTheWorldRoute(payload) {
    const journey = payload?.journey || {};
    const entries = [...(payload?.itinerary || [])]
      .filter((e) => e && (e.city || e.country))
      .sort((a, b) => {
        const sa = Number(a.sequence) || 0;
        const sb = Number(b.sequence) || 0;
        if (sa !== sb) return sa - sb;
        return String(a.arrivedAt || a.createdAt || '')
          .localeCompare(String(b.arrivedAt || b.createdAt || ''));
      });

    const stops = entries.map((entry, index) => {
      const isLast = index === entries.length - 1;
      let status = 'completed';
      if (isLast) {
        status = journey.status === 'TRAVELLING' ? 'completed' : 'current';
      }
      return {
        id: entry.id || `stop-${index + 1}`,
        city: titleCasePlace(entry.city),
        country: titleCasePlace(entry.country),
        date: formatRouteDate(entry.arrivedAt || entry.createdAt),
        status,
        sequence: Number(entry.sequence) || index + 1,
      };
    });

    // If the World is travelling to a destination not yet arrived, append it.
    const dest = journey.destination;
    if (journey.status === 'TRAVELLING' && dest?.city) {
      const already = stops.some((s) => (
        s.city.toLowerCase() === String(dest.city || '').toLowerCase()
        && s.country.toLowerCase() === String(dest.country || '').toLowerCase()
      ));
      if (!already) {
        if (stops.length) stops[stops.length - 1].status = 'completed';
        stops.push({
          id: 'in-transit',
          city: titleCasePlace(dest.city),
          country: titleCasePlace(dest.country),
          date: formatRouteDate(journey.arrivalAt || dest.arrivalAt),
          status: 'current',
          sequence: stops.length + 1,
        });
      } else if (stops.length) {
        stops[stops.length - 1].status = 'current';
      }
    }

    return stops;
  }

  async function loadPassTheWorldRoute() {
    try {
      const params = new URLSearchParams({ eventId: eventId() });
      const id = deviceId();
      if (id) params.set('deviceId', id);
      const res = await fetch(`/api/pass-the-world?${params}`, { cache: 'no-store' });
      if (!res.ok) return [];
      const payload = await res.json().catch(() => null);
      if (!payload) return [];
      return mapPassTheWorldRoute(payload);
    } catch {
      return [];
    }
  }

  function getPhotos() {
    // Hook: replace with API/UGC when available.
    return DEMO_PHOTOS.slice();
  }

  function getStamps() {
    // Hook: merge with PassportStamps / participation flags when available.
    return DEMO_STAMPS.map((s) => ({ ...s }));
  }

  return {
    getDefaultEvent,
    loadEventArchive,
    loadPassTheWorldRoute,
    getPhotos,
    getStamps,
  };
})();
