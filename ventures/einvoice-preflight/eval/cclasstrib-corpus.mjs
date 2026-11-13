// The cClassTrib checks (cclasstrib.mjs: BR-053..BR-057 in nfe.mjs, NFSE-034..NFSE-036 in
// nfse.mjs) on every NF-e, NFC-e and national NFS-e XML file that GitHub code search
// returned for "cClassTrib" on 2026-11-13 (eval/cclasstrib-corpus-list.txt: repository and
// path, 286 files from three searches). The files are other people's and are not copied
// into this tree: the script downloads them (raw.githubusercontent.com, default branch) to
// a scratch directory first, or reads one you name.
//   node eval/cclasstrib-corpus.mjs [dir]   (add --json for machine output)
// Prints how many files of each kind were read (byte-identical copies counted once after
// whitespace is removed), each classification rule's count, and each file that raised one.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkNfe } from "../nfe.mjs";
import { checkNfse } from "../nfse.mjs";

const json = process.argv.includes("--json");
const dir = process.argv.slice(2).find((a) => !a.startsWith("--")) || join(tmpdir(), "cclasstrib-corpus");
mkdirSync(dir, { recursive: true });
const list = readFileSync(new URL("./cclasstrib-corpus-list.txt", import.meta.url), "utf8").trim().split("\n").map((l) => { const i = l.indexOf(" "); return [l.slice(0, i), l.slice(i + 1)]; });
const out = { read: { nfe: 0, nfse: 0, other: 0, missing: 0, duplicate: 0 }, rules: {}, files: [] };
const seen = new Set();
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
  let r;
  if (/portalfiscal\.inf\.br\/nfe/.test(t) && /<infNFe/.test(t)) { r = checkNfe(t); out.read.nfe++; }
  else if (/sped\.fazenda\.gov\.br\/nfse/.test(t)) { r = checkNfse(t); out.read.nfse++; }
  else { out.read.other++; continue; }
  const ct = r.findings.filter((x) => /^BR-05[3-7]$|^NFSE-03[4-6]$/.test(x.rule));
  for (const x of ct) out.rules[x.rule] = (out.rules[x.rule] || 0) + 1;
  if (ct.length) out.files.push({ repo, path, findings: ct.map((x) => `${x.rule} ${x.message}`) });
}
if (json) console.log(JSON.stringify(out, null, 1));
else {
  console.log(`read: ${JSON.stringify(out.read)}\nrules: ${JSON.stringify(out.rules)}\nfiles with a classification finding: ${out.files.length}`);
  for (const f of out.files) console.log(`${f.repo} ${f.path}\n  ${f.findings.join("\n  ")}`);
}
