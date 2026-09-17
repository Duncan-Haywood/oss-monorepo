/**
 * Repair-or-replace planner for a small trade or service fleet, as a
 * deterministic module.
 *
 * ## The decision this models, and the mistake it exists to catch
 *
 * An owner with six service vans and one capital budget has to decide which
 * of them to replace this year. The comparison almost everybody makes is
 * "this year's repair bill" against "the price of a new one", and that
 * comparison is wrong in a specific, expensive way: it leaves out the days
 * the vehicle is off the road.
 *
 * A van in the shop is not merely a repair invoice. It is billable days the
 * crew could not work, or a rental, or a job moved to a competitor. For a
 * two-person crew billing $900 a day, eleven downtime days is $9,900 --
 * frequently several times the repair spend that got all the attention. So
 * the planner asks for downtime explicitly and reports, per asset, whether
 * the repair bill or the downtime is the larger number. That single
 * comparison is the product.
 *
 * ## The arithmetic, stated so a user can re-derive it by hand
 *
 * For each asset, two annual costs:
 *
 *   keep    = annualRepairSpend + (downtimeDays x dailyLostRevenue)
 *   replace = (replacementCost - resaleValue) / expectedLifeYears
 *               + annualRepairOnNew
 *               + (expectedDowntimeDaysOnNew x dailyLostRevenue)
 *
 * `replace` is an **equivalent annual cost**: the net capital actually laid
 * out, spread straight-line over the years of service it buys, plus what the
 * new asset still costs to run each year. Straight-line and undiscounted, on
 * purpose -- a discount rate would change the number by less than the input
 * error on `dailyLostRevenue` while making the result impossible for the
 * owner to check on paper. `ASSUMPTIONS` says so in the interface, and the
 * `undiscounted-eac` finding says so again on every non-empty plan.
 *
 * Then, across assets:
 *
 *   annualSaving     = keep - replace        (positive means replacing wins)
 *   capitalNeeded    = replacementCost - resaleValue
 *   operatingSaving  = keep - (annualRepairOnNew + downtime on the new asset)
 *   paybackYears     = capitalNeeded / operatingSaving
 *   savingPerDollar  = annualSaving / capitalNeeded
 *
 * **`paybackYears` divides by `operatingSaving`, not by `annualSaving`, and
 * the difference is a bug this module shipped with** (corrected 2026-09-12,
 * from a review finding on #4649). `annualSaving` has *already* had
 * `annualisedCapital` subtracted from it, so dividing the capital outlay by it
 * charges the purchase for itself twice — once as the numerator and again
 * inside the denominator. On the shipped van that reported 2.95 years against
 * a true simple payback of $37,500 / ($19,000 - $1,600) = 2.16, and, worse
 * than being wrong by a margin, it pushed assets across the
 * `STRONG_PAYBACK_YEARS` threshold in the pessimistic direction.
 *
 * Payback asks a cash question — how long until the money I laid out comes
 * back — so its denominator is the cash the owner stops spending each year:
 * the old asset's repairs and downtime, less what the new one still costs to
 * run. The capital belongs in the numerator only. `annualSaving` stays the
 * EAC comparison and stays what decides `recommendation` and the budget
 * ranking, which is the question it does answer correctly.
 *
 * ## Budget selection is greedy, and says that it is
 *
 * Picking a subset of assets to fit a fixed budget is a knapsack problem, and
 * this module does NOT solve it optimally. It ranks the candidates by
 * `savingPerDollar` -- the standard, explainable heuristic -- and fills the
 * budget in that order. For a handful of assets that is almost always the
 * best or near-best answer, and it has the property that matters more here:
 * the owner can see why each asset is where it is. The `greedy-selection`
 * finding states the limitation rather than leaving it implied.
 *
 * Nothing here is a determination. Every number is arithmetic on what the
 * owner typed, and `NOT_A_DETERMINATION` fires unconditionally on every
 * non-empty plan for that reason -- a planner that only warned about a bad
 * input could be mistaken for having endorsed a good one.
 */

