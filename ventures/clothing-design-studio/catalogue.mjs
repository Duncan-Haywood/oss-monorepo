/**
 * What the studio knows about garments, fabrics and decoration methods.
 *
 * Nothing here is a price. Prices belong to a manufacturer and change with
 * the order, so they live in a supplier sheet the designer fills in
 * (`suppliers.mjs`). This file holds the shapes the studio draws, the print
 * areas a placement is clamped to, and the general textile facts that drive
 * the compatibility notes ("sublimation needs polyester").
 *
 * Units: centimetres for anything physical. The drawing is a 500 x 560 SVG
 * where one centimetre is PX_PER_CM pixels, drawn to a typical size M laid
 * flat: about 51 cm across the chest and 72 cm from the shoulder high point
 * (y = 52) to the hem.
 */

export const PX_PER_CM = 6;
export const VIEWBOX = { x: 0, y: -40, width: 500, height: 540 };

const TEE = "M196 52 Q250 112 304 52 L388 62 L460 170 L420 215 L403 196 L403 484 L97 484 L97 196 L80 215 L40 170 L112 62 Z";
const TEE_BACK = "M196 52 Q250 70 304 52 L388 62 L460 170 L420 215 L403 196 L403 484 L97 484 L97 196 L80 215 L40 170 L112 62 Z";
const LONG = "M196 52 Q250 112 304 52 L388 62 L470 260 L482 400 L428 410 L410 262 L403 240 L403 484 L97 484 L97 240 L90 262 L72 410 L18 400 L30 260 L112 62 Z";
const LONG_BACK = "M196 52 Q250 70 304 52 L388 62 L470 260 L482 400 L428 410 L410 262 L403 240 L403 484 L97 484 L97 240 L90 262 L72 410 L18 400 L30 260 L112 62 Z";
const HOOD_FRONT = "M182 64 Q176 -30 250 -32 Q324 -30 318 64 Q290 40 250 106 Q210 40 182 64 Z";
const HOOD_BACK = "M180 66 Q174 -34 250 -34 Q326 -34 320 66 Q250 92 180 66 Z";
const POCKET = "M170 360 L330 360 L352 450 L148 450 Z";
const RIB_HEM = "M97 468 L403 468 L403 484 L97 484 Z";

/**
 * Print areas are the largest rectangle a placement may occupy, centred at
 * (cx, cy) in drawing pixels, sized in centimetres. The sizes are common
 * maximums for a flat-bed screen or DTG platen on an adult garment; a
 * manufacturer's own limits go in the supplier sheet and win.
 */
export const GARMENTS = Object.freeze({
  tee: {
    id: "tee",
    label: "T-shirt",
    outline: { front: TEE, back: TEE_BACK },
    extras: { front: [], back: [] },
    areas: {
      front: { cx: 250, cy: 226, w: 30, h: 38, label: "Full front" },
      chest: { cx: 310, cy: 160, w: 10, h: 10, label: "Left chest" },
      back: { cx: 250, cy: 220, w: 30, h: 40, label: "Full back" },
    },
  },
  longsleeve: {
    id: "longsleeve",
    label: "Long-sleeve tee",
    outline: { front: LONG, back: LONG_BACK },
    extras: { front: [], back: [] },
    areas: {
      front: { cx: 250, cy: 226, w: 30, h: 38, label: "Full front" },
      chest: { cx: 310, cy: 160, w: 10, h: 10, label: "Left chest" },
      back: { cx: 250, cy: 220, w: 30, h: 40, label: "Full back" },
      sleeve: { cx: 446, cy: 250, w: 7, h: 26, label: "Left sleeve" },
    },
  },
  crewneck: {
    id: "crewneck",
    label: "Crewneck sweatshirt",
    outline: { front: LONG, back: LONG_BACK },
    extras: { front: [RIB_HEM], back: [RIB_HEM] },
    areas: {
      front: { cx: 250, cy: 214, w: 30, h: 34, label: "Full front" },
      chest: { cx: 310, cy: 160, w: 10, h: 10, label: "Left chest" },
      back: { cx: 250, cy: 220, w: 30, h: 40, label: "Full back" },
      sleeve: { cx: 446, cy: 250, w: 7, h: 26, label: "Left sleeve" },
    },
  },
  hoodie: {
    id: "hoodie",
    label: "Hoodie",
    outline: { front: LONG, back: LONG_BACK },
    extras: { front: [HOOD_FRONT, POCKET, RIB_HEM], back: [HOOD_BACK, RIB_HEM] },
    areas: {
      front: { cx: 250, cy: 208, w: 28, h: 24, label: "Front (above the pocket)" },
      chest: { cx: 310, cy: 160, w: 10, h: 10, label: "Left chest" },
      back: { cx: 250, cy: 220, w: 30, h: 40, label: "Full back" },
      sleeve: { cx: 446, cy: 250, w: 7, h: 26, label: "Left sleeve" },
    },
  },
});

