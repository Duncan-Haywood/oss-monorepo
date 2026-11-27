// @ts-check
// Paid HTTP API: explained findings, safe fixes, accountant workspace, API keys, metering.
// Proprietary (see ../LICENSE, part 2). No npm dependencies (node:http; packages/billing from this repo).
//
//   node pro/server.mjs            PORT (8790), PRO_DB_FILE (SQLite database, the production store),
//                                  PRO_DATA_FILE (one JSON file, single process; memory if neither),
//                                  ADMIN_TOKEN (creates accounts), ADMIN_SERVICE_TOKEN (owner console reads,
//                                  admin.mjs; >= 32 chars), ADMIN_METRICS_TOKEN (agents: read-only,
//                                  /v1/admin/metrics only; >= 32 chars), ANTHROPIC_API_KEY + LLM_MODEL
//                                  (optional long-tail explanations), FAKE_LLM=true (offline demo),
//                                  Paid plans (dark until set, docs/BILLING.md): BILLING_PROVIDER=paddle,
//                                  BILLING_API_KEY, BILLING_WEBHOOK_SECRET, BILLING_PRICE_IDS,
//                                  CHECKOUT_SECRET, APP_URL; FAKE_EXTERNALS=true for the signed fake.
//
// Auth: `Authorization: Bearer <api key>`. Keys are shown once and stored as SHA-256 only.
// Errors: { error: { code, message } }. Lists: { items, nextCursor? }.
//
//   GET    /healthz
//   GET    /app, /app/app.js, /app/app.css, /app/workspace-lib.mjs   the accountant workspace page (pro/web/)
//   GET    /app/terms, /app/privacy, /app/dpa  the Terms of Service, Privacy Policy and Data Processing
//                                            Agreement (pro/legal/*.md); /app/de/... and /app/fr/...
//                                            serve the translations (the English text governs)
//   GET    /app/notices                      the third-party notices and licences (rule sets, code, fonts), text
//   GET    /v1/legal                         -> {terms: {title, version, url}, privacy: {...}, dpa: {...}}   (public)
//   POST   /v1/signup                        {name, acceptTerms: true, termsVersion?} -> 201 {account, apiKey}  (public trial
//                                            sign-up; the account records the terms version accepted, and a stale
//                                            termsVersion (the page was open across a change) gets 409 terms_changed;
//                                            PUBLIC_SIGNUP=off disables it; per-IP and daily caps:
//                                            SIGNUP_PER_IP_PER_HOUR (5), SIGNUP_PER_DAY (200); TRUST_PROXY=1 reads
//                                            the client IP from the last X-Forwarded-For entry)
//   POST   /v1/admin/accounts                {name, plan?} -> 201 {account, apiKey}   (ADMIN_TOKEN)
//   POST   /v1/admin/usage/settle            {period: "YYYY-MM"} -> {period, results}   (ADMIN_TOKEN): bills a
//                                            closed month's metered usage above the minimum (billing.mjs)
//   GET    /v1/admin/metrics?days=           -> ProductAdminMetrics (packages/admin-metrics)
//   GET    /v1/admin/accounts?list=recent|trials|churn&limit=   -> AdminAccountsPage
//                                            Both also at /api/admin/*, the other products' path. Owner console
//                                            only: ADMIN_SERVICE_TOKEN (not ADMIN_TOKEN); ADMIN_METRICS_TOKEN reads
//                                            metrics only (accounts 403); every read audited (admin.mjs)
//   GET    /v1/billing/plans                 -> {available, items}                 (public: the pricing table)
//   POST   /v1/billing/webhook               Paddle notifications (signature-verified, unauthenticated)
//   GET    /v1/account                       -> {account, plan, usage, subscription, graceUntil, billing}
//   POST   /v1/billing/checkout              {plan, interval?, email, promoCode?} -> 201 {url}
//   POST   /v1/billing/portal                -> {url} (manage or cancel the subscription)
//   GET    /v1/billing/usage?period=YYYY-MM  -> the month's metered statement (plans.mjs meterStatement) and
//                                            its settlement; any plan may read it, only `api` is billed by it
//   GET    /v1/keys | POST /v1/keys {name} | DELETE /v1/keys/:id
//   POST   /v1/check?lang=de|fr|en|nl|pl&profile=&fix=1&name=&explain=0   raw body = one invoice   (1 unit)
//                                            explain=0: plain validation, the checker's own English text,
//                                            `explained: false`, never the `api` plan's explained unit;
//                                            with fix=1 it is 400 invalid (also on batches)
//   POST   /v1/convert?profile=          raw body = one plain PDF invoice -> the creator's draft, each value
//                                            with its source line (pro/pdf-draft.mjs; unmetered)
//   POST   /v1/convert/build?lang=        {draft, format: facturx|cii|ubl, profile: en16931|xrechnung|peppol}
//                                            -> {ok, filename, contentType, content (base64), totals, check}
//                                            (1 unit, by the SHA-256 of the XML); ok: false + errors, unmetered.
//                                            clientId (optional) also saves the built and checked file to that
//                                            client's history as a one-file run (+ run in the answer); a file
//                                            already built this month is not charged again, so building, then
//                                            saving, costs one unit
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
// x-usage-explained-used/-limit; on the metered `api` plan also x-usage-amount-cents (this month so
// far, before the minimum). An invoice whose check finds errors is marked once a month
// (errorDocuments): the `api` plan's explained unit.
//   GET    /v1/clients/:id/history?limit=&before=      -> {items: Run[], nextCursor}
//   GET    /v1/clients/:id/runs/:runId
//   GET    /v1/dashboard?days=30&format=json|csv&lang=   -> Dashboard (pro/dashboard.mjs): every client's
//                                            status, pass rate, still-failing files and top rules over the
//                                            window, attention first; CSV is one row per client. Unmetered.
//
// Email sign-in (pro/email.mjs; off, 503 email_unavailable, unless a mailer and APP_URL are set):
//   GET    /v1/signin/options                -> {email: boolean}                   (public)
//   POST   /v1/account/email                 {email, lang?} -> 202: a verification link (24 h) goes to the address
//   DELETE /v1/account/email                 -> 204: the account has no sign-in address any more
//   POST   /v1/email/verify                  {token} -> {email} (public: the link may open in another browser);
//                                            409 email_in_use if another account verified it first
//   POST   /v1/signin/email                  {email, lang?} -> 202 {sent: true} whatever the address (no account
//                                            enumeration); a link (15 min, once) goes only to a verified address.
//                                            Caps: per client IP, and 3 links an hour / 10 a day per address
//   POST   /v1/signin/redeem                 {token} -> 201 {account, apiKey}: a new key named "email sign-in";
//                                            at the plan's key limit it replaces the oldest earlier "email sign-in"
//                                            key, or, with none, is the one key allowed over the limit (recovery)
// Links carry the token in the URL fragment (`/app#signin=...`), which browsers never send to a server
// or a Referer, and only the POST uses it, so a mail scanner that opens the link cannot.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { generateFacturX } from "../facturx-pdf.mjs";
import { generateInvoice } from "../generate.mjs";
import { isBlocking } from "../report.mjs";
import { AdminError, adminRead } from "./admin.mjs";
import { readAppFile, readAppText } from "./app-files.mjs";
import { BillingError, createBilling } from "./billing.mjs";
import { checkInvoice, sha256 } from "./check.mjs";
import { buildDashboard, dashboardCsv, dashboardDays, runsSince } from "./dashboard.mjs";
import { mailerFromEnv, message, normalizeEmail } from "./email.mjs";
import { loadLegal } from "./legal.mjs";
import { loadLlmFromEnv } from "./llm.mjs";
import { draftFromPdf } from "./pdf-draft.mjs";
import { meterStatement, periodOf, PLANS } from "./plans.mjs";
import { openSqliteStore } from "./sql-store.mjs";
import { FileStore, MemoryStore } from "./store.mjs";

