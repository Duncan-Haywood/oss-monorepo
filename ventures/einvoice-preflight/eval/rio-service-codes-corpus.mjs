// ABR-026 over a directory of downloaded NFS-e files (GitHub code search for
// CodigoTributacaoMunicipio with 3304557 or notacarioca; the files are read, not copied).
//   node eval/rio-service-codes-corpus.mjs <dir>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkAbrasf, looksLikeAbrasf } from "../abrasf.mjs";

const dir = process.argv[2];
const tally = { files: 0, abrasf: 0, rio: 0, flagged: 0, noted: 0, pass: 0 };
const seen = new Set();
for (const f of readdirSync(dir).sort()) {
  const text = readFileSync(join(dir, f), "utf8");
  if (seen.has(text)) continue; // the same blob found by two searches
  seen.add(text);
  tally.files++;
  if (!/<[^>]*CodigoTributacaoMunicipio>/.test(text) || !looksLikeAbrasf(text)) continue;
  tally.abrasf++;
  const r = checkAbrasf(text);
  const rio = r.meta?.issuer === "3304557";
  if (rio) tally.rio++;
  const hits = r.findings.filter((x) => x.rule === "ABR-026");
  const notes = r.skipped.filter((s) => s.startsWith("CodigoTributacaoMunicipio"));
  const codes = [...text.matchAll(/CodigoTributacaoMunicipio>([^<]*)</g)].map((m) => m[1].trim());
  const items = [...text.matchAll(/ItemListaServico>([^<]*)</g)].map((m) => m[1].trim());
  const dates = [...text.matchAll(/<(?:\w+:)?(?:Competencia|DataEmissao)>([^<]{0,10})/g)].map((m) => m[1]);
  if (!rio) continue;
  if (hits.length) tally.flagged++; else if (notes.length) tally.noted++; else tally.pass++;
  console.log(`${f}\tcode=${codes.join(",")}\titem=${items.join(",")}\tdate=${dates[0] ?? ""}\t${hits.map((h) => h.message.slice(0, 150)).join(" | ") || notes.join(" | ").slice(0, 150) || "-"}`);
}
console.log(JSON.stringify(tally));

// Planted faults on each Rio-issued file: the code swapped for another subitem's, cut to the
// four-digit subitem, given an unknown last pair; and, on files dated after 2018, the date
// moved past 321/2025 with a code it excluded, or before it with a code it added.
const planted = { tried: 0, caught: 0, misses: [] };
const seenPlant = new Set();
for (const f of readdirSync(dir).sort()) {
  const text = readFileSync(join(dir, f), "utf8");
  if (!/<[^>]*CodigoTributacaoMunicipio>/.test(text) || !looksLikeAbrasf(text) || seenPlant.has(text)) continue;
  seenPlant.add(text);
  if (checkAbrasf(text).meta?.issuer !== "3304557") continue;
  const code = /CodigoTributacaoMunicipio>\s*(\d{6})\s*</.exec(text)?.[1];
  if (!code) continue;
  const setCode = (t, c) => t.replace(/(CodigoTributacaoMunicipio>)\s*\d{6}\s*</g, `$1${c}<`);
  const setItem = (t, i) => t.replace(/(ItemListaServico>)\s*[\d.]+\s*</g, `$1${i}<`);
  const setDate = (t, d) => t.replace(/(<(?:\w+:)?(?:Competencia|DataEmissao)>)\d{4}-\d{2}-\d{2}/g, `$1${d}`);
  const other = code.startsWith("1702") ? "010201" : "170205";
  const cases = [
    ["another subitem's code", setCode(text, other)],
    ["four-digit code", setCode(text, code.slice(0, 4)).replace(/(CodigoTributacaoMunicipio>)\d{6}</g, `$1${code.slice(0, 4)}<`)],
    ["unknown code", setCode(text, `${code.slice(0, 4)}99`)],
  ];
  const day = /<(?:\w+:)?(?:Competencia|DataEmissao)>(\d{4}-\d{2}-\d{2})/.exec(text)?.[1] ?? "";
  if (day >= "2018-08-01") {
    cases.push(["excluded by 321/2025, dated 2026", setDate(setItem(setCode(text, "070247"), "0702"), "2026-02-02")]);
    cases.push(["added by 321/2025, dated 2025", setDate(setItem(setCode(text, "070287"), "0702"), "2025-06-02")]);
  }
  for (const [what, t] of cases) {
    planted.tried++;
    if (checkAbrasf(t).findings.some((x) => x.rule === "ABR-026")) planted.caught++;
    else planted.misses.push(`${f}: ${what}`);
  }
}
console.log(JSON.stringify(planted));
