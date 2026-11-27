// @vitest-environment happy-dom
// The estimate page's email panel: the draft as rendered, and "Mark sent today" offered only after
// the proposal draft is used.
import type { EstimateDetailDto } from "@shared/api/types";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EstimateEmailDraft } from "./estimate-email";

afterEach(cleanup);

const estimate = {
  label: "EST-0003",
  name: "Harbor Lofts, drywall",
  gcName: "Harbor Builders",
  gcContactName: null,
  gcContactEmail: null,
  location: null,
  bidDueOn: null,
  sentOn: null,
  status: "draft",
  validDays: 30,
  totals: { priceCents: 5_000_000 },
  bidItems: [],
} as unknown as EstimateDetailDto;
const from = { name: "Sam", company: "Ortiz Drywall" };

it("renders the proposal draft and offers to mark it sent once opened", () => {
  const onMarkSent = vi.fn();
  const view = render(
    <EstimateEmailDraft
      estimate={estimate}
      from={from}
      today="2026-12-01"
      onMarkSent={onMarkSent}
    />,
  );
  const message = view.getByLabelText("Message") as HTMLTextAreaElement;
  expect(message.value).toContain("Hello Harbor Builders estimating team,");
  expect(message.value).toContain("Bid price: $50,000.00.");
  expect(view.getByText(/Add the GC estimator's email/)).toBeTruthy();
  expect(view.queryByTestId("estimate-email-mark-sent")).toBeNull();
  const open = view.getByText("Open in my email");
  expect(open.getAttribute("href")?.startsWith("mailto:?subject=Proposal%20EST-0003")).toBe(true);
  open.addEventListener("click", (ev) => ev.preventDefault());
  fireEvent.click(open);
  fireEvent.click(view.getByText("Mark sent today"));
  expect(onMarkSent).toHaveBeenCalledTimes(1);
});

it("a sent estimate gets the follow-up and no mark-sent offer", () => {
  const view = render(
    <EstimateEmailDraft
      estimate={{ ...estimate, status: "sent", sentOn: "2026-11-20" }}
      from={from}
      today="2026-12-01"
      onMarkSent={() => {}}
    />,
  );
  expect((view.getByLabelText("Subject") as HTMLInputElement).value).toBe(
    "Following up: proposal EST-0003, Harbor Lofts, drywall",
  );
  const open = view.getByText("Open in my email");
  open.addEventListener("click", (ev) => ev.preventDefault());
  fireEvent.click(open);
  expect(view.queryByTestId("estimate-email-mark-sent")).toBeNull();
});

it("renders nothing for a lost estimate", () => {
  const view = render(
    <EstimateEmailDraft
      estimate={{ ...estimate, status: "lost" }}
      from={from}
      today="2026-12-01"
    />,
  );
  expect(view.container.innerHTML).toBe("");
});
