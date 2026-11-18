/**
 * Care symbols (ISO 3758 / GINETEX family) drawn as SVG for the neck label.
 * Five positions in fixed order: wash, bleach, tumble dry, iron, professional
 * care. A code per position; `careCodes(care)` maps the text from
 * `suggestCare` (labels.mjs) to codes. Drawn from the published symbol shapes
 * as understood by the author; check the artwork against the current standard
 * (ISO 3758 or CAN/CGSB-86.1 for Canada) and the factory's wash test before
 * printing. Not legal advice.
 */
export const WASH = Object.freeze(["30", "40", "50", "60", "95", "30-gentle", "30-very-gentle", "hand", "none"]);
export const BLEACH = Object.freeze(["any", "non-chlorine", "none"]);
export const DRY = Object.freeze(["tumble-low", "tumble-normal", "tumble-none", "line", "flat", "drip"]);
export const IRON = Object.freeze(["low", "medium", "high", "none", "no-steam"]);
export const PRO = Object.freeze(["any", "gentle", "none"]);

const S = 'fill="none" stroke="#111" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"';
const cross = '<path d="M3 3L33 33M33 3L3 33" stroke="#111" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
const dots = (n, cx, cy) => Array.from({ length: n }, (_, i) => `<circle cx="${cx + (i - (n - 1) / 2) * 5}" cy="${cy}" r="1.5" fill="#111"/>`).join("");
const wrap = (inner, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="48" height="48" role="img" aria-label="${label}">${inner}</svg>`;

export function washSymbol(code) {
  const tub = `<path d="M4 11h28l-3 18H7z" ${S}/>`;
  const label = { hand: "Hand wash only", none: "Do not wash" }[code] ?? `Machine wash, ${parseInt(code, 10)} degrees C${code.endsWith("very-gentle") ? ", very gentle cycle" : code.endsWith("gentle") ? ", gentle cycle" : ""}`;
  if (code === "hand") return wrap(`${tub}<path d="M12 22c0-5 2-7 3-7v-3m3 3v-4m3 4v-3m3 4v-2c2 0 2 2 2 4l-1 5h-9z" ${S} stroke-width="1"/>`, label);
  if (code === "none") return wrap(tub + cross, label);
  const deg = parseInt(code, 10);
  const bars = code.endsWith("very-gentle") ? 2 : code.endsWith("gentle") ? 1 : 0;
  const barSvg = Array.from({ length: bars }, (_, i) => `<path d="M3 ${33 + i * 3}H33" ${S}/>`).join("");
  return wrap(`${tub}<text x="18" y="25" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#111">${deg}</text>${barSvg}`, label);
}
export function bleachSymbol(code) {
  const tri = `<path d="M18 5L33 31H3z" ${S}/>`;
  if (code === "none") return wrap(tri + cross, "Do not bleach");
  if (code === "non-chlorine") return wrap(`${tri}<path d="M12 27L21 13M16 28L24 14" ${S} stroke-width="1.2"/>`, "Non-chlorine bleach only");
  return wrap(tri, "Any bleach");
}
export function drySymbol(code) {
  const sq = `<rect x="4" y="4" width="28" height="28" ${S}/>`;
  const circ = '<circle cx="18" cy="18" r="10" ' + S + "/>";
  if (code === "tumble-low") return wrap(sq + circ + dots(1, 18, 18), "Tumble dry, low heat");
  if (code === "tumble-normal") return wrap(sq + circ + dots(2, 18, 18), "Tumble dry, normal heat");
  if (code === "tumble-none") return wrap(sq + circ + cross, "Do not tumble dry");
  if (code === "line") return wrap(`${sq}<path d="M18 4V32" ${S}/>`, "Line dry");
  if (code === "flat") return wrap(`${sq}<path d="M9 18H27" ${S}/>`, "Dry flat");
  return wrap(`${sq}<path d="M12 4V32M24 4V32" ${S}/>`, "Drip dry");
}
export function ironSymbol(code) {
  const iron = `<path d="M4 28h28c0-9-5-16-13-16H4z" ${S}/>`;
  if (code === "none") return wrap(iron + cross, "Do not iron");
  const n = { low: 1, medium: 2, high: 3, "no-steam": 1 }[code] ?? 1;
  const label = { low: "Iron low", medium: "Iron medium", high: "Iron high", "no-steam": "Iron low, no steam" }[code] ?? "Iron";
  const extra = code === "no-steam" ? '<path d="M8 33L28 9" stroke="#111" stroke-width="1.6"/>' : "";
  return wrap(`${iron}${dots(n, 18, 23)}${extra}`, label);
}
export function proSymbol(code) {
  const c = '<circle cx="18" cy="18" r="14" ' + S + "/>";
  const p = '<text x="18" y="23" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#111">P</text>';
  if (code === "none") return wrap(c + cross, "Do not dry-clean");
  if (code === "gentle") return wrap(`${c}${p}<path d="M6 35H30" ${S}/>`, "Professional dry-clean, gentle process");
  return wrap(c + p, "Professional dry-clean");
}

/** Map `suggestCare` text to one code per position. Unknown text gives null for that position. */
export function careCodes(care) {
  if (!care) return null;
  const w = care.wash ?? "", d = care.dry ?? "", i = care.iron ?? "", b = care.bleach ?? "";
  return {
    wash: /hand wash/i.test(w) ? "hand" : /gentle/i.test(w) ? "30-gentle" : /cold/i.test(w) ? "30" : /warm/i.test(w) ? "40" : null,
    bleach: /non-chlorine/i.test(b) ? "non-chlorine" : /do not/i.test(b) ? "none" : null,
    dry: /do not tumble/i.test(d) ? (/flat/i.test(d) ? "flat" : "line") : /tumble dry low/i.test(d) ? "tumble-low" : /tumble/i.test(d) ? "tumble-normal" : null,
    iron: /do not iron/i.test(i) ? "none" : /low/i.test(i) ? "low" : /medium/i.test(i) ? "medium" : /high/i.test(i) ? "high" : null,
    pro: /dry-clean/i.test(w) ? "gentle" : null,
  };
}

/** The label strip: an HTML string of the five SVGs, in standard order, skipping unknown positions. */
export function careStrip(codes) {
  if (!codes) return "";
  const parts = [
    codes.wash && washSymbol(codes.wash), codes.bleach && bleachSymbol(codes.bleach),
    codes.dry && drySymbol(codes.dry), codes.iron && ironSymbol(codes.iron), codes.pro && proSymbol(codes.pro),
  ].filter(Boolean);
  return `<div class="care-strip" style="display:flex;gap:8px;flex-wrap:wrap">${parts.join("")}</div>`;
}

/** A standalone SVG-per-symbol bundle for download (name, svg). */
export function careFiles(codes) {
  if (!codes) return [];
  const f = [["wash", codes.wash && washSymbol(codes.wash)], ["bleach", codes.bleach && bleachSymbol(codes.bleach)], ["dry", codes.dry && drySymbol(codes.dry)], ["iron", codes.iron && ironSymbol(codes.iron)], ["professional", codes.pro && proSymbol(codes.pro)]];
  return f.filter(([, s]) => s).map(([n, s]) => ({ name: `care-${n}.svg`, svg: s }));
}
