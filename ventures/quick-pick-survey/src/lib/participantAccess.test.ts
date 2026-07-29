import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

import { getSessionUser } from "@/lib/auth";
import { mayAccessOwnedParticipant } from "./participantAccess";

describe("mayAccessOwnedParticipant", () => {
  it("allows access when participant has no owner (anonymous participant)", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    expect(await mayAccessOwnedParticipant(null)).toBe(true);
  });

  it("allows access when signed-in user matches the participant owner", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "user_123", email: "user@test.com", firstName: "Test" });
    expect(await mayAccessOwnedParticipant("user_123")).toBe(true);
  });

  it("denies access when signed-in user does not match the participant owner", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "user_123", email: "user@test.com", firstName: "Test" });
    expect(await mayAccessOwnedParticipant("user_999")).toBe(false);
  });

  it("denies access to owned participant when caller is not signed in", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    expect(await mayAccessOwnedParticipant("user_123")).toBe(false);
  });
});
