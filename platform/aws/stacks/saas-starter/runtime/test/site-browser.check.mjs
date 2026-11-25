// Browser check of the static-site gate (src/site.mjs) in Chromium. Cognito is faked at the network layer (authorize
// redirects back with a code; the token endpoint checks the PKCE verifier and returns an ID token); a stand-in for API
// Gateway's JWT authorizer reads that token's claims on POST /api/session, as AWS does after checking its signature.
//   SITE_DIR=<built site> node test/site-browser.check.mjs        (default: a two-page site written to a temp dir)
// Not a *.test.mjs file: it needs a browser (Playwright, preinstalled or from PLAYWRIGHT_MODULE).
import http from "node:http";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeSiteApp } from "../src/site.mjs";

const require = createRequire(`${process.env.PLAYWRIGHT_MODULE ?? process.cwd() + "/node_modules"}/`);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = createRequire(import.meta.url)("playwright")); }
const fail = (m) => { console.error("FAIL " + m); process.exitCode = 1; };
const ok = (m) => console.log("ok: " + m);

let root = process.env.SITE_DIR, page1 = process.env.SITE_PAGE || "/guide/";
if (!root) {
  root = await mkdtemp(join(tmpdir(), "site-check-"));
  await writeFile(join(root, "index.html"), `<!doctype html><title>home</title><h1>Home</h1><a href="/guide/">guide</a>`);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(root, "guide"));
  await writeFile(join(root, "guide/index.html"), `<!doctype html><title>guide</title><h1>The guide</h1>`);
}
const COGNITO = "https://site-check.auth.us-east-1.amazoncognito.com";
const key = crypto.getRandomValues(new Uint8Array(32));
const app = makeSiteApp({ root, keySource: async () => key });
const VARS = { GATE_EMAILS: "owner@example.com", ROBOTS: "noindex" };
const server = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  let user = null;
  if (req.url.startsWith("/api/")) {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
    if (!m) { res.writeHead(401); return res.end(); }
    user = JSON.parse(Buffer.from(m[1], "base64url").toString());
  }
  const out = await app.fetch(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined }), { VARS, user, AUTH: { domain: COGNITO, webClientId: "cid" } });
  const h = {}; out.headers.forEach((v, k) => { h[k] = v; });
  // Locally over http: drop Secure/__Host- so the browser keeps the cookie (AWS serves https).
  if (h["set-cookie"]) h["set-cookie"] = h["set-cookie"].replace("__Host-gate", "gate").replace("; Secure", "");
  res.writeHead(out.status, h); res.end(Buffer.from(await out.arrayBuffer()));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
// The app reads __Host-gate; the local proxy renamed it, so map it back on the way in.
const origFetch = app.fetch;
app.fetch = (request, env) => {
  const c = request.headers.get("cookie");
  if (c) { const h = new Headers(request.headers); h.set("cookie", c.replace(/(^|; )gate=/, "$1__Host-gate=")); request = new Request(request, { headers: h }); }
  return origFetch(request, env);
};

const browser = await chromium.launch();
try {
  for (const [email, allowed] of [["stranger@example.com", false], ["owner@example.com", true]]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let challenge;
    await page.route(`${COGNITO}/oauth2/authorize?*`, (route) => {
      const q = new URL(route.request().url()).searchParams;
      challenge = q.get("code_challenge");
      if (q.get("redirect_uri") !== `${base}/auth/login`) fail("redirect_uri " + q.get("redirect_uri"));
      route.fulfill({ status: 302, headers: { location: `${base}/auth/login?code=c&state=${encodeURIComponent(q.get("state"))}` } });
    });
    await page.route(`${COGNITO}/oauth2/token`, (route) => {
      const f = new URLSearchParams(route.request().postData());
      if (createHash("sha256").update(f.get("code_verifier")).digest("base64url") !== challenge) fail("PKCE mismatch");
      const id = Buffer.from(JSON.stringify({ email, email_verified: "true" })).toString("base64url");
      route.fulfill({ status: 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: JSON.stringify({ id_token: id, access_token: "a" }) });
    });
    await page.goto(base + page1);
    if (allowed) {
      await page.waitForURL(base + page1);
      const h1 = await page.textContent("h1");
      ok(`${email}: sent to sign-in and back to ${page1} ("${h1}")`);
      await page.goto(base + "/");
      if (!/Home|.+/.test(await page.title())) fail("home after sign-in");
      ok("the session cookie opens other pages");
    } else {
      await page.waitForSelector(".err");
      const t = await page.textContent(".err");
      if (!/not on the list/.test(t)) fail("stranger message: " + t); else ok(`${email}: refused ("${t}")`);
      const r = await page.goto(base + page1);
      if (!r.url().includes("/auth/login")) fail("stranger reached the page"); else ok("stranger still redirected to sign-in");
    }
    if (errors.length) fail("page errors: " + errors.join("; "));
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
