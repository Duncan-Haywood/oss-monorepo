// Rewrites an XML file with every element on its own line, indented two
// spaces per level, the way xBIM, EDM and most exporters write ifcXML (the
// xBIM test files in eval/xbim are indented; eval/step-to-ifcxml.mjs writes
// one entity per line). Leaf elements keep their text exactly; white space
// already between elements is replaced. Eval only, for
// eval/xml-whitespace-2026-11-18.md. Assumes no comments, CDATA or processing
// instructions after the prolog, which holds for step-to-ifcxml.mjs output.
//
//   node eval/indent-xml.mjs in.xml out.xml

import { readFileSync, createWriteStream } from "node:fs";

const [inp, outp] = process.argv.slice(2);
const text = readFileSync(inp, "utf8");
const out = createWriteStream(outp);
let buf = "";
const put = (s) => { buf += s; if (buf.length > 1 << 20) { out.write(buf); buf = ""; } };
const pad = (d) => "\n" + "  ".repeat(d);
let depth = 0;
let prev = ""; // "start", "text", "end", "self", "prolog"
const tok = /<[^>]*>|[^<]+/g;
for (let m; (m = tok.exec(text)); ) {
  const t = m[0];
  if (t[0] !== "<") {
    if (/^[ \t\r\n]*$/.test(t)) continue;
    put(t); prev = "text"; continue;
  }
  if (t[1] === "?" || t[1] === "!") { put((prev ? "\n" : "") + t); prev = "prolog"; continue; }
  if (t[1] === "/") {
    depth--;
    put(prev === "text" || prev === "start" ? t : pad(depth) + t);
    prev = "end"; continue;
  }
  put((prev ? pad(depth) : "") + t);
  if (t[t.length - 2] === "/") prev = "self";
  else { depth++; prev = "start"; }
}
put("\n");
out.end(buf);
