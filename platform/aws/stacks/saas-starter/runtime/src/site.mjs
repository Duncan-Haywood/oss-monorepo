// A static site as a starter product: the files a site builder wrote (Next.js `output: "export"`, Vite `dist`, plain
// HTML) served by the product Lambda, optionally behind a sign-in gate for a list of email addresses. It replaces
// Cloudflare Pages / Workers static assets, and Cloudflare Access for the private ones.
//
// Build: `node build.mjs site <name> <dir>` copies <dir> to dist/app-<name>/site beside this app's bundle.
// Config (module `vars`, read as env.VARS; nothing secret):
//   GATE_EMAILS  comma-separated addresses allowed in; empty or unset = public
//   ROBOTS       "noindex" adds X-Robots-Tag: noindex, nofollow to every response; any other value is sent as given
//   SPA          a file to serve for unknown paths (e.g. "index.html"); unset = the 404 page
//   NOT_FOUND    the 404 page (default "404.html"; a plain 404 when missing)
//
// The gate, without any call out of the VPC (the product Lambda has no internet route):
//   /auth/login     a page that signs in with Cognito's hosted sign-in (code + PKCE, the web client has no secret),
//                   then POSTs the ID token to /api/session;
//   /api/session    behind API Gateway's Cognito JWT authorizer, so the token's signature, issuer, audience and expiry
//                   are checked before this code runs; it then checks email_verified and the allowlist and sets a
//                   session cookie (HttpOnly, Secure, SameSite=Lax, __Host-, 12 hours) signed with HMAC-SHA256;
//   every other path  needs that cookie. The HMAC key is 32 random bytes kept in the product's own database
//                   (migration site/001_gate_key.sql), made on first use; deleting the row signs everyone out.
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const SESSION_SECONDS = 12 * 3600;
export const COOKIE = "__Host-gate";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json",
  ".map": "application/json", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".avif": "image/avif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".pdf": "application/pdf", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm",
  ".mp4": "video/mp4", ".webm": "video/webm", ".csv": "text/csv; charset=utf-8", ".md": "text/markdown; charset=utf-8",
};
// Hashed build output never changes under the same name.
const IMMUTABLE = /^\/(_next\/static|assets)\//;

const enc = new TextEncoder();
const b64u = (bytes) => Buffer.from(bytes).toString("base64url");

export function parseEmails(s) {
  return String(s || "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+$/.test(x));
}

/** The file for a URL path inside `root`, or null. Never leaves root. */
export async function resolveFile(root, pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return null; }
  if (p.includes("\0") || p.includes("\\")) return null;
  const rel = normalize(p).replace(/^[/]+/, "");
  const parts = rel.split(sep);
  if (parts.includes("..")) return null;
  // Host config files from other platforms (Cloudflare Pages' _headers/_redirects) and dotfiles are not content.
  if (parts.some((x) => x.startsWith(".")) || rel === "_headers" || rel === "_redirects") return null;
  const tries = p.endsWith("/") ? [join(rel, "index.html")] : [rel, `${rel}.html`, join(rel, "index.html")];
  for (const t of tries) {
    const full = join(root, t);
    if (!full.startsWith(root.endsWith(sep) ? root : root + sep) && full !== root) continue;
    try { const s = await stat(full); if (s.isFile()) return full; } catch { /* next */ }
  }
  return null;
}

