// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROPUBLICA_EXPLORER_URL, ProspectsPanel } from "./prospects";
import { makeProspect, mockFetch, renderWithClient } from "./test-helpers";
import type { FunderProfileDto, ProspectItem } from "./types";

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

const NOW = new Date("2026-11-19T12:00:00");
const baseFunder = makeProspect().funder as FunderProfileDto;

const low = makeProspect({
  id: "pr_low",
  fitScore: 41,
  funder: { ...baseFunder, name: "Low Fit Fund", totalGivingCents: 999_999_900 },
});
const high = makeProspect({ id: "pr_1", fitScore: 88 });
const closed = makeProspect({
  id: "pr_closed",
  fitScore: 95,
  status: "not_a_fit",
  funder: { ...baseFunder, name: "Closed Out Foundation" },
});

function statefulProspects(initial: ProspectItem[]) {
  let items = initial;
  return mockFetch({
    "GET /prospects": () => ({ body: { items } }),
    "PATCH /prospects/pr_1": ({ body }) => {
      items = items.map((p) =>
        p.id === "pr_1" ? { ...p, ...(body as Partial<ProspectItem>) } : p,
      );
      const { funder: _f, ...prospectOnly } = items.find((p) => p.id === "pr_1") as ProspectItem;
      return { body: prospectOnly };
    },
    "POST /prospects/refresh": () => ({ status: 202, body: { queued: true } }),
  });
}

const rowFor = (name: string) =>
  screen.getByRole("rowheader", { name: new RegExp(name) }).closest("tr") as HTMLElement;

