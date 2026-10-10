// EU Pay Transparency Directive (2023/970) Art. 9 reporting indicators, computed from a pasted pay table.
// Gap = (men - women) / men x 100, so a positive gap means men are paid more. Pure functions; no I/O.

export const JOINT_ASSESSMENT_THRESHOLD = 5; // Art. 10: gap of 5% or more in a category, unexplained, unremedied in 6 months

const r2 = (x) => Math.round(x * 100) / 100;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const gap = (men, women) => (men == null || women == null || men === 0 ? null : r2(((men - women) / men) * 100));

const COLS = {
  gender: ["gender", "sex"],
  category: ["category", "grade", "role", "job", "level", "band"],
  base: ["base", "salary", "pay", "basic", "basepay"],
  variable: ["variable", "bonus", "complementary", "extra"],
  hours: ["hours", "annualhours", "fte"],
};
const DEFAULT_ORDER = ["gender", "category", "base", "variable", "hours"];

export function normGender(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (["f", "female", "woman", "w", "femme", "frau"].includes(s)) return "F";
  if (["m", "male", "man", "homme", "mann"].includes(s)) return "M";
  return "other";
}

function splitLine(line, d) {
  return line.split(d).map((c) => c.trim().replace(/^"|"$/g, ""));
}
const num = (v) => {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[\s€$£]/g, "").replace(/,(?=\d{3}\b)/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

export function parseRows(text) {
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste one row per worker: gender, category, annual base pay, annual bonus, annual hours." };
  const first = lines[0];
  const d = first.includes("\t") ? "\t" : first.includes(";") ? ";" : ",";
  let order = DEFAULT_ORDER;
  let body = lines;
  const head = splitLine(first, d).map((c) => c.toLowerCase().replace(/[^a-z]/g, ""));
  const looksHeader = head.some((h) => Object.values(COLS).flat().includes(h)) && head.every((h) => Number.isNaN(Number(h)) || h === "");
  if (looksHeader) {
    order = head.map((h) => Object.keys(COLS).find((k) => COLS[k].includes(h)) ?? null);
    body = lines.slice(1);
    if (!order.includes("gender") || !order.includes("base")) return { error: "The header row needs at least a gender column and a base pay column." };
  }
  const rows = [];
  let skipped = 0;
  for (const line of body) {
    const cells = splitLine(line, d);
    const rec = {};
    order.forEach((k, i) => { if (k) rec[k] = cells[i]; });
    const base = num(rec.base);
    const variable = num(rec.variable) ?? 0;
    const hours = num(rec.hours);
    if (base == null || Number.isNaN(base) || base < 0 || Number.isNaN(variable) || variable < 0 || (hours != null && (Number.isNaN(hours) || hours <= 0))) { skipped++; continue; }
    rows.push({ gender: normGender(rec.gender), category: (rec.category || "").trim() || "(no category)", base, variable, hours: hours ?? null });
  }
  if (!rows.length) return { error: "No usable rows. Each row needs a gender and a numeric base pay." };
  return { rows, skipped };
}

const hourly = (r, field) => (r.hours ? r[field] / r.hours : r[field]);
const total = (r) => hourly(r, "base") + hourly(r, "variable");

export function obligation(headcount) {
  const n = Number(headcount);
  if (!Number.isFinite(n) || n < 1) return null;
  if (n >= 150) return "With 150 or more workers the Directive requires an annual pay gap report, first due 7 June 2027 (covering 2026), subject to your member state's transposing law.";
  if (n >= 100) return "With 100 to 149 workers the Directive requires a pay gap report every three years, first due 7 June 2031, subject to your member state's transposing law.";
  return "Under 100 workers there is no mandatory pay gap report under the Directive, but its pay-range disclosure to applicants and workers' right to pay information apply to every employer. Some member states set a lower threshold.";
}

export function analyze(text, opts = {}) {
  const parsed = parseRows(text);
  if (parsed.error) return { error: parsed.error };
  const { rows, skipped } = parsed;
  const F = rows.filter((r) => r.gender === "F");
  const M = rows.filter((r) => r.gender === "M");
  const other = rows.length - F.length - M.length;
  if (!F.length || !M.length) return { error: `Need at least one woman and one man in the data (found ${F.length} women, ${M.length} men).` };

  const side = (g, f) => g.map((r) => f(r));
  const pay = {
    meanF: mean(side(F, total)), meanM: mean(side(M, total)),
    medF: median(side(F, total)), medM: median(side(M, total)),
  };
  const recF = F.filter((r) => r.variable > 0), recM = M.filter((r) => r.variable > 0);
  const vr = (g) => g.map((r) => hourly(r, "variable"));
  const variable = {
    meanF: mean(vr(recF)), meanM: mean(vr(recM)), medF: median(vr(recF)), medM: median(vr(recM)),
    shareF: r2((recF.length / F.length) * 100), shareM: r2((recM.length / M.length) * 100),
  };

  const ranked = [...F, ...M].sort((a, b) => total(a) - total(b));
  const quartiles = [0, 1, 2, 3].map((q) => {
    const slice = ranked.filter((_, i) => Math.floor((i * 4) / ranked.length) === q);
    const f = slice.filter((r) => r.gender === "F").length;
    return { quartile: q + 1, women: f, men: slice.length - f, womenPct: slice.length ? r2((f / slice.length) * 100) : 0 };
  });

  const cats = [...new Set([...F, ...M].map((r) => r.category))].sort();
  const categories = cats.map((c) => {
    const f = F.filter((r) => r.category === c), m = M.filter((r) => r.category === c);
    const row = { category: c, women: f.length, men: m.length, comparable: f.length > 0 && m.length > 0 };
    if (row.comparable) {
      row.basicGap = gap(mean(side(m, (r) => hourly(r, "base"))), mean(side(f, (r) => hourly(r, "base"))));
      row.totalGap = gap(mean(side(m, total)), mean(side(f, total)));
      const vf = f.filter((r) => r.variable > 0), vm = m.filter((r) => r.variable > 0);
      row.variableGap = vf.length && vm.length ? gap(mean(vr(vm)), mean(vr(vf))) : null;
      row.flag = Math.abs(row.totalGap) >= JOINT_ASSESSMENT_THRESHOLD;
    }
    return row;
  });

  const noHours = rows.filter((r) => !r.hours).length;
  const flagged = categories.filter((c) => c.flag);
  const result = {
    counts: { women: F.length, men: M.length, other, skipped, noHours },
    meanGap: gap(pay.meanM, pay.meanF), medianGap: gap(pay.medM, pay.medF),
    variableMeanGap: gap(variable.meanM, variable.meanF), variableMedianGap: gap(variable.medM, variable.medF),
    variable, quartiles, categories, flagged,
    obligation: obligation(opts.headcount ?? rows.length),
  };
  result.advice = advice(result);
  return result;
}

function advice(r) {
  const out = [];
  const dir = (g) => (g > 0 ? "women are paid less" : g < 0 ? "men are paid less" : "no difference");
  out.push(`Mean gender pay gap in hourly pay: ${r.meanGap}% (${dir(r.meanGap)}); median gap: ${r.medianGap}%.`);
  if (r.flagged.length) out.push(`${r.flagged.length} worker categor${r.flagged.length === 1 ? "y has" : "ies have"} a mean pay gap of ${JOINT_ASSESSMENT_THRESHOLD}% or more: ${r.flagged.map((c) => `${c.category} (${c.totalGap}%)`).join(", ")}. Under Art. 10 that triggers a joint pay assessment with worker representatives unless the gap is justified by objective, gender-neutral criteria or remedied within six months.`);
  else out.push(`No comparable category reaches a ${JOINT_ASSESSMENT_THRESHOLD}% mean gap in this data.`);
  if (r.counts.noHours) out.push(`${r.counts.noHours} row(s) had no hours, so their annual pay was used as the pay level. The Directive compares hourly pay; part-time and full-time are not comparable without hours.`);
  if (r.counts.other) out.push(`${r.counts.other} row(s) with a gender other than F or M were left out of every figure, since the indicators compare women and men.`);
  const small = r.categories.filter((c) => c.comparable && (c.women < 2 || c.men < 2));
  if (small.length) out.push(`${small.length} categor${small.length === 1 ? "y has" : "ies have"} only one worker of a gender, so its gap is one person's pay. Group such categories before publishing.`);
  return out;
}

export function sampleInput() {
  return [
    "gender,category,base,bonus,hours",
    "F,Engineer,62000,3000,1800", "F,Engineer,60000,2500,1800", "M,Engineer,66000,5000,1800", "M,Engineer,64000,4500,1800", "M,Engineer,65000,0,1800",
    "F,Support,34000,0,1800", "F,Support,35000,500,1800", "F,Support,33500,0,1200", "M,Support,35500,0,1800", "M,Support,34500,500,1800",
    "F,Manager,82000,9000,1800", "M,Manager,90000,15000,1800", "M,Manager,88000,12000,1800",
  ].join("\n");
}

export function toCsv(r) {
  const out = [["indicator", "women", "men", "gap_pct"]];
  out.push(["mean hourly pay gap", "", "", r.meanGap], ["median hourly pay gap", "", "", r.medianGap]);
  out.push(["mean variable pay gap (recipients)", "", "", r.variableMeanGap], ["median variable pay gap (recipients)", "", "", r.variableMedianGap]);
  out.push(["share receiving variable pay (%)", r.variable.shareF, r.variable.shareM, ""]);
  for (const q of r.quartiles) out.push([`pay quartile ${q.quartile} (count)`, q.women, q.men, ""]);
  for (const c of r.categories) out.push([`"category: ${c.category}"`, c.women, c.men, c.comparable ? c.totalGap : "not comparable"]);
  return out.map((x) => x.join(",")).join("\n");
}
