// Progress review: does the progress a schedule update reports hang together
// with its own dates and durations? An owner's scheduler reads this before a
// pay application is approved on the update, because P6 lets the three
// progress numbers drift apart: a physical or units percent complete is typed
// (or computed from units) independently of the remaining duration that sets
// the forecast finish, so an activity can claim 80% after a fifth of its time
// while keeping a remaining duration that says it has barely begun, or claim
// 10% after a month while its remaining duration promises it will be done
// next week.
//
// For each activity in the file (WBS summaries and level of effort are left
// out: their dates and percent follow their neighbours), it reads:
//   claimed   the percent complete P6 shows for the activity's percent
//             complete type: physical (phys_complete_pct), units (actual over
//             actual + remaining labour and nonlabour units) or duration
//             (1 - remaining / original duration)
//   spent     working days on the activity's own calendar from its actual
//             start to the data date
//   left      its remaining duration, in working days
//   time      the share of its at-completion duration already spent,
//             spent / (spent + left): where the forecast says it is
// and lists, kind by kind:
//   overclaimed        physical or units % at least 30 points above `time`
//                      (and at least 5 working days of forecast left): more
//                      progress claimed than the forecast finish allows for;
//                      either the claim is ahead of the work or the remaining
//                      duration was never brought down to match it
//   optimistic         physical or units % at the rate so far,
//                      spent x (100 - claimed) / claimed, needs at least 1.5
//                      times the remaining duration and 5 working days more:
//                      the forecast finish is earlier than the work's pace
//                      supports
//   stalled            started at least 5 working days before the data date
//                      with 0% claimed
//   overrun            spent + left is at least 1.5 times the original
//                      duration and 5 working days longer (any percent type):
//                      the activity is now forecast far longer than planned,
//                      which a narrative should explain
//   zero-remaining     in progress with no remaining duration: P6 finishes it
//                      at the data date, so an actual finish was probably
//                      forgotten, or the remainder was never estimated
//   full-not-finished  in progress at 100% physical or units: the same, from
//                      the claim side
//   progress-unstarted not started but with a percent claimed, or actual
//                      units booked: the progress is invisible to the dates
//                      (and to earned value, which reads 0 for unstarted work
//                      only when the type is duration)
//   finished-short     completed with physical % below 100: P6 counts it as
//                      100% in earned value; the field was not updated
//
// The thresholds are reviewer conventions, not a standard: no published
// guide fixes them, so they are parameters (`opts`) and shown in the text.
//
// progressReview(xer, { model, projId, opts }) -> {
//   checked, byType, items: [{ kind, code, name, type, claimed, time, spent,
//   left, orig, why }], counts, summary, warnings
// }

import { buildModel } from "./cpm.mjs";
import { num, formatDate } from "./xer.mjs";

export const DEFAULTS = { aheadPoints: 30, rateFactor: 1.5, minDays: 5, overrunFactor: 1.5, stalledDays: 5 };

export const KINDS = [
  ["overclaimed", "Progress claimed ahead of the forecast"],
  ["optimistic", "Remaining duration shorter than the pace so far"],
  ["stalled", "Started, nothing claimed"],
  ["overrun", "Forecast far longer than planned"],
  ["zero-remaining", "In progress with no remaining duration"],
  ["full-not-finished", "100% claimed, not finished"],
  ["progress-unstarted", "Progress on an activity not started"],
  ["finished-short", "Finished with physical % below 100"],
];
const KIND_NAME = new Map(KINDS);
const TYPE_NAME = new Map([["CP_Phys", "physical"], ["CP_Units", "units"], ["CP_Drtn", "duration"]]);

const r1 = (x) => Math.round(x * 10) / 10;
const r0 = (x) => Math.round(x);

// the percent P6 shows for the activity's type, 0-100, or null if unreadable
export function claimedPercent(row) {
  const type = row.complete_pct_type || "CP_Drtn";
  if (type === "CP_Phys") return num(row.phys_complete_pct);
  if (type === "CP_Units") {
    const act = (num(row.act_work_qty) ?? 0) + (num(row.act_equip_qty) ?? 0);
    const rem = (num(row.remain_work_qty) ?? 0) + (num(row.remain_equip_qty) ?? 0);
    return act + rem > 0 ? (100 * act) / (act + rem) : null;
  }
  const od = num(row.target_drtn_hr_cnt), rd = num(row.remain_drtn_hr_cnt);
  if (row.status_code === "TK_Complete") return 100;
  if (row.status_code !== "TK_Active") return 0;
  return od > 0 && rd !== null ? Math.max(0, Math.min(100, 100 * (1 - rd / od))) : null;
}

