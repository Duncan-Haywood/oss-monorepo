// Predictive-scheduling ("fair workweek") checker. Pure functions, no I/O.
// All times are wall-clock minutes (UTC arithmetic on the typed date, so
// daylight-saving shifts are ignored on purpose; the page says so).

const MIN = 60000;

export const RULE_PRESETS = {
  seattle: {
    label: "Seattle (Secure Scheduling Ordinance)",
    fields: { noticeDays: 14, addMoveWindowHours: 336, addMoveHoursOfPay: 1, addMoveFlat: 0, cancelWindowHours: 336, cancelFractionOfLost: 0.5, cancelFlat: 0, restHours: 10, restMultiplier: 1.25 },
  },
  chicago: {
    label: "Chicago (Fair Workweek Ordinance)",
    fields: { noticeDays: 14, addMoveWindowHours: 336, addMoveHoursOfPay: 1, addMoveFlat: 0, cancelWindowHours: 24, cancelFractionOfLost: 0.5, cancelFlat: 0, restHours: 10, restMultiplier: 1.25 },
  },
  custom: {
    label: "Custom (type your city's numbers)",
    fields: { noticeDays: 14, addMoveWindowHours: 336, addMoveHoursOfPay: 1, addMoveFlat: 0, cancelWindowHours: 24, cancelFractionOfLost: 0.5, cancelFlat: 0, restHours: 10, restMultiplier: 1.25 },
  },
};

const num = (v, d = 0) => {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export function fieldsToRules(f) {
  return {
    noticeHours: num(f.noticeDays, 14) * 24,
    addMove: { windowHours: num(f.addMoveWindowHours), hoursOfPay: num(f.addMoveHoursOfPay), flat: num(f.addMoveFlat) },
    cancel: { windowHours: num(f.cancelWindowHours), fractionOfLost: num(f.cancelFractionOfLost), flat: num(f.cancelFlat) },
    restHours: num(f.restHours),
    restMultiplier: Math.max(1, num(f.restMultiplier, 1)),
  };
}

export function parseDateTime(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const t = Date.UTC(y, mo - 1, d, h, mi);
  const back = new Date(t);
  if (back.getUTCMonth() !== mo - 1) return null;
  return t / MIN;
}

export function fmt(minutes) {
  const d = new Date(minutes * MIN);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// "2026-10-12 09:00-17:00" -> {start, end}; an end at or before the start means next day.
export function parseShiftSpec(s) {
  const m = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const start = parseDateTime(`${m[1]} ${m[2]}`);
  let end = parseDateTime(`${m[1]} ${m[3]}`);
  if (start == null || end == null) return null;
  if (end <= start) end += 1440;
  return { start, end };
}

export function parseSchedule(text) {
  const shifts = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split(",").map((p) => p.trim());
    const spec = parts.length >= 3 ? parseShiftSpec(`${parts[1]} ${parts[2]}`) : null;
    if (!parts[0] || !spec) {
      errors.push(`Schedule line ${i + 1}: expected "Name, 2026-10-12, 09:00-17:00[, 18.50]" but got "${line}"`);
      return;
    }
    const rate = parts[3] ? num(parts[3], NaN) : null;
    if (parts[3] && !Number.isFinite(rate)) {
      errors.push(`Schedule line ${i + 1}: "${parts[3]}" is not an hourly rate`);
      return;
    }
    shifts.push({ name: parts[0], start: spec.start, end: spec.end, rate });
  });
  return { shifts, errors };
}

// Name | add|cancel|change | 2026-10-12 09:00-17:00 [-> 2026-10-13 10:00-14:00] | notified 2026-10-10 18:00 [| requested]
export function parseChanges(text) {
  const changes = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split("|").map((p) => p.trim());
    const fail = (why) => errors.push(`Change line ${i + 1}: ${why} ("${line}")`);
    const [name, kindRaw, specRaw, notifRaw, flag] = parts;
    const kind = (kindRaw || "").toLowerCase();
    if (!name || !["add", "cancel", "change"].includes(kind)) return fail('second field must be add, cancel or change');
    const notified = /^notified\s+(.+)$/i.exec(notifRaw || "");
    const notifiedAt = notified ? parseDateTime(notified[1]) : null;
    if (notifiedAt == null) return fail('fourth field must be "notified 2026-10-10 18:00"');
    const [oldSpec, newSpec] = (specRaw || "").split("->").map((s) => s.trim());
    const from = parseShiftSpec(oldSpec);
    if (!from) return fail("shift must look like 2026-10-12 09:00-17:00");
    let to = null;
    if (kind === "change") {
      to = parseShiftSpec(newSpec || "");
      if (!to) return fail('a change needs "old shift -> new shift"');
    }
    changes.push({ name, kind, from, to, notifiedAt, requested: /^requested$/i.test(flag || "") });
  });
  return { changes, errors };
}

const money = (n) => Math.round(n * 100) / 100;
const hoursOf = (s) => (s.end - s.start) / 60;