const MAX_BODY = 30 * 1024 * 1024;
const MAX_BATCH = 50;
const MAX_FILE = 1_048_576;
/** A plain PDF for the converter: letterhead logos make these bigger than an XML invoice. */
const MAX_PDF = 5 * 1_048_576;
const MAX_WEBHOOK = 256 * 1024;
const VERIFY_TTL_MS = 24 * 3_600_000;
const SIGNIN_TTL_MS = 15 * 60_000;
const LINKS_PER_ADDRESS_PER_HOUR = 3;
const LINKS_PER_ADDRESS_PER_DAY = 10;
/** The name of a key made by an email sign-in; at the key limit the oldest such key is replaced. */
export const EMAIL_KEY_NAME = "email sign-in";

/** The workspace page's files, read once on first use (pro/app-files.mjs: the disk, or a Worker's embedded copy). */
const WEB_FILES = [
  ["/app", "index.html", "text/html; charset=utf-8"],
  ["/app/app.js", "app.js", "text/javascript; charset=utf-8"],
  ["/app/workspace-lib.mjs", "workspace-lib.mjs", "text/javascript; charset=utf-8"],
  ["/app/app.css", "app.css", "text/css; charset=utf-8"],
];
/** @type {Record<string, { type: string, body: Buffer }> | null} */
let webCache = null;
const web = () =>
  (webCache ??= Object.fromEntries(
    WEB_FILES.map(([path, file, type]) => {
      const bytes = readAppFile(`pro/web/${file}`);
      if (!bytes) throw new Error(`missing pro/web/${file}`);
      return [path, { type, body: Buffer.from(bytes) }];
    }),
  ));
