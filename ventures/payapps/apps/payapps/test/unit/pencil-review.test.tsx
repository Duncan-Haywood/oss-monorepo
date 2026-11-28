// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PencilReviewPanel } from "../../src/client/components/pencil-review";

const rows = [
  { id: "a", itemNumber: "1", description: "Rough-in" },
  { id: "b", itemNumber: "2", description: "Switchgear" },
];
const entry = (work: number, stored = 0) => ({
  workThisPeriodCents: work,
  storedMaterialsCents: stored,
  retainageReleasedCents: 0,
  quantityThisPeriodMilli: null,
});

function setup(editable = true) {
  const onApply = vi.fn();
  const props = {
    base: "/api/orgs/o/projects/p/pay-apps/pa",
    rows,
    entries: { a: entry(1_000_000), b: entry(0, 2_500_000) },
    editable,
    jobName: "Elm St Clinic",
    applicationNumber: 4,
    periodTo: "2026-11-30",
    gcPmName: "Dana",
    contractorName: "Volt Electric",
    onApply,
  };
  const view = render(<PencilReviewPanel {...props} />);
  return { onApply, props, view };
}

it("links the pencil PDFs and compares the GC's typed figures with the draft", () => {
  const { onApply, props, view } = setup();
  expect(screen.getByText("Pencil PDF").getAttribute("href")).toBe(
    `${props.base}/application.pdf?pencil=1`,
  );
  expect(screen.getByText("Pencil PDF with backup").getAttribute("href")).toBe(
    `${props.base}/packet.pdf?pencil=1`,
  );
  fireEvent.click(screen.getByText("Enter the GC's markup"));
  expect(screen.getByTestId("pencil-summary").textContent).toBe(
    "The GC's figures match the draft.",
  );

  fireEvent.change(screen.getByLabelText("GC's work this period, item 1"), {
    target: { value: "8000" },
  });
  expect(screen.getByTestId("pencil-summary").textContent).toContain(
    "1 line changed: this period's work and stored $35,000.00 to $33,000.00 (-$2,000.00 before retainage)",
  );

  fireEvent.click(screen.getByText("Put the GC's figures in this draft"));
  expect(onApply).toHaveBeenCalledWith({
    a: entry(800_000),
    b: entry(0, 2_500_000),
  });

  // The page re-renders with the applied entries: the note still reads from the pencil's figures.
  view.rerender(
    <PencilReviewPanel {...props} entries={{ a: entry(800_000), b: entry(0, 2_500_000) }} />,
  );
  const note = (screen.getByLabelText("Cover note") as HTMLTextAreaElement).value;
  expect(note).toContain("Hi Dana,");
  expect(note).toContain("- Item 1 Rough-in: work this period $10,000.00 to $8,000.00");
});

it("fills a column pasted from the GC's sheet and rejects a count that does not match", () => {
  setup();
  fireEvent.click(screen.getByText("Enter the GC's markup"));
  fireEvent.change(screen.getByLabelText("The column fills"), {
    target: { value: "storedMaterialsCents" },
  });
  fireEvent.change(screen.getByLabelText("Pasted column"), { target: { value: "-" } });
  fireEvent.click(screen.getByText("Fill from the pasted column"));
  expect(screen.getByText(/1 rows pasted for 2 lines/)).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Pasted column"), { target: { value: "-\n0\n" } });
  fireEvent.click(screen.getByText("Fill from the pasted column"));
  expect(screen.getByTestId("pencil-summary").textContent).toContain("$35,000.00 to $10,000.00");
});

it("offers no apply button once the draft cannot be edited", () => {
  setup(false);
  fireEvent.click(screen.getByText("Enter the GC's markup"));
  expect(screen.queryByText("Put the GC's figures in this draft")).toBeNull();
});
