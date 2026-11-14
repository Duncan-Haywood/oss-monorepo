// KSeF's acceptance checks beyond the XSD (fa3.mjs PL-018..PL-022), measured against
// the Polish Ministry of Finance's own pre-send validator in its MIT-licensed C# client
// (KSeF.Client/Helpers/ValidationHelper.cs, Validation/XmlUnicodeValidator.cs,
// Validation/IdentifierValidators.cs) and the cases in its unit tests
// (KSeF.Client.Tests.Core/UnitTests/ValidationHelperTests.cs). The C# is not run here
// (no .NET in the build host); its code-point ranges and check-digit weights are read from
// the source text by pattern, so a change upstream changes the reference, not this file.
//   git clone --depth 1 https://github.com/CIRFMF/ksef-client-csharp   (d628369, 2026-11-09)
//   node eval/ksef-acceptance.mjs <ksef-client-csharp checkout>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkFa3, internalIdValid, isKsefDiscouraged, isXmlChar } from "../fa3.mjs";

const repo = process.argv[2];
if (!repo) { console.error("usage: node eval/ksef-acceptance.mjs <ksef-client-csharp checkout>"); process.exit(2); }
const src = (p) => readFileSync(join(repo, p), "utf8");
let failures = 0;
const check = (ok, label) => { if (!ok) { failures++; console.log("MISMATCH " + label); } };

// 1. The Ministry's discouraged-character predicate, read from its source, against ours on every code point.
const uni = src("KSeF.Client/Validation/XmlUnicodeValidator.cs");
const ranges = [...uni.matchAll(/\(codePoint >= 0x([0-9A-F]+) && codePoint <= 0x([0-9A-F]+)(?: && \(codePoint & 0x([0-9A-F]+)\) == 0x([0-9A-F]+))?\)/g)]
  .map((m) => ({ lo: parseInt(m[1], 16), hi: parseInt(m[2], 16), mask: m[3] ? parseInt(m[3], 16) : null, eq: m[4] ? parseInt(m[4], 16) : null }));
const theirs = (cp) => ranges.some((r) => cp >= r.lo && cp <= r.hi && (r.mask === null || (cp & r.mask) === r.eq));
let flagged = 0, agreeCp = 0, total = 0;
for (let cp = 0; cp <= 0x10ffff; cp++) {
  if (cp >= 0xd800 && cp <= 0xdfff) continue; // not scalar values; a lone surrogate is an XML 1.0 fault (PL-019) on our side
  total++;
  const t = theirs(cp), o = isKsefDiscouraged(cp);
  if (t) flagged++;
  if (t === o) agreeCp++; else if (failures < 5) check(false, `U+${cp.toString(16)} theirs=${t} ours=${o}`); else failures++;
}
console.log(`1. discouraged code points: ${ranges.length} range clauses read from XmlUnicodeValidator.cs; ${agreeCp} of ${total} scalar values agree (${flagged} flagged by both)`);

// 2. Internal id check digit: generate ids with the Ministry's algorithm (MiscellaneousUtils.CalculateChecksum,
//    weights read from IdentifierValidators.cs), then every single-digit change to each.
const idv = src("KSeF.Client/Validation/IdentifierValidators.cs");
const idBody = idv.slice(idv.indexOf("HasValidChecksum(string"));
const w = /\(i % 2 == 0\) \? (\d+) : (\d+)/.exec(idBody).slice(1, 3).map(Number);
const mod = Number(/sum % (\d+)/.exec(idBody)[1]);
let seed = 20261114;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const nipWith = () => { for (;;) { const d = Array.from({ length: 9 }, () => rnd(10)); d[0] = 1 + rnd(9); const r = [6, 5, 7, 2, 3, 4, 5, 6, 7].reduce((s, k, i) => s + k * d[i], 0) % 11; if (r < 10) return d.join("") + r; } };
let made = 0, goodOk = 0, mutants = 0, mutantsCaught = 0;
for (let k = 0; k < 2000; k++) {
  const base = nipWith() + "-" + String(rnd(10000)).padStart(4, "0");
  const digits = base.replace("-", "");
  const sum = [...digits].reduce((s, c, i) => s + Number(c) * (i % 2 === 0 ? w[0] : w[1]), 0);
  const id = base + (sum % mod);
  made++; if (internalIdValid(id)) goodOk++;
  for (let pos = 11; pos < 16; pos++) for (let v = 0; v < 10; v++) {
    if (String(v) === id[pos]) continue;
    const m = id.slice(0, pos) + v + id.slice(pos + 1);
    mutants++; if (!internalIdValid(m)) mutantsCaught++;
  }
}
check(goodOk === made && mutantsCaught === mutants, "internal id");
console.log(`2. internal id (weights ${w.join(",")} mod ${mod} read from IdentifierValidators.cs): ${goodOk} of ${made} Ministry-generated ids pass; ${mutantsCaught} of ${mutants} single-digit changes to the five-digit tail refused`);

