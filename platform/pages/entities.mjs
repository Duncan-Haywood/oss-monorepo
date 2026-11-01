// One HTML entity decoder for every check that compares authored strings
// against rendered page copy.
//
// Two callers used to carry their own four-or-six-entity `.replace()` chains:
// `faq-visible.test.mjs` (comparing JSON-LD Q&A against the visible text) and
// `decodeEntities` in `build.mjs` (reading `<meta>` values back out). Both
// silently mis-decoded anything outside their short list, and the FAQ check
// failed closed on it: `ai-engineering-academy/rc-time-calculator` renders
// `&tau;` and `&micro;s` while its JSON-LD carries the real `τ` and `µ`, so
// five visible Q&A pairs read as absent from a page that displays them.
//
// The lesson from that bug is not "add `&tau;`". It is that a partial table
// fails *silently* on the next character a page reaches for, and the failure
// looks like missing copy -- which invites a session to rewrite prose that is
// already on the page. So this module pairs the table with
// `unknownNamedEntities()`, and `entities.test.mjs` scans the whole portfolio
// with it: a page introducing an entity the table does not know breaks that
// test by name, instead of quietly mismatching somewhere else.

/**
 * Named entities that appear in this repository's HTML, plus the five defined
 * by XML itself.
 *
 * Deliberately not the full HTML5 list (~2,200 names). The guard test keeps
 * this honest in the only direction that matters: a name in use here and
 * missing below is a test failure, not a wrong answer.
 */
export const NAMED_ENTITIES = Object.freeze({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",

  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  eacute: 'é',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  hellip: '…',
  middot: '·',
  bull: '•',
  sect: '§',

  times: '×',
  divide: '÷',
  minus: '−',
  plusmn: '±',
  asymp: '≈',
  ne: '≠',
  le: '≤',
  ge: '≥',
  radic: '√',
  lceil: '⌈',
  rceil: '⌉',
  sup2: '²',
  sup3: '³',
  frac14: '¼',
  frac12: '½',
  frac34: '¾',
  deg: '°',
  prime: '′',
  Prime: '″',

  micro: 'µ',
  tau: 'τ',
  Omega: 'Ω',
  omega: 'ω',
  alpha: 'α',
  beta: 'β',
  pi: 'π',
  mu: 'μ',
  rho: 'ρ',

  larr: '←',
  rarr: '→',
  harr: '↔',

  cent: '¢',
  pound: '£',
  euro: '€',
  yen: '¥',
  copy: '©',
  reg: '®',
  trade: '™',
});

// One pass over the source, so a decoded value is never re-scanned: `&amp;lt;`
// has to come out as the literal text `&lt;`, which a chained
// `.replace(/&amp;/g).replace(/&lt;/g)` turns into `<`.
const ENTITY = /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

/**
 * `html` with its character references resolved.
 *
 * Numeric references decode generically. A named reference this module does
 * not know is left exactly as written rather than dropped -- a visible `&foo;`
 * in a diff is a legible symptom; a silently deleted one is not.
 */
export function decodeEntities(html) {
  return String(html).replace(ENTITY, (whole, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      // Lone surrogates and out-of-range code points would throw.
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      if (code >= 0xd800 && code <= 0xdfff) return whole;
      return String.fromCodePoint(code);
    }
    return Object.hasOwn(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : whole;
  });
}

/** Named references in `html` that `NAMED_ENTITIES` does not define, deduped. */
export function unknownNamedEntities(html) {
  const unknown = new Set();
  for (const [, body] of String(html).matchAll(ENTITY)) {
    if (body[0] === '#') continue;
    if (!Object.hasOwn(NAMED_ENTITIES, body)) unknown.add(`&${body};`);
  }
  return [...unknown];
}
