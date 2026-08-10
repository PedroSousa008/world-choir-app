/**
 * Per-Foundation workspace — projects, updates, team, activity, notifications.
 * Always keyed by foundationId (= influencer.id). Never cross-foundation.
 */
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const { readBlobJson, writeJson, assertBlobConfigured } = require('./store');
const { MIN_PASSWORD_LENGTH } = require('./auth');

const ROOT = 'wc-data/members/workspaces';

function workspacePath(foundationId) {
  return `${ROOT}/${encodeURIComponent(foundationId)}.json`;
}

function emptyWorkspace(foundationId) {
  return {
    version: 1,
    foundationId,
    projects: [],
    updates: [],
    team: [],
    activity: [],
    notifications: [],
    drafts: {
      page: null,
      card: null,
    },
    updatedAt: null,
  };
}

async function readWorkspace(foundationId) {
  assertBlobConfigured();
  if (!foundationId) return emptyWorkspace('');
  try {
    const data = await readBlobJson(workspacePath(foundationId));
    return {
      ...emptyWorkspace(foundationId),
      ...data,
      foundationId,
      projects: Array.isArray(data.projects) ? data.projects : [],
      updates: Array.isArray(data.updates) ? data.updates : [],
      team: Array.isArray(data.team) ? data.team : [],
      activity: Array.isArray(data.activity) ? data.activity : [],
      notifications: Array.isArray(data.notifications) ? data.notifications : [],
      drafts: data.drafts && typeof data.drafts === 'object' ? data.drafts : { page: null, card: null },
    };
  } catch {
    return emptyWorkspace(foundationId);
  }
}

async function writeWorkspace(doc) {
  assertBlobConfigured();
  const next = {
    ...doc,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(workspacePath(doc.foundationId), next, { overwrite: true });
  return next;
}

function publicTeamMember(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name || '',
    role: row.role || 'editor',
    active: row.active !== false,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

function publicProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || '',
    shortDescription: row.shortDescription || '',
    description: row.description || '',
    coverImage: row.coverImage || '',
    media: Array.isArray(row.media) ? row.media : [],
    location: row.location || '',
    country: row.country || '',
    category: row.category || '',
    startDate: row.startDate || null,
    expectedCompletionDate: row.expectedCompletionDate || null,
    status: row.status || 'draft',
    fundingGoal: row.fundingGoal != null ? Number(row.fundingGoal) : null,
    fundingRaised: 0, // platform-calculated elsewhere
    updates: Array.isArray(row.updates) ? row.updates : [],
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    publishedAt: row.publishedAt || null,
  };
}

function publicUpdate(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || '',
    body: row.body || '',
    type: row.type || 'foundation',
    projectId: row.projectId || null,
    status: row.status || 'draft',
    media: Array.isArray(row.media) ? row.media : [],
    scheduledAt: row.scheduledAt || null,
    publishedAt: row.publishedAt || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

function publicNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    category: row.category || 'foundation',
    title: row.title || '',
    body: row.body || '',
    relatedType: row.relatedType || null,
    relatedId: row.relatedId || null,
    read: row.read === true,
    createdAt: row.createdAt || null,
  };
}

async function appendActivity(foundationId, entry) {
  const ws = await readWorkspace(foundationId);
  const item = {
    id: randomUUID(),
    action: entry.action || 'event',
    label: entry.label || '',
    detail: entry.detail || '',
    actor: entry.actor || 'Foundation',
    relatedType: entry.relatedType || null,
    relatedId: entry.relatedId || null,
    at: new Date().toISOString(),
  };
  ws.activity = [item, ...ws.activity].slice(0, 200);
  await writeWorkspace(ws);
  return item;
}

async function appendNotification(foundationId, entry) {
  const ws = await readWorkspace(foundationId);
  const item = {
    id: randomUUID(),
    category: entry.category || 'foundation',
    title: entry.title || '',
    body: entry.body || '',
    relatedType: entry.relatedType || null,
    relatedId: entry.relatedId || null,
    read: false,
    createdAt: new Date().toISOString(),
  };
  ws.notifications = [item, ...ws.notifications].slice(0, 100);
  await writeWorkspace(ws);
  return item;
}

const PROJECT_STATUSES = new Set([
  'draft', 'under_review', 'active', 'paused', 'completed', 'archived',
]);

