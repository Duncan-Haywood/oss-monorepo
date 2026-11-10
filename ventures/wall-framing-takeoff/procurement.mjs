// Order-by dates: when each long-lead item has to be ordered so it is on site the day its activity starts.
// The builder types the items (`schedule.orders`) with their own supplier lead times; no lead time is shipped.
// need date = the activity's levelled start date; order by = need - delivery buffer - lead time, in calendar days,
// rolled back to the previous weekday (nobody takes an order on Sunday). If today is already past that,
// the item is late: the earliest it can arrive is today + lead time, and the activity cannot start before then (the buffer is a margin, so a late item only delays the start once arrival passes the need date).
// Not a forecast of supplier behaviour; a date calculation over typed figures.

/** @param {string} ds @param {number} n */
function shift(ds, n) { const t = new Date(ds + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
/** @param {string} ds */
function weekdayBack(ds) { let d = ds; for (;;) { const w = new Date(d + "T00:00:00Z").getUTCDay(); if (w !== 0 && w !== 6) return d; d = shift(d, -1); } }
/** @param {string} a @param {string} b */
function daysBetween(a, b) { return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000); }
/** @param {any} v */
function isDate(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && (() => { const d = new Date(v + "T00:00:00Z"); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; })(); }

/**
 * @param {any} sched result of schedule() (ok: true)
 * @param {any[]} orders [{item, for, leadDays, bufferDays?, supplier?, cost?}]
 * @param {string} [today] YYYY-MM-DD; without it no item is judged late
 */
export function procurement(sched, orders, today) {
  const errors = [];
  if (!sched || !sched.ok) return { ok: false, errors: ["The schedule has problems; fix them first (--schedule)."] };
  if (!Array.isArray(orders) || !orders.length) return { ok: false, errors: ["Add `orders` to the plan's schedule: [{item, for: activityId, leadDays}]."] };
  if (today != null && !isDate(today)) return { ok: false, errors: [`today "${today}" is not a date (YYYY-MM-DD).`] };
  const byId = new Map(sched.rows.map((/** @type {any} */ r) => [r.id, r]));
  const rows = [];
  orders.forEach((o, i) => {
    const tag = o && o.item ? String(o.item) : `Order ${i + 1}`;
    if (!o || typeof o !== "object" || Array.isArray(o)) { errors.push(`${tag}: not an object.`); return; }
    const act = byId.get(o.for);
    if (!act) { errors.push(`${tag}: "${o.for}" is not an activity id.`); return; }
    const lead = o.leadDays, buf = o.bufferDays ?? 0;
    if (!(typeof lead === "number" && Number.isFinite(lead) && lead >= 0 && lead <= 3650)) { errors.push(`${tag}: leadDays must be a number from 0 to 3650.`); return; }
    if (!(typeof buf === "number" && Number.isFinite(buf) && buf >= 0 && buf <= 365)) { errors.push(`${tag}: bufferDays must be a number from 0 to 365.`); return; }
    if (o.cost != null && !(typeof o.cost === "number" && Number.isFinite(o.cost) && o.cost >= 0 && o.cost <= 1e9)) { errors.push(`${tag}: cost must be a number from 0 to 1,000,000,000.`); return; }
    const need = act.startDate;
    const orderBy = weekdayBack(shift(need, -Math.ceil(lead) - Math.ceil(buf)));
    const row = { item: tag, for: act.id, activity: act.name, supplier: o.supplier ?? "", leadDays: lead, bufferDays: buf, needDate: need, orderBy, critical: !!act.critical, cost: typeof o.cost === "number" ? o.cost : null, status: "open", daysToOrder: null, daysLate: 0, earliestStart: null };
    if (today) {
      row.daysToOrder = daysBetween(today, orderBy);
      if (row.daysToOrder < 0) {
        row.status = "late";
        row.earliestStart = shift(today, Math.ceil(lead)); // arrival if ordered today; the buffer is a margin, not a need
        row.daysLate = Math.max(0, daysBetween(need, row.earliestStart));
      }
    }
    rows.push(row);
  });
  if (errors.length) return { ok: false, errors };
  rows.sort((a, b) => (a.orderBy < b.orderBy ? -1 : a.orderBy > b.orderBy ? 1 : a.item.localeCompare(b.item)));
  const late = rows.filter((r) => r.status === "late");
  const slipDays = late.reduce((m, r) => Math.max(m, r.daysLate), 0);
  const committed = late.reduce((s, r) => s + (r.cost || 0), 0);
  return { ok: true, today: today ?? null, rows, lateCount: late.length, worstSlipDays: slipDays, ...(rows.some((r) => r.cost != null) ? { totalCost: rows.reduce((s, r) => s + (r.cost || 0), 0), lateCost: committed } : {}), ...(late.length ? { suggestNotBefore: late.filter((r) => r.daysLate > 0).map((r) => ({ id: r.for, notBefore: r.earliestStart })) } : {}) };
}

/** @param {any} p */
export function procurementText(p) {
  if (!p.ok) return p.errors.map((/** @type {string} */ e) => `  - ${e}`);
  const out = [`Order-by dates${p.today ? ` as of ${p.today}` : ""} (calendar-day lead times you typed, rolled back to a weekday):`];
  for (const r of p.rows) {
    const flag = r.status === "late" ? `  LATE by ${-r.daysToOrder} d` + (r.daysLate ? `; arrives ${r.earliestStart}, ${r.daysLate} d after the ${r.needDate} start` : "; still arrives in time with the buffer used up") : r.daysToOrder != null ? `  in ${r.daysToOrder} d` : "";
    out.push(`  ${r.orderBy}  ${r.item}${r.supplier ? " (" + r.supplier + ")" : ""}: lead ${r.leadDays} d${r.bufferDays ? " + " + r.bufferDays + " d buffer" : ""} for ${r.activity} starting ${r.needDate}${r.critical ? " [critical path]" : ""}${flag}`);
  }
  if (p.lateCount) out.push(`${p.lateCount} late; worst delay to an activity start: ${p.worstSlipDays} d. To model it, set notBefore on: ${(p.suggestNotBefore || []).map((/** @type {any} */ s) => `${s.id} ${s.notBefore}`).join(", ") || "(none; buffers absorb it)"}.`);
  return out;
}

/** @param {any} p */
export function procurementCsv(p) {
  const q = (/** @type {any} */ v) => { const s = String(v ?? ""); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; };
  const c = (/** @type {any} */ v) => { const s = q(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  if (!p || !Array.isArray(p.rows)) throw new TypeError("procurementCsv needs a procurement result");
  const head = "order_by,item,supplier,lead_days,buffer_days,activity,need_date,critical,status,days_late,cost";
  return [head, ...p.rows.map((/** @type {any} */ r) => [r.orderBy, r.item, r.supplier, r.leadDays, r.bufferDays, r.activity, r.needDate, r.critical ? "yes" : "no", r.status, r.daysLate, r.cost ?? ""].map(c).join(","))].join("\n") + "\n";
}
