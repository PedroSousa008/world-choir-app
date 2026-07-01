import type { TabId } from '../types';
import './BottomNav.css';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '◯' },
  { id: 'map', label: 'Map', icon: '◎' },
  { id: 'memory', label: 'Memory', icon: '◇' },
  { id: 'profile', label: 'Profile', icon: '○' },
];

interface Props {
  active: TabId;
  onChange: (tab: TabId) => void;
}

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`bottom-nav__item ${active === tab.id ? 'bottom-nav__item--active' : ''}`}
          onClick={() => onChange(tab.id)}
          aria-current={active === tab.id ? 'page' : undefined}
        >
          <span className="bottom-nav__icon">{tab.icon}</span>
          <span className="bottom-nav__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
