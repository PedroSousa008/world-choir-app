/**
 * Live event state — unit tests (no network).
 */
const assert = require('assert');
const schedule = require('../api/_lib/world-choir-event-schedule');
const {
  getLiveEventSchedule,
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

testScheduleShape();
console.log('live-event-state tests passed');
