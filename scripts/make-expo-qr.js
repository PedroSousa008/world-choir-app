#!/usr/bin/env node
/**
 * Generate Expo Go QR codes (LAN + tunnel) and a scannable HTML page.
 */
const QR = require('qrcode');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const settingsPath = path.join(root, '.expo', 'settings.json');

function getTunnelUrl() {
  let randomness = 'F5Eg4EU';
  try {
    randomness = JSON.parse(fs.readFileSync(settingsPath, 'utf8')).urlRandomness || randomness;
  } catch {
    /* keep default */
  }
  const host = String(randomness).toLowerCase();
  return `exp://${host}-pedrosousa10-8081.exp.direct`;
}

function getLanUrl() {
  // Prefer env override; otherwise common en0 address is discovered by the shell caller.
  return process.env.WC_EXPO_LAN_URL || 'exp://192.168.1.76:8081';
}

async function writeQr(file, text) {
  await QR.toFile(file, text, {
    type: 'png',
    width: 720,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}

async function main() {
  const tunnel = getTunnelUrl();
  const lan = getLanUrl();
  const tunnelHttps = `https://expo.dev/go?url=${encodeURIComponent(tunnel)}`;
  const lanHttps = `https://expo.dev/go?url=${encodeURIComponent(lan)}`;

  const tunnelPng = path.join(root, 'assets', 'expo-go-qr.png');
  const lanPng = path.join(root, 'assets', 'expo-go-qr-lan.png');
  const camPng = path.join(root, 'assets', 'expo-go-qr-camera.png');

  await writeQr(tunnelPng, tunnel);
  await writeQr(lanPng, lan);
  await writeQr(camPng, tunnelHttps);

  fs.writeFileSync(path.join(root, 'assets', 'expo-go-qr-url.txt'), `${tunnel}\n`);

  const tunB64 = fs.readFileSync(tunnelPng).toString('base64');
  const lanB64 = fs.readFileSync(lanPng).toString('base64');
  const camB64 = fs.readFileSync(camPng).toString('base64');

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>World Choir — Expo Go QR</title>
<style>
  html,body{margin:0;background:#111;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
  main{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:24px;padding:28px;box-sizing:border-box}
  h1{margin:8px 0 0;font-size:1.35rem}
  .card{background:#fff;color:#111;border-radius:16px;padding:18px;display:flex;flex-direction:column;align-items:center;gap:10px;width:min(92vw,420px)}
  .card h2{margin:0;font-size:1rem}
  .card p{margin:0;font-size:.78rem;word-break:break-all;text-align:center;color:#444}
  img{width:min(78vw,360px);height:auto;image-rendering:pixelated}
  .hint{max-width:28rem;text-align:center;color:#bbb;font-size:.9rem;line-height:1.45}
</style></head><body><main>
  <h1>Scan with Expo Go</h1>
  <p class="hint">Use the same Wi‑Fi as this Mac, then scan <strong>LAN</strong> first.<br>In Expo Go: tap <strong>Scan QR code</strong> (more reliable than the Camera app).</p>
  <div class="card">
    <h2>1) LAN (same Wi‑Fi) — try this first</h2>
    <img src="data:image/png;base64,${lanB64}" alt="LAN Expo QR" width="360" height="360">
    <p>${lan}</p>
  </div>
  <div class="card">
    <h2>2) Tunnel</h2>
    <img src="data:image/png;base64,${tunB64}" alt="Tunnel Expo QR" width="360" height="360">
    <p>${tunnel}</p>
  </div>
  <div class="card">
    <h2>3) Camera-friendly Expo link</h2>
    <img src="data:image/png;base64,${camB64}" alt="Camera Expo QR" width="360" height="360">
    <p>${tunnelHttps}</p>
  </div>
</main></body></html>`;

  fs.writeFileSync(path.join(root, 'public', 'expo-go-qr.html'), html);
  console.log(JSON.stringify({ tunnel, lan, tunnelHttps, lanHttps }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
