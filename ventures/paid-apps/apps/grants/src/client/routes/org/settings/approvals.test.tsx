// @vitest-environment happy-dom
import type { ApprovalPolicyDto, ApprovalRule } from "@shared/approvals";
import { DEFAULT_APPROVAL_RULE } from "@shared/approvals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const ORG_ID = "org_1";
let role = "admin";

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
    select({ location: { pathname: `/orgs/${ORG_ID}/settings/approvals` } }),
  useNavigate: () => vi.fn(),
}));

vi.mock("@client/lib/session", () => ({
  useMe: () => ({ data: { user: { id: "u_admin", name: "Ada", email: "ada@x.org" } } }),
}));

const RULES: ApprovalRule[] = [
  {
    id: "big",
    name: "Big grants",
    when: { minAmountCents: 5_000_000 },
    require: { approvers: 2, roles: ["admin", "owner"], excludeAuthor: true },
  },
  {
    id: "federal",
    name: "Federal",
    when: { funderType: "federal" },
    require: { approvers: 1, roles: ["admin", "owner"], excludeAuthor: false },
  },
];

const apiMock = vi.fn(async (path: string, init?: { method?: string; body?: unknown }) => {
  if (path === `/api/orgs/${ORG_ID}`) {
    return {
      org: { id: ORG_ID, name: "SWIF", slug: "swif" },
      role,
      profile: {},
      settings: { twoPersonRuleAboveCents: 100_000_000 },
    };
  }
  if (path.endsWith("/approval-policies") && init?.method === "PUT") {
    const body = init.body as { rules: ApprovalRule[] };
    return {
      rules: body.rules.map((r, i) => ({ ...r, id: r.id ?? `rule_${i}` })),
      defaultRule: DEFAULT_APPROVAL_RULE,
      updatedAt: new Date().toISOString(),
      updatedBy: "u_admin",
    } satisfies ApprovalPolicyDto;
  }
  if (path.endsWith("/approval-policies")) {
    return {
      rules: RULES,
      defaultRule: DEFAULT_APPROVAL_RULE,
      updatedAt: null,
      updatedBy: null,
    } satisfies ApprovalPolicyDto;
  }
  if (path.endsWith("/members")) {
    return {
      items: [
        { userId: "u_admin", name: "Ada", email: "ada@x.org", role: "admin" },
        { userId: "u_rosa", name: "Rosa", email: "rosa@x.org", role: "reviewer" },
        { userId: "u_vic", name: "Vic", email: "vic@x.org", role: "viewer" },
      ],
    };
  }
  if (path.endsWith("/delegations")) return { items: [] };
  return {};
});

vi.mock("@client/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  orgApi: (orgId: string, path = "") => `/api/orgs/${orgId}${path}`,
  formatDate: (d: string) => d,
  formatCents: (c: number) => `$${c / 100}`,
  api: (path: string, init?: { method?: string; body?: unknown }) => apiMock(path, init),
}));

const { ApprovalSettingsPage, moveRule, toPolicyInput, validateRules, newDraftRule, toDraft } =
  await import("./approvals");

function withQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  apiMock.mockClear();
  role = "admin";
});

describe("approval rule model", () => {
  it("moves rules up and down, ignoring moves past either end", () => {
    expect(moveRule(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveRule(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveRule(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveRule(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });

  it("validates like the server and builds the PUT body without React keys", () => {
    const bad = { ...newDraftRule(), when: { minAmountCents: 10, maxAmountCents: 5 } };
    const few = {
      ...newDraftRule(),
      require: { approvers: 2, roles: [], specificUserIds: ["u_rosa"], excludeAuthor: false },
    };
    const errors = validateRules([bad, few]);
    expect(errors[bad.key]).toMatch(/minimum amount/);
    expect(errors[few.key]).toMatch(/at least 2 people/);

    const body = toPolicyInput([toDraft(RULES[0] as ApprovalRule)]);
    expect(body.rules[0]).toEqual({
      id: "big",
      name: "Big grants",
      when: { minAmountCents: 5_000_000 },
      require: { approvers: 2, roles: ["admin", "owner"], excludeAuthor: true },
    });
    expect(body.rules[0]).not.toHaveProperty("key");
  });
});

describe("<ApprovalSettingsPage />", () => {
  it("previews which rule applies to an example grant", async () => {
    const user = userEvent.setup();
    withQuery(<ApprovalSettingsPage />);
    const preview = await screen.findByRole("status", { name: "Rule that applies" });
    // Default example: $75,000 foundation grant -> "Big grants".
    expect(preview).toHaveTextContent("Rule 1: Big grants");
    expect(preview).toHaveTextContent("Needs 2 approvals");

    const amount = screen.getByLabelText("Example ask");
    await user.clear(amount);
    await user.type(amount, "10000");
    expect(preview).toHaveTextContent("Default rule");
    await user.selectOptions(
      screen.getByLabelText("Funder type", { selector: "#preview-funder" }),
      "federal",
    );
    expect(preview).toHaveTextContent("Rule 2: Federal");

    // Above the two-person threshold ($1,000,000) the one-admin rule needs two people.
    await user.clear(amount);
    await user.type(amount, "2000000");
    expect(preview).toHaveTextContent("Rule 1: Big grants");
    await user.click(screen.getByRole("button", { name: "Move Federal up" }));
    expect(preview).toHaveTextContent("Rule 1: Federal");
    expect(preview).toHaveTextContent("Needs 2 approvals");
    expect(preview).toHaveTextContent("two-person rule");
  });

  it("reorders, edits and saves the rules in order", async () => {
    const user = userEvent.setup();
    withQuery(<ApprovalSettingsPage />);
    await screen.findByRole("group", { name: "Rule 1: Big grants" });
    await user.click(screen.getByRole("button", { name: "Move Big grants down" }));
    const second = screen.getByRole("group", { name: "Rule 2: Big grants" });
    await user.selectOptions(within(second).getByLabelText("Approvals"), "3");
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    await user.click(screen.getByRole("button", { name: "Save rules" }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        `/api/orgs/${ORG_ID}/approval-policies`,
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const put = apiMock.mock.calls.find((c) => c[1]?.method === "PUT");
    const sent = (put?.[1]?.body as { rules: ApprovalRule[] } | undefined)?.rules ?? [];
    expect(sent.map((r) => r.name)).toEqual(["Federal", "Big grants", "New rule"]);
    expect(sent[1]?.require.approvers).toBe(3);
    expect(sent[2]).not.toHaveProperty("id");
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("offers only members who can approve as specific approvers or delegates", async () => {
    withQuery(<ApprovalSettingsPage />);
    const rule = await screen.findByRole("group", { name: "Rule 1: Big grants" });
    const people = within(rule).getByRole("group", { name: "Specific approvers" });
    expect(within(people).getByLabelText("Rosa")).toBeInTheDocument();
    expect(within(people).queryByLabelText("Vic")).not.toBeInTheDocument();
    const delegate = screen.getByLabelText("Approves in their place");
    expect(within(delegate).queryByRole("option", { name: "Vic" })).not.toBeInTheDocument();
    expect(within(delegate).getByRole("option", { name: "Rosa" })).toBeInTheDocument();
  });

  it("is read-only below admin", async () => {
    role = "reviewer";
    withQuery(<ApprovalSettingsPage />);
    expect(await screen.findByText("View only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save rules" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move Big grants down" })).not.toBeInTheDocument();
    // Reviewers can still delegate their own approvals.
    expect(screen.getByRole("button", { name: "Delegate" })).toBeInTheDocument();
  });
});
