import { NextResponse } from "next/server";
import { getLeadBySlug, insertClientInquiry } from "@/lib/db";
import { brand } from "@/lib/brand";
import { getLeadBySlug as getDemoCatalogLeadBySlug } from "@/lib/leads/demo-catalog";
import { normalizeContactFormFields } from "@/lib/inquiries/contact-fields";
import {
  CONTACT_FORM_CONVEX_PRIMARY,
  contactPersistOutcome,
  shouldSendContactNotify,
} from "@/lib/inquiries/contact-persist";
import { escapeHtmlForEmail } from "@/lib/inquiries/reply";
import { isPublicLeadSlugPathLengthOk } from "@/lib/leads/slug-path";
import {
  readFormBodyWithByteLimit,
  readJsonBodyWithByteLimit,
} from "@/lib/security/json-body";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";

/**
 * Client site contact form (Phase 5).
 * Accepts JSON or form-urlencoded posts for a lead slug, persists an inquiry
 * (required for success), then emails the lead (or support) as a best-effort
 * notify. Returns 503 when the inbox row cannot be written — never { ok: true }
 * without a durable CRM trail (Starter sold promise).
 *
 * Requires a known lead: CRM row (getLeadBySlug) or curated DEMO_LEADS
 * showcase. Slug-inferred preview pages still render, but inventable slugs
 * must not create orphan inquiries or skipSuppression-notify support
 * (contact-form-require-known-lead). Preview-open soft-rejects unknown_lead
 * the same way; contact returns 404 before persist/notify.
 *
 * Path slug must also pass isPublicLeadSlugPathLengthOk (shared with
 * preview-open) before CRM/demo lookup — charset-only validation is not a
 * size bound (contact-form-slug-path-length-cap).
 *
 * Notify is best-effort AFTER durable persist: sendEmail never throws on
 * suppression/Resend failure (resolves `{ success: false }`), so the route
 * must inspect that shape, log inquiryId + reason/error, and surface
 * `notifySent` on the ok:true response — never treat a bare await as delivery.
 * Visitor success stays tied to the CRM trail, not the notify (operator can
 * still reply from the inbox).
 *
 * The notify's Reply-To is set to the visitor's own submitted email (when
 * present) via sendEmail's replyTo param — the business owner has no
 * per-client CRM login (single OPERATOR_DASHBOARD_PASSWORD gate), so their
 * only realistic channel is hitting Reply in their inbox; without this the
 * reply would silently go to the platform's own EMAIL_FROM instead of the
 * customer. sendEmail validates/drops a malformed value via
 * sanitizeReplyToEmail before it reaches Resend as a raw header.
 *
 * Pass skipSuppression: true — this is a Starter sold product notify to
 * lead.email (or support), not cold-outreach marketing. A CAN-SPAM unsub from
 * Email 1–3 must not silence website contact-form delivery (see
 * contact-form-notify-skip-marketing-suppression; same class as
 * transactional-email-skip-marketing-suppression for receipt/DNS/Commerce).
 *
 * Soft-cap visitor fields once via normalizeContactFormFields (shared
 * MAX_CONTACT_* constants) and reuse those strings for both persist and
 * notify — never email an uncapped body while the CRM row is truncated
 * (contact-form-notify-field-length-caps).
 *
 * When NEXT_PUBLIC_CONVEX_URL is set, insertClientInquiry passes requireConvex
 * so a Convex mutation failure does not SQLite-fallback then claim success —
 * other instances read Convex-first and would never see the inquiry.
 *
 * Rate limited per client IP (best-effort, per-instance — see
 * src/lib/security/rate-limit.ts) to blunt scripted contact-form spam.
 *
 * Raw JSON and form-urlencoded/multipart bodies share
 * MAX_PUBLIC_REQUEST_BODY_BYTES via readJsonBodyWithByteLimit /
 * readFormBodyWithByteLimit — Content-Length alone is not enough when the
 * header is missing or understated (public-formdata-body-byte-length-cap).
 */

type RouteContext = { params: Promise<{ slug: string }> };

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

type ParseBodyResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: "too_large" };

async function parseBody(request: Request): Promise<ParseBodyResult> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const parsed = await readJsonBodyWithByteLimit<unknown>(request);
    if (!parsed.ok) {
      if (parsed.reason === "too_large") {
        return { ok: false, reason: "too_large" };
      }
      return { ok: true, value: {} };
    }
    if (parsed.value && typeof parsed.value === "object" && !Array.isArray(parsed.value)) {
      return { ok: true, value: parsed.value as Record<string, unknown> };
    }
    return { ok: true, value: {} };
  }
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const parsed = await readFormBodyWithByteLimit(request);
    if (!parsed.ok) {
      if (parsed.reason === "too_large") {
        return { ok: false, reason: "too_large" };
      }
      return { ok: true, value: {} };
    }
    return { ok: true, value: parsed.value };
  }
  return { ok: true, value: {} };
}

function isValidContactSlug(slug: string): boolean {
  return (
    isPublicLeadSlugPathLengthOk(slug) && /^[a-z0-9-]+$/i.test(slug)
  );
}

