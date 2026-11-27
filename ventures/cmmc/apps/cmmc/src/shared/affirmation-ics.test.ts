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

describe("policy review dates in the calendar", () => {
  const ics = renderAffirmationCalendar({
    orgId: "org_abc123",
    orgName: "Acme",
    schedules: [affirmationSchedule([], 2, today)],
    policyReviews: [
      { family: "AC", familyName: "Access Control", reviewDue: "2027-11-25" },
      { family: "IR", familyName: "Incident Response", reviewDue: "2027-05-31" },
      { family: "AT", familyName: "Awareness and Training", reviewDue: "not a date" },
    ],
    now,
  });
  const lines = unfold(ics);

  it("adds one all-day event per approved policy, with a stable UID per org and family", () => {
    expect(lines.filter((l) => l.startsWith("UID:"))).toEqual([
      "UID:cmmc-org_abc123-policy-AC@cmmc-workspace",
      "UID:cmmc-org_abc123-policy-IR@cmmc-workspace",
    ]);
    expect(lines).toContain("DTSTART;VALUE=DATE:20271125");
    expect(lines).toContain("DTEND;VALUE=DATE:20271126");
    expect(lines).toContain("SUMMARY:Policy review: Incident Response (IR)");
  });

  it("sets the same 60- and 7-day alarms and says NIST sets no interval", () => {
    expect(lines.filter((l) => l.startsWith("TRIGGER"))).toHaveLength(4);
    expect(lines).toContain(
      "DESCRIPTION:Policy review: Access Control (AC): due in 7 days (2027-11-25)",
    );
    const desc = lines.find((l) => l.startsWith("DESCRIPTION:The next review date"));
    expect(desc).toContain("NIST SP 800-171 Rev. 2 sets no review interval");
  });

  it("skips a malformed date and keeps every line within 75 octets", () => {
    expect(ics).not.toContain("Awareness and Training");
    const enc = new TextEncoder();
    for (const l of ics.split("\r\n")) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
  });
});

describe("training refresher dates in the calendar", () => {
  const ics = renderAffirmationCalendar({
    orgId: "org_abc123",
    orgName: "Acme",
    schedules: [affirmationSchedule([], 2, today)],
    trainingDue: [
      { training: "awareness", dueOn: "2027-03-01", people: 3 },
      { training: "roleBased", dueOn: "2027-01-31", people: 1 },
      { training: "insiderThreat", dueOn: "bad", people: 2 },
      { training: "insiderThreat", dueOn: "2027-04-01", people: 0 },
    ],
    now,
  });
  const lines = unfold(ics);

  it("adds one event per training and date with a count, UID per org, training and date", () => {
    expect(lines.filter((l) => l.startsWith("UID:"))).toEqual([
      "UID:cmmc-org_abc123-training-awareness-20270301@cmmc-workspace",
      "UID:cmmc-org_abc123-training-roleBased-20270131@cmmc-workspace",
    ]);
    expect(lines).toContain("SUMMARY:Training due: Security awareness (AT.L2-3.2.1)\\, 3 people");
    expect(lines).toContain(
      "SUMMARY:Training due: Role-based security training (AT.L2-3.2.2)\\, 1 person",
    );
    expect(lines.filter((l) => l.startsWith("TRIGGER"))).toHaveLength(4);
  });

  it("says the interval is the organization's and skips malformed or empty dates", () => {
    const desc = lines.find((l) => l.startsWith("DESCRIPTION:The refresher date"));
    expect(desc).toContain("does not set how often training is repeated");
    expect(ics).not.toContain("Insider threat");
  });
});

describe("supplier current-through dates in the calendar", () => {
  const ics = renderAffirmationCalendar({
    orgId: "org_abc123",
    orgName: "Acme",
    schedules: [affirmationSchedule([], 2, today)],
    supplierDue: [
      { part: "affirmation", through: "2027-02-10", suppliers: 2 },
      { part: "status", through: "2027-05-01", suppliers: 1 },
      { part: "status", through: "nope", suppliers: 1 },
      { part: "status", through: "2027-06-01", suppliers: 0 },
    ],
    now,
  });
  const lines = unfold(ics);

  it("adds one event per part and date with a count and a UID per org, part and date", () => {
    expect(lines.filter((l) => l.startsWith("UID:"))).toEqual([
      "UID:cmmc-org_abc123-supplier-affirmation-20270210@cmmc-workspace",
      "UID:cmmc-org_abc123-supplier-status-20270501@cmmc-workspace",
    ]);
    expect(lines).toContain("SUMMARY:Last day current\\, supplier affirmation: 2 suppliers");
    expect(lines).toContain("SUMMARY:Last day current\\, supplier CMMC status: 1 supplier");
    expect(lines).toContain("DTSTART;VALUE=DATE:20270210");
    expect(lines.filter((l) => l.startsWith("TRIGGER"))).toHaveLength(4);
  });

  it("cites the clause's definition and keeps every line within 75 octets", () => {
    const desc = lines.find((l) => l.startsWith("DESCRIPTION:The last day a supplier"));
    expect(desc).toContain("DFARS 252.204-7021(a)");
    expect(ics).not.toContain("20270601");
    const enc = new TextEncoder();
    for (const l of ics.split("\r\n")) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
  });
});

describe("ISO 9001 dates in the calendar", () => {
  const ics = renderAffirmationCalendar({
    orgId: "org_abc123",
    orgName: "Acme",
    schedules: [affirmationSchedule([], 2, today)],
    documentReviews: [
      { due: "2027-01-15", documents: 3 },
      { due: "2027-02-01", documents: 1 },
      { due: "bad", documents: 2 },
      { due: "2027-03-01", documents: 0 },
    ],
    qualityDue: [
      { kind: "audit", due: "2026-12-10", count: 1 },
      { kind: "ca_action", due: "2026-12-10", count: 2 },
      { kind: "ca_check", due: "2027-02-20", count: 1 },
      { kind: "ca_check", due: "2027-02-30x", count: 1 },
    ],
    now,
  });
  const lines = unfold(ics);

  it("adds one event per date for document reviews and per kind and date for audits and actions", () => {
    expect(lines.filter((l) => l.startsWith("UID:"))).toEqual([
      "UID:cmmc-org_abc123-docreview-20270115@cmmc-workspace",
      "UID:cmmc-org_abc123-docreview-20270201@cmmc-workspace",
      "UID:cmmc-org_abc123-quality-audit-20261210@cmmc-workspace",
      "UID:cmmc-org_abc123-quality-ca_action-20261210@cmmc-workspace",
      "UID:cmmc-org_abc123-quality-ca_check-20270220@cmmc-workspace",
    ]);
    expect(lines).toContain("SUMMARY:Document review due: 3 controlled documents");
    expect(lines).toContain("SUMMARY:Document review due: 1 controlled document");
    expect(lines).toContain("SUMMARY:Internal audit planned: 1 audit");
    expect(lines).toContain("SUMMARY:Corrective action due: 2 corrective actions");
    expect(lines).toContain("SUMMARY:Check effectiveness: 1 corrective action");
    expect(lines.filter((l) => l.startsWith("TRIGGER"))).toHaveLength(10);
  });

  it("names the clause, says ISO sets no review interval, and keeps lines within 75 octets", () => {
    expect(lines.find((l) => l.startsWith("DESCRIPTION:The periodic review"))).toContain(
      "ISO 9001 sets no review interval",
    );
    expect(lines.find((l) => l.startsWith("DESCRIPTION:The planned date"))).toContain("clause 9.2");
    expect(ics).not.toContain("20270301");
    const enc = new TextEncoder();
    for (const l of ics.split("\r\n")) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
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
