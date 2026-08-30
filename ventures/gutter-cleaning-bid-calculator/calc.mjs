// Pure bid arithmetic for a residential gutter-cleaning job. No network, no
// state: every length, multiplier, wage, and visit figure is an input, so the
// result stays a transparent calculation the contractor can check against
// their own crew times rather than a claim about what any house "should" cost.
//
// The method is the one the trade actually loses money by skipping: linear
// feet are only the start. Stories, roof pitch, gutter guards, and debris
// type change the minutes per foot, and each downspout is a separate flush.
// A flat per-linear-foot quote cannot see that a 120-foot ranch and a
// 120-foot two-story with micro-mesh are different jobs.

export const STORY_PRESETS = Object.freeze([
  { id: '1', label: '1 story', factor: 1 },
  { id: '1.5', label: '1.5 story', factor: 1.25 },
  { id: '2', label: '2 story', factor: 1.6 },
  { id: '3', label: '3 story', factor: 2.1 },
]);

export const PITCH_PRESETS = Object.freeze([
  { id: 'low', label: 'Low / walkable', factor: 1 },
  { id: 'moderate', label: 'Moderate', factor: 1.15 },
  { id: 'steep', label: 'Steep', factor: 1.4 },
]);

export const GUARD_PRESETS = Object.freeze([
  { id: 'none', label: 'Open gutters', factor: 1 },
  { id: 'screens', label: 'Screens / hoods', factor: 1.5 },
  { id: 'mesh', label: 'Micro-mesh', factor: 2.2 },
]);

