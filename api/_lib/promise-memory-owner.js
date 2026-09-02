/**
 * Post Event Promise Memory — Owner Mode API (real data only).
 */
const { randomUUID } = require('crypto');
const {
  readBlobJson,
  writeJson,
} = require('./store');
const {
  ROOT,
  KNOWN_EVENTS,
  ensureIndexReady,
  queryPromiseIndex,
  readStats,
  readDailyRollup,
  buildOverviewFromStats,
  buildCountryOverview,
  buildCityOverview,
  listCountriesForFilter,
  listCitiesForFilter,
  eventTitle,
} = require('./promise-memory-index');

const FOLDERS_ROOT = `${ROOT}/folders`;
const FOLDERS_INDEX = `${FOLDERS_ROOT}/index.json`;
const LINKS_ROOT = `${ROOT}/folder-links`;

const DOCUMENT_PART_SIZE = 500;
const CSV_PART_SIZE = 10000;

function flagEmoji(code) {
  if (!code || String(code).length !== 2) return '';
  return String.fromCodePoint(
    ...[...String(code).toUpperCase()].map((c) => 0x1F1E6 - 65 + c.charCodeAt(0))
  );
}

function fmtDateTimeUtc(iso) {
  if (!iso) return { date: '—', time: '—' };
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
    const time = d.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    });
    return { date, time: `${time} UTC` };
  } catch {
    return { date: '—', time: '—' };
  }
}

async function readFoldersIndex() {
  try {
    const data = await readBlobJson(FOLDERS_INDEX);
    return Array.isArray(data?.folders) ? data.folders : [];
  } catch {
    return [];
  }
}

async function writeFoldersIndex(folders) {
  await writeJson(FOLDERS_INDEX, {
    updatedAt: new Date().toISOString(),
    folders,
  }, { overwrite: true });
}

async function readFolder(folderId) {
  try {
    return await readBlobJson(`${FOLDERS_ROOT}/${folderId}.json`);
  } catch {
    return null;
  }
}

async function writeFolder(folder) {
  await writeJson(`${FOLDERS_ROOT}/${folder.id}.json`, folder, { overwrite: true });
}

async function readFolderLinks(promiseId) {
  try {
    const data = await readBlobJson(`${LINKS_ROOT}/${promiseId}.json`);
    return Array.isArray(data?.folderIds) ? data.folderIds : [];
  } catch {
    return [];
  }
}

async function writeFolderLinks(promiseId, folderIds) {
  await writeJson(`${LINKS_ROOT}/${promiseId}.json`, {
    promiseId,
    folderIds: [...new Set(folderIds)],
    updatedAt: new Date().toISOString(),
  }, { overwrite: true });
}

