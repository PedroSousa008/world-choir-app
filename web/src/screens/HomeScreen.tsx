import { useState } from 'react';
import { GlobeBackground } from '../components/GlobeBackground';
import { CountdownDisplay } from '../components/CountdownDisplay';
import { formatEventDateUTC, formatLocalTime } from '../constants/event';
import { useEventClock } from '../hooks/useEventClock';
import type { PledgeReason } from '../types';
import { savePledge, updateUser } from '../services/storage';
import './HomeScreen.css';

const REASONS: PledgeReason[] = [
  'Peace', 'Hope', 'Love', 'Family', 'Humanity', 'Mental Health', 'Music', 'Other',
];

interface Props {
  refreshKey: number;
}

export function HomeScreen({ refreshKey }: Props) {
  const clock = useEventClock();
  const { event, status, countdown, user, pledge, hasPledged, userPhase } = clock;
  const [, setTick] = useState(0);

  const [showReason, setShowReason] = useState(false);
  const [pledging, setPledging] = useState(false);
  const [locationModal, setLocationModal] = useState(false);
  const [cityInput, setCityInput] = useState(user.city);
  const [countryInput, setCountryInput] = useState(user.country);

  const intensity = status === 'final_hour' ? 1.4 : status === 'live' ? 1.8 : 1;

  async function handlePledge(reason?: PledgeReason) {
    setPledging(true);
    let city = user.city;
    let country = user.country;

    if (!city || !country) {
      setLocationModal(true);
      setPledging(false);
      return;
    }

    const updated = updateUser({ city, country });
    savePledge({
      id: `pledge_${Date.now()}`,
      userId: updated.id,
      eventId: event.id,
      displayName: updated.displayName,
      city,
      country,
      latitude: updated.latitude,
      longitude: updated.longitude,
      reason,
      createdAt: new Date().toISOString(),
    });
    setShowReason(false);
    setPledging(false);
    setTick((t) => t + 1);
  }

  function saveLocationAndPledge() {
    if (!cityInput.trim() || !countryInput.trim()) return;
    updateUser({ city: cityInput.trim(), country: countryInput.trim() });
    setLocationModal(false);
    handlePledge();
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

  if (userPhase === 'promise_open') {
    return null;
  }

  // Waiting for next event
  if (userPhase === 'waiting_next') {
    return (
      <div className="screen home-screen fade-in" key={refreshKey}>
        <GlobeBackground intensity={0.6} />
        <div className="home-screen__content home-screen__content--centered">
          <p className="eyebrow">World Choir</p>
          <h1 className="title-serif home-screen__waiting-title">Waiting for Next Countdown</h1>
          <p className="subtitle home-screen__waiting-sub">
            The next World Choir Event has not been announced yet.
          </p>
          <div className="home-screen__tagline">One song. One world. One moment.</div>
        </div>
      </div>
    );
  }

  // Live state
  if (status === 'live') {
    return (
      <div className="screen home-screen home-screen--live fade-in" key={refreshKey}>
        <GlobeBackground intensity={2} />
        <div className="home-screen__content home-screen__content--centered">
          <p className="eyebrow">World Choir · Live</p>
          <h1 className="title-serif home-screen__live-title">The moment has arrived.</h1>
          <h2 className="title-serif home-screen__go-sing">Go sing.</h2>
          <p className="subtitle home-screen__song">
            {event.songTitle} — {event.artist}
          </p>
          <p className="home-screen__hashtag">{event.hashtag}</p>
          <div className="home-screen__live-message glass-card">
            <p>Put your phone down. The world is singing with you.</p>
          </div>
        </div>
      </div>
    );
  }

  // Final hour
  if (status === 'final_hour') {
    return (
      <div className="screen home-screen fade-in" key={refreshKey}>
        <GlobeBackground intensity={intensity} />
        <div className="home-screen__content">
          <p className="eyebrow">World Choir</p>
          <h1 className="title-serif home-screen__final-title">The World is Almost Ready</h1>
          <CountdownDisplay countdown={countdown} large showDays={false} />
          <p className="subtitle home-screen__final-copy">
            In less than one hour, millions of people will sing together.
          </p>
          <div className="stats-row glass-card home-screen__stats">
            <div>
              <div className="stat-value">{(event.totalPledges + (hasPledged ? 1 : 0)).toLocaleString()}</div>
              <div className="stat-label">Voices</div>
            </div>
            <div>
              <div className="stat-value">{event.countriesCount}</div>
              <div className="stat-label">Countries</div>
            </div>
            <div>
              <div className="stat-value">{event.citiesCount.toLocaleString()}</div>
              <div className="stat-label">Cities</div>
            </div>
          </div>
          <p className="home-screen__song-line">
            {event.songTitle} — {event.artist}
          </p>
          <p className="home-screen__hashtag">{event.hashtag}</p>
        </div>
      </div>
    );
  }

  // Upcoming (default)
  return (
    <div className="screen home-screen fade-in" key={refreshKey}>
      <GlobeBackground intensity={intensity} />
      <div className="home-screen__content">
        <header className="home-screen__header">
          <p className="eyebrow">World Choir</p>
          <h1 className="title-serif home-screen__brand">World Choir</h1>
        </header>

        <p className="home-screen__lead">The world sings together in</p>
        <CountdownDisplay countdown={countdown} large />

        <div className="home-screen__event-meta">
          <p className="home-screen__date">{formatEventDateUTC(event.startsAtUTC)}</p>
          <p className="home-screen__local">Your local time: {formatLocalTime(event.startsAtUTC)}</p>
        </div>

        <div className="home-screen__song-block glass-card">
          <p className="home-screen__song-title">{event.songTitle} — {event.artist}</p>
          <p className="home-screen__theme">
            This year's World Choir is dedicated to <em>{event.theme}</em>
          </p>
        </div>

        <div className="stats-row glass-card home-screen__stats">
          <div>
            <div className="stat-value">{(event.totalPledges + (hasPledged ? 1 : 0)).toLocaleString()}</div>
            <div className="stat-label">Voices committed</div>
          </div>
          <div>
            <div className="stat-value">{event.countriesCount}</div>
            <div className="stat-label">Countries</div>
          </div>
          <div>
            <div className="stat-value">{event.citiesCount.toLocaleString()}</div>
            <div className="stat-label">Cities</div>
          </div>
        </div>

        <div className="home-screen__actions">
          {hasPledged ? (
            <div className="home-screen__pledged">
              <button className="btn-primary" disabled>You're part of the choir</button>
              {pledge && (
                <p className="home-screen__pledge-location">
                  Your voice has joined {pledge.city}, {pledge.country}.
                </p>
              )}
              <p className="home-screen__micro">One voice added to the world.</p>
            </div>
          ) : (
            <button
              className="btn-primary"
              onClick={() => setShowReason(true)}
              disabled={pledging}
            >
              I'll Sing
            </button>
          )}

          <div className="home-screen__secondary">
            <button className="btn-secondary" onClick={handleCalendar}>Add to Calendar</button>
            <button className="btn-secondary" onClick={handleShare}>Share Countdown</button>
          </div>
        </div>
      </div>

      {showReason && (
        <div className="modal-overlay" onClick={() => setShowReason(false)}>
          <div className="modal glass-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="title-serif modal__title">Why are you singing?</h3>
            <p className="subtitle modal__sub">Optional — choose what moves you.</p>
            <div className="reason-grid">
              {REASONS.map((r) => (
                <button key={r} className="reason-chip" onClick={() => handlePledge(r)}>{r}</button>
              ))}
            </div>
            <button className="btn-secondary modal__skip" onClick={() => handlePledge()}>Skip</button>
          </div>
        </div>
      )}

      {locationModal && (
        <div className="modal-overlay">
          <div className="modal glass-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="title-serif modal__title">Where will you sing from?</h3>
            <input
              className="modal-input"
              placeholder="City"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
            />
            <input
              className="modal-input"
              placeholder="Country"
              value={countryInput}
              onChange={(e) => setCountryInput(e.target.value)}
            />
            <button className="btn-primary" onClick={saveLocationAndPledge}>Join the choir</button>
          </div>
        </div>
      )}
    </div>
  );
}
