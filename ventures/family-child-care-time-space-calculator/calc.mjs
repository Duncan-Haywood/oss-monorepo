// Time-space percentage for a family child care home. Pure functions, no DOM.
// Arithmetic on figures the user types. It states the method (IRS Publication 587,
// "Business Use of Your Home", day care facility section) but ships no tax-year
// constants as facts: the simplified-method rate and cap are inputs.

export const DEFAULTS = Object.freeze({
  homeSqft: 0,
  hoursPerWeek: 50,
  prepHoursPerWeek: 5,
  weeksOpen: 50,
  daysAvailable: 365,
  simplifiedRate: 5,
  simplifiedCapSqft: 300,
});

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

const EXCLUSIVE = /^(exclusive|excl|yes|y|true|1)$/i;

// Rooms: "name, sqft, exclusive?" one per line. Header optional.
export function parseRooms(text) {
  const rows = [], warnings = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length < 2) { skipped++; continue; }
    const sqft = num(cells[1], NaN);
    if (!Number.isFinite(sqft)) { if (rows.length || !/sq|area|size|room/i.test(line)) skipped++; continue; }
    if (sqft <= 0) { skipped++; continue; }
    rows.push({ name: cells[0] || "Room", sqft, exclusive: EXCLUSIVE.test(cells[2] || "") });
  }
  if (skipped) warnings.push(`${skipped} room line(s) skipped (need a name and a positive area).`);
  if (!rows.length) return { error: "Add at least one room: name, square feet, and 'exclusive' if it is used only for the business." };
  return { rows, warnings };
}

// Expenses: "name, annual amount" one per line.
export function parseExpenses(text) {
  const rows = [], warnings = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)[,\t]\s*"?(-?\$?[\d,]*\.?\d+)"?\s*$/);
    if (!m) { if (rows.length) skipped++; continue; }
    const name = m[1].trim().replace(/^"|"$/g, "") || "Expense";
    const amount = num(m[2].replace("$", ""), NaN);
    if (!Number.isFinite(amount)) { skipped++; continue; }
    if (amount < 0) { skipped++; continue; }
    rows.push({ name, amount });
  }
  if (skipped) warnings.push(`${skipped} expense line(s) skipped (need a name and a non-negative annual amount).`);
  return { rows, warnings };
}

export function timePct(o) {
  const hours = (o.hoursPerWeek + o.prepHoursPerWeek) * o.weeksOpen;
  const available = 24 * o.daysAvailable;
  return { hours, available, pct: available > 0 ? Math.min(1, hours / available) : 0 };
}

function split(rooms) {
  let exclusive = 0, regular = 0;
  for (const r of rooms) { if (r.exclusive) exclusive += r.sqft; else regular += r.sqft; }
  return { exclusive, regular };
}

