// SaaS renewal planner: a list of subscriptions with renewal dates, cancellation
// notice windows and seat counts in, a ranked negotiation plan out.
//
// For each vendor it finds the last day you can give notice before an auto-renewal
// locks you in, how much of the renewal bill is seats nobody uses and the vendor's
// proposed price uplift, a floor target (right-sized seats, no uplift) and a stretch
// target (floor less your ask), the date to start negotiating, and an email draft.
// Pure functions, no network, no dependencies; dates are calendar dates in UTC.

export const MODEL_NOTE =
  "Do-nothing renewal = annual cost x (1 + uplift). Seats needed = used seats x (1 + buffer), rounded up, never above seats paid. " +
  "Floor target = seats needed x price per seat, no uplift. Stretch target = floor target x (1 - ask). Savings = do-nothing renewal minus target. " +
  "Notice deadline = renewal date minus notice days. Every figure is the number you typed, not a quote from the vendor.";

export const INPUT_NOTES = [
  { what: "Slack,28800,2026-11-30,30,yes,300,212,7", detail: "One subscription per row: vendor,annual cost,renewal date,notice days,auto-renews (yes/no),seats paid,seats used,proposed uplift %[,note]. Dollars as plain numbers; dates as 2026-11-30 or 11/30/2026." },
  { what: "Notice days", detail: "How many days before renewal the contract requires written notice to cancel or change terms. After that date an auto-renewing contract has already renewed in practice." },
  { what: "Seats 0 / 0", detail: "Usage-based or flat-fee products have no seats to trim; the plan then only counts the uplift." },
  { what: "auto_renew = no", detail: "The contract lapses unless you renew it, so there is no lock-in date; the plan still ranks the renewal by what you could save." },
  { what: "Header row", detail: "Optional. A first line starting with vendor is skipped." },
];

export const MAX_ROWS = 200;
const DAY = 86400000;

