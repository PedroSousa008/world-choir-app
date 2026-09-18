/**
 * Foundation Donation Analytics — aggregate, privacy-safe, Foundation-scoped.
 * Never invents numbers. Verified donations only.
 */
const { listAllPledges } = require('./store');
const {
  findInfluencerById,
  readDonationsLedger,
  PLATFORM_FEE_PERCENT,
} = require('./members-store');
const { readWorkspace, publicProject } = require('./foundation-workspace');

const SUCCESS_STATUSES = new Set(['succeeded', 'completed', 'paid']);
const EXCLUDED_STATUSES = new Set([
  'failed', 'cancelled', 'canceled', 'refunded', 'reversed',
  'fraudulent', 'pending', 'completed_mock', 'mock',
]);

const VALUE_RANGES = [
  { id: '1-10', label: '€1–€10', min: 1, max: 10 },
  { id: '11-25', label: '€11–€25', min: 11, max: 25 },
  { id: '26-50', label: '€26–€50', min: 26, max: 50 },
  { id: '51-100', label: '€51–€100', min: 51, max: 100 },
  { id: '100+', label: '€100+', min: 100.01, max: Infinity },
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isSuccessfulDonation(d) {
  if (!d || d.mock === true) return false;
  const status = String(d.paymentStatus || '').toLowerCase();
  if (EXCLUDED_STATUSES.has(status)) return false;
  return SUCCESS_STATUSES.has(status);
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function donationDate(d) {
  return parseDate(d.date || d.createdAt || d.created_at);
}

function donorKey(d) {
  return d.donorId || d.deviceId || d.userId || d.emailHash || d.id || null;
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function donationAmount(d) {
  const amount = Number(d.amount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function feeFromDonation(d) {
  const recorded = Number(d.platform_fee ?? d.platformFee);
  if (Number.isFinite(recorded) && recorded >= 0) return roundMoney(recorded);
  const grossCents = Math.round(donationAmount(d) * 100);
  return roundMoney(Math.round(grossCents * (PLATFORM_FEE_PERCENT / 100)) / 100);
}

function netFromDonation(d) {
  const recorded = Number(d.foundation_amount ?? d.foundationAmount);
  if (Number.isFinite(recorded) && recorded >= 0) return roundMoney(recorded);
  return roundMoney(donationAmount(d) - feeFromDonation(d));
}

function sumAmounts(donations) {
  return roundMoney(donations.reduce((sum, d) => sum + donationAmount(d), 0));
}

function sumFees(donations) {
  return roundMoney(donations.reduce((sum, d) => sum + feeFromDonation(d), 0));
}

function sumNet(donations) {
  return roundMoney(donations.reduce((sum, d) => sum + netFromDonation(d), 0));
}

function uniqueDonors(donations) {
  const set = new Set();
  donations.forEach((d) => {
    const key = donorKey(d);
    if (key) set.add(String(key));
  });
  return set.size;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pct(part, whole) {
  if (!whole || !Number.isFinite(part) || !Number.isFinite(whole)) return null;
  return Math.round((part / whole) * 1000) / 10;
}

function pctChange(current, previous) {
  if (previous == null || previous === 0) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function startOfUtcDay(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function parseCustomBound(value, endOfDay) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, day] = raw.split('-').map(Number);
    if (endOfDay) return Date.UTC(y, m - 1, day, 23, 59, 59, 999);
    return Date.UTC(y, m - 1, day, 0, 0, 0, 0);
  }
  const d = parseDate(raw);
  return d ? d.getTime() : null;
}

function resolveBounds(rangeKey, customFrom, customTo) {
  const now = Date.now();
  const key = String(rangeKey || 'all');

  if (key === 'custom') {
    const from = parseCustomBound(customFrom, false);
    const to = parseCustomBound(customTo, true) ?? now;
    if (from == null || to == null || from > to) {
      return { from: null, to: null, label: 'All time', key: 'all', comparable: false };
    }
    return { from, to, label: 'Custom range', key: 'custom', comparable: true };
  }

  if (key === '7d') {
    return { from: now - 7 * 86400000, to: now, label: 'Last 7 days', key: '7d', comparable: true };
  }
  if (key === '30d') {
    return { from: now - 30 * 86400000, to: now, label: 'Last 30 days', key: '30d', comparable: true };
  }
  if (key === '90d') {
    return { from: now - 90 * 86400000, to: now, label: 'Last 90 days', key: '90d', comparable: true };
  }
  if (key === '1y' || key === 'year') {
    const d = new Date();
    const from = Date.UTC(d.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
    return { from, to: now, label: 'This year', key: '1y', comparable: true };
  }
  return { from: null, to: null, label: 'All time', key: 'all', comparable: false };
}

function previousBounds(bounds) {
  if (!bounds.comparable || bounds.from == null || bounds.to == null) return null;
  if (bounds.key === '1y') {
    const start = new Date(bounds.from);
    const year = start.getUTCFullYear() - 1;
    const from = Date.UTC(year, 0, 1, 0, 0, 0, 0);
    const elapsed = bounds.to - bounds.from;
    return { from, to: from + elapsed };
  }
  const span = bounds.to - bounds.from;
  return { from: bounds.from - span, to: bounds.from };
}

function inBounds(date, from, to) {
  if (!date) return false;
  const t = date.getTime();
  if (from != null && t < from) return false;
  if (to != null && t > to) return false;
  return true;
}

function filterByBounds(donations, from, to) {
  if (from == null && to == null) return donations.slice();
  return donations.filter((d) => inBounds(donationDate(d), from, to));
}

function moneyMetrics(donations) {
  const amounts = donations.map(donationAmount).filter((n) => n > 0);
  const gross = sumAmounts(donations);
  const fee = sumFees(donations);
  const net = sumNet(donations);
  const count = donations.length;
  return {
    grossRaised: gross,
    netToFoundation: net,
    worldChoirFee: fee,
    donations: count,
    averageDonation: average(amounts) != null ? roundMoney(average(amounts)) : null,
    medianDonation: median(amounts) != null ? roundMoney(median(amounts)) : null,
  };
}

function buildFirstDonationIndex(allDonations) {
  const first = new Map();
  allDonations.forEach((d) => {
    const key = donorKey(d);
    if (!key) return;
    const dt = donationDate(d);
    if (!dt) return;
    const id = String(key);
    const prev = first.get(id);
    if (!prev || dt.getTime() < prev.getTime()) first.set(id, dt);
  });
  return first;
}

function buildDonorSplit(periodDonations, allDonations, bounds) {
  const firstIndex = buildFirstDonationIndex(allDonations);
  const lifetimeCounts = new Map();
  allDonations.forEach((d) => {
    const key = donorKey(d);
    if (!key) return;
    const id = String(key);
    lifetimeCounts.set(id, (lifetimeCounts.get(id) || 0) + 1);
  });

  const newKeys = new Set();
  const returningKeys = new Set();
  let newRevenue = 0;
  let returningRevenue = 0;
  let newDonationCount = 0;
  let returningDonationCount = 0;
  const newAmounts = [];
  const returningAmounts = [];
  const unbounded = bounds.from == null && bounds.to == null;

  periodDonations.forEach((d) => {
    const key = donorKey(d);
    const amount = donationAmount(d);
    if (!key) return;
    const id = String(key);
    let isNew;
    if (unbounded) {
      isNew = (lifetimeCounts.get(id) || 0) <= 1;
    } else {
      const first = firstIndex.get(id);
      isNew = !!first
        && (bounds.from == null || first.getTime() >= bounds.from)
        && (bounds.to == null || first.getTime() <= bounds.to);
    }

    if (isNew) {
      newKeys.add(id);
      newRevenue += amount;
      newDonationCount += 1;
      if (amount > 0) newAmounts.push(amount);
    } else {
      returningKeys.add(id);
      returningRevenue += amount;
      returningDonationCount += 1;
      if (amount > 0) returningAmounts.push(amount);
    }
  });

  const totalDonors = newKeys.size + returningKeys.size;
  const gross = sumAmounts(periodDonations);

  return {
    empty: periodDonations.length === 0,
    newDonors: newKeys.size,
    returningDonors: returningKeys.size,
    newDonorPercent: pct(newKeys.size, totalDonors),
    returningDonorPercent: pct(returningKeys.size, totalDonors),
    revenueFromNew: roundMoney(newRevenue),
    revenueFromReturning: roundMoney(returningRevenue),
    revenueFromNewPercent: pct(newRevenue, gross),
    revenueFromReturningPercent: pct(returningRevenue, gross),
    avgDonationNew: average(newAmounts) != null ? roundMoney(average(newAmounts)) : null,
    avgDonationReturning: average(returningAmounts) != null ? roundMoney(average(returningAmounts)) : null,
    donationsPerReturningDonor: returningKeys.size
      ? Math.round((returningDonationCount / returningKeys.size) * 100) / 100
      : null,
    repeatDonationRate: periodDonations.length
      ? pct(returningDonationCount, periodDonations.length)
      : null,
    returningDonorRevenuePercent: pct(returningRevenue, gross),
  };
}

function buildValueAnalysis(donations) {
  if (!donations.length) {
    return {
      empty: true,
      ranges: VALUE_RANGES.map((r) => ({ ...r, count: 0, percent: null, revenue: 0 })),
      largest: null,
      smallest: null,
      mostCommonRange: null,
      averageDonation: null,
      medianDonation: null,
      insight: 'More donation activity is needed to generate this insight.',
    };
  }

  const amounts = donations.map(donationAmount).filter((n) => n > 0);
  const ranges = VALUE_RANGES.map((r) => {
    const matched = donations.filter((d) => {
      const a = donationAmount(d);
      return a >= r.min && a <= r.max;
    });
    const revenue = sumAmounts(matched);
    return {
      id: r.id,
      label: r.label,
      count: matched.length,
      percent: pct(matched.length, donations.length),
      revenue,
    };
  });

  const topRevenue = ranges
    .filter((r) => r.id === '51-100' || r.id === '100+')
    .reduce((s, r) => s + r.revenue, 0);
  const gross = sumAmounts(donations);
  const topPct = pct(topRevenue, gross);
  const mostCommon = [...ranges].sort((a, b) => b.count - a.count || b.revenue - a.revenue)[0];

  return {
    empty: false,
    ranges,
    largest: amounts.length ? Math.max(...amounts) : null,
    smallest: amounts.length ? Math.min(...amounts) : null,
    mostCommonRange: mostCommon && mostCommon.count > 0 ? mostCommon.label : null,
    averageDonation: average(amounts) != null ? roundMoney(average(amounts)) : null,
    medianDonation: median(amounts) != null ? roundMoney(median(amounts)) : null,
    insight: topPct != null
      ? `Donations above €50 represent ${topPct}% of donation revenue.`
      : 'More donation activity is needed to generate this insight.',
  };
}

function resolveLocation(donation, pledgeIndex) {
  const directCity = donation.city || donation.participationCity || donation.world_choir_city_name;
  const directCountry = donation.country || donation.participationCountry || donation.world_choir_country;
  let city = directCity ? String(directCity).trim() : '';
  let country = directCountry ? String(directCountry).trim() : '';

  if (!city || !country) {
    const keys = [donation.userId, donation.deviceId, donation.donorId, donation.user_id]
      .filter(Boolean)
      .map(String);
    for (const key of keys) {
      const pledge = pledgeIndex.get(key);
      if (!pledge) continue;
      if (!city && pledge.city) city = String(pledge.city).trim();
      if (!country && pledge.country) country = String(pledge.country).trim();
      if (city && country) break;
    }
  }

  if (!city && !country) return null;
  return {
    city: city || 'Unknown city',
    country: country || 'Unknown country',
  };
}

function buildPledgeIndex(pledges) {
  const byUser = new Map();
  pledges.forEach((p) => {
    [p.user_id, p.userId, p.device_id, p.deviceId].filter(Boolean).forEach((id) => {
      byUser.set(String(id), p);
    });
  });
  return byUser;
}

function buildGeography(donations, pledgeIndex) {
  const byCountry = new Map();
  const byCity = new Map();
  let located = 0;
  const gross = sumAmounts(donations);

  donations.forEach((d) => {
    const loc = resolveLocation(d, pledgeIndex);
    if (!loc) return;
    located += 1;
    const amount = donationAmount(d);
    const dk = donorKey(d);

    if (!byCountry.has(loc.country)) {
      byCountry.set(loc.country, {
        country: loc.country,
        raised: 0,
        donations: 0,
        donors: new Set(),
      });
    }
    const c = byCountry.get(loc.country);
    c.raised += amount;
    c.donations += 1;
    if (dk) c.donors.add(String(dk));

    const cityKey = `${loc.city}|${loc.country}`;
    if (!byCity.has(cityKey)) {
      byCity.set(cityKey, {
        city: loc.city,
        country: loc.country,
        raised: 0,
        donations: 0,
        donors: new Set(),
      });
    }
    const city = byCity.get(cityKey);
    city.raised += amount;
    city.donations += 1;
    if (dk) city.donors.add(String(dk));
  });

  const countries = Array.from(byCountry.values())
    .map((row) => ({
      country: row.country,
      raised: roundMoney(row.raised),
      donations: row.donations,
      donors: row.donors.size,
      averageDonation: row.donations ? roundMoney(row.raised / row.donations) : null,
      percentOfTotal: pct(row.raised, gross),
    }))
    .sort((a, b) => b.raised - a.raised || b.donations - a.donations)
    .map((row, i) => ({ ...row, rank: i + 1 }));

  const cities = Array.from(byCity.values())
    .map((row) => ({
      city: row.city,
      country: row.country,
      raised: roundMoney(row.raised),
      donations: row.donations,
      donors: row.donors.size,
      averageDonation: row.donations ? roundMoney(row.raised / row.donations) : null,
      percentOfTotal: pct(row.raised, gross),
    }))
    .sort((a, b) => b.raised - a.raised || b.donations - a.donations)
    .map((row, i) => ({ ...row, rank: i + 1 }));

  return {
    empty: located === 0,
    countries,
    cities,
    locatedDonations: located,
    unlocatedDonations: Math.max(0, donations.length - located),
  };
}

function buildProjects(periodDonations, projects) {
  if (!projects.length) {
    return { empty: true, rows: [], note: 'No project donation data available yet.' };
  }

  const byProject = new Map();
  periodDonations.forEach((d) => {
    const id = d.projectId;
    if (!id) return;
    if (!byProject.has(id)) {
      byProject.set(id, { raised: 0, donations: 0, donors: new Set() });
    }
    const row = byProject.get(id);
    row.raised += donationAmount(d);
    row.donations += 1;
    const dk = donorKey(d);
    if (dk) row.donors.add(String(dk));
  });

  const rows = projects
    .map((p) => {
      const stats = byProject.get(p.id) || { raised: 0, donations: 0, donors: new Set() };
      const raised = roundMoney(stats.raised);
      const goal = p.fundingGoal != null && Number(p.fundingGoal) > 0 ? Number(p.fundingGoal) : null;
      return {
        id: p.id,
        name: p.title || 'Untitled project',
        raised,
        donors: stats.donors.size,
        donations: stats.donations,
        averageDonation: stats.donations ? roundMoney(raised / stats.donations) : null,
        goal,
        goalProgressPercent: goal ? Math.min(100, Math.round((raised / goal) * 1000) / 10) : null,
        hasGoal: goal != null,
      };
    })
    .sort((a, b) => b.raised - a.raised || a.name.localeCompare(b.name))
    .map((row, i) => ({ ...row, rank: i + 1 }));

  const anyRaised = rows.some((r) => r.raised > 0 || r.donations > 0);
  return {
    empty: !anyRaised,
    rows,
    note: anyRaised ? null : 'No project donation data available yet.',
  };
}

function chooseSeriesGranularity(bounds) {
  if (bounds.from == null || bounds.to == null) return 'month';
  const days = Math.max(1, Math.ceil((bounds.to - bounds.from) / 86400000));
  if (days <= 45) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

function seriesKey(date, granularity) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  if (granularity === 'day') {
    return {
      key: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      label: `${MONTHS[m]} ${d}`,
      sortKey: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    };
  }
  if (granularity === 'week') {
    const dayStart = startOfUtcDay(date.getTime());
    const dow = new Date(dayStart).getUTCDay();
    const weekStart = dayStart - dow * 86400000;
    const ws = new Date(weekStart);
    return {
      key: `w-${ws.toISOString().slice(0, 10)}`,
      label: `${MONTHS[ws.getUTCMonth()]} ${ws.getUTCDate()}`,
      sortKey: ws.toISOString().slice(0, 10),
    };
  }
  return {
    key: `${y}-${String(m + 1).padStart(2, '0')}`,
    label: `${MONTHS[m]} ${y}`,
    sortKey: `${y}-${String(m + 1).padStart(2, '0')}`,
  };
}

function scaffoldBounds(bounds) {
  const now = Date.now();
  let from = bounds.from;
  let to = bounds.to != null ? bounds.to : now;
  if (from == null) {
    const d = new Date(now);
    from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11, 1, 0, 0, 0, 0);
  }
  if (to < from) to = from;
  return { from, to };
}

function buildScaffoldBuckets(bounds, granularity) {
  const { from, to } = scaffoldBounds(bounds);
  const buckets = new Map();
  if (granularity === 'month') {
    const start = new Date(from);
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    const end = new Date(to);
    const endY = end.getUTCFullYear();
    const endM = end.getUTCMonth();
    while (y < endY || (y === endY && m <= endM)) {
      const dt = new Date(Date.UTC(y, m, 1));
      const meta = seriesKey(dt, 'month');
      buckets.set(meta.key, {
        key: meta.key,
        label: meta.label,
        sortKey: meta.sortKey,
        gross: 0,
        net: 0,
        donations: 0,
      });
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return buckets;
  }

  const step = granularity === 'week' ? 7 * 86400000 : 86400000;
  let cursor = granularity === 'week'
    ? (() => {
      const dayStart = startOfUtcDay(from);
      const dow = new Date(dayStart).getUTCDay();
      return dayStart - dow * 86400000;
    })()
    : startOfUtcDay(from);
  const end = to;
  let guard = 0;
  while (cursor <= end && guard < 400) {
    const dt = new Date(cursor);
    const meta = seriesKey(dt, granularity);
    if (!buckets.has(meta.key)) {
      buckets.set(meta.key, {
        key: meta.key,
        label: meta.label,
        sortKey: meta.sortKey,
        gross: 0,
        net: 0,
        donations: 0,
      });
    }
    cursor += step;
    guard += 1;
  }
  return buckets;
}

function buildRevenueSeries(donations, bounds) {
  const granularity = chooseSeriesGranularity(bounds);
  const map = buildScaffoldBuckets(bounds, granularity);

  donations.forEach((d) => {
    const dt = donationDate(d);
    if (!dt) return;
    const { key, label, sortKey } = seriesKey(dt, granularity);
    if (!map.has(key)) {
      map.set(key, {
        key,
        label,
        sortKey,
        gross: 0,
        net: 0,
        donations: 0,
      });
    }
    const row = map.get(key);
    row.gross += donationAmount(d);
    row.net += netFromDonation(d);
    row.donations += 1;
  });

  const points = Array.from(map.values())
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map((row) => ({
      key: row.key,
      label: row.label,
      grossRaised: roundMoney(row.gross),
      netRaised: roundMoney(row.net),
      donations: row.donations,
      averageDonation: row.donations ? roundMoney(row.gross / row.donations) : 0,
    }));

  const hasActivity = points.some((p) => p.donations > 0 || p.grossRaised > 0);
  return {
    empty: !hasActivity,
    granularity,
    points,
  };
}

function buildTiming(donations) {
  if (!donations.length) {
    return {
      empty: true,
      byDay: WEEKDAYS.map((label, i) => ({ key: i, label, donations: 0, revenue: 0 })),
      byHour: Array.from({ length: 24 }, (_, h) => ({
        key: h,
        label: `${String(h).padStart(2, '0')}:00`,
        donations: 0,
        revenue: 0,
      })),
      byMonth: MONTHS.map((label, i) => ({ key: i, label, donations: 0, revenue: 0 })),
      highestDonationDay: null,
      highestRevenueDay: null,
      highestDonationHour: null,
      avgDailyDonations: null,
      avgWeeklyDonations: null,
      avgMonthlyDonations: null,
    };
  }

  const byDay = WEEKDAYS.map((label, i) => ({ key: i, label, donations: 0, revenue: 0 }));
  const byHour = Array.from({ length: 24 }, (_, h) => ({
    key: h,
    label: `${String(h).padStart(2, '0')}:00`,
    donations: 0,
    revenue: 0,
  }));
  const byMonth = MONTHS.map((label, i) => ({ key: i, label, donations: 0, revenue: 0 }));
  const dayKeys = new Set();
  const weekKeys = new Set();
  const monthKeys = new Set();

  donations.forEach((d) => {
    const dt = donationDate(d);
    if (!dt) return;
    const amount = donationAmount(d);
    const dow = dt.getUTCDay();
    const hour = dt.getUTCHours();
    const month = dt.getUTCMonth();
    byDay[dow].donations += 1;
    byDay[dow].revenue += amount;
    byHour[hour].donations += 1;
    byHour[hour].revenue += amount;
    byMonth[month].donations += 1;
    byMonth[month].revenue += amount;

    dayKeys.add(dt.toISOString().slice(0, 10));
    const week = seriesKey(dt, 'week').key;
    weekKeys.add(week);
    monthKeys.add(`${dt.getUTCFullYear()}-${month}`);
  });

  byDay.forEach((r) => { r.revenue = roundMoney(r.revenue); });
  byHour.forEach((r) => { r.revenue = roundMoney(r.revenue); });
  byMonth.forEach((r) => { r.revenue = roundMoney(r.revenue); });

  const highestDonationDay = [...byDay].sort((a, b) => b.donations - a.donations || b.revenue - a.revenue)[0];
  const highestRevenueDay = [...byDay].sort((a, b) => b.revenue - a.revenue || b.donations - a.donations)[0];
  const highestDonationHour = [...byHour].sort((a, b) => b.donations - a.donations || b.revenue - a.revenue)[0];

  return {
    empty: false,
    byDay,
    byHour,
    byMonth,
    highestDonationDay: highestDonationDay?.donations ? highestDonationDay.label : null,
    highestRevenueDay: highestRevenueDay?.revenue ? highestRevenueDay.label : null,
    highestDonationHour: highestDonationHour?.donations ? highestDonationHour.label : null,
    avgDailyDonations: dayKeys.size ? Math.round((donations.length / dayKeys.size) * 100) / 100 : null,
    avgWeeklyDonations: weekKeys.size ? Math.round((donations.length / weekKeys.size) * 100) / 100 : null,
    avgMonthlyDonations: monthKeys.size ? Math.round((donations.length / monthKeys.size) * 100) / 100 : null,
  };
}

function buildMilestones(allDonations, pledgeIndex) {
  if (!allDonations.length) {
    return {
      empty: true,
      achieved: [],
      next: null,
      note: 'Your Foundation’s donation milestones will appear here.',
    };
  }

  const sorted = [...allDonations]
    .map((d) => ({ d, at: donationDate(d) }))
    .filter((x) => x.at)
    .sort((a, b) => a.at - b.at);

  let running = 0;
  let count = 0;
  const donorSeen = new Set();
  let returningAt = null;
  const countries = new Set();
  const achieved = [];
  const mark = (id, label, at) => {
    if (achieved.some((m) => m.id === id)) return;
    achieved.push({ id, label, at: at.toISOString() });
  };

  const moneyMarks = [
    { id: 'raised-1000', label: '€1,000 raised', value: 1000 },
    { id: 'raised-10000', label: '€10,000 raised', value: 10000 },
    { id: 'raised-100000', label: '€100,000 raised', value: 100000 },
  ];
  const countMarks = [
    { id: 'donations-100', label: '100 donations', value: 100 },
    { id: 'donations-1000', label: '1,000 donations', value: 1000 },
  ];
  const countryMarks = [
    { id: 'countries-10', label: '10 countries reached', value: 10 },
    { id: 'countries-25', label: '25 countries reached', value: 25 },
    { id: 'countries-50', label: '50 countries reached', value: 50 },
  ];

  sorted.forEach(({ d, at }, index) => {
    if (index === 0) mark('first-donation', 'First donation', at);
    running = roundMoney(running + donationAmount(d));
    count += 1;
    const dk = donorKey(d);
    if (dk) {
      const id = String(dk);
      if (donorSeen.has(id) && !returningAt) {
        returningAt = at;
        mark('first-returning', 'First returning donor', at);
      }
      donorSeen.add(id);
    }
    const loc = resolveLocation(d, pledgeIndex);
    if (loc?.country) countries.add(loc.country);

    moneyMarks.forEach((m) => {
      if (running >= m.value) mark(m.id, m.label, at);
    });
    countMarks.forEach((m) => {
      if (count >= m.value) mark(m.id, m.label, at);
    });
    countryMarks.forEach((m) => {
      if (countries.size >= m.value) mark(m.id, m.label, at);
    });
  });

  const nextCandidates = [
    ...moneyMarks.map((m) => ({ ...m, current: running, kind: 'money' })),
    ...countMarks.map((m) => ({ ...m, current: count, kind: 'count' })),
    ...countryMarks.map((m) => ({ ...m, current: countries.size, kind: 'count' })),
  ].filter((m) => !achieved.some((a) => a.id === m.id));

  nextCandidates.sort((a, b) => (a.value - a.current) - (b.value - b.current));
  const nextRaw = nextCandidates[0] || null;
  const next = nextRaw
    ? {
      id: nextRaw.id,
      label: nextRaw.label,
      current: nextRaw.current,
      target: nextRaw.value,
      progressPercent: Math.min(100, Math.round((nextRaw.current / nextRaw.value) * 1000) / 10),
    }
    : null;

  return {
    empty: achieved.length === 0,
    achieved: achieved.sort((a, b) => String(a.at).localeCompare(String(b.at))),
    next,
    note: achieved.length ? null : 'Your Foundation’s donation milestones will appear here.',
  };
}

async function buildFoundationDonationAnalytics(foundationId, {
  range = 'all',
  from = null,
  to = null,
  teamMemberId = null,
} = {}) {
  if (!foundationId) return { ok: false, error: 'Foundation id required' };

  const [influencer, ledger, pledges, workspace] = await Promise.all([
    findInfluencerById(foundationId),
    readDonationsLedger(),
    listAllPledges().catch(() => []),
    readWorkspace(foundationId),
  ]);

  if (!influencer || influencer.active === false) {
    return { ok: false, error: 'Foundation not found' };
  }

  let teamPermissions = null;
  if (teamMemberId) {
    const member = (workspace.team || []).find((t) => t.id === teamMemberId);
    if (member) {
      const { defaultTeamPermissions } = require('./foundation-workspace');
      teamPermissions = { ...defaultTeamPermissions(), ...(member.permissions || {}) };
    }
  }
  const isOwner = !teamMemberId;
  const canViewAmounts = isOwner || (teamPermissions?.viewDonationAmounts !== false);
  const canViewDetails = isOwner || (teamPermissions?.viewDonationDetails !== false);
  const canViewSupporters = isOwner || (teamPermissions?.viewSupporterInfo !== false);

  if (!canViewAmounts && !canViewDetails && !canViewSupporters) {
    return {
      ok: true,
      restricted: true,
      note: 'Donation analytics access is restricted by the Foundation owner.',
    };
  }

  const allDonations = ledger
    .filter((d) => d.foundationId === foundationId && isSuccessfulDonation(d))
    .sort((a, b) => {
      const da = donationDate(a)?.getTime() || 0;
      const db = donationDate(b)?.getTime() || 0;
      return da - db;
    });

  const bounds = resolveBounds(range, from, to);
  const period = filterByBounds(allDonations, bounds.from, bounds.to);
  const prev = previousBounds(bounds);
  const previousPeriod = prev ? filterByBounds(allDonations, prev.from, prev.to) : [];

  const currentMetrics = moneyMetrics(period);
  const previousMetrics = prev ? moneyMetrics(previousPeriod) : null;
  const comparison = {
    available: !!(prev && previousPeriod.length),
    reason: prev
      ? (previousPeriod.length ? null : 'Not enough historical data.')
      : 'Comparisons are not available for All time.',
    grossRaised: previousMetrics ? pctChange(currentMetrics.grossRaised, previousMetrics.grossRaised) : null,
    netToFoundation: previousMetrics ? pctChange(currentMetrics.netToFoundation, previousMetrics.netToFoundation) : null,
    donations: previousMetrics ? pctChange(currentMetrics.donations, previousMetrics.donations) : null,
    averageDonation: previousMetrics && previousMetrics.averageDonation != null && currentMetrics.averageDonation != null
      ? pctChange(currentMetrics.averageDonation, previousMetrics.averageDonation)
      : null,
    medianDonation: previousMetrics && previousMetrics.medianDonation != null && currentMetrics.medianDonation != null
      ? pctChange(currentMetrics.medianDonation, previousMetrics.medianDonation)
      : null,
  };

  const pledgeIndex = buildPledgeIndex(pledges);
  const projects = (workspace.projects || []).map(publicProject);

  return {
    ok: true,
    restricted: false,
    currency: 'EUR',
    timezone: 'UTC',
    platformFeePercent: PLATFORM_FEE_PERCENT,
    foundationSharePercent: 100 - PLATFORM_FEE_PERCENT,
    range: {
      key: bounds.key,
      label: bounds.label,
      from: bounds.from != null ? new Date(bounds.from).toISOString() : null,
      to: bounds.to != null ? new Date(bounds.to).toISOString() : null,
    },
    financial: {
      ...currentMetrics,
      comparison,
    },
    revenueOverTime: buildRevenueSeries(period, bounds),
    donors: buildDonorSplit(period, allDonations, bounds),
    valueAnalysis: buildValueAnalysis(period),
    geography: buildGeography(period, pledgeIndex),
    projects: buildProjects(period, projects),
    timing: buildTiming(period),
    milestones: buildMilestones(allDonations, pledgeIndex),
    permissions: {
      canViewAmounts,
      canViewDetails,
      canViewSupporters,
    },
  };
}

module.exports = {
  buildFoundationDonationAnalytics,
  PLATFORM_FEE_PERCENT,
};
