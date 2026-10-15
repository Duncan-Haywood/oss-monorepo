#!/usr/bin/env node
// Self-hosted heartbeat monitor. Zero dependencies; run it on any box you own.
//   CONFIG=checks.json STATE=state.json PORT=8787 node server.mjs
// Alerts: ALERT_WEBHOOK_URL (Slack/Discord/Mattermost-style {"text": ...} JSON; ntfy.sh
// topics work with ALERT_NTFY_URL). Nothing is sent anywhere unless you set one.
import http from "node:http";
import fs from "node:fs";
import { createMonitor } from "./monitor.mjs";

const env = process.env;
const port = Number(env.PORT || 8787);
const configPath = env.CONFIG || "checks.json";
const statePath = env.STATE || "state.json";
const key = env.PING_KEY || "";

function readJson(path, fallback) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

async function notify(msg) {
  if (env.ALERT_WEBHOOK_URL) {
    const res = await fetch(env.ALERT_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: msg.text, content: msg.text }) });
    if (!res.ok) throw new Error(`webhook ${res.status}`);
  }
  if (env.ALERT_NTFY_URL) {
    const res = await fetch(env.ALERT_NTFY_URL, { method: "POST", body: msg.text, headers: { Title: `cron-heartbeat: ${msg.slug}`, Priority: msg.state === "recovered" ? "default" : "high" } });
    if (!res.ok) throw new Error(`ntfy ${res.status}`);
  }
  console.log(msg.text);
}

export function handler(monitor, save, now = Date.now) {
  return (req, res) => {
    const url = new URL(req.url, "http://x");
    const send = (code, body) => { res.writeHead(code, { "content-type": "text/plain" }); res.end(body); };
    if (url.pathname === "/healthz") return send(200, "ok\n");
    if (key && url.searchParams.get("key") !== key) return send(401, "key required\n");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "status") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(monitor.status(now()), null, 2));
    }
    if (parts[0] === "ping" && parts[1]) {
      const kind = parts[2] === "start" ? "start" : parts[2] === "fail" ? "fail" : "success";
      if (parts[2] && !["start", "fail"].includes(parts[2])) return send(404, "unknown action\n");
      if (!monitor.ping(parts[1], kind, now())) return send(404, "unknown check\n");
      save();
      return send(200, "OK\n");
    }
    return send(404, "not found\n");
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = createMonitor({ config: env.CHECKS_JSON ? JSON.parse(env.CHECKS_JSON) : readJson(configPath, {}), state: readJson(statePath, {}), notify });
  const save = () => fs.writeFileSync(statePath, JSON.stringify(monitor.state));
  setInterval(async () => { await monitor.tick(Date.now()); save(); }, 30000).unref?.();
  http.createServer(handler(monitor, save)).listen(port, () => console.log(`cron-heartbeat listening on :${port}, ${Object.keys(monitor.checks).length} checks`));
}
