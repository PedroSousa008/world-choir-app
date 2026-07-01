import type {
  CityGlow,
  Friend,
  GatheringPlace,
  Memory,
  Pledge,
  PromiseEntry,
  PledgeLight,
  User,
  WorldChoirEvent,
} from '../types';
import { isDatabaseConfigured, supabase } from '../lib/supabase';

export interface ParticipationStats {
  totalPledges: number;
  countriesCount: number;
  citiesCount: number;
}

const EMPTY_STATS: ParticipationStats = {
  totalPledges: 0,
  countriesCount: 0,
  citiesCount: 0,
};

function rowToEvent(row: Record<string, unknown>): WorldChoirEvent {
  return {
    id: row.id as string,
    title: row.title as string,
    songTitle: row.song_title as string,
    artist: row.artist as string,
    theme: row.theme as string,
    startsAtUTC: row.starts_at_utc as string,
    endsAtUTC: row.ends_at_utc as string,
    hashtag: row.hashtag as string,
    status: 'upcoming',
    totalPledges: 0,
    countriesCount: 0,
    citiesCount: 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToPledge(row: Record<string, unknown>): Pledge {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    eventId: row.event_id as string,
    displayName: row.display_name as string,
    city: row.city as string,
    country: row.country as string,
    latitude: row.latitude as number | undefined,
    longitude: row.longitude as number | undefined,
    reason: row.reason as Pledge['reason'],
    createdAt: row.created_at as string,
  };
}

function rowToPromise(row: Record<string, unknown>): PromiseEntry {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    eventId: row.event_id as string,
    displayName: row.display_name as string,
    city: row.city as string,
    country: row.country as string,
    latitude: row.latitude as number | undefined,
    longitude: row.longitude as number | undefined,
    text: row.text as string,
    createdAt: row.created_at as string,
  };
}

function rowToMemory(row: Record<string, unknown>): Memory {
  return {
    id: row.id as string,
    eventId: row.event_id as string,
    userId: row.user_id as string | undefined,
    type: row.type as Memory['type'],
    mediaUrl: row.media_url as string | undefined,
    caption: row.caption as string,
    city: row.city as string | undefined,
    country: row.country as string | undefined,
    approved: row.approved as boolean,
    createdAt: row.created_at as string,
  };
}

export async function fetchEventById(eventId: string): Promise<WorldChoirEvent | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();

  if (error || !data) return null;
  return rowToEvent(data);
}

export async function fetchUser(userId: string): Promise<User | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id as string,
    displayName: data.display_name as string,
    email: data.email as string | undefined,
    city: (data.city as string) ?? '',
    country: (data.country as string) ?? '',
    latitude: data.latitude as number | undefined,
    longitude: data.longitude as number | undefined,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

export async function fetchCurrentEvent(): Promise<WorldChoirEvent | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('starts_at_utc', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return rowToEvent(data);
}

export async function fetchParticipationStats(eventId: string): Promise<ParticipationStats> {
  if (!supabase) return EMPTY_STATS;

  const { data, error } = await supabase
    .from('pledges')
    .select('city, country')
    .eq('event_id', eventId);

  if (error || !data) return EMPTY_STATS;

  const countries = new Set(data.map((p) => p.country).filter(Boolean));
  const cities = new Set(data.map((p) => `${p.city}|${p.country}`).filter((k) => !k.startsWith('|')));

  return {
    totalPledges: data.length,
    countriesCount: countries.size,
    citiesCount: cities.size,
  };
}

export async function fetchCityGlows(eventId: string): Promise<CityGlow[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('pledges')
    .select('city, country, latitude, longitude')
    .eq('event_id', eventId)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (error || !data) return [];

  const map = new Map<string, CityGlow>();

  for (const row of data) {
    const key = `${row.city}|${row.country}`;
    const existing = map.get(key);
    if (existing) {
      existing.pledges += 1;
    } else {
      map.set(key, {
        city: row.city,
        country: row.country,
        latitude: row.latitude,
        longitude: row.longitude,
        pledges: 1,
      });
    }
  }

  return Array.from(map.values());
}

export async function fetchPledgeLights(eventId: string): Promise<PledgeLight[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('pledges')
    .select('id, latitude, longitude')
    .eq('event_id', eventId)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
  }));
}

export async function fetchUserPledge(eventId: string, userId: string): Promise<Pledge | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('pledges')
    .select('*')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return rowToPledge(data);
}

export async function fetchUserPromise(eventId: string, userId: string): Promise<PromiseEntry | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('promises')
    .select('*')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return rowToPromise(data);
}

