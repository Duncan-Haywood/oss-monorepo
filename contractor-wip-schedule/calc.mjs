// Contractor WIP (work-in-progress) schedule. Pure functions, no DOM, no network.
// Cost-to-cost percent-of-completion: percent complete = cost to date / current estimated total cost, earned
// revenue = percent complete * contract, over/under billing = billed - earned. A job whose estimate exceeds its
// contract carries its whole expected loss now, not as it is spent. Surety-style ratios use balance-sheet figures
// the user supplies. Nothing here is an accounting opinion; it is arithmetic on the numbers entered.

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "n/a");
export const pct = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

const MAX_JOBS = 500;
export const DEFAULTS = {
  stress: 0.05,          // cost growth applied to every estimate for the fade stress test
  singleMultiple: 10,    // planning multiples of working capital; sureties differ and change them
  aggregateMultiple: 20,
  workingCapital: null,  // optional: current assets minus current liabilities as reported
};

const moneyNum = (s) => {
  const t = String(s ?? "").trim();
  if (t === "") return NaN;
  const neg = /^\(.*\)$/.test(t);
  const n = Number(t.replace(/[$,()\s]/g, "").replace(/%$/, ""));
  return neg ? -n : n;
};

export function parseRows(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload one row per job: name, contract amount, estimated total cost, cost to date, billed to date, and optionally the prior estimated cost." };
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const split = (l) => {
    const cells = [];
    let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === delim && !q) { cells.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };
  let rows = lines.map(split);
  let ci = { name: 0, contract: 1, est: 2, cost: 3, billed: 4, prior: 5 };
  const looksHeader = rows[0].some((c) => /[a-z]/i.test(c)) && rows[0].slice(1, 5).every((c) => Number.isNaN(moneyNum(c)));
  if (looksHeader) {
    const head = rows[0].map((h) => h.toLowerCase());
    const used = new Set();
    const pick = (re, fallback) => {
      const i = head.findIndex((h, k) => !used.has(k) && re.test(h));
      const r = i >= 0 ? i : fallback;
      if (r >= 0) used.add(r);
      return r;
    };
    const prior = pick(/prior|previous|last (month|period)|original est|budget at/, -1);
    const billed = pick(/billed|billing|invoiced|billings/, 4);
    const cost = pick(/to date|incurred|spent|actual|job cost/, 3);
    const est = pick(/est|total cost|budget|cost at completion|forecast/, 2);
    const contract = pick(/contract|price|revenue|value|amount/, 1);
    const name = pick(/name|job|project|address|customer/, 0);
    ci = { name, contract, est, cost, billed, prior };
    rows = rows.slice(1);
  }
  const jobs = [];
  rows.forEach((cells, i) => {
    const get = (k) => (ci[k] >= 0 && ci[k] < cells.length ? cells[ci[k]] : "");
    const name = get("name") || `Job ${i + 1}`;
    const contract = moneyNum(get("contract"));
    const est = moneyNum(get("est"));
    const cost = moneyNum(get("cost"));
    const billed = moneyNum(get("billed"));
    const priorRaw = get("prior");
    const prior = priorRaw === "" ? null : moneyNum(priorRaw);
    const bad = (why) => warnings.push(`Skipped "${name}": ${why}.`);
    if (!Number.isFinite(contract) || contract <= 0) return bad("contract amount must be more than zero");
    if (!Number.isFinite(est) || est <= 0) return bad("estimated total cost must be more than zero");
    if (!Number.isFinite(cost) || cost < 0) return bad("cost to date must be zero or more");
    if (!Number.isFinite(billed) || billed < 0) return bad("billed to date must be zero or more");
    if (prior !== null && (!Number.isFinite(prior) || prior <= 0)) return bad("prior estimate must be more than zero (leave blank if none)");
    jobs.push({ name, contract, est, cost, billed, prior });
  });
  if (!jobs.length) return { error: "No usable rows. " + warnings.slice(0, 3).join(" "), warnings };
  if (jobs.length > MAX_JOBS) return { error: `At most ${MAX_JOBS} jobs at a time.`, warnings };
  return { jobs, warnings };
}

