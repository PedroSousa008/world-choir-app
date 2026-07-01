/**
 * World Choir — Shared bottom navigation
 */
function renderWorldChoirNav(activePage) {
  const pages = [
    { id: 'home', href: 'index.html', label: 'Home', icon: '◉' },
    { id: 'map', href: 'map.html', label: 'Map', icon: '◎' },
    { id: 'memory', href: 'memory.html', label: 'Memory', icon: '◇' },
    { id: 'profile', href: 'profile.html', label: 'Profile', icon: '○' },
  ];

  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', 'Main navigation');

  pages.forEach((page) => {
    const link = document.createElement('a');
    link.href = page.href;
    link.className = 'nav-item' + (activePage === page.id ? ' active' : '');
    link.innerHTML = `<span class="nav-icon">${page.icon}</span><span>${page.label}</span>`;
    nav.appendChild(link);
  });

  return nav;
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
