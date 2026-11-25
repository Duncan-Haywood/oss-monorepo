#!/usr/bin/env node
// Pulls the executable parts of an IFC EXPRESS (.exp) schema into JSON for
// where-rules.mjs: every entity's WHERE rules and DERIVE expressions, every
// defined type's WHERE rules, every FUNCTION and every global RULE, as their
// EXPRESS source text (comments stripped, whitespace folded), and which
// inverses hold one record rather than a set.
//
//   node schema/gen-rules.mjs IFC4.exp > schema/rules-ifc4.json
//
// The EXPRESS schemas are (c) buildingSMART International Limited; their notice
// allows use in software development with full attribution (README, "Sources").
// Read from the same copies as schema/gen-schema.mjs
// (ThatOpen/engine_web-ifc, src/schema-generator/*.exp).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const fold = (s) => s.replace(/\s+/g, " ").trim();

// Split at top-level semicolons (outside parentheses, brackets and strings).
function statements(body) {
  const out = [];
  let depth = 0, cur = "", str = false;
  for (const ch of body) {
    if (str) { cur += ch; if (ch === "'") str = false; continue; }
    if (ch === "'") { str = true; cur += ch; continue; }
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === ";" && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// "Label : expr" items of a WHERE section.
function whereItems(text) {
  return statements(text).map((s) => {
    const m = /^(\w+)\s*:\s*([\s\S]*)$/.exec(s);
    return m ? [m[1], fold(m[2])] : [null, fold(s)];
  });
}

export function parseRules(text) {
  const src = text.replace(/\(\*[\s\S]*?\*\)/g, " ").replace(/\r/g, "").replace(/--[^\n]*/g, " ");
  const schema = (src.match(/SCHEMA\s+(\w+)\s*;/) || [])[1] || null;
  const out = { schema, entities: {}, types: {}, functions: {}, rules: [] };
  for (const m of src.matchAll(/^TYPE\s+(\w+)\s*=(?:(?!END_TYPE)[\s\S])*?;\s*WHERE((?:(?!END_TYPE)[\s\S])*?)END_TYPE\s*;/gm)) {
    out.types[m[1].toUpperCase()] = whereItems(m[2]);
    (out.typeNames = out.typeNames || {})[m[1].toUpperCase()] = m[1];
  }
  for (const m of src.matchAll(/^ENTITY\s+(\w+)([\s\S]*?)END_ENTITY\s*;/gm)) {
    const body = m[2];
    // Sections start with a keyword on its own line.
    const sec = {};
    const re = /^\s*(DERIVE|INVERSE|UNIQUE|WHERE)\s*$/gm;
    const marks = [...body.matchAll(re)].map((x) => [x[1], x.index, x.index + x[0].length]);
    marks.forEach(([k, , end], i) => { sec[k] = body.slice(end, i + 1 < marks.length ? marks[i + 1][1] : body.length); });
    const e = {};
    if (sec.DERIVE) {
      e.derive = {};
      for (const s of statements(sec.DERIVE)) {
        const d = /^(?:SELF\\(\w+)\.)?(\w+)\s*:[\s\S]*?:=\s*([\s\S]*)$/.exec(s);
        if (d) e.derive[d[2]] = fold(d[3]);
      }
    }
    if (sec.WHERE) e.where = whereItems(sec.WHERE);
    // Inverses that hold one record, not an aggregate (Name : IfcRelX FOR Attr).
    if (sec.INVERSE) {
      const single = statements(sec.INVERSE).map((s) => /^(\w+)\s*:\s*(\w+)\s+FOR\b/.exec(s)).filter((x) => x && !/^(SET|BAG|LIST|ARRAY)$/i.test(x[2])).map((x) => x[1]);
      if (single.length) e.singleInverse = single;
    }
    if (e.derive || e.where || e.singleInverse) out.entities[m[1].toUpperCase()] = e;
  }
  for (const m of src.matchAll(/^FUNCTION\s+(\w+)([\s\S]*?)END_FUNCTION\s*;/gm)) {
    out.functions[m[1].toUpperCase()] = fold(`FUNCTION ${m[1]}${m[2]}`);
  }
  for (const m of src.matchAll(/^RULE\s+(\w+)\s+FOR\s*\(([^)]*)\)\s*;([\s\S]*?)END_RULE\s*;/gm)) {
    const body = m[3];
    const w = body.search(/^\s*WHERE\s*$/m);
    out.rules.push({ name: m[1], for: m[2].split(",").map((s) => s.trim()), body: fold(w < 0 ? body : body.slice(0, w)), where: w < 0 ? [] : whereItems(body.slice(w).replace(/^\s*WHERE/, "")) });
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const r = parseRules(readFileSync(process.argv[2], "utf8"));
  process.stdout.write(JSON.stringify(r) + "\n");
}
