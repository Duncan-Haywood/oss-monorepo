import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { configuredSink, deliverOverHttp, submitSubscription } from "@/lib/subscription";

/**
 * Newsletter signup. Public by design — anonymous visitors are the audience.
 *
 * When no subscriber sink is configured this answers 501 rather than pretending
 * the address was kept; see `src/lib/subscription.ts`. `operatorAction` names
 * the environment variable to set and is for the operator reading logs, not for
 * the visitor, so it is deliberately not part of the response body.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request payload.", error: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const fields = (body ?? {}) as Partial<{ email: string; tier: string; interestSector: string }>;

  const outcome = await submitSubscription(
    {
      email: fields.email ?? "",
      tier: fields.tier as never,
      interestSector: fields.interestSector,
    },
    { sink: configuredSink(), deliver: deliverOverHttp },
  );

  if (outcome.status === "recorded") {
    return NextResponse.json(
      { success: true, message: outcome.message, data: outcome.data },
      { status: outcome.httpStatus },
    );
  }

  return NextResponse.json(
    { success: false, message: outcome.message, error: outcome.error },
    { status: outcome.httpStatus },
  );
}
