#!/usr/bin/env node
// @ts-check
// node cli.mjs studio.json [--start 2026-11-02] [--interview <id or topic>] [--format md|csv|json|plan]
// node cli.mjs --questions
//
// studio.json is the file the page's "Download all interviews (.json)" button
// saves (or a single interview). Prints the plan, calendar and template
// drafts. The CLI never calls a model and never posts anything.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { QUESTIONS, normalizeState, generate, toCSV, toMarkdown, toJSON, isISODate, nextMonday, platformName } from "./studio.mjs";

const USAGE = "usage: cli.mjs <studio.json> [--start YYYY-MM-DD] [--interview <id|topic>] [--format md|csv|json|plan] | --questions";

/**
 * @param {string[]} argv
 * @param {{ log: (s: string) => void, err: (s: string) => void, read: (f: string) => Promise<string>, today?: string }} [io]
 */
export async function main(argv, io = { log: console.log, err: console.error, read: (f) => readFile(f, "utf8") }) {
  const opt = (/** @type {string} */ name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] ?? null : null);
  if (argv.includes("--questions")) {
    for (const q of QUESTIONS) io.log(`${q.id.padEnd(10)} ${q.prompt}`);
    return 0;
  }
  const flagValues = new Set(["--start", "--interview", "--format"].map(opt));
  const file = argv.find((a) => !a.startsWith("--") && !flagValues.has(a));
  if (!file) { io.err(USAGE); return 2; }
  let state;
  try { state = normalizeState(JSON.parse(await io.read(file))); }
  catch (e) { io.err(`could not read ${file}: ${/** @type {Error} */ (e).message}`); return 2; }
  const want = opt("--interview");
  const interview = want ? state.interviews.find((i) => i.id === want || i.topic.toLowerCase() === want.toLowerCase()) : state.interviews.find((i) => i.id === state.activeId);
  if (!interview) { io.err(`no interview "${want}". Have: ${state.interviews.map((i) => `${i.id} (${i.topic})`).join(", ")}`); return 2; }
  const startArg = opt("--start");
  if (startArg && !isISODate(startArg)) { io.err("--start must be a date like 2026-11-02"); return 2; }
  const start = startArg || nextMonday(io.today || new Date().toISOString().slice(0, 10));
  const { plan, drafts } = generate(interview, start);
  const fmt = opt("--format") || "md";
  if (fmt === "csv") io.log(toCSV(drafts).trimEnd());
  else if (fmt === "json") io.log(toJSON(drafts, plan, interview));
  else if (fmt === "md") io.log(toMarkdown(drafts, plan, interview));
  else if (fmt === "plan") {
    for (const r of plan.rows) io.log(`${`${platformName(r.platform)} ${r.name.split(" ").pop()}`.padEnd(26)} ${String(r.perWeek).padStart(4)}/week  ${r.status}`);
    io.log(`About ${Math.round((plan.usedPerWeek / 60) * 10) / 10} of ${plan.hours} hours a week.`);
    for (const n of plan.notes) io.log(`- ${n}`);
  } else { io.err(`unknown format ${fmt}`); return 2; }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
