import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/adminAuth";
import { parseSurveyDefinition } from "@/lib/surveyBuilder";

/** Create a ranking survey from the admin's own options. Shared at /s/[slug]. */
export async function POST(req: NextRequest) {
  const store = await cookies();
  if (!verifySessionToken(store.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }
  try {
    const wanted = body && typeof body === "object" ? (body as { slug?: unknown; title?: unknown }) : {};
    const probe = typeof wanted.slug === "string" && wanted.slug ? wanted.slug : typeof wanted.title === "string" ? wanted.title : "";
    const existing = probe
      ? await prisma.survey.findMany({ where: { slug: { startsWith: probe.slice(0, 20).toLowerCase() } }, select: { slug: true } })
      : [];
    const parsed = parseSurveyDefinition(body, new Set(existing.map((s) => s.slug)));
    if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });
    const s = parsed.survey;
    const created = await prisma.survey.create({
      data: {
        slug: s.slug,
        title: s.title,
        description: s.description,
        kind: "ITEMS",
        pairSelector: s.pairSelector,
        items: { create: s.items },
      },
      select: { slug: true },
    });
    return NextResponse.json({ slug: created.slug, url: `/s/${created.slug}`, items: s.items.length }, { status: 201 });
  } catch (err) {
    console.error("admin/surveys failed", err);
    return NextResponse.json({ error: "Could not create the survey" }, { status: 500 });
  }
}
