/**
 * Overtime pay math, as deterministic functions with no dependencies.
 *
 * Two calculators, because the two questions that come up are genuinely
 * different arithmetic:
 *
 *   - A single hourly rate: how much is owed for a week with overtime hours.
 *     Simple multiplication, but still a common "did I do this right"
 *     search.
 *   - Two or more hourly rates in the *same workweek* (a common shift-diff,
 *     multi-role, or multi-site situation): the FLSA "weighted average" /
 *     "blended rate" method. This is the one people get wrong by hand --
 *     the regular rate is not any single rate entered, it is total
 *     straight-time earnings divided by total hours, and the overtime
 *     premium is *half* that blended rate (not the full rate) for each
 *     overtime hour, because straight-time pay for every hour, including
 *     the overtime ones, is already counted once in the straight-time total.
 *
 * Federal FLSA rules only (29 CFR 778.115, the weighted-average method).
 * Several states apply different or additional rules this calculator does
 * not know about -- daily overtime past 8 hours in a day (e.g. California,
 * Alaska, Nevada, Colorado in some cases), double-time thresholds, or a
 * required minimum overtime rate above 1.5x. See index.html's disclaimer
 * and FAQ for why that line is drawn deliberately, the same shape
 * security-deposit-return-calculator draws around "which jurisdiction's
 * deduction rules apply".
 */

export const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low", INFO: "info" };

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function money(n) {
  const format = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(n));
  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * @param {{hourlyRate: number, hoursWorked: number, overtimeThresholdHours?: number, overtimeMultiplier?: number}} input
 * @returns {{regularHours: number, overtimeHours: number, regularPay: number, overtimePay: number, totalPay: number, overtimeRate: number, findings: Array<{id:string, severity:string, title:string, detail:string}>}}
 */
export function computeSingleRateOvertime({
  hourlyRate,
  hoursWorked,
  overtimeThresholdHours = 40,
  overtimeMultiplier = 1.5,
}) {
  const rate = Number.isFinite(hourlyRate) && hourlyRate > 0 ? hourlyRate : 0;
  const hours = Number.isFinite(hoursWorked) && hoursWorked > 0 ? hoursWorked : 0;
  const threshold = Number.isFinite(overtimeThresholdHours) && overtimeThresholdHours > 0 ? overtimeThresholdHours : 40;
  const multiplier = Number.isFinite(overtimeMultiplier) && overtimeMultiplier > 0 ? overtimeMultiplier : 1.5;

  const regularHours = round2(Math.min(hours, threshold));
  const overtimeHours = round2(Math.max(0, hours - threshold));
  const overtimeRate = round2(rate * multiplier);
  const regularPay = round2(regularHours * rate);
  const overtimePay = round2(overtimeHours * overtimeRate);
  const totalPay = round2(regularPay + overtimePay);

  const findings = [];

  if (rate === 0) {
    findings.push({
      id: "missing-rate",
      severity: SEVERITY.INFO,
      title: "Enter the hourly rate",
      detail: "Regular pay is hours up to the threshold times the rate; overtime pay is hours past the threshold times the rate times the overtime multiplier.",
    });
  }

  if (overtimeHours === 0 && hours > 0) {
    findings.push({
      id: "no-overtime",
      severity: SEVERITY.INFO,
      title: `No overtime -- ${hours} hour(s) is at or under the ${threshold}-hour threshold`,
      detail: "Overtime pay only applies to hours worked past the threshold in the workweek entered.",
    });
  }

  if (multiplier !== 1.5) {
    findings.push({
      id: "nonstandard-multiplier",
      severity: SEVERITY.INFO,
      title: `Using a ${multiplier}x overtime multiplier, not the federal default of 1.5x`,
      detail: "Some states, contracts, or collective bargaining agreements require a higher multiplier (for example double-time past a second threshold). Confirm the correct multiplier for this employee before relying on the total.",
    });
  }

  findings.push(stateRulesNote());

  return { regularHours, overtimeHours, regularPay, overtimePay, totalPay, overtimeRate, findings };
}

/**
 * FLSA weighted-average ("blended rate") overtime, 29 CFR 778.115: when an
 * employee works hours at two or more different rates in the same
 * workweek, the "regular rate" for that week is total straight-time
 * earnings divided by total hours -- not any single rate entered, and not
 * a simple average of the rates. The overtime premium is *half* that
 * blended rate for each hour past the threshold, because straight-time pay
 * for every hour worked (including the overtime hours) is already counted
 * once in the straight-time total below.
 *
 * @param {{entries: Array<{label?: string, hours: number, rate: number}>, overtimeThresholdHours?: number}} input
 * @returns {{totalHours: number, totalStraightTimePay: number, weightedAverageRate: number, overtimeHours: number, overtimePremiumPerHour: number, overtimePremiumPay: number, totalPay: number, lineItems: Array<{label: string, hours: number, rate: number, pay: number}>, findings: Array<{id:string, severity:string, title:string, detail:string}>}}
 */
