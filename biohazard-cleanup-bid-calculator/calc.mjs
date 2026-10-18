// Pure bid arithmetic for a biohazard / trauma-scene remediation job
// (unattended death, crime scene, industrial accident, or hoarding-biohazard
// cleanup). No network, no state: every hour, rate, pound, and fee is an
// input, so the result stays a transparent calculation the technician can
// check against their own hauler invoice and PPE order instead of a rule of
// thumb like "day rate plus a flat hazmat fee."
//
// The buyer: a licensed biohazard/trauma remediation technician or small
// company (often cross-licensed for mold or water-damage restoration) who
// quotes a scene cleanup — usually billed to the property owner, sometimes
// routed through homeowner's insurance, but priced here purely as the
// company's own cost-plus job, the same way this portfolio's other
// remediation calculators price a mold or radon job rather than adjudicate
// an insurance claim.
//
// Two costs a flat day-rate-plus-hazmat-fee spreadsheet gets wrong, and both
// are modeled here rather than assumed away:
//
//   1. Regulated (biohazard/medical) waste disposal is billed by the
//      licensed waste hauler **per container picked up, not per pound**. A
//      container that is 10% full costs exactly what one that is 100% full
//      costs, up to that container's rated capacity — so a naive
//      `totalPounds * (costPerContainer / containerCapacityPounds)` estimate
//      undercounts every job whose waste does not divide evenly into whole
//      containers. `disposalCost` rounds the pound estimate up to the next
//      whole container before pricing it, the way the hauler's own invoice
//      will.
//   2. PPE cost scales with **decontamination cycles, not headcount.** A
//      technician who leaves the contaminated area — for a break, to run
//      equipment out, or because the job spans a shift change — must doff
//      the PPE they were wearing (it cannot be re-donned once removed) and
//      don a fresh set to re-enter. `ppeCost` is technicians times cycles
//      per technician, not technicians times one, so a job with more than
//      one cycle per tech costs more PPE than a naive per-head count
//      assumes.
//
//   calculateJobBid(inputs)        -- full cost breakdown, the naive
//                                      per-pound/per-head comparison, and
//                                      the quoted price for one job.
//   formatBidBreakdown(result)     -- the same breakdown as plain text, for
//                                      pasting into an invoice or an email.

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const DEFAULTS = {
  technicianCount: 2,
  hoursOnSitePerTechnician: 5,
  laborRatePerHour: 45,
  deconCyclesPerTechnician: 1,
  ppeCostPerSet: 38,
  suppliesCost: 120,
  equipmentRentalCost: 90,
  biohazardWastePounds: 55,
  containerCapacityPounds: 40,
  costPerContainer: 110,
  travelFee: 75,
  minimumJobFee: 650,
  targetMarginPercent: 25,
};

/**
 * Price one biohazard / trauma-scene remediation job.
 *
 * @param {object} input
 * @param {number} input.technicianCount           Techs working the scene.
 * @param {number} input.hoursOnSitePerTechnician   Hours each tech spends
 *   on site (setup, cleaning, decon, teardown combined).
 * @param {number} input.laborRatePerHour           Loaded hourly rate for
 *   one technician's time.
 * @param {number} input.deconCyclesPerTechnician   Times each technician
 *   dons a fresh PPE set to (re-)enter the contaminated area over the job
 *   (>= 1 — every tech dons at least once). Raise this for breaks, a
 *   multi-day job, or an equipment run that requires re-entry.
 * @param {number} input.ppeCostPerSet              Cost of one full PPE
 *   set: suit, respirator, gloves, booties, eye protection.
 * @param {number} input.suppliesCost               Flat consumables for
 *   the job: enzymatic cleaner, sealant, odor treatment, absorbents.
 * @param {number} input.equipmentRentalCost        Flat equipment for the
 *   job: ozone generator, air scrubber, sub-floor injectors.
 * @param {number} input.biohazardWastePounds       Estimated weight of
 *   regulated waste the job will generate.
 * @param {number} input.containerCapacityPounds    Pounds one approved
 *   disposal container holds, per your hauler's spec sheet.
 * @param {number} input.costPerContainer           Your hauler's charge
 *   per container picked up, regardless of how full it is.
 * @param {number} input.travelFee                  Flat trip charge.
 * @param {number} input.minimumJobFee              Your company's minimum
 *   charge for any job, regardless of computed scope.
 * @param {number} input.targetMarginPercent        Desired profit margin
 *   on top of direct cost (0-99).
 * @param {number|null} [input.proposedPrice]       A price you are
 *   actually quoting (or considering), to check its real profit and margin
 *   against the true floor instead of the suggested price.
 */
