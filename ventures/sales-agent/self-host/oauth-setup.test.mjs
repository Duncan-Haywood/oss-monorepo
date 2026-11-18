// The one-time OAuth setup script (oauth-setup.mjs), run as a real process against a local token endpoint.
// Red-team 2026-11-17: all 8 mutants seeded into the script escaped, since no test ran it. It is the step that turns a
// deployer's consent into a refresh token, so the state check, the callback path, the port the README tells them to
// register and the exit codes are each pinned here.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./oauth-setup.mjs", import.meta.url));

function tokenServer() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => {
      const p = new URLSearchParams(b); calls.push(Object.fromEntries(p));
      const ok = p.get("grant_type") === "authorization_code" && p.get("code") === "good-code" && p.get("code_verifier");
      res.writeHead(ok ? 200 : 400, { "content-type": "application/json" });
      res.end(JSON.stringify(ok ? { access_token: "at", refresh_token: "rt-from-setup" } : { error: "invalid_grant" }));
    });
  });
  return { calls, listen: () => new Promise((r) => server.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${server.address().port}/token`))), close: () => new Promise((r) => server.close(r)) };
}

const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => r(port)); }); });

/** Start the script; resolve once it prints the consent URL. */
function start(env) {
  const child = spawn(process.execPath, [SCRIPT], { env: { PATH: process.env.PATH, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  const exited = new Promise((r) => child.on("exit", (code) => r(code)));
  child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (err += d));
  const ready = new Promise((resolve, reject) => {
    // A script that never prints a URL (or prints a broken one) must fail here, not hang the suite.
    const limit = setTimeout(() => { clearInterval(t); child.kill(); reject(new Error(`no consent URL within 5 s; stdout: ${JSON.stringify(out)}`)); }, 5000);
    exited.then(() => clearTimeout(limit));
    const t = setInterval(() => {
      const m = out.match(/^(https?:\/\/\S+)$/m);
      if (m) { clearInterval(t); clearTimeout(limit); resolve(new URL(m[1])); }
    }, 10);
    exited.then((code) => { clearInterval(t); reject(new Error(`exited ${code} before printing a URL: ${err}`)); });
  });
  ready.catch(() => {}); // a test that expects an early exit never awaits it
  return { child, ready, exited, out: () => out, err: () => err };
}

const get = (url) => new Promise((resolve, reject) => http.get(url, (res) => { let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => resolve({ status: res.statusCode, body: b })); }).on("error", reject));

test("setup: without a client id it says what to set and exits 1", async () => {
  const s = start({});
  assert.equal(await s.exited, 1);
  assert.match(s.err(), /set OAUTH_CLIENT_ID/);
});

test("setup: the redirect defaults to 127.0.0.1:8789/callback, the URI the README says to register", async (t) => {
  const s = start({ OAUTH_CLIENT_ID: "cid", OAUTH_AUTH_URL: "http://127.0.0.1:9/auth" });
  let u;
  try { u = await s.ready; } catch (e) {
    if (/EADDRINUSE/.test(String(e.message))) return t.skip("port 8789 is busy on this machine");
    throw e;
  } finally { s.child.kill(); }
  assert.equal(u.searchParams.get("redirect_uri"), "http://127.0.0.1:8789/callback");
});

test("setup: a full consent round trip prints the refresh token; wrong path is 404, wrong state is 400 and keeps waiting", async () => {
  const ts = tokenServer(); const tokenUrl = await ts.listen(); const port = await freePort();
  const s = start({ OAUTH_CLIENT_ID: "cid", OAUTH_SETUP_PORT: String(port), OAUTH_AUTH_URL: "http://127.0.0.1:9/auth", OAUTH_TOKEN_URL: tokenUrl });
  try {
    const u = await s.ready;
    const redirect = u.searchParams.get("redirect_uri");
    assert.equal(redirect, `http://127.0.0.1:${port}/callback`);
    assert.equal(u.searchParams.get("code_challenge_method"), "S256");
    const state = u.searchParams.get("state");
    assert.match(state, /^[0-9a-f]{24}$/);

    assert.equal((await get(`http://127.0.0.1:${port}/favicon.ico`)).status, 404);
    const forged = await get(`${redirect}?state=not-the-state&code=good-code`);
    assert.equal(forged.status, 400); assert.match(forged.body, /state mismatch/);
    assert.equal(ts.calls.length, 0, "a forged state never reaches the token endpoint");

    const ok = await get(`${redirect}?state=${state}&code=good-code`);
    assert.equal(ok.status, 200); assert.match(ok.body, /Done/);
    assert.equal(await s.exited, 0);
    assert.match(s.out(), /^OAUTH_REFRESH_TOKEN=rt-from-setup$/m);
    assert.equal(ts.calls[0].code, "good-code");
    assert.equal(ts.calls[0].redirect_uri, redirect);
  } finally { s.child.kill(); await ts.close(); }
});

test("setup: a rejected code answers 500 and exits 1 without printing a token", async () => {
  const ts = tokenServer(); const tokenUrl = await ts.listen(); const port = await freePort();
  const s = start({ OAUTH_CLIENT_ID: "cid", OAUTH_SETUP_PORT: String(port), OAUTH_AUTH_URL: "http://127.0.0.1:9/auth", OAUTH_TOKEN_URL: tokenUrl });
  try {
    const u = await s.ready;
    const r = await get(`${u.searchParams.get("redirect_uri")}?state=${u.searchParams.get("state")}&code=bad-code`);
    assert.equal(r.status, 500);
    assert.equal(await s.exited, 1);
    assert.match(s.err(), /invalid_grant/);
    assert.doesNotMatch(s.out(), /OAUTH_REFRESH_TOKEN/);
  } finally { s.child.kill(); await ts.close(); }
});

test("setup: an unknown OAUTH_PROVIDER exits 1 naming the valid ones, before opening a port", async () => {
  const port = await freePort();
  const s = start({ OAUTH_CLIENT_ID: "cid", OAUTH_PROVIDER: "Google", OAUTH_SETUP_PORT: String(port) });
  assert.equal(await s.exited, 1);
  assert.match(s.err(), /OAUTH_PROVIDER must be google or microsoft/);
  assert.doesNotMatch(s.err(), /TypeError|Cannot read/);
});

test("setup: a declined consent says so and exits 1 without calling the token endpoint", async () => {
  const ts = tokenServer(); const tokenUrl = await ts.listen(); const port = await freePort();
  const s = start({ OAUTH_CLIENT_ID: "cid", OAUTH_SETUP_PORT: String(port), OAUTH_AUTH_URL: "http://127.0.0.1:9/auth", OAUTH_TOKEN_URL: tokenUrl });
  try {
    const u = await s.ready;
    const r = await get(`${u.searchParams.get("redirect_uri")}?state=${u.searchParams.get("state")}&error=access_denied&error_description=The+user+declined`);
    assert.equal(r.status, 400); assert.match(r.body, /declined|access_denied/);
    assert.equal(await s.exited, 1);
    assert.match(s.err(), /access_denied/);
    assert.equal(ts.calls.length, 0, "no empty code is posted to the token endpoint");
  } finally { s.child.kill(); await ts.close(); }
});
