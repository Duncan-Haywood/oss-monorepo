import { NextResponse } from "next/server";
import { getLeadBySlug } from "@/lib/db";
import { brand } from "@/lib/brand";

/**
 * Client site contact form stub (Phase 5).
 * Accepts JSON or form-urlencoded posts for a lead slug, logs/emails the lead,
 * and returns 200 so preview/production forms can wire up before full CRM.
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
      `,
    });
  } catch (error) {
    console.error(`contact form email failed for ${slug}:`, error);
  }

  console.log(`[contact/${slug}]`, { name, email, phone, message: message.slice(0, 200) });

  return NextResponse.json({
    ok: true,
    slug,
    businessName,
    message: "Thanks — your message was received.",
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  return NextResponse.json({
    slug,
    method: "POST",
    accepts: ["application/json", "application/x-www-form-urlencoded"],
    fields: ["name", "email", "phone", "message"],
    docs: "/docs/production-deploy",
  });
}
