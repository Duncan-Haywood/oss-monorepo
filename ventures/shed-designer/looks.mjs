// @ts-check
// Colours for the 3D view and the drawings: siding paint, trim, door and
// asphalt shingle families. Names are generic (no paint or shingle maker's
// colour names), and the RGB values are approximations for a screen: take a
// real chip or a sample to the store, or type the house's own colour as a hex
// code from a photo, before buying paint.

/** @typedef {[number, number, number]} RGB */

/** Exterior paint colours common on houses and sheds, plus the original playful ones. */
export const PAINTS = /** @type {Record<string, { label: string, rgb: RGB }>} */ ({
  white: { label: 'White', rgb: [0.93, 0.92, 0.88] },
  cream: { label: 'Cream', rgb: [0.93, 0.89, 0.78] },
  'light gray': { label: 'Light gray', rgb: [0.78, 0.78, 0.76] },
  greige: { label: 'Greige (gray-beige)', rgb: [0.72, 0.69, 0.63] },
  gray: { label: 'Gray', rgb: [0.6, 0.62, 0.62] },
  'charcoal gray': { label: 'Charcoal gray', rgb: [0.27, 0.28, 0.3] },
  'slate blue': { label: 'Slate blue', rgb: [0.4, 0.48, 0.56] },
  blue: { label: 'Blue', rgb: [0.38, 0.52, 0.66] },
  navy: { label: 'Navy', rgb: [0.15, 0.2, 0.32] },
  sage: { label: 'Sage green', rgb: [0.6, 0.65, 0.54] },
  green: { label: 'Green', rgb: [0.42, 0.55, 0.38] },
  'forest green': { label: 'Forest green', rgb: [0.18, 0.3, 0.2] },
  khaki: { label: 'Khaki / tan', rgb: [0.72, 0.64, 0.5] },
  'dark brown': { label: 'Dark brown', rgb: [0.3, 0.22, 0.16] },
  red: { label: 'Barn red', rgb: [0.62, 0.16, 0.13] },
  black: { label: 'Black', rgb: [0.12, 0.12, 0.13] },
  pink: { label: 'Pink', rgb: [0.96, 0.62, 0.76] },
  'hot pink': { label: 'Hot pink', rgb: [1.0, 0.33, 0.66] },
  lavender: { label: 'Lavender', rgb: [0.76, 0.64, 0.93] },
  mint: { label: 'Mint', rgb: [0.6, 0.9, 0.78] },
});

/** Siding finishes: a solid stain, bare, or any paint. */
export const SIDING_FINISHES = /** @type {Record<string, { label: string, rgb: RGB }>} */ ({
  natural: { label: 'Stained (solid colour)', rgb: [0.64, 0.36, 0.27] },
  unfinished: { label: 'Unfinished (no paint or stain)', rgb: [0.78, 0.62, 0.43] },
  ...PAINTS,
});

/** Trim paint: the house colours plus the original gold and purple accents. */
export const TRIM_FINISHES = /** @type {Record<string, { label: string, rgb: RGB }>} */ ({
  white: { label: 'White', rgb: [0.97, 0.97, 0.97] },
  ...Object.fromEntries(Object.entries(PAINTS).filter(([k]) => k !== 'white' && k !== 'pink' && k !== 'black')),
  black: { label: 'Black', rgb: [0.13, 0.13, 0.15] },
  pink: { label: 'Pink', rgb: [1.0, 0.55, 0.78] },
  purple: { label: 'Purple', rgb: [0.5, 0.28, 0.68] },
  gold: { label: 'Gold', rgb: [0.92, 0.76, 0.3] },
});

/** Door finish: stained, painted to match the siding or the trim, or its own paint. */
export const DOOR_FINISHES = /** @type {Record<string, { label: string, rgb: RGB | null }>} */ ({
  stained: { label: 'Stained wood', rgb: [0.42, 0.29, 0.17] },
  'match siding': { label: 'Same as the siding', rgb: null },
  'match trim': { label: 'Same as the trim', rgb: null },
  ...PAINTS,
});

/**
 * Asphalt shingle colour families. Real shingles are blends of granules, so
 * each family has a base colour and how much the tabs vary. `blend` 0 is flat.
 */
