// Does the written review carry a windows analysis correctly on real P6
// files, end to end through files on disk and the CLI?
//
// No public series of real consecutive P6 updates exists
// (eval/compare-check-*, eval/converter-files-*), so as in windows-check.mjs
// each real file is the first update of a series made by statusing it as
// planned (status.mjs), 20 working days apart, with known changes planted:
//
//   window 1: as planned                                   -> no window correction
//   window 2: a progress slip of S days on the driving path -> no window correction
//   window 3: the predecessor of an FS link on the driving path re-estimated
//             +L days (unstarted work)                      -> "justify the revisions",
//             medium if the finish moved 5+ working days by revisions, else low,
//             naming the re-estimated activity
//   window 4: a progress slip of S2 days and, on unstarted driving-path work,
//             the duration cut by R days (the paper recovery) -> "show the
//             recovery plan" when revisions took back 2+ days, naming both
//
// Each update is written to disk with xerText and read back; the CLI gets the
// files in a shuffled order with --report --appendix. Checked: the round trip
// leaves the first file's assessment unchanged; the review's window
// corrections are exactly the ones the rules above give from the windows the
// library computes; each names its planted activity; the appendix holds every
// activity row the body cut. One seed per file is also printed to US Letter
// in headless Chromium for the page count.
//
//   node eval/review-windows-check.mjs <dir-with-xer-files> [--seeds 3] [--json out.json] [--pdf]
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { parseXer, decodeXer, num, xerText } from "../xer.mjs";
import { schedule, drivingPath } from "../cpm.mjs";
import { pickProject } from "../compare.mjs";
import { statusAsPlanned, cloneXer } from "../status.mjs";
import { windows } from "../windows.mjs";
import { assess } from "../dcma.mjs";
import { windowItems, WINDOW_LIMITS } from "../report.mjs";

const args = process.argv.slice(2);
const dir = args[0];
const SEEDS = args.includes("--seeds") ? +args[args.indexOf("--seeds") + 1] : 3;
const CLI = new URL("../cli.mjs", import.meta.url).pathname;

function rng(seed) {
  let x = (seed * 2654435761) >>> 0 || 1;
  return () => ((x ^= x << 13, x ^= x >>> 17, x ^= x << 5) >>> 0) / 4294967296;
}
function pathTasks(xer, projId) {
  const res = schedule(xer);
  return { res, p: res.projects.get(projId), path: drivingPath(res, projId).map((id) => res.model.tasks.get(id)) };
}
// driving-path work under way or due in the window ending at dd
function slipCandidates(xer, projId, dd) {
  const { res, p, path } = pathTasks(xer, projId);
  return path.filter((t) => { const r = res.tasks.get(t.id); return t.type !== "TT_Mile" && t.type !== "TT_FinMile" && (r.remES ?? r.es) < dd && t.cal === p.cal; }).map((t) => t.code);
}
// unstarted driving-path activities after dd with a duration, on the project calendar
function unstarted(xer, projId, dd, minDays, hpd) {
  const { res, p, path } = pathTasks(xer, projId);
  return path.filter((t) => { const r = res.tasks.get(t.id); return t.status === "TK_NotStart" && (r.remES ?? r.es) > dd && t.cal === p.cal && t.type === "TT_Task"; }).map((t) => t.code)
    .filter((code) => { const row = xer.tables.TASK.find((r) => r.task_code === code && r.proj_id === projId); return row && (num(row.remain_drtn_hr_cnt) ?? 0) >= minDays * hpd; });
}
function addDuration(xer, projId, code, hours) {
  const x = cloneXer(xer);
  for (const r of x.tables.TASK) if (r.task_code === code && r.proj_id === projId) for (const f of ["target_drtn_hr_cnt", "remain_drtn_hr_cnt"]) r[f] = String(Math.max(0, (num(r[f]) ?? 0) + hours));
  return x;
}

