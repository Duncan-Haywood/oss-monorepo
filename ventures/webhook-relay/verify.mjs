// Inbound signature checks, one per provider scheme. Node only (node:crypto).
// Each returns {ok:true} or {ok:false, reason}. `headers` are lower-cased.
import { createHmac, timingSafeEqual } from "node:crypto";

const eq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const hmac = (secret, data, enc) => createHmac("sha256", secret).update(data).digest(enc);
const fail = (reason) => ({ ok: false, reason });
const OK = { ok: true };
const TOLERANCE_SEC = 300;

export const SCHEMES = ["none", "stripe", "github", "shopify", "slack", "paddle", "typeform", "gitlab", "woocommerce", "linear", "standard", "hmac-sha256"];

export function verify(scheme, { headers, body, secret, nowSec = Math.floor(Date.now() / 1000), header }) {
  if (scheme === "none") return OK;
  if (!secret) return fail("route has no secret configured");
  switch (scheme) {
    case "stripe": {
      const parts = Object.fromEntries((headers["stripe-signature"] || "").split(",").map((p) => p.split("=")).filter((p) => p.length === 2));
      const sigs = (headers["stripe-signature"] || "").split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
      if (!parts.t || !sigs.length) return fail("missing stripe-signature");
      if (Math.abs(nowSec - Number(parts.t)) > TOLERANCE_SEC) return fail("timestamp outside tolerance");
      const want = hmac(secret, `${parts.t}.${body.toString("utf8")}`, "hex");
      return sigs.some((s) => eq(s, want)) ? OK : fail("signature mismatch");
    }
    case "github": {
      const got = headers["x-hub-signature-256"] || "";
      return eq(got, `sha256=${hmac(secret, body, "hex")}`) ? OK : fail(got ? "signature mismatch" : "missing x-hub-signature-256");
    }
    case "shopify": {
      const got = headers["x-shopify-hmac-sha256"] || "";
      return eq(got, hmac(secret, body, "base64")) ? OK : fail(got ? "signature mismatch" : "missing x-shopify-hmac-sha256");
    }
    case "slack": {
      const ts = headers["x-slack-request-timestamp"], got = headers["x-slack-signature"] || "";
      if (!ts || !got) return fail("missing slack headers");
      if (Math.abs(nowSec - Number(ts)) > TOLERANCE_SEC) return fail("timestamp outside tolerance");
      return eq(got, `v0=${hmac(secret, `v0:${ts}:${body.toString("utf8")}`, "hex")}`) ? OK : fail("signature mismatch");
    }
    case "paddle": { // Paddle Billing: "ts=<unix>;h1=<hex>" (several h1 while a secret rotates), signed over "<ts>:<body>"
      const pairs = (headers["paddle-signature"] || "").split(";").map((p) => p.split("="));
      const ts = (pairs.find((p) => p[0] === "ts") || [])[1];
      const sigs = pairs.filter((p) => p[0] === "h1" && p[1]).map((p) => p[1]);
      if (!ts || !sigs.length) return fail("missing paddle-signature");
      if (Math.abs(nowSec - Number(ts)) > TOLERANCE_SEC) return fail("timestamp outside tolerance");
      const want = hmac(secret, `${ts}:${body.toString("utf8")}`, "hex");
      return sigs.some((s) => eq(s, want)) ? OK : fail("signature mismatch");
    }
    case "typeform": { // "sha256=<base64 HMAC of the raw body>"; Typeform sends no timestamp
      const got = headers["typeform-signature"] || "";
      return eq(got, `sha256=${hmac(secret, body, "base64")}`) ? OK : fail(got ? "signature mismatch" : "missing typeform-signature");
    }
    case "gitlab": { // X-Gitlab-Token is the shared secret itself, compared in constant time
      const got = headers["x-gitlab-token"] || "";
      return eq(got, secret) ? OK : fail(got ? "token mismatch" : "missing x-gitlab-token");
    }
    case "woocommerce": { // base64 HMAC of the raw body
      const got = headers["x-wc-webhook-signature"] || "";
      return eq(got, hmac(secret, body, "base64")) ? OK : fail(got ? "signature mismatch" : "missing x-wc-webhook-signature");
    }
    case "linear": { // hex HMAC of the body; replay window from `webhookTimestamp` (ms) inside the body
      const got = headers["linear-signature"] || "";
      if (!got) return fail("missing linear-signature");
      if (!eq(got, hmac(secret, body, "hex"))) return fail("signature mismatch");
      let ts;
      try { ts = Number(JSON.parse(body.toString("utf8")).webhookTimestamp); } catch { return fail("body is not JSON"); }
      if (!Number.isFinite(ts)) return fail("missing webhookTimestamp");
      return Math.abs(nowSec * 1000 - ts) > TOLERANCE_SEC * 1000 ? fail("timestamp outside tolerance") : OK;
    }
    case "standard": { // standardwebhooks.com: Svix, Resend, Clerk, ...
      const id = headers["webhook-id"], ts = headers["webhook-timestamp"], sigHeader = headers["webhook-signature"];
      if (!id || !ts || !sigHeader) return fail("missing webhook-* headers");
      if (Math.abs(nowSec - Number(ts)) > TOLERANCE_SEC) return fail("timestamp outside tolerance");
      const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret);
      const want = hmac(key, `${id}.${ts}.${body.toString("utf8")}`, "base64");
      const ok = sigHeader.split(" ").some((s) => s.startsWith("v1,") && eq(s.slice(3), want));
      return ok ? OK : fail("signature mismatch");
    }
    case "hmac-sha256": { // any provider: hex digest in `header`, optional "sha256=" prefix
      const name = (header || "x-signature").toLowerCase();
      const got = (headers[name] || "").replace(/^sha256=/, "");
      return eq(got, hmac(secret, body, "hex")) ? OK : fail(got ? "signature mismatch" : `missing ${name}`);
    }
    default:
      return fail(`unknown scheme ${scheme}`);
  }
}
