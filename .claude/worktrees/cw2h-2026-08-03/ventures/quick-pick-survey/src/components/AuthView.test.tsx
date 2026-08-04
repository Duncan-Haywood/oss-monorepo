// @vitest-environment jsdom

/**
 * Signup is the only screen in the app that collects anything about a person,
 * so it is the only screen where a consent line can be checked at all. These
 * assert the line is there, is on the right screen, and names the fields the
 * form actually has — a consent notice that drifts from the form is worse
 * than none, because it gets believed.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthView } from "@/components/AuthView";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function showSignup() {
  render(<AuthView />);
  // The view opens on login; the consent copy belongs to the other mode.
  screen.getByRole("button", { name: /create one/i }).click();
}

describe("AuthView", () => {
  it("does not claim anything about data on the sign-in screen", () => {
    render(<AuthView />);

    // Signing in collects nothing new, so a consent line there would be
    // noise attached to the wrong action.
    expect(screen.queryByText(/hashed password are stored/i)).toBeNull();
  });

  it("names what signup stores, and links the policy", async () => {
    showSignup();

    expect(await screen.findByText(/first name, email and a hashed password are stored/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
  });

  it("collects only the three fields the consent line names", async () => {
    showSignup();
    await screen.findByText(/hashed password are stored/i);

    // If a field is ever added to this form, this fails and whoever added it
    // has to either justify it or update the sentence next to it. This is the
    // check that keeps the consent line honest as the form changes; the
    // previous intro form drifted from the privacy policy exactly this way.
    const labels = [...document.querySelectorAll("form label")].map((l) =>
      l.textContent?.trim().split("At least")[0].trim()
    );
    expect(labels).toEqual(["First name", "Email", "Password"]);
    expect(document.querySelectorAll("form input")).toHaveLength(3);
  });

  it("opens the swipe flow after a successful sign-in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user: { id: "user-1" } }),
      })
    );
    render(<AuthView />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(document.querySelector("input[type='password']")!, {
      target: { value: "secure-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/app"));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
