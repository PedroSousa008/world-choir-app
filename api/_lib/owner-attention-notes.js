/**
 * Owner Overview — Needs Attention notes (Reminders-style checklist).
 * Persisted in Vercel Blob until the owner completes/deletes them.
 */
const { randomUUID } = require('crypto');
const { readBlobJson, writeJson, assertBlobConfigured } = require('./store');

const NOTES_PATH = 'wc-data/owner/attention-notes.json';

function emptyStore() {
  return {
    version: 1,
    updatedAt: null,
    notes: [],
  };
}

function normalizeNote(raw = {}) {
  const id = String(raw.id || '').trim() || randomUUID();
  const text = String(raw.text || '').trim();
  const detail = String(raw.detail || '').trim();
  let dueAt = raw.dueAt || null;
  if (dueAt) {
    const t = Date.parse(dueAt);
    dueAt = Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  return {
    id,
    text,
    detail,
    dueAt,
    completed: Boolean(raw.completed),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

async function readStore() {
  assertBlobConfigured();
  try {
    const data = await readBlobJson(NOTES_PATH);
    const notes = Array.isArray(data?.notes)
      ? data.notes.map(normalizeNote)
      : [];
    return {
      version: 1,
      updatedAt: data?.updatedAt || null,
      notes,
    };
  } catch {
    return emptyStore();
  }
}

async function listAttentionNotes() {
  const store = await readStore();
  return store.notes;
}

async function saveAttentionNotes(notesInput) {
  assertBlobConfigured();
  const now = new Date().toISOString();
  const incoming = Array.isArray(notesInput) ? notesInput : [];
  const notes = incoming
    .map((n) => normalizeNote({ ...n, updatedAt: now }))
    // Keep empty drafts out of storage — UI always shows one composer row.
    .filter((n) => n.text || n.detail || n.dueAt || n.completed);
  const store = {
    version: 1,
    updatedAt: now,
    notes,
  };
  await writeJson(NOTES_PATH, store, { overwrite: true });
  return store;
}

async function upsertAttentionNote(patch = {}) {
  const store = await readStore();
  const now = new Date().toISOString();
  const id = String(patch.id || '').trim();
  const idx = id ? store.notes.findIndex((n) => n.id === id) : -1;
  let note;
  if (idx >= 0) {
    note = normalizeNote({
      ...store.notes[idx],
      ...patch,
      id: store.notes[idx].id,
      createdAt: store.notes[idx].createdAt,
      updatedAt: now,
    });
    if (!note.text && !note.detail && !note.dueAt && !note.completed) {
      store.notes.splice(idx, 1);
      note = null;
    } else {
      store.notes[idx] = note;
    }
  } else {
    note = normalizeNote({ ...patch, createdAt: now, updatedAt: now });
    if (!note.text && !note.detail && !note.dueAt && !note.completed) {
      return { notes: store.notes, note: null };
    }
    store.notes.unshift(note);
  }
  store.updatedAt = now;
  await writeJson(NOTES_PATH, store, { overwrite: true });
  return { notes: store.notes, note };
}

async function deleteAttentionNote(noteId) {
  const store = await readStore();
  const id = String(noteId || '').trim();
  if (!id) {
    const err = new Error('noteId required');
    err.statusCode = 400;
    throw err;
  }
  store.notes = store.notes.filter((n) => n.id !== id);
  store.updatedAt = new Date().toISOString();
  await writeJson(NOTES_PATH, store, { overwrite: true });
  return store;
}

module.exports = {
  listAttentionNotes,
  saveAttentionNotes,
  upsertAttentionNote,
  deleteAttentionNote,
};
