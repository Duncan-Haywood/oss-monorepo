// Pure bid arithmetic for *building a residential pergola / patio cover*,
// not building a deck and not laying a paver patio. No network, no state:
// every span, post, shade, height, wage, and extra is an input, so the
// result stays a transparent calculation the shop can check against their
// own invoices rather than a claim about what any pergola "should" cost,
// or whether any layout is code-compliant.
//
// The method is the one the trade actually loses money on: a flat
// "$45 / sf" special treats a 10×10 open cedar frame (four 8-foot posts,
// no shade) as the same job as a 12×16 attached cover with 10-foot posts,
// slat or louvered shade, a ledger, and a fan circuit. Homeowners (and a
// lot of estimator sheets) count footprint square feet. Posts do not
// scale with that number. Shade and height never appear in it. Matching
// a cheaper special written for the open 10×10 is how a sold 12×16
// louvered cover becomes a two-day loss after the first shade bay.
//
// Distinct from a deck *build* (posts, joists, railing as a walking
// platform), a paver patio (base, edge, waste), and a fence (posts and
// gates as a barrier). This prices the pergola: post count the coupon
// cannot see, shade, height, attached ledger, extras, and the margin
// that is not in the sf special.
//
// Spans, post spacing, and shade rates shipped here are common starting
// points used on residential bids. They are not a building-code opinion,
// a permit, or an engineering stamp. Confirm the jurisdiction and a
// qualified professional before sending a price.

export const ATTACHMENT_PRESETS = Object.freeze([
  { id: 'freestanding', label: 'Freestanding' },
  { id: 'attached', label: 'Attached (ledger on the house)' },
]);

export const SHADE_PRESETS = Object.freeze([
  { id: 'open', label: 'Open frame (rafters only)' },
  { id: 'lattice', label: 'Lattice shade' },
  { id: 'slats', label: 'Shade slats' },
  { id: 'louvered', label: 'Louvered roof' },
  { id: 'polycarbonate', label: 'Polycarbonate / metal roof' },
]);

