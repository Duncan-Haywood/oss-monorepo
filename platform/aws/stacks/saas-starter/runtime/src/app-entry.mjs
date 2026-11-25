// Lambda entry for a product. build.mjs bundles this file with the product's handler aliased as
// "product-app" and its migrations copied to ./migrations beside the bundle.
import app from "product-app";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lambdaHandler } from "./adapter.mjs";
import { makeEnv } from "./env.mjs";
import { getPool } from "./pg.mjs";
import { migrate } from "./migrate.mjs";

const http = lambdaHandler(app, (event) => makeEnv(event));

export async function handler(event) {
  if (event && event.__migrate === true) {          // invoked by tofu after deploy, never via HTTP
    const client = await (await getPool()).connect();
    try { return { applied: await migrate(client, join(dirname(fileURLToPath(import.meta.url)), "migrations")) }; }
    finally { client.release(); }
  }
  if (event && typeof event.__scheduled === "string") {   // EventBridge Scheduler (Workers cron triggers)
    if (typeof app.scheduled !== "function") throw new Error("app has no scheduled() handler");
    const pending = [];
    const ctx = { waitUntil: (p) => pending.push(p) };
    await app.scheduled({ cron: event.__scheduled, scheduledTime: Date.now() }, await makeEnv(event), ctx);
    await Promise.all(pending);
    return { ok: true };
  }
  return http(event);
}
