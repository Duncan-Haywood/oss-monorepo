// Pure bid arithmetic for asphalt driveway paving: overlay, mill-and-overlay,
// and full-depth replacement. No network, no state: every square foot,
// thickness, apron, failed-base patch, wage, and mix price is an input, so
// the result stays a transparent calculation the shop can check against their
// own tickets rather than a claim about what any driveway "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$3.50 a square foot" or a brochure overlay price treats 800 sq ft of
// sound asphalt as the same job as 1,000 sq ft with a failed base, a 4-inch
// apron at the street, and 60 feet of sawcut at the garage. Homeowners (and
// a lot of estimator sheets) count the same kind of number. Mix tons scale
// with thickness. Demo, millings, gravel, and the apron do not live in a
// per-foot special. Matching a cheap overlay on a full-depth driveway is
// how a sold paving job becomes a two-day loss after the first sawcut.
//
// Distinct from asphalt *sealcoating* (a thin coating on existing asphalt:
// coats and crack fill) and from concrete driveway *pours* (cubic yards of
// slab). This prices placing hot-mix asphalt — overlay, mill-and-overlay,
// or full-depth — and putting the edges back.

export const COMPACTED_ASPHALT_LB_PER_CF = 145;
export const GRAVEL_LB_PER_CF = 135;