describe("ProspectsPanel", () => {
  it("shows the explainer, attribution and an active-prospects table sorted by fit", async () => {
    statefulProspects([low, high, closed]);
    renderWithClient(<ProspectsPanel orgId="org_1" now={NOW} />);

    expect(screen.getByText(/990-PF data lags 1–2 years/)).toBeInTheDocument();
    expect(screen.getByText(/not an open invitation to apply/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ProPublica Nonprofit Explorer/ })).toHaveAttribute(
      "href",
      PROPUBLICA_EXPLORER_URL,
    );

    const table = await screen.findByRole("table", { name: /sorted by fit/ });
    const names = within(table)
      .getAllByRole("rowheader")
      .map((th) => th.querySelector("p")?.textContent);
    // Highest fit first; "not a fit" is hidden by the default Active filter.
    expect(names).toEqual(["High Desert Community Trust", "Low Fit Fund"]);

    const row = rowFor("High Desert Community Trust");
    expect(within(row).getByRole("meter", { name: "Fit score" })).toHaveAttribute(
      "aria-valuenow",
      "88",
    );
    expect(within(row).getByText("$1.8M")).toBeInTheDocument(); // giving
    expect(within(row).getByText("FY 2024 filing")).toBeInTheDocument();
    expect(within(row).getByText("$42.5M")).toBeInTheDocument(); // assets
    expect(within(row).getByText(/Santa Fe, NM · NTEE T20/)).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: /990s on ProPublica/ })).toHaveAttribute(
      "href",
      "https://projects.propublica.org/nonprofits/organizations/850123456",
    );

    await userEvent.setup().selectOptions(screen.getByLabelText("Show"), "all");
    expect(within(table).getAllByRole("rowheader")).toHaveLength(3);
  });

  it("changes a prospect's status with a PATCH and keeps the new value", async () => {
    const user = userEvent.setup();
    const api = statefulProspects([high]);
    renderWithClient(<ProspectsPanel orgId="org_1" now={NOW} />);

    const select = await screen.findByLabelText("Status for High Desert Community Trust");
    expect(select).toHaveValue("new");
    await user.selectOptions(select, "researching");

    await waitFor(() => expect(api.callsTo("PATCH /prospects/pr_1")).toHaveLength(1));
    expect(api.callsTo("PATCH /prospects/pr_1")[0]?.body).toEqual({ status: "researching" });
    expect(await screen.findByText("Status updated")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("Status for High Desert Community Trust")).toHaveValue(
        "researching",
      ),
    );
    // The joined funder profile survives a PATCH response that only has prospect fields.
    expect(screen.getByText("High Desert Community Trust")).toBeInTheDocument();
  });

  it("rolls the status back and explains when the update fails", async () => {
    const user = userEvent.setup();
    mockFetch({
      "GET /prospects": () => ({ body: { items: [high] } }),
      "PATCH /prospects/pr_1": () => ({
        status: 403,
        body: { error: { code: "forbidden", message: "Forbidden" } },
      }),
    });
    renderWithClient(<ProspectsPanel orgId="org_1" now={NOW} />);

    await user.selectOptions(await screen.findByLabelText(/Status for/), "contacted");
    expect(await screen.findByText("Couldn't update the status")).toBeInTheDocument();
    expect(screen.getByText(/Ask an admin for editor access/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/Status for/)).toHaveValue("new"));
  });

  it("shows reasons with fact links and saves notes and the next-step date", async () => {
    const user = userEvent.setup();
    const api = statefulProspects([{ ...high, notes: "", approach: "letter_of_inquiry" }]);
    renderWithClient(<ProspectsPanel orgId="org_1" now={NOW} />);

    const toggle = await screen.findByRole("button", { name: /Details for High Desert/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    expect(screen.getByText("Funds workforce training in McKinley County")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view cited fact fct_1/ })).toHaveAttribute(
      "href",
      "/orgs/org_1/knowledge/facts?factId=fct_1",
    );
    expect(screen.getByText("Suggested approach: Letter of inquiry")).toBeInTheDocument();

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText("Notes"), "Call program officer in January");
    const date = screen.getByLabelText("Next step date");
    await user.clear(date);
    await user.type(date, "2026-12-01");
    await user.click(save);

    await waitFor(() => expect(api.callsTo("PATCH /prospects/pr_1")).toHaveLength(1));
    expect(api.callsTo("PATCH /prospects/pr_1")[0]?.body).toEqual({
      notes: "Call program officer in January",
      nextStepAt: "2026-12-01T12:00:00.000Z",
    });
    const row = rowFor("High Desert Community Trust");
    expect(await within(row).findByText("Dec 1, 2026")).toBeInTheDocument();
  });

  it("flags overdue next steps", async () => {
    statefulProspects([makeProspect({ nextStepAt: "2026-11-01T12:00:00.000Z" })]);
    renderWithClient(<ProspectsPanel orgId="org_1" now={NOW} />);
    const row = (await screen.findByRole("rowheader", { name: /High Desert/ })).closest(
      "tr",
    ) as HTMLElement;
    expect(within(row).getByText("Overdue")).toBeInTheDocument();
  });

  it("shows an empty state and starts a refresh", async () => {
    const user = userEvent.setup();
    const api = mockFetch({
      "GET /prospects": () => ({ body: { items: [] } }),
      "POST /prospects/refresh": () => ({ status: 202, body: { queued: true } }),
    });
    renderWithClient(<ProspectsPanel orgId="org_1" now={NOW} />);

    expect(await screen.findByText("No foundation prospects yet")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /Refresh prospects/ });
    await user.click(buttons[0] as HTMLElement);
    await waitFor(() => expect(api.callsTo("POST /prospects/refresh")).toHaveLength(1));
    expect(await screen.findByText("Refreshing prospects")).toBeInTheDocument();
  });

  it("shows the last refresh and the once-per-hour limit", async () => {
    const user = userEvent.setup();
    mockFetch({
      "GET /prospects": () => ({
        body: {
          items: [high],
          lastRun: {
            id: "prr_1",
            status: "succeeded",
            error: null,
            startedAt: "2026-11-18T09:00:00.000Z",
            finishedAt: "2026-11-18T09:05:00.000Z",
          },
        },
      }),
      "POST /prospects/refresh": () => ({
        status: 429,
        body: {
          error: {
            code: "rate_limited",
            message: "Foundation prospects can be refreshed once per hour.",
          },
        },
      }),
    });
    renderWithClient(<ProspectsPanel orgId="org_1" now={NOW} />);
    expect(await screen.findByText(/Last refreshed/)).toHaveTextContent("Nov 18, 2026");
    await user.click(screen.getByRole("button", { name: /Refresh prospects/ }));
    expect(await screen.findByText("Couldn't start a refresh")).toBeInTheDocument();
    expect(
      screen.getByText("Foundation prospects can be refreshed once per hour."),
    ).toBeInTheDocument();
  });

  it("shows a load error with retry", async () => {
    mockFetch({
      "GET /prospects": () => ({
        status: 500,
        body: { error: { code: "internal_error", message: "x" } },
      }),
    });
    renderWithClient(<ProspectsPanel orgId="org_1" now={NOW} />);
    expect(await screen.findByText("Couldn't load prospects")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
