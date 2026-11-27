// Find or create the app's Paddle client-side token, and set the account's default payment link to
// <APP_URL>/pay when it has none. Rules: src/paddle-checkout-page.ts.
//
//   BILLING_API_KEY=pdl_… node packages/billing/scripts/paddle-checkout-page.ts --app payapps \
//     --app-url https://payapps.marisstella.app [--apply] [--token-out FILE]
//
// Without --apply it only reads Paddle and prints the plan. The client-side token is public by design
// (it goes into the page's HTML), but it is still not printed, so a log never becomes the place to copy
// it from: FILE is written with mode 0600 as {"BILLING_CLIENT_TOKEN": "live_…"} and the caller deletes
// it. Exit 0 on success (a default-link problem is printed and still exits 0), 1 when Paddle refuses
// the token calls, 2 on bad arguments.
import { writeFileSync } from "node:fs";
import {
  describeCheckoutPage,
  PaddleCheckoutClient,
  payPageUrl,
  syncCheckoutPage,
} from "../src/paddle-checkout-page.ts";
import { describeKeyProbe, probePaddleKey } from "../src/paddle-key.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const app = arg("--app") ?? "";
const appUrl = arg("--app-url") ?? "";
const apply = process.argv.includes("--apply");
const out = arg("--token-out");
if (!/^[a-z][a-z0-9-]{0,31}$/.test(app) || !appUrl) {
  console.error(
    "usage: paddle-checkout-page.ts --app ID --app-url URL [--apply] [--token-out FILE]",
  );
  process.exit(2);
}
try {
  payPageUrl(appUrl);
} catch (e) {
  console.error(String((e as Error).message));
  process.exit(2);
}

const rawKey = process.env.BILLING_API_KEY ?? "";
const probe = await probePaddleKey(rawKey, { calls: ["list-products"] });
for (const line of describeKeyProbe(probe)) console.log(line);
if (!probe.shape.usable || !probe.baseUrl) {
  console.error("BILLING_API_KEY cannot be used for Paddle (see above)");
  process.exit(2);
}

const client = new PaddleCheckoutClient(rawKey.trim(), { baseUrl: probe.baseUrl });
try {
  const r = await syncCheckoutPage(client, { app, appUrl }, { apply });
  console.log(`${app}: ${probe.environment} Paddle account, ${apply ? "applying" : "plan only"}`);
  for (const line of describeCheckoutPage(r, apply)) console.log(`  ${line}`);
  if (out && r.token) {
    writeFileSync(out, JSON.stringify({ BILLING_CLIENT_TOKEN: r.token }), { mode: 0o600 });
    console.log(`  client-side token written to ${out} (not printed)`);
  } else if (out) {
    console.log("  no token yet (plan only): nothing written");
  }
} catch (e) {
  console.error(String((e as Error).message));
  process.exit(1);
}
