/**
 * World Choir — Web Push client (opt-in).
 * Registers service worker, requests permission, stores subscription server-side.
 */
const WorldChoirPush = (() => {
  const SW_URL = '/sw.js';
  const API = '/api/push';

  function supported() {
    return typeof window !== 'undefined'
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
    return output;
  }

  async function getDeviceId() {
    if (typeof WorldChoirDB !== 'undefined' && WorldChoirDB.getDeviceId) {
      return WorldChoirDB.getDeviceId();
    }
    try {
      let id = localStorage.getItem('wc_anonymous_device_id');
      if (!id) {
        id = `dev_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
        localStorage.setItem('wc_anonymous_device_id', id);
      }
      return id;
    } catch {
      return `dev_${Date.now()}`;
    }
  }

  async function fetchStatus() {
    const res = await fetch(`${API}?action=vapid-public-key`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Could not load push configuration');
    return res.json();
  }

  async function ensureServiceWorker() {
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  }

  async function subscribe({ role = 'voice', requestPermission = true } = {}) {
    if (!supported()) {
      return { ok: false, error: 'Push notifications are not supported in this browser.' };
    }

    const status = await fetchStatus();
    if (!status.configured || !status.publicKey) {
      return { ok: false, error: 'Push is not configured on the server yet.' };
    }

    if (requestPermission) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { ok: false, error: 'Notification permission was not granted.' };
      }
    } else if (Notification.permission !== 'granted') {
      return { ok: false, error: 'Notification permission is not granted.' };
    }

    const reg = await ensureServiceWorker();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(status.publicKey),
      });
    }

    const deviceId = await getDeviceId();
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'subscribe-web',
        deviceId,
        subscription: sub.toJSON(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        locale: navigator.language || null,
        role,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || 'Could not save subscription' };
    }
    try { localStorage.setItem('wc_push_enabled', '1'); } catch { /* ignore */ }
    return { ok: true, subscription: data.subscription };
  }

  async function unsubscribe() {
    if (!supported()) return { ok: true };
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    const deviceId = await getDeviceId();
    if (sub) {
      await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unsubscribe',
          deviceId,
          endpoint: sub.endpoint,
        }),
      }).catch(() => null);
      await sub.unsubscribe().catch(() => null);
    }
    try { localStorage.removeItem('wc_push_enabled'); } catch { /* ignore */ }
    return { ok: true };
  }

  /** Soft prompt once per device after join — never auto-subscribe without gesture on iOS. */
  async function maybeSoftPrompt() {
    if (!supported()) return;
    if (Notification.permission !== 'default') return;
    try {
      if (localStorage.getItem('wc_push_prompted_v1')) return;
      localStorage.setItem('wc_push_prompted_v1', '1');
    } catch { return; }
    // Do not call Notification.requestPermission from here on page load —
    // wait for an explicit user control (profile / settings / CTA).
  }

  return {
    supported,
    fetchStatus,
    subscribe,
    unsubscribe,
    maybeSoftPrompt,
    ensureServiceWorker,
  };
})();

if (typeof window !== 'undefined') window.WorldChoirPush = WorldChoirPush;