export const HEIGHT_PRESETS = Object.freeze([
  { id: '8', label: '8 ft posts' },
  { id: '10', label: '10 ft posts' },
  { id: '12', label: '12 ft posts' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '10×10 freestanding, 8 ft, open cedar (the $45/sf special)',
    attachment: 'freestanding',
    shade: 'open',
    height: '8',
    widthFeet: 10,
    depthFeet: 10,
    includeKneeBraces: false,
    includeFanCircuit: false,
    includePermit: false,
    demoExisting: false,
  },
  {
    label: '12×16 attached, 8 ft, shade slats',
    attachment: 'attached',
    shade: 'slats',
    height: '8',
    widthFeet: 16,
    depthFeet: 12,
    includeKneeBraces: true,
    includeFanCircuit: false,
    includePermit: true,
    demoExisting: false,
  },
  {
    label: '12×16 attached, 10 ft, louvered, fan circuit',
    attachment: 'attached',
    shade: 'louvered',
    height: '10',
    widthFeet: 16,
    depthFeet: 12,
    includeKneeBraces: true,
    includeFanCircuit: true,
    includePermit: true,
    demoExisting: false,
  },
  {
    label: '16×20 freestanding, 12 ft, polycarbonate, demo, permit',
    attachment: 'freestanding',
    shade: 'polycarbonate',
    height: '12',
    widthFeet: 20,
    depthFeet: 16,
    includeKneeBraces: true,
    includeFanCircuit: true,
    includePermit: true,
    demoExisting: true,
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
 * Posts along one side. A 10-foot side at 8-foot spacing is two posts
 * (the corners). A 16-foot side is three. Floor-plus-one, not ceil,
 * because a 12-foot beam is a common span — ceil would invent a third
 * post the shop did not plan to set.
 */
export function postsAlong(dimensionFeet, postSpacingFeet) {
  const dim = number(dimensionFeet, 'Span (feet)', { allowZero: false });
  const spacing = number(postSpacingFeet, 'Post spacing (feet)', { allowZero: false });
  return Math.max(2, Math.floor(dim / spacing) + 1);
}

/**
 * Post count the "$45 / sf" special cannot see. A 10×10 freestanding
 * frame is four posts. A 12×16 freestanding frame at the same spacing
 * is six. An attached 12×16 drops the house-side row for a ledger —
 * three posts, not six, but the ledger and flashing are not free.
 */
export function suggestedPostCount(widthFeet, depthFeet, postSpacingFeet, attachment) {
  const alongWidth = postsAlong(widthFeet, postSpacingFeet);
  const alongDepth = postsAlong(depthFeet, postSpacingFeet);
  const id = String(attachment);
  if (id !== 'freestanding' && id !== 'attached') throw new Error('Unknown attachment');
  if (id === 'attached') return alongWidth * Math.max(1, alongDepth - 1);
  return alongWidth * alongDepth;
}

/**
 * Rafters spaced along the house (width), spanning the projection.
 * 24-inch centers on a 10-foot width is six sticks; on a 16-foot
 * width it is nine. The coupon still says "100 sf" or "192 sf."
 */
export function suggestedRafterCount(widthFeet, rafterSpacingInches) {
  const width = number(widthFeet, 'Width (feet)', { allowZero: false });
  const spacing = number(rafterSpacingInches, 'Rafter spacing (inches)', { allowZero: false });
  return Math.floor((width * 12) / spacing) + 1;
}

/**
 * Beam lineal feet: one beam per post-row, each the width of the
 * structure. Attached work replaces the house-side row with a ledger,
 * so that row is not counted as beam.
 */
export function suggestedBeamLf(widthFeet, depthFeet, postSpacingFeet, attachment) {
  const width = number(widthFeet, 'Width (feet)', { allowZero: false });
  const rows = postsAlong(depthFeet, postSpacingFeet);
  const id = String(attachment);
  if (id !== 'freestanding' && id !== 'attached') throw new Error('Unknown attachment');
  const beamRows = id === 'attached' ? Math.max(1, rows - 1) : rows;
  return width * beamRows;
}

/**
 * Ledger lineal feet. Zero on a freestanding frame; the house width
 * on an attached one. Flashing rides with this number.
 */
export function suggestedLedgerLf(widthFeet, attachment) {
  const width = number(widthFeet, 'Width (feet)', { allowZero: false });
  const id = String(attachment);
  if (id !== 'freestanding' && id !== 'attached') throw new Error('Unknown attachment');
  return id === 'attached' ? width : 0;
}

/**
 * Two knee braces per post is the common starting kit. Editable — a
 * decorative kit or a short projection may use none.
 */
export function suggestedKneeBraceCount(postCount, includeKneeBraces) {
  const posts = number(postCount, 'Post count');
  return flag(includeKneeBraces) ? posts * 2 : 0;
}

/**
 * Starting hours-per-100-sf and material-per-sf for the shade layer.
 * Open frame is zero: the rafters already cover that work. Picking a
 * shade never overwrites a cost the shop has already typed.
 */
export function suggestedShadeKit(shade) {
  const id = String(shade);
  if (id === 'open') return { hoursPer100Sf: 0, shadePerSf: 0 };
  if (id === 'lattice') return { hoursPer100Sf: 1.4, shadePerSf: 4.5 };
  if (id === 'slats') return { hoursPer100Sf: 1.8, shadePerSf: 5.5 };
  if (id === 'louvered') return { hoursPer100Sf: 3.2, shadePerSf: 18 };
  if (id === 'polycarbonate') return { hoursPer100Sf: 2.4, shadePerSf: 9 };
  throw new Error('Unknown shade');
}

/**
 * Starting post cost and extra hours per post for the three common
 * heights. 12-foot posts are not "the same job plus two feet" — they
 * are a ladder, a second pair of hands, and a heavier stick.
 */
export function suggestedHeightKit(height) {
  const id = String(height);
  if (id === '8') return { postEach: 85, extraHoursPerPost: 0 };
  if (id === '10') return { postEach: 110, extraHoursPerPost: 0.15 };
  if (id === '12') return { postEach: 145, extraHoursPerPost: 0.35 };
  throw new Error('Unknown height');
}

/**
 * Price a pergola / patio-cover job from the footprint, the posts the
 * coupon cannot see, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const widthFeet = number(input.widthFeet ?? 0, 'Width (feet)', { allowZero: false });
  const depthFeet = number(input.depthFeet ?? 0, 'Depth (feet)', { allowZero: false });
  const postSpacingFeet = number(input.postSpacingFeet ?? 0, 'Post spacing (feet)', { allowZero: false });
  const rafterSpacingInches = number(
    input.rafterSpacingInches ?? 0,
    'Rafter spacing (inches)',
    { allowZero: false },
  );

  const attachment = String(input.attachment ?? 'freestanding');
  if (!ATTACHMENT_PRESETS.some((item) => item.id === attachment)) {
    throw new Error('Unknown attachment');
  }
  const shade = String(input.shade ?? 'open');
  if (!SHADE_PRESETS.some((item) => item.id === shade)) {
    throw new Error('Unknown shade');
  }
  const height = String(input.height ?? '8');
  if (!HEIGHT_PRESETS.some((item) => item.id === height)) {
    throw new Error('Unknown height');
  }

  const includeKneeBraces = flag(input.includeKneeBraces);
  const includeFanCircuit = flag(input.includeFanCircuit);
  const includePermit = flag(input.includePermit);
  const demoExisting = flag(input.demoExisting);

  const footprintSf = widthFeet * depthFeet;
  const shadeSf = shade === 'open' ? 0 : footprintSf;

  const postCount = number(input.postCount ?? 0, 'Post count');
  const rafterCount = number(input.rafterCount ?? 0, 'Rafter count');
  const beamLf = number(input.beamLf ?? 0, 'Beam lineal feet');
  const ledgerLf = number(input.ledgerLf ?? 0, 'Ledger lineal feet');
  const kneeBraceCount = number(input.kneeBraceCount ?? 0, 'Knee-brace count');
  const footingCount = number(input.footingCount ?? 0, 'Footing count');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursPerPost = number(input.hoursPerPost ?? 0, 'Hours per post');
  const hoursPer100SfShade = number(input.hoursPer100SfShade ?? 0, 'Hours per 100 sf of shade');
  const hoursPerRafter = number(input.hoursPerRafter ?? 0, 'Hours per rafter');
  const hoursPerBeamLf = number(input.hoursPerBeamLf ?? 0, 'Hours per lineal foot of beam');
  const hoursLedger = number(input.hoursLedger ?? 0, 'Hours for the ledger');
  const hoursKneeBrace = number(input.hoursKneeBrace ?? 0, 'Hours per knee brace');
  const hoursFan = number(input.hoursFan ?? 0, 'Hours for the fan circuit');
  const hoursDemo = number(input.hoursDemo ?? 0, 'Hours to demo the existing structure');
  const hoursSite = number(input.hoursSite ?? 0, 'Site / grade hours');
  const siteHours = number(input.siteHours ?? 0, 'Travel / site hours');
  const extraHoursPerPost = number(input.extraHoursPerPost ?? 0, 'Extra hours per post for height');

  const postEach = number(input.postEach ?? 0, 'Cost per post');
  const beamPerLf = number(input.beamPerLf ?? 0, 'Beam per lineal foot');
  const rafterEach = number(input.rafterEach ?? 0, 'Cost per rafter');
  const shadePerSf = number(input.shadePerSf ?? 0, 'Shade per sf');
  const footingEach = number(input.footingEach ?? 0, 'Cost per footing');
  const ledgerPerLf = number(input.ledgerPerLf ?? 0, 'Ledger per lineal foot');
  const hardwareLump = number(input.hardwareLump ?? 0, 'Hardware / hangers');
  const kneeBraceEach = number(input.kneeBraceEach ?? 0, 'Cost per knee brace');
  const fanCircuitFee = number(input.fanCircuitFee ?? 0, 'Fan-circuit fee');
  const demoFee = number(input.demoFee ?? 0, 'Demo fee');
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
  const postHours = postCount * (hoursPerPost + extraHoursPerPost);
  const shadeHours = shadeSf * hoursPer100SfShade / 100;
  const rafterHours = rafterCount * hoursPerRafter;
  const beamHours = beamLf * hoursPerBeamLf;
  const ledgerHours = attachment === 'attached' ? hoursLedger : 0;
  const kneeHours = kneeBraceCount * hoursKneeBrace;
  const fanHours = includeFanCircuit ? hoursFan : 0;
  const demoHours = demoExisting ? hoursDemo : 0;
  const gradeHours = hoursSite;
  const travelHours = siteHours;
  const totalHours = tripHours + postHours + shadeHours + rafterHours + beamHours
    + ledgerHours + kneeHours + fanHours + demoHours + gradeHours + travelHours;

  const laborCost = totalHours * loadedWage;
  const postMaterial = postCount * postEach;
  const beamMaterial = beamLf * beamPerLf;
  const rafterMaterial = rafterCount * rafterEach;
  const shadeMaterial = shadeSf * shadePerSf;
  const footingMaterial = footingCount * footingEach;
  const ledgerMaterial = attachment === 'attached' ? ledgerLf * ledgerPerLf : 0;
  const kneeMaterial = kneeBraceCount * kneeBraceEach;
  const demoMaterial = demoExisting ? demoFee : 0;
  const fanMaterial = includeFanCircuit ? fanCircuitFee : 0;
  const materialCost = postMaterial + beamMaterial + rafterMaterial + shadeMaterial
    + footingMaterial + ledgerMaterial + hardwareLump + kneeMaterial + demoMaterial;
  const mobilizationMaterial = mobilizationFee;
  const permitMaterial = includePermit ? permitFee : 0;
  const softCost = travelAndEquipment + mobilizationMaterial + permitMaterial + fanMaterial;
  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);
  const hourShare = (amount) => (totalHours === 0 ? 0 : amount / totalHours * 100);
  const shadeDirect = shadeHours * loadedWage + shadeMaterial;

  return {
    attachment,
    shade,
    height,
    widthFeet,
    depthFeet,
    postSpacingFeet,
    rafterSpacingInches,
    footprintSf,
    shadeSf,
    postCount,
    rafterCount,
    beamLf,
    ledgerLf: attachment === 'attached' ? ledgerLf : 0,
    kneeBraceCount,
    footingCount,
    includeKneeBraces,
    includeFanCircuit,
    includePermit,
    demoExisting,
    loadedWage,
    tripHours,
    postHours,
    shadeHours,
    rafterHours,
    beamHours,
    ledgerHours,
    kneeHours,
    fanHours,
    demoHours,
    gradeHours,
    travelHours,
    totalHours,
    laborCost,
    postMaterial,
    beamMaterial,
    rafterMaterial,
    shadeMaterial,
    footingMaterial,
    ledgerMaterial,
    hardwareLump,
    kneeMaterial,
    demoMaterial,
    fanMaterial,
    materialCost,
    travelAndEquipment,
    mobilizationMaterial,
    permitMaterial,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSf: footprintSf === 0 ? null : price / footprintSf,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shadeShareOfDirect: directCost === 0 ? 0 : shadeDirect / directCost * 100,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(tripHours),
      posts: hourShare(postHours),
      shade: hourShare(shadeHours),
      rafters: hourShare(rafterHours),
      beams: hourShare(beamHours),
      ledger: hourShare(ledgerHours),
      knees: hourShare(kneeHours),
      fan: hourShare(fanHours),
      demo: hourShare(demoHours),
      grade: hourShare(gradeHours),
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
export function formatBidSummary(result, jobLabel = 'Pergola / patio cover') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const attachment = ATTACHMENT_PRESETS.find((item) => item.id === result.attachment)?.label ?? result.attachment;
  const shade = SHADE_PRESETS.find((item) => item.id === result.shade)?.label ?? result.shade;
  const height = HEIGHT_PRESETS.find((item) => item.id === result.height)?.label ?? result.height;
  const extras = [
    `${result.widthFeet}×${result.depthFeet} ft footprint (${result.footprintSf.toFixed(0)} sf)`,
    `${result.postCount} posts; ${result.footingCount} footings`,
    `${result.rafterCount} rafters; ${result.beamLf.toFixed(0)} lf of beam`,
    result.ledgerLf ? `${result.ledgerLf.toFixed(0)} lf ledger` : 'no ledger this bid',
    result.shadeSf ? `${result.shadeSf.toFixed(0)} sf shade (${shade})` : 'open frame — no shade layer',
    result.kneeBraceCount ? `${result.kneeBraceCount} knee braces` : 'no knee braces this bid',
    result.includeFanCircuit ? 'fan circuit included' : 'no fan circuit this bid',
    result.demoExisting ? 'existing-structure demo included' : 'no demo this bid',
    result.includePermit ? 'permit allowance included' : 'no permit allowance this bid',
  ];
  return [
    'PERGOLA / PATIO COVER BID',
    '',
    `Proposed pergola price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${attachment}; ${height}`,
    `Shade: ${shade}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    result.pricePerSf === null ? null : `Effective: ${money(result.pricePerSf)} / sf of footprint`,
    '',
    'SCOPE BASIS',
    `- ${attachment}; ${height}; ${shade}`,
    `- ${result.widthFeet}×${result.depthFeet} ft = ${result.footprintSf.toFixed(0)} sf footprint`,
    `- Setup: ${result.tripHours.toFixed(1)} h; posts: ${result.postHours.toFixed(1)} h; shade: ${result.shadeHours.toFixed(1)} h; rafters: ${result.rafterHours.toFixed(1)} h; beams: ${result.beamHours.toFixed(1)} h; ledger: ${result.ledgerHours.toFixed(1)} h`,
    `- ${extras.join('; ')}`,
    '',
    'This is a draft for review. Confirm the spans, posts, shade, height, attachment, extras, permit, and all pricing before sending. It is not a construction specification, a building-code opinion, a permit, or an engineering stamp.',
  ].filter((line) => line !== null).join('\n');
}
