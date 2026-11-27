// @ts-check
// The paid layer on Cloudflare Workers + D1: the same handler as `node pro/serve.mjs`
// (pro/server.mjs's createProHandler, through pro/fetch-adapter.mjs), with the SqlStore on the
// D1 binding and the official rules on the plain-JS route (fontoxpath + slimdom, the rule sets
// from ./plain/ embedded by worker/build.mjs). Its own folder because it imports slimdom: pro/ stays
// free of npm modules (pro/rules-diff.test.mjs). Proprietary (see ../LICENSE, part 2).
//
// Build and run (docs/HOSTING.md, "On Cloudflare Workers"):
//   npm i --no-save slimdom@4.3.5     the XML parser the plain route needs (MIT; not vendored)
//   node worker/build.mjs             embeds the page, legal texts, fonts and rule sets
//   wrangler dev                      (wrangler.jsonc in the app folder; local D1)
//
// What differs from the Node host, and why it is safe:
// - No Saxon: the official Schematron runs on the plain route for every set. That route agrees
//   with Saxon on the shipped corpora (README, "The browser's official rules read whitespace as
//   Saxon does" and the per-set cross-checks); it is the route the free page already uses.
// - Only the paid half: /healthz, /, /app*, /v1/*, /api/admin/* and the generator's fonts. The
//   free pages stay on the public site; the free JSON API answers 404 as it does on the container.
// - Sign-up caps are per isolate (pro/server.mjs signupLimiter is in memory), so they loosen with
//   the number of isolates; PUBLIC_SIGNUP=off still turns sign-up off.
// - No model explanations unless the SDK is bundled: loadLlmFromEnv imports it by a variable name,
//   so the Worker build leaves it out and every rule falls back to its built-in template.
import { parseXmlDocument } from "slimdom";
import * as fontoxpath from "../plain/fontoxpath.esm.js";
import { configurePlain } from "../plain-node.mjs";
import { provideAppFiles } from "../pro/app-files.mjs";
import { createBilling } from "../pro/billing.mjs";
import { mailerFromEnv } from "../pro/email.mjs";
import { fetchHandlerFor } from "../pro/fetch-adapter.mjs";
import { loadLlmFromEnv } from "../pro/llm.mjs";
import { createProHandler } from "../pro/server.mjs";
import { MAX_BODY, workerRoute } from "./route.mjs";
import { SqlStore, d1Db } from "../pro/sql-store.mjs";
import { BASE64, TEXT } from "./files.generated.mjs";
import { armSettleClock, settleClockClass } from "./settle-clock.mjs";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };

/** @param {string} b64 */
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** @type {Map<string, Uint8Array | string>} */
const files = new Map(Object.entries(TEXT));
for (const [k, v] of Object.entries(BASE64)) files.set(k, fromBase64(v));
provideAppFiles(files);

/** @type {Map<string, unknown>} */
const parsedRules = new Map();
configurePlain({
  fontoxpath,
  parseXml: (/** @type {string} */ xml) => parseXmlDocument(xml),
  // Parsed on first use and kept for the isolate's life: a set is 10 KB to 1 MB of JSON.
  loadRules: async (/** @type {string} */ file) => {
    if (!parsedRules.has(file)) {
      const text = TEXT[/** @type {keyof typeof TEXT} */ (`plain/${file}`)];
      parsedRules.set(file, typeof text === "string" ? JSON.parse(text) : null);
    }
    return parsedRules.get(file);
  },
});

/**
 * Mail is sent without waiting (pro/server.mjs), and a Worker stops work once the response is
 * returned unless it is handed to waitUntil, so sends are tracked and awaited after the response.
 * @param {import("../pro/email.mjs").Mailer | null} mailer
 */
function trackedMailer(mailer) {
  /** @type {Set<Promise<unknown>>} */
  const pending = new Set();
  if (!mailer) return { mailer: null, pending };
  const wrapped = Object.create(mailer);
  wrapped.send = (/** @type {any} */ msg) => {
    const p = mailer.send(msg);
    pending.add(p);
    p.finally(() => pending.delete(p)).catch(() => {});
    return p;
  };
  return { mailer: /** @type {import("../pro/email.mjs").Mailer} */ (wrapped), pending };
}

/** @typedef {Record<string, string | undefined> & { DB: any }} Env */

/** @type {Promise<{ handle: (r: Request, i?: { remoteAddress?: string }) => Promise<Response>, pending: Set<Promise<unknown>> }> | null} */
let app = null;

/** @type {Promise<{ store: SqlStore, billing: ReturnType<typeof createBilling>, now: () => Date }> | null} */
let core = null;

/** The store and billing, once per isolate (shared by the handler and the SettleClock). @param {Env} env */
function coreFor(env) {
  core ??= (async () => {
    if (!env.DB) throw new Error("no D1 binding named DB (wrangler.jsonc)");
    const now = () => new Date();
    const store = await new SqlStore(d1Db(env.DB), { now }).init();
    return { store, billing: createBilling({ env, store, now }), now };
  })();
  core.catch(() => {
    core = null;
  });
  return core;
}

/**
 * The metered plan's month-end settlement on a Durable Object alarm (settle-clock.mjs), since the
 * account's cron triggers are all in use. Bound as SETTLE_CLOCK in wrangler.jsonc.
 */
export const SettleClock = settleClockClass(async (/** @type {Env} */ env) => (await coreFor(env)).billing);

/** One handler per isolate: the store's schema check runs once, not per request. @param {Env} env */
function appFor(env) {
  app ??= (async () => {
    const { store, billing, now } = await coreFor(env);
    const llm = await loadLlmFromEnv(env);
    const { mailer, pending } = trackedMailer(mailerFromEnv(env));
    const pro = createProHandler({ store, llm, env, now, billing, mailer });
    return { handle: fetchHandlerFor(pro, { maxBody: MAX_BODY }), pending };
  })();
  app.catch(() => {
    app = null;
  });
  return app;
}

export default {
  /** @param {Request} request @param {Env} env @param {{ waitUntil: (p: Promise<unknown>) => void }} ctx */
  async fetch(request, env, ctx) {
    ctx.waitUntil(armSettleClock(env));
    const url = new URL(request.url);
    const to = workerRoute(url.pathname, request.method);
    if (to === "font") {
      const font = files.get(url.pathname.slice(1));
      if (!font || typeof font === "string") return new Response(JSON.stringify({ error: { code: "not_found", message: "No such route." } }), { status: 404, headers: JSON_HEADERS });
      return new Response(request.method === "HEAD" ? null : /** @type {BodyInit} */ (/** @type {unknown} */ (font)), { headers: { "content-type": "font/ttf", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
    }
    if (to === "off") {
      return new Response(JSON.stringify({ error: { code: "not_found", message: "The free JSON API is not served here. Use POST /v1/check with an API key." } }), { status: 404, headers: JSON_HEADERS });
    }
    const { handle, pending } = await appFor(env);
    const response = await handle(request, { remoteAddress: request.headers.get("cf-connecting-ip") ?? "unknown" });
    if (pending.size) ctx.waitUntil(Promise.allSettled([...pending]));
    return response;
  },
};
