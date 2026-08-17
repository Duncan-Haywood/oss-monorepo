// @vitest-environment jsdom

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChallengeView } from "./ChallengeView";

vi.mock("@/lib/usageClient", () => ({
  recordUsage: vi.fn(),
  flushUsage: vi.fn(),
  getUsageSessionKey: () => "testsessionkey123456",
  createUsageId: () => "testusageid1234567890",
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ChallengeView", () => {
  it("renders loading state initially and then shows challenge details", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/couple/challenge/CHAL-123")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            inviteCode: "CHAL-123",
            deckId: "core-values",
            createdAt: "2026-08-01T00:00:00Z",
            isRedeemed: false,
            challengerNames: "Alex & Jordan",
            challengedNames: null,
          }),
        });
      }
      if (url.includes("/api/auth/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ user: null }),
        });
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    vi.stubGlobal("fetch", mockFetch);

    render(<ChallengeView code="CHAL-123" />);

    expect(screen.getByText(/Loading challenge details/i)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText(/Alex & Jordan challenged you!/i)).toBeDefined();
    });

    expect(screen.getByText(/Start 2-Minute Survey \(Free\)/i)).toBeDefined();
  });

  it("shows error and offers retry on failure", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/couple/challenge/CHAL-ERR")) {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: async () => ({ error: "Challenge not found." }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            inviteCode: "CHAL-ERR",
            deckId: "core-values",
            createdAt: "2026-08-01T00:00:00Z",
            isRedeemed: false,
            challengerNames: "Sam & Riley",
            challengedNames: null,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ user: null }),
      });
    });

    vi.stubGlobal("fetch", mockFetch);

    render(<ChallengeView code="CHAL-ERR" />);

    await waitFor(() => {
      expect(screen.getByText(/Challenge Not Found/i)).toBeDefined();
    });

    const retryBtn = screen.getByRole("button", { name: /Retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText(/Sam & Riley challenged you!/i)).toBeDefined();
    });
  });

  it("prompts logged-in user without partner to link partner first", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/couple/challenge/CHAL-SINGLE")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            inviteCode: "CHAL-SINGLE",
            deckId: "core-values",
            createdAt: "2026-08-01T00:00:00Z",
            isRedeemed: false,
            challengerNames: "Alex & Jordan",
            challengedNames: null,
          }),
        });
      }
      if (url.includes("/api/auth/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            user: { id: "u-single", firstName: "Sam", email: "sam@test.com" },
          }),
        });
      }
      if (url.includes("/api/couple/compare")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            couple: null,
            partner: null,
          }),
        });
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    vi.stubGlobal("fetch", mockFetch);

    render(<ChallengeView code="CHAL-SINGLE" />);

    await waitFor(() => {
      expect(screen.getByText(/Link Your Partner First/i)).toBeDefined();
    });
    expect(screen.getByText(/Pair with Partner/i)).toBeDefined();
  });

  it("allows a paired couple to accept challenge in 1 click", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes("/api/couple/challenge/CHAL-PAIR")) {
        if (opts?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ ok: true, inviteCode: "CHAL-PAIR", deckId: "core-values" }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            inviteCode: "CHAL-PAIR",
            deckId: "core-values",
            createdAt: "2026-08-01T00:00:00Z",
            isRedeemed: false,
            challengerNames: "Morgan & Taylor",
            challengedNames: null,
          }),
        });
      }
      if (url.includes("/api/auth/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            user: { id: "u-10", firstName: "Casey", email: "casey@test.com" },
          }),
        });
      }
      if (url.includes("/api/couple/compare")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            couple: { id: "c-10", inviteCode: "INV-10", creatorId: "u-10", joinerId: "u-11" },
            partner: { id: "u-11", firstName: "Avery" },
          }),
        });
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    vi.stubGlobal("fetch", mockFetch);

    render(<ChallengeView code="CHAL-PAIR" />);

    await waitFor(() => {
      expect(screen.getByText(/Accept Showdown with Morgan & Taylor/i)).toBeDefined();
    });

    const acceptBtn = screen.getByRole("button", { name: /Accept Showdown with Morgan & Taylor/i });
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(screen.getByText(/Challenge Accepted!/i)).toBeDefined();
    });
  });

  it("handles accept failure gracefully with error alert", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes("/api/couple/challenge/CHAL-FAIL")) {
        if (opts?.method === "POST") {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: async () => ({ error: "You cannot accept your own challenge." }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            inviteCode: "CHAL-FAIL",
            deckId: "core-values",
            createdAt: "2026-08-01T00:00:00Z",
            isRedeemed: false,
            challengerNames: "Casey & Avery",
            challengedNames: null,
          }),
        });
      }
      if (url.includes("/api/auth/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            user: { id: "u-10", firstName: "Casey", email: "casey@test.com" },
          }),
        });
      }
      if (url.includes("/api/couple/compare")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            couple: { id: "c-10", inviteCode: "INV-10", creatorId: "u-10", joinerId: "u-11" },
            partner: { id: "u-11", firstName: "Avery" },
          }),
        });
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    vi.stubGlobal("fetch", mockFetch);

    render(<ChallengeView code="CHAL-FAIL" />);

    await waitFor(() => {
      expect(screen.getByText(/Accept Showdown with Casey & Avery/i)).toBeDefined();
    });

    const acceptBtn = screen.getByRole("button", { name: /Accept Showdown with Casey & Avery/i });
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(screen.getByText(/You cannot accept your own challenge/i)).toBeDefined();
    });
  });
});
