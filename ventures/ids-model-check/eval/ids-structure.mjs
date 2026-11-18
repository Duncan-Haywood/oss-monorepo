// Compares structure.mjs with IfcTester's ids.xsd validation (eval/ids-xsd-truth.py):
//   node eval/ids-structure.mjs truth.jsonl
// prints each file whose verdict differs, then the totals.
import { readFileSync } from "node:fs";
import { parseXml } from "../xml.mjs";
import { structureIssues } from "../structure.mjs";

const rows = readFileSync(process.argv[2], "utf8").trim().split("\n").map((l) => JSON.parse(l));
let same = 0, validBoth = 0, invalidBoth = 0;
const codes = {};
for (const r of rows) {
  let text, issues;
  try {
    text = readFileSync(r.file, "utf8");
    issues = structureIssues(parseXml(text, { spans: true }), text);
  } catch (e) { issues = [{ code: "unreadable", message: e.message }]; }
  const valid = !issues.length;
  for (const x of issues) codes[x.code] = (codes[x.code] || 0) + 1;
  if (valid === r.valid) { same++; valid ? validBoth++ : invalidBoth++; if (process.env.SHOW) console.log("ok", r.file, issues[0]?.message || "", "|", r.errors[0] || ""); continue; }
  console.log(`DIFF ${r.file}: ours ${valid ? "valid" : "invalid"}, ids.xsd ${r.valid ? "valid" : "invalid"}`);
  for (const x of issues.slice(0, 3)) console.log("   ours:", x.line ?? "", x.message);
  for (const e of r.errors.slice(0, 3)) console.log("   xsd: ", e.slice(0, 200));
}
console.log(`${same} of ${rows.length} files: same verdict (${validBoth} valid, ${invalidBoth} invalid both ways)`);
console.log("issue codes:", JSON.stringify(codes));