export function computeWeightedAverageOvertime({ entries, overtimeThresholdHours = 40 }) {
  const threshold = Number.isFinite(overtimeThresholdHours) && overtimeThresholdHours > 0 ? overtimeThresholdHours : 40;
  const list = Array.isArray(entries) ? entries : [];

  const lineItems = list
    .map((e, i) => {
      const hours = Number.isFinite(e?.hours) && e.hours > 0 ? e.hours : 0;
      const rate = Number.isFinite(e?.rate) && e.rate > 0 ? e.rate : 0;
      const label = typeof e?.label === "string" && e.label.trim() ? e.label.trim() : `Rate ${i + 1}`;
      return { label, hours, rate, pay: round2(hours * rate) };
    })
    .filter((e) => e.hours > 0 && e.rate > 0);

  const totalHours = round2(lineItems.reduce((sum, e) => sum + e.hours, 0));
  const totalStraightTimePay = round2(lineItems.reduce((sum, e) => sum + e.pay, 0));
  const weightedAverageRate = totalHours > 0 ? round2(totalStraightTimePay / totalHours) : 0;
  const overtimeHours = round2(Math.max(0, totalHours - threshold));
  const overtimePremiumPerHour = round2(weightedAverageRate * 0.5);
  const overtimePremiumPay = round2(overtimeHours * overtimePremiumPerHour);
  const totalPay = round2(totalStraightTimePay + overtimePremiumPay);

  const findings = [];

  if (lineItems.length === 0) {
    findings.push({
      id: "no-entries",
      severity: SEVERITY.INFO,
      title: "Add at least one hours-and-rate row",
      detail: "Add a row for each distinct hourly rate this employee was paid in the workweek, with the hours worked at that rate.",
    });
    return { totalHours, totalStraightTimePay, weightedAverageRate, overtimeHours, overtimePremiumPerHour, overtimePremiumPay, totalPay, lineItems, findings };
  }

  if (lineItems.length === 1) {
    findings.push({
      id: "single-rate-entered",
      severity: SEVERITY.INFO,
      title: "Only one rate entered",
      detail: "The weighted average of a single rate is just that rate -- this reduces to the ordinary single-rate calculation above. Add a second row if this employee actually worked at more than one rate this week.",
    });
  }

  if (overtimeHours === 0 && totalHours > 0) {
    findings.push({
      id: "no-overtime",
      severity: SEVERITY.INFO,
      title: `No overtime -- ${totalHours} total hour(s) is at or under the ${threshold}-hour threshold`,
      detail: "The blended rate is still shown because it is what straight-time pay was actually calculated from, but no overtime premium applies this week.",
    });
  }

  findings.push({
    id: "blended-rate-explainer",
    severity: SEVERITY.INFO,
    title: `Blended regular rate: ${money(weightedAverageRate)}/hr`,
    detail: `Total straight-time pay (${money(totalStraightTimePay)}) divided by total hours (${totalHours}). The overtime premium is half this rate -- ${money(overtimePremiumPerHour)}/hr -- for each of the ${overtimeHours} overtime hour(s), because straight-time pay for those hours is already included in the total above.`,
  });

  findings.push(stateRulesNote());

  return { totalHours, totalStraightTimePay, weightedAverageRate, overtimeHours, overtimePremiumPerHour, overtimePremiumPay, totalPay, lineItems, findings };
}

function stateRulesNote() {
  return {
    id: "state-rules-note",
    severity: SEVERITY.MEDIUM,
    title: "Federal FLSA rules only -- some states require more",
    detail: "This calculator applies the federal 40-hour weekly threshold and time-and-a-half. Several states add daily overtime (for example past 8 hours in a day), a double-time threshold, or a higher minimum multiplier. Nondiscretionary bonuses and shift differentials can also change the regular rate under FLSA. Check your state's rules and your specific pay policy before relying on this total.",
  };
}

/**
 * The disclaimer that travels with a copied breakdown -- the same reasoning
 * CLAUDE.md records about a shared-link's field allowlist, and the same
 * choice security-deposit-return-calculator's STATEMENT_DISCLAIMER makes:
 * the text leaves this page and its reader may never see the footer.
 */
export const BREAKDOWN_DISCLAIMER =
  "Arithmetic only: this breakdown applies the federal FLSA 40-hour weekly " +
  "threshold and time-and-a-half (or the multiplier entered) and is not a " +
  "legal determination of what is owed. It does not apply any state's daily " +
  "overtime, double-time, or bonus-inclusion rules -- check your state and " +
  "your pay policy before relying on it.";

/**
 * Renders a weighted-average result as the plain-text breakdown a payroll
 * admin or employee can paste into a record or a pay-dispute email --
 * mirroring formatItemizedStatement in security-deposit-return-calculator.
 *
 * @param {ReturnType<typeof computeWeightedAverageOvertime>} result
 * @returns {string}
 */
export function formatWeightedBreakdown(result) {
  const { lineItems = [], totalHours = 0, totalStraightTimePay = 0, weightedAverageRate = 0, overtimeHours = 0, overtimePremiumPerHour = 0, overtimePremiumPay = 0, totalPay = 0 } = result ?? {};

  const lines = ["BLENDED OVERTIME PAY -- WEEKLY BREAKDOWN", ""];
  lines.push("Hours and rates:");
  lineItems.forEach((item, i) => {
    lines.push(`  ${i + 1}. ${item.label} - ${item.hours} hr @ ${money(item.rate)}/hr = ${money(item.pay)}`);
  });
  lines.push("", `Total hours: ${totalHours}`, `Total straight-time pay: ${money(totalStraightTimePay)}`);
  lines.push(`Blended regular rate: ${money(weightedAverageRate)}/hr`);
  lines.push(`Overtime hours: ${overtimeHours} @ ${money(overtimePremiumPerHour)}/hr premium = ${money(overtimePremiumPay)}`);
  lines.push("", `Total pay: ${money(totalPay)}`);
  lines.push("", "--", BREAKDOWN_DISCLAIMER);

  return lines.join("\n");
}
