// Is this Paddle key the right kind? (owner, 2026-11-27: "there is a key is it the right type or no?")
//
// Two parts, both safe to print:
//   1. classifyPaddleKey: pure, from the key's shape alone. Paddle Billing API keys made since 2025
//      start pdl_live_apikey_ or pdl_sdbx_apikey_; older Billing keys have no prefix, cannot carry
//      permissions or an expiry, and do not say which environment they belong to. Client-side tokens
//      (live_/test_, for Paddle.js) and notification secrets (pdl_ntfset_) are the wrong kind.
//   2. probePaddleKey: asks Paddle which of the catalog's calls the key may make. Reads use
//      per_page=1; writes POST an empty body, which Paddle refuses before creating anything (400 when
//      the key may write, 403 when it may not), so the probe never changes the account.
//
// Nothing of the key past its public prefix is ever returned or printed.

export type PaddleKeyKind =
  | "missing"
  | "live"
  | "sandbox"
  | "legacy"
  | "client-token"
  | "webhook-secret"
  | "unrecognised";

export interface PaddleKeyShape {
  kind: PaddleKeyKind;
  /** The public part only (e.g. "pdl_live_apikey_"), or "" when the key has none. */
  prefix: string;
  /** Leading or trailing whitespace, usually from a paste. The key is used trimmed. */
  whitespace: boolean;
  /** Whether this kind can call the Paddle Billing API at all. */
  usable: boolean;
  /** The environment the key names, or null when only a probe can tell (legacy keys). */
  environment: "live" | "sandbox" | null;
  /** One line a person can act on. */
  advice: string;
}

const NEW_KEY = /^pdl_(live|sdbx)_apikey_[A-Za-z0-9_]{10,}$/;
// Some early keys and docs show pdl_live_/pdl_sdbx_ without the apikey_ segment; the API takes them.
const PREFIXED = /^pdl_(live|sdbx)_[A-Za-z0-9_]{10,}$/;
const CLIENT_TOKEN = /^(live|test)_[A-Za-z0-9]{10,}$/;
const LEGACY = /^[A-Za-z0-9]{30,}$/;

/** Classifies a key from its shape. Pure; never returns the key. */
export function classifyPaddleKey(raw: string | undefined | null): PaddleKeyShape {
  const value = raw ?? "";
  const key = value.trim();
  const whitespace = key.length > 0 && key !== value;
  const shape = (
    kind: PaddleKeyKind,
    prefix: string,
    environment: "live" | "sandbox" | null,
    advice: string,
  ): PaddleKeyShape => ({
    kind,
    prefix,
    whitespace,
    usable: kind === "live" || kind === "sandbox" || kind === "legacy",
    environment,
    advice,
  });

  if (!key) return shape("missing", "", null, "no key set: paid plans stay dark");
  if (key.startsWith("pdl_ntfset_"))
    return shape(
      "webhook-secret",
      "pdl_ntfset_",
      null,
      "this is a notification destination's secret (BILLING_WEBHOOK_SECRET), not an API key; create an API key under Developer tools > Authentication",
    );
  const m = key.match(NEW_KEY) ?? key.match(PREFIXED);
  if (m) {
    const env = m[1] === "live" ? "live" : "sandbox";
    const prefix = key.match(NEW_KEY) ? `pdl_${m[1]}_apikey_` : `pdl_${m[1]}_`;
    return shape(
      env,
      prefix,
      env,
      env === "live"
        ? "a live Paddle Billing API key: the right kind for charging real customers"
        : "a sandbox Paddle Billing API key: the right kind for testing; no real charges",
    );
  }
  const c = key.match(CLIENT_TOKEN);
  if (c)
    return shape(
      "client-token",
      `${c[1]}_`,
      c[1] === "live" ? "live" : "sandbox",
      "this is a client-side token for Paddle.js, not an API key; it cannot read or create products",
    );
  if (LEGACY.test(key))
    return shape(
      "legacy",
      "",
      null,
      "a legacy-format key (no pdl_ prefix): it works but cannot carry permissions or an expiry; replace it with a new pdl_ key scoped to product and price read/write",
    );
  return shape(
    "unrecognised",
    "",
    null,
    "not a Paddle Billing key shape (Paddle Classic auth codes do not work with Paddle Billing)",
  );
}

/** The calls the catalog sync makes, and the Paddle permission each needs. */
export const CATALOG_CALLS = [
  { id: "list-products", method: "GET", path: "/products?per_page=1", permission: "product.read" },
  { id: "list-prices", method: "GET", path: "/prices?per_page=1", permission: "price.read" },
  { id: "create-product", method: "POST", path: "/products", permission: "product.write" },
  { id: "create-price", method: "POST", path: "/prices", permission: "price.write" },
] as const;

export type CatalogCallId = (typeof CATALOG_CALLS)[number]["id"];

export type ProbeVerdict = "allowed" | "forbidden" | "unauthenticated" | "unreachable" | "error";

export interface ProbeResult {
  call: CatalogCallId;
  permission: string;
  status: number;
  code: string;
  verdict: ProbeVerdict;
}

/**
 * What a probe's response means. A read is allowed only on 2xx. A write probe sends an empty body,
 * so 400 (Paddle's validation error) means the key passed the permission check. 401 is a key this
 * environment does not accept; 403 is a missing permission (Paddle's "forbidden"). Status 0 means no
 * HTTP answer at all (network, proxy, DNS): it says nothing about the key.
 */
