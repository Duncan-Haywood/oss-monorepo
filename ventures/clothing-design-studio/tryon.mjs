/**
 * Try-on from tape measurements: a front-view picture of the garment over a
 * simple body built from the shopper's chest, waist, hip and height.
 *
 * This is the "body model first" step the interviews asked for before a
 * camera or VR try-on. It is geometry, not cloth:
 *  - each body level (chest, waist, hip) is an ellipse whose circumference is
 *    the measurement; front-view width follows from an assumed depth/width
 *    ratio (Ramanujan's ellipse formula), so the drawing is to scale in width;
 *  - vertical landmarks use textbook proportions of standing height (neck
 *    0.870, shoulder 0.818, hip 0.530, crotch 0.470; Drillis & Contini,
 *    1966 style averages). Real bodies vary a lot, so treat heights as +-3 cm;
 *  - the garment is a straight cut: finished chest circumference from
 *    `garmentMeasurements`, the same circumference at the hem, the body length
 *    measured from the high point of the shoulder. A ribbed or tapered hem
 *    would sit closer; the factory's hem width replaces this guess.
 * It does not drape, stretch, wrinkle or show how fabric hangs, and it is not
 * a promise of fit. Missing waist, hip or height are assumed (and flagged).
 */
import { garmentMeasurements, BODY_CHEST_CM } from "./fit.mjs";

const clamp = (n, lo, hi) => (Number.isFinite(n) && n >= lo && n <= hi ? n : null);
const r1 = x => Math.round(x * 10) / 10;

/** Level proportions of standing height (fractions measured up from the floor). */
export const LANDMARKS = Object.freeze({ neck: 0.87, shoulder: 0.818, chest: 0.72, waist: 0.62, hip: 0.53, crotch: 0.47, knee: 0.285 });
const DEPTH = Object.freeze({ chest: 0.7, waist: 0.72, hip: 0.68 });

/** Front-view width (cm) of an ellipse of the given circumference and depth/width ratio. */
export function frontWidth(circ, ratio) {
  const k = (Math.PI / 2) * (3 * (1 + ratio) - Math.sqrt((3 + ratio) * (1 + 3 * ratio)));
  return circ / k;
}

function hemWord(hemH, H) {
  const L = LANDMARKS;
  if (hemH > H * L.waist + 2) return "cropped: ends above the waist";
  if (hemH > H * L.hip + 6) return "ends between waist and hip";
  if (hemH >= H * L.hip - 4) return "ends at the hip";
  if (hemH >= H * L.crotch - 8) return "covers the hips";
  return "long: ends well below the crotch";
}

function easeWord(ease, kind) {
  if (kind === "hem") {
    if (ease < 0) return "tighter than the hips: it will ride up";
    if (ease < 4) return "close over the hips";
    if (ease <= 20) return "comfortable over the hips";
    return "very roomy at the hem";
  }
  if (ease < 2) return "very close";
  if (ease < 8) return "close";
  if (ease <= 16) return "regular";
  if (ease <= 24) return "loose";
  return "very loose";
}

/**
 * @param {{chest:number, waist?:number, hip?:number, height?:number}} body cm
 * @param {{garment?:string, fit?:string, size?:string, sizeChart?:object}} [opts]
 */
