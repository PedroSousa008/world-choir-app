/**
 * Song We Sang — letter content & timing config.
 * Edit LETTER_CONTENT and TYPE_INTERVAL here; do not hard-code elsewhere.
 */
const SongWeSangLetterContent = (() => {
  /** Milliseconds between each revealed character. Tune later. */
  const TYPE_INTERVAL = 40;

  /**
   * Structured letter. Supported segment types:
   * - greeting | paragraph | emphasis | line | closing | signature
   * - pause: { type: 'pause', ms: number } — reserved for later; unused in v1
   *
   * `emphasis` renders as strong/bold. `line` is a short standalone line.
   * `signature` is visually separated from the body.
   */
  const LETTER_CONTENT = {
    pageTitle: 'The Song We Sang',
    segments: [
      { type: 'greeting', text: 'Dear John,' },
      { type: 'paragraph', text: 'You once wrote:' },
      { type: 'emphasis', text: "You may say I'm a dreamer." },
      { type: 'paragraph', text: 'For more than half a century, maybe you were.' },
      {
        type: 'paragraph',
        text: 'You imagined a world that seemed too divided to ever come together. A world where, beneath our borders, beliefs, languages and differences, we might remember that we are all simply human.',
      },
      { type: 'paragraph', text: 'Today, millions of people across this Earth sang together.' },
      { type: 'line', text: 'Different countries.' },
      { type: 'line', text: 'Different lives.' },
      { type: 'line', text: 'Different stories.' },
      { type: 'emphasis', text: 'One song. One moment. One world.' },
      { type: 'paragraph', text: "So perhaps you weren't such a dreamer after all." },
      {
        type: 'paragraph',
        text: 'You also hoped that someday, the rest of us would join you — and that the world would be as one.',
      },
      { type: 'paragraph', text: 'John...' },
      { type: 'emphasis', text: 'Someday was today.' },
      { type: 'paragraph', text: 'For a few minutes, the world did join together.' },
      {
        type: 'paragraph',
        text: "Not because our differences disappeared, but because, for once, they didn't matter.",
      },
      {
        type: 'paragraph',
        text: 'People who may never meet, who live thousands of kilometres apart, took the same breath and sang the same words at the same moment.',
      },
      {
        type: 'paragraph',
        text: 'And somewhere above all the borders we created, their voices became one.',
      },
      {
        type: 'paragraph',
        text: 'Tomorrow, the world will still have its divisions. One song cannot erase them.',
      },
      { type: 'paragraph', text: "But today, we have something we didn't have before:" },
      { type: 'emphasis', text: 'proof that we can come together.' },
      {
        type: 'paragraph',
        text: 'You imagined us before we were ready to imagine ourselves.',
      },
      { type: 'paragraph', text: 'We wish you could have heard us.' },
      { type: 'paragraph', text: 'And wherever you are, we hope you know:' },
      { type: 'emphasis', text: 'The dream is still alive.' },
      { type: 'emphasis', text: 'And today, the world sang it back to you.' },
      { type: 'closing', text: 'With love and gratitude,' },
      { type: 'signature', text: 'The world we live in' },
    ],
  };

  function getPlainText(content = LETTER_CONTENT) {
    return (content.segments || [])
      .filter((s) => s && s.type !== 'pause' && typeof s.text === 'string')
      .map((s) => s.text)
      .join('\n\n');
  }

  return {
    TYPE_INTERVAL,
    LETTER_CONTENT,
    getPlainText,
  };
})();
