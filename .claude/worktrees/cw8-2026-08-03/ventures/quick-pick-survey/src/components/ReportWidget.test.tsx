// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReportWidget } from "@/components/ReportWidget";
import { SESSION_KEY } from "@/lib/sessionStore";

vi.mock("next/navigation", () => ({ usePathname: () => "/app" }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function storePartnerMode() {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({
    firstName: "Ada",
    perspective: "PARTNER",
    participants: { values: "p1" },
    domains: [{ slug: "values", title: "Values", kind: "ITEMS" }],
  }));
}

describe("ReportWidget", () => {
  it("sends specific user feedback with safe context and shows its reference", async () => {
    storePartnerMode();
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ reference: "AB12CD34" }) } as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<ReportWidget />);

    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    fireEvent.click(screen.getByRole("button", { name: /Question feels off/ }));
    fireEvent.click(screen.getByRole("button", { name: "Made it harder" }));
    fireEvent.change(screen.getByPlaceholderText(/Which wording/), { target: { value: "These two choices overlap." } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByText("Reference: AB12CD34")).toBeTruthy();
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload).toMatchObject({
      kind: "question",
      impact: "hard",
      message: "These two choices overlap.",
      path: "/app",
      perspective: "PARTNER",
    });
  });

  it("preserves the user's text when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    render(<ReportWidget />);

    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    const field = screen.getByPlaceholderText(/What was unclear/);
    fireEvent.change(field, { target: { value: "I could not tell which mode I was in." } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((field as HTMLTextAreaElement).value).toBe("I could not tell which mode I was in.");
    expect(screen.queryByText(/Reference:/)).toBeNull();
  });
});