// One job under cost-to-cost percent of completion.
export function evaluate(job, growth = 0) {
  const warnings = [];
  const est = job.est * (1 + growth);
  const rawPct = job.cost / est;
  const complete = Math.min(1, rawPct);
  if (rawPct > 1) warnings.push(`"${job.name}": cost to date is above the estimate, so the job is treated as 100% complete. Raise the estimate if work remains.`);
  const earned = complete * job.contract;
  const overUnder = job.billed - earned;                // + overbilled (a liability), - underbilled (an asset)
  const estGross = job.contract - est;
  const loss = estGross < 0;
  // A loss job: the whole expected loss is recognised now. Loss already inside costs-vs-earned is cost - earned.
  const recognisedLoss = loss ? -estGross : 0;
  const lossProvision = loss ? Math.max(0, recognisedLoss - Math.max(0, job.cost - earned)) : 0;
  const grossRecognised = loss ? -recognisedLoss : earned - job.cost;
  const remainingCost = Math.max(0, est - job.cost);
  const remainingBilling = job.contract - job.billed;
  // Cash that finishing the job should still bring in net of what is left to spend. Negative: billed ahead of cost
  // by more than the job's whole margin, so finishing will consume cash already held.
  const cashToCome = remainingBilling - remainingCost;
  return {
    ...job, estUsed: est, pctComplete: complete, earned, overUnder,
    overbilled: overUnder > 0 ? overUnder : 0, underbilled: overUnder < 0 ? -overUnder : 0,
    estGross, estMargin: estGross / job.contract, loss, lossProvision,
    grossRecognised, backlog: job.contract - earned, remainingCost, remainingBilling, cashToCome,
    fundedByYou: Math.max(0, job.cost - job.billed),
    drift: job.prior ? job.est - job.prior : null,
    driftPct: job.prior ? (job.est - job.prior) / job.prior : null,
    warnings,
  };
}

export function analyze(jobs, options = {}) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (options[k] !== undefined && options[k] !== null && !Number.isNaN(options[k])) o[k] = options[k];
  if (!Array.isArray(jobs) || !jobs.length) return { error: "Add at least one job." };
  if (!(o.stress >= 0 && o.stress <= 0.5)) return { error: "Cost-growth stress must be 0% to 50%." };
  if (o.workingCapital !== null && !Number.isFinite(o.workingCapital)) return { error: "Working capital must be a number." };
  if (!(o.singleMultiple > 0 && o.aggregateMultiple > 0)) return { error: "Backlog multiples must be more than zero." };
  const warnings = [];
  const rows = jobs.map((j) => evaluate(j));
  rows.forEach((r) => warnings.push(...r.warnings));
  const stressed = jobs.map((j) => evaluate(j, o.stress));
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const totalContract = sum(rows, (r) => r.contract);
  const earned = sum(rows, (r) => r.earned);
  const billed = sum(rows, (r) => r.billed);
  const over = sum(rows, (r) => r.overbilled);
  const under = sum(rows, (r) => r.underbilled);
  const grossRecognised = sum(rows, (r) => r.grossRecognised);
  const estGross = sum(rows, (r) => r.estGross);
  const backlog = sum(rows, (r) => r.backlog);
  const backlogGross = sum(rows, (r) => r.estGross - r.grossRecognised);
  const stressGross = sum(stressed, (r) => r.estGross);
  const stressRecognised = sum(stressed, (r) => r.grossRecognised);
  const newLosses = stressed.filter((s, i) => s.loss && !rows[i].loss).map((s) => s.name);
  const largest = rows.reduce((m, r) => (r.backlog > m.backlog ? r : m), rows[0]);
  const wc = o.workingCapital;
  const out = {
    options: o, rows, warnings, n: rows.length,
    totalContract, earned, billed, over, under, netOver: over - under,
    grossRecognised, estGross, estMargin: estGross / totalContract,
    backlog, backlogGross, backlogMargin: backlog > 0 ? backlogGross / backlog : NaN,
    lossJobs: rows.filter((r) => r.loss).map((r) => r.name),
    lossProvision: sum(rows, (r) => r.lossProvision),
    cashConsumers: rows.filter((r) => r.cashToCome < 0).map((r) => r.name),
    fundedByYou: sum(rows, (r) => r.fundedByYou),
    stress: { growth: o.stress, estGross: stressGross, gross: stressRecognised, fadeDollars: estGross - stressGross, newLosses },
    largest: { name: largest.name, backlog: largest.backlog },
    surety: null,
  };
  if (wc !== null) {
    const adjWc = wc - under;
    out.surety = {
      workingCapital: wc, adjustedWorkingCapital: adjWc,
      backlogToWc: wc > 0 ? backlog / wc : NaN,
      backlogToAdjWc: adjWc > 0 ? backlog / adjWc : NaN,
      largestToWc: wc > 0 ? largest.backlog / wc : NaN,
      singleCap: o.singleMultiple * wc, aggregateCap: o.aggregateMultiple * wc,
      overSingle: wc > 0 && largest.backlog > o.singleMultiple * wc,
      overAggregate: wc > 0 && backlog > o.aggregateMultiple * wc,
      overbillingShareOfWc: wc > 0 ? over / wc : NaN,
    };
  }
  out.findings = findings(out);
  return out;
}

