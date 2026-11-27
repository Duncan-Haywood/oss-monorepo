// Routings, part 3: suggest a saved routing for a quote line from the line's material and its
// description (the RFQ part's description, carried onto the line). The suggestion is evidence from
// the shop's own records, never a guess: a routing is suggested only when earlier lines of this shop
// used its operations (same machines and labels, in order) or when a word of the description appears
// in the routing's name or part family or in the descriptions of the lines that used it. Each
// suggestion says which of those it rests on, so the estimator can judge it. Applying one is the
// same `applyRouting` as picking it by hand: priced from today's rate card, nothing saved until Save.
// Routings, part 4: a line in another rate-card row of the same alloy ("6061-T6 plate" and "6061 bar")
// counts as evidence too, between the same row and any other material, and the reason names the alloy.
import type { RoutingOperation } from "./routings";

/** At most this many suggestions are shown for a line. */
export const MAX_ROUTING_SUGGESTIONS = 3;
/** At most this many of the shop's most recent lines are read as history. */
export const SUGGEST_HISTORY_LINES = 1000;

/** Words that say nothing about how a part is made. */
const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "per",
  "part",
  "parts",
  "qty",
  "rev",
  "dwg",
  "drawing",
  "see",
  "new",
  "from",
  "each",
  "all",
  "not",
  "are",
  "this",
  "that",
  "to",
  "of",
]);

/**
 * The words of a description worth matching: lower case, split on anything but letters and digits,
 * at least three characters, not a stop word. Numbers stay: "6061" or "304" names an alloy a routing
 * is often named after. A plural "brackets" matches
 * "bracket": a trailing "s" is dropped from words of five letters or more (not "ss": "brass").
 */
export function descriptionWords(text: string | null | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw)) continue;
    const w = raw.length >= 5 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.slice(0, -1) : raw;
    if (!STOP.has(w)) out.add(w);
  }
  return [...out];
}

/** Form, finish and size words a material name may carry that say nothing about its alloy. */
const FORM_WORDS = new Set([
  "plate",
  "bar",
  "rod",
  "round",
  "rounds",
  "sheet",
  "tube",
  "tubing",
  "pipe",
  "square",
  "hex",
  "flat",
  "block",
  "stock",
  "angle",
  "channel",
  "extrusion",
  "extruded",
  "drawn",
  "cold",
  "hot",
  "rolled",
  "cast",
  "forged",
  "billet",
  "cut",
  "to",
  "length",
  "precision",
  "ground",
  "annealed",
  "black",
  "white",
  "natural",
  "per",
  "lb",
  "piece",
  "pc",
  "ea",
  "each",
  "in",
  "inch",
  "mm",
  "ft",
  "x",
  "thick",
  "dia",
  "od",
  "id",
  "ga",
  "gauge",
  "the",
  "and",
  "of",
]);

/**
 * The alloy family a rate-card material's name names, or null when it names none for certain.
 * Read from the name only, never assumed from a price or density:
 *
 * - a numbered grade, the first that is not a size: "6061-T6 plate 0.5 in" is "6061", "304L sheet"
 *   is "304", "17-4 PH bar" is "17-4", "A36 plate" is "A36", "C360 brass rod" is "C360". The temper
 *   or condition after a dash (-T6, -T651, -H32) and a trailing L (low carbon) are the same family.
 *   Sizes are not grades: decimals, fractions, "1/2", "2x4", numbers followed by a unit, "16ga".
 * - with no number at all, the name's own words without form and size words: "Delrin rod" and
 *   "Delrin plate" are both "delrin". Different words are different families: no synonyms
 *   ("acetal" is not "delrin"), so a suggestion never rests on a guess about which names are alike.
 *
 * A name left with a number that is not a grade once sizes are gone ("Alloy 20") has no family:
 * two such rows may be different alloys.
 */