async function hmacKey(raw) {
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signSession(raw, email, now = Date.now()) {
  const payload = b64u(enc.encode(JSON.stringify({ e: email, x: Math.floor(now / 1000) + SESSION_SECONDS })));
  const mac = b64u(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(raw), enc.encode(payload))));
  return `${payload}.${mac}`;
}
export async function verifySession(raw, value, allow, now = Date.now()) {
  const [payload, mac] = String(value || "").split(".");
  if (!payload || !mac) return null;
  let ok = false;
  try { ok = await crypto.subtle.verify("HMAC", await hmacKey(raw), Buffer.from(mac, "base64url"), enc.encode(payload)); } catch { return null; }
  if (!ok) return null;
  let s;
  try { s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
  if (!s || typeof s.e !== "string" || !(s.x > now / 1000)) return null;
  return allow.includes(s.e) ? s.e : null;          // removed from the list = out at the next request
}
const cookieOf = (request, name) => {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
};

/** The HMAC key from the product's database (made once, kept per container). `db` has pg's query(). */
export function dbKeySource(getDb) {
  let cached;
  return async (env) => {
    if (cached) return cached;
    const db = getDb(env);
    await db.query("INSERT INTO gate_key (id, key) VALUES (1, $1) ON CONFLICT (id) DO NOTHING", [Buffer.from(crypto.getRandomValues(new Uint8Array(32)))]);
    const { rows } = await db.query("SELECT key FROM gate_key WHERE id = 1");
    cached = new Uint8Array(rows[0].key);
    return cached;
  };
}

const LOGIN_JS = `
const box = document.getElementById("gate"), CFG = JSON.parse(box.dataset.cfg), redirect = location.origin + "/auth/login";
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
const say = (t, cls) => { const p = document.createElement("p"); p.textContent = t; if (cls) p.className = cls; box.replaceChildren(p); };
const safeNext = (n) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\\\") ? n : "/");
async function start() {
  const verifier = b64u(crypto.getRandomValues(new Uint8Array(32))), st = b64u(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem("gate", JSON.stringify({ verifier, st, next: safeNext(new URLSearchParams(location.search).get("next")) }));
  const challenge = b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  location.assign(CFG.domain + "/oauth2/authorize?" + new URLSearchParams({ response_type: "code", client_id: CFG.clientId, redirect_uri: redirect, scope: "openid email", code_challenge_method: "S256", code_challenge: challenge, state: st }));
}
async function finish(q) {
  const saved = JSON.parse(sessionStorage.getItem("gate") || "null");
  sessionStorage.removeItem("gate");
  if (!saved || q.get("state") !== saved.st) throw new Error("Sign-in did not match. Try again.");
  const t = await fetch(CFG.domain + "/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: CFG.clientId, code: q.get("code"), redirect_uri: redirect, code_verifier: saved.verifier }) });
  if (!t.ok) throw new Error("Sign-in failed (" + t.status + ").");
  const s = await fetch("/api/session", { method: "POST", headers: { authorization: "Bearer " + (await t.json()).id_token } });
  if (s.status === 403) throw new Error("This address is not on the list for this site.");
  if (!s.ok) throw new Error("Sign-in failed (" + s.status + ").");
  location.replace(saved.next);
}
const q = new URLSearchParams(location.search);
(q.get("code") ? finish(q) : start()).catch((e) => say(e.message, "err"));
`;
let loginHash;
export async function loginScriptHash() {
  loginHash ||= Buffer.from(await crypto.subtle.digest("SHA-256", enc.encode(LOGIN_JS))).toString("base64");
  return `'sha256-${loginHash}'`;
}
const attr = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
export function loginPage(domain, clientId) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Sign in</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem}.err{color:#b00020}</style></head><body><h1>Sign in</h1><div id="gate" data-cfg="${attr(JSON.stringify({ domain, clientId }))}"><p>Taking you to sign-in…</p></div><script type="module">${LOGIN_JS}</script></body></html>`;
}

export function makeSiteApp({ root = fileURLToPath(new URL("./site/", import.meta.url)), keySource = dbKeySource((env) => env.pg), now = Date.now } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const vars = env.VARS || {};
      const allow = parseEmails(vars.GATE_EMAILS);
      const gated = allow.length > 0;
      const base = { "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "x-frame-options": "DENY", "permissions-policy": "camera=(), microphone=(), geolocation=()", ...(vars.ROBOTS ? { "x-robots-tag": vars.ROBOTS === "noindex" ? "noindex, nofollow" : String(vars.ROBOTS) } : {}) };
      const reply = (body, status, headers = {}) => new Response(body, { status, headers: { ...base, ...headers } });
      if (url.pathname === "/healthz") return reply("ok\n", 200, { "content-type": "text/plain" });

      if (gated && url.pathname === "/auth/login" && request.method === "GET") {
        const a = env.AUTH || {};
        if (!a.domain || !a.webClientId) return reply("Sign-in is not configured.\n", 503, { "content-type": "text/plain" });
        return reply(loginPage(a.domain, a.webClientId), 200, {
          "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer",
          "content-security-policy": `default-src 'none'; script-src ${await loginScriptHash()}; style-src 'unsafe-inline'; connect-src 'self' ${a.domain}; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`,
        });
      }
      if (gated && url.pathname === "/api/session" && request.method === "POST") {
        const u = env.user;   // verified by the JWT authorizer
        const email = String(u?.email || "").toLowerCase();
        if (!u || String(u.email_verified) !== "true" || !allow.includes(email)) return reply('{"error":"not allowed"}', 403, { "content-type": "application/json" });
        const value = await signSession(await keySource(env), email, now());
        return reply('{"ok":true}', 200, { "content-type": "application/json", "cache-control": "no-store", "set-cookie": `${COOKIE}=${value}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax` });
      }
      if (gated && url.pathname === "/auth/logout") {
        return reply("Signed out.\n", 200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "set-cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
      }
      if (request.method !== "GET" && request.method !== "HEAD") return reply("method not allowed\n", 405, { "content-type": "text/plain", allow: "GET, HEAD" });
      if (gated) {
        const who = await verifySession(await keySource(env), cookieOf(request, COOKIE), allow, now());
        if (!who) return reply("", 302, { location: `/auth/login?next=${encodeURIComponent(url.pathname + url.search)}`, "cache-control": "no-store" });
      }

      let file = await resolveFile(root, url.pathname), status = 200;
      if (!file && vars.SPA) file = await resolveFile(root, "/" + vars.SPA);
      if (!file) { status = 404; file = await resolveFile(root, "/" + (vars.NOT_FOUND || "404.html")); }
      if (!file) return reply("not found\n", 404, { "content-type": "text/plain" });
      const body = await readFile(file);
      const type = TYPES[extname(file).toLowerCase()] || "application/octet-stream";
      const cache = gated ? "private, no-store" : IMMUTABLE.test(url.pathname) && status === 200 ? "public, max-age=31536000, immutable" : type.startsWith("text/html") ? "no-cache" : "public, max-age=3600";
      return reply(request.method === "HEAD" ? null : body, status, { "content-type": type, "cache-control": cache });
    },
  };
}

export default makeSiteApp();
