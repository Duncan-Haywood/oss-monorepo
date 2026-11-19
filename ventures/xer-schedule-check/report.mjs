// A written schedule review an owner's rep can print to PDF and send.
//
// reviewHtml(assessment, comparison?, meta?) turns the DCMA assessment
// (dcma.mjs) and, when given, the update-to-update comparison (compare.mjs)
// into one self-contained HTML document: a cover block, a summary, numbered
// corrections ranked high / medium / low with the exact activities behind each,
// the 14-point scorecard, the driving path and, for an update, what changed.
// No scripts and no outside files, so it prints the same anywhere (the browser's
// "Save as PDF" is the PDF step) and opens in any mail client or archive.
//
// reviewItems(assessment, comparison?) is the ranked list on its own, so the
// CLI and tests can read the same decisions the document prints.

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const RANK = { high: 0, medium: 1, low: 2 };

// What to ask the scheduler to do for each failing DCMA point, and how serious
// a failure is for a reviewer who has to rely on the dates. High = the dates
// cannot be relied on; medium = the logic can hide delay; low = good practice.
const DCMA_ACTION = {
  1: ["medium", "Add a predecessor and a successor to each open activity listed, so a delay to it moves the work after it."],
  2: ["medium", "Replace each negative lag (lead) with logic that shows why the successor can start early, for example by splitting the predecessor."],
  3: ["low", "Explain or remove each positive lag listed; a long lag usually stands for work (curing, review, delivery) that should be an activity."],
  4: ["low", "Check the start-to-start, finish-to-finish and start-to-finish links listed; most links should be finish-to-start."],
  5: ["medium", "Justify each hard constraint listed against the contract, or replace it with logic; hard constraints override the network and can hide delay."],
  6: ["medium", "Tie the high-float activities listed into the work that really depends on them; float over 44 working days usually means missing successors."],
  7: ["high", "Show a recovery plan for the negative-float activities listed, or explain the constraint that produces the negative float."],
  8: ["low", "Break the long activities listed into pieces that can be statused each month (DCMA's limit is 44 working days)."],
  9: ["high", "Correct the invalid dates listed: actual dates after the data date, or forecast dates before it."],
  10: ["low", "Load resources or cost on the activities listed, if the contract asks for a resource- or cost-loaded schedule."],
  11: ["medium", "Explain the missed activities listed and how the remaining work recovers them."],
  12: ["high", "Repair the driving path: delaying an activity on it did not move the project finish by the same amount, so a constraint, lag or missing link breaks the path."],
  13: ["medium", "Show how the forecast finish is achievable: the critical path length index is below 0.95, so the remaining path needs more than the time left."],
  14: ["medium", "Explain why fewer activities finished than the schedule planned to date (baseline execution index below 0.95)."],
};
const EXTRA_ACTION = {
  loops: ["high", "Break each logic loop listed; P6 refuses to schedule a loop and the dates around it are not valid."],
  "out-of-sequence": ["medium", "Correct the out-of-sequence progress listed: either the logic is wrong or the actual dates are; retained logic and progress override give different finish dates here."],
  "open-finish": ["low", "Add a finish-side successor to each activity listed; with only start-to-start successors it can run long without moving anything."],
};

// The comparison's own flags carry their severity; these turn them into asks.
const FLAG_ACTION = (text) => `Explain in the narrative: ${text.charAt(0).toLowerCase()}${text.slice(1)}.`;

