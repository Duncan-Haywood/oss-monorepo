import { describe, expect, it } from "vitest";
import {
  decodeTimelineCursor,
  encodeTimelineCursor,
  formatDuration,
  formatUsd,
  paginateTimeline,
  type TimelineSources,
} from "./build";

const T0 = Date.UTC(2026, 10, 19, 10, 0, 0);
const at = (min: number) => new Date(T0 + min * 60_000);

function sources(): TimelineSources {
  return {
    orgId: "org_1",
    app: {
      id: "app_1",
      status: "submitted",
      createdAt: at(0),
      createdBy: "usr_r",
      currentVersionId: "ver_2",
    },
    versions: [
      {
        id: "ver_1",
        versionNumber: 1,
        authorType: "system",
        authorId: null,
        model: "claude-opus-5-5",
        changeNote: "Initial draft",
        createdAt: at(1),
        factsCited: 1,
        sections: 2,
        gaps: 1,
        report: null,
      },
      {
        id: "ver_2",
        versionNumber: 2,
        authorType: "user",
        authorId: "usr_s",
        model: null,
        changeNote: 'Edited section "Need"',
        createdAt: at(90),
        factsCited: 1,
        sections: 2,
        gaps: 0,
        report: null,
      },
    ],
    flags: [
      {
        id: "flg_1",
        versionId: "ver_1",
        severity: "blocker",
        kind: "missing_info",
        sectionKey: "need",
        status: "resolved",
        resolvedBy: "usr_s",
        resolvedAt: at(60),
        createdAt: at(2),
      },
    ],
    reviews: [
      {
        id: "rev_1",
        versionId: "ver_2",
        reviewerId: "usr_r",
        decision: "changes_requested",
        hasComments: true,
        createdAt: at(120),
      },
    ],
    feedback: [],
    submissions: [
      {
        id: "sub_1",
        versionId: "ver_2",
        channel: "manual",
        status: "confirmed",
        packageSha256: "abcd".padEnd(64, "0"),
        submittedByType: "user",
        submittedBy: "usr_r",
        approvedBy: "usr_r",
        sentAt: null,
        confirmedAt: at(200),
        createdAt: at(150),
      },
    ],
    llm: [],
    audit: [],
    gapFillInterviews: [{ id: "int_1", createdAt: at(2) }],
    names: new Map([
      ["usr_r", "Rosa Martinez"],
      ["usr_s", "Sam Yazzie"],
    ]),
  };
}

describe("timeline builder", () => {
  it("derives waits, resolutions, edits and manual submissions with plain summaries", () => {
    const { items, whoDecided } = paginateTimeline(sources());
    expect(items.map((e) => [e.kind, e.actor.type, e.summary])).toEqual([
      ["application.created", "human", "Rosa started this application"],
      ["version.drafted", "ai", "AI drafted version 1 using 1 fact"],
      ["check.flagged", "ai", "Grounding check flagged 1 missing detail in version 1"],
      ["wait.needs_info", "system", "Waited 58 minutes for 1 missing detail"],
      ["flag.resolved", "human", "Sam resolved a flag (missing detail)"],
      ["version.edited", "human", "Sam edited the draft (version 2)"],
      ["review.changes_requested", "human", "Rosa requested changes to version 2"],
      [
        "submission.prepared",
        "human",
        "Rosa prepared the package for manual submission (sha256 abcd…)",
      ],
      ["submission.confirmed", "human", "Rosa confirmed the submission went through"],
    ]);
    expect(items.find((e) => e.kind === "wait.needs_info")?.link).toBe(
      "/orgs/org_1/interviews/int_1",
    );
    expect(whoDecided.map((s) => s.label)).toEqual([
      "Drafted by AI",
      "Edited by Sam",
      "Checked by AI",
      "Flags resolved by Sam",
      "Changes requested by Rosa",
      "Submitted by Rosa",
    ]);
  });

  it("paginates by cursor without gaps or repeats, including same-millisecond events", () => {
    const src = sources();
    // Same timestamp as the draft: rank keeps lifecycle order.
    src.flags = src.flags.map((f) => ({ ...f, createdAt: at(1) }));
    const all = paginateTimeline(src).items.map((e) => e.id);
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = paginateTimeline(src, { cursor, limit: 2 });
      seen.push(...page.items.map((e) => e.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(all);
    expect(all.indexOf("ver:ver_1")).toBeLessThan(all.indexOf("chk:ver_1"));
    expect(() => decodeTimelineCursor("garbage")).toThrow("Invalid cursor");
    expect(decodeTimelineCursor(encodeTimelineCursor({ t: 5, r: 2, id: "x:y" }))).toEqual({
      t: 5,
      r: 2,
      id: "x:y",
    });
  });

  it("formats money and durations", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(4_000)).toBe("$0.0040");
    expect(formatUsd(1_234_567)).toBe("$1.23");
    expect(formatDuration(10_000)).toBe("under a minute");
    expect(formatDuration(3 * 3_600_000)).toBe("3 hours");
    expect(formatDuration(3 * 86_400_000)).toBe("3 days");
  });
});
