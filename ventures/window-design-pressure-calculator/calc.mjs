// Wall components-and-cladding wind pressures for windows, doors and garage
// doors to ASCE/SEI 7-16 (the edition IBC 2018, IBC 2021, IRC 2018 and IRC 2021
// adopt), Chapter 26 velocity pressure and Chapter 30 Part 1 (low-rise and
// enclosed or partially enclosed buildings with a mean roof height h <= 60 ft).
//
// For each opening in a schedule: its effective wind area, its wall zone
// (4 interior, 5 within distance a of a corner), the external pressure
// coefficients from Figure 30.3-1, the net strength-level pressures
// p = qh [(GCp) - (GCpi)] (Eq. 30.3-1), and the allowable-stress (ASD) design
// pressures 0.6 p that a window's or door's DP rating is compared with.
//
// Pure functions on typed numbers: no I/O, no clock, no randomness. The basic
// wind speed V is the user's (ASCE 7-16 Figure 26.5-1, a hazard lookup by
// address, or the building department); nothing here looks one up.

/** Table 26.11-1 (ASCE 7-16): terrain exposure constants alpha and zg (ft). */
export const EXPOSURE = {
  B: { alpha: 7.0, zg: 1200, label: "B: urban, suburban or wooded" },
  C: { alpha: 9.5, zg: 900, label: "C: open terrain, scattered obstructions, most shorelines in hurricane regions" },
  D: { alpha: 11.5, zg: 700, label: "D: flat, unobstructed, facing open water outside hurricane regions" },
};

/** Table 26.13-1: internal pressure coefficient (GCpi), applied in both signs. */
export const ENCLOSURE = {
  enclosed: { gcpi: 0.18, label: "Enclosed (openings protected or not counted)" },
  partial: { gcpi: 0.55, label: "Partially enclosed" },
  partiallyOpen: { gcpi: 0.18, label: "Partially open" },
};

/** Figure 26.8-1 (ASCE 7-16): topographic multiplier parameters by hill shape. */
export const TOPOGRAPHY = {
  none: { label: "None: flat or gently rolling site (Kzt = 1)" },
  ridge: { label: "2-D ridge", k1: { B: 1.30, C: 1.45, D: 1.55 }, gamma: 3, muUp: 1.5, muDown: 1.5 },
  escarpment: { label: "2-D escarpment (bluff, cliff)", k1: { B: 0.75, C: 0.85, D: 0.95 }, gamma: 2.5, muUp: 1.5, muDown: 4 },
  hill: { label: "3-D axisymmetric hill", k1: { B: 0.95, C: 1.05, D: 1.15 }, gamma: 4, muUp: 1.5, muDown: 1.5 },
};

/** Table 26.6-1: wind directionality factor for building components and cladding. */
export const KD = 0.85;

/** Section 30.2.2: minimum C&C design pressure, strength level (psf). */
export const MIN_PRESSURE = 16;

/** Section 2.4 (ASD load combinations): wind load factor. */
export const ASD_FACTOR = 0.6;

/**
 * Figure 30.3-1 (h <= 60 ft): wall (GCp) at 10 ft^2 and 500 ft^2 of effective
 * wind area, varying linearly with log10(A) between them and constant outside.
 */
export const WALL_GCP = {
  4: { pos: [1.0, 0.7], neg: [-1.1, -0.8] },
  5: { pos: [1.0, 0.7], neg: [-1.4, -0.8] },
};

const DEG = Math.PI / 180;
const num = (v) => {
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim();
  return s === "" ? NaN : Number(s);
};
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Table 26.10-1 note: Kz = 2.01 (z/zg)^(2/alpha), z not less than 15 ft. */
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);

export function kz(z, exposure) {
  const e = own(EXPOSURE, exposure);
  if (!e) throw new Error(`unknown exposure ${exposure}`);
  const zz = Math.min(Math.max(z, 15), e.zg);
  return 2.01 * Math.pow(zz / e.zg, 2 / e.alpha);
}

/** Table 26.9-1 note 2: ground elevation factor Ke = e^(-0.0000362 zg), zg in ft above sea level. */
export function ke(elevationFt) {
  if (!Number.isFinite(elevationFt) || elevationFt <= 0) return 1;
  return Math.exp(-0.0000362 * elevationFt);
}

