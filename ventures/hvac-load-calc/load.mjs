// Room-by-room residential heating and cooling load engine.
//
// Everything here is first-principles heat transfer and published physical
// constants, written out so a reader can check each step. This is NOT ACCA
// Manual J (whose tables are ACCA's), and its results are estimates.
//
// Heating: steady state at the heating design temperature, no solar or
// internal credit (the usual conservative convention).
// Cooling: a 24-hour design day. Outdoor temperature follows the ASHRAE
// daily-range profile; solar comes from sun geometry and the ASHRAE 1985
// clear-sky model for July; walls see sol-air temperature through a time lag
// and decrement; windows see beam, diffuse and ground-reflected sun through
// their SHGC; the ceiling sees an attic that warms with the sun on the roof.
// Rooms peak at different hours, so the house peak is the peak of the hourly
// sum, not the sum of room peaks; both are reported.
//
// Units: imperial (ft, °F, Btu/h), as US HVAC contractors work.

export const FACINGS = { S: 0, SW: 45, W: 90, NW: 135, N: 180, NE: -135, E: -90, SE: -45 };

// Fraction of the daily range subtracted from the design dry bulb at each
// solar hour 1..24 (ASHRAE Fundamentals' percentage-of-daily-range profile).
export const DAILY_RANGE_FRACTION = [0.88, 0.92, 0.95, 0.98, 1.0, 0.98, 0.91, 0.74, 0.55, 0.38, 0.23, 0.13, 0.05, 0.0, 0.0, 0.06, 0.14, 0.24, 0.39, 0.5, 0.59, 0.68, 0.75, 0.82];

// ASHRAE 1985 clear-sky constants for 21 July: A (W/m²), B, C.
const CLEAR_SKY_JULY = { A: 1085, B: 0.207, C: 0.136 };
const W_PER_M2_TO_BTUH_FT2 = 0.316998;
const DAY_OF_YEAR_JULY_21 = 202;

export const DEFAULTS = Object.freeze({
  site: { latitude: 35, elevationFt: 0, heatingOutdoorF: 20, coolingOutdoorF: 95, dailyRangeF: 20, coolingDewPointF: 70, indoorHeatF: 70, indoorCoolF: 75, indoorRH: 50 },
  envelope: {
    wallCavityR: 13, studDepthIn: 3.5, framingFraction: 0.25, wallContinuousR: 0, wallColor: 'medium', wallMass: 'frame',
    ceilingR: 38, roofColor: 'dark', atticRiseF: null,
    floorR: 19, slabF: 0.73,
    windowU: 0.32, windowSHGC: 0.3, interiorShade: 1.0,
    doorU: 0.4,
    ach50: 5, nFactor: 20, ventCFM: 0, ventSensibleRecovery: 0, ventLatentRecovery: 0,
    ductHeatPct: 0, ductCoolPct: 0, supplyDeltaT: 20,
    peopleSensible: 230, peopleLatent: 200,
  },
});

// Absorptance by exterior colour, for sol-air temperature.
const ABSORPTANCE = { light: 0.45, medium: 0.7, dark: 0.9 };
// Attic air temperature rise over outdoor at peak sun on the roof, °F. An
// assumption the user can override (envelope.atticRiseF); field-measured
// vented attics under dark shingles commonly run 30-40 °F above outdoor air.
const ATTIC_RISE = { light: 20, medium: 28, dark: 35 };
// Wall thermal response: hours of lag and the fraction of the sol-air swing
// that reaches the inside surface. Light frame walls respond in a couple of
// hours; masonry damps and delays the swing.
const WALL_RESPONSE = { frame: { lag: 2, decrement: 0.8 }, masonry: { lag: 6, decrement: 0.35 } };
const H_OUT = 3.0; // outside surface conductance, Btu/h·ft²·°F (about 17 W/m²K)

const R = { filmIn: 0.68, filmOut: 0.17, drywall: 0.45, sheathing: 0.62, siding: 0.62, woodPerIn: 1.25, filmCeiling: 0.61, filmFloor: 0.92, subfloor: 0.94 };