export function tryOn(body, { garment = "tee", fit = "regular", size = "M", sizeChart = BODY_CHEST_CM } = {}) {
  const chest = clamp(Number(body?.chest), 60, 170);
  if (chest == null) return { ok: false, error: "Enter a chest measurement between 60 and 170 cm." };
  const gm = garmentMeasurements(garment, fit, sizeChart)[size];
  if (!gm) return { ok: false, error: `Size ${size} is not in the chart.` };
  const assumed = [];
  let height = clamp(Number(body?.height), 120, 230);
  if (height == null) { height = 175; assumed.push("height 175 cm"); }
  let waist = clamp(Number(body?.waist), 40, 170);
  if (waist == null) { waist = r1(chest * 0.9); assumed.push(`waist ${waist} cm`); }
  let hip = clamp(Number(body?.hip), 50, 180);
  if (hip == null) { hip = r1(chest * 0.98); assumed.push(`hip ${hip} cm`); }

  const L = LANDMARKS, H = height;
  const bodyW = { shoulder: 0.25 * H, chest: frontWidth(chest, DEPTH.chest), waist: frontWidth(waist, DEPTH.waist), hip: frontWidth(hip, DEPTH.hip) };
  const gChestW = frontWidth(gm.chest, DEPTH.chest);
  const gHemW = frontWidth(gm.chest, DEPTH.hip);
  const hpsH = H * L.neck - 2; // high point of shoulder, a little under the neck base
  const hemH = hpsH - gm.length;

  const checks = [
    { where: "chest", body: chest, garment: gm.chest, ease: r1(gm.chest - chest), word: easeWord(gm.chest - chest, "chest") },
    { where: "waist", body: waist, garment: gm.chest, ease: r1(gm.chest - waist), word: easeWord(gm.chest - waist, "chest") },
    { where: "hip (at the hem)", body: hip, garment: gm.chest, ease: r1(gm.chest - hip), word: easeWord(gm.chest - hip, "hem") },
  ];
  const length = { hemFromFloor: r1(hemH), word: hemWord(hemH, H) };
  const sleeve = sleeveCheck(garment, size, H, body?.arm);
  const notes = [];
  if (garment !== "tee" && sleeve.pastWrist > 8) notes.push(`The sleeve is about ${sleeve.pastWrist} cm past your wrist ${sleeve.armMeasured ? "by your arm measurement" : "at this height"}; ask the factory for a shorter sleeve or a ribbed cuff.`);
  if (hemH > H * L.hip + 6 && hemH <= H * L.waist + 2) notes.push("The hem stops above the hips; if that is not the look, ask for a longer body length.");
  if (checks[2].ease < 0) notes.push("The hem circumference is below the hip measurement. Ask the factory for the hem width, and consider the next size up.");
  if (sleeve.armMeasured && Math.abs(sleeve.wristFromShoulder - 0.332 * H) > 4) notes.push(`Your arm (${r1(sleeve.wristFromShoulder)} cm) differs from the ${r1(0.332 * H)} cm average for your height; the sleeve verdict uses your arm.`);
  if (assumed.length) notes.push(`Not given, so assumed: ${assumed.join(", ")}. Enter them for a truer picture.`);
  notes.push("A straight cut is assumed (hem as wide as the chest). Drape, stretch and sleeve shape are not simulated; the garment's sleeve length is a typical figure.");
  return { ok: true, size, garment, fit, height: H, body: { chest, waist, hip, height: H }, bodyWidths: mapR(bodyW), garmentWidths: { chest: r1(gChestW), hem: r1(gHemW) }, checks, length, sleeve, notes, assumed, svg: drawSvg({ H, bodyW, gChestW, gHemW, hpsH, hemH, garment, checks }), side: sideView({ H, chest, waist, hip, gChest: gm.chest, hpsH, hemH }) };
}

/**
 * Where the sleeve cuff lands on the arm. Arm landmarks are fractions of
 * height (Drillis & Contini style averages): shoulder point to wrist 0.332 H,
 * to elbow 0.186 H. Garment sleeve length is measured from the shoulder point
 * and is typical (tee 21 cm at M, long sleeves 63 cm at M, +1 cm per size
 * step), a guess until the factory's spec replaces it.
 */
