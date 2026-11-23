// Roof snow loads to ASCE/SEI 7-16 Chapter 7 (the edition IBC 2018 and IBC 2021
// adopt): flat roof load, sloped roof load, the minimum load, rain-on-snow,
// unbalanced gable/hip loads, drifts on a lower roof at a step (leeward and
// windward), drifts at a parapet or rooftop unit, sliding snow onto the lower
// roof, and the ice-dam load on eave overhangs.
//
// Every equation cites its section. Pure functions on typed numbers: no I/O,
// no clock, no randomness. The ground snow load pg is the user's (ASCE 7-16
// Figure 7.2-1, the ASCE Hazard Tool, or the building department's table);
// nothing here looks one up.

/** Table 7.3-1, exposure factor Ce by terrain category and roof exposure. */
export const CE = {
  B: { fully: 0.9, partially: 1.0, sheltered: 1.2 },
  C: { fully: 0.9, partially: 1.0, sheltered: 1.1 },
  D: { fully: 0.8, partially: 0.9, sheltered: 1.0 },
  treeline: { fully: 0.7, partially: 0.8, sheltered: null },
  alaska: { fully: 0.7, partially: 0.8, sheltered: null },
};

export const TERRAINS = {
  B: "B: urban, suburban or wooded",
  C: "C: open terrain, scattered obstructions",
  D: "D: flat unobstructed, shorelines",
  treeline: "Above the tree line, windswept mountains",
  alaska: "Alaska, no trees within 2 miles",
};

export const EXPOSURES = {
  fully: "Fully exposed",
  partially: "Partially exposed",
  sheltered: "Sheltered",
};

/** Table 7.3-2 (ASCE 7-16), thermal factor Ct. */
export const THERMAL = {
  heated: { ct: 1.0, label: "Heated building (all structures not listed below)" },
  cold: { ct: 1.1, label: "Kept just above freezing, or cold ventilated roof with R > 25 between the vented space and the heated space" },
  unheated: { ct: 1.2, label: "Unheated or open-air structure" },
  freezer: { ct: 1.3, label: "Freezer building" },
  greenhouse: { ct: 0.85, label: "Continuously heated greenhouse, roof R < 2.0" },
};

/** Table 1.5-2, snow importance factor Is by risk category. */
export const IMPORTANCE = { I: 0.8, II: 1.0, III: 1.1, IV: 1.2 };

export const ROOF_TYPES = {
  gable: "Gable or hip",
  mono: "Monoslope (shed)",
  flat: "Flat or low slope",
};

const DEG = Math.PI / 180;

/** Figure 7.6-1: drift height (ft) from upwind fetch lu (ft) and pg (psf). lu below 20 ft is taken as 20 ft. */
export function driftHeight(lu, pg) {
  const L = Math.max(20, lu);
  return Math.max(0, 0.43 * Math.cbrt(L) * Math.pow(pg + 10, 0.25) - 1.5);
}

/** Equation 7.7-1: snow density (pcf), capped at 30. */
export function snowDensity(pg) {
  return Math.min(0.13 * pg + 14, 30);
}

/**
 * Figure 7.4-1: roof slope factor Cs. Warm roofs (Ct <= 1.0) on panel (a), Ct = 1.1 on (b),
 * Ct >= 1.2 on (c). `slippery` means an unobstructed slippery surface that lets snow slide off
 * the eaves; for a warm roof it also needs the insulation of Section 7.4.1 (passed by the caller).
 */
export function slopeFactor(deg, ct, slippery) {
  const [flatTo] = ct <= 1.0 ? (slippery ? [5] : [30]) : ct < 1.2 ? (slippery ? [10] : [37.5]) : slippery ? [15] : [45];
  if (deg <= flatTo) return 1;
  if (deg >= 70) return 0;
  return 1 - (deg - flatTo) / (70 - flatTo);
}

/**
 * A drift against a taller face (Sections 7.7.1 and 7.8): drift height hd (already scaled),
 * clear height hc above the balanced snow, density gamma, and the length of roof it lands on.
 * Returns the triangle, cut by hc (w = 4 hd^2 / hc, at most 8 hc) and truncated at the far edge.
 */
