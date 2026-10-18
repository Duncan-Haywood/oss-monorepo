#!/usr/bin/env node
// node cli.mjs <notes.txt|-> [--date 2026-10-19] [--attendees "Ana,Ben"] [--format md|csv|ics|email|json] [--ai]
// --ai adds a model pass on your own key (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY or LLM_*); the notes are sent to that provider.
import { readFile } from "node:fs/promises";
import { extractWithAi } from "./ai.mjs";
import { configFromEnv } from "./byok.mjs";
import { extract, actionsCsv, actionsMarkdown, actionsIcs, followUpEmail } from "./extract.mjs";

export async function main(argv, io = { log: console.log, err: console.error, read: (f) => readFile(f, "utf8"), env: process.env, fetch: undefined }) {
  const opt = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
  const file = argv.find((a, i) => !a.startsWith("--") && !["--date", "--attendees", "--format"].includes(argv[i - 1]));
  if (!file) { io.err("usage: cli.mjs <notes.txt|-> [--date YYYY-MM-DD] [--attendees \"Ana,Ben\"] [--format md|csv|ics|email|json]"); return 2; }
  let text;
  try { text = file === "-" ? await readFile(0, "utf8") : await io.read(file); } catch (e) { io.err(`could not read ${file}: ${e.message}`); return 2; }
  const o = { date: opt("--date"), attendees: (opt("--attendees") || "").split(",") };
  let r;
  if (argv.includes("--ai")) {
    let cfg = null;
    try { cfg = configFromEnv(io.env); } catch (e) { io.err(`AI pass off: ${e.message}`); }
    if (!cfg) io.err("AI pass off: no key found (set ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY or LLM_*). Using the rules only.");
    const x = cfg ? await extractWithAi(cfg, text, { ...o, fetch: io.fetch }) : { result: extract(text, o) };
    if (cfg && x.source !== "model") io.err(`AI pass failed (${x.error}). Using the rules only.`);
    else if (cfg) io.err(`AI pass added ${x.added} item${x.added === 1 ? "" : "s"} (marked low confidence); dropped ${x.dropped.length} it could not support.`);
    r = x.result;
  } else r = extract(text, o);
  if (!r.ok) { io.err(r.error); return 2; }
  const fmt = opt("--format") || "md";
  const out = { md: actionsMarkdown, csv: actionsCsv, ics: actionsIcs, email: followUpEmail, json: (x) => JSON.stringify(x, null, 2) }[fmt];
  if (!out) { io.err(`unknown format ${fmt}`); return 2; }
  io.log(out(r).trimEnd());
  return r.counts.unowned ? 1 : 0; // exit 1: something still needs an owner, so a CI step can gate on it
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main(process.argv.slice(2)));
