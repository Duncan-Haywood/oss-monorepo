// Reissuing a posted week after a call-out, priced the way a short-notice rule prices it: every change to someone else's
// posted shifts owes a premium. Compares, on the sample café and the café with a spare part-timer:
//   patch      give each of the caller's shifts to the cheapest person who fits (coverOptions), else leave it open
//   rebuild    rebuild the rest of the week with the caller off that day (shifts already started stay as they were)
//   keep/h     the same rebuild with the posted roster as `keep`, keepValue 0.1 (the planner's per-hour bonus)
//   keep/shift the same rebuild with keepShift = K hours of wage per posted shift kept (K = 1 and 2 here)
// Each reissue is compared with the posted roster by scheduleChanges: notice window 336 h (everything left in the week),
// 1 hour of the person's wage per short-notice change, the caller's own changes exempt. Arithmetic on invented staff and
// an invented rule, not a statement of any ordinance. Run: node eval/reissue-posted.mjs [sample|spare|both]
import { parseStaff, parseShifts, buildRoster, rosterCsv, coverOptions, scheduleChanges, keepFromCsv, sampleStaff, sampleShifts, DAYS } from "../calc.mjs";

const staffOf = (text) => { const p = parseStaff(text); if (p.errors.length) throw new Error(p.errors[0]); return p.staff; };
const PAST = "(already worked)";

// Shifts that start before `changedAt` are pinned to whoever had them (or to nobody, if they were open), so a rebuild
// cannot move a shift that already happened.
export function pinPast(slots, posted, staff, changedAt) {
  return slots.map((s, i) => (s.start < changedAt ? { ...s, fixed: posted.owner[i] >= 0 ? staff[posted.owner[i]].name : PAST } : s));
}

export function reissue({ staffText, slots, person, day, changedAt, posted, base = {}, variants }) {
  const staff = staffOf(staffText);
  const postedCsv = rosterCsv(posted);
  const wages = Object.fromEntries(staff.map((s) => [s.name, s.wage]));
  const opt = { changedAt, noticeHours: 336, premiumHours: 1, wages, exempt: [person] };
  const offText = staffText.split("\n").map((l, n) => (n === 0 && !/\boff\b/i.test(l) ? l + ", off" : l.startsWith(person + ",") ? l + `, off: ${DAYS[day]}` : l)).join("\n");
  const offStaff = staffOf(offText);
  const pinned = pinPast(slots, posted, staff, changedAt);
  const price = (csv) => { const c = scheduleChanges(postedCsv, csv, opt); const others = c.changes.filter((x) => x.person !== person); return { changes: others.length, people: new Set(others.map((x) => x.person)).size, owed: c.owed }; };
  const out = {};
  // patch
  const idx = posted.owner.map((o, i) => (staff[o]?.name === person && slots[i].day === day ? i : -1)).filter((i) => i >= 0);
  const owner = posted.owner.slice();
  let patchPay = 0, left = 0;
  for (const i of idx) {
    const o = coverOptions(staff, slots, { ...posted, owner }, i);
    const best = o.fits[0];
    if (best) { owner[i] = staff.findIndex((s) => s.name === best.name); patchPay += best.extraCost; } else { owner[i] = -1; left += (slots[i].end - slots[i].start) / 60; }
  }
  const lines = postedCsv.trim().split("\n"); const rowOf = posted.assignments.map((a) => slots.indexOf(a.slot));
  const patchedCsv = [lines[0], ...lines.slice(1).map((l, k) => { const i = rowOf[k]; const c = l.split(","); c[5] = owner[i] >= 0 ? staff[owner[i]].name : "UNFILLED"; return c.join(","); })].join("\n") + "\n";
  out.patch = { open: posted.unfilledHours + left, pay: Math.round((posted.cost + patchPay) * 100) / 100, status: "-", ms: 0, ...price(patchedCsv) };
  const keep = keepFromCsv(postedCsv);
  for (const [name, extra] of Object.entries(variants)) {
    const t = Date.now();
    const r = buildRoster(offStaff, pinned, { ...base, ...extra, ...(extra.keepValue || extra.keepShift ? { keep } : {}) });
    out[name] = { open: r.unfilledHours, pay: r.cost, status: r.optimality?.status, ms: Date.now() - t, ...price(rosterCsv(r)) };
  }
  return { idx: idx.length, out };
}

export const VARIANTS = { rebuild: {}, "keep/h 0.1": { keepValue: 0.1 }, "keep/shift 1": { keepShift: 1 }, "keep/shift 2": { keepShift: 2 } };

export function study(staffText, { base = { minRestHours: 10 }, variants = VARIANTS, onCase = null } = {}) {
  const slots = parseShifts(sampleShifts()).slots;
  const staff = staffOf(staffText);
  const posted = buildRoster(staff, slots, base);
  const cases = [];
  for (let day = 2; day <= 6; day++) {
    const changedAt = (day - 1) * 1440 + 17 * 60; // the evening before
    for (const p of staff) {
      if (!posted.owner.some((o, i) => o >= 0 && staff[o] === p && slots[i].day === day)) continue;
      const c = { person: p.name, day: DAYS[day], ...reissue({ staffText, person: p.name, day, changedAt, posted, base, variants }) };
      cases.push(c);
      if (onCase) onCase(c);
    }
  }
  return { posted: { status: posted.optimality?.status, pay: posted.cost, open: posted.unfilledHours }, cases };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const which = process.argv[2] || "both";
  const sets = [["sample", sampleStaff()], ["spare", sampleStaff() + "\nHal, 15, 24, 0, any"]].filter(([n]) => which === "both" || which === n);
  const f = (v) => `${String(v.open).padStart(3)} h open ${String(v.changes).padStart(2)} changes (${v.people} people) owed $${v.owed.toFixed(2).padStart(6)} pay $${v.pay.toFixed(2)} ${v.status} ${v.ms} ms`;
  for (const [name, text] of sets) {
    const tot = {};
    const r = study(text, { onCase: (c) => {
      console.log(`${name} ${c.person} off ${c.day} (${c.idx} shifts)`);
      for (const [k, v] of Object.entries(c.out)) {
        console.log(`  ${k.padEnd(13)} ${f(v)}`);
        const t = (tot[k] ||= { cases: 0, open: 0, changes: 0, owed: 0, pay: 0, proven: 0, ms: 0, cost: 0 });
        t.cases++; t.open += v.open; t.changes += v.changes; t.owed += v.owed; t.pay += v.pay; t.ms += v.ms; t.cost += v.pay + v.owed;
        if (["optimal", "improved"].includes(v.status)) t.proven++;
      }
    } });
    console.log(`${name} posted: pay $${r.posted.pay}, ${r.posted.open} h open, ${r.posted.status}; ${r.cases.length} call-outs`);
    for (const [k, t] of Object.entries(tot)) console.log(`TOTAL ${name} ${k.padEnd(13)} open ${t.open} h, changes to others ${t.changes}, premiums $${t.owed.toFixed(2)}, pay $${t.pay.toFixed(2)}, pay+premiums $${t.cost.toFixed(2)}, proven ${t.proven}/${t.cases}, ${(t.ms / 1000).toFixed(1)} s`);
  }
}
