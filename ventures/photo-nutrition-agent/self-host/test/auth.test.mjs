import { test } from "node:test";
import assert from "node:assert/strict";
import { startApp, PASSWORD, pkce, photo } from "./helpers.mjs";

test("unauthenticated requests are refused, and /mcp points at the OAuth metadata", async () => {
  const app = await startApp();
  try {
    const r = await app.call("POST", "/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" }, null);
    assert.equal(r.status, 401);
    assert.match(r.headers.get("www-authenticate"), /resource_metadata="http:\/\/127\.0\.0\.1:\d+\/\.well-known\/oauth-protected-resource"/);
    assert.equal((await app.call("POST", "/v1/device/photos", photo("x", "2026-11-20T10:00:00Z"), null)).status, 401);
    // The chat token is not a device token, and vice versa.
    assert.equal((await app.call("POST", "/v1/device/photos", photo("x", "2026-11-20T10:00:00Z"))).status, 401);
    assert.equal((await app.device("POST", "/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" })).status, 401);
    assert.equal((await app.call("GET", "/api/export", undefined, "wrong")).status, 401);
  } finally {
    await app.close();
  }
});

test("OAuth 2.1: discovery, dynamic registration, PKCE code flow, refresh rotation", async () => {
  const app = await startApp();
  try {
    const prm = await app.call("GET", "/.well-known/oauth-protected-resource", undefined, null);
    assert.equal(prm.body.resource, `${app.base}/mcp`);
    const asm = await app.call("GET", "/.well-known/oauth-authorization-server", undefined, null);
    assert.deepEqual(asm.body.code_challenge_methods_supported, ["S256"]);

    const bad = await app.call("POST", "/register", { redirect_uris: ["https://evil.example/cb"] }, null);
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, "invalid_redirect_uri");

    const reg = await app.call("POST", "/register", { redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"], client_name: "ChatGPT" }, null);
    assert.equal(reg.status, 201);
    const clientId = reg.body.client_id;
    const { verifier, challenge } = pkce();
    const q = { response_type: "code", client_id: clientId, redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect", code_challenge: challenge, code_challenge_method: "S256", state: "xyz", scope: "nutrition" };

    const page = await app.call("GET", `/authorize?${new URLSearchParams(q)}`, undefined, null);
    assert.equal(page.status, 200);
    assert.match(page.body, /chatgpt\.com/);
    assert.equal(page.headers.get("x-frame-options"), "DENY");

    const noPkce = await app.call("GET", `/authorize?${new URLSearchParams({ ...q, code_challenge: "" })}`, undefined, null);
    assert.equal(noPkce.status, 400);

    const form = (o) => new URLSearchParams(o).toString();
    const wrong = await app.call("POST", "/authorize", form({ ...q, password: "nope" }), null, { "content-type": "application/x-www-form-urlencoded" });
    assert.equal(wrong.status, 401);

    const ok = await app.call("POST", "/authorize", form({ ...q, password: PASSWORD }), null, { "content-type": "application/x-www-form-urlencoded" });
    assert.equal(ok.status, 302);
    const loc = new URL(ok.headers.get("location"));
    assert.equal(loc.searchParams.get("state"), "xyz");
    const code = loc.searchParams.get("code");

    const badVerifier = await app.call("POST", "/token", form({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: q.redirect_uri, code_verifier: "x".repeat(43) }), null, { "content-type": "application/x-www-form-urlencoded" });
    assert.equal(badVerifier.status, 400);
    // The code was consumed by the failed attempt: single use.
    const reused = await app.call("POST", "/token", form({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: q.redirect_uri, code_verifier: verifier }), null, { "content-type": "application/x-www-form-urlencoded" });
    assert.equal(reused.body.error, "invalid_grant");

    const ok2 = await app.call("POST", "/authorize", form({ ...q, password: PASSWORD }), null, { "content-type": "application/x-www-form-urlencoded" });
    const code2 = new URL(ok2.headers.get("location")).searchParams.get("code");
    const tok = await app.call("POST", "/token", form({ grant_type: "authorization_code", code: code2, client_id: clientId, redirect_uri: q.redirect_uri, code_verifier: verifier }), null, { "content-type": "application/x-www-form-urlencoded" });
    assert.equal(tok.status, 200);
    assert.equal(tok.body.token_type, "Bearer");

    const listed = await app.call("POST", "/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" }, tok.body.access_token);
    assert.equal(listed.status, 200);
    assert.ok(listed.body.result.tools.length >= 15);

    const refreshed = await app.call("POST", "/token", form({ grant_type: "refresh_token", refresh_token: tok.body.refresh_token, client_id: clientId }), null, { "content-type": "application/x-www-form-urlencoded" });
    assert.equal(refreshed.status, 200);
    const replay = await app.call("POST", "/token", form({ grant_type: "refresh_token", refresh_token: tok.body.refresh_token, client_id: clientId }), null, { "content-type": "application/x-www-form-urlencoded" });
    assert.equal(replay.body.error, "invalid_grant");

    // Access tokens expire.
    app.clock.t = new Date(app.clock.t.getTime() + 2 * 3600000);
    const expired = await app.call("POST", "/mcp", { jsonrpc: "2.0", id: 2, method: "ping" }, refreshed.body.access_token);
    assert.equal(expired.status, 401);
  } finally {
    await app.close();
  }
});

test("password guessing locks the authorize endpoint", async () => {
  const app = await startApp();
  try {
    const reg = await app.call("POST", "/register", { redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }, null);
    const { challenge } = pkce();
    const q = { response_type: "code", client_id: reg.body.client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", code_challenge: challenge, code_challenge_method: "S256" };
    const form = (o) => new URLSearchParams(o).toString();
    for (let i = 0; i < 10; i++) await app.call("POST", "/authorize", form({ ...q, password: `guess${i}` }), null, { "content-type": "application/x-www-form-urlencoded" });
    const locked = await app.call("POST", "/authorize", form({ ...q, password: PASSWORD }), null, { "content-type": "application/x-www-form-urlencoded" });
    assert.equal(locked.status, 401);
    assert.match(locked.body, /too many/);
  } finally {
    await app.close();
  }
});

test("OpenAPI for Custom GPT Actions lists every tool as a POST with a short description", async () => {
  const app = await startApp();
  try {
    const r = await app.call("GET", "/openapi.json", undefined, null);
    assert.equal(r.body.openapi, "3.1.0");
    const ops = Object.values(r.body.paths).map((p) => p.post);
    assert.ok(ops.length >= 15);
    for (const op of ops) assert.ok(op.description.length <= 300, op.operationId);
    const viaRest = await app.call("POST", "/api/tools/get_nutrition_targets", {});
    assert.equal(viaRest.status, 200);
    assert.equal(viaRest.body.targets.energy_kcal, 2000);
  } finally {
    await app.close();
  }
});

test("export, erase and restore round-trip the records", async () => {
  const app = await startApp();
  try {
    await app.tool("log_meal", { name: "eggs", eaten_at: "2026-11-20T13:00:00Z", items: [{ name: "egg", amount: { value: 3, unit: "each" } }] });
    await app.tool("update_nutrition_targets", { targets: { energy_kcal: 2100, protein_g: 150 } });
    const dump = (await app.call("GET", "/api/export")).body;
    assert.equal(dump.meals.length, 1);
    assert.equal((await app.call("POST", "/api/erase", { confirm: "yes" })).status, 400);
    assert.equal((await app.call("POST", "/api/erase", { confirm: "erase everything" })).status, 200);
    assert.equal(app.store.mealsByDate("2026-01-01", "2027-01-01").length, 0);
    await app.call("POST", "/api/restore", dump);
    const meals = app.store.mealsByDate("2026-01-01", "2027-01-01");
    assert.equal(meals.length, 1);
    assert.equal(app.store.mealVersions(meals[0].id).length, 1);
    assert.equal((await app.tool("get_nutrition_targets")).targets.protein_g, 150);
  } finally {
    await app.close();
  }
});