export function probeVerdict(method: "GET" | "POST", status: number): ProbeVerdict {
  if (status === 0) return "unreachable";
  if (status >= 200 && status < 300) return "allowed";
  if (method === "POST" && (status === 400 || status === 422)) return "allowed";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  return "error";
}

export const PADDLE_API_BASE = {
  live: "https://api.paddle.com",
  sandbox: "https://sandbox-api.paddle.com",
} as const;

async function probeOne(
  key: string,
  base: string,
  call: (typeof CATALOG_CALLS)[number],
  fetchFn: typeof fetch,
): Promise<ProbeResult> {
  let status = 0;
  let code = "";
  try {
    const res = await fetchFn(`${base}${call.path}`, {
      method: call.method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Paddle-Version": "1",
      },
      body: call.method === "POST" ? "{}" : undefined,
    });
    status = res.status;
    const json = (await res.json().catch(() => ({}))) as { error?: { code?: unknown } };
    code = typeof json.error?.code === "string" ? json.error.code : "";
  } catch {
    code = "network";
  }
  return {
    call: call.id,
    permission: call.permission,
    status,
    code,
    verdict: probeVerdict(call.method, status),
  };
}

export interface KeyProbe {
  shape: PaddleKeyShape;
  /** The environment the key works in: from its prefix, or for a legacy key the one that accepted it. */
  environment: "live" | "sandbox" | null;
  baseUrl: string | null;
  results: ProbeResult[];
}

/**
 * Probes the catalog calls with the key. A legacy key is tried on live first, then sandbox, and the
 * environment that does not answer 401 is the key's. `calls` limits which calls are probed (a
 * plan-only sync needs only the reads).
 */
export async function probePaddleKey(
  raw: string,
  opts: { fetch?: typeof fetch; calls?: readonly CatalogCallId[] } = {},
): Promise<KeyProbe> {
  const shape = classifyPaddleKey(raw);
  const key = (raw ?? "").trim();
  const fetchFn = opts.fetch ?? ((i, init) => fetch(i, init));
  const wanted = CATALOG_CALLS.filter((c) => !opts.calls || opts.calls.includes(c.id));
  if (!shape.usable) return { shape, environment: shape.environment, baseUrl: null, results: [] };

  const envs: ("live" | "sandbox")[] = shape.environment
    ? [shape.environment]
    : ["live", "sandbox"];
  let last: KeyProbe | null = null;
  for (const env of envs) {
    const base = PADDLE_API_BASE[env];
    const first = await probeOne(key, base, wanted[0] ?? CATALOG_CALLS[0], fetchFn);
    const silent = first.verdict === "unauthenticated" || first.verdict === "unreachable";
    if (silent && envs.length > 1 && env !== envs[envs.length - 1]) {
      last = { shape, environment: null, baseUrl: null, results: [first] };
      continue;
    }
    const rest: ProbeResult[] = [];
    for (const c of wanted.slice(1)) rest.push(await probeOne(key, base, c, fetchFn));
    const results = [first, ...rest];
    // Accepted only on an HTTP answer other than 401: no answer at all is not acceptance.
    const accepted = results.some(
      (r) => r.verdict !== "unauthenticated" && r.verdict !== "unreachable",
    );
    return {
      shape,
      environment: accepted ? env : shape.environment,
      baseUrl: accepted ? base : null,
      results,
    };
  }
  return last ?? { shape, environment: null, baseUrl: null, results: [] };
}

/** The report lines a deploy log prints. Contains no part of the key past its public prefix. */
export function describeKeyProbe(p: KeyProbe, label = "BILLING_API_KEY"): string[] {
  const s = p.shape;
  const kindText: Record<PaddleKeyKind, string> = {
    missing: "not set",
    live: "live",
    sandbox: "sandbox",
    legacy: "legacy-format",
    "client-token": "client-side token (wrong kind)",
    "webhook-secret": "notification secret (wrong kind)",
    unrecognised: "unrecognised (wrong kind)",
  };
  const lines = [
    `${label}: ${kindText[s.kind]}${s.prefix ? ` (prefix ${s.prefix})` : ""}${s.whitespace ? "; has leading or trailing whitespace, used trimmed (re-paste it)" : ""}`,
    `  ${s.advice}`,
  ];
  if (!s.usable) return lines;
  const noAnswer = p.results.length > 0 && p.results.every((r) => r.verdict === "unreachable");
  if (noAnswer) {
    lines.push(
      "  no answer from Paddle (network, proxy or DNS): nothing is known about the key yet",
    );
    return lines;
  }
  if (s.kind === "legacy")
    lines.push(
      p.environment
        ? `  Paddle accepted it on ${p.environment}`
        : "  neither live nor sandbox Paddle accepted it (revoked, mistyped, or a Paddle Classic code)",
    );
  for (const r of p.results) {
    const how =
      r.verdict === "allowed"
        ? "ok"
        : r.verdict === "forbidden"
          ? `403 ${r.code || "forbidden"}: give the key ${r.permission}`
          : r.verdict === "unauthenticated"
            ? `401 ${r.code || "unauthenticated"}: this environment does not accept the key`
            : `${r.status || "no answer"} ${r.code}`.trim();
    lines.push(`  ${r.call}: ${how}`);
  }
  const blocked = p.results.filter((r) => r.verdict === "forbidden").map((r) => r.permission);
  if (blocked.length) lines.push(`  missing permissions: ${blocked.join(", ")}`);
  return lines;
}

/** True when every probed call was allowed. */
export function keyProbeOk(p: KeyProbe): boolean {
  return p.shape.usable && p.results.length > 0 && p.results.every((r) => r.verdict === "allowed");
}
