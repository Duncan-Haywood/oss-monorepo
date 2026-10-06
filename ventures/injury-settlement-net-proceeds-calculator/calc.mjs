// Injury settlement net-proceeds worksheet. Pure functions, no network, no DOM.
// Walks a gross settlement down to what the client actually receives: attorney fee (on gross or on gross less costs),
// case costs, liens and reimbursement claims (each with a negotiated reduction), the Medicare pro-rata procurement-cost
// reduction (42 CFR 411.37), tax on the taxable slice (punitive damages, interest), and any set-aside. Every rate is an
// input; nothing here is a state or plan table that could go stale.

export const SAMPLE = {
  gross: 150000,
  feePct: 33.33,
  feeBasis: "gross",
  costs: 6500,
  taxablePortion: 20000,
  taxRate: 24,
  setAside: 0,
  liens: [
    "Health insurer reimbursement, 22000, 30",
    "Medicare conditional payments, 9000",
    "Hospital lien, 14000, 40",
    "Medical provider balance, 3500, 50",
  ].join("\n"),
};

export const dollars = (n) =>
  (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

const num = (v) => {
  if (v === "" || v === null || v === undefined) return NaN;
  return Number(String(v).replace(/[$,%\s]/g, ""));
};

export function parseLiens(text) {
  const liens = [], errors = [];
  String(text ?? "").split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const parts = line.split(",").map((p) => p.trim());
    // label may itself contain no commas; amount is the first numeric field after it.
    const amount = num(parts[1]);
    const reduction = parts[2] === undefined || parts[2] === "" ? 0 : num(parts[2]);
    if (!parts[0] || !Number.isFinite(amount) || amount < 0) {
      errors.push(`Lien line ${i + 1} needs "name, amount" (optional third field: negotiated reduction %).`);
      return;
    }
    if (!Number.isFinite(reduction) || reduction < 0 || reduction > 100) {
      errors.push(`Lien line ${i + 1}: the reduction must be between 0 and 100 percent.`);
      return;
    }
    liens.push({ label: parts[0], amount, reduction, medicare: /medicare/i.test(parts[0]) });
  });
  return { liens, errors };
}

// One settlement, already validated numbers. Medicare's reduction is the procurement-cost share (fee + costs) / gross
// applied to the demand; it replaces, not stacks with, a negotiated percentage on the same line.
export function settle(p) {
  const fee = (p.feePct / 100) * (p.feeBasis === "net" ? Math.max(0, p.gross - p.costs) : p.gross);
  const procurement = p.gross > 0 ? Math.min(1, (fee + p.costs) / p.gross) : 0;
  const liens = p.liens.map((l) => {
    const cut = l.medicare ? procurement : l.reduction / 100;
    const owed = l.amount * (1 - cut);
    return { ...l, cut, owed, saved: l.amount - owed };
  });
  const lienTotal = liens.reduce((a, l) => a + l.owed, 0);
  const lienFace = liens.reduce((a, l) => a + l.amount, 0);
  const tax = (Math.min(p.taxablePortion, p.gross) * p.taxRate) / 100;
  const net = p.gross - fee - p.costs - lienTotal - tax - p.setAside;
  return { fee, procurement, liens, lienTotal, lienFace, tax, net, gross: p.gross };
}

function normalise(raw) {
  const errors = [];
  const gross = num(raw.gross);
  if (!Number.isFinite(gross) || gross <= 0) errors.push("Enter the gross settlement amount.");
  const field = (v, name, max = Infinity, dflt = 0) => {
    if (v === "" || v === undefined || v === null) return dflt;
    const n = num(v);
    if (!Number.isFinite(n) || n < 0 || n > max) { errors.push(`${name} looks wrong.`); return dflt; }
    return n;
  };
  const feePct = field(raw.feePct, "Attorney fee %", 100);
  const costs = field(raw.costs, "Case costs");
  const taxablePortion = field(raw.taxablePortion, "Taxable portion");
  const taxRate = field(raw.taxRate, "Tax rate", 100);
  const setAside = field(raw.setAside, "Set-aside");
  const feeBasis = raw.feeBasis === "net" ? "net" : "gross";
  const { liens, errors: le } = parseLiens(raw.liens);
  errors.push(...le);
  return { errors, p: { gross, feePct, feeBasis, costs, taxablePortion, taxRate, setAside, liens } };
}

