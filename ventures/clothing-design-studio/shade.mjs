/**
 * Relative colour edits: "make it darker", "a bit more muted", "warmer ink",
 * "lighten the halo", "a darker green". The colour is moved in CIELAB (the
 * same sRGB D65 reading `refer.mjs` uses to compare versions): L* for
 * lightness, chroma C* = hypot(a*, b*) for how vivid, and warmth b* + 0.5 a*
 * (yellow and red warm, blue cool; our own rule of thumb, not a standard).
 *
 * A garment colour has to be bought, so a named catalogue colour that moved
 * the asked way and lands near the target is preferred over a made-up one
 * (`catalogue.mjs` COLOURS). When none is near, the moved colour is kept as a
 * custom colour, named "darker royal blue", and the step says so: a custom
 * garment colour means a lab dip and usually a dye minimum at the mill.
 *
 * Nothing here knows the page; `commands.mjs` calls `readShift` on a clause
 * and `shiftColour` on the design's colour or the selected artwork's ink.
 */

import { COLOURS } from "./catalogue.mjs";
import { toLab } from "./separation.mjs";
import { ciede2000 } from "./colour.mjs";

const STEP = 12; // CIELAB units for a plain "darker" (about one catalogue shade)
const NEAR = 8; // a catalogue colour within this CIEDE2000 of the target is used by name
const SEEN = 2; // a move smaller than this on its dimension counts as no move

const hexToRgb = hex => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ""));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const labOfHex = hex => { const c = hexToRgb(hex); return c ? toLab(...c) : null; };

/** CIE Lab (D65) to sRGB 0-255, unclamped (out of gamut when a channel leaves 0-255). */
export function fromLab([L, a, b]) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = t => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const x = inv(fx) * 0.95047;
  const y = L > 8 ? fy ** 3 : L / (24389 / 27);
  const z = inv(fz) * 1.08883;
  const R = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const G = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const B = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  const enc = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.sign(v) * Math.abs(v) ** (1 / 2.4) - 0.055);
  return [enc(R), enc(G), enc(B)];
}
const inGamut = rgb => rgb.every(v => v >= -0.5 && v <= 255.5);
const toHex = rgb => "#" + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/** Bring a Lab colour into the screen's gamut by lowering chroma at the same L* and hue. */
export function clipLab([L, a, b]) {
  L = Math.max(0, Math.min(100, L));
  if (inGamut(fromLab([L, a, b]))) return [L, a, b];
  let lo = 0; let hi = 1;
  for (let i = 0; i < 24; i++) { const k = (lo + hi) / 2; if (inGamut(fromLab([L, a * k, b * k]))) lo = k; else hi = k; }
  return [L, a * lo, b * lo];
}

/**
 * The furthest point of the move from `lab` toward `target` that a screen
 * shows. Lowering chroma at the target instead (clipLab) can undo the move
 * itself: a blue made cooler and then desaturated ends up warmer than it began.
 */
export function clipMove(lab, target) {
  const at = t => lab.map((v, i) => v + t * (target[i] - v));
  if (inGamut(fromLab(target))) return target;
  if (!inGamut(fromLab(lab))) return clipLab(target);
  let lo = 0; let hi = 1;
  for (let i = 0; i < 24; i++) { const t = (lo + hi) / 2; if (inGamut(fromLab(at(t)))) lo = t; else hi = t; }
  return at(lo);
}

/** The nearest catalogue colour to a hex, by CIEDE2000: { name, deltaE }. */
export function nearestCatalogue(hex, palette = COLOURS) {
  const q = labOfHex(hex);
  let best = null;
  for (const [name, h] of Object.entries(palette)) {
    const dE = ciede2000(labOfHex(h), q);
    if (!best || dE < best.deltaE) best = { name, deltaE: Math.round(dE * 10) / 10 };
  }
  return best;
}

