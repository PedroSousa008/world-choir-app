import { pad } from '../constants/event';
import type { CountdownParts } from '../types';
import './CountdownDisplay.css';

interface Props {
  countdown: CountdownParts;
  large?: boolean;
  showDays?: boolean;
}

export function CountdownDisplay({ countdown, large, showDays = true }: Props) {
  const { days, hours, minutes, seconds } = countdown;

  if (large && showDays && days > 0) {
    return (
      <div className={`countdown ${large ? 'countdown--large' : ''}`}>
        <div className="countdown__grid countdown__grid--4">
          <Unit value={days} label="Days" />
          <Unit value={hours} label="Hours" />
          <Unit value={minutes} label="Minutes" />
          <Unit value={seconds} label="Seconds" />
        </div>
      </div>
    );
  }

  return (
    <div className={`countdown ${large ? 'countdown--large' : ''}`}>
      <div className="countdown__grid countdown__grid--3">
        <Unit value={hours + days * 24} label="Hours" />
        <Unit value={minutes} label="Minutes" />
        <Unit value={seconds} label="Seconds" />
      </div>
    </div>
  );
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="countdown__unit">
      <span className="countdown__value">{pad(value)}</span>
      <span className="countdown__label">{label}</span>
    </div>
  );
}
