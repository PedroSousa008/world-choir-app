import type { ParticipationStats } from '../../services/database';
import { GlobeIcon, PinIcon, VoicesIcon } from './HomeIcons';
import './FloatingStats.css';

interface Props {
  stats: ParticipationStats;
}

const ITEMS = [
  { key: 'voices', label: 'Voices', icon: VoicesIcon },
  { key: 'countries', label: 'Countries', icon: GlobeIcon },
  { key: 'cities', label: 'Cities', icon: PinIcon },
] as const;

export function FloatingStats({ stats }: Props) {
  const values = {
    voices: stats.totalPledges,
    countries: stats.countriesCount,
    cities: stats.citiesCount,
  };

  return (
    <div className="floating-stats">
      {ITEMS.map(({ key, label, icon: Icon }, index) => (
        <div key={key} className="floating-stats__col">
          {index > 0 && <span className="floating-stats__divider" aria-hidden />}
          <Icon />
          <span className="floating-stats__value">{values[key].toLocaleString()}</span>
          <span className="floating-stats__label">{label}</span>
        </div>
      ))}
    </div>
  );
}
