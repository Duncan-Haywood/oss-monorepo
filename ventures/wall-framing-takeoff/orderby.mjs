// Order-by date calculator page helper: one line per item, "item, leadDays, bufferDays, needDate[, supplier]".
// Reuses procurement(): the need date is typed here instead of coming from a schedule.
import { procurement } from "./procurement.mjs";

/** @param {string} text @param {string} [today] */
export function orderByFromLines(text, today) {
  const errors = [];
  const orders = [];
  const rows = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const p = line.split(",").map((s) => s.trim());
    if (p.length < 4) { errors.push(`Line ${i + 1}: need item, lead days, buffer days, need date (YYYY-MM-DD).`); return; }
    const [item, lead, buf, need, supplier] = p;
    const l = Number(lead), b = Number(buf);
    if (lead === "" || buf === "" || !Number.isFinite(l) || !Number.isFinite(b)) { errors.push(`Line ${i + 1}: lead days and buffer days must be numbers.`); return; }
    const id = "L" + (rows.length + 1);
    rows.push({ id, name: item || "Item", startDate: need, critical: false });
    orders.push({ item: item || "Item " + (rows.length), for: id, leadDays: l, bufferDays: b, supplier: supplier || "" });
  });
  for (const r of rows) if (!/^\d{4}-\d{2}-\d{2}$/.test(r.startDate) || isNaN(new Date(r.startDate + "T00:00:00Z").getTime()) || new Date(r.startDate + "T00:00:00Z").toISOString().slice(0, 10) !== r.startDate) errors.push(`${r.name}: need date "${r.startDate}" is not YYYY-MM-DD.`);
  if (errors.length) return { ok: false, errors };
  if (!orders.length) return { ok: false, errors: ["Type at least one line."] };
  return procurement({ ok: true, rows }, orders, today || undefined);
}
