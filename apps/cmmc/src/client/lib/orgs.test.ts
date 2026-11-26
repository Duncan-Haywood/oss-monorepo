import { describe, expect, it } from "vitest";
import { membershipId } from "./orgs";

const memberships = [
  { id: "org_a", name: "A", role: "owner" as const },
  { id: "org_b", name: "B", role: "viewer" as const },
];

describe("membershipId", () => {
  it("returns the id of a membership the user holds", () => {
    expect(membershipId(memberships, "org_b")).toBe("org_b");
  });

  it("refuses a value that is not one of the user's orgs (e.g. an edited <option>)", () => {
    expect(membershipId(memberships, '"><img src=x onerror=alert(1)>')).toBeNull();
    expect(membershipId(memberships, "javascript:alert(1)")).toBeNull();
    expect(membershipId(memberships, "")).toBeNull();
    expect(membershipId([], "org_a")).toBeNull();
  });
});
