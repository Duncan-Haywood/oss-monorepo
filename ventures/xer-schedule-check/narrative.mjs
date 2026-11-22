// The contractor's monthly schedule narrative, drafted from two P6 updates.
//
// Most construction contracts that call for a CPM schedule also call for a
// written narrative with every update (the narrative report of USACE UFGS
// 01 32 01.00 10, and the schedule narrative of many state DOT and private
// specifications; wording varies by contract): the status against the
// contract date, the critical path, the work done and the work planned but not
// done, every change made to the schedule and why, float used, the next
// period's work, and the delays with what is being done about them. A
// scheduler writes it by hand from P6 layouts each month.
//
// narrative(cmp, { lookahead, weeks, limit }) turns the update-to-update
// comparison (compare.mjs) and, when given, a look-ahead of the current update
// (lookahead.mjs) into those sections. Every number, date and activity comes
// from the files; every cause, reason and corrective action is left as a
// marked fill-in ("[FILL IN: ...]"), because the files cannot know why a duration
// changed or what held an activity up, and a narrative that guessed would be
// a false statement on a contract document. `fillIns` counts them, so the
// page can say how many are left.
//
// narrativeText(n) is plain text to paste into a letter; narrativeHtml(n,
// meta) a self-contained printable page with the fill-ins highlighted.

const FILL = (what) => `[FILL IN: ${what}]`;
const day = (s) => (s ? String(s).slice(0, 10) : "");
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const wdays = (n) => plural(Math.abs(n), "working day");
const act = (r) => `${r.code} ${r.name}`.trim();
const lagStr = (d) => (d ? ` ${d > 0 ? "+" : ""}${d}d` : "");

// "A, B and C"
function list(xs) {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
}

