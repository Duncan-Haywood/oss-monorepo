/**
 * Storefront Localization & VAT-Inclusive Currency Display Widget
 *
 * Provides IP/Header geo-detection, currency formatting with FX rate buffer,
 * localized charm pricing, and EU/UK/US VAT inclusive/exclusive disclaimers.
 */

import { convertCurrency, applyLocalRounding, formatLocalPrice, SupportedCurrency } from "./global-pricing.ts";

export interface UserLocalizationConfig {
  countryCode: string;
  currency: SupportedCurrency;
  locale: string;
  vatInclusive: boolean;
  defaultVatRatePercent: number;
}

export interface LocalizedPriceResult {
  baseUsdCents: number;
  targetCurrency: SupportedCurrency;
  rawConvertedCents: number;
  fxBufferCents: number;
  displayPriceCents: number;
  formattedDisplay: string;
  vatInclusive: boolean;
  vatRatePercent: number;
  vatAmountCents: number;
  netPriceCents: number;
}

export interface StorefrontWidgetState {
  countryCode: string;
  currency: SupportedCurrency;
  locale: string;
  vatInclusive: boolean;
  displayPriceCents: number;
  priceDisplay: string;
  taxNotice: string;
  vatRatePercent: number;
  vatAmountCents: number;
}

export interface LocalizationAuditEntry {
  id: string;
  timestamp: string;
  countryCode: string;
  currency: SupportedCurrency;
  baseUsdCents: number;
  displayedPriceCents: number;
  vatInclusive: boolean;
  vatRatePercent: number;
}

const COUNTRY_CURRENCY_MAP: Record<string, { currency: SupportedCurrency; locale: string; vatInclusive: boolean; vatRate: number }> = {
  GB: { currency: "GBP", locale: "en-GB", vatInclusive: true, vatRate: 20.0 },
  UK: { currency: "GBP", locale: "en-GB", vatInclusive: true, vatRate: 20.0 },
  DE: { currency: "EUR", locale: "de-DE", vatInclusive: true, vatRate: 19.0 },
  FR: { currency: "EUR", locale: "fr-FR", vatInclusive: true, vatRate: 20.0 },
  IT: { currency: "EUR", locale: "it-IT", vatInclusive: true, vatRate: 22.0 },
  ES: { currency: "EUR", locale: "es-ES", vatInclusive: true, vatRate: 21.0 },
  NL: { currency: "EUR", locale: "nl-NL", vatInclusive: true, vatRate: 21.0 },
  BE: { currency: "EUR", locale: "nl-BE", vatInclusive: true, vatRate: 21.0 },
  AT: { currency: "EUR", locale: "de-AT", vatInclusive: true, vatRate: 20.0 },
  IE: { currency: "EUR", locale: "en-IE", vatInclusive: true, vatRate: 23.0 },
  JP: { currency: "JPY", locale: "ja-JP", vatInclusive: true, vatRate: 10.0 },
  CA: { currency: "CAD", locale: "en-CA", vatInclusive: false, vatRate: 5.0 },
  AU: { currency: "AUD", locale: "en-AU", vatInclusive: true, vatRate: 10.0 },
  US: { currency: "USD", locale: "en-US", vatInclusive: false, vatRate: 0.0 },
};

const localizationAuditMemoryStore: LocalizationAuditEntry[] = [];

/**
 * Detects user currency, locale, and VAT rules based on Accept-Language and geo-country.
 */
export function detectUserLocaleAndCurrency(
  acceptLanguageHeader?: string,
  clientGeoCountry?: string
): UserLocalizationConfig {
  const country = clientGeoCountry?.toUpperCase() || extractCountryFromLanguageHeader(acceptLanguageHeader) || "US";
  const mapped = COUNTRY_CURRENCY_MAP[country];

  if (mapped) {
    return {
      countryCode: country,
      currency: mapped.currency,
      locale: mapped.locale,
      vatInclusive: mapped.vatInclusive,
      defaultVatRatePercent: mapped.vatRate,
    };
  }

  return {
    countryCode: country,
    currency: "USD",
    locale: "en-US",
    vatInclusive: false,
    defaultVatRatePercent: 0.0,
  };
}

