import { useState } from 'react';
import { useData } from '../context/DataContext';
import { useEventClock } from '../hooks/useEventClock';
import { createPromise, isDatabaseConfigured, upsertUser } from '../services/database';
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
  const { user, pledge, refresh } = useData();
  const { event } = useEventClock();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const placeholder = PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)];

  async function handleSubmit() {
    if (!text.trim() || submitting) return;

    if (!isDatabaseConfigured) {
      setError('Unable to save your promise right now. Please try again later.');
      return;
    }

    setSubmitting(true);
    setError('');

    const updated = {
      ...user,
      city: pledge?.city || user.city,
      country: pledge?.country || user.country,
      updatedAt: new Date().toISOString(),
    };
    await upsertUser(updated);

    const saved = await createPromise({
      id: `promise_${crypto.randomUUID()}`,
      userId: user.id,
      eventId: event.id,
      displayName: updated.displayName,
      city: pledge?.city || updated.city || '',
      country: pledge?.country || updated.country || '',
      latitude: pledge?.latitude || updated.latitude,
      longitude: pledge?.longitude || updated.longitude,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    });

    setSubmitting(false);

    if (!saved) {
      setError('Could not save your promise. Please try again.');
      return;
    }

    await refresh();
    onComplete();
  }

  return (
    <div className="promise-screen">
      <div className="promise-screen__content fade-in">
        <p className="eyebrow">After the song</p>
        <h1 className="heading">Make Your Promise to the World</h1>
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

        {error && <p className="promise-screen__error">{error}</p>}

        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
        >
          {submitting ? 'Submitting...' : 'Submit My Promise'}
        </button>
      </div>
    </div>
  );
}
