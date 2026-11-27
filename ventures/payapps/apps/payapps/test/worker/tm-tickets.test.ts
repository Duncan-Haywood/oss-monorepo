// T&M tickets (/projects/:projectId/tm-tickets): numbering, the checks, prices, what a signature
// locks, the drawn signature in the PDF, billing signed tickets on one change order (and the ticket
// going back when that change order is deleted), the CSV, viewers read-only, and no reach into
// another company's job or ticket.
import type {
  ProjectDetailDto,
  ProjectDto,
  TmRateSheetDto,
  TmTicketDto,
  TmTicketLogDto,
} from "@shared/api/types";
import type { CashDigest } from "@shared/cash-digest";
import { addDays } from "@shared/tm-tickets";
import { digestEmail } from "@worker/services/payapps/digest";
import { describe, expect, it } from "vitest";
import { SIGNATURE_JPEG_B64 } from "../fixtures/signature-jpeg";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

const today = () => new Date().toISOString().slice(0, 10);
const day = (n: number) => addDays(today(), -n);

async function job() {
  const t = await setupTenant("owner");
  const p = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as: t.userId,
    expect: 201,
    json: {
      name: "Mesa Clinic TI",
      gcName: "Copper State Builders",
      originalContractSumCents: 10_000_000,
    },
  });
  const project = `/api/orgs/${t.orgId}/projects/${p.id}`;
  return { ...t, as: t.userId, project, tm: `${project}/tm-tickets` };
}

const ticket = (workDate: string, over: Record<string, unknown> = {}) => ({
  workDate,
  description: "Relocate two duplex receptacles at the nurse station per the super",
  location: "Level 2, grid C-4",
  directedBy: "Dana Ortiz",
  reference: "FD-07",
  labor: [
    { trade: "Journeyman electrician", workers: 2, hoursEach: 3.5, rateCents: 9850 },
    { trade: "Apprentice", workers: 1, hoursEach: 3.5, rateCents: null },
  ],
  material: [{ description: "3/4 in EMT", quantity: 40, unit: "ft", unitCostCents: 87 }],
  equipment: [{ description: "Scissor lift, 19 ft", hours: 4, rateCents: 3500 }],
  laborMarkupBps: 1500,
  materialMarkupBps: 1000,
  ...over,
});

const signature = (signedOn: string, jpeg: string | null = SIGNATURE_JPEG_B64) => ({
  signedName: "Dana Ortiz",
  signedTitle: "Superintendent",
  signedOn,
  signatureJpeg: jpeg,
});