export function calculateJobBid(input = {}) {
  const technicianCount = number(input.technicianCount, 'Technician count', { allowZero: false });
  const hoursOnSitePerTechnician = number(input.hoursOnSitePerTechnician, 'Hours on site per technician', { allowZero: false });
  const laborRatePerHour = number(input.laborRatePerHour, 'Labor rate');
  const deconCyclesPerTechnician = number(input.deconCyclesPerTechnician, 'Decon cycles per technician', { min: 1, allowZero: false });
  const ppeCostPerSet = number(input.ppeCostPerSet, 'PPE cost per set');
  const suppliesCost = number(input.suppliesCost, 'Supplies cost');
  const equipmentRentalCost = number(input.equipmentRentalCost, 'Equipment rental cost');
  const biohazardWastePounds = number(input.biohazardWastePounds, 'Biohazard waste (lb)');
  const containerCapacityPounds = number(input.containerCapacityPounds, 'Container capacity (lb)', { allowZero: false });
  const costPerContainer = number(input.costPerContainer, 'Cost per container');
  const travelFee = number(input.travelFee, 'Travel fee');
  const minimumJobFee = number(input.minimumJobFee, 'Minimum job fee');
  const targetMarginPercent = number(input.targetMarginPercent, 'Target margin');
  if (targetMarginPercent >= 100) throw new Error('Target margin must be less than 100%');

  const laborCost = round2(technicianCount * hoursOnSitePerTechnician * laborRatePerHour);

  const ppeSets = technicianCount * deconCyclesPerTechnician;
  const ppeCost = round2(ppeSets * ppeCostPerSet);
  // What a headcount-only estimate (one set per tech, no decon cycles)
  // would have charged for PPE — the gap is what extra decon cycles cost.
  const naivePpeCost = round2(technicianCount * ppeCostPerSet);
  const ppeUndercount = round2(Math.max(0, ppeCost - naivePpeCost));

  const containersNeeded = biohazardWastePounds > 0
    ? Math.ceil(biohazardWastePounds / containerCapacityPounds)
    : 0;
  const disposalCost = round2(containersNeeded * costPerContainer);
  const unusedContainerCapacityPounds = round2(
    containersNeeded > 0 ? containersNeeded * containerCapacityPounds - biohazardWastePounds : 0,
  );
  // What a naive per-pound estimate (linear rate, no rounding to a whole
  // container) would have charged for disposal — the gap is what the
  // container-rounding rule actually costs.
  const naiveDisposalCost = round2(biohazardWastePounds * (costPerContainer / containerCapacityPounds));
  const disposalUndercount = round2(Math.max(0, disposalCost - naiveDisposalCost));

  const directCost = round2(
    laborCost + ppeCost + suppliesCost + equipmentRentalCost + disposalCost + travelFee,
  );
  const marginPrice = round2(directCost / (1 - targetMarginPercent / 100));
  const minimumApplied = marginPrice < minimumJobFee;
  const price = minimumApplied ? round2(minimumJobFee) : marginPrice;
  const profit = round2(price - directCost);
  const effectiveMarginPercent = price === 0 ? 0 : round2((profit / price) * 100);

  const naiveDirectCost = round2(
    laborCost + naivePpeCost + suppliesCost + equipmentRentalCost + naiveDisposalCost + travelFee,
  );
  const naiveUndercount = round2(Math.max(0, directCost - naiveDirectCost));

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  let proposed = null;
  if (hasProposed) {
    const proposedPrice = number(input.proposedPrice, 'Price you are considering', { allowZero: false });
    const proposedProfit = round2(proposedPrice - directCost);
    proposed = {
      price: proposedPrice,
      profit: proposedProfit,
      marginPercent: proposedPrice === 0 ? 0 : round2((proposedProfit / proposedPrice) * 100),
      belowDirectCost: proposedProfit < 0,
    };
  }

  const findings = [];

  if (deconCyclesPerTechnician > 1) {
    findings.push({
      id: 'decon-cycles-raise-ppe',
      severity: 'info',
      title: `${ppeSets} PPE sets needed for ${technicianCount} tech(s) at ${deconCyclesPerTechnician} decon cycle(s) each — $${ppeUndercount.toFixed(2)} more than a per-head estimate`,
      detail: 'A technician who leaves the contaminated area must doff and dispose of the PPE they were wearing before re-entering in a fresh set — used PPE cannot be re-donned. A count that assumes one set per technician undercounts every job with a break, an equipment run, or a shift change.',
    });
  }

  if (containersNeeded > 0 && unusedContainerCapacityPounds > 0) {
    findings.push({
      id: 'container-rounding',
      severity: 'medium',
      title: `${containersNeeded} container(s) needed, with ${unusedContainerCapacityPounds.toFixed(1)} lb of paid-for capacity unused — $${disposalUndercount.toFixed(2)} more than a per-pound rate`,
      detail: 'Regulated waste haulers bill per container picked up, not per pound. A container that is only partly full still costs the full per-container charge, so an estimate of pounds times a per-pound rate undercounts unless the waste happens to divide evenly into whole containers.',
    });
  }

  if (minimumApplied) {
    findings.push({
      id: 'minimum-job-fee-applied',
      severity: 'info',
      title: `Margin-based price ($${marginPrice.toFixed(2)}) was below your $${minimumJobFee.toFixed(2)} minimum — quoted at the minimum instead`,
      detail: 'Small scopes (one room, a short on-site window, little waste) can price below your minimum job fee on cost-plus-margin alone. The minimum protects against under-billing a job that still requires a full truck roll, a hauler pickup, and travel regardless of scope.',
    });
  }

  findings.push({
    id: 'confirm-before-quoting',
    severity: 'medium',
    title: 'Confirm your hauler contract and local protocol before quoting',
    detail: 'This totals the rates, hours, and waste estimate you entered — it does not know your regulated-waste hauler’s actual per-container price, your state or OSHA bloodborne-pathogen decon requirements, or whether a given job is billable to insurance. Confirm those before sending a quote or filing a waste manifest.',
  });

  return {
    technicianCount,
    hoursOnSitePerTechnician,
    laborRatePerHour,
    laborCost,
    deconCyclesPerTechnician,
    ppeSets,
    ppeCost,
    naivePpeCost,
    ppeUndercount,
    suppliesCost,
    equipmentRentalCost,
    biohazardWastePounds,
    containerCapacityPounds,
    containersNeeded,
    unusedContainerCapacityPounds,
    disposalCost,
    naiveDisposalCost,
    disposalUndercount,
    costPerContainer,
    travelFee,
    directCost,
    naiveDirectCost,
    naiveUndercount,
    marginPrice,
    minimumJobFee,
    minimumApplied,
    targetMarginPercent,
    price,
    profit,
    effectiveMarginPercent,
    proposed,
    findings,
  };
}

