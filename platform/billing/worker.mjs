// The billing Worker: Paddle's webhook in, licence keys out (server.mjs).
//
// It holds the two billing secrets (PADDLE_WEBHOOK_SECRET, LICENCE_SIGNING_KEY),
// so it is deliberately NOT part of the public site's edge Worker and has no
// GitHub Actions deploy. The guardrail (prompts/goals.md, "Payments") keeps
// every webhook secret out of this repository, its Actions secrets and the
// public Cloudflare account; the billing plan's Option B
// (docs/reports/2026-10-30-billing-plan.md) says how: the owner deploys this
// file from an owner-only place (a private repository with owner review, or
// their own machine) to a separate Cloudflare account. README.md, "Going live".
//
// What a compromise of the public repository could then do: change this code
// or the catalogue in the diff, visibly. It cannot read the secrets, because
// nothing an agent can merge deploys to the account that holds them. The
// secrets cannot move money or read customer data in any case: the worst a
// leaked one allows is minting licence keys for MIT code.

import { handleBilling, d1Store } from "./server.mjs";

export default {
  async fetch(request, env) {
    const origins = String(env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get("origin") || "";
    const cors = { "access-control-allow-origin": origins.includes(origin) ? origin : origins[0] || "", vary: "origin" };
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...cors, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" } });
    }
    try {
      const r = await handleBilling(request, env, { store: d1Store(env.DB), cors });
      return r || new Response("not found\n", { status: 404, headers: cors });
    } catch {
      return new Response(JSON.stringify({ error: "internal" }), { status: 500, headers: { "content-type": "application/json", ...cors } });
    }
  },
};
