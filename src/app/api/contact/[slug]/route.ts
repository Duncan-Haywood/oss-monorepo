import { NextResponse } from "next/server";
import { getLeadBySlug, insertClientInquiry } from "@/lib/db";
import { brand } from "@/lib/brand";
import {
  contactPersistOutcome,
  shouldSendContactNotify,
} from "@/lib/inquiries/contact-persist";

/**
 * Client site contact form (Phase 5).
 * Accepts JSON or form-urlencoded posts for a lead slug, persists an inquiry
<<<<<<< Updated upstream
 * (required for success), then best-effort emails the lead (or support).
 * Returns 503 when the inquiry ledger write fails — never ok:true without a row.
=======
 * (required for success), then emails the lead (or support) as a best-effort
 * notify. Returns 503 when the inbox row cannot be written — never { ok: true }
 * without a durable CRM trail (Starter sold promise).
>>>>>>> Stashed changes
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

  let inquiryId: string;
  try {
    const inquiry = await insertClientInquiry({
      leadSlug: slug,
      businessName,
      name: name || undefined,
      email: email || undefined,
      phone: phone || undefined,
      message: message || "(no message — contact details only)",
      source,
    });
    inquiryId = inquiry.id;
  } catch (error) {
    console.error(`contact form persist failed for ${slug}:`, error);
    return NextResponse.json(
      {
        error:
          "Could not save your message right now. Please try again in a moment.",
      },
      { status: 503 },
    );
  }

  const outcome = contactPersistOutcome(inquiryId);
  if (!outcome.ok) {
    console.error(`[contact/${slug}] persist required — refusing success without inquiry row`);
    return NextResponse.json(
      { ok: false, error: outcome.error, slug, businessName },
      { status: outcome.status },
    );
  }

  if (shouldSendContactNotify(inquiryId)) {
    try {
      const { sendEmail } = await import("@/lib/email/resend");
      await sendEmail({
        to: notifyTo,
        subject: `New website inquiry for ${businessName}`,
        leadSlug: slug,
        html: `
        <h2 style="margin-bottom: 12px;">New contact form submission</h2>
        <p><strong>Business:</strong> ${businessName} (<code>${slug}</code>)</p>
        <p><strong>Name:</strong> ${name || "—"}</p>
        <p><strong>Email:</strong> ${email || "—"}</p>
        <p><strong>Phone:</strong> ${phone || "—"}</p>
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap;">${message || "—"}</p>
<<<<<<< Updated upstream
        <p style="margin-top: 12px; font-size: 12px; color: #666;">Inbox id: <code>${inquiryId}</code></p>
      `,
    });
  } catch (error) {
    // Email is best-effort after a successful ledger write — operator still has the inbox row.
    console.error(`contact form email failed for ${slug}:`, error);
=======
        <p style="margin-top: 12px; font-size: 12px; color: #666;">Inbox id: <code>${outcome.inquiryId}</code></p>
      `,
      });
    } catch (error) {
      // Notify is best-effort after durable persist — visitor already succeeded.
      console.error(`contact form email failed for ${slug}:`, error);
    }
>>>>>>> Stashed changes
  }

  console.log(`[contact/${slug}]`, {
    inquiryId: outcome.inquiryId,
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