function extractCountryFromLanguageHeader(header?: string): string | null {
  if (!header) return null;
  const match = header.match(/([a-z]{2})-([A-Z]{2})/);
  return match ? match[2] : null;
}

/**
 * Converts price and applies localized VAT inclusive/exclusive formatting.
 */
export function formatLocalizedPriceWithVat(
  baseUsdCents: number,
  targetCurrency: SupportedCurrency,
  vatRatePercent: number,
  options?: { includeVatLabel?: boolean }
): LocalizedPriceResult {
  const converted = convertCurrency(baseUsdCents, targetCurrency);
  const roundedDisplayCents = applyLocalRounding(converted.totalConvertedCents, targetCurrency);
  const formattedBase = formatLocalPrice(roundedDisplayCents, targetCurrency);

  const isVatInclusive = targetCurrency !== "USD" && targetCurrency !== "CAD";
  let vatAmountCents = 0;
  let netPriceCents = roundedDisplayCents;

  if (isVatInclusive && vatRatePercent > 0) {
    vatAmountCents = Math.round(roundedDisplayCents - roundedDisplayCents / (1 + vatRatePercent / 100));
    netPriceCents = roundedDisplayCents - vatAmountCents;
  }

  let formattedDisplay = formattedBase;
  if (options?.includeVatLabel) {
    if (isVatInclusive) {
      formattedDisplay += " (VAT included)";
    } else {
      formattedDisplay += " (+ tax)";
    }
  }

  return {
    baseUsdCents,
    targetCurrency,
    rawConvertedCents: converted.rawConvertedCents,
    fxBufferCents: converted.fxBufferCents,
    displayPriceCents: roundedDisplayCents,
    formattedDisplay,
    vatInclusive: isVatInclusive,
    vatRatePercent,
    vatAmountCents,
    netPriceCents,
  };
}

/**
 * Builds complete storefront widget state payload.
 */
export function generateStorefrontLocalizationWidgetState(
  baseUsdCents: number,
  countryCode: string
): StorefrontWidgetState {
  const config = detectUserLocaleAndCurrency(undefined, countryCode);
  const priceResult = formatLocalizedPriceWithVat(baseUsdCents, config.currency, config.defaultVatRatePercent, {
    includeVatLabel: true,
  });

  let taxNotice = "Local sales tax calculated at checkout";
  if (config.vatInclusive) {
    taxNotice = `${config.defaultVatRatePercent}% MwSt / VAT Included`;
  }

  return {
    countryCode: config.countryCode,
    currency: config.currency,
    locale: config.locale,
    vatInclusive: config.vatInclusive,
    displayPriceCents: priceResult.displayPriceCents,
    priceDisplay: priceResult.formattedDisplay,
    taxNotice,
    vatRatePercent: config.defaultVatRatePercent,
    vatAmountCents: priceResult.vatAmountCents,
  };
}

/**
 * Generates Convex Schema definition for storefront localization audits.
 */
export function generateConvexLocalizationSchema() {
  return {
    tables: {
      storefront_localization_audits: {
        fields: {
          timestamp: "string",
          countryCode: "string",
          currency: "string",
          baseUsdCents: "number",
          displayedPriceCents: "number",
          vatInclusive: "boolean",
          vatRatePercent: "number",
        },
        indexes: {
          by_country: ["countryCode"],
          by_timestamp: ["timestamp"],
        },
      },
    },
  };
}

export function persistLocalizationAudit(input: Omit<LocalizationAuditEntry, "id" | "timestamp">): LocalizationAuditEntry {
  const entry: LocalizationAuditEntry = {
    id: `loc_aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...input,
  };
  localizationAuditMemoryStore.push(entry);
  return entry;
}

export function getLocalizationAudits(): LocalizationAuditEntry[] {
  return [...localizationAuditMemoryStore];
}

export function clearLocalizationAuditsForTesting(): void {
  localizationAuditMemoryStore.length = 0;
}
