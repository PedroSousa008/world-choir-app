/**
 * Sponsor analytics — self-contained HTML report export for Owner.
 */
const fs = require('fs').promises;
const path = require('path');
const { readPrivateBinary } = require('./store');

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(value) {
  return String(value || 'sponsor')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'sponsor';
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatPct(value) {
  const n = Number(value || 0);
  return `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`;
}

function formatMoney(value, currency = 'EUR') {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency || 'EUR'} ${n.toLocaleString()}`;
  }
}

function formatDisplayDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function formatDisplayDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC';
  } catch {
    return '—';
  }
}

function formatComparison(pct, periodLabel) {
  const n = Number(pct || 0);
  const arrow = n > 0 ? '↑' : n < 0 ? '↓' : '—';
  return `${arrow} ${Math.abs(n).toFixed(0)}% vs ${periodLabel || 'previous period'}`;
}

function mimeFromExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.gif': 'image/gif',
  }[ext] || 'application/octet-stream';
}

async function bufferToDataUri(buffer, contentType) {
  return `data:${contentType || 'application/octet-stream'};base64,${buffer.toString('base64')}`;
}

async function readPublicAsset(relativePath) {
  const clean = String(relativePath || '').replace(/^\/+/, '');
  const filePath = path.join(process.cwd(), 'public', clean);
  const buffer = await fs.readFile(filePath);
  return bufferToDataUri(buffer, mimeFromExt(filePath));
}

async function resolveImageDataUri(source, origin) {
  const raw = String(source || '').trim();
  if (!raw) return null;

  try {
    if (raw.startsWith('/api/media?')) {
      const url = new URL(raw, origin || 'https://world-choir-app.vercel.app');
      const blobPath = url.searchParams.get('path');
      if (!blobPath) return null;
      const { buffer, contentType } = await readPrivateBinary(blobPath);
      return bufferToDataUri(buffer, contentType);
    }

    if (raw.startsWith('/') || raw.startsWith('images/')) {
      return readPublicAsset(raw.startsWith('/') ? raw.slice(1) : raw);
    }

    if (/^https?:\/\//i.test(raw)) {
      const response = await fetch(raw);
      if (!response.ok) return raw;
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || mimeFromExt(raw);
      return bufferToDataUri(buffer, contentType);
    }
  } catch {
    return null;
  }

  return null;
}

function renderTable(headers, rows, emptyMessage) {
  if (!rows.length) {
    return `<p class="empty">${esc(emptyMessage)}</p>`;
  }
  return `
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderMetricCards(summary, comparison, periodLabel) {
  const cards = [
    ['Total Impressions', formatCount(summary.impressions), formatComparison(comparison.impressions, periodLabel)],
    ['Unique Reach', formatCount(summary.uniqueReach), formatComparison(comparison.uniqueReach, periodLabel)],
    ['Website Clicks', formatCount(summary.websiteClicks), formatComparison(comparison.websiteClicks, periodLabel)],
    ['Unique Clickers', formatCount(summary.uniqueClickers), formatComparison(comparison.uniqueClickers, periodLabel)],
    ['CTR (Unique)', formatPct(summary.ctrUnique), formatComparison(comparison.ctrUnique, periodLabel)],
    ['Days Active', formatCount(summary.daysActive), '—'],
  ];

  return `
    <div class="metrics">
      ${cards.map(([label, value, delta]) => `
        <div class="metric">
          <span class="metric__label">${esc(label)}</span>
          <span class="metric__value">${esc(value)}</span>
          <span class="metric__delta">${esc(delta)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderHighlights(highlights) {
  const h = highlights || {};
  const rows = [
    ['Top Day', h.bestImpressionDay?.date
      ? `${formatDisplayDate(h.bestImpressionDay.date)} · ${formatCount(h.bestImpressionDay.impressions)} impressions`
      : '—'],
    ['Top Country', h.topCountry?.country || '—'],
    ['Top Event', h.bestEvent?.eventName || '—'],
    ['Most Clicks Day', h.mostClicksDay?.date
      ? `${formatDisplayDate(h.mostClicksDay.date)} · ${formatCount(h.mostClicksDay.clicks)} clicks`
      : '—'],
    ['CTR (Best Day)', h.highestCtrDay?.ctr > 0 ? formatPct(h.highestCtrDay.ctr) : '—'],
  ];

  return `
    <dl class="kv">
      ${rows.map(([label, value]) => `
        <div class="kv__row">
          <dt>${esc(label)}</dt>
          <dd>${esc(value)}</dd>
        </div>
      `).join('')}
    </dl>
  `;
}

function renderCommercial(commercial) {
  const c = commercial || {};
  const rows = [
    ['Estimated Media Value', '—'],
    ['Engagement Value', '—'],
    ['Total Events Supported', c.eventsSupported > 0 ? formatCount(c.eventsSupported) : '—'],
    ['Partnership Value', c.hasMonetaryValue ? formatMoney(c.contractValue, c.currency) : '—'],
    ['Impressions Delivered', formatCount(c.impressionsDelivered)],
    ['Clicks Delivered', formatCount(c.clicksDelivered)],
    ['CPM', c.cpm != null ? formatMoney(c.cpm, c.currency) : '—'],
    ['Cost Per Click', c.costPerClick != null ? formatMoney(c.costPerClick, c.currency) : '—'],
  ];

  return `
    <dl class="kv">
      ${rows.map(([label, value]) => `
        <div class="kv__row">
          <dt>${esc(label)}</dt>
          <dd>${esc(value)}</dd>
        </div>
      `).join('')}
    </dl>
  `;
}

async function buildMapSponsorAnalyticsReportHtml(analytics, { origin } = {}) {
  const sponsor = analytics.sponsor || {};
  const summary = analytics.summary || {};
  const comparison = analytics.comparison || {};
  const exportedAt = new Date();
  const exportedAtLabel = exportedAt.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC';

  const [worldChoirLogo, sponsorLogo] = await Promise.all([
    resolveImageDataUri('/images/world-choir-logo.png', origin),
    resolveImageDataUri(sponsor.companyLogoUrl, origin),
  ]);

  const website = String(sponsor.companyWebsiteUrl || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '') || '—';
  const partnershipSince = sponsor.activatedAt || sponsor.createdAt;
  const periodLabel = comparison.periodLabel || 'previous period';
  const rangeLabel = analytics.range?.label || 'Custom';
  const rangeFrom = formatDisplayDate(analytics.range?.from);
  const rangeTo = formatDisplayDate(analytics.range?.to);

  const timeSeriesRows = (analytics.timeSeries || []).map((point) => [
    esc(formatDisplayDate(point.date)),
    esc(formatCount(point.impressions)),
    esc(formatCount(point.uniqueReach)),
    esc(formatCount(point.clicks)),
    esc(formatPct(point.ctr)),
  ]);

  const countryRows = (analytics.countries || []).map((row) => [
    esc(row.country),
    esc(formatCount(row.impressions)),
    esc(formatCount(row.clicks)),
    esc(formatPct(row.ctr)),
  ]);

  const clickLocationRows = (analytics.clickLocations || []).map((row) => [
    esc(row.city || '—'),
    esc(row.country || '—'),
    esc(formatCount(row.clicks)),
    esc(`${Number(row.latitude).toFixed(4)}, ${Number(row.longitude).toFixed(4)}`),
  ]);

  const eventRows = (analytics.events || []).map((row) => [
    esc(row.eventName),
    esc(row.eventDate ? formatDisplayDate(row.eventDate.slice(0, 10)) : '—'),
    esc(formatCount(row.impressions)),
    esc(formatCount(row.uniqueReach)),
    esc(formatCount(row.websiteClicks)),
    esc(formatCount(row.uniqueClickers)),
    esc(formatPct(row.ctr)),
    esc(formatCount(row.countriesReached)),
  ]);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(sponsor.companyName)} — Sponsor Analytics Report</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #111318;
      --muted: #5d6473;
      --line: #d9dde5;
      --panel: #f7f8fa;
      --accent: #0b7ea4;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: var(--ink);
      background: #fff;
      line-height: 1.5;
    }
    .page {
      max-width: 920px;
      margin: 0 auto;
      padding: 40px 32px 56px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding-bottom: 24px;
      border-bottom: 2px solid var(--line);
      margin-bottom: 28px;
    }
    .header__logos {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .header__logo {
      height: 52px;
      width: auto;
      max-width: 180px;
      object-fit: contain;
    }
    .header__logo--placeholder {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 120px;
      height: 52px;
      padding: 0 16px;
      border: 1px dashed var(--line);
      color: var(--muted);
      font-size: 0.82rem;
    }
    .header__meta {
      text-align: right;
      font-size: 0.84rem;
      color: var(--muted);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 1.9rem;
      letter-spacing: -0.02em;
    }
    .subtitle {
      margin: 0 0 24px;
      color: var(--muted);
      font-size: 0.95rem;
    }
    .hero {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: start;
      padding: 18px 20px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      margin-bottom: 28px;
    }
    .hero h2 {
      margin: 0 0 6px;
      font-size: 1.35rem;
    }
    .hero p { margin: 4px 0; color: var(--muted); font-size: 0.92rem; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
      background: ${sponsor.isActive ? '#e8f8ee' : '#f2f2f4'};
      color: ${sponsor.isActive ? '#1f7a43' : '#666'};
    }
    .section {
      margin-bottom: 28px;
      page-break-inside: avoid;
    }
    .section h3 {
      margin: 0 0 12px;
      font-size: 1rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 14px 16px;
      background: #fff;
    }
    .metric__label {
      display: block;
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .metric__value {
      display: block;
      font-size: 1.45rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .metric__delta {
      display: block;
      margin-top: 6px;
      font-size: 0.78rem;
      color: var(--muted);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }
    th, td {
      border: 1px solid var(--line);
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: var(--panel);
      font-size: 0.76rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .kv { margin: 0; }
    .kv__row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 0;
      border-bottom: 1px solid var(--line);
    }
    .kv__row:last-child { border-bottom: 0; }
    .kv__row dt {
      margin: 0;
      color: var(--muted);
      font-size: 0.88rem;
    }
    .kv__row dd {
      margin: 0;
      font-size: 0.9rem;
      text-align: right;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .empty {
      margin: 0;
      padding: 16px;
      border: 1px dashed var(--line);
      border-radius: 10px;
      color: var(--muted);
      background: var(--panel);
      font-size: 0.9rem;
    }
    .footer {
      margin-top: 36px;
      padding-top: 18px;
      border-top: 1px solid var(--line);
      font-size: 0.82rem;
      color: var(--muted);
    }
    @media print {
      .page { padding: 24px; }
      .section { page-break-inside: avoid; }
    }
    @media (max-width: 720px) {
      .header, .hero, .grid-2, .metrics { grid-template-columns: 1fr; display: grid; }
      .header__meta { text-align: left; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div class="header__logos">
        ${worldChoirLogo
    ? `<img class="header__logo" src="${worldChoirLogo}" alt="World Choir">`
    : '<span class="header__logo--placeholder">World Choir</span>'}
        <span aria-hidden="true">×</span>
        ${sponsorLogo
    ? `<img class="header__logo" src="${sponsorLogo}" alt="${esc(sponsor.companyName)}">`
    : `<span class="header__logo--placeholder">${esc(sponsor.companyName)}</span>`}
      </div>
      <div class="header__meta">
        <div><strong>Exported</strong></div>
        <div>${esc(exportedAtLabel)}</div>
      </div>
    </header>

    <h1>Sponsor Analytics Report</h1>
    <p class="subtitle">Performance data for ${esc(sponsor.companyName)} on the World Choir public sponsor bar.</p>

    <section class="hero">
      <div>
        <h2>${esc(sponsor.companyName)}</h2>
        <p><strong>Website:</strong> ${esc(website)}</p>
        <p><strong>Country:</strong> ${esc(sponsor.country || '—')}</p>
        <p><strong>Partnership since:</strong> ${esc(formatDisplayDate(partnershipSince?.slice?.(0, 10) || partnershipSince))}</p>
        <p><strong>Contract end:</strong> ${esc(formatDisplayDate(sponsor.contractEndDate))}</p>
        <p><strong>Sponsor tier:</strong> ${esc(sponsor.agreementTypeLabel || '—')}</p>
      </div>
      <div>
        <span class="badge">${sponsor.isActive ? 'Active' : 'Inactive'}</span>
      </div>
    </section>

    <section class="section">
      <h3>Report Period</h3>
      <dl class="kv">
        <div class="kv__row"><dt>Range</dt><dd>${esc(rangeLabel)}</dd></div>
        <div class="kv__row"><dt>Dates</dt><dd>${esc(rangeFrom)} – ${esc(rangeTo)}</dd></div>
        <div class="kv__row"><dt>Data status</dt><dd>${esc(analytics.dataStatus || '—')}</dd></div>
        <div class="kv__row"><dt>Last updated</dt><dd>${esc(formatDisplayDateTime(analytics.lastUpdated))}</dd></div>
        <div class="kv__row"><dt>Countries reached</dt><dd>${esc(formatCount(analytics.countriesReached))}</dd></div>
      </dl>
    </section>

    <section class="section">
      <h3>Performance Summary</h3>
      ${renderMetricCards(summary, comparison, periodLabel)}
    </section>

    <section class="section">
      <h3>Performance Over Time</h3>
      ${renderTable(
    ['Date', 'Impressions', 'Unique Reach', 'Website Clicks', 'CTR'],
    timeSeriesRows,
    'No performance data recorded for this date range.'
  )}
    </section>

    <section class="section">
      <h3>Global Reach — Countries</h3>
      ${renderTable(
    ['Country', 'Impressions', 'Clicks', 'CTR'],
    countryRows,
    'No geographic data recorded for this date range.'
  )}
    </section>

    <section class="section">
      <h3>Global Reach — Click-through Locations</h3>
      ${renderTable(
    ['City', 'Country', 'Clicks', 'Coordinates'],
    clickLocationRows,
    'No click-through locations recorded for this date range.'
  )}
    </section>

    <section class="section">
      <h3>World Choir Event Performance</h3>
      ${renderTable(
    ['Event', 'Date', 'Impressions', 'Unique Reach', 'Clicks', 'Unique Clickers', 'CTR', 'Countries'],
    eventRows,
    'No event performance recorded for this date range.'
  )}
    </section>

    <div class="grid-2">
      <section class="section">
        <h3>Performance Highlights</h3>
        ${analytics.highlights ? renderHighlights(analytics.highlights) : '<p class="empty">No highlights available for this date range.</p>'}
      </section>
      <section class="section">
        <h3>Commercial Performance</h3>
        ${renderCommercial(analytics.commercial)}
      </section>
    </div>

    <section class="section">
      <h3>Data Sources</h3>
      <dl class="kv">
        <div class="kv__row"><dt>Public Sponsor Bar</dt><dd>Logo impressions on the World Choir map</dd></div>
        <div class="kv__row"><dt>Website Tracking</dt><dd>Clicks through to sponsor website</dd></div>
        <div class="kv__row"><dt>Event Participation</dt><dd>Performance tied to World Choir events</dd></div>
        <div class="kv__row"><dt>Pass the World</dt><dd>Included when applicable</dd></div>
      </dl>
    </section>

    <footer class="footer">
      <p><strong>World Choir</strong> — Owner Control Center</p>
      <p>This report was generated on ${esc(exportedAtLabel)} for ${esc(sponsor.companyName)}. All metrics reflect real recorded activity only.</p>
    </footer>
  </div>
</body>
</html>`;
}

function buildMapSponsorAnalyticsExportFilename(analytics) {
  const company = slugify(analytics?.sponsor?.companyName);
  const date = new Date().toISOString().slice(0, 10);
  return `world-choir-sponsor-analytics-${company}-${date}.html`;
}

module.exports = {
  buildMapSponsorAnalyticsReportHtml,
  buildMapSponsorAnalyticsExportFilename,
  resolveImageDataUri,
};
