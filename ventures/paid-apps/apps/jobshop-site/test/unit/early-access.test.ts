import { CONSENT_VERSION, type FormValues, parseEarlyAccess } from "@shared/early-access";
import { describe, expect, it } from "vitest";

const valid: FormValues = {
  email: "  Estimator@Example-Shop.com ",
  name: "Sam  Rivera",
  shop: "Example Precision",
  role: "estimator",
  processes: ["milling", "turning", "milling"],
  rfqsPerWeek: "5_20",
  quotingToday: "Spreadsheet",
  notes: "Line one\r\n\r\n\r\n\r\nLine two",
  consent: true,
};

describe("parseEarlyAccess", () => {
  it("normalises a valid request", () => {
    const r = parseEarlyAccess(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      email: "estimator@example-shop.com",
      name: "Sam Rivera",
      shop: "Example Precision",
      role: "estimator",
      processes: ["milling", "turning"],
      rfqsPerWeek: "5_20",
      quotingToday: "Spreadsheet",
      notes: "Line one\n\nLine two",
      consentVersion: CONSENT_VERSION,
    });
  });

  it("reports every missing required field", () => {
    const r = parseEarlyAccess({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(
      ["consent", "email", "name", "processes", "rfqsPerWeek", "role", "shop"].sort(),
    );
  });

  it.each([
    "two@example.com, three@example.com",
    "Name <a@example.com>",
    "no-at-sign",
    "a@localhost",
    `${"a".repeat(250)}@example.com`,
  ])("rejects %s as an email", (email) => {
    const r = parseEarlyAccess({ ...valid, email });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toBeDefined();
  });

  it("rejects values outside the listed choices", () => {
    const r = parseEarlyAccess({
      ...valid,
      role: "__proto__",
      processes: ["milling", "lathe-hacking"],
      rfqsPerWeek: "lots",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.role).toBeDefined();
    expect(r.errors.processes).toBeDefined();
    expect(r.errors.rfqsPerWeek).toBeDefined();
  });

  it("requires consent and enforces length limits", () => {
    const r = parseEarlyAccess({ ...valid, consent: false, notes: "x".repeat(2001) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.consent).toBeDefined();
    expect(r.errors.notes).toBeDefined();
    expect(r.values.email).toBe(valid.email);
  });

  it("strips control characters from single-line fields", () => {
    const r = parseEarlyAccess({ ...valid, name: "Sam\u0000\u0007 Rivera\n" });
    expect(r.ok && r.value.name).toBe("Sam Rivera");
  });
});
