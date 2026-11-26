// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const ORG_ID = "org_1";
let pathname = `/orgs/${ORG_ID}/settings/general`;

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, ...rest }: Record<string, unknown>) => (
    <a
      href={String(to).replace("$orgId", String((params as { orgId?: string })?.orgId))}
      {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
    >
      {children as React.ReactNode}
    </a>
  ),
  useParams: () => ({ orgId: ORG_ID }),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname } }),
  useNavigate: () => vi.fn(),
}));

const orgDetail = {
  org: { id: ORG_ID, name: "Southwest Indian Foundation", slug: "swif" },
  role: "owner",
  profile: { name: "Southwest Indian Foundation", city: "Gallup", state: "NM" },
  settings: {},
};

vi.mock("@client/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  orgApi: (orgId: string, path = "") => `/api/orgs/${orgId}${path}`,
  api: vi.fn(async (path: string) => {
    if (path === `/api/orgs/${ORG_ID}`) return orgDetail;
    if (path.includes("/privacy/consents")) return { items: [], current: {} };
    return { items: [] };
  }),
}));

const { SettingsNav } = await import("./settings-nav");
const { GeneralSettingsPage } = await import("./general");
const { PrivacySettingsPage } = await import("./privacy");

function withQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  pathname = `/orgs/${ORG_ID}/settings/general`;
});

describe("<SettingsNav>", () => {
  it("includes an Account tab linking to the account settings page", () => {
    render(<SettingsNav orgId={ORG_ID} active="account" />);
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    const account = within(nav).getByRole("link", { name: "Account" });
    expect(account).toHaveAttribute("href", `/orgs/${ORG_ID}/settings/account`);
    expect(account).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Organization" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("renders the tabs as one horizontally scrollable row (no wrapping)", () => {
    render(<SettingsNav orgId={ORG_ID} active="general" />);
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(nav).toHaveClass("overflow-x-auto");
    const list = within(nav).getByRole("list");
    expect(list).not.toHaveClass("flex-wrap");
    expect(list).toHaveClass("min-w-max");
    for (const link of within(nav).getAllByRole("link")) {
      expect(link).toHaveClass("whitespace-nowrap");
    }
  });
});

describe("settings pages visual QA", () => {
  it("gives the State field room for a two-letter code", async () => {
    withQuery(<GeneralSettingsPage />);
    const state = await screen.findByLabelText("State");
    expect(state).toHaveValue("NM");
    expect(state).toHaveClass("min-w-[4.5rem]");
    // Half the row on phones (next to ZIP) instead of a squashed sixth.
    expect(state.closest(".col-span-3")).not.toBeNull();
  });

  it("uses an h3 for Consent history under the Permissions card title", async () => {
    pathname = `/orgs/${ORG_ID}/settings/privacy`;
    withQuery(<PrivacySettingsPage />);
    const heading = await screen.findByRole("heading", { name: "Consent history" });
    expect(heading.tagName).toBe("H3");
  });
});
