// Sales Agent M4c: OAuth 2.0 for Gmail and Microsoft 365 mailboxes (SASL XOAUTH2 over IMAP and SMTP). The deployer registers their
// own OAuth app and keeps the client id, secret and refresh token in their own environment; tokens go from here to the provider's
// token endpoint and the mail server, nowhere else. No dependencies. Endpoints are overridable so tests run against a local fake.
import { createHash, randomBytes } from "node:crypto";

export const PROVIDERS = {
  google: { auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", scope: "https://mail.google.com/", imap: "imap.gmail.com", smtp: "smtp.gmail.com", extra: { access_type: "offline", prompt: "consent" } },
  microsoft: { auth: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize", token: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token", scope: "offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send", imap: "outlook.office365.com", smtp: "smtp.office365.com", extra: {} },
};

const endpoint = (p, which, env) => (env[which === "token" ? "OAUTH_TOKEN_URL" : "OAUTH_AUTH_URL"] || PROVIDERS[p][which]).replace("{tenant}", env.OAUTH_TENANT || "common");

/** SASL XOAUTH2 initial response (base64 of "user=<u>\x01auth=Bearer <token>\x01\x01"). */
export const xoauth2 = (user, token) => Buffer.from(`user=${user}\x01auth=Bearer ${token}\x01\x01`).toString("base64");

/** True when the environment asks for OAuth instead of a password. */
export const oauthWanted = (env) => !!(env.OAUTH_PROVIDER || env.OAUTH_REFRESH_TOKEN);

/**
 * A function that returns a valid access token, refreshing with the refresh token when the cached one is within a minute of
 * expiry. Concurrent callers share one refresh. Errors carry the provider's words with every secret redacted.
 */
export function tokenProvider(env, { fetchImpl = fetch, now = Date.now } = {}) {
  const p = env.OAUTH_PROVIDER || "google";
  if (!PROVIDERS[p]) throw new Error(`OAUTH_PROVIDER must be ${Object.keys(PROVIDERS).join(" or ")}`);
  const missing = ["OAUTH_CLIENT_ID", "OAUTH_REFRESH_TOKEN"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`OAuth needs ${missing.join(", ")}`);
  const redact = (s) => [env.OAUTH_CLIENT_SECRET, env.OAUTH_REFRESH_TOKEN, cache?.token].filter(Boolean).reduce((t, v) => t.split(v).join("***"), String(s));
  let cache = null, inflight = null;
  async function refresh() {
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: env.OAUTH_REFRESH_TOKEN, client_id: env.OAUTH_CLIENT_ID, ...(env.OAUTH_CLIENT_SECRET ? { client_secret: env.OAUTH_CLIENT_SECRET } : {}) });
    const res = await fetchImpl(endpoint(p, "token", env), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) throw new Error(redact(`OAuth refresh failed (${res.status}): ${j.error || "no access_token"}${j.error_description ? " - " + String(j.error_description).slice(0, 160) : ""}`));
    cache = { token: j.access_token, exp: now() + Number(j.expires_in || 3600) * 1000 };
    // Some providers rotate the refresh token; keep the new one for this process (persisting it is the deployer's call).
    if (j.refresh_token && j.refresh_token !== env.OAUTH_REFRESH_TOKEN) env = { ...env, OAUTH_REFRESH_TOKEN: j.refresh_token };
    return cache.token;
  }
  return async () => {
    if (cache && cache.exp - now() > 60000) return cache.token;
    inflight ||= refresh().finally(() => { inflight = null; });
    return inflight;
  };
}

/** One-time setup helpers: authorization-code flow with PKCE on a loopback redirect, run by `node self-host/oauth-setup.mjs`. */
export const pkce = () => { const verifier = randomBytes(32).toString("base64url"); return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") }; };

export function authUrl(env, { redirect, state, challenge }) {
  const p = env.OAUTH_PROVIDER || "google", u = new URL(endpoint(p, "auth", env));
  const q = { client_id: env.OAUTH_CLIENT_ID, redirect_uri: redirect, response_type: "code", scope: PROVIDERS[p].scope, state, code_challenge: challenge, code_challenge_method: "S256", ...PROVIDERS[p].extra, ...(env.IMAP_USER ? { login_hint: env.IMAP_USER } : {}) };
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return u.toString();
}

export async function exchangeCode(env, { code, redirect, verifier }, fetchImpl = fetch) {
  const p = env.OAUTH_PROVIDER || "google";
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: env.OAUTH_CLIENT_ID, code_verifier: verifier, ...(env.OAUTH_CLIENT_SECRET ? { client_secret: env.OAUTH_CLIENT_SECRET } : {}) });
  const res = await fetchImpl(endpoint(p, "token", env), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.refresh_token) throw new Error(`code exchange failed (${res.status}): ${j.error || "no refresh_token returned"}${j.error_description ? " - " + String(j.error_description).slice(0, 160) : ""}`);
  return j.refresh_token;
}