export function progressReview(xer, { model: model0 = null, projId = null, opts = {} } = {}) {
  const o = { ...DEFAULTS, ...opts };
  const model = model0 || buildModel(xer);
  const warnings = [];
  const items = [];
  const byType = { CP_Phys: 0, CP_Units: 0, CP_Drtn: 0 };
  let checked = 0, active = 0, noDataDate = 0;
  for (const t of model.tasks.values()) {
    if (t.span) continue;
    if (projId !== null && t.proj !== projId) continue;
    checked++;
    const row = t.row;
    const type = TYPE_NAME.has(row.complete_pct_type) ? row.complete_pct_type : "CP_Drtn";
    byType[type]++;
    const tn = TYPE_NAME.get(type);
    const hpd = (t.cal.hoursPerDay || 8) * 60;
    const p = model.projects.get(t.proj);
    const dd = p ? p.dataDate : null;
    const claimed = claimedPercent(row);
    const base = { code: t.code, name: t.name, type: tn, claimed: claimed === null ? null : r1(claimed), orig: r1(t.orig / hpd) };
    const push = (kind, why, extra = {}) => items.push({ kind, ...base, ...extra, why });
    const independent = type !== "CP_Drtn";
    const milestone = t.type === "TT_Mile" || t.type === "TT_FinMile";

    if (t.status === "TK_Complete") {
      const pp = num(row.phys_complete_pct);
      if (type === "CP_Phys" && pp !== null && pp < 100) push("finished-short", `finished${t.actEnd !== null ? ` ${formatDate(t.actEnd)}` : ""} with physical ${r1(pp)}%: P6 reads a finished activity as 100% in earned value, so the field was left behind`);
      continue;
    }
    if (t.status !== "TK_Active") {
      const pp = num(row.phys_complete_pct) ?? 0;
      const actUnits = (num(row.act_work_qty) ?? 0) + (num(row.act_equip_qty) ?? 0);
      if (type === "CP_Phys" && pp > 0) push("progress-unstarted", `not started, yet ${r1(pp)}% physical claimed: give it an actual start or clear the percent`);
      else if (actUnits > 0) push("progress-unstarted", `not started, yet ${r1(actUnits)} actual units booked: give it an actual start or move the units`);
      continue;
    }
    active++;
    if (milestone) continue;
    if (dd === null || dd === undefined || t.actStart === null || t.actStart === undefined) { noDataDate++; continue; }
    const spent = dd > t.actStart ? t.cal.workBetween(t.actStart, dd) / hpd : 0;
    const left = t.remain / hpd;
    const orig = t.orig / hpd;
    const time = spent + left > 0 ? (100 * spent) / (spent + left) : null;
    const nums = { spent: r1(spent), left: r1(left), time: time === null ? null : r0(time) };

    if (t.remain === 0) {
      push("zero-remaining", `in progress since ${formatDate(t.actStart)} with 0 d remaining: P6 finishes it at the data date ${formatDate(dd)}; record the actual finish or estimate what is left`, nums);
      continue;
    }
    if (independent && claimed !== null && claimed >= 100) {
      push("full-not-finished", `${tn} 100% but not finished, ${r1(left)} d still forecast: finish it or take the percent back`, nums);
      continue;
    }
    if (independent && claimed !== null && time !== null && claimed - time >= o.aheadPoints && left >= o.minDays) {
      push("overclaimed", `${r1(claimed)}% ${tn} claimed, but ${r1(spent)} d spent and ${r1(left)} d left puts it ${r0(time)}% through its time; at the claimed rate about ${r1((spent * (100 - claimed)) / claimed)} d would be left`, nums);
    } else if (independent && claimed !== null && claimed > 0 && spent >= 1) {
      const atRate = (spent * (100 - claimed)) / claimed;
      if (atRate >= left * o.rateFactor && atRate - left >= o.minDays) push("optimistic", `${r1(claimed)}% ${tn} in ${r1(spent)} d, so about ${r1(atRate)} d left at a straight-line pace, against ${r1(left)} d in the schedule: its forecast finish is ${r1(atRate - left)} working days early`, { ...nums, atRate: r1(atRate) });
    }
    if (independent && (claimed === null || claimed === 0) && spent >= o.stalledDays) {
      push("stalled", `started ${formatDate(t.actStart)}, ${r1(spent)} working days before the data date, with 0% ${tn} claimed`, nums);
    }
    if (orig > 0 && spent + left >= orig * o.overrunFactor && spent + left - orig >= o.minDays) {
      push("overrun", `${r1(spent)} d spent + ${r1(left)} d left = ${r1(spent + left)} d against ${r1(orig)} d planned (${r0((100 * (spent + left)) / orig)}%)`, nums);
    }
  }
  if (noDataDate) warnings.push(`${noDataDate} in-progress ${noDataDate === 1 ? "activity has" : "activities have"} no actual start or no data date and ${noDataDate === 1 ? "was" : "were"} not checked`);
  const counts = Object.fromEntries(KINDS.map(([k]) => [k, items.filter((x) => x.kind === k).length]));
  const order = new Map(KINDS.map(([k], i) => [k, i]));
  // largest gap first within a kind: points claimed ahead, days early,
  // days stalled, days over plan
  const size = (x) => x.kind === "overclaimed" ? (x.claimed ?? 0) - (x.time ?? 0)
    : x.kind === "optimistic" ? x.atRate - x.left
    : x.kind === "stalled" ? x.spent
    : x.kind === "overrun" ? x.spent + x.left - x.orig : 0;
  items.sort((a, b) => order.get(a.kind) - order.get(b.kind) || size(b) - size(a) || String(a.code).localeCompare(String(b.code)));
  const flagged = new Set(items.map((x) => x.code)).size;
  return { checked, active, byType, items, counts, flagged, opts: o, summary: { checked, active, flagged, ...counts }, warnings };
}

