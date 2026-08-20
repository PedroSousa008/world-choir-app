/**
 * PassportWalletService — Apple Wallet / Google Wallet integration layer.
 * UI is ready; signed pass generation connects when backend credentials exist.
 */
const PassportWalletService = (() => {
  function detectPlatform() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'unsupported';
  }

  function isSupported() {
    return detectPlatform() !== 'unsupported';
  }

  /**
   * Request a signed wallet pass from the backend.
   * Expected future endpoints:
   *   POST /api/passport-wallet  { deviceId, platform: 'apple' | 'google' }
   * Apple → .pkpass download / add
   * Google → save URL / JWT
   */
  async function requestSignedPass(platform) {
    const deviceId = WorldChoirDB.getDeviceId();
    const res = await fetch('/api/passport-wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        platform: platform === 'ios' ? 'apple' : 'google',
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Wallet pass unavailable');
      err.code = data.code || res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function addPassportToAppleWallet() {
    const data = await requestSignedPass('ios');
    if (data.pkpassUrl) {
      window.location.href = data.pkpassUrl;
      return { ok: true };
    }
    throw new Error('Apple Wallet pass URL missing');
  }

  async function addPassportToGoogleWallet() {
    const data = await requestSignedPass('android');
    if (data.saveUrl) {
      window.location.href = data.saveUrl;
      return { ok: true };
    }
    throw new Error('Google Wallet save URL missing');
  }

  async function addPassportToWallet() {
    const platform = detectPlatform();
    if (platform === 'ios') return addPassportToAppleWallet();
    if (platform === 'android') return addPassportToGoogleWallet();
    const err = new Error('Wallet is available on iPhone and Android devices.');
    err.code = 'unsupported';
    throw err;
  }

  return {
    detectPlatform,
    isSupported,
    addPassportToWallet,
    addPassportToAppleWallet,
    addPassportToGoogleWallet,
  };
})();
