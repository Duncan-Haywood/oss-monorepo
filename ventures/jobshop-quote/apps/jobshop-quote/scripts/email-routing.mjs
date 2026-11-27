#!/usr/bin/env node
// Inbound RFQ email routing as code (docs/EMAIL.md, "Routing as code"; owner, 2026-10-31: everything as
// code). Makes Cloudflare Email Routing match email-routing.json and is safe to re-run:
//
//   1. Email Routing on for the inbound domain. A subdomain is added with POST /email/routing/dns
//      {name}, and Cloudflare writes and locks its MX and SPF records itself.
//   2. Subaddressing (plus addressing, RFC 5233) on for the zone: PATCH /email/routing
//      {support_subaddress: true}. It is a zone setting, so it also lets `support+x@` reach the
//      `support@` rule of any other app on the zone; nothing is lost by that.
//   3. One literal rule `rfq@<domain>` whose action is the `jobshop-quote` Worker. With subaddressing,
//      every shop's `rfq+<token>@<domain>` matches it.
//
// Why not a catch-all: Cloudflare's catch-all rule exists only for the apex domain ("Catch-all rules are
// only available for the apex domain", cloudflare-docs email-service/configuration/subdomains.mdx, read
// 2026-11-26), and the zone's apex already routes the portfolio's own addresses. A literal rule cannot
// list random per-shop tokens, so the token rides in the subaddress.
//
// The rule is named with RULE_PREFIX so this script never edits a rule someone made by hand; a rule by
// another name for the same address is reported and left alone (Cloudflare would match either).
//
//   node scripts/email-routing.mjs              # dry run: what exists, what would change
//   APPLY=1 node scripts/email-routing.mjs      # make the changes
//
// Needs CLOUDFLARE_API_TOKEN with Zone → Email Routing Rules: Edit and Zone → Zone Settings: Edit
// (enabling and subaddressing), plus Zone Read unless CLOUDFLARE_ZONE_ID is set. Writes `domain` to
// $GITHUB_OUTPUT as `inbound_domain` once everything matches (after APPLY=1, or a dry run with no
// changes), so the deploy turns inbound email on only when mail can actually arrive.
// API shapes: Cloudflare API schema (github.com/cloudflare/api-schemas, openapi.json, read 2026-11-26).
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const API = "https://api.cloudflare.com/client/v4";
export const RULE_PREFIX = "as-code jobshop-quote: ";
const HOST = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Problems with the config file; empty when it is usable. Pure; tested. */
export function validateConfig(cfg) {
  const errors = [];
  const zone = String(cfg?.zone ?? "");
  const domain = String(cfg?.domain ?? "");
  if (!HOST.test(zone)) errors.push("zone must be a lowercase domain name");
  if (!HOST.test(domain)) errors.push("domain must be a lowercase domain name");
  else if (domain !== zone && !domain.endsWith(`.${zone}`))
    errors.push(`domain ${domain} is not in zone ${zone}`);
  // The app reads `rfq[+-]<token>`, so the rule's local part must be exactly `rfq`.
  if (cfg?.local !== "rfq") errors.push('local must be "rfq" (the app hands out rfq+<token>@)');
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(String(cfg?.worker ?? "")))
    errors.push("worker must be a Worker name");
  return errors;
}

/** The routing rule the config asks for, in the API's shape. Pure; tested. */
export function desiredRule(cfg) {
  const to = `${cfg.local}@${cfg.domain}`;
  return {
    name: `${RULE_PREFIX}${to}`,
    enabled: true,
    matchers: [{ type: "literal", field: "to", value: to }],
    actions: [{ type: "worker", value: [cfg.worker] }],
  };
}

/** A list of objects as JSON with sorted keys, so Cloudflare's key order never reads as drift. */
export function canonical(list) {
  const sort = (v) =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort(v[k])]),
          )
        : v;
  return JSON.stringify(sort(list ?? []));
}

/**
 * Steps to make the zone match. `settings` is GET /email/routing's result, `subdomainOn` whether the
 * inbound subdomain already has Email Routing (always true when domain is the apex), `rules` the zone's
 * rules. Pure; tested.
 */
export function plan(cfg, { settings, subdomainOn, rules }) {
  const steps = [];
  const apex = cfg.domain === cfg.zone;
  if (!settings?.enabled)
    steps.push({ op: "enable-zone", why: `Email Routing is off for ${cfg.zone}` });
  if (!apex && !subdomainOn) steps.push({ op: "enable-subdomain", name: cfg.domain });
  if (settings?.support_subaddress !== true) steps.push({ op: "subaddressing" });

  const want = desiredRule(cfg);
  const to = want.matchers[0].value;
  const mine = (rules ?? []).find((r) => r.name === want.name);
  const others = (rules ?? []).filter(
    (r) =>
      r.name !== want.name &&
      (r.matchers ?? []).some((m) => m.type === "literal" && String(m.value).toLowerCase() === to),
  );
  for (const r of others)
    steps.push({
      op: "warn",
      why: `rule "${r.name}" (not ours) also matches ${to}; left as it is`,
    });
  if (!mine) steps.push({ op: "create-rule", rule: want });
  else if (
    mine.enabled !== true ||
    canonical(mine.matchers) !== canonical(want.matchers) ||
    canonical(mine.actions) !== canonical(want.actions)
  )
    steps.push({ op: "update-rule", id: mine.id, rule: want });
  return steps;
}

