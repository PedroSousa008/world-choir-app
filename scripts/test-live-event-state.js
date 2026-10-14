/**
 * Live event state — unit tests (no network).
 */
const assert = require('assert');
const schedule = require('../api/_lib/world-choir-event-schedule');
const {
  getLiveEventSchedule,
  isSongStartValidForCurrentSchedule,
  DEFAULT_EVENT_ID,
} = require('../api/_lib/live-event-state');

function testScheduleShape() {
  const current = getLiveEventSchedule();
  assert.strictEqual(current.eventId, DEFAULT_EVENT_ID);
  assert.strictEqual(current.songDurationSeconds, 183);
  assert.strictEqual(current.preEventVideoDurationSeconds, 301);
  assert.strictEqual(current.officialEventStartUtc, '2027-09-21T16:00:00.000Z');

  const eventMs = Date.parse(current.eventStartUtc);
  const preMs = Date.parse(current.preEventIntendedStartUtc);
  assert.strictEqual(eventMs - preMs, 5 * 60 * 1000);

  if (schedule.isTestOverrideActive()) {
    assert.strictEqual(current.testOverrideEnabled, true);
    console.log('Temporary test override active:', current.eventStartUtc);
  } else {
    assert.strictEqual(current.eventStartUtc, '2027-09-21T16:00:00.000Z');
    assert.strictEqual(current.preEventIntendedStartUtc, '2027-09-21T15:55:00.000Z');
  }
}

function testRejectsStaleOctoberTestFreeze() {
  // Leftover same-day test freeze from 2026-10-11 must never validate against 2027.
  if (schedule.isTestOverrideActive()) {
    console.log('skip stale-freeze validity check while test override is on');
    return;
  }
  assert.strictEqual(
    isSongStartValidForCurrentSchedule('2026-10-11T20:50:00.751Z'),
    false,
    'Oct 2026 test song-start must be invalid for official 2027 schedule'
  );
  assert.strictEqual(
    isSongStartValidForCurrentSchedule(null),
    false
  );
  assert.strictEqual(
    isSongStartValidForCurrentSchedule('not-a-date'),
    false
  );
}

function testAcceptsStartInsideOfficialWindow() {
  if (schedule.isTestOverrideActive()) {
    console.log('skip official-window check while test override is on');
    return;
  }
  assert.strictEqual(
    isSongStartValidForCurrentSchedule('2027-09-21T16:00:00.000Z'),
    true,
    'official event start must be valid'
  );
  assert.strictEqual(
    isSongStartValidForCurrentSchedule('2027-09-21T15:55:00.000Z'),
    true,
    'pre-event intended start must be valid'
  );
  // Just outside the +2m grace after song end (16:00 + 183s + 2m ≈ 16:05:03)
  assert.strictEqual(
    isSongStartValidForCurrentSchedule('2027-09-21T16:10:00.000Z'),
    false,
    'song start far after event end must be invalid'
  );
}

testScheduleShape();
testRejectsStaleOctoberTestFreeze();
testAcceptsStartInsideOfficialWindow();
console.log('live-event-state tests passed');
