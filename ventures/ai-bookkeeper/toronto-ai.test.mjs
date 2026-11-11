// The City of Toronto portal's PCard CSV (header copied from the real file, rows
// made up) and the fill-mode AI harness on it, with a scripted model: these test
// the loader and the harness, and say nothing about any real model.
import test from "node:test";
import assert from "node:assert/strict";
import { loadToronto, NEW_GL } from "./eval/toronto-pcard.mjs";
import { fillQueue, evenSample, batchBooks, runAi, score, resumable } from "./eval/toronto-ai.mjs";
import { aiPrompt } from "./ai.mjs";

const HEADER = "_id,Division,Batch-Transaction ID,Transaction Date,Card Posting Dt,Merchant Name,Transaction Amt.,Transaction Currency,Original Amount,Original Currency,G/L Account,G/L Account Description,Cost Centre / WBS Element / Order Number,Cost Centre / WBS Element / Order Number Description,Merchant Type,Merchant Type Description,Purpose";
const row = (id, div, date, merchant, amt, gl, gld, code, name) => `${id},${div},1-${id},${date} 00:00:00,${date} 00:00:00,${merchant},${amt},CAD,${amt},CAD,${gl},${gld},None,None,${code},"${name}",`;
const CSV = [
  HEADER,
  row(1, "PARKS", "2025-07-02", "MAPLE HARDWARE", 45.1, "2710", "GENERAL HARDWARE", 5251, "Hardware Stores"),
  row(2, "WATER", "2025-07-03", "NORTHWIND FUELS", 61, "2260", "GASOLINE", 5542, "Fuel Dispenser, Automated"),
  row(3, "PARKS", "2025-12-04", "MAPLE HARDWARE", 12, "5050057", "GENERAL HARDWARE", 5251, "Hardware Stores"),
  row(4, "PARKS", "2025-12-05", "ZQX LOCAL SHOP", 30, "5050100", "MISCELLANEOUS MATERIALS & SUPPLIES", 5999, "Miscellaneous Retail"),
].join("\n");

test("portal CSV: datetime dates, 7-digit accounts through the pairing, unmapped catch-alls dropped, division filter", () => {
  assert.equal(NEW_GL["5050057"], "2710");
  const rows = loadToronto(CSV);
  assert.deepEqual(rows.map((r) => [r.date, r.desc, r.want.join("/"), r.division]), [
    ["2025-07-02", "MAPLE HARDWARE", "6100/6090", "PARKS"],
    ["2025-07-03", "NORTHWIND FUELS", "6160", "WATER"],
    ["2025-12-04", "MAPLE HARDWARE", "6100/6090", "PARKS"],
  ]);
  assert.deepEqual(loadToronto(CSV, { division: "WATER" }).map((r) => r.desc), ["NORTHWIND FUELS"]);
});

const synthetic = () => {
  const rows = [];
  for (let d = 1; d <= 20; d++) rows.push({ desc: `SHOP ${d} TORONTO`, date: `2025-08-${String(d).padStart(2, "0")}`, cents: -1000 * d, mcc: "", want: ["6100"] });
  return rows;
};

test("fill queue: only lines the rules had no account for or a new-payee guess; examples come from before the batch", () => {
  const { queue, filed } = fillQueue(synthetic());
  assert.ok(queue.length > 0);
  for (const q of queue) assert.ok(q.det === null || q.detSource === "new-payee");
  const b = batchBooks(queue.slice(-2), filed, { examples: 5 });
  const first = Math.min(...queue.slice(-2).map((q) => q.filedBefore));
  const ex = b.transactions.filter((t) => t.status === "confirmed").map((t) => t.desc);
  assert.deepEqual(ex, filed.slice(first - 5, first).map((f) => f.desc));
  assert.equal(evenSample([1, 2, 3, 4, 5, 6], 3).join(), "1,3,5");
});

test("merchant category on and off: the prompt carries it only when on", () => {
  const q = [{ desc: "ZQX", date: "2025-09-01", cents: -500, mcc: "5251 Hardware Stores", want: ["6100"], det: null, filedBefore: 0 }];
  assert.match(aiPrompt(batchBooks(q, [], { mcc: true }), batchBooks(q, [], { mcc: true }).transactions), /merchant_category/);
  assert.doesNotMatch(aiPrompt(batchBooks(q, [], { mcc: false }), batchBooks(q, [], { mcc: false }).transactions), /merchant_category/);
});

test("harness with a scripted model: answers land on the right lines and score adds up", async () => {
  const { queue, filed } = fillQueue(synthetic());
  const res = await runAi(queue, filed, { config: { provider: "anthropic", apiKey: "stub" }, stub: 1, batch: 4 });
  const t = score(res);
  assert.equal(t.n, queue.length);
  assert.equal(t.aiRight, queue.length);
  assert.equal(t.combinedRight, queue.length);
  assert.equal(t.aiRight + t.aiWrong + t.aiAbstain, t.n);
});

test("resume: answered batches are kept and not sent again; a failed call and a changed sample are sent again", async () => {
  const queue = Array.from({ length: 7 }, (_, i) => ({ desc: `ZQX ${i}`, date: `2025-09-0${i + 1}`, cents: -100 * (i + 1), mcc: "", want: ["6100"], det: null, detSource: "none", filedBefore: 0 }));
  const filed = [];
  const config = { provider: "anthropic", apiKey: "stub" };
  const checkpoints = [];
  const first = await runAi(queue, filed, { config, stub: 1, batch: 2, onBatch: (o) => checkpoints.push(o.length) });
  assert.deepEqual(checkpoints, Array.from({ length: Math.ceil(queue.length / 2) }, (_, i) => Math.min(queue.length, 2 * (i + 1))));
  // A run killed after 3 lines: only the first whole batch (2) is kept, the rest resent.
  const sent = [];
  const logs = [];
  const again = await runAi(queue, filed, { config, stub: 0, batch: 2, done: first.slice(0, 3), log: (s) => logs.push(s), onBatch: (o) => sent.push(o.length) });
  assert.match(logs[0], /resuming: 2 lines \(1 batches\)/);
  assert.equal(again.length, queue.length);
  assert.deepEqual(again.slice(0, 2), first.slice(0, 2));
  assert.equal(score(again.slice(0, 2)).aiRight, 2);
  assert.equal(score(again.slice(2)).aiRight, 0);
  assert.equal(sent[0], 4);
  // A failed call is not an answer, and results for other lines do not count.
  const failed = first.map((x, i) => (i === 1 ? { ...x, ai: null, reason: "could not reach llamacpp: fetch failed" } : x));
  assert.equal(resumable(failed, queue).length, 1);
  assert.equal(resumable(first, queue.slice(1)).length, 0);
  assert.equal(resumable(first, queue).length, queue.length);
});
