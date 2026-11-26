import { calendarSubscribeLinks, toWebcal } from "@shared/api/calendar";
import { describe, expect, it } from "vitest";
import {
  buildIcs,
  escapeText,
  foldLine,
  formatDateValue,
  formatUtcDateTime,
  type IcsEvent,
  isDateOnly,
} from "./ics";

const octets = (s: string) => new TextEncoder().encode(s).length;
const DTSTAMP = new Date("2026-11-19T12:00:00Z");

const event = (over: Partial<IcsEvent> = {}): IcsEvent => ({
  uid: "deadline-app_1@grants.example",
  summary: "Deadline: Rural Health Grant",
  description: "https://grants.example/orgs/org_1/applications/app_1",
  url: "https://grants.example/orgs/org_1/applications/app_1",
  start: new Date("2026-12-15T23:59:00Z"),
  allDay: true,
  alarm: { daysBefore: 3, description: "Deadline: Rural Health Grant" },
  ...over,
});

/** Undo folding (RFC 5545 §3.1): CRLF followed by one space or tab. */
const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, "");

describe("escapeText", () => {
  it("escapes backslash, semicolon, comma and newlines", () => {
    expect(escapeText("a\\b;c,d\ne\r\nf\rg")).toBe("a\\\\b\\;c\\,d\\ne\\nf\\ng");
  });
  it("drops control characters but keeps tabs and unicode", () => {
    expect(escapeText("x\u0000y\u0007z\tü—✓")).toBe("xyz\tü—✓");
  });
});

describe("foldLine", () => {
  it("leaves lines of 75 octets alone", () => {
    const line = `SUMMARY:${"a".repeat(67)}`;
    expect(octets(line)).toBe(75);
    expect(foldLine(line)).toBe(line);
  });

  it("folds long ASCII lines at 75 octets with a leading space on continuations", () => {
    const line = `SUMMARY:${"x".repeat(300)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(octets(p)).toBeLessThanOrEqual(75);
    expect(octets(parts[0] ?? "")).toBe(75);
    for (const p of parts.slice(1)) expect(p.startsWith(" ")).toBe(true);
    expect(unfold(folded)).toBe(line);
  });

  it("never splits a multi-byte UTF-8 character", () => {
    const line = `SUMMARY:${"é✓🌵".repeat(40)}`;
    const folded = foldLine(line);
    for (const p of folded.split("\r\n")) {
      expect(octets(p)).toBeLessThanOrEqual(75);
      expect(p).not.toContain("�");
    }
    expect(unfold(folded)).toBe(line);
  });
});

describe("dates", () => {
  it("formats UTC date-times and dates", () => {
    expect(formatUtcDateTime(new Date("2026-03-04T05:06:07Z"))).toBe("20260304T050607Z");
    expect(formatDateValue(new Date("2026-03-04T23:59:00Z"))).toBe("20260304");
  });
  it("treats UTC midnight and 23:59 UTC as date-only deadlines", () => {
    expect(isDateOnly(new Date("2026-03-04T00:00:00Z"))).toBe(true);
    expect(isDateOnly(new Date("2026-03-04T23:59:00Z"))).toBe(true);
    expect(isDateOnly(new Date("2026-03-04T21:00:00Z"))).toBe(false);
  });
});

describe("buildIcs", () => {
  it("produces a CRLF-only, folded, valid VCALENDAR", () => {
    const ics = buildIcs({
      prodId: "-//Grant Autopilot//Calendar feed//EN",
      name: "Grant dates – Southwest Indian Foundation",
      refreshMinutes: 60,
      dtstamp: DTSTAMP,
      events: [
        event({ summary: `Deadline: ${"Very long, grant; title\\with specials ".repeat(5)}` }),
      ],
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    // No bare LF or CR anywhere.
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const line of ics.split("\r\n")) expect(octets(line)).toBeLessThanOrEqual(75);
    const lines = unfold(ics).split("\r\n");
    expect(lines).toContain("METHOD:PUBLISH");
    expect(lines).toContain("PRODID:-//Grant Autopilot//Calendar feed//EN");
    expect(lines).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT60M");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines).toContain("DTSTAMP:20261119T120000Z");
    expect(lines).toContain("UID:deadline-app_1@grants.example");
    const summary = lines.find((l) => l.startsWith("SUMMARY:")) ?? "";
    expect(summary).toContain("Very long\\, grant\\; title\\\\with specials");
  });

  it("writes all-day events as VALUE=DATE with an exclusive end date", () => {
    const lines = unfold(buildIcs({ prodId: "x", dtstamp: DTSTAMP, events: [event()] })).split(
      "\r\n",
    );
    expect(lines).toContain("DTSTART;VALUE=DATE:20261215");
    expect(lines).toContain("DTEND;VALUE=DATE:20261216");
  });

  it("writes timed events in UTC", () => {
    const start = new Date("2026-12-15T17:00:00Z");
    const lines = unfold(
      buildIcs({ prodId: "x", dtstamp: DTSTAMP, events: [event({ start, allDay: false })] }),
    ).split("\r\n");
    expect(lines).toContain("DTSTART:20261215T170000Z");
    expect(lines).toContain("DTEND:20261215T173000Z");
  });

  it("adds a DISPLAY VALARM 3 days before", () => {
    const ics = unfold(buildIcs({ prodId: "x", dtstamp: DTSTAMP, events: [event()] }));
    expect(ics).toContain(
      "BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Deadline: Rural Health Grant\r\nTRIGGER:-P3D\r\nEND:VALARM\r\nEND:VEVENT",
    );
  });

  it("omits the alarm when none is set and keeps events non-blocking", () => {
    const ics = buildIcs({ prodId: "x", dtstamp: DTSTAMP, events: [event({ alarm: undefined })] });
    expect(ics).not.toContain("VALARM");
    expect(ics).toContain("TRANSP:TRANSPARENT");
  });

  it("cannot be broken out of with newlines in a title", () => {
    const ics = buildIcs({
      prodId: "x",
      dtstamp: DTSTAMP,
      events: [event({ summary: "Deadline: X\r\nEND:VEVENT\r\nBEGIN:VEVENT\nUID:evil" })],
    });
    expect(
      unfold(ics)
        .split("\r\n")
        .filter((l) => l === "BEGIN:VEVENT"),
    ).toHaveLength(1);
    expect(ics).not.toMatch(/^UID:evil/m);
  });
});

describe("subscribe links", () => {
  const url = "https://grants.example/api/calendar/abc_DEF-123.ics";
  it("builds Google, Outlook and Apple links", () => {
    const links = calendarSubscribeLinks(url);
    expect(links.google).toBe(
      "https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fgrants.example%2Fapi%2Fcalendar%2Fabc_DEF-123.ics",
    );
    expect(links.outlook).toBe(
      "https://outlook.live.com/calendar/0/addfromweb?url=https%3A%2F%2Fgrants.example%2Fapi%2Fcalendar%2Fabc_DEF-123.ics",
    );
    expect(
      links.office365.startsWith("https://outlook.office.com/calendar/0/addfromweb?url="),
    ).toBe(true);
    expect(links.apple).toBe("webcal://grants.example/api/calendar/abc_DEF-123.ics");
  });
  it("maps http(s) to webcal", () => {
    expect(toWebcal("http://localhost:5173/api/calendar/x.ics")).toBe(
      "webcal://localhost:5173/api/calendar/x.ics",
    );
  });
});
