// Weekly "what did recovery do" email to the owner. Pure: builds the numbers
// and the text from the state; the server decides when to send it.
import { formatMoney } from "./dunning.mjs";

export const DIGEST_EVERY_MS = 7 * 86400000;

const byCurrency = (m) => Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1)).map(([cur, minor]) => formatMoney(minor, cur));
const money = (m) => (Object.keys(m).length ? byCurrency(m).join(" + ") : "nothing");

// Counts cases opened and closed in (now - windowMs, now]. Holdout cases are
// reported apart so they never inflate or deflate the recovery rate.
export function buildDigest(state, now, windowMs = DIGEST_EVERY_MS) {
  const since = now - windowMs;
  const d = { since, now, opened: 0, recovered: 0, lost: 0, voided: 0, holdout: 0, recoveredMinor: {}, lostMinor: {}, open: 0, atRiskMinor: {} };
  for (const c of Object.values(state.cases)) {
    if (c.status === "open") {
      d.open += 1; d.atRiskMinor[c.currency] = (d.atRiskMinor[c.currency] || 0) + c.amountMinor;
    }
    if (c.t0 > since && c.t0 <= now) d.opened += 1;
    if (c.arm === "holdout") { if (c.closedAt > since && c.closedAt <= now) d.holdout += 1; continue; }
    if (!(c.closedAt > since && c.closedAt <= now)) continue;
    if (c.status === "recovered") { d.recovered += 1; d.recoveredMinor[c.currency] = (d.recoveredMinor[c.currency] || 0) + c.amountMinor; }
    else if (c.status === "lost") { d.lost += 1; d.lostMinor[c.currency] = (d.lostMinor[c.currency] || 0) + c.amountMinor; }
    else if (c.status === "voided") d.voided += 1;
  }
  const decided = d.recovered + d.lost;
  d.rate = decided ? d.recovered / decided : null;
  return d;
}

export function renderDigest(d, { company = "your company", dryRun = false } = {}) {
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  const lines = [
    `Failed-payment recovery, ${day(d.since)} to ${day(d.now)}${dryRun ? " (DRY RUN: nothing was sent or retried)" : ""}`,
    "",
    `New failed payments:  ${d.opened}`,
    `Recovered:            ${d.recovered} (${money(d.recoveredMinor)})`,
    `Not recovered:        ${d.lost} (${money(d.lostMinor)})`,
    `Still open:           ${d.open} (${money(d.atRiskMinor)} at risk)`,
  ];
  if (d.voided) lines.push(`Voided or cancelled:  ${d.voided}`);
  if (d.holdout) lines.push(`Holdout, left alone:  ${d.holdout} (excluded from the figures above)`);
  if (d.rate !== null) lines.push("", `Of the ${d.recovered + d.lost} cases that finished, ${Math.round(d.rate * 100)}% were recovered.`);
  else lines.push("", "No case finished this week, so there is no recovery rate yet.");
  lines.push("", "Recovered counts invoices that ended up paid, which includes customers who would have paid anyway. Set HOLDOUT_PCT to measure the real uplift.");
  return { subject: `${company}: ${d.recovered} recovered, ${d.open} open this week`, text: lines.join("\n") };
}
