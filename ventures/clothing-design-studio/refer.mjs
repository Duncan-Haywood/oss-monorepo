/**
 * Questions and references to earlier versions in spoken or typed feedback.
 *
 * A designer talking to the studio does not only give orders. They ask
 * ("isn't navy better?", "how much is embroidery?") and point back at what
 * they saw a minute ago ("go back to the cream", "the previous colour was
 * nicer", "undo the last two", "back to the original"). The keyword parser in
 * `commands.mjs` reads a clause as an order, so before this module:
 *
 *   - "isn't navy better" was read as turning navy down (the negation cut);
 *   - "is embroidery more expensive" switched the print to embroidery;
 *   - "go back to the cream" ran a single undo, whatever the last change was;
 *   - "the previous colour" and "undo the last two" were not understood.
 *
 * `readQuestion` sorts a clause into an order (null), a suggestion asked as a
 * question (tried, since every change is undoable and the designer wants to
 * see it), or a question for information (nothing changed; the page answers
 * what it can). `resolveReference` reads a clause that points at the design
 * history and turns it into ordinary operations (restoring one attribute, so
 * later work is kept) or into an undo count or a whole earlier version.
 *
 * Deterministic and English only; nothing leaves the browser.
 */

import { COLOURS, GARMENTS, METHODS } from "./catalogue.mjs";
import { MOTIFS } from "./motifs.mjs";

// ---------------------------------------------------------------- questions

const BETTER = String.raw`(?:be |look |work |go |seem |feel |read |sell )?(?:better|nicer|best|good|great|cooler|stronger|cleaner|classier|more (?:elegant|striking|interesting|readable)|work|suit (?:it|the design|this)?)`;