export function analyze(rooms, expenses, options = {}) {
  const o = {};
  for (const k of Object.keys(DEFAULTS)) o[k] = num(options[k], DEFAULTS[k]);
  for (const k of Object.keys(o)) if (Number.isNaN(o[k]) || o[k] < 0) return { error: `Check the number in "${k}".` };
  const direct = num(options.directExpenses, 0);
  if (Number.isNaN(direct) || direct < 0) return { error: 'Check the number in "directExpenses".' };
  if (!(o.homeSqft > 0)) return { error: "Enter the total square feet of your home." };
  if (!rooms || !rooms.length) return { error: "Add at least one room." };

  const warnings = [];
  const { exclusive, regular } = split(rooms);
  if (exclusive + regular > o.homeSqft) return { error: `Rooms add up to ${exclusive + regular} sq ft, more than the ${o.homeSqft} sq ft home.` };
  if (o.weeksOpen > 52) return { error: "Weeks open cannot exceed 52." };
  if (o.daysAvailable > 366 || o.daysAvailable <= 0) return { error: "Days available must be between 1 and 366." };
  if (o.hoursPerWeek + o.prepHoursPerWeek > 168) return { error: "Hours per week cannot exceed 168." };

  const t = timePct(o);
  if (t.hours > t.available) warnings.push("Business hours exceed the hours in the period; time share is capped at 100%.");
  if (t.pct > 0.6) warnings.push(`A time share of ${(t.pct * 100).toFixed(0)}% is high. Count only hours the space was actually in business use, and keep a log; hours are the figure most often questioned.`);
  if (regular > 0 && exclusive === 0 && t.pct < 0.1) warnings.push("Time share is under 10% - check hours per week and weeks open.");

  const spaceExclusive = exclusive / o.homeSqft;
  const spaceRegular = regular / o.homeSqft;
  const effective = spaceExclusive + spaceRegular * t.pct;

  const lines = (expenses || []).map((e) => ({
    name: e.name,
    amount: e.amount,
    business: e.amount * effective,
    personal: e.amount * (1 - effective),
  }));
  const indirectTotal = lines.reduce((s, l) => s + l.amount, 0);
  const regularMethod = indirectTotal * effective;

  // Simplified method: rate x allowable area, capped. Area = exclusive + regular x time share.
  const allowableArea = exclusive + regular * t.pct;
  const cappedArea = Math.min(allowableArea, o.simplifiedCapSqft);
  const simplified = cappedArea * o.simplifiedRate;
  const capBinds = allowableArea > o.simplifiedCapSqft;

  // Sensitivity: what each extra weekly hour is worth under the regular method.
  const at = (extra) => {
    const hrs = Math.max(0, o.hoursPerWeek + extra);
    const tp = timePct({ ...o, hoursPerWeek: hrs }).pct;
    const eff = spaceExclusive + spaceRegular * tp;
    return { extraHours: extra, hoursPerWeek: hrs, timePct: tp, effective: eff, deduction: indirectTotal * eff };
  };
  const sensitivity = [-10, -5, 0, 5, 10].map(at);
  const perExtraHour = regularMethod === 0 && indirectTotal === 0 ? 0 : at(1).deduction - at(0).deduction;

  let verdict;
  if (indirectTotal === 0) verdict = "Add home expenses to compare the two methods.";
  else if (regularMethod > simplified) verdict = "Regular method is larger on these figures, before depreciation recapture, record-keeping and Schedule A effects.";
  else if (regularMethod < simplified) verdict = "Simplified method is larger on these figures. It also avoids tracking expenses and depreciation.";
  else verdict = "The two methods are equal on these figures.";

  return {
    options: o,
    time: t,
    area: { home: o.homeSqft, exclusive, regular, spaceExclusive, spaceRegular },
    effective,
    lines,
    totals: { indirect: indirectTotal, business: regularMethod, personal: indirectTotal - regularMethod, direct, regularPlusDirect: regularMethod + direct },
    simplified: { allowableArea, cappedArea, rate: o.simplifiedRate, amount: simplified, capBinds, plusDirect: simplified + direct },
    sensitivity,
    perExtraHour,
    verdict,
    warnings,
  };
}

export function sampleRooms() {
  return "room,sq ft,exclusive\nLiving room,320,\nKitchen,180,\nPlayroom,150,exclusive\nHalf bath,35,\nHallway,60,";
}
export function sampleExpenses() {
  return "Mortgage interest,9600\nProperty tax,3900\nHomeowners insurance,1500\nUtilities,4200\nRepairs and maintenance,1800\nHome depreciation (from your records),6200";
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "");
export function reportCsv(r) {
  const out = [["Expense", "Annual amount", "Business share", "Personal share"]];
  for (const l of r.lines) out.push([l.name, f2(l.amount), f2(l.business), f2(l.personal)]);
  out.push(["Total home expenses", f2(r.totals.indirect), f2(r.totals.business), f2(r.totals.personal)]);
  out.push([]);
  out.push(["Time share", (r.time.pct * 100).toFixed(2) + "%"]);
  out.push(["Effective business-use share", (r.effective * 100).toFixed(2) + "%"]);
  out.push(["Simplified method", f2(r.simplified.amount)]);
  const q = (c) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return out.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export const money = (v) => "$" + Math.round(v).toLocaleString("en-US");
export const money2 = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
