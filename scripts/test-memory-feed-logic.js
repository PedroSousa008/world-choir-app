/**
 * Lightweight Memory feed cursor / window tests (no Blob required).
 * Run: node scripts/test-memory-feed-logic.js
 */
const assert = require('assert');

function compareCursor(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const ca = String(a.createdAt || '');
  const cb = String(b.createdAt || '');
  if (ca < cb) return -1;
  if (ca > cb) return 1;
  const ia = String(a.id || '');
  const ib = String(b.id || '');
  if (ia < ib) return -1;
  if (ia > ib) return 1;
  return 0;
}

function isAfterCursor(item, cursor) {
  if (!cursor || !cursor.createdAt) return true;
  return compareCursor(item, cursor) > 0;
}

function makeWindow(history, current, future) {
  return {
    left: history.length ? history[history.length - 1] : null,
    center: current,
    right: future[0] || null,
  };
}

function goNext(state) {
  if (!state.future.length) return false;
  if (state.current) state.history.push(state.current);
  state.current = state.future.shift();
  if (
    !state.highWater
    || compareCursor(
      { createdAt: state.current.createdAt, id: state.current.id },
      state.highWater
    ) > 0
  ) {
    state.highWater = { createdAt: state.current.createdAt, id: state.current.id };
  }
  return true;
}

function goPrev(state) {
  if (!state.history.length) return false;
  if (state.current) state.future.unshift(state.current);
  state.current = state.history.pop();
  return true;
}

function insertFuture(state, photos) {
  const known = state.known || new Set();
  for (const photo of photos) {
    if (known.has(photo.id)) continue;
    if (state.highWater && compareCursor(photo, state.highWater) <= 0) {
      known.add(photo.id);
      continue;
    }
    known.add(photo.id);
    state.future.push(photo);
  }
  state.future.sort((a, b) => compareCursor(a, b));
  state.known = known;
}

// Same-timestamp deterministic order
{
  const a = { id: 'a', createdAt: '2027-01-01T00:00:00.000Z' };
  const b = { id: 'b', createdAt: '2027-01-01T00:00:00.000Z' };
  assert.strictEqual(compareCursor(a, b) < 0, true);
  assert.strictEqual(isAfterCursor(b, a), true);
  assert.strictEqual(isAfterCursor(a, a), false);
}

// Forward never loops; waiting card not swipable
{
  const photos = [
    { id: 'A', createdAt: '2027-01-01T16:00:02.000Z' },
    { id: 'B', createdAt: '2027-01-01T16:00:04.000Z' },
    { id: 'C', createdAt: '2027-01-01T16:00:07.000Z' },
  ];
  const state = {
    history: [],
    current: photos[0],
    future: photos.slice(1),
    highWater: { createdAt: photos[0].createdAt, id: photos[0].id },
    known: new Set(photos.map((p) => p.id)),
  };
  assert.strictEqual(goNext(state), true);
  assert.strictEqual(state.current.id, 'B');
  assert.strictEqual(makeWindow(state.history, state.current, state.future).left.id, 'A');
  assert.strictEqual(makeWindow(state.history, state.current, state.future).right.id, 'C');
  assert.strictEqual(goNext(state), true);
  assert.strictEqual(state.current.id, 'C');
  assert.strictEqual(state.future.length, 0);
  assert.strictEqual(goNext(state), false); // waiting card not activatable
  assert.strictEqual(state.highWater.id, 'C');
}

// Backward then forward keeps high-water; A never reappears as new
{
  const photos = [
    { id: 'A', createdAt: '2027-01-01T16:00:02.000Z' },
    { id: 'B', createdAt: '2027-01-01T16:00:04.000Z' },
    { id: 'C', createdAt: '2027-01-01T16:00:07.000Z' },
    { id: 'D', createdAt: '2027-01-01T16:00:10.000Z' },
  ];
  const state = {
    history: [],
    current: photos[0],
    future: photos.slice(1),
    highWater: { createdAt: photos[0].createdAt, id: photos[0].id },
    known: new Set(photos.map((p) => p.id)),
  };
  goNext(state);
  goNext(state); // on C, high water C
  goPrev(state); // on B
  assert.strictEqual(state.current.id, 'B');
  assert.strictEqual(state.highWater.id, 'C');
  goNext(state); // back to C
  assert.strictEqual(state.current.id, 'C');
  // Late arrival behind high water must not enter future
  insertFuture(state, [{ id: 'A-late', createdAt: '2027-01-01T16:00:01.000Z' }]);
  assert.strictEqual(state.future.some((p) => p.id === 'A-late'), false);
  // New photo after high water enters future
  insertFuture(state, [{ id: 'E', createdAt: '2027-01-01T16:00:15.000Z' }]);
  assert.strictEqual(state.future[0].id, 'D');
  assert.strictEqual(state.future[1].id, 'E');
  // Dedup
  insertFuture(state, [{ id: 'E', createdAt: '2027-01-01T16:00:15.000Z' }]);
  assert.strictEqual(state.future.filter((p) => p.id === 'E').length, 1);
}

console.log('memory-feed-logic: all assertions passed');
