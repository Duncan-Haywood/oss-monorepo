// H-1B weighted-lottery odds: registrations by OES wage level in, per-candidate selection odds out.
// Model: each registration carries w entries (Level I=1 ... Level IV=4). Selection without replacement is
// approximated by p = 1 - exp(-lambda * w), with lambda solved so expected selections equal the target. That is the
// standard continuous approximation of successive weighted draws; it is an estimate, not a USCIS simulation.

export const RULES_REVIEWED = "2026-10-06";
export const WEIGHTS = { 1: 1, 2: 2, 3: 3, 4: 4 };
export const DEFAULT_POOL = { 1: 137600, 2: 86000, 3: 68800, 4: 51600 }; // ILLUSTRATIVE shares of ~344,000, not data
export const DEFAULTS = { selections: 100000, advancedShare: 0.3, advancedSelections: 20000 };

export function solveLambda(counts, target) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!(target > 0) || total === 0) return 0;
  if (target >= total) return Infinity;
  const expected = (l) => Object.entries(counts).reduce((s, [lv, n]) => s + n * (1 - Math.exp(-l * WEIGHTS[lv])), 0);
  let lo = 0, hi = 1;
  while (expected(hi) < target) hi *= 2;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (expected(mid) < target) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

const pOf = (lambda, level) => (lambda === Infinity ? 1 : 1 - Math.exp(-lambda * WEIGHTS[level]));

// pool: {1..4: registration counts}. Returns per-level odds, with and without a US master's/doctorate.
export function odds(pool, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const counts = {};
  for (const l of [1, 2, 3, 4]) counts[l] = Math.max(0, Math.round(Number(pool[l]) || 0));
  const total = counts[1] + counts[2] + counts[3] + counts[4];
  const lam1 = solveLambda(counts, o.selections);
  const unsel = {};
  for (const l of [1, 2, 3, 4]) unsel[l] = counts[l] * o.advancedShare * (1 - pOf(lam1, l));
  const lam2 = solveLambda(unsel, o.advancedSelections);
  const byLevel = {};
  for (const l of [1, 2, 3, 4]) {
    const regular = pOf(lam1, l);
    const second = pOf(lam2, l);
    byLevel[l] = { weight: WEIGHTS[l], registrations: counts[l], regular, advanced: regular + (1 - regular) * second };
  }
  const expectedSelected = [1, 2, 3, 4].reduce((s, l) => s + counts[l] * ((1 - o.advancedShare) * byLevel[l].regular + o.advancedShare * byLevel[l].advanced), 0);
  const flat = Math.min(1, o.selections / (total || 1));
  return { total, byLevel, flatOdds: flat, lambda: lam1, expectedSelected, options: o };
}

export function parseCsv(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const delim = lines[0].includes("\t") ? "\t" : ",";
  const head = lines[0].split(delim).map((h) => h.trim().toLowerCase());
  const col = (names) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const iName = col(["name", "candidate", "employee"]), iLvl = col(["level", "wage"]), iAdv = col(["master", "advanced", "degree"]);
  if (iLvl < 0) return { error: "Need a column named wage level (1-4)." };
  return lines.slice(1).map((line, n) => {
    const c = line.split(delim).map((x) => x.trim());
    const level = parseInt(String(c[iLvl]).replace(/[^0-9ivIV]/g, "").replace(/^iv$/i, "4").replace(/^iii$/i, "3").replace(/^ii$/i, "2").replace(/^i$/i, "1"), 10);
    return { name: (iName >= 0 && c[iName]) || `Candidate ${n + 1}`, level, advanced: iAdv >= 0 && /^(y|yes|true|1)/i.test(c[iAdv] || ""), line: n + 2 };
  });
}

export function evaluate(text, pool, opts = {}) {
  const model = odds(pool, opts);
  const people = parseCsv(text);
  if (people.error) return { error: people.error, model };
  const rows = people.map((p) => {
    if (![1, 2, 3, 4].includes(p.level)) return { ...p, error: `Line ${p.line}: wage level must be 1, 2, 3 or 4.` };
    const key = p.advanced ? "advanced" : "regular";
    const prob = model.byLevel[p.level][key];
    const next = p.level < 4 ? model.byLevel[p.level + 1][key] : null;
    return { ...p, prob, flat: model.flatOdds, gainNext: next == null ? null : next - prob };
  });
  const good = rows.filter((r) => !r.error);
  const expected = good.reduce((s, r) => s + r.prob, 0);
  let none = 1;
  for (const r of good) none *= 1 - r.prob;
  return { model, rows, summary: { count: good.length, errors: rows.length - good.length, expected, atLeastOne: good.length ? 1 - none : 0 } };
}

export const pct = (x) => (x * 100).toFixed(1) + "%";

export function sampleList() {
  return "Name,Wage level,US master's or higher\nAsha (data engineer),2,yes\nBen (QA analyst),1,no\nChen (staff SWE),4,yes\nDara (product designer),3,no\nEli (junior dev),1,yes";
}

export function reportCsv(r) {
  const rows = ["name,wage level,advanced degree,selection odds,odds under the old flat lottery,gain from one wage level higher"];
  for (const x of r.rows) {
    if (x.error) rows.push(`"${x.error}"`);
    else rows.push([`"${x.name.replace(/"/g, '""')}"`, x.level, x.advanced ? "yes" : "no", pct(x.prob), pct(x.flat), x.gainNext == null ? "" : (x.gainNext * 100).toFixed(1) + " points"].join(","));
  }
  return rows.join("\n") + "\n";
}
