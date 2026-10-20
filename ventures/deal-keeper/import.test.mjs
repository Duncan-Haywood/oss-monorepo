import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { plan, upload } from "./import.mjs";
import { handler } from "./server.mjs";
import * as E from "./engine.mjs";

const CSV = [
  "id,name,stage,amount,status,created,closed,stage_history",
  "w1,Won deal,negotiation,9000,won,2026-05-01,2026-06-20,lead@2026-05-01;qualified@2026-05-10;negotiation@2026-06-01",
  "l1,Lost deal,qualified,3000,lost,2026-05-03,2026-06-01,",
  "o1,Open deal,proposal,5000,open,2026-09-20,,",
].join("\n");

test("the plan keeps exact stage history and marks the rest as approximate", () => {
  const { deals, errors } = plan(CSV);
  assert.deepEqual(errors, []);
  assert.equal(deals.find((d) => d.id === "w1").history.length, 3);
  assert.equal(deals.find((d) => d.id === "l1").exact, false);
});

test("uploading to a real server round-trips and is safe to repeat", async () => {
  const NOW = Date.UTC(2026, 9, 15), state = E.newState();
  const srv = http.createServer(handler({ state, save() {}, apiKey: "api-key-1234567890", adminKey: "admin-key-1234567890", now: () => NOW }));
  await new Promise((r) => srv.listen(0, r));
  const url = `http://127.0.0.1:${srv.address().port}`, { deals } = plan(CSV);
  const first = await upload({ url, key: "api-key-1234567890", deals });
  assert.equal(first.ok, 3);
  assert.equal(await upload({ url, key: "api-key-1234567890", deals }).then((t) => t.ok), 3);
  assert.deepEqual(state.deals.w1.history.map((h) => h[0]), [0, 1, 3]);
  assert.equal(state.deals.w1.exact, true); assert.equal(state.deals.l1.exact, false);
  assert.equal(state.deals.w1.status, "won");
  await assert.rejects(upload({ url, key: "wrong-key-wrong-key", deals }), /401/);
  srv.close();
});
