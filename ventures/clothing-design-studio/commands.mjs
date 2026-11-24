/**
 * Turn what a designer says or types into design operations, without a
 * model: "make it cream, move the print up a bit and embroider it" becomes
 * three operations, each listed with the words that produced it.
 *
 * This is the free engine. It knows a fixed vocabulary (garments, colours,
 * fabrics, methods, placements, sizes, prices), and anything it does not
 * understand is returned unmatched rather than guessed. An optional model
 * (`ai.mjs`) only ever rewrites free speech into these same commands, so
 * both engines go through this parser and the design rules in `design.mjs`.
 */

import { COLOURS, FABRICS, GARMENTS } from "./catalogue.mjs";
import { MOTIFS } from "./motifs.mjs";
import { splitNegations } from "./negation.mjs";
import { readQuestion, resolveReference } from "./refer.mjs";
import { readShift, shiftColour, catalogueName, describeMove, nearestCatalogue } from "./shade.mjs";
import { stockColours } from "./suppliers.mjs";
import { customDye } from "./costing.mjs";

const WORD_NUMBERS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, a: 1, an: 1,
};

/** "two hundred and fifty" -> 250, "1,200" -> 1200, "45.50" -> 45.5. */
export function wordsToNumbers(text) {
  let out = text.replace(/(\d),(\d{3})\b/g, "$1$2");
  out = out.replace(/\b((?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)(?:\s+(?:and\s+)?|-)?)+)\b/g, m => {
    const words = m.trim().split(/[\s-]+/).filter(w => w !== "and");
    let total = 0;
    let cur = 0;
    for (const w of words) {
      const v = WORD_NUMBERS[w];
      if (v === 100) cur = (cur || 1) * 100;
      else if (v === 1000) { total += (cur || 1) * 1000; cur = 0; }
      else cur += v;
    }
    return ` ${total + cur} `;
  });
  return out.replace(/\s+/g, " ").trim();
}

const ORDINALS = { first: 1, "1st": 1, one: 1, second: 2, "2nd": 2, two: 2, third: 3, "3rd": 3, three: 3, last: 3, left: 1, middle: 2, right: 3 };

const COLOUR_NAMES = Object.keys(COLOURS).sort((a, b) => b.length - a.length);
const colourIn = s => COLOUR_NAMES.find(c => new RegExp(`\\b${c}\\b`).test(s)) ?? null;

const GARMENT_WORDS = [
  ["hoodie", /\b(hoodie|hoody|hooded sweatshirt|hood)\b/],
  ["crewneck", /\b(crew ?neck|sweatshirt|jumper|sweater|pullover)\b/],
  ["longsleeve", /\b(long[- ]?sleeve(?:d)?(?: tee| shirt| t-shirt)?)\b/],
  ["tee", /\b(t-?shirt|tee|short[- ]sleeve(?:d)?)\b/],
];

const FABRIC_WORDS = [
  ["3d", null],
  ["performance-poly", /\b(polyester|performance|sport(?:s)?|athletic|dri-?fit)\b/],
  ["cotton-poly-jersey", /\b(blend|cotton[- ]?poly|poly[- ]?cotton|tri-?blend)\b/],
  ["organic-cotton", /\borganic\b/],
  ["heavyweight-cotton", /\b(heavy ?weight|heavy|thick|premium|boxy)\b/],
  ["french-terry", /\b(french terry|terry|loopback)\b/],
  ["fleece", /\b(fleece|brushed)\b/],
  ["pique", /\b(piqu[eé])\b/],
  ["linen", /\blinen\b/],
  ["cotton-jersey", /\b(light ?weight|lighter|thin|jersey|regular cotton|plain cotton|cotton)\b/],
].filter(([, re]) => re);

const METHOD_WORDS = [
  ["3d-puff-embroidery", /\b(3d|three d|puff|raised) embroider(?:y|ed)?\b|\bembroider(?:y|ed)? (?:it |this |them )?(?:in )?(3d|three d|puff|raised)\b/],
  ["embroidery", /\bembroider(?:y|ed|it)?\b|\bstitch(?:ed)?\b/],
  ["puff", /\bpuff(?: print| ink)?\b/],
  ["high-density", /\b(3d|three d|raised|high[- ]density|embossed|relief)\b/],
  ["sublimation", /\bsublimat(?:e|ed|ion)\b|\ball[- ]over\b/],
  ["dtf", /\b(dtf|direct to film|transfer|heat transfer)\b/],
  ["dtg", /\b(dtg|direct to garment|digital(?:ly)? print(?:ed)?|full colou?r print)\b/],
  ["screen", /\bscreen[- ]?print(?:ed|ing)?\b|\bsilk ?screen\b/],
];

