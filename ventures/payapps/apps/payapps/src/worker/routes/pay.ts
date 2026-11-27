// The checkout page Paddle sends buyers to: GET /pay/:orgId?_ptxn=txn_… (the transaction's
// `checkout.url`, services/billing.ts) and GET /pay?_ptxn=… (the account's default payment link, which
// Paddle also uses for "update your payment method" emails). It loads Paddle.js from cdn.paddle.com
// with the public client-side token (BILLING_CLIENT_TOKEN, set by the deploy:
// packages/billing/src/paddle-checkout-page.ts), and Paddle.js opens the overlay checkout for the
// `_ptxn` transaction by itself. Completed: back to the org's Billing page with ?checkout=success.
// Closed without paying: ?checkout=cancel. No session is needed: the page holds no account data, and
// the transaction id in the URL is all Paddle needs.
//
// It is the only page on this origin that runs third-party script, so it has its own CSP: Paddle's
// hosts only (read from paddle.js v2 on 2026-11-27: cdn and sandbox-cdn for the script, styles, images
// and error frame; buy and sandbox-buy for the checkout frame; api and sandbox-api), and COOP
// `same-origin-allow-popups` so a wallet or 3-D Secure popup opened from the checkout frame keeps its
// opener. Our own script is a same-origin file, never inline.
import { clientTokenEnvironment, isClientToken } from "@billing";
import { type Context, Hono } from "hono";
import type { AppEnv } from "../types";

export const PAY_CSP = [
  "default-src 'none'",
  "script-src 'self' https://cdn.paddle.com",
  "style-src 'self' 'unsafe-inline' https://cdn.paddle.com https://sandbox-cdn.paddle.com",
  "img-src 'self' data: https://cdn.paddle.com https://sandbox-cdn.paddle.com",
  "font-src https://cdn.paddle.com https://sandbox-cdn.paddle.com",
  "connect-src https://api.paddle.com https://sandbox-api.paddle.com",
  "frame-src https://buy.paddle.com https://sandbox-buy.paddle.com https://cdn.paddle.com https://sandbox-cdn.paddle.com",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/** Org ids are `org_` + 20 of lib/ids.ts' alphabet; anything else gets the generic page. */
const ORG_ID = /^org_[0-9a-hjkmnp-tv-z]{20}$/;

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export function payPageHtml(opts: {
  token: string | null;
  successUrl: string;
  cancelUrl: string;
}): string {
  const ready = opts.token !== null;
  const attrs = ready
    ? ` data-token="${esc(opts.token as string)}" data-environment="${clientTokenEnvironment(opts.token as string)}"`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Checkout · PayApps</title>
<style>
body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a}
main{max-width:32rem;margin:15vh auto;padding:0 16px;text-align:center}
a{color:#1d4ed8}
@media (prefers-color-scheme:dark){body{background:#0f172a;color:#e2e8f0}a{color:#93c5fd}}
</style>
${ready ? '<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>\n' : ""}</head>
<body${attrs} data-success="${esc(opts.successUrl)}" data-cancel="${esc(opts.cancelUrl)}">
<main>
<h1>PayApps checkout</h1>
<p id="status" role="status">${ready ? "Opening the secure checkout (Paddle)…" : "Checkout is not available on this site yet. Nothing was charged."}</p>
<p>Payments are processed by Paddle.com, our merchant of record. <a href="${esc(opts.cancelUrl)}">Back to PayApps</a></p>
</main>
${ready ? '<script src="/pay/checkout.js" defer></script>\n' : ""}</body>
</html>
`;
}

// Same-origin script for the page above. Paddle.js reads `_ptxn` itself once initialised.
export const PAY_SCRIPT = `(function () {
  "use strict";
  var d = document.body.dataset;
  var status = document.getElementById("status");
  var say = function (t) { if (status) status.textContent = t; };
  if (!new URLSearchParams(window.location.search).get("_ptxn")) {
    say("There is no payment to open here. Start from your Billing page.");
    return;
  }
  var P = window.Paddle;
  if (!P || !d.token) {
    say("The secure checkout could not load (is a blocker stopping cdn.paddle.com?). Nothing was charged.");
    return;
  }
  var completed = false;
  if (d.environment === "sandbox") P.Environment.set("sandbox");
  P.Initialize({
    token: d.token,
    checkout: { settings: { displayMode: "overlay", successUrl: d.success } },
    eventCallback: function (e) {
      if (!e || !e.name) return;
      if (e.name === "checkout.completed") {
        completed = true;
        say("Paid. Taking you back to PayApps…");
      }
      if (e.name === "checkout.closed" && !completed) window.location.assign(d.cancel);
      if (e.name === "checkout.error") say("The checkout reported an error. Nothing was charged; try again from your Billing page.");
    },
  });
})();
`;

const routes = new Hono<AppEnv>();

routes.get("/checkout.js", (c) => {
  c.header("Content-Type", "text/javascript; charset=utf-8");
  c.header("Cache-Control", "public, max-age=300");
  return c.body(PAY_SCRIPT);
});

function page(c: Context<AppEnv>, orgId: string | null) {
  const env = c.var.ctx.env;
  const base = new URL(env.APP_URL);
  const org = orgId && ORG_ID.test(orgId) ? orgId : null;
  const back = (q: string) =>
    new URL(org ? `/orgs/${org}/billing?${q}` : `/?${q}`, base).toString();
  const token =
    c.var.ctx.billing && isClientToken(env.BILLING_CLIENT_TOKEN) ? env.BILLING_CLIENT_TOKEN : null;
  c.header("Content-Security-Policy", PAY_CSP);
  c.header("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  c.header("Cache-Control", "no-store");
  return c.html(
    payPageHtml({
      token,
      successUrl: back("checkout=success"),
      cancelUrl: back("checkout=cancel"),
    }),
  );
}

routes.get("/", (c) => page(c, null));
routes.get("/:orgId", (c) => page(c, c.req.param("orgId")));

export default routes;
