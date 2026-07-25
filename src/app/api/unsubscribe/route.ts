import { NextRequest, NextResponse } from "next/server";
import { suppressEmail } from "@/lib/db";
import { UNSUBSCRIBE_CONVEX_PRIMARY } from "@/lib/email/suppression-persist";
import {
  MAX_UNSUBSCRIBE_TOKEN_LENGTH,
  verifyUnsubscribeToken,
} from "@/lib/email/unsubscribe-token";
import { MAX_CONTACT_EMAIL_LENGTH } from "@/lib/inquiries/contact-fields";
import { escapeHtmlForEmail } from "@/lib/inquiries/reply";
import { ConvexPrimaryWriteError } from "@/lib/payments/convex-primary";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";

/**
 * Shared validate-and-suppress path for both the human-facing GET link (the
 * footer "Unsubscribe" anchor) and the automated POST one-click endpoint
 * (see POST below) — both must apply the exact same rate limit, param-size
 * gates, token verification, and suppressEmail call so a mail client's
 * automated request cannot bypass a guard the browser-driven link enforces.
 * Returns either the caller-facing error NextResponse to return immediately,
 * or the verified, lowercase-normalized email once suppressEmail succeeds.
 */
async function verifyAndSuppress(
  request: NextRequest,
): Promise<{ email: string } | { errorResponse: NextResponse }> {
  const clientIp = clientIpFromHeaders(request.headers);
  const rate = checkRateLimit(`unsubscribe:${clientIp}`);
  if (!rate.allowed) {
    return {
      errorResponse: new NextResponse("Too many requests. Please try again shortly.", {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      }),
    };
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const token = searchParams.get("token");

  if (!email) {
    return { errorResponse: new NextResponse("Missing email parameter", { status: 400 }) };
  }

  if (email.length > MAX_CONTACT_EMAIL_LENGTH) {
    return {
      errorResponse: new NextResponse("Email parameter is too long", { status: 400 }),
    };
  }

  if (token !== null && token.length > MAX_UNSUBSCRIBE_TOKEN_LENGTH) {
    return {
      errorResponse: new NextResponse("Token parameter is too long", { status: 400 }),
    };
  }

  if (!verifyUnsubscribeToken(email, token)) {
    return {
      errorResponse: new NextResponse(
        "Invalid or expired unsubscribe link. Use the link from a recent email instead.",
        { status: 400 },
      ),
    };
  }

  try {
    await suppressEmail(email, "unsubscribe", UNSUBSCRIBE_CONVEX_PRIMARY);
    return { email };
  } catch (error) {
    console.error("Unsubscribe error:", error);
    if (error instanceof ConvexPrimaryWriteError) {
      return {
        errorResponse: new NextResponse(
          "Could not record your unsubscribe right now. Please try again in a moment.",
          { status: 500 },
        ),
      };
    }
    return {
      errorResponse: new NextResponse("Error processing request", { status: 500 }),
    };
  }
}

/**
 * CAN-SPAM one-click unsubscribe (browser-driven link). Token-gated (PR #137)
 * so a guessed email alone cannot suppress; rate-limited (this iteration) so a
 * harvested footer link or a script hammering HMAC + suppressEmail
 * cannot unboundedly mutate the global suppression list that gates
 * every automated send. Check the limiter BEFORE token verify so
 * garbage traffic does not burn HMAC work either. Hard-reject email
 * query params longer than MAX_CONTACT_EMAIL_LENGTH before verify —
 * rate limits blunt request count, not per-request payload / HMAC /
 * suppressions-row size; soft-cap would break signed footer tokens.
 * Hard-reject token query params longer than MAX_UNSUBSCRIBE_TOKEN_LENGTH
 * before verify too — genuine HMAC-SHA256 base64url tokens are 43 chars;
 * truncation would break every footer link (opaque signed token).
 */
export async function GET(request: NextRequest) {
  const result = await verifyAndSuppress(request);
  if ("errorResponse" in result) {
    return result.errorResponse;
  }
  const { email } = result;

  return new NextResponse(
    `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Unsubscribed Successfully</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #f4f4f5;
            color: #18181b;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          .card {
            background: white;
            padding: 2.5rem;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
            max-width: 400px;
            text-align: center;
          }
          h1 {
            font-size: 1.5rem;
            margin-bottom: 1rem;
            font-weight: 600;
          }
          p {
            color: #52525b;
            font-size: 0.95rem;
            line-height: 1.5;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>You have been unsubscribed</h1>
          <p>We have added <strong>${escapeHtmlForEmail(email)}</strong> to our suppression list. You will no longer receive automated outreach emails from us.</p>
        </div>
      </body>
    </html>
    `,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

/**
 * RFC 8058 one-click unsubscribe. Every outbound email now sends a
 * `List-Unsubscribe: <this-url>` + `List-Unsubscribe-Post:
 * List-Unsubscribe=One-Click` header pair (see sendEmail, src/lib/email/
 * resend.ts) — Gmail and Yahoo's bulk-sender requirements (effective
 * 2024-02) both require this header pair AND that the URL it points at
 * actually honor a bare POST (mail-client-automated, no user-visible page,
 * no redirect) rather than only a browser-driven GET. Without this handler,
 * the header would advertise one-click unsubscribe support that 405s the
 * instant a mail client actually exercises it — worse than not advertising
 * it at all, since inbox providers penalize a broken List-Unsubscribe target
 * as a spam signal. Reuses the exact same rate limit / length gates / token
 * verification / suppressEmail call as GET (verifyAndSuppress above) so a
 * mail client's automated request cannot bypass any guard the browser link
 * enforces; only the response shape differs (RFC 8058 callers never render
 * a body, so keep it a minimal plain-text acknowledgement, not the full HTML
 * confirmation page GET returns for a human).
 */
export async function POST(request: NextRequest) {
  const result = await verifyAndSuppress(request);
  if ("errorResponse" in result) {
    return result.errorResponse;
  }
  return new NextResponse("Unsubscribed.", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