function findings(r) {
  const f = [];
  if (r.lossJobs.length) f.push({ level: "high", title: `${r.lossJobs.length} job${r.lossJobs.length > 1 ? "s" : ""} expected to lose money`, text: `${r.lossJobs.join(", ")}: the estimate is above the contract, so the whole expected loss belongs in this month's numbers, not spread over the rest of the job. Provision still to book: ${money(r.lossProvision)}.` });
  if (r.cashConsumers.length) f.push({ level: "high", title: "Billed ahead of the cash these jobs can bring in", text: `${r.cashConsumers.join(", ")}: what is left to bill is less than what is left to spend. Finishing will use up cash already in the bank, which is borrowed from the end of the job, not profit.` });
  if (r.netOver > 0 && r.over > 0.1 * r.totalContract) f.push({ level: "medium", title: "Net overbilling is large against contract value", text: `You are billed ${money(r.netOver)} ahead of earned revenue across the schedule. That cash is a liability to finish the work and shrinks if a project slips.` });
  if (r.under > 0.05 * r.totalContract) f.push({ level: "medium", title: "Underbilling is tying up cash", text: `${money(r.under)} of work done is not yet billed. Sureties and banks often exclude underbillings from working capital; billing it moves it to receivables.` });
  const drift = r.rows.filter((x) => x.driftPct !== null && x.driftPct > 0.05);
  if (drift.length) f.push({ level: "medium", title: "Estimates have grown since the prior schedule", text: drift.map((x) => `${x.name} +${pct(x.driftPct, 1)} (${money(x.drift)})`).join("; ") + "." });
  if (r.stress.newLosses.length) f.push({ level: "medium", title: `A ${pct(r.stress.growth, 0)} cost overrun would turn ${r.stress.newLosses.length} more job${r.stress.newLosses.length > 1 ? "s" : ""} into losses`, text: r.stress.newLosses.join(", ") + "." });
  if (r.surety) {
    if (r.surety.overAggregate) f.push({ level: "high", title: "Backlog is above the aggregate planning multiple of working capital", text: `${num(r.surety.backlogToWc, 1)}x working capital against a planning figure of ${r.options.aggregateMultiple}x. Sureties vary; this is a prompt to talk to yours before bidding more.` });
    if (r.surety.overSingle) f.push({ level: "medium", title: `${r.largest.name} is above the single-job planning multiple`, text: `Its remaining backlog is ${num(r.surety.largestToWc, 1)}x working capital against ${r.options.singleMultiple}x.` });
  }
  if (!f.length) f.push({ level: "good", title: "Nothing in this schedule trips a flag", text: "No loss jobs, no job billed past its remaining cost, and no large under- or overbilling. Check that cost to date and estimates are current." });
  return f;
}

export function reportCsv(result) {
  const head = ["job", "contract", "estimated cost", "cost to date", "percent complete", "earned revenue", "billed", "over (+) / under (-) billed", "est gross profit", "est margin", "backlog", "cash still to come"];
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [head.join(",")];
  for (const r of result.rows) lines.push([q(r.name), r.contract, r.est, r.cost, (r.pctComplete * 100).toFixed(1), Math.round(r.earned), r.billed, Math.round(r.overUnder), Math.round(r.estGross), (r.estMargin * 100).toFixed(1), Math.round(r.backlog), Math.round(r.cashToCome)].join(","));
  return lines.join("\n");
}

export function sampleText() {
  return [
    "job,contract,estimated total cost,cost to date,billed to date,prior estimate",
    "Maple St kitchen remodel,86000,68000,51000,70000,64000",
    "Oak Ave addition,240000,198000,92000,150000,190000",
    "Riverside deck,31000,24500,24000,31000,24500",
    "Cedar Rd basement,54000,55200,30000,26000,50000",
    "Lakeview roof,38500,29000,5000,19250,29000",
    "Harbor Dr ADU,310000,262000,141000,155000,255000",
  ].join("\n");
}
