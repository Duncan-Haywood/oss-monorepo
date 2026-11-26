// @ts-check
// Paid HTTP API: explained findings, safe fixes, accountant workspace, API keys, metering.
// FSL-1.1-MIT (see ../LICENSE, part 2). No npm dependencies (node:http; packages/billing from this repo).
//
//   node pro/server.mjs            PORT (8790), PRO_DB_FILE (SQLite database, the production store),
//                                  PRO_DATA_FILE (one JSON file, single process; memory if neither),
//                                  ADMIN_TOKEN (creates accounts), ANTHROPIC_API_KEY + LLM_MODEL
//                                  (optional long-tail explanations), FAKE_LLM=true (offline demo),
//                                  Paid plans (on once set, docs/BILLING.md): BILLING_PROVIDER (default paddle),
//                                  BILLING_API_KEY, BILLING_WEBHOOK_SECRET, BILLING_PRICE_IDS,
//                                  CHECKOUT_SECRET, APP_URL; FAKE_EXTERNALS=true for the signed fake.
//
// Auth: `Authorization: Bearer <api key>`. Keys are shown once and stored as SHA-256 only.
// Errors: { error: { code, message } }. Lists: { items, nextCursor? }.
//
//   GET    /healthz
//   GET    /app, /app/app.js, /app/app.css, /app/workspace-lib.mjs   the accountant workspace page (pro/web/)
//   POST   /v1/signup                        {name, acceptTerms: true} -> 201 {account, apiKey}  (public trial
//                                            sign-up; PUBLIC_SIGNUP=off disables it; per-IP and daily caps:
//                                            SIGNUP_PER_IP_PER_HOUR (5), SIGNUP_PER_DAY (200); TRUST_PROXY=1 reads
//                                            the client IP from the last X-Forwarded-For entry)
//   POST   /v1/admin/accounts                {name, plan?} -> 201 {account, apiKey}   (ADMIN_TOKEN)
//   GET    /v1/billing/plans                 -> {available, items}                 (public: the pricing table)
//   POST   /v1/billing/webhook               Paddle notifications (signature-verified, unauthenticated)
//   GET    /v1/account                       -> {account, plan, usage, subscription, graceUntil, billing}
//   POST   /v1/billing/checkout              {plan, interval?, email, promoCode?} -> 201 {url}
//   POST   /v1/billing/portal                -> {url} (manage or cancel the subscription)
//   GET    /v1/keys | POST /v1/keys {name} | DELETE /v1/keys/:id
//   POST   /v1/check?lang=de|fr|en&profile=&fix=1&name=   raw body = one invoice   (1 unit)
//   GET    /v1/clients | POST /v1/clients {name, country?, vatId?, reference?}
//   GET    /v1/clients/:id | DELETE /v1/clients/:id
//   POST   /v1/clients/:id/batches?lang=&profile=&fix=1   {documents:[{name, content, encoding?}]}
//                                            -> 201 {run, results}             (1 unit per document)
//
// Metering (as the pricing page says): a unit is one invoice per month, by SHA-256 of its bytes, so
// re-checking the same file in the same month is free, and so is the same file twice in a batch.
// "Explained" is one unit per invoice per month that needed the model (rules with a built-in
// template are free); the explain step's own per-request cap bounds the calls inside one invoice.
// Headers: x-usage-documents-used/-limit, x-usage-documents-charged (units this request took),
// x-usage-explained-used/-limit.
//   GET    /v1/clients/:id/history?limit=&before=      -> {items: Run[], nextCursor}
//   GET    /v1/clients/:id/runs/:runId
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { isBlocking } from "../report.mjs";
import { BillingError, createBilling } from "./billing.mjs";
import { checkInvoice, sha256 } from "./check.mjs";
import { loadLlmFromEnv } from "./llm.mjs";
import { periodOf, PLANS } from "./plans.mjs";
import { openSqliteStore } from "./sql-store.mjs";
import { FileStore, MemoryStore } from "./store.mjs";

const MAX_BODY = 30 * 1024 * 1024;
const MAX_BATCH = 50;
const MAX_FILE = 1_048_576;
const MAX_WEBHOOK = 256 * 1024;