export const SHINGLE_FAMILIES = /** @type {Record<string, { label: string, rgb: RGB, blend: number }>} */ ({
  charcoal: { label: 'Charcoal', rgb: [0.3, 0.32, 0.35], blend: 0.12 },
  black: { label: 'Black', rgb: [0.14, 0.14, 0.15], blend: 0.1 },
  'slate gray': { label: 'Slate gray', rgb: [0.42, 0.45, 0.48], blend: 0.14 },
  'gray-brown blend': { label: 'Gray-brown blend', rgb: [0.42, 0.38, 0.33], blend: 0.22 },
  brown: { label: 'Brown', rgb: [0.38, 0.27, 0.2], blend: 0.16 },
  tan: { label: 'Tan / desert', rgb: [0.6, 0.52, 0.42], blend: 0.16 },
  'dark green': { label: 'Dark green', rgb: [0.2, 0.3, 0.24], blend: 0.14 },
  red: { label: 'Red blend', rgb: [0.46, 0.18, 0.15], blend: 0.18 },
  pink: { label: 'Pink', rgb: [0.93, 0.45, 0.66], blend: 0.06 },
  purple: { label: 'Purple', rgb: [0.5, 0.28, 0.68], blend: 0.06 },
  teal: { label: 'Teal', rgb: [0.2, 0.55, 0.58], blend: 0.06 },
});

const HEX = /^#[0-9a-f]{6}$/i;

/** True for a "#rrggbb" colour someone typed or picked. @param {unknown} s */
export const isHex = (s) => typeof s === 'string' && HEX.test(s);

/** @param {string} hex @returns {RGB} */
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** @param {RGB} rgb */
export function rgbToHex(rgb) {
  return `#${rgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A finish kept if it is a known name or (when custom colours are allowed) a hex code.
 * @param {unknown} v @param {Record<string, any>} table @param {string} fallback
 */
export function pickFinish(v, table, fallback, custom = true) {
  if (typeof v === 'string' && Object.hasOwn(table, v)) return v;
  if (custom && isHex(v)) return /** @type {string} */ (v).toLowerCase();
  return fallback;
}

/** RGB for a finish name or hex. @param {string} v @param {Record<string, { rgb: RGB | null }>} table @param {RGB} fallback @returns {RGB} */
export function finishRgb(v, table, fallback) {
  if (isHex(v)) return hexToRgb(v);
  return (Object.hasOwn(table, v) && table[v].rgb) || fallback;
}

/** How a finish reads in a shopping list or a step: "sage green", "custom colour #a1b2c3". @param {string} v @param {Record<string, { label: string }>} table */
export function finishName(v, table) {
  if (isHex(v)) return `custom colour ${v}`;
  return Object.hasOwn(table, v) ? table[v].label.toLowerCase() : v;
}

/** A bought door's factory finish when no door colour is chosen (primed white, as the HOA elevations draw it). */
export const FACTORY_DOOR = /** @type {RGB} */ ([0.953, 0.945, 0.925]);

/**
 * One door's colour as built. "Stained" is the default choice, not a material:
 * a site-built door is skinned with the siding cut from its opening, so it
 * takes the siding's finish, and a bought door keeps its factory finish. Any
 * other choice paints every door.
 * @param {any} d a normalized design @param {{ product?: string } | undefined} op the door's opening
 */
export function doorRgb(d, op) {
  const pal = paletteOf(d);
  if (d.doorColor !== 'stained') return pal.door;
  return op?.product === 'site-built' ? pal.siding : FACTORY_DOOR;
}

/**
 * Every finish colour of a design in one place, for the 3D view and the drawings.
 * @param {any} d a normalized design
 */
export function paletteOf(d) {
  const bare = d.sidingType?.startsWith('LP SmartSide') || d.sidingType === 'fiber cement' ? /** @type {RGB} */ ([0.84, 0.83, 0.79]) : SIDING_FINISHES.unfinished.rgb;
  // Vinyl comes coloured; its "stained" default reads as a white vinyl.
  const siding = d.sidingColor === 'unfinished' ? bare
    : d.sidingType === 'vinyl' && d.sidingColor === 'natural' ? PAINTS.white.rgb
      : finishRgb(d.sidingColor, SIDING_FINISHES, SIDING_FINISHES.natural.rgb);
  const trim = finishRgb(d.trimColor, TRIM_FINISHES, TRIM_FINISHES.white.rgb);
  const door = d.doorColor === 'match siding' ? siding : d.doorColor === 'match trim' ? trim : finishRgb(d.doorColor, DOOR_FINISHES, /** @type {RGB} */ (DOOR_FINISHES.stained.rgb));
  const fam = SHINGLE_FAMILIES[d.roofColor] || SHINGLE_FAMILIES.charcoal;
  return { siding, trim, door, roof: fam.rgb, roofBlend: d.roofCover === 'metal' ? 0 : fam.blend };
}

/** `<option>` markup for a finish table. @param {Record<string, { label: string }>} table */
export function finishOptions(table) {
  return Object.entries(table).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
}
