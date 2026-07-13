import { NextRequest, NextResponse } from "next/server";
import { suppressEmail } from "@/lib/db";
import { UNSUBSCRIBE_CONVEX_PRIMARY } from "@/lib/email/suppression-persist";
import { escapeHtmlForEmail } from "@/lib/inquiries/reply";
import { ConvexPrimaryWriteError } from "@/lib/payments/convex-primary";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return new NextResponse("Missing email parameter", { status: 400 });
  }

  try {
    await suppressEmail(email, UNSUBSCRIBE_CONVEX_PRIMARY);

    return new NextResponse(
      `
      <!DOCTYPE html>
      <html>
        <head>
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
          "Content-Type": "text/html",
        },
      },
    );
  } catch (error) {
    console.error("Unsubscribe error:", error);
    if (error instanceof ConvexPrimaryWriteError) {
      return new NextResponse(
        "Could not record your unsubscribe right now. Please try again in a moment.",
        { status: 500 },
      );
    }
    return new NextResponse("Error processing request", { status: 500 });
  }
}
