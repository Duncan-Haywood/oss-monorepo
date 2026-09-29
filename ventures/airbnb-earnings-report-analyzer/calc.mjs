// Earnings analysis from an Airbnb "Transaction history" CSV export (or any CSV
// with a reservation date, nights, a listing and an amount). Pure functions,
// no DOM, no network.

const ALIASES = {
  type: ["type", "transaction type"],
  code: ["confirmation code", "confirmation"],
  start: ["start date", "check-in", "check in", "checkin"],
  end: ["end date", "check-out", "check out", "checkout"],
  booked: ["booking date", "booked"],
  nights: ["nights"],
  guest: ["guest"],
  listing: ["listing", "listing name", "property"],
  amount: ["amount", "net earnings"],
  paidOut: ["paid out"],
  service: ["service fee", "host service fee", "host fee"],
  fastPay: ["fast pay fee", "fast pay"],
  cleaning: ["cleaning fee"],
  gross: ["gross earnings", "gross"],
  taxes: ["occupancy taxes", "taxes"],
  currency: ["currency"],
  date: ["date"],
};

export function decodeBuffer(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8);
  return new TextDecoder("utf-8").decode(u8);
}

export function detectDelimiter(text) {
  const head = String(text ?? "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 8).join("\n");
  const n = (c) => head.split(c).length - 1;
  const best = [["\t", n("\t")], [";", n(";")], [",", n(",")]].sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

export function parseCsv(text, delim = ",") {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

// "1,234.56", "$12", "(5.00)", "-5" and blanks (0). NaN only for non-numbers.
export function parseNumber(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s);
  s = s.replace(/[^0-9.,]/g, "");
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

// Airbnb exports MM/DD/YYYY for US accounts and DD/MM/YYYY elsewhere; ISO also
// occurs. `dmy` is decided once per file (see detectDmy). Returns UTC-midnight
// milliseconds or NaN.
export function parseDate(v, dmy = false) {
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (!m) return NaN;
    const a = +m[1], b = +m[2];
    y = +m[3]; if (y < 100) y += 2000;
    if (dmy) { d = a; mo = b; } else { mo = a; d = b; }
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
  const t = Date.UTC(y, mo - 1, d);
  return new Date(t).getUTCDate() === d ? t : NaN;
}

// A file is day-first if any slash date has a first part above 12 and none has
// a second part above 12. Ambiguous files default to month-first (US).
export function detectDmy(values) {
  let first = false, second = false;
  for (const v of values) {
    const m = String(v ?? "").trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) first = true;
    if (+m[2] > 12) second = true;
  }
  return first && !second;
}

const DAY = 86400000;
export const monthKey = (t) => new Date(t).toISOString().slice(0, 7);

function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1) { cols[field] = at; break; }
    }
  }
  return cols;
}

