// SBIR / STTR proposal budget builder. Pure functions, nothing leaves the browser.
//
// Builds the cost categories of an SF424 R&R-style budget (senior/key persons, other personnel, fringe, equipment,
// travel, other direct costs, subawards, indirect, fee) and checks the two things reviewers and contracting officers
// reject proposals for: the share of work the small business keeps, and fee above the usual ceiling.
//
// Program rules used as DEFAULTS (SBA SBIR/STTR Policy Directive; the solicitation always controls and every one is an input):
//   SBIR Phase I  : small business performs at least 66.67% of the work
//   SBIR Phase II : small business performs at least 50%
//   STTR          : small business at least 40%, research institution at least 30%, both phases
//   Fee / profit  : commonly capped at 7% of total costs
// "Share of work" is approximated by cost, excluding fee, which is how most agencies ask for it to be shown.

export const PROGRAMS = {
  "sbir-1": { label: "SBIR Phase I", minSmallBusiness: 66.67, minResearchInstitution: 0 },
  "sbir-2": { label: "SBIR Phase II", minSmallBusiness: 50, minResearchInstitution: 0 },
  "sttr-1": { label: "STTR Phase I", minSmallBusiness: 40, minResearchInstitution: 30 },
  "sttr-2": { label: "STTR Phase II", minSmallBusiness: 40, minResearchInstitution: 30 },
};

export const INDIRECT_BASES = {
  mtdc: "Modified total direct costs (excludes equipment and subaward amounts over $25,000 each)",
  tdc: "Total direct costs",
  salary: "Salaries and wages only",
  none: "No indirect (fee only)",
};

export const SUBAWARD_TYPES = ["university", "company", "consultant"];

export const DEFAULTS = {
  program: "sbir-1",
  months: 6,
  personnel: "Dr. A. Founder, PI, 140000, 25\nB. Engineer, Engineer, 110000, 50",
  fringeRate: 25,
  salaryCap: 0,
  equipment: 0,
  materials: 8000,
  travel: 3000,
  otherDirect: 0,
  subawards: "State University, university, 40000",
  indirectBase: "mtdc",
  indirectRate: 45,
  feeRate: 7,
  feeCeiling: 7,
  awardMax: 0,
  minSmallBusiness: 66.67,
  minResearchInstitution: 0,
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

const round2 = (x) => Math.round(x * 100) / 100;

function splitLine(line) {
  return line.split(",").map((s) => s.trim());
}

// "Name, Role, annual salary, % effort" per line. Blank lines and lines starting with # are skipped.
export function parsePersonnel(text) {
  const rows = [];
  const problems = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const [name, role, salary, effort] = splitLine(line);
    const s = num(salary);
    const e = num(effort);
    if (!name || !Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e < 0) {
      problems.push(`Personnel line ${i + 1} ("${line}") needs: name, role, annual salary, % effort.`);
      return;
    }
    rows.push({ name, role: role || "", salary: s, effort: e });
  });
  return { rows, problems };
}

// "Name, university|company|consultant, amount" per line.
export function parseSubawards(text) {
  const rows = [];
  const problems = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const [name, type, amount] = splitLine(line);
    const a = num(amount);
    const t = (type || "").toLowerCase();
    if (!name || !SUBAWARD_TYPES.includes(t) || !Number.isFinite(a) || a < 0) {
      problems.push(`Subaward line ${i + 1} ("${line}") needs: name, university|company|consultant, amount.`);
      return;
    }
    rows.push({ name, type: t, amount: a });
  });
  return { rows, problems };
}

