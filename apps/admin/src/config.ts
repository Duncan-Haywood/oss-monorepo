// Which products the console reads. Never committed: PRODUCTS is a JSON var/secret set at deploy
// from the GitHub variable ADMIN_CONSOLE_PRODUCTS (.github/workflows/admin-deploy.yml):
//   [{"key":"payapps","name":"PayApps","kind":"app","adminUrl":"https://payapps.example.workers.dev/api/admin"},
//    {"key":"payapps-site","name":"PayApps early access","kind":"early_access","adminUrl":"https://…/api/admin"}]
// `adminUrl` is the base of the product's admin API (…/metrics and …/accounts are appended).
// Each product is called with `Authorization: Bearer <token>`, the token read from the env secret
// named by `tokenEnv` (default ADMIN_SERVICE_TOKEN, the one set-admins.yml shares).

export interface ProductConfig {
  key: string;
  name: string;
  kind: "app" | "early_access";
  adminUrl: string;
  tokenEnv: string;
  /**
   * Optional Cloudflare Access service token for a product whose /api/admin is also behind Access
   * (grants with CF_ACCESS_*): env var names holding CF-Access-Client-Id / CF-Access-Client-Secret.
   */
  accessClientIdEnv: string | null;
  accessClientSecretEnv: string | null;
  /** Env var holding the read-only metrics token (scripts/metrics.mjs); default ADMIN_METRICS_TOKEN. */
  metricsTokenEnv: string;
}

export type ConfigResult = { ok: true; products: ProductConfig[] } | { ok: false; error: string };

const KEY = /^[a-z0-9][a-z0-9-]{0,40}$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;

export function parseProducts(
  raw: string | undefined,
  opts: { allowHttp?: boolean } = {},
): ConfigResult {
  if (!raw?.trim()) return { ok: false, error: "PRODUCTS is not set" };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "PRODUCTS is not valid JSON" };
  }
  if (!Array.isArray(data)) return { ok: false, error: "PRODUCTS must be a JSON array" };
  const products: ProductConfig[] = [];
  const seen = new Set<string>();
  for (const [i, p] of data.entries()) {
    const e = (msg: string): ConfigResult => ({ ok: false, error: `PRODUCTS[${i}]: ${msg}` });
    if (!p || typeof p !== "object") return e("not an object");
    const o = p as Record<string, unknown>;
    if (typeof o.key !== "string" || !KEY.test(o.key))
      return e("key must be lower-case letters, digits, dashes");
    if (seen.has(o.key)) return e(`duplicate key ${o.key}`);
    if (typeof o.name !== "string" || !o.name.trim() || o.name.length > 80)
      return e("name required (≤80 chars)");
    if (o.kind !== "app" && o.kind !== "early_access")
      return e('kind must be "app" or "early_access"');
    if (typeof o.adminUrl !== "string") return e("adminUrl required");
    let url: URL;
    try {
      url = new URL(o.adminUrl);
    } catch {
      return e("adminUrl is not a URL");
    }
    // Plain http only for loopback (wrangler dev, tests) or when explicitly allowed (APP_ENV=test).
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const httpOk = url.protocol === "http:" && (opts.allowHttp || loopback);
    if (
      (url.protocol !== "https:" && !httpOk) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return e("adminUrl must be a plain https URL");
    }
    const tokenEnv = o.tokenEnv === undefined ? "ADMIN_SERVICE_TOKEN" : o.tokenEnv;
    if (typeof tokenEnv !== "string" || !ENV_NAME.test(tokenEnv))
      return e("tokenEnv must be an env var name");
    const metricsTokenEnv =
      o.metricsTokenEnv === undefined ? "ADMIN_METRICS_TOKEN" : o.metricsTokenEnv;
    if (typeof metricsTokenEnv !== "string" || !ENV_NAME.test(metricsTokenEnv)) {
      return e("metricsTokenEnv must be an env var name");
    }
    const accessId = o.accessClientIdEnv ?? null;
    const accessSecret = o.accessClientSecretEnv ?? null;
    for (const v of [accessId, accessSecret]) {
      if (v !== null && (typeof v !== "string" || !ENV_NAME.test(v)))
        return e("access*Env must be env var names");
    }
    if ((accessId === null) !== (accessSecret === null))
      return e("set both accessClientIdEnv and accessClientSecretEnv, or neither");
    seen.add(o.key);
    products.push({
      key: o.key,
      name: o.name.trim(),
      kind: o.kind,
      adminUrl: url.toString().replace(/\/+$/, ""),
      tokenEnv,
      metricsTokenEnv,
      accessClientIdEnv: accessId as string | null,
      accessClientSecretEnv: accessSecret as string | null,
    });
  }
  return { ok: true, products };
}
