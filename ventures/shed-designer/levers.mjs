// @ts-check
// Foundation, floor, door and window choices as cost levers: what each option
// is, the rule that limits it, and the moves the search (simplify.mjs) may
// make with it. Kept out of model.mjs and simplify.mjs so these levers can
// grow without touching the framing engine.

/**
 * The subfloor panels on the shopping list, both 23/32" tongue-and-groove.
 * APA's single-floor (Sturd-I-Floor) span ratings tie the panel's performance
 * category to the widest joist spacing it may span: 19/32" is 20 oc (19.2"
 * joists), 23/32" is 24 oc (APA, "Rated Sturd-I-Floor" data sheet,
 * https://www.apawood.org/Data/Sites/1/documents/product-support/RSIF-datasheet-p.pdf).
 * A 23/32" sheathing panel stamped 48/24 also spans 24" as a subfloor. The
 * listings do not show the stamp, so check that it reads 24 oc (or 48/24)
 * before setting joists at 24".
 */
export const SUBFLOOR = {
  plywood: { name: '23/32" tongue-and-groove plywood', spanOC: 24 },
  OSB: { name: '23/32" tongue-and-groove OSB', spanOC: 24 },
};

/**
 * The subfloor's use of its span rating: joist spacing over the panel's
 * rated span, so 1.00 is at the limit.
 * @param {{ floorPanel: string, joistSpacing: number }} d
 */
export function subfloorCheck(d) {
  const p = /** @type {any} */ (SUBFLOOR)[d.floorPanel] || SUBFLOOR.plywood;
  return { name: p.name, spanOC: p.spanOC, ratio: d.joistSpacing / p.spanOC };
}

/**
 * Floor-frame moves: joists at 16" or 24" and 2x4 to 2x8. Each is kept by the
 * search only if the joist check (40 psf live + 10 dead between skids) and the
 * subfloor's span rating still pass.
 * @param {any} d
 * @param {(label: string, change: object, group?: string) => void} set
 */
export function floorMoves(d, set) {
  for (const s of [16, 24]) if (s !== d.joistSpacing) set(`floor joists ${s}" o.c.`, { joistSpacing: s }, 'joistSpacing');
  for (const sz of ['2x4', '2x6', '2x8']) if (sz !== d.joistSize) set(`${sz} floor joists`, { joistSize: sz }, 'joistSize');
}

/**
 * Choices you can fix so no search changes them: each names the design keys
 * it holds. Doors and windows both live in `openings`; the searches here tell
 * them apart by the move, and `fixedKeys` gives the coarse key list for
 * searches that change openings wholesale.
 */
export const LOCKABLE = {
  siding: { label: 'Siding', keys: ['siding', 'sidingType', 'sidingColor', 'polkaDots', 'glitter'] },
  roofing: { label: 'Roofing', keys: ['roofing', 'roofCover', 'roofColor'] },
  foundation: { label: 'Foundation', keys: ['foundation', 'pad', 'pierDepth', 'blockSpacing', 'skidSize', 'skidSpacing', 'compaction'] },
  floor: { label: 'Floor', keys: ['floor', 'joistSize', 'joistSpacing', 'floorPanel'] },
  doors: { label: 'Doors', keys: ['openings'] },
  windows: { label: 'Windows', keys: ['openings'] },
};

/** @param {{ locked?: string[] }} d the design keys no search may change, for a search that changes openings as a whole */
export function fixedKeys(d) {
  return [...new Set((d.locked || []).flatMap((k) => /** @type {any} */ (LOCKABLE)[k]?.keys || []))];
}

/**
 * The keys the budget and simplicity searches leave alone: the design keys of
 * each fixed choice, with 'doors' and 'windows' standing for door and window moves.
 * @param {{ locked?: string[] }} d
 */
export function searchKeep(d) {
  return [...new Set((d.locked || []).flatMap((k) => (k === 'doors' || k === 'windows' ? [k] : /** @type {any} */ (LOCKABLE)[k]?.keys || [])))];
}

/**
 * The values another search may try for the foundation and floor, for
 * merging into its own knobs (keys as in the design).
 */
export const LEVER_KNOBS = {
  foundation: ['gravel', 'blocks', 'deck blocks', 'CMU', 'piers'],
  pad: ['full', 'under blocks', 'none'],
  joistSize: ['2x4', '2x6', '2x8'],
  joistSpacing: [16, 24],
  floorPanel: ['plywood', 'OSB'],
  // No floor (walls on PT 4x6 timbers, a gravel floor) is a different shed, damper and open to
  // burrowers: designsearch.mjs tries it only when asked (opts.knobs.floor) or when the design has it.
  floor: ['framed', 'none'],
  // Blocks or piers further apart along a skid: fewer of them, if the skid and soil checks pass.
  blockSpacing: [48, 72],
};
