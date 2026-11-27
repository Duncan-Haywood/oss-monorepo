// Progress billing on a draw schedule: a contract split into stages (milestones), each billed
// when it is reached, with an optional deposit credited back and optional retainage held.
//
// This is the billing most remodelers, small GCs and residential subs do instead of a full
// schedule of values: "25% at rough-in, 25% at drywall, ...". The schedule of values
// calculator (calc.mjs) covers the line-by-line percent-complete method.
//
// Per stage, in integer cents:
//   value            = its share of the contract (a percent of the contract sum, or a dollar amount)
//   deposit credit   = the deposit spread over the stages in proportion to value ("spread"),
//                      or all of it on the first stage invoiced ("first"), or the last ("last")
//   retainage        = value x retainage rate, rounded per stage (on the work, not the deposit)
//   net due          = value - deposit credit - retainage
// The invoice now = the stages reached and not yet invoiced. Percent shares are rounded with the
// largest remainder so shares that add to 100% add to the contract sum to the cent.
//
// Pure functions, no I/O. It checks the arithmetic of the user's own schedule; it makes no
// claim about what a contract or a state's home-improvement law allows.
import { parseCsv, parseMoney, dollars, csvCell } from "./colog.mjs";
import { toRate } from "./calc.mjs";

export { dollars };

const HEADERS = {
  stage: /^(stage|draw|milestone|phase|description|item|name|payment|step)$/,
  share: /^(share|percent|%|pct|amount|value|\$|draw amount|draw %|portion)$/,
  status: /^(status|state|done|reached|complete|billed|invoiced)$/,
};

// "billed" (reached and already invoiced), "done" (reached, bill it now), anything else: not yet.
export function normStatus(s) {
  const t = String(s ?? "").trim().toLowerCase();
  if (/^(billed|invoiced|paid|sent|previous|prev|previously billed)$/.test(t)) return "billed";
  if (/^(done|reached|complete|completed|finished|yes|y|x|bill|bill now|now|ready)$/.test(t)) return "done";
  return "open";
}

function readShare(raw) {
  const s = String(raw ?? "").trim();
  if (s === "") return { kind: "empty" };
  if (/%\s*$/.test(s)) {
    const r = toRate(s);
    return Number.isNaN(r) ? { kind: "bad" } : { kind: "pct", rate: r };
  }
  const c = parseMoney(s);
  return c == null ? { kind: "bad" } : { kind: "amt", cents: c };
}

/**
 * @param {string} text stage list, CSV or tab-separated: stage, share (25% or 21000), status
 *   (done / billed / blank). A header row is optional.
 * @param {{contract?: string, deposit?: string, depositApply?: "spread"|"first"|"last", retainage?: string, project?: string}} settings
 */