async function upsertProject(foundationId, payload = {}, actor = 'Foundation Owner') {
  const ws = await readWorkspace(foundationId);
  const now = new Date().toISOString();
  let row;
  let created = false;

  if (payload.id) {
    const index = ws.projects.findIndex((p) => p.id === payload.id);
    if (index === -1) return { ok: false, error: 'Project not found' };
    row = { ...ws.projects[index] };
  } else {
    if (!String(payload.title || '').trim()) {
      return { ok: false, error: 'Project title is required' };
    }
    created = true;
    row = {
      id: randomUUID(),
      createdAt: now,
      updates: [],
      status: 'draft',
    };
  }

  const fields = [
    'title', 'shortDescription', 'description', 'coverImage', 'location',
    'country', 'category', 'startDate', 'expectedCompletionDate',
  ];
  fields.forEach((f) => {
    if (payload[f] !== undefined) row[f] = String(payload[f] || '').trim();
  });
  if (payload.media !== undefined) {
    row.media = Array.isArray(payload.media) ? payload.media.slice(0, 20) : [];
  }
  if (payload.fundingGoal !== undefined) {
    const n = Number(payload.fundingGoal);
    row.fundingGoal = Number.isFinite(n) && n > 0 ? n : null;
  }
  if (payload.status !== undefined) {
    const status = String(payload.status);
    if (!PROJECT_STATUSES.has(status)) {
      return { ok: false, error: 'Invalid project status' };
    }
    row.status = status;
    if (status === 'active' && !row.publishedAt) row.publishedAt = now;
  }

  row.updatedAt = now;
  if (payload.id) {
    const index = ws.projects.findIndex((p) => p.id === payload.id);
    ws.projects[index] = row;
  } else {
    ws.projects.unshift(row);
  }

  await writeWorkspace(ws);
  await appendActivity(foundationId, {
    action: created ? 'project_created' : 'project_updated',
    label: created ? 'Project created' : 'Project updated',
    detail: row.title,
    actor,
    relatedType: 'project',
    relatedId: row.id,
  });

  return { ok: true, project: publicProject(row) };
}

async function setProjectStatus(foundationId, projectId, status, actor = 'Foundation Owner') {
  return upsertProject(foundationId, { id: projectId, status }, actor);
}

async function upsertUpdate(foundationId, payload = {}, actor = 'Foundation Owner') {
  const ws = await readWorkspace(foundationId);
  const now = new Date().toISOString();
  let row;
  let created = false;

  if (payload.id) {
    const index = ws.updates.findIndex((u) => u.id === payload.id);
    if (index === -1) return { ok: false, error: 'Update not found' };
    row = { ...ws.updates[index] };
  } else {
    if (!String(payload.title || '').trim()) {
      return { ok: false, error: 'Title is required' };
    }
    created = true;
    row = {
      id: randomUUID(),
      createdAt: now,
      status: 'draft',
      type: 'foundation',
    };
  }

  ['title', 'body', 'type', 'projectId', 'scheduledAt'].forEach((f) => {
    if (payload[f] !== undefined) row[f] = payload[f] == null ? null : String(payload[f]);
  });
  if (payload.media !== undefined) {
    row.media = Array.isArray(payload.media) ? payload.media.slice(0, 12) : [];
  }
  if (payload.status !== undefined) {
    const status = String(payload.status);
    if (!['draft', 'scheduled', 'published', 'archived'].includes(status)) {
      return { ok: false, error: 'Invalid update status' };
    }
    row.status = status;
    if (status === 'published' && !row.publishedAt) row.publishedAt = now;
  }

  row.updatedAt = now;
  if (payload.id) {
    const index = ws.updates.findIndex((u) => u.id === payload.id);
    ws.updates[index] = row;
  } else {
    ws.updates.unshift(row);
  }

  await writeWorkspace(ws);
  await appendActivity(foundationId, {
    action: created ? 'update_created' : (row.status === 'published' ? 'update_published' : 'update_edited'),
    label: row.status === 'published' && !created ? 'Update published' : (created ? 'Update drafted' : 'Update edited'),
    detail: row.title,
    actor,
    relatedType: 'update',
    relatedId: row.id,
  });

  return { ok: true, update: publicUpdate(row) };
}

const TEAM_ROLES = new Set(['owner', 'admin', 'finance', 'editor', 'analyst']);

