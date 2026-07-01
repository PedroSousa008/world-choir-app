import type { CountdownParts, EventStatus, WorldChoirEvent } from '../types';

export const CURRENT_EVENT: WorldChoirEvent = {
  id: 'world-choir-2027',
  title: 'World Choir 2027',
  songTitle: 'Imagine',
  artist: 'John Lennon',
  theme: 'Peace',
  startsAtUTC: '2027-07-01T16:00:00.000Z',
  endsAtUTC: '2027-07-01T16:08:00.000Z',
  hashtag: '#WorldChoir2027',
  status: 'upcoming',
  totalPledges: 12482193,
  countriesCount: 146,
  citiesCount: 18430,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export const LIVE_DURATION_MS = 8 * 60 * 1000;
export const PROMISE_WINDOW_MS = 48 * 60 * 60 * 1000;

export function getCountdownParts(target: Date, now = new Date()): CountdownParts {
  const totalMs = Math.max(0, target.getTime() - now.getTime());
  const days = Math.floor(totalMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((totalMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((totalMs % (1000 * 60)) / 1000);
  return { days, hours, minutes, seconds, totalMs };
}

export function getEventStatus(event: WorldChoirEvent, now = new Date()): EventStatus {
  const start = new Date(event.startsAtUTC);
  const end = new Date(event.endsAtUTC);
  const oneHourBefore = start.getTime() - 60 * 60 * 1000;

  if (now.getTime() < oneHourBefore) return 'upcoming';
  if (now.getTime() < start.getTime()) return 'final_hour';
  if (now.getTime() < end.getTime()) return 'live';
  if (now.getTime() < end.getTime() + PROMISE_WINDOW_MS) return 'promise_open';
  return 'completed';
}

export function formatEventDateUTC(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  }) + ' UTC';
}

export function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
