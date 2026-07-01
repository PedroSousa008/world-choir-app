import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { EmptyState, LoadingBlock } from '../components/Shared';
import { useData } from '../context/DataContext';
import { toggleGatheringInterest } from '../services/database';
import './MapScreen.css';

export function MapScreen() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const {
    loading,
    event,
    cityGlows,
    gatheringPlaces,
    gatheringInterests,
    friends,
    user,
    refresh,
  } = useData();
  const [refreshingInterest, setRefreshingInterest] = useState<string | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current || loading) return;

    const map = L.map(mapRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 10,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
    }).addTo(map);

    if (cityGlows.length > 0) {
      const maxPledges = Math.max(...cityGlows.map((c) => c.pledges), 1);

      cityGlows.forEach((city) => {
        const intensity = city.pledges / maxPledges;
        const radius = 6000 + intensity * 80000;

        L.circle([city.latitude, city.longitude], {
          radius,
          color: 'rgba(59, 125, 216, 0.35)',
          fillColor: `rgba(58, 175, 155, ${0.12 + intensity * 0.25})`,
          fillOpacity: 0.6,
          weight: 1,
        }).addTo(map);

        L.circleMarker([city.latitude, city.longitude], {
          radius: 4 + intensity * 4,
          color: '#3b7dd8',
          fillColor: '#3aaf9b',
          fillOpacity: 0.85,
          weight: 1,
        })
          .bindPopup(
            `<strong>${city.city}</strong><br/>${city.country}<br/>${city.pledges} ${city.pledges === 1 ? 'voice' : 'voices'}`
          )
          .addTo(map);
      });
    }

    friends.filter((f) => f.hasPledged).forEach((friend) => {
      const match = cityGlows.find((c) => c.city === friend.city && c.country === friend.country);
      if (!match) return;
      L.circleMarker([match.latitude + 0.2, match.longitude + 0.2], {
        radius: 5,
        color: '#f0b429',
        fillColor: '#f0b429',
        fillOpacity: 1,
        weight: 2,
      })
        .bindPopup(`<strong>${friend.displayName}</strong><br/>${friend.city}, ${friend.country}`)
        .addTo(map);
    });

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [loading, cityGlows, friends]);

  async function handleGatheringToggle(placeId: string) {
    setRefreshingInterest(placeId);
    await toggleGatheringInterest(user.id, placeId);
    await refresh();
    setRefreshingInterest(null);
  }

  if (loading) {
    return (
      <div className="screen map-screen">
        <LoadingBlock label="Loading map..." />
      </div>
    );
  }

  return (
    <div className="screen map-screen fade-in">
      <header className="map-screen__header">
        <p className="eyebrow">Global Map</p>
        <h1 className="heading">The Earth Breathes</h1>
        <p className="subtitle">
          Every real pledge adds a point of light. Cities grow brighter as voices join.
        </p>
      </header>

      <div className="map-screen__map card" ref={mapRef} />

      {cityGlows.length === 0 && (
        <EmptyState
          title="The map is still quiet."
          subtitle="When people pledge, their cities will begin to light up. Be the first voice in your city."
        />
      )}

      {gatheringPlaces.length > 0 && (
        <section className="map-screen__section">
          <h2 className="map-screen__section-title">Gathering Places</h2>
          <div className="gathering-list">
            {gatheringPlaces.map((place) => {
              const interested = gatheringInterests.includes(place.id);
              return (
                <div key={place.id} className="gathering-card card">
                  <div>
                    <h3>{place.name}</h3>
                    <p>{place.city}, {place.country}</p>
                    <p className="gathering-card__count">
                      {place.interestedCount} {place.interestedCount === 1 ? 'person' : 'people'} interested
                    </p>
                  </div>
                  <button
                    className={`btn-secondary ${interested ? 'btn-secondary--active' : ''}`}
                    disabled={refreshingInterest === place.id}
                    onClick={() => handleGatheringToggle(place.id)}
                  >
                    {interested ? "I'll be there ✓" : "I'll be there"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="map-screen__section">
        <h2 className="map-screen__section-title">Friends on the Map</h2>
        {friends.length === 0 ? (
          <EmptyState title="No friends added yet." subtitle="When you add friends, their planned locations will appear here." />
        ) : (
          <div className="friends-list">
            {friends.map((f) => (
              <div key={f.id} className="friend-card card">
                <div className="friend-card__avatar">{f.displayName[0]}</div>
                <div>
                  <h3>{f.displayName}</h3>
                  <p>{f.city}, {f.country}</p>
                  <p className="friend-card__status">{f.hasPledged ? 'Will sing' : 'Not yet pledged'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
