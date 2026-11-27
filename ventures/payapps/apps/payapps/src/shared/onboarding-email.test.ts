import { describe, expect, it } from "vitest";
import { type GettingStartedInput, gettingStarted } from "./getting-started";
import {
  firstSendEmailContent,
  noJobEmailContent,
  targetPath,
  welcomeEmailContent,
} from "./onboarding-email";

const base: GettingStartedInput = {
  jobs: [],
  hasSample: false,
  memberCount: 1,
  pendingInvitationCount: 0,
  quickbooksConnected: false,
  quickbooksOnPlan: false,
};
const opts = { orgId: "org_1", orgName: "Acme Electric", daysSinceCreated: 6.4 };

describe("welcome email", () => {
  it("lists the five required steps in order and links the Projects page", () => {
    const c = welcomeEmailContent({ orgId: "org_1", orgName: "Acme Electric" });
    const numbered = c.paragraphs.filter((p) => /^\d\. /.test(p));
    expect(numbered.map((p) => p.split(".")[1]?.trim())).toEqual([
      "Add your first job",
      "Enter the schedule of values",
      "Start your first pay application",
      "Send it to the GC",
      "Record the GC's payment",
    ]);
    expect(c.action.path).toBe("/orgs/org_1");
    expect(c.subject).not.toContain("Acme");
  });
});

describe("first-send reminder", () => {
  it("is null with no real job, once something is sent, and when the checklist is complete", () => {
    expect(firstSendEmailContent(gettingStarted(base), opts)).toBeNull();
    const sent = gettingStarted({
      ...base,
      jobs: [
        {
          id: "p1",
          name: "Clinic",
          sovLineCount: 2,
          payApps: [{ id: "a1", number: 1, status: "submitted", paymentCount: 0 }],
        },
      ],
    });
    expect(firstSendEmailContent(sent, opts)).toBeNull();
  });

  it("names the next open step and links where it is done", () => {
    const noLines = gettingStarted({
      ...base,
      jobs: [{ id: "p1", name: "Clinic", sovLineCount: 0, payApps: [] }],
    });
    const c = firstSendEmailContent(noLines, opts);
    expect(c?.paragraphs[0]).toBe(
      "You set up Acme Electric on PayApps 6 days ago. No pay application there is marked sent yet.",
    );
    expect(c?.paragraphs).toContain("Done so far: Clinic is set up.");
    expect(c?.action).toEqual({
      label: "Enter the schedule of values",
      path: "/orgs/org_1/projects/p1",
    });

    const draft = gettingStarted({
      ...base,
      jobs: [
        {
          id: "p1",
          name: "Clinic",
          sovLineCount: 2,
          payApps: [{ id: "a/1", number: 1, status: "draft", paymentCount: 0 }],
        },
      ],
    });
    const d = firstSendEmailContent(draft, { ...opts, daysSinceCreated: 1 });
    expect(d?.paragraphs[0]).toContain("a day ago");
    expect(d?.action.path).toBe("/orgs/org_1/projects/p1/pay-apps/a%2F1");
    expect(d?.paragraphs.some((p) => p.includes("Mark the application submitted"))).toBe(true);
  });

  it("maps every target to an app path", () => {
    expect(targetPath("o", { page: "team" })).toBe("/orgs/o/team");
    expect(targetPath("o", { page: "quickbooks" })).toBe("/orgs/o/quickbooks");
    expect(targetPath("o", { page: "billing" })).toBe("/orgs/o/billing");
    expect(targetPath("o", null)).toBe("/orgs/o");
  });
});

describe("no-job reminder", () => {
  const job = {
    id: "prj_1",
    name: "Clinic TI",
    sovLineCount: 0,
    payApps: [],
  };

  it("goes while there is no real job, links the Projects page and names the ways in", () => {
    const c = noJobEmailContent(gettingStarted(base), { ...opts, hasSample: false });
    expect(c?.subject).toBe("Add your first job to PayApps");
    expect(c?.subject).not.toContain("Acme");
    expect(c?.paragraphs[0]).toBe(
      "You set up Acme Electric on PayApps 6 days ago. There is no job in it yet, so there is nothing to bill.",
    );
    expect(c?.paragraphs.join(" ")).toContain("mid-job start");
    expect(c?.paragraphs.join(" ")).toContain('"Try a sample job"');
    expect(c?.action).toEqual({ label: "Add your first job", path: "/orgs/org_1" });
  });

  it("still goes with only the sample job, and says the sample is there to look around", () => {
    const c = noJobEmailContent(gettingStarted({ ...base, hasSample: true }), {
      ...opts,
      hasSample: true,
    });
    expect(c?.paragraphs.join(" ")).toContain("Your sample job is still there");
    expect(c?.paragraphs.join(" ")).not.toContain('"Try a sample job"');
  });

  it("is null once a real job exists (the first-send reminder takes over), and says a day", () => {
    expect(
      noJobEmailContent(gettingStarted({ ...base, jobs: [job] }), { ...opts, hasSample: false }),
    ).toBeNull();
    const c = noJobEmailContent(gettingStarted(base), {
      ...opts,
      daysSinceCreated: 1.2,
      hasSample: false,
    });
    expect(c?.paragraphs[0]).toContain("on PayApps a day ago.");
  });
});
