// CD and Treasury ladder planner. Pure functions, no dependencies, nothing leaves the browser. The user types
// the rates they can get today (term in months, APY %, kind cd|treasury); this builds an equally spaced ladder,
// converts every rate to AFTER-TAX yield (Treasury interest is exempt from state income tax, CD interest is
// not), and compares the ladder with putting everything in the longest term or rolling the shortest term,
// across parallel shifts in the rates available after today.
//
// Model:
//   after-tax yield   cd = apy * (1 - fed - state)          treasury = apy * (1 - fed)
//   growth over m mo  (1 + after-tax yield)^(m/12)           (tax paid yearly, approximated by compounding)
//   curve(m)          linear interpolation of the typed quotes of the chosen kind (flat beyond the ends)
//   ladder            `rungs` rungs, rung j buys term j*spacing today. When rung j matures it is reinvested
//                     for the time left to the horizon H = rungs*spacing at curve(left) + shift.
//   all longest       everything bought at curve(H) today, held to H (no shift touches it).
//   all shortest      everything in `spacing`-month terms, rolled to H; rolls after today earn curve(spacing)+shift.
// The shift is a one-time parallel move in market rates right after today. Accrued interest is valued at H
// whether or not the last roll has matured; early-withdrawal penalties are not modelled.

export const DEFAULTS = {
  amount: 100000,
  rungs: 5,
  spacingMonths: 12,
  fedPct: 24,
  statePct: 5,
  kind: "cd",
  quotesText: [
    "3, 4.20, cd", "6, 4.35, cd", "12, 4.40, cd", "24, 4.00, cd", "36, 3.85, cd", "60, 3.80, cd",
    "3, 4.05, treasury", "6, 4.00, treasury", "12, 3.85, treasury", "24, 3.75, treasury", "36, 3.80, treasury", "60, 3.90, treasury",
  ].join("\n"),
};

