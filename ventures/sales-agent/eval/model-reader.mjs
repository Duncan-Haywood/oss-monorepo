#!/usr/bin/env node
// A reader from another model family: label the Enron stops from eval/enron-labels/READER.md with a local model, then
// measure how far it agrees with the agent readers. eval/README.md, "A third reader from another model family".
//
// Label (the model sees READER.md and one reply at a time, nothing about the rules or the other readers):
//   node eval/enron.mjs <dir of links to blobs/7?> --replies --json > 7.json      # the stops, with text (not committed)
//   LLM_BASE_URL=http://localhost:8080/v1 LLM_MODEL=llama \
//     node eval/model-reader.mjs label 7.json --ids eval/enron-labels/eighth.json --out eval/enron-labels/eighth-llama.json
// --ids keeps only (and orders by) the Message-IDs in an existing label file, so every reader labels the same stops.
// --out is rewritten after every reply, and a rerun keeps the rows it already holds, so a killed run resumes.
// The output holds Message-IDs and labels only, never corpus text.
//
// Every Message-ID in a label file, with its text as the server reads it, whatever today's rules fire on it (earlier
// rounds' stops that no longer fire are still labelled; not committed):
//   node eval/model-reader.mjs texts <dir of links to blobs/7?> --ids eval/enron-labels/eighth.json > 7-texts.json
//
// Compare two or more label files on the Message-IDs they share:
//   node eval/model-reader.mjs compare eval/enron-labels/eighth.json eval/enron-labels/eighth-llama.json
import fs from "node:fs";
import path from "node:path";
import { walk, read, readAsServer } from "./enron.mjs";

export const LABELS = ["unsubscribe", "not_interested", "out_of_office", "left_company", "bounce", "none", "ambiguous"];
const STOPS = new Set(LABELS.slice(0, 5));

