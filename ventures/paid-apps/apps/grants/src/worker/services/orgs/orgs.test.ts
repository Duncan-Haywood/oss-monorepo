import { describe, expect, it } from "vitest";
import { buildPromptProfile, PROMPT_PROFILE_HEADER } from "./prompt-profile";
import { createOrgSchema, profilePatchSchema, settingsPatchSchema } from "./schemas";
import { nextFreeSlug, slugify } from "./slug";

describe("slugify", () => {
  it("makes URL-safe slugs", () => {
    expect(slugify("Southwest Indian Foundation")).toBe("southwest-indian-foundation");
    expect(slugify("  Diné College & Friends!! ")).toBe("dine-college-and-friends");
    expect(slugify("!!!")).toBe("org");
    expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(48);
  });

  it("picks the first free suffix", () => {
    expect(nextFreeSlug("swif", [])).toBe("swif");
    expect(nextFreeSlug("swif", ["swif", "swif-2"])).toBe("swif-3");
  });
});

describe("profilePatchSchema", () => {
  it("normalizes and validates", () => {
    const r = profilePatchSchema.parse({
      websiteUrl: "swif.org",
      uei: "abc123def456",
      dba: "  ",
      focusAreas: ["trades", "trades"],
    });
    expect(r).toEqual({
      websiteUrl: "https://swif.org",
      uei: "ABC123DEF456",
      dba: null,
      focusAreas: ["trades"],
    });
    expect(profilePatchSchema.safeParse({ ein: "12-345678" }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ ein: "12-3456789" }).success).toBe(true);
  });

  it("omits keys that were not sent", () => {
    expect(Object.keys(profilePatchSchema.parse({ city: "Gallup" }))).toEqual(["city"]);
  });
});

describe("org name fields", () => {
  it("reject CR/LF and other control characters (names reach email subjects and prompts)", () => {
    const base = {
      name: "SWIF",
      legalName: "Southwest Indian Foundation",
      orgType: "nonprofit_501c3",
    };
    expect(createOrgSchema.safeParse(base).success).toBe(true);
    expect(createOrgSchema.safeParse({ ...base, name: "SWIF\r\nBcc: x@evil.test" }).success).toBe(
      false,
    );
    expect(createOrgSchema.safeParse({ ...base, legalName: "SWIF\u0000" }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ name: "Line\u2028Break" }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ name: "  Diné College & Friends  " }).data?.name).toBe(
      "Diné College & Friends",
    );
  });
});

describe("settingsPatchSchema", () => {
  it("enforces bounds", () => {
    expect(settingsPatchSchema.safeParse({ highLikelihoodThreshold: 0.75 }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ highLikelihoodThreshold: -0.1 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ rawFileRetentionDays: null }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ rawFileRetentionDays: 0 }).success).toBe(false);
  });
});

describe("buildPromptProfile", () => {
  it("renders only filled-in fields as a labeled block", () => {
    const text = buildPromptProfile(
      {
        orgId: "org_x",
        legalName: "Southwest Indian Foundation, Inc.",
        dba: null,
        orgType: "nonprofit_501c3",
        ein: "85-0123456",
        uei: null,
        websiteUrl: "https://swif.org",
        addressLine1: "100 Main St",
        addressLine2: null,
        city: "Gallup",
        state: "NM",
        postalCode: "87301",
        country: "US",
        contactName: "Jane Doe",
        contactEmail: "jane@swif.example",
        contactPhone: null,
        foundedYear: 1968,
        focusAreas: ["workforce development", "housing"],
        serviceAreas: ["Gallup, NM", "Navajo Nation"],
        onboardingCompletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      "Southwest Indian Foundation",
    );
    expect(text.startsWith(PROMPT_PROFILE_HEADER)).toBe(true);
    expect(text).toContain("- Legal name: Southwest Indian Foundation, Inc.");
    expect(text).toContain("- Also known as: Southwest Indian Foundation");
    expect(text).toContain("- Organization type: 501(c)(3) nonprofit");
    expect(text).toContain("- Location: Gallup, NM, US");
    expect(text).toContain("- EIN: 85-0123456");
    expect(text).toContain("- Founded: 1968");
    expect(text).toContain("- Focus areas: workforce development; housing");
    expect(text).toContain("- Service areas: Gallup, NM; Navajo Nation");
    expect(text).not.toContain("UEI");
    // Contact details are not identity facts for drafting.
    expect(text).not.toContain("jane@swif.example");
  });
});
