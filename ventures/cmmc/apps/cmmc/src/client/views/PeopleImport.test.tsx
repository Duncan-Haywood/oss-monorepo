// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workbook } from "../../../test/unit/xlsx-writer";
import { PeopleImport, type PeopleImportPreview } from "./PeopleImport";

const roster: PeopleImportPreview = {
  mode: "roster",
  columns: { name: "Name", email: "Email", awarenessOn: "Security awareness training" },
  dates: { order: "mdy", source: "default", numeric: 1 },
  courses: [],
  changes: [
    { line: 2, name: "Ana Ruiz", kind: "new", fields: ["email", "awarenessOn"] },
    { line: 3, name: "Ben Ode", kind: "update", fields: ["jobTitle"] },
  ],
  unchanged: 1,
  issues: [{ line: 5, message: "Cy: 2027-01-01 is in the future, so it is not imported." }],
  existing: 3,
  max: 1000,
  applied: false,
};

const completions = (counts: string[]): PeopleImportPreview => ({
  ...roster,
  mode: "completions",
  columns: { name: "Learner", completedOn: "Completion Date", course: "Module" },
  dates: { order: "mdy", source: "default", numeric: 0 },
  courses: [
    {
      key: "security awareness 2026",
      name: "Security Awareness 2026",
      rows: 2,
      counts: counts as never,
    },
  ],
  changes: counts.length
    ? [{ line: 2, name: "Ana Ruiz", kind: "update", fields: ["awarenessOn"] }]
    : [],
  unchanged: 0,
  issues: [],
});

type Body = {
  apply: boolean;
  csv: string;
  dateOrder?: string;
  courseMap: Record<string, string[]>;
};

function setup(respond: (b: Body) => PeopleImportPreview, file?: File) {
  const calls: Body[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("/api/orgs/org_1/people/import");
      const body = JSON.parse(String(init.body)) as Body;
      calls.push(body);
      return new Response(JSON.stringify({ ...respond(body), applied: body.apply }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PeopleImport orgId="org_1" today="2026-11-26" onClose={() => {}} />
    </QueryClientProvider>,
  );
  const chosen = file ?? new File(["Name\nAna\n"], "people.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("Roster or training completion file"), {
    target: { files: [chosen] },
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("PeopleImport", () => {
  it("previews a roster, lets the date order be changed, then applies", async () => {
    const calls = setup(() => roster);
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(
      await screen.findByText(/read as a roster; 1 new person, 1 updated, 1 already match/),
    ).toBeVisible();
    expect(screen.getByText("update: job title")).toBeVisible();
    expect(screen.getByText(/Line 5:/)).toBeVisible();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "dmy" } });
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.dateOrder).toBe("dmy");
    fireEvent.click(
      await screen.findByRole("button", { name: "Import (1 new person, 1 updated)" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("1 new person, 1 updated");
    expect(calls.map((c) => [c.apply, c.dateOrder])).toEqual([
      [false, undefined],
      [false, "dmy"],
      [true, "dmy"],
    ]);
  });

  it("asks which training each course counts for and sends the choice", async () => {
    const calls = setup((b) => completions(b.courseMap["security awareness 2026"] ?? []));
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByText("Which training does each course count for?")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Import/ })).toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Security Awareness 2026 counts for Security awareness",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Import (0 new people, 1 updated)" }),
    );
    expect(await screen.findByRole("status")).toBeVisible();
    expect(calls.at(-1)).toMatchObject({
      apply: true,
      courseMap: { "security awareness 2026": ["awareness"] },
    });
  });

  it("reads an .xlsx in the browser and picks the sheet with people", async () => {
    const wb = await workbook({
      Cover: { 1: ["Training records"] },
      Staff: { 1: ["Name", "Email"], 2: ["Ana", "a@x.com"], 3: ["Ben", "b@x.com"] },
    });
    const calls = setup(() => roster, new File([wb as BlobPart], "people.xlsx"));
    const sheet = await screen.findByRole("combobox", { name: "Sheet" });
    expect(sheet).toHaveDisplayValue("Staff (2 people)");
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByText(/people\.xlsx \(Staff\)/)).toBeVisible();
    expect(calls[0]?.csv).toBe("Name,Email\r\nAna,a@x.com\r\nBen,b@x.com");
  });
});