/** READER.md with its "Output" section (a JSON file per batch) swapped for a one-word answer per reply. */
export function readerBrief(md) {
  const body = md.replace(/\n## Output[\s\S]*$/, "").replace(/^# .*\n/, "").trim();
  return `${body}\n\n## Your answer\n\nYou will be shown one reply. Answer with exactly one label from this list and nothing else: ${LABELS.join(", ")}.`;
}

/** The label in a model's answer: the first known label it names (underscores or spaces), else null. */
export function parseLabel(text) {
  const t = String(text || "").toLowerCase().replace(/[`*"'.]/g, " ").replace(/[\s-]+/g, "_");
  let best = null, at = Infinity;
  for (const l of LABELS) { const i = t.indexOf(l); if (i >= 0 && i < at) { best = l; at = i; } }
  return best;
}

export const userPrompt = (body, max = 4000) => `Reply:\n"""\n${String(body).slice(0, max)}\n"""\n\nLabel:`;

/** One call to an OpenAI-compatible server (llama.cpp, Ollama, vLLM, LM Studio), temperature 0. */
export async function ask({ baseUrl, model, apiKey, system, prompt, fetchImpl = globalThis.fetch }) {
  const headers = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const res = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST", headers,
    body: JSON.stringify({ model, temperature: 0, max_tokens: 12, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? "";
}

/** Cohen's kappa for two raters over the same items (arrays of labels). */
export function kappa(a, b) {
  const n = a.length; if (!n) return null;
  const cats = [...new Set([...a, ...b])];
  const po = a.filter((x, i) => x === b[i]).length / n;
  const pe = cats.reduce((s, c) => s + (a.filter((x) => x === c).length / n) * (b.filter((x) => x === c).length / n), 0);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

/** Agreement between label files on their shared ids: exact, stop-vs-not, kappa, and the commonest disagreements. */
export function compare(files) {
  const maps = files.map((f) => new Map(f.rows.map((r) => [r.id, r.reader ?? r.label])));
  const ids = [...maps[0].keys()].filter((id) => maps.every((m) => m.has(id)));
  const out = { n: ids.length, pairs: [] };
  for (let i = 0; i < maps.length; i++) for (let j = i + 1; j < maps.length; j++) {
    const a = ids.map((id) => maps[i].get(id)), b = ids.map((id) => maps[j].get(id));
    const pairs = {};
    a.forEach((x, k) => { if (x !== b[k]) { const key = `${x} / ${b[k]}`; pairs[key] = (pairs[key] || 0) + 1; } });
    out.pairs.push({
      i, j,
      same: a.filter((x, k) => x === b[k]).length,
      stopSame: a.filter((x, k) => STOPS.has(x) === STOPS.has(b[k])).length,
      kappa: kappa(a, b),
      disagreements: Object.entries(pairs).sort((p, q) => q[1] - p[1]),
    });
  }
  return out;
}

const writeOut = (p, note, rows) => fs.writeFileSync(p, JSON.stringify({ note, rows }, null, 1) + "\n");

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [cmd, ...args] = process.argv.slice(2);
  const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
  if (cmd === "compare") {
    const paths = args.filter((a) => !a.startsWith("--"));
    const r = compare(paths.map((p) => JSON.parse(fs.readFileSync(p, "utf8"))));
    console.log(`${r.n} Message-IDs in every file`);
    for (const p of r.pairs) {
      console.log(`\n${paths[p.i]}  vs  ${paths[p.j]}`);
      console.log(`  same label ${p.same}/${r.n} (${(100 * p.same / r.n).toFixed(0)}%), stop-or-not ${p.stopSame}/${r.n}, kappa ${p.kappa?.toFixed(2)}`);
      for (const [k, v] of p.disagreements.slice(0, 8)) console.log(`    ${String(v).padStart(3)}  ${k}`);
    }
  } else if (cmd === "texts") {
    const dir = args.find((a) => !a.startsWith("--") && a !== opt("--ids"));
    const want = new Set(JSON.parse(fs.readFileSync(opt("--ids"), "utf8")).rows.map((r) => r.id));
    const flagged = [];
    for (const p of walk(dir)) {
      const got = readAsServer(read(p));
      const id = got?.headers.messageId;
      if (id && want.has(id)) { want.delete(id); flagged.push({ id, file: path.basename(p), body: got.reply.body }); }
    }
    if (want.size) console.error(`${want.size} ids not found under ${dir}`);
    console.log(JSON.stringify({ flagged }, null, 1));
  } else if (cmd === "label") {
    const src = args.find((a) => !a.startsWith("--") && ![opt("--ids"), opt("--out"), opt("--reader")].includes(a));
    const outPath = opt("--out");
    const baseUrl = process.env.LLM_BASE_URL || "http://localhost:8080/v1", model = process.env.LLM_MODEL || "local";
    if (!src || !outPath) { console.error("usage: node eval/model-reader.mjs label <enron.mjs --json output> --out <labels.json> [--ids <label file>]"); process.exit(2); }
    const s = JSON.parse(fs.readFileSync(src, "utf8"));
    const byId = new Map([...s.flagged, ...(s.reached || [])].map((x) => [x.id, x]));
    let ids = [...byId.keys()];
    if (opt("--ids")) ids = JSON.parse(fs.readFileSync(opt("--ids"), "utf8")).rows.map((r) => r.id);
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) console.error(`${missing.length} ids have no text in ${src}; skipped`);
    const system = readerBrief(fs.readFileSync(opt("--reader") || new URL("./enron-labels/READER.md", import.meta.url), "utf8"));
    const done = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")).rows : [];
    const have = new Set(done.map((r) => r.id));
    const note = `Labelled by ${model} at temperature 0 through an OpenAI-compatible server, one reply per call, from eval/enron-labels/READER.md (eval/model-reader.mjs). No text.`;
    const t0 = Date.now(); let k = 0;
    for (const id of ids) {
      if (have.has(id) || !byId.has(id)) continue;
      const raw = await ask({ baseUrl, model, apiKey: process.env.LLM_API_KEY, system, prompt: userPrompt(byId.get(id).body) });
      const reader = parseLabel(raw) || "ambiguous";
      done.push({ id, reader, ...(parseLabel(raw) ? {} : { unparsed: true }) });
      writeOut(outPath, note, done);
      k++;
      console.error(`${done.length}/${ids.length} ${reader}  (${((Date.now() - t0) / 1000 / k).toFixed(1)} s each)`);
    }
  } else {
    console.error("usage: node eval/model-reader.mjs label|compare ...");
    process.exit(2);
  }
}
