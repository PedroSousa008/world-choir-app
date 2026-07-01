interface Props {
  title: string;
  subtitle?: string;
}

export function EmptyState({ title, subtitle }: Props) {
  return (
    <div className="empty-state">
      <p className="empty-state__title">{title}</p>
      {subtitle && <p className="empty-state__subtitle">{subtitle}</p>}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="loading-block" aria-busy="true">
      <div className="loading-block__spinner" />
      <p>{label}</p>
    </div>
  );
}

interface StatsProps {
  voices: number;
  countries: number;
  cities: number;
  loading?: boolean;
  emptySubtext?: string;
}

export function StatsRow({ voices, countries, cities, loading, emptySubtext }: StatsProps) {
  if (loading) {
    return <LoadingBlock label="Loading participation..." />;
  }

  return (
    <div className="stats-block">
      <div className="stats-row card">
        <div>
          <div className="stat-value">{voices.toLocaleString()}</div>
          <div className="stat-label">Voices committed</div>
        </div>
        <div>
          <div className="stat-value">{countries.toLocaleString()}</div>
          <div className="stat-label">Countries</div>
        </div>
        <div>
          <div className="stat-value">{cities.toLocaleString()}</div>
          <div className="stat-label">Cities</div>
        </div>
      </div>
      {voices === 0 && emptySubtext && (
        <p className="stats-empty-hint">{emptySubtext}</p>
      )}
    </div>
  );
}