export function driftShape(hdRaw, hc, gamma, roofLength) {
  let hd = hdRaw;
  let w;
  let capped = false;
  if (hd <= hc) w = 4 * hd;
  else {
    w = Math.min((4 * hd * hd) / hc, 8 * hc);
    hd = hc;
    capped = true;
  }
  const pd = hd * gamma;
  const truncated = roofLength > 0 && w > roofLength;
  const edge = truncated ? pd * (1 - roofLength / w) : 0;
  return { hd, w, pd, capped, truncated, edge };
}

const num = (v) => {
  if (v === undefined || v === null || String(v).trim() === "") return NaN;
  return Number(String(v).replace(/,/g, ""));
};

export const DEFAULTS = {
  pg: "40",
  risk: "II",
  terrain: "C",
  exposure: "partially",
  thermal: "heated",
  insulated: "yes",
  roofType: "gable",
  pitch: "6",
  surface: "other",
  W: "14",
  prismatic: "yes",
  overhang: "yes",
  stepHeight: "9",
  upperLength: "28",
  lowerLength: "22",
  slidesOnto: "no",
  parapetHeight: "",
  parapetFetch: "",
  parapetSide: "",
};

/** The page's example: a two-storey gable house stepping down 9 ft to an attached one-storey wing. */
export function sampleInput() {
  return { ...DEFAULTS };
}

/**
 * Everything on one roof (the upper roof, if there is a step) and, optionally, the lower roof
 * beside it and a parapet or rooftop unit on it. Inputs are strings, as the form gives them.
 */