export const DEBRIS_PRESETS = Object.freeze([
  { id: 'leaves', label: 'Leaves / light debris', factor: 1 },
  { id: 'mixed', label: 'Mixed leaves and needles', factor: 1.2 },
  { id: 'needles', label: 'Pine / fir needles', factor: 1.6 },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function presetFactor(presets, id, name) {
  const match = presets.find(preset => preset.id === id);
  if (!match) throw new Error(`${name} must be one of ${presets.map(p => p.id).join(', ')}`);
  return match;
}

/**
 * Price a gutter-cleaning visit (and optional seasonal contract) from its
 * runs and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, linearFeet: number, story: string, pitch: string, guards: string, debris: string, downspouts: number}>} input.runs
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate           Payroll burden as a % on wage.
 * @param {number} input.minutesPer10ft       Crew minutes per 10 lf at the
 *   1-story / low-pitch / open / leaves baseline. Every run multiplies this.
 * @param {number} input.minutesPerDownspout  Flush-and-test time per downspout
 *   at 1 story; story factor still applies.
 * @param {number} input.travelMinutes        Setup, walkaround, and pack-up,
 *   charged once per visit.
 * @param {number} input.disposalPerVisit
 * @param {number} input.equipmentPerVisit
 * @param {number} input.overheadRate         Overhead as a % on direct cost.
 * @param {number} input.targetMargin         Net profit as a % of price.
 * @param {number} input.visitsPerYear        1 = one-time, 2 = spring+fall.
 * @param {number} input.minimumCharge        Floor on the quoted visit price.
 * @param {number|null} input.proposedPrice   Optional visit price already
 *   on the table.
 */
export function calculateBid(input) {
  const runsInput = Array.isArray(input.runs) ? input.runs : [];
  if (runsInput.length === 0) throw new Error('Add at least one gutter run to price');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const minutesPer10ft = number(input.minutesPer10ft ?? 0, 'Minutes per 10 linear feet', { allowZero: false });
  const minutesPerDownspout = number(input.minutesPerDownspout ?? 0, 'Minutes per downspout');
  const travelMinutes = number(input.travelMinutes ?? 0, 'Travel and setup minutes');
  const disposalPerVisit = number(input.disposalPerVisit ?? 0, 'Disposal cost');
  const equipmentPerVisit = number(input.equipmentPerVisit ?? 0, 'Equipment cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const visitsPerYear = number(input.visitsPerYear ?? 1, 'Visits per year', { min: 1, allowZero: false });
  const minimumCharge = number(input.minimumCharge ?? 0, 'Minimum charge');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const runs = runsInput.map((run, index) => {
    const label = run.name?.trim() || `Run ${index + 1}`;
    const linearFeet = number(run.linearFeet ?? 0, `${label}: linear feet`);
    const downspouts = number(run.downspouts ?? 0, `${label}: downspouts`);
    const story = presetFactor(STORY_PRESETS, run.story ?? '1', `${label}: stories`);
    const pitch = presetFactor(PITCH_PRESETS, run.pitch ?? 'low', `${label}: pitch`);
    const guards = presetFactor(GUARD_PRESETS, run.guards ?? 'none', `${label}: gutter guards`);
    const debris = presetFactor(DEBRIS_PRESETS, run.debris ?? 'leaves', `${label}: debris`);

    const difficulty = story.factor * pitch.factor * guards.factor * debris.factor;
    const gutterMinutes = (linearFeet / 10) * minutesPer10ft * difficulty;
    // Downspouts inherit the story factor (a second-story leader takes
    // longer to reach and test) but not pitch/guards/debris — those change
    // the trough, not the leader.
    const downspoutMinutes = downspouts * minutesPerDownspout * story.factor;
    const laborMinutes = gutterMinutes + downspoutMinutes;
    return {
      name: label,
      linearFeet,
      downspouts,
      story: story.id,
      storyLabel: story.label,
      pitch: pitch.id,
      guards: guards.id,
      debris: debris.id,
      difficulty,
      laborMinutes,
      laborHours: laborMinutes / 60,
    };
  });

  const gutterHours = runs.reduce((sum, run) => sum + run.laborHours, 0);
  const travelHours = travelMinutes / 60;
  const hoursPerVisit = gutterHours + travelHours;
  const totalLinearFeet = runs.reduce((sum, run) => sum + run.linearFeet, 0);
  const totalDownspouts = runs.reduce((sum, run) => sum + run.downspouts, 0);

  const laborCost = hoursPerVisit * loadedWage;
  const otherDirect = disposalPerVisit + equipmentPerVisit;
  const directCost = laborCost + otherDirect;
  const overhead = directCost * overheadRate / 100;
  const visitCost = directCost + overhead;
  const rawVisitPrice = visitCost / (1 - targetMargin / 100);
  const visitPrice = Math.max(rawVisitPrice, minimumCharge);
  const minimumApplied = visitPrice > rawVisitPrice + 1e-9;
  const visitProfit = visitPrice - visitCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    runs: runs.map(run => ({
      ...run,
      hoursShare: gutterHours === 0 ? 0 : run.laborHours / gutterHours * 100,
    })),
    loadedWage,
    totalLinearFeet,
    totalDownspouts,
    gutterHours,
    travelHours,
    hoursPerVisit,
    laborCost,
    otherDirect,
    overhead,
    visitCost,
    rawVisitPrice,
    visitPrice,
    visitProfit,
    minimumApplied,
    minimumCharge,
    visitsPerYear,
    annualPrice: visitPrice * visitsPerYear,
    annualCost: visitCost * visitsPerYear,
    annualProfit: visitProfit * visitsPerYear,
    pricePerLinearFoot: totalLinearFeet === 0 ? null : visitPrice / totalLinearFeet,
    effectiveHourlyRate: hoursPerVisit === 0 ? null : visitPrice / hoursPerVisit,
    breakEvenVisitPrice: visitCost,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - visitCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - visitCost) / proposedPrice * 100,
      hourlyRate: hoursPerVisit === 0 ? null : proposedPrice / hoursPerVisit,
      belowBreakEven: proposedPrice < visitCost,
      belowMinimum: proposedPrice < minimumCharge,
    },
  };
}

export function formatBidSummary(result) {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const runs = result.runs
    .filter(run => run.linearFeet > 0)
    .map(run => `- ${run.name}: ${run.linearFeet} lf, ${run.storyLabel}, ${run.downspouts} downspout${run.downspouts === 1 ? '' : 's'}`)
    .join('\n');
  const contract = result.visitsPerYear > 1
    ? `Seasonal contract (${result.visitsPerYear} visits/year): ${money(result.annualPrice)}`
    : 'One-time visit';
  return [
    'GUTTER CLEANING BID',
    '',
    `Proposed visit price: ${money(result.visitPrice)}`,
    contract,
    `Crew time: ${result.hoursPerVisit.toFixed(2)} hours including setup`,
    `Price per linear foot: ${result.pricePerLinearFoot === null ? 'n/a' : `$${result.pricePerLinearFoot.toFixed(2)}/lf`}`,
    result.minimumApplied ? `Minimum charge applied (raw price was ${money(result.rawVisitPrice)}).` : null,
    '',
    'RUNS',
    runs || '- No gutter runs entered',
    '',
    `Scope basis: ${result.gutterHours.toFixed(2)} hours on the troughs and downspouts plus ${result.travelHours.toFixed(2)} hours of travel/setup.`,
    'This is a draft for review. Confirm access, insurance, taxes, and all pricing before sending.',
  ].filter(line => line !== null).join('\n');
}
