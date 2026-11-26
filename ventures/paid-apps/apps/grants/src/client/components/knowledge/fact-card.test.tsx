// @vitest-environment happy-dom
import type { FactDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FactCard } from "./fact-card";
import { FactList } from "./fact-list";

// Typed TanStack <Link>s render as plain anchors with their params interpolated.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce((h, [k, v]) => h.replace(`$${k}`, v), to)}
      className={className}
    >
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useParams: () => ({ orgId: "org_1" }),
}));

const fact = (over: Partial<FactDto> = {}): FactDto =>
  ({
    id: "fct_1",
    orgId: "org_1",
    category: "outcome",
    statement: "42 students completed the construction trades program in 2025.",
    value: null,
    status: "proposed",
    sensitivity: "internal",
    confidence: 0.82,
    sourceType: "document",
    sourceDocumentId: "doc_1",
    sourceChunkId: "chk_1",
    sourceInterviewId: null,
    sourceTurnId: null,
    sourceQuote: "In 2025, 42 students completed our construction trades program.",
    asOf: "2025",
    projectId: null,
    supersededById: null,
    createdBy: null,
    confirmedBy: null,
    confirmedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  }) as FactDto;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FactCard", () => {
  it("shows statement, provenance and the verbatim source quote", () => {
    render(<FactCard fact={fact()} orgId="org_1" documentTitle="2025 Annual Report" />);
    expect(screen.getByText(/42 students completed the construction/)).toBeInTheDocument();
    expect(screen.getByText("Outcome")).toBeInTheDocument();
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText("As of 2025")).toBeInTheDocument();
    expect(screen.getByText("Confidence 82%")).toBeInTheDocument();
    const quote = document.querySelector("blockquote");
    expect(quote).toHaveTextContent(
      "In 2025, 42 students completed our construction trades program.",
    );
    const link = screen.getByRole("link", { name: /2025 Annual Report/ });
    expect(link).toHaveAttribute("href", "/orgs/org_1/knowledge/documents/doc_1");
  });

  it("labels user-entered facts and interview facts", () => {
    const { rerender } = render(
      <FactCard fact={fact({ sourceType: "user_entered", sourceQuote: "" })} orgId="org_1" />,
    );
    expect(screen.getByText("Entered by you")).toBeInTheDocument();
    expect(screen.queryByText(/Confidence/)).not.toBeInTheDocument();
    rerender(
      <FactCard
        fact={fact({ sourceType: "interview", sourceDocumentId: null, sourceInterviewId: "int_9" })}
        orgId="org_1"
      />,
    );
    expect(screen.getByRole("link", { name: /From an interview/ })).toHaveAttribute(
      "href",
      "/orgs/org_1/interviews/int_9",
    );
  });

  it("calls confirm and reject handlers", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onReject = vi.fn();
    render(<FactCard fact={fact()} orgId="org_1" onConfirm={onConfirm} onReject={onReject} />);
    await user.click(screen.getByRole("button", { name: /Confirm/ }));
    await user.click(screen.getByRole("button", { name: /Reject/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("hides the action matching the current status", () => {
    render(
      <FactCard
        fact={fact({ status: "confirmed" })}
        orgId="org_1"
        onConfirm={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Confirm/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reject/ })).toBeInTheDocument();
  });

  it("edits inline and saves a patch", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<FactCard fact={fact()} orgId="org_1" onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /Edit/ }));
    const statement = screen.getByLabelText("Statement");
    await user.clear(statement);
    await user.type(statement, "43 students graduated in 2025.");
    await user.selectOptions(screen.getByLabelText("Category"), "metric");
    await user.clear(screen.getByLabelText("As of"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      statement: "43 students graduated in 2025.",
      category: "metric",
      asOf: null,
    });
    await waitFor(() => expect(screen.queryByLabelText("Statement")).not.toBeInTheDocument());
  });

  it("refuses to save an empty statement", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<FactCard fact={fact()} orgId="org_1" onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /Edit/ }));
    await user.clear(screen.getByLabelText("Statement"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("can't be empty");
  });

  it("reports selection changes", async () => {
    const user = userEvent.setup();
    const onSelectedChange = vi.fn();
    render(<FactCard fact={fact()} orgId="org_1" selectable onSelectedChange={onSelectedChange} />);
    await user.click(screen.getByRole("checkbox", { name: /Select fact/ }));
    expect(onSelectedChange).toHaveBeenCalledWith(true);
  });
});