export function analyze(input = {}) {
  const x = { ...DEFAULTS, ...input };
  const pg = num(x.pg);
  if (!Number.isFinite(pg) || pg < 0) return { error: "Enter the ground snow load pg in psf (0 or more), from ASCE 7-16 Figure 7.2-1 or your building department." };
  if (pg > 300) return { error: "A ground snow load over 300 psf is outside what this tool handles; mapped case-study areas need a site-specific study." };
  const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);
  const Is = own(IMPORTANCE, x.risk);
  if (!Is) return { error: "Choose a risk category, I to IV." };
  const ceRow = own(CE, x.terrain);
  if (!ceRow) return { error: "Choose a terrain category." };
  const Ce = own(ceRow, x.exposure);
  if (Ce === undefined) return { error: "Choose the roof exposure." };
  if (Ce === null) return { error: "Table 7.3-1 gives no sheltered value above the tree line or in treeless Alaska; choose fully or partially exposed." };
  const th = own(THERMAL, x.thermal);
  if (!th) return { error: "Choose the thermal condition." };
  const Ct = th.ct;
  const roofType = own(ROOF_TYPES, x.roofType) ? x.roofType : "gable";
  const pitch = roofType === "flat" ? Math.max(0, num(x.pitch) || 0) : num(x.pitch);
  if (!Number.isFinite(pitch) || pitch < 0 || pitch > 48) return { error: "Enter the roof pitch as inches of rise per 12 in of run (0 to 48)." };
  const deg = Math.atan(pitch / 12) / DEG;
  const W = num(x.W);
  const hasW = Number.isFinite(W) && W > 0;
  if (roofType !== "flat" && !hasW) return { error: "Enter W, the horizontal distance from eave to ridge in feet (for a monoslope, the full width)." };
  const insulated = x.insulated !== "no";
  const warm = Ct <= 1.0;
  const findings = [];

  // 7.3: flat roof snow load
  const pf = 0.7 * Ce * Ct * Is * pg;

  // 7.4: sloped roof
  const wantSlippery = x.surface === "slippery";
  const slippery = wantSlippery && (!warm || insulated);
  if (wantSlippery && !slippery) findings.push({ severity: "medium", title: "Slippery curve not used", detail: "Section 7.4.1 allows the slippery-surface curve on a warm roof only when it is unventilated with R of at least 30 or ventilated with R of at least 20. You said the roof is not that well insulated, so the non-slippery curve is used." });
  const Cs = slopeFactor(deg, Ct, slippery);
  const ps = Cs * pf;

  // 7.3.4: minimum roof snow load, low-slope monoslope, hip and gable roofs (< 15 degrees)
  const pmApplies = deg < 15;
  const pm = pmApplies ? (pg <= 20 ? Is * pg : 20 * Is) : 0;

  // 7.10: rain-on-snow surcharge
  const rosApplies = pg > 0 && pg <= 20 && hasW && deg < W / 50;
  const rosNoW = pg > 0 && pg <= 20 && !hasW;
  const ros = rosApplies ? 5 : 0;
  if (rosNoW) findings.push({ severity: "medium", title: "Rain-on-snow not checked", detail: "With pg of 20 psf or less, Section 7.10 adds 5 psf to the balanced load on roofs flatter than W/50 degrees. Enter W (eave to ridge, ft) to check it." });

  const balanced = ps + ros;
  const uniform = Math.max(balanced, pm);
  const governs = pm > balanced ? "minimum" : ros ? "balanced + rain-on-snow" : "balanced";

  // 7.6.1: unbalanced loads on hip and gable roofs
  let unbalanced = null;
  if (roofType === "gable") {
    if (pitch < 0.5 - 1e-9 || pitch > 7 + 1e-9) {
      unbalanced = { required: false, reason: pitch < 0.5 ? "slope under 1/2 on 12" : "slope over 7 on 12" };
    } else if (W <= 20 && x.prismatic !== "no") {
      unbalanced = { required: true, simple: true, windward: 0, leeward: Is * pg };
    } else {
      const hd = driftHeight(W, pg);
      const g = snowDensity(pg);
      const S = 12 / pitch;
      unbalanced = {
        required: true,
        simple: false,
        windward: 0.3 * ps,
        leeward: ps,
        hd,
        gamma: g,
        S,
        surcharge: (hd * g) / Math.sqrt(S),
        extent: (8 * Math.sqrt(S) * hd) / 3,
      };
      if (unbalanced.extent > W) findings.push({ severity: "info", title: "Unbalanced surcharge runs past the eave", detail: `The rectangular surcharge would extend ${unbalanced.extent.toFixed(1)} ft from the ridge, more than W = ${W} ft; it stops at the eave.` });
    }
  }

  // 7.4.5: ice dams on overhangs of warm roofs that are not well insulated
  const iceDam = warm && !insulated && x.overhang !== "no" ? 2 * pf : 0;

  const gamma = snowDensity(pg);

  // 7.7.1: drift on a lower roof at a step. The lower roof is taken as low slope with the same
  // Ce, Ct and Is, so its balanced load is pf and hb = pf / gamma.
  let step = null;
  const hStep = num(x.stepHeight);
  if (Number.isFinite(hStep) && hStep > 0) {
    const lu = num(x.upperLength);
    const ll = num(x.lowerLength);
    if (!(lu > 0) || !(ll > 0)) return { error: "For a step, enter the upper roof length and the lower roof length (ft), both measured perpendicular to the step." };
    const psLow = pf;
    const hb = psLow / gamma;
    const hc = hStep - hb;
    step = { h: hStep, lu, ll, psLow, hb, hc, gamma };
    if (hc <= 0 || hc / hb < 0.2) {
      step.required = false;
      step.reason = hc <= 0 ? "the balanced snow on the lower roof already reaches the upper roof" : `hc/hb = ${(hc / hb).toFixed(2)} is under 0.2`;
    } else {
      step.required = true;
      const leeHd = driftHeight(lu, pg);
      const windHd = 0.75 * driftHeight(ll, pg);
      step.leeward = { lu, hdRaw: leeHd, ...driftShape(leeHd, hc, gamma, ll) };
      step.windward = { lu: ll, hdRaw: windHd, ...driftShape(windHd, hc, gamma, ll) };
      step.governing = step.leeward.hd >= step.windward.hd ? "leeward" : "windward";
      const g = step[step.governing];
      step.drift = g;
      step.maxLoad = psLow + g.pd;
      if (g.truncated) findings.push({ severity: "info", title: "Drift truncated at the far edge", detail: `The drift would be ${g.w.toFixed(1)} ft wide, wider than the ${ll} ft lower roof. Section 7.7.1 truncates it at the far edge rather than tapering it to zero there, so the edge still carries ${g.edge.toFixed(1)} psf of surcharge.` });
    }
    // 7.9: sliding snow from a sloped upper roof onto the lower roof
    if (x.slidesOnto === "yes" && roofType !== "flat") {
      const threshold = slippery ? 1.19 : 9.46;
      if (deg > threshold) {
        const perFt = 0.4 * pf * W;
        const spread = Math.min(15, ll);
        const total = perFt * (spread / 15);
        step.sliding = { perFt, spread, total, psf: total / spread, onTop: psLow + total / spread };
        const depth = (psLow + total / spread) / gamma;
        if (depth > hStep) findings.push({ severity: "info", title: "Sliding snow would bury the step", detail: `Balanced plus sliding snow is ${depth.toFixed(1)} ft deep on the lower roof, more than the ${hStep} ft step. Some designers cap it at the step height; ASCE 7-16 Section 7.9 as written does not.` });
      } else {
        step.sliding = { required: false, reason: slippery ? "upper roof flatter than 1/4 on 12" : "upper roof flatter than 2 on 12" };
      }
    }
  }

  // 7.8: parapet walls and rooftop structures
  let parapet = null;
  const hp = num(x.parapetHeight);
  if (Number.isFinite(hp) && hp > 0) {
    const fetch = num(x.parapetFetch);
    if (!(fetch > 0)) return { error: "For a parapet or rooftop unit, enter the length of roof upwind of it (ft)." };
    const side = num(x.parapetSide);
    const hb = ps / gamma;
    const hc = hp - hb;
    parapet = { h: hp, fetch, side: Number.isFinite(side) ? side : null, hb, hc };
    if (Number.isFinite(side) && side > 0 && side < 15) {
      parapet.required = false;
      parapet.reason = "the side of the projection is under 15 ft";
    } else if (hc <= 0 || hc / hb < 0.2) {
      parapet.required = false;
      parapet.reason = hc <= 0 ? "the balanced snow already reaches its top" : `hc/hb = ${(hc / hb).toFixed(2)} is under 0.2`;
    } else {
      parapet.required = true;
      const hdRaw = 0.75 * driftHeight(fetch, pg);
      parapet.drift = { hdRaw, ...driftShape(hdRaw, hc, gamma, 0) };
      parapet.maxLoad = ps + parapet.drift.pd;
    }
  }

  if (pg === 0) findings.push({ severity: "info", title: "No ground snow", detail: "With pg = 0 every snow load is zero. Check the map: much of the mountain West is a case-study area with no mapped value." });
  if (pmApplies && pm > balanced) findings.push({ severity: "info", title: "The minimum load governs the uniform case", detail: `pm = ${pm.toFixed(1)} psf exceeds the balanced load of ${balanced.toFixed(1)} psf. Section 7.3.4 makes pm a separate uniform case; it is not combined with drift, sliding, unbalanced or partial loads.` });
  if (step && step.required) findings.push({ severity: "high", title: `Step drift: ${step.maxLoad.toFixed(0)} psf at the wall`, detail: `The ${step.governing} drift is ${step.drift.hd.toFixed(2)} ft high and ${Math.min(step.drift.w, step.ll).toFixed(1)} ft wide on the lower roof, adding ${step.drift.pd.toFixed(1)} psf at the step to the ${step.psLow.toFixed(1)} psf balanced load. That is ${(step.maxLoad / step.psLow).toFixed(1)} times the balanced load on the framing nearest the wall.` });
  if (parapet && parapet.required) findings.push({ severity: "high", title: `Parapet drift: ${parapet.maxLoad.toFixed(0)} psf at the face`, detail: `A ${parapet.drift.hd.toFixed(2)} ft drift ${parapet.drift.w.toFixed(1)} ft wide against the ${hp} ft face, from ${fetch} ft of roof upwind.` });
  if (iceDam) findings.push({ severity: "medium", title: "Eave overhang ice-dam load", detail: `A warm roof that is not well insulated drains meltwater onto a cold overhang. Section 7.4.5 asks overhangs to carry 2pf = ${iceDam.toFixed(1)} psf, with only dead load acting at the same time.` });

  return {
    pg, Is, Ce, Ct, roofType, pitch, deg, W: hasW ? W : null, warm, slippery,
    pf, Cs, ps, pm, pmApplies, ros, rosApplies, balanced, uniform, governs,
    unbalanced, iceDam, gamma, step, parapet, findings,
  };
}

