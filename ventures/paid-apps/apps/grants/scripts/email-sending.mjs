#!/usr/bin/env node
// Makes Cloudflare Email Service's sending domains match email-sending.json (docs/EMAIL.md), so the
// sender domain is code, not dashboard clicks. Dry run unless APPLY=1.
//
//   node scripts/email-sending.mjs              # show what exists, what would change, DNS to add
//   APPLY=1 node scripts/email-sending.mjs      # create missing domains, fix settings, show DNS status
//
// Cloudflare writes the DNS records itself when a domain is onboarded (SPF, DKIM and MX on
// `cf-bounce.<domain>`, plus `_dmarc` with p=reject only if the domain has no DMARC record yet), so
// this script never edits DNS directly. The dry run prints those records from the API's preview.
//
// Needs CLOUDFLARE_API_TOKEN with the zone permission "Email Sending Write" (the API schema's token
// group; the deploy token may not have it). Optional CLOUDFLARE_ZONE_ID skips the zone lookup, which
// otherwise also needs Zone Read.
// API: /zones/{zone_id}/email/sending/subdomains (Cloudflare API schema, 2026-11).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SETTINGS = ["drop_suppressed_recipients", "preview_enabled"];

/** What to do for each desired domain, given what Cloudflare already has. Pure; tested. */
export function plan(desired, existing) {
  const byName = new Map(existing.map((d) => [String(d.name).toLowerCase(), d]));
  return desired.map((want) => {
    const name = String(want.name).toLowerCase();
    const have = byName.get(name);
    const settings = Object.fromEntries(SETTINGS.filter((k) => k in want).map((k) => [k, want[k]]));
    if (!have) return { action: "create", name, settings };
    if (have.enabled === false)
      return { action: "create", name, settings, tag: have.tag, reenable: true };
    const changed = Object.fromEntries(Object.entries(settings).filter(([k, v]) => have[k] !== v));
    return Object.keys(changed).length
      ? { action: "update", name, tag: have.tag, settings: changed }
      : { action: "ok", name, tag: have.tag };
  });
}

/** Checks the config file's shape; returns a list of problems. Pure; tested. */
export function validateConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg.zone !== "string" || !cfg.zone) errors.push("zone must be a domain name");
  if (!Array.isArray(cfg?.domains) || cfg.domains.length === 0)
    errors.push("domains must be a non-empty list");
  for (const d of cfg?.domains ?? []) {
    const n = String(d?.name ?? "").toLowerCase();
    if (!n || !(n === cfg.zone || n.endsWith(`.${cfg.zone}`)))
      errors.push(`${n || "(empty)"}: not in zone ${cfg.zone}`);
    for (const k of SETTINGS)
      if (k in d && typeof d[k] !== "boolean") errors.push(`${n}: ${k} must be true or false`);
  }
  return errors;
}

async function main() {
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const cfg = JSON.parse(readFileSync(resolve(appDir, "email-sending.json"), "utf8"));
  const problems = validateConfig(cfg);
  if (problems.length) throw new Error(`email-sending.json: ${problems.join("; ")}`);
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not set");
  const apply = process.env.APPLY === "1";
  const api = "https://api.cloudflare.com/client/v4";
  const call = async (method, path, body) => {
    const res = await fetch(api + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      const msg = (json.errors ?? []).map((e) => `${e.code} ${e.message}`).join("; ");
      throw new Error(`${method} ${path}: HTTP ${res.status} ${msg}`.trim());
    }
    return json.result;
  };

  let zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!zoneId) {
    const zones = await call("GET", `/zones?name=${encodeURIComponent(cfg.zone)}`);
    zoneId = zones?.[0]?.id;
    if (!zoneId)
      throw new Error(`zone ${cfg.zone} is not on this account (or the token cannot read it)`);
  }
  const base = `/zones/${zoneId}/email/sending/subdomains`;
  const existing = (await call("GET", base)) ?? [];
  console.log(`${apply ? "Applying" : "Dry run (APPLY=1 to change)"}: zone ${cfg.zone}`);

  for (const step of plan(cfg.domains, existing)) {
    if (step.action === "ok") {
      console.log(`ok      ${step.name}`);
    } else if (step.action === "update") {
      console.log(`update  ${step.name} ${JSON.stringify(step.settings)}`);
      if (apply) await call("PATCH", `${base}/${step.tag}`, step.settings);
    } else {
      console.log(
        `${step.reenable ? "enable " : "create "} ${step.name} ${JSON.stringify(step.settings)}`,
      );
      if (!apply) {
        const preview = await call("POST", `${base}/preview`, { name: step.name });
        console.log("  Cloudflare would add these DNS records:");
        console.log(JSON.stringify(preview, null, 2).replace(/^/gm, "  "));
        continue;
      }
      const created = await call("POST", base, { name: step.name });
      step.tag = created?.tag ?? step.tag;
      if (Object.keys(step.settings).length)
        await call("PATCH", `${base}/${step.tag}`, step.settings);
    }
    if (step.tag) {
      const status = await call("GET", `${base}/${step.tag}/dns/status`).catch((e) => ({
        error: String(e.message),
      }));
      console.log(`  DNS status: ${JSON.stringify(status)}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(String(e.message ?? e));
    process.exit(1);
  });
}
