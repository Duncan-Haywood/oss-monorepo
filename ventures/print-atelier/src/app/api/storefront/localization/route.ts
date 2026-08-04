import { NextResponse } from "next/server";
import { generateStorefrontLocalizationWidgetState, persistLocalizationAudit } from "@/lib/storefront-localization";

export async function GET(request: Request) {

  const url = new URL(request.url);
  const countryParam = url.searchParams.get("country") || request.headers.get("x-user-country") || undefined;
  const amountUsdCents = parseInt(url.searchParams.get("amount") || "5000", 10);

  const widgetState = generateStorefrontLocalizationWidgetState(amountUsdCents, countryParam || "US");

  persistLocalizationAudit({
    countryCode: widgetState.countryCode,
    currency: widgetState.currency,
    baseUsdCents: amountUsdCents,
    displayedPriceCents: widgetState.displayPriceCents,
    vatInclusive: widgetState.vatInclusive,
    vatRatePercent: widgetState.vatRatePercent,
  });

  return NextResponse.json(widgetState, { status: 200 });
}
