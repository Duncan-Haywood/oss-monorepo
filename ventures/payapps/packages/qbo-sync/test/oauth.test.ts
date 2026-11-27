import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAuthorizeUrl,
  createTokenManager,
  exchangeCode,
  INTUIT_REVOKE_ENDPOINT,
  INTUIT_TOKEN_ENDPOINT,
  IntuitOAuthError,
  parseCallback,
  refreshTokens,
  revokeToken,
  type TokenSet,
  type TokenStore,
} from "../src/oauth.ts";
import { scriptedFetch } from "./http.ts";

// Placeholder values only: real ones are owner-set secrets.
const cfg = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  redirectUri: "https://app.example/integrations/qbo/callback",
};
const NOW = 1_800_000_000_000;

describe("buildAuthorizeUrl", () => {
  it("builds Intuit's authorize URL with the accounting scope", () => {
    const url = new URL(buildAuthorizeUrl({ ...cfg, state: "s-123" }));
    assert.equal(`${url.origin}${url.pathname}`, "https://appcenter.intuit.com/connect/oauth2");
    assert.equal(url.searchParams.get("client_id"), "test-client-id");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("scope"), "com.intuit.quickbooks.accounting");
    assert.equal(url.searchParams.get("redirect_uri"), cfg.redirectUri);
    assert.equal(url.searchParams.get("state"), "s-123");
  });

  it("joins extra scopes with spaces and requires state", () => {
    const url = new URL(
      buildAuthorizeUrl({
        ...cfg,
        state: "s",
        scopes: ["com.intuit.quickbooks.accounting", "openid"],
      }),
    );
    assert.equal(url.searchParams.get("scope"), "com.intuit.quickbooks.accounting openid");
    assert.throws(() => buildAuthorizeUrl({ ...cfg, state: "" }), /state/);
  });
});

describe("parseCallback", () => {
  const base = "https://app.example/integrations/qbo/callback";
  it("returns code and realmId when state matches", () => {
    assert.deepEqual(parseCallback(`${base}?code=c1&state=s1&realmId=9130`, "s1"), {
      ok: true,
      code: "c1",
      realmId: "9130",
      state: "s1",
    });
  });
  it("rejects a state mismatch, an empty expected state, errors and missing params", () => {
    assert.deepEqual(parseCallback(`${base}?code=c&state=evil&realmId=1`, "s1"), {
      ok: false,
      error: "state_mismatch",
    });
    assert.deepEqual(parseCallback(`${base}?code=c&state=&realmId=1`, ""), {
      ok: false,
      error: "state_mismatch",
    });
    assert.deepEqual(parseCallback(`${base}?error=access_denied&state=s1`, "s1"), {
      ok: false,
      error: "access_denied",
    });
    assert.deepEqual(parseCallback(`${base}?state=s1&realmId=1`, "s1"), {
      ok: false,
      error: "missing_code_or_realm",
    });
  });
});

