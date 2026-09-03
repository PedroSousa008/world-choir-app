/**
 * Song We Sang — letter content & timing config.
 * Edit LETTER_CONTENT and LETTER_CHARACTER_INTERVAL_MS here;
 * do not hard-code these values elsewhere.
 *
 * Segment types:
 *   greeting   → Brittany Signature 15px  "Dear John,"
 *   paragraph  → Special Elite 8px        body paragraphs
 *   line       → Special Elite 8px        short standalone lines
 *   emphasis   → Special Elite 8px        isolated highlighted phrases
 *   closing    → Caveat 10px              "With love and gratitude,"
 *   signature  → Brittany Signature 15px  "The World We Live In"
 *   pause      → { type:'pause', ms:N }   reserved for future timing; unused in v1
 */
const SongWeSangLetterContent = (() => {

  /** Milliseconds between each revealed character. Tune later. */
  const LETTER_CHARACTER_INTERVAL_MS = 90;

  /** Back-compat alias */
  const TYPE_INTERVAL = LETTER_CHARACTER_INTERVAL_MS;

  const LETTER_CONTENT = {
    pageTitle: 'A Letter to John Lennon',
    segments: [
      { type: 'greeting',  text: 'Dear John,' },

      { type: 'paragraph', text: 'You once wrote: “You may say I\'m a dreamer.”' },

      { type: 'paragraph', text: 'For more than half a century, maybe you were.' },

      { type: 'paragraph', text: 'You imagined a world where, beneath our borders, beliefs and differences, we might remember that we are all simply human.' },

      { type: 'paragraph', text: 'Today, millions of people across this Earth sang together. Different countries, different lives, different stories.' },

      { type: 'emphasis',  text: 'One song. One moment. One world.' },

      { type: 'paragraph', text: 'So perhaps you weren\'t such a dreamer after all.' },

      { type: 'paragraph', text: 'You also hoped that someday we would join you — and that the world would be as one.' },

      { type: 'paragraph', text: 'John...' },

      { type: 'emphasis',  text: 'Someday was today.' },

      { type: 'paragraph', text: 'For a few minutes, the world did join together. Not because our differences disappeared, but because, for once, they didn\'t matter.' },

      { type: 'paragraph', text: 'People thousands of kilometres apart took the same breath, sang the same words, at the same moment. And somewhere above all the borders we created, their voices became one.' },

      { type: 'paragraph', text: 'You imagined us before we were ready to imagine ourselves. We wish you could have heard us.' },

      { type: 'emphasis',  text: 'Wherever you are, we hope you know:' },

      { type: 'paragraph', text: 'The dream is still alive. And today, the world sang it back to you.' },

      { type: 'closing',   text: 'With love and gratitude,' },
      { type: 'signature', text: 'The World We Live In' },
    ],
  };

  function getPlainText(content) {
    const c = content || LETTER_CONTENT;
    return (c.segments || [])
      .filter((s) => s && s.type !== 'pause' && typeof s.text === 'string')
      .map((s) => s.text)
      .join('\n\n');
  }

  return {
    LETTER_CHARACTER_INTERVAL_MS,
    TYPE_INTERVAL,          // back-compat
    LETTER_CONTENT,
    getPlainText,
  };
})();