export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  if (!slug || !isValidContactSlug(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const clientIp = clientIpFromHeaders(request.headers);
  const rate = checkRateLimit(`contact-form:${clientIp}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  // Bound raw body before CRM/demo lookup — field soft-caps alone still
  // allocate unbounded request.json()/formData() (public-json-body +
  // public-formdata body byte caps).
  const parsed = await parseBody(request);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: "Request body is too large" },
      { status: 400 },
    );
  }
  const body = parsed.value;

  const dbLead = await getLeadBySlug(slug);
  // Curated DEMO_LEADS showcases may not yet be in the DB on a fresh instance;
  // slug-inferred previews (resolvePreviewLead) are NOT accepted — they would
  // let any inventable slug orphan-persist + spam support under skipSuppression.
  const lead = dbLead ?? getDemoCatalogLeadBySlug(slug) ?? null;
  if (!lead) {
    return NextResponse.json(
      { ok: false, error: "Unknown lead", reason: "unknown_lead", slug },
      { status: 404 },
    );
  }
  // Soft-cap once — persist and notify must share the same bounded strings
  // (contact-form-notify-field-length-caps). Rate limit alone is not a size bound.
  const fields = normalizeContactFormFields({
    name: readString(body.name) || readString(body.from),
    email: readString(body.email),
    phone: readString(body.phone),
    message: readString(body.message) || readString(body.body),
    source: readString(body.source) || request.headers.get("referer") || "",
  });
  const { name, email, phone, message } = fields;
  const source = fields.source || undefined;

  if (!message && !email && !phone) {
    return NextResponse.json(
      { error: "Provide at least one of message, email, or phone" },
      { status: 400 },
    );
  }

  const businessName = lead.businessName;
  const support = brand.supportEmail;

  // Prefer forwarding to the business email when we have it; else operator support.
  const notifyTo = lead.email || support;

  let inquiryId: string | undefined;
  try {
    const inquiry = await insertClientInquiry(
      {
        leadSlug: slug,
        businessName,
        name: name || undefined,
        email: email || undefined,
        phone: phone || undefined,
        message: message || "(no message — contact details only)",
        source,
      },
      CONTACT_FORM_CONVEX_PRIMARY,
    );
    inquiryId = inquiry.id;
  } catch (error) {
    console.error(`contact form persist failed for ${slug}:`, error);
  }

  const outcome = contactPersistOutcome(inquiryId);
  if (!outcome.ok) {
    console.error(
      `[contact/${slug}] persist required — refusing success without inquiry row`,
    );
    return NextResponse.json(
      { ok: false, error: outcome.error, slug, businessName },
      { status: outcome.status },
    );
  }

  let notifySent: boolean | undefined;
  if (shouldSendContactNotify(inquiryId)) {
    try {
      const { sendEmail } = await import("@/lib/email/resend");
      const safeBiz = escapeHtmlForEmail(businessName);
      const safeName = escapeHtmlForEmail(name || "—");
      const safeEmail = escapeHtmlForEmail(email || "—");
      const safePhone = escapeHtmlForEmail(phone || "—");
      const safeMessage = escapeHtmlForEmail(message || "—");
      const safeSlug = escapeHtmlForEmail(slug);
      const safeInquiryId = escapeHtmlForEmail(outcome.inquiryId);
      const sent = await sendEmail({
        to: notifyTo,
        subject: `New website inquiry for ${businessName}`,
        leadSlug: slug,
        // Product notify (Starter sold contact form), not marketing cadence.
        skipSuppression: true,
        // The business owner's most natural response is hitting Reply — route
        // it back to the visitor instead of this app's own EMAIL_FROM.
        // sendEmail validates/drops this via sanitizeReplyToEmail, so an
        // empty or malformed visitor-submitted email is never passed through.
        replyTo: email || undefined,
        html: `
        <h2 style="margin-bottom: 12px;">New contact form submission</h2>
        <p><strong>Business:</strong> ${safeBiz} (<code>${safeSlug}</code>)</p>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${email ? `<a href="mailto:${safeEmail}">${safeEmail}</a>` : safeEmail}</p>
        <p><strong>Phone:</strong> ${safePhone}</p>
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap;">${safeMessage}</p>
        <p style="margin-top: 12px; font-size: 12px; color: #666;">Inbox id: <code>${safeInquiryId}</code></p>
      `,
      });
      notifySent = sent.success;
      if (!sent.success) {
        // Same bug class as webhook/Email 1: sendEmail resolves failure without
        // throwing — log with inquiryId so operators can correlate CRM trail vs
        // missing business notify (Resend/API outage — marketing suppress skipped).
        console.error(
          `contact form notify not sent for ${slug} (inquiry ${outcome.inquiryId}): ${sent.reason ?? sent.error ?? "unknown"}`,
        );
      }
    } catch (error) {
      // Notify is best-effort after durable persist — visitor already succeeded.
      notifySent = false;
      console.error(
        `contact form email failed for ${slug} (inquiry ${outcome.inquiryId}):`,
        error,
      );
    }
  }

  console.log(`[contact/${slug}]`, {
    inquiryId: outcome.inquiryId,
    notifySent,
    name,
    email,
    phone,
    message: message.slice(0, 200),
  });

  return NextResponse.json({
    ok: true,
    slug,
    businessName,
    inquiryId: outcome.inquiryId,
    message: outcome.message,
    ...(notifySent !== undefined ? { notifySent } : {}),
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  if (!slug || !isValidContactSlug(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }
  return NextResponse.json({
    slug,
    method: "POST",
    accepts: ["application/json", "application/x-www-form-urlencoded"],
    fields: ["name", "email", "phone", "message", "source"],
    docs: "/docs/production-deploy",
  });
}