describe("FactList", () => {
  const renderList = (facts: FactDto[]) => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url,
          method: init.method ?? "GET",
          body: init.body ? JSON.parse(String(init.body)) : undefined,
        });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <FactList orgId="org_1" facts={facts} />
      </QueryClientProvider>,
    );
    return calls;
  };

  it("confirms a single fact via POST /facts/:id/confirm", async () => {
    const user = userEvent.setup();
    const calls = renderList([fact()]);
    await user.click(screen.getByRole("button", { name: /^Confirm$/ }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        url: "/api/orgs/org_1/facts/fct_1/confirm",
        method: "POST",
        body: undefined,
      }),
    );
  });

  it("bulk-confirms the selected proposed facts", async () => {
    const user = userEvent.setup();
    const calls = renderList([
      fact({ id: "fct_1" }),
      fact({ id: "fct_2", statement: "The program is based in Gallup, NM." }),
      fact({ id: "fct_3", status: "confirmed", statement: "Already confirmed." }),
    ]);
    const bulkButton = screen.getByRole("button", { name: /Confirm selected \(0\)/ });
    expect(bulkButton).toBeDisabled();
    // confirmed facts are not selectable
    expect(screen.getAllByRole("checkbox", { name: /Select fact/ })).toHaveLength(2);
    await user.click(screen.getByRole("checkbox", { name: /Select all needing review/ }));
    await user.click(screen.getByRole("button", { name: /Confirm selected \(2\)/ }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        url: "/api/orgs/org_1/facts/bulk-confirm",
        method: "POST",
        body: { ids: ["fct_1", "fct_2"] },
      }),
    );
  });

  it("shows an error on the card when an action fails", async () => {
    const user = userEvent.setup();
    renderList([fact()]);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: "forbidden", message: "You do not have access to this resource" },
            }),
            { status: 403 },
          ),
      ),
    );
    const card = screen.getByRole("article");
    await user.click(within(card).getByRole("button", { name: /Reject/ }));
    // requireRole("editor")'s generic 403 becomes an actionable message.
    expect(await within(card).findByRole("alert")).toHaveTextContent(/Ask an admin for editor/);
  });
});

describe("FactCard staleness + supersede proposals", () => {
  const NOW = new Date("2026-11-19T12:00:00Z");

  it("marks last year's facts as possibly outdated and offers Confirm still true", async () => {
    const user = userEvent.setup();
    const onStillTrue = vi.fn();
    const stale = fact({ status: "confirmed", asOf: "2024", confirmedAt: "2025-01-01T00:00:00Z" });
    const { rerender } = render(
      <FactCard fact={stale} orgId="org_1" onStillTrue={onStillTrue} now={NOW} />,
    );
    expect(screen.getByText("As of 2024")).toBeInTheDocument();
    expect(screen.getByText("— may be outdated")).toHaveAttribute(
      "title",
      "as of 2024 — may be outdated",
    );
    await user.click(screen.getByRole("button", { name: /Confirm still true/ }));
    expect(onStillTrue).toHaveBeenCalledTimes(1);

    rerender(
      <FactCard
        fact={{ ...stale, lastConfirmedAt: "2026-11-01T00:00:00Z" }}
        orgId="org_1"
        onStillTrue={onStillTrue}
        now={NOW}
      />,
    );
    expect(screen.queryByText("— may be outdated")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirm still true/ })).not.toBeInTheDocument();
  });

  it("shows a pending supersede proposal on both facts", () => {
    const link = (id: string, statement: string, asOf: string) =>
      ({ id, statement, asOf, status: "proposed" }) as const;
    const { rerender } = render(
      <FactCard
        fact={fact({
          status: "confirmed",
          asOf: "2025",
          supersedeProposal: link("fct_new", "58 students completed it in 2026.", "2026"),
        } as Partial<FactDto>)}
        orgId="org_1"
        now={NOW}
      />,
    );
    expect(screen.getByText("Superseded by proposal")).toBeInTheDocument();
    expect(screen.getByText(/A newer proposed fact would replace this one/)).toBeInTheDocument();

    rerender(
      <FactCard
        fact={fact({
          id: "fct_new",
          asOf: "2026",
          supersedes: {
            ...link("fct_1", "42 students completed it in 2025.", "2025"),
            status: "confirmed",
          },
        } as Partial<FactDto>)}
        orgId="org_1"
        now={NOW}
      />,
    );
    expect(
      screen.getByText(/Updates “42 students completed it in 2025.” \(as of 2025\)/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Superseded by proposal")).not.toBeInTheDocument();
  });
});
