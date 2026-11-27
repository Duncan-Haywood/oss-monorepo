// Same requests to the Node host and the Worker, response bodies compared byte for byte (as JSON).
// docs/HOSTING.md, "On Cloudflare Workers"; results in eval/worker-parity-2026-11-26.md.
//
//   PORT=8797 node pro/server.mjs &                     the Node host (memory store)
//   node worker/build.mjs && wrangler dev --port 8798 &     the Worker (local D1)
//   node eval/worker-parity.mjs http://localhost:8797 http://localhost:8798
//
// Each side gets its own trial account; every examples/*.xml and *.pdf goes to POST /v1/check with
// the official rules and fixes on. Prints one line per file and the count of identical answers.
import { readFileSync, readdirSync } from "node:fs";

const [nodeBase, workerBase] = process.argv.slice(2);
if (!nodeBase || !workerBase) {
  console.error("usage: node eval/worker-parity.mjs <node base url> <worker base url>");
  process.exit(2);
}
const dir = new URL("../examples/", import.meta.url);

async function signup(base) {
  const r = await fetch(`${base}/v1/signup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Parity", acceptTerms: true }) });
  if (r.status !== 201) throw new Error(`${base}: sign-up answered ${r.status}`);
  return (await r.json()).apiKey;
}

async function check(base, key, name, body) {
  const t = performance.now();
  const r = await fetch(`${base}/v1/check?lang=en&schematron=1&fix=1&name=${encodeURIComponent(name)}`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body });
  return { status: r.status, text: await r.text(), ms: performance.now() - t };
}

const keys = [await signup(nodeBase), await signup(workerBase)];
let same = 0;
const files = readdirSync(dir).filter((f) => /\.(xml|pdf)$/.test(f)).sort();
for (const f of files) {
  const body = readFileSync(new URL(f, dir));
  const a = await check(nodeBase, keys[0], f, body);
  const b = await check(workerBase, keys[1], f, body);
  const equal = a.status === b.status && JSON.stringify(JSON.parse(a.text)) === JSON.stringify(JSON.parse(b.text));
  if (equal) same++;
  const j = JSON.parse(a.text);
  console.log(`${equal ? "same" : "DIFF"}\t${f}\t${j.status ?? a.status}\tofficial rules: ${j.schematron ?? "-"}\tnode ${a.ms.toFixed(0)} ms\tworker ${b.ms.toFixed(0)} ms`);
}
console.log(`identical responses: ${same} of ${files.length}`);
process.exit(same === files.length ? 0 : 1);