// Smallest gross at which the client nets `target`, found by bisection (net is increasing in gross).
export function grossForNet(p, target) {
  let lo = 0, hi = Math.max(1, p.gross) * 50;
  if (settle({ ...p, gross: hi }).net < target) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (settle({ ...p, gross: mid }).net >= target) hi = mid; else lo = mid;
  }
  return hi;
}

export function compute(raw) {
  const { errors, p } = normalise(raw);
  if (errors.length) return { errors };
  const s = settle(p);
  const sweep = [0.5, 0.75, 1, 1.25, 1.5, 2].map((m) => {
    const r = settle({ ...p, gross: p.gross * m });
    return { gross: r.gross, net: r.net, pct: r.gross ? r.net / r.gross : 0 };
  });
  const other = settle({ ...p, feeBasis: p.feeBasis === "net" ? "gross" : "net" });
  const noNegotiation = settle({ ...p, liens: p.liens.map((l) => (l.medicare ? l : { ...l, reduction: 0 })) });
  const findings = [];
  const pct = s.gross ? s.net / s.gross : 0;
  if (s.net < 0) findings.push({ severity: "high", title: `Fees, costs and liens exceed the settlement by ${dollars(-s.net)}. Ask the attorney and each lienholder for written reductions before accepting.` });
  else if (pct < 0.4) findings.push({ severity: "high", title: `The client keeps ${(pct * 100).toFixed(0)}% of the gross. Liens are the lever: ask each holder for a pro-rata reduction in writing.` });
  if (s.liens.some((l) => l.medicare)) findings.push({ severity: "medium", title: "Medicare line: the amount to repay comes from Medicare's final demand, not from this estimate. Treat the procurement-cost reduction here as the expected shape, and get the final demand letter before disbursing." });
  const unreduced = s.liens.filter((l) => !l.medicare && l.cut === 0 && l.amount > 0);
  if (unreduced.length) findings.push({ severity: "medium", title: `${unreduced.length} lien(s) have no reduction entered (${unreduced.map((l) => l.label).join("; ")}). Holders often accept less, because the settlement exists only through the attorney's work. Full payment would cost you ${dollars(noNegotiation.lienTotal - s.lienTotal)} more than your entered reductions assume.` });
  if (p.taxablePortion > 0) findings.push({ severity: "medium", title: `${dollars(p.taxablePortion)} is treated as taxable at ${p.taxRate}%: ${dollars(s.tax)} set aside. Damages for physical injury are generally not taxed, but punitive damages and interest are; a tax adviser should confirm the split.` });
  const diff = other.net - s.net;
  if (Math.abs(diff) >= 1) findings.push({ severity: "info", title: `Fee on ${p.feeBasis === "gross" ? "gross" : "net of costs"}: if the agreement used the other basis the client would net ${dollars(other.net)} (${diff > 0 ? "+" : ""}${dollars(diff)}). Check the agreement's wording.` });
  if (s.liens.some((l) => l.amount > 0)) findings.push({ severity: "info", title: `Liens as billed ${dollars(s.lienFace)}; as entered after reductions ${dollars(s.lienTotal)}.` });
  const gross50 = grossForNet(p, 50000);
  return { errors: [], p, s, sweep, findings, targets: { gross50k: gross50 } };
}

export function summaryText(r) {
  const { s, p } = r;
  const rows = [
    ["Gross settlement", s.gross],
    [`Attorney fee (${p.feePct}% of ${p.feeBasis === "net" ? "gross less costs" : "gross"})`, -s.fee],
    ["Case costs", -p.costs],
    ...s.liens.map((l) => [`${l.label} (${(l.cut * 100).toFixed(0)}% off ${dollars(l.amount)})`, -l.owed]),
    ["Tax set aside on taxable portion", -s.tax],
    ["Other set-aside", -p.setAside],
  ];
  const lines = rows.map(([k, v]) => `${k.padEnd(58)} ${dollars(v).padStart(12)}`);
  lines.push("-".repeat(71), `${"Client nets".padEnd(58)} ${dollars(s.net).padStart(12)}  (${s.gross ? ((s.net / s.gross) * 100).toFixed(1) : 0}% of gross)`);
  return lines.join("\n");
}

export function sweepCsv(r) {
  return ["gross,net_to_client,percent_of_gross", ...r.sweep.map((x) => `${Math.round(x.gross)},${Math.round(x.net)},${(x.pct * 100).toFixed(1)}`)].join("\n") + "\n";
}