/**
 * The disclaimer that travels with a copied breakdown -- the text leaves
 * this page and its reader may never see the footer.
 */
export const BREAKDOWN_DISCLAIMER =
  'Arithmetic only: this breakdown totals the rates, hours, and waste estimate ' +
  'you entered. It does not know your regulated-waste hauler’s actual ' +
  'per-container price, your state or OSHA bloodborne-pathogen decon ' +
  'requirements, or whether a job is billable to insurance -- confirm those ' +
  'before quoting or filing a waste manifest.';

/**
 * Renders a job bid as the plain-text breakdown a technician can paste into
 * an invoice, a work order, or an email to the property owner.
 *
 * @param {ReturnType<typeof calculateJobBid>} result
 * @returns {string}
 */
export function formatBidBreakdown(result) {
  const money = (n) => {
    const format = (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(n));
    return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const {
    technicianCount = 0, hoursOnSitePerTechnician = 0, laborCost = 0,
    ppeSets = 0, ppeCost = 0, containersNeeded = 0, disposalCost = 0,
    suppliesCost = 0, equipmentRentalCost = 0, travelFee = 0,
    directCost = 0, price = 0, profit = 0, minimumApplied = false,
  } = result ?? {};

  const lines = ['BIOHAZARD / TRAUMA-SCENE CLEANUP JOB BID', ''];
  lines.push(`Technicians: ${technicianCount} x ${hoursOnSitePerTechnician} h on site = ${money(laborCost)} labor`);
  lines.push(`PPE: ${ppeSets} set(s) = ${money(ppeCost)}`);
  lines.push(`Regulated waste disposal: ${containersNeeded} container(s) = ${money(disposalCost)}`);
  lines.push(`Supplies: ${money(suppliesCost)}`);
  lines.push(`Equipment rental: ${money(equipmentRentalCost)}`);
  lines.push(`Travel: ${money(travelFee)}`);
  lines.push('', `Direct cost: ${money(directCost)}`);
  lines.push(`Quoted price${minimumApplied ? ' (minimum job fee applied)' : ''}: ${money(price)}`);
  lines.push(`Profit at this price: ${money(profit)}`);
  lines.push('', '--', BREAKDOWN_DISCLAIMER);

  return lines.join('\n');
}
