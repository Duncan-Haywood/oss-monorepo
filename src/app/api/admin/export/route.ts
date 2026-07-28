import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/adminAuth";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  const store = await cookies();
  if (!verifySessionToken(store.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const what = req.nextUrl.searchParams.get("what") ?? "trials";

  try {
    let rows: Record<string, unknown>[] = [];
    const name = what;

    if (what === "trials") {
      const trials = await prisma.trial.findMany({
        orderBy: { shownAt: "desc" },
        take: 20000,
        include: {
          itemA: { select: { label: true, category: true } },
          itemB: { select: { label: true, category: true } },
          participant: {
            select: {
              firstName: true, lastName: true, email: true, perspective: true,
              sex: true, age: true, ethnicity: true, countryOfResidence: true,
              survey: { select: { slug: true } },
            },
          },
        },
      });
      rows = trials.map((t) => ({
        trialId: t.id,
        participantId: t.participantId,
        firstName: t.participant.firstName,
        lastName: t.participant.lastName,
        email: t.participant.email,
        perspective: t.participant.perspective,
        sex: t.participant.sex,
        age: t.participant.age,
        ethnicity: t.participant.ethnicity,
        country: t.participant.countryOfResidence,
        survey: t.participant.survey.slug,
        itemA: t.itemA.label,
        itemACategory: t.itemA.category,
        itemB: t.itemB.label,
        itemBCategory: t.itemB.category,
        result: t.result,
        shownAt: t.shownAt.toISOString(),
        answeredAt: t.answeredAt?.toISOString() ?? "",
        msToAnswer: t.msToAnswer,
        msSincePrevAnswer: t.msSincePrevAnswer,
        itemARatingBefore: t.itemARatingBefore,
        itemARatingAfter: t.itemARatingAfter,
        itemBRatingBefore: t.itemBRatingBefore,
        itemBRatingAfter: t.itemBRatingAfter,
      }));
    } else if (what === "ratings") {
      const ratings = await prisma.participantItemRating.findMany({
        take: 20000,
        orderBy: { rating: "desc" },
        include: {
          item: { select: { label: true, category: true, dimensions: true, survey: { select: { slug: true } } } },
          participant: { select: { firstName: true, email: true, perspective: true } },
        },
      });
      rows = ratings.map((r) => ({
        participantId: r.participantId,
        firstName: r.participant.firstName,
        email: r.participant.email,
        perspective: r.participant.perspective,
        survey: r.item.survey.slug,
        item: r.item.label,
        category: r.item.category,
        dimensions: r.item.dimensions.join("|"),
        rating: Math.round(r.rating),
        rd: Math.round(r.rd),
        ci95Low: Math.round(r.rating - 1.96 * r.rd),
        ci95High: Math.round(r.rating + 1.96 * r.rd),
        updatedAt: r.updatedAt.toISOString(),
      }));
    } else if (what === "financial") {
      const fts = await prisma.financialTrial.findMany({
        orderBy: { shownAt: "desc" },
        take: 20000,
        include: { participant: { select: { firstName: true, email: true, perspective: true } } },
      });
      rows = fts.map((t) => ({
        trialId: t.id,
        participantId: t.participantId,
        firstName: t.participant.firstName,
        perspective: t.participant.perspective,
        incomeA: t.incomeA, netWorthA: t.netWorthA, upsideA: t.futurePotentialA,
        yearsA: t.yearsToRealizeA, hoursA: t.weeklyHoursA,
        incomeB: t.incomeB, netWorthB: t.netWorthB, upsideB: t.futurePotentialB,
        yearsB: t.yearsToRealizeB, hoursB: t.weeklyHoursB,
        result: t.result,
        shownAt: t.shownAt.toISOString(),
        answeredAt: t.answeredAt?.toISOString() ?? "",
        msToAnswer: t.msToAnswer,
      }));
    } else if (what === "feedback") {
      const fb = await prisma.insightFeedback.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
      rows = fb.map((f) => ({
        id: f.id, userId: f.userId, subject: f.subject,
        usefulness: f.usefulness, enjoyment: f.enjoyment, note: f.note,
        createdAt: f.createdAt.toISOString(),
      }));
    } else if (what === "reports") {
      const reports = await prisma.userReport.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
      rows = reports.map((r) => ({
        id: r.id, kind: r.kind, message: r.message, email: r.email,
        path: r.path, resolved: r.resolved, createdAt: r.createdAt.toISOString(),
      }));
    } else {
      return NextResponse.json({ error: "Unknown export" }, { status: 400 });
    }

    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="quickpick-${name}.csv"`,
      },
    });
  } catch (err) {
    console.error("admin export failed", err);
    return NextResponse.json({ error: "Could not export" }, { status: 500 });
  }
}