describe("token endpoint", () => {
  it("exchanges a code with Basic auth and a form body", async () => {
    const http = scriptedFetch([{ fixture: "token-exchange.json" }]);
    const tokens = await exchangeCode(cfg, "auth-code", "9130", {
      fetch: http.fetch,
      now: () => NOW,
    });
    const req = http.requests[0];
    assert.equal(req?.method, "POST");
    assert.equal(req?.url.toString(), INTUIT_TOKEN_ENDPOINT);
    assert.equal(req?.headers.authorization, `Basic ${btoa("test-client-id:test-client-secret")}`);
    assert.equal(req?.headers["content-type"], "application/x-www-form-urlencoded");
    const form = new URLSearchParams(req?.body);
    assert.equal(form.get("grant_type"), "authorization_code");
    assert.equal(form.get("code"), "auth-code");
    assert.equal(form.get("redirect_uri"), cfg.redirectUri);
    assert.deepEqual(tokens, {
      realmId: "9130",
      accessToken: "fixture-access-token-1",
      refreshToken: "fixture-refresh-token-1",
      accessTokenExpiresAt: NOW + 3600_000,
      refreshTokenExpiresAt: NOW + 8726400_000,
    });
  });

  it("refreshes with grant_type=refresh_token", async () => {
    const http = scriptedFetch([{ fixture: "token-refresh.json" }]);
    const t = await refreshTokens(
      cfg,
      { realmId: "9130", refreshToken: "old-refresh" },
      { fetch: http.fetch, now: () => NOW },
    );
    const form = new URLSearchParams(http.requests[0]?.body);
    assert.equal(form.get("grant_type"), "refresh_token");
    assert.equal(form.get("refresh_token"), "old-refresh");
    assert.equal(t.refreshToken, "fixture-refresh-token-2");
  });

  it("surfaces invalid_grant with the intuit_tid", async () => {
    const http = scriptedFetch([{ status: 400, fixture: "token-invalid-grant.json" }]);
    await assert.rejects(
      refreshTokens(cfg, { realmId: "1", refreshToken: "r" }, { fetch: http.fetch }),
      (e: unknown) =>
        e instanceof IntuitOAuthError &&
        e.status === 400 &&
        e.code === "invalid_grant" &&
        e.intuitTid === "fixture-tid",
    );
  });

  it("revokes with a JSON body", async () => {
    const http = scriptedFetch([{ status: 200 }]);
    await revokeToken(cfg, "refresh-to-revoke", { fetch: http.fetch });
    assert.equal(http.requests[0]?.url.toString(), INTUIT_REVOKE_ENDPOINT);
    assert.deepEqual(JSON.parse(http.requests[0]?.body ?? ""), { token: "refresh-to-revoke" });
    const failing = scriptedFetch([{ status: 400 }]);
    await assert.rejects(revokeToken(cfg, "x", { fetch: failing.fetch }), IntuitOAuthError);
  });
});

function memoryStore(initial: TokenSet | null): TokenStore & { saved: TokenSet[] } {
  let current = initial;
  const saved: TokenSet[] = [];
  return {
    saved,
    async load() {
      return current;
    },
    async save(t) {
      current = t;
      saved.push(t);
    },
  };
}

const stored: TokenSet = {
  realmId: "9130",
  accessToken: "stored-access",
  refreshToken: "stored-refresh",
  accessTokenExpiresAt: NOW + 30 * 60_000,
  refreshTokenExpiresAt: NOW + 50 * 86_400_000,
};

describe("createTokenManager", () => {
  it("uses the stored access token while it is fresh", async () => {
    const http = scriptedFetch([]);
    const tm = createTokenManager({
      config: cfg,
      store: memoryStore(stored),
      realmId: "9130",
      fetch: http.fetch,
      now: () => NOW,
    });
    assert.equal(await tm.getAccessToken(), "stored-access");
    assert.equal(http.requests.length, 0);
  });

  it("refreshes inside the skew window, persists the rotated refresh token, coalesces callers", async () => {
    const http = scriptedFetch([{ fixture: "token-refresh.json" }]);
    const store = memoryStore({ ...stored, accessTokenExpiresAt: NOW + 60_000 });
    const tm = createTokenManager({
      config: cfg,
      store,
      realmId: "9130",
      fetch: http.fetch,
      now: () => NOW,
    });
    const [a, b] = await Promise.all([tm.getAccessToken(), tm.getAccessToken()]);
    assert.equal(a, "fixture-access-token-2");
    assert.equal(b, "fixture-access-token-2");
    assert.equal(http.requests.length, 1);
    assert.equal(
      new URLSearchParams(http.requests[0]?.body).get("refresh_token"),
      "stored-refresh",
    );
    assert.equal(store.saved.length, 1);
    assert.equal(store.saved[0]?.refreshToken, "fixture-refresh-token-2");
  });

  it("asks for a reconnect when not connected, for another realm, or after refresh expiry", async () => {
    const http = scriptedFetch([]);
    const opts = { config: cfg, realmId: "9130", fetch: http.fetch, now: () => NOW };
    await assert.rejects(
      createTokenManager({ ...opts, store: memoryStore(null) }).getAccessToken(),
      /not connected/,
    );
    await assert.rejects(
      createTokenManager({
        ...opts,
        store: memoryStore({ ...stored, realmId: "other" }),
      }).getAccessToken(),
      /different QuickBooks company/,
    );
    await assert.rejects(
      createTokenManager({
        ...opts,
        store: memoryStore({
          ...stored,
          accessTokenExpiresAt: NOW - 1,
          refreshTokenExpiresAt: NOW - 1,
        }),
      }).getAccessToken(),
      /reconnect/,
    );
    assert.equal(http.requests.length, 0);
  });
});