export const SLEEVE_CM_M = Object.freeze({ tee: 21, longsleeve: 63, crewneck: 63, hoodie: 64 });
export function sleeveCheck(garment, size, height, arm) {
  const mi = ["XS", "S", "M", "L", "XL", "XXL"];
  const len = (SLEEVE_CM_M[garment] ?? 63) + (mi.indexOf(size) - 2);
  // A measured arm (shoulder point to wrist bone, cm) replaces the height rule; elbow stays 56% of it.
  const measured = clamp(Number(arm), 40, 100);
  const wrist = measured ?? 0.332 * height, elbow = measured ? 0.56 * measured : 0.186 * height;
  const d = r1(len - wrist); // positive: past the wrist
  let word;
  if (garment === "tee") word = len < elbow - 12 ? "cap sleeve: ends high on the upper arm" : len <= elbow - 2 ? "ends on the upper arm" : "ends near the elbow";
  else if (d < -6) word = "short: the wrist shows, three-quarter length";
  else if (d < -1.5) word = "ends just above the wrist bone";
  else if (d <= 3) word = "ends at the wrist";
  else if (d <= 8) word = "covers the wrist, bunches a little";
  else word = "runs over the hand: ask for a shorter sleeve or a ribbed cuff";
  return { sleeveCm: r1(len), wristFromShoulder: r1(wrist), pastWrist: d, word, armMeasured: measured != null };
}

const mapR = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r1(v)]));

function drawSvg({ H, bodyW, gChestW, gHemW, hpsH, hemH, garment }) {
  const L = LANDMARKS, W = 120, pad = 6, cx = W / 2;
  const top = H + pad;       // top of the head, cropped below the knees
  const bottom = H * 0.2;     // crop below the knees
  const Y = h => r1(top - h);
  const X = dx => r1(cx + dx);
  const vb = `0 0 ${W} ${r1(top - bottom + pad)}`;
  const headR = H * 0.065, headY = H - headR;
  const sh = bodyW.shoulder / 2, c = bodyW.chest / 2, w = bodyW.waist / 2, hp = bodyW.hip / 2;
  const legW = hp * 0.95;
  const bodyPath = [
    `M ${X(-sh)} ${Y(H * L.shoulder)}`, `L ${X(-c)} ${Y(H * L.chest)}`, `L ${X(-w)} ${Y(H * L.waist)}`, `L ${X(-hp)} ${Y(H * L.hip)}`,
    `L ${X(-legW)} ${Y(bottom)}`, `L ${X(legW)} ${Y(bottom)}`, `L ${X(hp)} ${Y(H * L.hip)}`, `L ${X(w)} ${Y(H * L.waist)}`, `L ${X(c)} ${Y(H * L.chest)}`, `L ${X(sh)} ${Y(H * L.shoulder)}`, `Z`,
  ].join(" ");
  const armLen = H * 0.33, armW = 4.2;
  const arm = s => `M ${X(s * sh)} ${Y(H * L.shoulder)} L ${X(s * (sh + armW))} ${Y(H * L.shoulder - 3)} L ${X(s * (sh + armW + 2))} ${Y(H * L.shoulder - armLen)} L ${X(s * (sh + 0.5))} ${Y(H * L.shoulder - armLen)} Z`;
  const gc = gChestW / 2, gh = gHemW / 2;
  const sleeveEnd = garment === "tee" ? H * L.shoulder - armLen * 0.4 : H * L.shoulder - armLen * 0.97;
  const sleeve = s => `M ${X(s * sh)} ${Y(H * L.shoulder)} L ${X(s * (sh + armW + 1.2))} ${Y(H * L.shoulder - 3)} L ${X(s * (sh + armW + 1.2 + 1))} ${Y(sleeveEnd)} L ${X(s * (sh - 0.2))} ${Y(sleeveEnd)} Z`;
  const neck = H * 0.04;
  const garmentPath = [
    `M ${X(-neck)} ${Y(hpsH)}`, `L ${X(-sh)} ${Y(H * L.shoulder)}`, `L ${X(-gc)} ${Y(H * L.chest)}`, `L ${X(-gh)} ${Y(hemH)}`, `L ${X(gh)} ${Y(hemH)}`, `L ${X(gc)} ${Y(H * L.chest)}`, `L ${X(sh)} ${Y(H * L.shoulder)}`, `L ${X(neck)} ${Y(hpsH)}`, `Q ${X(0)} ${Y(hpsH - 4)} ${X(-neck)} ${Y(hpsH)}`, `Z`,
  ].join(" ");
  const line = (h, label) => `<line x1="4" x2="${W - 4}" y1="${Y(h)}" y2="${Y(h)}" stroke="#999" stroke-width="0.25" stroke-dasharray="1.5 1.5"/><text x="${W - 4}" y="${r1(Y(h) - 0.8)}" font-size="2.6" text-anchor="end" fill="#666">${label}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="Front view of the garment over a body built from your measurements">` +
    `<circle cx="${cx}" cy="${Y(headY)}" r="${r1(headR)}" fill="#d9d2c8"/>` +
    `<path d="${arm(-1)}" fill="#d9d2c8"/><path d="${arm(1)}" fill="#d9d2c8"/>` +
    `<path d="${bodyPath}" fill="#d9d2c8"/>` +
    `<path d="${sleeve(-1)}" fill="#3d6fb4" fill-opacity="0.55" stroke="#274c80" stroke-width="0.4"/><path d="${sleeve(1)}" fill="#3d6fb4" fill-opacity="0.55" stroke="#274c80" stroke-width="0.4"/>` +
    `<path d="${garmentPath}" fill="#3d6fb4" fill-opacity="0.55" stroke="#274c80" stroke-width="0.4"/>` +
    line(H * L.waist, "waist") + line(H * L.hip, "hip") + `</svg>`;
}

