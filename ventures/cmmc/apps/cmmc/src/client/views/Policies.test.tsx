// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrgInfo } from "../lib/types";
import { PoliciesView, type PolicyDetail } from "./Policies";

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

const list = {
  items: [
    {
      family: "AT",
      name: "Awareness and Training",
      requirements: 3,
      policy: {
        id: "pol_1",
        title: "Awareness and Training Policy",
        status: "draft",
        version: 2,
        ownerName: "Pat",
        approvedOn: "2026-01-10",
        reviewDue: "2026-12-01",
      },
      review: "due_soon",
    },
    {
      family: "PS",
      name: "Personnel Security",
      requirements: 2,
      policy: null,
      review: "none",
    },
  ],
  counts: { total: 14, written: 1, approved: 0, inForce: 1, dueSoon: 1, overdue: 0 },
};

const psDetail: PolicyDetail = {
  family: "PS",
  name: "Personnel Security",
  requirements: [
    { id: "PS.L2-3.9.1", nistId: "3.9.1", text: "Screen individuals." },
    { id: "PS.L2-3.9.2", nistId: "3.9.2", text: "Protect systems." },
  ],
  policy: null,
  review: "none",
  history: [],
  template: "## 1. Purpose\n\nStarter text.",
  defaultTitle: "Personnel Security Policy",
  procedureDrafts: [],
};

function setup(level2: boolean, role: OrgInfo["role"] = "owner") {
  const puts: unknown[] = [];
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/procedures/PS.L2-3.9.1/draft") && init?.method === "POST")
        return ok({
          controlId: "PS.L2-3.9.1",
          text: "1. [CONFIRM: who] screens every hire.",
          questions: ["Who screens new hires?"],
          generatedAt: "2026-11-26T00:00:00.000Z",
        });
      if (url.endsWith("/procedures/PS.L2-3.9.1/draft") && init?.method === "DELETE")
        return ok({ ok: true });
      if (url.endsWith("/policies")) return ok(list);
      if (url.endsWith("/policies/PS") && init?.method === "PUT") {
        puts.push(JSON.parse(String(init.body)));
        return ok(psDetail);
      }
      if (url.endsWith("/policies/PS")) return ok(psDetail);
      if (url.endsWith("/members")) return ok({ items: [] });
      return new Response("{}", { status: 404 });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PoliciesView orgId="org_1" info={info(level2, role)} onUpgrade={() => {}} />
    </QueryClientProvider>,
  );
  return { puts, calls };
}

afterEach(() => vi.unstubAllGlobals());

describe("PoliciesView", () => {
  it("lists the families with their state and a revision in draft", async () => {
    setup(true);
    expect(await screen.findByText("Awareness and Training (AT)")).toBeTruthy();
    expect(screen.getByText("Review due soon")).toBeTruthy();
    expect(screen.getByText("revision in draft")).toBeTruthy();
    expect(screen.getByText("Not written")).toBeTruthy();
    expect(screen.getByText(/of 14 families have an approved policy/)).toBeTruthy();
  });

  it("opens the starter text for an unwritten family and saves it as a draft", async () => {
    const { puts } = setup(true);
    fireEvent.click(await screen.findByText("Personnel Security (PS)"));
    const box = (await screen.findByLabelText("Policy text (Markdown)")) as HTMLTextAreaElement;
    expect(box.value).toBe("## 1. Purpose\n\nStarter text.");
    fireEvent.click(screen.getByText("Save as draft"));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({
      title: "Personnel Security Policy",
      body: "## 1. Purpose\n\nStarter text.",
      ownerUserId: null,
      reviewMonths: 12,
    });
  });

  it("is read only without the Level 2 plan", async () => {
    setup(false);
    expect(await screen.findByText(/Policies are read only on the Level 1 plan/)).toBeTruthy();
    fireEvent.click(await screen.findByText("Personnel Security (PS)"));
    const box = (await screen.findByLabelText("Policy text (Markdown)")) as HTMLTextAreaElement;
    expect(box.disabled).toBe(true);
    expect(screen.queryByText("Save as draft")).toBeNull();
  });

  it("drafts a procedure with AI, holds it until the placeholders are resolved, then saves it in", async () => {
    const detail = {
      ...psDetail,
      template: "## 5. Procedures\n\n### 3.9.1\n\n_No statement yet._\n\n### 3.9.2\n\nKeep.",
    };
    psDetail.template = detail.template;
    const { puts, calls } = setup(true);
    fireEvent.click(await screen.findByText("Personnel Security (PS)"));
    fireEvent.click(await screen.findByText("Draft procedures with AI"));
    fireEvent.click((await screen.findAllByText("Draft with AI"))[0] as HTMLElement);
    const box = (await screen.findByLabelText("Draft procedure for 3.9.1")) as HTMLTextAreaElement;
    expect(screen.getByText(/AI draft — not reviewed/)).toBeTruthy();
    expect(screen.getByText("Who screens new hires?")).toBeTruthy();
    const putIn = screen.getByText("Put in the policy and save") as HTMLButtonElement;
    expect(putIn.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "1. The office manager screens every hire." } });
    expect(putIn.disabled).toBe(false);
    fireEvent.click(putIn);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect((puts[0] as { body: string }).body).toBe(
      "## 5. Procedures\n\n### 3.9.1\n\n1. The office manager screens every hire.\n\n### 3.9.2\n\nKeep.",
    );
    await waitFor(() =>
      expect(calls).toContain("DELETE /api/orgs/org_1/policies/PS/procedures/PS.L2-3.9.1/draft"),
    );
    psDetail.template = "## 1. Purpose\n\nStarter text.";
  });

  it("offers no drafting to a viewer", async () => {
    setup(true, "viewer");
    fireEvent.click(await screen.findByText("Personnel Security (PS)"));
    fireEvent.click(await screen.findByText("Draft procedures with AI"));
    expect(screen.queryByText("Draft with AI")).toBeNull();
  });
});