export const money = (v) =>
  (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function parseDate(s) {
  const t = String(s ?? "").trim();
  let y, m, d;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (r) [y, m, d] = [r[1], r[2], r[3]];
  else if ((r = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) [m, d, y] = [r[1], r[2], r[3]];
  else return null;
  const ms = Date.UTC(+y, +m - 1, +d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== +y || back.getUTCMonth() !== +m - 1 || back.getUTCDate() !== +d) return null;
  return ms;
}

export const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

function num(s) {
  const v = Number(String(s ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(v) ? v : NaN;
}

export function parseRenewals(text) {
  const errors = [];
  const renewals = [];
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  lines.forEach((line, idx) => {
    if (idx === 0 && /^vendor\b/i.test(line)) return;
    const c = line.split(",").map((x) => x.trim());
    const n = idx + 1;
    if (c.length < 8) return errors.push(`Row ${n}: expected vendor,annual cost,renewal date,notice days,auto-renews,seats paid,seats used,uplift % (got ${c.length} fields)`);
    const [vendor, cost, date, notice, auto, paid, used, uplift] = c;
    const renewsOn = parseDate(date);
    const ar = auto.toLowerCase();
    const v = { vendor, annualCost: num(cost), renewsOn, noticeDays: num(notice), autoRenew: ["yes", "y", "true", "1"].includes(ar), seatsPaid: num(paid), seatsUsed: num(used), upliftPct: num(uplift), note: c.slice(8).join(",") };
    if (!vendor) return errors.push(`Row ${n}: vendor name is empty`);
    if (!["yes", "y", "true", "1", "no", "n", "false", "0"].includes(ar)) return errors.push(`Row ${n} (${vendor}): auto-renews must be yes or no`);
    if (!(v.annualCost > 0)) return errors.push(`Row ${n} (${vendor}): annual cost must be a positive number`);
    if (renewsOn === null) return errors.push(`Row ${n} (${vendor}): renewal date must look like 2026-11-30 or 11/30/2026`);
    if (!(v.noticeDays >= 0) || !Number.isInteger(v.noticeDays)) return errors.push(`Row ${n} (${vendor}): notice days must be a whole number, 0 or more`);
    if (!(v.seatsPaid >= 0) || !Number.isInteger(v.seatsPaid) || !(v.seatsUsed >= 0) || !Number.isInteger(v.seatsUsed)) return errors.push(`Row ${n} (${vendor}): seats must be whole numbers, 0 or more`);
    if (v.seatsUsed > v.seatsPaid) return errors.push(`Row ${n} (${vendor}): seats used (${v.seatsUsed}) is more than seats paid (${v.seatsPaid}); fix the seat counts`);
    if (!Number.isFinite(v.upliftPct) || v.upliftPct < -100 || v.upliftPct > 500) return errors.push(`Row ${n} (${vendor}): uplift % must be a number between -100 and 500`);
    renewals.push(v);
  });
  if (renewals.length > MAX_ROWS) errors.push(`Too many rows (${renewals.length}); the limit is ${MAX_ROWS}`);
  return { renewals, errors };
}

function option(opts, key, dflt, lo, hi) {
  const raw = opts[key];
  if (raw === undefined || raw === null || raw === "") return dflt;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${key} must be a number from ${lo} to ${hi}`);
  return v;
}

export function plan(parsed, opts = {}) {
  const asOfMs = opts.asOf ? parseDate(opts.asOf) : (() => { const t = new Date(); return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); })();
  if (asOfMs === null) throw new Error("asOf must be a date like 2026-10-02");
  const bufferPct = option(opts, "bufferPct", 10, 0, 100);
  const askPct = option(opts, "askPct", 10, 0, 90);
  const leadDays = option(opts, "leadDays", 30, 0, 365);
  const rows = parsed.renewals.map((r) => {
    const seatsNeeded = r.seatsPaid === 0 ? 0 : Math.min(r.seatsPaid, Math.ceil(r.seatsUsed * (1 + bufferPct / 100) - 1e-9));
    const perSeat = r.seatsPaid === 0 ? 0 : r.annualCost / r.seatsPaid;
    const doNothing = r.annualCost * (1 + r.upliftPct / 100);
    const floorTarget = r.seatsPaid === 0 ? r.annualCost : Math.min(r.annualCost, seatsNeeded * perSeat);
    const stretchTarget = floorTarget * (1 - askPct / 100);
    const seatWaste = r.seatsPaid === 0 ? 0 : (r.seatsPaid - seatsNeeded) * perSeat;
    const deadlineMs = r.renewsOn - r.noticeDays * DAY;
    const daysToDeadline = Math.round((deadlineMs - asOfMs) / DAY);
    const daysToRenewal = Math.round((r.renewsOn - asOfMs) / DAY);
    let status;
    if (daysToRenewal < 0) status = "renewed";
    else if (!r.autoRenew) status = "lapses";
    else if (daysToDeadline < 0) status = "locked-in";
    else if (daysToDeadline <= leadDays) status = "urgent";
    else status = "upcoming";
    const startByMs = deadlineMs - leadDays * DAY;
    return {
      ...r,
      seatsNeeded, seatWaste, perSeat, doNothing, floorTarget, stretchTarget,
      floorSavings: Math.max(0, doNothing - floorTarget),
      stretchSavings: Math.max(0, doNothing - stretchTarget),
      upliftCost: r.annualCost * (r.upliftPct / 100),
      utilisation: r.seatsPaid === 0 ? null : r.seatsUsed / r.seatsPaid,
      noticeDeadline: isoDate(deadlineMs), startBy: isoDate(startByMs), renewsOnIso: isoDate(r.renewsOn),
      daysToDeadline, daysToRenewal, status,
    };
  });
  const rank = { urgent: 0, upcoming: 1, "locked-in": 2, lapses: 2, renewed: 3 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || (a.status === "urgent" ? a.daysToDeadline - b.daysToDeadline : 0) || b.stretchSavings - a.stretchSavings || a.vendor.localeCompare(b.vendor));
  const live = rows.filter((r) => r.status !== "renewed");
  const totals = {
    spend: rows.reduce((s, r) => s + r.annualCost, 0),
    doNothing: rows.reduce((s, r) => s + r.doNothing, 0),
    floorSavings: live.reduce((s, r) => s + r.floorSavings, 0),
    stretchSavings: live.reduce((s, r) => s + r.stretchSavings, 0),
    seatWaste: live.reduce((s, r) => s + r.seatWaste, 0),
    upliftCost: live.reduce((s, r) => s + Math.max(0, r.upliftCost), 0),
    atRiskInWindow: rows.filter((r) => r.status === "urgent").reduce((s, r) => s + r.stretchSavings, 0),
    lockedIn: rows.filter((r) => r.status === "locked-in").length,
    urgent: rows.filter((r) => r.status === "urgent").length,
  };
  const findings = [];
  for (const r of rows) {
    if (r.status === "urgent") findings.push({ severity: "warn", rule: "notice-window", vendor: r.vendor, message: `${r.vendor}: notice must be given by ${r.noticeDeadline} (${r.daysToDeadline} day${r.daysToDeadline === 1 ? "" : "s"}); after that the contract renews at ${money(r.doNothing)}.` });
    if (r.status === "locked-in") findings.push({ severity: "info", rule: "locked-in", vendor: r.vendor, message: `${r.vendor}: the notice date ${r.noticeDeadline} has passed, so the renewal on ${r.renewsOnIso} is likely binding. Ask for seat reductions or a credit at the next anniversary, and diarise the next notice date.` });
    if (r.utilisation !== null && r.utilisation < 0.7 && r.status !== "renewed") findings.push({ severity: "info", rule: "low-utilisation", vendor: r.vendor, message: `${r.vendor}: ${Math.round(r.utilisation * 100)}% of paid seats are used (${r.seatsUsed} of ${r.seatsPaid}), which is your strongest argument.` });
  }
  return { asOf: isoDate(asOfMs), options: { bufferPct, askPct, leadDays }, rows, totals, findings };
}

export function summarize(p) {
  const t = p.totals;
  if (!p.rows.length) return { status: "none", text: "No subscriptions to plan." };
  const parts = [`${p.rows.length} subscription${p.rows.length === 1 ? "" : "s"}, ${money(t.spend)} a year.`];
  if (t.stretchSavings > 0) parts.push(`Negotiating could save about ${money(t.floorSavings)} (right-size and no uplift) up to ${money(t.stretchSavings)} (with your ${p.options.askPct}% ask) against renewing as-is.`);
  else parts.push("Nothing here looks worth negotiating at these numbers.");
  if (t.urgent) parts.push(`${t.urgent} notice window${t.urgent === 1 ? "" : "s"} close within ${p.options.leadDays} days, covering ${money(t.atRiskInWindow)} of savings.`);
  if (t.lockedIn) parts.push(`${t.lockedIn} auto-renewal${t.lockedIn === 1 ? " is" : "s are"} already past the notice date.`);
  return { status: t.urgent ? "urgent" : t.stretchSavings > 0 ? "gain" : "none", text: parts.join(" ") };
}

export function emailDraft(row, opts = {}) {
  const from = opts.from || "[Your name]";
  const seats = row.seatsPaid > 0 && row.seatsNeeded < row.seatsPaid;
  const lines = [`Subject: ${row.vendor} renewal on ${row.renewsOnIso}`, "", `Hello,`, ""];
  lines.push(`Our ${row.vendor} subscription renews on ${row.renewsOnIso}${row.autoRenew ? `, and we are writing ahead of the ${row.noticeDays}-day notice date (${row.noticeDeadline}) to agree terms before it renews` : ""}.`);
  if (seats) lines.push(`Over the past term we have used ${row.seatsUsed} of our ${row.seatsPaid} licensed seats, so we plan to renew ${row.seatsNeeded} seats rather than ${row.seatsPaid}.`);
  if (row.upliftPct > 0) lines.push(`We would also like to renew at the current per-seat price rather than the proposed ${row.upliftPct}% increase. That would put the annual total at ${money(row.floorTarget)}, and we would welcome a multi-year commitment at that price.`);
  else lines.push(`We would like to renew at about ${money(row.stretchTarget)} a year, and we are open to a longer commitment for it.`);
  lines.push("", `Please confirm the revised order form, or tell us what you can do, by ${row.autoRenew ? row.noticeDeadline : row.renewsOnIso}.`, "", "Thanks,", from);
  return lines.join("\n");
}

const icsText = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const icsDay = (iso) => iso.replace(/-/g, "");
const addDay = (iso) => isoDate(parseDate(iso) + DAY);

export function toIcs(p) {
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//saas-renewal-planner//EN", "CALSCALE:GREGORIAN"];
  for (const r of p.rows) {
    if (r.status === "renewed" || !r.autoRenew) continue;
    const slug = r.vendor.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const ev = (suffix, day, title, desc) => day >= p.asOf && out.push(
      "BEGIN:VEVENT", `UID:${slug}-${suffix}-${icsDay(r.renewsOnIso)}@saas-renewal-planner`, `DTSTAMP:${icsDay(p.asOf)}T000000Z`,
      `DTSTART;VALUE=DATE:${icsDay(day)}`, `DTEND;VALUE=DATE:${icsDay(addDay(day))}`, `SUMMARY:${icsText(title)}`, `DESCRIPTION:${icsText(desc)}`, "END:VEVENT");
    ev("start", r.startBy, `Start ${r.vendor} renewal talks`, `Notice deadline ${r.noticeDeadline}. Target ${money(r.stretchTarget)} vs ${money(r.doNothing)} if renewed as-is.`);
    ev("notice", r.noticeDeadline, `${r.vendor}: LAST DAY to give notice`, `Renews ${r.renewsOnIso} at about ${money(r.doNothing)} unless you act.`);
  }
  out.push("END:VCALENDAR");
  return out.join("\r\n") + "\r\n";
}
