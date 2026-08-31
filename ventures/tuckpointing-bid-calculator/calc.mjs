// Pure bid arithmetic for masonry tuckpointing / brick pointing.
// No network, no state: every wall foot, grind hour, lintel, wage, and
// mortar invoice is an input, so the result stays a transparent
// calculation the mason can check against their own tickets rather
// than a claim about what any wall "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$8 / sq ft tuckpointing special" treats a single-story, ground-level
// Type N smear (no grind) of a 1980s veneer as the same job as a
// three-story historic lime wall with scaffold or a swing stage,
// color-matched mortar, lintel replacements, and cut-and-replace brick.
// Homeowners (and a lot of estimator sheets) count the same kind of
// number. Joints, access, and extras do not scale with that smear dump.
// Matching a cheap ground-level special on a grind-and-scaffold job is
// how a sold pointing becomes a two-day loss after the first scaffold
// ticket.
//
// Distinct from *stucco / EIFS* (a cementitious skin, not mortar joints),
// *foundation repair* (piers and straps, not face brick), *chimney sweep*
// (flue and creosote, not joints), *fireplace insert* (a liner and a
// hearth), and *exterior painting* (a coat, not a grind). This prices
// tuckpointing: the joints, the access, and the extras.

export const METHOD_PRESETS = Object.freeze([
  { id: 'smear', label: 'Point-only smear — no grind (the cheap special)' },
  { id: 'grind', label: 'Grind-and-point (proper tuckpointing)' },
  { id: 'rebuild', label: 'Cut out and relay courses' },
]);

export const ACCESS_PRESETS = Object.freeze([
  { id: 'ground', label: 'Ground / ladder — one story' },
  { id: 'scaffold', label: 'Scaffold — two stories' },
  { id: 'swing', label: 'Swing stage / mast — three stories+' },
]);

