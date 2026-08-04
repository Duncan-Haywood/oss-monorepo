import { describe, expect, it } from "vitest";
import { POSTAL_ADDRESS_FALLBACK } from "@/lib/brand";
import {
  assessCompanyAddressEnvReadiness,
  COMPANY_ADDRESS_ENV_NAMES,
  isCompanyAddressConfigured,
  isCompanyAddressPlaceholder,
  listRequiredCompanyAddressEnvNames,
} from "./company-address-env-readiness";

describe("listRequiredCompanyAddressEnvNames", () => {
  it("lists NEXT_PUBLIC_COMPANY_ADDRESS in stable order", () => {
    expect(listRequiredCompanyAddressEnvNames()).toEqual([
      ...COMPANY_ADDRESS_ENV_NAMES,
    ]);
    expect(listRequiredCompanyAddressEnvNames()).toEqual([
      "NEXT_PUBLIC_COMPANY_ADDRESS",
    ]);
  });
});

describe("isCompanyAddressPlaceholder", () => {
  it("flags the documented brand.postalAddress fallback", () => {
    expect(isCompanyAddressPlaceholder(POSTAL_ADDRESS_FALLBACK)).toBe(true);
  });

  it("flags documented paste placeholders", () => {
    expect(isCompanyAddressPlaceholder("Registered business address")).toBe(
      true,
    );
    expect(
      isCompanyAddressPlaceholder(
        "Registered business address — Colorado, USA",
      ),
    ).toBe(true);
    expect(isCompanyAddressPlaceholder("Your address")).toBe(true);
    expect(isCompanyAddressPlaceholder("Your business address")).toBe(true);
    expect(isCompanyAddressPlaceholder("Business address")).toBe(true);
    expect(isCompanyAddressPlaceholder("Address here")).toBe(true);
    expect(isCompanyAddressPlaceholder("TODO")).toBe(true);
    expect(isCompanyAddressPlaceholder("changeme")).toBe(true);
    expect(isCompanyAddressPlaceholder("placeholder")).toBe(true);
    expect(isCompanyAddressPlaceholder("xxx")).toBe(true);
    expect(isCompanyAddressPlaceholder("n/a")).toBe(true);
    expect(isCompanyAddressPlaceholder("tbd")).toBe(true);
    expect(
      isCompanyAddressPlaceholder("[some stub address for launch]"),
    ).toBe(true);
    expect(
      isCompanyAddressPlaceholder("Your address, Denver, CO 80202"),
    ).toBe(true);
    expect(isCompanyAddressPlaceholder("changeme-street")).toBe(true);
  });

  it("accepts real-looking postal addresses", () => {
    expect(
      isCompanyAddressPlaceholder("123 Main St, Denver, CO 80202"),
    ).toBe(false);
    expect(
      isCompanyAddressPlaceholder("100 Broadway, Suite 4, Boulder, CO 80302"),
    ).toBe(false);
  });
});

describe("isCompanyAddressConfigured", () => {
  it("rejects missing, empty, and whitespace-only values", () => {
    expect(isCompanyAddressConfigured(undefined)).toBe(false);
    expect(isCompanyAddressConfigured("")).toBe(false);
    expect(isCompanyAddressConfigured("   ")).toBe(false);
    expect(isCompanyAddressConfigured("\t")).toBe(false);
  });

  it("rejects documented placeholders", () => {
    expect(isCompanyAddressConfigured(POSTAL_ADDRESS_FALLBACK)).toBe(false);
    expect(isCompanyAddressConfigured("  Registered business address  ")).toBe(
      false,
    );
  });

  it("accepts a trimmed real postal address", () => {
    expect(
      isCompanyAddressConfigured("123 Main St, Denver, CO 80202"),
    ).toBe(true);
    expect(
      isCompanyAddressConfigured("  100 Broadway, Boulder, CO 80302  "),
    ).toBe(true);
  });
});

describe("assessCompanyAddressEnvReadiness", () => {
  it("reports missing when env is empty", () => {
    const result = assessCompanyAddressEnvReadiness({});
    expect(result.ready).toBe(false);
    expect(result.required).toEqual(["NEXT_PUBLIC_COMPANY_ADDRESS"]);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual(["NEXT_PUBLIC_COMPANY_ADDRESS"]);
    expect(result.companyAddressReady).toBe(false);
    expect(result.placeholderDetected).toBe(false);
  });

  it("treats whitespace-only as missing (not placeholder)", () => {
    const result = assessCompanyAddressEnvReadiness({
      NEXT_PUBLIC_COMPANY_ADDRESS: "   ",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["NEXT_PUBLIC_COMPANY_ADDRESS"]);
    expect(result.placeholderDetected).toBe(false);
  });

  it("flags the documented fallback stub as not ready", () => {
    const result = assessCompanyAddressEnvReadiness({
      NEXT_PUBLIC_COMPANY_ADDRESS: POSTAL_ADDRESS_FALLBACK,
    });
    expect(result.ready).toBe(false);
    expect(result.companyAddressReady).toBe(false);
    expect(result.placeholderDetected).toBe(true);
    expect(result.missing).toEqual(["NEXT_PUBLIC_COMPANY_ADDRESS"]);
  });

  it("is ready when NEXT_PUBLIC_COMPANY_ADDRESS is a non-placeholder address", () => {
    const result = assessCompanyAddressEnvReadiness({
      NEXT_PUBLIC_COMPANY_ADDRESS: "123 Main St, Denver, CO 80202",
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual(["NEXT_PUBLIC_COMPANY_ADDRESS"]);
    expect(result.companyAddressReady).toBe(true);
    expect(result.placeholderDetected).toBe(false);
  });
});
