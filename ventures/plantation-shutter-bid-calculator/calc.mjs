// Pure bid arithmetic for residential plantation-shutter install.
// No network, no state: every opening, panel, wage, and shutter
// invoice is an input, so the result stays a transparent
// calculation the window-treatment shop can check against their
// own tickets rather than a claim about what any house "should"
// cost.
//
// The method is the one the trade actually loses money on: a
// published "$250 a window special" treats a 30×60 2-panel
// inside-mount paint-grade hang as the same job as eight 48×80
// 4-panel outside-mount stain-grade openings on a second story
// with existing treatment removal and a bypass track. Homeowners
// (and a lot of estimator sheets) count the same kind of number.
// Measure trips, templates, stain-grade, bypass, café splits,
// and specialty shapes do not live in that dump. Matching a
// cheap hang special on a template-and-custom house is how a
// sold shutter job becomes a loss when the millwork and the
// second story eat the margin.
//
// Distinct from *window replacement* (glass, united inches, a
// nailing flange), *window cleaning* (panes), *patio door*
// (sliders as an opening), and *interior painting* (a coat).
// This prices a shutter install: openings, mount, grade, and
// the extras.

export const SCOPE_PRESETS = Object.freeze([
  { id: 'product-install', label: 'Product-on-site hang — the cheap special' },
  { id: 'measure-install', label: 'Measure and install — typical shop job' },
  { id: 'template-custom', label: 'Template and custom mill — the expensive path' },
]);

export const MOUNT_PRESETS = Object.freeze([
  { id: 'inside', label: 'Inside mount — jamb and sill' },
  { id: 'outside', label: 'Outside mount — on the trim' },
]);