/** Which side of the garment each area is drawn on. */
export function sideOf(area) {
  return area === "back" ? "back" : "front";
}

/**
 * Fabrics. `gsm` is the usual weight range in grams per square metre; the
 * designer picks an exact weight. `polyester` is the share of polyester,
 * which decides whether sublimation can work. `drape` (0 stiff to 1 fluid)
 * and `sheen` only shade the drawing.
 */
export const FABRICS = Object.freeze({
  "cotton-jersey": {
    id: "cotton-jersey", label: "Cotton jersey", composition: "100% cotton", gsm: [140, 180],
    polyester: 0, drape: 0.6, sheen: 0.05,
    note: "The everyday tee knit. Light weights read as basic; combed, ring-spun yarn feels smoother for the same weight.",
  },
  "heavyweight-cotton": {
    id: "heavyweight-cotton", label: "Heavyweight cotton jersey", composition: "100% cotton", gsm: [220, 320],
    polyester: 0, drape: 0.35, sheen: 0.05,
    note: "Thick, structured knit with a boxy fall. The usual route to a tee that looks and feels more expensive than its cost.",
  },
  "organic-cotton": {
    id: "organic-cotton", label: "Organic cotton jersey", composition: "100% organic cotton", gsm: [150, 240],
    polyester: 0, drape: 0.5, sheen: 0.05,
    note: "Ask the mill for its certificate (GOTS or OCS) before you print the word organic on a label or product page.",
  },
  "cotton-poly-jersey": {
    id: "cotton-poly-jersey", label: "Cotton/polyester jersey", composition: "60% cotton, 40% polyester", gsm: [140, 180],
    polyester: 40, drape: 0.65, sheen: 0.1,
    note: "Softer and less prone to shrink than pure cotton; a slightly synthetic hand.",
  },
  "french-terry": {
    id: "french-terry", label: "French terry", composition: "Cotton or cotton/polyester loopback", gsm: [280, 400],
    polyester: 20, drape: 0.3, sheen: 0.05,
    note: "Loops on the inside, smooth face outside. Crewnecks and lighter hoodies.",
  },
  fleece: {
    id: "fleece", label: "Brushed fleece", composition: "Cotton/polyester, brushed back", gsm: [300, 450],
    polyester: 35, drape: 0.25, sheen: 0.05,
    note: "Warm, heavy hoodie fabric. Heavy weights hold embroidery and 3D puff well.",
  },
  pique: {
    id: "pique", label: "Pique knit", composition: "Cotton or cotton/polyester", gsm: [180, 240],
    polyester: 0, drape: 0.4, sheen: 0.05,
    note: "Textured polo knit. The texture breaks up fine print detail; embroidery suits it better.",
  },
  "performance-poly": {
    id: "performance-poly", label: "Polyester performance knit", composition: "100% polyester", gsm: [120, 180],
    polyester: 100, drape: 0.7, sheen: 0.3,
    note: "Light, quick-drying. The fabric sublimation is made for: the dye becomes part of the fibre, so an all-over painting can cover the whole garment.",
  },
  linen: {
    id: "linen", label: "Linen (woven)", composition: "100% linen", gsm: [150, 220],
    polyester: 0, drape: 0.45, sheen: 0.15,
    note: "Woven, not knit: a shirt pattern rather than a tee. Wrinkles by nature; prints sit less crisply.",
  },
});

/**
 * Decoration methods. `pricing` says how a supplier usually charges, which
 * the costing reads: `per-colour` setup (screens), `per-placement` setup
 * (digitising, a film), or none. `raised` marks methods that stand off the
 * fabric, the "3D" look.
 */