function applyChanges(posted, changes, defaultRate, errors) {
  let current = posted.map((s) => ({ ...s, rate: s.rate ?? defaultRate }));
  const events = [];
  for (const c of changes) {
    const idx = current.findIndex((s) => s.name === c.name && s.start === c.from.start && s.end === c.from.end);
    const known = current.find((s) => s.name === c.name);
    const rate = (idx >= 0 ? current[idx].rate : known?.rate) ?? defaultRate;
    if (c.kind === "add") {
      current.push({ name: c.name, start: c.from.start, end: c.from.end, rate });
      events.push({ ...c, rate, lost: 0 });
      continue;
    }
    if (idx < 0) {
      errors.push(`No scheduled shift for ${c.name} on ${fmt(c.from.start)}-${fmt(c.from.end).slice(11)}; check the name, date and times match the schedule exactly.`);
      continue;
    }
    if (c.kind === "cancel") {
      current.splice(idx, 1);
      events.push({ ...c, rate, lost: hoursOf(c.from) });
    } else {
      current[idx] = { ...current[idx], start: c.to.start, end: c.to.end };
      events.push({ ...c, rate, lost: Math.max(0, hoursOf(c.from) - hoursOf(c.to)) });
    }
  }
  return { final: current, events };
}

export function analyze({ postedAt, scheduleText, changesText, rules, defaultRate }) {
  const errors = [];
  const sched = parseSchedule(scheduleText);
  const chg = parseChanges(changesText);
  errors.push(...sched.errors, ...chg.errors);
  const posted = postedAt == null ? null : postedAt;
  const findings = [];
  const rate0 = num(defaultRate, 0);

  if (posted != null) {
    for (const s of sched.shifts) {
      const noticeH = (s.start - posted) / 60;
      if (noticeH < rules.noticeHours) {
        findings.push({ type: "late-posting", name: s.name, when: fmt(s.start), noticeHours: round1(noticeH), premium: 0,
          text: `Posted ${fmtDays(noticeH)} before the shift; this rule set asks for ${fmtDays(rules.noticeHours)}.` });
      }
    }
  }

  const { final, events } = applyChanges(sched.shifts, chg.changes, rate0, errors);
  for (const e of events) {
    if (e.requested) {
      findings.push({ type: "exempt", name: e.name, when: fmt(e.from.start), noticeHours: null, premium: 0, text: `${e.kind} marked employee-requested: no premium counted. Keep the written request.` });
      continue;
    }
    const earliest = Math.min(e.from.start, e.to ? e.to.start : e.from.start);
    const noticeH = (earliest - e.notifiedAt) / 60;
    const reduceOrCancel = e.kind === "cancel" || (e.kind === "change" && e.lost > 0);
    if (reduceOrCancel) {
      const r = rules.cancel;
      if (noticeH < r.windowHours) {
        const prem = r.flat + r.fractionOfLost * e.lost * e.rate;
        findings.push({ type: "cancel", name: e.name, when: fmt(e.from.start), noticeHours: round1(noticeH), lostHours: round2(e.lost), premium: money(prem),
          text: `${e.kind === "cancel" ? "Cancelled" : "Shortened"} with ${fmtDays(noticeH)} notice (window ${fmtDays(r.windowHours)}); ${round2(e.lost)} h not worked.` });
      }
    }
    if (e.kind === "add" || (e.kind === "change" && e.lost === 0)) {
      const r = rules.addMove;
      if (noticeH < r.windowHours) {
        const prem = r.flat + r.hoursOfPay * e.rate;
        findings.push({ type: "add-move", name: e.name, when: fmt(e.kind === "add" ? e.from.start : e.to.start), noticeHours: round1(noticeH), premium: money(prem),
          text: `${e.kind === "add" ? "Shift added" : "Shift moved or extended"} with ${fmtDays(noticeH)} notice (window ${fmtDays(r.windowHours)}).` });
      }
    }
  }

  if (rules.restHours > 0) {
    const byName = new Map();
    for (const s of final) (byName.get(s.name) || byName.set(s.name, []).get(s.name)).push(s);
    for (const [name, list] of byName) {
      list.sort((a, b) => a.start - b.start);
      for (let i = 1; i < list.length; i++) {
        const gapH = (list[i].start - list[i - 1].end) / 60;
        if (gapH < rules.restHours) {
          const inWindow = Math.min(hoursOf(list[i]), rules.restHours - Math.max(0, gapH));
          const prem = (rules.restMultiplier - 1) * inWindow * list[i].rate;
          findings.push({ type: "rest", name, when: fmt(list[i].start), noticeHours: null, premium: money(prem),
            text: `Only ${round1(Math.max(0, gapH))} h between shifts (minimum ${rules.restHours} h). Needs the worker's written consent; ${round2(inWindow)} h inside the rest window${rules.restMultiplier > 1 ? ` paid at ${rules.restMultiplier}x` : ""}.` });
        }
      }
    }
  }

  const total = money(findings.reduce((a, f) => a + f.premium, 0));
  const count = findings.filter((f) => f.type !== "exempt").length;
  return { findings, total, count, errors, shiftCount: final.length };
}

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
function fmtDays(h) {
  if (h < 0) return `${round1(-h)} h after the shift started`;
  return h >= 48 ? `${round1(h / 24)} days` : `${round1(h)} h`;
}

export function toCsv(result) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = [["employee", "shift_start", "issue", "notice_hours", "premium_usd", "detail"]];
  for (const f of result.findings) rows.push([f.name, f.when, f.type, f.noticeHours ?? "", f.premium.toFixed(2), f.text]);
  rows.push(["TOTAL", "", "", "", result.total.toFixed(2), ""]);
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

export function toText(result) {
  const lines = [`Schedule check: ${result.count} issue(s), premium pay to review $${result.total.toFixed(2)}`];
  for (const f of result.findings) lines.push(`- ${f.name}, ${f.when}: ${f.text}${f.premium ? ` $${f.premium.toFixed(2)}` : ""}`);
  return lines.join("\n");
}
