// Class guard from the 2026-11-26 red-team run: a number a person typed with a decimal
// comma ("1,5", "130,43") reached roundHalfUpToCents as NaN and crashed repairCii and the
// ZATCA path of repairUbl with "Cannot read properties of null (reading 'toFixed')". The
// page showed that as "could not read this XML". Every numeric field of every example is
// tried here: a repair may refuse with a clear Error from the parser, or skip and say why,
// but never throw an internal TypeError and never write NaN into the file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { repairUbl } from "./repair-ubl.mjs";
import { repairCii } from "./repair-cii.mjs";
import { repairInvoice } from "./repair.mjs";

const dir = new URL("./examples/", import.meta.url);
const files = readdirSync(dir);
const comma = (v) => (v.includes(".") ? v.replace(".", ",") : `${v},0`);
const internal = (e) => !(e instanceof Error) || e instanceof TypeError || e instanceof RangeError;

test("XML repair survives a decimal comma in any numeric field of every example", () => {
  const bad = [];
  let tried = 0;
  for (const n of files.filter((f) => f.endsWith(".xml"))) {
    const src = readFileSync(new URL(n, dir), "utf8");
    const repair = /CrossIndustryInvoice/.test(src) ? repairCii : repairUbl;
    for (const m of src.matchAll(/>(-?\d+(?:\.\d+)?)</g)) {
      tried++;
      const s = src.slice(0, m.index + 1) + comma(m[1]) + src.slice(m.index + 1 + m[1].length);
      try {
        if (repair(s).xml.includes("NaN")) bad.push(`${n}@${m.index}: wrote NaN`);
      } catch (e) {
        if (internal(e)) bad.push(`${n}@${m.index}: ${e}`);
      }
    }
  }
  assert.ok(tried > 900, `only ${tried} fields tried`);
  assert.deepEqual(bad, []);
});

test("JSON repair survives a decimal-comma string in any numeric field of every example", () => {
  const bad = [];
  for (const n of files.filter((f) => f.endsWith(".json"))) {
    const inv = JSON.parse(readFileSync(new URL(n, dir), "utf8"));
    const paths = [];
    const walk = (o, p) => { for (const [k, v] of Object.entries(o ?? {})) { if (typeof v === "number") paths.push([...p, k]); else if (v && typeof v === "object") walk(v, [...p, k]); } };
    walk(inv, []);
    for (const p of paths) {
      const copy = structuredClone(inv);
      let o = copy;
      for (const k of p.slice(0, -1)) o = o[k];
      o[p.at(-1)] = comma(String(o[p.at(-1)]));
      try {
        const r = repairInvoice(copy);
        if (JSON.stringify(r.invoice ?? {}).includes("NaN")) bad.push(`${n} ${p.join(".")}: NaN`);
      } catch (e) {
        if (internal(e)) bad.push(`${n} ${p.join(".")}: ${e}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
