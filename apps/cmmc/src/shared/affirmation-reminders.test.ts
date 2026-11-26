import { describe, expect, it } from "vitest";
import { affirmationSchedule } from "./affirmation";
import { OVERDUE_NOTICE_DAYS, OVERDUE_STAGE, reminderStage } from "./affirmation-reminders";

describe("reminderStage", () => {
  it("is 60 inside the amber window, 7 in the last week, overdue for a month after, else nothing", () => {
    expect(reminderStage(61)).toBeNull();
    expect(reminderStage(60)).toBe(60);
    expect(reminderStage(8)).toBe(60);
    expect(reminderStage(7)).toBe(7);
    expect(reminderStage(0)).toBe(7);
    expect(reminderStage(-1)).toBe(OVERDUE_STAGE);
    expect(reminderStage(-OVERDUE_NOTICE_DAYS)).toBe(OVERDUE_STAGE);
    expect(reminderStage(-OVERDUE_NOTICE_DAYS - 1)).toBeNull();
    expect(reminderStage(Number.NaN)).toBeNull();
  });

  it("agrees with the schedule's due_soon and overdue states", () => {
    const rec = {
      level: 2 as const,
      kind: "assessment" as const,
      cmmcStatus: "final" as const,
      cmmcStatusDate: "2026-01-08",
      affirmedOn: "2026-01-10",
    };
    for (const today of ["2026-11-10", "2026-11-11", "2027-01-03", "2027-01-10", "2027-01-11"]) {
      for (const d of affirmationSchedule([rec], 2, today).deadlines) {
        const stage = reminderStage(d.daysLeft);
        expect(stage !== null && stage !== OVERDUE_STAGE, `${today} ${d.key}`).toBe(
          d.state === "due_soon",
        );
        if (stage === OVERDUE_STAGE) expect(d.state, `${today} ${d.key}`).toBe("overdue");
      }
    }
  });
});
