// Pure digest logic: the monthly "What's new?" check-in block and what counts as an empty digest.
import { describe, expect, it } from "vitest";
import { digestCheckInNudge } from "../updates";
import { digestIsEmpty, type WeeklyDigest } from "./build";
import { renderWeeklyDigestEmail } from "./render";

const APP_URL = "https://grants.example.org";
const FIRST_MONDAY = new Date("2026-12-07T13:00:00Z");
const LATER_MONDAY = new Date("2026-11-23T13:00:00Z");

function makeDigest(overrides: Partial<WeeklyDigest> = {}): WeeklyDigest {
  return {
    orgId: "org_1",
    orgName: "Southwest Indian Foundation",
    week: "2026-W50",
    periodStart: "2026-11-30T13:00:00.000Z",
    periodEnd: "2026-12-07T13:00:00.000Z",
    newTopMatches: [],
    closingSoon: [],
    pendingReviews: [],
    needsInfo: [],
    submittedThisWeek: [],
    awardedThisWeek: [],
    followupsDue: [],
    factsAwaitingConfirmation: 0,
    checkIn: null,
    ...overrides,
  };
}

describe("digest check-in", () => {
  it("does not make an otherwise empty digest worth sending", () => {
    const checkIn = digestCheckInNudge(FIRST_MONDAY);
    expect(checkIn).not.toBeNull();
    expect(digestIsEmpty(makeDigest({ checkIn }))).toBe(true);
    expect(digestIsEmpty(makeDigest({ checkIn, factsAwaitingConfirmation: 1 }))).toBe(false);
  });

  it("renders a heading, paragraph and link to the org in the first digest of the month", () => {
    const checkIn = digestCheckInNudge(FIRST_MONDAY);
    if (!checkIn) throw new Error("expected a check-in on the first Monday");
    const mail = renderWeeklyDigestEmail(
      makeDigest({ checkIn, factsAwaitingConfirmation: 2 }),
      APP_URL,
    );

    expect(mail.text).toContain(`${checkIn.title}\n${"-".repeat(checkIn.title.length)}`);
    expect(mail.text).toContain(checkIn.body);
    expect(mail.text).toContain(`${checkIn.cta}: ${APP_URL}/orgs/org_1/`);
    // Added with the other extra blocks, after the facts section.
    expect(mail.text.indexOf("Facts to confirm")).toBeLessThan(mail.text.indexOf(checkIn.title));
    expect(mail.html).toContain("What&#39;s new?");
    expect(mail.html).toContain(`href="${APP_URL}/orgs/org_1/"`);
  });

  it("is left out of later digests in the month", () => {
    expect(digestCheckInNudge(LATER_MONDAY)).toBeNull();
    const mail = renderWeeklyDigestEmail(makeDigest({ factsAwaitingConfirmation: 2 }), APP_URL);
    expect(mail.text).not.toContain("What's new?");
    expect(mail.text).not.toContain("Share an update");
  });
});