const deg = Math.PI / 180;
const own = (map, key) => (Object.hasOwn(map, key) ? map[key] : undefined);

export function wallU({ wallCavityR, studDepthIn, framingFraction, wallContinuousR }) {
  const skin = R.filmIn + R.drywall + R.sheathing + R.siding + R.filmOut + wallContinuousR;
  const cavity = skin + wallCavityR;
  const stud = skin + studDepthIn * R.woodPerIn;
  return (1 - framingFraction) / cavity + framingFraction / stud;
}
export const ceilingU = ({ ceilingR }) => 1 / (ceilingR + R.drywall + 2 * R.filmCeiling);
export const floorU = ({ floorR }) => 0.9 / (floorR + R.subfloor + 2 * R.filmFloor) + 0.1 / (9.25 * R.woodPerIn + R.subfloor + 2 * R.filmFloor);

// Air density ratio to sea level, from the standard atmosphere.
export function densityRatio(elevationFt) { return Math.pow(1 - 6.8754e-6 * elevationFt, 5.2559); }
export function pressureKPa(elevationFt) { return 101.325 * densityRatio(elevationFt); }

// Saturation vapour pressure over water (Magnus, Alduchov-Eskridge constants), kPa.
export function saturationKPa(tempF) { const c = (tempF - 32) / 1.8; return 0.61094 * Math.exp((17.625 * c) / (c + 243.04)); }
export function humidityRatio(vapourKPa, totalKPa) { return (0.621945 * vapourKPa) / (totalKPa - vapourKPa); }
export const grains = w => w * 7000;

export function sunPosition(latitude, solarHour, day = DAY_OF_YEAR_JULY_21) {
  const decl = 23.45 * Math.sin((360 / 365) * (284 + day) * deg);
  const H = 15 * (solarHour - 12);
  const L = latitude * deg, d = decl * deg, h = H * deg;
  const sinAlt = Math.cos(L) * Math.cos(d) * Math.cos(h) + Math.sin(L) * Math.sin(d);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAlt = Math.cos(alt);
  // Azimuth from south, positive toward west.
  const sinAz = (Math.cos(d) * Math.sin(h)) / cosAlt;
  const cosAz = (Math.sin(alt) * Math.sin(L) - Math.sin(d)) / (cosAlt * Math.cos(L));
  return { altitude: alt / deg, azimuth: Math.atan2(sinAz, cosAz) / deg, declination: decl };
}

// Irradiance on a surface, Btu/h·ft²: { beam, diffuse, reflected, cosIncidence }.
// tilt 90 = vertical wall, 0 = horizontal roof. surfaceAz from south, +west.
export function irradiance(sun, surfaceAz, tilt = 90, groundReflectance = 0.2) {
  if (sun.altitude <= 0) return { beam: 0, diffuse: 0, reflected: 0, cosIncidence: 0 };
  const { A, B, C } = CLEAR_SKY_JULY;
  const sinAlt = Math.sin(sun.altitude * deg);
  const direct = A * Math.exp(-B / sinAlt) * W_PER_M2_TO_BTUH_FT2;
  const t = tilt * deg;
  const cosInc = Math.cos(sun.altitude * deg) * Math.cos((sun.azimuth - surfaceAz) * deg) * Math.sin(t) + sinAlt * Math.cos(t);
  const beam = cosInc > 0 ? direct * cosInc : 0;
  const diffuse = C * direct * (1 + Math.cos(t)) / 2;
  const reflected = direct * (C + sinAlt) * groundReflectance * (1 - Math.cos(t)) / 2;
  return { beam, diffuse, reflected, cosIncidence: Math.max(0, cosInc) };
}

// Glazing incidence-angle modifier, one-parameter form K = 1 - b0 (1/cosθ - 1).
export function angleModifier(cosInc, b0 = 0.1) {
  if (cosInc <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - b0 * (1 / cosInc - 1)));
}
const DIFFUSE_MODIFIER = 0.9;