export function reviewItems(a, c = null) {
  const out = [];
  for (const k of a.checks) {
    if (k.pass) continue;
    // the critical path test with nothing to delay: the finish has no driving logic
    if (k.id === 12 && k.value === null && k.items.length) {
      out.push({ severity: "medium", source: `DCMA 12. ${k.name}`, measure: "could not run",
        action: "Show the logic that drives the project finish: the driving path holds no open activity with a duration, so the critical path test could not run.", items: k.items });
      continue;
    }
    if (k.value === null) continue;
    const [severity, action] = Object.hasOwn(DCMA_ACTION, k.id) ? DCMA_ACTION[k.id] : ["low", `Review DCMA point ${k.id}.`];
    out.push({ severity, source: `DCMA ${k.id}. ${k.name}`, action,
      measure: `${fmtVal(k.value, k.unit)} against ${k.threshold}${k.total ? ` (${k.count} of ${k.total})` : ""}`, items: k.items || [] });
  }
  for (const e of a.extra) {
    if (e.pass) continue;
    const [severity, action] = Object.hasOwn(EXTRA_ACTION, e.id) ? EXTRA_ACTION[e.id] : ["low", e.note];
    out.push({ severity, source: e.name, action, measure: `${e.count}`, items: e.items || [] });
  }
  const rc = a.recompute;
  if (rc.compared && rc.compared - rc.matched > 0 && rc.matched / rc.compared < 0.98) {
    out.push({ severity: rc.matched / rc.compared < 0.9 ? "high" : "medium", source: "Stored dates against the logic",
      action: "Reschedule (F9) and resubmit, or explain the setting that produces the stored dates: the early finish, late finish or float stored for these activities is not what the logic gives.",
      measure: `${rc.compared - rc.matched} of ${rc.compared} open activities differ`, items: rc.items });
  }
  if (c) {
    const P = c.progress, L = c.logic;
    const lists = {
      "Actual dates changed after they were reported in the previous update": P.actualsEdited.map((r) => ({ code: r.code, name: r.name, why: `${r.field} ${r.was} -> ${r.now}` })),
      "Actual dates after the data date": P.futureActuals.map((r) => ({ code: r.code, name: r.name, why: `${r.field} ${r.date}` })),
      "Progress reversed (an activity went back from complete or in progress)": P.reversed.map((r) => ({ code: r.code, name: r.name, why: `${r.was} -> ${r.now}` })),
      "Relationships deleted on the critical path": L.deleted.filter((r) => r.critical && r.bothRemain).map((r) => ({ code: `${r.pred} -> ${r.succ}`, name: "", why: `${r.type}${lag(r.lagDays)} deleted` })),
      "Original durations shortened on critical activities": c.durations.origChanged.filter((r) => r.critical && r.now < r.was).map((r) => ({ code: r.code, name: r.name, why: `${r.was} -> ${r.now} days` })),
      "Constraints added, removed or changed": c.constraints.map((r) => ({ code: r.code, name: r.name, why: `${r.was} -> ${r.now}` })),
      "Relationships deleted between activities that are still in the schedule": L.deleted.filter((r) => r.bothRemain).map((r) => ({ code: `${r.pred} -> ${r.succ}`, name: "", why: `${r.type}${lag(r.lagDays)}${r.critical ? " (critical path)" : ""}` })),
      "Original durations changed on activities not yet started": c.durations.origChanged.map((r) => ({ code: r.code, name: r.name, why: `${r.was} -> ${r.now} days${r.critical ? " (critical)" : ""}` })),
      "Lags changed": L.lagChanged.map((r) => ({ code: `${r.pred} -> ${r.succ}`, name: "", why: `${r.type} ${r.wasLagDays} -> ${r.lagDays} days` })),
      "Relationship types changed": L.typeChanged.map((r) => ({ code: `${r.pred} -> ${r.succ}`, name: "", why: `${r.was} -> ${r.now}` })),
      "Activity calendars changed": c.calendars.map((r) => ({ code: r.code, name: r.name, why: `${r.was} -> ${r.now}` })),
      "Remaining duration grew on work in progress": P.remainingUp.map((r) => ({ code: r.code, name: r.name, why: `${r.was} -> ${r.now} days` })),
      "Activities forecast to finish by this data date that did not": P.plannedNotFinished.map((r) => ({ code: r.code, name: r.name, why: `forecast ${r.forecastFinish}, now ${r.status}` })),
      "Activities forecast to start by this data date that did not": P.plannedNotStarted.map((r) => ({ code: r.code, name: r.name, why: `forecast ${r.forecastStart}` })),
      "Activities deleted": c.activities.deleted.map((r) => ({ code: r.code, name: r.name, why: `${r.status}${r.wasCritical ? ", was critical" : ""}` })),
      "Activities added": c.activities.added.map((r) => ({ code: r.code, name: r.name, why: r.status })),
      "Activities that became critical": c.float.rows.filter((r) => r.becameCritical).map((r) => ({ code: r.code, name: r.name, why: `float ${r.floatWas} -> ${r.floatNow} days` })),
    };
    for (const f of c.flags) {
      out.push({ severity: f.severity, source: "Change since the previous update", action: FLAG_ACTION(f.text), measure: `${f.count}`, items: Object.hasOwn(lists, f.text) ? lists[f.text] : [] });
    }
  }
  // stable sort: severity, then the order above (DCMA, extra, recompute, changes)
  return out.map((x, i) => [x, i]).sort((p, q) => RANK[p[0].severity] - RANK[q[0].severity] || p[1] - q[1]).map(([x]) => x);
}

