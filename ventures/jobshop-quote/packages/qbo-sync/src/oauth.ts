/**
 * Intuit OAuth 2.0 authorization-code flow helpers (fetch-based, Workers- and Node-compatible).
 *
 * Endpoints and parameter names follow Intuit's official Node OAuth client, intuit/oauth-jsclient
 * (src/OAuthClient.js): see the README's "Sources" section.
 */

export const INTUIT_AUTHORIZE_ENDPOINT = "https://appcenter.intuit.com/connect/oauth2";
export const INTUIT_TOKEN_ENDPOINT = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const INTUIT_REVOKE_ENDPOINT = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
export const QBO_ACCOUNTING_SCOPE = "com.intuit.quickbooks.accounting";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Owner-set secrets. Never hardcode: read them from Worker secrets / env at runtime. */
export interface IntuitOAuthConfig {
  clientId: string;
  clientSecret: string;
  /** Must exactly match a redirect URI registered on the Intuit app. */
  redirectUri: string;
}

/** What an app persists per connected company (encrypt the tokens at rest). */
export interface TokenSet {
  realmId: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  accessTokenExpiresAt: number;
  /** Epoch milliseconds, from x_refresh_token_expires_in. */
  refreshTokenExpiresAt: number;
}

export class IntuitOAuthError extends Error {
  override name = "IntuitOAuthError";
  readonly status: number;
  /** OAuth error code from the response body, e.g. "invalid_grant". */
  readonly code: string | undefined;
  readonly intuitTid: string | undefined;
  constructor(message: string, status: number, code?: string, intuitTid?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.intuitTid = intuitTid;
  }
}

export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  /** Unguessable per-request value; store it (e.g. in a signed cookie) and compare on callback. */
  state: string;
  scopes?: string[];
}): string {
  if (!params.state) throw new Error("state is required (CSRF protection)");
  const q = new URLSearchParams({
    client_id: params.clientId,
    response_type: "code",
    scope: (params.scopes ?? [QBO_ACCOUNTING_SCOPE]).join(" "),
    redirect_uri: params.redirectUri,
    state: params.state,
  });
  return `${INTUIT_AUTHORIZE_ENDPOINT}?${q.toString()}`;
}

export type CallbackResult =
  | { ok: true; code: string; realmId: string; state: string }
  | { ok: false; error: string; description?: string };

/** Parse the redirect back from Intuit and check `state`. Does not exchange the code. */
export function parseCallback(url: string | URL, expectedState: string): CallbackResult {
  const u = typeof url === "string" ? new URL(url) : url;
  const p = u.searchParams;
  const error = p.get("error");
  if (error) {
    const description = p.get("error_description") ?? undefined;
    return description === undefined ? { ok: false, error } : { ok: false, error, description };
  }
  const state = p.get("state") ?? "";
  if (!expectedState || !timingSafeEqual(state, expectedState)) {
    return { ok: false, error: "state_mismatch" };
  }
  const code = p.get("code");
  const realmId = p.get("realmId");
  if (!code || !realmId) return { ok: false, error: "missing_code_or_realm" };
  return { ok: true, code, realmId, state };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function basicAuth(cfg: IntuitOAuthConfig): string {
  return `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}`;
}

interface TokenResponseBody {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  x_refresh_token_expires_in?: number | string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(
  cfg: IntuitOAuthConfig,
  body: URLSearchParams,
  realmId: string,
  fetchFn: FetchLike,
  now: number,
): Promise<TokenSet> {
  const res = await fetchFn(INTUIT_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: basicAuth(cfg),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  const tid = res.headers.get("intuit_tid") ?? undefined;
  const json = (await res.json().catch(() => ({}))) as TokenResponseBody;
  if (!res.ok || !json.access_token || !json.refresh_token) {
    const code = json.error;
    throw new IntuitOAuthError(
      `Intuit token endpoint returned ${res.status}${code ? ` (${code})` : ""}`,
      res.status,
      code,
      tid,
    );
  }
  return {
    realmId,
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    accessTokenExpiresAt: now + Number(json.expires_in ?? 0) * 1000,
    refreshTokenExpiresAt: now + Number(json.x_refresh_token_expires_in ?? 0) * 1000,
  };
}

/** Exchange the authorization code from the callback for tokens. */
export function exchangeCode(
  cfg: IntuitOAuthConfig,
  code: string,
  realmId: string,
  opts: { fetch?: FetchLike; now?: () => number } = {},
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
  });
  return tokenRequest(cfg, body, realmId, opts.fetch ?? fetch, (opts.now ?? Date.now)());
}

/**
 * Get a new access token. Intuit may return a new refresh token: always persist the one returned
 * (Intuit's client README: previous refresh tokens expire 24 hours after a new one is issued).
 */
export function refreshTokens(
  cfg: IntuitOAuthConfig,
  current: Pick<TokenSet, "realmId" | "refreshToken">,
  opts: { fetch?: FetchLike; now?: () => number } = {},
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: current.refreshToken,
  });
  return tokenRequest(cfg, body, current.realmId, opts.fetch ?? fetch, (opts.now ?? Date.now)());
}