function merge(input) {
  const site = { ...DEFAULTS.site, ...(input.site || {}) };
  const envelope = { ...DEFAULTS.envelope, ...(input.envelope || {}) };
  return { site, envelope, rooms: input.rooms || [] };
}

const num = (v, name, errs, { min = -Infinity, max = Infinity } = {}) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) { errs.push(`${name} must be a number`); return; }
  if (v < min || v > max) errs.push(`${name} must be between ${min} and ${max}`);
};

export function validate(input) {
  const errs = [];
  const { site, envelope, rooms } = merge(input || {});
  num(site.latitude, 'Latitude', errs, { min: 0, max: 66 });
  num(site.elevationFt, 'Elevation', errs, { min: -300, max: 14000 });
  num(site.heatingOutdoorF, 'Heating design outdoor temperature', errs, { min: -60, max: 70 });
  num(site.coolingOutdoorF, 'Cooling design outdoor temperature', errs, { min: 60, max: 125 });
  num(site.dailyRangeF, 'Daily range', errs, { min: 0, max: 50 });
  num(site.coolingDewPointF, 'Cooling design dew point', errs, { min: -20, max: 90 });
  num(site.indoorHeatF, 'Indoor heating temperature', errs, { min: 50, max: 80 });
  num(site.indoorCoolF, 'Indoor cooling temperature', errs, { min: 65, max: 85 });
  num(site.indoorRH, 'Indoor relative humidity', errs, { min: 20, max: 70 });
  if (site.heatingOutdoorF >= site.indoorHeatF) errs.push('Heating design outdoor temperature must be below the indoor heating temperature');
  if (site.coolingDewPointF > site.coolingOutdoorF) errs.push('Cooling design dew point cannot exceed the cooling dry bulb');
  for (const k of ['wallCavityR', 'wallContinuousR', 'ceilingR', 'floorR']) num(envelope[k], k, errs, { min: 0, max: 100 });
  num(envelope.studDepthIn, 'Stud depth', errs, { min: 1.5, max: 12 });
  num(envelope.framingFraction, 'Framing fraction', errs, { min: 0, max: 0.6 });
  num(envelope.windowU, 'Window U-factor', errs, { min: 0.1, max: 1.3 });
  num(envelope.windowSHGC, 'Window SHGC', errs, { min: 0.05, max: 0.9 });
  num(envelope.interiorShade, 'Interior shade factor', errs, { min: 0.3, max: 1 });
  num(envelope.doorU, 'Door U-factor', errs, { min: 0.05, max: 1.5 });
  num(envelope.slabF, 'Slab F-factor', errs, { min: 0.05, max: 1.5 });
  num(envelope.ach50, 'ACH50', errs, { min: 0.3, max: 40 });
  num(envelope.nFactor, 'N factor', errs, { min: 5, max: 40 });
  num(envelope.ventCFM, 'Ventilation airflow', errs, { min: 0, max: 2000 });
  num(envelope.ventSensibleRecovery, 'Ventilation sensible recovery', errs, { min: 0, max: 0.95 });
  num(envelope.ventLatentRecovery, 'Ventilation latent recovery', errs, { min: 0, max: 0.95 });
  num(envelope.ductHeatPct, 'Duct heating loss %', errs, { min: 0, max: 60 });
  num(envelope.ductCoolPct, 'Duct cooling gain %', errs, { min: 0, max: 60 });
  num(envelope.supplyDeltaT, 'Supply air temperature difference', errs, { min: 10, max: 35 });
  if (envelope.atticRiseF != null) num(envelope.atticRiseF, 'Attic rise', errs, { min: 0, max: 80 });
  if (!own(ABSORPTANCE, envelope.wallColor)) errs.push('Wall colour must be light, medium or dark');
  if (!own(ABSORPTANCE, envelope.roofColor)) errs.push('Roof colour must be light, medium or dark');
  if (!own(WALL_RESPONSE, envelope.wallMass)) errs.push('Wall type must be frame or masonry');
  if (!Array.isArray(rooms) || rooms.length === 0) errs.push('Add at least one room');
  else rooms.forEach((r, i) => {
    const n = r.name ? `Room "${r.name}"` : `Room ${i + 1}`;
    num(r.areaFt2, `${n} floor area`, errs, { min: 1, max: 20000 });
    num(r.ceilingFt ?? 8, `${n} ceiling height`, errs, { min: 6, max: 40 });
    if (!['conditioned', 'slab', 'crawl'].includes(r.floor ?? 'conditioned')) errs.push(`${n} floor must be conditioned, slab or crawl`);
    if ((r.floor === 'slab')) num(r.slabPerimeterFt ?? 0, `${n} slab perimeter`, errs, { min: 0, max: 2000 });
    num(r.people ?? 0, `${n} people`, errs, { min: 0, max: 100 });
    num(r.applianceBtuh ?? 0, `${n} appliance gain`, errs, { min: 0, max: 50000 });
    (r.walls || []).forEach((w, j) => {
      const wn = `${n} wall ${j + 1}`;
      if (!Object.hasOwn(FACINGS, w.facing)) errs.push(`${wn} facing must be one of ${Object.keys(FACINGS).join(', ')}`);
      num(w.lengthFt, `${wn} length`, errs, { min: 0, max: 500 });
      num(w.windowFt2 ?? 0, `${wn} window area`, errs, { min: 0, max: 5000 });
      num(w.doorFt2 ?? 0, `${wn} door area`, errs, { min: 0, max: 500 });
      const gross = w.lengthFt * (w.heightFt ?? r.ceilingFt ?? 8);
      if ((w.windowFt2 ?? 0) + (w.doorFt2 ?? 0) > gross + 1e-9) errs.push(`${wn}: windows and doors (${(w.windowFt2 ?? 0) + (w.doorFt2 ?? 0)} ft²) exceed the wall's ${round(gross)} ft²`);
    });
  });
  return errs;
}

