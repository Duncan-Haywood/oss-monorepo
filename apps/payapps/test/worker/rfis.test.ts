// The job's RFI log: numbered RFIs with their dates, answer, impacts and a linked change order;
// status computed for today; the PDF and CSV; editors write, viewers read; another company's job and
// RFIs answer 404, and a change order from another job cannot be linked.
import type {
  JobEventDto,
  ProjectDetailDto,
  ProjectDto,
  RfiDto,
  RfiLogDto,
} from "@shared/api/types";
import { addDays } from "@shared/cash-report";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

const today = () => new Date().toISOString().slice(0, 10);

async function job(name = "Riverside Clinic") {
  const t = await setupTenant("owner");
  const as = t.userId;
  const created = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name,
      gcName: "Harbor Builders",
      originalContractSumCents: 5_000_000,
      gcPmName: "Dana Ruiz",
      gcPmEmail: "dana@harbor.example",
    },
  });
  const base = `/api/orgs/${t.orgId}/projects/${created.id}`;
  return { ...t, as, base, projectId: created.id };
}

async function addChangeOrder(base: string, as: string, number: string) {
  let project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Ductwork", originalCents: 5_000_000 }] },
  });
  project = await call<ProjectDetailDto>(`${base}/change-orders`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      number,
      description: "Reroute duct at C/4",
      items: [{ sovLineId: project.sovLines[0]?.id, amountCents: 240_000 }],
    },
  });
  const co = project.changeOrders.find((c) => c.number === number);
  if (!co) throw new Error("no change order");
  return co.id;
}

const pdfText = async (path: string, as: string) => {
  const res = await api(path, { as });
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toBe("application/pdf");
  return { text: new TextDecoder().decode(await res.arrayBuffer()), res };
};