// Returns { stays, adjustments, payouts, skipped, ignored, currency, columns,
// dmy, error }. A stay is one Reservation row: { line, code, listing, start,
// end, nights, gross, service, fastPay, cleaning, taxes, net, guest }.
export function normalizeRows(table, { decimalComma = false } = {}) {
  const empty = { stays: [], adjustments: [], payouts: 0, skipped: [], ignored: 0, currency: "", columns: {}, dmy: false };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if (c.start !== undefined && (c.amount !== undefined || c.gross !== undefined)) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected columns like “Start date”, “Nights”, “Listing” and “Amount” (Airbnb: Menu → Account → Payments → Transaction history → Download CSV, or the Earnings tab’s CSV)." };
  const cols = findColumns(table[h]);
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).flatMap((l) => [get(l, "start"), get(l, "end"), get(l, "date")]));
  const stays = [], adjustments = [], skipped = [];
  let payouts = 0, ignored = 0;
  const tally = {};
  for (let r = h + 1; r < table.length; r++) {
    const line = table[r];
    const type = get(line, "type").toLowerCase();
    if (/payout/.test(type) && !/co-?host/.test(type)) { payouts += Math.max(0, parseNumber(get(line, "paidOut") || get(line, "amount"), decimalComma) || 0); continue; }
    if (/tax/.test(type) && !get(line, "start")) { ignored++; continue; }
    const isAdj = /adjust|resolution|refund|penalt|credit/.test(type);
    const isRes = !type || /reservation|booking|stay/.test(type);
    if (!isAdj && !isRes) { ignored++; continue; }
    const listing = get(line, "listing") || "(unnamed listing)";
    const amount = parseNumber(get(line, "amount"), decimalComma);
    const cur = get(line, "currency").toUpperCase();
    if (isAdj) {
      if (!Number.isFinite(amount)) { skipped.push({ line: r + 1, reason: "unreadable amount" }); continue; }
      adjustments.push({ line: r + 1, listing, amount, type: get(line, "type"), code: get(line, "code") });
      if (cur) tally[cur] = (tally[cur] || 0) + 1;
      continue;
    }
    const start = parseDate(get(line, "start"), dmy);
    if (!Number.isFinite(start)) { skipped.push({ line: r + 1, reason: "unreadable start date" }); continue; }
    let end = parseDate(get(line, "end"), dmy);
    let nights = get(line, "nights") === "" ? NaN : parseNumber(get(line, "nights"), decimalComma);
    if (!Number.isFinite(nights) || nights <= 0) nights = Number.isFinite(end) && end > start ? Math.round((end - start) / DAY) : NaN;
    if (!Number.isFinite(nights) || nights <= 0) { skipped.push({ line: r + 1, reason: "no usable night count" }); continue; }
    if (!Number.isFinite(end)) end = start + nights * DAY;
    const service = Math.abs(parseNumber(get(line, "service"), decimalComma)) || 0;
    const fastPay = Math.abs(parseNumber(get(line, "fastPay"), decimalComma)) || 0;
    const cleaning = Math.abs(parseNumber(get(line, "cleaning"), decimalComma)) || 0;
    const taxes = Math.abs(parseNumber(get(line, "taxes"), decimalComma)) || 0;
    let gross = get(line, "gross") === "" ? NaN : parseNumber(get(line, "gross"), decimalComma);
    let net = amount;
    if (!Number.isFinite(gross) && !Number.isFinite(net)) { skipped.push({ line: r + 1, reason: "no gross earnings or amount" }); continue; }
    if (!Number.isFinite(gross)) gross = net + service + fastPay;
    if (!Number.isFinite(net) || get(line, "amount") === "") net = gross - service - fastPay;
    if (cur) tally[cur] = (tally[cur] || 0) + 1;
    stays.push({ line: r + 1, code: get(line, "code"), guest: get(line, "guest"), listing, start, end, nights, gross, service, fastPay, cleaning, taxes, net });
  }
  const currency = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  return { stays, adjustments, payouts, skipped, ignored, currency, columns: cols, dmy, error: stays.length ? null : "No reservation rows with a start date and night count were found." };
}

function sum(list, f) { return list.reduce((t, x) => t + f(x), 0); }
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

export const LOS_BUCKETS = [
  { key: "1-2", label: "1–2 nights", min: 1, max: 2 },
  { key: "3-4", label: "3–4 nights", min: 3, max: 4 },
  { key: "5-6", label: "5–6 nights", min: 5, max: 6 },
  { key: "7-27", label: "7–27 nights", min: 7, max: 27 },
  { key: "28+", label: "28+ nights", min: 28, max: Infinity },
];

function summarise(list, { cleaningCost = 0, span = null } = {}) {
  const gross = sum(list, (s) => s.gross), net = sum(list, (s) => s.net), nights = sum(list, (s) => s.nights);
  const fees = sum(list, (s) => s.service + s.fastPay), cleaning = sum(list, (s) => s.cleaning);
  const turnoverCost = cleaningCost * list.length;
  return {
    stays: list.length, nights, gross, net, fees, cleaning,
    feeShare: gross ? fees / gross : 0,
    adr: nights ? gross / nights : 0,
    netPerNight: nights ? net / nights : 0,
    los: list.length ? nights / list.length : 0,
    profit: net - turnoverCost,
    profitPerNight: nights ? (net - turnoverCost) / nights : 0,
    occupancy: span && span > 0 ? Math.min(1, nights / span) : null,
  };
}

