import { useEffect, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { HomeScreen } from './screens/HomeScreen';
import { MapScreen } from './screens/MapScreen';
import { MemoryWallScreen } from './screens/MemoryWallScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { PromiseScreen } from './screens/PromiseScreen';
import { useEventClock } from './hooks/useEventClock';
import type { TabId } from './types';

export default function App() {
  const [tab, setTab] = useState<TabId>('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showPromise, setShowPromise] = useState(false);
  const { userPhase } = useEventClock();

  useEffect(() => {
    if (userPhase === 'promise_open' && !showPromise) {
      setShowPromise(true);
    }
  }, [userPhase, showPromise]);

  function handlePromiseComplete() {
    setShowPromise(false);
    setTab('home');
    setRefreshKey((k) => k + 1);
  }

  if (showPromise) {
    return <PromiseScreen onComplete={handlePromiseComplete} />;
  }

  return (
    <div className="app-shell">
      <main className="app-content">
        {tab === 'home' && (
          <HomeScreen refreshKey={refreshKey} />
        )}
        {tab === 'map' && <MapScreen />}
        {tab === 'memory' && <MemoryWallScreen />}
        {tab === 'profile' && <ProfileScreen />}
      </main>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