async function upsertTeamMember(foundationId, payload = {}, actor = 'Foundation Owner') {
  const ws = await readWorkspace(foundationId);
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email.includes('@')) return { ok: false, error: 'Valid email required' };
  const role = String(payload.role || 'editor');
  if (!TEAM_ROLES.has(role) || role === 'owner') {
    return { ok: false, error: 'Invalid team role' };
  }

  const now = new Date().toISOString();
  let row;
  if (payload.id) {
    const index = ws.team.findIndex((t) => t.id === payload.id);
    if (index === -1) return { ok: false, error: 'Team member not found' };
    row = { ...ws.team[index] };
  } else {
    if (ws.team.some((t) => t.email === email)) {
      return { ok: false, error: 'This email is already on the team' };
    }
    row = { id: randomUUID(), createdAt: now, active: true };
  }

  row.email = email;
  row.name = String(payload.name || '').trim();
  row.role = role;
  if (payload.active !== undefined) row.active = payload.active === true;
  if (payload.password) {
    if (String(payload.password).length < MIN_PASSWORD_LENGTH) {
      return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
    }
    row.passwordHash = await bcrypt.hash(String(payload.password), 12);
  }
  row.updatedAt = now;

  if (payload.id) {
    const index = ws.team.findIndex((t) => t.id === payload.id);
    ws.team[index] = row;
  } else {
    ws.team.push(row);
  }

  await writeWorkspace(ws);
  await appendActivity(foundationId, {
    action: 'team_member_added',
    label: payload.id ? 'Team member updated' : 'Team member added',
    detail: `${row.name || row.email} · ${row.role}`,
    actor,
    relatedType: 'team',
    relatedId: row.id,
  });
  if (!payload.id) {
    await appendNotification(foundationId, {
      category: 'foundation',
      title: 'Team member added',
      body: `${row.name || row.email} joined as ${row.role}.`,
      relatedType: 'team',
      relatedId: row.id,
    });
  }

  return { ok: true, member: publicTeamMember(row) };
}

async function removeTeamMember(foundationId, memberId, actor = 'Foundation Owner') {
  const ws = await readWorkspace(foundationId);
  const index = ws.team.findIndex((t) => t.id === memberId);
  if (index === -1) return { ok: false, error: 'Team member not found' };
  const [removed] = ws.team.splice(index, 1);
  await writeWorkspace(ws);
  await appendActivity(foundationId, {
    action: 'team_member_removed',
    label: 'Team member removed',
    detail: removed.email,
    actor,
    relatedType: 'team',
    relatedId: memberId,
  });
  return { ok: true };
}

async function findTeamLogin(email, password) {
  // Scan is bounded — workspaces are per foundation; list known influencers externally.
  return { ok: false, error: 'Use foundation owner credentials, or ask the owner to provision team login.' };
}

async function markNotificationRead(foundationId, notificationId) {
  const ws = await readWorkspace(foundationId);
  const row = ws.notifications.find((n) => n.id === notificationId);
  if (!row) return { ok: false, error: 'Notification not found' };
  row.read = true;
  await writeWorkspace(ws);
  return { ok: true, notification: publicNotification(row) };
}

async function markAllNotificationsRead(foundationId) {
  const ws = await readWorkspace(foundationId);
  ws.notifications.forEach((n) => { n.read = true; });
  await writeWorkspace(ws);
  return { ok: true };
}

async function saveDrafts(foundationId, drafts = {}) {
  const ws = await readWorkspace(foundationId);
  ws.drafts = {
    page: drafts.page !== undefined ? drafts.page : ws.drafts.page,
    card: drafts.card !== undefined ? drafts.card : ws.drafts.card,
  };
  await writeWorkspace(ws);
  return { ok: true, drafts: ws.drafts };
}

function rolePermissions(role) {
  const map = {
    owner: {
      editFoundation: true, createProjects: true, publishUpdates: true,
      viewDonations: true, manageFinancial: true, manageTeam: true, exportData: true,
    },
    admin: {
      editFoundation: true, createProjects: true, publishUpdates: true,
      viewDonations: true, manageFinancial: false, manageTeam: true, exportData: true,
    },
    finance: {
      editFoundation: false, createProjects: false, publishUpdates: false,
      viewDonations: true, manageFinancial: true, manageTeam: false, exportData: true,
    },
    editor: {
      editFoundation: true, createProjects: true, publishUpdates: true,
      viewDonations: false, manageFinancial: false, manageTeam: false, exportData: false,
    },
    analyst: {
      editFoundation: false, createProjects: false, publishUpdates: false,
      viewDonations: true, manageFinancial: false, manageTeam: false, exportData: true,
    },
  };
  return map[role] || map.analyst;
}

module.exports = {
  readWorkspace,
  writeWorkspace,
  publicProject,
  publicUpdate,
  publicTeamMember,
  publicNotification,
  appendActivity,
  appendNotification,
  upsertProject,
  setProjectStatus,
  upsertUpdate,
  upsertTeamMember,
  removeTeamMember,
  findTeamLogin,
  markNotificationRead,
  markAllNotificationsRead,
  saveDrafts,
  rolePermissions,
  PROJECT_STATUSES,
  TEAM_ROLES,
};