describe("T&M tickets", () => {
  it("numbers tickets, prices them, and refuses a number already used", async () => {
    const { tm, as } = await job();
    const empty = await call<TmTicketLogDto>(tm, { as });
    expect(empty).toMatchObject({ items: [], nextNumber: 1, canEdit: true });
    expect(empty.suggestedChangeOrderNumber).toBe("1");

    const a = await call<TmTicketDto>(tm, {
      method: "POST",
      as,
      expect: 201,
      json: ticket(day(2)),
    });
    expect(a).toMatchObject({ number: 1, stage: "unsigned", hasSignatureImage: false });
    expect(a.pricing).toMatchObject({ manHours: 10.5, priced: false, totalCents: null });
    // A paper ticket book's number is kept; the next one follows the highest.
    const b = await call<TmTicketDto>(tm, {
      method: "POST",
      as,
      expect: 201,
      json: ticket(day(1), { number: 117, material: [], equipment: [] }),
    });
    expect(b.number).toBe(117);
    const log = await call<TmTicketLogDto>(tm, { as });
    expect(log.nextNumber).toBe(118);
    expect(log.items.map((t) => t.number)).toEqual([117, 1]);
    // Rates already used on the job, for new lines.
    expect(log.rates.labor).toEqual({ "journeyman electrician": 9850 });
    expect(log.rates.equipment).toEqual({ "scissor lift, 19 ft": 3500 });

    const dupe = await api(tm, { method: "POST", as, json: ticket(day(1), { number: 1 }) });
    expect(dupe.status).toBe(409);
    expect(await dupe.text()).toMatch(/T&M 1 already exists/);
    expect((await api(`${tm}/${b.id}`, { method: "PATCH", as, json: { number: 1 } })).status).toBe(
      409,
    );
  });

  it("refuses tickets that do not make sense, with the reason", async () => {
    const { tm, as } = await job();
    const bad: [Record<string, unknown>, RegExp][] = [
      [ticket(addDays(today(), 3)), /after today/],
      [ticket(day(1), { labor: [], material: [], equipment: [] }), /at least one/],
      [
        ticket(day(1), {
          labor: [{ trade: "Laborer", workers: 2, hoursEach: 7.3, rateCents: null }],
        }),
        /quarter hours/,
      ],
    ];
    for (const [json, msg] of bad) {
      const r = await api(tm, { method: "POST", as, json });
      expect(r.status, JSON.stringify(json)).toBe(400);
      expect(await r.text()).toMatch(msg);
    }
  });

  it("locks the quantities once signed, while rates and markups still change", async () => {
    const { tm, as } = await job();
    const a = await call<TmTicketDto>(tm, {
      method: "POST",
      as,
      expect: 201,
      json: ticket(day(2)),
    });

    // A signature dated before the work, or with an image that is not a JPEG, is refused.
    expect(
      (await api(`${tm}/${a.id}/signature`, { method: "PUT", as, json: signature(day(3)) })).status,
    ).toBe(400);
    const png = await api(`${tm}/${a.id}/signature`, {
      method: "PUT",
      as,
      json: signature(day(2), btoa("\x89PNG\r\n\x1a\nxxxx")),
    });
    expect(png.status).toBe(400);
    expect(await png.text()).toMatch(/JPEG/);

    const signed = await call<TmTicketDto>(`${tm}/${a.id}/signature`, {
      method: "PUT",
      as,
      json: signature(day(2)),
    });
    expect(signed).toMatchObject({
      stage: "signed",
      signedName: "Dana Ortiz",
      signedTitle: "Superintendent",
      hasSignatureImage: true,
    });
    const img = await api(`${tm}/${a.id}/signature.jpg`, { as });
    expect(img.status).toBe(200);
    expect(img.headers.get("Content-Type")).toBe("image/jpeg");
    expect(new Uint8Array(await img.arrayBuffer()).slice(0, 2)).toEqual(
      new Uint8Array([0xff, 0xd8]),
    );

    // The hours are what the GC signed for.
    const more = await api(`${tm}/${a.id}`, {
      method: "PATCH",
      as,
      json: {
        labor: [
          { trade: "Journeyman electrician", workers: 2, hoursEach: 4, rateCents: 9850 },
          { trade: "Apprentice", workers: 1, hoursEach: 3.5, rateCents: 5525 },
        ],
      },
    });
    expect(more.status).toBe(409);
    expect(await more.text()).toMatch(/is signed: take the signature off/);
    expect(
      (await api(`${tm}/${a.id}`, { method: "PATCH", as, json: { description: "Other work" } }))
        .status,
    ).toBe(409);

    // Pricing the same quantities is fine, and makes the ticket billable.
    const priced = await call<TmTicketDto>(`${tm}/${a.id}`, {
      method: "PATCH",
      as,
      json: {
        labor: [
          { trade: "Journeyman electrician", workers: 2, hoursEach: 3.5, rateCents: 9850 },
          { trade: "Apprentice", workers: 1, hoursEach: 3.5, rateCents: 5525 },
        ],
        equipmentMarkupBps: 500,
        notes: "Priced from the subcontract's Exhibit D rates",
      },
    });
    // Labor 689.50 + 193.38 = 882.88 + 15% 132.43; material 34.80 + 3.48; equipment 140 + 7.
    expect(priced.pricing.totalCents).toBe(88288 + 13243 + 3480 + 348 + 14000 + 700);
    expect(priced.stage).toBe("signed");

    // Taking the signature off unlocks the quantities (and the image goes with it).
    const unsigned = await call<TmTicketDto>(`${tm}/${a.id}/signature`, { method: "DELETE", as });
    expect(unsigned).toMatchObject({
      stage: "unsigned",
      signedName: null,
      hasSignatureImage: false,
    });
    expect((await api(`${tm}/${a.id}/signature.jpg`, { as })).status).toBe(404);
    await call(`${tm}/${a.id}`, { method: "PATCH", as, json: { description: "Other work" } });
  });

  it("prints the ticket with the drawn signature, a field copy without prices, and the CSV", async () => {
    const { tm, as } = await job();
    const a = await call<TmTicketDto>(tm, {
      method: "POST",
      as,
      expect: 201,
      json: ticket(day(2), { notes: '=HYPERLINK("http://x")' }),
    });
    await call(`${tm}/${a.id}/signature`, { method: "PUT", as, json: signature(day(2)) });

    const pdf = await api(`${tm}/${a.id}/ticket.pdf`, { as });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(pdf.headers.get("Content-Disposition")).toContain("tm-ticket-1-mesa-clinic-ti.pdf");
    const text = new TextDecoder().decode(new Uint8Array(await pdf.arrayBuffer()));
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("/Subtype /Image /Width 120 /Height 40");
    expect(text).toContain("/Filter [/ASCIIHexDecode /DCTDecode]");
    expect(text).toContain("/Im1 Do");
    expect(text).toContain("(Time and Material Ticket No. 1)");
    expect(text).toContain("$98.50/h");

    const field = new TextDecoder().decode(
      new Uint8Array(await (await api(`${tm}/${a.id}/ticket.pdf?prices=0`, { as })).arrayBuffer()),
    );
    expect(field).toContain("Time and Material Ticket No. 1");
    expect(field).not.toContain("$98.50");

    const csv = await (await api(`${tm}/log.csv`, { as })).text();
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toMatch(/^Ticket,Work date,Description/);
    expect(csv).toContain("Journeyman electrician 2 x 3.5 h");
    expect(csv).toContain("Dana Ortiz, Superintendent");
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
  });

  it("bills signed, priced tickets on one pending change order, and frees them if it is deleted", async () => {
    const { tm, as, project } = await job();
    const priced = {
      labor: [{ trade: "Electrician", workers: 1, hoursEach: 8, rateCents: 10000 }],
    };
    const a = await call<TmTicketDto>(tm, {
      method: "POST",
      as,
      expect: 201,
      json: ticket(day(5), { ...priced, material: [], equipment: [], laborMarkupBps: 1000 }),
    });
    const b = await call<TmTicketDto>(tm, {
      method: "POST",
      as,
      expect: 201,
      json: ticket(day(3), { ...priced, material: [], equipment: [], laborMarkupBps: 0 }),
    });
    const target = { newLine: { itemNumber: "CO1" } };

    // Not signed yet: refused, and nothing is created.
    const early = await api(`${tm}/change-order`, {
      method: "POST",
      as,
      json: { ticketIds: [a.id, b.id], number: "1", target },
    });
    expect(early.status).toBe(400);
    expect(await early.text()).toMatch(/T&M 1 is not signed yet/);
    // Signed on paper: no image, still signed.
    for (const t of [a, b]) {
      await call(`${tm}/${t.id}/signature`, {
        method: "PUT",
        as,
        json: signature(t.workDate, null),
      });
    }
    const before = await call<TmTicketLogDto>(tm, { as });
    expect(before.summary).toMatchObject({
      signedNotOnChangeOrder: 2,
      signedNotOnChangeOrderCents: 88000 + 80000,
      oldestSignedNotOnChangeOrder: day(5),
    });

    const out = await call<{ changeOrderId: string; amountCents: number; tickets: number[] }>(
      `${tm}/change-order`,
      { method: "POST", as, expect: 201, json: { ticketIds: [b.id, a.id], number: "1", target } },
    );
    expect(out).toMatchObject({ amountCents: 168000, tickets: [1, 2] });
    const detail = await call<ProjectDetailDto>(project, { as });
    const co = detail.changeOrders.find((c) => c.id === out.changeOrderId);
    expect(co).toMatchObject({ number: "1", status: "pending", totalCents: 168000 });
    expect(co?.description).toMatch(/^T&M tickets 1, 2: Relocate/);

    const after = await call<TmTicketLogDto>(tm, { as });
    expect(
      after.items.every((t) => t.stage === "on-change-order" && t.changeOrderNumber === "1"),
    ).toBe(true);
    expect(after.summary.signedNotOnChangeOrder).toBe(0);
    expect(after.suggestedChangeOrderNumber).toBe("2");
    // Billed: twice is refused, and so are edits, unsigning and deleting.
    expect(
      (
        await api(`${tm}/change-order`, {
          method: "POST",
          as,
          json: { ticketIds: [a.id], number: "2", target },
        })
      ).status,
    ).toBe(409);
    expect(
      (await api(`${tm}/${a.id}`, { method: "PATCH", as, json: { laborMarkupBps: 0 } })).status,
    ).toBe(409);
    await call(`${tm}/${a.id}`, { method: "PATCH", as, json: { notes: "Sent with CO 1" } });
    expect((await api(`${tm}/${a.id}/signature`, { method: "DELETE", as })).status).toBe(409);
    expect((await api(`${tm}/${a.id}`, { method: "DELETE", as })).status).toBe(409);

    // The backup PDF has both tickets, oldest first.
    const backup = await api(`${tm}/change-order/${out.changeOrderId}/backup.pdf`, { as });
    expect(backup.status).toBe(200);
    const pdf = new TextDecoder().decode(new Uint8Array(await backup.arrayBuffer()));
    expect(pdf.indexOf("Ticket No. 1")).toBeLessThan(pdf.indexOf("Ticket No. 2"));
    expect(pdf).toContain("Signed on paper");

    // The job history has the change order.
    const history = await call<{ items: { action: string }[] }>(`${project}/history`, { as });
    expect(history.items.some((e) => e.action === "change_order_created")).toBe(true);

    // Deleting the change order puts the tickets back as signed, not billed.
    await call(`${project}/change-orders/${out.changeOrderId}`, { method: "DELETE", as });
    const freed = await call<TmTicketLogDto>(tm, { as });
    expect(freed.items.every((t) => t.stage === "signed" && t.changeOrderId === null)).toBe(true);
  });

  it("bills onto an existing schedule-of-values line, and refuses an unpriced ticket", async () => {
    const { tm, as, project, orgId } = await job();
    const detail = await call<ProjectDetailDto>(`${project}/sov-lines`, {
      method: "POST",
      as,
      expect: 201,
      json: { itemNumber: "1", description: "Electrical", originalCents: 10_000_000 },
    });
    const a = await call<TmTicketDto>(tm, {
      method: "POST",
      as,
      expect: 201,
      json: ticket(day(1)),
    });
    await call(`${tm}/${a.id}/signature`, { method: "PUT", as, json: signature(day(1)) });
    const r = await api(`${tm}/change-order`, {
      method: "POST",
      as,
      json: { ticketIds: [a.id], number: "7", target: { newLine: { itemNumber: "CO7" } } },
    });
    expect(r.status).toBe(400);
    expect(await r.text()).toMatch(/no rate yet/);
    const line = detail.sovLines[0];
    expect(line).toBeTruthy();
    if (line) {
      await call(`${tm}/${a.id}`, {
        method: "PATCH",
        as,
        json: {
          labor: [
            { trade: "Journeyman electrician", workers: 2, hoursEach: 3.5, rateCents: 9850 },
            { trade: "Apprentice", workers: 1, hoursEach: 3.5, rateCents: 5525 },
          ],
        },
      });
      const out = await call<{ changeOrderId: string }>(`${tm}/change-order`, {
        method: "POST",
        as,
        expect: 201,
        json: { ticketIds: [a.id], number: "7", target: { sovLineId: line.id } },
      });
      const after = await call<ProjectDetailDto>(project, { as });
      expect(after.sovLines).toHaveLength(1);
      expect(after.changeOrders.find((c) => c.id === out.changeOrderId)?.totalCents).toBe(
        88288 + 13243 + 3480 + 348 + 14000,
      );
    }
    // A ticket id from another company's job is not found.
    const other = await setupTenant("owner");
    const theirs = await call<ProjectDto>(`/api/orgs/${other.orgId}/projects`, {
      method: "POST",
      as: other.userId,
      expect: 201,
      json: { name: "Theirs", gcName: "GC", originalContractSumCents: 1 },
    });
    const res = await api(
      `/api/orgs/${other.orgId}/projects/${theirs.id}/tm-tickets/change-order`,
      {
        method: "POST",
        as: other.userId,
        json: { ticketIds: [a.id], number: "1", target: { newLine: { itemNumber: "X" } } },
      },
    );
    expect(res.status).toBe(404);
    expect(orgId).not.toBe(other.orgId);
  });

  it("lets viewers read but not write, and keeps other companies out", async () => {
    const { tm, as, orgId } = await job();
    const a = await call<TmTicketDto>(tm, {
      method: "POST",
      as,
      expect: 201,
      json: ticket(day(1)),
    });
    await call(`${tm}/${a.id}/signature`, { method: "PUT", as, json: signature(day(1)) });
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    const seen = await call<TmTicketLogDto>(tm, { as: viewer.id });
    expect(seen.items).toHaveLength(1);
    expect(seen.canEdit).toBe(false);
    expect((await api(`${tm}/${a.id}/ticket.pdf`, { as: viewer.id })).status).toBe(200);
    expect((await api(`${tm}/${a.id}/signature.jpg`, { as: viewer.id })).status).toBe(200);
    for (const [path, method, json] of [
      [tm, "POST", ticket(day(2))],
      [`${tm}/${a.id}`, "PATCH", { notes: "x" }],
      [`${tm}/${a.id}`, "DELETE", undefined],
      [`${tm}/${a.id}/signature`, "DELETE", undefined],
      [`${tm}/${a.id}/signature`, "PUT", signature(day(1))],
    ] as const) {
      expect((await api(path, { method, as: viewer.id, json })).status, `${method} ${path}`).toBe(
        403,
      );
    }

    const other = await setupTenant("owner");
    for (const path of [
      tm,
      `${tm}/log.csv`,
      `${tm}/${a.id}/ticket.pdf`,
      `${tm}/${a.id}/signature.jpg`,
    ]) {
      expect((await api(path, { as: other.userId })).status, path).toBe(404);
    }
    const theirs = await call<ProjectDto>(`/api/orgs/${other.orgId}/projects`, {
      method: "POST",
      as: other.userId,
      expect: 201,
      json: { name: "Theirs", gcName: "GC", originalContractSumCents: 1 },
    });
    const theirTm = `/api/orgs/${other.orgId}/projects/${theirs.id}/tm-tickets`;
    expect(
      (await api(`${theirTm}/${a.id}`, { method: "PATCH", as: other.userId, json: { notes: "x" } }))
        .status,
    ).toBe(404);
    expect((await api(`${theirTm}/${a.id}/signature.jpg`, { as: other.userId })).status).toBe(404);
    expect((await api(`${theirTm}/${a.id}/ticket.pdf`, { as: other.userId })).status).toBe(404);
  });
});

