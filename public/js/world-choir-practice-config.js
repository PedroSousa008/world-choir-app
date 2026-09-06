/**
 * World Choir — Practice Mode configuration
 * Edit song URL and lyrics here.
 */
const WorldChoirPracticeConfig = (() => {
  const PRACTICE_SONG = {
    title: 'Imagine',
    artist: 'John Lennon',
    // Query bust for CDN/browser cache; file content unchanged.
    audioUrl: '/audio/imagine.mp3?v=20260906a',
  };

  // Each line is active from its `time` until the next line's `time`.
  const PRACTICE_LYRICS = [
    { time: 0, text: "Imagine there's no heaven" },
    { time: 16.55, text: "It's easy if you try" },
    { time: 26, text: 'No hell below us' },
    { time: 33, text: 'Above us only sky' },
    { time: 39, text: 'Imagine all the people' },
    { time: 44, text: 'Living for today' },
    { time: 52, text: "Imagine there's no countries" },
    { time: 58, text: "It isn't hard to do" },
    { time: 65, text: 'Nothing to kill or die for' },
    { time: 70, text: 'And no religion too' },
    { time: 77, text: 'Imagine all the people' },
    { time: 83, text: 'Living life in peace' },
    { time: 91, text: "You may say I'm a dreamer" },
    { time: 97, text: "But I'm not the only one" },
    { time: 102, text: "I hope someday you'll join us" },
    { time: 109, text: 'And the world will be as one' },
    { time: 116, text: 'Imagine no possessions' },
    { time: 121, text: 'I wonder if you can' },
    { time: 127, text: 'No need for greed or hunger' },
    { time: 133, text: 'A brotherhood of man' },
    { time: 140, text: 'Imagine all the people' },
    { time: 146, text: 'Sharing all the world' },
    { time: 154, text: "You may say I'm a dreamer" },
    { time: 160, text: "But I'm not the only one" },
    { time: 165, text: "I hope someday you'll join us" },
    { time: 171, text: 'And the world will be as one' },
  ];

  /** Idle warm of Practice audio (HTTP cache only — does not start playback). */
  let warmStarted = false;
  function warmPracticeAudio() {
    if (warmStarted) return;
    warmStarted = true;
    try {
      const a = new Audio();
      a.preload = 'auto';
      a.src = PRACTICE_SONG.audioUrl;
      // Hint the browser without playing.
      if (typeof a.load === 'function') a.load();
    } catch {
      /* ignore */
    }
  }

  function scheduleWarmPracticeAudio() {
    const run = () => warmPracticeAudio();
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 4000 });
    } else {
      window.setTimeout(run, 1800);
    }
  }

  return { PRACTICE_SONG, PRACTICE_LYRICS, warmPracticeAudio, scheduleWarmPracticeAudio };
})();
