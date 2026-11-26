// @vitest-environment happy-dom
import { NEWSLETTER_CONSENT_VERSION, NEWSLETTER_SUBSCRIBE_MESSAGE } from "@shared/newsletter";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params: p, ...rest }: Record<string, unknown>) => (
    <a
      href={String(to).replace("$doc", String((p as { doc?: string } | undefined)?.doc))}
      {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
    >
      {children as React.ReactNode}
    </a>
  ),
}));

const { NewsletterSignup } = await import("./newsletter-signup");

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("<NewsletterSignup>", () => {
  it("is a labelled form with the consent text and a privacy link", () => {
    const { container } = render(<NewsletterSignup source="/resources" headingId="nl" />);
    expect(screen.getByRole("region", { name: "Get new grant guides by email" })).toBeVisible();
    const input = screen.getByLabelText("Email address");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("autocomplete", "email");
    expect(input.getAttribute("aria-describedby")).toBe("nl-consent");
    expect(screen.getByText(/one-click unsubscribe link/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/legal/privacy",
    );
    // The honeypot is not exposed to assistive tech or the tab order.
    const honeypot = container.querySelector('input[name="website"]');
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole("textbox", { name: "Website" })).toBeNull();
  });

  it("posts the address, source and consent version, then shows the generic message", async () => {
    const fetch = mockFetch(202, { ok: true, message: NEWSLETTER_SUBSCRIBE_MESSAGE });
    render(<NewsletterSignup source="/resources/need-statement" headingId="nl" />);
    await userEvent.type(screen.getByLabelText("Email address"), " reader@example.org ");
    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(await screen.findByText(NEWSLETTER_SUBSCRIBE_MESSAGE)).toBeVisible();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("/api/newsletter/subscribe");
    expect(JSON.parse(String(init?.body))).toEqual({
      email: "reader@example.org",
      source: "/resources/need-statement",
      consentVersion: NEWSLETTER_CONSENT_VERSION,
      website: "",
    });
  });

  it("shows field errors and rate-limit messages accessibly", async () => {
    mockFetch(400, { error: { code: "validation_error", message: "Invalid request" } });
    render(<NewsletterSignup source="/resources" headingId="nl" />);
    await userEvent.type(screen.getByLabelText("Email address"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address");
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-invalid", "true");

    mockFetch(429, { error: { code: "rate_limited", message: "Too many signup attempts." } });
    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many signup attempts.");
  });
});
