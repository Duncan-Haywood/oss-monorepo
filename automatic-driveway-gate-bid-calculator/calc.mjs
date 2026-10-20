// Pure bid arithmetic for automatic driveway gate installs: single swing,
// dual swing, and slide. No network, no state: every opening, leaf, column,
// loop, wage, and operator kit is an input, so the result stays a transparent
// calculation the shop can check against their own invoices rather than a
// claim about what any gate "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$4,500 automatic gate" Facebook special treats a 12-foot single aluminum
// swing on existing posts as the same job as a 16-foot dual steel swing with
// masonry columns, two vehicle loops, a keypad, and a solar kit. Homeowners
// (and a lot of estimator sheets) count the same kind of number. Operators
// scale with leaf count. Loops, columns, and power do not live in a
// per-opening special. Matching a cheap single-swing kit on a dual masonry
// job is how a sold gate becomes a two-day loss after the first loop sawcut.
//
// Distinct from *fence* bidding (posts, panels, and walk gates as a barrier)
// and from *garage-door* operators (torsion springs and a header). This prices
// the motorized driveway operator, UL 325 safety, access, and the columns
// that hold the leaves.

export const STYLE_PRESETS = Object.freeze([
  { id: 'swing-single', label: 'Single swing' },
  { id: 'swing-dual', label: 'Dual swing' },
  { id: 'slide', label: 'Slide' },
]);

export const MATERIAL_PRESETS = Object.freeze([
  { id: 'aluminum', label: 'Aluminum', weightFactor: 1 },
  { id: 'steel', label: 'Steel', weightFactor: 1.35 },
  { id: 'wood', label: 'Wood', weightFactor: 1.25 },
  { id: 'vinyl', label: 'Vinyl', weightFactor: 0.95 },
  { id: 'chain-link', label: 'Chain-link', weightFactor: 0.7 },
]);

export const COLUMN_PRESETS = Object.freeze([
  { id: 'existing', label: 'Existing posts' },
  { id: 'steel-posts', label: 'New steel posts' },
  { id: 'masonry', label: 'New masonry columns' },
]);

