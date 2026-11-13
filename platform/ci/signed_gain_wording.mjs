// Scan for gain words in front of a negative amount, in calculator findings.
// Used by check_signed_gain_wording.py; prints one JSON object per line:
// {"venture", "phrase", "field", "factor"} for the first bad phrase per venture.
//
// Red team 2026-11-13: horse-boarding, campground and pet-waste calculators
// told a user whose per-unit margin was negative that "each extra horse adds
// about -$270.00 a month; each empty stall costs you that" (an empty stall
// saves it), and at a margin of exactly $0.00 that each unit "costs more than
// it brings in". Each calculator exporting SAMPLE and compute() is run on its
// sample with every numeric field scaled by 0, 0.1, 0.5, 2 and 10.
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const BAD = /\b(adds?|leaves?|earns?|saves?|gains?|makes?|nets|keeps?|brings? in) (about |roughly |around )?-[$£€]\d|costs? more than [^.]{0,40}\(-?[$£€]0\.00\)/;
export const FACTORS = [0, 0.1, 0.5, 2, 10];

const texts = (r) => JSON.stringify([r?.findings, r?.advice, r?.warnings, r?.notes].filter(Boolean));

export async function scanVenture(dir) {
  const f = join(dir, "calc.mjs");
  if (!existsSync(f)) return null;
  const src = readFileSync(f, "utf8");
  if (!/export const SAMPLE\b/.test(src) || !/export function compute\b/.test(src)) return null;
  let m;
  try { m = await import(pathToFileURL(f).href); } catch { return null; }
  if (!m.SAMPLE || typeof m.SAMPLE !== "object" || Array.isArray(m.SAMPLE)) return null;
  const keys = Object.keys(m.SAMPLE).filter((k) => /^-?\d+(\.\d+)?$/.test(String(m.SAMPLE[k])));
  const runs = [[null, 1, m.SAMPLE]];
  for (const k of keys) for (const x of FACTORS) runs.push([k, x, { ...m.SAMPLE, [k]: String(Number(m.SAMPLE[k]) * x) }]);
  for (const [field, factor, raw] of runs) {
    let r;
    try { r = m.compute(raw); } catch { continue; }
    const hit = texts(r).match(BAD);
    if (hit) return { phrase: hit[0], field, factor };
  }
  return { phrase: null };
}

const root = process.argv[2];
if (root) {
  const ventures = join(root, "ventures");
  let scanned = 0;
  for (const v of readdirSync(ventures).sort()) {
    const res = await scanVenture(join(ventures, v));
    if (!res) continue;
    scanned++;
    if (res.phrase) console.log(JSON.stringify({ venture: v, ...res }));
  }
  console.log(JSON.stringify({ scanned }));
}