/**
 * Figure 26.8-1 and Section 26.8.1: topographic factor Kzt = (1 + K1 K2 K3)^2.
 * H: hill height (ft); Lh: horizontal distance upwind of the crest to where the
 * ground is half the hill height (ft); x: distance from the crest to the
 * building (ft); side: "upwind" or "downwind"; z: height above local ground (ft).
 * Returns { kzt, applies, reason, k1, k2, k3 }.
 */
export function kzt({ shape, H, Lh, x, side, z, exposure }) {
  const t = own(TOPOGRAPHY, shape);
  if (!t || shape === "none") return { kzt: 1, applies: false, reason: "no topographic feature entered" };
  if (!(H > 0) || !(Lh > 0) || !(x >= 0) || !(z > 0)) return { kzt: 1, applies: false, reason: "hill height, Lh and distance from the crest are needed", invalid: true };
  const ratio = H / Lh;
  if (ratio < 0.2) return { kzt: 1, applies: false, reason: `H/Lh = ${r2(ratio)} is under 0.2 (Section 26.8.1, condition 4)` };
  const hMin = exposure === "B" ? 60 : 15;
  if (H < hMin) return { kzt: 1, applies: false, reason: `H = ${H} ft is under ${hMin} ft for exposure ${exposure} (Section 26.8.1, condition 5)` };
  // Figure 26.8-1 note 2: for H/Lh > 0.5 take H/Lh = 0.5 for K1 and Lh = 2H for K2 and K3.
  const capped = ratio > 0.5;
  const ratioUsed = capped ? 0.5 : ratio;
  const LhUsed = capped ? 2 * H : Lh;
  const k1 = t.k1[exposure] * ratioUsed;
  const mu = side === "downwind" ? t.muDown : t.muUp;
  const k2 = Math.max(0, 1 - Math.abs(x) / (mu * LhUsed));
  const k3 = Math.exp((-t.gamma * z) / LhUsed);
  return { kzt: Math.pow(1 + k1 * k2 * k3, 2), applies: true, k1, k2, k3, mu, capped, LhUsed, ratio };
}

/** Figure 30.3-1: wall (GCp) for zone 4 or 5 at effective wind area A (ft^2). */
export function wallGcp(zone, area, lowSlope) {
  const c = own(WALL_GCP, String(zone));
  if (!c) throw new Error(`unknown wall zone ${zone}`);
  const A = Math.min(Math.max(area, 10), 500);
  const f = Math.log10(A / 10) / Math.log10(50);
  const at = ([a, b]) => a + (b - a) * f;
  // Figure 30.3-1 note 5: values reduced by 10% when the roof slope is 10 degrees or less.
  const k = lowSlope ? 0.9 : 1;
  return { pos: at(c.pos) * k, neg: at(c.neg) * k };
}

/** Figure 30.3-1 note 6: a = min(0.1 least dimension, 0.4 h), not less than 0.04 least dimension or 3 ft. */
export function zoneWidth(leastDim, h) {
  return Math.max(Math.min(0.1 * leastDim, 0.4 * h), 0.04 * leastDim, 3);
}

/** Section 26.12.3.1: wind-borne debris region test (Risk Category II map speeds). */
export function debrisRegion(V, coastal) {
  if (V >= 140) return { inRegion: true, why: `V = ${V} mph is 140 mph or more` };
  if (V >= 130 && coastal) return { inRegion: true, why: `V = ${V} mph is 130 mph or more within 1 mile of the coastal mean high water line` };
  return { inRegion: false, why: V >= 130 ? "V is 130-139 mph but the site is not within 1 mile of the coast" : "V is under 130 mph" };
}

/**
 * Parse an opening schedule. One opening per line:
 *   label, width (in), height (in)[, distance to nearest corner (ft) | z4 | z5][, count]
 * Tabs or commas separate fields. A header line or a line starting with # is skipped.
 */
