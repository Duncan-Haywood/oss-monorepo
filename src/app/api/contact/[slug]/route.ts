import { NextResponse } from "next/server";
import { getLeadBySlug, insertClientInquiry } from "@/lib/db";
import { brand } from "@/lib/brand";
import {
  CONTACT_FORM_CONVEX_PRIMARY,
  contactPersistOutcome,
  shouldSendContactNotify,
} from "@/lib/inquiries/contact-persist";
import { escapeHtmlForEmail } from "@/lib/inquiries/reply";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";

/**
 * Client site contact form (Phase 5).
 * Accepts JSON or form-urlencoded posts for a lead slug, persists an inquiry
 * (required for success), then emails the lead (or support) as a best-effort
 * notify. Returns 503 when the inbox row cannot be written — never { ok: true }
 * without a durable CRM trail (Starter sold promise).
 *
 * Notify is best-effort AFTER durable persist: sendEmail never throws on
 * suppression/Resend failure (resolves `{ success: false }`), so the route
 * must inspect that shape, log inquiryId + reason/error, and surface
 * `notifySent` on the ok:true response — never treat a bare await as delivery.
 * Visitor success stays tied to the CRM trail, not the notify (operator can
 * still reply from the inbox).
 *
 * Pass skipSuppression: true — this is a Starter sold product notify to
 * lead.email (or support), not cold-outreach marketing. A CAN-SPAM unsub from
 * Email 1–3 must not silence website contact-form delivery (see
 * contact-form-notify-skip-marketing-suppression; same class as
 * transactional-email-skip-marketing-suppression for receipt/DNS/Commerce).
 *
 * When NEXT_PUBLIC_CONVEX_URL is set, insertClientInquiry passes requireConvex
 * so a Convex mutation failure does not SQLite-fallback then claim success —
 * other instances read Convex-first and would never see the inquiry.
 *
 * Rate limited per client IP (best-effort, per-instance — see
 * src/lib/security/rate-limit.ts) to blunt scripted contact-form spam.
 */

type RouteContext = { params: Promise<{ slug: string }> };

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json: unknown = await request.json();
    if (json && typeof json === "object" && !Array.isArray(json)) {
      return json as Record<string, unknown>;
    }
    return {};
  }
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    const out: Record<string, unknown> = {};
    form.forEach((value, key) => {
      out[key] = typeof value === "string" ? value : value.name;
    });
    return out;
  }
  return {};
}

export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
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

  const lead = await getLeadBySlug(slug);
  const body = await parseBody(request);
  const name = readString(body.name) || readString(body.from);
  const email = readString(body.email);
  const phone = readString(body.phone);
  const message = readString(body.message) || readString(body.body);
  const source = readString(body.source) || request.headers.get("referer") || undefined;

  if (!message && !email && !phone) {
    return NextResponse.json(
      { error: "Provide at least one of message, email, or phone" },
      { status: 400 },
    );
  }

  const businessName = lead?.businessName || slug;
  const support = brand.supportEmail;

  // Prefer forwarding to the business email when we have it; else operator support.
  const notifyTo = lead?.email || support;

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
        html: `
        <h2 style="margin-bottom: 12px;">New contact form submission</h2>
        <p><strong>Business:</strong> ${safeBiz} (<code>${safeSlug}</code>)</p>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
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
  return NextResponse.json({
    slug,
    method: "POST",
    accepts: ["application/json", "application/x-www-form-urlencoded"],
    fields: ["name", "email", "phone", "message", "source"],
    docs: "/docs/production-deploy",
  });
}
