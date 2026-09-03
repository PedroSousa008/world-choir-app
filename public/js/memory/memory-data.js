/**
 * WorldChoirMemoryData — post-event Memory tab models + demo/fallback data.
 * Presentation stays separate; swap loaders when backend UGC exists.
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

  const DEMO_ROUTE = [
    { id: 'lisbon', city: 'Lisbon', country: 'Portugal', date: '21 Sep', status: 'completed' },
    { id: 'rio', city: 'Rio de Janeiro', country: 'Brazil', date: '28 Sep', status: 'current' },
    { id: 'nairobi', city: 'Nairobi', country: 'Kenya', date: '05 Oct', status: 'upcoming' },
    { id: 'mumbai', city: 'Mumbai', country: 'India', date: '12 Oct', status: 'upcoming' },
    { id: 'seoul', city: 'Seoul', country: 'South Korea', date: '19 Oct', status: 'upcoming' },
    { id: 'sydney', city: 'Sydney', country: 'Australia', date: '26 Oct', status: 'upcoming' },
  ];

  function getDefaultEvent() {
    const active = (typeof WorldChoirConfig !== 'undefined' && WorldChoirConfig.ACTIVE_EVENT)
      ? WorldChoirConfig.ACTIVE_EVENT
      : {};

    // Commemorative archive figures from the approved Memory mockup.
    // Replace with authoritative post-event API totals when available.
    return {
      id: active.id || 'world-choir-2027',
      eventName: active.title || 'World Choir 2027',
      songTitle: active.songName || 'Voices of the World',
      songArtwork: 'images/imagine-after.png',
      date: '21 Sep 2027',
      participantCount: 8432117,
      countryCount: 197,
      promisesCount: 7920643,
      worldCount: 1,
    };
  }

  function getPhotos() {
    // Hook: replace with API/UGC when available.
    return DEMO_PHOTOS.slice();
  }

  function getStamps() {
    // Hook: merge with PassportStamps / participation flags when available.
    return DEMO_STAMPS.map((s) => ({ ...s }));
  }

  function getRoute() {
    return DEMO_ROUTE.map((s) => ({ ...s }));
  }

  return {
    getDefaultEvent,
    getPhotos,
    getStamps,
    getRoute,
  };
})();
