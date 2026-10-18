// Pure arithmetic for childcare center break-even. No DOM, no network.
// Staffing is a step function: each classroom group needs ceil(enrolled / ratio) lead teachers on the floor,
// so the Nth child can cost a whole extra teacher. That cliff is what this tool exists to show.

const num = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v));
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const money = (n) => `${n < 0 ? "-" : ""}$${Math.abs(round2(n)).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const WEEKS_PER_MONTH = 52 / 12;

export function teachersNeeded(enrolled, ratio) {
  if (enrolled <= 0) return 0;
  return Math.ceil(enrolled / ratio);
}

function validate(input) {
  const groups = (input.groups || []).filter((g) => num(g.capacity) > 0 || num(g.enrolled) > 0);
  if (!groups.length) return { error: "Add at least one classroom group with a capacity or enrollment." };
  for (const g of groups) {
    const label = g.name || "Group";
    if (!(num(g.ratio) >= 1)) return { error: `${label}: enter the children-per-teacher ratio your licensing requires (1 or more).` };
    if (num(g.capacity) < 0 || num(g.enrolled) < 0 || num(g.weeklyTuition) < 0) return { error: `${label}: numbers cannot be negative.` };
    if (num(g.enrolled) > num(g.capacity)) return { error: `${label}: enrolled (${num(g.enrolled)}) is above licensed capacity (${num(g.capacity)}).` };
  }
  if (!(num(input.hourlyWage) > 0)) return { error: "Enter the average hourly wage of a classroom teacher." };
  return { groups };
}

// Monthly P&L for a given enrollment vector (same order as groups).
function monthly(input, groups, enrolledList) {
  const wage = num(input.hourlyWage);
  const burden = num(input.burdenPct) / 100;
  const hoursOpen = num(input.hoursOpenPerDay) || 10;
  const shift = num(input.teacherShiftHours) || 8;
  // 1.0 = one teacher covers all open hours; a 10h day on 8h shifts needs 1.25 heads on the floor per ratio slot.
  const coverage = Math.max(1, hoursOpen / shift) * (1 + num(input.absencePct) / 100);
  const collect = (num(input.collectionPct) || 100) / 100;
  const perTeacherMonth = wage * shift * 5 * WEEKS_PER_MONTH * (1 + burden); // one full-time teacher, loaded
  let revenue = 0, staff = 0, variable = 0, teachers = 0;
  const rows = groups.map((g, i) => {
    const n = enrolledList[i];
    const t = teachersNeeded(n, num(g.ratio));
    const rev = n * num(g.weeklyTuition) * WEEKS_PER_MONTH * collect;
    const st = t * coverage * perTeacherMonth;
    const va = n * num(input.variablePerChildMonth);
    revenue += rev; staff += st; variable += va; teachers += t;
    return { name: g.name || "Group", enrolled: n, capacity: num(g.capacity), ratio: num(g.ratio), teachers: t, revenue: rev, staff: st };
  });
  const fixed = num(input.fixedMonthly) + num(input.directorMonthly);
  const profit = revenue - staff - variable - fixed;
  return { revenue, staff, variable, fixed, profit, teachers, rows, coverage, perTeacherMonth };
}

export function calculateCenter(input) {
  const v = validate(input);
  if (v.error) return v;
  const { groups } = v;
  const current = groups.map((g) => num(g.enrolled));
  const now = monthly(input, groups, current);
  const full = monthly(input, groups, groups.map((g) => num(g.capacity)));

  // Break-even occupancy: smallest uniform fill % (applied to every group's capacity) with profit >= 0.
  let breakEvenPct = null;
  for (let p = 0; p <= 100; p++) {
    const list = groups.map((g) => Math.min(num(g.capacity), Math.round((num(g.capacity) * p) / 100)));
    if (monthly(input, groups, list).profit >= 0) { breakEvenPct = p; break; }
  }
  const capacityTotal = groups.reduce((s, g) => s + num(g.capacity), 0);
  const enrolledTotal = current.reduce((s, n) => s + n, 0);
  const breakEvenChildren = breakEvenPct === null ? null : groups.reduce((s, g) => s + Math.min(num(g.capacity), Math.round((num(g.capacity) * breakEvenPct) / 100)), 0);

  // Tuition rise (uniform %) needed to break even at today's enrollment.
  const tuitionRisePct = now.profit >= 0 || now.revenue <= 0 ? 0 : round2((-now.profit / now.revenue) * 100);

  // Occupancy ladder, to show the sawtooth.
  const ladder = [50, 60, 70, 80, 90, 100].map((p) => {
    const list = groups.map((g) => Math.min(num(g.capacity), Math.round((num(g.capacity) * p) / 100)));
    const m = monthly(input, groups, list);
    return { pct: p, children: list.reduce((s, n) => s + n, 0), profit: m.profit };
  });

  // The ratio cliff for each group: what the NEXT child does to profit.
  const findings = [];
  groups.forEach((g, i) => {
    const n = current[i];
    if (n >= num(g.capacity)) return;
    const next = current.slice(); next[i] = n + 1;
    const after = monthly(input, groups, next);
    const delta = after.profit - now.profit;
    const addsTeacher = teachersNeeded(n + 1, num(g.ratio)) > teachersNeeded(n, num(g.ratio));
    const name = g.name || "Group";
    if (addsTeacher && n > 0) {
      // seats until that new teacher is "paid for": children needed beyond n+1 until delta returns >= 0
      let k = 0; const probe = current.slice();
      while (probe[i] < num(g.capacity)) {
        probe[i] += 1; k += 1;
        if (monthly(input, groups, probe).profit >= now.profit) break;
      }
      findings.push({ severity: "medium", title: `${name}: child #${n + 1} costs you a teacher`,
        detail: `You are at ${n} of ${num(g.ratio)}-per-teacher seats. Enrolling one more adds a ${money(now.perTeacherMonth * now.coverage)}/month staffing slot against ${money(num(g.weeklyTuition) * WEEKS_PER_MONTH * ((num(input.collectionPct) || 100) / 100))} of tuition, so profit moves by ${money(delta)}/month. ${k && monthly(input, groups, probe).profit >= now.profit ? `It takes ${k} new child${k === 1 ? "" : "ren"} in this group to get back to where you are today.` : "It does not pay back before this group is full."} Enrol in blocks, or hold a waitlist until the block fills.` });
    } else if (n > 0 && delta > 0) {
      const spare = teachersNeeded(n, num(g.ratio)) * num(g.ratio) - n;
      findings.push({ severity: "info", title: `${name}: free seats before the next hire`,
        detail: `${spare} more child${spare === 1 ? "" : "ren"} fit under the current teachers at ${money(delta)}/month each, which is almost all margin. This is the cheapest enrollment you can win.` });
    }
  });
  if (now.profit < 0) {
    findings.unshift({ severity: "high", title: `Losing ${money(-now.profit)} a month at ${enrolledTotal} children`,
      detail: `${breakEvenChildren === null ? "Even full, this setup does not break even; look at wages, ratios or tuition." : `Break-even is about ${breakEvenChildren} children (${breakEvenPct}% of capacity).`} A ${tuitionRisePct}% across-the-board tuition increase alone would close the gap at today's enrollment.` });
  }
  const fixedShare = now.revenue > 0 ? Math.round((now.fixed / now.revenue) * 100) : null;
  if (fixedShare !== null && fixedShare > 30) {
    findings.push({ severity: "medium", title: `Rent, director and fixed costs eat ${fixedShare}% of tuition`,
      detail: "Above roughly 25-30% of revenue, no staffing trick fixes the margin; the levers are capacity, tuition per seat, or the lease." });
  }
  const margin = now.revenue > 0 ? round2((now.profit / now.revenue) * 100) : null;
  return {
    revenue: now.revenue, staff: now.staff, variable: now.variable, fixed: now.fixed, profit: now.profit, margin,
    teachers: now.teachers, groups: now.rows, enrolledTotal, capacityTotal, occupancyPct: capacityTotal ? Math.round((enrolledTotal / capacityTotal) * 100) : 0,
    fullProfit: full.profit, breakEvenPct, breakEvenChildren, tuitionRisePct, ladder, findings,
    staffShare: now.revenue > 0 ? Math.round((now.staff / now.revenue) * 100) : null,
  };
}

export function summaryText(r) {
  const lines = [
    `Childcare center monthly picture: ${r.enrolledTotal} of ${r.capacityTotal} seats filled (${r.occupancyPct}%).`,
    `Tuition ${money(r.revenue)} - staff ${money(r.staff)} - fixed ${money(r.fixed)} - per-child costs ${money(r.variable)} = ${money(r.profit)} a month${r.margin === null ? "" : ` (${r.margin}% margin)`}.`,
    r.breakEvenChildren === null ? "Does not break even even when full." : `Break-even: about ${r.breakEvenChildren} children (${r.breakEvenPct}% of capacity). Full-capacity profit: ${money(r.fullProfit)} a month.`,
  ];
  if (r.tuitionRisePct > 0) lines.push(`Tuition increase needed to break even today: ${r.tuitionRisePct}%.`);
  return lines.join("\n");
}