/** Revoke a refresh (or access) token, e.g. when the customer disconnects QuickBooks. */
export async function revokeToken(
  cfg: IntuitOAuthConfig,
  token: string,
  opts: { fetch?: FetchLike } = {},
): Promise<void> {
  const res = await (opts.fetch ?? fetch)(INTUIT_REVOKE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: basicAuth(cfg),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    throw new IntuitOAuthError(
      `Intuit revoke endpoint returned ${res.status}`,
      res.status,
      undefined,
      res.headers.get("intuit_tid") ?? undefined,
    );
  }
}

/** Where the app keeps a company's tokens (e.g. an encrypted D1 row keyed by org + realm). */
export interface TokenStore {
  load(): Promise<TokenSet | null>;
  save(tokens: TokenSet): Promise<void>;
}

export interface AccessTokenProvider {
  readonly realmId: string;
  /** A valid access token, refreshing first if it expires within the skew window. */
  getAccessToken(): Promise<string>;
  /** Refresh now (used after a 401) and return the new access token. */
  forceRefresh(): Promise<string>;
}

/**
 * Keeps one company's tokens fresh: refreshes ahead of expiry, persists every new token set,
 * and coalesces concurrent refreshes in this isolate into one request.
 */
export function createTokenManager(options: {
  config: IntuitOAuthConfig;
  store: TokenStore;
  realmId: string;
  fetch?: FetchLike;
  now?: () => number;
  /** Refresh this long before expiry. Default 5 minutes. */
  skewMs?: number;
}): AccessTokenProvider {
  const now = options.now ?? Date.now;
  const skew = options.skewMs ?? 5 * 60_000;
  let inflight: Promise<TokenSet> | null = null;

  async function loadOrThrow(): Promise<TokenSet> {
    const t = await options.store.load();
    if (!t) throw new IntuitOAuthError("QuickBooks is not connected for this company", 401);
    if (t.realmId !== options.realmId) {
      throw new IntuitOAuthError("stored tokens belong to a different QuickBooks company", 401);
    }
    return t;
  }

  function refresh(): Promise<TokenSet> {
    if (!inflight) {
      inflight = (async () => {
        const current = await loadOrThrow();
        if (current.refreshTokenExpiresAt <= now()) {
          throw new IntuitOAuthError("refresh token expired; reconnect QuickBooks", 401);
        }
        const next = await refreshTokens(options.config, current, {
          ...(options.fetch ? { fetch: options.fetch } : {}),
          now,
        });
        await options.store.save(next);
        return next;
      })().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  }

  return {
    realmId: options.realmId,
    async getAccessToken() {
      const t = await loadOrThrow();
      if (t.accessTokenExpiresAt - skew > now()) return t.accessToken;
      return (await refresh()).accessToken;
    },
    async forceRefresh() {
      return (await refresh()).accessToken;
    },
  };
}
