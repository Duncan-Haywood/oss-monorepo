import { describe, expect, it } from "vitest";
import { affirmationSchedule } from "./affirmation";
import {
  escapeText,
  foldLine,
  isCalendarToken,
  renderAffirmationCalendar,
  webcalUrl,
} from "./affirmation-ics";

const now = new Date("2026-11-25T14:30:00Z");
const today = "2026-11-25";

/** Undo RFC 5545 folding so a test can read whole content lines. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

describe("escapeText", () => {
  it("escapes the characters RFC 5545 reserves in TEXT", () => {
    expect(escapeText("A, B; C\\D\nE")).toBe("A\\, B\\; C\\\\D\\nE");
  });
});

describe("foldLine", () => {
  it("leaves a short line alone", () => {
    expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short");
  });
  it("folds at 75 octets and keeps every character", () => {
    const line = `DESCRIPTION:${"x".repeat(200)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts[0]).toHaveLength(75);
    for (const p of parts.slice(1)) {
      expect(p.startsWith(" ")).toBe(true);
      expect(p.length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });
  it("never splits a multi-byte character", () => {
    const line = `X-WR-CALNAME:${"é".repeat(60)}`;
    const enc = new TextEncoder();
    const parts = foldLine(line).split("\r\n");
    for (const p of parts) expect(enc.encode(p).length).toBeLessThanOrEqual(75);
    expect(foldLine(line).replace(/\r\n /g, "")).toBe(line);
  });
});

describe("renderAffirmationCalendar", () => {
  const records = [
    {
      level: 2 as const,
      kind: "assessment" as const,
      cmmcStatus: "conditional" as const,
      cmmcStatusDate: "2026-09-01",
      affirmedOn: "2026-09-03",
    },
  ];
  const schedules = [
    affirmationSchedule(records, 1, today),
    affirmationSchedule(records, 2, today),
  ];
  const ics = renderAffirmationCalendar({
    orgId: "org_abc123",
    orgName: "Acme Machining, LLC",
    schedules,
    now,
  });
  const lines = unfold(ics);

  it("is a calendar with CRLF endings and one event per deadline", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/\n/);
    // Level 1 has nothing recorded; Level 2 conditional has closeout, annual and self-assessment.
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(3);
  });

  it("writes each due date as an all-day event", () => {
    // Closeout 180 days after 2026-09-01; annual a year after 2026-09-03; self-assessment three years.
    expect(lines.filter((l) => l.startsWith("DTSTART"))).toEqual([
      "DTSTART;VALUE=DATE:20270228",
      "DTSTART;VALUE=DATE:20270903",
      "DTSTART;VALUE=DATE:20290901",
    ]);
    expect(lines).toContain("DTEND;VALUE=DATE:20270301");
    expect(lines).toContain("DTSTAMP:20261125T143000Z");
  });

  it("gives stable UIDs per org, level and deadline", () => {
    expect(lines.filter((l) => l.startsWith("UID:"))).toEqual([
      "UID:cmmc-org_abc123-l2-poam_closeout@cmmc-workspace",
      "UID:cmmc-org_abc123-l2-annual_affirmation@cmmc-workspace",
      "UID:cmmc-org_abc123-l2-self_assessment@cmmc-workspace",
    ]);
  });

  it("sets alarms 60 and 7 days before each date", () => {
    expect(lines.filter((l) => l.startsWith("TRIGGER"))).toEqual(
      Array.from({ length: 3 }, () => [
        "TRIGGER;RELATED=START:-P60D",
        "TRIGGER;RELATED=START:-P7D",
      ]).flat(),
    );
  });

  it("escapes the org name and carries the rule and the planning note", () => {
    expect(lines).toContain("X-WR-CALNAME:CMMC due dates: Acme Machining\\, LLC");
    const desc = lines.find((l) => l.startsWith("DESCRIPTION:32 CFR 170.16"));
    expect(desc).toContain("not a determination of your CMMC status");
    expect(desc).toContain("does not submit anything to SPRS");
  });

  it("has no lines over 75 octets", () => {
    const enc = new TextEncoder();
    for (const l of ics.split("\r\n")) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
  });

  it("has no events when nothing is recorded", () => {
    const empty = renderAffirmationCalendar({
      orgId: "org_x",
      orgName: "X",
      schedules: [affirmationSchedule([], 1, today), affirmationSchedule([], 2, today)],
      now,
    });
    expect(empty).not.toContain("BEGIN:VEVENT");
    expect(empty).toContain("END:VCALENDAR");
  });
});

describe("calendar feed tokens", () => {
  it("accepts only the prefix and 43 base64url characters", () => {
    const good = `cmcal_${"A".repeat(40)}-_9`;
    expect(isCalendarToken(good)).toBe(true);
    expect(isCalendarToken(good.slice(0, -1))).toBe(false);
    expect(isCalendarToken(`${good}x`)).toBe(false);
    expect(isCalendarToken(`cmcal_${"A".repeat(42)}/`)).toBe(false);
    expect(isCalendarToken(`other_${"A".repeat(43)}`)).toBe(false);
  });

  it("turns the https link into a webcal one", () => {
    expect(webcalUrl("https://app.example.test/api/calendar/cmcal_x.ics")).toBe(
      "webcal://app.example.test/api/calendar/cmcal_x.ics",
    );
  });
});