/** The notices and licences of the third-party rule sets, code and fonts the Service runs, in the order shown. */
export const NOTICE_FILES = ["plain/NOTICE.txt", "plain/fontoxpath.LICENSE.txt", "plain/xspattern.LICENSE.txt", "plain/prsc.LICENSE.txt", "fonts/OFL.txt"];
/** Rule sets a host may leave out (worker/build.mjs EXCLUDED); the notices page says which are not run. */
const OPTIONAL_SETS = [["plain/cius-hr-ubl.json", "Croatia's HR-CIUS rules"], ["plain/zatca-ksa-ubl.json", "ZATCA's rules"]];
/**
 * GET /app/notices: the attribution the rule sets' licences ask for (EUPL-1.2 and MPL-2.0 count use over
 * a network; Apache-2.0, MIT and the OFL ask for their notices), with a line on the sets this host leaves out.
 */
export function noticesText() {
  const left = OPTIONAL_SETS.filter(([f]) => readAppFile(f) === null).map(([, what]) => what);
  const head = [
    "Third-party notices: E-invoice Fix & Explain (Maris Stella Labs LLC)",
    "",
    "The checks run the official e-invoicing rules below, unmodified, compiled from their published Schematron.",
    "Each file's source and licence follow. The rule files themselves are published with this product's source code.",
    ...(left.length ? ["", `Not run on this host: ${left.join(" and ")}. A file that names them is reported as not checked.`] : []),
  ];
  const parts = NOTICE_FILES.map((f) => {
    const text = readAppText(f);
    return text === null ? null : `\n==== ${f} ====\n\n${text.trim()}\n`;
  }).filter(Boolean);
  return `${head.join("\n")}\n${parts.join("")}`;
}

/** @type {ReturnType<typeof loadLegal> | null} */
let legalCache = null;
/** The Terms and Privacy Policy (pro/legal/*.md), rendered once; sign-up records the terms version. */
const legal = () => (legalCache ??= loadLegal());
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

const BUILD_FORMATS = ["facturx", "cii", "ubl"];

/** The generator's two PDF fonts (fonts/*.ttf), read once: the disk on Node, the embedded copy in a Worker. */
let fontCache = /** @type {{ regular: Uint8Array, bold: Uint8Array } | null} */ (null);
function pdfFonts() {
  if (fontCache) return fontCache;
  const regular = readAppFile("fonts/PreflightSans-Regular.ttf");
  const bold = readAppFile("fonts/PreflightSans-Bold.ttf");
  if (!regular || !bold) throw new Error("missing fonts/PreflightSans-*.ttf");
  return (fontCache = { regular, bold });
}

/**
 * A confirmed draft to an e-invoice file: Factur-X / ZUGFeRD PDF (CII inside), CII or UBL XML.
 * @param {Record<string, unknown>} draft @param {string} format @param {string} profile @param {Date} date
 * @returns {{ ok: boolean, errors: any[], warnings: any[], totals?: any, xml: string, pdf?: Uint8Array, filename: string }}
 */
