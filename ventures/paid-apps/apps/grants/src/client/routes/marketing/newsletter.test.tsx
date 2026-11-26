// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { NewsletterConfirmPage, UnsubscribePage } = await import("./newsletter");

function setup(search: string, body: unknown) {
  window.history.replaceState(null, "", `/x${search}`);
  const fetch = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("newsletter link pages", () => {
  it("confirm waits for a click (no request on load), then confirms", async () => {
    const fetch = setup("?token=abc", { ok: true, status: "confirmed" });
    render(<NewsletterConfirmPage />);
    expect(fetch).not.toHaveBeenCalled();
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirm my subscription" }));
    expect(await screen.findByRole("heading", { name: "You're subscribed" })).toBeVisible();
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/newsletter/confirm?token=abc");
    expect(fetch.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("shows expired links honestly", async () => {
    setup("?token=abc", { ok: false, status: "expired" });
    render(<NewsletterConfirmPage />);
    await userEvent.click(screen.getByRole("button", { name: "Confirm my subscription" }));
    expect(await screen.findByText(/has expired/)).toBeVisible();
  });

  it("unsubscribe routes team-notification tokens to their endpoint", async () => {
    const fetch = setup("?token=n1.org_x.w.h.s", { ok: true, status: "unsubscribed" });
    render(<UnsubscribePage />);
    expect(screen.getByText(/team notification emails/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
    expect(await screen.findByRole("heading", { name: "You're unsubscribed" })).toBeVisible();
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/email/unsubscribe?token=n1.org_x.w.h.s");
  });

  it("unsubscribe sends newsletter tokens to the newsletter endpoint", async () => {
    const fetch = setup("?token=u1.nls_x.sig", { ok: true, status: "unsubscribed" });
    render(<UnsubscribePage />);
    await userEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
    expect(await screen.findByText(/won't get any more grant guide emails/)).toBeVisible();
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/newsletter/unsubscribe?token=u1.nls_x.sig");
  });
});
