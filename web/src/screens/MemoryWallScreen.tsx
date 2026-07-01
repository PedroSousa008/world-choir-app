import { EmptyState, LoadingBlock, StatsRow } from '../components/Shared';
import { useData } from '../context/DataContext';
import './MemoryWallScreen.css';

export function MemoryWallScreen() {
  const { loading, stats, memories, event } = useData();

  const featured = memories.filter((m) => m.type === 'clip' || m.type === 'photo');
  const promises = memories.filter((m) => m.type === 'promise');
  const aroundWorld = memories.filter((m) => m.city);

  if (loading) {
    return (
      <div className="screen memory-screen">
        <LoadingBlock label="Loading memories..." />
      </div>
    );
  }

  return (
    <div className="screen memory-screen fade-in">
      <header className="memory-screen__header">
        <p className="eyebrow">Memory Wall</p>
        <h1 className="heading">Moments from World Choir</h1>
        <p className="subtitle">A calm archive of real participation — not a social feed.</p>
      </header>

      <section className="memory-section">
        <h2 className="memory-section__title">Event Statistics</h2>
        <StatsRow
          voices={stats.totalPledges}
          countries={stats.countriesCount}
          cities={stats.citiesCount}
        />
      </section>

      <section className="memory-section">
        <h2 className="memory-section__title">Featured Moments</h2>
        {featured.length === 0 ? (
          <EmptyState
            title="No memories yet."
            subtitle="They will appear after the event."
          />
        ) : (
          <div className="memory-grid">
            {featured.map((m) => (
              <MemoryCard key={m.id} memory={m} />
            ))}
          </div>
        )}
      </section>

      {aroundWorld.length > 0 && (
        <section className="memory-section">
          <h2 className="memory-section__title">Around the World</h2>
          <div className="memory-grid memory-grid--list">
            {aroundWorld.map((m) => (
              <MemoryCard key={m.id} memory={m} compact />
            ))}
          </div>
        </section>
      )}

      <section className="memory-section">
        <h2 className="memory-section__title">Promises to the World</h2>
        {promises.length === 0 ? (
          <EmptyState title="No promises yet." />
        ) : (
          <div className="promise-wall">
            {promises.map((m) => (
              <div key={m.id} className="promise-item card">
                <p className="promise-item__text">"{m.caption}"</p>
                <p className="promise-item__meta">
                  {m.city && m.country ? `${m.city}, ${m.country}` : 'World Choir'}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="memory-section">
        <h2 className="memory-section__title">Map Replay</h2>
        <div className="map-replay card">
          {stats.totalPledges > 0 ? (
            <p>
              During {event.songTitle}, {stats.totalPledges.toLocaleString()} voices joined from{' '}
              {stats.citiesCount} cities across {stats.countriesCount} countries.
            </p>
          ) : (
            <EmptyState
              title="No map replay yet."
              subtitle="After the song, this space will hold moments from around the world."
            />
          )}
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
    <div className={`memory-card card ${compact ? 'memory-card--compact' : ''}`}>
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
