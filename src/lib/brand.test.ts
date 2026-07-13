import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BRAND_NAME_FALLBACK,
  EMAIL_FROM_FALLBACK,
  LEGAL_ENTITY_FALLBACK,
  LEGAL_LOCATION_FALLBACK,
  POSTAL_ADDRESS_FALLBACK,
  SUPPORT_EMAIL_FALLBACK,
  brand,
  legalEntityLine,
  marketingFooterLine,
  outreachSenderLine,
} from "./brand";
import { company, legalFooterLine } from "./company";

const BRAND_ENV_KEYS = [
  "NEXT_PUBLIC_BRAND_NAME",
  "NEXT_PUBLIC_APP_NAME",
  "NEXT_PUBLIC_LEGAL_ENTITY",
  "NEXT_PUBLIC_COMPANY_NAME",
  "NEXT_PUBLIC_LEGAL_LOCATION",
  "NEXT_PUBLIC_COMPANY_LOCATION",
  "NEXT_PUBLIC_DBA_NAME",
  "NEXT_PUBLIC_COMPANY_ADDRESS",
  "NEXT_PUBLIC_SUPPORT_EMAIL",
  "EMAIL_FROM",
] as const;

const ORIGINAL_ENV = { ...process.env };

function clearBrandEnv(): void {
  for (const key of BRAND_ENV_KEYS) {
    delete process.env[key];
  }
}

