/**
 * Negated words in spoken or typed feedback: "not black", "no embroidery",
 * "don't make it bigger", "nothing cheap", "a hoodie instead of a tee".
 *
 * The keyword parsers (`commands.mjs` for the studio, `guide.mjs` for the
 * wardrobe chat) look for words anywhere in a clause, so before this a
 * negated word was read as a request for it: "don't make it bigger" made it
 * bigger and "not for men" chose men's fit. `splitNegations` cuts each
 * negated stretch out of the text and hands it back separately, so the
 * parsers act on what was asked for and can report what was turned down.
 *
 * A negated stretch runs from the negating word to the end of the clause:
 * the next comma, full stop, "but", "and", "or", "instead", "rather",
 * "just", "only" or another negation, and at most MAX_WORDS words. Quoted
 * text ("add the text \"No Fear\"") is never touched, and phrases that look
 * negative but are not ("not just", "not only", "no more than", "never
 * mind", "no matter") are left alone.
 *
 * Deterministic and English only; nothing leaves the browser.
 */

export const MAX_WORDS = 4;

// Longest first so "instead of" wins over a bare word inside it.
const NEGATORS = [
  "anything but", "instead of", "rather than", "other than", "apart from", "except for",
  "do not", "does not", "don't", "doesn't", "dont", "doesnt", "won't", "wont",
  "isn't", "isnt", "aren't", "arent", "shouldn't", "not", "no", "never", "nothing", "without", "except", "nor",
];
// Not a negation of what follows.
const FALSE_FRIENDS = /^(?:not (?:just|only|sure|bad)|no (?:more|less|later|earlier|fewer|bigger|smaller|longer|shorter|matter|problem|worries)\b|nothing (?:else|more)|never mind|do not know|don't know|dont know)/;
const STOP = new Set(["but", "and", "or", "instead", "rather", "just", "only", "though", "so", "then", "please", "because", "yet"]);

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NEG_RE = new RegExp(`(^|[^a-z'])(${NEGATORS.map(escapeRe).join("|")})(?=$|[^a-z'])`, "gi");

/**
 * @param {string} text
 * @returns {{ kept: string, negated: { cue: string, words: string }[] }}
 *   `kept` is the text with every negated stretch (and its cue word) blanked
 *   to spaces, same length and same case as the input, so offsets still line
 *   up; `negated` lists each stretch, lower-cased, in order.
 */
export function splitNegations(text) {
  const src = String(text ?? "");
  // Quoted text is the designer's own words: mask it so nothing inside counts.
  const masked = src.replace(/["“”‘’]([^"“”‘’]{0,80})["“”‘’]/g, m => "\u0001".repeat(m.length));
  const lower = masked.toLowerCase().replace(/’/g, "'");
  const out = src.split("");
  const negated = [];
  let m;
  NEG_RE.lastIndex = 0;
  const cutUntil = [];
  while ((m = NEG_RE.exec(lower))) {
    const cueStart = m.index + m[1].length;
    if (cutUntil.length && cueStart < cutUntil[cutUntil.length - 1]) continue;
    const cue = m[2].toLowerCase();
    if (FALSE_FRIENDS.test(lower.slice(cueStart))) continue;
    const afterCue = cueStart + cue.length;
    // Words after the cue, up to a stop word, a clause mark or another cue.
    const rest = lower.slice(afterCue);
    const end = rest.search(/[,.;:!?\u0001]|\n/);
    const window = end < 0 ? rest : rest.slice(0, end);
    const words = [];
    let consumed = 0;
    const wordRe = /\s*([a-z0-9'%$€£/-]+)/gy;
    let w;
    while ((w = wordRe.exec(window)) && words.length < MAX_WORDS) {
      const token = w[1];
      if (STOP.has(token) || NEGATORS.includes(token)) break;
      words.push(token);
      consumed = wordRe.lastIndex;
    }
    if (!words.length) {
      // A bare "no" or "not" (an answer, a hesitation): drop the cue only.
      for (let i = cueStart; i < afterCue; i++) out[i] = " ";
      cutUntil.push(afterCue);
      continue;
    }
    const stop = afterCue + consumed;
    for (let i = cueStart; i < stop; i++) out[i] = " ";
    negated.push({ cue, words: words.join(" ") });
    cutUntil.push(stop);
    NEG_RE.lastIndex = stop;
  }
  return { kept: out.join(""), negated };
}
