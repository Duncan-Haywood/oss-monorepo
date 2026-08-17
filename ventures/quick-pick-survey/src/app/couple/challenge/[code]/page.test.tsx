// @vitest-environment jsdom

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ChallengePage from "./page";

vi.mock("@/components/ChallengeView", () => ({
  ChallengeView: ({ code }: { code: string }) => <div data-testid="challenge-view">{code}</div>,
}));

afterEach(() => {
  cleanup();
});

describe("ChallengePage", () => {
  it("renders ChallengeView with resolved params code", async () => {
    const pageElement = await ChallengePage({
      params: Promise.resolve({ code: "CHAL-TEST-99" }),
    });

    render(pageElement);

    expect(screen.getByTestId("challenge-view")).toBeDefined();
    expect(screen.getByText("CHAL-TEST-99")).toBeDefined();
  });
});
