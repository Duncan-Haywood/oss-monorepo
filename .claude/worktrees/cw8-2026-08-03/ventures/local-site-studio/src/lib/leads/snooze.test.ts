import { describe, expect, it } from "vitest";
import {
  MAX_SNOOZE_MS,
  SNOOZE_PRESET_MS,
  isLeadSnoozed,
  isSnoozePresetId,
  normalizeSnoozedUntil,
  snoozePresetLabel,
  snoozeRemainingLabel,
  snoozedUntilFromPreset,
} from "./snooze";

const NOW = Date.parse("2026-07-12T12:00:00.000Z");

describe("snoozedUntilFromPreset", () => {
  it("adds each preset duration to now", () => {
    expect(snoozedUntilFromPreset("1d", NOW)).toBe(
      new Date(NOW + SNOOZE_PRESET_MS["1d"]).toISOString(),
    );
    expect(snoozedUntilFromPreset("3d", NOW)).toBe(
      new Date(NOW + SNOOZE_PRESET_MS["3d"]).toISOString(),
    );
    expect(snoozedUntilFromPreset("7d", NOW)).toBe(
      new Date(NOW + SNOOZE_PRESET_MS["7d"]).toISOString(),
    );
  });
});

describe("normalizeSnoozedUntil", () => {
  it("clears empty / null / undefined", () => {
    expect(normalizeSnoozedUntil(undefined, NOW)).toEqual({
      ok: true,
      snoozedUntil: undefined,
    });
    expect(normalizeSnoozedUntil(null, NOW)).toEqual({
      ok: true,
      snoozedUntil: undefined,
    });
    expect(normalizeSnoozedUntil("", NOW)).toEqual({
      ok: true,
      snoozedUntil: undefined,
    });
    expect(normalizeSnoozedUntil("   ", NOW)).toEqual({
      ok: true,
      snoozedUntil: undefined,
    });
  });

  it("rejects invalid ISO", () => {
    const result = normalizeSnoozedUntil("not-a-date", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/valid ISO/i);
  });

  it("clears already-expired timestamps", () => {
    expect(
      normalizeSnoozedUntil("2026-07-12T11:00:00.000Z", NOW),
    ).toEqual({ ok: true, snoozedUntil: undefined });
  });

  it("accepts a future timestamp within the soft cap", () => {
    const until = new Date(NOW + 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(normalizeSnoozedUntil(until, NOW)).toEqual({
      ok: true,
      snoozedUntil: until,
    });
  });

  it("rejects durations past MAX_SNOOZE_MS", () => {
    const tooFar = new Date(NOW + MAX_SNOOZE_MS + 1000).toISOString();
    const result = normalizeSnoozedUntil(tooFar, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cannot exceed/i);
  });
});

describe("isLeadSnoozed", () => {
  it("is true only while snoozedUntil is in the future", () => {
    expect(isLeadSnoozed(undefined, NOW)).toBe(false);
    expect(isLeadSnoozed("2026-07-12T11:59:59.000Z", NOW)).toBe(false);
    expect(isLeadSnoozed("2026-07-12T12:00:01.000Z", NOW)).toBe(true);
    expect(isLeadSnoozed("bogus", NOW)).toBe(false);
  });
});

describe("snoozeRemainingLabel", () => {
  it("formats hours under 48h and days otherwise", () => {
    expect(
      snoozeRemainingLabel(
        new Date(NOW + 3 * 60 * 60 * 1000).toISOString(),
        NOW,
      ),
    ).toBe("Snoozed 3h");
    expect(
      snoozeRemainingLabel(
        new Date(NOW + 3 * 24 * 60 * 60 * 1000).toISOString(),
        NOW,
      ),
    ).toBe("Snoozed 3d");
  });
});

describe("isSnoozePresetId / snoozePresetLabel", () => {
  it("narrows known presets", () => {
    expect(isSnoozePresetId("1d")).toBe(true);
    expect(isSnoozePresetId("2d")).toBe(false);
    expect(snoozePresetLabel("1d")).toBe("1 day");
    expect(snoozePresetLabel("3d")).toBe("3 days");
    expect(snoozePresetLabel("7d")).toBe("7 days");
  });
});
