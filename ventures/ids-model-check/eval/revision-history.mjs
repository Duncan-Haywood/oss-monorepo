// Every committed revision of every IDS file in a set of public git
// repositories, diffed against the one before (revision.mjs diffIds), to see
// what real revisions change and how many changes the diff can grade exactly.
// eval/revision-diff-2026-11-20.md.
//
//   for r in OWNER/REPO ...; do git clone --filter=blob:none --no-checkout https://github.com/$r.git DIR/OWNER_REPO; done
//   node eval/revision-history.mjs DIR [--json out.json] [--show N]
//
// Revisions whose bytes are identical after a whitespace-only change are
// skipped; a revision that does not parse as IDS is counted, not diffed.

import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { diffIds, revisionReport } from "../revision.mjs";
import { parseIds } from "../ids.mjs";

const args = process.argv.slice(2);
const dir = args[0];
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const show = Number(opt("--show") || 0);
const git = (repo, ...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", maxBuffer: 1 << 28 });

const totals = { repos: 0, files: 0, revisions: 0, pairs: 0, unparsed: 0, identical: 0, specsAdded: 0, specsRemoved: 0, specsChanged: 0, specsSame: 0, renamed: 0, changes: 0, byEffect: {}, byKind: {}, specEffect: {}, errors: [] };
const rows = [];
for (const name of readdirSync(dir).sort()) {
  const repo = join(dir, name);
  let files;
  try { files = git(repo, "log", "--all", "--name-only", "--pretty=format:", "--", "*.ids", "*.IDS").split("\n").filter(Boolean); } catch { continue; }
  files = [...new Set(files)];
  if (!files.length) continue;
  totals.repos++;
  for (const f of files) {
    // Oldest first; --follow is not used so a moved file starts a new history.
    const commits = git(repo, "log", "--all", "--reverse", "--pretty=format:%H %cs", "--", f).split("\n").filter(Boolean).map((l) => l.split(" "));
    const versions = [];
    for (const [sha, date] of commits) {
      let text;
      try { text = git(repo, "show", `${sha}:${f}`); } catch { continue; } // deleted in this commit
      versions.push({ sha, date, text });
    }
    if (versions.length < 2) continue;
    totals.files++;
    totals.revisions += versions.length;
    for (let k = 1; k < versions.length; k++) {
      const a = versions[k - 1], b = versions[k];
      let A, B;
      try { A = parseIds(a.text); B = parseIds(b.text); } catch { totals.unparsed++; continue; }
      let d;
      try { d = diffIds(A, B); } catch (e) { totals.errors.push(`${name}/${f} ${b.sha.slice(0, 7)}: ${e.message}`); continue; }
      totals.pairs++;
      const s = d.summary;
      if (!s.added && !s.removed && !s.changed && !d.info.length) totals.identical++;
      totals.specsAdded += s.added; totals.specsRemoved += s.removed; totals.specsChanged += s.changed; totals.specsSame += s.same; totals.renamed += s.renamed;
      for (const sp of d.specs) {
        if (sp.status === "changed") totals.specEffect[sp.effect] = (totals.specEffect[sp.effect] || 0) + 1;
        for (const c of sp.changes) {
          totals.changes++;
          totals.byEffect[c.effect] = (totals.byEffect[c.effect] || 0) + 1;
          const k2 = c.section + " " + c.kind;
          totals.byKind[k2] = (totals.byKind[k2] || 0) + 1;
        }
      }
      rows.push({ repo: name, file: f, from: a.sha.slice(0, 7), fromDate: a.date, to: b.sha.slice(0, 7), toDate: b.date, summary: s, info: d.info.map((x) => x.field) });
      if (show && rows.length <= show && (s.changed || s.added || s.removed)) console.log(`== ${name}/${f} ${a.sha.slice(0, 7)} (${a.date}) -> ${b.sha.slice(0, 7)} (${b.date})\n` + revisionReport(d));
    }
  }
}
console.log(JSON.stringify(totals, null, 2));
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify({ totals, rows }, null, 1));
