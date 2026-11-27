// Differential check of nfe-rtc-events.mjs's detEvento schema verdict (BRE-030) against
// xmllint on the official e<tpEvento>_v1.00.xsd of every other NT 2025.002 v1.40 event
// (events package published 2026-07-27), on mutants of each event in
// fixtures/nfe-events-rtc.xml and fixtures/nfe-event-110001.xml:
//   node eval/nfe-rtc-events-xsd-diff.mjs [dir holding the e*.xsd files and tiposBasico_v1.03.xsd]
// Without a directory it downloads them from the stackin-io/data-source mirror of the official
// ZIP and checks each SHA-256 pinned in nfe-rtc-events.mjs. Needs xmllint on PATH.
// Each mutant changes one thing inside one event's detEvento: an element dropped, doubled or
// swapped with its next sibling, a leaf value replaced, or an attribute changed. xmllint
// validates that detEvento alone (the schema's root element); checkNfeEvent() reads the
// whole event, and its verdict is "schema fault" when it reports BRE-030 under detEvento.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkNfeEvent } from "../nfe-event.mjs";
import { RTC_EVENTS, TIPOS_BASICO_SHA256 } from "../nfe-rtc-events.mjs";

const here = new URL("..", import.meta.url).pathname;
const MIRROR = "https://raw.githubusercontent.com/stackin-io/data-source/master/data/nfe/esquemas-xml/2026-07-27_esquema-xml-nf-enfc-e-schema-dos-eventos-da-nt-2025.002-v.1.40-rtc-zip.-publicado-em-27072026/Eventos_RTC/Eventos_RTC/";
const PIN = { "tiposBasico_v1.03.xsd": TIPOS_BASICO_SHA256 };
// 112120's file is published as "e112120_v1.00 .xsd" (a space before the extension).
const fileOf = (code) => RTC_EVENTS[code].file || `e${code}_v1.00.xsd`;
for (const code of Object.keys(RTC_EVENTS)) PIN[fileOf(code)] = RTC_EVENTS[code].sha256;

let dir = process.argv[2];
if (!dir) {
  dir = mkdtempSync(join(tmpdir(), "rtc-events-"));
  for (const [f, sha] of Object.entries(PIN)) {
    const res = await fetch(MIRROR + encodeURIComponent(f));
    if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const got = createHash("sha256").update(buf).digest("hex");
    if (got !== sha) throw new Error(`${f}: SHA-256 ${got} is not the pinned ${sha}`);
    writeFileSync(join(dir, f), buf);
  }
} else {
  for (const [f, sha] of Object.entries(PIN)) {
    if (!existsSync(join(dir, f))) throw new Error(`no ${f} in ${dir}`);
    const got = createHash("sha256").update(readFileSync(join(dir, f))).digest("hex");
    if (got !== sha) throw new Error(`${f}: SHA-256 ${got} is not the pinned ${sha}`);
  }
}

// Every event of the two fixtures, each as a standalone envEvento (pre + detEvento + post).
const seeds = [];
for (const fx of ["fixtures/nfe-events-rtc.xml", "fixtures/nfe-event-110001.xml"]) {
  const text = readFileSync(join(here, fx), "utf8");
  for (const m of text.matchAll(/<evento versao="1\.00">[\s\S]*?<\/evento>/g)) {
    const code = /<tpEvento>(\d+)<\/tpEvento>/.exec(m[0])[1];
    const d = /<detEvento[\s\S]*?<\/detEvento>/.exec(m[0]);
    const pre = `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>1</idLote>${m[0].slice(0, d.index)}`;
    const post = `${m[0].slice(d.index + d[0].length)}</envEvento>`;
    seeds.push({ code, pre, det: d[0], post });
  }
}

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

const BAD = ["", " 1", "1 ", "x", "0", "1", "2", "5", "8", "9", "1.5", "01.00", "0.001", "1.0000", "1.00", "12345678901234.00", "123456789012.0000", "-1.00",
  "2027-02-30", "2027-13-01", "2027-2-15", "1999-12-31", "2028-02-29", "2027-02-29", "12345678901234", "123456789012345", "12345678901234567", "211120", "110001", "112120", "999999",
  "ABCDEFG", "a b", " UN", "Operações", "33", "00", "a".repeat(21)];