const round = (x, p = 0) => { const f = 10 ** p; return Math.round(x * f) / f; };

export function calculate(input) {
  const errors = validate(input);
  if (errors.length) return { errors };
  const { site, envelope: env, rooms } = merge(input);
  const rho = densityRatio(site.elevationFt);
  const sensibleAir = 1.08 * rho; // Btu/h per cfm·°F
  const latentAir = 0.68 * rho;   // Btu/h per cfm·grain/lb
  const Uwall = wallU(env), Uceil = ceilingU(env), Ufloor = floorU(env);
  const alphaWall = own(ABSORPTANCE, env.wallColor);
  const atticRise = env.atticRiseF ?? own(ATTIC_RISE, env.roofColor);
  const response = own(WALL_RESPONSE, env.wallMass);
  const dTheat = site.indoorHeatF - site.heatingOutdoorF;

  // Design day, hours 1..24 (solar time; the sun is at its highest at 12).
  const hours = Array.from({ length: 24 }, (_, i) => i + 1);
  const outdoor = hours.map(h => site.coolingOutdoorF - site.dailyRangeF * DAILY_RANGE_FRACTION[h - 1]);
  const suns = hours.map(h => sunPosition(site.latitude, h));
  const horizontal = suns.map(s => { const i = irradiance(s, 0, 0); return i.beam + i.diffuse; });
  const horizMax = Math.max(...horizontal) || 1;
  const attic = outdoor.map((t, k) => t + atticRise * horizontal[k] / horizMax);

  const facingSolar = {};
  for (const [f, az] of Object.entries(FACINGS)) {
    const irr = suns.map(s => irradiance(s, az, 90));
    const window = irr.map(i => i.beam * angleModifier(i.cosIncidence) + (i.diffuse + i.reflected) * DIFFUSE_MODIFIER);
    const solAir = irr.map((i, k) => outdoor[k] + alphaWall * (i.beam + i.diffuse + i.reflected) / H_OUT);
    const mean = solAir.reduce((a, b) => a + b, 0) / 24;
    // Inside-surface driving temperature: the mean plus a lagged, damped swing.
    const driving = hours.map((_, k) => mean + response.decrement * (solAir[(k - response.lag + 24) % 24] - mean));
    facingSolar[f] = { window, driving, peakWindow: Math.max(...window) };
  }

  // Indoor humidity at the cooling set point, outdoor at the design dew point.
  const p = pressureKPa(site.elevationFt);
  const wIn = humidityRatio(saturationKPa(site.indoorCoolF) * site.indoorRH / 100, p);
  const wOut = humidityRatio(saturationKPa(site.coolingDewPointF), p);
  const dGrains = Math.max(0, grains(wOut - wIn));

  const volume = rooms.reduce((a, r) => a + r.areaFt2 * (r.ceilingFt ?? 8), 0);
  const infilCFM = env.ach50 / env.nFactor * volume / 60;
  // Infiltration is shared out by each room's exterior wall area.
  const exposure = rooms.map(r => (r.walls || []).reduce((a, w) => a + w.lengthFt * (w.heightFt ?? r.ceilingFt ?? 8), 0));
  const totalExposure = exposure.reduce((a, b) => a + b, 0);

  const roomResults = rooms.map((r, idx) => {
    const ceilingH = r.ceilingFt ?? 8;
    const heat = { walls: 0, windows: 0, doors: 0, ceiling: 0, floor: 0, infiltration: 0 };
    const cool = hours.map(() => ({ walls: 0, windows: 0, windowSolar: 0, doors: 0, ceiling: 0, infiltration: 0, internal: 0 }));
    let windowArea = 0, netWall = 0;
    for (const w of r.walls || []) {
      const gross = w.lengthFt * (w.heightFt ?? ceilingH);
      const win = w.windowFt2 ?? 0, door = w.doorFt2 ?? 0, net = gross - win - door;
      windowArea += win; netWall += net;
      heat.walls += Uwall * net * dTheat;
      heat.windows += env.windowU * win * dTheat;
      heat.doors += env.doorU * door * dTheat;
      const fs = own(facingSolar, w.facing);
      hours.forEach((_, k) => {
        cool[k].walls += Uwall * net * (fs.driving[k] - site.indoorCoolF);
        cool[k].windows += env.windowU * win * (outdoor[k] - site.indoorCoolF);
        cool[k].windowSolar += win * env.windowSHGC * env.interiorShade * fs.window[k];
        cool[k].doors += env.doorU * door * (outdoor[k] - site.indoorCoolF);
      });
    }
    if (r.ceilingToAttic) {
      heat.ceiling = Uceil * r.areaFt2 * dTheat;
      hours.forEach((_, k) => { cool[k].ceiling = Uceil * r.areaFt2 * (attic[(k - 1 + 24) % 24] - site.indoorCoolF); });
    }
    if (r.floor === 'slab') heat.floor = env.slabF * (r.slabPerimeterFt ?? 0) * dTheat;
    else if (r.floor === 'crawl') heat.floor = Ufloor * r.areaFt2 * dTheat;
    const share = totalExposure > 0 ? exposure[idx] / totalExposure : 0;
    const cfm = infilCFM * share;
    heat.infiltration = sensibleAir * cfm * dTheat;
    const internalSensible = (r.people ?? 0) * env.peopleSensible + (r.applianceBtuh ?? 0);
    hours.forEach((_, k) => {
      cool[k].infiltration = sensibleAir * cfm * (outdoor[k] - site.indoorCoolF);
      cool[k].internal = internalSensible;
    });
    const heatTotal = Object.values(heat).reduce((a, b) => a + b, 0);
    const hourlySensible = cool.map(c => Math.max(0, Object.values(c).reduce((a, b) => a + b, 0)));
    let peakK = 0; hourlySensible.forEach((v, k) => { if (v > hourlySensible[peakK]) peakK = k; });
    const latent = latentAir * cfm * dGrains + (r.people ?? 0) * env.peopleLatent;
    return {
      name: r.name || `Room ${idx + 1}`, areaFt2: r.areaFt2, windowArea, netWall, infiltrationCFM: cfm,
      heating: { ...heat, total: heatTotal },
      cooling: { peakHour: peakK + 1, sensible: hourlySensible[peakK], latent, breakdown: cool[peakK], hourly: hourlySensible, byHour: cool },
    };
  });

  // Whole house: hourly sum of rooms, then ventilation and ducts.
  const ventCFM = env.ventCFM;
  const ventHeat = sensibleAir * ventCFM * (1 - env.ventSensibleRecovery) * dTheat;
  const ventLatent = latentAir * ventCFM * (1 - env.ventLatentRecovery) * dGrains;
  const roomsHourly = hours.map((_, k) => roomResults.reduce((a, r) => a + r.cooling.hourly[k], 0));
  const ventHourly = outdoor.map(t => sensibleAir * ventCFM * (1 - env.ventSensibleRecovery) * Math.max(0, t - site.indoorCoolF));
  const houseHourly = roomsHourly.map((v, k) => (v + ventHourly[k]) * (1 + env.ductCoolPct / 100));
  let peakK = 0; houseHourly.forEach((v, k) => { if (v > houseHourly[peakK]) peakK = k; });
  const roomLatent = roomResults.reduce((a, r) => a + r.cooling.latent, 0);
  const latentTotal = roomLatent + ventLatent;
  const sensibleTotal = houseHourly[peakK];
  const roomHeat = roomResults.reduce((a, r) => a + r.heating.total, 0);
  const heatingTotal = (roomHeat + ventHeat) * (1 + env.ductHeatPct / 100);
  const componentsAtPeak = {};
  for (const key of Object.keys(roomResults[0].cooling.breakdown)) componentsAtPeak[key] = roomResults.reduce((a, r) => a + r.cooling.byHour[peakK][key], 0);
  componentsAtPeak.ventilation = ventHourly[peakK];
  componentsAtPeak.ducts = sensibleTotal - (roomsHourly[peakK] + ventHourly[peakK]);
  const sumOfRoomPeaks = roomResults.reduce((a, r) => a + r.cooling.sensible, 0);
  const floorArea = rooms.reduce((a, r) => a + r.areaFt2, 0);

  // Design airflow from the sensible cooling load and the supply temperature difference.
  const coolingCFM = sensibleTotal / (sensibleAir * env.supplyDeltaT);
  for (const r of roomResults) {
    const coolShare = sumOfRoomPeaks > 0 ? r.cooling.sensible / sumOfRoomPeaks : 0;
    const heatShare = roomHeat > 0 ? r.heating.total / roomHeat : 0;
    r.airflow = { cooling: coolingCFM * coolShare, heating: coolingCFM * heatShare, design: coolingCFM * Math.max(coolShare, heatShare) };
  }
  const totalCooling = sensibleTotal + latentTotal;
  const tons = totalCooling / 12000;
  const NOMINAL = [1.5, 2, 2.5, 3, 3.5, 4, 5];
  const nominal = NOMINAL.find(t => t * 12000 >= totalCooling) ?? null;

  return {
    errors: [],
    assumptions: {
      wallU: Uwall, ceilingU: Uceil, floorU: Ufloor, densityRatio: rho, infiltrationCFM: infilCFM, naturalACH: env.ach50 / env.nFactor,
      volumeFt3: volume, designGrains: dGrains, outdoorGrains: grains(wOut), indoorGrains: grains(wIn), atticRiseF: atticRise,
    },
    designDay: hours.map((h, k) => ({ hour: h, outdoorF: outdoor[k], atticF: attic[k], sunAltitude: suns[k].altitude, houseSensible: houseHourly[k] })),
    rooms: roomResults,
    house: {
      floorAreaFt2: floorArea,
      heating: { rooms: roomHeat, ventilation: ventHeat, ducts: (roomHeat + ventHeat) * env.ductHeatPct / 100, total: heatingTotal },
      cooling: {
        peakHour: peakK + 1, sensible: sensibleTotal, latent: latentTotal, total: totalCooling,
        sensibleHeatRatio: totalCooling > 0 ? sensibleTotal / totalCooling : 1,
        sumOfRoomPeaks, ventilationSensible: ventHourly[peakK], ventilationLatent: ventLatent, components: componentsAtPeak,
      },
      coolingTons: tons, nominalTons: nominal, ruleOfThumbTons: floorArea / 500, designCFM: coolingCFM,
      heatingBtuhPerFt2: floorArea ? heatingTotal / floorArea : 0, ft2PerTon: tons > 0 ? floorArea / tons : null,
    },
  };
}

