import { NextResponse } from "next/server";
import {
  simulateVercelEnvPull,
  buildPartnerCredentialVault,
  getPartnerCredentialEnvFromProcess,
} from "@/lib/partner-credentials";

export const runtime = "nodejs";

export async function GET() {
  const currentEnv = getPartnerCredentialEnvFromProcess();
  const vault = buildPartnerCredentialVault(currentEnv);

  return NextResponse.json({
    status: "ok",
    environment: process.env.NODE_ENV ?? "development",
    overallScore: vault.overallScore,
    label: vault.label,
    credentialsCount: vault.credentials.length,
    blockers: vault.blockers,
    hint: "Send POST /api/credentials/vercel-pull to simulate or sync Vercel env variables into the credential vault.",
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const envOverrides = body.envOverrides ?? {};
    const environment = body.environment ?? "production";

    const result = simulateVercelEnvPull(envOverrides, environment);
    return NextResponse.json({
      ...result,
      message: `Successfully synced ${result.pulledCount} keys from Vercel env (${result.environment})`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to process Vercel env pull request", details: String(error) },
      { status: 400 },
    );
  }
}
