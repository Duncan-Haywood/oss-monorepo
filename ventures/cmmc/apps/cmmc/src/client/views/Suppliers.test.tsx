// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrgInfo } from "../lib/types";
import { type SuppliersResponse, SuppliersView } from "./Suppliers";

const info = (level2: boolean, role: OrgInfo["role"] = "owner"): OrgInfo =>
  ({
    org: { id: "org_1", name: "Acme" },
    role,
    profile: { targetLevel: 2 },
    plan: {
      key: level2 ? "level2" : "free",
      name: level2 ? "Level 2" : "Level 1",
      level2,
      quality: false,
    },
  }) as unknown as OrgInfo;

const response: SuppliersResponse = {
  today: "2026-11-26",
  items: [
    {
      id: "sup_1",
      name: "Acme Anodizing",
      supplies: "Type II anodize",
      infoFlowed: "cui",
      cots: false,
      requiredLevel: "l2_self",
      status: "conditional_l2_self",
      statusDate: "2026-01-01",
      affirmedOn: "2026-01-01",
      cmmcUids: "",
      clauseFlowedDown: true,
      subcontractRef: "PO 1042",
      checkedOn: "2026-01-05",
      awardedOn: "2026-01-06",
      evidenceRef: "",
      notes: "",
      currency: {
        statusThrough: "2026-06-30",
        statusBasis: "Conditional: not older than 180 days",
        affirmationThrough: "2027-01-01",
        through: "2026-06-30",
        state: "not_current",
        daysLeft: -149,
      },
      issues: [],
    },
  ],
  check: {
    total: 1,
    flowdown: 1,
    ready: 0,
    issues: [
      {
        supplierId: "sup_1",
        kind: "gap",
        message: "Acme Anodizing: not current since 2026-07-01: needs a POA&M closeout.",
      },
    ],
  },
  infoOptions: [
    { key: "cui", label: "CUI" },
    { key: "fci", label: "FCI only" },
    { key: "none", label: "Neither" },
  ],
  levels: [
    { key: "l1_self", label: "CMMC Level 1 (Self)" },
    { key: "l2_self", label: "CMMC Level 2 (Self)" },
    { key: "l2_c3pao", label: "CMMC Level 2 (C3PAO)" },
    { key: "l3_dibcac", label: "CMMC Level 3 (DIBCAC)" },
  ],
  statuses: [
    { key: "final_l1_self", label: "Final Level 1 (Self)" },
    { key: "conditional_l2_self", label: "Conditional Level 2 (Self)" },
  ],
  quotes: {
    flowdown: "Consult 32 CFR 170.23",
    beforeAward: "Prior to awarding",
    insert: "",
    insertWhen: "",
  },
  verification: {
    source: "DFARS",
    url: "https://example.invalid",
    readOn: "2026-11-26",
    note: "Note.",
  },
};

function setup(level2: boolean, role: OrgInfo["role"] = "owner") {
  const posts: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (url.endsWith("/suppliers") && init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return ok({ id: "sup_2" });
      }
      if (url.endsWith("/suppliers")) return ok(response);
      return new Response("{}", { status: 404 });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SuppliersView orgId="org_1" info={info(level2, role)} onUpgrade={() => {}} />
    </QueryClientProvider>,
  );
  return { posts };
}

afterEach(() => vi.unstubAllGlobals());

describe("SuppliersView", () => {
  it("lists suppliers with currency and the gaps", async () => {
    setup(true);
    expect(await screen.findByText("Acme Anodizing")).toBeTruthy();
    expect(screen.getByText("Not current (ended 2026-06-30)")).toBeTruthy();
    expect(screen.getByText(/needs a POA&M closeout/)).toBeTruthy();
    expect(screen.getByText(/0 of 1 suppliers that get FCI or CUI/)).toBeTruthy();
    expect(screen.getByText("Download CSV")).toBeTruthy();
  });

  it("adds an FCI-only Level 1 supplier on the free plan, blocks CUI there", async () => {
    const { posts } = setup(false);
    await screen.findByText("Acme Anodizing");
    expect((screen.getByText("Add supplier") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/need the Level 2 plan/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Acme Anodizing"), {
      target: { value: "Bob's Bead Blast" },
    });
    fireEvent.change(screen.getByLabelText(/What the order sends them/), {
      target: { value: "fci" },
    });
    fireEvent.change(screen.getByLabelText(/CMMC level you flow down/), {
      target: { value: "l1_self" },
    });
    const add = screen.getByText("Add supplier") as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      name: "Bob's Bead Blast",
      infoFlowed: "fci",
      requiredLevel: "l1_self",
      status: null,
    });
  });

  it("suggests the level 32 CFR 170.23 sets and fills it in on request", async () => {
    const { posts } = setup(true);
    await screen.findByText("Acme Anodizing");
    const box = screen.getByTestId("level-suggestion");
    expect(box.textContent).toContain("Suggested: at least CMMC Level 2 (Self)");
    expect(box.textContent).toContain("32 CFR 170.23(a)(2)");
    expect(box.textContent).toContain("Check the prime contract");
    fireEvent.change(screen.getByLabelText(/Level in the prime contract/), {
      target: { value: "l3_dibcac" },
    });
    expect(box.textContent).toContain("Suggested: at least CMMC Level 2 (C3PAO)");
    expect(box.textContent).toContain("170.23(a)(4)");
    fireEvent.click(screen.getByText("Use CMMC Level 2 (C3PAO)"));
    expect(
      (screen.getByLabelText(/CMMC level you flow down/) as unknown as HTMLSelectElement).value,
    ).toBe("l2_c3pao");
    expect(screen.queryByText("Use CMMC Level 2 (C3PAO)")).toBeNull();
    fireEvent.change(screen.getByLabelText(/What the order sends them/), {
      target: { value: "none" },
    });
    expect(box.textContent).toContain("No level to flow down");
    fireEvent.change(screen.getByPlaceholderText("Acme Anodizing"), {
      target: { value: "Delta Machining" },
    });
    fireEvent.change(screen.getByLabelText(/What the order sends them/), {
      target: { value: "cui" },
    });
    fireEvent.click(screen.getByText("Add supplier"));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ name: "Delta Machining", requiredLevel: "l2_c3pao" });
  });

  it("is read only for viewers", async () => {
    setup(true, "viewer");
    await screen.findByText("Acme Anodizing");
    expect(screen.queryByText("Add a supplier")).toBeNull();
    expect(screen.queryByText("Edit")).toBeNull();
  });
});
