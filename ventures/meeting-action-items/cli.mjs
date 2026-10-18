#!/usr/bin/env node
// node cli.mjs <notes.txt|-> [--date 2026-10-19] [--attendees "Ana,Ben"] [--format md|csv|ics|email|json]
import { readFile } from "node:fs/promises";
import { extract, actionsCsv, actionsMarkdown, actionsIcs, followUpEmail } from "./extract.mjs";

export async function main(argv, io = { log: console.log, err: console.error, read: (f) => readFile(f, "utf8") }) {
  const opt = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
  const file = argv.find((a, i) => !a.startsWith("--") && !["--date", "--attendees", "--format"].includes(argv[i - 1]));
  if (!file) { io.err("usage: cli.mjs <notes.txt|-> [--date YYYY-MM-DD] [--attendees \"Ana,Ben\"] [--format md|csv|ics|email|json]"); return 2; }
  let text;
  try { text = file === "-" ? await readFile(0, "utf8") : await io.read(file); } catch (e) { io.err(`could not read ${file}: ${e.message}`); return 2; }
  const r = extract(text, { date: opt("--date"), attendees: (opt("--attendees") || "").split(",") });
  if (!r.ok) { io.err(r.error); return 2; }
  const fmt = opt("--format") || "md";
  const out = { md: actionsMarkdown, csv: actionsCsv, ics: actionsIcs, email: followUpEmail, json: (x) => JSON.stringify(x, null, 2) }[fmt];
  if (!out) { io.err(`unknown format ${fmt}`); return 2; }
  io.log(out(r).trimEnd());
  return r.counts.unowned ? 1 : 0; // exit 1: something still needs an owner, so a CI step can gate on it
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main(process.argv.slice(2)));
