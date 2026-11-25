// Authentication for a single owner.
//
// - The iPhone uses a static bearer token (DEVICE_TOKEN) for /v1/device/*.
// - Chat clients reach /mcp and /api/* with either a static bearer token
//   (API_TOKEN: Custom GPT Actions "API key", scripts) or an OAuth 2.1 access
//   token from the small authorization server below (ChatGPT developer-mode
//   apps and Claude custom connectors discover it through RFC 9728 protected
//   resource metadata and register with RFC 7591 dynamic client registration).
// The authorization page asks for OWNER_PASSWORD; there are no other users.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// SHA-256 is only for the server's own 256-bit random tokens (codes, access and refresh tokens), looked up by hash.
const shaHex = (s) => createHash("sha256").update(String(s)).digest("hex");
const b64url = (buf) => Buffer.from(buf).toString("base64url");

export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  // Only the length can leak; the comparison itself is constant-time.
  if (x.length !== y.length) {
    timingSafeEqual(x, x);
    return false;
  }
  return timingSafeEqual(x, y);
}

// Client secrets can be chosen by hand (OAUTH_STATIC_CLIENT), so they are stored with a salted, memory-hard KDF.
const SCRYPT_PREFIX = "scrypt:";
export function hashClientSecret(secret) {
  const salt = randomBytes(16);
  return `${SCRYPT_PREFIX}${b64url(salt)}:${b64url(scryptSync(String(secret), salt, 32))}`;
}

/** Checks a presented client secret against a stored hash: scrypt, or a SHA-256 hex hash stored by an earlier version. */
export function verifyClientSecret(secret, stored) {
  if (typeof secret !== "string" || !secret || typeof stored !== "string") return false;
  if (stored.startsWith(SCRYPT_PREFIX)) {
    const [salt, hash] = stored.slice(SCRYPT_PREFIX.length).split(":");
    if (!salt || !hash) return false;
    const want = Buffer.from(hash, "base64url");
    const got = scryptSync(secret, Buffer.from(salt, "base64url"), want.length || 32);
    return want.length === got.length && timingSafeEqual(got, want);
  }
  return safeEqual(shaHex(secret), stored);
}

const ACCESS_TTL_S = 3600;
const REFRESH_TTL_S = 90 * 86400;
const CODE_TTL_S = 600;

export const DEFAULT_REDIRECT_PREFIXES = [
  "https://chatgpt.com/",
  "https://chat.openai.com/",
  "https://claude.ai/",
  "https://claude.com/",
  "http://localhost:",
  "http://127.0.0.1:",
];

export class Auth {
  constructor(store, { baseUrl, ownerPassword = null, apiTokens = [], deviceTokens = [], redirectPrefixes = DEFAULT_REDIRECT_PREFIXES }) {
    this.store = store;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.ownerPassword = ownerPassword;
    this.apiTokens = apiTokens.filter(Boolean);
    this.deviceTokens = deviceTokens.filter(Boolean);
    this.redirectPrefixes = redirectPrefixes;
    this.failures = [];
  }

  // ---------- metadata ----------
  resourceMetadata() {
    return {
      resource: `${this.baseUrl}/mcp`,
      authorization_servers: [this.baseUrl],
      scopes_supported: ["nutrition"],
      bearer_methods_supported: ["header"],
      resource_name: "Photo Nutrition Agent",
    };
  }

