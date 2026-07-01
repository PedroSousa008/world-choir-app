export type EventStatus =
  | 'upcoming'
  | 'final_hour'
  | 'live'
  | 'promise_open'
  | 'completed'
  | 'waiting_next';

export type UserPhase = 'pre_event' | 'live' | 'promise_open' | 'waiting_next';

export type PledgeReason =
  | 'Peace'
  | 'Hope'
  | 'Love'
  | 'Family'
  | 'Humanity'
  | 'Mental Health'
  | 'Music'
  | 'Other';

export type MemoryType = 'video' | 'photo' | 'promise' | 'clip';

export interface User {
  id: string;
  displayName: string;
  email?: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorldChoirEvent {
  id: string;
  title: string;
  songTitle: string;
  artist: string;
  theme: string;
  startsAtUTC: string;
  endsAtUTC: string;
  hashtag: string;
  status: EventStatus;
  totalPledges: number;
  countriesCount: number;
  citiesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Pledge {
  id: string;
  userId: string;
  eventId: string;
  displayName: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
  reason?: PledgeReason;
  createdAt: string;
}

export interface PromiseEntry {
  id: string;
  userId: string;
  eventId: string;
  displayName: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
  text: string;
  createdAt: string;
}

export interface GatheringPlace {
  id: string;
  eventId: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  interestedCount: number;
  createdAt: string;
}

export interface Memory {
  id: string;
  eventId: string;
  userId?: string;
  type: MemoryType;
  mediaUrl?: string;
  caption: string;
  city?: string;
  country?: string;
  approved: boolean;
  createdAt: string;
}

export interface Friend {
  id: string;
  displayName: string;
  city: string;
  country: string;
  gatheringPlaceId?: string;
  hasPledged: boolean;
}

export interface CityGlow {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  pledges: number;
}

export interface PledgeLight {
  id: string;
  latitude: number;
  longitude: number;
}

export interface EventParticipation {
  eventId: string;
  songTitle: string;
  artist: string;
  theme: string;
  city: string;
  country: string;
  promise?: string;
  participated: boolean;
}

export type TabId = 'home' | 'map' | 'memory' | 'profile';

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}