export function compute(text, settings = {}) {
  const errors = [];
  const warnings = [];
  const contract = parseMoney(settings.contract);
  const deposit = String(settings.deposit ?? "").trim() === "" ? 0 : parseMoney(settings.deposit);
  const ret = toRate(settings.retainage ?? "");
  const apply = ["spread", "first", "last"].includes(settings.depositApply) ? settings.depositApply : "spread";
  if (contract == null || contract <= 0) errors.push("Contract sum must be an amount above zero.");
  if (deposit == null || deposit < 0) errors.push("Deposit must be an amount, or blank.");
  if (!(ret >= 0 && ret < 1)) errors.push("Retainage must be a percent from 0 to under 100, or blank.");

  let rows = parseCsv(text).filter((r) => r.some((c) => String(c).trim() !== ""));
  let idx = { stage: 0, share: 1, status: 2 };
  if (rows.length) {
    const head = {};
    rows[0].forEach((h, i) => {
      const t = String(h).trim().toLowerCase();
      for (const [k, re] of Object.entries(HEADERS)) if (head[k] == null && re.test(t)) { head[k] = i; break; }
    });
    if (head.stage != null && head.share != null) { idx = { status: -1, ...head }; rows = rows.slice(1); }
  }
  const stages = [];
  rows.forEach((r, i) => {
    const name = String(r[idx.stage] ?? "").trim() || `Stage ${i + 1}`;
    const share = readShare(r[idx.share]);
    if (share.kind === "bad") errors.push(`${name}: "${String(r[idx.share]).trim()}" is not a percent or an amount.`);
    else if (share.kind === "empty") errors.push(`${name}: no share (type a percent like 25% or an amount like 21000).`);
    else if ((share.kind === "pct" && share.rate <= 0) || (share.kind === "amt" && share.cents <= 0)) errors.push(`${name}: the share must be above zero.`);
    stages.push({ name, share, status: idx.status >= 0 ? normStatus(r[idx.status]) : "open" });
  });
  if (!stages.length) errors.push("Add at least one stage: a name, its share, and done or billed once it is reached.");
  if (errors.length) return { errors, warnings, stages: [] };

  // Values: percent stages by largest remainder (exact when all percents add to 100%).
  const raw = stages.map((s) => (s.share.kind === "pct" ? contract * s.share.rate : s.share.cents));
  const values = raw.map(Math.floor);
  const pctIdx = stages.map((s, i) => (s.share.kind === "pct" ? i : -1)).filter((i) => i >= 0);
  const pctTotal = pctIdx.reduce((a, i) => a + stages[i].share.rate, 0);
  if (pctIdx.length && Math.abs(pctTotal - 1) < 1e-9 && pctIdx.length === stages.length) {
    let left = contract - values.reduce((a, b) => a + b, 0);
    const order = [...pctIdx].sort((a, b) => (raw[b] - values[b]) - (raw[a] - values[a]) || a - b);
    for (const i of order) { if (left <= 0) break; values[i] += 1; left -= 1; }
  } else {
    pctIdx.forEach((i) => { values[i] = Math.round(raw[i]); });
  }
  const scheduled = values.reduce((a, b) => a + b, 0);
  if (scheduled !== contract) {
    const diff = contract - scheduled;
    warnings.push(diff > 0
      ? `The stages add to ${dollars(scheduled)}, ${dollars(diff)} less than the contract sum: that much is never billed. Add it to a stage or a final draw.`
      : `The stages add to ${dollars(scheduled)}, ${dollars(-diff)} more than the contract sum: the schedule bills more than the contract.`);
  }
  if (deposit > contract) errors.push("The deposit is more than the contract sum.");
  if (errors.length) return { errors, warnings, stages: [] };

  // Deposit credit per stage.
  const credit = values.map(() => 0);
  if (deposit > 0) {
    if (apply === "spread") {
      let given = 0;
      values.forEach((v, i) => { credit[i] = Math.floor((deposit * v) / scheduled); given += credit[i]; });
      let left = deposit - given;
      const order = values.map((v, i) => [((deposit * v) % scheduled), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map((x) => x[1]);
      for (const i of order) { if (left <= 0) break; credit[i] += 1; left -= 1; }
    } else {
      // All of it on the first (or last) stage, spilling to the next if that stage is smaller.
      const order = values.map((_, i) => i);
      if (apply === "last") order.reverse();
      let left = deposit;
      for (const i of order) { const c = Math.min(left, values[i]); credit[i] = c; left -= c; if (!left) break; }
    }
  }

  const out = stages.map((s, i) => {
    const retainage = Math.round(values[i] * ret);
    const net = values[i] - credit[i] - retainage;
    return { ...s, value: values[i], credit: credit[i], retainage, net, pctOfContract: values[i] / contract };
  });
  out.forEach((s) => {
    if (s.net < 0) warnings.push(`${s.name}: the deposit credit and retainage are more than the stage is worth, so it bills ${dollars(s.net)}. Spread the deposit, or credit it on a larger stage.`);
  });
  // A stage marked reached after an earlier one that is still open: not wrong, often a typo.
  const firstOpen = out.findIndex((s) => s.status === "open");
  if (firstOpen >= 0) {
    const later = out.slice(firstOpen + 1).filter((s) => s.status !== "open");
    if (later.length) warnings.push(`${later.map((s) => s.name).join(", ")} ${later.length === 1 ? "is" : "are"} marked reached while ${out[firstOpen].name}, earlier in the schedule, is not. Check the order or the status.`);
  }
  const sum = (f, list = out) => list.reduce((a, s) => a + f(s), 0);
  const now = out.filter((s) => s.status === "done");
  const billed = out.filter((s) => s.status === "billed");
  const reached = [...billed, ...now];
  const invoice = { value: sum((s) => s.value, now), credit: sum((s) => s.credit, now), retainage: sum((s) => s.retainage, now), net: sum((s) => s.net, now) };
  const totals = {
    contract,
    scheduled,
    deposit,
    reachedValue: sum((s) => s.value, reached),
    billedBefore: sum((s) => s.value, billed),
    creditApplied: sum((s) => s.credit, reached),
    retainageHeld: sum((s) => s.retainage, reached),
    left: contract - sum((s) => s.value, reached),
    depositUnapplied: deposit - sum((s) => s.credit, reached),
  };
  if (!now.length) warnings.push("No stage is marked done, so there is nothing to invoice now. Mark the stage you have reached as done.");
  // A deposit bigger than the first stage it is meant to cover leaves the owner paying for work not done yet.
  const firstValue = out[0].value;
  if (deposit > 0 && deposit > firstValue) warnings.push(`The deposit (${dollars(deposit)}) is more than the first stage (${dollars(firstValue)}). Some states cap home-improvement deposits; check the rule where the job is before taking it.`);
  return { errors, warnings, stages: out, invoice, totals, settings: { contract, deposit, retainage: ret, apply, project: String(settings.project ?? "").trim() } };
}

const c2 = (c) => (c / 100).toFixed(2);

export function scheduleCsv(result) {
  const head = ["Stage", "Share of contract", "Value", "Deposit credit", "Retainage", "Net due", "Status"];
  const rows = result.stages.map((s) => [s.name, `${(s.pctOfContract * 100).toFixed(2)}%`, c2(s.value), c2(s.credit), c2(s.retainage), c2(s.net), s.status === "billed" ? "billed" : s.status === "done" ? "bill now" : "not reached"]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

// Invoice text: only computed figures, no legal wording.
export function invoiceText(result, { number = "", date = "" } = {}) {
  const { invoice: inv, totals: t, settings: s } = result;
  const now = result.stages.filter((x) => x.status === "done");
  const lines = [];
  lines.push(`Progress invoice${number ? ` ${number}` : ""}${s.project ? ` - ${s.project}` : ""}${date ? ` - ${date}` : ""}`);
  lines.push("");
  lines.push(`Contract sum: ${dollars(t.contract)}`);
  lines.push("Stages billed on this invoice:");
  for (const x of now) lines.push(`  ${x.name} (${(x.pctOfContract * 100).toFixed(1)}%): ${dollars(x.value)}`);
  lines.push(`Work billed this invoice: ${dollars(inv.value)}`);
  if (inv.credit) lines.push(`Less deposit applied: -${dollars(inv.credit)}`);
  if (inv.retainage) lines.push(`Less retainage held (${(s.retainage * 100).toFixed(1).replace(/\.0$/, "")}%): -${dollars(inv.retainage)}`);
  lines.push(`Amount due this invoice: ${dollars(inv.net)}`);
  lines.push("");
  lines.push(`Billed in earlier invoices: ${dollars(t.billedBefore)}`);
  lines.push(`Billed to date, with this invoice: ${dollars(t.reachedValue)}`);
  if (t.deposit) {
    lines.push(`Deposit received: ${dollars(t.deposit)}`);
    lines.push(`Deposit applied to date: ${dollars(t.creditApplied)}`);
    lines.push(`Deposit still to apply: ${dollars(t.depositUnapplied)}`);
  }
  if (t.retainageHeld) lines.push(`Retainage held to date: ${dollars(t.retainageHeld)}`);
  lines.push(`Left to bill: ${dollars(t.left)}`);
  return lines.join("\n");
}

export const SAMPLE_SETTINGS = { project: "Kitchen remodel, 14 Elm St", contract: "84000", deposit: "8400", depositApply: "spread", retainage: "" };
export const SAMPLE = [
  "Stage,Share,Status",
  "Demolition and rough framing,15%,billed",
  "Rough plumbing and electrical passed,20%,billed",
  "Drywall and cabinets set,30%,done",
  "Countertops and fixtures,25%,",
  "Final walkthrough and punch list,10%,",
].join("\n");
