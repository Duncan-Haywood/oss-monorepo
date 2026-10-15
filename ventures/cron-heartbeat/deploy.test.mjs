import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import http from "node:http";
import fs from "node:fs";
import { createMonitor } from "./monitor.mjs";
import { handler } from "./server.mjs";

test("healthz answers without the ping key so a host health check can reach it", async () => {
  const srv = http.createServer(handler(createMonitor({ config: {} }), () => {}));
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  assert.equal((await fetch(base + "/healthz")).status, 200);
  srv.close();
});

test("healthz is open even when PING_KEY is set", async () => {
  const { spawn } = await import("node:child_process");
  const p = spawn(process.execPath, [fileURLToPath(new URL("./server.mjs", import.meta.url))], { env: { ...process.env, PORT: "18787", PING_KEY: "k", CHECKS_JSON: '{"a":{"periodSeconds":60}}', STATE: "/tmp/ch-test-state.json" }, stdio: "pipe" });
  await new Promise((r) => p.stdout.once("data", r));
  const h = await fetch("http://127.0.0.1:18787/healthz");
  const s = await fetch("http://127.0.0.1:18787/status");
  const ok = await fetch("http://127.0.0.1:18787/status?key=k");
  assert.equal(h.status, 200);
  assert.equal(s.status, 401);
  assert.equal((await ok.json())[0].slug ?? "a", "a");
  p.kill();
});

test("render.yaml points at files that exist and the Dockerfile ships what server.mjs imports", () => {
  const y = fs.readFileSync(new URL("./render.yaml", import.meta.url), "utf8");
  assert.match(y, /healthCheckPath: \/healthz/);
  assert.match(y, /dockerfilePath: ventures\/cron-heartbeat\/Dockerfile/);
  assert.match(y, /generateValue: true/);
  const d = fs.readFileSync(new URL("./Dockerfile", import.meta.url), "utf8");
  for (const f of ["cron.mjs", "monitor.mjs", "server.mjs"]) assert.ok(d.includes(f), f);
});
