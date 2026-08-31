// Pure bid arithmetic for *installing a residential metal roof* —
// standing seam or exposed-fastener panels — not an asphalt-shingle
// reroof, not a solar array, and not a gutter run. No network, no
// state: every square, panel kit, tear-off, trim run, wage, and extra
// is an input, so the result stays a transparent calculation the shop
// can check against their own invoices rather than a claim about what
// any roof "should" cost, or whether any assembly is code-compliant.
//
// The method is the one the trade actually loses money on: a flat
// "$950 / square" special treats a 12-square 5V-crimp overlay on a
// 4/12 ranch as the same job as a 26-square mechanical-lock standing
// seam tear-off on a 10/12 two-story with valleys and snow guards.
// Homeowners (and a lot of estimator sheets) count roof squares after
// pitch. Panel type, waste, tear-off, stories, trim lineal feet, ice-
// and-water, and snow guards never appear in that number. Matching a
// cheaper special written for the ranch overlay is how a sold standing-
// seam tear-off becomes a week of unpaid seamer time after the first
// valley.
//
// Distinct from an asphalt *shingle* reroof (squares, pitch factor,
// tear-off bags, and a bundle count), from solar (dollars per watt on
// a roof that is already there), and from gutter *install* (K-style,
// miters, drops). This prices the metal roof: panel squares the coupon
// cannot see, the tear-off, the trim, the extras, and the margin that
// is not in the square special.
//
// Pitch multipliers, waste, and material rates shipped here are common
// starting points used on residential bids. They are not a
// building-code opinion, a permit, or an engineering stamp. Confirm
// the jurisdiction and a qualified professional before sending a price.

export const PANEL_PRESETS = Object.freeze([
  { id: 'exposed', label: 'Exposed fastener (5V / R-panel / corrugated)' },
  { id: 'snap-lock', label: 'Snap-lock standing seam' },
  { id: 'mechanical-lock', label: 'Mechanical-lock standing seam' },
]);

export const PITCH_PRESETS = Object.freeze([
  { id: '4', label: '4/12' },
  { id: '6', label: '6/12' },
  { id: '8', label: '8/12' },
  { id: '10', label: '10/12' },
  { id: '12', label: '12/12' },
]);

export const TEAROFF_PRESETS = Object.freeze([
  { id: 'overlay', label: 'Overlay (metal over existing shingles)' },
  { id: 'tear-off', label: 'Full tear-off to deck' },
]);