function nonNegNumber(value) {
  if (value === "" || value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Round to the nearest cent, avoiding float noise like 0.1 + 0.2 === 0.30000000000000004. */
function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Default service life assumed for a replacement when the owner leaves it blank. */
export const DEFAULT_EXPECTED_LIFE_YEARS = 7;

/** A payback at or under this many years is called out as a strong case. */
export const STRONG_PAYBACK_YEARS = 3;

/** Downtime costing at least this multiple of the repair spend gets its own finding. */
export const DOWNTIME_DOMINANCE_RATIO = 1;

/** The modelling choices a user has to know about to trust the output. */
export const ASSUMPTIONS = [
  "Capital is spread straight-line over the replacement's expected service life, with no discount rate or financing interest.",
  "Downtime is valued at the revenue you say a day off the road costs you — not at the repair invoice.",
  "Resale value is treated as received in the same year you buy the replacement.",
  "Budget selection ranks by annual saving per dollar of capital and fills in that order; it is not a guaranteed-optimal subset.",
];

/**
 * Cost out one asset. `row` fields are all optional except `name`; a blank
 * numeric field is treated as 0 rather than guessed at, and the findings say
 * when a zero is load-bearing enough to be worth filling in.
 */
export function planRow(row = {}, index = null) {
  // A stable identity that is NOT the name (added 2026-09-12, from a review
  // finding on #4649). Two rows can legitimately both be called "Truck", and
  // every downstream lookup that keyed on the name — the selected-set
  // membership the table renders, the count beside it, and `toCsv`'s "in this
  // year's plan" column — then marked both as selected when only one fitted
  // the budget, and collapsed the pair to one in the count. A duplicate label
  // in a fleet is ordinary, not a misuse, so the fix is an identity of its own
  // rather than a uniqueness rule imposed on the owner's naming.
  const id = index == null ? null : index;
  const name = String(row.name ?? "").trim() || "Untitled asset";
  const annualRepairSpend = nonNegNumber(row.annualRepairSpend);
  const downtimeDays = nonNegNumber(row.downtimeDays);
  const dailyLostRevenue = nonNegNumber(row.dailyLostRevenue);
  const replacementCost = nonNegNumber(row.replacementCost);
  const resaleValue = nonNegNumber(row.resaleValue);
  const annualRepairOnNew = nonNegNumber(row.annualRepairOnNew);
  const downtimeDaysOnNew = nonNegNumber(row.downtimeDaysOnNew);
  const expectedLifeYears =
    nonNegNumber(row.expectedLifeYears) || DEFAULT_EXPECTED_LIFE_YEARS;

  const downtimeCost = round2(downtimeDays * dailyLostRevenue);
  const keepAnnualCost = round2(annualRepairSpend + downtimeCost);

  // Capital can go negative only if the owner says the trade-in is worth more
  // than the replacement. That is a data error rather than free money, so it
  // is floored at zero for the ratio and called out in a finding.
  const rawCapitalNeeded = round2(replacementCost - resaleValue);
  const capitalNeeded = Math.max(0, rawCapitalNeeded);

  const downtimeCostOnNew = round2(downtimeDaysOnNew * dailyLostRevenue);
  const annualisedCapital = round2(capitalNeeded / expectedLifeYears);
  const replaceAnnualCost = round2(
    annualisedCapital + annualRepairOnNew + downtimeCostOnNew,
  );

  const annualSaving = round2(keepAnnualCost - replaceAnnualCost);

  // The cash the owner stops spending each year by replacing: the old asset's
  // repairs and downtime, less what the new one still costs to run. No capital
  // term — see the payback note in this module's header.
  const operatingSaving = round2(
    keepAnnualCost - (annualRepairOnNew + downtimeCostOnNew),
  );
  const paybackYears =
    operatingSaving > 0 && capitalNeeded > 0
      ? round2(capitalNeeded / operatingSaving)
      : null;

  // Deliberately NOT rounded (corrected 2026-09-12, from a review finding on
  // #4649). This value exists to sort by, and rounding to cents before sorting
  // collapses materially different returns into a tie that then falls back to
  // absolute saving — which picks the larger, worse-returning asset. A $90,000
  // asset returning 0.011 and a $45,000 asset returning 0.014 both round to
  // 0.01, and on a $90,000 budget the tie-break took the one capturing $990
  // over two capturing $1,260, in direct contradiction of the ratio heuristic
  // this module documents. Round at the point of display instead.
  const savingPerDollar =
    capitalNeeded > 0 && annualSaving > 0 ? annualSaving / capitalNeeded : 0;

  // A row whose capital cannot be trusted must not carry a verdict at all
  // (added 2026-09-12, from a review finding on #4649). Two ways that happens,
  // and both used to produce `replace`:
  //
  //   - no replacement cost entered. Capital is then 0, so replacing looks
  //     free, the row always "wins", the budget selector takes it at $0, and
  //     its entire keep cost is reported as captured annual saving. The
  //     `missing-replacement-cost` finding warned about it, but a warning
  //     beside a table, a summary and a CSV all presenting an impossible quote
  //     as this year's plan is not enough -- nobody reads the warning to mean
  //     "and disregard the row".
  //   - a trade-in worth more than the replacement. `capitalNeeded` is floored
  //     at 0 there, which lands in exactly the same place.
  //
  // So the verdict becomes `incomplete`, which `selectWithinBudget` never
  // picks, and the row asks for the missing figure instead of pretending to
  // answer. `keep` and `replace` both mean "the arithmetic ran"; this does not.
  const dataComplete = replacementCost > 0 && rawCapitalNeeded >= 0;
  const recommendation = !dataComplete
    ? "incomplete"
    : annualSaving > 0
      ? "replace"
      : "keep";

  const findings = [];

  if (rawCapitalNeeded < 0) {
    findings.push({
      id: "resale-exceeds-replacement",
      severity: "high",
      title: `${name}: trade-in value is higher than the replacement cost`,
      detail: `You entered a resale value of $${resaleValue.toFixed(2)} against a replacement cost of $${replacementCost.toFixed(2)}. That would mean being paid to upgrade, which is almost always a transposed figure — check both against a current dealer quote and an actual trade-in appraisal before using this row.`,
    });
  }

  if (replacementCost === 0) {
    findings.push({
      id: "missing-replacement-cost",
      severity: "high",
      title: `${name}: no replacement cost entered`,
      detail:
        "Without a replacement cost this row compares your repair and downtime spend against zero capital, so it will always look like replacing wins. Enter a real quote — even a rough one — before reading the recommendation.",
    });
  }

  if (dailyLostRevenue === 0 && downtimeDays > 0) {
    findings.push({
      id: "downtime-not-valued",
      severity: "medium",
      title: `${name}: ${downtimeDays} downtime day(s) entered but valued at $0`,
      detail:
        "Downtime days are only counted once you say what a day off the road costs you in lost billable work, a rental, or a subcontracted job. Until then this row understates the cost of keeping the asset — which is the single most common way this decision gets made wrong.",
    });
  }

  if (
    downtimeCost > 0 &&
    annualRepairSpend > 0 &&
    downtimeCost >= annualRepairSpend * DOWNTIME_DOMINANCE_RATIO
  ) {
    findings.push({
      id: "downtime-dominates",
      severity: "info",
      title: `${name}: downtime costs more than the repairs do`,
      detail: `Downtime is costing $${downtimeCost.toFixed(2)} a year against $${annualRepairSpend.toFixed(2)} of repair spend. The repair invoices are the visible number and the smaller one here — if you have been deciding on the invoices alone, this row is the reason to revisit it.`,
    });
  }

  // Gated on the recommendation as well as the threshold: `operatingSaving`
  // can be positive on an asset the EAC comparison says to keep (a cheap
  // trade-in against a large purchase), and a "strong case" note beside a
  // "keep" verdict would contradict the row it sits on.
  if (
    recommendation === "replace" &&
    paybackYears !== null &&
    paybackYears <= STRONG_PAYBACK_YEARS
  ) {
    findings.push({
      id: "strong-payback",
      severity: "info",
      title: `${name}: capital pays back in ${paybackYears} year(s)`,
      detail: `Replacing needs $${capitalNeeded.toFixed(2)} of capital and stops $${operatingSaving.toFixed(2)} a year of repair and downtime spend, so the outlay is recovered in about ${paybackYears} year(s) — inside the ${STRONG_PAYBACK_YEARS}-year mark this planner flags as a strong case. Confirm the quote and the trade-in before committing.`,
    });
  }

  return {
    id,
    name,
    annualRepairSpend,
    downtimeDays,
    dailyLostRevenue,
    downtimeCost,
    keepAnnualCost,
    replacementCost,
    resaleValue,
    capitalNeeded,
    expectedLifeYears,
    annualisedCapital,
    annualRepairOnNew,
    downtimeDaysOnNew,
    downtimeCostOnNew,
    replaceAnnualCost,
    annualSaving,
    operatingSaving,
    dataComplete,
    paybackYears,
    savingPerDollar,
    recommendation,
    findings,
  };
}

/**
 * Rank the assets worth replacing by annual saving per dollar of capital and
 * fill `capitalBudget` in that order. Assets the arithmetic says to keep are
 * never selected, whatever the budget. A budget of 0 (or blank) means "no
 * budget limit stated" and selects every asset that pays.
 */
export function selectWithinBudget(rows, capitalBudget = 0) {
  const budget = nonNegNumber(capitalBudget);
  const candidates = rows
    .filter((r) => r.recommendation === "replace")
    .slice()
    .sort(
      (a, b) =>
        b.savingPerDollar - a.savingPerDollar ||
        b.annualSaving - a.annualSaving ||
        a.name.localeCompare(b.name) ||
        (a.id ?? 0) - (b.id ?? 0),
    );

  const selected = [];
  const deferred = [];
  let spent = 0;

  for (const row of candidates) {
    if (budget === 0 || spent + row.capitalNeeded <= budget) {
      selected.push(row);
      spent = round2(spent + row.capitalNeeded);
    } else {
      deferred.push(row);
    }
  }

  return {
    selected,
    deferred,
    capitalBudget: budget,
    capitalCommitted: round2(spent),
    capitalRemaining: budget === 0 ? null : round2(budget - spent),
    annualSavingCaptured: round2(
      selected.reduce((sum, r) => sum + r.annualSaving, 0),
    ),
    annualSavingDeferred: round2(
      deferred.reduce((sum, r) => sum + r.annualSaving, 0),
    ),
  };
}

/**
 * Cost the whole fleet and produce the budgeted plan.
 *
 * `NOT_A_DETERMINATION` and `undiscounted-eac` both fire on every non-empty
 * plan, unconditionally, for the reason given in this module's header.
 */
export function planFleet(rows = [], capitalBudget = 0) {
  const planned = (Array.isArray(rows) ? rows : []).map((row, index) => planRow(row, index));

  const totals = planned.reduce(
    (sum, r) => ({
      annualRepairSpend: round2(sum.annualRepairSpend + r.annualRepairSpend),
      downtimeDays: round2(sum.downtimeDays + r.downtimeDays),
      downtimeCost: round2(sum.downtimeCost + r.downtimeCost),
      keepAnnualCost: round2(sum.keepAnnualCost + r.keepAnnualCost),
      capitalNeeded: round2(sum.capitalNeeded + r.capitalNeeded),
    }),
    {
      annualRepairSpend: 0,
      downtimeDays: 0,
      downtimeCost: 0,
      keepAnnualCost: 0,
      capitalNeeded: 0,
    },
  );

  const budget = selectWithinBudget(planned, capitalBudget);
  const findings = planned.flatMap((r) => r.findings);

  if (planned.length === 0) {
    findings.push({
      id: "no-rows",
      severity: "info",
      title: "Add an asset to plan",
      detail:
        "Enter each vehicle or major piece of equipment you are deciding about — what it cost you in repairs last year, how many days it was out of service, and what a replacement and a trade-in would be — to see which ones pay to replace.",
    });
    return { rows: planned, totals, budget, findings };
  }

  if (budget.deferred.length > 0) {
    findings.push({
      id: "budget-binding",
      severity: "medium",
      title: `${budget.deferred.length} asset(s) that pay to replace do not fit the budget`,
      detail: `The plan commits $${budget.capitalCommitted.toFixed(2)} and captures $${budget.annualSavingCaptured.toFixed(2)} a year. Deferring the rest leaves $${budget.annualSavingDeferred.toFixed(2)} a year of saving on the table — worth comparing against what the extra capital would cost you to borrow.`,
    });
  }

  if (budget.selected.length > 1) {
    findings.push({
      id: "greedy-selection",
      severity: "info",
      title: "This ranking is a heuristic, not a guaranteed-optimal subset",
      detail:
        "Assets are ranked by annual saving per dollar of capital and the budget is filled in that order. With several assets of very different prices, a different combination can occasionally capture slightly more saving for the same money — the ranking is shown so you can try one.",
    });
  }

  if (totals.downtimeCost > totals.annualRepairSpend && totals.downtimeCost > 0) {
    findings.push({
      id: "fleet-downtime-dominates",
      severity: "info",
      title: "Across the fleet, downtime costs more than repairs",
      detail: `$${totals.downtimeCost.toFixed(2)} of lost revenue against $${totals.annualRepairSpend.toFixed(2)} of repair spend, over ${totals.downtimeDays} day(s) out of service. If the replacement conversation at your shop is about repair invoices, it is being had about the smaller half.`,
    });
  }

  findings.push({
    id: "undiscounted-eac",
    severity: "info",
    title: "Capital is spread straight-line, with no interest or discount rate",
    detail:
      "Net capital is divided by the replacement's expected service life. Financing interest, inflation and the time value of money are not modelled, so if you would borrow for this, add your own cost of that borrowing before deciding.",
  });

  findings.push({
    id: "not-a-determination",
    severity: "info",
    title: "This is a planning worksheet, not a valuation or a financing decision",
    detail:
      "Every figure here is arithmetic on the numbers you entered. It does not appraise your equipment, does not know your tax position, depreciation schedule, or financing terms, and does not decide anything on your behalf. Confirm replacement quotes and trade-in values in writing, and take the worksheet — not the recommendation — to whoever advises you.",
  });

  return { rows: planned, totals, budget, findings };
}

const CSV_HEADERS = [
  "Asset",
  "Annual repair spend",
  "Downtime days",
  "Cost per downtime day",
  "Downtime cost",
  "Annual cost of keeping",
  "Replacement cost",
  "Trade-in value",
  "Capital needed",
  "Expected life (years)",
  "Annualised capital",
  "Repairs on replacement",
  // The replacement's downtime is a user-entered assumption that feeds
  // `replaceAnnualCost`, `annualSaving` and `paybackYears` alike. Without
  // these two columns none of those three can be re-derived from the export,
  // and this CSV exists to be handed to a lender or an accountant -- who get
  // the findings, the page and the reasoning none of, only these columns.
  "Downtime days on replacement",
  "Downtime cost on replacement",
  "Annual cost of replacing",
  "Annual saving",
  "Payback (years)",
  "Recommendation",
  "In this year's plan",
];

function csvField(value) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The plan as a CSV the owner can take to a lender, a partner, or their accountant. */
export function toCsv(result) {
  // By id, never by name: two rows may share a label, and a name-keyed set
  // would export a `keep` row as `yes` and collapse the pair in the count.
  const chosen = new Set(result.budget.selected.map((r) => r.id));
  const lines = [CSV_HEADERS.join(",")];
  for (const r of result.rows) {
    lines.push(
      [
        r.name,
        r.annualRepairSpend,
        r.downtimeDays,
        r.dailyLostRevenue,
        r.downtimeCost,
        r.keepAnnualCost,
        r.replacementCost,
        r.resaleValue,
        r.capitalNeeded,
        r.expectedLifeYears,
        r.annualisedCapital,
        r.annualRepairOnNew,
        r.downtimeDaysOnNew,
        r.downtimeCostOnNew,
        r.replaceAnnualCost,
        r.annualSaving,
        r.paybackYears,
        r.recommendation,
        chosen.has(r.id) ? "yes" : "no",
      ].map(csvField).join(","),
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * Three worked rows: one clear replace whose downtime dwarfs its repair bill,
 * one that pays but is beaten on ratio, and one the arithmetic says to keep.
 */
export function sampleRows() {
  return [
    {
      name: "Van 3 (2014 Transit)",
      annualRepairSpend: "6400",
      downtimeDays: "14",
      dailyLostRevenue: "900",
      replacementCost: "42000",
      resaleValue: "4500",
      annualRepairOnNew: "700",
      downtimeDaysOnNew: "1",
      expectedLifeYears: "8",
    },
    {
      name: "Mini excavator",
      annualRepairSpend: "5200",
      downtimeDays: "9",
      dailyLostRevenue: "1200",
      replacementCost: "68000",
      resaleValue: "19000",
      annualRepairOnNew: "1100",
      downtimeDaysOnNew: "2",
      expectedLifeYears: "10",
    },
    {
      name: "Van 1 (2021 Transit)",
      annualRepairSpend: "900",
      downtimeDays: "2",
      dailyLostRevenue: "900",
      replacementCost: "42000",
      resaleValue: "21000",
      annualRepairOnNew: "600",
      downtimeDaysOnNew: "1",
      expectedLifeYears: "8",
    },
  ];
}
