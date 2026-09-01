/**
 * Authoritative server time — median offset from multiple samples.
 */
const WorldChoirServerTime = (() => {
  const API_URL = '/api/live-event';
  const SAMPLE_COUNT = 5;
  const RESYNC_INTERVAL_MS = 60_000;

  let offsetMs = 0;
  let syncedAt = 0;
  let syncPromise = null;
  let resyncTimer = null;

  function nowMs() {
    return Date.now() + offsetMs;
  }

  function nowDate() {
    return new Date(nowMs());
  }

  async function sampleOnce() {
    const t0 = Date.now();
    const res = await fetch(`${API_URL}?eventId=world-choir-2027`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const t1 = Date.now();
    if (!res.ok) throw new Error('Server time unavailable');
    const data = await res.json();
    const serverMs = new Date(data.serverNow).getTime();
    const rtt = t1 - t0;
    const estimate = serverMs + rtt / 2;
    return {
      offset: estimate - t1,
      payload: data,
    };
  }

  async function sync(force = false) {
    if (!force && syncPromise) return syncPromise;
    if (!force && syncedAt && Date.now() - syncedAt < RESYNC_INTERVAL_MS) {
      return { offsetMs, lastPayload: null };
    }

    syncPromise = (async () => {
      const offsets = [];
      let lastPayload = null;
      let errors = 0;

      for (let i = 0; i < SAMPLE_COUNT; i++) {
        try {
          const sample = await sampleOnce();
          offsets.push(sample.offset);
          lastPayload = sample.payload;
        } catch {
          errors += 1;
        }
        if (i < SAMPLE_COUNT - 1) {
          await new Promise((r) => setTimeout(r, 80));
        }
      }

      if (offsets.length) {
        offsets.sort((a, b) => a - b);
        offsetMs = offsets[Math.floor(offsets.length / 2)];
        syncedAt = Date.now();
      }

      return { offsetMs, lastPayload, errors };
    })();

    try {
      return await syncPromise;
    } finally {
      syncPromise = null;
    }
  }

  function startAutoResync() {
    if (resyncTimer) return;
    resyncTimer = setInterval(() => {
      sync(true).catch(() => {});
    }, RESYNC_INTERVAL_MS);
  }

  function stopAutoResync() {
    if (resyncTimer) {
      clearInterval(resyncTimer);
      resyncTimer = null;
    }
  }

  return {
    sync,
    nowMs,
    nowDate,
    getOffsetMs: () => offsetMs,
    startAutoResync,
    stopAutoResync,
  };
})();
