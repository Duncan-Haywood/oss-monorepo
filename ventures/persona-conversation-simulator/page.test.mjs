import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { makePersona } from "./persona.mjs";
import { pair } from "./dynamics.mjs";
import { scenarioById, runMany } from "./sim.mjs";
import { main } from "./cli.mjs";

const read = (f) => readFile(new URL(f, import.meta.url), "utf8");
const index = await read("./index.html");
const guide = await read("./big-five-personality-conflict-styles.html");

test("the entry page is wired to the shared engine", () => {
  for (const id of ["cast", "add", "scenario", "seed", "run", "many", "transcript", "dl-json", "optout"]) assert.match(index, new RegExp(`id="${id}"`));
  for (const m of ["persona", "sim", "dynamics", "ai", "usage"]) assert.match(index, new RegExp(`from "\\./${m}\\.mjs"`));
});

test("JSON-LD blocks parse", () => {
  for (const html of [index, guide]) {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(blocks.length >= 2);
    for (const b of blocks) assert.doesNotThrow(() => JSON.parse(b[1]));
  }
});

test("disclaimers, fictional-only notice, privacy and opt-out are present", () => {
  for (const html of [index, guide]) {
    assert.match(html, /No warranty/);
    assert.match(html, /sponsors\/Duncan-Haywood/);
  }
  assert.match(index, /Fictional characters only/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /nothing is uploaded/i);
  assert.match(index, /Turn usage counting off/);
});

test("the page itself makes no network calls", () => {
  assert.doesNotMatch(index.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ""), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("the guide's worked example is what the engine produces", () => {
  const rosa = makePersona({ seed: "guide-a", name: "Rosa Juniper", role: "founder", traits: { openness: 70, conscientiousness: 80, extraversion: 75, agreeableness: 20, neuroticism: 30 } });
  const linus = makePersona({ seed: "guide-b", name: "Linus Oakhaven", role: "engineer", traits: { openness: 40, conscientiousness: 30, extraversion: 20, agreeableness: 80, neuroticism: 70 } });
  const p = pair(rosa, linus);
  assert.match(guide, new RegExp(`<strong id="ex-verdict">${p.verdict}</strong>`));
  const notes = [.../<ul id="ex-notes">([\s\S]*?)<\/ul>/.exec(guide)[1].matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1].replace(/&#39;/g, "'"));
  assert.deepEqual(notes, p.notes.map((n) => n.text));
  const rows = [.../<table id="ex-table">([\s\S]*?)<\/table>/.exec(guide)[1].matchAll(/<tr><td>(\w+)<\/td><td>\w+<\/td><td>(\d+)%<\/td><td>\$([\d,]+)<\/td><\/tr>/g)];
  assert.equal(rows.length, 2);
  for (const [, who, share, median] of rows) {
    const cast = who === "Rosa" ? [rosa, linus] : [linus, rosa];
    const m = runMany(scenarioById("salary"), cast, { runs: 500, seed: "guide" });
    assert.equal(Math.round(m.outcomes.find((o) => o.outcome === "deal").share * 100), Number(share));
    assert.equal(m.price.median, Number(median.replace(/,/g, "")));
  }
});

test("CLI lists, simulates and refuses real-person inputs", async () => {
  const out = [], err = [];
  const io = (files = {}) => ({ log: (s) => out.push(s), err: (s) => err.push(s), read: async (f) => files[f] });
  assert.equal(await main(["--list"], io()), 0);
  assert.match(out.join("\n"), /salary/);
  out.length = 0;
  assert.equal(await main(["--scenario", "chores", "--people", "3", "--runs", "50"], io()), 0);
  assert.match(out.join("\n"), /Across 50 runs/);
  assert.equal(await main(["--scenario", "salary", "--cast", "c.json"], io({ "c.json": JSON.stringify([{ name: "Ava", description: "blunt" }, { name: "Bo", description: "linkedin.com/in/bo" }]) })), 2);
  assert.match(err.join("\n"), /invented characters/);
  assert.equal(await main(["--scenario", "nope"], io()), 2);
});
