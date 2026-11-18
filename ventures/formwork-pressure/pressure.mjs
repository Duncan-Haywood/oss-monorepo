// Lateral pressure of fresh concrete on vertical formwork, by the design
// equations of ACI 347R ("Guide to Formwork for Concrete", section 4.2).
// Pure functions, no dependencies. Everything is computed in US customary
// units (ft, ft/h, °F, lb/ft³, lb/ft²); SI inputs are converted in and the
// results converted back out.
//
// The equations (US units, p in lb/ft², R in ft/h, T in °F):
//   columns, and walls with R < 7 ft/h and placement height <= 14 ft:
//       p = Cw·Cc·(150 + 9000·R/T)
//   walls with R < 7 ft/h and placement height > 14 ft, and walls with
//   7 <= R <= 15 ft/h:
//       p = Cw·Cc·(150 + 43 400/T + 2800·R/T)
//   in every case at least 600·Cw lb/ft² and never more than w·h;
//   walls placed faster than 15 ft/h, and any concrete outside the
//   equations' conditions (slump over 7 in, self-consolidating, pumped from
//   the base, external form vibration, internal vibration deeper than 4 ft):
//       p = w·h (full liquid head).
// A column, for these equations, is an element with no plan dimension over
// 6.5 ft; anything with one plan dimension over 6.5 ft is a wall.

export const FT = 0.3048;            // m per ft
export const PSF_TO_KPA = 0.04788026; // kPa per lb/ft²
export const PCF_TO_KGM3 = 16.01846;  // kg/m³ per lb/ft³
export const LBF_TO_KN = 0.004448222; // kN per lbf

export const COLUMN_MAX_PLAN_FT = 6.5;
export const WALL_LOW_RATE_FT_H = 7;
export const WALL_MAX_RATE_FT_H = 15;
export const WALL_LOW_HEIGHT_FT = 14;

// Chemistry coefficient Cc, ACI 347R. "Retarder" means any admixture that
// delays setting: a retarder, a retarding water reducer, a retarding
// mid-range water reducer, or a high-range water reducer (superplasticizer)
// that delays set.
export const CHEMISTRY = {
  plain: { cc: 1.0, label: 'Type I, II or III cement, no retarder' },
  plainRetarded: { cc: 1.2, label: 'Type I, II or III cement, with a retarder' },
  blend: { cc: 1.2, label: 'Other types, or blends with under 70% slag and under 40% fly ash, no retarder' },
  blendRetarded: { cc: 1.4, label: 'Other types, or blends with under 70% slag and under 40% fly ash, with a retarder' },
  highScm: { cc: 1.4, label: 'Blends with 70% or more slag, or 40% or more fly ash' },
};

// Unit weight coefficient Cw, ACI 347R.
export function unitWeightCoefficient(w) {
  if (!(w > 0)) throw new RangeError('Unit weight must be a positive number');
  if (w < 140) return Math.max(0.8, 0.5 * (1 + w / 145));
  if (w <= 150) return 1;
  return w / 145;
}

function num(v, name, { min = -Infinity, positive = false } = {}) {
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new RangeError(`${name} must be a number`);
  if (positive && !(n > 0)) throw new RangeError(`${name} must be greater than zero`);
  if (n < min) throw new RangeError(`${name} must be at least ${min}`);
  return n;
}

/**
 * Design lateral pressure for one placement.
 * @param {object} input
 *   element: 'wall' | 'column' (or give planMin/planMax in ft and let it classify)
 *   height: placement height h, ft (top of placement to the point considered,
 *           usually the full lift)
 *   rate: rate of placement R, ft/h (vertical rise)
 *   temp: concrete temperature at placement T, °F
 *   unitWeight: w, lb/ft³ (default 150)
 *   chemistry: a CHEMISTRY key (default 'plain')
 *   conditionsMet: true when slump <= 7 in and normal internal vibration to
 *                  4 ft or less, not SCC, not pumped from the base, no
 *                  external vibration (default true)
 * @returns {object} result in US units
 */