async function syncFolderCount(folderId) {
  const folder = await readFolder(folderId);
  if (!folder) return null;
  folder.promiseCount = (folder.promiseIds || []).length;
  folder.updatedAt = new Date().toISOString();
  await writeFolder(folder);
  const folders = await readFoldersIndex();
  const idx = folders.findIndex((f) => f.id === folderId);
  if (idx >= 0) {
    folders[idx] = {
      id: folder.id,
      name: folder.name,
      promiseCount: folder.promiseCount,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
    await writeFoldersIndex(folders);
  }
  return folder;
}

async function listFolders() {
  const folders = await readFoldersIndex();
  return folders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function createFolder(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Folder name is required');
  const id = randomUUID();
  const now = new Date().toISOString();
  const folder = {
    id,
    name: trimmed,
    promiseIds: [],
    promiseCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await writeFolder(folder);
  const folders = await readFoldersIndex();
  folders.unshift({
    id,
    name: trimmed,
    promiseCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  await writeFoldersIndex(folders);
  return folder;
}

async function renameFolder(folderId, name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Folder name is required');
  const folder = await readFolder(folderId);
  if (!folder) throw new Error('Folder not found');
  folder.name = trimmed;
  folder.updatedAt = new Date().toISOString();
  await writeFolder(folder);
  const folders = await readFoldersIndex();
  const row = folders.find((f) => f.id === folderId);
  if (row) {
    row.name = trimmed;
    row.updatedAt = folder.updatedAt;
    await writeFoldersIndex(folders);
  }
  return folder;
}

async function deleteFolder(folderId) {
  const folder = await readFolder(folderId);
  if (!folder) throw new Error('Folder not found');
  for (const promiseId of folder.promiseIds || []) {
    const links = await readFolderLinks(promiseId);
    await writeFolderLinks(promiseId, links.filter((id) => id !== folderId));
  }
  await writeFolder({ ...folder, promiseIds: [], promiseCount: 0, deletedAt: new Date().toISOString() });
  const folders = (await readFoldersIndex()).filter((f) => f.id !== folderId);
  await writeFoldersIndex(folders);
  return { ok: true };
}

async function addPromisesToFolder(folderId, promiseIds = []) {
  const folder = await readFolder(folderId);
  if (!folder) throw new Error('Folder not found');
  const ids = [...new Set([...(folder.promiseIds || []), ...promiseIds.filter(Boolean)])];
  folder.promiseIds = ids;
  await writeFolder(folder);
  for (const promiseId of promiseIds) {
    const links = await readFolderLinks(promiseId);
    if (!links.includes(folderId)) {
      await writeFolderLinks(promiseId, [...links, folderId]);
    }
  }
  return syncFolderCount(folderId);
}

async function removePromisesFromFolder(folderId, promiseIds = []) {
  const folder = await readFolder(folderId);
  if (!folder) throw new Error('Folder not found');
  const removeSet = new Set(promiseIds);
  folder.promiseIds = (folder.promiseIds || []).filter((id) => !removeSet.has(id));
  await writeFolder(folder);
  for (const promiseId of promiseIds) {
    const links = await readFolderLinks(promiseId);
    await writeFolderLinks(promiseId, links.filter((id) => id !== folderId));
  }
  return syncFolderCount(folderId);
}

async function getFolderPromiseIds(folderId) {
  if (!folderId) return null;
  const folder = await readFolder(folderId);
  if (!folder) return new Set();
  return new Set(folder.promiseIds || []);
}

async function getPromiseDetail(promiseId) {
  await ensureIndexReady();
  const result = await queryPromiseIndex({ ids: [promiseId], pageSize: 1 });
  const item = result.items[0];
  if (!item) return null;
  const folderIds = await readFolderLinks(promiseId);
  const folders = await listFolders();
  const folderRows = folders.filter((f) => folderIds.includes(f.id));
  const dt = fmtDateTimeUtc(item.submittedAt);
  return {
    ...item,
    submittedDate: dt.date,
    submittedTime: dt.time,
    flag: flagEmoji(item.countryCode),
    folders: folderRows.map((f) => ({ id: f.id, name: f.name })),
  };
}

const schedule = require('./world-choir-event-schedule');

function isLiveSubmissionWindow() {
  const now = Date.now();
  const eventEnd = Date.parse(schedule.getEventEndUtc());
  const windowEnd = eventEnd + 30 * 24 * 60 * 60 * 1000;
  return now >= eventEnd && now <= windowEnd;
}

async function buildPromiseMemoryIntel(params = {}) {
  await ensureIndexReady();

  const eventId = String(params.eventId || 'all');
  const country = String(params.country || '');
  const city = String(params.city || '');
  const dateFrom = String(params.dateFrom || '');
  const dateTo = String(params.dateTo || '');
  const q = String(params.q || '');
  const sort = String(params.sort || 'newest');
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 50;
  const folderId = String(params.folderId || '');
  const cityQuery = String(params.cityQuery || '');
  const cityPage = Number(params.cityPage) || 1;
  const countryLimit = Number(params.countryLimit) || 50;

  const folderPromiseIds = await getFolderPromiseIds(folderId);
  const stats = await readStats();

  const [overview, countriesFilter, citiesFilter, folders, promises, countryOverview, cityOverview] = await Promise.all([
    buildOverviewFromStats({ eventId }),
    listCountriesForFilter({ eventId }),
    country ? listCitiesForFilter({ eventId, country }) : Promise.resolve([]),
    listFolders(),
    queryPromiseIndex({
      eventId,
      country,
      city,
      dateFrom,
      dateTo,
      q,
      sort,
      page,
      pageSize,
      folderPromiseIds,
    }),
    Promise.resolve(buildCountryOverview(stats, { eventId, limit: countryLimit })),
    Promise.resolve(buildCityOverview(stats, {
      eventId,
      country,
      query: cityQuery,
      page: cityPage,
      pageSize: 30,
    })),
  ]);

  const timeEventId = eventId !== 'all' ? eventId : (KNOWN_EVENTS[0]?.id || 'world-choir-2027');
  const promisesOverTime = await readDailyRollup(timeEventId);

  return {
    overview,
    events: KNOWN_EVENTS,
    filters: {
      eventId,
      country,
      city,
      dateFrom,
      dateTo,
      q,
      sort,
      folderId,
    },
    promises,
    countriesFilter,
    citiesFilter,
    folders,
    countryOverview,
    cityOverview,
    charts: {
      promisesOverTime,
    },
    live: isLiveSubmissionWindow(),
    generatedAt: new Date().toISOString(),
  };
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatExportRow(item) {
  const dt = fmtDateTimeUtc(item.submittedAt);
  return {
    promiseId: item.id,
    voiceNumber: item.voiceNumber,
    city: item.city,
    country: item.country,
    countryCode: item.countryCode,
    promiseText: item.promiseText,
    submittedDate: dt.date,
    submittedTime: dt.time,
    eventId: item.eventId,
    eventTitle: item.eventTitle,
  };
}

async function fetchExportEntries(params) {
  const scope = String(params.scope || 'filtered');
  const format = String(params.format || 'csv');
  const part = Math.max(1, Number(params.part) || 1);
  let eventId = String(params.eventId || 'all');
  let country = String(params.country || '');
  let city = String(params.city || '');
  let dateFrom = String(params.dateFrom || '');
  let dateTo = String(params.dateTo || '');
  const q = String(params.q || '');
  const sort = String(params.sort || 'newest');
  const folderId = String(params.folderId || '');
  const selectedIds = params.ids ? String(params.ids).split(',').filter(Boolean) : [];

  if (scope === 'all') {
    eventId = 'all';
    country = '';
    city = '';
    dateFrom = '';
    dateTo = '';
  } else if (scope === 'event') {
    country = '';
    city = '';
    dateFrom = '';
    dateTo = '';
  }

  let folderPromiseIds = null;
  let ids = null;

  if (scope === 'selected') {
    ids = selectedIds;
  } else if (scope === 'folder') {
    folderPromiseIds = await getFolderPromiseIds(folderId);
  }

  const chunkSize = format === 'document' ? DOCUMENT_PART_SIZE : CSV_PART_SIZE;
  const result = await queryPromiseIndex({
    eventId,
    country,
    city,
    dateFrom,
    dateTo,
    q: scope === 'all' ? '' : q,
    sort,
    page: 1,
    pageSize: 1000000,
    folderPromiseIds,
    ids,
  });

  const totalParts = Math.max(1, Math.ceil(result.total / chunkSize));
  const start = (part - 1) * chunkSize;
  const slice = result.items.slice(start, start + chunkSize);

  return {
    rows: slice.map(formatExportRow),
    total: result.total,
    part,
    totalParts,
    partSize: chunkSize,
  };
}

function buildCsv(rows) {
  const header = [
    'voice_number', 'city', 'country', 'country_code', 'promise_text',
    'submitted_date', 'submitted_time', 'event_id', 'event_title', 'promise_id',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      row.voiceNumber,
      row.city,
      row.country,
      row.countryCode,
      row.promiseText,
      row.submittedDate,
      row.submittedTime,
      row.eventId,
      row.eventTitle,
      row.promiseId,
    ].map(csvEscape).join(','));
  }
  return lines.join('\n');
}

function buildJsonExport(payload) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    part: payload.part,
    totalParts: payload.totalParts,
    totalPromises: payload.total,
    promises: payload.rows,
  }, null, 2);
}

function buildDocument(payload, titleBase) {
  const lines = [];
  if (payload.totalParts > 1) {
    lines.push(`${titleBase} — Part ${payload.part} of ${payload.totalParts}`);
  } else {
    lines.push(titleBase);
  }
  lines.push('');
  lines.push(`Exported: ${new Date().toISOString()}`);
  lines.push(`Promises in this document: ${payload.rows.length}`);
  lines.push(`Total matching archive: ${payload.total.toLocaleString('en-US')}`);
  lines.push('');
  lines.push('—'.repeat(40));
  lines.push('');

  for (const row of payload.rows) {
    const flag = flagEmoji(row.countryCode);
    lines.push(`Voice #${row.voiceNumber ?? '—'}`);
    lines.push(`${row.city || '—'}, ${row.country || '—'} ${flag}`.trim());
    lines.push('');
    lines.push(`"${row.promiseText || ''}"`);
    lines.push('');
    lines.push(`${row.submittedDate} · ${row.submittedTime}`);
    lines.push(`Event: ${row.eventTitle || row.eventId}`);
    lines.push('');
    lines.push('—'.repeat(40));
    lines.push('');
  }

  return lines.join('\n');
}

async function exportPromiseMemory(params) {
  const format = String(params.format || 'csv');
  const payload = await fetchExportEntries(params);
  const eventLabel = params.eventId && params.eventId !== 'all'
    ? eventTitle(params.eventId)
    : 'World Choir Promises';
  const titleBase = `${eventLabel} — Promises`;

  if (format === 'json') {
    return {
      contentType: 'application/json; charset=utf-8',
      filename: `${titleBase.replace(/\s+/g, '-')}-part-${payload.part}-of-${payload.totalParts}.json`,
      body: buildJsonExport(payload),
      meta: payload,
    };
  }

  if (format === 'document') {
    return {
      contentType: 'text/plain; charset=utf-8',
      filename: `${titleBase.replace(/\s+/g, '-')}-part-${payload.part}-of-${payload.totalParts}.txt`,
      body: buildDocument(payload, titleBase),
      meta: payload,
    };
  }

  return {
    contentType: 'text/csv; charset=utf-8',
    filename: `${titleBase.replace(/\s+/g, '-')}-part-${payload.part}-of-${payload.totalParts}.csv`,
    body: buildCsv(payload.rows),
    meta: payload,
  };
}

module.exports = {
  buildPromiseMemoryIntel,
  getPromiseDetail,
  createFolder,
  renameFolder,
  deleteFolder,
  addPromisesToFolder,
  removePromisesFromFolder,
  exportPromiseMemory,
  listFolders,
  DOCUMENT_PART_SIZE,
  CSV_PART_SIZE,
};
