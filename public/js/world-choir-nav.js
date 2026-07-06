/**
 * World Choir — Shared bottom navigation
 * Memory tab appears only after the active event is globally completed.
 */
const WorldChoirNav = (() => {
  let watchInterval = null;

  const ALL_PAGES = [
    { id: 'home', href: 'index.html', label: 'Home', icon: '◉' },
    { id: 'map', href: 'map.html', label: 'Map', icon: '◎' },
    { id: 'memory', href: 'memory.html', label: 'Memory', icon: '◇', requiresMemory: true },
    { id: 'profile', href: 'profile.html', label: 'Profile', icon: '○' },
  ];

  function getVisiblePages() {
    const memoryUnlocked = WorldChoirConfig.isMemoryUnlocked();
    return ALL_PAGES.filter((page) => !page.requiresMemory || memoryUnlocked);
  }

  function renderWorldChoirNav(activePage) {
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.setAttribute('aria-label', 'Main navigation');

    getVisiblePages().forEach((page) => {
      const link = document.createElement('a');
      link.href = page.href;
      link.className = 'nav-item' + (activePage === page.id ? ' active' : '');
      link.innerHTML = `<span class="nav-icon">${page.icon}</span><span>${page.label}</span>`;
      nav.appendChild(link);
    });

    return nav;
  }

  function mount(activePage) {
    const root = document.getElementById('nav-root');
    if (!root) return;
    root.innerHTML = '';
    root.appendChild(renderWorldChoirNav(activePage));
  }

  function startWatcher(activePage) {
    let wasUnlocked = WorldChoirConfig.isMemoryUnlocked();
    mount(activePage);

    if (watchInterval) clearInterval(watchInterval);
    watchInterval = setInterval(() => {
      if (typeof WorldChoirDB !== 'undefined') {
        WorldChoirDB.syncActiveEventStatus?.();
      }
      const unlocked = WorldChoirConfig.isMemoryUnlocked();
      if (unlocked !== wasUnlocked) {
        wasUnlocked = unlocked;
        mount(activePage);
      }
    }, 1000);
  }

  function guardMemoryRoute() {
    if (!WorldChoirConfig.isMemoryUnlocked()) {
      window.location.replace('index.html');
      return false;
    }
    return true;
  }

  return { renderWorldChoirNav, mount, startWatcher, guardMemoryRoute, getVisiblePages };
})();

/** @deprecated Use WorldChoirNav.mount — kept for compatibility */
function renderWorldChoirNav(activePage) {
  return WorldChoirNav.renderWorldChoirNav(activePage);
}

function initParticles(container, count = 24) {
  if (!container) return;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDelay = Math.random() * 18 + 's';
    p.style.animationDuration = 14 + Math.random() * 10 + 's';
    container.appendChild(p);
  }
}

function formatNumber(n) {
  return n.toLocaleString('en-US');
}
