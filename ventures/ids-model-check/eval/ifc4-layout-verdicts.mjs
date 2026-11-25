// The checker's verdicts on a model as STEP and as nested IFC4-layout ifcXML
// (eval/ifc4-layout.mjs), against many IDS files: per specification its
// status and its applicable, passed and failed counts.
// eval/ifc4-layout-scale-2026-11-18.md.
//   node eval/ifc4-layout-verdicts.mjs "a.ifc|b.ifc" ids.xml ...
//   --xsd-layout: the shipped writer (ifcxml-writer.mjs, cli.mjs --to-ifcxml)
//     instead of this eval's (eval/ifcxml-export-2026-11-24.md)
import { readFileSync } from "node:fs";
import { parseStep } from "../step.mjs";
import { check, parseModel } from "../node.mjs";
import { writeIfc4Layout, schemaIdOf, loadSchema } from "./ifc4-layout.mjs";
import { writeIfcXml, ifcXmlSchemaFor } from "../ifcxml-writer.mjs";

const argv = process.argv.slice(2);
const xsdLayout = argv.includes("--xsd-layout");
const [models, ...ids] = argv.filter((a) => a !== "--xsd-layout");
const idsText = ids.map((f) => [f, readFileSync(f, "utf8")]);
const verdicts = (m) => idsText.map(([f, t]) => {
  try { return check(t, m, { maxFailed: 1000 }).specs.map((s) => [s.name, s.status, s.applicable, s.passed, s.failed.length]); }
  catch (e) { return { error: e.message }; }
});
for (const f of models.split("|")) {
  const text = readFileSync(f, "utf8");
  const step = parseStep(text, { eager: true });
  const parts = [];
  if (xsdLayout) writeIfcXml(step, ifcXmlSchemaFor(step.schema), (s) => parts.push(s));
  else { const id = schemaIdOf(step.schema); writeIfc4Layout(step, loadSchema(id), id, (s) => parts.push(s)); }
  const a = verdicts(parseModel(text)), xm = parseModel(parts.join(""));
  const b = verdicts(xm);
  let specs = 0, same = 0;
  const diffs = [];
  a.forEach((x, i) => {
    if (!Array.isArray(x)) { specs++; if (JSON.stringify(x) === JSON.stringify(b[i])) same++; return; }
    x.forEach((s, j) => { specs++; if (JSON.stringify(s) === JSON.stringify(b[i][j])) same++; else if (diffs.length < 5) diffs.push({ ids: ids[i].split("/").pop(), step: s, xml: b[i][j] }); });
  });
  console.log(JSON.stringify({ model: f.split("/").pop(), schema: xm.schemaId, entities: xm.entities.size, specs, same, diffs }));
}
