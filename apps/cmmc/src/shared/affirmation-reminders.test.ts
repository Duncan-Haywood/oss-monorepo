import { describe, expect, it } from "vitest";
import { affirmationSchedule } from "./affirmation";
import { reminderStage } from "./affirmation-reminders";

describe("reminderStage", () => {
  it("is 60 inside the amber window, 7 in the last week, nothing otherwise", () => {
    expect(reminderStage(61)).toBeNull();
    expect(reminderStage(60)).toBe(60);
    expect(reminderStage(8)).toBe(60);
    expect(reminderStage(7)).toBe(7);
    expect(reminderStage(0)).toBe(7);
    expect(reminderStage(-1)).toBeNull();
    expect(reminderStage(Number.NaN)).toBeNull();
  });

  it("agrees with the schedule's due_soon state up to the due date", () => {
    const rec = {
      level: 2 as const,
      kind: "assessment" as const,
      cmmcStatus: "final" as const,
      cmmcStatusDate: "2026-01-08",
      affirmedOn: "2026-01-10",
    };
    for (const today of ["2026-11-10", "2026-11-11", "2027-01-03", "2027-01-10", "2027-01-11"]) {
      for (const d of affirmationSchedule([rec], 2, today).deadlines) {
        expect(reminderStage(d.daysLeft) !== null, `${today} ${d.key}`).toBe(
          d.state === "due_soon",
        );
      }
    }
  });
});