// 3. The cases of ValidationHelperTests.cs that concern the file itself, replayed on a real FA(3) file
//    (the Ministry's tests use "<Faktura></Faktura>", which our schema gate would refuse for other reasons).
//    Expected verdicts are the tests' own Assert.True / Assert.False on XmlValidationResult.IsValid.
const tests = src("KSeF.Client.Tests.Core/UnitTests/ValidationHelperTests.cs");
const base = readFileSync(new URL("../examples/fa3-invoice.xml", import.meta.url), "utf8").replace(/^<\?xml[^?]*\?>\s*/, "");
const enc = (s) => new TextEncoder().encode(s);
const mojibakePath = /"Templates", "([^"]*disallowed-unicode[^"]*)"/.exec(tests)?.[1];
const cases = [
  ["DisallowedUnicodeCharacter (U+007F before </Naglowek>)", base.replace("</Naglowek>", "\u007F</Naglowek>"), false, "U+007F"],
  ["MojibakeWithHiddenControlCharacters (their template)", mojibakePath && readFileSync(join(repo, "KSeF.Client.Tests.Core/Templates", mojibakePath), "utf8"), false, "U+009B"],
  ["XmlWithBom (string U+FEFF)", "﻿" + base, false],
  ["RawBytesWithBom (EF BB BF)", Uint8Array.from([0xef, 0xbb, 0xbf, ...enc(base)]), false],
  ["RawBytesWithoutBom", enc(base), true],
  ["PrologDeclaresNonUtf8Encoding (ISO-8859-2)", '<?xml version="1.0" encoding="ISO-8859-2"?>' + base, false],
  ["PrologDeclaresUtf8Encoding", '<?xml version="1.0" encoding="UTF-8"?>' + base, true],
  ["ContainsProcessingInstruction (<?custom-instruction data?>)", '<?xml version="1.0"?><?custom-instruction data?>' + base, false],
];
for (const name of ["DisallowedUnicodeCharacter", "MojibakeWithHiddenControlCharacters", "XmlWithBom", "RawBytesWithBom", "RawBytesWithoutBom", "PrologDeclaresNonUtf8Encoding", "PrologDeclaresUtf8Encoding", "ContainsProcessingInstruction"]) {
  check(tests.includes(`ValidateInvoiceBeforeSending_${name}_`), `test ${name} not found upstream`);
}
let caseAgree = 0;
for (const [label, input, valid, mustName] of cases) {
  if (!input) { check(false, `${label}: input missing`); continue; }
  // The mojibake template carries #placeholders#; fill them so only the encoding is at issue.
  const filled = typeof input === "string" ? input.replace(/#[a-z_0-9]+#/gi, "5260250274") : input;
  const f = checkFa3(filled, { today: "2026-11-14" }).findings.filter((x) => /^PL-01[89]$/.test(x.rule));
  const ours = f.length === 0;
  const named = !mustName || f.some((x) => x.message.includes(mustName));
  if (ours === valid && named) caseAgree++; else check(false, `${label}: theirs valid=${valid}, ours ${f.map((x) => x.rule).join(",") || "valid"}`);
  console.log(`   ${valid ? "accept" : "refuse"}  ${label}: ${f.map((x) => x.rule + (mustName ? " " + mustName : "")).join(", ") || "no PL-018/019"}`);
}
console.log(`3. ValidationHelperTests.cs file cases: ${caseAgree} of ${cases.length} agree`);

// 4. Seeded single changes to the clean file: one character inserted into a text node, at every boundary
//    of the Ministry's ranges and of XML 1.0's Char production. Their verdict: refused if the character is
//    in their ranges, or if .NET's XDocument.Parse refuses it (not an XML 1.0 Char).
const probes = [0x01, 0x08, 0x09, 0x0b, 0x1f, 0x20, 0x7e, 0x7f, 0x84, 0x85, 0x86, 0x9f, 0xa0, 0xd7ff, 0xe000, 0xfdcf, 0xfdd0, 0xfdef, 0xfdf0, 0xfffd, 0xfffe, 0xffff,
  0x10000, 0x1fffd, 0x1fffe, 0x1ffff, 0x20000, 0xefffe, 0x10fffd, 0x10fffe, 0x10ffff];
let pAgree = 0;
for (const cp of probes) {
  const xml = base.replace(/<P_7>/, "<P_7>" + String.fromCodePoint(cp));
  const theirsRefuse = theirs(cp) || !isXmlChar(cp);
  const oursRefuse = checkFa3(xml, { today: "2026-11-14" }).findings.some((x) => x.rule === "PL-019");
  if (theirsRefuse === oursRefuse) pAgree++; else check(false, `probe U+${cp.toString(16)}`);
}
console.log(`4. boundary probes in a text node: ${pAgree} of ${probes.length} agree`);
console.log(failures ? `\n${failures} mismatch(es)` : "\nall agree");
process.exit(failures ? 1 : 0);
