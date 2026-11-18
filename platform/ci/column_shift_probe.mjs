// Helper for check_column_shift.py: one JSON line per ventures/*-to-journal/calc.mjs.
//
// It takes the venture's own sample export, finds the first data row with a plain decimal amount such as "1.40",
// and rewrites that amount the way a spreadsheet writes 1,001.40 into an unquoted CSV ("1,001.40"), which splits
// the field in two and shifts every column after it. The parser must answer with a finding that is not "info"
// (an error or a warning) that the clean sample does not raise. A tool that stays quiet books a wrong amount, or
// drops the row, while the user is told nothing (payoneer-statement-to-journal did both until 2026-11-15).
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2] || ".";
const AMOUNT = /^-?\d{1,3}\.\d{2}$/;
const PARSERS = ["parsePayouts", "parseSettlements", "parseStatement", "parseRegister", "parseRows"];
const SAMPLES = ["sampleReport", "sampleStatement"];
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const loud = (r) => (r?.findings || []).filter((x) => x.severity !== "info").map((x) => x.title).sort().join("|");

export function shiftRow(sample) {
  const lines = sample.split("\n");
  const head = lines.findIndex((l) => l.includes(","));
  if (head < 0) return null;
  for (let i = head + 1; i < lines.length; i++) {
    if (lines[i].includes('"')) continue; // quoted cells would need a real CSV split; the next row will do
    const cells = lines[i].split(",");
    const k = cells.findIndex((c) => AMOUNT.test(c));
    if (k < 0) continue;
    const v = cells[k], neg = v.startsWith("-");
    cells[k] = (neg ? "-" : "") + "1," + (neg ? v.slice(1) : v).padStart(6, "0");
    const copy = [...lines]; copy[i] = cells.join(",");
    return { text: copy.join("\n"), line: i + 1, was: v, now: cells[k] };
  }
  return null;
}

const dirs = existsSync(join(root, "ventures")) ? readdirSync(join(root, "ventures")).filter((d) => d.endsWith("-to-journal")).sort() : [];
for (const d of dirs) {
  const file = join(root, "ventures", d, "calc.mjs");
  if (!existsSync(file)) continue;
  const rel = `ventures/${d}/calc.mjs`;
  let m;
  try { m = await import(pathToFileURL(file)); } catch (e) { out({ file: rel, status: "skip", detail: `import failed: ${e.message}` }); continue; }
  const parse = PARSERS.map((n) => m[n]).find((f) => typeof f === "function");
  let sample = null;
  for (const n of SAMPLES) { try { if (typeof m[n] === "function") { sample = m[n](); break; } } catch { /* a dispatcher that needs an id */ } }
  if (!parse || typeof sample !== "string") { out({ file: rel, status: "skip", detail: "no parse function or string sample" }); continue; }
  const shifted = shiftRow(sample);
  if (!shifted) { out({ file: rel, status: "skip", detail: "sample has no unquoted plain decimal amount to split" }); continue; }
  let before, after;
  try { before = loud(parse(sample)); after = loud(parse(shifted.text)); } catch (e) { out({ file: rel, status: "flagged", detail: `throws: ${e.message}` }); continue; }
  out({ file: rel, status: before === after ? "silent" : "flagged", line: shifted.line, detail: `${shifted.was} -> ${shifted.now}` });
}