export const MORTAR_PRESETS = Object.freeze([
  { id: 'type-n', label: 'Type N portland (modern veneer)' },
  { id: 'lime', label: 'Historic lime putty' },
  { id: 'color-match', label: 'Custom color-matched mortar' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Single-story ranch veneer, ground, Type N smear (the cheap special)',
    wallLengthFt: 40,
    wallHeightFt: 8,
    method: 'smear',
    access: 'ground',
    mortar: 'type-n',
    travelMiles: 12,
    replacementBricks: 0,
    lintels: 0,
    caulkLf: 0,
    powerWash: false,
  },
  {
    label: 'Two-story colonial, scaffold, grind-and-point, Type N',
    wallLengthFt: 48,
    wallHeightFt: 18,
    method: 'grind',
    access: 'scaffold',
    mortar: 'type-n',
    travelMiles: 18,
    replacementBricks: 24,
    lintels: 1,
    caulkLf: 0,
    powerWash: true,
  },
  {
    label: 'Three-story historic, swing, lime grind, brick and lintels (where the special loses)',
    wallLengthFt: 36,
    wallHeightFt: 28,
    method: 'grind',
    access: 'swing',
    mortar: 'lime',
    travelMiles: 28,
    replacementBricks: 80,
    lintels: 3,
    caulkLf: 40,
    powerWash: true,
  },
  {
    label: 'Chimney-only, ground, grind-and-point, Type N',
    wallLengthFt: 12,
    wallHeightFt: 28,
    method: 'grind',
    access: 'ground',
    mortar: 'type-n',
    travelMiles: 10,
    replacementBricks: 16,
    lintels: 0,
    caulkLf: 0,
    powerWash: false,
  },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function flag(value) {
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0 || value === '' || value == null) {
    return false;
  }
  return Boolean(value);
}

function requirePreset(presets, id, label) {
  const found = presets.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown ${label}`);
  return found;
}

/**
 * Face area of the elevation being pointed. Either dimension at
 * zero is a zero-area wall, not a missing input — the mason can
 * still price rates without a shape.
 */
export function wallAreaSqFt(wallLengthFt, wallHeightFt) {
  return number(wallLengthFt, 'Wall length') * number(wallHeightFt, 'Wall height');
}

/**
 * Joint lineal feet from wall area and a density. Density of zero
 * is a zero-joint wall, not a missing input.
 */
export function jointLinealFeet(areaSqFt, jointDensity) {
  return number(areaSqFt, 'Wall area') * number(jointDensity, 'Joint density');
}

/**
 * Travel hours from a trip plus miles. Miles of zero is a local
 * stop, not a missing input.
 */
export function travelHours(hoursTrip, travelMiles, hoursPerMile) {
  return number(hoursTrip, 'Trip hours')
    + number(travelMiles, 'Travel miles') * number(hoursPerMile, 'Hours per mile');
}

/**
 * Starting hours and invoices from how the joints are actually
 * opened. A smear is a surface coat. Grind-and-point is the real
 * trade. Rebuild is cut-out and relay.
 */
export function suggestedMethodKit(method) {
  const id = String(method);
  if (id === 'smear') {
    return {
      hoursPerSqFtGrind: 0,
      hoursPerSqFtPoint: 0.055,
      hoursPerSqFtRebuild: 0,
      mortarPerSqFt: 0.42,
      grindBladesPer100SqFt: 0,
    };
  }
  if (id === 'grind') {
    return {
      hoursPerSqFtGrind: 0.095,
      hoursPerSqFtPoint: 0.125,
      hoursPerSqFtRebuild: 0,
      mortarPerSqFt: 0.88,
      grindBladesPer100SqFt: 1.4,
    };
  }
  if (id === 'rebuild') {
    return {
      hoursPerSqFtGrind: 0,
      hoursPerSqFtPoint: 0.04,
      hoursPerSqFtRebuild: 0.42,
      mortarPerSqFt: 1.65,
      grindBladesPer100SqFt: 0.4,
    };
  }
  throw new Error('Unknown method');
}

/**
 * Ground is a ladder day. Scaffold is a dedicated set plus rental.
 * Swing is a lift invoice and more set hours.
 */
export function suggestedAccessKit(access) {
  const id = String(access);
  if (id === 'ground') {
    return { hoursAccess: 0.7, accessEquipment: 0 };
  }
  if (id === 'scaffold') {
    return { hoursAccess: 5.5, accessEquipment: 480 };
  }
  if (id === 'swing') {
    return { hoursAccess: 9.2, accessEquipment: 1450 };
  }
  throw new Error('Unknown access');
}

/**
 * Mortar chemistry. Type N is bags. Lime is mix time. Color-match
 * is a sample invoice plus more mix time.
 */
export function suggestedMortarKit(mortar) {
  const id = String(mortar);
  if (id === 'type-n') {
    return { hoursMortarMix: 0.4, colorMatchInvoice: 0, mortarPremiumPerSqFt: 0 };
  }
  if (id === 'lime') {
    return { hoursMortarMix: 1.8, colorMatchInvoice: 0, mortarPremiumPerSqFt: 1.35 };
  }
  if (id === 'color-match') {
    return { hoursMortarMix: 2.6, colorMatchInvoice: 185, mortarPremiumPerSqFt: 2.15 };
  }
  throw new Error('Unknown mortar');
}

/**
 * Starting extras that do not live in an $8 / sq ft smear special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 1.6,
    hoursPerMile: 0.035,
    hoursPerBrick: 0.12,
    hoursPerLintel: 1.8,
    hoursPowerWash: 2.4,
    hoursPerCaulkLf: 0.04,
    siteHours: 1.2,
    brickEach: 2.85,
    lintelEach: 88,
    powerWashInvoice: 95,
    caulkPerLf: 1.65,
    travelPerMile: 2.8,
    grindBladeEach: 18,
    jointDensity: 6.5,
  };
}

/**
 * Price a tuckpointing job from the joints, the access, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const method = requirePreset(METHOD_PRESETS, input.method, 'method').id;
  const access = requirePreset(ACCESS_PRESETS, input.access, 'access').id;
  const mortar = requirePreset(MORTAR_PRESETS, input.mortar, 'mortar').id;

  const wallLengthFt = number(input.wallLengthFt ?? 0, 'Wall length');
  const wallHeightFt = number(input.wallHeightFt ?? 0, 'Wall height');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const replacementBricks = number(input.replacementBricks ?? 0, 'Replacement bricks');
  const lintels = number(input.lintels ?? 0, 'Lintels');
  const caulkLf = number(input.caulkLf ?? 0, 'Caulk lineal feet');
  const powerWash = flag(input.powerWash);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursPerSqFtGrind = number(input.hoursPerSqFtGrind ?? 0, 'Grind hours per sq ft');
  const hoursPerSqFtPoint = number(input.hoursPerSqFtPoint ?? 0, 'Point hours per sq ft');
  const hoursPerSqFtRebuild = number(input.hoursPerSqFtRebuild ?? 0, 'Rebuild hours per sq ft');
  const hoursAccess = number(input.hoursAccess ?? 0, 'Access hours');
  const hoursMortarMix = number(input.hoursMortarMix ?? 0, 'Mortar mix hours');
  const hoursPerBrick = number(input.hoursPerBrick ?? 0, 'Hours per brick');
  const hoursPerLintel = number(input.hoursPerLintel ?? 0, 'Hours per lintel');
  const hoursPowerWash = number(input.hoursPowerWash ?? 0, 'Power-wash hours');
  const hoursPerCaulkLf = number(input.hoursPerCaulkLf ?? 0, 'Hours per caulk foot');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const mortarPerSqFt = number(input.mortarPerSqFt ?? 0, 'Mortar per sq ft');
  const mortarPremiumPerSqFt = number(input.mortarPremiumPerSqFt ?? 0, 'Mortar premium per sq ft');
  const grindBladesPer100SqFt = number(input.grindBladesPer100SqFt ?? 0, 'Grind blades per 100 sq ft');
  const grindBladeEach = number(input.grindBladeEach ?? 0, 'Grind blade each');
  const accessEquipment = number(input.accessEquipment ?? 0, 'Access equipment');
  const colorMatchInvoice = number(input.colorMatchInvoice ?? 0, 'Color-match invoice');
  const brickEach = number(input.brickEach ?? 0, 'Brick each');
  const lintelEach = number(input.lintelEach ?? 0, 'Lintel each');
  const powerWashInvoice = number(input.powerWashInvoice ?? 0, 'Power-wash invoice');
  const caulkPerLf = number(input.caulkPerLf ?? 0, 'Caulk per lineal foot');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');
  const jointDensity = number(input.jointDensity ?? 0, 'Joint density');

  const areaSqFt = wallAreaSqFt(wallLengthFt, wallHeightFt);
  const jointLf = jointLinealFeet(areaSqFt, jointDensity);
  const grindBlades = areaSqFt * grindBladesPer100SqFt / 100;

  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursGrind = areaSqFt * hoursPerSqFtGrind;
  const hoursPoint = areaSqFt * hoursPerSqFtPoint;
  const hoursRebuild = areaSqFt * hoursPerSqFtRebuild;
  const hoursBricks = replacementBricks * hoursPerBrick;
  const hoursLintels = lintels * hoursPerLintel;
  const hoursWash = powerWash ? hoursPowerWash : 0;
  const hoursCaulk = caulkLf * hoursPerCaulkLf;
  const totalHours = hoursTravel + hoursGrind + hoursPoint + hoursRebuild
    + hoursAccess + hoursMortarMix + hoursBricks + hoursLintels
    + hoursWash + hoursCaulk + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const mortarMaterial = areaSqFt * (mortarPerSqFt + mortarPremiumPerSqFt);
  const grindMaterial = grindBlades * grindBladeEach;
  const brickMaterial = replacementBricks * brickEach;
  const lintelMaterial = lintels * lintelEach;
  const washMaterial = powerWash ? powerWashInvoice : 0;
  const caulkMaterial = caulkLf * caulkPerLf;
  const travelInvoice = travelMiles * travelPerMile;
  const extraHardware = grindMaterial + brickMaterial + lintelMaterial
    + washMaterial + caulkMaterial + accessEquipment + colorMatchInvoice + travelInvoice;
  const materialCost = mortarMaterial + extraHardware;

  const softCost = travelAndEquipment + otherCost;
  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);
  const hourShare = (amount) => (totalHours === 0 ? 0 : amount / totalHours * 100);
  const extraCost = extraHardware
    + hoursGrind * loadedWage
    + hoursAccess * loadedWage
    + hoursMortarMix * loadedWage
    + hoursBricks * loadedWage
    + hoursLintels * loadedWage
    + hoursWash * loadedWage
    + hoursCaulk * loadedWage
    + hoursTravel * loadedWage
    + hoursRebuild * loadedWage;

  return {
    method,
    access,
    mortar,
    wallLengthFt,
    wallHeightFt,
    travelMiles,
    replacementBricks,
    lintels,
    caulkLf,
    powerWash,
    areaSqFt,
    jointLf,
    grindBlades,
    loadedWage,
    hoursTravel,
    hoursGrind,
    hoursPoint,
    hoursRebuild,
    hoursAccess,
    hoursMortarMix,
    hoursBricks,
    hoursLintels,
    hoursWash,
    hoursCaulk,
    siteHours,
    totalHours,
    laborCost,
    mortarMaterial,
    grindMaterial,
    brickMaterial,
    lintelMaterial,
    washMaterial,
    caulkMaterial,
    travelInvoice,
    accessEquipment,
    colorMatchInvoice,
    extraHardware,
    extraCost,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSqFt: areaSqFt === 0 ? null : price / areaSqFt,
    pricePerJointLf: jointLf === 0 ? null : price / jointLf,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      mortar: costShare(mortarMaterial),
      extra: costShare(extraCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      travel: hourShare(hoursTravel),
      grind: hourShare(hoursGrind),
      point: hourShare(hoursPoint),
      rebuild: hourShare(hoursRebuild),
      access: hourShare(hoursAccess),
      mortar: hourShare(hoursMortarMix),
      bricks: hourShare(hoursBricks),
      lintels: hourShare(hoursLintels),
      wash: hourShare(hoursWash),
      caulk: hourShare(hoursCaulk),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perSqFt: areaSqFt === 0 ? null : proposedPrice / areaSqFt,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same wall three ways — smear, grind-and-point, rebuild —
 * from the suggested method kits so the mason can see when a grind
 * flips the cheap $8 / sq ft special. User-typed method rates are
 * not reused here: the comparison is apples-to-apples on the starting
 * figures. Access and mortar kits stay with the current job.
 */
export function compareMethod(input) {
  const accessKit = suggestedAccessKit(String(input.access ?? 'ground'));
  const mortarKit = suggestedMortarKit(String(input.mortar ?? 'type-n'));
  const extraKit = suggestedExtraKit();
  const rows = METHOD_PRESETS.map((preset) => {
    const kit = suggestedMethodKit(preset.id);
    const bid = calculateBid({
      ...input,
      method: preset.id,
      ...accessKit,
      ...mortarKit,
      ...extraKit,
      ...kit,
    });
    return {
      method: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerSqFt: bid.pricePerSqFt,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursGrind: bid.hoursGrind,
      breakEvenPrice: bid.breakEvenPrice,
    };
  });
  const cheapest = Math.min(...rows.map((row) => row.price));
  return rows
    .map((row) => ({
      ...row,
      cheapest: row.price === cheapest,
      delta: row.price - cheapest,
    }))
    .sort((a, b) => a.price - b.price);
}

function money(value) {
  const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Format a bid as a plain-text draft the mason can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this
 * is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Tuckpointing') {
  const perFt = result.pricePerSqFt === null
    ? 'n/a'
    : `${money(result.pricePerSqFt)} / sq ft`;
  const method = METHOD_PRESETS.find((item) => item.id === result.method)?.label ?? result.method;
  const access = ACCESS_PRESETS.find((item) => item.id === result.access)?.label ?? result.access;
  const mortar = MORTAR_PRESETS.find((item) => item.id === result.mortar)?.label ?? result.mortar;
  const extras = [
    `${result.travelMiles} travel miles`,
    access,
    `${result.replacementBricks} replacement brick${result.replacementBricks === 1 ? '' : 's'}`,
    `${result.lintels} lintel${result.lintels === 1 ? '' : 's'}`,
    `${result.caulkLf} lf control-joint caulk`,
    result.powerWash ? 'power wash included' : 'no power wash',
  ].join('; ');
  return [
    'TUCKPOINTING / BRICK POINTING BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${method}; ${mortar}`,
    `Price per square foot: ${perFt}`,
    `Wall: ${result.areaSqFt.toLocaleString('en-US')} sq ft (${result.jointLf.toFixed(0)} lf of joint)`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.wallLengthFt} ft × ${result.wallHeightFt} ft elevation (${result.areaSqFt.toLocaleString('en-US')} sq ft)`,
    `- ${method}; ${access}; ${mortar}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; grind: ${result.hoursGrind.toFixed(1)} h; point: ${result.hoursPoint.toFixed(1)} h; rebuild: ${result.hoursRebuild.toFixed(1)} h; extras: ${(result.hoursBricks + result.hoursLintels + result.hoursWash + result.hoursCaulk).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm wall area, method, access, mortar, extras, and all pricing before sending. It is not a structural specification, an engineered stamp, a historic-preservation determination, or a building-code determination.',
  ].join('\n');
}