export async function fetchUserPromises(userId: string): Promise<PromiseEntry[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('promises')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data.map(rowToPromise);
}

export async function fetchUserPledges(userId: string): Promise<Pledge[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('pledges')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data.map(rowToPledge);
}

export async function upsertUser(user: User): Promise<User | null> {
  if (!supabase) return user;

  const { error } = await supabase.from('users').upsert({
    id: user.id,
    display_name: user.displayName,
    email: user.email ?? null,
    city: user.city,
    country: user.country,
    latitude: user.latitude ?? null,
    longitude: user.longitude ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) return null;
  return user;
}

export async function createPledge(pledge: Pledge): Promise<Pledge | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.from('pledges').upsert({
    id: pledge.id,
    user_id: pledge.userId,
    event_id: pledge.eventId,
    display_name: pledge.displayName,
    city: pledge.city,
    country: pledge.country,
    latitude: pledge.latitude ?? null,
    longitude: pledge.longitude ?? null,
    reason: pledge.reason ?? null,
  }).select().single();

  if (error || !data) return null;
  return rowToPledge(data);
}

export async function createPromise(entry: PromiseEntry): Promise<PromiseEntry | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.from('promises').upsert({
    id: entry.id,
    user_id: entry.userId,
    event_id: entry.eventId,
    display_name: entry.displayName,
    city: entry.city,
    country: entry.country,
    latitude: entry.latitude ?? null,
    longitude: entry.longitude ?? null,
    text: entry.text,
  }).select().single();

  if (error || !data) return null;
  return rowToPromise(data);
}

export async function fetchMemories(eventId?: string): Promise<Memory[]> {
  if (!supabase) return [];

  let query = supabase
    .from('memories')
    .select('*')
    .eq('approved', true)
    .order('created_at', { ascending: false });

  if (eventId) query = query.eq('event_id', eventId);

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(rowToMemory);
}

export async function fetchGatheringPlaces(eventId: string): Promise<GatheringPlace[]> {
  if (!supabase) return [];

  const { data: places, error } = await supabase
    .from('gathering_places')
    .select('*')
    .eq('event_id', eventId);

  if (error || !places) return [];

  const { data: interests } = await supabase
    .from('gathering_interests')
    .select('gathering_place_id');

  const countMap = new Map<string, number>();
  for (const i of interests ?? []) {
    const id = i.gathering_place_id as string;
    countMap.set(id, (countMap.get(id) ?? 0) + 1);
  }

  return places.map((row) => ({
    id: row.id as string,
    eventId: row.event_id as string,
    name: row.name as string,
    city: row.city as string,
    country: row.country as string,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    interestedCount: countMap.get(row.id as string) ?? 0,
    createdAt: row.created_at as string,
  }));
}

export async function fetchUserGatheringInterests(userId: string): Promise<string[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('gathering_interests')
    .select('gathering_place_id')
    .eq('user_id', userId);

  if (error || !data) return [];
  return data.map((r) => r.gathering_place_id as string);
}

export async function toggleGatheringInterest(userId: string, placeId: string): Promise<boolean> {
  if (!supabase) return false;

  const { data: existing } = await supabase
    .from('gathering_interests')
    .select('id')
    .eq('user_id', userId)
    .eq('gathering_place_id', placeId)
    .maybeSingle();

  if (existing) {
    await supabase.from('gathering_interests').delete().eq('id', existing.id);
    return false;
  }

  await supabase.from('gathering_interests').insert({
    user_id: userId,
    gathering_place_id: placeId,
  });
  return true;
}

export async function fetchFriends(userId: string): Promise<Friend[]> {
  if (!supabase) return [];

  const { data: links, error } = await supabase
    .from('friends')
    .select('friend_user_id')
    .eq('user_id', userId);

  if (error || !links?.length) return [];

  const friendIds = links.map((l) => l.friend_user_id as string);
  const { data: users } = await supabase
    .from('users')
    .select('id, display_name, city, country')
    .in('id', friendIds);

  if (!users) return [];

  const { data: pledges } = await supabase
    .from('pledges')
    .select('user_id')
    .in('user_id', friendIds);

  const pledgedIds = new Set((pledges ?? []).map((p) => p.user_id));

  return users.map((u) => ({
    id: u.id as string,
    displayName: u.display_name as string,
    city: u.city as string,
    country: u.country as string,
    hasPledged: pledgedIds.has(u.id as string),
  }));
}

export async function geocodeCity(city: string, country: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = encodeURIComponent(`${city}, ${country}`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (!data?.[0]) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

export { isDatabaseConfigured };
