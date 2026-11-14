// Differential check of nfe-event.mjs's detEvento schema verdict (BRE-002/BRE-003) against
// xmllint on the official e211110_v1.00.xsd of NT 2025.002 v1.40 (events package published
// 2026-07-27), on mutants of fixtures/nfe-event-211110.xml:
//   node eval/nfe-event-xsd-diff.mjs [dir holding e211110_v1.00.xsd and tiposBasico_v1.03.xsd]
// Without a directory it downloads both from the stackin-io/data-source mirror of the
// official ZIP and checks the SHA-256 pinned below. Needs xmllint on PATH.
// Each mutant changes one thing inside detEvento: an element dropped, doubled or swapped
// with its next sibling, a value replaced, or an attribute changed. xmllint validates the
// detEvento alone (the schema's root element); nfe-event.mjs checks the whole event, and
// its verdict is "schema fault" when it reports BRE-002 or BRE-003 under detEvento.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkNfeEvent } from "../nfe-event.mjs";

const here = new URL("..", import.meta.url).pathname;
const MIRROR = "https://raw.githubusercontent.com/stackin-io/data-source/master/data/nfe/esquemas-xml/2026-07-27_esquema-xml-nf-enfc-e-schema-dos-eventos-da-nt-2025.002-v.1.40-rtc-zip.-publicado-em-27072026/Eventos_RTC/Eventos_RTC/";
const PIN = {
  "e211110_v1.00.xsd": "610452ad57365ee84667ebf2a38940422213aedf8f1419374e51ce13cc784d16",
  "tiposBasico_v1.03.xsd": "f20b13ad50eac1235aac2114fd1a98d89527c4bf895cb4e7a73342eaf53780da",
};

let dir = process.argv[2];
if (!dir) {
  dir = mkdtempSync(join(tmpdir(), "e211110-"));
  for (const [f, sha] of Object.entries(PIN)) {
    const res = await fetch(MIRROR + f);
    if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const got = createHash("sha256").update(buf).digest("hex");
    if (got !== sha) throw new Error(`${f}: SHA-256 ${got} is not the pinned ${sha}`);
    writeFileSync(join(dir, f), buf);
  }
}
if (!existsSync(join(dir, "e211110_v1.00.xsd"))) throw new Error(`no e211110_v1.00.xsd in ${dir}`);

const seed = readFileSync(join(here, "fixtures/nfe-event-211110.xml"), "utf8");
const m = /<detEvento[\s\S]*?<\/detEvento>/.exec(seed);
const [pre, det0, post] = [seed.slice(0, m.index), m[0], seed.slice(m.index + m[0].length)];

// A tiny element tokenizer over detEvento: [start, end) of every element.
function elements(xml) {
  const out = [], stack = [];
  const re = /<(\/?)([A-Za-z][\w]*)([^>]*?)(\/?)>/g;
  let t;
  while ((t = re.exec(xml))) {
    if (t[1]) { const s = stack.pop(); out.push({ name: s.name, start: s.start, end: re.lastIndex, depth: stack.length, inner: [s.innerStart, t.index] }); }
    else if (t[4]) out.push({ name: t[2], start: t.index, end: re.lastIndex, depth: stack.length, inner: null });
    else stack.push({ name: t[2], start: t.index, innerStart: re.lastIndex });
  }
  return out.sort((a, b) => a.start - b.start);
}

const BAD = ["", " 01", "x", "1.5", "01.00", "0.001", "1000", "12345678901234.00", "-1.00", "1.12345", "99", "3", "Solicitacao de Apropriacao de credito presumido", "a".repeat(21), " lead"];
const mutants = [];
const els = elements(det0).filter((e) => e.depth > 0);
for (const e of els) {
  mutants.push({ what: `drop ${e.name}`, det: det0.slice(0, e.start) + det0.slice(e.end) });
  mutants.push({ what: `double ${e.name}`, det: det0.slice(0, e.end) + det0.slice(e.start, e.end) + det0.slice(e.end) });
  const next = els.find((x) => x.start >= e.end && x.depth === e.depth);
  if (next && !els.some((x) => x.depth < e.depth && x.start > e.start && x.start < next.start)) {
    mutants.push({ what: `swap ${e.name}/${next.name}`, det: det0.slice(0, e.start) + det0.slice(next.start, next.end) + det0.slice(e.end, next.start) + det0.slice(e.start, e.end) + det0.slice(next.end) });
  }
  const leaf = e.inner && !/</.test(det0.slice(...e.inner));
  if (leaf) for (const v of BAD) mutants.push({ what: `${e.name}="${v}"`, det: det0.slice(0, e.inner[0]) + v + det0.slice(e.inner[1]) });
}
for (const v of ["0", "991", "01", "1000", "", "x", "2"]) mutants.push({ what: `nItem="${v}"`, det: det0.replace('nItem="1"', `nItem="${v}"`) });
mutants.push({ what: "drop nItem", det: det0.replace(' nItem="1"', "") });
for (const v of ["1.0", "2.00", ""]) mutants.push({ what: `versao="${v}"`, det: det0.replace('<detEvento versao="1.00"', `<detEvento versao="${v}"`) });
mutants.push({ what: "second item, same nItem", det: det0.replace(/(<gCredPresOper[\s\S]*?<\/gCredPresOper>)/, "$1$1") });
mutants.push({ what: "second item nItem 2", det: det0.replace(/(<gCredPresOper[\s\S]*?<\/gCredPresOper>)/, (s) => s + s.replace('nItem="1"', 'nItem="2"')) });
mutants.push({ what: "old layout", det: det0.replace(/<gCredPresOper nItem="1">[\s\S]*<\/gCredPresOper>/, '<gCredPres nItem="1"><vBC>1500.00</vBC><gIBS><cCredPres>01</cCredPres><pCredPres>1.0000</pCredPres><vCredPres>15.00</vCredPres></gIBS></gCredPres>') });

const tmp = mkdtempSync(join(tmpdir(), "e211110-m-"));
const xsd = join(dir, "e211110_v1.00.xsd");
function xmllintOk(det) {
  const f = join(tmp, "det.xml");
  writeFileSync(f, `<?xml version="1.0" encoding="UTF-8"?>\n${det.replace("<detEvento", '<detEvento xmlns="http://www.portalfiscal.inf.br/nfe"')}`);
  try { execFileSync("xmllint", ["--noout", "--schema", xsd, f], { stdio: "pipe" }); return true; } catch { return false; }
}
const ours = (det) => !checkNfeEvent(pre + det + post).findings.some((f) => ["BRE-002", "BRE-003"].includes(f.rule) && /detEvento/.test(f.path));

if (!xmllintOk(det0) || !ours(det0)) throw new Error("the seed itself does not validate");
let agree = 0;
const disagree = [];
for (const mu of mutants) {
  const a = xmllintOk(mu.det), b = ours(mu.det);
  if (a === b) agree++; else disagree.push(`${mu.what}: xmllint ${a ? "valid" : "invalid"}, nfe-event.mjs ${b ? "valid" : "invalid"}`);
}
console.log(`mutants: ${mutants.length}, agree: ${agree}, disagree: ${disagree.length}`);
for (const d of disagree) console.log("  " + d);
process.exitCode = disagree.length ? 1 : 0;