/** The workspace page's files, read once at start-up. */
const WEB = Object.fromEntries(
  [
    ["/app", "index.html", "text/html; charset=utf-8"],
    ["/app/app.js", "app.js", "text/javascript; charset=utf-8"],
    ["/app/workspace-lib.mjs", "workspace-lib.mjs", "text/javascript; charset=utf-8"],
    ["/app/app.css", "app.css", "text/css; charset=utf-8"],
  ].map(([path, file, type]) => [path, { type, body: readFileSync(new URL(`./web/${file}`, import.meta.url)) }]),
);
/** Same-origin only: no inline script, no third-party anything, no framing. */
const WEB_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

/**
 * Sliding-window caps on public sign-up, per client IP and per day for the whole process. In
 * memory (one process, `docs/HOSTING.md`); a restart resets them, which only loosens the cap.
 * @param {{ perIpPerHour: number, perDay: number, now: () => Date }} opts
 */
export function signupLimiter(opts) {
  /** @type {Map<string, number[]>} */
  const byIp = new Map();
  /** @type {number[]} */
  let all = [];
  return {
    /** @param {string} ip @returns {"ok" | "ip" | "day"} */
    take(ip) {
      const t = opts.now().getTime();
      all = all.filter((x) => t - x < 86_400_000);
      const mine = (byIp.get(ip) ?? []).filter((x) => t - x < 3_600_000);
      if (mine.length >= opts.perIpPerHour) return "ip";
      if (all.length >= opts.perDay) return "day";
      mine.push(t);
      all.push(t);
      byIp.set(ip, mine);
      if (byIp.size > 10_000) for (const [k, v] of byIp) if (!v.some((x) => t - x < 3_600_000)) byIp.delete(k);
      return "ok";
    },
  };
}