describe("RFI log", () => {
  it("numbers RFIs, tracks them from draft to overdue to answered, and links a change order", async () => {
    const { base, as } = await job();
    const empty = await call<RfiLogDto>(`${base}/rfis`, { as });
    expect(empty.items).toEqual([]);
    expect(empty.nextNumber).toBe(1);

    const first = await call<RfiDto>(`${base}/rfis`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        subject: "Ceiling height at corridor 2",
        question: "Duct at C/4 conflicts with the 9'-0\" ceiling. Can it drop to 8'-6\"?",
        reference: "M-201 detail 3",
        suggestion: "",
      },
    });
    expect(first.number).toBe(1);
    expect(first.status).toBe("draft");
    expect(first.suggestion).toBeNull();

    const sent = addDays(today(), -10);
    const due = addDays(today(), -3);
    const overdue = await call<RfiDto>(`${base}/rfis/${first.id}`, {
      method: "PATCH",
      as,
      json: { sentOn: sent, responseDueOn: due, costImpact: "possible" },
    });
    expect(overdue.status).toBe("overdue");
    expect(overdue.daysOverdue).toBe(3);
    expect(overdue.daysOutstanding).toBe(10);

    const second = await call<RfiDto>(`${base}/rfis`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        subject: "Damper access",
        question: "Where do the access panels go?",
        sentOn: today(),
      },
    });
    expect(second.number).toBe(2);
    expect(second.status).toBe("open");

    const answered = await call<RfiDto>(`${base}/rfis/${first.id}`, {
      method: "PATCH",
      as,
      json: {
        answeredOn: addDays(today(), -1),
        answer: "Drop to 8'-6\" in corridor 2 only.",
        answeredBy: "Dana Ruiz, Harbor Builders",
        costImpact: "yes",
      },
    });
    expect(answered.status).toBe("answered");
    expect(answered.needsChangeOrder).toBe(true);

    let log = await call<RfiLogDto>(`${base}/rfis`, { as });
    expect(log.summary).toMatchObject({ total: 2, open: 1, answered: 1, needChangeOrder: 1 });
    expect(log.summary.averageDaysToAnswer).toBe(9);
    expect(log.nextNumber).toBe(3);

    const coId = await addChangeOrder(base, as, "4");
    const linked = await call<RfiDto>(`${base}/rfis/${first.id}`, {
      method: "PATCH",
      as,
      json: { changeOrderId: coId },
    });
    expect(linked.changeOrderNumber).toBe("4");
    expect(linked.needsChangeOrder).toBe(false);

    // Deleting the change order leaves the RFI unlinked rather than deleting it.
    await call(`${base}/change-orders/${coId}`, { method: "DELETE", as });
    log = await call<RfiLogDto>(`${base}/rfis`, { as });
    expect(log.items[0]?.changeOrderId).toBeNull();
    expect(log.items[0]?.needsChangeOrder).toBe(true);

    // A deleted RFI's number is not reused.
    await call(`${base}/rfis/${second.id}`, { method: "DELETE", as });
    log = await call<RfiLogDto>(`${base}/rfis`, { as });
    expect(log.items.map((r) => r.number)).toEqual([1]);
    expect(log.nextNumber).toBe(2);
  });

  it("refuses dates out of order, a duplicate number and an unknown field", async () => {
    const { base, as } = await job();
    const bad = await api(`${base}/rfis`, {
      method: "POST",
      as,
      json: { subject: "A", question: "Q", sentOn: today(), responseDueOn: addDays(today(), -1) },
    });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("response date cannot be before the date sent");

    const future = await api(`${base}/rfis`, {
      method: "POST",
      as,
      json: { subject: "A", question: "Q", sentOn: addDays(today(), 2) },
    });
    expect(future.status).toBe(400);

    const one = await call<RfiDto>(`${base}/rfis`, {
      method: "POST",
      as,
      expect: 201,
      json: { subject: "A", question: "Q", number: 7 },
    });
    expect(one.number).toBe(7);
    const dupe = await api(`${base}/rfis`, {
      method: "POST",
      as,
      json: { subject: "B", question: "Q", number: 7 },
    });
    expect(dupe.status).toBe(409);
    // Clearing the date sent while an answer is recorded is refused.
    await call(`${base}/rfis/${one.id}`, {
      method: "PATCH",
      as,
      json: { sentOn: addDays(today(), -2), answeredOn: today() },
    });
    const unsend = await api(`${base}/rfis/${one.id}`, {
      method: "PATCH",
      as,
      json: { sentOn: null },
    });
    expect(unsend.status).toBe(400);
    const extra = await api(`${base}/rfis`, {
      method: "POST",
      as,
      json: { subject: "A", question: "Q", status: "answered" },
    });
    expect(extra.status).toBe(400);
  });

  it("prints the RFI as a PDF with a response box until answered, and the log as CSV", async () => {
    const { base, as } = await job();
    const r = await call<RfiDto>(`${base}/rfis`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        subject: "Ceiling height",
        question: "Can the ceiling drop?",
        suggestion: "Drop 6 in.",
        sentOn: today(),
        timeImpact: "none",
      },
    });
    let { text, res } = await pdfText(`${base}/rfis/${r.id}/rfi.pdf`, as);
    expect(res.headers.get("Content-Disposition")).toContain("rfi-001-riverside-clinic.pdf");
    expect(text).toContain("(Request for Information No. 001) Tj");
    expect(text).toContain("(Attn: Dana Ruiz, dana@harbor.example) Tj");
    expect(text).toContain("(Proposed solution) Tj");
    expect(text).toContain("(Cost impact: not stated) Tj");
    expect(text).toContain("(Time impact: none expected) Tj");
    expect(text).toContain("(Response \\(general contractor or design team\\)) Tj");

    await call(`${base}/rfis/${r.id}`, {
      method: "PATCH",
      as,
      json: { answeredOn: today(), answer: "Yes, drop it.", answeredBy: "Dana Ruiz" },
    });
    ({ text } = await pdfText(`${base}/rfis/${r.id}/rfi.pdf`, as));
    expect(text).toContain("(Yes, drop it.) Tj");
    expect(text).toContain(`(Answered: Dana Ruiz, ${today()}) Tj`);
    expect(text).not.toContain("design team");

    const csv = await api(`${base}/rfis/rfis.csv`, { as });
    expect(csv.status).toBe(200);
    expect(csv.headers.get("Content-Disposition")).toContain("rfi-log-riverside-clinic.csv");
    const body = await csv.text();
    expect(body.split("\r\n")[0]).toMatch(/^RFI,Subject,Status,/);
    expect(body).toContain("1,Ceiling height,Answered,");
  });

  it("lets viewers read but not write", async () => {
    const { base, as, orgId } = await job();
    const r = await call<RfiDto>(`${base}/rfis`, {
      method: "POST",
      as,
      expect: 201,
      json: { subject: "A", question: "Q" },
    });
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    const log = await call<RfiLogDto>(`${base}/rfis`, { as: viewer.id });
    expect(log.items).toHaveLength(1);
    expect((await api(`${base}/rfis/${r.id}/rfi.pdf`, { as: viewer.id })).status).toBe(200);
    for (const [method, path, json] of [
      ["POST", `${base}/rfis`, { subject: "B", question: "Q" }],
      ["PATCH", `${base}/rfis/${r.id}`, { subject: "C" }],
      ["DELETE", `${base}/rfis/${r.id}`, undefined],
    ] as const) {
      expect((await api(path, { method, as: viewer.id, json })).status).toBe(403);
    }
  });

  it("keeps companies apart: another company's job, RFI and change order answer 404 or 400", async () => {
    const a = await job("Job A");
    const b = await job("Job B");
    const rA = await call<RfiDto>(`${a.base}/rfis`, {
      method: "POST",
      as: a.as,
      expect: 201,
      json: { subject: "A", question: "Q" },
    });
    // B's member against A's job: not a member of A's company.
    expect((await api(`${a.base}/rfis`, { as: b.as })).status).toBe(404);
    // B's own company, A's job id or A's RFI id.
    const crossJob = `/api/orgs/${b.orgId}/projects/${a.projectId}/rfis`;
    expect((await api(crossJob, { as: b.as })).status).toBe(404);
    expect(
      (await api(`${b.base}/rfis/${rA.id}`, { method: "PATCH", as: b.as, json: { subject: "X" } }))
        .status,
    ).toBe(404);
    expect((await api(`${b.base}/rfis/${rA.id}/rfi.pdf`, { as: b.as })).status).toBe(404);
    expect((await api(`${b.base}/rfis/${rA.id}`, { method: "DELETE", as: b.as })).status).toBe(404);
    // A change order on B's job cannot be linked to A's RFI.
    const coB = await addChangeOrder(b.base, b.as, "1");
    const link = await api(`${a.base}/rfis/${rA.id}`, {
      method: "PATCH",
      as: a.as,
      json: { changeOrderId: coB },
    });
    expect(link.status).toBe(400);
    const still = await call<RfiLogDto>(`${a.base}/rfis`, { as: a.as });
    expect(still.items[0]?.subject).toBe("A");
  });

  it("lists overdue RFIs across the company's active jobs, and never another company's", async () => {
    const { base, as, orgId, projectId } = await job("Clinic <TI>");
    const add = (json: Record<string, unknown>) =>
      call<RfiDto>(`${base}/rfis`, {
        method: "POST",
        as,
        expect: 201,
        json: { question: "Q", ...json },
      });
    const sent = addDays(today(), -20);
    await add({ subject: "Late one", sentOn: sent, responseDueOn: addDays(today(), -3) });
    await add({ subject: "Later one", sentOn: sent, responseDueOn: addDays(today(), -10) });
    await add({ subject: "Due today", sentOn: sent, responseDueOn: today() });
    await add({ subject: "Draft" });
    const list = await call<{ items: Array<Record<string, unknown>> }>(
      `/api/orgs/${orgId}/rfis/overdue`,
      { as },
    );
    expect(list.items.map((r) => [r.subject, r.daysOverdue, r.projectId, r.projectName])).toEqual([
      ["Later one", 10, projectId, "Clinic <TI>"],
      ["Late one", 3, projectId, "Clinic <TI>"],
    ]);

    // A viewer reads it; another company sees only its own (none).
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    const seen = await call<{ items: unknown[] }>(`/api/orgs/${orgId}/rfis/overdue`, {
      as: viewer.id,
    });
    expect(seen.items).toHaveLength(2);
    const other = await setupTenant("owner");
    const theirs = await call<{ items: unknown[] }>(`/api/orgs/${other.orgId}/rfis/overdue`, {
      as: other.userId,
    });
    expect(theirs.items).toEqual([]);
    const res = await api(`/api/orgs/${orgId}/rfis/overdue`, { as: other.userId });
    expect(res.status).toBe(404);
  });
});