export function parseOpenings(text) {
  const openings = [];
  const problems = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const f = line.split(/\t|,/).map((s) => s.trim());
    const w = num(f[1]);
    const h = num(f[2]);
    if (i === 0 && !Number.isFinite(w) && /width|label|mark/i.test(line)) return;
    if (!(w > 0) || !(h > 0)) {
      problems.push(`line ${i + 1}: "${line}" needs a label, a width and a height in inches`);
      return;
    }
    const where = (f[3] || "").toLowerCase();
    let zone = null, corner = NaN;
    if (where === "z4") zone = 4;
    else if (where === "z5") zone = 5;
    else if (where !== "") {
      corner = num(where);
      if (!(corner >= 0)) {
        problems.push(`line ${i + 1}: "${f[3]}" is not a distance in feet, z4 or z5`);
        return;
      }
    }
    const count = f[4] === undefined || f[4] === "" ? 1 : num(f[4]);
    if (!(count >= 1) || !Number.isInteger(count)) {
      problems.push(`line ${i + 1}: count "${f[4]}" is not a whole number`);
      return;
    }
    openings.push({ label: f[0] || `Opening ${openings.length + 1}`, widthIn: w, heightIn: h, zone, corner, count });
  });
  return { openings, problems };
}

export const DEFAULTS = {
  V: "140",
  exposure: "C",
  h: "22",
  pitch: "6",
  leastDim: "32",
  enclosure: "enclosed",
  elevation: "",
  coastal: "yes",
  topo: "none",
  hillH: "",
  hillLh: "",
  hillX: "",
  hillSide: "upwind",
  openings: [
    "# label, width (in), height (in), distance to nearest corner (ft) or z4/z5, count",
    "Front bedroom window, 36, 60, 1.5, 2",
    "Living room picture window, 72, 60, 9",
    "Kitchen window, 48, 36, 14",
    "Sliding patio door, 96, 80, 6",
    "Entry door with sidelites, 64, 82, 12",
    "Garage door, 192, 84, 2",
    "Stair transom, 30, 18, z5",
  ].join("\n"),
};

export function sampleInput() {
  return { ...DEFAULTS };
}

function opening(o, ctx) {
  const area = (o.widthIn * o.heightIn) / 144;
  let zone = o.zone, zoneWhy;
  if (zone) zoneWhy = `zone ${zone} as entered`;
  else if (Number.isFinite(o.corner)) {
    zone = o.corner < ctx.a ? 5 : 4;
    zoneWhy = `${o.corner} ft from the corner, ${zone === 5 ? "inside" : "outside"} a = ${r1(ctx.a)} ft`;
  } else {
    zone = 5;
    zoneWhy = "no corner distance, taken as zone 5 (the higher suction)";
  }
  const g = wallGcp(zone, area, ctx.lowSlope);
  const pPos = Math.max(ctx.qh * (g.pos + ctx.gcpi), MIN_PRESSURE);
  const pNeg = Math.min(ctx.qh * (g.neg - ctx.gcpi), -MIN_PRESSURE);
  const minPos = ctx.qh * (g.pos + ctx.gcpi) < MIN_PRESSURE;
  const minNeg = ctx.qh * (g.neg - ctx.gcpi) > -MIN_PRESSURE;
  const asdPos = ASD_FACTOR * pPos;
  const asdNeg = ASD_FACTOR * pNeg;
  const dp = Math.max(asdPos, -asdNeg);
  return {
    ...o,
    area,
    zone,
    zoneWhy,
    gcpPos: g.pos,
    gcpNeg: g.neg,
    pPos,
    pNeg,
    minPos,
    minNeg,
    asdPos,
    asdNeg,
    // Round the requirement up to 0.1 psf so a rating equal to the shown number passes.
    dpRequired: Math.ceil(dp * 10 - 1e-9) / 10,
    dpStep5: Math.ceil(dp / 5 - 1e-9) * 5,
  };
}

/**
 * Main entry. String fields as the page's form sends them; missing fields fall
 * back to DEFAULTS. Returns { error } or the full result.
 */
