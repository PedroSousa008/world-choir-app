#!/usr/bin/env node
/**
 * Inject early theme boot into World Choir HTML pages (FOUC prevention).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const PAGES = [
  'index.html',
  'map.html',
  'profile.html',
  'donate.html',
  'memory.html',
  'daily-acts.html',
  'world-chain.html',
  'passport.html',
  'passport-journey.html',
  'passport-story.html',
  'contact.html',
  'privacy-policy.html',
  'terms-and-conditions.html',
  'members.html',
  'song-we-sang.html',
];

const THEME_BOOT = `  <script>
    /* Apply persisted theme before first paint — default dark, never flash wrong theme */
    (function () {
      try {
        var t = localStorage.getItem('wc_theme_v1');
        if (t !== 'light' && t !== 'dark') t = 'dark';
        document.documentElement.setAttribute('data-theme', t);
        document.documentElement.style.colorScheme = t;
        document.documentElement.style.setProperty('--wc-boot-bg', t === 'light' ? '#ffffff' : '#000000');
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', t === 'light' ? '#ffffff' : '#000000');
      } catch (e) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.style.setProperty('--wc-boot-bg', '#000000');
      }
    })();
  </script>
`;

const BOOT_CRITICAL_OLD = `html.wc-booting:not(.wc-boot-skeletons)::before{content:"";position:fixed;inset:0;z-index:2147483000;background:#000;pointer-events:none}
    html.wc-booting.wc-nav-handoff:not(.wc-boot-skeletons)::before{bottom:calc(84px + env(safe-area-inset-bottom,0px))}
    html.wc-booting:not(.wc-boot-skeletons),html.wc-booting:not(.wc-boot-skeletons) body{background:#000!important}`;

const BOOT_CRITICAL_NEW = `html.wc-booting:not(.wc-boot-skeletons)::before{content:"";position:fixed;inset:0;z-index:2147483000;background:var(--wc-boot-bg,#000);pointer-events:none}
    html.wc-booting.wc-nav-handoff:not(.wc-boot-skeletons)::before{bottom:calc(84px + env(safe-area-inset-bottom,0px))}
    html.wc-booting:not(.wc-boot-skeletons),html.wc-booting:not(.wc-boot-skeletons) body{background:var(--wc-boot-bg,#000)!important}`;

const THEME_JS = '<script src="js/world-choir-theme.js?v=20260911theme"></script>';

function inject(fileRel) {
  const full = path.join(ROOT, fileRel);
  if (!fs.existsSync(full)) return false;
  let html = fs.readFileSync(full, 'utf8');
  let changed = false;

  if (!html.includes("localStorage.getItem('wc_theme_v1')")) {
    if (html.includes('<meta name="theme-color"')) {
      html = html.replace(
        /(<meta name="theme-color"[^>]*>\s*)/,
        `$1${THEME_BOOT}`
      );
      changed = true;
    } else if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>\n${THEME_BOOT}`);
      changed = true;
    }
  }

  if (html.includes(BOOT_CRITICAL_OLD)) {
    html = html.replace(BOOT_CRITICAL_OLD, BOOT_CRITICAL_NEW);
    changed = true;
  } else if (html.includes('background:#000!important') && html.includes('wc-boot-critical')) {
    html = html
      .replace(/background:#000;pointer-events:none/g, 'background:var(--wc-boot-bg,#000);pointer-events:none')
      .replace(/background:#000!important/g, 'background:var(--wc-boot-bg,#000)!important');
    changed = true;
  }

  // Load theme module before nav/tabs when possible
  if (!html.includes('world-choir-theme.js')) {
    if (html.includes('js/world-choir-nav.js')) {
      html = html.replace(
        /(<script src="js\/world-choir-nav\.js[^"]*"><\/script>)/,
        `${THEME_JS}\n  $1`
      );
      changed = true;
    } else if (html.includes('js/world-choir-config.js')) {
      html = html.replace(
        /(<script src="js\/world-choir-config\.js[^"]*"><\/script>)/,
        `$1\n  ${THEME_JS}`
      );
      changed = true;
    } else if (html.includes('js/world-choir-boot.js')) {
      html = html.replace(
        /(<script src="js\/world-choir-boot\.js[^"]*"><\/script>)/,
        `$1\n  ${THEME_JS}`
      );
      changed = true;
    }
  }

  // Bump theme stylesheet cache
  if (html.includes('world-choir-theme.css')) {
    const next = html.replace(
      /world-choir-theme\.css\?v=[^"]+/g,
      'world-choir-theme.css?v=20260911theme'
    );
    if (next !== html) {
      html = next;
      changed = true;
    }
  }

  if (changed) fs.writeFileSync(full, html);
  return changed;
}

const updated = PAGES.filter(inject);
console.log(updated.length ? `Updated HTML:\n- ${updated.join('\n- ')}` : 'No HTML changes');