export const DIMS = {
  L: lab => lab[0],
  C: lab => Math.hypot(lab[1], lab[2]),
  W: lab => lab[2] + lab[1] / 2,
};
const hueDeg = lab => (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
const hueGap = (p, q) => { const d = Math.abs(hueDeg(p) - hueDeg(q)) % 360; return d > 180 ? 360 - d : d; };

// The words. Each entry: pattern, moves ({ L, C, W } signs), the word used in a name.
const SHIFT_WORDS = [
  [/\b(?:darker|deeper|darken|deepen)\b/, { L: -1 }, "darker"],
  [/\b(?:lighter|paler|lighten)\b/, { L: 1 }, "lighter"],
  [/\b(?:more (?:muted|subdued|washed[- ]out|faded|desaturated|dusty)|less (?:saturated|vivid|bright|colou?rful|intense)|duller|greyer|grayer|softer|tone (?:it |this |that |the [a-z]+ )?down|mute)\b/, { C: -1 }, "more muted"],
  [/\b(?:more (?:vivid|saturated|colou?rful|intense|vibrant)|less (?:muted|dull|faded)|bolder|punchier|richer|stronger colou?r)\b/, { C: 1 }, "more vivid"],
  [/\b(?:brighter|brighten)\b/, { C: 1, L: 0.5 }, "brighter"],
  [/\b(?:warmer|warm (?:it |this |that |the [a-z]+ )?up)\b/, { W: 1 }, "warmer"],
  [/\b(?:cooler|colder|cool (?:it |this |that |the [a-z]+ )?down)\b/, { W: -1 }, "cooler"],
];

const FABRIC_TALK = /\b(?:fabric|material|cloth|weight|gsm|cotton|jersey|knit|fleece|terry)\b/;
const HISTORY_TALK = /\b(?:when|the one|the version|back to|go back|was|were|used to)\b/;

/**
 * The relative colour change a clause asks for, or null. Returns
 * { moves, word, amount } where amount scales the step: "a bit" 0.5, plain 1,
 * "a lot" 1.8, "two shades" 2.
 */
export function readShift(clause) {
  const c = String(clause ?? "").toLowerCase();
  if (HISTORY_TALK.test(c)) return null;
  const hit = SHIFT_WORDS.find(([re]) => re.test(c));
  if (!hit) return null;
  const [, moves, word] = hit;
  // "a lighter fabric", "lighter cotton": fabric weight, handled elsewhere.
  if (moves.L && FABRIC_TALK.test(c)) return null;
  let amount = 1;
  const shades = /\b(\d+|two|three|four)\s+shades?\b/.exec(c);
  if (shades) amount = { two: 2, three: 3, four: 4 }[shades[1]] ?? Math.min(5, Number(shades[1]));
  else if (/\b(?:a (?:tiny |little )?bit|slightly|a little|a touch|a tad|just a bit|tiny bit|a smidge)\b/.test(c)) amount = 0.5;
  else if (/\b(?:a lot|much|way|far|lots|really|very|loads|significantly)\b/.test(c)) amount = 1.8;
  return { moves, word, amount };
}

/**
 * Move a colour. `move` is readShift's result. Returns
 *   { hex, name, catalogue, deltaE, moved: { L, C, W } }
 * or { none: reason } when the colour cannot go further that way on a
 * screen. `baseName` names the starting colour ("royal blue").
 */
export function shiftColour(hex, move, { baseName = null, palette = COLOURS } = {}) {
  const lab = labOfHex(hex);
  if (!lab) return { none: "I can't read that colour." };
  const { moves, word, amount } = move;
  const L0 = lab[0]; const C0 = DIMS.C(lab);
  let target = [...lab];
  if (moves.L) target[0] = L0 + moves.L * STEP * amount;
  if (moves.C) {
    const C1 = Math.max(0, C0 + moves.C * STEP * amount);
    if (C0 > 0.5) { target[1] *= C1 / C0; target[2] *= C1 / C0; } else if (moves.C > 0) { target[1] += C1 * 0.5; target[2] += C1 * 0.87; } // a grey made vivid leans warm
  }
  if (moves.W) { const k = moves.W * STEP * amount; target[1] += k * 0.4; target[2] += k * 0.8; } // along warmth's own direction (b + a/2)
  // Keep what was asked for: a lightness edit gives up chroma at the new L*
  // (hue kept); a vividness or warmth edit goes as far along its move as the
  // screen allows.
  target = moves.L && !moves.C && !moves.W ? clipLab(target) : clipMove(lab, target);

  // Which dimensions must move, and by how much at least.
  const need = Object.entries(moves).filter(([, s]) => Math.abs(s) >= 1);
  const movedOf = q => Object.fromEntries(Object.keys(DIMS).map(k => [k, Math.round((DIMS[k](q) - DIMS[k](lab)) * 10) / 10]));
  const goesTheWay = (q, frac) => need.every(([k, s]) => s * (DIMS[k](q) - DIMS[k](lab)) >= Math.max(SEEN, frac * STEP * amount));

  let best = null;
  for (const [name, h] of Object.entries(palette)) {
    if (String(h).toLowerCase() === String(hex).toLowerCase()) continue;
    const q = labOfHex(h);
    if (!q || !goesTheWay(q, 0.35)) continue;
    // Lightness and vividness edits keep the hue of a coloured garment.
    if (!moves.W && C0 > 8 && DIMS.C(q) > 8 && hueGap(q, lab) > 30) continue;
    if (!moves.W && C0 > 8 && moves.C !== -1 && DIMS.C(q) <= 8) continue;
    const dE = ciede2000(q, target);
    if (dE <= NEAR && (!best || dE < best.dE)) best = { name, hex: h, dE };
  }
  if (best) return { hex: best.hex, name: best.name, catalogue: true, deltaE: Math.round(best.dE * 10) / 10, moved: movedOf(labOfHex(best.hex)) };
  const out = toHex(fromLab(target));
  const q = labOfHex(out);
  if (!goesTheWay(q, 0)) {
    const edge = { darker: "as dark", lighter: "as light", "more muted": "as muted", "more vivid": "as vivid", brighter: "as bright", warmer: "as warm", cooler: "as cool" }[word] ?? "as far";
    return { none: `${baseName ? capital(baseName) : "This colour"} is already ${edge} as a screen colour goes that way.` };
  }
  return { hex: out, name: `${word} ${baseName ?? "colour"}`.trim(), catalogue: false, deltaE: 0, moved: movedOf(q), nearest: nearestCatalogue(out, palette) };
}

const capital = s => s.charAt(0).toUpperCase() + s.slice(1);

/** The catalogue name for a hex, if it is one. */
export function catalogueName(hex, palette = COLOURS) {
  const h = String(hex ?? "").toLowerCase();
  return Object.keys(palette).find(k => palette[k].toLowerCase() === h) ?? null;
}

/** A short reading of what moved: "lightness -11.4". */
export function describeMove(moved, moves) {
  const LABEL = { L: "lightness", C: "vividness", W: "warmth" };
  return Object.keys(moves).filter(k => Math.abs(moves[k]) >= 1).map(k => `${LABEL[k]} ${moved[k] > 0 ? "+" : ""}${moved[k]}`).join(", ");
}
