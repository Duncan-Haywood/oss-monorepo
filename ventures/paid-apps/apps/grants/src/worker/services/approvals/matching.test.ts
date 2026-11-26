import {
  type ApprovalRule,
  DEFAULT_APPROVAL_RULE,
  describeMissing,
  requiredApprovals,
  rolesPhrase,
  ruleMatches,
  selectApprovalRule,
} from "@shared/approvals";
import type { MemberRole } from "@shared/enums";
import { describe, expect, it } from "vitest";
import { type CountInput, candidateIdentities, countApprovals, type MemberInfo } from "./matching";

const rule = (
  over: Partial<ApprovalRule["require"]> = {},
  when: ApprovalRule["when"] = {},
): ApprovalRule => ({
  id: "r",
  name: "R",
  when,
  require: {
    approvers: 1,
    roles: ["reviewer", "editor", "admin", "owner"],
    excludeAuthor: false,
    ...over,
  },
});

const members = (entries: [string, MemberRole][]): Map<string, MemberInfo> =>
  new Map(entries.map(([userId, role]) => [userId, { userId, role, name: userId.toUpperCase() }]));

const T0 = new Date("2026-11-01T00:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * 3_600_000);

const base = (over: Partial<CountInput> = {}): CountInput => ({
  rule: rule(),
  needed: 1,
  members: members([
    ["owner", "owner"],
    ["admin", "admin"],
    ["rosa", "reviewer"],
    ["ken", "reviewer"],
    ["vic", "viewer"],
  ]),
  approvals: [],
  delegations: [],
  authors: new Set(),
  ...over,
});

describe("rule matching", () => {
  const subject = {
    requestedAmountCents: 1_000_000,
    funderType: "federal" as const,
    funderId: "fnd_1",
    tier: "one_click",
  };

  it("matches every condition and treats an unknown ask as above every threshold", () => {
    expect(ruleMatches({}, subject)).toBe(true);
    expect(ruleMatches({ minAmountCents: 1_000_000 }, subject)).toBe(true);
    expect(ruleMatches({ minAmountCents: 1_000_001 }, subject)).toBe(false);
    expect(ruleMatches({ maxAmountCents: 999_999 }, subject)).toBe(false);
    expect(ruleMatches({ funderType: "foundation" }, subject)).toBe(false);
    expect(ruleMatches({ funderIds: ["fnd_2", "fnd_1"] }, subject)).toBe(true);
    expect(ruleMatches({ funderIds: ["fnd_2"] }, subject)).toBe(false);
    expect(ruleMatches({ tier: "full_review" }, subject)).toBe(false);
    const unknown = { ...subject, requestedAmountCents: null };
    expect(ruleMatches({ minAmountCents: 99_999_999 }, unknown)).toBe(true);
    expect(ruleMatches({ maxAmountCents: 99_999_999 }, unknown)).toBe(false);
  });

  it("picks the first matching rule, else the default", () => {
    const a = { ...rule(), id: "a", when: { funderType: "foundation" as const } };
    const b = { ...rule(), id: "b", when: { minAmountCents: 500_000 } };
    const c = { ...rule(), id: "c", when: {} };
    expect(selectApprovalRule([a, b, c], subject)).toMatchObject({ index: 1, rule: { id: "b" } });
    expect(selectApprovalRule([a], subject)).toEqual({ rule: DEFAULT_APPROVAL_RULE, index: -1 });
  });

  it("the two-person rule only ever raises the count", () => {
    expect(requiredApprovals(rule({ approvers: 1 }), true)).toBe(2);
    expect(requiredApprovals(rule({ approvers: 3 }), true)).toBe(3);
    expect(requiredApprovals(rule({ approvers: 1 }), false)).toBe(1);
  });
});

describe("wording", () => {
  it("names roles the way people say them", () => {
    expect(rolesPhrase(["reviewer", "editor", "admin", "owner"])).toBe("reviewer or above");
    expect(rolesPhrase(["admin", "owner"])).toBe("admin");
    expect(rolesPhrase(["owner"])).toBe("owner");
    expect(rolesPhrase(["reviewer", "admin"])).toBe("reviewer or admin");
  });

  it("describes who is missing", () => {
    expect(describeMissing({ missing: 1, rule: rule({ roles: ["admin", "owner"] }) })).toBe(
      "Waiting for an admin",
    );
    expect(describeMissing({ missing: 2, rule: rule({ excludeAuthor: true }) })).toBe(
      "Waiting for 2 more reviewers or above who didn't write the draft",
    );
    expect(
      describeMissing({
        missing: 1,
        rule: rule({ specificUserIds: ["a", "b"] }),
        specificNames: ["Rosa", "Ken"],
      }),
    ).toBe("Waiting for Rosa or Ken");
    expect(describeMissing({ missing: 0, rule: rule() })).toBe("");
  });
});

describe("countApprovals", () => {
  it("counts distinct eligible people and ignores viewers and ex-members", () => {
    const r = countApprovals(
      base({
        needed: 2,
        approvals: [
          { userId: "rosa", at: at(1) },
          { userId: "rosa", at: at(2) },
          { userId: "vic", at: at(3) },
          { userId: "gone", at: at(4) },
        ],
      }),
    );
    expect(r).toMatchObject({ satisfied: false, missing: 1 });
    expect(r.have).toEqual([{ userId: "rosa", name: "ROSA" }]);
  });

  it("excludeAuthor blocks authors as approvers and as delegates", () => {
    const input = base({
      rule: rule({ excludeAuthor: true }),
      authors: new Set(["rosa"]),
      delegations: [
        { fromUserId: "ken", toUserId: "rosa", createdAt: at(0), until: at(10), revokedAt: null },
      ],
    });
    expect(candidateIdentities(input, { userId: "rosa", at: at(1) })).toEqual([]);
    expect(countApprovals({ ...input, approvals: [{ userId: "ken", at: at(1) }] }).satisfied).toBe(
      true,
    );
  });

  it("delegation counts only inside its window and not after revocation", () => {
    const input = base({
      rule: rule({ specificUserIds: ["admin"] }),
      delegations: [
        { fromUserId: "admin", toUserId: "rosa", createdAt: at(1), until: at(5), revokedAt: at(3) },
      ],
    });
    const ok = countApprovals({ ...input, approvals: [{ userId: "rosa", at: at(2) }] });
    expect(ok.have).toEqual([
      { userId: "rosa", name: "ROSA", onBehalfOf: { userId: "admin", name: "ADMIN" } },
    ]);
    expect(countApprovals({ ...input, approvals: [{ userId: "rosa", at: at(0) }] }).satisfied).toBe(
      false,
    );
    expect(countApprovals({ ...input, approvals: [{ userId: "rosa", at: at(4) }] }).satisfied).toBe(
      false,
    );
  });

  it("finds the best assignment when a delegate could count as two people", () => {
    // Ken can stand in for the admin (delegation) or count as himself; Rosa can only count as
    // herself. With roles admin+reviewer and 2 needed, both approvals count.
    const input = base({
      rule: rule({ approvers: 2, specificUserIds: ["admin", "ken"] }),
      needed: 2,
      delegations: [
        { fromUserId: "admin", toUserId: "ken", createdAt: at(0), until: at(9), revokedAt: null },
      ],
    });
    const r = countApprovals({
      ...input,
      approvals: [
        { userId: "ken", at: at(1) },
        { userId: "admin", at: at(2) },
      ],
    });
    // The admin approved as themselves, so Ken must count as Ken (not as the admin): both count.
    expect(r.satisfied).toBe(true);
    expect(r.have.map((h) => h.onBehalfOf?.userId ?? h.userId)).toEqual(["ken", "admin"]);
  });
});
