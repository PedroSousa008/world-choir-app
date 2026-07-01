import { pad } from '../../constants/event';
import type { CountdownParts } from '../../types';
import './FloatingCountdown.css';

interface Props {
  countdown: CountdownParts;
}

export function FloatingCountdown({ countdown }: Props) {
  const { days, hours, minutes, seconds } = countdown;
  const showDays = days > 0;

  return (
    <div className="floating-countdown">
      {showDays && (
        <>
          <div className="floating-countdown__days">{days}</div>
          <div className="floating-countdown__days-label">DAYS</div>
        </>
      )}

      <div className={`floating-countdown__time ${!showDays ? 'floating-countdown__time--solo' : ''}`}>
        <span className="floating-countdown__segment">
          <span className="floating-countdown__digit">{pad(hours)}</span>
          <span className="floating-countdown__unit">Hours</span>
        </span>
        <span className="floating-countdown__sep" aria-hidden> : </span>
        <span className="floating-countdown__segment">
          <span className="floating-countdown__digit">{pad(minutes)}</span>
          <span className="floating-countdown__unit">Minutes</span>
        </span>
        <span className="floating-countdown__sep" aria-hidden> : </span>
        <span className="floating-countdown__segment">
          <span className="floating-countdown__digit">{pad(seconds)}</span>
          <span className="floating-countdown__unit">Seconds</span>
        </span>
      </div>
    </div>
  );
}
