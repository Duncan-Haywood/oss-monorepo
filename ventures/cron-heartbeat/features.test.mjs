import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import http from "node:http";
import fs from "node:fs";
import { createMonitor } from "./monitor.mjs";
import { handler } from "./server.mjs";
import { createNotifier, channelsFrom } from "./notify.mjs";
import { dashboardHtml, publicStatusHtml } from "./dashboard.mjs";

test("channelsFrom turns on only fully configured channels", () => {
  assert.deepEqual(channelsFrom({}), []);
  assert.deepEqual(channelsFrom({ TELEGRAM_BOT_TOKEN: "t" }), []);
  assert.deepEqual(channelsFrom({ ALERT_WEBHOOK_URL: "u", TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "c", RESEND_API_KEY: "r", ALERT_EMAIL_TO: "a@b.c", ALERT_EMAIL_FROM: "x@b.c" }), ["webhook", "telegram", "email"]);
});

test("notifier builds each channel's request and survives one failing", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: !url.includes("telegram") , status: 500 }; };
  const env = { ALERT_WEBHOOK_URL: "https://hook.test/x", TELEGRAM_BOT_TOKEN: "TOK", TELEGRAM_CHAT_ID: "42", RESEND_API_KEY: "rk", ALERT_EMAIL_TO: "a@b.c, d@e.f", ALERT_EMAIL_FROM: "alerts@b.c" };
  const logs = [];
  await createNotifier(env, fetchImpl, (m) => logs.push(m))({ slug: "backup", state: "down", text: "backup is DOWN" });
  assert.equal(calls.length, 3);
  assert.equal(calls[1].url, "https://api.telegram.org/botTOK/sendMessage");
  assert.equal(JSON.parse(calls[1].init.body).chat_id, "42");
  const mail = JSON.parse(calls[2].init.body);
  assert.deepEqual(mail.to, ["a@b.c", "d@e.f"]);
  assert.equal(calls[2].init.headers.authorization, "Bearer rk");
  assert.ok(logs.some((l) => l.includes("telegram: telegram 500")));
});

test("notifier throws when every channel fails so the monitor retries", async () => {
  const n = createNotifier({ ALERT_WEBHOOK_URL: "https://h.test" }, async () => ({ ok: false, status: 503 }), () => {});
  await assert.rejects(n({ slug: "a", state: "down", text: "t" }), /webhook 503/);
});

test("history records pings and alerts, newest first, capped", async () => {
  const m = createMonitor({ config: { j: { periodSeconds: 60, graceSeconds: 0 } } });
  m.ping("j", "start", 1000); m.ping("j", "success", 2000);
  await m.tick(200000);
  const h = m.history("j");
  assert.deepEqual(h.map((e) => e.kind), ["alert:down", "success", "start"]);
  for (let i = 0; i < 80; i++) m.ping("j", "success", 300000 + i);
  assert.equal(m.history("j").length, 50);
  assert.equal(m.history("nope"), null);
});

test("dashboard escapes check names and public page hides reasons", () => {
  const rows = [{ slug: "<img src=x>", state: "down", reason: "secret reason", lastPing: null, pings: 0 }];
  assert.ok(!dashboardHtml(rows, 0).includes("<img src=x>"));
  const pub = publicStatusHtml(rows, "Acme <Status>");
  assert.ok(!pub.includes("secret reason") && pub.includes("Disruption") && pub.includes("Acme &lt;Status&gt;"));
});

test("server: dashboard needs the key, /s is public only when enabled, Bearer header works", async () => {
  const spawnServer = async (port, extra) => {
    const { spawn } = await import("node:child_process");
    const p = spawn(process.execPath, [fileURLToPath(new URL("./server.mjs", import.meta.url))], { env: { ...process.env, PORT: String(port), PING_KEY: "k", CHECKS_JSON: '{"a":{"periodSeconds":60}}', STATE: `/tmp/ch-feat-${port}.json`, ...extra }, stdio: "pipe" });
    await new Promise((r) => p.stdout.once("data", r));
    return p;
  };
  for (const p of [18791, 18792]) fs.rmSync(`/tmp/ch-feat-${p}.json`, { force: true }); // a stale file from an earlier run would inflate pings
  const on = await spawnServer(18791, { PUBLIC_STATUS: "1" });
  const off = await spawnServer(18792, {});
  try {
    assert.equal((await fetch("http://127.0.0.1:18791/")).status, 401);
    const dash = await fetch("http://127.0.0.1:18791/", { headers: { authorization: "Bearer k" } });
    assert.equal(dash.status, 200);
    assert.match(await dash.text(), /cron-heartbeat/);
    assert.equal((await fetch("http://127.0.0.1:18791/s")).status, 200);
    assert.equal((await fetch("http://127.0.0.1:18792/s")).status, 401);
    assert.equal((await fetch("http://127.0.0.1:18791/ping/a?key=k", { method: "POST" })).status, 200);
    const hist = await (await fetch("http://127.0.0.1:18791/history/a?key=k")).json();
    assert.equal(hist[0].kind, "success");
  } finally { on.kill(); off.kill(); }
  // state survives a restart, written atomically
  assert.ok(JSON.parse(fs.readFileSync("/tmp/ch-feat-18791.json", "utf8")).a.pings === 1);
  assert.ok(!fs.existsSync("/tmp/ch-feat-18791.json.tmp"));
});

test("deploy files: Dockerfile ships every imported module and keeps state on a volume; fly and render keep one awake instance", () => {
  const d = fs.readFileSync(new URL("./Dockerfile", import.meta.url), "utf8");
  for (const f of ["cron.mjs", "monitor.mjs", "notify.mjs", "dashboard.mjs", "server.mjs"]) assert.ok(d.includes(f), f);
  assert.match(d, /STATE=\/data\/state\.json/);
  assert.match(d, /VOLUME \/data/);
  assert.match(fs.readFileSync(new URL("./fly.toml", import.meta.url), "utf8"), /auto_stop_machines = "off"/);
  const r = fs.readFileSync(new URL("./render.yaml", import.meta.url), "utf8");
  assert.match(r, /plan: starter/);
  assert.match(r, /mountPath: \/data/);
  assert.match(fs.readFileSync(new URL("./docker-compose.yml", import.meta.url), "utf8"), /state:\/data/);
});
