// @vitest-environment happy-dom
// The change order email draft: copying or opening it reports which draft was used (the page records
// "last emailed"), and after a request on a change order with no date sent it offers to record it as
// sent today. A follow-up never offers that.
import type { ChangeOrderDto, ProjectDetailDto } from "@shared/api/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChangeOrderEmailDraft } from "../../src/client/components/change-order-email";

afterEach(() => vi.unstubAllGlobals());

const co = (over: Partial<ChangeOrderDto> = {}): ChangeOrderDto => ({
  id: "co_1",
  number: "CO-1",
  description: "Add two exhaust fans",
  status: "pending",
  approvedOn: null,
  submittedOn: null,
  scheduleDays: null,
  lastEmailedOn: null,
  createdOn: "2026-11-01",
  totalCents: 250_000,
  items: [],
  ...over,
});

const project = (c: ChangeOrderDto) =>
  ({
    name: "Example Clinic",
    number: null,
    gcName: "Example Builders",
    gcPmName: "Dana Ruiz",
    gcPmEmail: "dana@example.com",
    originalContractSumCents: 10_000_000,
    changeOrders: [c],
  }) as unknown as ProjectDetailDto;

function mount(c: ChangeOrderDto) {
  const onUsed = vi.fn();
  const onMarkSent = vi.fn();
  render(
    <ChangeOrderEmailDraft
      project={project(c)}
      changeOrder={c}
      from={{ name: "Ana", company: "Volt Electric" }}
      today="2026-11-25"
      onUsed={onUsed}
      onMarkSent={onMarkSent}
    />,
  );
  return { onUsed, onMarkSent };
}

it("reports a copied request and offers to record it as sent today", async () => {
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => {}) } });
  const { onUsed, onMarkSent } = mount(co());
  expect(screen.queryByText("Record as sent today")).toBeNull();
  fireEvent.click(screen.getByText("Copy"));
  await waitFor(() => expect(onUsed).toHaveBeenCalledWith("request"));
  fireEvent.click(screen.getByText("Record as sent today"));
  expect(onMarkSent).toHaveBeenCalledTimes(1);
});

it("reports an opened follow-up and does not offer a date sent", () => {
  const { onUsed } = mount(co({ submittedOn: "2026-11-04" }));
  const link = screen.getByText("Open in my email");
  link.addEventListener("click", (e) => e.preventDefault()); // no mailto navigation in the test
  fireEvent.click(link);
  expect(onUsed).toHaveBeenCalledWith("follow-up");
  expect(screen.queryByText("Record as sent today")).toBeNull();
});

it("reports nothing when the copy fails", async () => {
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: vi.fn(async () => {
        throw new Error("denied");
      }),
    },
  });
  const { onUsed } = mount(co());
  fireEvent.click(screen.getByText("Copy"));
  await new Promise((r) => setTimeout(r, 0));
  expect(onUsed).not.toHaveBeenCalled();
});