// A 1,800 ft² single-storey ranch on a slab, mixed-humid climate; walls
// listed per room with the direction each faces. The numbers are an
// illustration, not a measured house.
export const EXAMPLE = {
  site: { latitude: 36, elevationFt: 600, heatingOutdoorF: 22, coolingOutdoorF: 93, dailyRangeF: 20, coolingDewPointF: 72, indoorHeatF: 70, indoorCoolF: 75, indoorRH: 50 },
  envelope: { wallCavityR: 13, studDepthIn: 3.5, ceilingR: 38, roofColor: 'dark', windowU: 0.32, windowSHGC: 0.27, ach50: 6, nFactor: 20, ventCFM: 50, ductHeatPct: 10, ductCoolPct: 10, slabF: 0.73 },
  rooms: [
    { name: 'Living', areaFt2: 360, ceilingFt: 9, ceilingToAttic: true, floor: 'slab', slabPerimeterFt: 38, people: 4, applianceBtuh: 600,
      walls: [{ facing: 'S', lengthFt: 20, windowFt2: 48 }, { facing: 'W', lengthFt: 18, windowFt2: 30, doorFt2: 20 }] },
    { name: 'Kitchen/dining', areaFt2: 320, ceilingFt: 9, ceilingToAttic: true, floor: 'slab', slabPerimeterFt: 36, people: 2, applianceBtuh: 1200,
      walls: [{ facing: 'S', lengthFt: 16, windowFt2: 24 }, { facing: 'E', lengthFt: 20, windowFt2: 15, doorFt2: 20 }] },
    { name: 'Primary bedroom', areaFt2: 270, ceilingToAttic: true, floor: 'slab', slabPerimeterFt: 33, people: 2,
      walls: [{ facing: 'N', lengthFt: 18, windowFt2: 20 }, { facing: 'W', lengthFt: 15, windowFt2: 15 }] },
    { name: 'Primary bath', areaFt2: 120, ceilingToAttic: true, floor: 'slab', slabPerimeterFt: 10,
      walls: [{ facing: 'N', lengthFt: 10, windowFt2: 6 }] },
    { name: 'Bedroom 2', areaFt2: 150, ceilingToAttic: true, floor: 'slab', slabPerimeterFt: 25, people: 1,
      walls: [{ facing: 'N', lengthFt: 12, windowFt2: 15 }, { facing: 'E', lengthFt: 12.5, windowFt2: 0 }] },
    { name: 'Bedroom 3', areaFt2: 150, ceilingToAttic: true, floor: 'slab', slabPerimeterFt: 25, people: 1,
      walls: [{ facing: 'S', lengthFt: 12, windowFt2: 15 }, { facing: 'E', lengthFt: 12.5, windowFt2: 0 }] },
    { name: 'Hall bath', areaFt2: 60, ceilingToAttic: true, floor: 'slab', slabPerimeterFt: 0, walls: [] },
    { name: 'Halls/laundry', areaFt2: 370, ceilingToAttic: true, floor: 'slab', slabPerimeterFt: 20, applianceBtuh: 300,
      walls: [{ facing: 'N', lengthFt: 20, doorFt2: 20 }] },
  ],
};
