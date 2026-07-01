import { useEffect, useState } from 'react';
import { getCountdownParts, getEventStatus } from '../constants/event';
import type { EventStatus, UserPhase } from '../types';
import { useData } from '../context/DataContext';

export function useEventClock() {
  const [now, setNow] = useState(() => new Date());
  const { event, user, pledge, promise } = useData();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const status = getEventStatus(event, now);
  const countdown = getCountdownParts(new Date(event.startsAtUTC), now);

  let userPhase: UserPhase = 'pre_event';
  if (status === 'live') userPhase = 'live';
  else if (status === 'promise_open' && pledge && !promise) userPhase = 'promise_open';
  else if ((status === 'promise_open' || status === 'completed') && promise) userPhase = 'waiting_next';
  else if (status === 'completed' && pledge && !promise) userPhase = 'promise_open';

  return {
    now,
    event,
    status: status as EventStatus,
    countdown,
    user,
    pledge,
    promise,
    userPhase,
    hasPledged: Boolean(pledge),
    hasPromised: Boolean(promise),
  };
}
