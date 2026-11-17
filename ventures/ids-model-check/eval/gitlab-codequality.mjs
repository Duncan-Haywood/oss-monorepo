#!/usr/bin/env node
// What a GitLab merge request's Code Quality widget would say when a model is
// replaced by its next revision: issues are "new" or "resolved" by fingerprint
// (codeQuality() in ci.mjs). Run on real revision pairs: X.ifc and X2.ifc in
// DIR (the HHS Office exports in opensourceBIM/IFC-files, whose MEP2.ifc is a
// BIMserver re-serialisation that renumbers and reorders every entity), each
// checked against every IDS in samples/ and eval/corpus/real
// (eval/fetch-audit-corpus.sh).
//
//   node eval/gitlab-codequality.mjs DIR
//
// For each pair and IDS it compares the widget's new/resolved counts with the
// element-level truth (failing GlobalIds per specification that appear or
// disappear, over the full lists), under the shipped keying and two ablations:
//   shipped   GlobalId+class fingerprint, first MAX per spec by GlobalId (CQ_MAX, default 1000)
//   fileorder GlobalId+class fingerprint, first MAX per spec in file order
//   stepid    #id fingerprint, first MAX in file order (a naive report)
// and checks that every element issue sits on its own "#id=" line.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { check, readModel, parseModel, parseIds } from "../node.mjs";
import { codeQuality, cqElements, stepLines, failCount, severity } from "../ci.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node eval/gitlab-codequality.mjs DIR"); process.exit(2); }
const here = new URL("..", import.meta.url).pathname;
const idsFiles = [
  ...readdirSync(join(here, "samples")).filter((f) => f.endsWith(".ids.xml")).map((f) => join(here, "samples", f)),
  ...readdirSync(join(here, "eval/corpus/real")).filter((f) => f.endsWith(".ids")).map((f) => join(here, "eval/corpus/real", f)),
];
const idsParsed = idsFiles.map((f) => { try { return { f, ids: parseIds(readFileSync(f, "utf8")) }; } catch (e) { return { f, error: e.message }; } }).filter((x) => !x.error);
const pairs = readdirSync(dir).filter((f) => /^(.*)2\.ifc$/i.test(f) && readdirSync(dir).includes(f.replace(/2\.ifc$/i, ".ifc"))).map((f) => [f.replace(/2\.ifc$/i, ".ifc"), f]);
const MAX = Number(process.env.CQ_MAX || 1000); // issues per failing specification (ci-cli.mjs --gitlab-max-per-spec)