beforeEach(() => {
  clearBrandEnv();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("brand.name", () => {
  it("falls back when no brand env is set", () => {
    expect(brand.name).toBe(BRAND_NAME_FALLBACK);
    expect(brand.isConfigured).toBe(false);
  });

  it("prefers NEXT_PUBLIC_BRAND_NAME and trims whitespace", () => {
    process.env.NEXT_PUBLIC_BRAND_NAME = "  Local Site Studio  ";
    process.env.NEXT_PUBLIC_APP_NAME = "Legacy Name";
    expect(brand.name).toBe("Local Site Studio");
    expect(brand.isConfigured).toBe(true);
  });

  it("falls back to legacy NEXT_PUBLIC_APP_NAME when BRAND_NAME is unset", () => {
    process.env.NEXT_PUBLIC_APP_NAME = " Legacy App ";
    expect(brand.name).toBe("Legacy App");
    expect(brand.isConfigured).toBe(false);
  });

  it("treats whitespace-only BRAND_NAME as unset and uses legacy", () => {
    process.env.NEXT_PUBLIC_BRAND_NAME = "   ";
    process.env.NEXT_PUBLIC_APP_NAME = "Legacy App";
    expect(brand.name).toBe("Legacy App");
    expect(brand.isConfigured).toBe(false);
  });

  it("treats whitespace-only legacy APP_NAME as unset", () => {
    process.env.NEXT_PUBLIC_APP_NAME = "\t  ";
    expect(brand.name).toBe(BRAND_NAME_FALLBACK);
  });
});

describe("brand.legalEntity / legalLocation / postalAddress", () => {
  it("uses legal entity fallbacks when unset", () => {
    expect(brand.legalEntity).toBe(LEGAL_ENTITY_FALLBACK);
    expect(brand.legalLocation).toBe(LEGAL_LOCATION_FALLBACK);
    expect(brand.postalAddress).toBe(POSTAL_ADDRESS_FALLBACK);
  });

  it("prefers NEXT_PUBLIC_LEGAL_ENTITY over COMPANY_NAME", () => {
    process.env.NEXT_PUBLIC_LEGAL_ENTITY = "  Maris Stella Labs LLC ";
    process.env.NEXT_PUBLIC_COMPANY_NAME = "Old Company";
    expect(brand.legalEntity).toBe("Maris Stella Labs LLC");
  });

  it("falls back to NEXT_PUBLIC_COMPANY_NAME when LEGAL_ENTITY is unset", () => {
    process.env.NEXT_PUBLIC_COMPANY_NAME = " Legacy Co ";
    expect(brand.legalEntity).toBe("Legacy Co");
  });

  it("treats whitespace-only LEGAL_ENTITY as unset", () => {
    process.env.NEXT_PUBLIC_LEGAL_ENTITY = "  ";
    process.env.NEXT_PUBLIC_COMPANY_NAME = "Legacy Co";
    expect(brand.legalEntity).toBe("Legacy Co");
  });

  it("prefers LEGAL_LOCATION over COMPANY_LOCATION", () => {
    process.env.NEXT_PUBLIC_LEGAL_LOCATION = " Denver, CO ";
    process.env.NEXT_PUBLIC_COMPANY_LOCATION = "Boulder, CO";
    expect(brand.legalLocation).toBe("Denver, CO");
  });

  it("reads trimmed postal address", () => {
    process.env.NEXT_PUBLIC_COMPANY_ADDRESS = "  123 Main St, Denver, CO 80202 ";
    expect(brand.postalAddress).toBe("123 Main St, Denver, CO 80202");
  });
});

describe("brand.dbaName / supportEmail / emailFrom", () => {
  it("returns null dbaName when unset or whitespace-only", () => {
    expect(brand.dbaName).toBeNull();
    process.env.NEXT_PUBLIC_DBA_NAME = "   ";
    expect(brand.dbaName).toBeNull();
  });

  it("reads trimmed dbaName", () => {
    process.env.NEXT_PUBLIC_DBA_NAME = " Local Site Studio ";
    expect(brand.dbaName).toBe("Local Site Studio");
  });

  it("falls back for supportEmail and emailFrom", () => {
    expect(brand.supportEmail).toBe(SUPPORT_EMAIL_FALLBACK);
    expect(brand.emailFrom).toBe(EMAIL_FROM_FALLBACK);
  });

  it("reads trimmed supportEmail and EMAIL_FROM", () => {
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = " help@example.com ";
    process.env.EMAIL_FROM = " from@example.com ";
    expect(brand.supportEmail).toBe("help@example.com");
    expect(brand.emailFrom).toBe("from@example.com");
  });
});

describe("footer / sender helpers", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BRAND_NAME = "Local Site Studio";
    process.env.NEXT_PUBLIC_LEGAL_ENTITY = "Maris Stella Labs";
    process.env.NEXT_PUBLIC_LEGAL_LOCATION = "Colorado, USA";
  });

  it("composes marketingFooterLine with an explicit year", () => {
    expect(marketingFooterLine(2026)).toBe(
      "© 2026 Local Site Studio · A Maris Stella Labs company · Colorado, USA",
    );
  });

  it("composes legalEntityLine", () => {
    expect(legalEntityLine()).toBe("Maris Stella Labs · Colorado, USA");
  });

  it("composes outreachSenderLine for CAN-SPAM sender identity", () => {
    expect(outreachSenderLine()).toBe(
      "Local Site Studio · Maris Stella Labs · Colorado, USA",
    );
  });
});

describe("deprecated company re-exports", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BRAND_NAME = "Public Brand";
    process.env.NEXT_PUBLIC_LEGAL_ENTITY = "Legal Co";
    process.env.NEXT_PUBLIC_LEGAL_LOCATION = "Colorado, USA";
    process.env.NEXT_PUBLIC_COMPANY_ADDRESS = "1 Main St";
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = "support@example.com";
    process.env.EMAIL_FROM = "noreply@example.com";
  });

  it("mirrors brand fields on the company compatibility object", () => {
    expect(company.productName).toBe(brand.name);
    expect(company.legalName).toBe(brand.legalEntity);
    expect(company.location).toBe(brand.legalLocation);
    expect(company.postalAddress).toBe(brand.postalAddress);
    expect(company.supportEmail).toBe(brand.supportEmail);
    expect(company.emailFrom).toBe(brand.emailFrom);
  });

  it("aliases legalFooterLine to marketingFooterLine", () => {
    expect(legalFooterLine(2026)).toBe(marketingFooterLine(2026));
  });
});
