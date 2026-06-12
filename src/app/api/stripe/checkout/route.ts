import {
  buildCheckoutReadiness,
  buildCheckoutSessionPayload,
  getCheckoutEnvStatus,
  parseCheckoutCart,
  type CheckoutLineItem,
  type CheckoutShippingRegion,
} from "@/lib/checkout";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function readEnv() {
  return {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_CONNECT_CLIENT_ID: process.env.STRIPE_CONNECT_CLIENT_ID,
    PRINTFUL_API_KEY: process.env.PRINTFUL_API_KEY,
    PRINTFUL_STORE_ID: process.env.PRINTFUL_STORE_ID,
    GELATO_API_KEY: process.env.GELATO_API_KEY,
    GELATO_STORE_ID: process.env.GELATO_STORE_ID,
  };
}

function resolveBaseUrl(request: Request): string {
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function GET() {
  const env = readEnv();
  const status = getCheckoutEnvStatus(env);

  return NextResponse.json({
    endpoint: "/api/stripe/checkout",
    methods: ["GET", "POST"],
    ...status,
  });
}

export async function POST(request: Request) {
  const env = readEnv();
  const envStatus = getCheckoutEnvStatus(env);
  const baseUrl = resolveBaseUrl(request);

  let body: { lineItems?: CheckoutLineItem[]; region?: CheckoutShippingRegion };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const lineItems = body.lineItems ?? [];
  const region: CheckoutShippingRegion = body.region ?? "US";

  if (lineItems.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  const readiness = buildCheckoutReadiness(lineItems, undefined, undefined, env);
  const cartBlockers = readiness.blockers.filter(
    (blocker) => !blocker.includes("STRIPE") && !blocker.includes("PRINTFUL") && !blocker.includes("Gelato"),
  );

  if (cartBlockers.length > 0) {
    return NextResponse.json(
      {
        error: "Cart not eligible for checkout",
        blockers: cartBlockers,
      },
      { status: 422 },
    );
  }

  const session = buildCheckoutSessionPayload(lineItems, region, baseUrl, env);

  if (!envStatus.readyForTestCheckout) {
    return NextResponse.json({
      ...envStatus,
      simulated: true,
      session,
      hint: "Test-mode Stripe keys missing — session payload preview only. Add keys to .env.local to create live Checkout Sessions.",
    });
  }

  return NextResponse.json({
    ...envStatus,
    simulated: false,
    session,
    hint: "Wire this payload to stripe.checkout.sessions.create in Phase 3 — webhook at /api/stripe/webhook handles payment_intent.succeeded.",
  });
}

export async function PUT(request: Request) {
  const payload = await request.text();
  const cart = parseCheckoutCart(payload || "[]");
  return NextResponse.json({ lineItems: cart, count: cart.length });
}
