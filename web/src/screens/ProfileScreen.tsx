import { useState } from 'react';
import { ensureUser, getPromises, getPledges, updateUser } from '../services/storage';
import './ProfileScreen.css';

const PAST_EVENTS = [
  {
    id: 'world-choir-2026',
    title: 'World Choir 2026',
    songTitle: 'Imagine',
    artist: 'John Lennon',
    theme: 'Peace',
    city: 'Braga',
    country: 'Portugal',
    promise: 'I promise to choose hope.',
    participated: true,
  },
];

export function ProfileScreen() {
  const user = ensureUser();
  const pledges = getPledges();
  const promises = getPromises();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.displayName);
  const [city, setCity] = useState(user.city);
  const [country, setCountry] = useState(user.country);

  const eventsParticipated = pledges.length + PAST_EVENTS.filter((e) => e.participated).length;

  function handleSave() {
    updateUser({
      displayName: name.trim() || user.displayName,
      city: city.trim(),
      country: country.trim(),
    });
    setEditing(false);
  }

  return (
    <div className="screen profile-screen fade-in">
      <header className="profile-screen__header">
        <div className="profile-avatar">{user.displayName[0]}</div>
        {editing ? (
          <div className="profile-edit">
            <input className="profile-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            <input className="profile-input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
            <input className="profile-input" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" />
            <button className="btn-primary" onClick={handleSave}>Save</button>
          </div>
        ) : (
          <>
            <h1 className="title-serif profile-screen__name">{user.displayName}</h1>
            <p className="profile-screen__location">
              {user.city && user.country ? `${user.city}, ${user.country}` : 'Set your location'}
            </p>
            <button className="btn-secondary profile-screen__edit" onClick={() => setEditing(true)}>Edit Profile</button>
          </>
        )}
      </header>

      <div className="profile-stat glass-card">
        <div className="stat-value">{eventsParticipated}</div>
        <div className="stat-label">World Choir events participated</div>
      </div>

      <section className="profile-section">
        <h2 className="profile-section__title">World Choir History</h2>
        <div className="history-list">
          {PAST_EVENTS.map((event) => (
            <div key={event.id} className="history-card glass-card">
              <h3>{event.title}</h3>
              <p className="history-card__song">{event.songTitle} — {event.artist}</p>
              <p className="history-card__theme">Theme: {event.theme}</p>
              <p className="history-card__location">{event.city}, {event.country}</p>
              {event.promise && (
                <p className="history-card__promise">"{event.promise}"</p>
              )}
              <span className="history-card__status">Participated</span>
            </div>
          ))}

          {pledges.map((pledge) => {
            const promise = promises.find((p) => p.eventId === pledge.eventId);
            return (
              <div key={pledge.id} className="history-card glass-card">
                <h3>World Choir 2027</h3>
                <p className="history-card__song">Imagine — John Lennon</p>
                <p className="history-card__theme">Theme: Peace</p>
                <p className="history-card__location">{pledge.city}, {pledge.country}</p>
                {promise && <p className="history-card__promise">"{promise.text}"</p>}
                <span className="history-card__status">
                  {promise ? 'Participated' : 'Pledged — awaiting event'}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {promises.length > 0 && (
        <section className="profile-section">
          <h2 className="profile-section__title">Your Promises</h2>
          {promises.map((p) => (
            <div key={p.id} className="promise-card glass-card">
              <p className="promise-card__text">"{p.text}"</p>
              <p className="promise-card__meta">{p.city}, {p.country}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
