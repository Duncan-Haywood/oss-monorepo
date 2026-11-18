/**
 * Sunglasses: pick a stock frame shape a factory already makes, set its
 * measurements, choose colours and lenses, and brand it (logo on the temple,
 * a small mark on the lens, the case and the cloth). This is how most small
 * eyewear brands start: an OEM frame with their own logo and packaging,
 * rather than a new frame mould.
 *
 * Measurements follow the size printed inside most temples, "52□18-145":
 * lens width, bridge and temple length in millimetres.
 */

export const FRAME_STYLES = Object.freeze({
  wayfarer: { id: "wayfarer", label: "Trapezoid (wayfarer-style)", lens: [48, 56], bridge: [16, 22], temple: [140, 150], note: "Bold acetate classic; suits most faces." },
  round: { id: "round", label: "Round", lens: [44, 52], bridge: [18, 23], temple: [140, 150], note: "Vintage look, often thin metal or acetate." },
  aviator: { id: "aviator", label: "Aviator (teardrop)", lens: [55, 62], bridge: [12, 16], temple: [135, 145], note: "Metal double bridge; large lenses." },
  "cat-eye": { id: "cat-eye", label: "Cat-eye", lens: [50, 56], bridge: [16, 20], temple: [140, 145], note: "Upswept outer corners." },
  square: { id: "square", label: "Square", lens: [50, 58], bridge: [16, 22], temple: [140, 150], note: "Thick flat acetate reads as luxury." },
  oval: { id: "oval", label: "Narrow oval", lens: [48, 54], bridge: [16, 20], temple: [140, 145], note: "Small, slim lenses." },
});

export const FRAME_MATERIALS = Object.freeze({
  acetate: { id: "acetate", label: "Cellulose acetate", note: "Polished, deep colours and tortoiseshell; the usual luxury material." },
  metal: { id: "metal", label: "Metal (stainless or alloy)", note: "Thin and light; logos are usually laser engraved." },
  tr90: { id: "tr90", label: "TR90 nylon", note: "Light and flexible; cheaper, sporty." },
  "injection-plastic": { id: "injection-plastic", label: "Injection-moulded plastic", note: "Cheapest; reads as fast fashion." },
});

export const LENSES = Object.freeze({
  grey: { id: "grey", label: "Grey", tint: "#3d4045" },
  brown: { id: "brown", label: "Brown", tint: "#5a3c22" },
  green: { id: "green", label: "G-15 green", tint: "#3e4a36" },
  mirror: { id: "mirror", label: "Silver mirror", tint: "#9aa3ad" },
  gradient: { id: "gradient", label: "Grey gradient", tint: "#4a4d52" },
  yellow: { id: "yellow", label: "Yellow", tint: "#c9a83a" },
});

/** Logo methods by where they go; prices come from the supplier sheet. */
export const LOGO_METHODS = Object.freeze({
  "laser-engrave": { id: "laser-engrave", label: "Laser engraving", where: ["temple", "lens"], note: "Permanent, tone-on-tone. On a lens it is a small etched mark at the outer corner." },
  "pad-print": { id: "pad-print", label: "Pad print", where: ["temple", "lens", "case"], note: "Ink in one colour; can wear off a temple with use." },
  "metal-plate": { id: "metal-plate", label: "Metal plate inlay", where: ["temple"], note: "A small metal badge set into an acetate temple; reads as luxury, needs a tooling charge." },
  "hot-stamp": { id: "hot-stamp", label: "Hot foil stamp", where: ["case", "cloth"], note: "Gold or silver foil pressed into a leatherette case or a cloth." },
  emboss: { id: "emboss", label: "Embossing (blind)", where: ["case"], note: "Raised, no ink; quiet luxury on a case." },
  "print-cloth": { id: "print-cloth", label: "Printed cleaning cloth", where: ["cloth"], note: "Full-colour print on the microfibre cloth." },
});

export const CASES = Object.freeze({
  "hard-clamshell": { id: "hard-clamshell", label: "Hard clamshell case" },
  "leatherette-folding": { id: "leatherette-folding", label: "Folding leatherette case" },
  pouch: { id: "pouch", label: "Microfibre pouch" },
  "box-and-case": { id: "box-and-case", label: "Gift box with hard case" },
});

export function newEyewear(overrides = {}) {
  return {
    name: "Model 01",
    style: "wayfarer",
    material: "acetate",
    frameColour: "#1b1b1d",
    lens: "grey",
    polarised: true,
    lensWidth: 52,
    bridge: 18,
    temple: 145,
    logos: [{ where: "temple", text: "BRAND", method: "laser-engrave" }],
    caseType: "hard-clamshell",
    caseColour: "#1b1b1d",
    quantity: 100,
    price: 65,
    ...overrides,
  };
}