export function designPressure(input) {
  const h = num(input.height, 'Placement height', { positive: true });
  const R = num(input.rate, 'Rate of placement', { positive: true });
  const T = num(input.temp, 'Concrete temperature', { positive: true });
  const w = num(input.unitWeight ?? 150, 'Unit weight', { positive: true });
  const chemistry = input.chemistry ?? 'plain';
  if (!CHEMISTRY[chemistry]) throw new RangeError(`Unknown cement chemistry: ${chemistry}`);
  const conditionsMet = input.conditionsMet !== false;
  const element = classify(input);

  const Cw = unitWeightCoefficient(w);
  const Cc = CHEMISTRY[chemistry].cc;
  const hydrostatic = w * h;
  const minimum = 600 * Cw;
  const warnings = [];

  let equation;
  let formula = null;
  let reason;
  if (!conditionsMet) {
    equation = 'hydrostatic';
    reason = 'The concrete is outside the conditions the ACI 347R equations assume (slump over 7 in (175 mm), self-consolidating, pumped from the base, external vibration or vibration deeper than 4 ft (1.2 m)), so the form is designed for the full liquid head w·h.';
  } else if (element === 'column') {
    equation = 'column';
    formula = Cw * Cc * (150 + 9000 * R / T);
    reason = 'Column (no plan dimension over 6.5 ft, 2 m): p = Cw·Cc·(150 + 9000·R/T).';
  } else if (R > WALL_MAX_RATE_FT_H) {
    equation = 'hydrostatic';
    reason = 'Wall placed faster than 15 ft/h (4.5 m/h): the equations do not apply and the form is designed for the full liquid head w·h.';
  } else if (R < WALL_LOW_RATE_FT_H && h <= WALL_LOW_HEIGHT_FT) {
    equation = 'wallLow';
    formula = Cw * Cc * (150 + 9000 * R / T);
    reason = 'Wall, rate under 7 ft/h (2.1 m/h) and placement height 14 ft (4.2 m) or less: p = Cw·Cc·(150 + 9000·R/T).';
  } else {
    equation = 'wallHigh';
    formula = Cw * Cc * (150 + 43400 / T + 2800 * R / T);
    reason = R < WALL_LOW_RATE_FT_H
      ? 'Wall, rate under 7 ft/h but placement height over 14 ft: p = Cw·Cc·(150 + 43 400/T + 2800·R/T).'
      : 'Wall, rate between 7 and 15 ft/h: p = Cw·Cc·(150 + 43 400/T + 2800·R/T).';
  }

  let pressure;
  let governs;
  if (formula === null) {
    pressure = hydrostatic;
    governs = 'hydrostatic';
  } else if (formula >= hydrostatic || minimum >= hydrostatic) {
    pressure = hydrostatic;
    governs = 'hydrostatic';
  } else if (formula < minimum) {
    pressure = minimum;
    governs = 'minimum';
  } else {
    pressure = formula;
    governs = 'formula';
  }

  if (T < 50) warnings.push('Concrete below 50 °F stays plastic longer, so the pressure is higher and keeps rising as the lift goes up. Cold-weather placement also brings protection requirements (ACI 306) this tool does not check.');
  if (T > 100) warnings.push('Concrete above 100 °F is outside usual placing limits; check the mix and placement plan with the supplier.');
  if (w > 165 || w < 90) warnings.push('Unit weight is outside normal-weight and common lightweight concrete; check the value.');
  if (conditionsMet && chemistry === 'plain' && T < 60 && equation !== 'hydrostatic') warnings.push('If the mix has any set-retarding admixture, choose a "with a retarder" chemistry: retarded concrete exerts more pressure.');

  return {
    element,
    equation,
    reason,
    governs,
    Cw,
    Cc,
    height: h,
    rate: R,
    temp: T,
    unitWeight: w,
    formula,
    minimum,
    hydrostatic,
    pressure,
    // Depth below the top of the placement at which the envelope reaches
    // its maximum; above it the pressure is the liquid head w·z.
    headDepth: Math.min(h, pressure / w),
    ...resultant(pressure, w, h),
    warnings,
  };
}

function classify(input) {
  if (input.element === 'wall' || input.element === 'column') return input.element;
  if (input.planMax !== undefined) {
    const a = num(input.planMax, 'Longest plan dimension', { positive: true });
    const b = num(input.planMin ?? input.planMax, 'Shortest plan dimension', { positive: true });
    return Math.max(a, b) > COLUMN_MAX_PLAN_FT ? 'wall' : 'column';
  }
  throw new RangeError('Say whether the element is a wall or a column');
}

// The pressure envelope: liquid head w·z down to the depth where it meets
// the design pressure, then constant to the bottom of the placement.
// Returns the force per foot of form width (lb/ft) and the height of its
// line of action above the bottom of the placement (ft).
export function resultant(pmax, w, h) {
  const hc = Math.min(h, pmax / w);
  const triangle = 0.5 * w * hc * hc; // centroid 2hc/3 below the top
  const rectangle = pmax * (h - hc);   // centroid mid-way down the lower part
  const force = triangle + rectangle;
  const fromTop = force === 0 ? 0 : (triangle * (2 * hc / 3) + rectangle * (hc + (h - hc) / 2)) / force;
  return { forcePerFoot: force, resultantAboveBase: h - fromTop };
}

// Pressure at depth z below the top of the placement.
export function pressureAt(z, pmax, w) {
  if (z <= 0) return 0;
  return Math.min(w * z, pmax);
}

export function envelope(result, steps = 20) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const z = (result.height * i) / steps;
    pts.push({ depth: z, pressure: pressureAt(z, result.pressure, result.unitWeight) });
  }
  return pts;
}

/**
 * Tie spacing: each tie carries the pressure on its tributary area, so the
 * area per tie is the tie's safe working load over the design pressure.
 * With a chosen horizontal spacing, the largest vertical spacing follows.
 */
