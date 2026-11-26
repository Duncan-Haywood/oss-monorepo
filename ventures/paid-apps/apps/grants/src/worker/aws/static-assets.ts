// Serves the built SPA from the Lambda bundle (docs/AWS.md) the way Workers static assets serve
// dist/client (wrangler.jsonc `assets`):
//   - `/x` finds x, x.html or x/index.html (prerendered pages are written as x.html);
//   - `_redirects` exact-path rules: 200 rewrites, 301/302/307/308 redirects;
//   - `_headers` rules (CSP, HSTS, immutable /assets/*) applied to every file;
//   - anything else without a file extension gets index.html (single-page-application).
// The same two files Cloudflare reads drive this, so the platforms cannot drift; the fallback
// header set below is used only if _headers is missing from the bundle. Rules in both files are
// written with the public path (base path included); files are looked up without it.
const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
  webmanifest: "application/manifest+json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  ico: "image/x-icon",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  xml: "application/xml",
  woff2: "font/woff2",
  map: "application/json",
};

/** Cloudflare `_headers` rules: path pattern -> headers. Exact paths and `prefix*` are supported. */
export type HeaderRules = Record<string, Record<string, string>>;

export interface Redirect {
  from: string;
  to: string;
  status: number;
}

export interface AssetConfig {
  headers: HeaderRules;
  redirects: Redirect[];
}

export const FALLBACK_CONFIG: AssetConfig = {
  headers: {
    "/*": {
      "Content-Security-Policy":
        "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
      "Strict-Transport-Security": "max-age=31536000",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
    },
  },
  redirects: [],
};

export function parseHeadersFile(text: string): HeaderRules {
  const rules: HeaderRules = {};
  let current: Record<string, string> | null = null;
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = {};
      rules[line.trim()] = current;
      continue;
    }
    const i = line.indexOf(":");
    if (current && i > 0) current[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return rules;
}

export function parseRedirectsFile(text: string): Redirect[] {
  const out: Redirect[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const [from, to, status] = t.split(/\s+/);
    if (!from || !to || from.includes("*") || from.includes(":")) continue;
    out.push({ from, to, status: Number(status ?? 302) || 302 });
  }
  return out;
}

function headersFor(rules: HeaderRules, publicPath: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [pattern, headers] of Object.entries(rules)) {
    const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : null;
    if (prefix !== null ? publicPath.startsWith(prefix) : publicPath === pattern)
      Object.assign(out, headers);
  }
  return out;
}

/** Safe relative path segments for `pathname`, or null (traversal, hidden/config files, odd bytes). */
export function assetSegments(pathname: string): string[] | null {
  let p: string;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!p.startsWith("/") || p.includes("\0") || p.includes("\\")) return null;
  const parts = p.split("/").filter(Boolean);
  if (parts.some((s) => s === ".." || s === "." || s.startsWith("."))) return null;
  // Platform config files (_headers, _redirects) are not content.
  if (parts.length === 1 && parts[0]?.startsWith("_")) return null;
  return parts;
}

/**
 * `pathname` is the request path without the base path; `base` is the base path ("" or "/grants").
 * Returns null when no file applies (the caller then hands the request to the app).
 */
export async function serveAsset(
  pathname: string,
  base: string,
  read: (path: string) => Promise<Uint8Array | null>,
  config: AssetConfig = FALLBACK_CONFIG,
): Promise<Response | null> {
  const publicPath = `${base}${pathname}`;
  const rule = config.redirects.find((r) => r.from === publicPath);
  if (rule && rule.status !== 200) {
    return new Response(null, { status: rule.status, headers: { Location: rule.to } });
  }
  const lookup = rule?.to.startsWith(`${base}/`) ? rule.to.slice(base.length) : pathname;
  const parts = assetSegments(lookup);
  if (!parts) return null;
  const joined = parts.join("/");
  const hasExt = /\.[a-z0-9]+$/i.test(parts[parts.length - 1] ?? "");
  const candidates = !parts.length
    ? ["index.html"]
    : hasExt
      ? [joined]
      : [`${joined}.html`, `${joined}/index.html`, "index.html"];
  for (const path of candidates) {
    const file = await read(path);
    if (!file) continue;
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    return new Response(file.slice(), {
      status: 200,
      headers: {
        "Content-Type": TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=0, must-revalidate",
        ...headersFor(config.headers, `${base}/${path}`),
      },
    });
  }
  return null;
}