export function buildEinvoice(draft, format, profile, date) {
  if (format === "facturx") {
    const fx = generateFacturX(draft, { profile, fonts: pdfFonts(), date });
    return { ok: fx.ok, errors: fx.errors, warnings: fx.warnings, totals: fx.totals, xml: fx.xml ?? "", pdf: fx.pdf, filename: fx.filename ?? "" };
  }
  const made = generateInvoice(draft, { format, profile });
  return { ok: made.ok, errors: made.errors, warnings: made.warnings, totals: made.totals, xml: made.xml ?? "", filename: made.filename ?? "" };
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

/**
 * The history entry for an e-invoice built on the convert screen: a one-file run like a batch's,
 * marked as converted, with the SHA-256 of its XML as well as of the file (a Factur-X PDF carries
 * its creation time, so the same invoice rebuilt has a new file hash but the same XML hash).
 * Hashes and rule ids only, as for batches: no invoice content is kept.
 * @param {string} clientId @param {any} check @param {{ format: string, xmlSha256: string }} made
 */
export function convertRunOf(clientId, check, made) {
  const file = { ...runFileOf(check), origin: "convert", format: made.format, xmlSha256: made.xmlSha256 };
  return {
    clientId,
    lang: check.lang ?? "en",
    profile: check.profile ?? "",
    totals: { files: 1, passed: file.status === "pass" ? 1 : 0, failed: file.status === "pass" ? 0 : 1, fixable: 0 },
    files: [file],
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

/** A random link token and its stored SHA-256. */
function generateLinkToken() {
  const secret = randomBytes(32).toString("base64url");
  return { secret, hash: hashKey(secret) };
}

/**
 * @param {{ store?: MemoryStore | import("./sql-store.mjs").SqlStore, llm?: import("./llm.mjs").Llm | null, env?: Record<string, string | undefined>, now?: () => Date,
 *   billing?: ReturnType<typeof createBilling>, mailer?: import("./email.mjs").Mailer | null }} [deps]
 */
export function createProHandler(deps = {}) {
  const env = deps.env ?? {};
  const store = deps.store ?? new MemoryStore();
  const llm = deps.llm ?? null;
  const now = deps.now ?? (() => new Date());
  const billing = deps.billing ?? createBilling({ env, store, now });
  const mailer = deps.mailer === undefined ? mailerFromEnv(env) : deps.mailer;
  /** Links are built from APP_URL only, never from the request's Host header. */
  const appUrl = /^https?:\/\/[^\s/?#]+$/.test((env.APP_URL ?? "").replace(/\/+$/, "")) ? (env.APP_URL ?? "").replace(/\/+$/, "") : "";
  const emailOn = Boolean(mailer && appUrl);
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
  /** Public link requests (sign-in and verification sends), per client IP and per day. */
  const linkRequests = signupLimiter({ perIpPerHour: 10, perDay: 1000, now });

  function requireEmail() {
    if (!emailOn) throw new HttpError(503, "email_unavailable", "Email sign-in is not set up on this server; sign in with an API key.");
  }

  /**
   * Create a one-time link for `email` and send it, unless the address is over its caps. The
   * send is not awaited, so the answer takes about as long whether or not a message goes out.
   * @param {import("./store.mjs").Account} account @param {"verify" | "signin"} kind @param {string} email @param {unknown} lang
   */
  async function sendLink(account, kind, email, lang) {
    const t = now().getTime();
    const hour = await store.countEmailTokensSince(email, new Date(t - 3_600_000).toISOString());
    const day = await store.countEmailTokensSince(email, new Date(t - 86_400_000).toISOString());
    if (hour >= LINKS_PER_ADDRESS_PER_HOUR || day >= LINKS_PER_ADDRESS_PER_DAY) return false;
    const tok = generateLinkToken();
    const ttl = kind === "verify" ? VERIFY_TTL_MS : SIGNIN_TTL_MS;
    await store.createEmailToken(account.id, { kind, email, hash: tok.hash, expiresAt: new Date(t + ttl).toISOString() });
    const link = `${appUrl}/app#${kind}=${tok.secret}`;
    const msg = message(kind, lang, { firm: account.name, link });
    mailer?.send({ to: email, ...msg }).catch((e) => console.error("einvoice-pro: email send failed", e instanceof Error ? e.message.slice(0, 200) : "unknown"));
    return true;
  }

  /** @param {unknown} v */
  const linkToken = (v) => (typeof v === "string" && /^[\w-]{20,100}$/.test(v) ? v : null);

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
    // explain=0: plain validation, billed on the `api` plan at the validation rate even when the
    // file has errors (no explanations, no fixes: those are the explained unit).
    explain: !["0", "false"].includes(url.searchParams.get("explain") ?? ""),
  });

  /** @param {URL} url */
  function checkOptionsFor(url) {
    const o = checkOptions(url);
    if (!o.explain && o.fix) throw new HttpError(400, "invalid", "fix=1 needs explanations; drop explain=0 to get safe fixes.");
    return o;
  }

  /**
   * Invoices whose check found errors, once each a month (the metered plan's explained unit). A
   * plain check (explain=0, `explained: false`) is not marked: it stays a validation unit, and a
   * later explained check of the same file that month marks it then.
   * @param {import("./store.mjs").Account} account @param {[hash: string, result: { status: string, explained?: boolean }][]} checked
   */
  async function markErrors(account, checked) {
    const failed = checked.filter(([, r]) => r.status !== "pass" && r.explained !== false).map(([hash]) => hash);
    if (failed.length) await store.markDocumentsWithErrors(account.id, periodOf(now()), failed);
  }

  /** @param {import("./store.mjs").Account} account @param {import("./plans.mjs").Plan} plan @param {number} charged */
  async function usageHeaders(account, plan, charged) {
    const u = await store.getUsage(account.id, periodOf(now()));
    return {
      ...(plan.metered ? { "x-usage-amount-cents": String(meterStatement(u).usageCents) } : {}),
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
    const LEGAL = legal();
    const WEB = web();
    if (method === "GET" && (m = /^\/app\/(?:(de|fr)\/)?(terms|privacy|dpa)$/.exec(p))) {
      const doc = LEGAL[/** @type {import("./legal.mjs").LegalKey} */ (m[2])];
      const shown = m[1] ? doc.translations[/** @type {import("./legal.mjs").LegalLang} */ (m[1])] : doc;
      // No current translation (left behind by a change to the English text): the English page.
      if (!shown) return { status: 302, body: null, headers: { location: `/app/${m[2]}` } };
      return {
        status: 200,
        raw: Buffer.from(shown.page),
        headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": WEB_CSP, "referrer-policy": "no-referrer", "cache-control": "no-cache" },
      };
    }
    if (method === "GET" && p === "/app/notices") {
      return {
        status: 200,
        raw: Buffer.from(noticesText()),
        headers: { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-cache" },
      };
    }
    if (method === "GET" && p === "/v1/legal") {
      const meta = (/** @type {import("./legal.mjs").LegalKey} */ k) => ({
        title: LEGAL[k].title,
        version: LEGAL[k].version,
        url: `/app/${k}`,
        // Convenience translations; the English text at `url` governs.
        translations: Object.fromEntries(Object.entries(LEGAL[k].translations).map(([lang, d]) => [lang, { title: d.title, url: `/app/${lang}/${k}` }])),
      });
      return { status: 200, body: { terms: meta("terms"), privacy: meta("privacy"), dpa: meta("dpa") } };
    }
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
      if (body.termsVersion !== undefined && body.termsVersion !== LEGAL.terms.version)
        throw new HttpError(409, "terms_changed", `The Terms changed (version ${LEGAL.terms.version}); read /app/terms and accept again.`);
      const verdict = signups.take(clientIp(req));
      if (verdict !== "ok")
        throw new HttpError(429, "signup_limited", verdict === "ip" ? "Too many sign-ups from this address; try again in an hour." : "Sign-up is busy today; try again tomorrow.");
      const account = await store.createAccount({ name, plan: "trial", termsVersion: LEGAL.terms.version });
      const k = generateApiKey();
      await store.createApiKey(account.id, { name: "default", prefix: k.prefix, hash: k.hash });
      return { status: 201, body: { account, apiKey: k.secret } };
    }

    if (method === "GET" && p === "/v1/signin/options") return { status: 200, body: { email: emailOn } };

    if (method === "POST" && p === "/v1/signin/email") {
      requireEmail();
      const body = json(await readBody(req, 4096));
      const email = normalizeEmail(body.email);
      if (!email) throw new HttpError(400, "invalid", "email must be one email address.");
      if (linkRequests.take(clientIp(req)) !== "ok") throw new HttpError(429, "rate_limited", "Too many requests from this address; try again in an hour.");
      const account = await store.findAccountByEmail(email);
      if (account) await sendLink(account, "signin", email, body.lang);
      return { status: 202, body: { sent: true } };
    }

    if (method === "POST" && p === "/v1/signin/redeem") {
      requireEmail();
      const body = json(await readBody(req, 4096));
      const secret = linkToken(body.token);
      const tok = secret ? await store.consumeEmailToken("signin", hashKey(secret)) : null;
      const account = tok ? await store.getAccount(tok.accountId) : null;
      // the address must still be the account's: removing or changing it cancels links already sent
      if (!tok || !account || account.email !== tok.email) throw new HttpError(400, "invalid_link", "This sign-in link has expired or was already used. Ask for a new one.");
      const ent = await billing.entitlement(account);
      const keys = await store.listApiKeys(account.id);
      if (keys.length >= ent.plan.apiKeys) {
        const oldest = keys.filter((k) => k.name === EMAIL_KEY_NAME).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
        if (oldest) await store.revokeApiKey(account.id, oldest.id);
      }
      const k = generateApiKey();
      await store.createApiKey(account.id, { name: EMAIL_KEY_NAME, prefix: k.prefix, hash: k.hash });
      return { status: 201, body: { account, apiKey: k.secret } };
    }

    if (method === "POST" && p === "/v1/email/verify") {
      requireEmail();
      const body = json(await readBody(req, 4096));
      const secret = linkToken(body.token);
      const tok = secret ? await store.consumeEmailToken("verify", hashKey(secret)) : null;
      if (!tok) throw new HttpError(400, "invalid_link", "This confirmation link has expired or was already used. Ask for a new one in the workspace.");
      const r = await store.setAccountEmail(tok.accountId, tok.email);
      if (r === "taken") throw new HttpError(409, "email_in_use", "Another workspace account already signs in with this address.");
      if (r !== "ok") throw new HttpError(400, "invalid_link", "This confirmation link is no longer valid.");
      return { status: 200, body: { email: tok.email } };
    }

    if (method === "GET" && p === "/v1/billing/plans") {
      return { status: 200, body: { available: billing.available, items: billing.plans() } };
    }
    if (method === "POST" && p === "/v1/billing/webhook") {
      return billing.webhook(webRequest(req, await readBody(req, MAX_WEBHOOK)));
    }

    if (method === "GET" && (m = /^\/(?:v1|api)\/admin\/(metrics|accounts)$/.exec(p))) {
      const what = m[1] === "metrics" ? "metrics" : "accounts";
      return { status: 200, body: await adminRead(what, url, req.headers.authorization, { store, env, now }) };
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

    if (method === "POST" && p === "/v1/admin/usage/settle") {
      const admin = env.ADMIN_TOKEN;
      const given = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "")?.[1] ?? "";
      if (!admin || !given || !sameSecret(given, admin)) throw new HttpError(401, "unauthorized", "Admin token required.");
      const body = json(await readBody(req, 4096));
      return { status: 200, body: await billing.settleUsage(typeof body.period === "string" ? body.period : "") };
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
          ...(plan.metered ? { meter: await billing.usageStatement(account, periodOf(now())) } : {}),
          subscription: ent.subscription,
          graceUntil: ent.graceUntil,
          billing: { available: billing.available, plans: billing.plans().filter((x) => x.purchasable) },
        },
      };
    }

    if (p === "/v1/account/email") {
      if (method === "POST") {
        requireEmail();
        const body = json(await readBody(req, 4096));
        const email = normalizeEmail(body.email);
        if (!email) throw new HttpError(400, "invalid", "email must be one email address.");
        if (account.email === email) return { status: 200, body: { email, verified: true } };
        const sent = await sendLink(account, "verify", email, body.lang);
        if (!sent) throw new HttpError(429, "rate_limited", "Too many links were sent to this address; try again later.");
        return { status: 202, body: { email, verified: false } };
      }
      if (method === "DELETE") {
        await store.setAccountEmail(account.id, null);
        return { status: 204, body: null };
      }
    }

    if (method === "POST" && p === "/v1/billing/checkout") {
      return { status: 201, body: await billing.checkout(account, json(await readBody(req, 16 * 1024))) };
    }
    if (method === "POST" && p === "/v1/billing/portal") {
      return { status: 200, body: await billing.portal(account) };
    }
    if (method === "GET" && p === "/v1/billing/usage") {
      const period = url.searchParams.get("period") ?? periodOf(now());
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new HttpError(400, "invalid", "period must be YYYY-MM.");
      return { status: 200, body: { metered: Boolean(plan.metered), ...(await billing.usageStatement(account, period)) } };
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
        checkInvoice({ name, source }, { ...checkOptionsFor(url), ...llmFor(account, plan)(hash), cache: boundedCache }),
      );
      await markErrors(account, [[hash, result]]);
      return { status: 200, body: result, headers: await usageHeaders(account, plan, charged) };
    }

    if (method === "POST" && p === "/v1/convert") {
      // PDF to ZUGFeRD, part 1: a plain PDF invoice in, the creator's draft out with the line each
      // value was read from (pdf-draft.mjs). Deterministic, no model; not metered (nothing is checked
      // yet: the e-invoice made from the draft is metered when it is checked).
      const bytes = await readBody(req, MAX_PDF);
      if (!bytes.length) throw new HttpError(400, "invalid", "Send one PDF invoice as the request body.");
      if (bytes.length > MAX_PDF) throw new HttpError(413, "too_large", `A PDF may be at most ${MAX_PDF} bytes.`);
      const profileParam = url.searchParams.get("profile") ?? "en16931";
      if (!["en16931", "xrechnung", "peppol"].includes(profileParam)) throw new HttpError(400, "invalid", "profile is en16931, xrechnung or peppol.");
      const result = await draftFromPdf(new Uint8Array(bytes), { profile: profileParam });
      if (result.reason === "not_pdf") throw new HttpError(415, "not_pdf", "The body is not a PDF.");
      return { status: 200, body: { profile: profileParam, ...result } };
    }

    if (method === "POST" && p === "/v1/convert/build") {
      // PDF to ZUGFeRD, part 2: the draft the person confirmed and completed on the workspace's
      // convert screen, written as Factur-X / ZUGFeRD (PDF), CII or UBL XML by the same creator the
      // free generator uses, then checked like POST /v1/check. A draft the creator cannot build
      // answers 200 with ok: false and its errors, unmetered. A built file costs one unit, counted
      // by the SHA-256 of its XML (the Factur-X PDF carries its creation time, so the same invoice
      // rebuilt would otherwise count again).
      const body = json(await readBody(req, MAX_FILE));
      if (!body || typeof body !== "object" || !body.draft || typeof body.draft !== "object" || Array.isArray(body.draft))
        throw new HttpError(400, "invalid", 'Send {"draft": {...}, "format": "facturx" | "cii" | "ubl", "profile": "en16931" | "xrechnung" | "peppol"}.');
      const format = body.format ?? "facturx";
      if (!BUILD_FORMATS.includes(format)) throw new HttpError(400, "invalid", "format is facturx, cii or ubl.");
      const profileParam = body.profile ?? "en16931";
      if (!["en16931", "xrechnung", "peppol"].includes(profileParam)) throw new HttpError(400, "invalid", "profile is en16931, xrechnung or peppol.");
      // Saving to a client's history (part 3): the client is looked up before anything is built or
      // metered, so a wrong id costs nothing; the run records what this server built and checked,
      // never a result the browser sends.
      let client = null;
      if (body.clientId !== undefined && body.clientId !== null && body.clientId !== "") {
        if (typeof body.clientId !== "string" || !/^[\w-]{1,100}$/.test(body.clientId)) throw new HttpError(400, "invalid", "clientId must be a client's id.");
        client = await store.getClient(account.id, body.clientId);
        if (!client) throw new HttpError(404, "not_found", "No such client.");
      }
      const made = buildEinvoice(body.draft, format, profileParam, now());
      if (!made.ok) return { status: 200, body: { ok: false, format, profile: profileParam, errors: made.errors, warnings: made.warnings } };
      const source = made.pdf ?? made.xml;
      const hash = sha256(made.xml);
      const opts = { ...checkOptions(url), profile: profileParam === "en16931" ? "auto" : profileParam, schematron: true, fix: false };
      const { value: check, charged } = await metered(account, plan, [hash], () =>
        checkInvoice({ name: made.filename, source }, { ...opts, ...llmFor(account, plan)(hash), cache: boundedCache }),
      );
      await markErrors(account, [[hash, check]]);
      const run = client ? await store.addRun(account.id, convertRunOf(client.id, check, { format, xmlSha256: hash })) : undefined;
      return {
        status: 200,
        body: {
          ok: true,
          format,
          profile: profileParam,
          filename: made.filename,
          contentType: made.pdf ? "application/pdf" : "application/xml",
          content: Buffer.from(made.pdf ?? made.xml).toString("base64"),
          totals: made.totals,
          warnings: made.warnings,
          check,
          ...(run ? { run } : {}),
        },
        headers: await usageHeaders(account, plan, charged),
      };
    }
    if (method === "GET" && p === "/v1/dashboard") {
      const days = dashboardDays(url.searchParams.get("days") ?? undefined);
      const at = now();
      const since = new Date(at.getTime() - days * 86_400_000).toISOString();
      const clients = await store.listClients(account.id);
      const runsByClient = new Map();
      const lastByClient = new Map();
      for (const c of clients) {
        const { runs, last } = await runsSince(store, account.id, c.id, since);
        runsByClient.set(c.id, runs);
        lastByClient.set(c.id, last);
      }
      const dash = buildDashboard({ clients, runsByClient, lastByClient, now: at, days });
      if (url.searchParams.get("format") === "csv") {
        const lang = /** @type {"de" | "fr" | "en" | "nl" | "pl"} */ (["de", "fr", "nl", "pl"].includes(url.searchParams.get("lang") ?? "") ? url.searchParams.get("lang") : "en");
        return {
          status: 200,
          raw: Buffer.from(dashboardCsv(dash, lang), "utf8"),
          headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="clients-${at.toISOString().slice(0, 10)}.csv"` },
        };
      }
      return { status: 200, body: dash };
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
        const opts = { ...checkOptionsFor(url), cache: boundedCache };
        const llmForInvoice = llmFor(account, plan);
        const hashes = inputs.map((input) => sha256(input.source));
        const { value: results, charged } = await metered(account, plan, hashes, async () => {
          const out = [];
          for (const [i, input] of inputs.entries()) out.push(await checkInvoice(input, { ...opts, ...llmForInvoice(hashes[i]) }));
          return out;
        });
        await markErrors(account, results.map((r, i) => [hashes[i], r]));
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
      if (e instanceof HttpError || e instanceof BillingError || e instanceof AdminError) out = { status: e.status, body: { error: { code: e.code, message: e.message } } };
      else {
        // Cut short, as the other logs are: a parser's message can quote the invoice it read.
        console.error("einvoice-pro: internal error", e instanceof Error ? e.message.slice(0, 200) : "unknown");
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
  const mailer = mailerFromEnv(env);
  createServer(createProHandler({ store, llm, env, now, billing, mailer })).listen(port, () => {
    const paid = billing.available ? `on (${billing.providerName})` : "dark";
    const email = mailer && env.APP_URL ? `on (${mailer.name})` : "off";
    console.log(`einvoice-preflight pro API on :${port} (store: ${kind}, explanations: ${llm ? "templates + model" : "templates only"}, paid plans: ${paid}, email sign-in: ${email})`);
  });
}
