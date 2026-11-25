// Browser check of the hosted hub: the manager signs in (Cognito faked at the network layer: authorize redirects back
// with a code, the token endpoint checks the PKCE verifier against the challenge), creates a hub, opens its admin link,
// builds and publishes a week in the browser, and the team link shows it. Runs aws/local.mjs (in memory, no AWS).
//   node shift-roster-builder/aws/console-browser.check.mjs     (from ventures/; Playwright from PLAYWRIGHT_MODULE or global)
// Not a *.test.mjs file on purpose: it needs a browser.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { serveLocal } from "./local.mjs";
const require = createRequire(`${process.env.PLAYWRIGHT_MODULE ?? process.cwd() + "/node_modules"}/`);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = createRequire(import.meta.url)("playwright")); }
const fail = (m) => { console.error("FAIL " + m); process.exitCode = 1; };
const ok = (m) => console.log("ok: " + m);
const COGNITO = "https://roster-hub.auth.us-east-1.amazoncognito.com";
const { server, store, url: base } = await serveLocal({ port: 0, auth: { domain: COGNITO, webClientId: "client123" } });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  let challenge = null;
  await page.route(`${COGNITO}/oauth2/authorize?*`, (route) => {
    const q = new URL(route.request().url()).searchParams;
    if (q.get("client_id") !== "client123" || q.get("code_challenge_method") !== "S256" || q.get("redirect_uri") !== `${base}/auth/callback`) fail("authorize request: " + q);
    challenge = q.get("code_challenge");
    route.fulfill({ status: 302, headers: { location: `${base}/auth/callback?code=c0de&state=${encodeURIComponent(q.get("state"))}` } });
  });
  await page.route(`${COGNITO}/oauth2/token`, (route) => {
    const f = new URLSearchParams(route.request().postData());
    const want = createHash("sha256").update(f.get("code_verifier") || "").digest("base64url");
    if (f.get("code") !== "c0de" || want !== challenge) { fail("token exchange without the matching PKCE verifier"); return route.fulfill({ status: 400, body: "{}" }); }
    route.fulfill({ status: 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: JSON.stringify({ access_token: "manager-1", id_token: "x", token_type: "Bearer" }) });
  });

  await page.goto(`${base}/`);
  await Promise.all([page.waitForURL(/\/start$/), page.click("text=sign in here")]);
  await page.click('button:text-is("Sign in")');
  await page.waitForSelector('button:text-is("Create a hub")');
  if (!page.url().endsWith("/start")) fail("callback URL not cleaned up: " + page.url()); else ok("signed in with code + PKCE, code removed from the address bar");
  await page.fill('input[placeholder^="Team name"]', "Main St <b>cafe</b>");
  await page.fill('input[placeholder^="Time zone"]', "America/Denver");
  await page.click('button:text-is("Create a hub")');
  await page.waitForSelector("text=Admin link (yours)");
  const codes = await page.$$eval("code", (els) => els.map((e) => e.textContent));
  const admin = codes.find((c) => c.includes("/admin?key=")), team = codes.find((c) => c.includes("/team?t="));
  if (!admin || !team) fail("links not shown: " + codes); else ok("hub created, both links shown once");
  if (!(await page.textContent("li strong")).includes("<b>cafe</b>")) fail("team name not shown as text"); else ok("team name rendered as text, not HTML");
  if (store.rows[0].settings.TIMEZONE !== "America/Denver") fail("time zone not saved");

  await page.goto(admin);
  await page.fill('input[name="weekStart"]', "2026-11-16");
  await Promise.all([page.waitForURL(/note=Published/), page.click('button[value="publish"]')]);
  ok("built in the browser (calc.mjs from the app) and published: " + decodeURIComponent(new URL(page.url()).searchParams.get("note")));
  await page.goto(team);
  if (!/week of 2026-11-16/.test(await page.textContent("body"))) fail("staff page does not show the week"); else ok("team link shows the week");

  await page.goto(`${base}/start`);
  page.once("dialog", (d) => d.accept());
  await page.click("text=Delete");
  await page.waitForSelector("text=None yet.");
  if (store.rows.length) fail("delete left a row"); else ok("deleted");
  if (errors.length) fail("page errors: " + errors.join("; ")); else ok("no page errors (CSP allows the console script by hash)");
} finally {
  await browser.close();
  server.close();
}