export function analyze(input = {}) {
  const x = { ...DEFAULTS, ...input };
  const V = num(x.V), h = num(x.h), pitch = num(x.pitch), leastDim = num(x.leastDim);
  if (!(V > 0) || V > 300) return { error: "Enter the basic wind speed V in mph (from ASCE 7-16 Figure 26.5-1 for the risk category)." };
  if (!own(EXPOSURE, x.exposure)) return { error: "Choose exposure B, C or D." };
  if (!(h > 0)) return { error: "Enter the mean roof height h in feet." };
  if (h > 60) return { error: "This tool covers buildings with a mean roof height of 60 ft or less (Chapter 30 Part 1). Taller buildings use Part 3 and a different wall figure." };
  if (!(pitch >= 0)) return { error: "Enter the roof pitch as inches of rise per 12 (0 for flat)." };
  if (!(leastDim > 0)) return { error: "Enter the building's least horizontal dimension in feet." };
  const enc = own(ENCLOSURE, x.enclosure);
  if (!enc) return { error: "Choose an enclosure classification." };
  if (!own(TOPOGRAPHY, x.topo)) return { error: "Choose a topographic feature or None." };

  const elevation = num(x.elevation);
  const Ke = ke(elevation);
  const Kh = kz(h, x.exposure);
  const topo = kzt({ shape: x.topo, H: num(x.hillH), Lh: num(x.hillLh), x: num(x.hillX), side: x.hillSide, z: h, exposure: x.exposure });
  if (topo.invalid) return { error: "For a hill, ridge or escarpment enter its height H, the length Lh and the building's distance from the crest, or choose None." };
  const Kzt = topo.kzt;
  const qh = 0.00256 * Kh * Kzt * KD * Ke * V * V; // Eq. 26.10-1
  const theta = Math.atan(pitch / 12) / DEG;
  const lowSlope = theta <= 10;
  const a = zoneWidth(leastDim, h);
  const debris = debrisRegion(V, x.coastal === "yes");

  const { openings, problems } = parseOpenings(x.openings);
  if (problems.length) return { error: problems.slice(0, 3).join("; ") };
  if (!openings.length) return { error: "List at least one opening: label, width (in), height (in), distance to the nearest corner (ft)." };
  const ctx = { qh, a, lowSlope, gcpi: enc.gcpi };
  const rows = openings.map((o) => opening(o, ctx));
  const worst = rows.reduce((m, r) => (r.dpRequired > m.dpRequired ? r : m), rows[0]);

  const findings = [];
  if (debris.inRegion) {
    findings.push({
      severity: "high",
      title: "Wind-borne debris region: glazing needs impact protection",
      detail: `${debris.why} (Section 26.12.3.1). Glazing in the lower 60 ft must be impact-resistant or covered by an impact-protective system (Section 26.12.3.2); otherwise the building is designed as partially enclosed, and ${enc.gcpi === 0.55 ? "this schedule already uses" : "would need"} (GCpi) = ±0.55. Check the speed on the map for your risk category.`,
    });
  }
  if (x.enclosure === "partial") {
    findings.push({ severity: "medium", title: "Partially enclosed: internal pressure ±0.55", detail: "Every opening carries a much larger net pressure than in an enclosed building. If the openings will be protected, the building is enclosed." });
  }
  if (topo.applies) {
    findings.push({ severity: "medium", title: `Topography raises the pressure by ${Math.round((Kzt - 1) * 100)}%`, detail: `Kzt = ${r3(Kzt)} from K1 = ${r3(topo.k1)}, K2 = ${r3(topo.k2)}, K3 = ${r3(topo.k3)} (Figure 26.8-1${topo.capped ? `, H/Lh taken as 0.5 and Lh as 2H = ${topo.LhUsed} ft` : ""}). Section 26.8.1 also requires the feature to be isolated and to stand at least twice as high as the upwind terrain within 2 miles; if it does not, Kzt = 1.` });
  } else if (x.topo !== "none") {
    findings.push({ severity: "info", title: "Topographic factor not applied (Kzt = 1)", detail: topo.reason });
  }
  if (lowSlope) {
    findings.push({ severity: "info", title: "Low-slope roof: wall coefficients reduced 10%", detail: `The roof slope is ${r1(theta)}°, 10° or less, so Figure 30.3-1 note 5 reduces the wall (GCp) by 10%.` });
  }
  const unzoned = rows.filter((r) => r.zoneWhy.startsWith("no corner"));
  if (unzoned.length) {
    findings.push({ severity: "info", title: `${unzoned.length} opening${unzoned.length > 1 ? "s" : ""} taken as zone 5`, detail: `No distance to the nearest corner was given for ${unzoned.map((r) => r.label).join(", ")}, so the higher corner-zone suction is used. Add the distance to see whether it falls in zone 4.` });
  }
  const floored = rows.filter((r) => r.minPos || r.minNeg);
  if (floored.length) {
    findings.push({ severity: "info", title: "16 psf minimum governs some pressures", detail: `Section 30.2.2 sets a 16 psf strength-level minimum (9.6 psf ASD). It governs for ${floored.map((r) => r.label).join(", ")}.` });
  }
  if (h < 15) {
    findings.push({ severity: "info", title: "Kh taken at 15 ft", detail: "Table 26.10-1 does not go below 15 ft; a lower roof uses the 15 ft value." });
  }

  return {
    input: x,
    V,
    exposure: x.exposure,
    h,
    pitch,
    theta,
    lowSlope,
    leastDim,
    enclosure: x.enclosure,
    gcpi: enc.gcpi,
    elevation: Number.isFinite(elevation) ? elevation : null,
    Kh,
    Kzt,
    topo,
    Ke,
    Kd: KD,
    qh,
    a,
    debris,
    rows,
    worst,
    findings,
  };
}

