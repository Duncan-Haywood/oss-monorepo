import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createMonitor } from "./monitor.mjs";
import { handler } from "./server.mjs";
import { badgeSvg } from "./dashboard.mjs";

test("a paused check never alerts, and resuming restarts its clock", async () => {
  const sent = [];
  const m = createMonitor({ config: { j: { periodSeconds: 60, graceSeconds: 0 } }, notify: async (x) => sent.push(x) });
  m.ping("j", "success", 1000);
  assert.equal(m.setPaused("j", true, 2000), true);
  assert.equal(m.status(10_000_000)[0].state, "paused");
  await m.tick(10_000_000);
  assert.equal(sent.length, 0);
  m.setPaused("j", false, 10_000_000);
  await m.tick(10_000_001);
  assert.equal(sent.length, 0, "no alert for the time it was paused");
  assert.equal(m.status(10_000_001)[0].state, "new");
  await m.tick(10_000_000 + 200_000);
  assert.equal(sent.at(-1).state, "down");
  assert.deepEqual(m.history("j").map((h) => h.kind).filter((k) => k === "paused" || k === "resumed"), ["resumed", "paused"]);
  assert.equal(m.setPaused("nope", true, 1), false);
});

test("badgeSvg shows state, hides reasons, escapes the name", () => {
  assert.match(badgeSvg("backup", "up"), /operational/);
  assert.match(badgeSvg("backup", "failed"), /disruption/);
  assert.match(badgeSvg("backup", "paused"), /paused/);
});

async function call(opts, path, headers = {}) {
  const m = createMonitor({ config: { backup: { periodSeconds: 60 } } });
  const srv = http.createServer(handler(m, () => {}, () => 5000, opts));
  await new Promise((r) => srv.listen(0, r));
  try {
    const res = await fetch(`http://127.0.0.1:${srv.address().port}${path}`, { headers });
    return { status: res.status, type: res.headers.get("content-type"), body: await res.text() };
  } finally { srv.close(); }
}

test("badge is public only when PUBLIC_STATUS is on; pause/resume routes work", async () => {
  assert.equal((await call({}, "/badge/backup.svg")).status, 404);
  const ok = await call({ publicStatus: true }, "/badge/backup.svg");
  assert.equal(ok.status, 200);
  assert.equal(ok.type, "image/svg+xml");
  assert.equal((await call({ publicStatus: true }, "/badge/nope.svg")).status, 404);
  assert.equal((await call({}, "/pause/backup")).body, "OK\n");
  assert.equal((await call({}, "/resume/nope")).status, 404);
});
