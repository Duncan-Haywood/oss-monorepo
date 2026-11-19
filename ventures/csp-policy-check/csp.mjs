// Content-Security-Policy checker: parse a policy the way a browser does,
// answer "would this load or run?" with the W3C CSP Level 3 algorithms, and
// list the weaknesses a strict-CSP review looks for.
//
// Spec sources (README, "Spec sources"):
//   W3C, Content Security Policy Level 3 (Working Draft), https://www.w3.org/TR/CSP3/
//     section 2.2.1  parse a serialized CSP            -> parsePolicy
//     section 2.3.1  source expression grammar          -> classifySource
//     section 6.6.x  pre-request / inline checks        -> checkFetch, checkInline, checkEval
//     section 6.7.2  URL matching algorithms            -> urlMatchesExpression and helpers
//     section 6.8    effective directive + fallback     -> FALLBACK, effectiveList
//   L. Weichselbaum, M. Spagnuolo, S. Lekies, A. Janc, "CSP Is Dead, Long Live
//   CSP! On the Insecurity of Whitelists and the Future of Content Security
//   Policy", ACM CCS 2016 -> the strict-policy advice in lint().
//
// Pure functions, no DOM, no network. Hashing uses globalThis.crypto.subtle
// (browsers and Node 20+), so checkInline is async.

const KEYWORDS = new Set([
  "'self'", "'none'", "'unsafe-inline'", "'unsafe-eval'", "'strict-dynamic'",
  "'unsafe-hashes'", "'report-sample'", "'unsafe-allow-redirects'",
  "'wasm-unsafe-eval'", "'inline-speculation-rules'",
]);

// Directives defined by CSP3 and the specs it points to (Upgrade Insecure
// Requests, Trusted Types, Fenced Frames, Mixed Content), with what each is.
export const DIRECTIVES = {
  "default-src": "fallback for the fetch directives",
  "child-src": "frames and workers (fallback for frame-src and worker-src)",
  "connect-src": "fetch, XHR, WebSocket, EventSource, sendBeacon",
  "font-src": "fonts",
  "frame-src": "iframes",
  "img-src": "images and favicons",
  "manifest-src": "web app manifests",
  "media-src": "audio, video, text tracks",
  "object-src": "<object> and <embed> plugins",
  "script-src": "scripts (fallback for script-src-elem and script-src-attr, and eval)",
  "script-src-elem": "<script> elements",
  "script-src-attr": "inline event handlers such as onclick",
  "style-src": "stylesheets (fallback for style-src-elem and style-src-attr)",
  "style-src-elem": "<style> and <link rel=stylesheet>",
  "style-src-attr": "style= attributes",
  "worker-src": "Worker, SharedWorker, ServiceWorker scripts",
  "base-uri": "<base href>",
  "sandbox": "sandbox flags for the page",
  "form-action": "form submission targets",
  "frame-ancestors": "who may frame this page",
  "report-to": "reporting endpoint group",
  "webrtc": "WebRTC connections ('allow' or 'block')",
  "upgrade-insecure-requests": "rewrite http: subresource URLs to https:",
  "require-trusted-types-for": "Trusted Types enforcement for DOM sinks",
  "trusted-types": "allowed Trusted Types policy names",
  "fenced-frame-src": "fenced frames",
};

// Names browsers once shipped and have since dropped or deprecated.
export const DEPRECATED = {
  "report-uri": "deprecated in CSP3 in favour of report-to; still widely honoured, so keeping both is common",
  "block-all-mixed-content": "obsolete: browsers now block or upgrade mixed content by default",
  "plugin-types": "removed from CSP3 and from browsers; use object-src 'none'",
  "prefetch-src": "removed from CSP3; browsers no longer enforce it",
  "navigate-to": "removed from CSP3 before any browser shipped it",
  "referrer": "removed; use the Referrer-Policy header",
  "reflected-xss": "removed; never enforced by current browsers",
  "disown-opener": "never shipped; use Cross-Origin-Opener-Policy",
  "require-sri-for": "never shipped by default in browsers",
};

