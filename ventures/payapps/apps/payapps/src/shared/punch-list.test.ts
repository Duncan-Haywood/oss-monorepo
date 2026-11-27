import { describe, expect, it } from "vitest";
import {
  backCheckEmail,
  nextPunchNumber,
  type PunchItemFacts,
  parsePastedPunchList,
  punchDateProblem,
  punchDaysOverdue,
  punchLabel,
  punchLine,
  punchStatus,
  readyForBackCheck,
  summarizePunchList,
} from "./punch-list";

const item = (over: Partial<PunchItemFacts> = {}): PunchItemFacts => ({
  number: 1,
  description: "Missing cover plate",
  location: "Room 104",
  source: "gc",
  listedOn: "2026-11-10",
  dueOn: null,
  completedOn: null,
  completedBy: null,
  acceptedOn: null,
  acceptedBy: null,
  disputeNote: null,
  ...over,
});
const TODAY = "2026-11-26";
const JOB = {
  name: "Riverside Clinic",
  number: "2207",
  gcName: "Harbor Builders",
  gcPmName: "Dana Ruiz",
  gcPmEmail: "dana@harbor.example",
};
const FROM = { name: "Sam Ortiz", company: "Ortiz Electric" };

describe("punchStatus", () => {
  it("goes open, overdue, done, accepted; a dispute takes it out until accepted", () => {
    expect(punchStatus(item(), TODAY)).toBe("open");
    expect(punchStatus(item({ dueOn: TODAY }), TODAY)).toBe("open");
    expect(punchStatus(item({ dueOn: "2026-11-25" }), TODAY)).toBe("overdue");
    expect(punchStatus(item({ dueOn: "2026-11-20", completedOn: "2026-11-24" }), TODAY)).toBe(
      "done",
    );
    expect(punchStatus(item({ completedOn: "2026-11-24", acceptedOn: TODAY }), TODAY)).toBe(
      "accepted",
    );
    expect(punchStatus(item({ dueOn: "2026-11-20", disputeNote: "Drywall's" }), TODAY)).toBe(
      "disputed",
    );
    expect(punchStatus(item({ disputeNote: "  " }), TODAY)).toBe("open");
    // The GC accepting it settles a dispute.
    expect(punchStatus(item({ disputeNote: "Drywall's", acceptedOn: TODAY }), TODAY)).toBe(
      "accepted",
    );
  });

  it("counts days overdue only while the item is still to fix", () => {
    expect(punchDaysOverdue(item({ dueOn: "2026-11-19" }), TODAY)).toBe(7);
    expect(punchDaysOverdue(item({ dueOn: "2026-11-19", completedOn: TODAY }), TODAY)).toBe(0);
    expect(punchDaysOverdue(item(), TODAY)).toBe(0);
  });
});

describe("summarizePunchList", () => {
  it("counts each status and the accepted share, leaving disputed items out of it", () => {
    const list = [
      item({ number: 1 }),
      item({ number: 2, dueOn: "2026-11-20" }),
      item({ number: 3, completedOn: "2026-11-24" }),
      item({ number: 4, completedOn: "2026-11-20", acceptedOn: "2026-11-22" }),
      item({ number: 5, disputeNote: "Painter's scope" }),
    ];
    const s = summarizePunchList(list, TODAY);
    expect(s).toEqual({
      total: 5,
      open: 1,
      overdue: 1,
      done: 1,
      accepted: 1,
      disputed: 1,
      toFix: 2,
      acceptedPct: 25,
      closed: false,
    });
  });

  it("is closed when every item that counts is accepted, and never for an empty list", () => {
    expect(summarizePunchList([], TODAY).closed).toBe(false);
    expect(summarizePunchList([], TODAY).acceptedPct).toBeNull();
    const s = summarizePunchList(
      [item({ acceptedOn: TODAY }), item({ number: 2, disputeNote: "Not ours" })],
      TODAY,
    );
    expect(s.closed).toBe(true);
    expect(s.acceptedPct).toBe(100);
    // Only disputed items: nothing counts, so it is not closed.
    expect(summarizePunchList([item({ disputeNote: "x" })], TODAY).closed).toBe(false);
  });

  it("rounds the share down, so 99.x% never prints as 100%", () => {
    const list = Array.from({ length: 200 }, (_, i) =>
      item({ number: i + 1, acceptedOn: i === 0 ? null : TODAY }),
    );
    expect(summarizePunchList(list, TODAY).acceptedPct).toBe(99);
  });
});

