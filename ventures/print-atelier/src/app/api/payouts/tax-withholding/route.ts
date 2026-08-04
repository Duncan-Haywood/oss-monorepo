import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/api-auth";
import {
  generateArtistTaxStatement,
  generateAnnualTaxWithholdingBatchReport,
  persistTaxWithholdingStatement,
  getTaxStatementRecords,
  type ArtistTaxProfile,
  type ArtistAnnualPayoutData,
} from "@/lib/artist-tax-withholding";

export async function GET(request: Request) {
  const denied = requireOperator(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const yearParam = url.searchParams.get("year");

  if (yearParam) {
    const taxYear = parseInt(yearParam, 10);
    const sampleBatch = [
      {
        profile: {
          artistHandle: "elena_wave",
          legalName: "Elena Rostova",
          email: "elena@example.com",
          taxClassification: "individual" as const,
          tinStatus: "verified" as const,
          usResident: true,
          stateCode: "CA",
        },
        payoutData: {
          taxYear,
          grossSalesUsd: 3500,
          totalArtistNetPayoutsUsd: 1050,
          totalStripeFeesUsd: 105,
          payoutCount: 15,
        },
      },
    ];
    const batchReport = generateAnnualTaxWithholdingBatchReport(sampleBatch, taxYear);
    return NextResponse.json({
      success: true,
      taxYear,
      batchReport,
      endpoint: "/api/payouts/tax-withholding",
    });
  }

  const records = getTaxStatementRecords(50);
  return NextResponse.json({
    success: true,
    endpoint: "/api/payouts/tax-withholding",
    recordCount: records.length,
    recentStatements: records,
  });
}

export async function POST(request: Request) {
  const denied = requireOperator(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { profile, payoutData, batchRecords, taxYear } = body;

    if (batchRecords && Array.isArray(batchRecords) && taxYear) {
      const report = generateAnnualTaxWithholdingBatchReport(batchRecords, taxYear);
      for (const stmt of report.statements) {
        persistTaxWithholdingStatement(stmt);
      }
      return NextResponse.json({ success: true, report });
    }

    if (!profile || !payoutData) {
      return NextResponse.json({ error: "Missing 'profile' or 'payoutData'" }, { status: 400 });
    }

    const statement = generateArtistTaxStatement(profile as ArtistTaxProfile, payoutData as ArtistAnnualPayoutData);
    persistTaxWithholdingStatement(statement);

    return NextResponse.json({ success: true, statement });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
