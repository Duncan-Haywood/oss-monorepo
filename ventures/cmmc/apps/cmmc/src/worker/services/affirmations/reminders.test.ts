import { affirmationSchedule } from "@shared/affirmation";
import { describe, expect, it } from "vitest";
import { signUnsubscribe, verifyUnsubscribe } from "../../lib/unsubscribe-token";
import { affirmationReminderEmail, dueReminders } from "./reminders";

const rec = (over = {}) => ({
  level: 2 as const,
  kind: "assessment" as const,
  cmmcStatus: "final" as const,
  cmmcStatusDate: "2026-01-08",
  affirmedOn: "2026-01-10",
  ...over,
});

describe("dueReminders", () => {
  it("lists only deadlines in a stage, nearest first", () => {
    expect(dueReminders([affirmationSchedule([rec()], 2, "2026-11-10")])).toEqual([]);
    const due = dueReminders([affirmationSchedule([rec()], 2, "2026-11-11")]);
    expect(due.map((r) => [r.deadline.key, r.deadline.due, r.stage])).toEqual([
      ["annual_affirmation", "2027-01-10", 60],
    ]);
    // A conditional status adds the 180-day closeout; both it and the annual date can be due.
    const cond = rec({ cmmcStatus: "conditional", cmmcStatusDate: "2026-07-20" });
    const both = dueReminders([affirmationSchedule([cond], 2, "2027-01-08")]);
    expect(both.map((r) => [r.deadline.key, r.stage])).toEqual([
      ["annual_affirmation", 7],
      ["poam_closeout", 60],
    ]);
  });
});

describe("dueReminders after the due date", () => {
  it("lists a passed date once it is overdue, for 30 days", () => {
    const at = (day: string) =>
      dueReminders([affirmationSchedule([rec()], 2, day)]).map((r) => [r.deadline.key, r.stage]);
    expect(at("2027-01-10")).toEqual([["annual_affirmation", 7]]);
    expect(at("2027-01-11")).toEqual([["annual_affirmation", 0]]);
    expect(at("2027-02-09")).toEqual([["annual_affirmation", 0]]);
    expect(at("2027-02-10")).toEqual([]);
  });
});

describe("affirmationReminderEmail, overdue", () => {
  it("says the date passed, asks for the SPRS entry to be recorded, and keeps the caveats", () => {
    const reminders = dueReminders([affirmationSchedule([rec()], 2, "2027-01-11")]);
    const m = affirmationReminderEmail({
      appUrl: "https://cmmc.example",
      orgName: "Acme Machining",
      reminders,
      unsubscribePage: null,
    });
    expect(m.subject).toBe("Annual affirmation in SPRS was due 2027-01-10 (Acme Machining)");
    expect(m.text).toContain("this date has passed with no newer affirmation recorded:");
    expect(m.text).toContain("due 2027-01-10 (passed 1 day ago)");
    expect(m.text).toContain("record it on the Affirmations page");
    expect(m.text).toContain("does not submit anything to SPRS");
    expect(m.text).not.toContain("fall due soon");
  });

  it("puts passed dates first when a message has both kinds", () => {
    const cond = rec({ cmmcStatus: "conditional", cmmcStatusDate: "2026-07-20" });
    // 2027-01-16: the closeout (2027-01-16) is due today, the annual date passed six days ago.
    const reminders = dueReminders([affirmationSchedule([cond], 2, "2027-01-16")]);
    expect(reminders.map((r) => r.stage)).toEqual([0, 7]);
    const m = affirmationReminderEmail({
      appUrl: "https://cmmc.example",
      orgName: "Acme Machining",
      reminders,
      unsubscribePage: null,
    });
    expect(m.subject).toBe("1 CMMC date has passed (Acme Machining)");
    expect(m.text.indexOf("(passed 6 days ago)")).toBeLessThan(m.text.indexOf("(today)"));
    expect(m.text).toContain("These dates fall due soon:");
  });
});

describe("affirmationReminderEmail", () => {
  const reminders = dueReminders([affirmationSchedule([rec()], 2, "2027-01-03")]);

  it("names the date, its basis, the page and the stop link", () => {
    const m = affirmationReminderEmail({
      appUrl: "https://cmmc.example/",
      orgName: "Acme Machining",
      reminders,
      unsubscribePage: "https://cmmc.example/unsubscribe?o=1&u=2&t=3",
    });
    expect(m.subject).toBe("Annual affirmation in SPRS due in 7 days (Acme Machining)");
    expect(m.text).toContain("- Level 2: Annual affirmation in SPRS: due 2027-01-10 (in 7 days)");
    expect(m.text).toContain("Basis: 32 CFR 170.22(a)");
    expect(m.text).toContain("https://cmmc.example/?tab=affirmations");
    expect(m.text).toContain("not a\ndetermination of your CMMC status");
    expect(m.text).toContain("does not submit anything to SPRS");
    expect(m.text).toContain(
      "one click, no sign-in): https://cmmc.example/unsubscribe?o=1&u=2&t=3",
    );
  });

  it("keeps a hostile organization name on one line in the subject", () => {
    const m = affirmationReminderEmail({
      appUrl: "https://cmmc.example",
      orgName: "Acme\r\nBcc: victim@example.test",
      reminders: [...reminders, ...reminders],
      unsubscribePage: null,
    });
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.subject).toMatch(/^2 CMMC dates fall due soon/);
    expect(m.text).toContain("Stop these reminders on the Affirmations page.");
  });
});

describe("unsubscribe token", () => {
  const secret = "s".repeat(40);
  it("verifies only for the same org and member", async () => {
    const t = await signUnsubscribe(secret, "org_a", "usr_a");
    expect(await verifyUnsubscribe(secret, "org_a", "usr_a", t)).toBe(true);
    expect(await verifyUnsubscribe(secret, "org_b", "usr_a", t)).toBe(false);
    expect(await verifyUnsubscribe(secret, "org_a", "usr_b", t)).toBe(false);
    expect(await verifyUnsubscribe("x".repeat(40), "org_a", "usr_a", t)).toBe(false);
    expect(await verifyUnsubscribe(secret, "org_a", "usr_a", `${t}x`)).toBe(false);
  });
});
