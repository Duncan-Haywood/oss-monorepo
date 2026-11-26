// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSource, mockFetch, renderWithClient } from "./test-helpers";
import type { WatchSourceDto } from "./types";
import { POLITE_CHECKING_NOTE, WatchlistPanel } from "./watchlist";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => null,
  useParams: () => ({ orgId: "org_1" }),
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const noEvents = () => ({ body: { items: [] } });

describe("WatchlistPanel", () => {
  it("adds a funder page with the polite-checking note and shows it in the list", async () => {
    const user = userEvent.setup();
    const sources: WatchSourceDto[] = [];
    const api = mockFetch({
      "GET /watchlist": () => ({ body: { items: sources } }),
      "GET /watchlist/events": noEvents,
      "POST /watchlist": ({ body }) => {
        const b = body as { url: string; label?: string; kind?: WatchSourceDto["kind"] };
        const created = makeSource({
          id: "src_new",
          url: b.url,
          label: b.label ?? null,
          funderName: null,
          kind: b.kind ?? "listing_page",
          lastCheckedAt: null,
          lastChangedAt: null,
        });
        sources.push(created);
        return { status: 201, body: created };
      },
    });
    renderWithClient(<WatchlistPanel orgId="org_1" />);

    expect(screen.getByText(POLITE_CHECKING_NOTE)).toBeInTheDocument();
    expect(await screen.findByText("You're not watching any funder pages yet")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Page URL/), "foundation.org/grants");
    await user.type(screen.getByLabelText("Label"), "Community grants");
    await user.selectOptions(screen.getByLabelText("Kind of page"), "rfp_page");
    await user.click(screen.getByRole("button", { name: /Add to watchlist/ }));

    await waitFor(() => expect(api.callsTo("POST /watchlist")).toHaveLength(1));
    expect(api.callsTo("POST /watchlist")[0]?.body).toEqual({
      url: "https://foundation.org/grants",
      label: "Community grants",
      kind: "rfp_page",
    });

    const list = await screen.findByRole("list", { name: "Your watched pages" });
    expect(within(list).getByRole("heading", { name: "Community grants" })).toBeInTheDocument();
    expect(within(list).getByText("Active")).toBeInTheDocument();
    expect(within(list).getByText("Not yet")).toBeInTheDocument();
    expect(screen.getByLabelText(/Page URL/)).toHaveValue("");
  });

  it("explains a 422 robots_disallowed rejection and keeps the URL", async () => {
    const user = userEvent.setup();
    mockFetch({
      "GET /watchlist": () => ({ body: { items: [] } }),
      "GET /watchlist/events": noEvents,
      "POST /watchlist": () => ({
        status: 422,
        body: { error: { code: "robots_disallowed", message: "Disallowed by robots.txt" } },
      }),
    });
    renderWithClient(<WatchlistPanel orgId="org_1" />);

    await user.type(screen.getByLabelText(/Page URL/), "https://blocked.example.org/rfp");
    await user.click(screen.getByRole("button", { name: /Add to watchlist/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We can't watch that page");
    expect(alert).toHaveTextContent(/robots\.txt asks automated tools not to visit this page/);
    expect(alert).toHaveTextContent(/import it from the Opportunities page/);
    expect(screen.getByLabelText(/Page URL/)).toHaveValue("https://blocked.example.org/rfp");
  });

  it("validates the URL before calling the API and shows server URL errors on the field", async () => {
    const user = userEvent.setup();
    const api = mockFetch({
      "GET /watchlist": () => ({ body: { items: [] } }),
      "GET /watchlist/events": noEvents,
      "POST /watchlist": () => ({
        status: 400,
        body: { error: { code: "bad_request", message: "Only public web addresses can be used." } },
      }),
    });
    renderWithClient(<WatchlistPanel orgId="org_1" />);

    await user.click(screen.getByRole("button", { name: /Add to watchlist/ }));
    expect(
      await screen.findByText("Enter the address of the funder page to watch."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Page URL/)).toHaveAttribute("aria-invalid", "true");
    expect(api.callsTo("POST /watchlist")).toHaveLength(0);

    await user.type(screen.getByLabelText(/Page URL/), "https://ok.example.org/x");
    await user.click(screen.getByRole("button", { name: /Add to watchlist/ }));
    expect(await screen.findByText("Only public web addresses can be used.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Page URL/)).toHaveAttribute("aria-invalid", "true");
  });

  it("shows platform sources read-only, with no actions", async () => {
    mockFetch({
      "GET /watchlist": () => ({
        body: {
          items: [
            makeSource({ id: "src_mine", label: "Our funder" }),
            makeSource({
              id: "src_platform",
              orgId: null,
              scope: "platform",
              readOnly: true,
              label: "NM Community Foundation",
              url: "https://nmcf.org/grants",
              status: "blocked_by_robots",
            }),
          ],
        },
      }),
      "GET /watchlist/events": noEvents,
    });
    renderWithClient(<WatchlistPanel orgId="org_1" />);

    const platform = await screen.findByRole("list", { name: "Platform-managed pages" });
    expect(within(platform).getByText("NM Community Foundation")).toBeInTheDocument();
    expect(within(platform).getByText("Read-only")).toBeInTheDocument();
    expect(within(platform).getByText("Blocked by robots.txt")).toBeInTheDocument();
    expect(within(platform).queryAllByRole("button")).toHaveLength(0);

    const mine = screen.getByRole("list", { name: "Your watched pages" });
    expect(within(mine).getByRole("button", { name: "Check Our funder now" })).toBeInTheDocument();
    expect(
      within(mine).getByRole("button", { name: "Pause watching Our funder" }),
    ).toBeInTheDocument();
    expect(within(mine).getByRole("button", { name: "Remove Our funder" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /now$/ })).toHaveLength(1);
  });

  it("rate-limits check now, pauses (disabling checks), and removes after confirmation", async () => {
    const user = userEvent.setup();
    let sources = [makeSource()];
    const api = mockFetch({
      "GET /watchlist": () => ({ body: { items: sources } }),
      "GET /watchlist/events": noEvents,
      "PATCH /watchlist/src_1": ({ body }) => {
        sources = sources.map((s) => ({ ...s, ...(body as Partial<WatchSourceDto>) }));
        return { body: sources[0] };
      },
      "POST /watchlist/src_1/check": () => ({
        status: 429,
        body: {
          error: {
            code: "rate_limited",
            message: "This page was checked recently. Try again in 7 minute(s).",
          },
        },
      }),
      "DELETE /watchlist/src_1": () => {
        sources = [];
        return { body: { deleted: true } };
      },
    });
    renderWithClient(<WatchlistPanel orgId="org_1" />);

    await user.click(await screen.findByRole("button", { name: /Check .* now/ }));
    expect(await screen.findByText("Checked recently")).toBeInTheDocument();
    expect(screen.getByText(/Try again in 7 minute\(s\)\. We limit checks/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Pause watching/ }));
    await waitFor(() =>
      expect(api.callsTo("PATCH /watchlist/src_1")[0]?.body).toEqual({ status: "paused" }),
    );
    expect(await screen.findByRole("button", { name: /Resume watching/ })).toBeInTheDocument();
    expect(screen.getByText("Paused", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Check .* now/ })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Remove McKune/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(api.callsTo("DELETE /watchlist/src_1")).toHaveLength(1));
    expect(await screen.findByText("You're not watching any funder pages yet")).toBeInTheDocument();
  });

  it("lists watch events and links found opportunities", async () => {
    mockFetch({
      "GET /watchlist": () => ({ body: { items: [makeSource()] } }),
      "GET /watchlist/events": () => ({
        body: {
          items: [
            {
              id: "ev_1",
              sourceId: "src_1",
              kind: "changed",
              opportunityId: null,
              summary: "Page updated",
              createdAt: "2026-11-17T10:00:00.000Z",
            },
            {
              id: "ev_0",
              sourceId: "src_platform",
              source: { id: "src_platform", url: "https://nmcf.org/grants", label: null },
              kind: "changed",
              opportunityId: null,
              summary: "Deadline section edited",
              createdAt: "2026-11-10T10:00:00.000Z",
            },
            {
              id: "ev_2",
              sourceId: "src_1",
              kind: "opportunity_found",
              opportunityId: "opp_9",
              summary: "2027 Workforce Grants posted",
              createdAt: "2026-11-18T10:00:00.000Z",
            },
          ],
        },
      }),
    });
    renderWithClient(<WatchlistPanel orgId="org_1" />);

    const feed = await screen.findByRole("region", { name: "Watchlist activity" });
    const items = await within(feed).findAllByRole("listitem");
    expect(items[0]).toHaveTextContent("2027 Workforce Grants posted");
    expect(items[0]).toHaveTextContent("Opportunity found");
    expect(within(feed).getByRole("link", { name: /View opportunity/ })).toHaveAttribute(
      "href",
      "/orgs/org_1/opportunities/opp_9",
    );
    expect(items[0]).toHaveTextContent("McKune grants page");
    expect(items[1]).toHaveTextContent("Page updated");
    expect(items[2]).toHaveTextContent("Deadline section edited");
    expect(items[2]).toHaveTextContent("nmcf.org/grants");
  });

  it("shows an error with retry when the watchlist fails to load", async () => {
    mockFetch({
      "GET /watchlist": () => ({
        status: 500,
        body: { error: { code: "internal_error", message: "boom" } },
      }),
      "GET /watchlist/events": noEvents,
    });
    renderWithClient(<WatchlistPanel orgId="org_1" />);
    expect(await screen.findByText("Couldn't load your watchlist")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