/** "52□18-145", the size printed inside the temple. */
export const sizeLabel = e => `${e.lensWidth}□${e.bridge}-${e.temple}`;

/** Approximate total frame width: two lenses, the bridge and about 6 mm of rim and hinge each side. */
export const frameWidth = e => e.lensWidth * 2 + e.bridge + 12;

/** Checks against the style's usual range and the stated regulations, phrased as things to confirm. */
export function eyewearNotes(e) {
  const s = FRAME_STYLES[e.style];
  const notes = [];
  if (!s) return ["Unknown frame style."];
  const out = (v, [lo, hi], what) => {
    if (v < lo || v > hi) notes.push(`${what} ${v} mm is outside the usual ${lo}-${hi} mm for a ${s.label.toLowerCase()} frame; ask whether the factory has a stock frame this size or it needs a new mould.`);
  };
  out(e.lensWidth, s.lens, "Lens width");
  out(e.bridge, s.bridge, "Bridge");
  out(e.temple, s.temple, "Temple length");
  const fw = frameWidth(e);
  if (fw < 125) notes.push(`About ${fw} mm across: a narrow fit, typically for small faces.`);
  if (fw > 150) notes.push(`About ${fw} mm across: a wide, oversized fit.`);
  for (const l of e.logos) {
    const m = LOGO_METHODS[l.method];
    if (m && !m.where.includes(l.where)) notes.push(`${m.label} is not usually used on the ${l.where}; it suits ${m.where.join(", ")}.`);
    if (l.where === "temple" && l.text && l.text.length > 14) notes.push(`"${l.text}" is long for a temple arm; around 14 characters fits at a readable size.`);
    if (l.method === "metal-plate" && e.material !== "acetate") notes.push("A metal plate inlay is set into acetate; on a metal or nylon frame use laser engraving.");
  }
  notes.push("To sell sunglasses in the EU and UK they are personal protective equipment (category I): ask the factory for the EN ISO 12312-1 test report, the UV filter category marked on the temple, and the declaration of conformity. In the US, ask for the impact-resistance (drop-ball) test the FDA requires for sunglasses.");
  return notes;
}

/** Example eyewear supplier sheet: placeholders, not a quote. */
export const EXAMPLE_EYEWEAR_SUPPLIER = Object.freeze({
  name: "Example eyewear sheet (placeholder numbers, replace with a real quote)",
  example: true,
  currency: "EUR",
  moq: 100,
  frames: { acetate: 9, metal: 7, tr90: 4, "injection-plastic": 2 },
  polarisedExtra: 1.5,
  logos: {
    "laser-engrave": { setup: 30, perUnit: 0.3 },
    "pad-print": { setup: 40, perUnit: 0.25 },
    "metal-plate": { setup: 150, perUnit: 0.8 },
    "hot-stamp": { setup: 60, perUnit: 0.3 },
    emboss: { setup: 60, perUnit: 0.25 },
    "print-cloth": { setup: 0, perUnit: 0.4 },
  },
  cases: { "hard-clamshell": 2.5, "leatherette-folding": 3.5, pouch: 0.8, "box-and-case": 5 },
  clothPerUnit: 0.4,
  packagingPerUnit: 0.6,
  freightPerUnit: 1.2,
  dutyPct: 0,
});

const round2 = v => Math.round(v * 100) / 100;

export function eyewearCost(e, sheet = EXAMPLE_EYEWEAR_SUPPLIER) {
  const q = Math.max(1, e.quantity);
  const frame = sheet.frames[e.material];
  if (frame == null) throw new Error(`The supplier sheet has no frame price for ${e.material}.`);
  const caseCost = sheet.cases[e.caseType];
  if (caseCost == null) throw new Error(`The supplier sheet has no price for a ${e.caseType}.`);
  const lines = [
    { label: `Frame and lenses (${FRAME_MATERIALS[e.material].label.toLowerCase()})`, value: frame },
  ];
  if (e.polarised) lines.push({ label: "Polarised lenses", value: sheet.polarisedExtra || 0 });
  for (const l of e.logos) {
    const p = sheet.logos[l.method];
    if (!p) throw new Error(`The supplier sheet has no price for ${l.method}.`);
    lines.push({ label: `${LOGO_METHODS[l.method].label} (${l.where})`, value: p.perUnit + p.setup / q });
  }
  lines.push({ label: CASES[e.caseType].label, value: caseCost });
  lines.push({ label: "Cleaning cloth", value: sheet.clothPerUnit || 0 });
  lines.push({ label: "Packaging", value: sheet.packagingPerUnit || 0 });
  const goods = lines.reduce((s, l) => s + l.value, 0);
  const duty = goods * (sheet.dutyPct || 0) / 100;
  lines.push({ label: "Duty", value: duty });
  lines.push({ label: "Freight to you", value: sheet.freightPerUnit || 0 });
  const landed = lines.reduce((s, l) => s + l.value, 0);
  return { currency: sheet.currency, lines: lines.map(l => ({ ...l, value: round2(l.value) })), landed: round2(landed) };
}

