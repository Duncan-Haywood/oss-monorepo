// Per-treatment economics for a med spa or aesthetics clinic. Pure functions,
// no dependencies. Every figure is arithmetic on numbers the owner types.

const nn = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : 0);
const r2 = (x) => Math.round(x * 100) / 100;

export const money = (x) =>
  (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
export const pct = (x) => (x === null || !Number.isFinite(x) ? "n/a" : (x * 100).toFixed(1) + "%");

// One pasted line into cells. A line with a tab is a spreadsheet paste: split on tabs only, so
// "1,200" stays one number. Otherwise read it as CSV: a cell that starts with a double quote keeps
// its commas ("$1,200") and "" inside it is a literal quote; a quote later in a cell (17" rims) is text.
export function splitCells(line) {
  const unq = (c) => { c = c.trim(); return /^".*"$/s.test(c) ? c.slice(1, -1).replace(/""/g, '"') : c; };
  if (line.includes("\t")) return line.split("\t").map(unq);
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch !== '"') cur += ch;
      else if (line[i + 1] === '"') { cur += '"'; i++; }
      else q = false;
    } else if (ch === '"' && cur.trim() === "") { cur = ""; q = true; }
    else if (ch === ",") { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// True when an unquoted thousands comma has split one number in two: more cells than the line
// has columns, or a "$1" or "$12" cell followed by a three-digit cell ("$1,200" read as "$1" and
// "200"). "$720,520" stays two numbers: a $720 price and a 520 cost is an ordinary line.
// Reading on would shift every later field into the wrong column, so such a line is refused.
export function looksSplitNumber(cells, columns) {
  if (cells.length > columns) return true;
  return cells.some((c, i) => /^\$\d{1,2}$/.test(c) && /^\d{3}(\.\d*)?$/.test(cells[i + 1] ?? ""));
}

// One treatment per line: name, price, product cost, minutes, visits per month.
// Separator is a comma or a tab (so a spreadsheet paste works). Bad lines are
// reported rather than silently dropped.
export function parseTreatments(text) {
  const rows = [];
  const bad = [];
  const split = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = splitCells(line);
    if (/^name$/i.test(parts[0])) continue; // header row from a paste
    if (looksSplitNumber(parts, 5)) { bad.push(line); split.push(line); continue; }
    const [name, price, product, minutes, volume] = parts;
    const nums = [price, product, minutes, volume === undefined || volume === "" ? "0" : volume].map((s) =>
      Number(String(s ?? "").replace(/[$,\s]/g, "")));
    if (!name || parts.length < 4 || nums.some((n) => !Number.isFinite(n) || n < 0) || nums[2] <= 0) {
      bad.push(line);
      continue;
    }
    rows.push({ name, price: nums[0], product: nums[1], minutes: nums[2], volume: nums[3] });
  }
  return { rows, bad, split };
}

// cost basis for one visit. providerRate and roomRate are $/hour.
export function treatmentEconomics(t, { providerRate, roomRate, turnoverMinutes, feePct, targetMargin }) {
  const roomMinutes = t.minutes + nn(turnoverMinutes);
  const fee = t.price * (nn(feePct) / 100);
  const provider = (t.minutes / 60) * nn(providerRate);
  const room = (roomMinutes / 60) * nn(roomRate);
  const direct = t.product + provider + room;
  const contribution = t.price - fee - direct;
  const target = nn(targetMargin) / 100;
  const denom = 1 - nn(feePct) / 100 - target;
  return {
    ...t, fee: r2(fee), provider: r2(provider), room: r2(room), roomMinutes,
    contribution: r2(contribution),
    margin: t.price > 0 ? contribution / t.price : null,
    perRoomHour: r2(contribution / (roomMinutes / 60)),
    breakEvenPrice: r2(direct / (1 - nn(feePct) / 100)),
    targetPrice: denom > 0 ? r2(direct / denom) : null,
    monthlyContribution: r2(contribution * t.volume),
    monthlyRevenue: r2(t.price * t.volume),
    monthlyRoomHours: (roomMinutes * t.volume) / 60,
  };
}