export const METHOD_PRESETS = Object.freeze([
  { id: 'overlay', label: 'Overlay on existing asphalt' },
  { id: 'mill-overlay', label: 'Mill-and-overlay' },
  { id: 'full-depth', label: 'Full-depth replacement' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '800 sq ft overlay, 2 in (the cheap refresh)',
    method: 'overlay',
    drivewaySqFt: 800,
    thicknessIn: 2,
    apronSqFt: 0,
    apronThicknessIn: 4,
    failedBaseSqFt: 0,
    sawcutLf: 20,
    millDepthIn: 0,
    existingDepthIn: 2,
    fabric: false,
  },
  {
    label: '1,200 sq ft mill-and-overlay, 2 in, 80 sq ft apron',
    method: 'mill-overlay',
    drivewaySqFt: 1200,
    thicknessIn: 2,
    apronSqFt: 80,
    apronThicknessIn: 4,
    failedBaseSqFt: 0,
    sawcutLf: 40,
    millDepthIn: 1.5,
    existingDepthIn: 2,
    fabric: false,
  },
  {
    label: '1,000 sq ft full-depth, 3 in, failed base and sawcut (where overlay loses)',
    method: 'full-depth',
    drivewaySqFt: 1000,
    thicknessIn: 3,
    apronSqFt: 80,
    apronThicknessIn: 4,
    failedBaseSqFt: 200,
    sawcutLf: 60,
    millDepthIn: 0,
    existingDepthIn: 2.5,
    fabric: false,
  },
  {
    label: '2,000 sq ft mill-and-overlay, 2.5 in, fabric over cracks',
    method: 'mill-overlay',
    drivewaySqFt: 2000,
    thicknessIn: 2.5,
    apronSqFt: 150,
    apronThicknessIn: 4,
    failedBaseSqFt: 0,
    sawcutLf: 80,
    millDepthIn: 1.5,
    existingDepthIn: 2.5,
    fabric: true,
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
 * Compacted hot-mix tons from area and thickness. 145 lb/ft³ is the usual
 * shop figure; replace it when the plant ticket says otherwise.
 */
export function mixTons(squareFeet, thicknessIn, poundsPerCf = COMPACTED_ASPHALT_LB_PER_CF) {
  const area = number(squareFeet, 'Square feet');
  const inches = number(thicknessIn, 'Thickness');
  const density = number(poundsPerCf, 'Asphalt density', { allowZero: false });
  return area * (inches / 12) * density / 2000;
}

/**
 * Compacted gravel tons for a failed-base patch.
 */
export function gravelTons(squareFeet, thicknessIn, poundsPerCf = GRAVEL_LB_PER_CF) {
  const area = number(squareFeet, 'Failed-base square feet');
  const inches = number(thicknessIn, 'Gravel thickness');
  const density = number(poundsPerCf, 'Gravel density', { allowZero: false });
  return area * (inches / 12) * density / 2000;
}

/**
 * Starting machine hours and material rates from the paving method.
 * These are ballpark shop figures, not a catalog. Picking a method never
 * overwrites a rate the shop has already typed.
 */
export function suggestedMethodKit(method) {
  const id = String(method);
  if (id === 'overlay') {
    return {
      hoursPerSqFtPave: 0.0028,
      hoursPerSqFtMill: 0,
      hoursPerSqFtDemo: 0,
      hoursPerSqFtBase: 0,
      hoursPerSqFtTack: 0.0005,
      hoursPerLfSawcut: 0.035,
      hoursPerSqFtApronExtra: 0.004,
      mixPerTon: 105,
      millDumpPerTon: 0,
      demoDumpPerTon: 0,
      gravelPerTon: 28,
      tackPerSqFt: 0.08,
      fabricPerSqFt: 0.55,
    };
  }
  if (id === 'mill-overlay') {
    return {
      hoursPerSqFtPave: 0.0028,
      hoursPerSqFtMill: 0.0022,
      hoursPerSqFtDemo: 0,
      hoursPerSqFtBase: 0,
      hoursPerSqFtTack: 0.0005,
      hoursPerLfSawcut: 0.04,
      hoursPerSqFtApronExtra: 0.004,
      mixPerTon: 105,
      millDumpPerTon: 18,
      demoDumpPerTon: 0,
      gravelPerTon: 28,
      tackPerSqFt: 0.08,
      fabricPerSqFt: 0.55,
    };
  }
  if (id === 'full-depth') {
    return {
      hoursPerSqFtPave: 0.0032,
      hoursPerSqFtMill: 0,
      hoursPerSqFtDemo: 0.0075,
      hoursPerSqFtBase: 0.0045,
      hoursPerSqFtTack: 0.0003,
      hoursPerLfSawcut: 0.05,
      hoursPerSqFtApronExtra: 0.006,
      mixPerTon: 105,
      millDumpPerTon: 0,
      demoDumpPerTon: 22,
      gravelPerTon: 28,
      tackPerSqFt: 0.06,
      fabricPerSqFt: 0.55,
    };
  }
  throw new Error('Unknown paving method');
}

/**
 * Price an overlay, mill-and-overlay, or full-depth driveway from area,
 * thickness, apron, failed base, sawcut, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const drivewaySqFt = number(input.drivewaySqFt ?? 0, 'Driveway square feet', { allowZero: false });
  const thicknessIn = number(input.thicknessIn ?? 2, 'Pave thickness', { allowZero: false });
  const apronSqFt = number(input.apronSqFt ?? 0, 'Apron square feet');
  const apronThicknessIn = number(input.apronThicknessIn ?? 4, 'Apron thickness', { allowZero: apronSqFt === 0 });
  const failedBaseSqFt = number(input.failedBaseSqFt ?? 0, 'Failed-base square feet');
  if (failedBaseSqFt > drivewaySqFt + apronSqFt) {
    throw new Error('Failed-base square feet cannot exceed the paved area');
  }
  const sawcutLf = number(input.sawcutLf ?? 0, 'Sawcut lineal feet');
  const millDepthIn = number(input.millDepthIn ?? 0, 'Mill depth');
  const existingDepthIn = number(input.existingDepthIn ?? 2, 'Existing asphalt depth');
  const gravelThicknessIn = number(input.gravelThicknessIn ?? 4, 'Gravel thickness');
  const asphaltLbPerCf = number(input.asphaltLbPerCf ?? COMPACTED_ASPHALT_LB_PER_CF, 'Asphalt density', { allowZero: false });
  const gravelLbPerCf = number(input.gravelLbPerCf ?? GRAVEL_LB_PER_CF, 'Gravel density', { allowZero: false });

  const method = String(input.method ?? 'overlay');
  if (!METHOD_PRESETS.some((item) => item.id === method)) {
    throw new Error('Unknown paving method');
  }
  const fabric = flag(input.fabric);

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / move-in');
  const hoursPerSqFtPave = number(input.hoursPerSqFtPave ?? 0, 'Hours per sq ft to pave');
  const hoursPerSqFtMill = number(input.hoursPerSqFtMill ?? 0, 'Hours per sq ft to mill');
  const hoursPerSqFtDemo = number(input.hoursPerSqFtDemo ?? 0, 'Hours per sq ft to demo');
  const hoursPerSqFtBase = number(input.hoursPerSqFtBase ?? 0, 'Hours per sq ft of failed base');
  const hoursPerSqFtTack = number(input.hoursPerSqFtTack ?? 0, 'Hours per sq ft to tack');
  const hoursPerLfSawcut = number(input.hoursPerLfSawcut ?? 0, 'Hours per lineal foot of sawcut');
  const hoursPerSqFtApronExtra = number(input.hoursPerSqFtApronExtra ?? 0, 'Extra hours per sq ft of apron');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const mixPerTon = number(input.mixPerTon ?? 0, 'Mix cost per ton');
  const millDumpPerTon = number(input.millDumpPerTon ?? 0, 'Millings dump per ton');
  const demoDumpPerTon = number(input.demoDumpPerTon ?? 0, 'Demo dump per ton');
  const gravelPerTon = number(input.gravelPerTon ?? 0, 'Gravel cost per ton');
  const tackPerSqFt = number(input.tackPerSqFt ?? 0, 'Tack per square foot');
  const fabricPerSqFt = number(input.fabricPerSqFt ?? 0, 'Fabric per square foot');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const pavedSqFt = drivewaySqFt + apronSqFt;
  const drivewayTons = mixTons(drivewaySqFt, thicknessIn, asphaltLbPerCf);
  const apronTons = apronSqFt === 0 ? 0 : mixTons(apronSqFt, apronThicknessIn, asphaltLbPerCf);
  const newMixTons = drivewayTons + apronTons;

  const millTons = method === 'mill-overlay'
    ? mixTons(pavedSqFt, millDepthIn, asphaltLbPerCf)
    : 0;
  const demoTons = method === 'full-depth'
    ? mixTons(pavedSqFt, existingDepthIn, asphaltLbPerCf)
    : 0;
  const baseTons = failedBaseSqFt === 0
    ? 0
    : gravelTons(failedBaseSqFt, gravelThicknessIn, gravelLbPerCf);

  const hoursPave = pavedSqFt * hoursPerSqFtPave;
  const hoursMill = method === 'mill-overlay' ? pavedSqFt * hoursPerSqFtMill : 0;
  const hoursDemo = method === 'full-depth' ? pavedSqFt * hoursPerSqFtDemo : 0;
  const hoursBase = failedBaseSqFt * hoursPerSqFtBase;
  const hoursTack = method === 'full-depth' ? 0 : pavedSqFt * hoursPerSqFtTack;
  const hoursSawcut = sawcutLf * hoursPerLfSawcut;
  const hoursApron = apronSqFt * hoursPerSqFtApronExtra;
  const hoursMethod = hoursPave + hoursMill + hoursDemo + hoursBase + hoursTack + hoursSawcut + hoursApron;
  const totalHours = hoursTrip + hoursMethod + siteHours;
  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const mixMaterial = newMixTons * mixPerTon;
  const millDump = millTons * millDumpPerTon;
  const demoDump = demoTons * demoDumpPerTon;
  const gravelMaterial = baseTons * gravelPerTon;
  const tackMaterial = method === 'full-depth' ? 0 : pavedSqFt * tackPerSqFt;
  const fabricMaterial = fabric ? pavedSqFt * fabricPerSqFt : 0;
  const permitMaterial = permitFee;
  const dumpCost = millDump + demoDump;
  const materialCost = mixMaterial + dumpCost + gravelMaterial + tackMaterial + fabricMaterial + permitMaterial;
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
  const extraCost = dumpCost + gravelMaterial + tackMaterial + fabricMaterial + permitMaterial
    + (hoursMill + hoursDemo + hoursBase + hoursSawcut + hoursApron) * loadedWage;

  return {
    method,
    drivewaySqFt,
    thicknessIn,
    apronSqFt,
    apronThicknessIn,
    failedBaseSqFt,
    sawcutLf,
    millDepthIn,
    existingDepthIn,
    gravelThicknessIn,
    fabric,
    pavedSqFt,
    drivewayTons,
    apronTons,
    newMixTons,
    millTons,
    demoTons,
    baseTons,
    loadedWage,
    hoursTrip,
    hoursPave,
    hoursMill,
    hoursDemo,
    hoursBase,
    hoursTack,
    hoursSawcut,
    hoursApron,
    hoursMethod,
    siteHours,
    totalHours,
    laborCost,
    mixMaterial,
    millDump,
    demoDump,
    dumpCost,
    gravelMaterial,
    tackMaterial,
    fabricMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    extraCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSqFt: pavedSqFt === 0 ? null : price / pavedSqFt,
    pricePerTon: newMixTons === 0 ? null : price / newMixTons,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      mix: costShare(mixMaterial),
      extra: costShare(extraCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(hoursTrip),
      pave: hourShare(hoursPave + hoursTack),
      mill: hourShare(hoursMill),
      demo: hourShare(hoursDemo),
      base: hourShare(hoursBase),
      sawcut: hourShare(hoursSawcut + hoursApron),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perSqFt: pavedSqFt === 0 ? null : proposedPrice / pavedSqFt,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same driveway three ways — overlay, mill-and-overlay,
 * full-depth — from the suggested kits so the shop can see when a
 * failed base or a thick apron flips the cheaper method. User-typed
 * method rates are not reused here: the comparison is apples-to-apples
 * on the starting figures.
 */
export function compareMethods(input) {
  const rows = METHOD_PRESETS.map((preset) => {
    const kit = suggestedMethodKit(preset.id);
    const typedMill = Number(input.millDepthIn);
    const millDepthIn = preset.id === 'mill-overlay'
      ? (Number.isFinite(typedMill) && typedMill > 0 ? typedMill : 1.5)
      : 0;
    const bid = calculateBid({
      ...input,
      method: preset.id,
      millDepthIn,
      fabric: preset.id === 'full-depth' ? false : input.fabric,
      ...kit,
    });
    return {
      method: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerSqFt: bid.pricePerSqFt,
      newMixTons: bid.newMixTons,
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
export function formatBidSummary(result, jobLabel = 'Asphalt driveway paving') {
  const perSqFt = result.pricePerSqFt === null
    ? 'n/a'
    : `${money(result.pricePerSqFt)} / sq ft`;
  const method = METHOD_PRESETS.find((item) => item.id === result.method)?.label ?? result.method;
  const fabric = result.fabric ? 'paving fabric included' : 'no paving fabric';
  const apron = result.apronSqFt > 0
    ? `${result.apronSqFt} sq ft apron at ${result.apronThicknessIn} in`
    : 'no street apron';
  return [
    'ASPHALT DRIVEWAY PAVING BID',
    '',
    `Proposed paving price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${method}`,
    `Price per square foot: ${perSqFt}`,
    `Hot-mix tons: ${result.newMixTons.toFixed(1)} t`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.drivewaySqFt} sq ft driveway at ${result.thicknessIn} in (${result.drivewayTons.toFixed(1)} t)`,
    `- ${apron}; failed base: ${result.failedBaseSqFt} sq ft; sawcut: ${result.sawcutLf} lf`,
    `- ${fabric}`,
    `- Pave / tack: ${(result.hoursPave + result.hoursTack).toFixed(1)} h; mill: ${result.hoursMill.toFixed(1)} h; demo / base: ${(result.hoursDemo + result.hoursBase).toFixed(1)} h; sawcut / apron: ${(result.hoursSawcut + result.hoursApron).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm square footage, thickness, apron, failed base, sawcut, mix tickets, and all pricing before sending. It is not a paving specification, a code determination, a permit, or an engineering stamp.',
  ].join('\n');
}
