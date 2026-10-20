/**
 * Freelance court reporter / deposition stenographer pricing math, as two
 * deterministic calculators with no dependencies.
 *
 * Freelance reporters bill in a shape almost no other trade in this
 * portfolio does: a per-page transcript rate that multiplies with
 * turnaround speed, stacked on top of a flat appearance fee, copy fees,
 * exhibit fees, and travel -- and a large share of assignments arrive
 * through an agency quoting one flat number that bundles all of it
 * together. Both calculators total the numbers the reporter already has;
 * neither asserts what a jurisdiction's official transcript-rate schedule
 * requires or what a specific agency contract obligates -- see
 * index.html's disclaimer and FAQ for why that line is drawn deliberately.
 */

export const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low", INFO: "info" };

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function num(v, fallback = 0) {
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

/**
 * Default turnaround multipliers, applied to the reporter's own per-page
 * ordinary rate. These are illustrative starting points, not any court's
 * or agency's official schedule -- turnaround premiums vary by reporter,
 * agency, and jurisdiction, and every one is editable in the UI before it
 * reaches the invoice total.
 */
export const TURNAROUND_TIERS = [
  { id: "ordinary", label: "Ordinary (10 business days)", multiplier: 1 },
  { id: "expedited", label: "Expedited (3 business days)", multiplier: 1.5 },
  { id: "daily", label: "Daily (next business day)", multiplier: 2 },
  { id: "sameday", label: "Same-day / hourly", multiplier: 3 },
];

/**
 * @param {{
 *   pages: number, pageRate: number, turnaroundMultiplier: number,
 *   copies: number, copyRatePerPage: number,
 *   exhibitsCount: number, exhibitRate: number,
 *   roughDraftFee: number, realtimeRequested: boolean, realtimeRatePerPage: number,
 *   appearanceFee: number, travelMiles: number, mileageRate: number,
 *   hoursWorked: number,
 * }} input
 * @returns {{
 *   transcriptFee: number, copiesFee: number, exhibitsFee: number,
 *   roughDraftFee: number, realtimeFee: number, travelFee: number,
 *   appearanceFee: number, totalInvoice: number, effectiveHourlyRate: number|null,
 *   findings: Array<{id:string, severity:string, title:string, detail:string}>,
 * }}
 */
export function computeTranscriptInvoice({
  pages, pageRate, turnaroundMultiplier,
  copies, copyRatePerPage,
  exhibitsCount, exhibitRate,
  roughDraftFee, realtimeRequested, realtimeRatePerPage,
  appearanceFee, travelMiles, mileageRate,
  hoursWorked,
}) {
  const p = num(pages);
  const rate = num(pageRate);
  const multiplier = Number.isFinite(turnaroundMultiplier) && turnaroundMultiplier > 0 ? turnaroundMultiplier : 1;
  const copyCount = num(copies);
  const copyRate = num(copyRatePerPage);
  const exhibits = num(exhibitsCount);
  const exhibitFee = num(exhibitRate);
  const draftFee = num(roughDraftFee);
  const realtimeRate = num(realtimeRatePerPage);
  const appearance = num(appearanceFee);
  const miles = num(travelMiles);
  const mileRate = num(mileageRate);
  const hours = num(hoursWorked);

  const transcriptFee = round2(p * rate * multiplier);
  const copiesFee = round2(copyCount * copyRate * p);
  const exhibitsFee = round2(exhibits * exhibitFee);
  const realtimeFee = realtimeRequested ? round2(p * realtimeRate) : 0;
  const travelFee = round2(miles * mileRate);
  const roughDraft = round2(draftFee);

  const totalInvoice = round2(
    transcriptFee + copiesFee + exhibitsFee + realtimeFee + travelFee + roughDraft + appearance,
  );
  const effectiveHourlyRate = hours > 0 ? round2(totalInvoice / hours) : null;

  const findings = [];

  if (p === 0) {
    findings.push({
      id: "missing-pages",
      severity: SEVERITY.INFO,
      title: "Enter an estimated or final page count",
      detail: "The transcript fee is the page count times your per-page rate times the turnaround multiplier. An estimate is fine before the job -- true it up once the final page count is known.",
    });
  }

  if (rate === 0 && p > 0) {
    findings.push({
      id: "missing-page-rate",
      severity: SEVERITY.MEDIUM,
      title: "No per-page rate entered",
      detail: "Enter your own certified per-page rate for an ordinary transcript. This tool does not know your state's official schedule or your agency's contracted rate -- it only multiplies the number you enter.",
    });
  }

  if (realtimeRequested && realtimeRate === 0) {
    findings.push({
      id: "realtime-without-rate",
      severity: SEVERITY.MEDIUM,
      title: "Realtime was requested but no realtime rate was entered",
      detail: "Realtime feed is usually billed as a per-page uplift on top of the transcript fee. Enter that rate to include it, or uncheck realtime if it isn't part of this job.",
    });
  }

  if (miles > 0 && mileRate === 0) {
    findings.push({
      id: "travel-without-rate",
      severity: SEVERITY.MEDIUM,
      title: "Travel miles entered without a per-mile rate",
      detail: "No travel fee was added. Enter the per-mile rate you bill (many reporters use the current IRS standard mileage rate as a reference point, but it is your rate to set) to include travel in the total.",
    });
  }

  if (hours === 0 && totalInvoice > 0) {
    findings.push({
      id: "missing-hours",
      severity: SEVERITY.INFO,
      title: "Enter total hours to see the effective hourly rate",
      detail: "Include travel time, time at the appearance, and production/transcription time. This is the number that reveals whether a rush job's turnaround premium actually covers the extra hours it costs.",
    });
  }

  findings.push({
    id: "jurisdiction-note",
    severity: SEVERITY.INFO,
    title: "Rates and turnaround multipliers are yours to set",
    detail: "This calculator totals the rates and multipliers you enter -- it does not know any court's official transcript-rate schedule, any agency's contracted rate, or which fees a specific bar or client will accept. Check your own state's rules and any governing contract before invoicing.",
  });

  return {
    transcriptFee, copiesFee, exhibitsFee, roughDraftFee: roughDraft, realtimeFee,
    travelFee, appearanceFee: round2(appearance), totalInvoice, effectiveHourlyRate, findings,
  };
}

/**
 * Whether an agency's flat per-page offer for an assignment is worth the
 * day, expressed the way a reporter actually decides it: dollars per hour
 * once travel, appearance, and production time are all counted -- not the
 * headline page rate alone. Mirrors the "test a flat offer against what it
 * actually pays per hour" check notary-trip-quote runs for signing
 * services, applied to court reporting agency assignments instead.
 *
 * @param {{
 *   pages: number, agencyPageRate: number, agencyAppearanceFee: number,
 *   hoursWorked: number, targetHourlyRate: number,
 * }} input
 * @returns {{
 *   agencyTotalPay: number, effectiveHourlyRate: number|null,
 *   hourlyShortfall: number|null, meetsTarget: boolean|null,
 *   findings: Array<{id:string, severity:string, title:string, detail:string}>,
 * }}
 */
export function computeAgencyOfferCheck({
  pages, agencyPageRate, agencyAppearanceFee, hoursWorked, targetHourlyRate,
}) {
  const p = num(pages);
  const rate = num(agencyPageRate);
  const appearance = num(agencyAppearanceFee);
  const hours = num(hoursWorked);
  const target = num(targetHourlyRate);

  const agencyTotalPay = round2(p * rate + appearance);
  const effectiveHourlyRate = hours > 0 ? round2(agencyTotalPay / hours) : null;
  const hourlyShortfall = effectiveHourlyRate !== null && target > 0
    ? round2(target - effectiveHourlyRate)
    : null;
  const meetsTarget = effectiveHourlyRate !== null && target > 0
    ? effectiveHourlyRate >= target
    : null;

  const findings = [];

  if (p === 0 && rate === 0 && appearance === 0) {
    findings.push({
      id: "no-offer-entered",
      severity: SEVERITY.INFO,
      title: "Enter the agency's offer",
      detail: "Enter the estimated page count, the agency's per-page rate, and any flat appearance fee it is paying on top.",
    });
  }

  if (hours === 0 && agencyTotalPay > 0) {
    findings.push({
      id: "missing-hours",
      severity: SEVERITY.INFO,
      title: "Enter total hours to see the effective hourly rate",
      detail: "Include drive time both ways, time at the appearance, and the production time this turnaround requires -- a fast turnaround that looks like good pay per page can still be a poor hourly rate once production time is counted.",
    });
  }

  if (meetsTarget === false) {
    findings.push({
      id: "below-target",
      severity: SEVERITY.HIGH,
      title: "This offer pays below your target hourly rate",
      detail: `At ${hours} hour${hours === 1 ? "" : "s"} for $${agencyTotalPay.toFixed(2)}, the effective rate is $${effectiveHourlyRate.toFixed(2)}/hr, ${hourlyShortfall.toFixed(2)} below your $${target.toFixed(2)}/hr target.`,
    });
  } else if (meetsTarget === true) {
    findings.push({
      id: "meets-target",
      severity: SEVERITY.INFO,
      title: "This offer meets or exceeds your target hourly rate",
      detail: `Effective rate is $${effectiveHourlyRate.toFixed(2)}/hr against a $${target.toFixed(2)}/hr target.`,
    });
  }

  return { agencyTotalPay, effectiveHourlyRate, hourlyShortfall, meetsTarget, findings };
}

function money(n) {
  const format = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(n));
  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

export const INVOICE_DISCLAIMER =
  "Arithmetic only: this summary totals the rates, pages, and fees entered " +
  "and is not a determination of any court's official transcript-rate " +
  "schedule or a specific agency contract's terms -- check those before " +
  "sending an invoice.";

/**
 * Render an invoice calculation as a plain-text, line-item summary a
 * reporter can paste into an actual invoice or an email to an agency or
 * attorney's office.
 *
 * @param {ReturnType<typeof computeTranscriptInvoice>} result
 * @param {{pages: number, turnaroundLabel: string}} input
 * @returns {string}
 */
export function formatInvoiceSummary(result, { pages, turnaroundLabel } = {}) {
  const {
    appearanceFee = 0, travelFee = 0, transcriptFee = 0, copiesFee = 0,
    exhibitsFee = 0, roughDraftFee = 0, realtimeFee = 0, totalInvoice = 0,
  } = result ?? {};

  const lines = ["DEPOSITION TRANSCRIPT -- INVOICE SUMMARY", ""];
  if (turnaroundLabel) lines.push(`Turnaround: ${turnaroundLabel}`);
  if (Number.isFinite(pages) && pages > 0) lines.push(`Pages: ${pages}`);
  lines.push("");

  if (appearanceFee > 0) lines.push(`Appearance fee: ${money(appearanceFee)}`);
  if (travelFee > 0) lines.push(`Travel: ${money(travelFee)}`);
  if (transcriptFee > 0) lines.push(`Transcript fee: ${money(transcriptFee)}`);
  if (copiesFee > 0) lines.push(`Certified copies: ${money(copiesFee)}`);
  if (exhibitsFee > 0) lines.push(`Exhibits: ${money(exhibitsFee)}`);
  if (roughDraftFee > 0) lines.push(`Rough draft / ASCII: ${money(roughDraftFee)}`);
  if (realtimeFee > 0) lines.push(`Realtime: ${money(realtimeFee)}`);

  lines.push("", `Total: ${money(totalInvoice)}`);
  lines.push("", "--", INVOICE_DISCLAIMER);

  return lines.join("\n");
}