/**
 * Side view: the garment's depth against the body's at chest, waist and hem.
 * Depth of each level is the ellipse depth (ratio x front width) for the
 * body circumference; the garment uses the same ellipse shape at its own
 * circumference, so ease shows as extra front-to-back room. The body depth
 * ratios are assumed averages; belly, bust and posture change them.
 * Geometry only: no drape, no cloth.
 * @returns {{depths:{where:string,body:number,garment:number,extra:number}[], svg:string}}
 */
export function sideView({ H, chest, waist, hip, gChest, hpsH, hemH }) {
  const L = LANDMARKS;
  const d = (circ, ratio) => ratio * frontWidth(circ, ratio);
  const lv = [
    { where: "chest", h: H * L.chest, b: d(chest, DEPTH.chest), g: d(gChest, DEPTH.chest) },
    { where: "waist", h: H * L.waist, b: d(waist, DEPTH.waist), g: d(gChest, DEPTH.waist) },
    { where: "hip (hem)", h: Math.min(hemH, H * L.hip), b: d(hip, DEPTH.hip), g: d(gChest, DEPTH.hip) },
  ];
  const W = 120, pad = 6, cx = W / 2, top = H + pad, bottom = H * 0.2;
  const Y = h => r1(top - h), X = x => r1(cx + x);
  const poly = (pts) => pts.map((p, i) => `${i ? "L" : "M"} ${X(p[0])} ${Y(p[1])}`).join(" ") + " Z";
  const bodyPts = [[-lv[0].b / 2, H * L.shoulder], ...lv.map(l => [-l.b / 2, H * (l === lv[2] ? L.hip : l.h / H)]), [-lv[2].b / 2 * 0.9, bottom], [lv[2].b / 2 * 0.9, bottom], ...[...lv].reverse().map(l => [l.b / 2, H * (l === lv[2] ? L.hip : l.h / H)]), [lv[0].b / 2, H * L.shoulder]];
  const gPts = [[-lv[0].g / 2 * 0.9, hpsH], [-lv[0].g / 2, H * L.chest], [-lv[2].g / 2, hemH], [lv[2].g / 2, hemH], [lv[0].g / 2, H * L.chest], [lv[0].g / 2 * 0.9, hpsH]];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${r1(top - bottom + pad)}" role="img" aria-label="Side view: garment depth against the body">` +
    `<circle cx="${cx}" cy="${Y(H - H * 0.065)}" r="${r1(H * 0.065)}" fill="#d9d2c8"/>` +
    `<path d="${poly(bodyPts)}" fill="#d9d2c8"/>` +
    `<path d="${poly(gPts)}" fill="#3d6fb4" fill-opacity="0.55" stroke="#274c80" stroke-width="0.4"/></svg>`;
  return { depths: lv.map(l => ({ where: l.where, body: r1(l.b), garment: r1(l.g), extra: r1(l.g - l.b) })), svg };
}