/** Load profile on the lower roof (psf against distance from the step), for the diagram and CSV. */
export function stepProfile(r) {
  if (!r.step || !r.step.required) return [];
  const { psLow, ll, drift } = r.step;
  const pts = [[0, psLow + drift.pd]];
  if (drift.w < ll) pts.push([drift.w, psLow], [ll, psLow]);
  else pts.push([ll, psLow + drift.edge]);
  return pts;
}

const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);

/** Rows for the results table: [name, value, unit, source]. */
export function resultRows(r) {
  const rows = [
    ["Ground snow load pg", f1(r.pg), "psf", "your input (Fig. 7.2-1)"],
    ["Exposure factor Ce", r.Ce.toFixed(1), "", "Table 7.3-1"],
    ["Thermal factor Ct", r.Ct.toFixed(2), "", "Table 7.3-2"],
    ["Importance factor Is", r.Is.toFixed(1), "", "Table 1.5-2"],
    ["Flat roof snow load pf = 0.7 Ce Ct Is pg", f1(r.pf), "psf", "Eq. 7.3-1"],
    ["Roof slope", r.deg.toFixed(1), "degrees", ""],
    ["Slope factor Cs", r.Cs.toFixed(3), "", "Fig. 7.4-1"],
    ["Sloped roof snow load ps = Cs pf", f1(r.ps), "psf", "Eq. 7.4-1"],
    ["Rain-on-snow surcharge", f1(r.ros), "psf", "Sec. 7.10"],
    ["Minimum roof snow load pm", r.pmApplies ? f1(r.pm) : "n/a (15 degrees or steeper)", r.pmApplies ? "psf" : "", "Sec. 7.3.4"],
    [`Uniform design load (${r.governs})`, f1(r.uniform), "psf", ""],
    ["Snow density gamma", f1(r.gamma), "pcf", "Eq. 7.7-1"],
  ];
  const u = r.unbalanced;
  if (u && u.required && u.simple) rows.push(["Unbalanced: windward / leeward", `0 / ${f1(u.leeward)}`, "psf", "Sec. 7.6.1 (W <= 20 ft)"]);
  if (u && u.required && !u.simple) {
    rows.push(["Unbalanced: windward 0.3 ps / leeward ps", `${f1(u.windward)} / ${f1(u.leeward)}`, "psf", "Fig. 7.6-2"]);
    rows.push(["Unbalanced: leeward surcharge hd gamma / sqrt(S)", `${f1(u.surcharge)} over ${f1(u.extent)} ft from ridge`, "psf", "Fig. 7.6-2"]);
  }
  if (u && !u.required) rows.push(["Unbalanced load", `not required (${u.reason})`, "", "Sec. 7.6.1"]);
  if (r.iceDam) rows.push(["Eave overhang load 2pf", f1(r.iceDam), "psf", "Sec. 7.4.5"]);
  const s = r.step;
  if (s) {
    rows.push(["Lower roof: balanced snow depth hb", s.hb.toFixed(2), "ft", "Sec. 7.7"]);
    rows.push(["Lower roof: clear height hc", s.hc.toFixed(2), "ft", "Sec. 7.7"]);
    if (!s.required) rows.push(["Step drift", `not required (${s.reason})`, "", "Sec. 7.7"]);
    else {
      rows.push(["Leeward drift height (lu = upper roof)", `${s.leeward.hdRaw.toFixed(2)} -> ${s.leeward.hd.toFixed(2)}`, "ft", "Fig. 7.6-1"]);
      rows.push(["Windward drift height 0.75 hd (lu = lower roof)", `${s.windward.hdRaw.toFixed(2)} -> ${s.windward.hd.toFixed(2)}`, "ft", "Sec. 7.7.1"]);
      rows.push([`Drift width w (${s.governing})`, f1(s.drift.w), "ft", "Sec. 7.7.1"]);
      rows.push(["Drift surcharge at step pd = hd gamma", f1(s.drift.pd), "psf", "Sec. 7.7.1"]);
      rows.push(["Total at step, pf + pd", f1(s.maxLoad), "psf", ""]);
    }
    if (s.sliding && s.sliding.required !== false) rows.push(["Sliding snow 0.4 pf W over " + f1(s.sliding.spread) + " ft", `${f1(s.sliding.perFt)} lb/ft -> +${f1(s.sliding.psf)}`, "psf", "Sec. 7.9"]);
    if (s.sliding && s.sliding.required === false) rows.push(["Sliding snow", `not required (${s.sliding.reason})`, "", "Sec. 7.9"]);
  }
  const p = r.parapet;
  if (p) {
    if (!p.required) rows.push(["Parapet / rooftop unit drift", `not required (${p.reason})`, "", "Sec. 7.8"]);
    else {
      rows.push(["Parapet drift height 0.75 hd", `${p.drift.hdRaw.toFixed(2)} -> ${p.drift.hd.toFixed(2)}`, "ft", "Sec. 7.8"]);
      rows.push(["Parapet drift width / surcharge", `${f1(p.drift.w)} ft / ${f1(p.drift.pd)}`, "psf", "Sec. 7.8"]);
      rows.push(["Total at parapet face, ps + pd", f1(p.maxLoad), "psf", ""]);
    }
  }
  return rows;
}