/** Plain-text spec and quote request for an OEM eyewear factory. */
export function eyewearQuoteRequest(e) {
  return [
    `Subject: Quote request: ${e.name} (${e.quantity} pairs, own logo)`,
    "",
    "Hello,",
    "",
    `I'd like a quote and a sample for a stock frame with my branding. Could you confirm the price per pair at ${e.quantity}, your minimum order, logo setup charges, lead times for a sample and production, and shipping to [your city, country]?`,
    "",
    `Frame: ${FRAME_STYLES[e.style].label}, ${FRAME_MATERIALS[e.material].label.toLowerCase()}, colour ${e.frameColour} (I can send a reference)`,
    `Size: ${sizeLabel(e)} (lens width, bridge, temple in mm)`,
    `Lenses: ${LENSES[e.lens].label}${e.polarised ? ", polarised" : ""}, UV400`,
    ...e.logos.map((l, i) => `Logo ${i + 1}: "${l.text}" on the ${l.where}, ${LOGO_METHODS[l.method].label.toLowerCase()}`),
    `Case: ${CASES[e.caseType].label.toLowerCase()}, colour ${e.caseColour}; cleaning cloth included`,
    "",
    "Please include the EN ISO 12312-1 test report and declaration of conformity (for the EU/UK) and the FDA drop-ball impact test (for the US), and the filter category you will mark on the temple.",
    "",
    "Thank you,",
    "[Your name]",
  ].join("\n");
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function lensPath(style, cx, cy, w, h, mirror) {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  const s = mirror ? -1 : 1;
  switch (style) {
    case "round": return `M${cx - w / 2} ${cy} a${w / 2} ${h / 2} 0 1 0 ${w} 0 a${w / 2} ${h / 2} 0 1 0 ${-w} 0 Z`;
    case "oval": return `M${x0} ${cy} Q${x0} ${y0 + 4} ${cx} ${y0 + 4} Q${x1} ${y0 + 4} ${x1} ${cy} Q${x1} ${y1 - 4} ${cx} ${y1 - 4} Q${x0} ${y1 - 4} ${x0} ${cy} Z`;
    case "aviator": return `M${x0} ${y0 + 2} L${x1} ${y0 + 2} Q${x1 + s * 2} ${cy + h * 0.2} ${cx + s * w * 0.15} ${y1 + 4} Q${cx - s * w * 0.35} ${y1 + 2} ${x0} ${cy}  Z`;
    case "cat-eye": return mirror
      ? `M${x1} ${y0 + 6} L${x0} ${y0 - 6} Q${x0 + 4} ${y1} ${cx} ${y1} Q${x1} ${y1} ${x1} ${y0 + 6} Z`
      : `M${x0} ${y0 + 6} L${x1} ${y0 - 6} Q${x1 - 4} ${y1} ${cx} ${y1} Q${x0} ${y1} ${x0} ${y0 + 6} Z`;
    case "square": return `M${x0} ${y0} L${x1} ${y0} L${x1} ${y1 - 6} Q${x1} ${y1} ${x1 - 6} ${y1} L${x0 + 6} ${y1} Q${x0} ${y1} ${x0} ${y1 - 6} Z`;
    default: return `M${x0} ${y0} L${x1} ${y0} L${x1 - 4} ${y1 - 8} Q${x1 - 6} ${y1} ${x1 - 14} ${y1} L${x0 + 12} ${y1} Q${x0 + 4} ${y1} ${x0 + 2} ${y1 - 8} Z`;
  }
}

/** Front view and side view (temple and case) of the sunglasses, to scale at 3 px per mm. */
export function renderEyewear(e, { view = "front" } = {}) {
  const k = 3;
  const tint = LENSES[e.lens]?.tint ?? "#444";
  const rim = e.material === "metal" ? 2 : 6;
  const frameW = frameWidth(e) * k;
  const lw = e.lensWidth * k;
  const lh = e.lensWidth * k * (e.style === "aviator" ? 0.82 : e.style === "round" ? 0.95 : 0.72);
  if (view === "front") {
    const cy = 120;
    const lcx = 250 - (e.bridge * k) / 2 - lw / 2;
    const rcx = 250 + (e.bridge * k) / 2 + lw / 2;
    const lensMark = e.logos.find(l => l.where === "lens");
    const hingeY = ["round", "oval"].includes(e.style) ? 0.12 : e.style === "aviator" ? 0.42 : 0.48;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${250 - frameW / 2 - 20} 20 ${frameW + 40} 200" role="img" aria-label="${esc(`${e.name}, front view, ${sizeLabel(e)}`)}"><title>${esc(`${e.name}, front, ${sizeLabel(e)}`)}</title>`
      + `<defs><linearGradient id="lensg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tint}" stop-opacity=".95"/><stop offset="1" stop-color="${tint}" stop-opacity="${e.lens === "gradient" ? 0.35 : 0.85}"/></linearGradient></defs>`
      + `<path d="${lensPath(e.style, lcx, cy, lw, lh, false)}" fill="url(#lensg)" stroke="${esc(e.frameColour)}" stroke-width="${rim}" stroke-linejoin="round"/>`
      + `<path d="${lensPath(e.style, rcx, cy, lw, lh, true)}" fill="url(#lensg)" stroke="${esc(e.frameColour)}" stroke-width="${rim}" stroke-linejoin="round"/>`
      + `<path d="M${lcx + lw / 2 - 2} ${cy - lh / 2 + 10} Q250 ${cy - lh / 2 - 4} ${rcx - lw / 2 + 2} ${cy - lh / 2 + 10}" fill="none" stroke="${esc(e.frameColour)}" stroke-width="${rim}"/>`
      + (e.style === "aviator" ? `<path d="M${lcx + lw / 2 - 4} ${cy - lh / 2 - 2} L${rcx - lw / 2 + 4} ${cy - lh / 2 - 2}" stroke="${esc(e.frameColour)}" stroke-width="2"/>` : "")
      + `<rect x="${lcx - lw / 2 - 10}" y="${cy - lh * hingeY}" width="12" height="${rim + 6}" fill="${esc(e.frameColour)}"/><rect x="${rcx + lw / 2 - 2}" y="${cy - lh * hingeY}" width="12" height="${rim + 6}" fill="${esc(e.frameColour)}"/>`
      + `<path d="M${lcx - lw / 3} ${cy - lh / 4} l18 -10" stroke="#fff" stroke-opacity=".35" stroke-width="5" stroke-linecap="round"/>`
      + (lensMark ? `<text x="${rcx + lw / 2 - 14}" y="${cy - lh / 2 + 22}" text-anchor="end" font-size="9" font-family="Georgia, serif" fill="#fff" fill-opacity=".7">${esc(lensMark.text)}</text>` : "")
      + `<text x="250" y="212" text-anchor="middle" font-size="11" fill="#777">${esc(sizeLabel(e))} · about ${frameWidth(e)} mm across</text>`
      + `</svg>`;
  }
  const tl = e.temple * k;
  const templeLogo = e.logos.find(l => l.where === "temple");
  const caseLogo = e.logos.find(l => l.where === "case");
  const thick = e.material === "metal" ? 5 : 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tl + 60} 260" role="img" aria-label="${esc(`${e.name}, temple and case`)}"><title>${esc(`${e.name}, temple and case`)}</title>`
    + `<path d="M20 40 L${20 + tl * 0.8} 40 Q${20 + tl * 0.92} 40 ${20 + tl} 80" fill="none" stroke="${esc(e.frameColour)}" stroke-width="${thick}" stroke-linecap="round"/>`
    + (templeLogo ? `<text x="${40 + tl * 0.08}" y="${40 + (e.material === "metal" ? -6 : 4)}" font-size="${e.material === "metal" ? 10 : 9}" font-family="Georgia, serif" letter-spacing="1.5" fill="${templeLogo.method === "metal-plate" ? "#d9c27a" : "#ffffff"}" fill-opacity="${templeLogo.method === "laser-engrave" ? 0.55 : 0.9}">${esc(templeLogo.text)}</text>` : "")
    + `<text x="20" y="72" font-size="11" fill="#777">Temple ${e.temple} mm</text>`
    + `<rect x="40" y="130" width="${Math.min(tl, 300)}" height="90" rx="${e.caseType === "pouch" ? 30 : 40}" fill="${esc(e.caseColour)}" stroke="#00000033"/>`
    + `<line x1="40" y1="175" x2="${40 + Math.min(tl, 300)}" y2="175" stroke="#00000033"/>`
    + (caseLogo ? `<text x="${40 + Math.min(tl, 300) / 2}" y="160" text-anchor="middle" font-size="14" font-family="Georgia, serif" letter-spacing="2" fill="${caseLogo.method === "hot-stamp" ? "#d9c27a" : caseLogo.method === "emboss" ? "#ffffff55" : "#ffffffcc"}">${esc(caseLogo.text)}</text>` : "")
    + `<text x="40" y="245" font-size="11" fill="#777">${esc(CASES[e.caseType]?.label ?? "")}</text>`
    + `</svg>`;
}
