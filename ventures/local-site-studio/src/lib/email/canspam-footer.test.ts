import { describe, expect, it } from "vitest";
import {
  BRAND_NAME_FALLBACK,
  POSTAL_ADDRESS_FALLBACK,
} from "@/lib/brand";
import {
  assessCanSpamFooter,
  describeCanSpamRefusal,
  type CanSpamFooterInputs,
} from "./canspam-footer";

/** Every field set to a value a real operator could have configured. */
function configured(
  overrides: Partial<CanSpamFooterInputs> = {},
): CanSpamFooterInputs {
  return {
    brandName: "Harbor Site Studio",
    legalEntity: "Maris Stella Labs",
    postalAddress: "1600 Pearl St Suite 200, Boulder, CO 80302",
    appUrl: "https://studio.marisstella.dev",
    ...overrides,
  };
}

describe("assessCanSpamFooter", () => {
  it("builds the footer when every statutory field is configured", () => {
    const result = assessCanSpamFooter(configured());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.brandName).toBe("Harbor Site Studio");
    expect(result.postalAddress).toBe(
      "1600 Pearl St Suite 200, Boulder, CO 80302",
    );
    expect(result.baseUrl).toBe("https://studio.marisstella.dev");
  });

  it("strips a trailing slash from the origin so links do not double up", () => {
    const result = assessCanSpamFooter(
      configured({ appUrl: "  https://studio.marisstella.dev/  " }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.baseUrl).toBe("https://studio.marisstella.dev");
  });

  it("refuses the shipped postal-address placeholder and names the env var", () => {
    const result = assessCanSpamFooter(
      configured({ postalAddress: POSTAL_ADDRESS_FALLBACK }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toEqual(["NEXT_PUBLIC_COMPANY_ADDRESS"]);
    expect(result.reason).toContain("NEXT_PUBLIC_COMPANY_ADDRESS");
    expect(result.reason).toContain("physical postal address");
  });

  it("refuses any bracketed stub, not only the exact documented one", () => {
    const result = assessCanSpamFooter(
      configured({ postalAddress: "[your registered address]" }),
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a missing or whitespace-only postal address", () => {
    expect(assessCanSpamFooter(configured({ postalAddress: undefined })).ok).toBe(
      false,
    );
    expect(assessCanSpamFooter(configured({ postalAddress: "   " })).ok).toBe(
      false,
    );
  });

  it("refuses the shipped brand-name placeholder (sender identification)", () => {
    const result = assessCanSpamFooter(
      configured({ brandName: BRAND_NAME_FALLBACK }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toEqual(["NEXT_PUBLIC_BRAND_NAME"]);
    expect(result.reason).toContain("NEXT_PUBLIC_BRAND_NAME");
  });

  it("refuses a localhost origin (the opt-out link would be unreachable)", () => {
    const result = assessCanSpamFooter(
      configured({ appUrl: "http://localhost:3000" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toEqual(["NEXT_PUBLIC_APP_URL"]);
    expect(result.reason).toContain("opt-out");
  });

  it("names every missing variable, not just the first — the state the Deployment actually ships", () => {
    const result = assessCanSpamFooter({
      brandName: BRAND_NAME_FALLBACK,
      legalEntity: "Maris Stella Labs",
      postalAddress: POSTAL_ADDRESS_FALLBACK,
      appUrl: undefined,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toEqual([
      "NEXT_PUBLIC_BRAND_NAME",
      "NEXT_PUBLIC_COMPANY_ADDRESS",
      "NEXT_PUBLIC_APP_URL",
    ]);
    for (const name of result.missing) {
      expect(result.reason).toContain(name);
    }
  });

  it("never substitutes a value for a missing one", () => {
    const result = assessCanSpamFooter(
      configured({ postalAddress: undefined, appUrl: undefined }),
    );
    // A refusal carries no address and no origin at all — there is nothing in
    // the result a caller could accidentally render.
    expect(result).not.toHaveProperty("postalAddress");
    expect(result).not.toHaveProperty("baseUrl");
  });
});

describe("describeCanSpamRefusal", () => {
  it("cites the obligation behind each variable", () => {
    const reason = describeCanSpamRefusal([
      "NEXT_PUBLIC_COMPANY_ADDRESS",
      "NEXT_PUBLIC_APP_URL",
    ]);
    expect(reason).toContain("§7704(a)(5)");
    expect(reason).toContain("§7704(a)(3)");
  });
});