export const GRADE_PRESETS = Object.freeze([
  { id: 'paint', label: 'Paint-grade / composite' },
  { id: 'stain', label: 'Stain-grade hardwood' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Cheap special: 6 openings, 30×60, 2-panel, inside, paint, hang only',
    openings: 6,
    widthIn: 30,
    heightIn: 60,
    panelsPerOpening: 2,
    stories: 1,
    scope: 'product-install',
    mount: 'inside',
    grade: 'paint',
    travelMiles: 8,
    includeRemoval: false,
    includeSpecialty: false,
    includeBypass: false,
    includeCafe: false,
  },
  {
    label: 'Typical shop: 8 openings, 32×64, 2-panel, inside, paint, measure + hang',
    openings: 8,
    widthIn: 32,
    heightIn: 64,
    panelsPerOpening: 2,
    stories: 1,
    scope: 'measure-install',
    mount: 'inside',
    grade: 'paint',
    travelMiles: 12,
    includeRemoval: true,
    includeSpecialty: false,
    includeBypass: false,
    includeCafe: false,
  },
  {
    label: 'Wide bypass: 4 openings, 72×80, 4-panel, outside, stain, café split',
    openings: 4,
    widthIn: 72,
    heightIn: 80,
    panelsPerOpening: 4,
    stories: 1,
    scope: 'measure-install',
    mount: 'outside',
    grade: 'stain',
    travelMiles: 14,
    includeRemoval: true,
    includeSpecialty: false,
    includeBypass: true,
    includeCafe: true,
  },
  {
    label: 'Losing job: 8 openings, 48×80, 4-panel, outside, stain, template, 2-story, arch',
    openings: 8,
    widthIn: 48,
    heightIn: 80,
    panelsPerOpening: 4,
    stories: 2,
    scope: 'template-custom',
    mount: 'outside',
    grade: 'stain',
    travelMiles: 22,
    includeRemoval: true,
    includeSpecialty: true,
    includeBypass: true,
    includeCafe: false,
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
 * Travel hours from a trip plus miles. Miles of zero is a local
 * stop, not a missing input.
 */
export function travelHours(hoursTrip, travelMiles, hoursPerMile) {
  return number(hoursTrip, 'Trip hours')
    + number(travelMiles, 'Travel miles') * number(hoursPerMile, 'Hours per mile');
}

/**
 * Opening square footage from width × height × count.
 * A 30×60 opening is 12.5 SF; a 72×80 is 40 SF. The cheap
 * special cannot see that difference.
 */
export function openingSquareFeet(openings, widthIn, heightIn) {
  return number(openings, 'Openings') * number(widthIn, 'Width') * number(heightIn, 'Height') / 144;
}

/**
 * Starting hang hours from how much of the job is actually
 * sold. Product-on-site is the cheap special. Measure-and-
 * install is a typical shop trip. Template-and-custom is a
 * millwork job plus the hang.
 */
export function suggestedScopeKit(scope) {
  const id = String(scope);
  if (id === 'product-install') {
    return {
      hoursHang: 2.4,
      hoursMeasure: 0,
      hoursTemplate: 0,
      plantInvoice: 180,
    };
  }
  if (id === 'measure-install') {
    return {
      hoursHang: 2.8,
      hoursMeasure: 1.6,
      hoursTemplate: 0,
      plantInvoice: 180,
    };
  }
  if (id === 'template-custom') {
    return {
      hoursHang: 3.6,
      hoursMeasure: 0.8,
      hoursTemplate: 2.4,
      plantInvoice: 260,
    };
  }
  throw new Error('Unknown scope');
}

/**
 * Inside mount is jamb and sill. Outside mount is trim,
 * returns, and more hardware. The cheap special assumes
 * every opening is an inside-mount 2-panel.
 */
export function suggestedMountKit(mount) {
  const id = String(mount);
  if (id === 'inside') {
    return {
      hoursPerOpening: 0.85,
      hoursPerPanel: 0.35,
      hoursPerSqFt: 0.04,
      panelEach: 95,
      mountHardware: 45,
    };
  }
  if (id === 'outside') {
    return {
      hoursPerOpening: 1.05,
      hoursPerPanel: 0.42,
      hoursPerSqFt: 0.05,
      panelEach: 110,
      mountHardware: 85,
    };
  }
  throw new Error('Unknown mount');
}

/**
 * Paint-grade / composite is the cheap-special assumption.
 * Stain-grade is a different mill invoice and more careful
 * hang time baked into the per-SF rate.
 */
export function suggestedGradeKit(grade) {
  const id = String(grade);
  if (id === 'paint') {
    return { shutterPerSqFt: 28, gradeHardware: 0 };
  }
  if (id === 'stain') {
    return { shutterPerSqFt: 46, gradeHardware: 75 };
  }
  throw new Error('Unknown grade');
}

/**
 * Starting extras that do not live in a $250-a-window special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 1.2,
    hoursPerMile: 0.035,
    hoursRemovalPerOpening: 0.45,
    hoursSpecialty: 2.2,
    hoursBypass: 1.6,
    hoursCafe: 1.4,
    hoursPerStoryAbove: 0.55,
    siteHours: 0.8,
    removalPerOpening: 28,
    specialtyInvoice: 380,
    bypassInvoice: 220,
    cafeInvoice: 160,
    travelPerMile: 2.4,
  };
}

/**
 * Price a plantation-shutter install from the openings, the
 * mount, the grade, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const scope = requirePreset(SCOPE_PRESETS, input.scope, 'scope').id;
  const mount = requirePreset(MOUNT_PRESETS, input.mount, 'mount').id;
  const grade = requirePreset(GRADE_PRESETS, input.grade, 'grade').id;

  const openings = number(input.openings ?? 0, 'Openings');
  const widthIn = number(input.widthIn ?? 0, 'Width');
  const heightIn = number(input.heightIn ?? 0, 'Height');
  const panelsPerOpening = number(input.panelsPerOpening ?? 0, 'Panels per opening');
  const stories = number(input.stories ?? 0, 'Stories');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const includeRemoval = flag(input.includeRemoval);
  const includeSpecialty = flag(input.includeSpecialty);
  const includeBypass = flag(input.includeBypass);
  const includeCafe = flag(input.includeCafe);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursHang = number(input.hoursHang ?? 0, 'Hang hours');
  const hoursMeasure = number(input.hoursMeasure ?? 0, 'Measure hours');
  const hoursTemplate = number(input.hoursTemplate ?? 0, 'Template hours');
  const hoursPerOpening = number(input.hoursPerOpening ?? 0, 'Hours per opening');
  const hoursPerPanel = number(input.hoursPerPanel ?? 0, 'Hours per panel');
  const hoursPerSqFt = number(input.hoursPerSqFt ?? 0, 'Hours per square foot');
  const hoursRemovalPerOpening = number(input.hoursRemovalPerOpening ?? 0, 'Removal hours per opening');
  const hoursSpecialty = number(input.hoursSpecialty ?? 0, 'Specialty hours');
  const hoursBypass = number(input.hoursBypass ?? 0, 'Bypass hours');
  const hoursCafe = number(input.hoursCafe ?? 0, 'Café hours');
  const hoursPerStoryAbove = number(input.hoursPerStoryAbove ?? 0, 'Hours per extra story');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const plantInvoice = number(input.plantInvoice ?? 0, 'Plant invoice');
  const shutterPerSqFt = number(input.shutterPerSqFt ?? 0, 'Shutter per square foot');
  const gradeHardware = number(input.gradeHardware ?? 0, 'Grade hardware');
  const panelEach = number(input.panelEach ?? 0, 'Panel each');
  const mountHardware = number(input.mountHardware ?? 0, 'Mount hardware');
  const removalPerOpening = number(input.removalPerOpening ?? 0, 'Removal per opening');
  const specialtyInvoice = number(input.specialtyInvoice ?? 0, 'Specialty invoice');
  const bypassInvoice = number(input.bypassInvoice ?? 0, 'Bypass invoice');
  const cafeInvoice = number(input.cafeInvoice ?? 0, 'Café invoice');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');

  const sqFt = openingSquareFeet(openings, widthIn, heightIn);
  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursOpenings = openings * hoursPerOpening;
  const hoursPanels = openings * panelsPerOpening * hoursPerPanel;
  const hoursSize = sqFt * hoursPerSqFt;
  const hoursRemovalApplied = includeRemoval ? openings * hoursRemovalPerOpening : 0;
  const hoursSpecialtyApplied = includeSpecialty ? hoursSpecialty : 0;
  const hoursBypassApplied = includeBypass ? hoursBypass : 0;
  const hoursCafeApplied = includeCafe ? hoursCafe : 0;
  const extraStories = Math.max(0, stories - 1);
  const hoursStoryApplied = extraStories * hoursPerStoryAbove * openings;
  const extraWorkHours = hoursMeasure + hoursTemplate + hoursOpenings + hoursPanels
    + hoursSize + hoursRemovalApplied + hoursSpecialtyApplied + hoursBypassApplied
    + hoursCafeApplied + hoursStoryApplied;
  const totalHours = hoursTravel + hoursHang + extraWorkHours + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const shutterMaterial = sqFt * shutterPerSqFt + gradeHardware;
  const panelMaterial = openings * panelsPerOpening * panelEach;
  const mountMaterial = openings * mountHardware;
  const removalMaterial = includeRemoval ? openings * removalPerOpening : 0;
  const specialtyMaterial = includeSpecialty ? specialtyInvoice : 0;
  const bypassMaterial = includeBypass ? bypassInvoice : 0;
  const cafeMaterial = includeCafe ? cafeInvoice : 0;
  const travelInvoice = travelMiles * travelPerMile;
  const plantMaterial = plantInvoice + shutterMaterial + panelMaterial + mountMaterial;
  const extraHardware = removalMaterial + specialtyMaterial + bypassMaterial
    + cafeMaterial + travelInvoice;
  const materialCost = plantMaterial + extraHardware;

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
    + hoursMeasure * loadedWage
    + hoursTemplate * loadedWage
    + hoursOpenings * loadedWage
    + hoursPanels * loadedWage
    + hoursSize * loadedWage
    + hoursRemovalApplied * loadedWage
    + hoursSpecialtyApplied * loadedWage
    + hoursBypassApplied * loadedWage
    + hoursCafeApplied * loadedWage
    + hoursStoryApplied * loadedWage
    + hoursTravel * loadedWage;

  return {
    scope,
    mount,
    grade,
    openings,
    widthIn,
    heightIn,
    panelsPerOpening,
    stories,
    travelMiles,
    includeRemoval,
    includeSpecialty,
    includeBypass,
    includeCafe,
    sqFt,
    loadedWage,
    hoursTravel,
    hoursHang,
    hoursMeasure,
    hoursTemplate,
    hoursOpenings,
    hoursPanels,
    hoursSize,
    hoursRemoval: hoursRemovalApplied,
    hoursSpecialty: hoursSpecialtyApplied,
    hoursBypass: hoursBypassApplied,
    hoursCafe: hoursCafeApplied,
    hoursStory: hoursStoryApplied,
    siteHours,
    totalHours,
    laborCost,
    shutterMaterial,
    panelMaterial,
    mountMaterial,
    removalMaterial,
    specialtyMaterial,
    bypassMaterial,
    cafeMaterial,
    travelInvoice,
    extraHardware,
    extraCost,
    plantMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerOpening: openings === 0 ? null : price / openings,
    pricePerSqFt: sqFt === 0 ? null : price / sqFt,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      plant: costShare(plantMaterial),
      extra: costShare(extraCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      travel: hourShare(hoursTravel),
      hang: hourShare(hoursHang),
      measure: hourShare(hoursMeasure),
      template: hourShare(hoursTemplate),
      openings: hourShare(hoursOpenings),
      panels: hourShare(hoursPanels),
      size: hourShare(hoursSize),
      removal: hourShare(hoursRemovalApplied),
      specialty: hourShare(hoursSpecialtyApplied),
      bypass: hourShare(hoursBypassApplied),
      cafe: hourShare(hoursCafeApplied),
      story: hourShare(hoursStoryApplied),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perOpening: openings === 0 ? null : proposedPrice / openings,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same openings three ways — product-on-site hang,
 * measure-and-install, template-and-custom — from the suggested
 * scope kits so the shop can see when millwork flips the cheap
 * $250-a-window special. User-typed scope rates are not reused
 * here: the comparison is apples-to-apples on the starting
 * figures. Mount and grade kits stay with the current job.
 */
export function compareScope(input) {
  const mountKit = suggestedMountKit(String(input.mount ?? 'inside'));
  const gradeKit = suggestedGradeKit(String(input.grade ?? 'paint'));
  const extraKit = suggestedExtraKit();
  const rows = SCOPE_PRESETS.map((preset) => {
    const kit = suggestedScopeKit(preset.id);
    const bid = calculateBid({
      ...input,
      scope: preset.id,
      ...mountKit,
      ...gradeKit,
      ...extraKit,
      ...kit,
    });
    return {
      scope: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerOpening: bid.pricePerOpening,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursHang: bid.hoursHang,
      hoursMeasure: bid.hoursMeasure,
      hoursTemplate: bid.hoursTemplate,
      plantMaterial: bid.plantMaterial,
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
 * Format a bid as a plain-text draft the shop can paste into
 * a proposal. Costs, wages, and invoices are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Plantation shutter install') {
  const perOpening = result.pricePerOpening === null
    ? 'n/a'
    : `${money(result.pricePerOpening)} / opening`;
  const scope = SCOPE_PRESETS.find((item) => item.id === result.scope)?.label ?? result.scope;
  const mount = MOUNT_PRESETS.find((item) => item.id === result.mount)?.label ?? result.mount;
  const grade = GRADE_PRESETS.find((item) => item.id === result.grade)?.label ?? result.grade;
  const extras = [
    `${result.travelMiles} travel miles`,
    mount,
    grade,
    `${result.panelsPerOpening} panel${result.panelsPerOpening === 1 ? '' : 's'} per opening`,
    `${result.stories} stor${result.stories === 1 ? 'y' : 'ies'}`,
    result.includeRemoval ? 'existing treatment removal included' : 'no treatment removal',
    result.includeSpecialty ? 'specialty / arched opening included' : 'no specialty shape',
    result.includeBypass ? 'bypass track included' : 'no bypass',
    result.includeCafe ? 'café / tier-on-tier included' : 'no café split',
  ].join('; ');
  return [
    'PLANTATION SHUTTER BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${scope}`,
    `Price per opening: ${perOpening}`,
    `Openings: ${result.openings.toLocaleString('en-US')} at ${result.widthIn}×${result.heightIn} in (${result.sqFt.toFixed(1)} SF of shutter)`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.openings} openings; ${mount}; ${scope}; ${grade}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; hang: ${result.hoursHang.toFixed(1)} h; extras: ${(result.hoursMeasure + result.hoursTemplate + result.hoursOpenings + result.hoursPanels + result.hoursSize + result.hoursRemoval + result.hoursSpecialty + result.hoursBypass + result.hoursCafe + result.hoursStory).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm openings, sizes, mount, grade, extras, and all pricing before sending. It is not a window replacement, a window-cleaning bid, a patio-door changeout, a building-code determination, or a product warranty.',
  ].join('\n');
}