class HttpError extends Error {
  /** @param {number} status @param {string} code @param {string} message */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** @param {string} secret */
export const hashKey = (secret) => createHash("sha256").update(secret).digest("hex");

export function generateApiKey() {
  const secret = `epk_${randomBytes(24).toString("base64url")}`;
  return { secret, prefix: secret.slice(0, 12), hash: hashKey(secret) };
}

/** @param {string} a @param {string} b */
function sameSecret(a, b) {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

/** @param {import("node:http").IncomingMessage} req @param {number} [max] @returns {Promise<Buffer>} */
async function readBody(req, max = MAX_BODY) {
  /** @type {Buffer[]} */
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new HttpError(413, "too_large", `Body exceeds ${max} bytes.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** @param {Buffer} body */
function json(body) {
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new HttpError(400, "bad_json", "Body is not valid JSON.");
  }
}

/** @param {unknown} v @param {number} max */
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** @param {string} name @param {Buffer} bytes @returns {string | Uint8Array} */
function invoiceSource(name, bytes) {
  const isPdf = /\.pdf$/i.test(name) || bytes.subarray(0, 5).toString("latin1") === "%PDF-";
  return isPdf ? new Uint8Array(bytes) : bytes.toString("utf8");
}

/** @param {any} result @returns {import("./store.mjs").RunFile} */
function runFileOf(result) {
  const applied = result.fixes?.applied ?? [];
  return {
    file: result.file,
    sha256: result.sha256,
    bytes: result.bytes,
    status: result.status,
    rules: [...new Set((result.findings ?? []).map((/** @type {{rule: string}} */ f) => f.rule))],
    blocking: (result.findings ?? []).filter((/** @type {any} */ f) => isBlocking(f)).length,
    fixesApplied: applied.map((/** @type {{id: string}} */ a) => a.id),
    fixedSha256: applied.length ? result.fixes.sha256 : null,
    fixedStatus: applied.length ? result.fixes.revalidation.status : null,
  };
}

/** A WHATWG Request for the billing package's webhook parser, from a Node request and its raw body. @param {import("node:http").IncomingMessage} req @param {Buffer} body */
function webRequest(req, body) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers.set(k, v);
    else if (Array.isArray(v)) for (const x of v) headers.append(k, x);
  }
  return new Request("http://localhost/v1/billing/webhook", { method: "POST", headers, body: new Uint8Array(body) });
}

/**
 * @param {{ store?: MemoryStore | import("./sql-store.mjs").SqlStore, llm?: import("./llm.mjs").Llm | null, env?: Record<string, string | undefined>, now?: () => Date,
 *   billing?: ReturnType<typeof createBilling> }} [deps]
 */
export function createProHandler(deps = {}) {
  const env = deps.env ?? {};
  const store = deps.store ?? new MemoryStore();
  const llm = deps.llm ?? null;
  const now = deps.now ?? (() => new Date());
  const billing = deps.billing ?? createBilling({ env, store, now });
  /** @type {Map<string, any>} explanation cache shared across tenants: keyed by rule text only */
  const cache = new Map();
  const cacheSet = cache.set.bind(cache);
  /** @type {import("./explain.mjs").ExplainCache} */
  const boundedCache = {
    get: (k) => cache.get(k),
    set: (k, v) => {
      const oldest = cache.keys().next().value;
      if (cache.size > 5000 && oldest !== undefined) cache.delete(oldest);
      return cacheSet(k, v);
    },
  };

  const signups = signupLimiter({
    perIpPerHour: Number(env.SIGNUP_PER_IP_PER_HOUR) || 5,
    perDay: Number(env.SIGNUP_PER_DAY) || 200,
    now,
  });

  /** @param {import("node:http").IncomingMessage} req */
  function clientIp(req) {
    if (env.TRUST_PROXY === "1") {
      const xff = String(req.headers["x-forwarded-for"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (xff.length) return xff[xff.length - 1];
    }
    return req.socket.remoteAddress ?? "unknown";
  }

  /** @param {import("node:http").IncomingMessage} req */
  async function authenticate(req) {
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "");
    if (!m) throw new HttpError(401, "unauthorized", "Send Authorization: Bearer <api key>.");
    const key = await store.findActiveApiKeyByHash(hashKey(m[1]));
    if (!key) throw new HttpError(401, "unauthorized", "Unknown or revoked API key.");
    const account = await store.getAccount(key.accountId);
    if (!account) throw new HttpError(401, "unauthorized", "Unknown account.");
    return { account, key };
  }

  /**
   * Meter the invoices (once per hash per month), run the work, and unmeter what this request
   * metered if the work throws before any result is produced.
   * @template T @param {import("./store.mjs").Account} account @param {import("./plans.mjs").Plan} plan @param {string[]} hashes @param {() => Promise<T>} work
   * @returns {Promise<{ value: T, charged: number }>}
   */
  async function metered(account, plan, hashes, work) {
    const period = periodOf(now());
    const r = await store.meterDocuments(account.id, period, hashes, plan.documentsPerMonth);
    if (!r.ok) {
      const remain = Math.max(0, plan.documentsPerMonth - r.used);
      throw new HttpError(
        429,
        "quota_exceeded",
        `This request has invoices not yet checked this month that need more than the ${remain} of ${plan.documentsPerMonth} remaining. Invoices already checked this month are free to re-check.`,
      );
    }
    try {
      return { value: await work(), charged: r.added.length };
    } catch (e) {
      await store.unmeterDocuments(account.id, period, r.added);
      throw e;
    }
  }

  /**
   * The model is offered only while the account's monthly "explained" budget lasts. That budget
   * counts invoices, not calls: the first call for an invoice this month takes one unit and the
   * rest for it are free. Returns a per-invoice factory; once the budget refuses, the rest of
   * the request gets the checker's own text.
   * @param {import("./store.mjs").Account} account @param {import("./plans.mjs").Plan} plan
   * @returns {(invoiceSha256: string) => { llm: import("./llm.mjs").Llm | null, onLlmCall: () => void }}
   */
  function llmFor(account, plan) {
    if (!llm) return () => ({ llm: null, onLlmCall: () => {} });
    const period = periodOf(now());
    const limit = plan.llmExplanationsPerMonth;
    let blocked = false;
    return (invoiceSha256) => {
      let paid = false;
      /** @type {import("./llm.mjs").Llm} */
      const gated = {
        async complete(req) {
          if (blocked) throw new Error("explanation budget used up");
          if (!paid) {
            const r = await store.meterExplained(account.id, period, invoiceSha256, limit);
            if (!r.ok) {
              blocked = true;
              throw new Error("explanation budget used up");
            }
            paid = true;
          }
          return llm.complete(req);
        },
      };
      return { llm: gated, onLlmCall: () => {} };
    };
  }

  /** @param {URL} url */
  const checkOptions = (url) => ({
    lang: url.searchParams.get("lang") ?? "en",
    profile: url.searchParams.get("profile") ?? "",
    fix: url.searchParams.get("fix") === "1" || url.searchParams.get("fix") === "true",
    schematron: url.searchParams.get("schematron") === "1",
  });

  /** @param {import("./store.mjs").Account} account @param {import("./plans.mjs").Plan} plan @param {number} charged */
  async function usageHeaders(account, plan, charged) {
    const u = await store.getUsage(account.id, periodOf(now()));
    return {
      "x-usage-documents-used": String(u.documents),
      "x-usage-documents-limit": String(plan.documentsPerMonth),
      "x-usage-documents-charged": String(charged),
      "x-usage-explained-used": String(u.llmExplanations),
      "x-usage-explained-limit": String(plan.llmExplanationsPerMonth),
    };
  }

  /** @param {import("node:http").IncomingMessage} req @param {URL} url */
  async function route(req, url) {
    const method = req.method ?? "GET";
    const p = url.pathname.replace(/\/+$/, "") || "/";
    let m;

    if (method === "GET" && p === "/healthz") return { status: 200, body: { ok: true } };

    if (method === "GET" && (p === "/" || p === "/app/index.html")) return { status: 302, body: null, headers: { location: "/app" } };
    if (method === "GET" && WEB[p]) {
      const f = WEB[p];
      return {
        status: 200,
        raw: f.body,
        headers: { "content-type": f.type, "content-security-policy": WEB_CSP, "referrer-policy": "no-referrer", "cache-control": "no-cache" },
      };
    }

    if (method === "POST" && p === "/v1/signup") {
      if (env.PUBLIC_SIGNUP === "off") throw new HttpError(403, "signup_closed", "Sign-up is closed on this server.");
      const body = json(await readBody(req, 4096));
      const name = text(body.name, 200);
      if (!name) throw new HttpError(400, "invalid", "name is required.");
      if (body.acceptTerms !== true) throw new HttpError(400, "invalid", "acceptTerms must be true.");
      const verdict = signups.take(clientIp(req));
      if (verdict !== "ok")
        throw new HttpError(429, "signup_limited", verdict === "ip" ? "Too many sign-ups from this address; try again in an hour." : "Sign-up is busy today; try again tomorrow.");
      const account = await store.createAccount({ name, plan: "trial" });
      const k = generateApiKey();
      await store.createApiKey(account.id, { name: "default", prefix: k.prefix, hash: k.hash });
      return { status: 201, body: { account, apiKey: k.secret } };
    }

    if (method === "GET" && p === "/v1/billing/plans") {
      return { status: 200, body: { available: billing.available, items: billing.plans() } };
    }
    if (method === "POST" && p === "/v1/billing/webhook") {
      return billing.webhook(webRequest(req, await readBody(req, MAX_WEBHOOK)));
    }

    if (method === "POST" && p === "/v1/admin/accounts") {
      const admin = env.ADMIN_TOKEN;
      const given = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "")?.[1] ?? "";
      if (!admin || !given || !sameSecret(given, admin)) throw new HttpError(401, "unauthorized", "Admin token required.");
      const body = json(await readBody(req));
      const name = text(body.name, 200);
      if (!name) throw new HttpError(400, "invalid", "name is required.");
      const plan = PLANS[body.plan] ? body.plan : "trial";
      const account = await store.createAccount({ name, plan });
      const k = generateApiKey();
      await store.createApiKey(account.id, { name: "default", prefix: k.prefix, hash: k.hash });
      return { status: 201, body: { account, apiKey: k.secret } };
    }

    const { account } = await authenticate(req);
    const ent = await billing.entitlement(account);
    const plan = ent.plan;

    if (method === "GET" && p === "/v1/account") {
      return {
        status: 200,
        body: {
          account,
          plan,
          usage: await store.getUsage(account.id, periodOf(now())),
          subscription: ent.subscription,
          graceUntil: ent.graceUntil,
          billing: { available: billing.available, plans: billing.plans().filter((x) => x.purchasable) },
        },
      };
    }

    if (method === "POST" && p === "/v1/billing/checkout") {
      return { status: 201, body: await billing.checkout(account, json(await readBody(req, 16 * 1024))) };
    }
    if (method === "POST" && p === "/v1/billing/portal") {
      return { status: 200, body: await billing.portal(account) };
    }

    if (p === "/v1/keys") {
      if (method === "GET") {
        const items = (await store.listApiKeys(account.id)).map(({ hash: _hash, ...rest }) => rest);
        return { status: 200, body: { items } };
      }
      if (method === "POST") {
        if ((await store.listApiKeys(account.id)).length >= plan.apiKeys)
          throw new HttpError(403, "limit", `Your plan allows ${plan.apiKeys} active API keys.`);
        const body = json(await readBody(req));
        const k = generateApiKey();
        const rec = await store.createApiKey(account.id, { name: text(body.name, 100) || "key", prefix: k.prefix, hash: k.hash });
        const { hash: _hash, ...rest } = rec;
        return { status: 201, body: { ...rest, apiKey: k.secret } };
      }
    }
    if (method === "DELETE" && (m = /^\/v1\/keys\/([\w-]+)$/.exec(p))) {
      if (!(await store.revokeApiKey(account.id, m[1]))) throw new HttpError(404, "not_found", "No such key.");
      return { status: 204, body: null };
    }

    if (method === "POST" && p === "/v1/check") {
      const bytes = await readBody(req);
      if (!bytes.length) throw new HttpError(400, "invalid", "Send one invoice as the request body.");
      if (bytes.length > MAX_FILE) throw new HttpError(413, "too_large", `An invoice may be at most ${MAX_FILE} bytes.`);
      const name = text(url.searchParams.get("name"), 200) || (/pdf/i.test(req.headers["content-type"] ?? "") ? "invoice.pdf" : "invoice.xml");
      const source = invoiceSource(name, bytes);
      const hash = sha256(source);
      const { value: result, charged } = await metered(account, plan, [hash], () =>
        checkInvoice({ name, source }, { ...checkOptions(url), ...llmFor(account, plan)(hash), cache: boundedCache }),
      );
      return { status: 200, body: result, headers: await usageHeaders(account, plan, charged) };
    }

    if (p === "/v1/clients") {
      if (method === "GET") return { status: 200, body: { items: await store.listClients(account.id) } };
      if (method === "POST") {
        if ((await store.countClients(account.id)) >= plan.clients)
          throw new HttpError(403, "limit", `Your plan allows ${plan.clients} clients.`);
        const body = json(await readBody(req));
        const name = text(body.name, 200);
        if (!name) throw new HttpError(400, "invalid", "name is required.");
        const client = await store.createClient(account.id, {
          name,
          country: text(body.country, 2).toUpperCase(),
          vatId: text(body.vatId, 30),
          reference: text(body.reference, 100),
        });
        return { status: 201, body: client };
      }
    }

    if ((m = /^\/v1\/clients\/([\w-]+)(\/.*)?$/.exec(p))) {
      const client = await store.getClient(account.id, m[1]);
      if (!client) throw new HttpError(404, "not_found", "No such client.");
      const rest = m[2] ?? "";
      if (rest === "" && method === "GET") return { status: 200, body: client };
      if (rest === "" && method === "DELETE") {
        await store.deleteClient(account.id, client.id);
        return { status: 204, body: null };
      }
      if (rest === "/history" && method === "GET") {
        const limit = Number(url.searchParams.get("limit") ?? "20") || 20;
        const before = url.searchParams.get("before") ?? undefined;
        return { status: 200, body: await store.listRuns(account.id, client.id, { limit, before }) };
      }
      let r;
      if ((r = /^\/runs\/([\w-]+)$/.exec(rest)) && method === "GET") {
        const run = await store.getRun(account.id, client.id, r[1]);
        if (!run) throw new HttpError(404, "not_found", "No such run.");
        return { status: 200, body: run };
      }
      if (rest === "/batches" && method === "POST") {
        const body = json(await readBody(req));
        const docs = Array.isArray(body.documents) ? body.documents : null;
        if (!docs || !docs.length) throw new HttpError(400, "invalid", "documents must be a non-empty list.");
        if (docs.length > MAX_BATCH) throw new HttpError(400, "invalid", `A batch holds at most ${MAX_BATCH} documents.`);
        const inputs = docs.map((/** @type {any} */ d, /** @type {number} */ i) => {
          const name = text(d?.name, 200) || `invoice-${i + 1}.xml`;
          if (typeof d?.content !== "string") throw new HttpError(400, "invalid", `documents[${i}].content must be a string.`);
          const bytes = d.encoding === "base64" ? Buffer.from(d.content, "base64") : Buffer.from(d.content, "utf8");
          if (bytes.length > MAX_FILE) throw new HttpError(413, "too_large", `${name} exceeds ${MAX_FILE} bytes.`);
          return { name, source: invoiceSource(name, bytes) };
        });
        const opts = { ...checkOptions(url), cache: boundedCache };
        const llmForInvoice = llmFor(account, plan);
        const hashes = inputs.map((input) => sha256(input.source));
        const { value: results, charged } = await metered(account, plan, hashes, async () => {
          const out = [];
          for (const [i, input] of inputs.entries()) out.push(await checkInvoice(input, { ...opts, ...llmForInvoice(hashes[i]) }));
          return out;
        });
        const files = results.map(runFileOf);
        const run = await store.addRun(account.id, {
          clientId: client.id,
          lang: results[0]?.lang ?? "en",
          profile: results[0]?.profile ?? "",
          totals: {
            files: files.length,
            passed: files.filter((f) => f.status === "pass").length,
            failed: files.filter((f) => f.status !== "pass").length,
            fixable: files.filter((f) => f.fixesApplied.length).length,
          },
          files,
        });
        return { status: 201, body: { run, results }, headers: await usageHeaders(account, plan, charged) };
      }
    }

    throw new HttpError(404, "not_found", "No such route.");
  }

  /** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res */
  return async function handle(req, res) {
    const url = new URL(req.url ?? "/", "http://localhost");
    /** @type {{ status: number, body?: unknown, raw?: Buffer, headers?: Record<string, string> }} */
    let out;
    try {
      out = await route(req, url);
    } catch (e) {
      if (e instanceof HttpError || e instanceof BillingError) out = { status: e.status, body: { error: { code: e.code, message: e.message } } };
      else {
        console.error("einvoice-pro: internal error", e instanceof Error ? e.message : "unknown");
        out = { status: 500, body: { error: { code: "internal", message: "Internal error." } } };
      }
    }
    res.writeHead(out.status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...(out.headers ?? {}),
    });
    res.end(out.raw ?? (out.body === null || out.body === undefined ? "" : JSON.stringify(out.body)));
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const env = process.env;
  const kind = env.PRO_DB_FILE ? "sqlite" : env.PRO_DATA_FILE ? "file" : "memory";
  const store = env.PRO_DB_FILE
    ? await openSqliteStore(env.PRO_DB_FILE)
    : env.PRO_DATA_FILE
      ? new FileStore(env.PRO_DATA_FILE)
      : new MemoryStore();
  const llm = await loadLlmFromEnv(env);
  const port = Number(env.PORT) || 8790;
  const now = () => new Date();
  const billing = createBilling({ env, store, now });
  createServer(createProHandler({ store, llm, env, now, billing })).listen(port, () => {
    const paid = billing.available ? `on (${billing.providerName})` : "dark";
    console.log(`einvoice-preflight pro API on :${port} (store: ${kind}, explanations: ${llm ? "templates + model" : "templates only"}, paid plans: ${paid})`);
  });
}
