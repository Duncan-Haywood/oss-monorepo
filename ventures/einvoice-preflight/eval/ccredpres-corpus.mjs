// The presumed-credit checks (ccredpres.mjs: BR-058..BR-061 in nfe.mjs, and BR-056's
// cStat 1175 case) on every NF-e XML that GitHub code search returned on 2026-11-14 for
// "gCredPresOper extension:xml", "cCredPres extension:xml" and "gCredPresOper infNFe
// extension:xml" (eval/ccredpres-corpus-list.txt: repository and path, .xsd files left
// out). The files are other people's and are not copied into this tree: the script
// downloads them (raw.githubusercontent.com, default branch) to a scratch directory first,
// or reads one you name.
//   node eval/ccredpres-corpus.mjs [dir]   (add --json for machine output)
// Prints how many files were read (byte-identical copies counted once after whitespace is
// removed), how many carry gCredPresOper, the codes they use, each rule's count, and each
// file that raised one.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkNfe } from "../nfe.mjs";

const json = process.argv.includes("--json");
const dir = process.argv.slice(2).find((a) => !a.startsWith("--")) || join(tmpdir(), "ccredpres-corpus");
mkdirSync(dir, { recursive: true });
const list = readFileSync(new URL("./ccredpres-corpus-list.txt", import.meta.url), "utf8").trim().split("\n").map((l) => { const i = l.indexOf(" "); return [l.slice(0, i), l.slice(i + 1)]; });
const out = { read: { nfe: 0, withCredPres: 0, other: 0, missing: 0, duplicate: 0 }, codes: {}, rules: {}, files: [] };
const seen = new Set();
const RULE = /^BR-0(5[89]|6[01])$/;
for (const [n, [repo, path]] of list.entries()) {
  const file = join(dir, String(n + 1).padStart(3, "0") + ".xml");
  if (!existsSync(file)) {
    const res = await fetch(`https://raw.githubusercontent.com/${repo}/HEAD/${path.split("/").map(encodeURIComponent).join("/")}`).catch(() => null);
    if (!res?.ok) { out.read.missing++; continue; }
    writeFileSync(file, await res.text());
  }
  const t = readFileSync(file, "utf8");
  const key = t.replace(/\s+/g, "");
  if (seen.has(key)) { out.read.duplicate++; continue; }
  seen.add(key);
  if (!(/portalfiscal\.inf\.br\/nfe/.test(t) && /<infNFe/.test(t))) { out.read.other++; continue; }
  out.read.nfe++;
  const codes = [...t.matchAll(/<gCredPresOper>[\s\S]*?<cCredPres>([^<]*)<\/cCredPres>/g)].map((m) => m[1].trim());
  if (!codes.length) continue;
  out.read.withCredPres++;
  for (const c of codes) out.codes[c] = (out.codes[c] || 0) + 1;
  const r = checkNfe(t);
  const hits = r.findings.filter((x) => RULE.test(x.rule) || (x.rule === "BR-056" && /cStat 1175/.test(x.message)));
  for (const x of hits) { const k = x.rule + (x.severity ? ` (${x.severity})` : ""); out.rules[k] = (out.rules[k] || 0) + 1; }
  out.files.push({ repo, path, codes, findings: hits.map((x) => `${x.rule}${x.severity ? ` ${x.severity}` : ""} ${x.message}`) });
}
if (json) console.log(JSON.stringify(out, null, 1));
else {
  console.log(`read: ${JSON.stringify(out.read)}\ncCredPres codes used: ${JSON.stringify(out.codes)}\nrules: ${JSON.stringify(out.rules)}`);
  for (const f of out.files) console.log(`${f.repo} ${f.path} [${f.codes.join(",")}]\n  ${f.findings.join("\n  ") || "(no presumed-credit finding)"}`);
}
