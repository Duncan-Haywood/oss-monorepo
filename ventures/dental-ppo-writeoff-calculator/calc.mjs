/**
 * What a dental practice actually collects on its own fee schedule.
 *
 * A practice sets a fee schedule — its UCR fees — and then signs PPO contracts
 * that each pay some fraction of it. The difference is written off at the
 * moment of posting, every day, in a line the practice management system calls
 * a contractual adjustment. It is not a bad debt, nobody chased it, and no
 * report treats it as money lost. It is simply gone.
 *
 * The number that matters is the *effective reimbursement rate*: net production
 * over gross production, per plan. Almost no practice knows it per plan. The
 * PMS reports production by provider, by procedure and by day; the adjustment
 * sits beside it as a dollar column rather than a rate, and a rate is the only
 * form in which two plans can be compared.
 *
 * ## Three design decisions are load-bearing
 *
 * **Chair hours are allocated between plans in proportion to gross production
 * at the practice's own fee schedule.** No practice tracks hours by carrier, so
 * a tool that demands them cannot be filled in from any report that exists. The
 * practice's own fee schedule is, by construction, its own pricing of chair
 * time — an hour of work billed at $600 of UCR is an hour of chair, whatever a
 * carrier later allows. That makes the allocation an assumption the reader can
 * check rather than a guess the tool hides, and it collapses to an identity:
 *
 *     netPerChairHour(plan) = reimbursementRate(plan) × grossProductionPerHour
 *
 * so a plan's dollars per chair hour is its reimbursement rate scaled by one
 * practice-wide constant. Everything downstream follows from that.
 *
 * **The break-even is expressed as a reimbursement *rate*, not as dollars.**
 * `breakEvenReimbursementRate = costPerChairHour / grossProductionPerHour`.
 * Stated that way it is directly comparable to the per-plan rates printed above
 * it, so "which of my plans pay less than the chair costs me" is a comparison
 * the reader makes by eye rather than one the tool performs out of sight.
 *
 * **Raising the fee schedule is modelled honestly, which means modelling it as
 * mostly ineffective.** Every practice's first instinct about write-offs is to
 * raise UCR fees. On any plan whose allowed fee already binds — which is all of
 * them, because an allowed fee is a contracted dollar amount and not a
 * percentage of whatever the office happens to charge — a fee rise increases
 * the write-off by exactly what it increases gross production and collects
 * nothing extra. It moves money only on production that is not contracted.
 * `feeRaiseImpact` reports both halves, and the write-off half is normally the
 * larger one.
 *
 * Nothing here is an accounting determination, a tax position, a legal reading
 * of a participating-provider agreement, or advice about whether to stay in a
 * network. It is division, performed on figures the user typed, with the
 * assumptions above written down.
 *
 * No patient-level data is an input, by design. Every figure is a period total
 * for a carrier, which is what a "production by carrier" report already yields,
 * and which carries no protected health information.
 */

const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

/** Ids the plan table collects, one row per carrier. */
export const PLAN_FIELDS = ['planName', 'grossProduction', 'writeOff'];

/** Ids the practice-level form collects. */
export const PRACTICE_FIELDS = [
  'selfPayProduction',
  'chairHours',
  'providerCompensation',
  'practiceOverhead',
  'feeScheduleIncrease',
];

