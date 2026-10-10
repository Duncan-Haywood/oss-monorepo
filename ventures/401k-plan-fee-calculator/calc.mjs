// 401(k) plan all-in fee, as a share of plan assets and per participant, against an editable size-based benchmark, plus
// what the excess does to a typical participant balance over time. Pure arithmetic over what the user types in.
// ERISA section 404(a) asks a plan sponsor to make sure the plan's fees are reasonable for the services received, and
// 408(b)(2) service-provider disclosures are where the numbers come from. There is no legal safe-harbor percentage; the
// benchmark table below is an illustrative planning aid the visitor can edit, not a standard.

export const DEFAULT_BENCHMARK_TEXT = [
  "0-1000000: 1.35",
  "1000001-5000000: 1.05",
  "5000001-10000000: 0.85",
  "10000001-25000000: 0.70",
  "25000001+: 0.55",
].join("\n");
export const BENCHMARK_LABEL = "Illustrative all-in cost targets by plan size, in percent of assets per year (edit to match a benchmarking report you trust)";

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (v) => (v === "" || v == null ? 0 : Number(String(v).replace(/[$,%\s]/g, "")));

export function parseBenchmarks(text) {
  const rows = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = /^\$?([\d,]+)\s*(?:-\s*\$?([\d,]+)|(\+))\s*:\s*([\d.]+)\s*%?$/.exec(line);
    if (!m) return errors.push(`Benchmark line ${i + 1}: use "min-max: percent" or "min+: percent".`);
    const min = Number(m[1].replace(/,/g, ""));
    const max = m[3] ? Infinity : Number(m[2].replace(/,/g, ""));
    if (max < min) return errors.push(`Benchmark line ${i + 1}: max is below min.`);
    rows.push({ min, max, pct: Number(m[4]) });
  });
  rows.sort((a, b) => a.min - b.min);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].min <= rows[i - 1].max) errors.push("Benchmark size bands overlap.");
  }
  return { rows, errors };
}

// "fund name, balance, expense ratio %" one per line.
export function parseFunds(text) {
  const funds = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const p = line.split(",").map((s) => s.trim());
    const bal = num(p[1]);
    const er = num(p[2]);
    if (!p[0] || !(p[1] ?? "") || !(p[2] ?? "") || !(bal >= 0) || !(er >= 0) || Number.isNaN(bal) || Number.isNaN(er)) {
      return errors.push(`Fund line ${i + 1}: need "fund name, balance, expense ratio %".`);
    }
    if (er > 5) return errors.push(`Fund line ${i + 1}: expense ratio ${er}% looks wrong; type 0.45 for 0.45%.`);
    funds.push({ name: p[0], balance: bal, er });
  });
  return { funds, errors };
}