// CSP3 section 6.8.3 / 6.8.4: for each effective directive, the directives a
// browser consults in order. The first one present in the policy decides.
export const FALLBACK = {
  "script-src-elem": ["script-src-elem", "script-src", "default-src"],
  "script-src-attr": ["script-src-attr", "script-src", "default-src"],
  "script-src": ["script-src", "default-src"],
  "style-src-elem": ["style-src-elem", "style-src", "default-src"],
  "style-src-attr": ["style-src-attr", "style-src", "default-src"],
  "worker-src": ["worker-src", "child-src", "script-src", "default-src"],
  "frame-src": ["frame-src", "child-src", "default-src"],
  "child-src": ["child-src", "default-src"],
  "connect-src": ["connect-src", "default-src"],
  "manifest-src": ["manifest-src", "default-src"],
  "object-src": ["object-src", "default-src"],
  "img-src": ["img-src", "default-src"],
  "media-src": ["media-src", "default-src"],
  "font-src": ["font-src", "default-src"],
  "fenced-frame-src": ["fenced-frame-src", "frame-src", "child-src", "default-src"],
  // No fallback to default-src (section 6.3): absent means unrestricted.
  "base-uri": ["base-uri"],
  "form-action": ["form-action"],
  "frame-ancestors": ["frame-ancestors"],
};

// What a page loads, mapped to the effective directive that governs it.
export const RESOURCE_TYPES = {
  script: "script-src-elem",
  style: "style-src-elem",
  image: "img-src",
  font: "font-src",
  connect: "connect-src",
  frame: "frame-src",
  worker: "worker-src",
  media: "media-src",
  object: "object-src",
  manifest: "manifest-src",
  form: "form-action",
  base: "base-uri",
};