// Suggestions asked as questions. Each returns the order inside them.
const SUGGEST = [
  // "what about navy", "how about a hoodie"
  [/^(?:so |and |but |hmm+ |ok(?:ay)? )?(?:what|how) about\s+(.+)$/, m => m[1]],
  // "why not navy", "why don't we try a hoodie", "why not make it bigger"
  [/^why (?:not|don't we|dont we|don't you|dont you)\s+(?:try\s+|use\s+|go with\s+|have\s+)?(.+)$/, m => m[1]],
  // "what if we did it in white", "what if we made it bigger", "what if it was navy"
  [/^what if (?:we|i|you|it)\s+(did it|do it|made it|make it|tried|try|used|use|went with|go with|put it|had it|have it|was|were|is)\b\s*(.*)$/,
    m => ({ "made it": "make it ", "make it": "make it ", "used": "use ", "use": "use ", "put it": "put it ", "was": "make it ", "were": "make it ", "is": "make it " }[m[1]] ?? "") + m[2]],
  // "maybe navy?" (needs the question mark or a short body: "maybe" also opens hedged orders)
  [/^(?:maybe|perhaps)\s+(.+)$/, (m, q) => (q || m[1].split(/\s+/).length <= 3 ? m[1] : null)],
  // "could we try navy", "should we make it bigger", "can I see it in cream"
  [/^(?:can|could|shall|should|may) (?:we|i)\s+(?:try|do|go with|use|have|get|see|switch to|put|make|add|move|change)\b\s*(.*)$/, m => m[0].replace(/^(?:can|could|shall|should|may) (?:we|i)\s+/, "").replace(/^(?:try|do|go with|use|have|get|see)\s+/, "")],
  // "wouldn't it look better in navy", "would it be nicer as a hoodie", "isn't it better on the back"
  [new RegExp(String.raw`^(?:would|wouldn't|wouldnt|will|won't|wont|isn't|isnt|is|might|could|does|doesn't|doesnt) (?:it|this|that|the (?:shirt|tee|garment|design|print|hoodie))\s+${BETTER}\s+(?:in|as|with|on|if (?:it was|it were|we used|we made it)|if)\s+(.+)$`), m => m[1]],
  // "isn't navy better", "would navy look better", "wouldn't a hoodie be nicer", "is cream better than white"
  [new RegExp(String.raw`^(?:would|wouldn't|wouldnt|will|won't|wont|isn't|isnt|is|might|could|does|doesn't|doesnt|maybe)\s+(.+?)\s+${BETTER}(?:\s+than\s+.*)?$`), m => m[1].replace(/^(?:a|an|the)\s+/, "")],
  // "do you think navy would work", "do you think it should be bigger"
  [new RegExp(String.raw`^(?:do you think|don't you think|dont you think)\s+(.+?)\s+(?:would|might|could|will)\s+${BETTER}.*$`), m => m[1]],
  [/^(?:do you think|don't you think|dont you think)\s+it (?:should|could|would) be\s+(.+)$/, m => `make it ${m[1]}`],
];

// A question about information. Whatever follows is not an order.
const ASK = /^(?:how (?:much|many|long|big|heavy|thick)|what(?:'s| is| are| does| do| would| will| colou?rs?| fabrics?| sizes?| methods?)?|which|when|where|who|why|is|are|does|do (?:you|we|i|they)|did|will|was|were|has|have (?:you|we|i|they)|isn't|isnt|aren't|arent|doesn't|doesnt)\b/;
// Polite orders that look like questions: the parser strips these and obeys.
const POLITE = /^(?:can|could|would|will) you\b|^(?:can|could) (?:we|i) (?:please )?(?:have|get)\b(?!.*\b(?:better|cheaper|more|less)\b)/;

/**
 * @param {string} clause one clause, lower or mixed case
 * @param {boolean} [questionMark] the clause ended with "?" in the original
 * @returns {null | { kind: "suggest", body: string } | { kind: "ask", topic: string|null }}
 *   null for an order (parse as usual).
 */
export function readQuestion(clause, questionMark = false) {
  const c = String(clause ?? "").toLowerCase().replace(/’/g, "'").replace(/\s+/g, " ").trim();
  if (!c) return null;
  if (/^(?:never mind|no matter)\b/.test(c)) return null;
  // "when it still had the halo" points at a version, not a question (unless asked with "?").
  if (!questionMark && /^(?:back )?when (?:it|we|i) (?:still )?(?:had|was|were|used|made it)\b/.test(c)) return null;
  if (POLITE.test(c) && !/\b(?:better|nicer|cheaper|more expensive|cost|price)\b/.test(c)) return null;
  for (const [re, pick] of SUGGEST) {
    const m = re.exec(c);
    if (!m) continue;
    const body = pick(m, questionMark);
    if (body && body.trim()) return { kind: "suggest", body: body.trim() };
  }
  if (ASK.test(c) || questionMark) return { kind: "ask", topic: questionTopic(c) };
  return null;
}

/** What an information question is about, for the page's answer: "cost", "colours", ... or null. */
export function questionTopic(c) {
  if (/\b(?:how much|cost|price|expensive|cheap(?:er|est)?|afford|margin|profit)\b/.test(c)) return "cost";
  if (/\b(?:how long|when|lead time|weeks?|days?)\b/.test(c)) return "timeline";
  if (/\b(?:colou?rs?)\b/.test(c) && /\b(?:what|which|have|are there|available|options?)\b/.test(c)) return "colours";
  if (/\b(?:fabrics?|materials?|cloth)\b/.test(c)) return "fabrics";
  if (/\b(?:methods?|print(?:ing)?|embroider(?:y|ed)?|puff|screen|dtg|dtf|raised|3d)\b/.test(c)) return "methods";
  if (/\b(?:sizes?|fit|measure)\b/.test(c)) return "sizes";
  return null;
}

// --------------------------------------------------------------- references

const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, an: 1, once: 1, twice: 2, thrice: 3 };
const num = s => (s == null ? 1 : /^\d+$/.test(s) ? Number(s) : NUM[s] ?? 1);

// What a design attribute is called, and how to read and restore it.
const selectedId = d => d?.selected ?? d?.placements?.at(-1)?.id ?? null;
const placementOf = (d, id) => d?.placements?.find(p => p.id === id) ?? null;
const round1 = v => Math.round(v * 10) / 10;

export const ATTRIBUTES = [
  { key: "colour", words: /\b(?:colou?r|shade|garment colou?r|base colou?r)\b/, label: "garment colour",
    get: d => d.colour, show: d => d.colourName || d.colour,
    restore: (from, to) => [{ op: "colour", value: from.colour, name: from.colourName }] },
  { key: "garment", words: /\b(?:garment|shirt type|style|cut|product|piece)\b/, label: "garment",
    get: d => d.garment, show: d => d.garment,
    restore: from => [{ op: "garment", value: from.garment }] },
  { key: "fabric", words: /\b(?:fabric|material|cloth|weight|gsm)\b/, label: "fabric",
    get: d => `${d.fabric}@${d.gsm}`, show: d => `${d.fabric} ${d.gsm} gsm`,
    restore: from => [{ op: "fabric", value: from.fabric }, { op: "gsm", value: from.gsm }] },
  { key: "method", words: /\b(?:method|decoration|technique|print(?:ing)? (?:method|type)|finish)\b/, label: "decoration method", placement: true,
    get: (d, id) => placementOf(d, id)?.method, show: (d, id) => placementOf(d, id)?.method,
    restore: (from, to, id) => [{ op: "select", id }, { op: "method", value: placementOf(from, id).method }] },
  { key: "ink", words: /\b(?:ink|print colou?r|text colou?r|thread colou?r)\b/, label: "ink colour", placement: true,
    get: (d, id) => placementOf(d, id)?.ink, show: (d, id) => placementOf(d, id)?.ink,
    restore: (from, to, id) => [{ op: "select", id }, { op: "ink", value: placementOf(from, id).ink }] },
  { key: "size", words: /\b(?:size|scale|width)\b/, label: "print size", placement: true,
    get: (d, id) => placementOf(d, id)?.w, show: (d, id) => `${round1(placementOf(d, id)?.w)} cm wide`,
    restore: (from, to, id) => [{ op: "select", id }, { op: "width", value: placementOf(from, id).w }] },
  { key: "position", words: /\b(?:position|place(?:ment)?|spot|location)\b/, label: "print position", placement: true,
    get: (d, id) => { const p = placementOf(d, id); return p ? `${p.area}:${p.x}:${p.y}` : undefined; },
    show: (d, id) => { const p = placementOf(d, id); return `${p.area}, ${round1(p.x)} / ${round1(p.y)} cm`; },
    restore: (from, to, id) => {
      const a = placementOf(from, id); const b = placementOf(to, id);
      const ops = [{ op: "select", id }];
      if (a.area !== b.area) ops.push({ op: "area", value: a.area });
      ops.push({ op: "moveTo", x: a.x, y: a.y });
      return ops;
    } },
  { key: "angle", words: /\b(?:angle|rotation|tilt)\b/, label: "rotation", placement: true,
    get: (d, id) => placementOf(d, id)?.rotate ?? undefined, show: (d, id) => `${placementOf(d, id)?.rotate || 0} degrees`,
    restore: (from, to, id) => [{ op: "select", id }, { op: "rotate", deg: (placementOf(from, id).rotate || 0) - (placementOf(to, id).rotate || 0) }] },
  { key: "price", words: /\b(?:price|selling price|retail)\b/, label: "selling price",
    get: d => d.price, show: d => String(d.price), restore: from => [{ op: "price", value: from.price }] },
  { key: "quantity", words: /\b(?:quantity|run|order size|number of pieces|amount)\b/, label: "run size",
    get: d => d.quantity, show: d => String(d.quantity), restore: from => [{ op: "quantity", value: from.quantity }] },
];

/** The attributes that differ between two designs (placement ones for the given artwork id). */
export function changedAttributes(a, b, id = selectedId(b)) {
  return ATTRIBUTES.filter(attr => {
    if (attr.placement && (!placementOf(a, id) || !placementOf(b, id))) return false;
    return attr.get(a, id) !== attr.get(b, id);
  });
}

const BACK = String.raw`(?:go (?:back|back to)|back|bring (?:back|it back)|switch back|change (?:it )?back|revert|return|take (?:it|me|us) back|put (?:it )?back|let's go back|lets go back|i (?:liked|preferred) (?:it with )?)`;
const PREV = String.raw`(?:previous|last|old|older|earlier|former|prior|original|first|initial|starting|other)`;

/**
 * Read a clause that refers to the design history.
 * @param {string} clause
 * @param {object[]} timeline designs oldest first, the present last
 * @param {(text: string, design: object) => ({ops: object[]} | null)} parse the
 *   clause parser (`parseClause`), used to read "the cream" or "the hoodie"
 * @returns {null | { ops: object[], ui: object[], did: string }}
 */
export function resolveReference(clause, timeline, parse) {
  // The parser has already turned "one" into "1": "the other 1", "the cream 1".
  const c = String(clause ?? "").toLowerCase().replace(/’/g, "'").replace(/\s+/g, " ").trim()
    .replace(/([a-z]) 1\b(?!\s*(?:cm|mm|%|in\b|inch|centi|milli|per))/g, "$1 one");
  const line = Array.isArray(timeline) && timeline.length ? timeline : null;
  if (!c) return null;
  const present = line?.at(-1);

  // "undo the last two", "undo twice", "go back three steps", "undo 3 changes"
  const undoN = new RegExp(String.raw`^(?:undo|${BACK})\s+(?:the\s+)?(?:last\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twice|thrice)(?:\s+(?:steps?|changes?|times|edits?|things?|moves?))?$`).exec(c)
    ?? /^undo\s+(?:that\s+)?(twice|thrice|\d+ times|two times|three times)$/.exec(c);
  if (undoN) {
    const n = Math.min(50, num(undoN[1].replace(/ times$/, "")));
    if (n > 1) return { ops: [], ui: [{ ui: "undo", count: n }], did: `Undo the last ${n} changes` };
    return { ops: [], ui: [{ ui: "undo" }], did: "Undo the last change" };
  }

  // "back to the original", "start over", "the first version", "how it was at the start"
  if (new RegExp(String.raw`^(?:${BACK}\s+)?(?:to\s+)?(?:the\s+)?(?:original|very first|first|starting|initial)(?:\s+(?:one|version|design))?$|^(?:start (?:over|again)|from the (?:start|top)|back to (?:the )?(?:start|beginning)|(?:${BACK}\s+)?(?:to\s+)?how it was (?:at the (?:start|beginning)|originally))$`).test(c)) {
    if (!line || line.length < 2) return { ops: [], ui: [], did: "This is already the first version" };
    return { ops: [], ui: [{ ui: "restore", index: 0 }], did: "Back to the first version of this session (one undo brings this one back)" };
  }

  // "the one with the halo", "the version without the text", "before I added the wings"
  const whole = describedVersion(c, line);
  if (whole) return whole;

  // "the previous colour", "the old fabric", "the other colour", "the colour before", "the original size"
  const named = ATTRIBUTES.find(a => a.words.test(c));
  const prevWord = new RegExp(String.raw`\b${PREV}\b`).exec(c)?.[0];
  const beforeWord = /\b(?:before(?: that)?|from before|we had|it was|i had)\b/.test(c);
  const namedShape = new RegExp(String.raw`^(?:${BACK}\s+)?(?:to\s+)?(?:use\s+|make it\s+|try\s+|i (?:liked|preferred)\s+)?(?:the|my)\s+(?:${PREV}\s+)?(?:[a-z-]+\s+)?${named ? named.words.source.replace(/\\b/g, "") : "x^"}(?:\s+(?:${PREV}|before(?: that)?|from before|we had|it was|i had))?(?:\s+(?:was|looked|is) (?:better|nicer|best|great))?(?:\s+(?:again|back|please))?$`);
  if (named && (prevWord || beforeWord) && namedShape.test(c)) {
    return restoreAttribute(named, line, prevWord === "original" || prevWord === "first" || prevWord === "initial" || prevWord === "starting" ? "first" : "previous");
  }

  // "the other one", "the one before", "the previous one", "the last one was better"
  if (new RegExp(String.raw`^(?:${BACK}\s+)?(?:to\s+)?(?:use\s+|try\s+)?the (?:other|previous|one before(?: that)?|earlier|old) (?:one|version|design|look)?\s*(?:was (?:better|nicer|best)|please)?$|^the (?:one|version) before(?: that)?(?: was (?:better|nicer))?$|^(?:the )?last one was (?:better|nicer)$`).test(c)) {
    if (!line || line.length < 2) return { ops: [], ui: [], did: "There is no earlier version yet" };
    const last = changedAttributes(line.at(-2), present);
    if (last.length === 1) return restoreAttribute(last[0], line, "previous");
    return { ops: [], ui: [{ ui: "undo" }], did: "Back to the version before the last change" };
  }

  // "go back to the cream", "back to the hoodie", "the cream was better", "bring back screen print"
  const backTo = new RegExp(String.raw`^(?:${BACK})\s+(?:to\s+)?(?:the\s+|a\s+|an\s+)?(.+?)(?:\s+(?:one|version|again|instead|please))*$`).exec(c)
    ?? /^(?:the|that)\s+(.+?)(?:\s+(?:one|version))?\s+(?:was|looked|is) (?:better|nicer|best|great)$/.exec(c);
  if (backTo && typeof parse === "function") {
    const what = backTo[1].replace(/\b(?:one|version)$/, "").trim();
    if (!what || /^(?:it|that|this|how it was|before|the way it was|where it was|what it was)$/.test(what)) {
      return { ops: [], ui: [{ ui: "undo" }], did: "Undo the last change" };
    }
    const asColour = COLOURS[what] ? `make it ${what}` : what;
    const r = [asColour, `put it on the ${what}`].map(t => parse(t, present)).find(x => x && x.ops.length);
    if (!r) return null;
    const when = line ? whenSeen(r.ops, line) : null;
    const note = when == null ? " (not seen earlier in this session; applied as asked)" : when === 0 ? " (as at the start)" : ` (as ${when} change${when === 1 ? "" : "s"} ago)`;
    return { ops: r.ops, ui: [], did: `Back to ${what}${note}` };
  }
  return null;
}

/** How many changes ago the design last matched every op's value, or null. */
function whenSeen(ops, line) {
  const matches = d => ops.every(o => {
    if (o.op === "colour") return d.colourName === o.value || d.colour === (COLOURS[o.value] ?? o.value);
    if (o.op === "garment") return d.garment === o.value;
    if (o.op === "fabric") return d.fabric === o.value;
    if (o.op === "gsm") return d.gsm === o.value;
    if (o.op === "method") return placementOf(d, selectedId(d))?.method === o.value;
    if (o.op === "area") return placementOf(d, selectedId(d))?.area === o.value;
    if (o.op === "price") return d.price === o.value;
    if (o.op === "quantity") return d.quantity === o.value;
    return false;
  });
  for (let i = line.length - 2; i >= 0; i--) if (matches(line[i])) return line.length - 1 - i;
  return null;
}

function restoreAttribute(attr, line, which) {
  if (!line || line.length < 2) return { ops: [], ui: [], did: `No earlier ${attr.label} yet` };
  const present = line.at(-1);
  const id = attr.placement ? selectedId(present) : null;
  if (attr.placement && !placementOf(present, id)) return { ops: [], ui: [], did: `No artwork selected to restore the ${attr.label} of` };
  const now = attr.get(present, id);
  let from = null;
  let ago = 0;
  if (which === "first") {
    for (let i = 0; i < line.length - 1; i++) if (!attr.placement || placementOf(line[i], id)) { from = line[i]; ago = line.length - 1 - i; break; }
  } else {
    for (let i = line.length - 2; i >= 0; i--) {
      if (attr.placement && !placementOf(line[i], id)) break;
      if (attr.get(line[i], id) !== now) { from = line[i]; ago = line.length - 1 - i; break; }
    }
  }
  if (!from || attr.get(from, id) === now) return { ops: [], ui: [], did: `The ${attr.label} has not changed${which === "first" ? " since the start" : " yet"}` };
  return {
    ops: attr.restore(from, present, id),
    ui: [],
    did: `Back to the ${which === "first" ? "original" : "previous"} ${attr.label}: ${attr.show(from, id)} (from ${ago} change${ago === 1 ? "" : "s"} ago; the rest of the design is kept)`,
  };
}

// ------------------------------------------------------- whole versions

// What a clause says a version had. Words for the garment, decoration method
// and print area, kept here (not imported from commands.mjs, which imports
// this module).
const V_GARMENTS = [
  ["hoodie", /\b(?:hoodie|hoody|hooded)\b/],
  ["crewneck", /\b(?:crew ?neck|sweatshirt|jumper|sweater)\b/],
  ["longsleeve", /\blong[- ]?sleeve(?:d)?\b/],
  ["tee", /\b(?:t-?shirt|tee)\b/],
];
const V_METHODS = [
  ["3d-puff-embroidery", /\b(?:3d|puff|raised) embroider(?:y|ed)\b/],
  ["embroidery", /\bembroider(?:y|ed)\b|\bstitched\b/],
  ["puff", /\bpuff(?: print| ink)?\b/],
  ["high-density", /\b(?:3d|raised|high[- ]density|embossed)(?: print)?\b/],
  ["sublimation", /\bsublimat(?:ed|ion)\b|\ball[- ]over\b/],
  ["dtf", /\b(?:dtf|transfer)\b/],
  ["dtg", /\b(?:dtg|digital print)\b/],
  ["screen", /\bscreen[- ]?print(?:ed|ing)?\b/],
];
const V_AREAS = /\bon (?:the )?(front|back|chest|left chest|sleeve)\b/;
const V_COLOURS = Object.keys(COLOURS).sort((a, b) => b.length - a.length);
const MOTIF_WORDS = Object.values(MOTIFS)
  .flatMap(m => m.words.map(w => [w, m.id]))
  .sort((a, b) => b[0].length - a[0].length);

const AREA_ID = a => (a === "left chest" ? "chest" : a);

/** Read the features named in a description ("with the halo on the back", "where it was a cream tee"). */
export function versionFeatures(desc) {
  let rest = ` ${desc} `;
  const out = [];
  // "without (any|the) X" and "no X" name what the version did not have.
  const negs = [];
  rest = rest.replace(/\b(?:without|with no|minus|before (?:it had|there was))\s+(?:any\s+|the\s+|a\s+|an\s+)?((?:[a-z"'-]+\s?){1,4}?)(?=\s+(?:and|but|on|in|where|with)\b|\s*$)/g, (_, w) => { negs.push(w); return " "; });
  const read = (text, absent) => {
    let t = ` ${text} `;
    const found = [];
    const quoted = /"([^"]{1,60})"/.exec(t)?.[1];
    for (const [word, id] of MOTIF_WORDS) {
      const m = new RegExp(String.raw`\b${word}\b(?:\s+(?:motif|print|graphic))?(\s+on (?:the )?(?:front|back|chest|left chest|sleeve)\b)?`).exec(t);
      if (!m || found.some(f => f.motif === id)) continue;
      const area = m[1] ? AREA_ID(V_AREAS.exec(m[1])[1]) : null;
      found.push({ kind: "motif", motif: id, area, label: MOTIFS[id].label.toLowerCase() });
      t = t.replace(m[0], " ");
    }
    const tm = /\b(?:text|words|lettering|writing|slogan|caption)\b(\s+on (?:the )?(?:front|back|chest|left chest|sleeve)\b)?/.exec(t);
    if (tm || quoted) {
      found.push({ kind: "text", text: quoted ?? null, area: tm?.[1] ? AREA_ID(V_AREAS.exec(tm[1])[1]) : null, label: quoted ? `"${quoted}"` : "text" });
      if (tm) t = t.replace(tm[0], " ");
    }
    const im = /\b(?:image|picture|painting|photo|upload)\b(\s+on (?:the )?(?:front|back|chest|left chest|sleeve)\b)?/.exec(t);
    if (im) { found.push({ kind: "image", area: im[1] ? AREA_ID(V_AREAS.exec(im[1])[1]) : null, label: "uploaded image" }); t = t.replace(im[0], " "); }
    if (absent) return found;
    for (const [id, re] of V_METHODS) if (re.test(t)) { found.push({ method: id, label: METHODS[id]?.label.toLowerCase() ?? id }); t = t.replace(re, " "); break; }
    for (const [id, re] of V_GARMENTS) if (re.test(t)) { found.push({ garment: id, label: GARMENTS[id]?.label.toLowerCase() ?? id }); break; }
    const colour = V_COLOURS.find(name => new RegExp(String.raw`\b${name}\b(?!\s+(?:ink|thread|text|letters|lettering))`).test(t));
    if (colour) found.push({ colour, label: colour });
    if (!found.some(f => f.kind)) {
      const a = V_AREAS.exec(t);
      if (a && /\b(?:print|artwork|design|graphic|logo|it)\b/.test(t)) found.push({ kind: null, area: AREA_ID(a[1]), label: `a print on the ${AREA_ID(a[1])}` });
    }
    return found;
  };
  out.push(...read(rest, false));
  for (const n of negs) out.push(...read(n, true).map(f => ({ ...f, absent: true, label: `no ${f.label}` })));
  return out;
}

function placementMatches(p, f) {
  if (f.kind && p.kind !== f.kind) return false;
  if (f.motif && p.motif !== f.motif) return false;
  if (f.text && !String(p.text ?? "").toLowerCase().includes(f.text.toLowerCase())) return false;
  if (f.area && p.area !== f.area) return false;
  return true;
}

/** Does a design have every feature (and lack every absent one)? */
export function versionMatches(d, features) {
  return features.every(f => {
    let ok;
    if (f.garment) ok = d.garment === f.garment;
    else if (f.colour) ok = d.colourName === f.colour || d.colour === COLOURS[f.colour];
    else if (f.method) ok = d.placements.some(p => p.method === f.method);
    else ok = d.placements.some(p => placementMatches(p, f));
    return f.absent ? !ok : ok;
  });
}

/** A short description of a version: "cream T-shirt; sunburst halo (front), "Ave Maria" (back)". */
export function describeVersion(d) {
  const art = d.placements.map(p => `${p.kind === "text" ? `"${p.text}"` : p.kind === "image" ? "image" : (MOTIFS[p.motif]?.label ?? p.label).toLowerCase()} (${p.area}, ${METHODS[p.method]?.label.toLowerCase() ?? p.method})`);
  return `${d.colourName || d.colour} ${(GARMENTS[d.garment]?.label ?? d.garment).toLowerCase()}${art.length ? `; ${art.join(", ")}` : "; no artwork"}`;
}

const V_PRE = /^(?:(?:can|could|shall|should) (?:we|i|you) (?:please )?)?(?:(?:let's |lets )?(?:go|switch|change it|take (?:it|me|us)|get) back(?: to)?|back to|revert to|return to|bring back|show me|give me|pick|use|try|i (?:liked|preferred|prefer|want)|(?:let's |lets )?go with)?\s*/;
const V_POST = /(?:\s+(?:was|looked|is|seemed|looks) (?:a lot |much |way )?(?:better|nicer|best|great|good))?(?:\s+(?:better|more|again|instead|please))*$/;
const V_NOUN = String.raw`(?:one|version|design|look|option|variant)`;
const CONNECT = /^(?:with|without|where|when|that|which|in|on|as|having|from when)\b/;

/**
 * "the one with the halo", "the version without the text", "the cream one with
 * the wings", "when it still had the halo", "before I added the wings": a
 * whole earlier version picked out by what it had, restored as it was (the
 * present stays one undo away). Returns null for any other clause.
 */
export function describedVersion(clause, line) {
  const body = clause.replace(V_PRE, "").replace(V_POST, "").replace(/^to\s+/, "").trim();
  let mode = null;
  let desc = null;
  let m;
  if ((m = new RegExp(String.raw`^(?:the (?:${V_NOUN}|way it was) )?before (?:i |we |you )?(?:added |put on |put |made it |changed it to |switched to |went to |adding |making it |changing it to |it was |it became |it had |there was |we had |the change to )?(?:the |a |an )?(.+)$`).exec(body))) {
    mode = "before"; desc = m[1];
  } else if ((m = /^(?:when|back when) (?:it|we|i) (?:still )?(?:had|was|were|used|did it (?:in|as)|made it) (.+)$/.exec(body))) {
    mode = "with"; desc = m[1];
  } else if ((m = new RegExp(String.raw`^(?:the|that|my) (?:([a-z -]+?) )?${V_NOUN}\s+(.+)$`).exec(body)) && CONNECT.test(m[2])) {
    mode = "with"; desc = `${m[1] ?? ""} ${m[2]}`;
  } else if ((m = /^(?:the|that) ([a-z -]+?) (with|without) (.+)$/.exec(body)) && (V_GARMENTS.some(([, re]) => re.test(m[1])) || V_COLOURS.includes(m[1].replace(/ (?:one|version)$/, "")))) {
    mode = "with"; desc = `${m[1]} ${m[2]} ${m[3]}`;
  }
  if (!mode) return null;
  const features = versionFeatures(desc);
  if (!features.length) return null;
  const what = features.map(f => (f.absent ? f.label : f.kind ? `the ${f.label}` : f.garment ? `a ${f.label}` : f.colour ? `a ${f.colour} garment` : f.label)).join(", ");
  if (!line || !line.length) return { ops: [], ui: [], did: `No earlier version to look through yet` };
  const last = line.length - 1;
  const hit = d => versionMatches(d, features);
  if (mode === "before") {
    for (let i = last; i >= 1; i--) {
      if (hit(line[i]) && !hit(line[i - 1])) {
        if (i - 1 === last) break;
        return restoreWhole(line, i - 1, `before ${what}`);
      }
    }
    if (hit(line[0])) return { ops: [], ui: [], did: `It had ${what} from the first version; nothing changed` };
    return { ops: [], ui: [], did: `No version in this session had ${what}; nothing changed` };
  }
  if (hit(line[last])) return { ops: [], ui: [], did: `This version already has ${what}; nothing changed` };
  for (let i = last - 1; i >= 0; i--) if (hit(line[i])) return restoreWhole(line, i, `with ${what}`);
  return { ops: [], ui: [], did: `No earlier version in this session had ${what}; nothing changed` };
}

function restoreWhole(line, index, why) {
  const ago = line.length - 1 - index;
  return {
    ops: [],
    ui: [{ ui: "restore", index }],
    did: `Back to the version ${why}, from ${ago} change${ago === 1 ? "" : "s"} ago: ${describeVersion(line[index])} (one undo brings this one back)`,
  };
}
