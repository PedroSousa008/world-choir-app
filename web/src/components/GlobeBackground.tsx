import './GlobeBackground.css';

export function GlobeBackground({ intensity = 1 }: { intensity?: number }) {
  return (
    <div className="globe-bg" aria-hidden>
      <div className="globe-bg__orb" style={{ opacity: 0.35 * intensity }} />
      <div className="globe-bg__ring" style={{ opacity: 0.2 * intensity }} />
      <div className="globe-bg__glow" style={{ opacity: 0.5 * intensity }} />
    </div>
  );
}
