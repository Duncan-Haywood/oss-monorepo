// Credit-card sign-up-bonus planner: pure date + scheduling logic, no DOM.
// Dates are "YYYY-MM-DD" strings, handled as UTC day numbers so DST never
// shifts a deadline.

const DAY = 86400000;
export const toDay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) throw new Error(`Bad date "${iso}" (use YYYY-MM-DD)`);
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (new Date(t).getUTCDate() !== +m[3]) throw new Error(`Bad date "${iso}"`);
  return Math.round(t / DAY);
};
export const fromDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);

export function addMonths(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1 + months, 1);
  const last = new Date(Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

// Community-reported issuer velocity rules, NOT published by the issuers and
// liable to change. `limit` is how many cards you may already have opened in
// the window for a new application to be inside the rule.
//   scope "all": count personal cards from every issuer (Chase 5/24).
//   scope "issuer": count only that issuer's cards.
export const DEFAULT_RULES = [
  { id: "chase-5-24", issuer: "chase", scope: "all", personalOnly: true, limit: 4, months: 24, label: "Chase 5/24: fewer than 5 new personal cards (any bank) in 24 months" },
  { id: "amex-1-5", issuer: "amex", scope: "issuer", limit: 0, days: 5, label: "Amex: about one new card per 5 days" },
  { id: "amex-2-90", issuer: "amex", scope: "issuer", limit: 1, days: 90, label: "Amex: about two new cards per 90 days" },
  { id: "citi-1-8", issuer: "citi", scope: "issuer", limit: 0, days: 8, label: "Citi: about one application per 8 days" },
  { id: "citi-2-65", issuer: "citi", scope: "issuer", limit: 1, days: 65, label: "Citi: about two applications per 65 days" },
  { id: "capone-1-6", issuer: "capital one", scope: "issuer", limit: 0, months: 6, label: "Capital One: about one new card per 6 months" },
  { id: "boa-2-2", issuer: "bank of america", scope: "issuer", limit: 1, months: 2, label: "Bank of America 2/3/4: two cards in 2 months" },
  { id: "boa-3-12", issuer: "bank of america", scope: "issuer", limit: 2, months: 12, label: "Bank of America 2/3/4: three cards in 12 months" },
  { id: "boa-4-24", issuer: "bank of america", scope: "issuer", limit: 3, months: 24, label: "Bank of America 2/3/4: four cards in 24 months" },
];

const norm = (s) => String(s || "").trim().toLowerCase();

function windowStart(rule, dayIso) {
  return rule.months ? toDay(addMonths(dayIso, -rule.months)) : toDay(dayIso) - rule.days;
}

// Cards that count against `rule` if you applied on `dayIso`.
function counted(rule, cards, dayIso) {
  const start = windowStart(rule, dayIso);
  const end = toDay(dayIso);
  return cards.filter((c) => {
    if (c.personal === false && rule.personalOnly) return false;
    if (rule.scope === "issuer" && norm(c.issuer) !== rule.issuer) return false;
    const d = toDay(c.openedOn);
    return d > start && d <= end;
  });
}

export function checkRules(cards, issuer, dayIso, rules = DEFAULT_RULES) {
  const results = [];
  for (const r of rules) {
    if (r.issuer !== norm(issuer)) continue;
    const hit = counted(r, cards, dayIso);
    results.push({ rule: r, count: hit.length, ok: hit.length <= r.limit });
  }
  return { ok: results.every((x) => x.ok), results };
}

// First day on/after `fromIso` when every rule for `issuer` is satisfied.
export function earliestEligible(cards, issuer, fromIso, rules = DEFAULT_RULES, horizonDays = 1500) {
  const start = toDay(fromIso);
  for (let i = 0; i <= horizonDays; i++) {
    const day = fromDay(start + i);
    if (checkRules(cards, issuer, day, rules).ok) return day;
  }
  return null;
}

export function fiveTwentyFour(cards, todayIso) {
  const rule = DEFAULT_RULES[0];
  const hit = counted(rule, cards, todayIso).sort((a, b) => toDay(a.openedOn) - toDay(b.openedOn));
  const status = hit.length <= rule.limit ? "under" : "over";
  const dropsOn = status === "over" ? earliestEligible(cards, "chase", todayIso, [rule]) : null;
  return { count: hit.length, status, dropsOn };
}

export function bonusValue(card) {
  const pts = (Number(card.bonusPoints) || 0) * ((Number(card.cpp) || 0) / 100);
  return pts + (Number(card.bonusCash) || 0);
}
export function netValue(card) {
  const fee = card.firstYearFeeWaived ? 0 : Number(card.annualFee) || 0;
  return bonusValue(card) - fee;
}

export function spendStatus(card, spent, todayIso) {
  const deadline = fromDay(toDay(card.openedOn) + (Number(card.windowDays) || 90));
  const remaining = Math.max(0, (Number(card.minSpend) || 0) - (Number(spent) || 0));
  const daysLeft = toDay(deadline) - toDay(todayIso);
  const perDay = daysLeft > 0 ? remaining / daysLeft : remaining;
  return { deadline, remaining, daysLeft, perDay, perMonth: perDay * 30.4375, done: remaining === 0, missed: remaining > 0 && daysLeft < 0 };
}

// Demand-bound feasibility for spend that can be preemptively split across
// days at `perDay` capacity: every window [release_i, deadline_j] must hold
// no more work than perDay * its length.
export function spendFeasible(tasks, perDay) {
  const rel = [...new Set(tasks.map((t) => t.release))];
  const due = [...new Set(tasks.map((t) => t.due))];
  for (const a of rel) for (const b of due) {
    if (b <= a) continue;
    const work = tasks.filter((t) => t.release >= a && t.due <= b).reduce((s, t) => s + t.work, 0);
    if (work > perDay * (b - a) + 1e-9) return false;
  }
  return !tasks.some((t) => t.work > 0 && t.due <= t.release);
}

export function orderWishlist(wish, how = "listed") {
  const w = [...wish];
  if (how === "net") return w.sort((a, b) => netValue(b) - netValue(a));
  if (how === "efficiency") return w.sort((a, b) => netValue(b) / Math.max(1, b.minSpend) - netValue(a) / Math.max(1, a.minSpend));
  return w;
}

// Greedy scheduler: place each wishlist card on the earliest day that both
// clears the issuer rules (counting cards already planned) and leaves the
// shared monthly spend able to cover every active minimum-spend deadline.
export function buildPlan({ owned = [], spentSoFar = {}, wishlist = [], monthlySpend, todayIso, order = "listed", rules = DEFAULT_RULES, minGapDays = 0, horizonDays = 1100 }) {
  const perDay = (Number(monthlySpend) * 12) / 365;
  const today = toDay(todayIso);
  const tasks = [];
  for (const c of owned) {
    const s = spendStatus(c, spentSoFar[c.id] || 0, todayIso);
    if (s.remaining > 0 && s.daysLeft > 0) tasks.push({ release: today, due: toDay(s.deadline), work: s.remaining });
  }
  const placed = [];
  const skipped = [];
  let lastApply = today - 1 - minGapDays;
  for (const w of orderWishlist(wishlist, order)) {
    const window = Number(w.windowDays) || 90;
    const need = Number(w.minSpend) || 0;
    let found = null;
    for (let d = Math.max(today, lastApply + minGapDays + 1); d <= today + horizonDays; d++) {
      const iso = fromDay(d);
      const all = [...owned, ...placed.map((p) => ({ ...p.card, openedOn: p.applyOn }))];
      if (!checkRules(all, w.issuer, iso, rules).ok) continue;
      const task = { release: d, due: d + window, work: need };
      if (spendFeasible([...tasks, task], perDay)) { found = { d, iso, task }; break; }
    }
    if (!found) { skipped.push({ card: w, reason: "no feasible date inside the horizon at this monthly spend" }); continue; }
    tasks.push(found.task);
    lastApply = found.d;
    placed.push({ card: w, applyOn: found.iso, spendBy: fromDay(found.d + window), net: netValue(w) });
  }
  return { placed, skipped, totalNet: placed.reduce((s, p) => s + p.net, 0), perMonthNeeded: Number(monthlySpend) };
}

export function toIcs(plan, now = "20260101T000000Z") {
  const esc = (s) => String(s).replace(/[,;\\]/g, (c) => "\\" + c);
  const ev = [];
  for (const p of plan.placed) {
    ev.push([`${p.card.name} apply (check issuer terms first)`, p.applyOn], [`${p.card.name} minimum spend deadline`, p.spendBy]);
  }
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//card-bonus-planner//EN"];
  ev.forEach(([title, iso], i) => {
    lines.push("BEGIN:VEVENT", `UID:cbp-${i}-${iso}@card-bonus-planner`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${iso.replaceAll("-", "")}`, `SUMMARY:${esc(title)}`, "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
