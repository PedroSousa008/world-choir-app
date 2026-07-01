import { useState } from 'react';
import { GlobeBackground } from '../components/GlobeBackground';
import { useEventClock } from '../hooks/useEventClock';
import { savePromiseEntry, updateUser } from '../services/storage';
import './PromiseScreen.css';

interface Props {
  onComplete: () => void;
}

const PLACEHOLDERS = [
  'I promise to be kinder.',
  'I promise to choose hope.',
  'I promise to spend more time with my family.',
  'I promise to help my community.',
];

export function PromiseScreen({ onComplete }: Props) {
  const { event, user, pledge } = useEventClock();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const placeholder = PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)];

  function handleSubmit() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);

    const updated = updateUser({
      city: pledge?.city || user.city,
      country: pledge?.country || user.country,
    });

    savePromiseEntry({
      id: `promise_${Date.now()}`,
      userId: updated.id,
      eventId: event.id,
      displayName: updated.displayName,
      city: pledge?.city || updated.city || 'Unknown',
      country: pledge?.country || updated.country || 'Unknown',
      latitude: pledge?.latitude || updated.latitude,
      longitude: pledge?.longitude || updated.longitude,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    });

    onComplete();
  }

  return (
    <div className="promise-screen">
      <GlobeBackground intensity={0.8} />
      <div className="promise-screen__content fade-in">
        <p className="eyebrow">After the song</p>
        <h1 className="title-serif promise-screen__title">Make Your Promise to the World</h1>
        <p className="subtitle promise-screen__prompt">
          What do you promise to carry forward from this moment?
        </p>

        <textarea
          className="promise-screen__input"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={280}
        />

        <p className="promise-screen__count">{text.length}/280</p>

        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
        >
          Submit My Promise
        </button>
      </div>
    </div>
  );
}
