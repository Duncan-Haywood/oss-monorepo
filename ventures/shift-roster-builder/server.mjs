#!/usr/bin/env node
// Team hub server: you build and publish the week, your staff open one link to see their shifts, add them
// to their calendar and send availability. Zero dependencies. Offered only as the hosted team hub (README).
//   ADMIN_KEY=... TEAM_TOKEN=... STATE=/data/state.json PORT=8080 node server.mjs
// ADMIN_KEY unlocks /admin. TEAM_TOKEN is the secret in the link you share with staff (/team?t=...).
// Wages never reach the staff page. State is one JSON file: put STATE on a persistent disk.
// The handler itself is in hub.mjs (shared with the Cloudflare Worker, hub-worker.mjs); this file is the Node entry.
// BUILD_IN_BROWSER=1 makes the admin page build the roster in the manager's browser (the Worker's mode); this server
// then also serves calc.mjs and bnp.mjs at the root (/calc.mjs) for that page.
import http from "node:http";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { handler, emptyState } from "./hub.mjs";
export * from "./hub.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const statePath = process.env.STATE || "state.json";
  let state = emptyState();
  try { state = { ...state, ...JSON.parse(fs.readFileSync(statePath, "utf8")) }; } catch (e) { if (e.code !== "ENOENT") throw e; }
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state)); fs.renameSync(`${statePath}.tmp`, statePath); };
  const port = Number(process.env.PORT || 8080);
  const hub = handler(state, save);
  const modules = { "/calc.mjs": "calc.mjs", "/bnp.mjs": "bnp.mjs" };
  http.createServer((req, res) => {
    const f = process.env.BUILD_IN_BROWSER && req.method === "GET" && modules[new URL(req.url, "http://x").pathname];
    if (!f) return hub(req, res);
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "x-content-type-options": "nosniff" });
    res.end(fs.readFileSync(new URL(f, import.meta.url)));
  }).listen(port, () => console.log(`roster hub on :${port}${process.env.ADMIN_KEY && process.env.TEAM_TOKEN ? "" : " (set ADMIN_KEY and TEAM_TOKEN)"}`));
}
