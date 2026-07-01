import { pad } from '../../constants/event';
import type { CountdownParts } from '../../types';
import './FloatingCountdown.css';

interface Props {
  countdown: CountdownParts;
  label?: string;
}

export function FloatingCountdown({ countdown, label = 'The world sings together in' }: Props) {
  const { days, hours, minutes, seconds } = countdown;
  const showDays = days > 0;

  return (
    <div className="floating-countdown">
      <p className="floating-countdown__label">{label}</p>

      {showDays ? (
        <>
          <div className="floating-countdown__days">{days}</div>
          <div className="floating-countdown__days-label">DAYS</div>
          <div className="floating-countdown__time">
            <span>{pad(hours)}</span>
            <span className="floating-countdown__sep">:</span>
            <span>{pad(minutes)}</span>
            <span className="floating-countdown__sep">:</span>
            <span>{pad(seconds)}</span>
          </div>
          <div className="floating-countdown__units">
            <span>Hours</span>
            <span>Minutes</span>
            <span>Seconds</span>
          </div>
        </>
      ) : (
        <>
          <div className="floating-countdown__time floating-countdown__time--large">
            <span>{pad(hours)}</span>
            <span className="floating-countdown__sep">:</span>
            <span>{pad(minutes)}</span>
            <span className="floating-countdown__sep">:</span>
            <span>{pad(seconds)}</span>
          </div>
          <div className="floating-countdown__units">
            <span>Hours</span>
            <span>Minutes</span>
            <span>Seconds</span>
          </div>
        </>
      )}
    </div>
  );
}
