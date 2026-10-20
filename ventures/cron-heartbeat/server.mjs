#!/usr/bin/env node
// Self-hosted heartbeat monitor. Zero dependencies; run it on any box you own.
//   CONFIG=checks.json STATE=state.json PORT=8787 node server.mjs
// Alerts: webhook, ntfy, Telegram or email (Resend); see notify.mjs. Nothing is sent
// anywhere unless you set one. PUBLIC_STATUS=1 serves a key-free /s status page.
// STATE should sit on a persistent disk or the monitor forgets everything on restart.
import http from "node:http";
import fs from "node:fs";
import { createMonitor } from "./monitor.mjs";
import { createNotifier, channelsFrom } from "./notify.mjs";
import { dashboardHtml, publicStatusHtml, badgeSvg } from "./dashboard.mjs";

const env = process.env;
const port = Number(env.PORT || 8787);
const configPath = env.CONFIG || "checks.json";
const statePath = env.STATE || "state.json";
const key = env.PING_KEY || "";

function readJson(path, fallback) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

export function handler(monitor, save, now = Date.now, opts = {}) {
  return (req, res) => {
    const url = new URL(req.url, "http://x");
    const send = (code, body, type = "text/plain") => { res.writeHead(code, { "content-type": type }); res.end(body); };
    if (url.pathname === "/healthz") return send(200, "ok\n");
    const badge = url.pathname.match(/^\/badge\/([a-z0-9][a-z0-9_-]{0,63})\.svg$/);
    if (badge && opts.publicStatus) {
      const row = monitor.status(now()).find((r) => r.slug === badge[1]);
      if (!row) return send(404, "unknown check\n");
      res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-cache, max-age=0" });
      return res.end(badgeSvg(row.slug, row.state));
    }
    if (url.pathname === "/s" && opts.publicStatus) return send(200, publicStatusHtml(monitor.status(now()), opts.statusTitle), "text/html; charset=utf-8");
    const supplied = url.searchParams.get("key") ?? (req.headers.authorization || "").replace(/^Bearer /, "");
    if (key && supplied !== key) return send(401, "key required\n");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return send(200, dashboardHtml(monitor.status(now()), now(), { channels: opts.channels }), "text/html; charset=utf-8");
    if (parts[0] === "history" && parts[1]) {
      const h = monitor.history(parts[1]);
      return h ? send(200, JSON.stringify(h, null, 2), "application/json") : send(404, "unknown check\n");
    }
    if (parts[0] === "status") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(monitor.status(now()), null, 2));
    }
    if ((parts[0] === "pause" || parts[0] === "resume") && parts[1]) {
      if (!monitor.setPaused(parts[1], parts[0] === "pause", now())) return send(404, "unknown check\n");
      save();
      return send(200, "OK\n");
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
  const monitor = createMonitor({ config: env.CHECKS_JSON ? JSON.parse(env.CHECKS_JSON) : readJson(configPath, {}), state: readJson(statePath, {}), notify: createNotifier(env) });
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(monitor.state)); fs.renameSync(`${statePath}.tmp`, statePath); };
  setInterval(async () => { await monitor.tick(Date.now()); save(); }, 30000).unref?.();
  const channels = channelsFrom(env);
  const opts = { channels, publicStatus: env.PUBLIC_STATUS === "1", statusTitle: env.STATUS_TITLE || "Status" };
  http.createServer(handler(monitor, save, Date.now, opts)).listen(port, () => console.log(`cron-heartbeat listening on :${port}, ${Object.keys(monitor.checks).length} checks, alerts: ${channels.join(", ") || "none"}`));
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { try { save(); } finally { process.exit(0); } });
}
