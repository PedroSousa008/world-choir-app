export function RingLogo() {
  return (
    <svg className="home-icon home-icon--ring" viewBox="0 0 40 40" fill="none" aria-hidden>
      <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="1.2" opacity="0.85" />
      <circle cx="20" cy="20" r="9" stroke="currentColor" strokeWidth="0.6" opacity="0.35" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg className="home-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5c-2.8 0-5 2.2-5 5v2.4l-1.4 2.4c-.3.5.1 1.2.7 1.2h11.4c.6 0 1-.7.7-1.2L17 10.9V8.5c0-2.8-2.2-5-5-5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M10 18.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function VoicesIcon() {
  return (
    <svg className="home-icon home-icon--stat" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="16.5" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 18c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M14 18c0-2 1.4-3.8 3.5-4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function GlobeIcon() {
  return (
    <svg className="home-icon home-icon--stat" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.5 12h17M12 3.5c2.2 2.5 3.5 5.8 3.5 8.5s-1.3 6-3.5 8.5M12 3.5c-2.2 2.5-3.5 5.8-3.5 8.5s1.3 6 3.5 8.5" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

export function PinIcon() {
  return (
    <svg className="home-icon home-icon--stat" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 21s6-5.4 6-10a6 6 0 1 0-12 0c0 4.6 6 10 6 10Z" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="11" r="2.2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg className="home-icon home-icon--action" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="5.5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 3.5v3M16 3.5v3M4 10h16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function ShareIcon() {
  return (
    <svg className="home-icon home-icon--action" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 16V5M12 5l-3.5 3.5M12 5l3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 14v4.5h12V14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RemindIcon() {
  return (
    <svg className="home-icon home-icon--action" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M12 8v4.5l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