describe("T&M rate sheet and the weekly email", () => {
  const sheet = {
    source: "Subcontract Exhibit D",
    labor: [
      { name: "Journeyman electrician", rateCents: 9500 },
      { name: "Apprentice", rateCents: 6200 },
    ],
    equipment: [{ name: "Scissor lift, 19 ft", rateCents: 3500 }],
    material: [{ name: "3/4 in EMT", rateCents: 87, unit: "ft" }],
    laborMarkupBps: 1500,
    materialMarkupBps: 1000,
  };

  it("saves the sheet whole, fills rates from it first, and points out a rate that differs", async () => {
    const { tm, as } = await job();
    const first = await call<TmTicketLogDto>(tm, { as });
    expect(first.rateSheet).toBeNull();
    expect(first.rateSheetDraft).toBeNull();

    await call<TmTicketDto>(tm, { method: "POST", as, expect: 201, json: ticket(day(2)) });
    const withTicket = await call<TmTicketLogDto>(tm, { as });
    // A first draft from the ticket's priced lines (the apprentice had no rate, so it is not on it).
    expect(withTicket.rateSheetDraft?.labor).toEqual([
      { name: "Journeyman electrician", rateCents: 9850, unit: null },
    ]);
    expect(withTicket.rateSheetDraft?.material).toEqual([
      { name: "3/4 in EMT", rateCents: 87, unit: "ft" },
    ]);
    expect(withTicket.rateSheetDraft?.laborMarkupBps).toBe(1500);

    const saved = await call<TmRateSheetDto>(`${tm}/rate-sheet`, {
      method: "PUT",
      as,
      json: sheet,
    });
    expect(saved).toMatchObject({
      source: "Subcontract Exhibit D",
      laborMarkupBps: 1500,
      equipmentMarkupBps: null,
    });
    // Unit is kept for material only.
    expect(saved.labor[0]).toEqual({ name: "Journeyman electrician", rateCents: 9500, unit: null });
    const log = await call<TmTicketLogDto>(tm, { as });
    expect(log.rateSheet?.labor).toHaveLength(2);
    // The sheet's rate wins over the earlier ticket's; names only on tickets still fill.
    expect(log.rates.labor).toEqual({ "journeyman electrician": 9500, apprentice: 6200 });
    // The ticket written before the sheet keeps its rate.
    expect(log.items[0]?.labor[0]?.rateCents).toBe(9850);

    // Saving again replaces the whole sheet.
    const again = await call<TmRateSheetDto>(`${tm}/rate-sheet`, {
      method: "PUT",
      as,
      json: { labor: [{ name: "Foreman", rateCents: 11000 }] },
    });
    expect(again.labor.map((l) => l.name)).toEqual(["Foreman"]);
    expect(again.material).toEqual([]);
    expect(again.laborMarkupBps).toBeNull();

    const dupe = await api(`${tm}/rate-sheet`, {
      method: "PUT",
      as,
      json: {
        labor: [
          { name: "Foreman", rateCents: 11000 },
          { name: " foreman ", rateCents: 10000 },
        ],
      },
    });
    expect(dupe.status).toBe(400);
    expect(await dupe.text()).toMatch(/on the sheet twice/);
    expect(
      (
        await api(`${tm}/rate-sheet`, {
          method: "PUT",
          as,
          json: { labor: [{ name: "X", rateCents: -1 }] },
        })
      ).status,
    ).toBe(400);

    expect((await api(`${tm}/rate-sheet`, { method: "DELETE", as })).status).toBe(200);
    expect((await call<TmTicketLogDto>(tm, { as })).rateSheet).toBeNull();
  });

  it("lets viewers read the sheet but not change it, and keeps other companies out", async () => {
    const { tm, as, orgId } = await job();
    await call(`${tm}/rate-sheet`, { method: "PUT", as, json: sheet });
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect((await call<TmTicketLogDto>(tm, { as: viewer.id })).rateSheet?.source).toBe(
      "Subcontract Exhibit D",
    );
    expect(
      (await api(`${tm}/rate-sheet`, { method: "PUT", as: viewer.id, json: sheet })).status,
    ).toBe(403);
    expect((await api(`${tm}/rate-sheet`, { method: "DELETE", as: viewer.id })).status).toBe(403);

    const other = await setupTenant("owner");
    expect(
      (await api(`${tm}/rate-sheet`, { method: "PUT", as: other.userId, json: sheet })).status,
    ).toBe(404);
    expect((await api(`${tm}/rate-sheet`, { method: "DELETE", as: other.userId })).status).toBe(
      404,
    );
    // Their own job with the same path shape cannot read or change ours.
    const theirs = await call<ProjectDto>(`/api/orgs/${other.orgId}/projects`, {
      method: "POST",
      as: other.userId,
      expect: 201,
      json: { name: "Theirs", gcName: "GC", originalContractSumCents: 1 },
    });
    const theirTm = `/api/orgs/${other.orgId}/projects/${theirs.id}/tm-tickets`;
    expect((await call<TmTicketLogDto>(theirTm, { as: other.userId })).rateSheet).toBeNull();
    expect((await call<TmTicketLogDto>(tm, { as })).rateSheet?.labor).toHaveLength(2);
  });

  it("lists signed tickets not on a change order in the weekly email preview", async () => {
    const { tm, as, orgId } = await job();
    const preview = async () =>
      (
        await call<{ preview: { summary: string[]; tmJobs: { tickets: number[] }[] } | null }>(
          `/api/orgs/${orgId}/digest`,
          { as },
        )
      ).preview;
    const a = await call<TmTicketDto>(tm, {
      method: "POST",
      as,
      expect: 201,
      json: ticket(day(9), {
        labor: [{ trade: "Journeyman electrician", workers: 2, hoursEach: 4, rateCents: 9500 }],
      }),
    });
    // Unsigned: not on the list.
    expect((await preview())?.tmJobs ?? []).toEqual([]);
    await call(`${tm}/${a.id}/signature`, { method: "PUT", as, json: signature(day(9), null) });
    const p = await preview();
    expect(p?.tmJobs.map((j) => j.tickets)).toEqual([[1]]);
    expect(p?.summary).toContain(
      "Signed T&M tickets not on a change order: 1 on 1 job, $1,052.28 priced.",
    );
    // The email itself: the job's line links to its T&M page; the HTML escapes the "&".
    const full = (await call<{ preview: CashDigest | null }>(`/api/orgs/${orgId}/digest`, { as }))
      .preview;
    if (!full) throw new Error("expected a preview");
    const mail = digestEmail(
      full,
      { orgId, orgName: "Volt Electric", userName: "Sam" },
      { APP_URL: "https://app.example" },
    );
    expect(mail.text).toContain("Signed T&M tickets to bill");
    expect(mail.text).toMatch(
      /Mesa Clinic TI \(Copper State Builders\): T&M 1 signed, not on a change order: \$1,052\.28 priced\. Oldest work \d{4}-\d{2}-\d{2}, 9 days ago\. https:\/\/app\.example\/orgs\/[^/]+\/projects\/[^/]+\/tm-tickets/,
    );
    expect(mail.text).toContain("from your T&M tickets");
    expect(mail.html).toContain("Signed T&amp;M tickets to bill");
    expect(mail.html).not.toContain("Signed T&M");
    // Once billed on a change order it drops off.
    await call(`${tm}/change-order`, {
      method: "POST",
      as,
      expect: 201,
      json: { ticketIds: [a.id], number: "CO-1", target: { newLine: { itemNumber: "CO1" } } },
    });
    expect((await preview())?.tmJobs ?? []).toEqual([]);
  });
});