  serverMetadata() {
    return {
      issuer: this.baseUrl,
      authorization_endpoint: `${this.baseUrl}/authorize`,
      token_endpoint: `${this.baseUrl}/token`,
      registration_endpoint: `${this.baseUrl}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      scopes_supported: ["nutrition"],
    };
  }

  wwwAuthenticate() {
    return `Bearer resource_metadata="${this.baseUrl}/.well-known/oauth-protected-resource"`;
  }

  // ---------- bearer checks ----------
  checkDevice(header) {
    const tok = bearer(header);
    return !!tok && this.deviceTokens.some((t) => safeEqual(tok, t));
  }

  checkApi(header) {
    const tok = bearer(header);
    if (!tok) return false;
    if (this.apiTokens.some((t) => safeEqual(tok, t))) return true;
    const row = this.store.db.prepare("SELECT * FROM oauth_tokens WHERE token_hash = ? AND kind = 'access'").get(shaHex(tok));
    return !!row && new Date(row.expires_at) > this.store.now();
  }

  // ---------- registration ----------
  redirectAllowed(uri) {
    try {
      const u = new URL(uri);
      if (u.protocol !== "https:" && !(u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))) return false;
    } catch {
      return false;
    }
    return this.redirectPrefixes.some((p) => uri.startsWith(p));
  }

  register(body) {
    const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.map(String) : [];
    if (!uris.length) throw oauthError("invalid_redirect_uri", "redirect_uris is required");
    const bad = uris.filter((u) => !this.redirectAllowed(u));
    if (bad.length) throw oauthError("invalid_redirect_uri", `redirect URI not allowed: ${bad.join(", ")} (set OAUTH_REDIRECT_PREFIXES)`);
    const method = body.token_endpoint_auth_method || "none";
    if (!["none", "client_secret_post", "client_secret_basic"].includes(method)) throw oauthError("invalid_client_metadata", "unsupported token_endpoint_auth_method");
    const client = {
      client_id: `cl_${b64url(randomBytes(12))}`,
      client_name: String(body.client_name || "client").slice(0, 100),
      redirect_uris: uris,
      token_endpoint_auth_method: method,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_id_issued_at: Math.floor(this.store.now().getTime() / 1000),
    };
    let secret = null;
    if (method !== "none") secret = b64url(randomBytes(24));
    this.store.db
      .prepare("INSERT INTO oauth_clients(client_id, data_json, created_at) VALUES (?, ?, ?)")
      .run(client.client_id, JSON.stringify({ ...client, secret_hash: secret ? hashClientSecret(secret) : null }), this.store.nowIso());
    return secret ? { ...client, client_secret: secret, client_secret_expires_at: 0 } : client;
  }

  /** A client configured by hand (e.g. a Custom GPT's OAuth settings) via OAUTH_STATIC_CLIENT=id:secret:redirectprefix. */
  addStaticClient(id, secret, redirectPrefix) {
    const existing = this.client(id);
    if (existing) return;
    this.store.db
      .prepare("INSERT INTO oauth_clients(client_id, data_json, created_at) VALUES (?, ?, ?)")
      .run(id, JSON.stringify({ client_id: id, client_name: "static", redirect_prefix: redirectPrefix, redirect_uris: [], token_endpoint_auth_method: "client_secret_post", secret_hash: hashClientSecret(secret) }), this.store.nowIso());
  }

  client(id) {
    const row = this.store.db.prepare("SELECT data_json FROM oauth_clients WHERE client_id = ?").get(String(id || ""));
    return row ? JSON.parse(row.data_json) : null;
  }

  clientRedirectOk(client, uri) {
    if (client.redirect_uris?.includes(uri)) return true;
    return !!client.redirect_prefix && String(uri).startsWith(client.redirect_prefix);
  }

  // ---------- authorize ----------
  validateAuthorizeParams(q) {
    if (q.response_type !== "code") throw oauthError("unsupported_response_type", "response_type must be code");
    const client = this.client(q.client_id);
    if (!client) throw oauthError("invalid_client", "unknown client_id");
    if (!this.clientRedirectOk(client, q.redirect_uri)) throw oauthError("invalid_request", "redirect_uri does not match the registered client");
    const publicClient = client.token_endpoint_auth_method === "none";
    if (publicClient && (!q.code_challenge || q.code_challenge_method !== "S256")) throw oauthError("invalid_request", "PKCE with S256 is required");
    return client;
  }

  lockedOut() {
    const cutoff = this.store.now().getTime() - 15 * 60000;
    this.failures = this.failures.filter((t) => t > cutoff);
    return this.failures.length >= 10;
  }

  /** Returns the redirect URL (with code or error). Throws for errors that must not redirect. */
  approve(q, password) {
    const client = this.validateAuthorizeParams(q);
    if (!this.ownerPassword) throw oauthError("server_error", "OWNER_PASSWORD is not set on the server");
    if (this.lockedOut()) throw oauthError("temporarily_unavailable", "too many wrong passwords; try again in 15 minutes");
    if (!safeEqual(String(password || ""), this.ownerPassword)) {
      this.failures.push(this.store.now().getTime());
      throw oauthError("access_denied", "wrong password");
    }
    const code = b64url(randomBytes(24));
    const exp = new Date(this.store.now().getTime() + CODE_TTL_S * 1000).toISOString();
    this.store.db
      .prepare("INSERT INTO oauth_codes(code_hash, data_json, expires_at) VALUES (?, ?, ?)")
      .run(shaHex(code), JSON.stringify({ client_id: client.client_id, redirect_uri: q.redirect_uri, code_challenge: q.code_challenge || null, scope: q.scope || "nutrition", resource: q.resource || null }), exp);
    const u = new URL(q.redirect_uri);
    u.searchParams.set("code", code);
    if (q.state) u.searchParams.set("state", q.state);
    return u.toString();
  }

  // ---------- token ----------
  authenticateClient(body, authHeader) {
    let id = body.client_id;
    let secret = body.client_secret;
    if (authHeader && /^Basic /i.test(authHeader)) {
      const [i, s] = Buffer.from(authHeader.slice(6), "base64").toString().split(":");
      id = decodeURIComponent(i || "");
      secret = decodeURIComponent(s || "");
    }
    const client = this.client(id);
    if (!client) throw oauthError("invalid_client", "unknown client", 401);
    if (client.secret_hash) {
      if (!verifyClientSecret(secret, client.secret_hash)) throw oauthError("invalid_client", "bad client secret", 401);
      if (!client.secret_hash.startsWith(SCRYPT_PREFIX)) {
        // Upgrade a hash stored by an earlier version now that the secret is known to be right.
        client.secret_hash = hashClientSecret(secret);
        this.store.db.prepare("UPDATE oauth_clients SET data_json = ? WHERE client_id = ?").run(JSON.stringify(client), client.client_id);
      }
    }
    return client;
  }

  token(body, authHeader) {
    const client = this.authenticateClient(body, authHeader);
    if (body.grant_type === "authorization_code") {
      const h = shaHex(body.code || "");
      const row = this.store.db.prepare("SELECT * FROM oauth_codes WHERE code_hash = ?").get(h);
      this.store.db.prepare("DELETE FROM oauth_codes WHERE code_hash = ?").run(h); // single use
      if (!row || new Date(row.expires_at) <= this.store.now()) throw oauthError("invalid_grant", "code is invalid or expired");
      const data = JSON.parse(row.data_json);
      if (data.client_id !== client.client_id) throw oauthError("invalid_grant", "code was issued to another client");
      if (body.redirect_uri && body.redirect_uri !== data.redirect_uri) throw oauthError("invalid_grant", "redirect_uri mismatch");
      if (data.code_challenge) {
        const v = String(body.code_verifier || "");
        if (!v || b64url(createHash("sha256").update(v).digest()) !== data.code_challenge) throw oauthError("invalid_grant", "PKCE verification failed");
      } else if (!client.secret_hash) throw oauthError("invalid_grant", "public clients must use PKCE");
      return this.issue(client.client_id, data.scope);
    }
    if (body.grant_type === "refresh_token") {
      const h = shaHex(body.refresh_token || "");
      const row = this.store.db.prepare("SELECT * FROM oauth_tokens WHERE token_hash = ? AND kind = 'refresh'").get(h);
      if (!row || new Date(row.expires_at) <= this.store.now()) throw oauthError("invalid_grant", "refresh token is invalid or expired");
      const data = JSON.parse(row.data_json);
      if (data.client_id !== client.client_id) throw oauthError("invalid_grant", "refresh token belongs to another client");
      this.store.db.prepare("DELETE FROM oauth_tokens WHERE token_hash = ?").run(h); // rotate
      return this.issue(client.client_id, data.scope);
    }
    throw oauthError("unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
  }

  issue(clientId, scope) {
    const access = b64url(randomBytes(32));
    const refresh = b64url(randomBytes(32));
    const now = this.store.now().getTime();
    const ins = this.store.db.prepare("INSERT INTO oauth_tokens(token_hash, kind, data_json, expires_at) VALUES (?, ?, ?, ?)");
    ins.run(shaHex(access), "access", JSON.stringify({ client_id: clientId, scope }), new Date(now + ACCESS_TTL_S * 1000).toISOString());
    ins.run(shaHex(refresh), "refresh", JSON.stringify({ client_id: clientId, scope }), new Date(now + REFRESH_TTL_S * 1000).toISOString());
    this.store.db.prepare("DELETE FROM oauth_tokens WHERE expires_at <= ?").run(this.store.nowIso());
    return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope };
  }

  revokeAll() {
    this.store.db.exec("DELETE FROM oauth_tokens; DELETE FROM oauth_codes;");
  }
}

function bearer(header) {
  const m = /^Bearer\s+(\S.*)$/i.exec(header || "");
  return m ? m[1].trim() : null;
}

export function oauthError(error, description, status = 400) {
  return Object.assign(new Error(description), { protocolError: { error, error_description: description }, status });
}

export function authorizePage(q, message = "") {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const hidden = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"]
    .filter((k) => q[k] != null)
    .map((k) => `<input type="hidden" name="${k}" value="${esc(q[k])}">`)
    .join("");
  let host = "";
  try {
    host = new URL(q.redirect_uri).host;
  } catch {
    /* validated elsewhere */
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize access</title>
<style>body{font:16px system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;color:#1b1b1b;background:#fafafa}input[type=password]{width:100%;padding:.6rem;font-size:1rem;box-sizing:border-box}button{margin-top:1rem;padding:.6rem 1.2rem;font-size:1rem}.err{color:#a00}</style></head>
<body><h1>Photo Nutrition Agent</h1><p><strong>${esc(host)}</strong> is asking to read and change your nutrition records.</p>
${message ? `<p class="err">${esc(message)}</p>` : ""}
<form method="post" action="/authorize">${hidden}<label for="pw">Owner password</label><input id="pw" type="password" name="password" autocomplete="current-password" required autofocus><button type="submit">Allow</button></form></body></html>`;
}
