#!/usr/bin/env node
// @ts-check
// node cli.mjs --scenario salary [--seed 7] [--people 3] [--cast cast.json] [--runs 500] [--format text|json]
// node cli.mjs --list
// cast.json: [{ "name": "Ava Juniper", "role": "founder", "description": "blunt, organised, calm" }, ...]
// Every character must be invented; profile links, handles and contact details are refused.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { makeCast, makePersona, profile, traitsFromText, checkFictional } from "./persona.mjs";
import { SCENARIOS, scenarioById, simulate, runMany, transcriptText } from "./sim.mjs";
import { group } from "./dynamics.mjs";

const USAGE = "usage: cli.mjs --scenario <id> [--seed S] [--people N] [--cast cast.json] [--runs N] [--format text|json] | --list";

/**
 * @param {string[]} argv
 * @param {{ log: (s: string) => void, err: (s: string) => void, read: (f: string) => Promise<string> }} [io]
 */
export async function main(argv, io = { log: console.log, err: console.error, read: (f) => readFile(f, "utf8") }) {
  const opt = (/** @type {string} */ name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] ?? null : null);
  if (argv.includes("--list")) {
    for (const s of SCENARIOS) io.log(`${s.id.padEnd(16)} ${s.title} (${s.kind === "negotiate" ? "2 characters" : `${s.min}-${s.max} characters`})`);
    return 0;
  }
  const sc = scenarioById(opt("--scenario") || "");
  if (!sc) { io.err(USAGE + "\nScenarios: " + SCENARIOS.map((s) => s.id).join(", ")); return 2; }
  const seed = opt("--seed") || "1";
  let cast;
  const castFile = opt("--cast");
  if (castFile) {
    let raw;
    try { raw = JSON.parse(await io.read(castFile)); } catch (e) { io.err(`could not read ${castFile}: ${/** @type {Error} */ (e).message}`); return 2; }
    if (!Array.isArray(raw)) { io.err("the cast file must be a JSON array of characters"); return 2; }
    cast = [];
    for (const [i, c] of raw.entries()) {
      const text = [c.name, c.role, c.description].filter(Boolean).join(" ");
      const ok = checkFictional(text);
      if (ok.ok === false) { io.err(`character ${i + 1}: ${ok.why}`); return 2; }
      const traits = c.traits || (c.description ? traitsFromText(c.description).traits : undefined);
      cast.push(makePersona({ seed: `${seed}-${i}`, name: c.name, role: c.role, traits, note: c.description }));
    }
  } else {
    const n = Number(opt("--people")) || (sc.kind === "negotiate" ? 2 : 4);
    cast = makeCast(seed, n);
  }
  const fmt = opt("--format") || "text";
  const runs = Number(opt("--runs")) || 0;
  try {
    if (sc.kind === "negotiate") cast = cast.slice(0, 2);
    const one = simulate(sc, cast, { seed });
    const many = runs ? runMany(sc, cast, { runs, seed }) : null;
    if (fmt === "json") { io.log(JSON.stringify({ scenario: sc.id, seed, cast, dynamics: group(cast), run: one, many }, null, 2)); return 0; }
    if (fmt !== "text") { io.err(`unknown format ${fmt}`); return 2; }
    io.log(`# ${sc.title} (seed ${seed})\n`);
    for (const p of cast) {
      const pr = profile(p);
      io.log(`${p.name}, ${p.role}, ${p.age}: O${p.traits.openness} C${p.traits.conscientiousness} E${p.traits.extraversion} A${p.traits.agreeableness} N${p.traits.neuroticism}; ${pr.conflict.style}`);
    }
    const g = group(cast);
    if (g.notes.length) io.log("\n" + g.notes.map((x) => `- ${x}`).join("\n"));
    io.log("\n" + transcriptText(one, cast));
    if (many) {
      io.log(`\nAcross ${many.runs} runs (mean ${many.meanTurns.toFixed(1)} turns):`);
      for (const o of many.outcomes) io.log(`  ${(o.share * 100).toFixed(0).padStart(3)}%  ${o.outcome}`);
      if (many.price) io.log(`  deal price: p10 ${many.price.p10}, median ${many.price.median}, p90 ${many.price.p90}`);
      for (const p of many.perPerson) io.log(`  ${p.name}: ${Math.round(p.airtime * 100)}% of turns, satisfaction ${p.satisfaction.toFixed(2)}`);
    }
    io.log("\nFictional characters; a rules-based rehearsal aid, not a prediction of real behaviour.");
    return 0;
  } catch (e) {
    io.err(/** @type {Error} */ (e).message);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exitCode = await main(process.argv.slice(2));
