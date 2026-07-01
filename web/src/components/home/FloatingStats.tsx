import type { ParticipationStats } from '../../services/database';
import './FloatingCountdown.css';

interface Props {
  stats: ParticipationStats;
  emptyHint?: string;
}

export function FloatingStats({ stats, emptyHint }: Props) {
  return (
    <div className="floating-stats">
      <div className="floating-stats__item">
        <span className="floating-stats__value">{stats.totalPledges.toLocaleString()}</span>
        <span className="floating-stats__label">Voices</span>
      </div>
      <div className="floating-stats__item">
        <span className="floating-stats__value">{stats.countriesCount.toLocaleString()}</span>
        <span className="floating-stats__label">Countries</span>
      </div>
      <div className="floating-stats__item">
        <span className="floating-stats__value">{stats.citiesCount.toLocaleString()}</span>
        <span className="floating-stats__label">Cities</span>
      </div>
      {stats.totalPledges === 0 && emptyHint && (
        <p className="floating-stats__hint">{emptyHint}</p>
      )}
    </div>
  );
}
