/**
 * TEMPORARY WORLD CHOIR EVENT TEST OVERRIDE
 * REMOVE AFTER END-TO-END EVENT TESTING
 * OFFICIAL EVENT: 2027-09-21T16:00:00Z
 *
 * Single source of truth for event timestamps (browser).
 * Mirror logic in api/_lib/world-choir-event-schedule.js for the server.
 */
const WorldChoirEventSchedule = (() => {
  const OFFICIAL_EVENT_START_UTC = '2027-09-21T16:00:00.000Z';
  const OFFICIAL_PRE_EVENT_START_UTC = '2027-09-21T15:55:00.000Z';
  const PRE_EVENT_LEAD_MS = 5 * 60 * 1000;
  const SONG_DURATION_SECONDS = 183;
  const PRE_EVENT_VIDEO_DURATION_SECONDS = 301;
  const EVENT_ID = 'world-choir-2027';
  const TEST_TIMEZONE = 'Europe/Lisbon';

  /** Set true only while running end-to-end event tests. */
  const TEMP_EVENT_TEST_OVERRIDE_ENABLED = true;

  function getLisbonOffsetMinutes(now = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: TEST_TIMEZONE,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(now);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+1';
    const offsetMatch = tzPart.match(/GMT([+-])(\d+)(?::(\d+))?/);
    if (!offsetMatch) return 60;
    const sign = offsetMatch[1] === '+' ? 1 : -1;
    const hours = Number(offsetMatch[2] || 0);
    const mins = Number(offsetMatch[3] || 0);
    return sign * (hours * 60 + mins);
  }

  function getLisbonLocalDateParts(now = new Date()) {
    const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
      timeZone: TEST_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now).split('-').map(Number);
    return { y, m, d };
  }

  /**
   * 4 Sep 2026 00:55 Europe/Lisbon (WEST, UTC+1) = 2026-09-03T23:55:00.000Z
   * Fixed absolute instant so Home countdown is minutes, not “1 day”.
   */
  const TEST_EVENT_START_UTC = '2026-09-03T23:55:00.000Z';

  function getTestEventStartUtc() {
    return TEST_EVENT_START_UTC;
  }

  function getTestPreEventStartUtc(now = new Date()) {
    const eventMs = Date.parse(getTestEventStartUtc(now));
    return new Date(eventMs - PRE_EVENT_LEAD_MS).toISOString();
  }

  function isTestOverrideActive() {
    return TEMP_EVENT_TEST_OVERRIDE_ENABLED;
  }

  function getEventStartUtc(now = new Date()) {
    return isTestOverrideActive() ? getTestEventStartUtc(now) : OFFICIAL_EVENT_START_UTC;
  }

  function getPreEventStartUtc(now = new Date()) {
    return isTestOverrideActive() ? getTestPreEventStartUtc(now) : OFFICIAL_PRE_EVENT_START_UTC;
  }

  function getEventEndUtc(now = new Date()) {
    const startMs = Date.parse(getEventStartUtc(now));
    return new Date(startMs + SONG_DURATION_SECONDS * 1000).toISOString();
  }

  return {
    OFFICIAL_EVENT_START_UTC,
    OFFICIAL_PRE_EVENT_START_UTC,
    TEMP_EVENT_TEST_OVERRIDE_ENABLED,
    PRE_EVENT_LEAD_MS,
    SONG_DURATION_SECONDS,
    PRE_EVENT_VIDEO_DURATION_SECONDS,
    EVENT_ID,
    TEST_TIMEZONE,
    isTestOverrideActive,
    getEventStartUtc,
    getPreEventStartUtc,
    getEventEndUtc,
    getTestEventStartUtc,
    getTestPreEventStartUtc,
  };
})();
