/**
 * World Choir — Practice Mode configuration
 * Edit song URL and lyrics here.
 */
const WorldChoirPracticeConfig = (() => {
  const PRACTICE_SONG = {
    title: 'Imagine',
    artist: 'John Lennon',
    audioUrl: '/audio/imagine.mp3',
  };

  const PRACTICE_LYRICS = [
    { time: 0, text: "Imagine there's no heaven" },
    { time: 5, text: "It's easy if you try" },
    { time: 10, text: 'No hell below us' },
    { time: 15, text: 'Above us only sky' },
    { time: 20, text: 'Imagine all the people' },
    { time: 25, text: 'Living for today' },
    { time: 30, text: "Imagine there's no countries" },
    { time: 35, text: "It isn't hard to do" },
    { time: 40, text: 'Nothing to kill or die for' },
    { time: 45, text: 'And no religion too' },
    { time: 50, text: 'Imagine all the people' },
    { time: 55, text: 'Living life in peace' },
    { time: 60, text: "You may say I'm a dreamer" },
    { time: 65, text: "But I'm not the only one" },
    { time: 70, text: "I hope someday you'll join us" },
    { time: 75, text: 'And the world will be as one' },
    { time: 80, text: 'Imagine no possessions' },
    { time: 85, text: 'I wonder if you can' },
    { time: 90, text: 'No need for greed or hunger' },
    { time: 95, text: 'A brotherhood of man' },
    { time: 100, text: 'Imagine all the people' },
    { time: 105, text: 'Sharing all the world' },
    { time: 110, text: "You may say I'm a dreamer" },
    { time: 115, text: "But I'm not the only one" },
    { time: 120, text: "I hope someday you'll join us" },
    { time: 125, text: 'And the world will be as one' },
  ];

  return { PRACTICE_SONG, PRACTICE_LYRICS };
})();