export const METHODS = Object.freeze({
  screen: { id: "screen", label: "Screen print", setup: "per-colour", raised: false,
    note: "Cheapest per piece at volume; each colour needs a screen, so short runs carry the setup." },
  "high-density": { id: "high-density", label: "High-density (raised) screen print", setup: "per-colour", raised: true,
    note: "Thick ink built up in layers so the print stands off the shirt: a 3D look for bold shapes and outlines, not fine painted detail." },
  puff: { id: "puff", label: "Puff print", setup: "per-colour", raised: true,
    note: "Ink that swells when cured. Soft, rounded relief; best for lettering and simple shapes." },
  dtg: { id: "dtg", label: "Direct to garment (DTG)", setup: "none", raised: false,
    note: "Inkjet onto the shirt: full colour, photographic detail, no setup. Works best on high-cotton fabric." },
  dtf: { id: "dtf", label: "Direct to film (DTF) transfer", setup: "none", raised: false,
    note: "Printed film heat-pressed on: full colour on almost any fabric, a slightly plasticky feel on large areas." },
  embroidery: { id: "embroidery", label: "Embroidery", setup: "per-placement", raised: false,
    note: "Thread stitched in. Digitising is a one-off per design; priced by stitch count. Reads as premium; poor for photographic detail." },
  "3d-puff-embroidery": { id: "3d-puff-embroidery", label: "3D puff embroidery", setup: "per-placement", raised: true,
    note: "Embroidery over a foam underlay so it stands up off the fabric. Needs a heavy fabric to sit on." },
  sublimation: { id: "sublimation", label: "Sublimation", setup: "none", raised: false,
    note: "Dye turned to gas into polyester fibre: no feel at all, can cover the whole garment. Only works on light-coloured, high-polyester fabric." },
});

/**
 * Notes on a fabric and method pairing, phrased as things to check with the
 * manufacturer rather than verdicts. Returns an array of strings.
 */
export function compatibilityNotes(fabricId, methodId, { colour = "#ffffff", gsm = null } = {}) {
  const fabric = FABRICS[fabricId];
  const method = METHODS[methodId];
  if (!fabric || !method) return [];
  const notes = [];
  if (methodId === "sublimation") {
    if (fabric.polyester < 65) notes.push(`Sublimation dyes polyester fibre; ${fabric.label} is about ${fabric.polyester}% polyester, so the print would fade or wash out. Use a polyester knit, or a different method.`);
    if (luminance(colour) < 0.6) notes.push("Sublimation cannot print lighter than the fabric: on a dark garment the artwork mostly disappears. Use a white or pale base.");
  }
  if (methodId === "dtg" && fabric.polyester > 50) notes.push("DTG ink bonds to cotton; on mostly-polyester fabric it tends to look dull and wash poorly. Ask for a test print, or use DTF.");
  if ((methodId === "embroidery" || methodId === "3d-puff-embroidery") && (gsm ?? fabric.gsm[0]) < 180) notes.push("Dense embroidery on a light knit can pucker. A heavier fabric, or a smaller design with a backing stabiliser, holds it better.");
  if (methodId === "3d-puff-embroidery" && (gsm ?? fabric.gsm[0]) < 240) notes.push("3D puff embroidery usually goes on caps, fleece and heavy sweatshirts; ask whether the manufacturer will run it on this weight.");
  if (fabricId === "pique" && (methodId === "dtg" || methodId === "screen")) notes.push("Pique's texture breaks up fine detail in a print; keep lines bold or embroider it.");
  if (method.raised && methodId !== "3d-puff-embroidery") notes.push("Raised inks hold bold shapes, lettering and outlines. A detailed painting reproduces better flat (DTG, DTF or sublimation), with raised ink only on its outline or a halo.");
  return notes;
}

/** Relative luminance of a #rrggbb colour, 0 black to 1 white. */
export function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/**
 * Garment colours a designer can say out loud. Hex values are approximate
 * screen colours; the manufacturer's swatch is the real colour.
 */
export const COLOURS = Object.freeze({
  white: "#f7f7f4", "off white": "#efe9dc", cream: "#efe4cc", ivory: "#f2ecdc", bone: "#e6dccb", ecru: "#e3d8bf",
  black: "#1b1b1d", charcoal: "#3a3b3e", grey: "#9a9b9e", gray: "#9a9b9e", "heather grey": "#b4b5b8", "heather gray": "#b4b5b8", silver: "#c3c5c8",
  navy: "#1f2a44", blue: "#2f5ea8", "royal blue": "#2648a6", "sky blue": "#9cc6e8", "light blue": "#a9c8e6", teal: "#1f6f73",
  red: "#b3262e", burgundy: "#6b1e2c", maroon: "#5e1a24", wine: "#5a1a2a", crimson: "#9b1b30", pink: "#e9a7b8", "dusty pink": "#d4a5a5", rose: "#c9727f",
  orange: "#d9692a", rust: "#9c4a25", terracotta: "#b8603e", yellow: "#e9c548", gold: "#c9a24a", mustard: "#c79a2b",
  green: "#3b7d4a", "forest green": "#24412f", olive: "#5b5e33", sage: "#a3ad8f", khaki: "#b3a67e", mint: "#b5dcc4",
  brown: "#5c3b26", chocolate: "#3f2a1d", tan: "#c3a27a", sand: "#d8c6a3", beige: "#ddcdb0", camel: "#b98a56",
  purple: "#5b3a80", lavender: "#c3b3dc", lilac: "#c8a9d6", violet: "#6a3d9a",
});
