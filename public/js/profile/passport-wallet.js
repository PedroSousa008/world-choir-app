/**
 * PassportWallet — Apple Wallet / Google Wallet integration surface
 * Pass signing happens on the backend; this client only requests and opens passes.
 */
const PassportWallet = (() => {
  const LOADING_MESSAGE = 'Preparing your Passport…';
  const ERROR_MESSAGE = 'We couldn’t prepare your Apple Wallet Passport. Please try again.';

  function platform() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'apple';
    if (/Android/i.test(ua)) return 'google';
    return 'unsupported';
  }

  function isApple() {
    return platform() === 'apple';
  }

  function isSupported() {
    return platform() !== 'unsupported';
  }

  function canAddAppleWalletPasses() {
    return isApple();
  }

  /**
   * Request a signed pass from the backend when available.
   * POST /api/passport-wallet { deviceId, platform, delivery? }
   */
  async function requestPass({ deviceId, platform: platformName, delivery = 'url' } = {}) {
    const res = await fetch('/api/passport-wallet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: delivery === 'direct'
          ? 'application/vnd.apple.pkpass, application/json'
          : 'application/json',
      },
      body: JSON.stringify({ deviceId, platform: platformName, delivery }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/vnd.apple.pkpass')) {
      const blob = await res.blob();
      return { ok: true, blob, direct: true };
    }

    let data = {};
    try {
      data = await res.json();
    } catch {
      const err = new Error('Wallet service is temporarily unavailable. Please try again.');
      err.code = res.status || 'network';
      throw err;
    }

    if (!res.ok) {
      const err = new Error(data.error || `Wallet request failed (${res.status})`);
      err.code = data.code || res.status;
      throw err;
    }
    return data;
  }

  function openPkpassBlob(blob) {
    const url = URL.createObjectURL(blob);
    // iOS Safari opens Wallet most reliably via navigation, not window.open.
    window.location.assign(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { ok: true };
  }

  async function openPassUrl(passUrl) {
    if (!passUrl) throw new Error('Apple Wallet pass is not ready yet.');
    window.location.href = passUrl;
    return { ok: true };
  }

  async function addPassportToAppleWallet(passportData, { onStatus } = {}) {
    if (!canAddAppleWalletPasses()) {
      const err = new Error('Add to Apple Wallet is available on iPhone and iPad.');
      err.code = 'unsupported';
      throw err;
    }

    onStatus?.(LOADING_MESSAGE);
    const deviceId = WorldChoirDB.getDeviceId();

    // Prefer signed download URL on iOS — Safari handles .pkpass MIME type reliably.
    try {
      const result = await requestPass({ deviceId, platform: 'apple', delivery: 'url' });
      if (result?.passUrl) {
        return openPassUrl(result.passUrl);
      }
      if (result?.blob) {
        return openPkpassBlob(result.blob);
      }
    } catch (err) {
      if (err?.code === 'WALLET_NOT_CONFIGURED' || err?.code === 503) {
        throw err;
      }
      // Fall back to direct delivery if URL flow failed for another reason.
    }

    const direct = await requestPass({ deviceId, platform: 'apple', delivery: 'direct' });
    if (direct?.blob) {
      return openPkpassBlob(direct.blob);
    }
    throw new Error('Apple Wallet pass is not ready yet.');
  }

  async function addPassportToGoogleWallet(passportData, { onStatus } = {}) {
    onStatus?.(LOADING_MESSAGE);
    const deviceId = WorldChoirDB.getDeviceId();
    const result = await requestPass({ deviceId, platform: 'google' });
    if (result?.saveUrl) {
      window.location.href = result.saveUrl;
      return { ok: true };
    }
    throw new Error('Google Wallet pass is not ready yet.');
  }

  async function addToWallet(passportData, opts = {}) {
    const kind = platform();
    if (kind === 'apple') return addPassportToAppleWallet(passportData, opts);
    if (kind === 'google') return addPassportToGoogleWallet(passportData, opts);
    const err = new Error('Add to Wallet is available on iPhone and Android.');
    err.code = 'unsupported';
    throw err;
  }

  return {
    platform,
    isApple,
    isSupported,
    canAddAppleWalletPasses,
    addToWallet,
    addPassportToAppleWallet,
    addPassportToGoogleWallet,
    LOADING_MESSAGE,
    ERROR_MESSAGE,
  };
})();
