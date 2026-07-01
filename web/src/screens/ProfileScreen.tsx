import { useEffect, useState } from 'react';
import { EmptyState, LoadingBlock } from '../components/Shared';
import { useData } from '../context/DataContext';
import type { WorldChoirEvent } from '../types';
import { fetchEventById, upsertUser } from '../services/database';
import './ProfileScreen.css';

interface HistoryEntry {
  event: WorldChoirEvent;
  city: string;
  country: string;
  promise?: string;
  status: string;
}

export function ProfileScreen() {
  const { loading, user, userPledges, userPromises, setUser, refresh } = useData();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.displayName);
  const [city, setCity] = useState(user.city);
  const [country, setCountry] = useState(user.country);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    async function loadHistory() {
      setHistoryLoading(true);
      const entries: HistoryEntry[] = [];

      for (const pledge of userPledges) {
        const event = await fetchEventById(pledge.eventId);
        if (!event) continue;
        const promise = userPromises.find((p) => p.eventId === pledge.eventId);
        entries.push({
          event,
          city: pledge.city,
          country: pledge.country,
          promise: promise?.text,
          status: promise ? 'Participated' : 'Pledged — awaiting event',
        });
      }

      setHistory(entries);
      setHistoryLoading(false);
    }

    if (!loading) loadHistory();
  }, [loading, userPledges, userPromises]);

  async function handleSave() {
    const updated = {
      ...user,
      displayName: name.trim() || user.displayName,
      city: city.trim(),
      country: country.trim(),
      updatedAt: new Date().toISOString(),
    };
    await upsertUser(updated);
    setUser(updated);
    setEditing(false);
    await refresh();
  }

  if (loading) {
    return (
      <div className="screen profile-screen">
        <LoadingBlock label="Loading profile..." />
      </div>
    );
  }

  return (
    <div className="screen profile-screen fade-in">
      <header className="profile-screen__header">
        <div className="profile-avatar">{user.displayName[0]?.toUpperCase() ?? '?'}</div>
        {editing ? (
          <div className="profile-edit">
            <input className="profile-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            <input className="profile-input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
            <input className="profile-input" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" />
            <button className="btn-primary" onClick={handleSave}>Save</button>
          </div>
        ) : (
          <>
            <h1 className="heading">{user.displayName}</h1>
            <p className="profile-screen__location">
              {user.city && user.country ? `${user.city}, ${user.country}` : 'Set your location'}
            </p>
            <button className="btn-secondary profile-screen__edit" onClick={() => setEditing(true)}>Edit Profile</button>
          </>
        )}
      </header>

      <div className="profile-stat card">
        <div className="stat-value">{userPledges.length}</div>
        <div className="stat-label">World Choir events participated</div>
      </div>

      <section className="profile-section">
        <h2 className="profile-section__title">World Choir History</h2>
        {historyLoading ? (
          <LoadingBlock label="Loading history..." />
        ) : history.length === 0 ? (
          <EmptyState
            title="No event history yet."
            subtitle="When you pledge and participate, your World Choir journey will appear here."
          />
        ) : (
          <div className="history-list">
            {history.map((entry) => (
              <div key={entry.event.id} className="history-card card">
                <h3>{entry.event.title}</h3>
                <p className="history-card__song">{entry.event.songTitle} — {entry.event.artist}</p>
                <p className="history-card__theme">Theme: {entry.event.theme}</p>
                <p className="history-card__location">{entry.city}, {entry.country}</p>
                {entry.promise && <p className="history-card__promise">"{entry.promise}"</p>}
                <span className="history-card__status">{entry.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="profile-section">
        <h2 className="profile-section__title">Your Promises</h2>
        {userPromises.length === 0 ? (
          <EmptyState title="Your promise will appear here after the event." />
        ) : (
          userPromises.map((p) => (
            <div key={p.id} className="promise-item card">
              <p className="promise-item__text">"{p.text}"</p>
              <p className="promise-item__meta">{p.city}, {p.country}</p>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
