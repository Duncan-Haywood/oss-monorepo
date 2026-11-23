// node eval/real-files.mjs <python> <file>...   Parses each file with parseToml and with tomllib and reports disagreements.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { agree } from "./toml-compare.mjs";
const [python, ...files] = process.argv.slice(2);
const srcs = files.map((f) => readFileSync(f, "utf8"));
const out = execFileSync(python, ["-I", new URL("./tomllib_dump.py", import.meta.url).pathname], { input: srcs.map((src) => JSON.stringify({ src })).join("\n") + "\n", maxBuffer: 1 << 28 }).toString().trim().split("\n").map((l) => JSON.parse(l));
let bad = 0;
files.forEach((f, i) => { const r = agree(srcs[i], out[i]); if (!r.agree) { bad++; console.log("DISAGREE", f, r.jsError || r.why || ""); } });
console.log(`${files.length - bad} of ${files.length} agree`);
