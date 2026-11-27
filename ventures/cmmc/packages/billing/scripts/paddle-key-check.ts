// Prints what kind of Paddle key BILLING_API_KEY is and which catalog calls it may make, without
// printing the key past its public prefix. Never changes the Paddle account (see src/paddle-key.ts).
//
//   BILLING_API_KEY=… node packages/billing/scripts/paddle-key-check.ts [--label NAME] [--reads-only]
//
// Exit 0 when every probed call is allowed, 1 when a call is refused, 2 when the key is unusable.
import { describeKeyProbe, keyProbeOk, probePaddleKey } from "../src/paddle-key.ts";

const i = process.argv.indexOf("--label");
const label = i > 0 ? (process.argv[i + 1] ?? "BILLING_API_KEY") : "BILLING_API_KEY";
const probe = await probePaddleKey(process.env.BILLING_API_KEY ?? "", {
  calls: process.argv.includes("--reads-only") ? ["list-products", "list-prices"] : undefined,
});
for (const line of describeKeyProbe(probe, label)) console.log(line);
process.exit(!probe.shape.usable || !probe.baseUrl ? 2 : keyProbeOk(probe) ? 0 : 1);
