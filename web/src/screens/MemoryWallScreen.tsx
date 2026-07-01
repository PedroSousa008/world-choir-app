import { getAllMemories } from '../services/storage';
import { CURRENT_EVENT } from '../constants/event';
import './MemoryWallScreen.css';

export function MemoryWallScreen() {
  const memories = getAllMemories();
  const featured = memories.filter((m) => m.type === 'clip' || m.type === 'photo');
  const promises = memories.filter((m) => m.type === 'promise');
  const aroundWorld = memories.filter((m) => m.city);

  return (
    <div className="screen memory-screen fade-in">
      <header className="memory-screen__header">
        <p className="eyebrow">Memory Wall</p>
        <h1 className="title-serif memory-screen__title">A digital museum of the event</h1>
        <p className="subtitle">Curated moments from World Choir editions around the world.</p>
      </header>

      <section className="memory-section">
        <h2 className="memory-section__title">Event Statistics</h2>
        <div className="stats-row glass-card memory-stats">
          <div>
            <div className="stat-value">12.4M</div>
            <div className="stat-label">Voices</div>
          </div>
          <div>
            <div className="stat-value">146</div>
            <div className="stat-label">Countries</div>
          </div>
          <div>
            <div className="stat-value">18.4K</div>
            <div className="stat-label">Cities</div>
          </div>
        </div>
      </section>

      <section className="memory-section">
        <h2 className="memory-section__title">Featured Moments</h2>
        <div className="memory-grid">
          {featured.map((m) => (
            <MemoryCard key={m.id} memory={m} />
          ))}
        </div>
      </section>

      <section className="memory-section">
        <h2 className="memory-section__title">Around the World</h2>
        <div className="memory-grid memory-grid--list">
          {aroundWorld.slice(0, 6).map((m) => (
            <MemoryCard key={m.id} memory={m} compact />
          ))}
        </div>
      </section>

      <section className="memory-section">
        <h2 className="memory-section__title">Promises to the World</h2>
        <div className="promise-wall">
          {promises.map((m) => (
            <div key={m.id} className="promise-card glass-card">
              <p className="promise-card__text">"{m.caption}"</p>
              <p className="promise-card__meta">
                {m.city && m.country ? `${m.city}, ${m.country}` : 'World Choir'}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="memory-section">
        <h2 className="memory-section__title">Map Replay</h2>
        <div className="map-replay glass-card">
          <p className="map-replay__text">
            On {CURRENT_EVENT.songTitle}, the Earth illuminated — city by city, voice by voice.
          </p>
          <p className="map-replay__hint">Visit the Global Map to explore participation.</p>
        </div>
      </section>
    </div>
  );
}

function MemoryCard({
  memory,
  compact,
}: {
  memory: { id: string; type: string; caption: string; city?: string; country?: string };
  compact?: boolean;
}) {
  const typeLabel = memory.type === 'clip' ? 'Video' : memory.type === 'photo' ? 'Photo' : 'Moment';

  return (
    <div className={`memory-card glass-card ${compact ? 'memory-card--compact' : ''}`}>
      <div className="memory-card__visual">
        <span className="memory-card__type">{typeLabel}</span>
      </div>
      {!compact && <p className="memory-card__caption">{memory.caption}</p>}
      {memory.city && (
        <p className="memory-card__location">{memory.city}, {memory.country}</p>
      )}
    </div>
  );
}
