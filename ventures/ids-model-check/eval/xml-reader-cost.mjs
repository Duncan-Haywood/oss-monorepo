// The XML reader alone on a large file: every element dropped as it closes
// below the root element (as the ifcXML reader drops each entity once read), so what is left is the
// reader's own cost. Prints the best of three runs' time, the highest heap
// seen (sampled every 20,000 closed elements) and the number of elements.
// For eval/xml-whitespace-2026-11-18.md.
//   node --expose-gc eval/xml-reader-cost.mjs <checker dir> file.xml

import { readFileSync } from "node:fs";
const [dir, file] = process.argv.slice(2);
const { parseXmlBytes } = await import(dir + "/xml.mjs");
const bytes = readFileSync(file);
const runs = [];
for (let r = 0; r < 3; r++) {
  gc();
  const base = process.memoryUsage().heapUsed;
  let peak = base, n = 0;
  const onClose = (node, stack) => { if (++n % 20000 === 0) peak = Math.max(peak, process.memoryUsage().heapUsed); return stack.length > 1; };
  const t0 = performance.now();
  parseXmlBytes(bytes, { onClose });
  runs.push({ s: (performance.now() - t0) / 1000, peakMB: (peak - base) / 1e6, elements: n });
}
const best = runs.reduce((a, b) => (b.s < a.s ? b : a));
console.log(JSON.stringify({ seconds: +best.s.toFixed(2), peakAboveBaseMB: Math.round(Math.max(...runs.map((r) => r.peakMB))), elements: best.elements }));