const AREA_WORDS = [
  ["chest", /\b(left chest|chest|pocket(?: area)?|small logo)\b/],
  ["sleeve", /\bsleeve\b/],
  ["back", /\b(on the back|to the back|back print|the back|backside|rear)\b/],
  ["front", /\b(on the front|to the front|front)\b/],
];

/** Split a sentence into clauses on "and", "then", commas, full stops. Quoted text is kept whole. */
export function clauses(text) {
  return clauseMarks(text).map(c => c.text);
}

/** Like `clauses`, with `question: true` on each clause that ended with "?". */
export function clauseMarks(text) {
  const quoted = [];
  const masked = text.replace(/["“”'‘’]([^"“”'‘’]{1,60})["“”'‘’]/g, (_, q) => {
    quoted.push(q);
    return ` __q${quoted.length - 1}__ `;
  });
  const parts = wordsToNumbers(masked)
    .split(/(\s*(?:(?<!\d)\.|\.(?!\d)|[,;!?]+|\band then\b|\bthen\b|\band also\b|\balso\b|\band\b)\s*)/i);
  const out = [];
  for (let i = 0; i < parts.length; i += 2) {
    const t = (parts[i] ?? "").trim();
    if (!t) continue;
    out.push({
      text: t.replace(/__q(\d+)__/g, (_, k) => `"${quoted[Number(k)]}"`),
      question: (parts[i + 1] ?? "").includes("?"),
      sep: (parts[i + 1] ?? "").trim().toLowerCase(),
    });
  }
  return out;
}

