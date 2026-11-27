// How much memory measuring a CAD file takes: node scripts/heap.ts <file>...
// For each file, the smallest V8 old-space size (MB) that measures it, found by bisection in a
// child process, and the time the run took at a generous heap (cold, so slower than a warm
// Worker). An empty STEP needs about 9 MB (Node itself). A Worker isolate has 128 MB in all;
// docs/GEOMETRY-LIMITS.md in apps/jobshop-quote has the numbers behind MAX_MEASURE_BYTES.
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { basename } from "node:path";

if (process.env.CAD_HEAP_CHILD) {
  const { readFileSync } = await import("node:fs");
  const { extractFeatures } = await import("../src/index.ts");
  const file = process.argv[2] as string;
  const t0 = performance.now();
  extractFeatures(new Uint8Array(readFileSync(file)), basename(file));
  console.log(Math.round(performance.now() - t0));
  process.exit(0);
}

const self = new URL(import.meta.url).pathname;
const run = (file: string, mb: number) =>
  spawnSync(
    process.execPath,
    [`--max-old-space-size=${mb}`, "--max-semi-space-size=1", self, file],
    {
      env: { ...process.env, CAD_HEAP_CHILD: "1" },
      encoding: "utf8",
    },
  );

for (const file of process.argv.slice(2)) {
  let lo = 8;
  let hi = 1024;
  if (run(file, hi).status !== 0) {
    console.log(JSON.stringify({ file: basename(file), error: `does not measure in ${hi} MB` }));
    continue;
  }
  while (hi - lo > 2) {
    const mid = Math.floor((lo + hi) / 2);
    if (run(file, mid).status === 0) hi = mid;
    else lo = mid;
  }
  const ms = Number(run(file, 1024).stdout.trim());
  const kb = Math.round(statSync(file).size / 1024);
  console.log(JSON.stringify({ file: basename(file), kb, minHeapMb: hi, ms }));
}
