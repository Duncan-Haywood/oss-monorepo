import { describe, expect, it } from "vitest";
import {
  type GettingStartedInput,
  type GettingStartedJob,
  gettingStarted,
} from "./getting-started";

const base: GettingStartedInput = {
  jobs: [],
  hasSample: false,
  memberCount: 1,
  pendingInvitationCount: 0,
  quickbooksConnected: false,
  quickbooksOnPlan: false,
};
const job = (over: Partial<GettingStartedJob> = {}): GettingStartedJob => ({
  id: "prj_1",
  name: "Warehouse",
  sovLineCount: 0,
  payApps: [],
  ...over,
});
const done = (g: ReturnType<typeof gettingStarted>) =>
  Object.fromEntries(g.steps.map((s) => [s.key, s.done]));
const step = (g: ReturnType<typeof gettingStarted>, key: string) => {
  const s = g.steps.find((x) => x.key === key);
  if (!s) throw new Error(key);
  return s;
};

describe("gettingStarted", () => {
  it("a new company has everything to do, the job first", () => {
    const g = gettingStarted({ ...base, hasSample: true });
    expect(g.requiredDone).toBe(0);
    expect(g.requiredTotal).toBe(5);
    expect(g.complete).toBe(false);
    expect(step(g, "job").target).toEqual({ page: "projects" });
    expect(step(g, "job").detail).toMatch(/sample job does not count/);
    expect(step(g, "team").optional).toBe(true);
    expect(step(g, "quickbooks").target).toEqual({ page: "billing" });
  });

  it("points each step at the job or application where it is done", () => {
    const g = gettingStarted({ ...base, jobs: [job()] });
    expect(done(g)).toMatchObject({ job: true, sov: false });
    expect(step(g, "job").target).toBeNull();
    expect(step(g, "sov").target).toEqual({ page: "project", projectId: "prj_1" });
    expect(step(g, "pay-app").target).toEqual({ page: "project", projectId: "prj_1" });

    const draft = gettingStarted({
      ...base,
      jobs: [
        job({
          sovLineCount: 7,
          payApps: [{ id: "pa_1", number: 1, status: "draft", paymentCount: 0 }],
        }),
      ],
    });
    expect(done(draft)).toMatchObject({ sov: true, "pay-app": true, send: false });
    expect(step(draft, "sov").detail).toBe("Warehouse has 7 lines.");
    expect(step(draft, "send").target).toEqual({
      page: "pay-app",
      projectId: "prj_1",
      payAppId: "pa_1",
    });
  });

  it("a sent application waits for its payment; a payment or paid status finishes it", () => {
    const sent = (status: "submitted" | "certified" | "paid", paymentCount: number) =>
      gettingStarted({
        ...base,
        jobs: [
          job({ sovLineCount: 1, payApps: [{ id: "pa_1", number: 1, status, paymentCount }] }),
        ],
      });
    const waiting = sent("submitted", 0);
    expect(done(waiting)).toMatchObject({ send: true, paid: false });
    expect(step(waiting, "paid").target).toMatchObject({ page: "pay-app", payAppId: "pa_1" });
    expect(step(sent("certified", 1), "paid").done).toBe(true); // paid short counts
    const all = sent("paid", 0);
    expect(all.complete).toBe(true);
    expect(all.requiredDone).toBe(5);
  });

  it("optional steps never hold the checklist open, and say what was done", () => {
    const g = gettingStarted({
      ...base,
      memberCount: 1,
      pendingInvitationCount: 2,
      quickbooksConnected: true,
      quickbooksOnPlan: true,
    });
    expect(step(g, "team")).toMatchObject({ done: true, target: null });
    expect(step(g, "team").detail).toBe("2 invitations waiting to be accepted.");
    expect(step(g, "quickbooks").done).toBe(true);
    expect(g.complete).toBe(false);
    expect(step(gettingStarted({ ...base, memberCount: 3 }), "team").detail).toBe(
      "3 people in the company.",
    );
    expect(step(gettingStarted({ ...base, quickbooksOnPlan: true }), "quickbooks").target).toEqual({
      page: "quickbooks",
    });
  });

  it("with several jobs, aims at the one that still needs the step", () => {
    const g = gettingStarted({
      ...base,
      jobs: [
        job({ id: "a", name: "A", sovLineCount: 3, payApps: [] }),
        job({ id: "b", name: "B", sovLineCount: 0 }),
      ],
    });
    expect(step(g, "sov").done).toBe(true);
    expect(step(g, "pay-app").target).toEqual({ page: "project", projectId: "a" });
  });
});
