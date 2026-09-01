/**
 * Live event state — unit tests (no network).
 */
const assert = require('assert');
const {
  getLiveEventSchedule,
  DEFAULT_EVENT_ID,
} = require('../api/_lib/live-event-state');

function testSchedule() {
  const schedule = getLiveEventSchedule();
  assert.strictEqual(schedule.eventId, DEFAULT_EVENT_ID);
  assert.strictEqual(schedule.eventStartUtc, '2027-09-21T16:00:00.000Z');
  assert.strictEqual(schedule.preEventIntendedStartUtc, '2027-09-21T15:55:00.000Z');
  assert.strictEqual(schedule.songDurationSeconds, 183);
  assert.strictEqual(schedule.preEventVideoDurationSeconds, 300);
}

testSchedule();
console.log('live-event-state tests passed');