export const STORY_PRESETS = Object.freeze([
  { id: '1', label: 'One story' },
  { id: '2', label: 'Two stories' },
  { id: '3', label: 'Three stories / steep access' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '40×30 ranch, 4/12, 5V overlay (the $950/square special)',
    panel: 'exposed',
    pitch: '4',
    tearoff: 'overlay',
    stories: '1',
    lengthFeet: 40,
    widthFeet: 30,
    ridgeLf: 40,
    hipLf: 0,
    valleyLf: 0,
    rakeLf: 60,
    eaveLf: 80,
    snowGuardCount: 0,
    bootCount: 4,
    includeIceAndWater: false,
    includePermit: false,
  },
  {
    label: '50×40 two-story, 10/12, mechanical-lock tear-off, valleys, snow guards',
    panel: 'mechanical-lock',
    pitch: '10',
    tearoff: 'tear-off',
    stories: '2',
    lengthFeet: 50,
    widthFeet: 40,
    ridgeLf: 30,
    hipLf: 48,
    valleyLf: 36,
    rakeLf: 80,
    eaveLf: 100,
    snowGuardCount: 48,
    bootCount: 8,
    includeIceAndWater: true,
    includePermit: true,
  },
  {
    label: '36×28 ranch, 6/12, snap-lock overlay, ice-and-water, 6 boots',
    panel: 'snap-lock',
    pitch: '6',
    tearoff: 'overlay',
    stories: '1',
    lengthFeet: 36,
    widthFeet: 28,
    ridgeLf: 36,
    hipLf: 0,
    valleyLf: 14,
    rakeLf: 56,
    eaveLf: 72,
    snowGuardCount: 0,
    bootCount: 6,
    includeIceAndWater: true,
    includePermit: true,
  },
  {
    label: '48×32 Cape, 8/12, 5V tear-off, two-story, no snow guards',
    panel: 'exposed',
    pitch: '8',
    tearoff: 'tear-off',
    stories: '2',
    lengthFeet: 48,
    widthFeet: 32,
    ridgeLf: 48,
    hipLf: 0,
    valleyLf: 0,
    rakeLf: 64,
    eaveLf: 96,
    snowGuardCount: 0,
    bootCount: 5,
    includeIceAndWater: true,
    includePermit: true,
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

/**
 * Roof-area multiplier for a given pitch. A 4/12 is 1.054; a 12/12 is
 * 1.414. The coupon that quotes "$950 / square" already used one of
 * these — or skipped it and billed plan squares, which is worse.
 */
export function suggestedPitchMultiplier(pitch) {
  const id = String(pitch);
  if (id === '4') return 1.054;
  if (id === '6') return 1.118;
  if (id === '8') return 1.202;
  if (id === '10') return 1.302;
  if (id === '12') return 1.414;
  throw new Error('Unknown pitch');
}

/**
 * Plan square feet the coupon already counted: length × width of the
 * building footprint, not the slope.
 */
export function suggestedPlanSf(lengthFeet, widthFeet) {
  const length = number(lengthFeet, 'Length (feet)', { allowZero: false });
  const width = number(widthFeet, 'Width (feet)', { allowZero: false });
  return length * width;
}

/**
 * Roof square feet after pitch. A 40×30 ranch at 4/12 is 1,264.8 sf,
 * not the 1,200 the coupon wrote on the plan.
 */
export function suggestedRoofSf(lengthFeet, widthFeet, pitch) {
  return suggestedPlanSf(lengthFeet, widthFeet) * suggestedPitchMultiplier(pitch);
}

/**
 * Roofing squares (100 sf). The "$950 / square" special stops here.
 */
export function suggestedSquares(lengthFeet, widthFeet, pitch) {
  return suggestedRoofSf(lengthFeet, widthFeet, pitch) / 100;
}

/**
 * Extra waste from hips and valleys. Standing-seam custom lengths
 * throw more than a 5V sheet. Two percent per 20 lf of hip+valley,
 * capped so a ranch without hips stays at the kit waste.
 */
export function suggestedHipValleyWastePct(hipLf, valleyLf) {
  const hip = number(hipLf, 'Hip (lineal feet)');
  const valley = number(valleyLf, 'Valley (lineal feet)');
  return Math.min(12, ((hip + valley) / 20) * 2);
}

/**
 * Panel squares the coupon cannot see: roof squares × (1 + kit waste
 * + hip/valley waste). A 12.65-square ranch at 8% waste is 13.66
 * panel squares, not "12 squares."
 */
export function suggestedPanelSquares(squares, wastePct, hipValleyWastePct) {
  const roofSquares = number(squares, 'Roof squares');
  const waste = number(wastePct, 'Waste (%)');
  const extra = number(hipValleyWastePct, 'Hip / valley waste (%)');
  return roofSquares * (1 + (waste + extra) / 100);
}

/**
 * Tear-off squares. Overlay is zero — the coupon already assumed
 * that. A full tear-off covers the whole roof, not the panel waste.
 */
export function suggestedTearOffSquares(squares, tearoff) {
  const roofSquares = number(squares, 'Roof squares');
  const id = String(tearoff);
  if (id !== 'overlay' && id !== 'tear-off') throw new Error('Unknown tear-off');
  return id === 'overlay' ? 0 : roofSquares;
}

/**
 * Starting hours-per-square, panel dollars, waste, and seamer hours.
 * Picking a panel kit never overwrites a cost the shop has already typed.
 */
export function suggestedPanelKit(panel) {
  const id = String(panel);
  if (id === 'exposed') {
    return { hoursPerSquare: 1.6, panelPerSquare: 195, wastePct: 8, seamerHours: 0, seamerFee: 0 };
  }
  if (id === 'snap-lock') {
    return { hoursPerSquare: 2.4, panelPerSquare: 355, wastePct: 10, seamerHours: 0, seamerFee: 0 };
  }
  if (id === 'mechanical-lock') {
    return { hoursPerSquare: 3.2, panelPerSquare: 445, wastePct: 12, seamerHours: 5, seamerFee: 375 };
  }
  throw new Error('Unknown panel');
}

/**
 * Starting tear-off hours and dumpster dollars per roof square.
 */
export function suggestedTearOffKit(tearoff) {
  const id = String(tearoff);
  if (id === 'overlay') return { hoursPerSquare: 0, dumpsterPerSquare: 0 };
  if (id === 'tear-off') return { hoursPerSquare: 0.85, dumpsterPerSquare: 22 };
  throw new Error('Unknown tear-off');
}

/**
 * Extra hours per roof square for height. A two-story 10/12 is not
 * "the same squares plus a ladder."
 */
export function suggestedStoryKit(stories) {
  const id = String(stories);
  if (id === '1') return { extraHoursPerSquare: 0 };
  if (id === '2') return { extraHoursPerSquare: 0.4 };
  if (id === '3') return { extraHoursPerSquare: 0.85 };
  throw new Error('Unknown stories');
}

/**
 * Price a metal-roof job from the squares the coupon sees and the
 * panel type, tear-off, stories, and trim it cannot see.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const lengthFeet = number(input.lengthFeet ?? 0, 'Length (feet)', { allowZero: false });
  const widthFeet = number(input.widthFeet ?? 0, 'Width (feet)', { allowZero: false });

  const panel = String(input.panel ?? 'exposed');
  if (!PANEL_PRESETS.some((item) => item.id === panel)) {
    throw new Error('Unknown panel');
  }
  const pitch = String(input.pitch ?? '4');
  if (!PITCH_PRESETS.some((item) => item.id === pitch)) {
    throw new Error('Unknown pitch');
  }
  const tearoff = String(input.tearoff ?? 'overlay');
  if (!TEAROFF_PRESETS.some((item) => item.id === tearoff)) {
    throw new Error('Unknown tear-off');
  }
  const stories = String(input.stories ?? '1');
  if (!STORY_PRESETS.some((item) => item.id === stories)) {
    throw new Error('Unknown stories');
  }

  const includeIceAndWater = flag(input.includeIceAndWater);
  const includePermit = flag(input.includePermit);

  const planSf = lengthFeet * widthFeet;
  const pitchMultiplier = number(input.pitchMultiplier ?? 0, 'Pitch multiplier', { allowZero: false });
  const roofSf = number(input.roofSf ?? 0, 'Roof square feet');
  const squares = number(input.squares ?? 0, 'Roof squares');
  const wastePct = number(input.wastePct ?? 0, 'Waste (%)');
  const hipValleyWastePct = number(input.hipValleyWastePct ?? 0, 'Hip / valley waste (%)');
  const panelSquares = number(input.panelSquares ?? 0, 'Panel squares');
  const tearOffSquares = number(input.tearOffSquares ?? 0, 'Tear-off squares');

  const ridgeLf = number(input.ridgeLf ?? 0, 'Ridge (lineal feet)');
  const hipLf = number(input.hipLf ?? 0, 'Hip (lineal feet)');
  const valleyLf = number(input.valleyLf ?? 0, 'Valley (lineal feet)');
  const rakeLf = number(input.rakeLf ?? 0, 'Rake (lineal feet)');
  const eaveLf = number(input.eaveLf ?? 0, 'Eave (lineal feet)');
  const snowGuardCount = number(input.snowGuardCount ?? 0, 'Snow-guard count');
  const bootCount = number(input.bootCount ?? 0, 'Pipe-boot count');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursPerSquare = number(input.hoursPerSquare ?? 0, 'Hours per panel square');
  const extraHoursPerSquare = number(input.extraHoursPerSquare ?? 0, 'Extra hours per square for stories');
  const hoursTearoffPerSquare = number(input.hoursTearoffPerSquare ?? 0, 'Hours per tear-off square');
  const hoursPerTrimLf = number(input.hoursPerTrimLf ?? 0, 'Hours per lineal foot of trim');
  const hoursPerSnowGuard = number(input.hoursPerSnowGuard ?? 0, 'Hours per snow guard');
  const hoursPerBoot = number(input.hoursPerBoot ?? 0, 'Hours per pipe boot');
  const seamerHours = number(input.seamerHours ?? 0, 'Seamer hours');
  const hoursIceAndWater = number(input.hoursIceAndWater ?? 0, 'Ice-and-water hours');
  const siteHours = number(input.siteHours ?? 0, 'Travel / site hours');

  const panelPerSquare = number(input.panelPerSquare ?? 0, 'Panels per square');
  const underlayPerSquare = number(input.underlayPerSquare ?? 0, 'Underlayment per square');
  const iceAndWaterPerSquare = number(input.iceAndWaterPerSquare ?? 0, 'Ice-and-water per square');
  const ridgePerLf = number(input.ridgePerLf ?? 0, 'Ridge per lineal foot');
  const hipPerLf = number(input.hipPerLf ?? 0, 'Hip per lineal foot');
  const valleyPerLf = number(input.valleyPerLf ?? 0, 'Valley per lineal foot');
  const rakePerLf = number(input.rakePerLf ?? 0, 'Rake per lineal foot');
  const eavePerLf = number(input.eavePerLf ?? 0, 'Eave per lineal foot');
  const snowGuardEach = number(input.snowGuardEach ?? 0, 'Cost per snow guard');
  const bootEach = number(input.bootEach ?? 0, 'Cost per pipe boot');
  const fastenerLump = number(input.fastenerLump ?? 0, 'Fasteners / clips');
  const dumpsterPerSquare = number(input.dumpsterPerSquare ?? 0, 'Dumpster per tear-off square');
  const seamerFee = number(input.seamerFee ?? 0, 'Seamer rental');
  const mobilizationFee = number(input.mobilizationFee ?? 0, 'Mobilization');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const tripHours = hoursTrip;
  const panelHours = panelSquares * hoursPerSquare;
  const storyHours = squares * extraHoursPerSquare;
  const tearOffHours = tearOffSquares * hoursTearoffPerSquare;
  const trimLf = ridgeLf + hipLf + valleyLf + rakeLf + eaveLf;
  const trimHours = trimLf * hoursPerTrimLf;
  const snowHours = snowGuardCount * hoursPerSnowGuard;
  const bootHours = bootCount * hoursPerBoot;
  const seamerLaborHours = panel === 'mechanical-lock' ? seamerHours : 0;
  const iceHours = includeIceAndWater ? hoursIceAndWater : 0;
  const travelHours = siteHours;
  const totalHours = tripHours + panelHours + storyHours + tearOffHours + trimHours
    + snowHours + bootHours + seamerLaborHours + iceHours + travelHours;

  const laborCost = totalHours * loadedWage;
  const panelMaterial = panelSquares * panelPerSquare;
  const underlayMaterial = squares * underlayPerSquare;
  const iceMaterial = includeIceAndWater ? squares * iceAndWaterPerSquare : 0;
  const ridgeMaterial = ridgeLf * ridgePerLf;
  const hipMaterial = hipLf * hipPerLf;
  const valleyMaterial = valleyLf * valleyPerLf;
  const rakeMaterial = rakeLf * rakePerLf;
  const eaveMaterial = eaveLf * eavePerLf;
  const snowMaterial = snowGuardCount * snowGuardEach;
  const bootMaterial = bootCount * bootEach;
  const dumpsterMaterial = tearOffSquares * dumpsterPerSquare;
  const materialCost = panelMaterial + underlayMaterial + iceMaterial
    + ridgeMaterial + hipMaterial + valleyMaterial + rakeMaterial + eaveMaterial
    + snowMaterial + bootMaterial + fastenerLump + dumpsterMaterial;
  const seamerMaterial = panel === 'mechanical-lock' ? seamerFee : 0;
  const mobilizationMaterial = mobilizationFee;
  const permitMaterial = includePermit ? permitFee : 0;
  const softCost = travelAndEquipment + mobilizationMaterial + permitMaterial + seamerMaterial;
  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);
  const hourShare = (amount) => (totalHours === 0 ? 0 : amount / totalHours * 100);
  const panelDirect = panelHours * loadedWage + panelMaterial;
  const metalDirect = panelDirect + trimHours * loadedWage
    + ridgeMaterial + hipMaterial + valleyMaterial + rakeMaterial + eaveMaterial
    + snowHours * loadedWage + snowMaterial + bootHours * loadedWage + bootMaterial
    + seamerLaborHours * loadedWage + seamerMaterial;

  return {
    panel,
    pitch,
    tearoff,
    stories,
    lengthFeet,
    widthFeet,
    pitchMultiplier,
    planSf,
    roofSf,
    squares,
    wastePct,
    hipValleyWastePct,
    panelSquares,
    tearOffSquares,
    ridgeLf,
    hipLf,
    valleyLf,
    rakeLf,
    eaveLf,
    trimLf,
    snowGuardCount,
    bootCount,
    includeIceAndWater,
    includePermit,
    loadedWage,
    tripHours,
    panelHours,
    storyHours,
    tearOffHours,
    trimHours,
    snowHours,
    bootHours,
    seamerLaborHours,
    iceHours,
    travelHours,
    totalHours,
    laborCost,
    panelMaterial,
    underlayMaterial,
    iceMaterial,
    ridgeMaterial,
    hipMaterial,
    valleyMaterial,
    rakeMaterial,
    eaveMaterial,
    snowMaterial,
    bootMaterial,
    fastenerLump,
    dumpsterMaterial,
    materialCost,
    seamerMaterial,
    travelAndEquipment,
    mobilizationMaterial,
    permitMaterial,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSquare: squares === 0 ? null : price / squares,
    pricePerSf: roofSf === 0 ? null : price / roofSf,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    panelShareOfDirect: directCost === 0 ? 0 : panelDirect / directCost * 100,
    metalShareOfDirect: directCost === 0 ? 0 : metalDirect / directCost * 100,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(tripHours),
      panels: hourShare(panelHours),
      stories: hourShare(storyHours),
      tearoff: hourShare(tearOffHours),
      trim: hourShare(trimHours),
      snow: hourShare(snowHours),
      boots: hourShare(bootHours),
      seamer: hourShare(seamerLaborHours),
      ice: hourShare(iceHours),
      site: hourShare(travelHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the shop can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this is
 * the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Metal roof') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const panel = PANEL_PRESETS.find((item) => item.id === result.panel)?.label ?? result.panel;
  const pitch = PITCH_PRESETS.find((item) => item.id === result.pitch)?.label ?? result.pitch;
  const tearoff = TEAROFF_PRESETS.find((item) => item.id === result.tearoff)?.label ?? result.tearoff;
  const stories = STORY_PRESETS.find((item) => item.id === result.stories)?.label ?? result.stories;
  const extras = [
    `${result.lengthFeet}×${result.widthFeet} ft plan (${result.planSf.toFixed(0)} sf)`,
    `${result.roofSf.toFixed(0)} sf roof / ${result.squares.toFixed(2)} squares after ${pitch}`,
    `${result.panelSquares.toFixed(2)} panel squares after ${result.wastePct + result.hipValleyWastePct}% waste (${panel})`,
    result.tearOffSquares ? `${result.tearOffSquares.toFixed(2)} squares tear-off` : 'overlay — no tear-off this bid',
    `${result.trimLf.toFixed(0)} lf trim (ridge ${result.ridgeLf}, hip ${result.hipLf}, valley ${result.valleyLf}, rake ${result.rakeLf}, eave ${result.eaveLf})`,
    `${result.snowGuardCount} snow guard${result.snowGuardCount === 1 ? '' : 's'}`,
    `${result.bootCount} pipe boot${result.bootCount === 1 ? '' : 's'}`,
    result.includeIceAndWater ? 'ice-and-water included' : 'no ice-and-water this bid',
    result.includePermit ? 'permit allowance included' : 'no permit allowance this bid',
  ];
  return [
    'METAL ROOF / STANDING SEAM BID',
    '',
    `Proposed metal-roof price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${panel}; ${pitch}; ${stories}`,
    `Install: ${tearoff}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    result.pricePerSquare === null ? null : `Effective: ${money(result.pricePerSquare)} / square`,
    '',
    'SCOPE BASIS',
    `- ${panel}; ${pitch}; ${stories}; ${tearoff}`,
    `- ${result.lengthFeet}×${result.widthFeet} ft = ${result.planSf.toFixed(0)} sf plan, ${result.squares.toFixed(2)} squares, ${result.panelSquares.toFixed(2)} panel squares`,
    `- Setup: ${result.tripHours.toFixed(1)} h; panels: ${result.panelHours.toFixed(1)} h; stories: ${result.storyHours.toFixed(1)} h; tear-off: ${result.tearOffHours.toFixed(1)} h; trim: ${result.trimHours.toFixed(1)} h; snow guards: ${result.snowHours.toFixed(1)} h; boots: ${result.bootHours.toFixed(1)} h; seamer: ${result.seamerLaborHours.toFixed(1)} h`,
    `- ${extras.join('; ')}`,
    '',
    'This is a draft for review. Confirm the squares, panel, tear-off, stories, trim, extras, permit, and all pricing before sending. It is not a construction specification, a building-code opinion, a permit, or an engineering stamp.',
  ].filter((line) => line !== null).join('\n');
}
