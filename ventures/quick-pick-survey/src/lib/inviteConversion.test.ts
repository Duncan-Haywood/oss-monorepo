import { describe, expect, it } from "vitest";
import {
  INVITE_MATURITY_MS,
  summariseConversion,
  type ConversionRow,
} from "@/lib/inviteConversion";

const NOW = new Date("2026-08-08T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** An invite created `agoMs` before NOW, converted `afterMs` after it was created. */
function invite(agoMs: number, afterMs: number | null): ConversionRow {
  const createdAt = new Date(NOW.getTime() - agoMs);
  return {
    createdAt,
    converted: afterMs !== null,
    convertedAt: afterMs === null ? null : new Date(createdAt.getTime() + afterMs),
  };
}

describe("the maturity window", () => {
  it("is a week, and the direction that inflates every rate is downward", () => {
    // Pinned deliberately. Lowering this moves invites that have not yet had a
    // chance to convert into the cohort denominator while their conversions are
    // still in the future, which raises `maturedRate` without anyone joining.
    expect(INVITE_MATURITY_MS).toBe(7 * DAY);
  });

  it("lowering it would raise the reported rate over the same data — the reason it is pinned", () => {
    // Ten invites sent two days ago; one converted. Under the real window none
    // of them are mature, so the honest answer is "no cohort yet".
    const rows = [invite(2 * DAY, 1 * HOUR), ...Array.from({ length: 9 }, () => invite(2 * DAY, null))];
    const summary = summariseConversion(rows, NOW);

    expect(summary.maturedCreated).toBe(0);
    expect(summary.maturedRate).toBeNull();

    // Had the window been one day, the same data would have published 10%.
    // This asserts the mechanism, so a future change to the constant has to
    // confront what it does to the number rather than just re-baselining a
    // snapshot.
    const cutoffUnderAShorterWindow = NOW.getTime() - 1 * DAY;
    const wouldBeMature = rows.filter((row) => row.createdAt.getTime() <= cutoffUnderAShorterWindow);
    expect(wouldBeMature).toHaveLength(10);
  });
});

describe("summariseConversion", () => {
  it("reports a rate over the matured cohort only, numerator and denominator together", () => {
    const rows = [
      invite(30 * DAY, 2 * HOUR), // mature, converted
      invite(20 * DAY, 5 * HOUR), // mature, converted
      invite(15 * DAY, null), // mature, never converted
      invite(10 * DAY, null), // mature, never converted
    ];

    const summary = summariseConversion(rows, NOW);

    expect(summary.maturedCreated).toBe(4);
    expect(summary.maturedConverted).toBe(2);
    expect(summary.maturedRate).toBe(0.5);
    expect(summary.immature).toBe(0);
  });

  it("excludes invites too young to have converted from BOTH sides of the rate", () => {
    // Four mature invites, half converted. Then a burst of twenty invites sent
    // an hour ago — the shape a referral push produces. A naive all-time rate
    // would read 2/24 = 8% and the venture would look like it had collapsed.
    const rows = [
      invite(30 * DAY, 2 * HOUR),
      invite(20 * DAY, 5 * HOUR),
      invite(15 * DAY, null),
      invite(10 * DAY, null),
      ...Array.from({ length: 20 }, () => invite(1 * HOUR, null)),
    ];

    const summary = summariseConversion(rows, NOW);

    expect(summary.created).toBe(24);
    expect(summary.maturedCreated).toBe(4);
    expect(summary.maturedConverted).toBe(2);
    expect(summary.maturedRate).toBe(0.5);
    expect(summary.immature).toBe(20);
  });

  it("returns null, not zero, when no invite has had time to convert", () => {
    const summary = summariseConversion([invite(1 * HOUR, null), invite(2 * HOUR, null)], NOW);

    // The distinction this whole module exists to protect: "nobody has had the
    // chance yet" must not render as "nobody joined".
    expect(summary.maturedRate).toBeNull();
    expect(summary.maturedRate).not.toBe(0);
    expect(summary.immature).toBe(2);
  });

  it("returns null for no invites at all", () => {
    const summary = summariseConversion([], NOW);

    expect(summary.created).toBe(0);
    expect(summary.maturedRate).toBeNull();
    expect(summary.medianHoursToConvert).toBeNull();
    expect(summary.p90HoursToConvert).toBeNull();
    expect(summary.maturityAdequate).toBeNull();
  });

  it("reports a real zero when a matured cohort genuinely converted nobody", () => {
    const summary = summariseConversion(
      Array.from({ length: 5 }, () => invite(10 * DAY, null)),
      NOW,
    );

    expect(summary.maturedCreated).toBe(5);
    expect(summary.maturedRate).toBe(0);
  });

  it("counts a conversion that has no timestamp, and gives it no latency", () => {
    // `joinerId` set with `joinedAt` null is reachable in the schema. Dropping
    // it would understate the rate; inventing a latency for it would corrupt
    // the distribution that decides whether the window is long enough.
    const createdAt = new Date(NOW.getTime() - 10 * DAY);
    const summary = summariseConversion(
      [
        { createdAt, converted: true, convertedAt: null },
        invite(10 * DAY, 4 * HOUR),
      ],
      NOW,
    );

    expect(summary.maturedConverted).toBe(2);
    expect(summary.maturedRate).toBe(1);
    expect(summary.medianHoursToConvert).toBe(4);
  });

  it("drops a conversion stamped before its own invite from the latency sample but keeps the conversion", () => {
    const summary = summariseConversion(
      [invite(10 * DAY, -3 * HOUR), invite(10 * DAY, 6 * HOUR)],
      NOW,
    );

    expect(summary.maturedConverted).toBe(2);
    expect(summary.medianHoursToConvert).toBe(6);
  });
});

describe("the window checks itself against the data", () => {
  it("flags the rate as still censored when conversions arrive after the window closes", () => {
    // Nine fast joins and two that took a fortnight: p90 lands beyond a week,
    // so a week is not long enough and `maturedRate` still understates.
    const rows = [
      ...Array.from({ length: 9 }, () => invite(40 * DAY, 2 * HOUR)),
      invite(40 * DAY, 14 * DAY),
      invite(40 * DAY, 20 * DAY),
    ];

    const summary = summariseConversion(rows, NOW);

    expect(summary.p90HoursToConvert).toBeGreaterThan(summary.maturityWindowHours);
    expect(summary.maturityAdequate).toBe(false);
  });

  it("confirms the window when conversions land well inside it", () => {
    const summary = summariseConversion(
      Array.from({ length: 10 }, () => invite(40 * DAY, 3 * HOUR)),
      NOW,
    );

    expect(summary.maturityAdequate).toBe(true);
  });

  it("is falsified by a matured invite that converted after the window closed", () => {
    const summary = summariseConversion([invite(20 * DAY, 12 * DAY)], NOW);

    expect(summary.maturityAdequate).toBe(false);
  });

  it("measures latency over recent conversions too, so the distribution stays current", () => {
    // One old fast join, then ten recent joins taking well over a day. The
    // recent ones are the live signal — if the latency sample were restricted
    // to the matured cohort the median would report 1h while joins were
    // actually taking 40, and the slowdown would surface a week late.
    const rows = [
      invite(30 * DAY, 1 * HOUR),
      ...Array.from({ length: 10 }, () => invite(2 * DAY, 40 * HOUR)),
    ];

    const summary = summariseConversion(rows, NOW);

    expect(summary.medianHoursToConvert).toBe(40);
    expect(summary.p90HoursToConvert).toBe(40);
  });
});
