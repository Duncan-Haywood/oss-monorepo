// @vitest-environment happy-dom
import { type CashReport, type CashReportAppInput, cashReport } from "@shared/cash-report";
import { computeApplications } from "@shared/payapp-math";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { CashReportView } from "../../src/client/pages/cash";

function sample(
  payTermsDays: number | null = null,
  app: Partial<CashReportAppInput> = {},
  contact: { gcBillingName?: string | null; gcBillingEmail?: string | null } = {},
): CashReport {
  const sov = [
    { id: "L1", itemNumber: "1", description: "Work", originalCents: 5_000_000, sortOrder: 1 },
  ];
  const periods = [
    {
      id: "P1",
      number: 1,
      periodTo: "2026-01-31",
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
      lines: {
        L1: { workThisPeriodCents: 5_000_000, storedMaterialsCents: 0, retainageReleasedCents: 0 },
      },
    },
  ];
  const [c] = computeApplications({ originalContractSumCents: 5_000_000 }, sov, [], periods);
  if (!c) throw new Error("fixture");
  return cashReport(
    [
      {
        id: "prj_1",
        name: "Warehouse",
        number: null,
        gcName: "Harbor Builders",
        ...contact,
        status: "active",
        originalContractSumCents: 5_000_000,
        contractSumToDateCents: 5_000_000,
        payTermsDays,
        apps: [
          {
            id: "P1",
            number: 1,
            status: "submitted",
            applicationDate: "2026-01-02",
            periodTo: "2026-01-31",
            certifiedAmountCents: null,
            summary: c.summary,
            totals: c.totals,
            ...app,
          },
        ],
      },
    ],
    "2026-04-15",
  );
}

async function show(
  report: CashReport | undefined,
  from = { name: "Dana Ruiz", company: "Ruiz Electric LLC" },
) {
  const rootRoute = createRootRoute({
    component: () => <CashReportView orgId="org_1" report={report} from={from} />,
  });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
  render(<RouterProvider router={router as never} />);
  await screen.findByRole("heading", { name: "Cash and retainage" });
}

