// @vitest-environment jsdom

/**
 * The privacy page promises data export and deletion "through the contact
 * below", so the contact line must always say something a person can act on.
 * The address comes from the deployment (NEXT_PUBLIC_CONTACT_EMAIL) so the
 * public repository carries no personal address. Without it the line must
 * fall back to a working route, never render empty.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ContactLine, { ISSUES_URL } from "@/components/ContactLine";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("ContactLine", () => {
  it("links the configured address", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "  owner@example.com ");
    render(<ContactLine />);
    const link = screen.getByRole("link", { name: "owner@example.com" });
    expect(link.getAttribute("href")).toBe("mailto:owner@example.com");
  });

  it("falls back to the issue tracker, with a privacy warning, when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "");
    render(<ContactLine />);
    expect(screen.getByRole("link").getAttribute("href")).toBe(ISSUES_URL);
    expect(screen.getByText(/don.t include personal details/i)).toBeTruthy();
  });
});