const own = (obj, k) => Object.hasOwn(obj, k);
const ASCII_WS = /[\t\n\f\r ]+/;
const DIRECTIVE_NAME = /^[A-Za-z0-9-]+$/;
const B64 = "[A-Za-z0-9+/_-]+={0,2}";
const NONCE_RE = new RegExp(`^'nonce-(${B64})'$`, "i");
const HASH_RE = new RegExp(`^'(sha256|sha384|sha512)-(${B64})'$`, "i");
const SCHEME_RE = /^([A-Za-z][A-Za-z0-9+.-]*):$/;
// host-source = [ scheme-part "://" ] host-part [ ":" port-part ] [ path-part ]
const HOST_RE = /^(?:([A-Za-z][A-Za-z0-9+.-]*):\/\/)?(\*|(?:\*\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)(?::(\*|[0-9]+))?(\/[^,;]*)?$/;

/** Strip a pasted "Content-Security-Policy:" prefix or a <meta> tag. */
export function extractPolicyText(input) {
  let s = String(input ?? "").trim();
  const meta = s.match(/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy(?:-report-only)?["']?[^>]*>/i);
  if (meta) {
    const c = meta[0].match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    return { text: c ? (c[1] ?? c[2]).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&") : "", delivery: "meta", reportOnly: /report-only/i.test(meta[0]) };
  }
  const head = s.match(/^content-security-policy(-report-only)?\s*:\s*/i);
  if (head) return { text: s.slice(head[0].length), delivery: "header", reportOnly: Boolean(head[1]) };
  return { text: s, delivery: null, reportOnly: false };
}

/**
 * CSP3 section 2.2.1, applied to each comma-separated policy (a header line
 * may carry several, and each is enforced on its own: section 2.2.2).
 * Returns { policies: [{ directives: Map(name -> tokens), order, duplicates, invalidNames, raw }] }.
 */
export function parsePolicyList(text) {
  const parts = String(text ?? "").split(",");
  return parts.map(parsePolicy).filter((p) => p.order.length || p.duplicates.length || p.invalidNames.length);
}

export function parsePolicy(text) {
  const directives = new Map();
  const order = [];
  const duplicates = [];
  const invalidNames = [];
  for (const token of String(text ?? "").split(";")) {
    const t = token.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
    if (!t) continue;
    const [rawName, ...value] = t.split(ASCII_WS);
    if (!DIRECTIVE_NAME.test(rawName)) { invalidNames.push(rawName); continue; }
    const name = rawName.toLowerCase();
    if (directives.has(name)) { duplicates.push(name); continue; }
    directives.set(name, value);
    order.push(name);
  }
  return { directives, order, duplicates, invalidNames, raw: String(text ?? "").trim() };
}

/** Kind of one source expression (CSP3 section 2.3.1). */
export function classifySource(expr) {
  const lower = expr.toLowerCase();
  if (expr === "*") return { kind: "wildcard" };
  if (KEYWORDS.has(lower)) return { kind: "keyword", keyword: lower };
  let m = expr.match(NONCE_RE);
  if (m) return { kind: "nonce", value: m[1] };
  m = expr.match(HASH_RE);
  if (m) return { kind: "hash", alg: m[1].toLowerCase(), value: m[2] };
  m = expr.match(SCHEME_RE);
  if (m) return { kind: "scheme", scheme: m[1].toLowerCase() };
  m = expr.match(HOST_RE);
  if (m) return { kind: "host", scheme: m[1] ? m[1].toLowerCase() : null, host: m[2].toLowerCase(), port: m[3] ?? null, path: m[4] ?? null };
  if (/^'.*'$/.test(expr)) return { kind: "unknown-keyword" };
  return { kind: "invalid" };
}

/** The source list a browser uses for an effective directive, or null (unrestricted). */
export function effectiveList(policy, effective) {
  for (const name of own(FALLBACK, effective) ? FALLBACK[effective] : [effective]) {
    if (policy.directives.has(name)) return { from: name, list: policy.directives.get(name) };
  }
  return null;
}

const DEFAULT_PORT = { http: 80, https: 443, ws: 80, wss: 443, ftp: 21 };
const defaultPort = (scheme) => (Object.hasOwn(DEFAULT_PORT, scheme) ? DEFAULT_PORT[scheme] : null);
const HTTPS_SCHEMES = new Set(["http", "https"]);

// CSP3 section 6.7.2.7 scheme-part match.
export function schemePartMatch(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  return a === b || (a === "http" && b === "https") || (a === "ws" && (b === "wss" || b === "http" || b === "https")) || (a === "wss" && b === "https");
}

// CSP3 section 6.7.2.8 host-part match.
export function hostPartMatch(pattern, host) {
  host = host.toLowerCase();
  if (pattern.startsWith("*")) return host.endsWith(pattern.slice(1));
  return pattern === host;
}

const portOf = (u) => (u.port === "" ? null : Number(u.port));
const schemeOf = (u) => u.protocol.slice(0, -1).toLowerCase();

// CSP3 section 6.7.2.9 port-part match. `url.port` is "" when the URL used
// its scheme's default port (WHATWG URL parsing drops it).
export function portPartMatch(portPart, url) {
  const urlPort = portOf(url);
  if (portPart === null) return urlPort === null;
  if (portPart === "*") return true;
  const n = Number(portPart);
  if (urlPort !== null) return n === urlPort;
  return defaultPort(schemeOf(url)) === n;
}

// CSP3 section 6.7.2.10 path-part match.
export function pathPartMatch(pathA, pathB) {
  if (!pathA) return true;
  if (pathA === "/" && pathB === "") return true;
  const exact = !pathA.endsWith("/");
  const a = pathA.split("/");
  const b = pathB.split("/");
  if (a.length > b.length) return false;
  if (exact && a.length !== b.length) return false;
  if (!exact) a.pop();
  const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
  return a.every((piece, i) => dec(piece) === dec(b[i]));
}

/**
 * CSP3 section 6.7.2.6: does `url` (a URL object) match one expression,
 * for a page at `origin` (a URL object)? `redirected` skips the path check
 * (section 6.7.2.6 step 4.5: paths are ignored after a redirect).
 */
export function urlMatchesExpression(url, expr, origin, redirected = false) {
  const s = classifySource(expr);
  const scheme = schemeOf(url);
  if (s.kind === "wildcard") return HTTPS_SCHEMES.has(scheme) || scheme === schemeOf(origin);
  if (s.kind === "scheme") return schemePartMatch(s.scheme, scheme);
  if (s.kind === "host") {
    if (!url.hostname) return false;
    if (s.scheme === null ? !schemePartMatch(schemeOf(origin), scheme) : !schemePartMatch(s.scheme, scheme)) return false;
    if (!hostPartMatch(s.host, url.hostname)) return false;
    if (!portPartMatch(s.port, url)) return false;
    if (s.path !== null && !redirected && !pathPartMatch(s.path, url.pathname)) return false;
    return true;
  }
  if (s.kind === "keyword" && s.keyword === "'self'") {
    if (url.origin === origin.origin && url.origin !== "null") return true;
    // 'self' also allows the secure upgrade of the page's own host.
    const sameHost = url.hostname === origin.hostname && url.hostname !== "";
    const p1 = portOf(url) ?? defaultPort(scheme);
    const p2 = portOf(origin) ?? defaultPort(schemeOf(origin));
    const os = schemeOf(origin);
    const portsOk = p1 === p2 || (portOf(url) === null && portOf(origin) === null);
    return sameHost && portsOk && (scheme === "https" || scheme === "wss" || (os === "http" && (scheme === "http" || scheme === "ws")));
  }
  return false;
}

/** CSP3 section 6.7.2.5: does a URL match a source list? Returns the matching expression or null. */
export function urlMatchesList(url, list, origin, redirected = false) {
  if (list.length === 0) return null;
  if (list.length === 1 && list[0].toLowerCase() === "'none'") return null;
  for (const expr of list) if (urlMatchesExpression(url, expr, origin, redirected)) return expr;
  return null;
}

const has = (list, kw) => list.some((e) => e.toLowerCase() === kw);
const nonces = (list) => list.map(classifySource).filter((s) => s.kind === "nonce").map((s) => s.value);
const hashes = (list) => list.map(classifySource).filter((s) => s.kind === "hash");

// CSP3 section 6.7.3.3: does a list allow all inline behaviour for this type?
export function allowsAllInline(list, type) {
  const scripty = type === "script" || type === "script attribute" || type === "navigation";
  let allowAll = false;
  for (const e of list) {
    const s = classifySource(e);
    if (s.kind === "nonce" || s.kind === "hash") return false;
    if (scripty && s.kind === "keyword" && s.keyword === "'strict-dynamic'") return false;
    if (s.kind === "keyword" && s.keyword === "'unsafe-inline'") allowAll = true;
  }
  return allowAll;
}

function parseUrl(u, base) {
  try { return new URL(u, base); } catch { return null; }
}

function decision(policies, perPolicy) {
  const results = policies.map(perPolicy);
  return { allowed: results.every((r) => r.allowed), results };
}

/**
 * Would a request for `url` of `type` (a RESOURCE_TYPES key) be allowed?
 * options: { origin, nonce, parserInserted (default true), redirected }.
 * Every policy in `policies` must allow it (CSP3 section 2.2.2).
 */
export function checkFetch(policies, type, url, options = {}) {
  const effective = own(RESOURCE_TYPES, type) ? RESOURCE_TYPES[type] : null;
  if (!effective) throw new Error(`unknown resource type: ${type}`);
  const origin = parseUrl(options.origin || "https://example.com/");
  if (!origin) throw new Error("page origin is not a URL");
  const target = parseUrl(url, origin);
  if (!target) throw new Error("resource URL is not a URL");
  const parserInserted = options.parserInserted !== false;
  return decision(policies, (policy) => {
    const eff = effectiveList(policy, effective);
    if (!eff) return { allowed: true, directive: null, why: `no ${FALLBACK[effective].join(" / ")} in this policy, so nothing restricts it` };
    const { from, list } = eff;
    const scriptish = effective === "script-src-elem" || (effective === "worker-src" && from.startsWith("script-src"));
    if (scriptish) {
      // Script pre-request check (CSP3 section 6.6.1.1 via script-src-elem).
      if (options.nonce && nonces(list).includes(options.nonce)) return { allowed: true, directive: from, why: `the element's nonce matches 'nonce-${options.nonce}'` };
      if (has(list, "'strict-dynamic'")) {
        return parserInserted
          ? { allowed: false, directive: from, why: `${from} has 'strict-dynamic', which ignores host and scheme sources; a parser-inserted <script> needs a matching nonce or hash` }
          : { allowed: true, directive: from, why: `'strict-dynamic' trusts scripts that an already-trusted script creates (not parser-inserted)` };
      }
    }
    const hit = urlMatchesList(target, list, origin, options.redirected);
    return hit
      ? { allowed: true, directive: from, why: `${target.href} matches ${hit} in ${from}` }
      : { allowed: false, directive: from, why: `${target.href} matches no source in ${from} (${list.join(" ") || "an empty list, which blocks everything"})` };
  });
}

async function digest(alg, text) {
  const name = alg === "sha384" ? "SHA-384" : alg === "sha512" ? "SHA-512" : "SHA-256";
  const buf = await globalThis.crypto.subtle.digest(name, new TextEncoder().encode(text));
  let bin = "";
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Base64 of the SHA-256 of inline text, the value for a 'sha256-...' source. */
export async function inlineHash(text, alg = "sha256") {
  return `'${alg}-${await digest(alg, text)}'`;
}

// CSP3 compares hash values after mapping base64url to base64.
const normB64 = (v) => v.replace(/-/g, "+").replace(/_/g, "/");

/**
 * Would inline content run? kind: "script" (<script> body), "handler"
 * (onclick= attribute value), "style" (<style> body), "style-attr".
 * options: { nonce }. CSP3 sections 6.7.3.1-6.7.3.3.
 */
export async function checkInline(policies, kind, content, options = {}) {
  const KINDS = { script: "script-src-elem", handler: "script-src-attr", style: "style-src-elem", "style-attr": "style-src-attr" };
  const effective = own(KINDS, kind) ? KINDS[kind] : null;
  if (!effective) throw new Error(`unknown inline kind: ${kind}`);
  const type = kind === "script" ? "script" : kind === "handler" ? "script attribute" : kind === "style" ? "style" : "style attribute";
  const out = [];
  for (const policy of policies) {
    const eff = effectiveList(policy, effective);
    if (!eff) { out.push({ allowed: true, directive: null, why: `no ${FALLBACK[effective].join(" / ")} in this policy` }); continue; }
    const { from, list } = eff;
    if (allowsAllInline(list, type)) { out.push({ allowed: true, directive: from, why: `${from} has 'unsafe-inline' and no nonce, hash or 'strict-dynamic' to switch it off` }); continue; }
    const elementKind = kind === "script" || kind === "style";
    if (elementKind && options.nonce && nonces(list).includes(options.nonce)) { out.push({ allowed: true, directive: from, why: `the element's nonce matches 'nonce-${options.nonce}'` }); continue; }
    const hs = hashes(list);
    // Attributes match hashes only with 'unsafe-hashes' (section 6.7.3.3 step 3).
    if (hs.length && (elementKind || has(list, "'unsafe-hashes'"))) {
      let hit = null;
      for (const h of hs) if (normB64(await digest(h.alg, content)) === normB64(h.value)) { hit = h; break; }
      if (hit) { out.push({ allowed: true, directive: from, why: `the content's ${hit.alg} hash matches '${hit.alg}-${hit.value}'` }); continue; }
    }
    let why = `${from} allows no inline ${kind === "handler" ? "event handlers" : kind === "style-attr" ? "style attributes" : kind}`;
    if (has(list, "'unsafe-inline'")) why += ` ('unsafe-inline' is ignored because the list also has a nonce, hash or 'strict-dynamic')`;
    if (!elementKind && hs.length && !has(list, "'unsafe-hashes'")) why += `; hashes match attributes only with 'unsafe-hashes'`;
    if (elementKind) why += `; add the content's hash (${await inlineHash(content)}) or a nonce`;
    out.push({ allowed: false, directive: from, why });
  }
  return { allowed: out.every((r) => r.allowed), results: out };
}

/** Would eval() / new Function() run? (script-src, falling back to default-src.) */
export function checkEval(policies, wasm = false) {
  return decision(policies, (policy) => {
    const eff = effectiveList(policy, "script-src");
    if (!eff) return { allowed: true, directive: null, why: "no script-src or default-src in this policy" };
    const ok = has(eff.list, "'unsafe-eval'") || (wasm && has(eff.list, "'wasm-unsafe-eval'"));
    return ok
      ? { allowed: true, directive: eff.from, why: `${eff.from} has ${has(eff.list, "'unsafe-eval'") ? "'unsafe-eval'" : "'wasm-unsafe-eval'"}` }
      : { allowed: false, directive: eff.from, why: `${eff.from} has no ${wasm ? "'wasm-unsafe-eval' or " : ""}'unsafe-eval'` };
  });
}

function nonceBytes(v) {
  const b = normB64(v).replace(/=+$/, "");
  return Math.floor((b.length * 6) / 8);
}

/**
 * Findings for each policy: { severity: "high"|"medium"|"low"|"info", id, directive, message, fix }.
 * delivery: "header" | "meta" | null; reportOnly: boolean.
 */
export function lint(policies, { delivery = "header", reportOnly = false } = {}) {
  const findings = [];
  const add = (severity, id, directive, message, fix = null, policy = 0) => findings.push({ severity, id, directive, message, fix, policy });
  if (policies.length === 0) {
    add("high", "empty", null, "No directives found, so nothing is restricted.", "Start from a strict policy: script-src 'nonce-{random}' 'strict-dynamic'; object-src 'none'; base-uri 'none'");
    return findings;
  }
  if (reportOnly) add("info", "report-only", null, "Report-only: browsers report violations but block nothing.", "Send the same policy as Content-Security-Policy once the reports are clean.");
  if (policies.length > 1) add("info", "multiple-policies", null, `${policies.length} policies (comma-separated). Each is enforced on its own, so a load must pass all of them; adding a policy can only tighten.`);

  policies.forEach((policy, pi) => {
    const P = (sev, id, d, msg, fix) => add(sev, id, d, msg, fix, pi);
    for (const d of policy.duplicates) P("medium", "duplicate", d, `${d} appears twice; browsers keep the first and ignore the rest.`, `Merge the two ${d} lists into one.`);
    for (const n of policy.invalidNames) P("medium", "invalid-name", n, `"${n}" is not a valid directive name, so the whole directive is dropped.`);
    for (const name of policy.order) {
      if (own(DEPRECATED, name)) P(name === "report-uri" ? "info" : "low", "deprecated", name, `${name}: ${DEPRECATED[name]}.`);
      else if (!own(DIRECTIVES, name)) P("medium", "unknown-directive", name, `${name} is not a CSP directive; browsers ignore it.${nearMiss(name)}`);
      if (delivery === "meta" && ["frame-ancestors", "report-uri", "sandbox"].includes(name)) P("medium", "meta-ignored", name, `${name} is ignored in a <meta> policy (CSP3 section 3.3).`, "Send it as an HTTP response header instead.");
    }

    // Source-expression syntax for the fetch directives.
    for (const name of policy.order) {
      if (!own(FALLBACK, name) && name !== "default-src") continue;
      const list = policy.directives.get(name);
      for (const e of list) {
        const s = classifySource(e);
        const bare = ["self", "none", "unsafe-inline", "unsafe-eval", "strict-dynamic", "unsafe-hashes", "report-sample", "wasm-unsafe-eval"];
        if (bare.includes(e.toLowerCase())) P("high", "unquoted-keyword", name, `${name} has ${e} without single quotes, which a browser reads as a host named "${e}", not the keyword.`, `Write '${e.toLowerCase()}'.`);
        else if (s.kind === "invalid") P("medium", "invalid-source", name, `${name}: "${e}" is not a valid source expression and is ignored.`);
        else if (s.kind === "unknown-keyword") P("medium", "unknown-keyword", name, `${name}: ${e} is not a CSP keyword and is ignored.`);
        else if (s.kind === "nonce" && nonceBytes(s.value) < 16) P("medium", "short-nonce", name, `${name}: 'nonce-${s.value}' carries about ${nonceBytes(s.value)} bytes; CSP3 asks for at least 128 bits (16 bytes) of fresh randomness per response.`, "Generate 16+ random bytes per response and base64 them.");
      }
      if (list.length > 1 && has(list, "'none'")) P("low", "none-with-others", name, `${name} mixes 'none' with other sources; 'none' is ignored unless it is alone.`);
    }

    const script = effectiveList(policy, "script-src-elem");
    if (!script) {
      P("high", "no-script-src", "script-src", "No script-src or default-src: scripts from anywhere, and inline scripts, run.", "Add script-src 'nonce-{random}' 'strict-dynamic' (or a hash list for static pages).");
    } else {
      const { from, list } = script;
      const sd = has(list, "'strict-dynamic'");
      const hasNonceOrHash = nonces(list).length > 0 || hashes(list).length > 0;
      if (allowsAllInline(list, "script")) P("high", "unsafe-inline", from, `${from} allows every inline script and event handler ('unsafe-inline' with no nonce or hash), so an injected <script> runs.`, "Replace 'unsafe-inline' with a per-response nonce or the scripts' hashes.");
      else if (has(list, "'unsafe-inline'")) P("info", "unsafe-inline-fallback", from, `'unsafe-inline' is ignored here because a nonce, hash or 'strict-dynamic' is present; it only helps CSP1 browsers.`);
      if (sd && !hasNonceOrHash) P("high", "strict-dynamic-no-nonce", from, `${from} has 'strict-dynamic' but no nonce or hash, so no script can start and every script is blocked.`, "Add 'nonce-{random}' and put that nonce on your <script> tags.");
      if (!sd) {
        for (const e of list) {
          const s = classifySource(e);
          if (s.kind === "wildcard") P("high", "script-wildcard", from, `${from} has *, which allows scripts from any http(s) host.`, "List the hosts you need, or move to a nonce with 'strict-dynamic'.");
          else if (s.kind === "scheme" && ["http", "https"].includes(s.scheme)) P("high", "script-scheme", from, `${from} has ${e}, which allows scripts from any host on that scheme.`, "Remove it; list hosts or use a nonce with 'strict-dynamic'.");
          else if (s.kind === "scheme" && ["data", "blob", "filesystem"].includes(s.scheme)) P("high", "script-data", from, `${from} has ${e}: an attacker who can inject markup can supply script as a ${s.scheme}: URL.`, `Remove ${e} from ${from}.`);
          else if (s.kind === "host" && s.scheme === "http") P("medium", "script-http-host", from, `${from} allows ${e} over plain http, which anyone on the network path can rewrite.`, `Use https://${s.host}.`);
          else if (s.kind === "host" && s.host.startsWith("*.") && s.host.split(".").length <= 3) P("low", "script-wild-host", from, `${from} allows every subdomain of ${s.host.slice(2)}; any of them that serves user content or JSONP can host an attack script.`);
        }
        if (list.some((e) => classifySource(e).kind === "host") && hasNonceOrHash === false)
          P("low", "allowlist-only", from, `${from} relies on a host allowlist. Weichselbaum et al. (CCS 2016) found allowlists bypassable in most real policies, because allowed hosts often serve JSONP endpoints or old script libraries.`, "Prefer script-src 'nonce-{random}' 'strict-dynamic', keeping hosts only as a fallback for old browsers.");
      }
      if (has(list, "'unsafe-eval'")) P("medium", "unsafe-eval", from, `${from} has 'unsafe-eval', so eval(), new Function() and string setTimeout run.`, "Remove it if your code and libraries allow; 'wasm-unsafe-eval' covers WebAssembly alone.");
    }

    const attr = effectiveList(policy, "script-src-attr");
    if (attr && attr.from === "script-src-attr" && allowsAllInline(attr.list, "script attribute")) P("high", "unsafe-inline-attr", "script-src-attr", "script-src-attr has 'unsafe-inline', so injected onclick= style handlers run.", "Move handlers to addEventListener and set script-src-attr 'none'.");

    const obj = effectiveList(policy, "object-src");
    if (!obj) P("medium", "no-object-src", "object-src", "No object-src or default-src: <object> and <embed> can load plugin content from anywhere.", "Add object-src 'none'.");
    else if (!(obj.list.length === 1 && obj.list[0].toLowerCase() === "'none'")) P("low", "object-src-open", obj.from, `object-src (via ${obj.from}) is not 'none'; plugin content is rarely needed.`, "Set object-src 'none' unless you embed plugins.");

    if (!policy.directives.has("base-uri")) {
      // With every script blocked, a hostile <base> can only repoint links and
      // relative images, so the finding drops to low.
      const noScripts = script !== null && script.list.every((e) => e.toLowerCase() === "'none'");
      if (noScripts) P("low", "no-base-uri", "base-uri", "No base-uri (it has no default-src fallback). No script can run under this policy, so an injected <base href> can only repoint links and relative images.", "Add base-uri 'none' (or 'self').");
      else P("medium", "no-base-uri", "base-uri", "No base-uri (it has no default-src fallback): an injected <base href> can repoint every relative script URL, nonced ones included, to another host.", "Add base-uri 'none' (or 'self').");
    }
    if (!policy.directives.has("frame-ancestors") && delivery !== "meta") P("info", "no-frame-ancestors", "frame-ancestors", "No frame-ancestors: any site may frame this page (clickjacking) unless X-Frame-Options says otherwise.", "Add frame-ancestors 'none' or 'self' if the page should not be framed.");
    if (!policy.directives.has("form-action")) P("info", "no-form-action", "form-action", "No form-action (no default-src fallback): an injected <form> can post to any host.", "Add form-action 'self'.");
    const style = effectiveList(policy, "style-src-elem");
    if (style && allowsAllInline(style.list, "style")) P("info", "style-unsafe-inline", style.from, `${style.from} allows inline styles; lower risk than script, but injected CSS can still leak data through selectors and backgrounds.`);
    if (policy.directives.has("report-uri") && !policy.directives.has("report-to")) P("info", "report-uri-only", "report-uri", "report-uri without report-to: fine today, but report-to is the CSP3 mechanism.");
    if (policy.directives.has("report-to") && !policy.directives.has("report-uri")) P("info", "report-to-only", "report-to", "report-to alone: browsers without the Reporting API send no reports; add report-uri as well for them.");
  });
  const rank = (sev) => ["high", "medium", "low", "info"].indexOf(sev);
  return findings.sort((a, b) => rank(a.severity) - rank(b.severity));
}

function nearMiss(name) {
  const all = Object.keys(DIRECTIVES);
  let best = null, bestD = 3;
  for (const d of all) {
    const dist = lev(name, d);
    if (dist < bestD) { bestD = dist; best = d; }
  }
  return best ? ` Did you mean ${best}?` : "";
}

function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** A one-line grade from findings, phrased as an observation. */
export function summary(findings) {
  const n = (s) => findings.filter((f) => f.severity === s).length;
  const h = n("high"), m = n("medium"), l = n("low");
  if (h) return `${h} high-severity finding${h === 1 ? "" : "s"}: as written, this policy would not stop a typical script injection.`;
  if (m) return `No high-severity findings; ${m} medium finding${m === 1 ? "" : "s"} to review.`;
  if (l) return `No high or medium findings; ${l} low-severity note${l === 1 ? "" : "s"}.`;
  const i = n("info");
  if (i) return `No high, medium or low findings of the kinds this tool checks; ${i} informational note${i === 1 ? "" : "s"}.`;
  return "No findings of the kinds this tool checks.";
}

/** Convenience: parse pasted text (header line, meta tag or bare policy) and lint it. */
export function analyze(input, opts = {}) {
  const ex = extractPolicyText(input);
  const policies = parsePolicyList(ex.text);
  const delivery = opts.delivery ?? ex.delivery ?? "header";
  const reportOnly = opts.reportOnly ?? ex.reportOnly;
  const findings = lint(policies, { delivery, reportOnly });
  return { policies, delivery, reportOnly, findings, summary: summary(findings) };
}
