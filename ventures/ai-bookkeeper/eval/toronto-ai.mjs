// The AI layer, in its default fill mode, on REAL card lines: the City of Toronto's
// PCard report (eval/toronto-pcard.mjs has the data, the G/L map and the licence).
//
// The four deterministic layers replay the year a day at a time from empty books,
// as in toronto-pcard.mjs. A line goes to the fill queue when they had no account
// for it or only the new-payee guess (the lines aiSuggest's fill mode sends). A
// fixed, evenly spaced sample of that queue is sent to a model in batches through
// the page's own aiSuggest, with the 40 lines filed just before the batch as the
// examples, so nothing filed later leaks in. The same sample is sent twice: with
// the card network's merchant category on each line (what ai.mjs sends since
// 2026-11-11) and without it (what it sent before).
//
//   curl -o pcard-expenses.csv https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/ebc3f9c2-2f80-4405-bf4f-5fb309581485/resource/24b9c441-e6e6-4f81-aea0-315f613c1e6e/download/pcard-expenses.csv
//   (cut the rows you want, e.g. July 2025 to June 2026, into one CSV with the same header)
//   LLM_PROVIDER=llamacpp node eval/toronto-ai.mjs --file y2526.csv [--division "TORONTO WATER"]
//        [--sample 160] [--batch 20] [--from 2025-08] [--no-mcc] [--out answers.json]
//
// --stub 0.8 swaps in a scripted model (right on 80% of lines) to test the harness;
// its numbers say nothing about any model. Requests go out at temperature 0.
import { readFileSync, writeFileSync } from "node:fs";
import { parseCsv } from "../bank.mjs";
import { loadToronto } from "./toronto-pcard.mjs";
import { suggest, trainClassifier, buildMemory, buildMccMemory, trainNewPayee, historyRecord } from "../categorize.mjs";
import { newBooks } from "../engine.mjs";
import { aiSuggest, sameAccountName } from "../ai.mjs";
import { configFromEnv } from "../byok.mjs";

// Replay the deterministic layers; return the fill queue and the filed history.
export function fillQueue(rows, { from = "" } = {}) {
  const hist = [], filed = [], queue = [];
  let model = { rules: [], codes: null, memory: buildMemory([]), classifier: { n: 0 } };
  let day = null, pending = [], pendingFiled = [];
  for (const r of rows) {
    if (r.date !== day) {
      if (pending.length) {
        hist.push(...pending); filed.push(...pendingFiled); pending = []; pendingFiled = [];
        model = { rules: [], codes: null, memory: buildMemory(hist), classifier: trainClassifier(hist), newPayee: trainNewPayee(hist), mccMemory: buildMccMemory(hist) };
      }
      day = r.date;
    }
    const txn = { desc: r.desc, cents: r.cents, ...(r.mcc ? { mcc: r.mcc } : {}) };
    const s = suggest(txn, model);
    if (r.date.slice(0, 7) >= from && (!s.account || s.source === "new-payee")) queue.push({ ...r, det: s.account ?? null, detSource: s.source ?? "none", filedBefore: filed.length });
    pending.push(historyRecord(txn, r.want[0]));
    pendingFiled.push({ desc: r.desc, cents: r.cents, mcc: r.mcc, account: r.want[0] });
  }
  return { queue, filed };
}

// Every k-th line, so the sample spreads over the year and is the same on every run.
export const evenSample = (xs, n) => (xs.length <= n ? xs.slice() : Array.from({ length: n }, (_, i) => xs[Math.floor((i * xs.length) / n)]));

// Books for one batch: the examples as confirmed card lines, the batch in review.
export function batchBooks(batch, filed, { mcc = true, examples = 40, name } = {}) {
  const books = newBooks({ name });
  const first = Math.min(...batch.map((q) => q.filedBefore));
  const strip = (m) => (mcc && m ? { mcc: m } : {});
  filed.slice(Math.max(0, first - examples), first).forEach((f, i) => books.transactions.push({ id: `e${i}`, account: "2000", date: "2000-01-01", desc: f.desc, cents: f.cents, ...strip(f.mcc), status: "confirmed", posted: f.account }));
  batch.forEach((q, i) => books.transactions.push({ id: `q${i}`, account: "2000", date: q.date, desc: q.desc, cents: q.cents, ...strip(q.mcc), status: "review", ...(q.det ? { suggestion: { account: q.det, confidence: 0.3, source: "new-payee" } } : {}) }));
  return books;
}

// Temperature 0 so a rerun gives the same answers (local servers default higher).
const coldFetch = (f = fetch) => (url, init) => {
  const body = JSON.parse(init.body);
  return f(url, { ...init, body: JSON.stringify({ ...body, temperature: 0, seed: 1 }) });
};

function stubFetch(batch, accuracy, codes) {
  let k = 0;
  return async () => {
    const lines = batch.map((q, i) => ({ id: `q${i}`, account: (k++ % 10) < accuracy * 10 ? q.want[0] : codes.find((c) => !q.want.includes(c)), confidence: 0.7, reason: "scripted" }));
    return { ok: true, status: 200, json: async () => ({ model: "stub", content: [{ type: "text", text: JSON.stringify({ lines }) }] }), text: async () => "" };
  };
}

