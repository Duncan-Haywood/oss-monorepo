#!/usr/bin/env node
// Size a detention basin from the command line.
//   node cli.mjs                       the built-in example
//   node cli.mjs --areaAc 8 --postCN 90 --length 120 --width 80 [--csv]
// Any field of sampleInput() can be given as --name value; --largeA "" drops the large storm.
import { analyze, reportCsv, sampleInput } from "./detention.mjs";

const args = process.argv.slice(2);
const input = sampleInput();
let csv = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--csv") { csv = true; continue; }
  const k = args[i].replace(/^--/, "");
  if (!(k in input)) { console.error(`unknown option --${k}`); process.exit(2); }
  input[k] = args[++i] ?? "";
}
const a = analyze(input);
if (a.error) { console.error(a.error); process.exit(1); }
if (csv) { process.stdout.write(reportCsv(a)); process.exit(0); }
const f = (x, d = 2) => Number(x).toFixed(d);
console.log(`Orifice: ${f(a.outlet.orificeDiameterIn, 1)} in at the bottom`);
if (a.outlet.weirLengthFt !== null) console.log(`Weir: ${f(a.outlet.weirLengthFt)} ft long, crest at ${f(a.outlet.weirCrestFt)} ft`);
console.log(`Depth: ${f(a.requiredDepthFt)} ft with ${f(a.input.freeboard, 1)} ft freeboard; top of bank ${f(a.topLengthFt, 0)} x ${f(a.topWidthFt, 0)} ft`);
for (const s of a.storms) console.log(`${s.label}: rain ${f(s.depthIn)} in, peak ${f(s.prePeak)} -> ${f(s.postPeak)} cfs, out ${f(s.peakOut)} cfs (allowable ${f(s.allow)}), stage ${f(s.peakStage)} ft, storage ${f(s.peakStorageFt3, 0)} ft3`);
for (const x of a.findings) console.log(`[${x.severity}] ${x.title}: ${x.detail}`);
