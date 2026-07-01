import { useState } from 'react';
import { CountdownDisplay } from '../components/CountdownDisplay';
import { EmptyState, LoadingBlock, StatsRow } from '../components/Shared';
import { formatEventDateUTC, formatLocalTime } from '../constants/event';
import { useData } from '../context/DataContext';
import { useEventClock } from '../hooks/useEventClock';
import type { PledgeReason } from '../types';
import {
  createPledge,
  geocodeCity,
  isDatabaseConfigured,
  upsertUser,
} from '../services/database';
import './HomeScreen.css';

const REASONS: PledgeReason[] = [
  'Peace', 'Hope', 'Love', 'Family', 'Humanity', 'Mental Health', 'Music', 'Other',
];

interface Props {
  refreshKey: number;
}

export function HomeScreen({ refreshKey }: Props) {
  const { loading, stats, refresh, setUser, dbConfigured } = useData();
  const clock = useEventClock();
  const { event, status, countdown, user, pledge, hasPledged, userPhase } = clock;

  const [showReason, setShowReason] = useState(false);
  const [pledging, setPledging] = useState(false);
  const [locationModal, setLocationModal] = useState(false);
  const [cityInput, setCityInput] = useState(user.city);
  const [countryInput, setCountryInput] = useState(user.country);
  const [error, setError] = useState('');

  async function submitPledge(reason?: PledgeReason) {
    setError('');
    setPledging(true);

    const city = user.city || cityInput.trim();
    const country = user.country || countryInput.trim();

    if (!city || !country) {
      setLocationModal(true);
      setPledging(false);
      return;
    }

    if (!isDatabaseConfigured) {
      setError('Unable to save your pledge right now. Please try again later.');
      setPledging(false);
      return;
    }

    const coords = await geocodeCity(city, country);
    const updated: typeof user = {
      ...user,
      city,
      country,
      latitude: coords?.lat,
      longitude: coords?.lng,
      updatedAt: new Date().toISOString(),
    };

    await upsertUser(updated);
    setUser(updated);

    const saved = await createPledge({
      id: `pledge_${crypto.randomUUID()}`,
      userId: user.id,
      eventId: event.id,
      displayName: updated.displayName,
      city,
      country,
      latitude: coords?.lat,
      longitude: coords?.lng,
      reason,
      createdAt: new Date().toISOString(),
    });

    setPledging(false);
    setShowReason(false);
    setLocationModal(false);

    if (!saved) {
      setError('Could not save your pledge. Please try again.');
      return;
    }

    await refresh();
  }

  function saveLocationAndPledge() {
    if (!cityInput.trim() || !countryInput.trim()) return;
    setUser({ ...user, city: cityInput.trim(), country: countryInput.trim() });
    submitPledge();
  }

  function handleShare() {
    const text = `The world sings together on ${formatEventDateUTC(event.startsAtUTC)}. ${event.hashtag}`;
    if (navigator.share) {
      navigator.share({ title: 'World Choir', text, url: window.location.href });
    } else {
      navigator.clipboard?.writeText(text);
    }
  }

  function handleCalendar() {
    const start = new Date(event.startsAtUTC);
    const end = new Date(event.endsAtUTC);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('World Choir — ' + event.songTitle)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent('One song. One world. One moment.')}`;
    window.open(url, '_blank');
  }

  if (loading) {
    return (
      <div className="screen home-screen">
        <LoadingBlock label="Loading World Choir..." />
      </div>
    );
  }

  if (userPhase === 'promise_open') return null;

  if (userPhase === 'waiting_next') {
    return (
      <div className="screen home-screen fade-in" key={refreshKey}>
        <EmptyState
          title="Waiting for Next Countdown"
          subtitle="The next World Choir Event has not been announced yet."
        />
      </div>
    );
  }

  if (status === 'live') {
    return (
      <div className="screen home-screen home-screen--live fade-in" key={refreshKey}>
        <p className="eyebrow">Live now</p>
        <h1 className="heading-lg">The moment has arrived.</h1>
        <h2 className="home-screen__go-sing">Go sing.</h2>
        <p className="subtitle">{event.songTitle} — {event.artist}</p>
        <p className="home-screen__hashtag">{event.hashtag}</p>
        <div className="card home-screen__live-card">
          <p>Put your phone down. The world is singing with you.</p>
        </div>
      </div>
    );
  }

  if (status === 'final_hour') {
    return (
      <div className="screen home-screen fade-in" key={refreshKey}>
        <p className="eyebrow">World Choir</p>
        <h1 className="heading">The World is Almost Ready</h1>
        <CountdownDisplay countdown={countdown} large showDays={false} />
        <p className="subtitle home-screen__center">
          Soon, people around the world will sing together.
        </p>
        <StatsRow
          voices={stats.totalPledges}
          countries={stats.countriesCount}
          cities={stats.citiesCount}
          emptySubtext={stats.totalPledges === 0 ? 'Be the first voice to join the next World Choir.' : undefined}
        />
        <p className="home-screen__song-line">{event.songTitle} — {event.artist}</p>
        <p className="home-screen__hashtag">{event.hashtag}</p>
      </div>
    );
  }

  return (
    <div className="screen home-screen fade-in" key={refreshKey}>
      <header className="home-screen__header">
        <p className="eyebrow">World Choir</p>
        <h1 className="heading">The world sings together in</h1>
      </header>

      <CountdownDisplay countdown={countdown} large />

      <div className="home-screen__event-meta">
        <p>{formatEventDateUTC(event.startsAtUTC)}</p>
        <p className="home-screen__local">Your local time: {formatLocalTime(event.startsAtUTC)}</p>
      </div>

      <div className="card home-screen__song-block">
        <p className="home-screen__song-title">{event.songTitle} — {event.artist}</p>
        <p className="home-screen__theme">
          This year's World Choir is dedicated to <strong>{event.theme}</strong>
        </p>
      </div>

      <StatsRow
        voices={stats.totalPledges}
        countries={stats.countriesCount}
        cities={stats.citiesCount}
        emptySubtext={stats.totalPledges === 0 ? 'Be the first voice to join the next World Choir.' : undefined}
      />

      {!dbConfigured && (
        <p className="home-screen__db-notice">Database connection pending. Counts will update when connected.</p>
      )}

      <div className="home-screen__actions">
        {hasPledged ? (
          <div className="home-screen__pledged">
            <button className="btn-primary" disabled>You're part of the choir</button>
            {pledge && (
              <p className="home-screen__pledge-location">
                Your voice has joined {pledge.city}, {pledge.country}.
              </p>
            )}
          </div>
        ) : (
          <button className="btn-primary" onClick={() => setShowReason(true)} disabled={pledging}>
            {pledging ? 'Joining...' : "I'll Sing"}
          </button>
        )}

        {error && <p className="home-screen__error">{error}</p>}

        <div className="home-screen__secondary">
          <button className="btn-secondary" onClick={handleCalendar}>Add to Calendar</button>
          <button className="btn-secondary" onClick={handleShare}>Share</button>
        </div>
      </div>

      {showReason && (
        <div className="modal-overlay" onClick={() => setShowReason(false)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal__title">Why are you singing?</h3>
            <p className="subtitle modal__sub">Optional — you can skip this.</p>
            <div className="reason-grid">
              {REASONS.map((r) => (
                <button key={r} className="reason-chip" onClick={() => submitPledge(r)}>{r}</button>
              ))}
            </div>
            <button className="btn-secondary modal__skip" onClick={() => submitPledge()}>Skip</button>
          </div>
        </div>
      )}

      {locationModal && (
        <div className="modal-overlay">
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal__title">Where will you sing from?</h3>
            <input className="modal-input" placeholder="City" value={cityInput} onChange={(e) => setCityInput(e.target.value)} />
            <input className="modal-input" placeholder="Country" value={countryInput} onChange={(e) => setCountryInput(e.target.value)} />
            <button className="btn-primary" onClick={saveLocationAndPledge}>Join the choir</button>
          </div>
        </div>
      )}
    </div>
  );
}