// `daysAvailable` (optional) overrides the occupancy denominator per listing:
// without it, occupancy uses the span from the listing's first check-in to its
// last check-out in the file, which overstates it if the listing was blocked
// for part of that time.
export function analyze(stays, adjustments = [], { cleaningCost = 0, daysAvailable = null, from = null, to = null } = {}) {
  let list = stays;
  if (from !== null) list = list.filter((s) => s.start >= from);
  if (to !== null) list = list.filter((s) => s.start <= to);
  if (!list.length) return { invalid: "No stays fall inside that date range." };
  const adj = adjustments.filter((a) => a.amount !== 0);
  const first = Math.min(...list.map((s) => s.start)), last = Math.max(...list.map((s) => s.end));
  const spanAll = Math.round((last - first) / DAY);
  const cc = cleaningCost > 0 ? cleaningCost : 0;

  const byListing = [...new Set(list.map((s) => s.listing))].map((name) => {
    const own = list.filter((s) => s.listing === name);
    const lf = Math.min(...own.map((s) => s.start)), ll = Math.max(...own.map((s) => s.end));
    const span = daysAvailable && daysAvailable > 0 ? daysAvailable : Math.round((ll - lf) / DAY);
    return { key: name, ...summarise(own, { cleaningCost: cc, span }) };
  }).sort((a, b) => b.net - a.net);

  const months = [...new Set(list.map((s) => monthKey(s.start)))].sort();
  const byMonth = months.map((k) => ({ key: k, ...summarise(list.filter((s) => monthKey(s.start) === k), { cleaningCost: cc }) }));

  const byLos = LOS_BUCKETS.map((b) => ({ ...b, ...summarise(list.filter((s) => s.nights >= b.min && s.nights <= b.max), { cleaningCost: cc }) })).filter((b) => b.stays > 0);

  const total = summarise(list, { cleaningCost: cc, span: spanAll });
  const adjTotal = sum(adj, (a) => a.amount);
  const negAdj = sum(adj.filter((a) => a.amount < 0), (a) => a.amount);
  const cleaningNet = cc > 0 ? total.cleaning - cc * list.length : null;

  const findings = [];
  const money = (n) => n.toFixed(2);
  if (total.feeShare > 0.17)
    findings.push({ severity: "high", title: `Fees took ${(total.feeShare * 100).toFixed(1)}% of gross earnings`, detail: `Airbnb's host-only service fee is normally about 15.5%. Above 17% usually means Fast Pay fees or a mix of listings on different fee schedules; check which listing carries the difference in the table below.` });
  if (byListing.length > 1) {
    const best = [...byListing].sort((a, b) => b.netPerNight - a.netPerNight)[0], worst = [...byListing].sort((a, b) => a.netPerNight - b.netPerNight)[0];
    if (best.netPerNight > 0 && worst.netPerNight < best.netPerNight * 0.75)
      findings.push({ severity: "medium", title: `“${worst.key}” nets ${money(worst.netPerNight)} a night, ${(100 - (worst.netPerNight / best.netPerNight) * 100).toFixed(0)}% below “${best.key}” (${money(best.netPerNight)})`, detail: "Net per booked night after Airbnb's fees is the fairest side-by-side, because it removes the effect of how much each listing charges for cleaning." });
  }
  if (byLos.length > 1) {
    const useProfit = cc > 0;
    const val = (b) => (useProfit ? b.profitPerNight : b.netPerNight);
    const bestB = [...byLos].sort((a, b) => val(b) - val(a))[0], worstB = [...byLos].sort((a, b) => val(a) - val(b))[0];
    if (val(worstB) < val(bestB) * 0.8 && worstB.stays >= 3)
      findings.push({ severity: "medium", title: `${worstB.label} stays are your weakest, ${money(val(worstB))} per night ${useProfit ? "after turnover cost" : "net"} vs ${money(val(bestB))} for ${bestB.label}`, detail: useProfit ? "That includes the cleaning cost you entered on every stay, so a short-stay minimum or a higher cleaning fee is the lever to test." : "Enter what you pay for one turnover to see this after cleaning cost, which is what usually drags short stays down." });
  }
  if (cleaningNet !== null) {
    const per = cleaningNet / list.length;
    findings.push({ severity: per < 0 ? "high" : "info", title: per < 0 ? `Cleaning fees fall ${money(-per)} short of your cleaning cost on the average stay` : `Cleaning fees cover your cleaning cost with ${money(per)} left per stay`, detail: `Guests paid ${money(total.cleaning)} in cleaning fees across ${list.length} stays against ${money(cc * list.length)} in turnover cost at ${money(cc)} each.` });
  }
  if (months.length >= 4) {
    const bm = [...byMonth].sort((a, b) => b.net - a.net);
    const top = bm[0], low = bm[bm.length - 1];
    if (low.net > 0 ? top.net / low.net >= 2 : true)
      findings.push({ severity: "info", title: `${top.key} earned ${money(top.net)} against ${money(low.net)} in ${low.key}`, detail: "Months are by check-in date, so a stay spanning two months is counted in the month it began. Seasonality of this size is what a dynamic price or a longer minimum stay in the slow months is for." });
  }
  if (negAdj < 0)
    findings.push({ severity: "medium", title: `${money(-negAdj)} was taken back in adjustments, resolutions or refunds`, detail: `${adj.filter((a) => a.amount < 0).length} negative row(s) in the file. They are shown separately and are not subtracted from the stay figures above.` });
  const taxes = sum(list, (s) => s.taxes);
  if (taxes > 0)
    findings.push({ severity: "info", title: `${money(taxes)} of occupancy taxes appear in the file`, detail: "These are shown for reference, are not part of the earnings figures, and whether you owe, collect or remit them depends on your jurisdiction and Airbnb's collection there. The tool does not decide that." });

  return {
    summary: { ...total, from: first, to: last, span: spanAll, listings: byListing.length, adjTotal, negAdj, taxes, medianNightly: median(list.map((s) => s.gross / s.nights)), cleaningNet, cleaningCost: cc },
    byListing, byMonth, byLos, findings,
  };
}

