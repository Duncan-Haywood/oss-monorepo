import { describe, expect, it } from "vitest";
import {
  addDays,
  canonicalTimeZone,
  effectiveTimeZone,
  isoShopDay,
  isTimeZone,
  knownTimeZones,
  UTC,
  zonedDate,
} from "./time-zone";

describe("time zones", () => {
  it("accepts IANA names Intl knows and rejects the rest", () => {
    expect(isTimeZone("America/Chicago")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("Europe/Berlin")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("")).toBe(false);
    expect(isTimeZone("x".repeat(65))).toBe(false);
  });

  it("canonicalises spelling and falls back to UTC", () => {
    expect(canonicalTimeZone(" america/chicago ")).toBe("America/Chicago");
    expect(canonicalTimeZone("nowhere")).toBeNull();
    expect(effectiveTimeZone(null)).toBe(UTC);
    expect(effectiveTimeZone("Mars/Olympus")).toBe(UTC);
    expect(effectiveTimeZone("America/Denver")).toBe("America/Denver");
  });

  it("reads the wall calendar date across DST and year edges", () => {
    const at = (iso: string) => Date.parse(iso);
    expect(zonedDate(at("2026-11-01T00:00:00Z"), "America/Chicago")).toBe("2026-10-31");
    expect(zonedDate(at("2026-11-01T06:00:00Z"), "America/Chicago")).toBe("2026-11-01");
    // US DST ends 1 Nov 2026 at 2 am local: 06:59Z is 00:59 CST (after the change), still 1 Nov.
    expect(zonedDate(at("2026-11-01T06:59:00Z"), "America/Chicago")).toBe("2026-11-01");
    expect(zonedDate(at("2025-12-31T23:30:00Z"), "Asia/Tokyo")).toBe("2026-01-01");
    expect(zonedDate(at("2025-12-31T23:30:00Z"), UTC)).toBe("2025-12-31");
    // An unknown zone reads as UTC rather than throwing.
    expect(zonedDate(at("2025-12-31T23:30:00Z"), "Mars/Olympus")).toBe("2025-12-31");
  });

  it("adds calendar days across month, leap-day and year edges", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 30)).toBe("2027-01-30");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-11-26", 0)).toBe("2026-11-26");
  });

  it("lists the runtime's zones for the picker", () => {
    const zones = knownTimeZones();
    expect(zones.length).toBeGreaterThan(300);
    expect(zones).toContain("America/Chicago");
  });
});

describe("isoShopDay", () => {
  it("reads the instant on the shop's calendar, not the UTC one", () => {
    // 7:30 pm CDT on 31 October is already 1 November in UTC.
    expect(isoShopDay("2026-11-01T00:30:00.000Z", "America/Chicago")).toBe("2026-10-31");
    expect(isoShopDay("2026-11-01T00:30:00.000Z", null)).toBe("2026-11-01");
  });

  it("moves forward for zones ahead of UTC", () => {
    expect(isoShopDay("2026-10-31T23:30:00Z", "Asia/Tokyo")).toBe("2026-11-01");
  });

  it("falls back to UTC for an unknown zone", () => {
    expect(isoShopDay("2026-11-01T00:30:00Z", "Mars/Olympus_Mons")).toBe("2026-11-01");
  });

  it("prints nothing for a missing or bad instant", () => {
    expect(isoShopDay(null, "America/Chicago")).toBe("");
    expect(isoShopDay(undefined, "America/Chicago")).toBe("");
    expect(isoShopDay("not a date", "America/Chicago")).toBe("");
  });
});
