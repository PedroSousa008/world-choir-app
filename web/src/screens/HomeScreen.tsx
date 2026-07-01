import { lazy, Suspense, useEffect, useState } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { FloatingCountdown } from '../components/home/FloatingCountdown';
import { FloatingStats } from '../components/home/FloatingStats';
import {
  BellIcon,
  CalendarIcon,
  RemindIcon,
  RingLogo,
  ShareIcon,
} from '../components/home/HomeIcons';
import { SpaceField } from '../components/home/SpaceField';
import { useData } from '../context/DataContext';
import { useEventClock } from '../hooks/useEventClock';
import type { PledgeReason } from '../types';
import {
  createPledge,
  geocodeCity,
  isDatabaseConfigured,
  upsertUser,
} from '../services/database';
import { formatEventDateUTC } from '../constants/event';
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
  const { loading, stats, cityGlows, refresh, setUser } = useData();
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
  const [newGlowKey, setNewGlowKey] = useState<string | null>(null);
  const [buttonFading, setButtonFading] = useState(false);

  useEffect(() => {
    if (pulseKey === 0) return;
    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1400);
      setPulseT(1 - t);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pulseKey]);

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

    setButtonFading(true);

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
      setButtonFading(false);
      setError('Could not save your pledge. Please try again.');
      return;
    }

    const glowKey = `${city}|${country}`;
    setNewGlowKey(glowKey);
    setPulseT(1);
    setPulseKey((k) => k + 1);
    setPledgeSuccess(true);
    await refresh();
    setTimeout(() => {
      setPledgeSuccess(false);
      setButtonFading(false);
      setNewGlowKey(null);
    }, 6000);
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

  async function handleRemind() {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification('World Choir', {
          body: `We'll remind you before the world sings on ${formatEventDateUTC(event.startsAtUTC)}.`,
          icon: '/textures/earth-day.jpg',
        });
        return;
      }
    }
    handleCalendar();
  }

  const showJoined = hasPledged || pledgeSuccess;
  const isLive = status === 'live';
  const isWaiting = userPhase === 'waiting_next';

  return (
    <div
      className={`home-cinematic home-cinematic--ready${loading ? ' home-cinematic--syncing' : ''}`}
      key={refreshKey}
    >
      <SpaceField />

      <div className="home-cinematic__hero">
        <div className="home-cinematic__earth">
          <ErrorBoundary
            fallback={
              <div className="earth-globe-wrap__css-fallback home-cinematic__earth-fallback">
                <div className="earth-globe-wrap__css-sphere" />
              </div>
            }
          >
            <Suspense
              fallback={
                <div className="earth-globe-wrap__css-fallback home-cinematic__earth-fallback">
                  <div className="earth-globe-wrap__css-sphere" />
                </div>
              }
            >
              <EarthGlobe
                cityGlows={cityGlows}
                pulsePhase={pulseT}
                newGlowKey={newGlowKey}
              />
            </Suspense>
          </ErrorBoundary>
        </div>

        <header className="home-cinematic__header">
          <button type="button" className="home-cinematic__bell" onClick={handleRemind} aria-label="Remind me">
            <BellIcon />
          </button>

          <div className="home-cinematic__brand">
            <RingLogo />
            <h1 className="home-cinematic__title">World Choir</h1>
            <p className="home-cinematic__tagline">The world sings together in</p>
          </div>
        </header>

        {!isWaiting && !isLive && (
          <section className="home-cinematic__countdown" aria-live="polite">
            <FloatingCountdown countdown={countdown} />
          </section>
        )}
      </div>

      <div className="home-cinematic__body">
        {isWaiting ? (
          <div className="home-cinematic__state">
            <h2>Waiting for the next moment</h2>
            <p>The next World Choir event has not been announced yet.</p>
          </div>
        ) : isLive ? (
          <div className="home-cinematic__state home-cinematic__state--live">
            <h2>Go sing.</h2>
            <p>{event.songTitle} — {event.artist}</p>
            <p className="home-cinematic__whisper">Put your phone down. The world is singing with you.</p>
          </div>
        ) : (
          <>
            <section className="home-cinematic__song">
              <p className="home-cinematic__song-line">
                <span className="home-cinematic__note" aria-hidden>♪</span>
                {event.songTitle} — {event.artist}
              </p>
              <p className="home-cinematic__dedication">
                This year&apos;s World Choir is dedicated to{' '}
                <em>{event.theme}</em>.
              </p>
            </section>

            <section className="home-cinematic__stats">
              <FloatingStats stats={stats} />
            </section>

            {userPhase !== 'promise_open' && (
              <section className="home-cinematic__actions">
                {showJoined ? (
                  <div className="home-cinematic__joined">
                    {pledgeSuccess && (
                      <button className="home-cinematic__pledge home-cinematic__pledge--fading" disabled aria-hidden>
                        I&apos;ll Sing
                      </button>
                    )}
                    <p className="home-cinematic__joined-glow" aria-live="polite">
                      Your voice has joined the world.
                    </p>
                  </div>
                ) : (
                  <button
                    className={`home-cinematic__pledge${buttonFading ? ' home-cinematic__pledge--fading' : ''}`}
                    onClick={() => setShowReason(true)}
                    disabled={pledging || buttonFading}
                  >
                    {pledging ? 'Joining...' : "I'll Sing"}
                  </button>
                )}

                {error && <p className="home-cinematic__error">{error}</p>}

                <div className="home-cinematic__secondary">
                  <button type="button" className="home-cinematic__action" onClick={handleRemind}>
                    <span className="home-cinematic__action-icon"><RemindIcon /></span>
                    <span>Remind me</span>
                  </button>
                  <button type="button" className="home-cinematic__action" onClick={handleCalendar}>
                    <span className="home-cinematic__action-icon"><CalendarIcon /></span>
                    <span>Add to Calendar</span>
                  </button>
                  <button type="button" className="home-cinematic__action" onClick={handleShare}>
                    <span className="home-cinematic__action-icon"><ShareIcon /></span>
                    <span>Share</span>
                  </button>
                </div>
              </section>
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
            <button className="home-cinematic__pledge" onClick={saveLocationAndPledge}>Join the choir</button>
          </div>
        </div>
      )}
    </div>
  );
}
