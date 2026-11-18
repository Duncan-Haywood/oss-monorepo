#!/usr/bin/env node
// IDS files whose specifications name several IFC versions ("IFC2X3 IFC4"):
// which schema the editor opens them in, how many facets it can edit, and
// whether the page's live audit agrees with the CLI's (`node cli.mjs --audit`,
// which reads each specification in every schema it names).
//
//   sh eval/fetch-audit-corpus.sh && sh eval/fetch-testcases.sh
//   node eval/multi-version.mjs
// "before" is the editor up to 2026-11-17: opened in idsSchema()'s pick (the
// version most specifications name first) and audited in that schema only.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { parseIds } from "../ids.mjs";
import { auditIds } from "../audit.mjs";
import { resources } from "../node.mjs";
import { importIds, importIdsAs, idsSchema, schemaIdsOf, auditSchemaIds, stateToDoc, buildIds } from "../editor.mjs";

const here = new URL(".", import.meta.url).pathname;
const R = resources();
const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: id === "IFC2X3" ? R.typeMap : null });
const walk = (d) => (!existsSync(d) ? [] : readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.ids$/i.test(n) ? [p] : []; })).sort();
const groups = [
  ["public IDS files", walk(join(here, "corpus/real"))],
  ["IDS-Audit-tool ValidFiles", walk(join(here, "corpus/IDS-Audit-tool/testing.shared/ValidFiles"))],
  ["buildingSMART test cases (pass-*)", walk(join(here, "IDS/Documentation/ImplementersDocumentation/TestCases")).filter((f) => /[\/]pass-/.test(f))],
];
const pick = (ids) => ({ schemas: Object.fromEntries(ids.map((id) => [id, R.schemas[id]])), typeMap: R.typeMap, psets: Object.fromEntries(ids.map((id) => [id, R.psets[id]])) });
// Errors and warnings as "spec#: code" lines, for comparing two audits.
const key = (issues) => issues.map((x) => `${x.spec}:${x.level}:${x.code}`).sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const [label, files] of groups) {
  let multi = 0, rowsBefore = 0, rowsAfter = 0, keptBefore = 0, keptAfter = 0, moved = 0;
  let agreeBefore = 0, agreeAfter = 0, falseErrBefore = 0, falseErrAfter = 0;
  const lines = [];
  for (const f of files) {
    let parsed; try { parsed = parseIds(readFileSync(f, "utf8")); } catch { continue; }
    if (!parsed.specs.some((s) => schemaIdsOf(s.ifcVersion).length > 1)) continue;
    multi++;
    const cli = key(auditIds(parsed, R));
    const old = importIdsAs(parsed, loadFor, idsSchema(parsed));
    const now = importIds(parsed, loadFor);
    rowsBefore += old.rows; rowsAfter += now.rows; keptBefore += old.kept; keptAfter += now.kept;
    if (old.state.schema !== now.state.schema) moved++;
    // The page audits the XML it writes back: before in its one schema, now in
    // every schema the draft names.
    const audit = (imp, ids) => { const L = loadFor(imp.state.schema); const xml = buildIds(stateToDoc(imp.state, L), L.S); return auditIds(parseIds(xml), pick(ids)); };
    const b = audit(old, [old.state.schema]), a = audit(now, auditSchemaIds(now.state));
    const bk = key(b), ak = key(a);
    if (same(bk, cli)) agreeBefore++;
    if (same(ak, cli)) agreeAfter++;
    const cliErr = new Set(cli.filter((x) => x.includes(":error:")));
    const fb = bk.filter((x) => x.includes(":error:") && !cliErr.has(x)).length, fa = ak.filter((x) => x.includes(":error:") && !cliErr.has(x)).length;
    falseErrBefore += fb; falseErrAfter += fa;
    if (old.state.schema !== now.state.schema || old.rows !== now.rows || fb || fa || !same(ak, cli)) lines.push(`  ${basename(f).slice(0, 70)}: ${old.state.schema} ${old.rows}/${old.rows + old.kept} -> ${now.state.schema} ${now.rows}/${now.rows + now.kept} editable; page audit errors the CLI does not raise ${fb} -> ${fa}${same(ak, cli) ? "" : " (still differs: " + ak.filter((x) => !cli.includes(x)).concat(cli.filter((x) => !ak.includes(x)).map((x) => "cli " + x)).slice(0, 4).join(", ") + ")"}`);
  }
  console.log(`${label}: ${multi} of ${files.length} files have a specification naming several versions; opened in another schema now ${moved}`);
  console.log(`  facets editable ${rowsBefore} -> ${rowsAfter} (held as written ${keptBefore} -> ${keptAfter}); page audit same as the CLI's on ${agreeBefore} -> ${agreeAfter} of ${multi}; page errors the CLI does not raise ${falseErrBefore} -> ${falseErrAfter}`);
  for (const l of lines) console.log(l);
}