export function tieLayout(pressure, safeWorkingLoad, horizontalSpacing) {
  const p = num(pressure, 'Design pressure', { positive: true });
  const swl = num(safeWorkingLoad, 'Tie safe working load', { positive: true });
  const area = swl / p;
  const out = { areaPerTie: area };
  if (horizontalSpacing !== undefined && horizontalSpacing !== null && horizontalSpacing !== '') {
    const sh = num(horizontalSpacing, 'Horizontal tie spacing', { positive: true });
    out.horizontalSpacing = sh;
    out.maxVerticalSpacing = area / sh;
  }
  return out;
}

/**
 * Rate of placement from the concrete delivery rate and the form's plan area.
 * @param {number} volumePerHour yd³/h
 * @param {number} planArea ft² (wall length × thickness, or column section)
 * @returns {number} ft/h
 */
export function rateFromDelivery(volumePerHour, planArea) {
  const q = num(volumePerHour, 'Delivery rate', { positive: true });
  const a = num(planArea, 'Plan area', { positive: true });
  return (q * 27) / a;
}

/**
 * The fastest rate of placement (ft/h) that keeps the design pressure at or
 * under a form's rated pressure, for the same element, height, temperature
 * and mix. Searches the governing equation piecewise, so the 7 ft/h and
 * 15 ft/h boundaries are honoured. Returns { rate, limitedBy }.
 */
export function maxRate(input, ratedPressure) {
  const pAllow = num(ratedPressure, 'Form rated pressure', { positive: true });
  const base = { ...input, rate: 1 };
  const probe = designPressure(base);
  const { Cw, Cc, temp: T, height: h } = probe;
  if (probe.hydrostatic <= pAllow) return { rate: Infinity, limitedBy: 'The form is rated for the full liquid head, so the rate of placement does not limit it.' };
  if (probe.equation === 'hydrostatic') return { rate: 0, limitedBy: 'These conditions call for the full liquid head, which is over the form rating at any rate. Lower the lift or use a stronger form.' };
  if (probe.minimum > pAllow) return { rate: 0, limitedBy: 'The form rating is under the 600·Cw lb/ft² minimum design pressure.' };
  const k = pAllow / (Cw * Cc);
  if (probe.element === 'column') {
    return { rate: Math.max(0, ((k - 150) * T) / 9000), limitedBy: 'Column equation.' };
  }
  // Walls: low-rate equation only while R < 7 and h <= 14.
  if (h <= WALL_LOW_HEIGHT_FT) {
    const rLow = ((k - 150) * T) / 9000;
    if (rLow < WALL_LOW_RATE_FT_H) return { rate: Math.max(0, rLow), limitedBy: 'Wall equation for rates under 7 ft/h (2.1 m/h).' };
  }
  // The two wall equations meet at 7 ft/h (9000·7 = 43 400 + 2800·7), so
  // past that point the faster-rate equation picks up without a jump.
  const rHigh = ((k - 150 - 43400 / T) * T) / 2800;
  if (rHigh <= 0) return { rate: 0, limitedBy: 'Even a very slow placement exceeds the form rating at this temperature and height.' };
  if (rHigh > WALL_MAX_RATE_FT_H) return { rate: WALL_MAX_RATE_FT_H, limitedBy: 'Above 15 ft/h (4.5 m/h) a wall must be designed for the full liquid head, which exceeds the form rating.' };
  return { rate: rHigh, limitedBy: 'Wall equation for rates of 7 to 15 ft/h (2.1 to 4.5 m/h), or for lifts over 14 ft (4.2 m).' };
}

// SI wrappers: m, m/h, °C, kg/m³ in; kPa, kN/m, m out.
export function fromSI(input) {
  const out = { ...input };
  if (input.height !== undefined) out.height = Number(input.height) / FT;
  if (input.rate !== undefined) out.rate = Number(input.rate) / FT;
  if (input.temp !== undefined) out.temp = Number(input.temp) * 1.8 + 32;
  if (input.unitWeight !== undefined) out.unitWeight = Number(input.unitWeight) / PCF_TO_KGM3;
  if (input.planMax !== undefined) out.planMax = Number(input.planMax) / FT;
  if (input.planMin !== undefined) out.planMin = Number(input.planMin) / FT;
  return out;
}

export function toSI(r) {
  return {
    ...r,
    height: r.height * FT,
    rate: r.rate * FT,
    temp: (r.temp - 32) / 1.8,
    unitWeight: r.unitWeight * PCF_TO_KGM3,
    formula: r.formula === null ? null : r.formula * PSF_TO_KPA,
    minimum: r.minimum * PSF_TO_KPA,
    hydrostatic: r.hydrostatic * PSF_TO_KPA,
    pressure: r.pressure * PSF_TO_KPA,
    headDepth: r.headDepth * FT,
    forcePerFoot: r.forcePerFoot * LBF_TO_KN / FT, // kN per m of form width
    resultantAboveBase: r.resultantAboveBase * FT,
  };
}

export const EXAMPLE = Object.freeze({ element: 'wall', height: 10, rate: 5, temp: 70, unitWeight: 150, chemistry: 'plain', conditionsMet: true });
