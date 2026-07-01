import type {
  CityGlow,
  Friend,
  GatheringPlace,
  Memory,
  Pledge,
  PromiseEntry,
  User,
  WorldChoirEvent,
} from '../types';
import { CURRENT_EVENT } from '../constants/event';

const KEYS = {
  user: 'wc_user',
  pledges: 'wc_pledges',
  promises: 'wc_promises',
  friends: 'wc_friends',
  gatheringInterests: 'wc_gathering_interests',
  events: 'wc_events',
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getUser(): User | null {
  return read<User | null>(KEYS.user, null);
}

export function saveUser(user: User): void {
  write(KEYS.user, user);
}

export function ensureUser(): User {
  const existing = getUser();
  if (existing) return existing;

  const user: User = {
    id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    displayName: 'World Choir Member',
    city: '',
    country: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveUser(user);
  return user;
}

export function updateUser(updates: Partial<User>): User {
  const user = ensureUser();
  const next = { ...user, ...updates, updatedAt: new Date().toISOString() };
  saveUser(next);
  return next;
}

export function getPledges(): Pledge[] {
  return read<Pledge[]>(KEYS.pledges, []);
}

export function getPledgeForEvent(eventId: string, userId: string): Pledge | undefined {
  return getPledges().find((p) => p.eventId === eventId && p.userId === userId);
}

export function savePledge(pledge: Pledge): void {
  const pledges = getPledges().filter(
    (p) => !(p.eventId === pledge.eventId && p.userId === pledge.userId)
  );
  write(KEYS.pledges, [...pledges, pledge]);
}

export function getPromises(): PromiseEntry[] {
  return read<PromiseEntry[]>(KEYS.promises, []);
}

export function getPromiseForEvent(eventId: string, userId: string): PromiseEntry | undefined {
  return getPromises().find((p) => p.eventId === eventId && p.userId === userId);
}

export function savePromiseEntry(entry: PromiseEntry): void {
  const promises = getPromises().filter(
    (p) => !(p.eventId === entry.eventId && p.userId === entry.userId)
  );
  write(KEYS.promises, [...promises, entry]);
}

export function getFriends(): Friend[] {
  return read<Friend[]>(KEYS.friends, DEFAULT_FRIENDS);
}

export function saveFriends(friends: Friend[]): void {
  write(KEYS.friends, friends);
}

export function getGatheringInterests(): string[] {
  return read<string[]>(KEYS.gatheringInterests, []);
}

export function toggleGatheringInterest(placeId: string): string[] {
  const current = getGatheringInterests();
  const next = current.includes(placeId)
    ? current.filter((id) => id !== placeId)
    : [...current, placeId];
  write(KEYS.gatheringInterests, next);
  return next;
}

export function getEvents(): WorldChoirEvent[] {
  return read<WorldChoirEvent[]>(KEYS.events, [CURRENT_EVENT]);
}

export const DEFAULT_FRIENDS: Friend[] = [
  { id: 'f1', displayName: 'Sofia Mendes', city: 'Porto', country: 'Portugal', hasPledged: true },
  { id: 'f2', displayName: 'James Chen', city: 'Tokyo', country: 'Japan', hasPledged: true },
  { id: 'f3', displayName: 'Amara Okafor', city: 'Lagos', country: 'Nigeria', hasPledged: false },
];

export const SEED_CITIES: CityGlow[] = [
  { city: 'New York', country: 'USA', latitude: 40.7128, longitude: -74.006, pledges: 892000 },
  { city: 'London', country: 'UK', latitude: 51.5074, longitude: -0.1278, pledges: 654000 },
  { city: 'Tokyo', country: 'Japan', latitude: 35.6762, longitude: 139.6503, pledges: 721000 },
  { city: 'São Paulo', country: 'Brazil', latitude: -23.5505, longitude: -46.6333, pledges: 498000 },
  { city: 'Paris', country: 'France', latitude: 48.8566, longitude: 2.3522, pledges: 412000 },
  { city: 'Lagos', country: 'Nigeria', latitude: 6.5244, longitude: 3.3792, pledges: 287000 },
  { city: 'Sydney', country: 'Australia', latitude: -33.8688, longitude: 151.2093, pledges: 198000 },
  { city: 'Mumbai', country: 'India', latitude: 19.076, longitude: 72.8777, pledges: 534000 },
  { city: 'Cairo', country: 'Egypt', latitude: 30.0444, longitude: 31.2357, pledges: 176000 },
  { city: 'Porto', country: 'Portugal', latitude: 41.1579, longitude: -8.6291, pledges: 42000 },
  { city: 'Braga', country: 'Portugal', latitude: 41.5454, longitude: -8.4265, pledges: 18000 },
  { city: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.405, pledges: 312000 },
  { city: 'Mexico City', country: 'Mexico', latitude: 19.4326, longitude: -99.1332, pledges: 389000 },
  { city: 'Seoul', country: 'South Korea', latitude: 37.5665, longitude: 126.978, pledges: 445000 },
  { city: 'Cape Town', country: 'South Africa', latitude: -33.9249, longitude: 18.4241, pledges: 92000 },
];

export const GATHERING_PLACES: GatheringPlace[] = [
  {
    id: 'gp1', eventId: CURRENT_EVENT.id, name: 'Praça da Liberdade',
    city: 'Porto', country: 'Portugal', latitude: 41.1475, longitude: -8.6112,
    interestedCount: 1240, createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'gp2', eventId: CURRENT_EVENT.id, name: 'Central Park Great Lawn',
    city: 'New York', country: 'USA', latitude: 40.7829, longitude: -73.9654,
    interestedCount: 8900, createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'gp3', eventId: CURRENT_EVENT.id, name: 'Hyde Park',
    city: 'London', country: 'UK', latitude: 51.5073, longitude: -0.1657,
    interestedCount: 5600, createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'gp4', eventId: CURRENT_EVENT.id, name: 'Praça do Comércio',
    city: 'Lisbon', country: 'Portugal', latitude: 38.7078, longitude: -9.1366,
    interestedCount: 2100, createdAt: '2026-01-01T00:00:00.000Z',
  },
];

export const SEED_MEMORIES: Memory[] = [
  {
    id: 'm1', eventId: 'world-choir-2026', type: 'promise', caption: 'I promise to choose hope.',
    city: 'Braga', country: 'Portugal', approved: true, createdAt: '2026-06-15T16:15:00.000Z',
  },
  {
    id: 'm2', eventId: 'world-choir-2026', type: 'photo', caption: 'Thousands gathered in silence before the song began.',
    city: 'Paris', country: 'France', approved: true, createdAt: '2026-06-15T16:10:00.000Z',
  },
  {
    id: 'm3', eventId: 'world-choir-2026', type: 'promise', caption: 'I promise to be kinder.',
    city: 'Tokyo', country: 'Japan', approved: true, createdAt: '2026-06-15T16:20:00.000Z',
  },
  {
    id: 'm4', eventId: 'world-choir-2026', type: 'clip', caption: 'A rooftop choir in São Paulo at sunset.',
    city: 'São Paulo', country: 'Brazil', approved: true, createdAt: '2026-06-15T16:05:00.000Z',
  },
  {
    id: 'm5', eventId: 'world-choir-2026', type: 'promise', caption: 'I promise to listen more.',
    city: 'Lagos', country: 'Nigeria', approved: true, createdAt: '2026-06-15T16:18:00.000Z',
  },
];

export function getAllMemories(): Memory[] {
  const userPromises = getPromises().map<Memory>((p) => ({
    id: p.id,
    eventId: p.eventId,
    userId: p.userId,
    type: 'promise',
    caption: p.text,
    city: p.city,
    country: p.country,
    approved: true,
    createdAt: p.createdAt,
  }));
  return [...SEED_MEMORIES, ...userPromises];
}

export function getCityGlows(): CityGlow[] {
  const pledges = getPledges();
  const map = new Map<string, CityGlow>();

  for (const city of SEED_CITIES) {
    map.set(`${city.city}-${city.country}`, { ...city });
  }

  for (const pledge of pledges) {
    const key = `${pledge.city}-${pledge.country}`;
    const existing = map.get(key);
    if (existing) {
      existing.pledges += 1;
    } else if (pledge.latitude && pledge.longitude) {
      map.set(key, {
        city: pledge.city,
        country: pledge.country,
        latitude: pledge.latitude,
        longitude: pledge.longitude,
        pledges: 1,
      });
    }
  }

  return Array.from(map.values());
}
