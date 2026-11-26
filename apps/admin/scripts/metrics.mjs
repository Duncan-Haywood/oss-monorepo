#!/usr/bin/env node
// Prints a JSON snapshot of every product's AGGREGATE admin metrics, for agents measuring progress:
// sign-up counts, orgs, trials, paid subscriptions, MRR (from Paddle-webhook-recorded prices),
// cancellations, LLM spend, early-access counts, plus cross-product totals. No names or emails:
// it calls only GET <adminUrl>/metrics with the read-only ADMIN_METRICS_TOKEN, which the products
// refuse on /accounts. Unmeasured numbers stay null; an unreachable product is listed, not zeroed.
//
//   ADMIN_PRODUCTS='[…same JSON as the console's PRODUCTS…]' ADMIN_METRICS_TOKEN=… \
//     node apps/admin/scripts/metrics.mjs [--days 30] [--products products.json] [--strict]
//
// --strict exits 2 when any product could not be read. Neither the product list nor the token is
// committed: the token is in AWS Secrets Manager at paid-apps/admin-metrics-token
// (apps/admin/README.md, "Agent access").
import { readFileSync } from "node:fs";
import { buildDashboard } from "../src/aggregate.ts";
import { parseProducts } from "../src/config.ts";
import { productClient } from "../src/products.ts";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const days = Number(arg("--days") ?? "30");
if (!Number.isInteger(days) || days < 1 || days > 366) {
  console.error("--days must be an integer from 1 to 366");
  process.exit(1);
}
const file = arg("--products");
const raw = file ? readFileSync(file, "utf8") : process.env.ADMIN_PRODUCTS;
const cfg = parseProducts(raw);
if (!cfg.ok) {
  console.error(`${cfg.error} (set ADMIN_PRODUCTS or pass --products <file>)`);
  process.exit(1);
}

const readings = await Promise.all(
  cfg.products.map(async (p) => {
    // Read with the metrics token, never the console's full-access token.
    const client = productClient({ ...p, tokenEnv: p.metricsTokenEnv }, process.env);
    return {
      config: p,
      metrics: await client.metrics(days),
      recent: { ok: true, data: { items: [] } },
      trials: null,
      churn: null,
    };
  }),
);
const d = buildDashboard(readings, new Date(), days);
const snapshot = {
  generatedAt: d.generatedAt,
  windowDays: d.windowDays,
  unreadable: d.unreadable,
  totals: d.totals,
  products: d.products.map((p) => ({
    key: p.key,
    name: p.name,
    kind: p.kind,
    ok: p.ok,
    error: p.error,
    mrp: p.mrp,
    metrics: p.metrics,
  })),
};
process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
if (process.argv.includes("--strict") && d.unreadable.length) process.exit(2);
