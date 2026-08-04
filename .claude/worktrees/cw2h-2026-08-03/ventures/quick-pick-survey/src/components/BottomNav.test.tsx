// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { BottomNav } from "./BottomNav";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

import { usePathname } from "next/navigation";

describe("BottomNav", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders null when on the landing page '/'", () => {
    vi.mocked(usePathname).mockReturnValue("/");
    const { container } = render(<BottomNav />);
    expect(container.firstChild).toBeNull();
  });

  it("renders four navigation tabs when on an app route", () => {
    vi.mocked(usePathname).mockReturnValue("/app");
    render(<BottomNav />);

    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toBeDefined();

    expect(screen.getByText("Swipe")).toBeDefined();
    expect(screen.getByText("Insights")).toBeDefined();
    expect(screen.getByText("Together")).toBeDefined();
    expect(screen.getByText("You")).toBeDefined();
  });

  it("marks the active tab with aria-current='page'", () => {
    vi.mocked(usePathname).mockReturnValue("/insights");
    const { container } = render(<BottomNav />);

    const insightsLink = container.querySelector("a[href='/insights']");
    expect(insightsLink?.getAttribute("aria-current")).toBe("page");

    const swipeLink = container.querySelector("a[href='/app']");
    expect(swipeLink?.getAttribute("aria-current")).toBeNull();
  });
});
