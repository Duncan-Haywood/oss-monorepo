// The T&M tickets page's form (src/client/pages/tm-tickets.tsx): the request body, blank rows
// dropped, dollars and percents read, problems in words, a saved ticket back into the form, and
// blank rates filled from the job's earlier tickets.
import type { TmTicketDto } from "@shared/api/types";
import { priceTicket } from "@shared/tm-tickets";
import { expect, it } from "vitest";
import {
  emptyTmForm,
  tmFormOf,
  tmTicketBody,
  withJobRates,
} from "../../src/client/pages/tm-tickets";

const latest = "2026-11-27";

it("builds the body: trims text, drops blank rows, reads dollars and percents", () => {
  const f = {
    ...emptyTmForm(4, "2026-11-24"),
    description: " Move two receptacles ",
    labor: [
      { trade: " Electrician ", workers: "2", hoursEach: "3.5", rate: "$98.50" },
      { trade: "", workers: "", hoursEach: "8", rate: "" },
    ],
    material: [{ description: "EMT", quantity: "40", unit: "ft", unitCost: "" }],
    laborMarkup: "15%",
    materialMarkup: "",
  };
  expect(tmTicketBody(f, latest)).toEqual({
    number: 4,
    workDate: "2026-11-24",
    description: "Move two receptacles",
    location: null,
    directedBy: null,
    reference: null,
    labor: [{ trade: "Electrician", workers: 2, hoursEach: 3.5, rateCents: 9850 }],
    material: [{ description: "EMT", quantity: 40, unit: "ft", unitCostCents: null }],
    equipment: [],
    laborMarkupBps: 1500,
    materialMarkupBps: 0,
    equipmentMarkupBps: 0,
    notes: null,
  });
});

it("throws the first problem in words", () => {
  const f = { ...emptyTmForm(1, "2026-11-24"), description: "Work" };
  // The starting blank labor row is dropped, so there is nothing on the ticket.
  expect(() => tmTicketBody(f, latest)).toThrow(/at least one labor/);
  expect(() =>
    tmTicketBody(
      { ...f, labor: [{ trade: "Laborer", workers: "", hoursEach: "8", rate: "" }] },
      latest,
    ),
  ).toThrow(/Labor line 1, workers/);
  const one = { trade: "Laborer", workers: "1", hoursEach: "8", rate: "" };
  expect(() => tmTicketBody({ ...f, labor: [{ ...one, rate: "abc" }] }, latest)).toThrow(
    /Labor line 1, rate: enter dollars/,
  );
  expect(() => tmTicketBody({ ...f, labor: [one], laborMarkup: "150" }, latest)).toThrow(
    /Labor markup/,
  );
  expect(() => tmTicketBody({ ...f, labor: [one], description: "" }, latest)).toThrow(
    /Describe the extra work/,
  );
});

const lines = {
  labor: [{ trade: "Electrician", workers: 2, hoursEach: 3.5, rateCents: 9850 }],
  material: [{ description: "EMT", quantity: 40, unit: "ft", unitCostCents: 87 }],
  equipment: [],
  laborMarkupBps: 1250,
  materialMarkupBps: 1000,
  equipmentMarkupBps: 0,
};
const saved: TmTicketDto = {
  id: "tmt_1",
  number: 3,
  workDate: "2026-11-23",
  description: "Move two receptacles",
  location: "Level 2",
  directedBy: "Dana",
  reference: null,
  ...lines,
  notes: null,
  pricing: priceTicket(lines),
  signedName: null,
  signedTitle: null,
  signedOn: null,
  hasSignatureImage: false,
  changeOrderId: null,
  changeOrderNumber: null,
  stage: "unsigned",
  fileCount: 0,
  createdByName: null,
  updatedByName: null,
  createdAt: "2026-11-23T20:00:00.000Z",
  updatedAt: "2026-11-23T20:00:00.000Z",
};

it("reads a saved ticket back into the form and out unchanged", () => {
  const f = tmFormOf(saved);
  expect(f.labor[0]).toEqual({
    trade: "Electrician",
    workers: "2",
    hoursEach: "3.5",
    rate: "98.50",
  });
  expect(f.laborMarkup).toBe("12.5");
  const body = tmTicketBody(f, latest);
  expect(body.labor).toEqual(saved.labor);
  expect(body.material).toEqual(saved.material);
  expect(body.laborMarkupBps).toBe(1250);
  // A new ticket starts with the latest ticket's markups.
  expect(emptyTmForm(4, "2026-11-24", saved)).toMatchObject({
    laborMarkup: "12.5",
    materialMarkup: "10",
  });
});

it("fills only blank rates from the job's earlier tickets", () => {
  const f = {
    ...emptyTmForm(1, "2026-11-24"),
    labor: [
      { trade: "electrician ", workers: "1", hoursEach: "8", rate: "" },
      { trade: "Apprentice", workers: "1", hoursEach: "8", rate: "60" },
      { trade: "Foreman", workers: "1", hoursEach: "8", rate: "" },
    ],
    equipment: [{ description: "Lift", hours: "4", rate: "" }],
  };
  const out = withJobRates(f, {
    labor: { electrician: 9850, apprentice: 5525 },
    material: {},
    equipment: { lift: 3500 },
  });
  expect(out.labor.map((l) => l.rate)).toEqual(["98.50", "60", ""]);
  expect(out.equipment[0]?.rate).toBe("35.00");
});
