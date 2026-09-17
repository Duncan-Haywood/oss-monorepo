// @vitest-environment jsdom

/**
 * Guards the same things the vs-*.test.mjs siblings check on the static-site
 * ventures: the FAQPage JSON-LD is valid, matches the visible copy word for
 * word (a real regression class here — see PR #2872), the disclaimer and
 * not-affiliated statement are present, no dollar figure is claimed for
 * Typeform (its pricing page is not reachable from this session to verify),
 * and the page overrides the app-wide noindex the root layout sets for
 * everything else.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import VsTypeformPage, { metadata } from "@/app/vs-typeform/page";

afterEach(cleanup);

function jsonLdFromDom(container: HTMLElement) {
  const script = container.querySelector('script[type="application/ld+json"]');
  expect(script, "no FAQPage JSON-LD script found").toBeTruthy();
  return JSON.parse(script!.textContent ?? "{}");
}

describe("vs-typeform page", () => {
  it("overrides the app-wide noindex so this marketing page is crawlable", () => {
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it("declares a canonical path", () => {
    expect(metadata.alternates?.canonical).toBe("/vs-typeform");
  });

  it("renders a valid FAQPage schema", () => {
    const { container } = render(<VsTypeformPage />);
    const schema = jsonLdFromDom(container);
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity.length).toBeGreaterThan(0);
  });

  it("has a visible <h3> for every FAQ schema question", () => {
    const { container } = render(<VsTypeformPage />);
    const schema = jsonLdFromDom(container);
    for (const { name } of schema.mainEntity as { name: string }[]) {
      expect(screen.getAllByRole("heading", { level: 3, name })).not.toHaveLength(0);
    }
  });

  it("has the FAQPage JSON-LD answers verbatim, word for word, on the visible page", () => {
    const { container } = render(<VsTypeformPage />);
    const schema = jsonLdFromDom(container);
    const bodyText = container.textContent ?? "";
    for (const { acceptedAnswer } of schema.mainEntity as { acceptedAnswer: { text: string } }[]) {
      expect(bodyText.includes(acceptedAnswer.text), `answer not verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`).toBe(
        true,
      );
    }
  });

  it("states it is not affiliated with Typeform", () => {
    render(<VsTypeformPage />);
    expect(screen.getByText(/not affiliated with, endorsed by, or sponsored by Typeform/i)).toBeTruthy();
  });

  it("carries the no-warranty disclaimer", () => {
    render(<VsTypeformPage />);
    expect(screen.getByText(/No warranty\./)).toBeTruthy();
    expect(screen.getByText(/not relationship counselling, therapy, psychological/i)).toBeTruthy();
  });

  it("claims no dollar figure for Typeform", () => {
    // Typeform's own pricing page is not reachable from this session to
    // confirm today's exact plan names or figures (network egress here is
    // proxied and does not permit fetching arbitrary vendor sites), so the
    // page states only well-documented, non-numeric identity facts —
    // founding year, founders, headquarters, product category — and no
    // dollar amount for Typeform anywhere on the page.
    const { container } = render(<VsTypeformPage />);
    expect(container.textContent).not.toMatch(/\$\d/);
  });

  it("links back to the app, the home page, and the privacy policy", () => {
    render(<VsTypeformPage />);
    const links = screen.getAllByRole("link");
    expect(links.some((a) => a.getAttribute("href") === "/")).toBe(true);
    expect(links.some((a) => a.getAttribute("href") === "/privacy")).toBe(true);
    expect(links.some((a) => a.getAttribute("href") === "/app")).toBe(true);
  });

  it("mentions Glicko-2 and the Bradley-Terry model, the actual mechanism, not a generic pitch", () => {
    render(<VsTypeformPage />);
    expect(screen.getAllByText(/Glicko-2/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Bradley-Terry/).length).toBeGreaterThan(0);
  });
});