it("shows totals, aging and the next step for each job", async () => {
  await show(sample());
  expect(screen.getByText("Owed on sent applications").nextSibling?.textContent).toBe("$45,000.00");
  expect(screen.getByText("Retainage on finished jobs").nextSibling?.textContent).toBe("$5,000.00");
  expect(screen.getByText("90+ days").nextSibling?.textContent).toBe("$45,000.00");
  expect(screen.getByRole("link", { name: "Warehouse" })).toBeTruthy();
  expect(screen.getByText(/bill the retainage/)).toBeTruthy();
  expect(screen.getByText(/unpaid for 103 days: follow up with Harbor Builders/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Download CSV" }).getAttribute("href")).toBe(
    "/api/orgs/org_1/reports/cash.csv",
  );
});

it("asks for pay terms while a job has none", async () => {
  await show(sample());
  expect(screen.getByText("Past due").nextSibling?.textContent).toBe("$0.00");
  expect(screen.getByText(/\$45,000\.00 is owed on jobs with no pay terms set/)).toBeTruthy();
});

it("with pay terms, shows what is past due and the late application", async () => {
  await show(sample(30)); // applied 01-02, due 02-01, report 04-15: 73 days late
  expect(screen.getByText("Past due").nextSibling?.textContent).toBe("$45,000.00");
  expect(screen.getByText("Expected in the next 30 days").nextSibling?.textContent).toBe("$0.00");
  expect(screen.getByText("$45,000.00 past due")).toBeTruthy();
  expect(screen.getByText(/#1 was due on 2026-02-01 \(30 days\) and is 73 days late/)).toBeTruthy();
  expect(screen.queryByText(/no pay terms set/)).toBeNull();
});

it("an org with no jobs says so", async () => {
  await show(cashReport([], "2026-04-15"));
  expect(screen.getByText("No jobs yet.")).toBeTruthy();
});

it("names an unconditional lien waiver owed on a paid application", async () => {
  await show(
    sample(null, {
      status: "paid",
      waivers: [{ kind: "conditional-final", status: "sent", state: "AZ" }],
    }),
  );
  expect(
    screen.getByText(/1 unconditional lien waiver\s+not sent yet on paid applications/),
  ).toBeTruthy();
  expect(screen.getByText(/the unconditional final waiver for that payment is next/)).toBeTruthy();
});

it("says nothing about waivers when none is owed", async () => {
  await show(sample());
  expect(screen.queryByText(/unconditional lien waiver/)).toBeNull();
});

it("lists change orders waiting for approval and flags the old ones", async () => {
  const base = sample();
  const report = cashReport(
    [
      {
        id: "prj_2",
        name: "Clinic",
        number: null,
        gcName: "Harbor Builders",
        status: "active",
        originalContractSumCents: 1_000_000,
        contractSumToDateCents: 1_000_000,
        apps: [],
        changeOrders: [
          {
            id: "co_1",
            number: "CO-4",
            description: "Extra outlets",
            status: "pending",
            amountCents: 250_000,
            submittedOn: "2026-02-01",
            createdOn: "2026-02-01",
          },
          {
            id: "co_2",
            number: "CO-5",
            description: "Delete one fixture",
            status: "pending",
            amountCents: -40_000,
            submittedOn: null,
            createdOn: "2026-04-10",
          },
        ],
      },
    ],
    base.asOf,
  );
  await show(report);
  expect(
    screen.getByRole("heading", { name: "Change orders waiting for approval: $2,500.00" }),
  ).toBeTruthy();
  expect(screen.getByText("sent 2026-02-01")).toBeTruthy();
  expect(screen.getByText("no date sent")).toBeTruthy();
  expect(
    screen.getByText(/Change order CO-4 \(Extra outlets, \$2,500\.00\) has waited 73 days/),
  ).toBeTruthy();
});

it("says nothing about change orders when none is pending", async () => {
  await show(sample());
  expect(screen.queryByText(/waiting for approval/)).toBeNull();
});

it("drafts a follow-up email to the GC for a past-due application", async () => {
  await show(sample(30));
  fireEvent.click(screen.getByRole("button", { name: "Draft email for #1" }));
  const subject = screen.getByLabelText("Subject") as HTMLInputElement;
  expect(subject.value).toBe("Second request: Warehouse, pay application #1, $45,000.00 past due");
  const body = (screen.getByLabelText("Message") as HTMLTextAreaElement).value;
  expect(body).toContain("Hello Harbor Builders accounts payable,");
  expect(body).toContain("it was due on 2026-02-01");
  expect(body.trimEnd().endsWith("Dana Ruiz\nRuiz Electric LLC")).toBe(true);
  // The contractor's edits go into the mail link.
  fireEvent.change(subject, { target: { value: "Edited subject" } });
  expect(screen.getByRole("link", { name: "Open in my email" }).getAttribute("href")).toMatch(
    /^mailto:\?subject=Edited%20subject&body=Hello%20Harbor/,
  );
});

it("addresses the draft to the job's GC billing contact", async () => {
  await show(
    sample(30, {}, { gcBillingName: "Pat Lee", gcBillingEmail: "ap@harborbuilders.example" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Draft email for #1" }));
  const to = screen.getByLabelText("To") as HTMLInputElement;
  expect(to.value).toBe("ap@harborbuilders.example");
  const body = (screen.getByLabelText("Message") as HTMLTextAreaElement).value;
  expect(body.startsWith("Hello Pat Lee,\n")).toBe(true);
  expect(screen.queryByRole("link", { name: "job page" })).toBeNull();
  expect(screen.getByRole("link", { name: "Open in my email" }).getAttribute("href")).toMatch(
    /^mailto:ap@harborbuilders\.example\?subject=Second%20request/,
  );
  // Changing the address in the draft changes the link.
  fireEvent.change(to, { target: { value: "pm@harborbuilders.example" } });
  expect(screen.getByRole("link", { name: "Open in my email" }).getAttribute("href")).toMatch(
    /^mailto:pm@harborbuilders\.example\?/,
  );
});

it("without a billing contact, the draft points to the job page to add one", async () => {
  await show(sample(30));
  fireEvent.click(screen.getByRole("button", { name: "Draft email for #1" }));
  expect((screen.getByLabelText("To") as HTMLInputElement).value).toBe("");
  expect(screen.getByRole("link", { name: "job page" }).getAttribute("href")).toBe(
    "/orgs/org_1/projects/prj_1",
  );
});

it("lists an application not yet due only on request", async () => {
  await show(sample(120)); // applied 01-02, due 05-02: not yet due on 04-15
  expect(screen.getByText("Nothing past due or paid short right now.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Draft email for #1" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Also show 1 not yet due" }));
  fireEvent.click(screen.getByRole("button", { name: "Draft email for #1" }));
  expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe(
    "Warehouse: pay application #1, $45,000.00",
  );
});

it("shows no follow-up section when nothing is owed", async () => {
  await show(sample(30, { status: "paid" }));
  expect(screen.queryByRole("heading", { name: "Follow-up emails to the GC" })).toBeNull();
});

it("a link from the weekly email to one draft opens that draft", async () => {
  const scrolled: string[] = [];
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this.id);
  };
  window.location.hash = "#follow-up-P1";
  try {
    await show(sample(30));
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toMatch(
      /^Second request: Warehouse, pay application #1/,
    );
    expect(screen.getByRole("button", { name: "Hide draft" })).toBeTruthy();
    expect(scrolled).toEqual(["follow-up-P1"]);
  } finally {
    window.location.hash = "";
    Element.prototype.scrollIntoView = original;
  }
});

it("a linked draft no longer due is still shown, and a paid one says so", async () => {
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = () => {};
  try {
    window.location.hash = "#follow-up-P1";
    await show(sample(120)); // not yet due: normally hidden
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe(
      "Warehouse: pay application #1, $45,000.00",
    );
    cleanup();
    window.location.hash = "#follow-up-gone";
    await show(sample(30));
    expect(screen.getByText(/The application that link was for is no longer unpaid/)).toBeTruthy();
    expect(screen.queryByLabelText("Subject")).toBeNull();
  } finally {
    window.location.hash = "";
    Element.prototype.scrollIntoView = original;
  }
});