describe("numbers, labels and dates", () => {
  it("numbers one past the highest used", () => {
    expect(nextPunchNumber([])).toBe(1);
    expect(nextPunchNumber([1, 2, 5])).toBe(6);
  });

  it("labels and lines", () => {
    expect(punchLabel(7)).toBe("P-007");
    expect(punchLabel(1234)).toBe("P-1234");
    expect(punchLine(item())).toBe("P-001, Room 104: Missing cover plate");
    expect(punchLine(item({ location: " " }))).toBe("P-001: Missing cover plate");
  });

  it("checks the dates as a whole", () => {
    expect(punchDateProblem(item(), TODAY)).toBeNull();
    expect(punchDateProblem(item({ listedOn: "2026-11-27" }), TODAY)).toMatch(/listed/);
    expect(punchDateProblem(item({ completedOn: "2026-11-27" }), TODAY)).toMatch(/fixed/);
    expect(punchDateProblem(item({ acceptedOn: "2026-11-27" }), TODAY)).toMatch(/accepted/);
    expect(punchDateProblem(item({ dueOn: "2026-11-01" }), TODAY)).toMatch(/due date/);
    // A due date in the future is fine; so is accepted with no date fixed (GC accepted as is).
    expect(punchDateProblem(item({ dueOn: "2026-12-15" }), TODAY)).toBeNull();
    expect(punchDateProblem(item({ acceptedOn: TODAY }), TODAY)).toBeNull();
    expect(punchDateProblem(item({ completedOn: "2026-11-05" }), TODAY)).toMatch(/before/);
    expect(
      punchDateProblem(item({ completedOn: "2026-11-20", acceptedOn: "2026-11-19" }), TODAY),
    ).toMatch(/accepted cannot be before/);
  });
});

describe("backCheckEmail", () => {
  it("is null when nothing is done and waiting", () => {
    expect(backCheckEmail(JOB, [item(), item({ acceptedOn: TODAY })], FROM, TODAY)).toBeNull();
  });

  it("lists the fixed items in order and says how many are still open", () => {
    const list = [
      item({ number: 3, description: "Label panel LP-2", location: null, completedOn: TODAY }),
      item({ number: 1, completedOn: "2026-11-24" }),
      item({ number: 2, description: "Device height" }),
    ];
    expect(readyForBackCheck(list, TODAY).map((i) => i.number)).toEqual([1, 3]);
    const e = backCheckEmail(JOB, list, FROM, TODAY);
    expect(e?.to).toBe("dana@harbor.example");
    expect(e?.subject).toBe(
      "Punch list ready for back-check: 2 items (Riverside Clinic (job 2207))",
    );
    expect(e?.body).toContain("Hello Dana Ruiz,");
    expect(e?.body).toContain("- P-001, Room 104: Missing cover plate (fixed 2026-11-24)");
    expect(e?.body).toContain("- P-003: Label panel LP-2 (fixed 2026-11-26)");
    expect(e?.body).toContain("1 item is still open on our side");
    expect(e?.body).not.toContain("retainage");
    expect(e?.body).toContain("Sam Ortiz\nOrtiz Electric");
  });

  it("asks what else closes out the scope once nothing is left to fix", () => {
    const e = backCheckEmail(
      { ...JOB, number: null, gcPmName: null, gcPmEmail: " " },
      [item({ completedOn: TODAY }), item({ number: 2, disputeNote: "Painter's" })],
      { name: "", company: "Ortiz Electric" },
      TODAY,
    );
    expect(e?.to).toBeNull();
    expect(e?.subject).toBe("Punch list ready for back-check: 1 item (Riverside Clinic)");
    expect(e?.body).toContain("Hello Harbor Builders project team,");
    expect(e?.body).toContain("item is complete");
    expect(e?.body).toContain("release our retainage");
    expect(e?.body).toContain("[your name]\nOrtiz Electric");
  });
});

describe("parsePastedPunchList", () => {
  it("drops numbering, splits a location off, and skips blank lines", () => {
    const text = [
      "1. Room 104 - Missing cover plate",
      "2) Corridor 2: Touch up paint at door frame",
      "",
      "  P-003\tRoof\tSeal penetration at RTU-1  ",
      "#4 Label panel LP-2",
      "- Clean fixtures",
      "Replace damaged ceiling tile - see photo",
    ].join("\r\n");
    expect(parsePastedPunchList(text)).toEqual([
      { location: "Room 104", description: "Missing cover plate" },
      { location: "Corridor 2", description: "Touch up paint at door frame" },
      { location: "Roof", description: "Seal penetration at RTU-1" },
      { location: null, description: "Label panel LP-2" },
      { location: null, description: "Clean fixtures" },
      { location: "Replace damaged ceiling tile", description: "see photo" },
    ]);
  });

  it("keeps a long first part in the item instead of calling it a location", () => {
    const long = `${"x".repeat(61)} - y`;
    expect(parsePastedPunchList(long)).toEqual([{ location: null, description: long }]);
    expect(parsePastedPunchList("\n \n")).toEqual([]);
  });

  it("keeps hyphenated words and times whole", () => {
    expect(parsePastedPunchList("Re-caulk window W-3")).toEqual([
      { location: null, description: "Re-caulk window W-3" },
    ]);
  });
});
