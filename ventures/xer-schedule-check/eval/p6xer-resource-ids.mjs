import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
// Repeated P6 resource IDs and summary-task assignments in p6XerText output,
// over every MSPDI file under a directory (MPXJ's junit/data corpus).
// node eval/p6xer-resource-ids.mjs <dir> [path to a p6xer.mjs, default ../p6xer.mjs]
const mod = process.argv[3] ? new URL(process.argv[3], `file://${process.cwd()}/`).href : new URL("../p6xer.mjs", import.meta.url).href;
const { p6XerText, p6Problems } = await import(mod);
const files = execSync(`find ${process.argv[2]} -name "*.xml"`).toString().trim().split("\n");
let ok = 0, filesDup = 0, dupRes = 0, resTot = 0, filesSum = 0, sumA = 0, failed = 0, rsrcProblems = 0;
for (const f of files) {
  let r; try { r = p6XerText(readFileSync(f, "utf8")); } catch { failed++; continue; }
  ok++;
  const names = r.xer.tables.RSRC?.map((x) => x.rsrc_short_name) || [];
  resTot += names.length;
  const d = names.length - new Set(names).size;
  if (d) { filesDup++; dupRes += d; }
  if (p6Problems(r.xer.tables).some((p) => /resource ID repeated/.test(p))) rsrcProblems++;
  const w = r.warnings.find((x) => /summary tasks not carried/.test(x));
  if (w) { filesSum++; sumA += parseInt(w); }
}
console.log(JSON.stringify({ files: files.length, converted: ok, failed, resources: resTot, filesWithRepeatedRsrcIds: filesDup, repeatedRsrcIds: dupRes, p6ProblemsFlags: rsrcProblems, filesWithSummaryAssignments: filesSum, summaryAssignments: sumA }));
