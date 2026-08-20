/**
 * PassportWallet — Apple Wallet / Google Wallet integration surface
 * Pass signing happens on the backend; this client only requests and opens passes.
 */
const PassportWallet = (() => {
  function platform() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'apple';
    if (/Android/i.test(ua)) return 'google';
    return 'unsupported';
  }

  function isSupported() {
    return platform() !== 'unsupported';
  }

  /**
   * Request a signed pass from the backend when available.
   * Endpoints (to be wired):
   *   POST /api/passport-wallet  { deviceId, platform: 'apple' | 'google' }
   */
  async function requestPass({ deviceId, platform: platformName }) {
    const res = await fetch('/api/passport-wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, platform: platformName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Wallet request failed (${res.status})`);
      err.code = data.code || res.status;
      throw err;
    }
    return data;
  }

  async function addPassportToAppleWallet(passportData) {
    const deviceId = WorldChoirDB.getDeviceId();
    const result = await requestPass({ deviceId, platform: 'apple' });
    if (result?.passUrl) {
      window.location.href = result.passUrl;
      return { ok: true };
    }
    throw new Error('Apple Wallet pass is not ready yet.');
  }

  async function addPassportToGoogleWallet(passportData) {
    const deviceId = WorldChoirDB.getDeviceId();
    const result = await requestPass({ deviceId, platform: 'google' });
    if (result?.saveUrl) {
      window.location.href = result.saveUrl;
      return { ok: true };
    }
    throw new Error('Google Wallet pass is not ready yet.');
  }

  async function addToWallet(passportData) {
    const kind = platform();
    if (kind === 'apple') return addPassportToAppleWallet(passportData);
    if (kind === 'google') return addPassportToGoogleWallet(passportData);
    const err = new Error('Add to Wallet is available on iPhone and Android.');
    err.code = 'unsupported';
    throw err;
  }

  return {
    platform,
    isSupported,
    addToWallet,
    addPassportToAppleWallet,
    addPassportToGoogleWallet,
  };
})();
