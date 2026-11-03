// Cold email sending ramp planner. Pure arithmetic, no network.
// Numbers are conservative rules of thumb from common deliverability practice,
// not provider guarantees: new mailboxes start small, rise gradually, and stay
// well under the per-day caps the providers publish. Check your provider's
// current limits. Spam complaint rate: Google and Yahoo ask bulk senders to stay
// under 0.3% and aim for under 0.1% (from memory of their 2024 sender rules).

export const DEFAULTS = { startPerDay: 10, stepPerDay: 5, stepDays: 3, capPerMailbox: 40, warmDays: 14 };

export function plan(o = {}) {
  const p = { ...DEFAULTS, ...o };
  const need = (k, min) => { if (!Number.isFinite(+p[k]) || +p[k] < min) throw new Error(`${k} must be a number >= ${min}`); p[k] = +p[k]; };
  need("mailboxes", 1); need("targetPerDay", 1); need("startPerDay", 1); need("stepPerDay", 1); need("stepDays", 1); need("capPerMailbox", 1); need("warmDays", 0);
  const cap = p.capPerMailbox;
  const reachable = Math.min(cap * p.mailboxes, p.targetPerDay);
  const days = [];
  let perBox = Math.min(p.startPerDay, cap);
  let total = 0;
  for (let d = 1; d <= 120; d++) {
    if (d > 1 && (d - 1) % p.stepDays === 0) perBox = Math.min(perBox + p.stepPerDay, cap);
    const day = Math.min(perBox * p.mailboxes, p.targetPerDay);
    total += day;
    days.push({ day: d, perMailbox: +(day / p.mailboxes).toFixed(1), total: day, cumulative: total });
    if (day >= reachable) break;
  }
  const last = days[days.length - 1];
  const warnings = [];
  if (p.targetPerDay > cap * p.mailboxes) warnings.push(`Target ${p.targetPerDay}/day needs at least ${Math.ceil(p.targetPerDay / cap)} mailboxes at ${cap}/day each; with ${p.mailboxes} the plan tops out at ${cap * p.mailboxes}/day.`);
  if (p.targetPerDay / p.mailboxes > 50) warnings.push("Over 50 cold emails per mailbox per day is where most providers and filters start to push back; add mailboxes rather than volume.");
  if (p.warmDays > 0) warnings.push(`Send only warm-up traffic (replies to real people, small volume) for the first ${p.warmDays} days on a brand new mailbox or domain before day 1 below.`);
  warnings.push("Use a separate sending domain from your main one, with SPF, DKIM and DMARC set, and a one-click unsubscribe header if you send in bulk.");
  warnings.push("If bounces pass 2% or complaints pass 0.1%, stop and fix the list before sending more.");
  const reached = last.total >= p.targetPerDay;
  return { daysToTarget: reached ? last.day : null, reachedTarget: reached, finalPerDay: last.total, finalPerMailbox: last.perMailbox, schedule: days, warnings, input: p, firstWeekTotal: days.slice(0, 7).reduce((a, x) => a + x.total, 0) };
}

export function toCsv(r) {
  return ["day,per_mailbox,total,cumulative", ...r.schedule.map((x) => `${x.day},${x.perMailbox},${x.total},${x.cumulative}`)].join("\n") + "\n";
}