/** Rows for the factor table: [quantity, value, unit, source]. */
export function factorRows(r) {
  return [
    ["Basic wind speed V", String(r.V), "mph", "Fig. 26.5-1 (your entry)"],
    ["Velocity pressure exposure coefficient Kh", r3(r.Kh).toFixed(3), "", `Table 26.10-1, exposure ${r.exposure}, z = ${Math.max(r.h, 15)} ft`],
    ["Topographic factor Kzt", r3(r.Kzt).toFixed(3), "", "Section 26.8, Fig. 26.8-1"],
    ["Directionality factor Kd", r.Kd.toFixed(2), "", "Table 26.6-1, components and cladding"],
    ["Ground elevation factor Ke", r3(r.Ke).toFixed(3), "", r.elevation ? `Table 26.9-1, ${r.elevation} ft above sea level` : "Table 26.9-1 (1.0 permitted)"],
    ["Velocity pressure qh = 0.00256 Kh Kzt Kd Ke V²", r2(r.qh).toFixed(2), "psf", "Eq. 26.10-1"],
    ["Internal pressure coefficient (GCpi)", `±${r.gcpi.toFixed(2)}`, "", "Table 26.13-1"],
    ["Roof slope", r1(r.theta).toFixed(1), "°", r.lowSlope ? "10° or less: wall GCp × 0.9 (Fig. 30.3-1 note 5)" : "over 10°: no reduction"],
    ["Corner zone width a", r1(r.a).toFixed(1), "ft", "Fig. 30.3-1 note 6"],
  ];
}

/** CSV of the opening schedule with its pressures. */
export function reportCsv(r) {
  const q = (v) => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`; // keep spreadsheet formulas inert
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Opening", "Count", "Width (in)", "Height (in)", "Area (ft2)", "Zone", "GCp+", "GCp-", "p+ strength (psf)", "p- strength (psf)", "ASD + (psf)", "ASD - (psf)", "Required DP (psf)"];
  const lines = [head.map(q).join(",")];
  for (const x of r.rows) {
    lines.push([x.label, x.count, x.widthIn, x.heightIn, r2(x.area), x.zone, r3(x.gcpPos), r3(x.gcpNeg), r1(x.pPos), r1(x.pNeg), r1(x.asdPos), r1(x.asdNeg), x.dpRequired.toFixed(1)].map(q).join(","));
  }
  lines.push("");
  for (const [n, v, u, s] of factorRows(r)) lines.push([n, v, u, s].map(q).join(","));
  lines.push(["Arithmetic on typed numbers to ASCE 7-16 Ch. 26 and 30 Part 1; not engineering advice"].map(q).join(","));
  return lines.join("\n") + "\n";
}
