// Joins several IFC STEP exports of the same schema into one file, the way a
// federated coordination model holds several disciplines' exports at once.
// Entity numbers of each input are shifted past the previous input's highest
// number, and every #n reference outside a string is shifted with them.
//
//   node eval/federate.mjs out.ifc a.ifc b.ifc [a.ifc again ...]
//
// Used by eval/heap-200mb-*.md to build a ~200 MB model from real exports;
// no single public export that size was found. Inputs may repeat: each copy is
// renumbered, so the entity count grows, though GlobalIds then repeat.
import { readFileSync, openSync, writeSync, closeSync } from "node:fs";
import { pathToFileURL } from "node:url";

function shift(line, off) {
  let out = "";
  let i = 0;
  let last = 0;
  const n = line.length;
  while (i < n) {
    const c = line.charCodeAt(i);
    if (c === 39) { // ' string: '' is an escaped quote
      i++;
      while (i < n) {
        if (line.charCodeAt(i) === 39) {
          if (line.charCodeAt(i + 1) === 39) { i += 2; continue; }
          break;
        }
        i++;
      }
      i++;
      continue;
    }
    if (c === 35) { // #
      let j = i + 1;
      while (j < n && line.charCodeAt(j) >= 48 && line.charCodeAt(j) <= 57) j++;
      if (j > i + 1) {
        out += line.slice(last, i + 1) + String(Number(line.slice(i + 1, j)) + off);
        last = j;
      }
      i = j;
      continue;
    }
    i++;
  }
  return out + line.slice(last);
}

export function federate(texts, write) {
  let off = 0;
  let schema = null;
  let header = null;
  for (const text of texts) {
    const s = (text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i) || [])[1];
    if (schema && s !== schema) throw new Error(`schema ${s} differs from ${schema}`);
    schema = s;
    const d = text.search(/\bDATA\s*;/);
    const e = text.lastIndexOf("ENDSEC;");
    if (d < 0 || e < d) throw new Error("no DATA section");
    if (!header) {
      header = text.slice(0, d);
      write(header + "DATA;\n");
    }
    const body = text.slice(text.indexOf(";", d) + 1, e);
    let max = 0;
    // Entity records end with ";" followed by a newline in every export used
    // here; records spanning lines are kept together by splitting on ";\n".
    for (const rec of body.split(/;\s*\n/)) {
      const r = rec.trim();
      if (!r) continue;
      const m = /^#(\d+)/.exec(r);
      if (m) max = Math.max(max, Number(m[1]));
      write(shift(r, off) + ";\n");
    }
    off += max;
  }
  write("ENDSEC;\nEND-ISO-10303-21;\n");
  return { schema, entities: off };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [out, ...inputs] = process.argv.slice(2);
  if (!out || !inputs.length) {
    console.error("usage: node eval/federate.mjs out.ifc a.ifc b.ifc ...");
    process.exit(2);
  }
  const fd = openSync(out, "w");
  let buf = "";
  const write = (s) => {
    buf += s;
    if (buf.length > 1 << 22) { writeSync(fd, buf); buf = ""; }
  };
  const r = federate(inputs.map((f) => readFileSync(f, "utf8")), write);
  writeSync(fd, buf);
  closeSync(fd);
  console.log(`${out}: ${r.schema}, highest entity number ${r.entities}`);
}