export function sampleCsv() {
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const listings = [["Lakeview Cabin", 210, 95], ["Downtown Studio", 128, 60], ["Garden Loft", 165, 75]];
  const head = "Date,Arriving by date,Type,Confirmation code,Booking date,Start date,End date,Nights,Guest,Listing,Details,Reference,Currency,Amount,Paid out,Service fee,Fast pay fee,Cleaning fee,Gross earnings,Occupancy taxes,Earnings year";
  const rows = [];
  let n = 0;
  for (const [name, rate, clean] of listings) {
    let day = Date.UTC(2026, 0, 3);
    while (day < Date.UTC(2026, 8, 20)) {
      const gap = Math.floor(rnd() * 5) + (name === "Garden Loft" ? 3 : 0);
      day += gap * DAY;
      const short = name === "Downtown Studio" ? rnd() < 0.7 : rnd() < 0.3;
      const nights = short ? 1 + Math.floor(rnd() * 2) : 3 + Math.floor(rnd() * 5);
      const month = new Date(day).getUTCMonth();
      const season = month >= 5 && month <= 7 ? 1.25 : month <= 1 ? 0.8 : 1;
      const gross = Math.round(rate * season * nights + clean);
      const service = Math.round(gross * 0.155 * 100) / 100;
      const net = Math.round((gross - service) * 100) / 100;
      const fmt = (t) => { const d = new Date(t); return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`; };
      const code = `HM${String(100000 + ++n * 37)}`;
      rows.push([fmt(day + nights * DAY), fmt(day), "Reservation", code, fmt(day - 20 * DAY), fmt(day), fmt(day + nights * DAY), nights, `Guest ${n}`, name, "", "", "USD", net.toFixed(2), "", service.toFixed(2), "0.00", clean.toFixed(2), gross.toFixed(2), "0.00", 2026].join(","));
      day += nights * DAY;
    }
  }
  rows.push(["07/02/2026", "", "Resolution Adjustment", "", "", "", "", "", "", "Lakeview Cabin", "Damage claim", "", "USD", "-85.00", "", "", "", "", "", "", 2026].join(","));
  return [head, ...rows].join("\n");
}

export const money = (n) => (n < 0 ? "−" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (x) => `${(x * 100).toFixed(1)}%`;
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);
