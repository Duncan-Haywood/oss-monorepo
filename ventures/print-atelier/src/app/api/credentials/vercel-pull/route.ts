import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/api-auth";
import {
  simulateVercelEnvPull,
  buildPartnerCredentialVault,
  getPartnerCredentialEnvFromProcess,
  withoutMaskedValues,
} from "@/lib/partner-credentials";

/**
 * Operator-only. This route reads the live process environment, so before the
 * guard below an anonymous caller learned which partner integrations are
 * configured and — through `vaultSummary` — the masked form of real secrets,
 * which reveals the `sk_live_`/`sk_test_` prefix and the last four characters of
 * the Stripe key. The guard and `withoutMaskedValues` are both load-bearing: one
 * keeps strangers out, the other keeps key material out of the response body
 * even for callers who are let in.
 */

export const runtime = "nodejs";

const ENVIRONMENTS = ["production", "preview", "development"] as const;
type PullEnvironment = (typeof ENVIRONMENTS)[number];

function parseEnvironment(value: unknown): PullEnvironment | null {
  if (value === undefined || value === null) {
    return "production";
  }
  return (ENVIRONMENTS as readonly unknown[]).includes(value)
    ? (value as PullEnvironment)
    : null;
}

function parseEnvOverrides(value: unknown): Record<string, string> | null {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([, entryValue]) => typeof entryValue !== "string")) {
    return null;
  }
  return Object.fromEntries(entries as [string, string][]);
}

export async function GET(request: Request) {
  const denied = requireOperator(request);
  if (denied) {
    return denied;
  }

  const vault = withoutMaskedValues(
    buildPartnerCredentialVault(getPartnerCredentialEnvFromProcess()),
  );

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
  const denied = requireOperator(request);
  if (denied) {
    return denied;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // The previous handler swallowed this into `{}` and reported success, so a
    // malformed payload was indistinguishable from an empty one.
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Request body must be a JSON object" },
      { status: 400 },
    );
  }

  const { envOverrides: rawOverrides, environment: rawEnvironment } =
    body as Record<string, unknown>;

  const envOverrides = parseEnvOverrides(rawOverrides);
  if (envOverrides === null) {
    return NextResponse.json(
      { error: "`envOverrides` must be an object of string values" },
      { status: 400 },
    );
  }

  const environment = parseEnvironment(rawEnvironment);
  if (environment === null) {
    return NextResponse.json(
      { error: `\`environment\` must be one of: ${ENVIRONMENTS.join(", ")}` },
      { status: 400 },
    );
  }

  const result = simulateVercelEnvPull(envOverrides, environment);
  return NextResponse.json({
    ...result,
    vaultSummary: withoutMaskedValues(result.vaultSummary),
    message: `Successfully synced ${result.pulledCount} keys from Vercel env (${result.environment})`,
  });
}