export function narrative(cmp, opts = {}) {
  const limit = opts.limit ?? 25;
  const a = cmp.previous, b = cmp.current, f = cmp.finish, P = cmp.progress;
  const sections = [];
  let fillIns = 0;
  const fill = (what) => { fillIns++; return FILL(what); };
  // a bulleted list capped at `limit`, with what was left out named
  const items = (rows, fmt) => {
    const out = rows.slice(0, limit).map(fmt);
    if (rows.length > limit) out.push(`... and ${rows.length - limit} more (the changes CSV lists every one).`);
    return out;
  };
  const add = (id, title, paragraphs = [], bullets = []) => sections.push({ id, title, paragraphs: paragraphs.filter(Boolean), bullets });

  // ---- 1. status
  const status = [];
  status.push(`This narrative accompanies the schedule update for ${b.name || "the project"} with a data date of ${day(b.dataDate)}. The previous update's data date was ${day(a.dataDate)}${cmp.period.workingDays !== null ? `, ${wdays(cmp.period.workingDays)} earlier` : ""}.`);
  if (f.moved === null) status.push(`The forecast completion is ${day(b.finish)}.`);
  else if (f.moved === 0) status.push(`The forecast completion is ${day(b.finish)}, unchanged from the previous update.`);
  else status.push(`The forecast completion is ${day(b.finish)}, ${wdays(f.moved)} ${f.moved > 0 ? "later" : "earlier"} than the previous update's ${day(a.finish)}.`);
  if (f.vsMustFinish !== null && f.vsMustFinish !== undefined && b.mustFinish) {
    const was = f.prevVsMustFinish;
    const rel = (v) => (v === 0 ? "on" : `${wdays(v)} ${v > 0 ? "after" : "ahead of"}`);
    status.push(`That is ${rel(f.vsMustFinish)} the contract completion date of ${day(b.mustFinish)}${was !== null && was !== undefined && was !== f.vsMustFinish ? ` (the previous update was ${rel(was)} it)` : ""}.`);
  } else {
    status.push(`The file holds no must-finish date (the project's "Must Finish By"), so the variance against the contract completion date is ${fill("contract completion date and the variance in working days")}.`);
  }
  if (f.halfStep && f.moved) {
    const part = (v) => (v === 0 ? "none" : `${wdays(v)} ${v > 0 ? "later" : "earlier"}`);
    status.push(`Split by a half-step run (the previous update's logic with this period's progress, after AACE RP 29R-03 MIP 3.4): progress during the period moved the finish ${part(f.progressEffect)}, and the changes made to the schedule ${part(f.revisionEffect)}.`);
  }
  if (f.moved > 0 || (f.vsMustFinish ?? 0) > 0) status.push(`Cause of the slip and whether a time extension is or will be requested: ${fill("cause, and any notice of delay given with its date")}.`);
  add("status", "1. Schedule status", status);

  // ---- 2. critical path
  const cp = cmp.criticalPath;
  const trail = cp.trail || [];
  const cpText = [];
  if (trail.length) {
    const shown = trail.slice(0, 12).map((r) => `${r.code} ${r.name}`);
    cpText.push(`The critical (driving) path to completion runs through ${plural(trail.length, "open activity", "open activities")}: ${list(shown)}${trail.length > 12 ? `, and ${trail.length - 12} more` : ""}.`);
  } else cpText.push("No driving path to the finish could be traced in the current update.");
  if (cp.joined.length) cpText.push(`Joined the critical path this period: ${list(cp.joined.slice(0, 10).map((r) => `${r.code} ${r.name}${r.isNew ? " (new activity)" : ""}`))}.`);
  if (cp.left.length) cpText.push(`Left it: ${list(cp.left.slice(0, 10).map((r) => `${r.code} ${r.name} (${r.now})`))}.`);
  if (!cp.joined.length && !cp.left.length && trail.length) cpText.push("The critical path holds the same activities as in the previous update.");
  cpText.push(`In the field, the critical work is ${fill("area, trade and sequence in a sentence")}.`);
  add("critical", "2. Critical path", cpText);

  // ---- 3. work performed
  const done = [];
  if (!P.started.length && !P.finished.length) done.push("No activity started or finished during the period.");
  else done.push(`${plural(P.started.length, "activity", "activities")} started and ${plural(P.finished.length, "activity", "activities")} finished during the period.`);
  const doneBullets = [
    ...items(P.finished, (r) => `Finished: ${act(r)}, ${day(r.actualFinish)}${r.daysLate ? ` (${wdays(r.daysLate)} ${r.daysLate > 0 ? "after" : "before"} the previous forecast)` : ""}`),
    ...items(P.started, (r) => `Started: ${act(r)}, ${day(r.actualStart)}`),
  ];
  add("progress", "3. Work performed this period", done, doneBullets);

  // ---- 4. planned and not done
  // an activity forecast both to start and to finish by now, and not started,
  // is one line, not two
  const notStarted = new Map(P.plannedNotStarted.map((r) => [r.code, r]));
  const missed = [
    ...P.plannedNotFinished.map((r) => ({ ...r, kind: "finish", date: r.forecastFinish, startedDate: notStarted.get(r.code)?.forecastStart })),
    ...P.plannedNotStarted.filter((r) => !P.plannedNotFinished.some((x) => x.code === r.code)).map((r) => ({ ...r, kind: "start", date: r.forecastStart })),
  ];
  const missedText = missed.length
    ? [`The previous update forecast ${plural(P.plannedNotFinished.length, "activity", "activities")} to finish and ${plural(P.plannedNotStarted.length, "activity", "activities")} to start by this data date that did not. For each, the cause:`]
    : ["Every activity the previous update forecast to start or finish by this data date did so."];
  add("missed", "4. Planned work not accomplished", missedText, items(missed, (r) => `${act(r)}: forecast to ${r.startedDate ? `start ${day(r.startedDate)} and finish` : r.kind} ${day(r.date)}${r.kind === "finish" ? `, now ${r.status}` : ""}. Cause: ${fill("cause")}`));

  // ---- 5. changes, each needing a reason
  const L = cmp.logic;
  const changes = [
    ...items(cmp.durations.origChanged, (r) => `Original duration of ${act(r)} changed from ${r.was} to ${r.now} days${r.critical ? " (critical)" : ""}. Reason: ${fill("reason")}`),
    ...items(P.remainingUp, (r) => `Remaining duration of ${act(r)} (in progress) increased from ${r.was} to ${r.now} days. Reason: ${fill("reason")}`),
    ...items(L.deleted.filter((r) => r.bothRemain), (r) => `Relationship ${r.pred} -> ${r.succ} ${r.type}${lagStr(r.lagDays)} deleted${r.critical ? " (critical path)" : ""}. Reason: ${fill("reason")}`),
    ...items(L.added, (r) => `Relationship ${r.pred} -> ${r.succ} ${r.type}${lagStr(r.lagDays)} added. Reason: ${fill("reason")}`),
    ...items(L.typeChanged, (r) => `Relationship ${r.pred} -> ${r.succ} changed from ${r.was} to ${r.now}. Reason: ${fill("reason")}`),
    ...items(L.lagChanged, (r) => `Lag on ${r.pred} -> ${r.succ} ${r.type} changed from ${r.wasLagDays} to ${r.lagDays} days. Reason: ${fill("reason")}`),
    ...items(cmp.constraints, (r) => `Constraint on ${act(r)} changed from ${r.was} to ${r.now}. Reason: ${fill("reason")}`),
    ...items(cmp.calendars, (r) => `Calendar of ${act(r)} changed from ${r.was} to ${r.now}. Reason: ${fill("reason")}`),
    ...items(cmp.activities.added, (r) => `Activity added: ${act(r)}${r.duration !== null ? `, ${r.duration} days` : ""}. Reason: ${fill("reason (change order, RFI or omission)")}`),
    ...items(cmp.activities.deleted, (r) => `Activity deleted: ${act(r)}${r.wasCritical ? " (was on the critical path)" : ""}. Reason: ${fill("reason")}`),
    ...items(cmp.activities.renamed, (r) => `Activity ${r.code} renamed from "${r.was}" to "${r.now}".`),
  ];
  add("changes", "5. Changes made to the schedule", [changes.length ? `${plural(changes.length, "change")} to logic, durations, constraints, calendars or activities were made in this update. Each is listed with its reason:` : "No logic, duration, constraint, calendar or activity changes were made in this update."], changes);

  // ---- 6. float
  const used = cmp.float.rows.filter((r) => r.floatUsed > 0);
  const floatText = [];
  if (cmp.float.newlyCritical) floatText.push(`${plural(cmp.float.newlyCritical, "activity", "activities")} that had float in the previous update ${cmp.float.newlyCritical === 1 ? "has" : "have"} none now.`);
  floatText.push(used.length ? `Float was used on ${plural(used.length, "open activity", "open activities")}; the most:` : "No open activity lost float this period.");
  add("float", "6. Float", floatText, items(used.slice(0, Math.min(limit, 10)), (r) => `${act(r)}: total float ${r.floatWas} -> ${r.floatNow} days${r.becameCritical ? " (now critical)" : ""}`));

  // ---- 7. next period
  const la = opts.lookahead;
  if (la && la.project) {
    const starting = la.activities.filter((x) => x.status === "not started");
    const finishing = la.activities.filter((x) => x.finishesInWindow);
    const crit = la.activities.filter((x) => x.critical);
    const next = [`Through ${la.through} (${la.weeks} weeks), ${plural(starting.length, "activity", "activities")} are forecast to start and ${plural(finishing.length, "activity", "activities")} to finish${crit.length ? `; ${plural(crit.length, "of them is", "of them are")} critical` : ""}.`];
    const waiting = la.activities.filter((x) => x.ready === "waits outside" || x.ready === "no predecessor");
    if (waiting.length) next.push(`${plural(waiting.length, "activity", "activities")} in that window ${waiting.length === 1 ? "waits" : "wait"} on work outside it or ${waiting.length === 1 ? "has" : "have"} no predecessor; their readiness: ${fill("materials, submittals, permits or crews still needed")}.`);
    const bullets = items([...la.activities].sort((x, y) => x.startMin - y.startMin), (x) => `${x.status === "in progress" ? "Continue" : "Start"}: ${x.code} ${x.name}, ${day(x.start)} to ${day(x.finish)}${x.critical ? " (critical)" : ""}`);
    add("next", "7. Work planned for the next period", next, bullets);
  }

  // ---- 8. problems and corrective action
  const prob = [];
  const fixes = [];
  if (P.futureActuals.length) fixes.push(...items(P.futureActuals, (r) => `${act(r)} has an ${r.field} of ${day(r.date)}, after the data date: correct it before submitting.`));
  if (P.actualsEdited.length) fixes.push(...items(P.actualsEdited, (r) => `${act(r)}: ${r.field} changed from ${day(r.was)} to ${day(r.now)} after it was reported. Reason: ${fill("reason for correcting a reported actual")}`));
  if (P.reversed.length) fixes.push(...items(P.reversed, (r) => `${act(r)} went back from ${r.was} to ${r.now}. Reason: ${fill("reason")}`));
  if (fixes.length) prob.push("Reported progress that a reviewer will query (correct or explain):");
  const late = (f.moved ?? 0) > 0 || (f.vsMustFinish ?? 0) > 0;
  const tail = [
    `Current and anticipated delays, with their causes and responsible party: ${fill("delays, owner-caused issues, RFIs or change orders pending, weather")}.`,
    late ? `Corrective action to recover the ${(f.vsMustFinish ?? 0) > 0 ? `${wdays(f.vsMustFinish)} behind the contract date` : `${wdays(f.moved)} lost this period`}: ${fill("resequencing, added crews or shifts, and the activities they apply to")}.` : null,
  ].filter(Boolean);
  add("problems", "8. Problem areas, delays and corrective action", prob, [...fixes, ...tail]);

  return {
    project: b.name, dataDate: day(b.dataDate), previousDataDate: day(a.dataDate), finish: day(b.finish), mustFinish: day(b.mustFinish),
    sections, fillIns, warnings: cmp.warnings.slice(),
  };
}