const fmt = (n) => n.toLocaleString("en-US");
const diff = (a, b) => [...b].filter((x) => !a.has(x)).length;
console.log(`max per spec: ${MAX}; IDS files: ${idsParsed.length} (of ${idsFiles.length}); pairs: ${pairs.map((p) => p.join(" -> ")).join(", ")}`);
const rows = [];
for (const [a, b] of pairs) {
  const load = async (f) => { const m = await readModel(join(dir, f)); return { text: m.text, parsed: parseModel(m.text) }; };
  const m1 = await load(a), m2 = await load(b);
  const tot = { pair: `${a} -> ${b}`, idsWithFailures: 0, specsFailing: 0, specsFull: 0, issues2: 0, bytes2: 0, onLine: 0, elementIssues: 0, dupFp: 0, truthNew: 0, truthRes: 0 };
  for (const k of ["shipped", "fileorder", "stepid"]) tot[k] = { new: 0, res: 0, spurious: 0 };
  for (const { f, ids } of idsParsed) {
    const r1 = check(ids, m1.parsed, { maxFailed: 1000 }), r2 = check(ids, m2.parsed, { maxFailed: 1000 });
    const linesOf = (m, r) => stepLines(m.text, r.specs.flatMap((s) => [...s.failed.slice(0, 1), ...cqElements(s, MAX)].map((x) => x.id)));
    const L1 = linesOf(m1, r1), L2 = linesOf(m2, r2);
    const run = (r, model) => [{ model, ids: f, report: r }];
    // the same path for both revisions, as a merge request replacing the file would have
    const cq1 = codeQuality(run(r1, "model.ifc"), { lines: new Map([["model.ifc", L1]]), maxPerSpec: MAX });
    const cq2 = codeQuality(run(r2, "model.ifc"), { lines: new Map([["model.ifc", L2]]), maxPerSpec: MAX });
    if (cq2.length) tot.idsWithFailures++;
    tot.issues2 += cq2.length; tot.bytes2 += JSON.stringify(cq2).length;
    tot.dupFp += cq2.length - new Set(cq2.map((i) => i.fingerprint)).size;
    // every element issue on its own #id= line
    const rows2 = m2.text.split("\n");
    for (const i of cq2) {
      const m = /^"[^]*?" \([^)]*\): #(\d+) /.exec(i.description);
      if (!m) continue;
      tot.elementIssues++;
      if (new RegExp(`^\\s*#${m[1]}\\s*=`).test(rows2[i.location.lines.begin - 1] || "")) tot.onLine++;
    }
    // the widget, shipped keying
    const fp1 = new Set(cq1.map((i) => i.fingerprint)), fp2 = new Set(cq2.map((i) => i.fingerprint));
    // ablations and truth, per failing spec whose full list is in the report (both revisions)
    const ab = { fileorder: [new Set(), new Set()], stepid: [new Set(), new Set()] };
    const truth = [new Set(), new Set()];
    const gidOf = [new Map(), new Map()]; // #id key -> GlobalId key, per revision
    let full = true;
    r1.specs.forEach((s1, k) => {
      const s2 = r2.specs[k];
      [s1, s2].forEach((s, j) => {
        if (severity(s) === "pass" || s.status === "invalid") return;
        if (j === 1) tot.specsFailing++;
        if (failCount(s) > s.failed.length) full = false;
        for (const x of s.failed) truth[j].add(`${k}|${x.globalId ? x.globalId + " " + x.type : "#" + x.id}`);
        for (const x of s.failed.slice(0, MAX)) { ab.fileorder[j].add(`${k}|${x.globalId ? x.globalId + " " + x.type : "#" + x.id}`); ab.stepid[j].add(`${k}|#${x.id}`); gidOf[j].set(`${k}|#${x.id}`, `${k}|${x.globalId ? x.globalId + " " + x.type : "#" + x.id}`); }
      });
      if (severity(s2) !== "pass" && s2.status !== "invalid" && failCount(s1) <= s1.failed.length && failCount(s2) <= s2.failed.length) tot.specsFull++;
    });
    if (!full) continue; // truth needs both full lists; such IDS files are counted above, not in the widget comparison
    const tNew = new Set([...truth[1]].filter((x) => !truth[0].has(x)));
    const tRes = new Set([...truth[0]].filter((x) => !truth[1].has(x)));
    tot.truthNew += tNew.size; tot.truthRes += tRes.size;
    // shipped: a new (resolved) element issue is spurious when its element is
    // not in the truth's new (resolved) set; the element is found from the
    // issue's "<spec name>" and "#id" through that revision's report
    const elementKey = (r) => { const m = new Map(); r.specs.forEach((s, k) => { for (const x of s.failed) m.set(`${s.name}\u0000${x.id}`, `${k}|${x.globalId ? x.globalId + " " + x.type : "#" + x.id}`); }); return m; };
    const E1 = elementKey(r1), E2 = elementKey(r2);
    const tail = ` (${f}): #`;
    const keyOfIssue = (i, E) => { const at = i.description.indexOf(tail); if (at < 0) return null; const id = /^(\d+) /.exec(i.description.slice(at + tail.length)); return id ? E.get(`${i.description.slice(1, at - 1)}\u0000${id[1]}`) : null; };
    const nw = cq2.filter((i) => !fp1.has(i.fingerprint)), rs = cq1.filter((i) => !fp2.has(i.fingerprint));
    tot.shipped.new += nw.length; tot.shipped.res += rs.length;
    tot.shipped.spurious += nw.filter((i) => !tNew.has(keyOfIssue(i, E2))).length + rs.filter((i) => !tRes.has(keyOfIssue(i, E1))).length;
    for (const name of ["fileorder", "stepid"]) {
      const [s1, s2] = ab[name];
      const nw = [...s2].filter((x) => !s1.has(x)), rs = [...s1].filter((x) => !s2.has(x));
      tot[name].new += nw.length; tot[name].res += rs.length;
      const g = (j, x) => (name === "stepid" ? gidOf[j].get(x) : x);
      tot[name].spurious += nw.filter((x) => !tNew.has(g(1, x))).length + rs.filter((x) => !tRes.has(g(0, x))).length;
    }
  }
  rows.push(tot);
  console.log(JSON.stringify(tot));
}
console.log("\n| Pair | IDS with issues | Failing specs (rev 2) | Issues (rev 2) | JSON | On own #id= line | Duplicate fingerprints | Truth new / resolved | Shipped new / resolved (spurious) | File-order cap | #id keys |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const t of rows) console.log(`| ${t.pair} | ${t.idsWithFailures} | ${fmt(t.specsFailing)} | ${fmt(t.issues2)} | ${fmt(Math.round(t.bytes2 / 1024))} KB | ${fmt(t.onLine)} of ${fmt(t.elementIssues)} | ${t.dupFp} | ${fmt(t.truthNew)} / ${fmt(t.truthRes)} | ${fmt(t.shipped.new)} / ${fmt(t.shipped.res)} (${fmt(t.shipped.spurious)}) | ${fmt(t.fileorder.new)} / ${fmt(t.fileorder.res)} (${fmt(t.fileorder.spurious)}) | ${fmt(t.stepid.new)} / ${fmt(t.stepid.res)} (${fmt(t.stepid.spurious)}) |`);
