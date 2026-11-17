// Browser check: with BUILD_IN_BROWSER (the Cloudflare Worker's mode) the admin page's "Build and publish" runs the
// roster search in the browser, posts the owner array, and the server publishes it; staff then see the week.
//   PLAYWRIGHT_MODULE=/path/to/node_modules node shift-roster-builder/hub-browser.check.mjs   (from ventures/)
// Not a *.test.mjs file on purpose: it needs a browser. Starts server.mjs itself on a free port with a temp state file,
// or, with BASE_URL set, drives a hub already running with ADMIN_KEY=adm TEAM_TOKEN=tm, e.g. the Worker itself:
//   printf 'ADMIN_KEY=adm\nTEAM_TOKEN=tm\n' > .dev.vars && npx wrangler dev --port 8799   (then BASE_URL=http://127.0.0.1:8799)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
const require = createRequire(`${process.env.PLAYWRIGHT_MODULE ?? process.cwd() + "/node_modules"}/`);
const { chromium } = require("playwright");
const fail = (m) => { console.error("FAIL " + m); process.exitCode = 1; };
const port = 18000 + Math.floor(Math.random() * 1000);
const state = path.join(os.tmpdir(), `hub-check-${port}.json`);
const srv = process.env.BASE_URL ? null : spawn(process.execPath, [new URL("./server.mjs", import.meta.url).pathname], { env: { ...process.env, PORT: String(port), STATE: state, ADMIN_KEY: "adm", TEAM_TOKEN: "tm", BUILD_IN_BROWSER: "1" }, stdio: ["ignore", "pipe", "inherit"] });
if (srv) await new Promise((r) => srv.stdout.once("data", r));
const base = process.env.BASE_URL || `http://127.0.0.1:${port}`;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const posted = [];
  page.on("request", (q) => { if (q.method() === "POST") posted.push(q.postData() || ""); });
  await page.goto(`${base}/admin?key=adm`);
  await page.fill('input[name="weekStart"]', "2026-11-16");
  const t0 = Date.now();
  await Promise.all([page.waitForURL(/note=Published/), page.click('button[value="publish"]')]);
  console.log(`published in ${Date.now() - t0} ms (build in the page, then the post)`);
  const body = posted.find((b) => b.includes("owner=")) || "";
  const owner = JSON.parse(new URLSearchParams(body).get("owner") || "null");
  if (!Array.isArray(owner) || !owner.length) fail("the publish post carried no owner array"); else console.log(`ok: posted an owner array of ${owner.length} shifts`);
  if (!/act=publish/.test(body)) fail("the publish post lost act=publish");
  const note = decodeURIComponent(new URL(page.url()).searchParams.get("note") || "");
  if (!/Payroll \$/.test(note)) fail("no payroll in the note: " + note); else console.log("ok: " + note);
  await page.goto(`${base}/team?t=tm`);
  const team = await page.textContent("body");
  if (!/week of 2026-11-16/.test(team)) fail("staff page does not show the week"); else console.log("ok: staff page shows the week of 2026-11-16");
  if (errors.length) fail("page errors: " + errors.join("; ")); else console.log("ok: no page errors");
} finally {
  await browser.close();
  if (srv) srv.kill();
}
