import { lazy, Suspense, useEffect, useState } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { FloatingCountdown } from '../components/home/FloatingCountdown';
import { FloatingStats } from '../components/home/FloatingStats';
import { LoadingBlock } from '../components/Shared';
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

const EarthGlobe = lazy(() =>
  import('../components/earth/EarthGlobe').then((m) => ({ default: m.EarthGlobe }))
);

const REASONS: PledgeReason[] = [
  'Peace', 'Hope', 'Love', 'Family', 'Humanity', 'Mental Health', 'Music', 'Other',
];

interface Props {
  refreshKey: number;
}

export function HomeScreen({ refreshKey }: Props) {
  const { loading, stats, pledgeLights, refresh, setUser } = useData();
  const clock = useEventClock();
  const { event, status, countdown, user, pledge, hasPledged, userPhase } = clock;

  const [showReason, setShowReason] = useState(false);
  const [pledging, setPledging] = useState(false);
  const [locationModal, setLocationModal] = useState(false);
  const [cityInput, setCityInput] = useState(user.city);
  const [countryInput, setCountryInput] = useState(user.country);
  const [error, setError] = useState('');
  const [pledgeSuccess, setPledgeSuccess] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [pulseT, setPulseT] = useState(0);
  const [newLightId, setNewLightId] = useState<string | null>(null);
  const [buttonPressed, setButtonPressed] = useState(false);

  useEffect(() => {
    if (pulseKey === 0) return;
    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1200);
      setPulseT(1 - t);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pulseKey]);

  async function submitPledge(reason?: PledgeReason) {
    setError('');
    setPledging(true);
    setButtonPressed(true);
    setTimeout(() => setButtonPressed(false), 400);

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
    const updated = {
      ...user,
      city,
      country,
      latitude: coords?.lat,
      longitude: coords?.lng,
      updatedAt: new Date().toISOString(),
    };

    await upsertUser(updated);
    setUser(updated);

    const pledgeId = `pledge_${crypto.randomUUID()}`;
    const saved = await createPledge({
      id: pledgeId,
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

    setNewLightId(pledgeId);
    setPulseT(1);
    setPulseKey((k) => k + 1);
    setPledgeSuccess(true);
    await refresh();
    setTimeout(() => setPledgeSuccess(false), 5000);
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
    window.open(
      `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('World Choir — ' + event.songTitle)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent('One song. One world. One moment.')}`,
      '_blank'
    );
  }

  if (loading) {
    return (
      <div className="home-immersive home-immersive--loading">
        <LoadingBlock label="Opening the window to Earth..." />
      </div>
    );
  }

  const countdownLabel =
    status === 'final_hour'
      ? 'The world is almost ready'
      : status === 'live'
        ? 'The moment has arrived'
        : 'The world sings together in';

  const emptyHint =
    stats.totalPledges === 0 ? 'Be the first voice to join World Choir.' : undefined;

  return (
    <div className="home-immersive fade-in" key={refreshKey}>
      <div className="home-immersive__bg" />
      <div className="home-immersive__stars" />

      <div className="home-immersive__earth-layer">
        <ErrorBoundary
          fallback={
            <div className="earth-globe-wrap__css-fallback home-immersive__earth-fallback">
              <div className="earth-globe-wrap__css-sphere" />
            </div>
          }
        >
          <Suspense
            fallback={
              <div className="earth-globe-wrap__css-fallback home-immersive__earth-fallback">
                <div className="earth-globe-wrap__css-sphere" />
              </div>
            }
          >
            <EarthGlobe
              className="home-immersive__earth"
              lights={pledgeLights}
              pulsePhase={pulseT}
              newLightId={newLightId}
            />
          </Suspense>
        </ErrorBoundary>
      </div>

      <div className="home-immersive__scroll">
        <header className="home-immersive__brand">
          <span className="home-immersive__logo">World Choir</span>
        </header>

        {userPhase === 'waiting_next' ? (
          <div className="home-immersive__state-message">
            <h1>Waiting for Next Countdown</h1>
            <p>The next World Choir Event has not been announced yet.</p>
          </div>
        ) : status === 'live' ? (
          <div className="home-immersive__state-message home-immersive__state-message--live">
            <h1>Go sing.</h1>
            <p>{event.songTitle} — {event.artist}</p>
            <p className="home-immersive__live-whisper">Put your phone down. The world is singing with you.</p>
          </div>
        ) : (
          <>
            <div className="home-immersive__countdown-layer">
              <FloatingCountdown countdown={countdown} label={countdownLabel} />
            </div>

            <div className="home-immersive__meta">
              <p>{formatEventDateUTC(event.startsAtUTC)}</p>
              <p>Your local time · {formatLocalTime(event.startsAtUTC)}</p>
            </div>

            <div className="home-immersive__song">
              <p className="home-immersive__song-title">♪ {event.songTitle}</p>
              <p className="home-immersive__song-artist">{event.artist}</p>
              <p className="home-immersive__theme">
                <span>This year's theme</span>
                {event.theme}
              </p>
            </div>

            <div className="home-immersive__stats-layer">
              <FloatingStats stats={stats} emptyHint={emptyHint} />
            </div>

            {userPhase !== 'promise_open' && (
              <div className="home-immersive__actions">
                {hasPledged || pledgeSuccess ? (
                  <div className="home-immersive__joined">
                    <button className="home-pledge-btn home-pledge-btn--joined" disabled>
                      You're part of the choir
                    </button>
                    <p className="home-immersive__joined-text">
                      {pledgeSuccess
                        ? 'Your voice has joined the world.'
                        : pledge
                          ? `Your voice has joined ${pledge.city}, ${pledge.country}.`
                          : 'Your voice has joined the world.'}
                    </p>
                  </div>
                ) : (
                  <button
                    className={`home-pledge-btn ${buttonPressed ? 'home-pledge-btn--pressed' : ''}`}
                    onClick={() => setShowReason(true)}
                    disabled={pledging}
                  >
                    {pledging ? 'Joining...' : "I'll Sing"}
                  </button>
                )}

                {error && <p className="home-immersive__error">{error}</p>}

                <div className="home-immersive__secondary">
                  <button type="button" onClick={handleCalendar}>Add to Calendar</button>
                  <button type="button" onClick={handleShare}>Share</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showReason && (
        <div className="home-modal-overlay" onClick={() => setShowReason(false)}>
          <div className="home-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Why are you singing?</h3>
            <p>Optional — you can skip.</p>
            <div className="home-modal__reasons">
              {REASONS.map((r) => (
                <button key={r} onClick={() => submitPledge(r)}>{r}</button>
              ))}
            </div>
            <button className="home-modal__skip" onClick={() => submitPledge()}>Skip</button>
          </div>
        </div>
      )}

      {locationModal && (
        <div className="home-modal-overlay">
          <div className="home-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Where will you sing from?</h3>
            <input placeholder="City" value={cityInput} onChange={(e) => setCityInput(e.target.value)} />
            <input placeholder="Country" value={countryInput} onChange={(e) => setCountryInput(e.target.value)} />
            <button className="home-pledge-btn" onClick={saveLocationAndPledge}>Join the choir</button>
          </div>
        </div>
      )}
    </div>
  );
}
