/**
 * OwnerMap — same Leaflet dark map + city lights as the public Map tab,
 * driven by Owner Control Center filtered data (not WorldChoirDB).
 */
const OwnerMap = (() => {
  let map = null;
  let cityLightsLayer = null;
  let mountedId = null;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function glowSize(count) {
    return clamp(Math.round(14 + Math.sqrt(count) * 6), 16, 56);
  }

  function createCityLightIcon(city) {
    const size = glowSize(city.count || 1);
    return L.divIcon({
      className: 'city-light-icon',
      html:
        `<div class="city-light" style="--glow:${size}px">` +
        '<span class="city-light__glow"></span><span class="city-light__core"></span></div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  function formatNumber(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function showCityCard(city) {
    const card = document.getElementById('owner-city-card');
    if (!card) return;
    document.getElementById('owner-city-card-place').textContent =
      `${city.city || 'Unknown'}, ${city.country || ''}`.replace(/, $/, '');
    const voices = city.count || city.voices || 0;
    const donors = city.donors || 0;
    const raised = city.raised;
    let line = `${formatNumber(voices)} voice${voices !== 1 ? 's' : ''}`;
    if (donors > 0 || (raised != null && raised > 0)) {
      line += ` · ${formatNumber(donors)} donor${donors !== 1 ? 's' : ''}`;
      if (raised != null) {
        try {
          line += ` · ${new Intl.NumberFormat(undefined, { style: 'currency', currency: city.currency || 'EUR', maximumFractionDigits: 0 }).format(raised)}`;
        } catch {
          line += ` · ${raised}`;
        }
      }
    }
    document.getElementById('owner-city-card-voices').textContent = line;
    card.classList.add('visible');
    clearTimeout(showCityCard._t);
    showCityCard._t = setTimeout(() => card.classList.remove('visible'), 4000);
  }

  function hideCityCard() {
    document.getElementById('owner-city-card')?.classList.remove('visible');
  }

  function setCities(cities) {
    if (!cityLightsLayer) return;
    cityLightsLayer.clearLayers();
    (cities || []).forEach((city) => {
      if (city.latitude == null || city.longitude == null) return;
      const marker = L.marker([city.latitude, city.longitude], {
        icon: createCityLightIcon(city),
        interactive: true,
        keyboard: false,
      });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        showCityCard(city);
      });
      cityLightsLayer.addLayer(marker);
    });
  }

  async function mount(containerId, cities) {
    if (typeof L === 'undefined') {
      console.error('Leaflet is required for OwnerMap');
      return;
    }

    destroy();
    mountedId = containerId;
    const el = document.getElementById(containerId);
    if (!el) return;

    map = L.map(containerId, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 10,
      zoomControl: true,
      attributionControl: false,
      worldCopyJump: false,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1.0,
    });

    await WorldChoirMapTiles.addSingleBasemapLayer(map);

    cityLightsLayer = L.layerGroup().addTo(map);
    map.on('click', hideCityCard);
    setCities(cities);

    // Leaflet needs a tick after layout to size correctly inside Owner shell.
    requestAnimationFrame(() => {
      map?.invalidateSize();
      setTimeout(() => map?.invalidateSize(), 120);
    });
  }

  function invalidateSize() {
    map?.invalidateSize();
  }

  function destroy() {
    hideCityCard();
    if (map) {
      map.remove();
      map = null;
    }
    cityLightsLayer = null;
    mountedId = null;
  }

  return { mount, setCities, destroy, invalidateSize };
})();