export function narrativeText(n) {
  const L = [`Schedule narrative: ${n.project}, data date ${n.dataDate}`, ""];
  for (const w of n.warnings) L.push(`NOTE (delete before sending): ${w}`);
  if (n.warnings.length) L.push("");
  for (const s of n.sections) {
    L.push(s.title, "");
    for (const p of s.paragraphs) L.push(p, "");
    for (const b of s.bullets) L.push(`- ${b}`);
    if (s.bullets.length) L.push("");
  }
  L.push(`(${plural(n.fillIns, "fill-in")} left: search for "[FILL IN".)`);
  return L.join("\n") + "\n";
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// escape, then mark each fill-in so it prints highlighted and is easy to find
const mark = (s) => esc(s).replace(/\[FILL IN: ([^\]]*)\]/g, '<mark class="fill">[$1]</mark>');

export function narrativeHtml(n, meta = {}) {
  const title = `Schedule narrative: ${n.project}, data date ${n.dataDate}`;
  const head = [meta.by ? `Prepared by ${esc(meta.by)}` : "", meta.to ? `For ${esc(meta.to)}` : "", meta.ref ? `Reference ${esc(meta.ref)}` : ""].filter(Boolean).join(" &middot; ");
  const body = n.sections.map((s) => `<section><h2>${esc(s.title)}</h2>${s.paragraphs.map((p) => `<p>${mark(p)}</p>`).join("")}${s.bullets.length ? `<ul>${s.bullets.map((b) => `<li>${mark(b)}</li>`).join("")}</ul>` : ""}</section>`).join("\n");
  const notes = n.warnings.length ? `<div class="notes no-print"><strong>Notes on the files (not printed):</strong><ul>${n.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:15px/1.5 Georgia,serif;color:#111;background:#fff;max-width:46rem;margin:2rem auto;padding:0 1rem}h1{font-size:1.4rem;margin-bottom:.2rem}h2{font-size:1.1rem;margin:1.6rem 0 .4rem;border-bottom:1px solid #ccc}.meta{color:#555;font-size:.9rem}mark.fill{background:#fff3a0;padding:0 .2em}.notes{border:1px solid #e0c060;background:#fffbe6;padding:.5rem 1rem;margin:1rem 0;font-size:.9rem}.left{font-size:.85rem;color:#555}@media print{.no-print{display:none}mark.fill{background:none;border-bottom:1px dashed #000}}</style></head>
<body><h1>${esc(title)}</h1><p class="meta">Previous update ${esc(n.previousDataDate)} &middot; forecast completion ${esc(n.finish)}${n.mustFinish ? ` &middot; contract completion ${esc(n.mustFinish)}` : ""}${head ? `<br>${head}` : ""}</p>
<p class="left no-print">${esc(plural(n.fillIns, "highlighted fill-in"))} left for the scheduler. Dates, activities and day counts come from the two XER files; causes and reasons do not, and are left for you to write.</p>
${notes}
${body}
</body></html>
`;
}