/** Steps that change something (warnings do not). */
export const changes = (steps) => steps.filter((s) => s.op !== "warn");

export function client(token, fetchImpl = fetch) {
  return async function cf(method, path, body) {
    const res = await fetchImpl(API + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      const msg = (json.errors ?? [])
        .map((e) => `${e.code ?? ""} ${e.message ?? ""}`.trim())
        .join("; ");
      const err = new Error(`${method} ${path}: HTTP ${res.status} ${msg}`.trim());
      err.status = res.status;
      throw err;
    }
    return json.result;
  };
}

/**
 * Whether the subdomain already has Email Routing: its MX records on Cloudflare's routing hosts. Read from
 * the zone's DNS (needs DNS Read); on a refusal, null (unknown), and enabling is then tried and an
 * "already" error tolerated.
 */
async function subdomainEnabled(cf, zoneId, name) {
  try {
    const mx =
      (await cf(
        "GET",
        `/zones/${zoneId}/dns_records?type=MX&name=${encodeURIComponent(name)}&per_page=50`,
      )) ?? [];
    return mx.some((r) => /\.mx\.cloudflare\.net\.?$/i.test(String(r.content ?? "")));
  } catch {
    return null;
  }
}

/** Runs the plan. Returns the steps and whether the zone now matches. */
export async function run({ cfg, cf, write, zoneId: givenZone, log = console.log }) {
  let zoneId = givenZone;
  if (!zoneId) {
    const zones = await cf("GET", `/zones?name=${encodeURIComponent(cfg.zone)}`);
    zoneId = zones?.[0]?.id;
    if (!zoneId)
      throw new Error(`zone ${cfg.zone} is not on this account (or the token cannot read it)`);
  }
  const settings = await cf("GET", `/zones/${zoneId}/email/routing`);
  const apex = cfg.domain === cfg.zone;
  const known = apex ? true : await subdomainEnabled(cf, zoneId, cfg.domain);
  // Cloudflare pages rules (20 by default, 50 at most); one past the page would look missing.
  const rules = (await cf("GET", `/zones/${zoneId}/email/routing/rules?per_page=50`)) ?? [];
  if (rules.length >= 50)
    throw new Error("50 or more routing rules on the zone: add paging before applying");

  const steps = plan(cfg, { settings, subdomainOn: known === true, rules });
  log(
    `${write ? "Applying" : "Dry run (APPLY=1 to change)"}: ${cfg.local}+<token>@${cfg.domain} -> worker ${cfg.worker}`,
  );
  if (known === null)
    log(
      `  (could not read DNS for ${cfg.domain}; enabling it is tried and "already enabled" accepted)`,
    );
  if (!changes(steps).length) log("  already matches email-routing.json");
  for (const s of steps) {
    const label =
      s.op === "warn"
        ? `warning: ${s.why}`
        : s.op === "enable-zone"
          ? `enable Email Routing on ${cfg.zone}`
          : s.op === "enable-subdomain"
            ? `enable Email Routing on ${s.name} (Cloudflare adds its MX and SPF records)`
            : s.op === "subaddressing"
              ? `turn on subaddressing for ${cfg.zone}`
              : `${s.op === "create-rule" ? "create" : "update"} rule ${s.rule.matchers[0].value} -> ${cfg.worker}`;
    log(`  ${s.op === "warn" || write ? "" : "would "}${label}`);
    if (!write || s.op === "warn") continue;
    if (s.op === "enable-zone") await cf("POST", `/zones/${zoneId}/email/routing/dns`, {});
    else if (s.op === "enable-subdomain") {
      await cf("POST", `/zones/${zoneId}/email/routing/dns`, { name: s.name }).catch((e) => {
        if (known === null && /already/i.test(String(e.message))) return;
        throw e;
      });
    } else if (s.op === "subaddressing")
      await cf("PATCH", `/zones/${zoneId}/email/routing`, { support_subaddress: true });
    else if (s.op === "create-rule")
      await cf("POST", `/zones/${zoneId}/email/routing/rules`, s.rule);
    else await cf("PUT", `/zones/${zoneId}/email/routing/rules/${s.id}`, s.rule);
  }
  const matches = write || changes(steps).length === 0;
  return { steps, matches };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const cfg = JSON.parse(readFileSync(resolve(appDir, "email-routing.json"), "utf8"));
    const problems = validateConfig(cfg);
    if (problems.length) throw new Error(`email-routing.json: ${problems.join("; ")}`);
    const token = (process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
    if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not set");
    const { matches } = await run({
      cfg,
      cf: client(token),
      write: process.env.APPLY === "1",
      zoneId: (process.env.CLOUDFLARE_ZONE_ID ?? "").trim() || undefined,
    });
    if (matches && process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `inbound_domain=${cfg.domain}\n`);
  } catch (e) {
    console.error(String(e?.message ?? e));
    process.exit(1);
  }
}
