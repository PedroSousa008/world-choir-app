/**
 * World Choir — Calendar integration
 * - iOS/Android native app: system calendar event editor (expo / native module)
 * - iOS Safari/web: guidance modal + direct file download (never share sheet)
 * - Other platforms: ICS file download
 */
const WorldChoirCalendar = (() => {
  const FILENAME = 'world-choir-2027.ics';

  function formatIcsDate(date) {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  function escapeIcsText(text) {
    return String(text)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n/g, '\\n')
      .replace(/\n/g, '\\n');
  }

  function buildIcs({ withAlerts = false } = {}) {
    const start = WorldChoirConfig.getEventStart();
    const end = WorldChoirConfig.getCalendarEventEnd();
    const description = WorldChoirConfig.getCalendarDescription();
    const website = WorldChoirConfig.getWebsiteUrl();

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//World Choir//World Choir 2027//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:world-choir-2027@world-choir-app.vercel.app',
      `DTSTAMP:${formatIcsDate(new Date())}`,
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${escapeIcsText('World Choir 2027')}`,
      `LOCATION:${escapeIcsText('Worldwide')}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `URL:${website}`,
    ];

    if (withAlerts) {
      lines.push(
        'BEGIN:VALARM',
        'TRIGGER:-P1D',
        'ACTION:DISPLAY',
        'DESCRIPTION:World Choir 2027 — 1 day to go',
        'END:VALARM',
        'BEGIN:VALARM',
        'TRIGGER:-PT1H',
        'ACTION:DISPLAY',
        'DESCRIPTION:World Choir 2027 — 1 hour to go',
        'END:VALARM',
        'BEGIN:VALARM',
        'TRIGGER:-PT10M',
        'ACTION:DISPLAY',
        'DESCRIPTION:World Choir 2027 — starting soon',
        'END:VALARM'
      );
    }

    lines.push('END:VEVENT', 'END:VCALENDAR', '');
    return lines.join('\r\n');
  }

  function buildIcsWithAlerts() {
    return buildIcs({ withAlerts: true });
  }

  function isIOS() {
    return /iPad|iPhone|iPod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }

  function isNativeAppShell() {
    return !!(window.ReactNativeWebView || window.expo);
  }

  function ensureIosWebModal() {
    if (document.getElementById('ios-calendar-overlay')) return;

    const html = `
      <div class="overlay" id="ios-calendar-overlay" aria-hidden="true">
        <div class="modal ios-calendar-modal" role="dialog" aria-labelledby="ios-calendar-title">
          <h2 class="modal-title" id="ios-calendar-title">Add to Apple Calendar</h2>
          <p class="modal-copy">
            To add this event to Apple Calendar, download the calendar file below.
            When it opens, tap <strong>Add to Calendar</strong> to review and save the event.
          </p>
          <div class="actions-row">
            <button class="btn btn-primary" id="ios-calendar-download" type="button">Download Calendar File</button>
            <button class="btn btn-secondary" id="ios-calendar-cancel" type="button">Cancel</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('ios-calendar-download')?.addEventListener('click', () => {
      downloadIcsFile();
      hideIosWebModal();
    });
    document.getElementById('ios-calendar-cancel')?.addEventListener('click', hideIosWebModal);
    document.getElementById('ios-calendar-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'ios-calendar-overlay') hideIosWebModal();
    });
  }

  function showIosWebModal() {
    ensureIosWebModal();
    const overlay = document.getElementById('ios-calendar-overlay');
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function hideIosWebModal() {
    const overlay = document.getElementById('ios-calendar-overlay');
    overlay?.classList.remove('active');
    overlay?.setAttribute('aria-hidden', 'true');
  }

  function downloadIcsFile(icsContent) {
    const blob = new Blob([icsContent || buildIcs()], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = FILENAME;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function openAndroidCalendar() {
    const ics = buildIcs();
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function openIcsContent(ics) {
    if (isIOS()) {
      window.location.assign('data:text/calendar;charset=utf-8,' + encodeURIComponent(ics));
      return;
    }

    if (isAndroid()) {
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }

    downloadIcsFile(ics);
  }

  /**
   * @returns {Promise<{ ok: boolean, iosWebGuidance?: boolean, error?: string }>}
   */
  async function addWithAlerts() {
    try {
      if (isNativeAppShell()) {
        return {
          ok: false,
          error: 'Use Remind Me in the World Choir app.',
        };
      }

      const ics = buildIcsWithAlerts();

      if (isIOS()) {
        openIcsContent(ics);
        return { ok: true };
      }

      openIcsContent(ics);
      return { ok: true };
    } catch (err) {
      console.error('WorldChoirCalendar.addWithAlerts failed:', err);
      return {
        ok: false,
        error: 'We could not set reminders. Please try again.',
      };
    }
  }

  /**
   * @returns {Promise<{ ok: boolean, iosWebGuidance?: boolean, error?: string }>}
   */
  async function addToCalendar() {
    try {
      if (isNativeAppShell()) {
        return {
          ok: false,
          error: 'Use the native Add to Calendar button in the World Choir app.',
        };
      }

      if (isIOS()) {
        showIosWebModal();
        return { ok: true, iosWebGuidance: true };
      }

      if (isAndroid()) {
        openAndroidCalendar();
        return { ok: true };
      }

      downloadIcsFile();
      return { ok: true };
    } catch (err) {
      console.error('WorldChoirCalendar.addToCalendar failed:', err);
      return {
        ok: false,
        error: 'We could not open your calendar app. Please try again.',
      };
    }
  }

  return { addToCalendar, addWithAlerts, buildIcs, buildIcsWithAlerts, downloadIcsFile };
})();
