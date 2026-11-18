// Runs checkFa3 over the Polish Ministry of Finance's 26 published FA(3) example invoices
// ("Przykładowe pliki dla struktury logicznej e-Faktury FA(3)", ksef.podatki.gov.pl, Pliki do pobrania),
// then seeds faults into their totals to see whether the totals checks catch them.
// The files are read from a download, not copied here:
//   curl -o fa3.zip https://ksef.podatki.gov.pl/media/e5cia0ey/przykladowe-pliki-dla-struktury-logicznej-e-faktury-fa-3.zip
//   unzip fa3.zip -d fa3
//   node eval/ksef-ministry-examples.mjs fa3/<the folder holding the .xml files>
// Seeded faults, on every P_13_n, P_14_n and P_15 the file states (one at a time):
//   +0.03 (a rounding slip of 3 grosze) and +1.00 (a wrong amount).
// A fault counts as caught if any totals rule (PL-006, PL-007, PL-008, PL-023) fires that did not fire on the original.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkFa3 } from "../fa3.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node eval/ksef-ministry-examples.mjs <folder of FA_3_Przyklad_N.xml>"); process.exit(2); }
const TOTALS = new Set(["PL-006", "PL-007", "PL-008", "PL-023"]);
const num = (f) => Number(/(\d+)\.xml$/i.exec(f)[1]);
const files = readdirSync(dir).filter((f) => /\.xml$/i.test(f)).sort((a, b) => num(a) - num(b));
const run = (text) => checkFa3(new TextEncoder().encode(text), { today: "2099-01-01" });
const kinds = new Map();
let blocking = 0;
console.log("| Example | RodzajFaktury | Findings (blocking) | Notes | Skipped | Seeded faults caught |");
console.log("|---|---|---|---|---|---|");
for (const f of files) {
  const text = readFileSync(join(dir, f), "utf8");
  const kind = /<RodzajFaktury>([^<]+)/.exec(text)?.[1] || "?";
  const base = run(text);
  const block = base.findings.filter((x) => x.severity !== "note");
  blocking += block.length;
  const baseRules = new Set(base.findings.map((x) => x.rule));
  let seeded = 0;
  let caught = 0;
  for (const m of text.matchAll(/<(P_13_\d+|P_13_6_\d|P_14_\d|P_15)>(-?[\d.]+)<\/\1>/g)) {
    for (const delta of [0.03, 1]) {
      const v = (Number(m[2]) + delta).toFixed(2);
      const mutated = text.slice(0, m.index) + `<${m[1]}>${v}</${m[1]}>` + text.slice(m.index + m[0].length);
      seeded++;
      if (run(mutated).findings.some((x) => TOTALS.has(x.rule) && !baseRules.has(x.rule))) caught++;
    }
  }
  const k = kinds.get(kind) || { files: 0, seeded: 0, caught: 0 };
  kinds.set(kind, { files: k.files + 1, seeded: k.seeded + seeded, caught: k.caught + caught });
  console.log(`| ${num(f)} | ${kind} | ${block.map((x) => x.rule).join(", ") || "none"} | ${base.findings.filter((x) => x.severity === "note").map((x) => x.rule).join(", ") || ""} | ${base.skipped.join("; ") || ""} | ${caught} of ${seeded} |`);
}
console.log("\n| RodzajFaktury | Files | Seeded faults | Caught |");
console.log("|---|---|---|---|");
let s = 0;
let c = 0;
for (const [kind, k] of [...kinds].sort()) {
  console.log(`| ${kind} | ${k.files} | ${k.seeded} | ${k.caught} |`);
  s += k.seeded;
  c += k.caught;
}
console.log(`| all | ${files.length} | ${s} | ${c} |`);
console.log(`\nBlocking findings on the Ministry's own files: ${blocking}`);
