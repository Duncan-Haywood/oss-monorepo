// The City of Toronto portal's PCard CSV (header copied from the real file, rows
// made up) and the fill-mode AI harness on it, with a scripted model: these test
// the loader and the harness, and say nothing about any real model.
import test from "node:test";
import assert from "node:assert/strict";
import { loadToronto, NEW_GL } from "./eval/toronto-pcard.mjs";
import { fillQueue, evenSample, batchBooks, runAi, score } from "./eval/toronto-ai.mjs";
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
