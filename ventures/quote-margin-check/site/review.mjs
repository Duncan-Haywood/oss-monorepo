import { targetHoursBudget } from "./calc.mjs";

// Transparent pre-send observations for a quote. These are not pricing advice
// or a profitability determination; they point back to the supplied figures.

export function reviewQuote(quote, report) {
  const checks = [];
  const hiddenHours = quote.admin_hours + quote.revision_hours;
  const hoursBudget = targetHoursBudget(quote, report);

  if (report.direct_costs > quote.price) {
    checks.push({ level: "attention", title: "Direct costs exceed the quoted price", detail: `The supplied direct costs are ${quote.currency} ${report.direct_costs.toFixed(2)} against ${quote.currency} ${quote.price.toFixed(2)}.` });
  } else if (report.direct_costs === quote.price) {
    checks.push({ level: "attention", title: "Direct costs use the entire quoted price", detail: `The supplied direct costs use all ${quote.currency} ${quote.price.toFixed(2)} of the quoted price, leaving nothing after direct costs.` });
  }
  if (report.gap_to_target < 0) {
    checks.push({ level: "attention", title: "The quote is below the supplied target", detail: `The arithmetic gap is ${quote.currency} ${Math.abs(report.gap_to_target).toFixed(2)} below the target price.` });
  }
  if (hiddenHours > 0) {
    checks.push({ level: "note", title: "Hidden time is included", detail: `${hiddenHours.toFixed(2)} hours of admin and revisions are included in the effective rate.` });
  }
  if (report.hidden_time_percent >= 25) {
    checks.push({ level: "attention", title: "Hidden time is at least a quarter of the work", detail: `${report.hidden_time_percent.toFixed(1)}% of the supplied hours are admin or revisions. Confirm the scope, revision limit, and client communication time before sending.` });
  }
  if (quote.revision_hours === 0) {
    checks.push({ level: "note", title: "No revision hours are included", detail: "Confirm that the quote scope and revision assumptions match the work you expect to deliver." });
  }
  // Same inequality as "below the supplied target" (price < hours × rate +
  // costs), so this stays a note that names the hour figure rather than a
  // second attention flag on the same arithmetic.
  if (hoursBudget < report.total_hours) {
    checks.push({ level: "note", title: "Target-rate hours budget", detail: `At the supplied target rate, the quote supports ${hoursBudget.toFixed(2)} total hours; the estimate is ${report.total_hours.toFixed(2)}.` });
  } else {
    checks.push({ level: "note", title: "Target-rate hours budget", detail: `The supplied price supports up to ${hoursBudget.toFixed(2)} total hours after direct costs at the target rate.` });
  }
  if (!checks.some((check) => check.level === "attention")) {
    checks.push({ level: "clear", title: "No review flags from these inputs", detail: "Review the scope, assumptions, and arithmetic before relying on this result." });
  }
  return checks;
}

// A workflow prompt, not a recommendation: the quote owner chooses what to do
// after seeing the arithmetic observations above.
export function reviewDecision(report, quote) {
  const checks = reviewQuote(quote, report);
  const attentionCount = checks.filter((check) => check.level === "attention").length;
  if (attentionCount > 0) {
    return {
      tone: "attention",
      title: "Review the flags before deciding",
      detail: `${attentionCount} arithmetic ${attentionCount === 1 ? "flag needs" : "flags need"} your attention. The choice remains yours.`,
    };
  }
  return {
    tone: "clear",
    title: "No arithmetic flags found",
    detail: "You can record your own next step after checking the scope and assumptions.",
  };
}
