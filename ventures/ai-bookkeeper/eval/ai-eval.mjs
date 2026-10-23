// The AI layer on the SYNTHETIC year's review queue (eval/synth.mjs), same
// protocol as benchmark.mjs: each month is imported with every earlier month
// confirmed. The lines left in review (not posted alone, not paired transfers)
// go to the model in batches of 40 through the same aiSuggest the page uses.
// For those lines it reports how often the deterministic top suggestion was
// right, how often the model's was, and the net: lines the model rescued
// (deterministic wrong or absent, model right) against lines it broke
// (deterministic right, model wrong).
//
//   node ventures/ai-bookkeeper/eval/ai-eval.mjs [--seeds 2] [--from 4] [--json]
//     real model: set LLM_PROVIDER/LLM_BASE_URL/LLM_MODEL (e.g. ollama or
//     llamacpp on this machine) or a provider key, as for the page
//     --mode replace   the model overwrites the rules' suggestion (default: fill, only lines with none)
//     --stub 0.8   no model: a scripted reply that is right on 80% of lines and
//     a random wrong account on the rest. It tests this harness and the
//     guard rails, and says NOTHING about any real model.
import { generateYear, toCsv, rng } from "./synth.mjs";
import { newBooks, importStatement, confirm } from "../engine.mjs";
import { aiSuggest } from "../ai.mjs";
import { configFromEnv } from "../byok.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
const where = { checking: "1000", card: "2000" };

// A fetch that answers like the Anthropic API with a scripted model.
function stubFetch(truth, accuracy, seed) {
  const r = rng(seed * 7919 + 13);
  return async (_url, init) => {
    const body = JSON.parse(init.body);
    const content = body.messages[0].content;
    const prompt = typeof content === "string" ? content : content.map((c) => c.text).join("");
    const codes = [...prompt.matchAll(/^(\d{4}) .*\((?:asset|liability|equity|income|expense)\)$/gm)].map((m) => m[1]);
    const ids = [...prompt.split("Lines to file:")[1].matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]);
    const lines = ids.map((id) => {
      const right = truth.get(id);
      const wrong = codes.filter((c) => c !== right);
      return { id, account: r() < accuracy ? right : wrong[Math.floor(r() * wrong.length)], confidence: 0.7, reason: "scripted" };
    });
    return { ok: true, status: 200, json: async () => ({ model: "stub", content: [{ type: "text", text: JSON.stringify({ lines }) }] }), text: async () => "" };
  };
}

export async function runSeed(seed, { config, stub = null, from = 4, batch = 40, mode = "fill" } = {}) {
  const lines = generateYear({ seed });
  let books = newBooks();
  const t = { review: 0, detRight: 0, detNone: 0, aiAnswered: 0, aiRight: 0, rescued: 0, broken: 0, combinedRight: 0, calls: 0, failedCalls: 0 };
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    const these = lines.filter((l) => l.date.slice(5, 7) === mm);
    for (const w of ["checking", "card"]) books = importStatement(books, toCsv(these, w), where[w], { autoPost: 0.85, invert: w === "card" }).books;
    const key = (x) => `${x.account}|${x.date}|${x.cents}|${x.desc}`;
    const pool = new Map();
    for (const l of these) { const k = `${where[l.account]}|${l.date}|${l.cents}|${l.desc.trim().replace(/\s+/g, " ")}`; pool.set(k, [...(pool.get(k) ?? []), l.truth]); }
    const truth = new Map();
    for (const x of books.transactions) if (x.date.slice(5, 7) === mm && x.status !== "confirmed") truth.set(x.id, pool.get(key(x)).shift());
    const queue = books.transactions.filter((x) => x.status === "review" && x.date.slice(5, 7) === mm);
    const det = new Map(queue.map((x) => [x.id, x.suggestion?.account ?? null]));
    let withAi = books;
    if (m >= from && queue.length) {
      const sent = mode === "replace" ? queue.length : queue.filter((x) => !det.get(x.id)).length;
      for (let off = 0; off < sent; off += batch) {
        // Earlier months are confirmed, so the review queue is this month's.
        t.calls++;
        const r = await aiSuggest(config, withAi, { max: batch, offset: off, mode, fetch: stub ? stubFetch(truth, stub, seed) : undefined });
        if (r.source === "model") withAi = r.books; else t.failedCalls++;
      }
      for (const x of queue) {
        const tr = truth.get(x.id), d = det.get(x.id);
        const s = withAi.transactions.find((y) => y.id === x.id).suggestion;
        const ai = s?.source === "ai" ? s.account : null;
        t.review++;
        if (d === tr) t.detRight++;
        if (!d) t.detNone++;
        if (ai) { t.aiAnswered++; if (ai === tr) t.aiRight++; }
        if (ai && ai === tr && d !== tr) t.rescued++;
        if (ai && ai !== tr && d === tr) t.broken++;
        if ((ai ?? d) === tr) t.combinedRight++;
      }
    }
    const choices = {};
    for (const [id, tr] of truth) choices[id] = tr;
    books = confirm(books, choices);
  }
  return t;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const SEEDS = +arg("--seeds", 2), FROM = +arg("--from", 4);
  const mode = arg("--mode", "fill");
  const stub = arg("--stub", null) === null ? null : +arg("--stub", 0.8);
  const config = stub !== null ? { provider: "anthropic", apiKey: "stub" } : configFromEnv(process.env);
  if (!config) { console.error("No model configured. Set LLM_PROVIDER (+ LLM_BASE_URL/LLM_MODEL) or a provider key, or pass --stub 0.8 to test the harness."); process.exit(2); }
  const sum = {};
  for (let s = 1; s <= SEEDS; s++) for (const [k, v] of Object.entries(await runSeed(s, { config, stub, from: FROM, mode }))) sum[k] = (sum[k] ?? 0) + v;
  if (process.argv.includes("--json")) { console.log(JSON.stringify({ seeds: SEEDS, stub, ...sum }, null, 2)); process.exit(0); }
  const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "-");
  console.log(`${stub !== null ? `STUB at ${stub} (tests the harness, not a model)` : `model ${config.model ?? config.provider}`}; mode ${mode}; ${SEEDS} seeds, months ${FROM}-12, ${sum.review} lines left in review, ${sum.calls} calls (${sum.failedCalls} fell back).`);
  console.log(`deterministic top suggestion right: ${pct(sum.detRight, sum.review)} (${pct(sum.detNone, sum.review)} had none)`);
  console.log(`model answered ${pct(sum.aiAnswered, sum.review)}, right on ${pct(sum.aiRight, sum.review)} of all lines`);
  console.log(`model rescued ${sum.rescued}, broke ${sum.broken}; right with the model's answer first: ${pct(sum.combinedRight, sum.review)}`);
}