function lag(d) { return d ? ` ${d > 0 ? "+" : ""}${d}d` : ""; }
function fmtVal(v, unit = "") {
  if (v === null || v === undefined) return "n/a";
  if (typeof v !== "number") return `${v}${unit ? " " + unit : ""}`;
  const r = unit.startsWith("%") ? Math.round(v * 10) / 10 : Math.round(v * 1000) / 1000;
  return `${r}${unit ? (unit === "%" ? "%" : " " + unit) : ""}`;
}
const days = (d) => (d === null || d === undefined ? "n/a" : `${d > 0 ? "+" : ""}${d} working day${Math.abs(d) === 1 ? "" : "s"}`);

function table(head, rows) {
  if (!rows.length) return "";
  return `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

// meta: { reviewer, recipient, reference, notes, date, limit }
export function reviewHtml(a, c = null, meta = {}) {
  const limit = meta.limit ?? 40;
  const p = a.project;
  const items = reviewItems(a, c);
  const n = { high: 0, medium: 0, low: 0 };
  for (const x of items) n[x.severity]++;
  const date = meta.date || new Date().toISOString().slice(0, 10);
  const title = `Schedule review: ${p.name}, data date ${p.dataDate || "n/a"}`;

  const verdict = n.high
    ? `${n.high} high-priority correction${n.high === 1 ? "" : "s"} should be made before the dates in this update are relied on.`
    : n.medium
      ? "No high-priority faults; the medium items below should be answered in the next update or its narrative."
      : "No high- or medium-priority faults were found by these checks.";
  const late = p.mustFinish && p.finish && p.finish > p.mustFinish;

  const summary = [
    ["Project", `${p.name}${p.code && p.code !== p.name ? ` (${p.code})` : ""}`],
    ["File", `P6 ${p.version || "?"}; ${p.activities} activities (${p.open} open), ${p.relationships} relationships`],
    ["Data date", p.dataDate || "n/a"],
    ["Forecast finish (recomputed from the logic)", `${p.finish || "n/a"}${p.storedFinish && p.storedFinish !== p.finish ? `; the file stores ${p.storedFinish}` : ""}`],
    ["Contract or must-finish date", p.mustFinish ? `${p.mustFinish}${late ? " (forecast is later)" : ""}` : "none in the file"],
    ["DCMA 14-point assessment", `${a.passed} of 14 pass`],
  ];
  if (c) {
    summary.push(["Previous update", `data date ${c.previous.dataDate}, forecast finish ${c.previous.finish}`]);
    summary.push(["Forecast finish movement this period", `${days(c.finish.moved)}${c.finish.halfStep ? `: progress ${days(c.finish.progressEffect)}, revisions ${days(c.finish.revisionEffect)} (half-step)` : ""}`]);
  }

  const corr = items.map((x, i) => {
    const shown = x.items.slice(0, limit);
    const more = x.items.length > limit ? `<p class="small">${x.items.length - limit} more not printed; the CSV download from the page lists them all.</p>` : "";
    return `<section class="item"><h3><span class="sev ${x.severity}">${x.severity}</span> ${i + 1}. ${esc(x.action)}</h3>
<p class="small">${esc(x.source)}: ${esc(x.measure)}</p>
${table(["Activity", "Name", "Detail"], shown.map((r) => [r.code, r.name, r.why]))}${more}</section>`;
  }).join("\n");

  const score = table(["#", "Point", "Result", "Threshold", ""], a.checks.map((k) => [k.id, k.name, `${fmtVal(k.value, k.unit)}${k.total ? ` (${k.count}/${k.total})` : ""}`, k.threshold, k.value === null ? "n/a" : k.pass ? "pass" : "fail"]));
  const path = table(["Activity", "Name", "Start", "Finish", "Float (days)"], a.drivingPath.slice(0, limit).map((d) => [d.code, d.name, d.start, d.finish, d.float]));

  let changes = "";
  if (c) {
    const P = c.progress;
    changes = `<h2>What changed since the previous update</h2>
<p>${P.started.length} started, ${P.finished.length} finished this period; ${P.plannedNotFinished.length} forecast to finish by this data date did not. Activities ${c.previous.activities} &rarr; ${c.current.activities}; relationships ${c.previous.relationships} &rarr; ${c.current.relationships}; ${c.logic.added.length} relationships added, ${c.logic.deleted.length} deleted.</p>
${c.criticalPath.trail.length ? `<h3>Driving path now, and how far each finish moved</h3>${table(["Activity", "Name", "Finish now", "Moved"], c.criticalPath.trail.slice(0, limit).map((r) => [r.code, r.name, r.finishNow, r.isNew ? "new" : days(r.moved)]))}` : ""}`;
  }

  const warn = [...a.warnings, ...(c ? c.warnings : [])];
  const to = [meta.recipient && `To: ${meta.recipient}`, meta.reviewer && `From: ${meta.reviewer}`, meta.reference && `Reference: ${meta.reference}`, `Date: ${date}`].filter(Boolean);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
body{font:11pt/1.45 Georgia,"Times New Roman",serif;color:#111;max-width:780px;margin:24px auto;padding:0 18px}
h1{font-size:18pt;margin:0 0 6px}h2{font-size:13pt;margin:22px 0 8px;border-bottom:1px solid #999;padding-bottom:3px}h3{font-size:11pt;margin:14px 0 4px}
.meta{color:#333;margin:0 0 14px}.meta div{margin:1px 0}
table{border-collapse:collapse;width:100%;font:9pt/1.35 Arial,Helvetica,sans-serif;margin:4px 0 8px}
th,td{border:1px solid #bbb;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eee}
dl{display:grid;grid-template-columns:minmax(150px,38%) 1fr;gap:3px 12px;margin:0}dt{font-weight:bold}dd{margin:0}
.sev{display:inline-block;font:bold 8pt Arial,sans-serif;text-transform:uppercase;padding:1px 6px;border-radius:3px;border:1px solid}
.sev.high{color:#8a1010;border-color:#8a1010}.sev.medium{color:#7a5200;border-color:#7a5200}.sev.low{color:#445;border-color:#667}
.small{font-size:9pt;color:#444;margin:2px 0}.verdict{font-weight:bold}.notes{white-space:pre-wrap;border-left:3px solid #999;padding-left:10px}
.item{break-inside:avoid-page}footer{margin-top:26px;font-size:8.5pt;color:#555;border-top:1px solid #bbb;padding-top:6px}
@media print{body{margin:0;max-width:none}h2{break-after:avoid}thead{display:table-header-group}}
</style></head><body>
<h1>${esc(title)}</h1>
<div class="meta">${to.map((t) => `<div>${esc(t)}</div>`).join("")}</div>
${meta.notes ? `<h2>Reviewer's notes</h2><p class="notes">${esc(meta.notes)}</p>` : ""}
<h2>Summary</h2>
<dl>${summary.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
<p class="verdict">${esc(verdict)}</p>
<p>${items.length ? `${items.length} item${items.length === 1 ? "" : "s"} to address: ${n.high} high, ${n.medium} medium, ${n.low} low.` : ""}</p>
${warn.length ? `<p class="small"><strong>Read with care:</strong> ${warn.slice(0, 8).map(esc).join(" ")}</p>` : ""}
${items.length ? `<h2>Corrections requested</h2>\n${corr}` : ""}
<h2>DCMA 14-point assessment</h2>
${score}
<p class="small">Missed tasks (11) and BEI (14) use the file's planned dates as the baseline; P6 resets planned dates on activities not started each time it schedules, so both can flatter the schedule.</p>
${path ? `<h2>Driving path to the forecast finish</h2>${path}` : ""}
${changes}
<footer>Prepared with XER Schedule Check (MIT licence), https://marisstella.app/xer-schedule-check/. The checks are computed from the XER file alone; they are not engineering, legal, contractual or scheduling advice, and no warranty is given. Not affiliated with, endorsed by or sponsored by Oracle, Primavera or the Defense Contract Management Agency.</footer>
</body></html>
`;
}