const csvCell = (v) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function reportCsv(r) {
  const lines = [["Quantity", "Value", "Unit", "ASCE 7-16"], ...resultRows(r)];
  const prof = stepProfile(r);
  if (prof.length) {
    lines.push([], ["Lower roof profile: ft from step", "psf"]);
    for (const [d, q] of prof) lines.push([f1(d), f1(q)]);
  }
  return lines.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** A section through the step: upper roof, wall, lower roof, balanced snow and the drift, to scale. */
export function stepSvg(r) {
  const s = r.step;
  if (!s) return "";
  const Wd = 640, Hd = 260, pad = 30;
  const span = s.ll + Math.min(s.lu, s.ll) * 0.5;
  const hMax = Math.max(s.h + 1, (s.required ? s.hb + s.drift.hd : s.hb) + 1);
  const k = Math.min((Wd - 2 * pad) / span, (Hd - 2 * pad - 20) / hMax);
  const x0 = pad + Math.min(s.lu, s.ll) * 0.5 * k; // the wall
  const yB = Hd - pad; // lower roof surface
  const X = (ft) => x0 + ft * k;
  const Y = (ft) => yB - ft * k;
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wd} ${Hd}" width="100%" role="img" aria-label="Section through the roof step showing balanced snow and the drift on the lower roof">`);
  parts.push(`<rect x="${pad}" y="${Y(s.h)}" width="${x0 - pad}" height="${s.h * k}" fill="#d6e0e4"/>`);
  parts.push(`<line x1="${pad}" y1="${Y(s.h)}" x2="${x0}" y2="${Y(s.h)}" stroke="#163c4e" stroke-width="3"/>`);
  parts.push(`<line x1="${x0}" y1="${Y(s.h)}" x2="${x0}" y2="${yB}" stroke="#163c4e" stroke-width="3"/>`);
  parts.push(`<line x1="${x0}" y1="${yB}" x2="${X(s.ll)}" y2="${yB}" stroke="#163c4e" stroke-width="3"/>`);
  const poly = [[0, 0], [0, s.hb]];
  if (s.required) {
    const d = s.drift;
    poly.push([0, s.hb + d.hd]);
    if (d.w < s.ll) poly.push([d.w, s.hb], [s.ll, s.hb]);
    else poly.push([s.ll, s.hb + d.hd * (1 - s.ll / d.w)]);
  } else poly.push([s.ll, s.hb]);
  poly.push([s.ll, 0]);
  parts.push(`<polygon points="${poly.map(([a, b]) => `${X(a).toFixed(1)},${Y(b).toFixed(1)}`).join(" ")}" fill="#9cc3d5" fill-opacity=".75" stroke="#1d4f66"/>`);
  parts.push(`<line x1="${x0}" y1="${Y(s.hb)}" x2="${X(s.ll)}" y2="${Y(s.hb)}" stroke="#1d4f66" stroke-dasharray="4 3"/>`);
  parts.push(`<text x="${X(s.ll) - 4}" y="${Y(s.hb) - 4}" text-anchor="end">hb ${s.hb.toFixed(2)} ft</text>`);
  parts.push(`<text x="${pad + 4}" y="${Y(s.h) - 6}">upper roof, step ${esc(s.h)} ft</text>`);
  if (s.required) {
    const d = s.drift;
    parts.push(`<text class="pt" x="${x0 + 6}" y="${Y(s.hb + d.hd) - 6}">${esc(f1(s.maxLoad))} psf</text>`);
    parts.push(`<text x="${X(Math.min(d.w, s.ll)) }" y="${yB + 16}" text-anchor="middle">w ${esc(f1(Math.min(d.w, s.ll)))} ft</text>`);
  }
  parts.push(`<text x="${X(s.ll)}" y="${yB + 16}" text-anchor="end">${esc(s.ll)} ft</text>`);
  parts.push("</svg>");
  return parts.join("");
}
