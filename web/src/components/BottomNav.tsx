import type { TabId } from '../types';
import './BottomNav.css';

const TABS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'map', label: 'Map' },
  { id: 'memory', label: 'Memory' },
  { id: 'profile', label: 'Profile' },
];

function TabIcon({ id, active }: { id: TabId; active: boolean }) {
  const color = active ? 'currentColor' : 'currentColor';
  switch (id) {
    case 'home':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 10.5 12 4.5l7 6v8.5a1 1 0 0 1-1 1h-4.5v-5.5H10.5V20H6a1 1 0 0 1-1-1v-8.5Z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    case 'map':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="1.3" />
          <path d="M3.5 12h17M12 3.5c2.2 2.5 3.5 5.8 3.5 8.5s-1.3 6-3.5 8.5M12 3.5c-2.2 2.5-3.5 5.8-3.5 8.5s1.3 6 3.5 8.5" stroke={color} strokeWidth="1.1" />
        </svg>
      );
    case 'memory':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="4.5" y="5.5" width="15" height="13" rx="2" stroke={color} strokeWidth="1.3" />
          <path d="M10 9.5v5l4.5-2.5-4.5-2.5Z" fill={color} />
        </svg>
      );
    case 'profile':
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="9" r="3.5" stroke={color} strokeWidth="1.3" />
          <path d="M5.5 19.5c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
  }
}

interface Props {
  active: TabId;
  onChange: (tab: TabId) => void;
  variant?: 'dark' | 'light';
}

export function BottomNav({ active, onChange, variant = 'light' }: Props) {
  const isDark = variant === 'dark';

  return (
    <nav
      className={`bottom-nav ${isDark ? 'bottom-nav--dark' : 'bottom-nav--light'}`}
      aria-label="Main navigation"
    >
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            className={`bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`}
            onClick={() => onChange(tab.id)}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="bottom-nav__icon">
              <TabIcon id={tab.id} active={isActive} />
            </span>
            <span className="bottom-nav__label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