function numeric(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Validate and normalise one carrier row. A row is only counted when it has a
 * name and a gross production figure; a blank row is skipped rather than
 * rejected, because the table ships with more rows than most practices need.
 */
function readPlan(row, index) {
  const name = String(row.planName ?? '').trim();
  const gross = numeric(row.grossProduction);
  const writeOff = numeric(row.writeOff);

  if (!name && gross === null && writeOff === null) return { blank: true };

  const errors = [];
  const id = `plan-${index}`;
  if (!name) errors.push({ id: `${id}-planName`, message: 'Name this plan so you can tell the rows apart.' });
  if (gross === null) errors.push({ id: `${id}-grossProduction`, message: 'Production at your own fee schedule is needed.' });
  else if (gross < 0) errors.push({ id: `${id}-grossProduction`, message: 'Production cannot be negative.' });
  if (writeOff === null) errors.push({ id: `${id}-writeOff`, message: 'The contractual write-off for this plan is needed.' });
  else if (writeOff < 0) errors.push({ id: `${id}-writeOff`, message: 'A write-off cannot be negative. Enter it as a positive number.' });
  else if (gross !== null && writeOff > gross) {
    errors.push({
      id: `${id}-writeOff`,
      message: 'The write-off is larger than the production it came out of — check that both cover the same period.',
    });
  }

  return { blank: false, name, gross, writeOff, errors };
}

/**
 * The whole calculation. Takes the plan rows and the practice-level figures,
 * returns either `{ok: false, errors}` or a result object whose every field is
 * a number the page can render without further arithmetic.
 */
export function effectiveReimbursement(input = {}) {
  const errors = [];
  const rows = Array.isArray(input.plans) ? input.plans : [];
  const plans = [];

  rows.forEach((row, index) => {
    const parsed = readPlan(row, index);
    if (parsed.blank) return;
    errors.push(...parsed.errors);
    if (parsed.errors.length === 0) plans.push(parsed);
  });

  if (plans.length === 0 && errors.length === 0) {
    errors.push({ id: 'plan-0-planName', message: 'Add at least one insurance plan.' });
  }

  const selfPayProduction = numeric(input.selfPayProduction) ?? 0;
  const chairHours = numeric(input.chairHours);
  const providerCompensation = numeric(input.providerCompensation);
  const practiceOverhead = numeric(input.practiceOverhead);
  const feeScheduleIncrease = numeric(input.feeScheduleIncrease) ?? 0;

  if (selfPayProduction < 0) {
    errors.push({ id: 'selfPayProduction', message: 'Production cannot be negative.' });
  }
  if (chairHours === null) errors.push({ id: 'chairHours', message: 'Clinical chair hours for the period are needed.' });
  else if (chairHours <= 0) errors.push({ id: 'chairHours', message: 'Chair hours must be more than zero.' });
  if (providerCompensation === null) {
    errors.push({ id: 'providerCompensation', message: 'What the providers were paid for the period is needed.' });
  } else if (providerCompensation < 0) {
    errors.push({ id: 'providerCompensation', message: 'Compensation cannot be negative.' });
  }
  if (practiceOverhead === null) {
    errors.push({ id: 'practiceOverhead', message: 'Practice overhead for the period is needed.' });
  } else if (practiceOverhead < 0) {
    errors.push({ id: 'practiceOverhead', message: 'Overhead cannot be negative.' });
  }
  if (feeScheduleIncrease < 0 || feeScheduleIncrease > 100) {
    errors.push({ id: 'feeScheduleIncrease', message: 'Enter a fee increase between 0 and 100 percent.' });
  }

  if (errors.length > 0) return { ok: false, errors };

  // --- totals -------------------------------------------------------------
  const insuredGross = plans.reduce((sum, p) => sum + p.gross, 0);
  const totalWriteOff = plans.reduce((sum, p) => sum + p.writeOff, 0);
  const grossProduction = insuredGross + selfPayProduction;
  const netProduction = grossProduction - totalWriteOff;

  if (grossProduction <= 0) {
    return {
      ok: false,
      errors: [{ id: 'plan-0-grossProduction', message: 'Total production for the period is zero — there is nothing to measure.' }],
    };
  }

  const grossProductionPerHour = grossProduction / chairHours;
  const netProductionPerHour = netProduction / chairHours;
  const blendedReimbursementRate = netProduction / grossProduction;
  const writeOffRate = totalWriteOff / grossProduction;

  // Cost of an hour of chair: what the providers were paid plus what the
  // practice spent to keep the chair open, over the hours it was open. Both
  // are period totals off a profit-and-loss statement, so nothing is allocated
  // between departments and no percentage is invented.
  const totalCost = providerCompensation + practiceOverhead;
  const costPerChairHour = totalCost / chairHours;

  // The comparison the whole page exists to make. Below this rate a plan is
  // buying chair time for less than the chair costs to keep open.
  const breakEvenReimbursementRate = costPerChairHour / grossProductionPerHour;

  // --- per plan -----------------------------------------------------------
  const planResults = plans
    .map((p) => {
      const net = p.gross - p.writeOff;
      const rate = p.gross > 0 ? net / p.gross : 0;
      // The allocation identity from the header comment: share of gross
      // production is share of chair, so hours follow production.
      const allocatedHours = (p.gross / grossProduction) * chairHours;
      return {
        name: p.name,
        grossProduction: round2(p.gross),
        writeOff: round2(p.writeOff),
        netProduction: round2(net),
        reimbursementRate: round4(rate),
        netPerChairHour: round2(rate * grossProductionPerHour),
        allocatedHours: round2(allocatedHours),
        shareOfProduction: round4(p.gross / grossProduction),
        shareOfWriteOff: totalWriteOff > 0 ? round4(p.writeOff / totalWriteOff) : 0,
        // A row carrying no production is not a contract paying badly — it is a
        // plan the practice saw nothing from this month. Rating it against the
        // break-even would put a carrier on the "below cost" list on the
        // strength of a zero, which is the one reading that would send a
        // practice to renegotiate a contract it did not use.
        belowBreakEven: p.gross > 0 && rate < breakEvenReimbursementRate,
        annualWriteOff: round2(p.writeOff * 12),
      };
    })
    .sort((a, b) => b.writeOff - a.writeOff);

  const belowBreakEven = planResults.filter((p) => p.belowBreakEven);

  // How concentrated the write-off is. A practice with one bad contract and a
  // practice with eight mediocre ones have the same total and entirely
  // different problems, and the total alone cannot tell them apart.
  let cumulative = 0;
  let plansToHalfTheWriteOff = 0;
  for (const p of planResults) {
    if (cumulative >= totalWriteOff / 2) break;
    cumulative += p.writeOff;
    plansToHalfTheWriteOff += 1;
  }

  // --- the fee-rise model -------------------------------------------------
  // On contracted production a fee rise is absorbed entirely by the write-off,
  // because the allowed fee is a dollar amount the contract fixes. Only the
  // self-pay share of production actually collects more.
  const rise = feeScheduleIncrease / 100;
  const feeRaiseImpact = {
    percent: feeScheduleIncrease,
    addedGrossProduction: round2(grossProduction * rise),
    addedWriteOff: round2(insuredGross * rise),
    addedCollections: round2(selfPayProduction * rise),
    contractedShareOfProduction: round4(insuredGross / grossProduction),
  };

  return {
    ok: true,
    errors: [],
    planCount: planResults.length,
    plans: planResults,
    selfPayProduction: round2(selfPayProduction),
    insuredGrossProduction: round2(insuredGross),
    grossProduction: round2(grossProduction),
    totalWriteOff: round2(totalWriteOff),
    netProduction: round2(netProduction),
    blendedReimbursementRate: round4(blendedReimbursementRate),
    writeOffRate: round4(writeOffRate),
    chairHours: round2(chairHours),
    grossProductionPerHour: round2(grossProductionPerHour),
    netProductionPerHour: round2(netProductionPerHour),
    providerCompensation: round2(providerCompensation),
    practiceOverhead: round2(practiceOverhead),
    costPerChairHour: round2(costPerChairHour),
    breakEvenReimbursementRate: round4(breakEvenReimbursementRate),
    marginPerChairHour: round2(netProductionPerHour - costPerChairHour),
    coversCost: netProductionPerHour >= costPerChairHour,
    plansBelowBreakEven: belowBreakEven.map((p) => p.name),
    productionBelowBreakEven: round2(
      belowBreakEven.reduce((sum, p) => sum + p.grossProduction, 0),
    ),
    plansToHalfTheWriteOff,
    annualWriteOff: round2(totalWriteOff * 12),
    feeRaiseImpact,
  };
}

export { round2, round4 };
