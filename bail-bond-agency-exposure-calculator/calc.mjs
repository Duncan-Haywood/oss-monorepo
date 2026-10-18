// Bail bond agency book exposure.
//
// A bail agent writes bonds for a premium, remits a share to the surety, has a build-up fund (BUF) held back, and stands behind
// every open bond: if a defendant fails to appear and the court forfeits, the agency owes the face amount less whatever collateral
// and recovery it gets. The user types their own bonds and their own surety terms; this module ships no state premium schedule,
// no forfeiture-window table and no legal rule. It adds up what the book earns, what it owes if some defendants do not appear,
// how many of the largest forfeitures the cash on hand would cover, and which court dates are close or already past.

const cents = (n) => Math.round(n * 100) / 100;

function num(v, name, { min = 0, max = Infinity, fallback } = {}) {
  if (v === "" || v === null || v === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${name} is required`);
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  if (n < min || n > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return n;
}
const blank = (b) => !b || ["face", "label"].every((k) => b[k] === "" || b[k] === undefined || b[k] === null);

export function money(n) {
  const v = Math.round(n);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
}

function dayNumber(iso, name) {
  if (iso === "" || iso === null || iso === undefined) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
  if (!m) throw new Error(`${name} must be a date as YYYY-MM-DD`);
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw new Error(`${name} is not a real date`);
  return t / 86400000;
}

export function bookExposure(input) {
  const premiumPct = num(input.premiumPct, "premium rate", { min: 0, max: 100, fallback: 10 });
  const suretyPct = num(input.suretyPct, "share of premium remitted to the surety", { min: 0, max: 100, fallback: 0 });
  const bufPct = num(input.bufPct, "build-up fund withheld", { min: 0, max: 100, fallback: 0 });
  if (suretyPct + bufPct > 100) throw new Error("surety share plus build-up fund cannot exceed 100% of premium");
  const ftaPct = num(input.ftaPct, "expected failure-to-appear rate", { min: 0, max: 100, fallback: 0 });
  const recoveryPct = num(input.recoveryPct, "recovery on uncollateralized forfeitures", { min: 0, max: 100, fallback: 0 });
  const limit = num(input.writingLimit, "surety writing limit", { min: 0, fallback: 0 });
  const reserve = num(input.reserve, "cash reserve", { min: 0, fallback: 0 });
  const windowDays = num(input.windowDays, "look-ahead days", { min: 1, max: 365, fallback: 30 });
  const today = dayNumber(input.today, "today");

  const bonds = [];
  for (const [i, b] of (input.bonds || []).entries()) {
    if (blank(b)) continue;
    const name = String(b.label || "").trim() || `Bond ${i + 1}`;
    const face = num(b.face, `${name} bond amount`, { min: 1 });
    const rate = num(b.premiumPct, `${name} premium rate`, { min: 0, max: 100, fallback: premiumPct });
    const collateral = num(b.collateral, `${name} collateral`, { min: 0, fallback: 0 });
    if (collateral > face) throw new Error(`${name}: collateral cannot exceed the bond amount`);
    const court = dayNumber(b.courtDate, `${name} court date`);
    const premium = cents((face * rate) / 100);
    const uncollateralized = cents(face - collateral);
    const lossIfForfeit = cents((uncollateralized * (100 - recoveryPct)) / 100);
    const daysToCourt = court !== null && today !== null ? court - today : null;
    bonds.push({ label: name, face, premium, collateral, uncollateralized, lossIfForfeit, courtDate: b.courtDate || "", daysToCourt });
  }
  if (!bonds.length) throw new Error("add at least one open bond");

  const sum = (f) => cents(bonds.reduce((s, b) => s + f(b), 0));
  const premium = sum((b) => b.premium);
  const suretyShare = cents((premium * suretyPct) / 100);
  const buf = cents((premium * bufPct) / 100);
  const netPremium = cents(premium - suretyShare - buf);
  const liability = sum((b) => b.face);
  const collateral = sum((b) => b.collateral);
  const uncollateralized = sum((b) => b.uncollateralized);
  const lossIfAllForfeit = sum((b) => b.lossIfForfeit);
  const expectedLoss = cents((lossIfAllForfeit * ftaPct) / 100);
  const expectedNet = cents(netPremium - expectedLoss);
  const breakEvenFtaPct = lossIfAllForfeit > 0 ? Math.round((netPremium / lossIfAllForfeit) * 10000) / 100 : null;

  // Cash that stands behind forfeitures: the reserve plus the fund the surety holds back.
  const cash = cents(reserve + buf);
  let left = cash;
  let covered = 0;
  const forfeitable = bonds.filter((b) => b.lossIfForfeit > 0).sort((a, b) => b.lossIfForfeit - a.lossIfForfeit);
  for (const b of forfeitable) {
    if (left >= b.lossIfForfeit) { left = cents(left - b.lossIfForfeit); covered++; } else break;
  }
  const shortfall = cents(Math.max(0, lossIfAllForfeit - cash));
  const largest = forfeitable[0] || null;

  const upcoming = bonds.filter((b) => b.daysToCourt !== null && b.daysToCourt >= 0 && b.daysToCourt <= windowDays).sort((a, b) => a.daysToCourt - b.daysToCourt);
  const pastDue = bonds.filter((b) => b.daysToCourt !== null && b.daysToCourt < 0).sort((a, b) => a.daysToCourt - b.daysToCourt);
  const undated = bonds.filter((b) => b.daysToCourt === null);

  const flags = [];
  if (limit > 0 && liability > limit) flags.push({ level: "high", text: `Open liability ${money(liability)} is over the surety writing limit you typed (${money(limit)}).` });
  else if (limit > 0 && liability / limit >= 0.8) flags.push({ level: "medium", text: `Open liability is ${Math.round((liability / limit) * 100)}% of the writing limit you typed.` });
  if (shortfall > 0) flags.push({ level: "high", text: `If every forfeitable bond went bad, cash on hand (${money(cash)}) would fall ${money(shortfall)} short.` });
  if (largest && largest.lossIfForfeit > cash) flags.push({ level: "high", text: `${largest.label} alone (${money(largest.lossIfForfeit)} at risk) is more than the cash on hand.` });
  if (largest && lossIfAllForfeit > 0 && largest.lossIfForfeit / lossIfAllForfeit >= 0.5 && forfeitable.length > 1) flags.push({ level: "medium", text: `${largest.label} is ${Math.round((largest.lossIfForfeit / lossIfAllForfeit) * 100)}% of the book's forfeiture risk.` });
  if (pastDue.length) flags.push({ level: "high", text: `${pastDue.length} bond(s) show a court date that has passed and are still listed open: confirm exoneration or a forfeiture notice.` });
  if (breakEvenFtaPct !== null && ftaPct > breakEvenFtaPct) flags.push({ level: "high", text: `Your expected failure-to-appear rate (${ftaPct}%) is above the break-even rate (${breakEvenFtaPct}%).` });

  return { bonds, premium, suretyShare, buf, netPremium, liability, collateral, uncollateralized, lossIfAllForfeit, expectedLoss, expectedNet, breakEvenFtaPct,
    cash, covered, forfeitableCount: forfeitable.length, shortfall, largest, upcoming, pastDue, undated, flags, windowDays,
    utilizationPct: limit > 0 ? Math.round((liability / limit) * 1000) / 10 : null };
}

// A plain call list for the weekly court-date round: who to remind, in date order, past dates first.
export function callList(r) {
  const line = (b) => `${b.courtDate || "no date"}  ${b.label}  ${money(b.face)} bond${b.collateral ? `, ${money(b.collateral)} collateral` : ", no collateral"}`;
  const out = [`Court-date call list (next ${r.windowDays} days)`, ""];
  if (r.pastDue.length) { out.push("Past the court date, still open - confirm outcome:"); r.pastDue.forEach((b) => out.push("  " + line(b))); out.push(""); }
  if (r.upcoming.length) { out.push("Upcoming - call the defendant and the indemnitor:"); r.upcoming.forEach((b) => out.push(`  ${line(b)}  (${b.daysToCourt === 0 ? "today" : b.daysToCourt + " days"})`)); }
  else out.push("No court dates in the window.");
  if (r.undated.length) { out.push("", "No court date typed:"); r.undated.forEach((b) => out.push("  " + b.label)); }
  return out.join("\n");
}