export function plan(input) {
  const f = parseFunds(input.funds);
  if (f.errors.length) return { error: f.errors[0], errors: f.errors };
  if (!f.funds.length) return { error: "Add at least one fund: name, balance, expense ratio %." };
  const b = parseBenchmarks(input.benchmarks || DEFAULT_BENCHMARK_TEXT);
  if (b.errors.length) return { error: b.errors[0], errors: b.errors };

  const assets = round2(f.funds.reduce((s, x) => s + x.balance, 0));
  if (assets <= 0) return { error: "Fund balances add to zero; enter the plan's balances." };
  const participants = Math.max(1, Math.round(num(input.participants)) || 0);
  const avgBalance = round2(assets / participants);

  const fundCost = round2(f.funds.reduce((s, x) => s + (x.balance * x.er) / 100, 0));
  const rkBps = num(input.recordkeeperBps);
  const advBps = num(input.advisorBps);
  const lines = [
    { label: "Fund expense ratios", amount: fundCost },
    { label: "Recordkeeper, asset-based", amount: round2((assets * rkBps) / 10000) },
    { label: "Recordkeeper, flat", amount: round2(num(input.recordkeeperFlat)) },
    { label: "Recordkeeper, per participant", amount: round2(num(input.perParticipant) * participants) },
    { label: "Advisor, asset-based", amount: round2((assets * advBps) / 10000) },
    { label: "Advisor, flat", amount: round2(num(input.advisorFlat)) },
    { label: "TPA, audit and other plan expenses", amount: round2(num(input.otherFlat)) },
  ].filter((l) => l.amount > 0);
  const total = round2(lines.reduce((s, l) => s + l.amount, 0));
  const employerPaid = Math.min(total - fundCost, round2(num(input.employerPaid)));
  const participantPaid = round2(total - Math.max(0, employerPaid));
  const allInPct = (participantPaid / assets) * 100;
  const totalPct = (total / assets) * 100;

  const band = b.rows.find((r) => assets >= r.min && assets <= r.max) ?? null;
  const targetPct = band ? band.pct : null;
  const excess = targetPct == null ? null : round2(Math.max(0, ((totalPct - targetPct) / 100) * assets));
  const excessPerParticipant = excess == null ? null : round2(excess / participants);

  // Participant projection: one person with the average balance, same gross return and contributions, at today's all-in
  // cost versus at the benchmark cost. Fees come out of return each year.
  const years = Math.min(50, Math.max(1, Math.round(num(input.years)) || 20));
  const gross = num(input.grossReturn) || 6;
  const contrib = num(input.annualContribution);
  const grow = (feePct) => {
    let bal = avgBalance;
    for (let y = 0; y < years; y++) bal = (bal + contrib) * (1 + (gross - feePct) / 100);
    return round2(bal);
  };
  const atCurrent = grow(allInPct);
  const atTarget = targetPct == null ? null : grow(Math.min(targetPct, allInPct));
  const drag = atTarget == null ? null : round2(atTarget - atCurrent);

  const advice = [`All-in plan cost: $${total.toLocaleString("en-US")} a year, ${totalPct.toFixed(2)}% of $${assets.toLocaleString("en-US")} in assets and $${round2(total / participants).toLocaleString("en-US")} per participant.`];
  if (targetPct == null) advice.push("No benchmark band covers this plan size; add one in the benchmark table.");
  else if (totalPct <= targetPct) advice.push(`That is at or under the ${targetPct.toFixed(2)}% illustrative target for a plan this size. Fees are one part of reasonableness: services received matter as much as price.`);
  else advice.push(`That is ${(totalPct - targetPct).toFixed(2)} points over the ${targetPct.toFixed(2)}% illustrative target: about $${excess.toLocaleString("en-US")} a year ($${excessPerParticipant.toLocaleString("en-US")} per participant) above it.`);
  if (drag != null && drag > 0) advice.push(`For a participant with the average $${avgBalance.toLocaleString("en-US")} balance, ${years} years at ${gross}% gross return${contrib ? ` and $${contrib.toLocaleString("en-US")} a year contributed` : ""}, the excess leaves about $${drag.toLocaleString("en-US")} less at the end.`);
  const biggest = [...lines].sort((a, c) => c.amount - a.amount)[0];
  advice.push(`Largest line: ${biggest.label}, ${((biggest.amount / total) * 100).toFixed(0)}% of the total.`);
  const dear = f.funds.filter((x) => x.er >= 0.75).sort((a, c) => c.er - a.er);
  if (dear.length) advice.push(`Funds at 0.75% or more: ${dear.map((x) => `${x.name} (${x.er.toFixed(2)}%)`).join(", ")}. Ask for a lower-cost share class of the same strategy; some classes carry revenue sharing that pays the recordkeeper.`);
  if (employerPaid > 0) advice.push(`The employer pays $${Math.max(0, employerPaid).toLocaleString("en-US")} of non-fund fees, so participants bear $${participantPaid.toLocaleString("en-US")} (${allInPct.toFixed(2)}% of assets).`);
  advice.push("Next step: ask your recordkeeper for the current 408(b)(2) disclosure and for a fee comparison; document the review in your plan committee minutes.");
  return {
    assets, participants, avgBalance, lines, total, totalPct, participantPaid, allInPct, targetPct, excess, excessPerParticipant,
    years, gross, atCurrent, atTarget, drag, advice: advice.filter(Boolean),
  };
}

export function sampleInput() {
  return {
    participants: 42,
    recordkeeperBps: 20,
    recordkeeperFlat: 1500,
    perParticipant: 35,
    advisorBps: 50,
    advisorFlat: 0,
    otherFlat: 3500,
    employerPaid: 0,
    years: 20,
    grossReturn: 6,
    annualContribution: 6000,
    funds: ["Target Date 2045 (retail share class), 1400000, 0.95", "Large Cap Blend, 600000, 0.82", "Bond Index, 300000, 0.12", "Stable Value, 200000, 0.60"].join("\n"),
    benchmarks: DEFAULT_BENCHMARK_TEXT,
  };
}

export function toCsv(r) {
  const q = (c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c);
  const rows = r.lines.map((l) => [l.label, l.amount.toFixed(2), ((l.amount / r.assets) * 100).toFixed(3)].map(q).join(","));
  return ["item,annual_cost,percent_of_assets", ...rows, `total,${r.total.toFixed(2)},${r.totalPct.toFixed(3)}`].join("\n") + "\n";
}