function runFile(path, seed, pdf) {
  const xer = parseXer(decodeXer(readFileSync(path)));
  const res0 = schedule(xer);
  const projId = pickProject(xer, res0.model, null).id;
  const p = res0.projects.get(projId);
  const hpd = p.cal.hoursPerDay || 8;
  const rand = rng(seed);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const step = (dd) => p.cal.addWork(dd, 20 * hpd * 60);
  const S = 1 + Math.floor(rand() * 5), L = 1 + Math.floor(rand() * 9), S2 = 3 + Math.floor(rand() * 5), R = 3 + Math.floor(rand() * 5);
  const u = [xer];
  let dd = p.dataDate;
  dd = step(dd); u.push(statusAsPlanned(u[0], projId, dd));
  dd = step(dd);
  const slip1 = pick(slipCandidates(u[1], projId, dd)) ?? null;
  u.push(statusAsPlanned(u[1], projId, dd, { slips: slip1 ? [{ code: slip1, hours: S * hpd }] : [] }));
  dd = step(dd);
  let x3 = statusAsPlanned(u[2], projId, dd);
  const reest = pick(unstarted(x3, projId, dd, 1, hpd)) ?? null;
  if (reest) x3 = addDuration(x3, projId, reest, L * hpd);
  u.push(x3);
  dd = step(dd);
  const slip2 = pick(slipCandidates(u[3], projId, dd)) ?? null;
  let x4 = statusAsPlanned(u[3], projId, dd, { slips: slip2 ? [{ code: slip2, hours: S2 * hpd }] : [] });
  const cut = pick(unstarted(x4, projId, dd, R + 1, hpd).filter((c) => c !== slip2)) ?? null;
  if (cut) x4 = addDuration(x4, projId, cut, -R * hpd);
  u.push(x4);

  // to disk and back, then the CLI on a shuffled order
  const tmp = mkdtempSync(join(tmpdir(), "rwc-"));
  const files = u.map((x, i) => { const f = join(tmp, `U${i}.xer`); writeFileSync(f, xerText(x)); return f; });
  const back = parseXer(decodeXer(readFileSync(files[0])));
  const A = assess(xer, { projId }), B = assess(back, { projId });
  const roundTrip = JSON.stringify([A.project, A.checks.map((k) => [k.value, k.count]), A.recompute.matched]) === JSON.stringify([B.project, B.checks.map((k) => [k.value, k.count]), B.recompute.matched]);
  const shuffled = files.map((f) => [f, rand()]).sort((a, b) => a[1] - b[1]).map(([f]) => f);
  const out = join(tmp, "review.html");
  const t0 = Date.now();
  const projCode = xer.tables.PROJECT.find((r) => r.proj_id === projId).proj_short_name;
  execFileSync(process.execPath, [CLI, "--windows", ...shuffled, "--project", projCode, "--report", out, "--appendix"], { stdio: "pipe", maxBuffer: 1 << 28 });
  const ms = Date.now() - t0;
  const html = readFileSync(out, "utf8");

  // what the rules give from the library's own windows run
  const rep = windows(u.map((x, i) => ({ xer: parseXer(xerText(x)), label: `U${i}.xer` })), { projectName: projCode });
  const want = windowItems(rep);
  const got = [...html.matchAll(/<span class="sev (\w+)">\w+<\/span> \d+\. (Justify the revisions|Show the recovery plan)[^<]*<\/h3>\n<p class="small">Windows analysis, window (\d)/g)].map((m) => ({ severity: m[1], kind: m[2], n: +m[3] }));
  const wantK = want.map((x) => ({ severity: x.severity, kind: x.action.startsWith("Justify") ? "Justify the revisions" : "Show the recovery plan", n: +x.source.match(/window (\d)/)[1] })).sort((a, b) => a.n - b.n);
  const exact = JSON.stringify(got.sort((a, b) => a.n - b.n)) === JSON.stringify(wantK);
  const w3 = want.find((x) => /window 3/.test(x.source)), w4 = want.find((x) => /window 4/.test(x.source));
  const rw = rep.windows;
  // appendix completeness: every row of every item over the limit
  const appendix = html.includes("Appendix A:") ? html.slice(html.indexOf("Appendix A:")) : "";
  const cutRows = [...html.matchAll(/(\d+) more not printed here; Appendix A, item (\d+), lists all (\d+)/g)].map((m) => ({ item: +m[2], all: +m[3] }));
  const appendixRows = (appendix.match(/<tr><td>/g) || []).length;
  const appendixOk = cutRows.reduce((s, x) => s + x.all, 0) === appendixRows;
  let pages = null;
  if (pdf) pages = pdfPages(out);
  return {
    file: path.split("/").pop(), seed, open: A.project.open, roundTrip, ms, exact,
    windows: rw.map((w) => ({ n: w.n, moved: w.moved, progress: w.progressEffect, revisions: w.revisionEffect })),
    planted: { slip1, reest, L, slip2, cut, R, S2 },
    reestNamed: reest ? !!w3 && w3.items.some((x) => x.code === reest) : null,
    w3Expected: reest && rw[2].revisionEffect > 0 ? (rw[2].revisionEffect >= WINDOW_LIMITS.revisionMedium ? "medium" : "low") : "none",
    w3Got: w3 ? w3.severity : "none",
    recovery: !!w4 && /recovery plan/.test(w4.action), recoveryExpected: rw[3].progressEffect > 0 && rw[3].revisionEffect <= -WINDOW_LIMITS.offsetMin,
    recoveryNamed: w4 && /recovery plan/.test(w4.action) ? w4.items.some((x) => x.code === cut) && (!slip2 || w4.items.some((x) => x.code === slip2)) : null,
    windowCorrections: got.length, cutItems: cutRows.length, appendixRows, appendixOk, pages,
  };
}