export function analyse(input) {
  const findings = [];
  const parsed = parseTreatments(input.treatmentText);
  if (parsed.bad.length) {
    findings.push({ severity: "high", title: "Some lines were not read",
      detail: `Ignored: ${parsed.bad.join(" | ")}. Use name, price, product cost, minutes, visits per month, with minutes above zero.${parsed.split.length ? " A line with more values than columns usually has a comma inside a number such as $1,200: type 1200, or put the number in quotes." : ""}` });
  }
  if (!parsed.rows.length) {
    findings.push({ severity: "high", title: "Enter at least one treatment",
      detail: "One per line: name, price, product cost, minutes, visits per month." });
    return { result: null, findings, bad: parsed.bad };
  }
  const cfg = {
    providerRate: nn(input.providerRate), roomRate: nn(input.roomRate), turnoverMinutes: nn(input.turnoverMinutes),
    feePct: Math.min(nn(input.feePct), 99), targetMargin: nn(input.targetMargin),
  };
  const rows = parsed.rows.map((t) => treatmentEconomics(t, cfg));
  const ranked = [...rows].sort((a, b) => b.perRoomHour - a.perRoomHour);
  const revenue = r2(rows.reduce((s, r) => s + r.monthlyRevenue, 0));
  const contribution = r2(rows.reduce((s, r) => s + r.monthlyContribution, 0));
  const roomHours = rows.reduce((s, r) => s + r.monthlyRoomHours, 0);
  const capacity = nn(input.roomHoursAvailable);
  const fixed = nn(input.monthlyFixed);
  const result = {
    rows, ranked, revenue, contribution, roomHours,
    margin: revenue > 0 ? contribution / revenue : null,
    utilisation: capacity > 0 ? roomHours / capacity : null,
    fixed, profit: r2(contribution - fixed),
    breakEvenRoomHours: contribution > 0 && roomHours > 0 ? fixed / (contribution / roomHours) : null,
  };

  for (const r of rows) {
    if (r.contribution < 0) {
      findings.push({ severity: "high", title: `${r.name} loses money on every visit`,
        detail: `${money(r.price)} price against ${money(r.price - r.contribution)} of product, card fees, provider and room cost: ${money(r.contribution)} per visit. Break-even price is ${money(r.breakEvenPrice)}.` });
    } else if (r.margin !== null && r.margin < nn(input.targetMargin) / 100 && r.targetPrice !== null) {
      findings.push({ severity: "medium", title: `${r.name} is below your ${pct(nn(input.targetMargin) / 100)} target margin`,
        detail: `It earns ${pct(r.margin)} (${money(r.contribution)} per visit). A price of ${money(r.targetPrice)} would hit the target.` });
    }
  }
  const best = ranked[0], worst = ranked[ranked.length - 1];
  if (ranked.length > 1) {
    findings.push({ severity: "info", title: "Room-hour ranking",
      detail: `${best.name} earns ${money(best.perRoomHour)} per room hour; ${worst.name} earns ${money(worst.perRoomHour)}. When the schedule is full, the higher number is the better use of the room.` });
  }
  if (result.utilisation !== null && result.utilisation > 1) {
    findings.push({ severity: "high", title: "Booked volume exceeds room capacity",
      detail: `The visits you listed need ${roomHours.toFixed(1)} room hours a month against ${capacity} available.` });
  }
  if (fixed > 0) {
    findings.push({ severity: result.profit < 0 ? "high" : "info", title: result.profit < 0 ? "Contribution does not cover fixed costs" : "Operating profit before owner pay",
      detail: `Contribution ${money(contribution)} less fixed costs ${money(fixed)} is ${money(result.profit)} a month.` });
  }
  findings.push({ severity: "info", title: "Modelling choices",
    detail: "Provider cost is the loaded hourly cost of whoever performs the treatment, charged for treatment minutes. Room cost is the hourly overhead of an occupied room, charged for treatment plus turnover. Consults, membership revenue, retail and refunds are not modelled." });
  return { result, findings, bad: parsed.bad };
}
