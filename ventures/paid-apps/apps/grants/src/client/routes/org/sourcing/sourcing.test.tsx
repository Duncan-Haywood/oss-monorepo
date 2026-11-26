// @vitest-environment happy-dom
import { makeSource, mockFetch, renderWithClient } from "@client/components/sourcing/test-helpers";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SourcingPage } from "./sourcing";

const navigate = vi.fn();
let search: Record<string, unknown> = {};
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => null,
  useParams: () => ({ orgId: "org_1" }),
  useNavigate: () => navigate,
  useSearch: () => search,
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

beforeEach(() => {
  navigate.mockReset();
  search = {};
  mockFetch({
    "GET /watchlist": () => ({
      body: { items: [makeSource({ id: "src_p", orgId: null, label: "Platform page" })] },
    }),
    "GET /watchlist/events": () => ({ body: { items: [] } }),
    "GET /prospects": () => ({ body: { items: [] } }),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SourcingPage", () => {
  it("opens on the watchlist tab with the read-only platform source", async () => {
    renderWithClient(<SourcingPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Grant sourcing" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Watchlist" })).toHaveAttribute("aria-selected", "true");
    const platform = await screen.findByRole("list", { name: "Platform-managed pages" });
    expect(within(platform).getByText("Read-only")).toBeInTheDocument();
    expect(within(platform).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View opportunities/ })).toHaveAttribute(
      "href",
      "/orgs/org_1/opportunities",
    );
  });

  it("switches tabs, mirrors the tab to the URL, and explains how grants are found", async () => {
    const user = userEvent.setup();
    renderWithClient(<SourcingPage />);

    await user.click(screen.getByRole("tab", { name: "How we find grants" }));
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ replace: true }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByRole("link", { name: /^Grants\.gov/ })).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Simpler\.Grants\.gov/ })).toBeInTheDocument();
    expect(within(panel).getByText("Your funder watchlist")).toBeInTheDocument();
    expect(within(panel).getByText("Imports by link or RFP")).toBeInTheDocument();
    expect(within(panel).getByText("Foundation prospecting")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Go to opportunities/ })).toHaveAttribute(
      "href",
      "/orgs/org_1/opportunities",
    );

    await user.click(within(panel).getByRole("button", { name: "See foundation prospects" }));
    expect(screen.getByRole("tab", { name: "Foundation prospects" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByText("No foundation prospects yet")).toBeInTheDocument();
  });

  it("opens the tab named in ?tab=", () => {
    search = { tab: "prospects" };
    renderWithClient(<SourcingPage />);
    expect(screen.getByRole("tab", { name: "Foundation prospects" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText(/990-PF data lags 1–2 years/)).toBeInTheDocument();
  });
});
