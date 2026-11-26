import type { FunderTimelineItem } from "@shared/api/funders";
import { describe, expect, it } from "vitest";
import { cleanTags, deriveStage, emptySignals, mergeTimeline, normalizeEin } from "./model";

const item = (id: string, kind: FunderTimelineItem["kind"], at: string): FunderTimelineItem => ({
  id,
  kind,
  at,
  title: id,
  detail: null,
  status: null,
  link: null,
});

describe("deriveStage", () => {
  it("ranks award > live application > declined > shortlisted/researching", () => {
    expect(deriveStage(emptySignals())).toBeNull();
    expect(deriveStage({ ...emptySignals(), matchStatuses: ["shortlisted"] })).toBe("cultivating");
    expect(deriveStage({ ...emptySignals(), matchStatuses: ["new"] })).toBeNull();
    expect(deriveStage({ ...emptySignals(), prospectStatus: "researching" })).toBe("cultivating");
    expect(deriveStage({ ...emptySignals(), applicationStatuses: ["declined"] })).toBe("declined");
    expect(deriveStage({ ...emptySignals(), applicationStatuses: ["declined", "drafting"] })).toBe(
      "applied",
    );
    expect(
      deriveStage({
        ...emptySignals(),
        applicationStatuses: ["withdrawn"],
        matchStatuses: ["shortlisted"],
      }),
    ).toBe("cultivating");
    expect(deriveStage({ ...emptySignals(), applicationStatuses: ["declined", "awarded"] })).toBe(
      "funded",
    );
    expect(deriveStage({ ...emptySignals(), awards: 1 })).toBe("funded");
  });
});

describe("mergeTimeline", () => {
  it("splits upcoming (soonest first) from past (newest first), dedupes and breaks ties by kind", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const { upcoming, past } = mergeTimeline(
      [
        [item("next_step:1", "next_step", "2026-07-01T00:00:00Z")],
        [
          item("application:a", "application", "2026-01-01T00:00:00Z"),
          item("outcome:a", "outcome", "2026-03-01T00:00:00Z"),
        ],
        [
          item("award:w", "award", "2026-03-01T00:00:00Z"),
          item("report:r", "report", "2026-06-15T00:00:00Z"),
        ],
        [
          item("interaction:i", "interaction", "2026-02-01T00:00:00Z"),
          item("bad", "other" as never, "nope"),
        ],
        [item("application:a", "application", "2020-01-01T00:00:00Z")],
      ],
      now,
    );
    expect(upcoming.map((i) => i.id)).toEqual(["report:r", "next_step:1"]);
    expect(past.map((i) => i.id)).toEqual([
      "award:w",
      "outcome:a",
      "interaction:i",
      "application:a",
    ]);
  });
});

describe("helpers", () => {
  it("normalizes EINs and tags", () => {
    expect(normalizeEin("85-0123456")).toBe("850123456");
    expect(normalizeEin("123")).toBeNull();
    expect(cleanTags([" Youth ", "youth", "", "Rural  NM"])).toEqual(["Youth", "Rural NM"]);
  });
});