export const SHIFTS = [-2, -1, 0, 1, 2];

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => {
  const sign = x < 0 ? "-" : "";
  return `${sign}$${Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
export const money0 = (x) => money(Math.round(x)).replace(/\.00$/, "");
export const pct = (x, d = 2) => `${(x * 100).toFixed(d)}%`;

export function parseQuotes(text) {
  const quotes = [], problems = [];
  String(text ?? "").split(/\r?\n/).forEach((line, idx) => {
    if (!line.trim()) return;
    const parts = line.split(/[,;\t]+/).map((p) => p.trim()).filter((p) => p !== "");
    const months = num(parts[0]), apy = num(parts[1]);
    const kind = (parts[2] || "cd").toLowerCase().replace(/[^a-z]/g, "");
    const k = /^(t|tb|bill|bond|note|treasury|treasuries|tbill|tnote)$/.test(kind) ? "treasury" : "cd";
    if (!(months > 0) || !Number.isFinite(apy) || apy < 0) problems.push(`Line ${idx + 1} ("${line.trim()}") needs months, APY % and optionally cd or treasury.`);
    else quotes.push({ months, apy: apy / 100, kind: k });
  });
  quotes.sort((a, b) => a.months - b.months);
  return { quotes, problems };
}

export function afterTax(apy, kind, fed, state) {
  return kind === "treasury" ? apy * (1 - fed) : apy * (1 - fed - state);
}

// Linear interpolation of an after-tax yield curve through points [{months, y}], flat outside the range.
export function curveAt(points, m) {
  if (m <= points[0].months) return points[0].y;
  const last = points[points.length - 1];
  if (m >= last.months) return last.y;
  for (let i = 1; i < points.length; i++) {
    if (m <= points[i].months) {
      const a = points[i - 1], b = points[i];
      return b.months === a.months ? b.y : a.y + ((b.y - a.y) * (m - a.months)) / (b.months - a.months);
    }
  }
  return last.y;
}

const grow = (y, months) => Math.pow(1 + y, months / 12);

export function scenario(points, o, shift) {
  const { amount, rungs, spacingMonths: L } = o;
  const H = rungs * L, s = shift / 100;
  const per = amount / rungs;
  let ladder = 0;
  for (let j = 1; j <= rungs; j++) {
    const first = per * grow(curveAt(points, j * L), j * L);
    const left = H - j * L;
    ladder += left > 0 ? first * grow(curveAt(points, left) + s, left) : first;
  }
  const longest = amount * grow(curveAt(points, H), H);
  let shortest = amount * grow(curveAt(points, L), L); // first roll at today's rate
  for (let t = L; t < H; t += L) shortest *= grow(curveAt(points, L) + s, Math.min(L, H - t));
  return { ladder, longest, shortest };
}

export function analyze(raw = {}) {
  const o = { ...DEFAULTS };
  for (const k of ["amount", "rungs", "spacingMonths", "fedPct", "statePct"]) if (raw[k] !== undefined && Number.isFinite(Number(raw[k]))) o[k] = Number(raw[k]);
  if (raw.kind === "cd" || raw.kind === "treasury") o.kind = raw.kind;
  if (typeof raw.quotesText === "string") o.quotesText = raw.quotesText;
  o.rungs = Math.round(o.rungs);
  o.spacingMonths = Math.round(o.spacingMonths);
  const warnings = [];
  if (!(o.amount > 0)) return { opts: o, ok: false, warnings: ["Enter the amount you want to ladder."] };
  if (!(o.rungs >= 2 && o.rungs <= 20)) return { opts: o, ok: false, warnings: ["Use between 2 and 20 rungs."] };
  if (!(o.spacingMonths >= 1 && o.spacingMonths <= 60)) return { opts: o, ok: false, warnings: ["Use a spacing between 1 and 60 months."] };
  if (o.fedPct < 0 || o.statePct < 0 || o.fedPct + o.statePct >= 100) return { opts: o, ok: false, warnings: ["Tax rates must be zero or more and add to under 100%."] };
  const { quotes, problems } = parseQuotes(o.quotesText);
  warnings.push(...problems);
  const fed = o.fedPct / 100, state = o.statePct / 100;
  const mine = quotes.filter((q) => q.kind === o.kind);
  if (!mine.length) return { opts: o, ok: false, warnings: [...warnings, `Add at least one ${o.kind} quote (months, APY %, ${o.kind}).`] };
  const H = o.rungs * o.spacingMonths;
  if (mine[mine.length - 1].months < H) warnings.push(`Your longest ${o.kind} quote is ${mine[mine.length - 1].months} months but the ladder reaches ${H}; the last rungs use that quote's rate. Add a longer quote for a truer answer.`);
  if (mine.length === 1) warnings.push("With one quote the curve is flat, so every rung earns the same rate.");
  const points = mine.map((q) => ({ months: q.months, y: afterTax(q.apy, q.kind, fed, state) }));

  const rungsOut = [];
  for (let j = 1; j <= o.rungs; j++) {
    const m = j * o.spacingMonths;
    const y = curveAt(points, m);
    const exact = mine.some((q) => q.months === m);
    rungsOut.push({ rung: j, months: m, amount: o.amount / o.rungs, afterTaxYield: y, interpolated: !exact, maturity: o.amount / o.rungs * grow(y, m) });
  }
  const blended = rungsOut.reduce((s, r) => s + r.afterTaxYield, 0) / o.rungs;
  const rows = SHIFTS.map((sh) => ({ shift: sh, ...scenario(points, o, sh) }));
  const today = rows.find((r) => r.shift === 0);

  // Treasury vs CD at each term quoted in both kinds.
  const compare = [];
  for (const c of quotes.filter((q) => q.kind === "cd")) {
    const t = quotes.find((q) => q.kind === "treasury" && q.months === c.months);
    if (!t) continue;
    const cdAt = afterTax(c.apy, "cd", fed, state), trAt = afterTax(t.apy, "treasury", fed, state);
    compare.push({ months: c.months, cdApy: c.apy, treasuryApy: t.apy, cdAfterTax: cdAt, treasuryAfterTax: trAt, winner: trAt > cdAt ? "Treasury" : "CD" });
  }
  const firstYearShare = rungsOut.filter((r) => r.months <= 12).length / o.rungs;
  return {
    opts: o, ok: true, warnings, horizon: H, rungs: rungsOut, blended, rows, compare,
    ladderGain: today.ladder - today.shortest, longestGain: today.longest - today.ladder,
    firstAccessMonths: o.spacingMonths, firstYearShare,
    interest: today.ladder - o.amount,
    shiftWinners: rows.map((r) => ({ shift: r.shift, winner: [["Ladder", r.ladder], ["All longest", r.longest], ["Roll shortest", r.shortest]].sort((a, b) => b[1] - a[1])[0][0] })),
  };
}

export function toCsv(a) {
  const lines = ["rung,months,amount,after_tax_yield_pct,value_at_maturity"];
  for (const r of a.rungs) lines.push([r.rung, r.months, r.amount.toFixed(2), (r.afterTaxYield * 100).toFixed(3), r.maturity.toFixed(2)].join(","));
  return lines.join("\n") + "\n";
}