export async function runAi(sample, filed, { config, batch = 20, mcc = true, stub = null, name, log = () => {} } = {}) {
  const out = [];
  for (let off = 0; off < sample.length; off += batch) {
    const these = sample.slice(off, off + batch);
    const books = batchBooks(these, filed, { mcc, name });
    const t0 = Date.now();
    const f = stub !== null ? stubFetch(these, stub, books.accounts.map((a) => a.code)) : coldFetch();
    // The name check is applied in score(), from the raw answers, so one run scores both ways.
    const r = await aiSuggest(config, books, { max: batch, mode: "fill", fetch: f, maxTokens: 2500, nameCheck: false });
    const names = new Map(books.accounts.map((a) => [a.code, a.name]));
    these.forEach((q, i) => {
      const s = r.books.transactions.find((x) => x.id === `q${i}`).suggestion;
      const raw = (r.raw ?? []).find((a) => a?.id === `q${i}`);
      const ai = s?.source === "ai" ? s.account : null;
      out.push({ date: q.date, desc: q.desc, mcc: q.mcc, want: q.want, det: q.det, detSource: q.detSource, ai, name: raw?.name ?? null, nameAgrees: ai && raw?.name ? sameAccountName(raw.name, names.get(ai)) : null, reason: s?.source === "ai" ? s.reason : r.error ?? null });
    });
    log(`batch ${off / batch + 1}: ${r.source}${r.error ? ` (${r.error})` : ""}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  return out;
}

// nameCheck: drop an answer whose name disagrees with its code, as aiSuggest does by default.
export function score(results, { nameCheck = false } = {}) {
  const t = { n: results.length, aiRight: 0, aiWrong: 0, aiAbstain: 0, detRight: 0, detWrong: 0, detNone: 0, rescued: 0, broke: 0, combinedRight: 0, combinedWrong: 0 };
  for (const x of results) {
    // The uncategorized account is the model saying it cannot tell.
    const ai = x.ai && x.ai !== "9999" && !(nameCheck && x.nameAgrees === false) ? x.ai : null;
    if (!ai) t.aiAbstain++; else if (x.want.includes(ai)) t.aiRight++; else t.aiWrong++;
    if (!x.det) t.detNone++; else if (x.want.includes(x.det)) t.detRight++; else t.detWrong++;
    const detOk = !!x.det && x.want.includes(x.det), aiOk = !!ai && x.want.includes(ai);
    if (ai && aiOk && !detOk) t.rescued++;
    if (ai && !aiOk && detOk) t.broke++;
    const c = ai ?? x.det;
    if (c && x.want.includes(c)) t.combinedRight++; else if (c) t.combinedWrong++;
  }
  return t;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
  const rows = loadToronto(readFileSync(arg("--file"), "utf8"), { division: arg("--division") });
  const { queue, filed } = fillQueue(rows, { from: arg("--from", "") });
  const sample = evenSample(queue, +arg("--sample", 160));
  const mcc = !process.argv.includes("--no-mcc");
  const stub = arg("--stub") === null ? null : +arg("--stub");
  const config = stub !== null ? { provider: "anthropic", apiKey: "stub" } : configFromEnv(process.env);
  if (!config) { console.error("No model configured: set LLM_PROVIDER (llamacpp, ollama, ...) or a key, or pass --stub 0.8."); process.exit(2); }
  const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "-");
  console.log(`${rows.length} mapped lines ${rows[0]?.date} to ${rows.at(-1)?.date}${arg("--division") ? ` (${arg("--division")})` : ""}; fill queue ${queue.length} (${pct(queue.length, rows.length)}), ${queue.filter((q) => q.det).length} with a new-payee guess; sending ${sample.length}, merchant category ${mcc ? "on" : "off"}; ${stub !== null ? `STUB at ${stub}` : `model ${config.model ?? config.provider}`}`);
  const results = await runAi(sample, filed, { config, batch: +arg("--batch", 20), mcc, stub, name: "City of Toronto divisions' purchasing cards (municipal government)", log: (s) => console.error(s) });
  if (arg("--out")) writeFileSync(arg("--out"), JSON.stringify(results, null, 1));
  const fallback = results.filter((x) => x.reason && !x.reason.startsWith("AI (") && !x.ai).length;
  if (fallback) console.log(`  (${fallback} lines got no answer because their call failed; counted as abstained)`);
  console.log(`  rules alone (new-payee guess or nothing): right ${pct(score(results).detRight, results.length)}, wrong ${pct(score(results).detWrong, results.length)}, none ${pct(score(results).detNone, results.length)}`);
  for (const nameCheck of [false, true]) {
    const t = score(results, { nameCheck });
    console.log(` name check ${nameCheck ? "on " : "off"}: model right ${pct(t.aiRight, t.n)}, wrong ${pct(t.aiWrong, t.n)}, abstained ${pct(t.aiAbstain, t.n)} (right of answered ${pct(t.aiRight, t.aiRight + t.aiWrong)}); model first, else the guess: right ${pct(t.combinedRight, t.n)}, wrong ${pct(t.combinedWrong, t.n)}; rescued ${t.rescued}, broke ${t.broke}`);
  }
}
