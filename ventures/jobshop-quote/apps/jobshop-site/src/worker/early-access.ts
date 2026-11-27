// POST /api/early-access: the early-access form. Plain HTML form post (the site ships no JavaScript):
// success → 303 to the thank-you page; validation errors → the form page re-rendered with the
// visitor's values and the errors inline (status 400).
//
// Same safeguards as apps/grants' newsletter signup (docs/EMAIL_MARKETING.md there):
// - Origin check against cross-site posts.
// - Per-IP rate limit (Workers Rate Limiting binding, when bound).
// - Honeypot field "website": when filled, nothing is stored but the response is the same.
// - The response is the same for new and repeat addresses, so it never reveals who is on the list.
// - Raw IPs are never stored; only a salted SHA-256 when IP_HASH_SALT is set.
// No email is sent: there is no configured email service. Double opt-in (confirmation link) is the
// next step once one is (see README "Email").

import { type FormValues, parseEarlyAccess } from "@shared/early-access";
import { jsonLdFor } from "@site/build";
import { LAUNCH } from "@site/config";
import { type DocumentContext, renderDocument } from "@site/layout";
import { earlyAccessPage } from "@site/pages";
import { getRoute } from "@site/routes";
import { basePath, type Env, siteUrl } from "./env";

const MAX_BODY_BYTES = 16 * 1024;
const FORM_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data"];

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Same-origin posts only. Browsers send Origin on form POSTs; Sec-Fetch-Site is the fallback. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (origin) return origin === new URL(request.url).origin;
  return request.headers.get("Sec-Fetch-Site") === "same-origin";
}

export async function hashIp(ip: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function formValues(form: FormData): FormValues {
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  return {
    email: str("email"),
    name: str("name"),
    shop: str("shop"),
    role: str("role"),
    processes: form.getAll("processes").filter((v): v is string => typeof v === "string"),
    rfqsPerWeek: str("rfqsPerWeek"),
    quotingToday: str("quotingToday"),
    notes: str("notes"),
    consent: str("consent") === "yes",
  };
}

export async function handleEarlyAccess(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  }
  if (!isSameOrigin(request)) return text(403, "Cross-site form posts are not accepted.");
  const type = (request.headers.get("Content-Type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (!type || !FORM_TYPES.includes(type)) return text(415, "Send the form as a normal form post.");
  const length = Number(request.headers.get("Content-Length") ?? "0");
  if (length > MAX_BODY_BYTES) return text(413, "That's more than the form allows.");

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (env.EARLY_ACCESS_LIMITER) {
    const { success } = await env.EARLY_ACCESS_LIMITER.limit({ key: `early-access:${ip}` });
    if (!success) return text(429, "Too many requests. Please wait a minute and try again.");
  }

  let form: FormData;
  try {
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return text(413, "That's more than the form allows.");
    const contentType = request.headers.get("Content-Type") ?? type;
    form = await new Response(body, { headers: { "Content-Type": contentType } }).formData();
  } catch {
    return text(400, "The form could not be read. Please try again.");
  }

  const base = basePath(env);
  const thanks = new URL(`${base}/early-access/thanks`, request.url).toString();
  const redirect = () =>
    new Response(null, { status: 303, headers: { Location: thanks, "Cache-Control": "no-store" } });

  // Honeypot: a person never sees this field.
  const trap = form.get("website");
  if (typeof trap === "string" && trap.trim() !== "") return redirect();

  const parsed = parseEarlyAccess(formValues(form));
  if (!parsed.ok) {
    // The form exists only on the closed (pre-launch) site, so it renders in that state.
    const launch = { ...LAUNCH, open: false };
    const ctx: DocumentContext = { basePath: base, siteUrl: siteUrl(env), launch };
    const route = getRoute("/early-access", launch);
    const page = renderDocument(
      ctx,
      { ...route, title: `Check your details · ${route.title}`, noindex: true },
      earlyAccessPage(ctx, { errors: parsed.errors, values: parsed.values }),
      jsonLdFor(ctx, route),
    );
    return new Response(page, {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const r = parsed.value;
  const now = new Date().toISOString();
  const ipHash = env.IP_HASH_SALT && ip !== "unknown" ? await hashIp(ip, env.IP_HASH_SALT) : null;
  await env.DB.prepare(
    `INSERT INTO early_access_requests
       (id, email, name, shop, role, processes, rfqs_per_week, quoting_today, notes,
        consent_text_version, consent_source, consent_ip_hash, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)
     ON CONFLICT (email) DO UPDATE SET
       name = excluded.name, shop = excluded.shop, role = excluded.role,
       processes = excluded.processes, rfqs_per_week = excluded.rfqs_per_week,
       quoting_today = excluded.quoting_today, notes = excluded.notes,
       consent_text_version = excluded.consent_text_version,
       consent_source = excluded.consent_source, consent_ip_hash = excluded.consent_ip_hash,
       submit_count = early_access_requests.submit_count + 1, updated_at = excluded.updated_at`,
  )
    .bind(
      crypto.randomUUID(),
      r.email,
      r.name,
      r.shop,
      r.role,
      JSON.stringify(r.processes),
      r.rfqsPerWeek,
      r.quotingToday,
      r.notes,
      r.consentVersion,
      "/early-access",
      ipHash,
      now,
    )
    .run();
  return redirect();
}
