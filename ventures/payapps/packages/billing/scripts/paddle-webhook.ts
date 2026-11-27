// Find or create the app's Paddle notification destination and write its signing secret for the
// Worker (BILLING_WEBHOOK_SECRET). Rules: src/paddle-webhook.ts.
//
//   BILLING_API_KEY=pdl_… node packages/billing/scripts/paddle-webhook.ts --app payapps \
//     --app-url https://payapps.marisstella.app --active false [--apply] [--secret-out FILE]
//
// Without --apply it only reads Paddle and prints the plan. The key and the secret are never printed:
// FILE is written with mode 0600 as {"BILLING_WEBHOOK_SECRET": "pdl_ntfset_…"} for `wrangler secret
// bulk`, and the caller deletes it. Exit 0 on success, 1 when Paddle refuses, 2 on bad arguments.
import { writeFileSync } from "node:fs";
import { describeKeyProbe, probePaddleKey } from "../src/paddle-key.ts";
import {
  describeWebhookAction,
  PaddleWebhookClient,
  syncWebhookDestination,
  webhookUrl,
} from "../src/paddle-webhook.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const app = arg("--app") ?? "";
const appUrl = arg("--app-url") ?? "";
const activeArg = arg("--active");
const apply = process.argv.includes("--apply");
const out = arg("--secret-out");
if (
  !/^[a-z][a-z0-9-]{0,31}$/.test(app) ||
  !appUrl ||
  !["true", "false"].includes(activeArg ?? "")
) {
  console.error(
    "usage: paddle-webhook.ts --app ID --app-url URL --active true|false [--apply] [--secret-out FILE]",
  );
  process.exit(2);
}
try {
  webhookUrl(appUrl);
} catch (e) {
  console.error(String((e as Error).message));
  process.exit(2);
}

const rawKey = process.env.BILLING_API_KEY ?? "";
// Shape and environment only (one read): the notification calls report their own permission errors.
const probe = await probePaddleKey(rawKey, { calls: ["list-products"] });
for (const line of describeKeyProbe(probe)) console.log(line);
if (!probe.shape.usable || !probe.baseUrl) {
  console.error("BILLING_API_KEY cannot be used for Paddle (see above)");
  process.exit(2);
}

const client = new PaddleWebhookClient(rawKey.trim(), { baseUrl: probe.baseUrl });
try {
  const r = await syncWebhookDestination(
    client,
    { app, appUrl, active: activeArg === "true" },
    { apply },
  );
  console.log(`${app}: ${probe.environment} Paddle account, ${apply ? "applying" : "plan only"}`);
  console.log(`  ${describeWebhookAction(r.action)}`);
  if (r.id)
    console.log(`  destination ${r.id} -> ${r.destination} (${r.active ? "active" : "inactive"})`);
  if (out && r.secret) {
    writeFileSync(out, JSON.stringify({ BILLING_WEBHOOK_SECRET: r.secret }), { mode: 0o600 });
    console.log(`  signing secret written to ${out} (not printed)`);
  } else if (out) {
    console.log("  no secret yet (plan only): nothing written");
  }
} catch (e) {
  console.error(String((e as Error).message));
  process.exit(1);
}