export function analyze(input) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    if (input && input[k] !== undefined && input[k] !== null) o[k] = input[k];
  }
  const n = (k) => (Number.isFinite(num(o[k])) ? num(o[k]) : 0);
  const warnings = [];
  const months = n("months");
  const negatives = ["fringeRate", "salaryCap", "equipment", "materials", "travel", "otherDirect", "indirectRate", "feeRate", "feeCeiling", "awardMax", "minSmallBusiness", "minResearchInstitution"].filter((k) => n(k) < 0);
  if (negatives.length) return { opts: o, warnings: negatives.map((k) => `${k} cannot be negative.`), result: null };
  if (!(months > 0)) {
    return { opts: o, warnings: ["Project length in months must be above zero."], result: null };
  }

  const pp = parsePersonnel(o.personnel);
  const sp = parseSubawards(o.subawards);
  warnings.push(...pp.problems, ...sp.problems);

  const cap = n("salaryCap");
  const people = pp.rows.map((p) => {
    const base = cap > 0 ? Math.min(p.salary, cap) : p.salary;
    const calendarMonths = (p.effort / 100) * months;
    const personMonths = round2((p.effort / 100) * months);
    const cost = base * (p.effort / 100) * (months / 12);
    if (p.effort > 100) warnings.push(`${p.name} is charged at ${p.effort}% effort, which is more than full time.`);
    if (cap > 0 && p.salary > cap) warnings.push(`${p.name}'s salary of ${money(p.salary)} is over the cap of ${money(cap)}; the budget uses the cap.`);
    return { ...p, chargedSalary: base, calendarMonths: round2(calendarMonths), personMonths, cost: round2(cost) };
  });
  const personnel = round2(people.reduce((s, p) => s + p.cost, 0));
  const fringe = round2(personnel * (n("fringeRate") / 100));
  const equipment = n("equipment");
  const materials = n("materials");
  const travel = n("travel");
  const otherDirect = n("otherDirect");
  const subs = sp.rows;
  const subTotal = round2(subs.reduce((s, x) => s + x.amount, 0));
  const directOwn = round2(personnel + fringe + equipment + materials + travel + otherDirect);
  const direct = round2(directOwn + subTotal);

  const subExcess = round2(subs.reduce((s, x) => s + Math.max(0, x.amount - 25000), 0));
  let indirectBase;
  switch (o.indirectBase) {
    case "tdc": indirectBase = direct; break;
    case "salary": indirectBase = personnel; break;
    case "none": indirectBase = 0; break;
    default: indirectBase = Math.max(0, round2(direct - equipment - subExcess));
  }
  const indirectRate = o.indirectBase === "none" ? 0 : n("indirectRate");
  const indirect = round2(indirectBase * (indirectRate / 100));
  const totalCosts = round2(direct + indirect);
  const feeRate = n("feeRate");
  const fee = round2(totalCosts * (feeRate / 100));
  const price = round2(totalCosts + fee);

  const smallBusinessCost = round2(totalCosts - subTotal);
  const researchCost = round2(subs.filter((s) => s.type === "university").reduce((s, x) => s + x.amount, 0));
  const sbShare = totalCosts > 0 ? smallBusinessCost / totalCosts : 0;
  const riShare = totalCosts > 0 ? researchCost / totalCosts : 0;
  const minSb = n("minSmallBusiness");
  const minRi = n("minResearchInstitution");

  const checks = [];
  checks.push({
    name: "Small business share of work",
    value: sbShare,
    required: minSb / 100,
    ok: minSb <= 0 || sbShare * 100 + 1e-9 >= minSb,
    detail: `${pct(sbShare)} of costs stay with the small business; the requirement entered is ${minSb}%.`,
  });
  if (minRi > 0) {
    checks.push({
      name: "Research institution share of work",
      value: riShare,
      required: minRi / 100,
      ok: riShare * 100 + 1e-9 >= minRi,
      detail: `${pct(riShare)} of costs go to a university or research institution; the requirement entered is ${minRi}%.`,
    });
  }
  const feeCeiling = n("feeCeiling");
  checks.push({
    name: "Fee within ceiling",
    value: feeRate / 100,
    required: feeCeiling / 100,
    ok: feeCeiling <= 0 || feeRate <= feeCeiling + 1e-9,
    detail: `Fee entered is ${feeRate}% of total costs; ceiling entered is ${feeCeiling}%.`,
  });
  const awardMax = n("awardMax");
  if (awardMax > 0) {
    checks.push({
      name: "Within solicitation maximum",
      value: price,
      required: awardMax,
      ok: price <= awardMax + 0.005,
      detail: `Total price ${money(price)} against a maximum of ${money(awardMax)} (${money(awardMax - price)} of headroom).`,
    });
  }

  // How much more could go to subawards before the small-business floor is breached?
  // The constraint is (costs - subs) / costs >= m, with subawards raising costs one-for-one (ignoring indirect on them).
  let subHeadroom = null;
  if (minSb > 0 && minSb < 100 && smallBusinessCost > 0) {
    const maxSubs = (smallBusinessCost * (1 - minSb / 100)) / (minSb / 100);
    subHeadroom = Math.max(0, round2(maxSubs - subTotal));
  }

  const sf424 = [
    ["A. Senior/key persons and other personnel", personnel],
    ["Fringe benefits", fringe],
    ["C. Equipment", equipment],
    ["Materials and supplies", materials],
    ["D. Travel", travel],
    ["F. Other direct costs", otherDirect],
    ["Subawards / consultants", subTotal],
    ["G. Total direct costs", direct],
    ["H. Indirect costs", indirect],
    ["I. Total direct and indirect costs", totalCosts],
    ["Fee / profit", fee],
    ["Total price", price],
  ];

  const feeScenarios = [0, 3, 5, 7].map((r) => ({ rate: r, fee: round2(totalCosts * (r / 100)), price: round2(totalCosts * (1 + r / 100)) }));

  return {
    opts: o, warnings, people, subs, personnel, fringe, equipment, materials, travel, otherDirect, subTotal,
    direct, indirectBase, indirectRate, indirect, totalCosts, fee, price, sbShare, riShare, checks, subHeadroom, sf424, feeScenarios,
    result: { price, totalCosts },
    allOk: checks.every((c) => c.ok),
  };
}

export function toCsv(a) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = ["Line,Amount"];
  for (const [k, v] of a.sf424) lines.push(`${q(k)},${v.toFixed(2)}`);
  lines.push("", "Person,Role,Annual salary,% effort,Person-months,Cost");
  for (const p of a.people) lines.push([q(p.name), q(p.role), p.chargedSalary, p.effort, p.personMonths, p.cost.toFixed(2)].join(","));
  lines.push("", "Subaward,Type,Amount");
  for (const s of a.subs) lines.push([q(s.name), s.type, s.amount.toFixed(2)].join(","));
  lines.push("", "Check,Result,Detail");
  for (const c of a.checks) lines.push([q(c.name), c.ok ? "ok" : "FAILS", q(c.detail)].join(","));
  return lines.join("\n");
}
