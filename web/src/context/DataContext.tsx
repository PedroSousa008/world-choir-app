import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
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
import {
  fetchCityGlows,
  fetchCurrentEvent,
  fetchFriends,
  fetchGatheringPlaces,
  fetchMemories,
  fetchParticipationStats,
  fetchPledgeLights,
  fetchUser,
  fetchUserGatheringInterests,
  fetchUserPledge,
  fetchUserPledges,
  fetchUserPromise,
  fetchUserPromises,
  isDatabaseConfigured,
  type ParticipationStats,
} from '../services/database';
import { getLocalUserId } from '../services/localUser';
import { FALLBACK_EVENT } from '../constants/event';

interface DataContextValue {
  loading: boolean;
  dbConfigured: boolean;
  event: WorldChoirEvent;
  stats: ParticipationStats;
  user: User;
  pledge: Pledge | null;
  promise: PromiseEntry | null;
  cityGlows: CityGlow[];
  pledgeLights: PledgeLight[];
  memories: Memory[];
  gatheringPlaces: GatheringPlace[];
  gatheringInterests: string[];
  friends: Friend[];
  userPledges: Pledge[];
  userPromises: PromiseEntry[];
  refresh: () => Promise<void>;
  setUser: (user: User) => void;
}

const defaultStats: ParticipationStats = { totalPledges: 0, countriesCount: 0, citiesCount: 0 };

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<WorldChoirEvent>(FALLBACK_EVENT);
  const [stats, setStats] = useState<ParticipationStats>(defaultStats);
  const [user, setUserState] = useState<User>(() => ({
    id: getLocalUserId(),
    displayName: 'World Choir Member',
    city: '',
    country: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  const [pledge, setPledge] = useState<Pledge | null>(null);
  const [promise, setPromise] = useState<PromiseEntry | null>(null);
  const [cityGlows, setCityGlows] = useState<CityGlow[]>([]);
  const [pledgeLights, setPledgeLights] = useState<PledgeLight[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [gatheringPlaces, setGatheringPlaces] = useState<GatheringPlace[]>([]);
  const [gatheringInterests, setGatheringInterests] = useState<string[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [userPledges, setUserPledges] = useState<Pledge[]>([]);
  const [userPromises, setUserPromises] = useState<PromiseEntry[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const userId = getLocalUserId();

      const fetchedEvent = await fetchCurrentEvent();
      const activeEvent = fetchedEvent ?? FALLBACK_EVENT;
      setEvent(activeEvent);

      const storedUser = await fetchUser(userId);

      const [
        participationStats,
        glows,
        lights,
        userPledge,
        userPromise,
        allMemories,
        places,
        interests,
        friendList,
        pledges,
        promises,
      ] = await Promise.all([
        fetchParticipationStats(activeEvent.id),
        fetchCityGlows(activeEvent.id),
        fetchPledgeLights(activeEvent.id),
        fetchUserPledge(activeEvent.id, userId),
        fetchUserPromise(activeEvent.id, userId),
        fetchMemories(),
        fetchGatheringPlaces(activeEvent.id),
        fetchUserGatheringInterests(userId),
        fetchFriends(userId),
        fetchUserPledges(userId),
        fetchUserPromises(userId),
      ]);

      setStats(participationStats);
      setCityGlows(glows);
      setPledgeLights(lights);
      setPledge(userPledge);
      setPromise(userPromise);
      setMemories(allMemories);
      setGatheringPlaces(places);
      setGatheringInterests(interests);
      setFriends(friendList);
      setUserPledges(pledges);
      setUserPromises(promises);

      if (storedUser) {
        setUserState(storedUser);
      }
    } catch (err) {
      console.error('World Choir data load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setUser = (next: User) => setUserState(next);

  return (
    <DataContext.Provider
      value={{
        loading,
        dbConfigured: isDatabaseConfigured,
        event,
        stats,
        user,
        pledge,
        promise,
        cityGlows,
        pledgeLights,
        memories,
        gatheringPlaces,
        gatheringInterests,
        friends,
        userPledges,
        userPromises,
        refresh: load,
        setUser,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