const tmp = mkdtempSync(join(tmpdir(), "rtc-m-"));
function xmllintOk(code, det) {
  const f = join(tmp, "det.xml");
  writeFileSync(f, `<?xml version="1.0" encoding="UTF-8"?>\n${det.replace("<detEvento", '<detEvento xmlns="http://www.portalfiscal.inf.br/nfe"')}`);
  try { execFileSync("xmllint", ["--noout", "--schema", join(dir, fileOf(code)), f], { stdio: "pipe" }); return true; } catch { return false; }
}
const ours = (s, det) => !checkNfeEvent(s.pre + det + s.post).findings.some((f) => f.rule === "BRE-030" && /detEvento/.test(f.path));

let total = 0, agree = 0, invalid = 0;
const disagree = [];
const perType = {};
for (const s of seeds) {
  if (!xmllintOk(s.code, s.det) || !ours(s, s.det)) throw new Error(`the seed ${s.code} itself does not validate`);
  const det0 = s.det;
  const mutants = [];
  const els = elements(det0).filter((e) => e.depth > 0);
  for (const e of els) {
    mutants.push({ what: `drop ${e.name}`, det: det0.slice(0, e.start) + det0.slice(e.end) });
    mutants.push({ what: `double ${e.name}`, det: det0.slice(0, e.end) + det0.slice(e.start, e.end) + det0.slice(e.end) });
    const next = els.find((x) => x.start >= e.end && x.depth === e.depth);
    if (next && !els.some((x) => x.depth < e.depth && x.start > e.start && x.start < next.start)) {
      mutants.push({ what: `swap ${e.name}/${next.name}`, det: det0.slice(0, e.start) + det0.slice(next.start, next.end) + det0.slice(e.end, next.start) + det0.slice(e.start, e.end) + det0.slice(next.end) });
    }
    const isLeaf = e.inner && !/</.test(det0.slice(...e.inner));
    if (isLeaf) for (const v of BAD) mutants.push({ what: `${e.name}="${v}"`, det: det0.slice(0, e.inner[0]) + v + det0.slice(e.inner[1]) });
  }
  if (/nItem="1"/.test(det0)) {
    for (const v of ["0", "991", "01", "1000", "", "x", "2", " 1"]) mutants.push({ what: `nItem="${v}"`, det: det0.replace('nItem="1"', `nItem="${v}"`) });
    mutants.push({ what: "drop nItem", det: det0.replace(' nItem="1"', "") });
    const g = /<(g[A-Za-z]+) nItem="1">[\s\S]*?<\/\1>/.exec(det0)[0];
    mutants.push({ what: "second item, same nItem", det: det0.replace(g, g + g) });
    mutants.push({ what: "second item nItem 3", det: det0.replace(g, g + g.replace('nItem="1"', 'nItem="3"')) });
  }
  for (const v of ["1.0", "2.00", ""]) mutants.push({ what: `versao="${v}"`, det: det0.replace('<detEvento versao="1.00"', `<detEvento versao="${v}"`) });
  mutants.push({ what: "no versao", det: det0.replace(' versao="1.00"', "") });
  mutants.push({ what: "unknown child at end", det: det0.replace("</detEvento>", "<xObs>x</xObs></detEvento>") });
  const ent = RTC_EVENTS[s.code];
  if (ent.ntDesc) mutants.push({ what: "the NT's descEvento", det: det0.replace(ent.desc, ent.ntDesc) });
  mutants.push({ what: "descEvento without accents", det: det0.replace(ent.desc, ent.desc.normalize("NFD").replace(/[̀-ͯ]/g, "")) });

  perType[s.code] = { mutants: mutants.length, disagree: 0 };
  for (const mu of mutants) {
    total++;
    const a = xmllintOk(s.code, mu.det), b = ours(s, mu.det);
    if (!a) invalid++;
    if (a === b) agree++;
    else { perType[s.code].disagree++; disagree.push(`${s.code} ${mu.what}: xmllint ${a ? "valid" : "invalid"}, nfe-event.mjs ${b ? "valid" : "invalid"}`); }
  }
}
for (const [code, r] of Object.entries(perType)) console.log(`${code}: ${r.mutants} mutants, ${r.disagree} disagree`);
console.log(`event types: ${seeds.length}, mutants: ${total} (${invalid} invalid under xmllint), agree: ${agree}, disagree: ${disagree.length}`);
for (const d of disagree) console.log("  " + d);
process.exitCode = disagree.length ? 1 : 0;