export function materialFamily(name: string | null | undefined): string | null {
  if (!name) return null;
  let s = name.toUpperCase().replace(/\u00a0/g, " ");
  // Sizes first: fractions, decimals, dimensions (2x4, 1 X 2), numbers with a unit or inch mark.
  s = s
    .replace(/\d+\s*-\s*\d+\s*\/\s*\d+/g, " ")
    .replace(/\d*\.\d+|\d+\s*\/\s*\d+/g, " ")
    .replace(/\b\d+\s*X\s*\d+(\s*X\s*\d+)?\b/g, " ")
    .replace(/\d+\s*(?:"|''|'|IN\b|INCH\b|MM\b|CM\b|FT\b|GA\b|GAUGE\b|LB\b|LBS\b)/g, " ");
  // A precipitation-hardening grade with its dash: 17-4, 15-5, 13-8.
  const ph = s.match(/\b(1[3-7])\s*-\s*([4-8])(?:\s*PH)?\b/);
  if (ph) return `${ph[1]}-${ph[2]}`;
  for (const tok of s.split(/[^A-Z0-9-]+/)) {
    const core = tok.split("-")[0] ?? "";
    // 303, 304L, 316, 1018, 4140, 6061, 7075; A36, A2, D2, O1, C360, C110, S7.
    const m = core.match(/^(?:([A-Z]{1,2})(\d{1,4})|(\d{3,4})L?)$/);
    if (!m) continue;
    if (m[3]) return m[3];
    if (m[1] && m[2]) return `${m[1]}${m[2]}`;
  }
  if (/\d/.test(s)) return null;
  const words = s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 2 && !FORM_WORDS.has(w));
  return words.length > 0 ? words.join(" ") : null;
}

const opKey = (o: Pick<RoutingOperation, "machineId" | "label">) =>
  `${o.machineId}\u0000${o.label.trim().replace(/\s+/g, " ").toUpperCase()}`;

/**
 * True when the routing's operations appear, in order and next to each other, in the line's
 * operations, compared by machine and label only: an estimator who applied the routing and then
 * tuned a cycle time still used it, and a routing appended after other operations still counts.
 */
export function lineUsesRouting(
  lineOps: readonly Pick<RoutingOperation, "machineId" | "label">[],
  routingOps: readonly Pick<RoutingOperation, "machineId" | "label">[],
): boolean {
  if (routingOps.length === 0 || routingOps.length > lineOps.length) return false;
  const l = lineOps.map(opKey);
  const r = routingOps.map(opKey);
  for (let i = 0; i + r.length <= l.length; i++) {
    if (r.every((k, j) => l[i + j] === k)) return true;
  }
  return false;
}

/** One of the shop's earlier quote lines, as the suggester reads it. */
export interface SuggestHistoryLine {
  lineId: string;
  materialId: string | null;
  description: string | null;
  operations: readonly Pick<RoutingOperation, "machineId" | "label">[];
  /** The line's quote was marked won. */
  won: boolean;
}

export interface SuggestRouting {
  id: string;
  name: string;
  partFamily: string | null;
  operations: readonly Pick<RoutingOperation, "machineId" | "label">[];
}

export interface RoutingSuggestion {
  routingId: string;
  /** Earlier lines that used the routing, in the same material as this line. */
  sameMaterialLines: number;
  /** Of those, how many were on won quotes. */
  sameMaterialWon: number;
  /**
   * Earlier lines that used it in another rate-card row of the same alloy family as this line's
   * material (materialFamily), e.g. 6061 bar when this line is 6061 plate.
   */
  sameFamilyLines: number;
  /** Of those, how many were on won quotes. */
  sameFamilyWon: number;
  /** The family those lines share with this line's material, when sameFamilyLines > 0. */
  family: string | null;
  /** Earlier lines that used it in another material or none. */
  otherLines: number;
  /** Description words found in the routing's name or part family. */
  nameWords: string[];
  /** Description words found in the descriptions of the lines that used it (not in nameWords). */
  historyWords: string[];
  score: number;
}

/**
 * The routings worth suggesting for a line, best first, at most `limit`. Score: 3 per earlier line
 * in the same material that used the routing, 2 more per such line that was won, 2 per line in
 * another row of the same alloy family and 1 more if won, 1 per other line that used it, 2 per
 * description word in its name or family, 1 per word only in the descriptions of lines that used
 * it. A routing with no evidence (score 0) is never suggested. Ties go by name.
 * `history` must be the shop's own lines, with the current line left out. `materialNames` maps the
 * shop's material ids to their rate-card names (retired rows too); without it no family is read.
 */
export function suggestRoutings(args: {
  routings: readonly SuggestRouting[];
  history: readonly SuggestHistoryLine[];
  materialId: string | null;
  description: string | null;
  materialNames?: ReadonlyMap<string, string>;
  limit?: number;
}): RoutingSuggestion[] {
  const words = descriptionWords(args.description);
  const familyOf = (id: string | null) =>
    id && args.materialNames ? materialFamily(args.materialNames.get(id)) : null;
  const family = familyOf(args.materialId);
  const limit = args.limit ?? MAX_ROUTING_SUGGESTIONS;
  const out: RoutingSuggestion[] = [];
  for (const r of args.routings) {
    const used = args.history.filter((h) => lineUsesRouting(h.operations, r.operations));
    const same = args.materialId ? used.filter((h) => h.materialId === args.materialId) : [];
    const sameMaterialWon = same.filter((h) => h.won).length;
    const kin = family
      ? used.filter((h) => h.materialId !== args.materialId && familyOf(h.materialId) === family)
      : [];
    const sameFamilyWon = kin.filter((h) => h.won).length;
    const otherLines = used.length - same.length - kin.length;
    const own = new Set(descriptionWords(`${r.name} ${r.partFamily ?? ""}`));
    const nameWords = words.filter((w) => own.has(w));
    const past = new Set(used.flatMap((h) => descriptionWords(h.description)));
    const historyWords = words.filter((w) => !own.has(w) && past.has(w));
    const score =
      3 * same.length +
      2 * sameMaterialWon +
      2 * kin.length +
      sameFamilyWon +
      otherLines +
      2 * nameWords.length +
      historyWords.length;
    if (score > 0) {
      out.push({
        routingId: r.id,
        sameMaterialLines: same.length,
        sameMaterialWon,
        sameFamilyLines: kin.length,
        sameFamilyWon,
        family: kin.length > 0 ? family : null,
        otherLines,
        nameWords,
        historyWords,
        score,
      });
    }
  }
  const name = new Map(args.routings.map((r) => [r.id, r.name.toUpperCase()]));
  return out
    .sort(
      (a, b) =>
        b.score - a.score ||
        (name.get(a.routingId) ?? "").localeCompare(name.get(b.routingId) ?? ""),
    )
    .slice(0, limit);
}

/** The line a suggestion shows under the routing's name, e.g. "Used on 3 earlier lines in 6061 (2 won)". */
export function suggestionReason(s: RoutingSuggestion, materialName: string | null): string {
  const parts: string[] = [];
  if (s.sameMaterialLines > 0) {
    const n = s.sameMaterialLines;
    const won = s.sameMaterialWon > 0 ? ` (${s.sameMaterialWon} won)` : "";
    parts.push(
      `used on ${n} earlier line${n === 1 ? "" : "s"} in ${materialName ?? "this material"}${won}`,
    );
  }
  const kin = s.sameFamilyLines ?? 0;
  if (kin > 0) {
    const won = (s.sameFamilyWon ?? 0) > 0 ? ` (${s.sameFamilyWon} won)` : "";
    const fam = s.family ?? "the same";
    parts.push(
      `${s.sameMaterialLines > 0 ? "and" : "used on"} ${kin} ${s.sameMaterialLines > 0 ? "more" : "earlier"} line${kin === 1 ? "" : "s"} in other ${fam} stock${won}`,
    );
  }
  if (s.otherLines > 0) {
    const n = s.otherLines;
    const before = s.sameMaterialLines > 0 || kin > 0;
    parts.push(
      `${before ? "and" : "used on"} ${n} ${before ? "more" : "earlier"} line${n === 1 ? "" : "s"} in other materials`,
    );
  }
  const quoted = (ws: string[]) => ws.map((w) => `"${w}"`).join(", ");
  if (s.nameWords.length > 0) parts.push(`its name matches ${quoted(s.nameWords)}`);
  if (s.historyWords.length > 0)
    parts.push(`lines that used it also said ${quoted(s.historyWords)}`);
  const text = parts.join("; ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** GET /routings/suggestions?materialId=&description=&lineId= */
export interface RoutingSuggestionsDto {
  items: RoutingSuggestion[];
  /** How many earlier lines were read (at most SUGGEST_HISTORY_LINES). */
  historyLines: number;
}