export const POWER_PRESETS = Object.freeze([
  { id: 'ac', label: 'AC trench and conduit' },
  { id: 'solar', label: 'Solar kit' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '12 ft single aluminum swing, existing posts, AC (the cheap special)',
    style: 'swing-single',
    openingWidthFt: 12,
    leafHeightFt: 5,
    material: 'aluminum',
    columnType: 'existing',
    power: 'ac',
    loops: 0,
    extraRemotes: 2,
    keypad: false,
    batteryBackup: false,
    edgeSensors: false,
  },
  {
    label: '16 ft dual steel swing, masonry, 2 loops, keypad, solar (where the special loses)',
    style: 'swing-dual',
    openingWidthFt: 16,
    leafHeightFt: 6,
    material: 'steel',
    columnType: 'masonry',
    power: 'solar',
    loops: 2,
    extraRemotes: 4,
    keypad: true,
    batteryBackup: true,
    edgeSensors: true,
  },
  {
    label: '18 ft aluminum slide, steel posts, AC, 1 loop',
    style: 'slide',
    openingWidthFt: 18,
    leafHeightFt: 5,
    material: 'aluminum',
    columnType: 'steel-posts',
    power: 'ac',
    loops: 1,
    extraRemotes: 2,
    keypad: false,
    batteryBackup: false,
    edgeSensors: false,
  },
  {
    label: '14 ft single wood swing, steel posts, AC, 1 loop, battery',
    style: 'swing-single',
    openingWidthFt: 14,
    leafHeightFt: 6,
    material: 'wood',
    columnType: 'steel-posts',
    power: 'ac',
    loops: 1,
    extraRemotes: 2,
    keypad: true,
    batteryBackup: true,
    edgeSensors: false,
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
 * Operators on the job. Dual swing is two operators (or one dual kit
 * billed as two). Single swing and slide are one.
 */
export function operatorCount(style) {
  requirePreset(STYLE_PRESETS, style, 'gate style');
  return style === 'swing-dual' ? 2 : 1;
}

/**
 * New columns / posts to set. Existing hardware is zero. Dual swing
 * needs two hinge posts plus a catch; single and slide need two.
 */
export function columnCount(style, columnType) {
  requirePreset(STYLE_PRESETS, style, 'gate style');
  requirePreset(COLUMN_PRESETS, columnType, 'column type');
  if (columnType === 'existing') return 0;
  return style === 'swing-dual' ? 3 : 2;
}

/**
 * Material weight factor applied to leaf dollars and hang hours.
 * Steel and wood operators work harder than aluminum or chain-link.
 */
export function materialWeight(material) {
  return requirePreset(MATERIAL_PRESETS, material, 'gate material').weightFactor;
}

/**
 * Starting operator, leaf, and safety rates from the gate style.
 * These are ballpark shop figures, not a catalog. Picking a style
 * never overwrites a rate the shop has already typed.
 */
export function suggestedStyleKit(style) {
  const id = String(style);
  if (id === 'swing-single') {
    return {
      hoursTrip: 1.5,
      hoursPerOperator: 3.5,
      hoursPerLfGate: 0.35,
      hoursPerLoop: 1.25,
      hoursAccess: 1,
      siteHours: 0.75,
      operatorEach: 1450,
      gatePerLf: 85,
      loopEach: 185,
      keypadKit: 320,
      batteryKit: 240,
      remoteEach: 45,
      photoEyeKit: 165,
      edgeKit: 210,
    };
  }
  if (id === 'swing-dual') {
    return {
      hoursTrip: 1.75,
      hoursPerOperator: 4,
      hoursPerLfGate: 0.4,
      hoursPerLoop: 1.25,
      hoursAccess: 1.25,
      siteHours: 1,
      operatorEach: 1350,
      gatePerLf: 90,
      loopEach: 185,
      keypadKit: 320,
      batteryKit: 280,
      remoteEach: 45,
      photoEyeKit: 195,
      edgeKit: 280,
    };
  }
  if (id === 'slide') {
    return {
      hoursTrip: 1.75,
      hoursPerOperator: 4.5,
      hoursPerLfGate: 0.45,
      hoursPerLoop: 1.4,
      hoursAccess: 1,
      siteHours: 1,
      operatorEach: 1850,
      gatePerLf: 95,
      loopEach: 185,
      keypadKit: 320,
      batteryKit: 240,
      remoteEach: 45,
      photoEyeKit: 165,
      edgeKit: 210,
    };
  }
  throw new Error('Unknown gate style');
}

/**
 * Starting column hours and hardware from the post type.
 */
export function suggestedColumnKit(columnType) {
  const id = String(columnType);
  if (id === 'existing') {
    return { hoursPerColumn: 0, columnEach: 0 };
  }
  if (id === 'steel-posts') {
    return { hoursPerColumn: 1.5, columnEach: 220 };
  }
  if (id === 'masonry') {
    return { hoursPerColumn: 6, columnEach: 950 };
  }
  throw new Error('Unknown column type');
}

/**
 * Starting power hours and hardware from AC trench versus solar.
 */
export function suggestedPowerKit(power) {
  const id = String(power);
  if (id === 'ac') {
    return { hoursTrench: 3, hoursSolar: 0, solarKit: 0, trenchMaterial: 185 };
  }
  if (id === 'solar') {
    return { hoursTrench: 0, hoursSolar: 1.75, solarKit: 780, trenchMaterial: 0 };
  }
  throw new Error('Unknown power type');
}

/**
 * Price a single-swing, dual-swing, or slide driveway gate from the
 * opening, material, columns, power, loops, access, and the contractor's
 * own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const openingWidthFt = number(input.openingWidthFt ?? 0, 'Opening width', { allowZero: false });
  const leafHeightFt = number(input.leafHeightFt ?? 5, 'Leaf height', { allowZero: false });
  const loops = number(input.loops ?? 0, 'Vehicle loops');
  const extraRemotes = number(input.extraRemotes ?? 0, 'Extra remotes');

  const style = String(input.style ?? 'swing-single');
  requirePreset(STYLE_PRESETS, style, 'gate style');
  const material = String(input.material ?? 'aluminum');
  const weight = materialWeight(material);
  const columnType = String(input.columnType ?? 'existing');
  requirePreset(COLUMN_PRESETS, columnType, 'column type');
  const power = String(input.power ?? 'ac');
  requirePreset(POWER_PRESETS, power, 'power type');

  const keypad = flag(input.keypad);
  const batteryBackup = flag(input.batteryBackup);
  const edgeSensors = flag(input.edgeSensors);

  const operators = operatorCount(style);
  const columns = columnCount(style, columnType);
  const gateLf = openingWidthFt;

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / move-in');
  const hoursPerOperator = number(input.hoursPerOperator ?? 0, 'Hours per operator');
  const hoursPerLfGate = number(input.hoursPerLfGate ?? 0, 'Hours per lineal foot of gate');
  const hoursPerColumn = number(input.hoursPerColumn ?? 0, 'Hours per column');
  const hoursPerLoop = number(input.hoursPerLoop ?? 0, 'Hours per vehicle loop');
  const hoursTrench = number(input.hoursTrench ?? 0, 'Hours to trench AC');
  const hoursSolar = number(input.hoursSolar ?? 0, 'Hours to set solar');
  const hoursAccess = number(input.hoursAccess ?? 0, 'Hours for keypad / access');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const operatorEach = number(input.operatorEach ?? 0, 'Operator kit each');
  const gatePerLf = number(input.gatePerLf ?? 0, 'Gate leaf per lineal foot');
  const columnEach = number(input.columnEach ?? 0, 'Column / post each');
  const loopEach = number(input.loopEach ?? 0, 'Vehicle loop each');
  const keypadKit = number(input.keypadKit ?? 0, 'Keypad kit');
  const solarKit = number(input.solarKit ?? 0, 'Solar kit');
  const batteryKit = number(input.batteryKit ?? 0, 'Battery backup kit');
  const remoteEach = number(input.remoteEach ?? 0, 'Remote each');
  const photoEyeKit = number(input.photoEyeKit ?? 0, 'Photo-eye kit');
  const edgeKit = number(input.edgeKit ?? 0, 'Edge-sensor kit');
  const trenchMaterial = number(input.trenchMaterial ?? 0, 'Trench and conduit');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const hoursOperators = operators * hoursPerOperator;
  const hoursGate = gateLf * hoursPerLfGate * weight;
  const hoursColumns = columns * hoursPerColumn;
  const hoursLoops = loops * hoursPerLoop;
  const hoursPower = power === 'solar' ? hoursSolar : hoursTrench;
  const hoursKeypad = keypad ? hoursAccess : 0;
  const hoursMethod = hoursOperators + hoursGate + hoursColumns + hoursLoops + hoursPower + hoursKeypad;
  const totalHours = hoursTrip + hoursMethod + siteHours;
  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const operatorMaterial = operators * operatorEach;
  const gateMaterial = gateLf * gatePerLf * weight;
  const columnMaterial = columns * columnEach;
  const loopMaterial = loops * loopEach;
  const keypadMaterial = keypad ? keypadKit : 0;
  const solarMaterial = power === 'solar' ? solarKit : 0;
  const trenchCost = power === 'ac' ? trenchMaterial : 0;
  const batteryMaterial = batteryBackup ? batteryKit : 0;
  const remoteMaterial = extraRemotes * remoteEach;
  const photoEyeMaterial = photoEyeKit;
  const edgeMaterial = edgeSensors ? edgeKit : 0;
  const permitMaterial = permitFee;
  const extraHardware = loopMaterial + keypadMaterial + solarMaterial + trenchCost
    + batteryMaterial + remoteMaterial + photoEyeMaterial + edgeMaterial + permitMaterial;
  const materialCost = operatorMaterial + gateMaterial + columnMaterial + extraHardware;
  const softCost = travelAndEquipment;

  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);
  const hourShare = (amount) => (totalHours === 0 ? 0 : amount / totalHours * 100);
  const extraCost = columnMaterial + extraHardware
    + (hoursColumns + hoursLoops + hoursPower + hoursKeypad) * loadedWage;

  return {
    style,
    material,
    columnType,
    power,
    openingWidthFt,
    leafHeightFt,
    loops,
    extraRemotes,
    keypad,
    batteryBackup,
    edgeSensors,
    operators,
    columns,
    gateLf,
    weight,
    loadedWage,
    hoursTrip,
    hoursOperators,
    hoursGate,
    hoursColumns,
    hoursLoops,
    hoursPower,
    hoursKeypad,
    hoursMethod,
    siteHours,
    totalHours,
    laborCost,
    operatorMaterial,
    gateMaterial,
    columnMaterial,
    loopMaterial,
    keypadMaterial,
    solarMaterial,
    trenchCost,
    batteryMaterial,
    remoteMaterial,
    photoEyeMaterial,
    edgeMaterial,
    permitMaterial,
    extraHardware,
    materialCost,
    travelAndEquipment,
    softCost,
    extraCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerOpeningFt: openingWidthFt === 0 ? null : price / openingWidthFt,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      operators: costShare(operatorMaterial),
      gate: costShare(gateMaterial),
      extra: costShare(extraCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(hoursTrip),
      operators: hourShare(hoursOperators),
      gate: hourShare(hoursGate),
      columns: hourShare(hoursColumns),
      loops: hourShare(hoursLoops),
      power: hourShare(hoursPower),
      access: hourShare(hoursKeypad),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perOpeningFt: openingWidthFt === 0 ? null : proposedPrice / openingWidthFt,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same opening three ways — single swing, dual swing, slide —
 * from the suggested kits so the shop can see when masonry columns or
 * a dual operator flips the cheaper style. User-typed style rates are
 * not reused here: the comparison is apples-to-apples on the starting
 * figures. Column and power kits stay with the current job.
 */
export function compareStyles(input) {
  const columnKit = suggestedColumnKit(String(input.columnType ?? 'existing'));
  const powerKit = suggestedPowerKit(String(input.power ?? 'ac'));
  const rows = STYLE_PRESETS.map((preset) => {
    const kit = suggestedStyleKit(preset.id);
    const bid = calculateBid({
      ...input,
      style: preset.id,
      ...kit,
      ...columnKit,
      ...powerKit,
    });
    return {
      style: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerOpeningFt: bid.pricePerOpeningFt,
      operators: bid.operators,
      columns: bid.columns,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
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
 * Format a bid as a plain-text draft the shop can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this is
 * the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Automatic driveway gate') {
  const perFt = result.pricePerOpeningFt === null
    ? 'n/a'
    : `${money(result.pricePerOpeningFt)} / opening-ft`;
  const style = STYLE_PRESETS.find((item) => item.id === result.style)?.label ?? result.style;
  const material = MATERIAL_PRESETS.find((item) => item.id === result.material)?.label ?? result.material;
  const columns = COLUMN_PRESETS.find((item) => item.id === result.columnType)?.label ?? result.columnType;
  const power = POWER_PRESETS.find((item) => item.id === result.power)?.label ?? result.power;
  const access = [
    result.keypad ? 'keypad included' : 'no keypad',
    result.batteryBackup ? 'battery backup' : null,
    result.edgeSensors ? 'edge sensors' : null,
    `${result.loops} vehicle loop${result.loops === 1 ? '' : 's'}`,
    `${result.extraRemotes} extra remote${result.extraRemotes === 1 ? '' : 's'}`,
  ].filter(Boolean).join('; ');
  return [
    'AUTOMATIC DRIVEWAY GATE BID',
    '',
    `Proposed gate price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${style}`,
    `Price per opening foot: ${perFt}`,
    `Operators: ${result.operators}; new columns: ${result.columns}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.openingWidthFt} ft opening × ${result.leafHeightFt} ft ${material} leaves`,
    `- ${columns}; ${power}`,
    `- ${access}`,
    `- Operators: ${result.hoursOperators.toFixed(1)} h; leaves: ${result.hoursGate.toFixed(1)} h; columns: ${result.hoursColumns.toFixed(1)} h; loops / power / access: ${(result.hoursLoops + result.hoursPower + result.hoursKeypad).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm opening width, leaf material, columns, power, loops, access, and all pricing before sending. It is not a gate specification, a UL 325 determination, a permit, an electrical design, or an engineering stamp.',
  ].join('\n');
}
