#!/usr/bin/env node
// Reads every ifcXML and .ifczip file in xBIM's test folders (fetched by
// eval/fetch-xbim-samples.sh) and, for 4walls1floorSite, compares the ifcXML
// export with the STEP file it came from, attribute by attribute (xBIM writes
// STEP #N as id "iN"). Each zip entry is also compared with `unzip -p` when
// that is installed.
//
//   node eval/ifcxml-xbim.mjs [dir]
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { resources, readModel, check } from "../node.mjs";
import { Model } from "../ids.mjs";

const root = process.argv[2] || new URL("./xbim/Tests", import.meta.url).pathname;
if (!existsSync(root)) { console.error(`no files at ${root}; run eval/fetch-xbim-samples.sh first`); process.exit(2); }
const { schemas } = resources();
let unzip = true;
try { execFileSync("unzip", ["-v"], { stdio: "ignore" }); } catch { unzip = false; }

console.log("| file | form | schema | entities | reader notes | zip entry vs unzip -p |");
console.log("| --- | --- | --- | --- | --- | --- |");
let bad = 0;
for (const sub of ["TestFiles", "TestSourceFiles"]) {
  const dir = join(root, sub);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((f) => /\.(ifcxml|ifczip)$/i.test(f)).sort()) {
    const path = join(dir, f);
    try {
      const m = await readModel(path);
      let zipNote = "";
      if (/\.ifczip$/i.test(f)) {
        if (unzip) {
          const ref = execFileSync("unzip", ["-p", path, m.name], { maxBuffer: 1 << 28 }).toString("utf8").replace(/^﻿/, "");
          const same = ref === m.text;
          if (!same) bad++;
          zipNote = `${m.name}: ${same ? "identical" : "DIFFERENT"}`;
        } else zipNote = `${m.name} (unzip not installed)`;
      }
      const model = new Model(m.text, schemas);
      const notes = model.parseErrors.length ? model.parseErrors.slice(0, 2).join("; ") + (model.parseErrors.length > 2 ? ` (+${model.parseErrors.length - 2})` : "") : "none";
      console.log(`| ${sub}/${f} | ${model.format} | ${model.schemaRaw} | ${model.entities.size} | ${notes} | ${zipNote} |`);
    } catch (e) {
      bad++;
      console.log(`| ${sub}/${f} | | | | ERROR ${e.message} | |`);
    }
  }
}

// The pair: STEP and xBIM's ifcXML export of it.
const step = join(root, "TestFiles/4walls1floorSite.ifc"), xml = join(root, "TestFiles/4walls1floorSite.ifcxml");
if (existsSync(step) && existsSync(xml)) {
  const S = new Model(readFileSync(step, "utf8"), schemas), X = new Model(readFileSync(xml, "utf8"), schemas);
  const toStep = new Map([...X.entities.values()].map((e) => [e.id, Number(String(e.xmlId).replace(/^i/, ""))]));
  const byStep = new Map([...X.entities.values()].map((e) => [toStep.get(e.id), e]));
  const norm = (v, x) => Array.isArray(v) ? v.map((y) => norm(y, x)) : v && typeof v === "object" && "ref" in v ? { ref: x ? toStep.get(v.ref) : v.ref } : v && typeof v === "object" && "typed" in v ? { typed: v.typed, value: norm(v.value, x) } : v;
  let same = 0, diff = 0, missing = 0;
  for (const e of S.entities.values()) {
    const x = byStep.get(e.id);
    if (!x || x.type !== e.type) { missing++; continue; }
    e.args.forEach((v, i) => (JSON.stringify(norm(v, false)) === JSON.stringify(norm(x.args[i], true)) ? same++ : diff++));
  }
  console.log(`\n4walls1floorSite: ${S.entities.size} STEP entities, ${X.entities.size} ifcXML; ${missing} missing or retyped; attribute values ${same} identical, ${diff} different`);
  const ids = readFileSync(new URL("../samples/coordination-basics.ids.xml", import.meta.url), "utf8");
  const v = (r) => JSON.stringify(r.specs.map((s) => [s.status, s.applicable, s.failed.map((f) => f.globalId).sort()]));
  const same2 = v(check(ids, readFileSync(step, "utf8"))) === v(check(ids, readFileSync(xml, "utf8")));
  console.log(`coordination-basics.ids.xml verdicts on the two: ${same2 ? "identical" : "DIFFERENT"}`);
  if (diff || missing || !same2) bad++;
}
process.exitCode = bad ? 1 : 0;
