import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { plan, upload } from "./import.mjs";
import { handler } from "./server.mjs";
import * as E from "./engine.mjs";

const EV = "account,date,type\nacme,2026-09-01,login\nacme,2026-09-02,export\nacme,2026-09-02,export\nglobex,2026-09-01,login\nbad line\n";
const CH = "globex,2026-09-20\n";

test("plan keeps identical rows distinct, flags bad lines, and is deterministic", () => {
  const a = plan(EV, CH), b = plan(EV, CH);
  assert.equal(a.events.length, 4);
  assert.equal(new Set(a.events.map((e) => e.id)).size, 4);
  assert.deepEqual(a.events.map((e) => e.id), b.events.map((e) => e.id));
  assert.deepEqual(a.outcomes.map((o) => o.account), ["globex"]);
  assert.equal(a.errors.length, 1);
});

test("upload into a real server loads history, and a re-run only reports duplicates", async () => {
  const NOW = Date.UTC(2026, 9, 15), state = E.newState();
  const srv = http.createServer(handler({ state, save() {}, apiKey: "k".repeat(16), adminKey: "a".repeat(16), now: () => NOW }));
  await new Promise((r) => srv.listen(0, r));
  const url = `http://127.0.0.1:${srv.address().port}`, p = plan(EV, CH);
  const t1 = await upload({ url, key: "k".repeat(16), ...p });
  assert.deepEqual([t1.accepted, t1.outcomes], [4, 1]);
  assert.equal(state.accounts.acme.events.length, 3);
  assert.ok(state.accounts.globex.churnedAt);
  const t2 = await upload({ url, key: "k".repeat(16), ...p });
  assert.equal(t2.duplicate, 4);
  assert.equal(state.accounts.acme.events.length, 3);
  srv.close();
});

test("a wrong key fails loudly", async () => {
  const srv = http.createServer(handler({ state: E.newState(), save() {}, apiKey: "k".repeat(16), adminKey: "a".repeat(16) }));
  await new Promise((r) => srv.listen(0, r));
  await assert.rejects(upload({ url: `http://127.0.0.1:${srv.address().port}`, key: "wrong", events: plan(EV, "").events, outcomes: [] }), /401/);
  srv.close();
});