function pdfPages(file) {
  const js = `const { chromium } = require('playwright'); (async () => { const b = await chromium.launch(); const p = await b.newPage(); await p.goto('file://' + ${JSON.stringify(file)}); const buf = await p.pdf({ format: 'Letter' }); console.log((buf.toString('latin1').match(/\\/Type\\s*\\/Page[^s]/g) || []).length); await b.close(); })();`;
  try { return +execFileSync("node", ["-e", js], { encoding: "utf8", cwd: "/tmp" }).trim(); } catch { return null; }
}

const all = [];
for (const f of readdirSync(dir).filter((x) => x.toLowerCase().endsWith(".xer")).sort()) {
  for (let s = 1; s <= SEEDS; s++) {
    let r;
    try { r = runFile(join(dir, f), s, args.includes("--pdf") && s === 1); } catch (e) { r = { file: f, seed: s, error: e.message }; }
    all.push(r);
    console.log(r.error ? `${f} seed ${s}: ERROR ${r.error}` : `${f} seed ${s}: open ${r.open}, round trip ${r.roundTrip}, windows ${r.windows.map((w) => `${w.moved}(${w.progress}/${w.revisions})`).join(" ")}, corrections exact ${r.exact} (${r.windowCorrections}), w3 ${r.w3Got}/${r.w3Expected} named ${r.reestNamed}, recovery ${r.recovery}/${r.recoveryExpected} named ${r.recoveryNamed}, appendix ${r.appendixRows} rows for ${r.cutItems} items ok ${r.appendixOk}${r.pages ? `, ${r.pages} pages` : ""}, ${r.ms} ms`);
  }
}
const ok = all.filter((r) => !r.error);
console.log(`\nTOTAL: ${ok.length} series (${all.length - ok.length} errors); round trip ${ok.filter((r) => r.roundTrip).length}; corrections exact ${ok.filter((r) => r.exact).length}; window-3 severity right ${ok.filter((r) => r.w3Got === r.w3Expected).length}, re-estimate named ${ok.filter((r) => r.reestNamed).length} of ${ok.filter((r) => r.planted.reest !== null && r.w3Got !== "none").length}; recovery asked ${ok.filter((r) => r.recovery).length} (expected ${ok.filter((r) => r.recoveryExpected).length}), both named ${ok.filter((r) => r.recoveryNamed).length}; appendix complete ${ok.filter((r) => r.appendixOk).length}`);
if (args.includes("--json")) writeFileSync(args[args.indexOf("--json") + 1], JSON.stringify(all, null, 1) + "\n");
