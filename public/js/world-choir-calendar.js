/**
 * World Choir — Native calendar integration (web / mobile browser)
 * Opens the device calendar app via ICS — never redirects to Google Calendar.
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

  function buildIcs() {
    const start = WorldChoirConfig.getEventStart();
    const end = WorldChoirConfig.getCalendarEventEnd();
    const description = WorldChoirConfig.getCalendarDescription();
    const website = WorldChoirConfig.getWebsiteUrl();

    return [
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
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
  }

  function isIOS() {
    return /iPad|iPhone|iPod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }

  function isMobile() {
    return isIOS() || isAndroid();
  }

  function createIcsBlob() {
    return new Blob([buildIcs()], { type: 'text/calendar;charset=utf-8' });
  }

  function createIcsFile() {
    const blob = createIcsBlob();
    return new File([blob], FILENAME, { type: 'text/calendar' });
  }

  async function shareIcsFile() {
    const file = createIcsFile();
    if (!navigator.share) return false;
    if (navigator.canShare && !navigator.canShare({ files: [file] })) return false;

    await navigator.share({
      title: 'World Choir 2027',
      text: 'Add World Choir 2027 to your calendar',
      files: [file],
    });
    return true;
  }

  function openIcsDataUrl() {
    const ics = buildIcs();
    window.location.assign('data:text/calendar;charset=utf-8,' + encodeURIComponent(ics));
    return true;
  }

  function openIcsBlobUrl() {
    const url = URL.createObjectURL(createIcsBlob());
    const link = document.createElement('a');
    link.href = url;
    link.style.display = 'none';
    if (!isIOS()) {
      link.download = FILENAME;
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  }

  /**
   * @returns {Promise<{ ok: boolean, cancelled?: boolean, error?: string }>}
   */
  async function addToCalendar() {
    try {
      if (isMobile()) {
        try {
          const shared = await shareIcsFile();
          if (shared) return { ok: true };
        } catch (err) {
          if (err?.name === 'AbortError') return { ok: false, cancelled: true };
        }

        if (isIOS()) {
          openIcsDataUrl();
          return { ok: true };
        }

        openIcsBlobUrl();
        return { ok: true };
      }

      try {
        const shared = await shareIcsFile();
        if (shared) return { ok: true };
      } catch (err) {
        if (err?.name === 'AbortError') return { ok: false, cancelled: true };
      }

      openIcsBlobUrl();
      return { ok: true };
    } catch (err) {
      console.error('WorldChoirCalendar.addToCalendar failed:', err);
      return {
        ok: false,
        error: 'We could not open your calendar app. Please try again.',
      };
    }
  }

  return { addToCalendar, buildIcs };
})();