function distanceCm(c) {
  const m = /(\d+(?:\.\d+)?)\s*(cm|centimet(?:er|re)s?|mm|millimet(?:er|re)s?|in(?:ch(?:es)?)?|")(?!\w)/.exec(c);
  if (m) {
    const v = Number(m[1]);
    if (/^mm|^milli/.test(m[2])) return v / 10;
    if (/^in|"/.test(m[2])) return v * 2.54;
    return v;
  }
  if (/\b(a (?:tiny|little) bit|tiny bit|a touch|slightly|nudge|a little|a bit|bit)\b/.test(c)) return 1;
  if (/\b(a lot|much|way|far|lots)\b/.test(c)) return 5;
  return 2;
}

function scaleFactor(c, bigger) {
  const pct = /(\d+(?:\.\d+)?)\s*(?:%|percent|per cent)/.exec(c);
  if (pct) return bigger ? 1 + Number(pct[1]) / 100 : Math.max(0.05, 1 - Number(pct[1]) / 100);
  if (/\b(twice|double)\b/.test(c)) return bigger ? 2 : 0.5;
  if (/\bhalf\b/.test(c)) return 0.5;
  if (/\b(a (?:tiny|little) bit|tiny bit|a touch|slightly|a little|a bit|bit)\b/.test(c)) return bigger ? 1.07 : 0.93;
  if (/\b(a lot|much|way)\b/.test(c)) return bigger ? 1.35 : 0.7;
  return bigger ? 1.15 : 0.87;
}

const firstNumber = c => {
  const m = /(?:^|[^\w.])(\d+(?:\.\d+)?)(?![\w.]*\d)/.exec(c) ?? /(\d+(?:\.\d+)?)/.exec(c);
  return m ? Number(m[1]) : null;
};

const ARTWORK = /\b(it|print|design|artwork|art|graphic|image|picture|painting|logo|motif|text|words|letters|lettering|writing|halo|cross|wings|crown|laurel|star|frame)\b/;
const INK_SUBJECT = /\b(text|words|letters|lettering|writing|ink|print|logo|motif|halo|cross|wings|crown|laurel|star|frame|thread|embroidery)\b/;

const GARMENT_SUBJECT = /\b(shirt|tee|t-shirt|garment|hoodie|sweatshirt|crewneck|base|body|top|colou?r)\b/;
const TEXT_SUBJECT = /\b(text|words|letters|lettering|writing|slogan)\b/;

/**
 * "make it darker", "make the halo a bit lighter", "a darker green", "warmer
 * ink": the garment colour or the selected artwork's ink moved in CIELAB
 * (`shade.mjs`), snapped to a catalogue colour when one is close. Returns
 * { ops, ui, did } (ops empty with a reason when nothing can change), or null
 * when the clause is not a relative colour edit.
 */
const FAR = 20; // CIEDE2000: how far a stocked colour may sit from the exact move before dyeing to order is proposed

function shadeClause(c, design, sheet = null) {
  const move = readShift(c);
  if (!move) return null;
  const named = colourIn(c);
  // Which artwork the clause names, if any: a motif by its words, or text.
  const motifHit = design.placements.filter(p => p.kind === "motif" && MOTIFS[p.motif]?.words.some(w => new RegExp(`\\b${w}\\b`).test(c)));
  const mentionsMotif = Object.values(MOTIFS).some(m => m.words.some(w => new RegExp(`\\b${w}\\b`).test(c)));
  const mentionsText = TEXT_SUBJECT.test(c);
  const selected = design.placements.find(p => p.id === design.selected) ?? design.placements.at(-1) ?? null;
  const inkNamed = named && selected?.ink && selected.ink.toLowerCase() === COLOURS[named] && COLOURS[named] !== design.colour;
  const onInk = mentionsMotif || mentionsText || inkNamed
    || (INK_SUBJECT.test(c) && !GARMENT_SUBJECT.test(c.replace(/\bprint colou?r\b/, "ink")));
  const nothing = did => ({ ops: [], ui: [], did });
  if (!onInk) {
    const base = named ? COLOURS[named] : design.colour;
    const baseName = named ?? design.colourName ?? null;
    // With a supplier sheet that lists stock colours, the move picks among
    // the colours this factory keeps for this fabric, not the whole catalogue.
    const stock = sheet ? stockColours(sheet, design.fabric) : null;
    const palette = stock && Object.keys(stock).length ? stock : COLOURS;
    const where = palette === COLOURS ? "catalogue colour" : `stock colour on ${sheet.example ? "the example sheet" : "your supplier's sheet"} for ${design.fabric}`;
    const opts = { baseName: baseName && !/^#/.test(baseName) ? baseName : null, palette };
    let r = shiftColour(base, move, opts);
    if (r.none) return nothing(`${r.none} Nothing changed.`);
    let how;
    if (r.catalogue) how = `${where} ${r.name}`;
    else if (palette !== COLOURS) {
      // A custom colour costs a dye lot, so look further out for a stocked
      // colour that still goes the asked way, and keep the exact move as the
      // alternative to ask for.
      const exact = r;
      const dye = customDye({ ...design, colour: exact.hex }, sheet);
      const cost = dye ? ` would add about ${dye.perUnit} per garment at ${design.quantity}${dye.fillsLotAt && dye.spareMetres > 0 ? `; from ${dye.fillsLotAt} pieces the run fills the dye lot and only the set-up is left` : ""}` : "";
      const wide = shiftColour(base, move, { ...opts, near: FAR, customOk: false, strict: true });
      if (!wide.none) {
        r = wide;
        how = `${where} ${r.name}, the nearest stocked colour that way (${r.deltaE} from the exact move; dyeing the exact shade ${exact.hex} to order${cost})`;
      } else {
        how = `custom colour ${r.hex} (nearest ${where} ${r.nearest.name}, ${r.nearest.deltaE} apart; ${cost ? `dyeing it to order${cost}` : "dyed to order: a lab dip and usually a dye minimum at the mill"})`;
      }
    } else how = `custom colour ${r.hex} (nearest ${where} ${r.nearest.name}, ${r.nearest.deltaE} apart; a custom colour means a lab dip and usually a dye minimum at the mill)`;
    return { ops: [{ op: "colour", value: r.hex, name: r.name }], ui: [], did: `Make the garment ${move.word}: ${how}; ${describeMove(r.moved, move.moves)}` };
  }
  let target = selected;
  const pre = [];
  if (mentionsText) {
    target = design.placements.find(p => p.id === design.selected && p.kind === "text") ?? design.placements.filter(p => p.kind === "text").at(-1);
    if (!target) return nothing("There is no text on the design to change; nothing changed");
  } else if (mentionsMotif) {
    target = motifHit.find(p => p.id === design.selected) ?? motifHit.at(-1);
    if (!target) return nothing("That artwork is not on the design; nothing changed");
  }
  if (!target) return nothing("There is no artwork to recolour; nothing changed");
  if (target.kind === "image") return nothing("An uploaded image keeps its own colours; nothing changed");
  if (target.id !== design.selected) pre.push({ op: "select", id: target.id });
  const pname = target.kind === "text" ? `"${target.text}"` : (MOTIFS[target.motif]?.label ?? target.label ?? "artwork").toLowerCase();
  const inkName = catalogueName(target.ink);
  const r = shiftColour(named && !inkNamed ? COLOURS[named] : target.ink, move, { baseName: named && !inkNamed ? named : inkName });
  if (r.none) return nothing(`${r.none} Nothing changed.`);
  return {
    ops: [...pre, { op: "ink", value: r.hex }],
    ui: [],
    did: `Make the ${pname}'s ink ${move.word}: ${r.catalogue ? r.name : `${r.hex} (${r.name}; nearest catalogue colour ${r.nearest.name})`}; ${describeMove(r.moved, move.moves)}`,
  };
}

/**
 * Parse one clause. Returns { ops, ui, did } or null when nothing matched.
 * `ops` go to applyOp; `ui` are actions only the page can take (undo, show
 * variants, pick one, upload, export).
 */
export function parseClause(raw, design, { sheet = null } = {}) {
  const quoted = /"([^"]*)"/.exec(raw)?.[1] ?? null;
  const c = wordsToNumbers(raw.toLowerCase().replace(/"[^"]*"/g, " QUOTED ")).replace(/[’']/g, "'");
  const ops = [];
  const ui = [];
  let did = null;

  // History and the comparison panel.
  if (/^(undo|go back|undo that|revert|take that back|never mind)\b/.test(c)) return { ops, ui: [{ ui: "undo" }], did: "Undo the last change" };
  if (/^(redo|do that again)\b/.test(c)) return { ops, ui: [{ ui: "redo" }], did: "Redo" };
  if (/\b(show|give|make|generate|try)\b.*\b(versions?|options?|variations?|alternatives?|variants?|ideas)\b/.test(c)) return { ops, ui: [{ ui: "variants" }], did: "Show three alternatives" };
  const pick = /\b(pick|choose|go with|use|take|i like|i prefer|keep)\b\s+(?:the\s+)?(first|second|third|last|left|middle|right|1st|2nd|3rd|\d)\b/.exec(c)
    ?? /\b(option|version|number|variant)\s+(\d|one|two|three)\b/.exec(c);
  if (pick) {
    const key = pick[2];
    const index = /^\d$/.test(key) ? Number(key) : ORDINALS[key];
    if (index >= 1 && index <= 3) return { ops, ui: [{ ui: "pick", index }], did: `Use alternative ${index}` };
  }
  if (/\b(export|download|tech ?pack|spec sheet)\b/.test(c)) return { ops, ui: [{ ui: "techpack" }], did: "Open the tech pack" };
  if (/\b(upload|my own (?:image|picture|art|artwork|painting))\b/.test(c)) return { ops, ui: [{ ui: "upload" }], did: "Choose an image to upload" };
  if (/\b(turn (?:it )?around|flip (?:it )?over|show (?:me )?the back|look at the back|view the back)\b/.test(c)) return { ops: [{ op: "side", value: "back" }], ui, did: "Show the back" };
  if (/\b(show (?:me )?the front|look at the front|view the front)\b/.test(c)) return { ops: [{ op: "side", value: "front" }], ui, did: "Show the front" };

  // Naming.
  const named = /\b(?:call it|name it|name the design|title it)\b\s*(.*)$/.exec(c);
  if (named) {
    const value = quoted ?? raw.replace(/^.*?\b(?:call it|name it|name the design|title it)\b\s*/i, "").trim();
    if (value) return { ops: [{ op: "name", value }], ui, did: `Name the design "${value}"` };
  }

  // Relative colour: "make it darker", "a bit more muted", "warmer ink".
  const shade = design ? shadeClause(c, design, sheet) : null;
  if (shade) return shade;

  // Adding artwork.
  const textAdd = /\b(add|write|put|print|say|spell)\b/.test(c) && (quoted != null || /\b(text|words?|saying|caption|slogan)\b/.test(c));
  if (textAdd) {
    const words = quoted ?? raw.replace(/^.*?\b(?:text|words?|saying|caption|slogan)\b\s*(?:that says|saying|reading|of)?\s*/i, "").trim();
    if (words) {
      const area = AREA_WORDS.find(([, re]) => re.test(c))?.[0];
      const ink = colourIn(c);
      ops.push({ op: "add", kind: "text", text: words, area, ...(ink ? { ink: COLOURS[ink] } : {}) });
      return { ops, ui, did: `Add the text "${words}"${area ? ` on the ${area}` : ""}${ink ? ` in ${ink}` : ""}` };
    }
  }
  if (/\b(add|put|place|give it|with)\b/.test(c)) {
    const motif = Object.values(MOTIFS).find(m => m.words.some(w => new RegExp(`\\b${w}\\b`).test(c)));
    if (motif) {
      const area = AREA_WORDS.find(([, re]) => re.test(c))?.[0];
      ops.push({ op: "add", kind: "motif", motif: motif.id, label: motif.label, area, aspect: 1 });
      return { ops, ui, did: `Add a ${motif.label.toLowerCase()}${area ? ` on the ${area}` : ""}` };
    }
  }

  // Removing.
  if (/\b(remove|delete|take off|get rid of|erase|clear)\b/.test(c)) return { ops: [{ op: "remove" }], ui, did: "Remove the selected artwork" };

  // Garment type: needs a verb or to stand alone, so "make the shirt black" stays a colour change.
  for (const [id, re] of GARMENT_WORDS) {
    if (re.test(c) && (/\b(make it|make this|switch|change|turn (?:it )?into|as an?|try (?:an? )?|use an?|instead|put (?:it|this) on an?|on an?)\b/.test(c) || c.replace(re, "").replace(/\b(an?|the)\b/g, "").trim() === "")) {
      if (!colourIn(c) || /\b(switch|change|turn|instead|try)\b/.test(c)) {
        ops.push({ op: "garment", value: id });
        did = `Switch to a ${GARMENTS[id].label.toLowerCase()}`;
        break;
      }
    }
  }

  // Fabric weight and fabric.
  const gsm = /(\d{2,3})\s*(?:gsm|g\/m2|g\/m²|grams?(?: per square met(?:er|re))?|g)\b/.exec(c);
  if (gsm) {
    ops.push({ op: "gsm", value: Number(gsm[1]) });
    did = [did, `Set the fabric weight to ${gsm[1]} gsm`].filter(Boolean).join("; ");
  }
  if (/\b(fabric|material|cloth|cotton|organic|linen|fleece|terry|piqu[eé]|polyester|blend|heavy ?weight|light ?weight|thick|thin|knit)\b/.test(c) && !ARTWORK.test(c.replace(/\bit\b/g, ""))) {
    const f = FABRIC_WORDS.find(([, re]) => re.test(c));
    if (f && !(f[0] === "cotton-jersey" && /\bheav/.test(c))) {
      ops.push({ op: "fabric", value: f[0] });
      did = [did, `Use ${FABRICS[f[0]].label.toLowerCase()}`].filter(Boolean).join("; ");
    }
  }

  // Decoration method.
  if (/\b(embroider|stitch|print|puff|3d|three d|raised|density|embossed|relief|sublimat|all[- ]over|dtf|dtg|transfer|direct to|digital|silk ?screen|screen)/.test(c) && !/\bfabric\b/.test(c)) {
    const m = METHOD_WORDS.find(([, re]) => re.test(c));
    if (m && !(m[0] === "high-density" && /\bembroider/.test(c))) {
      ops.push({ op: "method", value: m[0] });
      did = [did, `Decorate with ${m[0].replace(/-/g, " ")}`].filter(Boolean).join("; ");
    }
  }
  const inkCount = /(\d+)\s*(?:ink )?colou?rs?\b/.exec(c);
  if (inkCount && /\b(colou?rs? (?:print|screen)|ink|screen|print in|use)\b/.test(c)) {
    ops.push({ op: "inkColours", value: Number(inkCount[1]) });
    did = [did, `Print in ${inkCount[1]} ink colours`].filter(Boolean).join("; ");
  }

  // Placement area.
  if (/\b(move|put|place|switch|send|shift|on the|to the)\b/.test(c) && !/\b(up|down|left|right|higher|lower)\b(?! chest)/.test(c.replace(/left chest/g, ""))) {
    const a = AREA_WORDS.find(([, re]) => re.test(c));
    if (a && !ops.some(o => o.op === "garment")) {
      ops.push({ op: "area", value: a[0] });
      did = [did, `Move the artwork to the ${a[0] === "chest" ? "left chest" : a[0]}`].filter(Boolean).join("; ");
    }
  }

  // Position.
  const dirs = [];
  const noChest = c.replace(/left chest/g, "chest");
  if (/\b(up|higher|raise)\b/.test(noChest)) dirs.push(["dy", -1, "up"]);
  if (/\b(down|lower)\b/.test(noChest)) dirs.push(["dy", 1, "down"]);
  if (/\bleft\b/.test(noChest)) dirs.push(["dx", -1, "left"]);
  if (/\bright\b/.test(noChest)) dirs.push(["dx", 1, "right"]);
  // "raise the price", "the price is higher", "lower the run": the direction is the number's, not the artwork's.
  const notArt = /\b(?:raise|up|higher|lower|down|drop|bump)\b\s+(?:(?:the|my|our)\s+)?(?:selling\s+|retail\s+)?(?:price|cost|gsm|weight|quantity|run|order)\b|\b(?:price|cost|gsm|weight|quantity|run|order)\b\s+(?:[a-z']+\s+){0,2}(?:up|higher|lower|down)\b/.test(noChest);
  if (dirs.length && !notArt && !/\b(pick|choose|go with|rotate|tilt|turn|clockwise)\b/.test(c)) {
    const d = distanceCm(c);
    const op = { op: "move", dx: 0, dy: 0 };
    for (const [k, s] of dirs) op[k] += s * d;
    op.dx = Math.round(op.dx * 10) / 10;
    op.dy = Math.round(op.dy * 10) / 10;
    ops.push(op);
    did = [did, `Move it ${dirs.map(x => x[2]).join(" and ")} ${Math.round(d * 10) / 10} cm`].filter(Boolean).join("; ");
  }
  if (/\b(cent(?:er|re)(?:d)?|middle)\b/.test(c) && !dirs.length) {
    ops.push({ op: "center", vertical: !/\bhorizontal/.test(c) });
    did = [did, "Centre it"].filter(Boolean).join("; ");
  }

  // Size.
  const width = /(\d+(?:\.\d+)?)\s*(cm|centimet(?:er|re)s?|in(?:ch(?:es)?)?)\s*(?:wide|across|width)/.exec(c);
  if (width) {
    const cm = /^in/.test(width[2]) ? Number(width[1]) * 2.54 : Number(width[1]);
    ops.push({ op: "width", value: cm });
    did = [did, `Make it ${Math.round(cm * 10) / 10} cm wide`].filter(Boolean).join("; ");
  } else if (/\b(as big as (?:possible|it goes|you can)|fill (?:the )?(?:print )?(?:area|space|front|back)|max(?:imum)? size|full size|biggest)\b/.test(c)) {
    ops.push({ op: "fill" });
    did = [did, "Fill the print area"].filter(Boolean).join("; ");
  } else if (/\b(bigger|larger|enlarge|increase|grow|scale up|blow (?:it )?up)\b/.test(c)) {
    const f = scaleFactor(c, true);
    ops.push({ op: "scale", factor: f });
    did = [did, `Make it ${Math.round((f - 1) * 100)}% bigger`].filter(Boolean).join("; ");
  } else if (/\b(smaller|shrink|reduce|decrease|scale down|tinier)\b/.test(c)) {
    const f = scaleFactor(c, false);
    ops.push({ op: "scale", factor: f });
    did = [did, `Make it ${Math.round((1 - f) * 100)}% smaller`].filter(Boolean).join("; ");
  }

  // Rotation.
  if (/\b(rotate|tilt|angle|turn)\b/.test(c) && !/\bturn (?:it )?(?:into|around)\b/.test(c)) {
    if (/\bstraight/.test(c)) {
      const p = design?.placements.find(q => q.id === design.selected) ?? design?.placements.at(-1);
      ops.push({ op: "rotate", deg: -(p?.rotate ?? 0) });
      did = [did, "Straighten it"].filter(Boolean).join("; ");
    } else {
      const deg = /(\d+)\s*(?:°|deg(?:rees?)?)/.exec(c)?.[1] ?? 10;
      const sign = /\b(left|anti-?clockwise|counter-?clockwise)\b/.test(c) ? -1 : 1;
      ops.push({ op: "rotate", deg: sign * Number(deg) });
      did = [did, `Rotate it ${deg} degrees ${sign < 0 ? "anticlockwise" : "clockwise"}`].filter(Boolean).join("; ");
    }
  } else if (/\bstraighten\b/.test(c)) {
    const p = design?.placements.find(q => q.id === design.selected) ?? design?.placements.at(-1);
    ops.push({ op: "rotate", deg: -(p?.rotate ?? 0) });
    did = [did, "Straighten it"].filter(Boolean).join("; ");
  }

  // Changing existing text.
  if (quoted != null && /\b(change|make|set|replace|edit)\b.*\b(text|words?|it)\b.*\b(to|say|read)\b/.test(c) && !textAdd) {
    ops.push({ op: "text", value: quoted });
    did = [did, `Change the text to "${quoted}"`].filter(Boolean).join("; ");
  }

  // Quantity and price.
  const qty = /\b(?:make|order|produce|run|quantity(?: of)?|batch of|print)\s+(\d+)(?:\s*(?:pieces?|pcs|units?|shirts?|tees?|hoodies?|garments?|of them))?\b/.exec(c)
    ?? /\b(\d+)\s*(?:pieces?|pcs|units?)\b/.exec(c);
  if (qty && !/\b(price|sell|cost|euros?|dollars?|pounds?|€|\$|£)\b/.test(c)) {
    ops.push({ op: "quantity", value: Number(qty[1]) });
    did = [did, `Plan a run of ${qty[1]}`].filter(Boolean).join("; ");
  }
  if (/\b(price|sell|retail|charge)\b|[€$£]\s*\d|\d\s*(?:euros?|dollars?|bucks|pounds?|€)/.test(c)) {
    const n = /[€$£]\s*(\d+(?:\.\d+)?)/.exec(c)?.[1] ?? firstNumber(c);
    if (n != null) {
      ops.push({ op: "price", value: Number(n) });
      did = [did, `Set the selling price to ${n}`].filter(Boolean).join("; ");
    }
  }

  // Colour: the garment, unless the clause is about the ink.
  const colour = colourIn(c);
  if (colour) {
    if (INK_SUBJECT.test(c) && !/\b(shirt|tee|garment|hoodie|sweatshirt|fabric|base|body|crewneck)\b/.test(c)) {
      ops.push({ op: "ink", value: colour });
      did = [did, `Colour the artwork ${colour}`].filter(Boolean).join("; ");
    } else if (!ops.some(o => o.op === "add")) {
      ops.push({ op: "colour", value: colour });
      did = [did, `Make the garment ${colour}${stockNote(colour, ops, design, sheet)}`].filter(Boolean).join("; ");
    }
  }

  return ops.length || ui.length ? { ops, ui, did } : null;
}

// " (not stocked ...)" when a sheet lists stock colours and the named one is
// not among them for the fabric the design will have after this clause.
function stockNote(colour, ops, design, sheet) {
  if (!sheet || !design) return "";
  const fabric = ops.find(o => o.op === "fabric")?.value ?? design.fabric;
  const stock = stockColours(sheet, fabric);
  if (!stock || !Object.keys(stock).length) return "";
  if (Object.values(stock).includes(COLOURS[colour])) return "";
  const near = nearestCatalogue(COLOURS[colour], stock);
  return ` (not a stock colour for ${fabric} on ${sheet.example ? "the example sheet" : "your supplier's sheet"}: dyed to order, see "Custom colour dye" in the cost; nearest stock colour ${near.name}, ${near.deltaE} apart)`;
}

/**
 * Parse a whole utterance. Returns
 *   { steps: [{ words, ops, ui, did, suggested? }], unmatched: [words], declined: [{ words, cue }], questions: [{ words, topic }] }
 * Negated words ("not black", "don't make it bigger", "no embroidery") are
 * cut out before parsing (`negation.mjs`) and listed in `declined`, never
 * applied. Questions (`refer.mjs`) are either suggestions, tried and marked
 * `suggested` ("isn't navy better?", "what about a hoodie"), or questions for
 * information, listed in `questions` and never applied ("is embroidery more
 * expensive?"). With `timeline` (designs oldest first, the present last),
 * references to earlier versions are resolved: "go back to the cream", "the
 * previous colour", "undo the last two", "back to the original". With
 * `sheet` (a supplier sheet), relative colour edits pick among the colours it
 * stocks for the design's fabric, and a named colour it does not stock says so.
 */
export function parseCommand(text, design, timeline = null, { sheet = null } = {}) {
  const steps = [];
  const unmatched = [];
  const declined = [];
  const questions = [];
  const line = Array.isArray(timeline) && timeline.length ? timeline : design ? [design] : null;
  const marks = clauseMarks(String(text || "").slice(0, 600));
  for (let k = 0; k < marks.length; k++) {
    const { text: clause, question } = marks[k];
    if (/^(please|ok(?:ay)?|um+|uh+|so|now|yeah|yes|and|can you|could you|no|nope|nah|not that)$/i.test(clause)) continue;
    let cleaned = clause.replace(/^(?:please|ok(?:ay)?|um+|uh+|so|now|yeah|hmm+|well|i want(?: you)? to|i'd like(?: to)?|let's)\s+/i, "");
    const q = readQuestion(cleaned, question);
    if (q?.kind === "ask") {
      // "which is cheaper, dtg or screen print?": the rest of the sentence up to its "?" belongs to the question.
      let words = clause;
      let end = k;
      if (!question) {
        let j = k;
        while (j + 1 < marks.length && [",", "and", "or"].includes(marks[j].sep)) { j++; if (marks[j].question) break; }
        if (j > k && marks[j].question) end = j;
      }
      for (let j = k + 1; j <= end; j++) words += `${marks[j - 1].sep === "," ? "," : ` ${marks[j - 1].sep}`} ${marks[j].text}`;
      k = end;
      questions.push({ words, topic: readQuestion(words, true)?.topic ?? q.topic });
      continue;
    }
    const suggested = q?.kind === "suggest";
    if (suggested) cleaned = q.body;
    cleaned = cleaned.replace(/^(?:can you|could you|would you|will you)\s+(?:please\s+)?/i, "");
    const ref = resolveReference(cleaned, line, parseClause);
    if (ref) { steps.push({ words: clause, ...ref }); continue; }
    // Naming, writing text and "never mind" carry their own words: no negation cut.
    const ownWords = /\b(call it|name it|name the design|title it)\b|^(?:undo|never mind)/i.test(cleaned)
      || (/\b(add|write|put|print|say|spell|change|replace|edit)\b/i.test(cleaned) && (/["“”]/.test(cleaned) || /\b(text|words?|saying|caption|slogan)\b/i.test(cleaned)));
    if (!ownWords) {
      const n = splitNegations(cleaned);
      declined.push(...n.negated.map(x => ({ words: `${x.cue} ${x.words}`, cue: x.cue })));
      cleaned = n.kept.replace(/\s+/g, " ").trim();
      if (!cleaned) continue;
      if (n.negated.length && /^(?:but|instead|rather|just|only)$/i.test(cleaned)) continue;
      cleaned = cleaned.replace(/^(?:but|instead|rather|just|only)\s+/i, "");
    }
    const r = parseClause(cleaned, design, { sheet });
    if (r) steps.push({ words: clause, ...r, ...(suggested ? { suggested: true, did: `Trying it (you asked): ${r.did ?? ""}`.trim() } : {}) });
    else unmatched.push(clause);
  }
  return { steps, unmatched, declined, questions };
}

/** Example commands shown on the page and used by the tests and evals. */
export const EXAMPLES = [
  "make it cream and add a halo",
  "make it a bit darker",
  "move the print up a bit",
  "make it 20% bigger",
  "embroider it in 3D",
  "put it on the back",
  "switch to a hoodie",
  "use heavyweight cotton, 300 gsm",
  "add the text \"Ave Maria\" in gold",
  "show me three versions",
  "go with the second one",
  "make 150 pieces and sell them for 55 euros",
];
