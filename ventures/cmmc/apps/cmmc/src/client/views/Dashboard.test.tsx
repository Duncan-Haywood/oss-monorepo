// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CalibrationCard,
  PoliciesCard,
  QualityDatesCard,
  SuppliersCard,
  TrainingCard,
} from "./Dashboard";

afterEach(cleanup);

const item = (family: string, name: string, review: string, reviewDue: string | null) => ({
  family,
  name,
  policy: { reviewDue },
  review: review as "current" | "due_soon" | "overdue" | "never_approved" | "none",
});

describe("PoliciesCard", () => {
  it("points to the Policies tab when nothing is written", () => {
    const onOpen = vi.fn();
    render(
      <PoliciesCard
        data={{
          items: [],
          counts: { total: 14, written: 0, inForce: 0, dueSoon: 0, overdue: 0 },
        }}
        error={null}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText(/No policy written yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Write one" }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("lists overdue reviews before ones falling due, oldest first", () => {
    render(
      <PoliciesCard
        data={{
          items: [
            item("AC", "Access Control", "current", "2027-10-01"),
            item("IR", "Incident Response", "due_soon", "2026-12-20"),
            item("AT", "Awareness and Training", "overdue", "2026-11-01"),
            item("CM", "Configuration Management", "never_approved", null),
          ],
          counts: { total: 14, written: 4, inForce: 3, dueSoon: 1, overdue: 1 },
        }}
        error={null}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(/families with an approved policy/)).toBeTruthy();
    expect(screen.getByText("1 more in draft, not yet approved.")).toBeTruthy();
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toEqual([
      "Awareness and Training (AT): review was due 2026-11-01",
      "Incident Response (IR): review due 2026-12-20",
    ]);
  });

  it("says when no review is close", () => {
    render(
      <PoliciesCard
        data={{
          items: [item("AC", "Access Control", "current", "2027-10-01")],
          counts: { total: 14, written: 1, inForce: 1, dueSoon: 0, overdue: 0 },
        }}
        error={null}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText("No review overdue or due within 60 days.")).toBeTruthy();
  });
});

describe("TrainingCard", () => {
  it("points to the People tab when nobody is recorded", () => {
    const onOpen = vi.fn();
    render(
      <TrainingCard
        data={{ refreshMonths: 12, check: { active: 0 }, attention: [] }}
        error={null}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText(/No current people recorded/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add people" }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("counts and lists what is overdue, due soon and missing, in that order", () => {
    render(
      <TrainingCard
        data={{
          refreshMonths: 12,
          check: { active: 2 },
          attention: [
            {
              personId: "b",
              name: "Bo",
              training: "awareness",
              state: "overdue",
              dueOn: "2026-10-01",
            },
            {
              personId: "a",
              name: "Ann",
              training: "awareness",
              state: "due_soon",
              dueOn: "2026-12-10",
            },
            { personId: "b", name: "Bo", training: "insiderThreat", state: "missing", dueOn: null },
          ],
        }}
        error={null}
        onOpen={() => {}}
      />,
    );
    expect(
      screen.getByText(/1 overdue, 1 due within 30 days, 1 with no date recorded/),
    ).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Bo: security awareness was due 2026-10-01",
      "Ann: security awareness due 2026-12-10",
      "Bo: no insider threat awareness date recorded",
    ]);
  });

  it("says when nothing is close", () => {
    render(
      <TrainingCard
        data={{ refreshMonths: 12, check: { active: 3 }, attention: [] }}
        error={null}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(/none falls due within 30 days/)).toBeTruthy();
  });
});

describe("SuppliersCard", () => {
  it("points to the Suppliers tab when none is recorded", () => {
    const onOpen = vi.fn();
    render(
      <SuppliersCard
        data={{ check: { total: 0, flowdown: 0, ready: 0 }, attention: [] }}
        error={null}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText(/No suppliers recorded/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add suppliers" }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("counts and lists not current, running out and incomplete, in that order", () => {
    render(
      <SuppliersCard
        data={{
          check: { total: 4, flowdown: 4, ready: 1 },
          attention: [
            { supplierId: "a", name: "Late Co", state: "not_current", through: "2026-01-01" },
            { supplierId: "b", name: "Soon Co", state: "due_soon", through: "2026-12-20" },
            { supplierId: "c", name: "Blank Co", state: "unknown", through: null },
          ],
        }}
        error={null}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(/1 not current, 1 running out within 60 days, 1 with/)).toBeTruthy();
    const lines = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(lines).toEqual([
      "Late Co: not current since 2026-01-02",
      "Soon Co: current through 2026-12-20",
      "Blank Co: status or a date not recorded",
    ]);
  });

  it("says so when every supplier is current", () => {
    render(
      <SuppliersCard
        data={{ check: { total: 2, flowdown: 1, ready: 1 }, attention: [] }}
        error={null}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(/Every supplier the clause applies to is current/)).toBeTruthy();
  });
});

describe("QualityDatesCard", () => {
  const noop = () => {};
  it("says what shows here when nothing is recorded", () => {
    render(
      <QualityDatesCard
        orgId="o1"
        documents={{ today: "2026-11-27", items: [], needingReview: [] }}
        audits={{ audits: [], correctiveActions: [], attention: [] }}
        error={null}
        onOpenDocuments={noop}
        onOpenAudits={noop}
      />,
    );
    expect(
      screen.getByText(/No controlled document, internal audit or corrective action/),
    ).toBeTruthy();
  });

  it("merges document reviews, audits and actions, overdue first and oldest first", () => {
    const onOpenAudits = vi.fn();
    render(
      <QualityDatesCard
        orgId="o1"
        documents={{
          today: "2026-11-27",
          items: [{}, {}],
          needingReview: [
            { documentId: "d1", docNumber: "QP-01", title: "Purchasing", reviewDue: "2026-12-15" },
            { documentId: "d2", docNumber: "QP-02", title: "Calibration", reviewDue: "2026-11-01" },
          ],
        }}
        audits={{
          audits: [{}],
          correctiveActions: [{}],
          attention: [
            {
              kind: "audit",
              id: "a1",
              label: "Production audit",
              due: "2026-11-20",
              state: "overdue",
            },
            { kind: "ca_check", id: "c1", label: "CA-0001", due: "2026-12-01", state: "due_soon" },
          ],
        }}
        error={null}
        onOpenDocuments={noop}
        onOpenAudits={onOpenAudits}
      />,
    );
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "QP-02 Calibration: review was due 2026-11-01",
      "Production audit: planned for 2026-11-20, not marked done",
      "CA-0001: effectiveness check due 2026-12-01",
      "QP-01 Purchasing: review due 2026-12-15",
    ]);
    expect(screen.getByText("2 overdue, 2 due soon.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Audits" }));
    expect(onOpenAudits).toHaveBeenCalled();
  });
});

describe("CalibrationCard", () => {
  const check = (over: Record<string, number> = {}) => ({
    total: 0,
    inUse: 0,
    current: 0,
    dueSoon: 0,
    overdue: 0,
    never: 0,
    openOutOfTolerance: 0,
    ...over,
  });

  it("says what shows here when no gauge is recorded, and opens the Gauges tab", () => {
    const onOpen = vi.fn();
    render(
      <CalibrationCard
        orgId="o1"
        data={{ today: "2026-11-28", items: [], check: check(), due: [], dueSoonDays: 30 }}
        error={null}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText(/No gauge recorded yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gauges" }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("says all is current when nothing is due", () => {
    render(
      <CalibrationCard
        orgId="o1"
        data={{
          today: "2026-11-28",
          items: [{}, {}],
          check: check({ total: 2, inUse: 2, current: 2 }),
          due: [],
          dueSoonDays: 30,
        }}
        error={null}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(/2 gauges in use, none overdue or due within 30 days/)).toBeTruthy();
  });

  it("lists the recall list in its order, the open out-of-tolerance count and the calendar link", () => {
    render(
      <CalibrationCard
        orgId="o1"
        data={{
          today: "2026-11-28",
          items: [{}, {}, {}, {}],
          check: check({
            total: 4,
            inUse: 4,
            current: 1,
            overdue: 1,
            dueSoon: 1,
            never: 1,
            openOutOfTolerance: 1,
          }),
          due: [
            {
              gaugeId: "g1",
              tag: "CAL-1",
              description: "Caliper",
              state: "overdue",
              dueOn: "2026-11-01",
            },
            {
              gaugeId: "g2",
              tag: "MIC-2",
              description: "Mic",
              state: "due_soon",
              dueOn: "2026-12-10",
            },
            { gaugeId: "g3", tag: "PIN-3", description: "Pin set", state: "never", dueOn: null },
          ],
          dueSoonDays: 30,
        }}
        error={null}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(/1 overdue, 1 due within 30 days, 1 never calibrated/)).toBeTruthy();
    expect(screen.getByText(/1 out-of-tolerance result has no record/)).toBeTruthy();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "CAL-1 Caliper: calibration was due 2026-11-01",
      "MIC-2 Mic: calibration due 2026-12-10",
      "PIN-3 Pin set: in use, never calibrated",
    ]);
    expect(screen.getByRole("link", { name: "The calendar file" }).getAttribute("href")).toBe(
      "/api/orgs/o1/affirmations/calendar.ics",
    );
  });
});