describe("RFIs in the job history", () => {
  const history = (base: string, as: string) =>
    call<{ items: JobEventDto[] }>(`${base}/history`, { as }).then((r) => [...r.items].reverse());

  it("records entered, sent, answered, linked and deleted, with who did it", async () => {
    const t = await job();
    const coId = await addChangeOrder(t.base, t.as, "CO-2");
    const sentOn = addDays(today(), -5);
    const created = await call<RfiDto>(`${t.base}/rfis`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { subject: "Duct at C/4", question: "Can the duct drop below the beam?" },
    });
    const path = `${t.base}/rfis/${created.id}`;
    await call(path, {
      method: "PATCH",
      as: t.as,
      json: { sentOn, responseDueOn: addDays(sentOn, 7) },
    });
    await call(path, {
      method: "PATCH",
      as: t.as,
      json: { answeredOn: today(), answeredBy: "Dana Ruiz", answer: "Yes", costImpact: "yes" },
    });
    await call(path, { method: "PATCH", as: t.as, json: { changeOrderId: coId } });
    // A refused change (answered before it was sent) writes nothing.
    const bad = await api(path, {
      method: "PATCH",
      as: t.as,
      json: { sentOn: today(), answeredOn: sentOn },
    });
    expect(bad.status).toBe(400);
    await call(path, { method: "DELETE", as: t.as });

    const rfiRows = (await history(t.base, t.as)).filter((e) => e.action.startsWith("rfi_"));
    expect(rfiRows.map((e) => e.text)).toEqual([
      "RFI 001 entered: Duct at C/4, not sent yet",
      `RFI 001: sent to the GC ${sentOn}`,
      `RFI 001 changed: response due date ${addDays(sentOn, 7)}`,
      `RFI 001 answered on ${today()} by Dana Ruiz`,
      "RFI 001 changed: answer, cost impact",
      "RFI 001 linked to change order CO-2",
      "RFI 001 deleted: Duct at C/4",
    ]);
    expect(rfiRows.every((e) => e.subjectId === created.id && e.actor !== null)).toBe(true);

    const csv = await api(`${t.base}/history.csv`, { as: t.as });
    const body = await csv.text();
    expect(body).toContain("RFI 001,RFI 001 linked to change order CO-2");
  });

  it("writes nothing for the sample job", async () => {
    const t = await setupTenant("owner");
    const sample = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects/sample`, {
      method: "POST",
      as: t.userId,
      expect: 201,
    });
    const base = `/api/orgs/${t.orgId}/projects/${sample.id}`;
    await call(`${base}/rfis`, {
      method: "POST",
      as: t.userId,
      expect: 201,
      json: { subject: "Sample", question: "Sample question?" },
    });
    expect(await history(base, t.userId)).toEqual([]);
  });
});

describe("Start a change order from an answered RFI", () => {
  async function answeredRfi(base: string, as: string) {
    const project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
      method: "POST",
      as,
      expect: 201,
      json: { lines: [{ itemNumber: "1", description: "Ductwork", originalCents: 5_000_000 }] },
    });
    const rfi = await call<RfiDto>(`${base}/rfis`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        subject: "Ceiling height at corridor 2",
        question: "Can the ceiling drop to 8'-6\"?",
        sentOn: addDays(today(), -5),
        answeredOn: addDays(today(), -1),
        answer: "Reroute the duct instead.",
        costImpact: "yes",
      },
    });
    return { rfi, lineId: project.sovLines[0]?.id ?? "" };
  }

  it("creates the change order and links it to the RFI, with both rows in the job history", async () => {
    const { base, as } = await job();
    const { rfi, lineId } = await answeredRfi(base, as);
    expect(rfi.needsChangeOrder).toBe(true);
    const project = await call<ProjectDetailDto>(`${base}/change-orders`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        number: "7",
        description: "RFI 001: Ceiling height at corridor 2",
        items: [{ sovLineId: lineId, amountCents: 180_000 }],
        rfiId: rfi.id,
      },
    });
    const co = project.changeOrders.find((c) => c.number === "7");
    expect(co?.description).toBe("RFI 001: Ceiling height at corridor 2");
    const log = await call<RfiLogDto>(`${base}/rfis`, { as });
    const linked = log.items.find((r) => r.id === rfi.id);
    expect(linked?.changeOrderId).toBe(co?.id);
    expect(linked?.changeOrderNumber).toBe("7");
    expect(linked?.needsChangeOrder).toBe(false);
    expect(log.summary.needChangeOrder).toBe(0);

    const history = await call<{ items: JobEventDto[] }>(`${base}/history`, { as });
    const actions = history.items.map((e) => e.action);
    expect(actions).toContain("change_order_created");
    expect(actions).toContain("rfi_change_order_linked");
  });

  it("refuses an RFI already priced, one not answered, and one on another company's job, creating nothing", async () => {
    const { base, as } = await job();
    const { rfi, lineId } = await answeredRfi(base, as);
    const body = (number: string, rfiId: string) => ({
      number,
      description: "Reroute",
      items: [{ sovLineId: lineId, amountCents: 100_000 }],
      rfiId,
    });
    await call(`${base}/change-orders`, {
      method: "POST",
      as,
      expect: 201,
      json: body("1", rfi.id),
    });
    await call(`${base}/change-orders`, {
      method: "POST",
      as,
      expect: 409,
      json: body("2", rfi.id),
    });

    const open = await call<RfiDto>(`${base}/rfis`, {
      method: "POST",
      as,
      expect: 201,
      json: { subject: "Door hardware", question: "Which set?", sentOn: today() },
    });
    await call(`${base}/change-orders`, {
      method: "POST",
      as,
      expect: 400,
      json: body("3", open.id),
    });

    // Another company's job (the free plan allows one active job per company).
    const other = await job("Elsewhere Clinic");
    const otherRfi = await call<RfiDto>(`${other.base}/rfis`, {
      method: "POST",
      as: other.as,
      expect: 201,
      json: {
        subject: "Elsewhere",
        question: "?",
        sentOn: addDays(today(), -2),
        answeredOn: today(),
        answer: "Yes",
      },
    });
    await call(`${base}/change-orders`, {
      method: "POST",
      as,
      expect: 404,
      json: body("4", otherRfi.id),
    });

    const project = await call<ProjectDetailDto>(base, { as });
    expect(project.changeOrders.map((c) => c.number)).toEqual(["1"]);
  });
});
