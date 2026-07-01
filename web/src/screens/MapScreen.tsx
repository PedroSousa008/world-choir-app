import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { getCityGlows, getFriends, GATHERING_PLACES, getGatheringInterests, toggleGatheringInterest } from '../services/storage';
import { useEventClock } from '../hooks/useEventClock';
import './MapScreen.css';

export function MapScreen() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const { status } = useEventClock();
  const interests = getGatheringInterests();
  const isLive = status === 'live' || status === 'final_hour';
  const pulseIntensity = isLive ? 1.5 : 1;

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const cityData = getCityGlows();
    const friendData = getFriends();

    const map = L.map(mapRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 10,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
    }).addTo(map);

    const maxPledges = Math.max(...cityData.map((c) => c.pledges), 1);

    cityData.forEach((city) => {
      const intensity = city.pledges / maxPledges;
      const radius = 8000 + intensity * 120000;
      const color = `rgba(110, 200, 232, ${0.15 + intensity * 0.35})`;

      L.circle([city.latitude, city.longitude], {
        radius,
        color: 'rgba(110, 200, 232, 0.4)',
        fillColor: color,
        fillOpacity: 0.5 + intensity * 0.3,
        weight: 1,
        className: isLive ? 'map-pulse' : '',
      }).addTo(map);

      L.circleMarker([city.latitude, city.longitude], {
        radius: 3 + intensity * 6,
        color: 'rgba(245, 230, 200, 0.8)',
        fillColor: 'rgba(245, 230, 200, 0.9)',
        fillOpacity: 0.9,
        weight: 1,
      })
        .bindPopup(
          `<div class="map-popup"><strong>${city.city}</strong><br/>${city.country}<br/><span>${city.pledges.toLocaleString()} voices</span></div>`
        )
        .addTo(map);
    });

    friendData.filter((f) => f.hasPledged).forEach((friend) => {
      const match = cityData.find((c) => c.city === friend.city);
      if (!match) return;
      L.marker([match.latitude + 0.3, match.longitude + 0.3], {
        icon: L.divIcon({
          className: 'friend-marker',
          html: `<div class="friend-marker__dot"></div>`,
          iconSize: [12, 12],
        }),
      })
        .bindPopup(`<div class="map-popup"><strong>${friend.displayName}</strong><br/>${friend.city}, ${friend.country}</div>`)
        .addTo(map);
    });

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [isLive]);

  const userPlaces = GATHERING_PLACES.slice(0, 4);

  return (
    <div className="screen map-screen fade-in">
      <header className="map-screen__header">
        <p className="eyebrow">Global Map</p>
        <h1 className="title-serif map-screen__title">The Earth Breathes</h1>
        <p className="subtitle">
          Every pledge adds a point of light. {isLive ? 'The world is glowing.' : 'Cities grow brighter as voices join.'}
        </p>
      </header>

      <div
        className="map-screen__map glass-card"
        ref={mapRef}
        style={{ animationDuration: `${8 / pulseIntensity}s` }}
      />

      <section className="map-screen__section">
        <h2 className="map-screen__section-title">Gathering Places</h2>
        <div className="gathering-list">
          {userPlaces.map((place) => {
            const interested = interests.includes(place.id);
            return (
              <div key={place.id} className="gathering-card glass-card">
                <div>
                  <h3>{place.name}</h3>
                  <p>{place.city}, {place.country}</p>
                  <p className="gathering-card__count">{place.interestedCount.toLocaleString()} interested</p>
                </div>
                <button
                  className={`btn-secondary ${interested ? 'btn-secondary--active' : ''}`}
                  onClick={() => toggleGatheringInterest(place.id)}
                >
                  {interested ? "I'll be there ✓" : "I'll be there"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="map-screen__section">
        <h2 className="map-screen__section-title">Friends on the Map</h2>
        <div className="friends-list">
          {getFriends().map((f) => (
            <div key={f.id} className="friend-card glass-card">
              <div className="friend-card__avatar">{f.displayName[0]}</div>
              <div>
                <h3>{f.displayName}</h3>
                <p>{f.city}, {f.country}</p>
                <p className="friend-card__status">
                  {f.hasPledged ? 'Will sing' : 'Not yet pledged'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