export function progressText(r) {
  const L = [];
  const o = r.opts;
  L.push(`Progress review: ${r.checked} activities (${r.byType.CP_Phys} physical %, ${r.byType.CP_Units} units %, ${r.byType.CP_Drtn} duration %), ${r.active} in progress; ${r.flagged} flagged.`);
  L.push(`Thresholds: claimed ${o.aheadPoints}+ points ahead of time spent; pace needing ${o.rateFactor}x the remaining; stalled ${o.stalledDays}+ d at 0%; overrun ${o.overrunFactor}x planned; ${o.minDays}+ working days for a gap to count.`);
  for (const [k, name] of KINDS) {
    const xs = r.items.filter((x) => x.kind === k);
    L.push("", `${name}: ${xs.length}`);
    for (const x of xs.slice(0, 25)) L.push(`  ${x.code}  ${x.name}: ${x.why}`);
    if (xs.length > 25) L.push(`  ... and ${xs.length - 25} more (--csv lists all)`);
  }
  if (r.warnings.length) L.push("", ...r.warnings.map((w) => `Note: ${w}`));
  return L.join("\n") + "\n";
}

// a cell a spreadsheet would run as a formula (=, +, -, @, tab, CR) gets an
// apostrophe, numbers apart
const csvCell = (v) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function progressCsv(r) {
  const head = ["kind", "activity_id", "name", "percent_type", "claimed_pct", "time_spent_pct", "spent_d", "remaining_d", "original_d", "why"];
  const rows = r.items.map((x) => [KIND_NAME.get(x.kind), x.code, x.name, x.type, x.claimed, x.time, x.spent, x.left, x.orig, x.why]);
  return [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function progressTableHtml(r, { limit = 12 } = {}) {
  let h = "";
  for (const [k, name] of KINDS) {
    const xs = r.items.filter((x) => x.kind === k);
    if (!xs.length) continue;
    h += `<h3>${esc(name)}: ${xs.length}</h3><table><thead><tr><th>Activity</th><th>Claimed</th><th>Time spent</th><th>Why</th></tr></thead><tbody>`;
    for (const x of xs.slice(0, limit)) h += `<tr><td>${esc(x.code)} ${esc(x.name)}</td><td>${x.claimed === null ? "" : `${esc(x.claimed)}% ${esc(x.type)}`}</td><td>${x.time === null || x.time === undefined ? "" : `${esc(x.time)}%`}</td><td>${esc(x.why)}</td></tr>`;
    h += `</tbody></table>${xs.length > limit ? `<p class="note">and ${xs.length - limit} more in the CSV</p>` : ""}`;
  }
  return h || `<p>No progress inconsistencies found.</p>`;
}
