// The pencil copy of a draft pay application (?pencil=1 on its PDF and its PDF with backup), real
// local D1. The mark itself is checked page by page in test/unit/exports.test.ts.
import type { PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { beforeAll, describe, expect, it } from "vitest";
import { api, call, setupTenant } from "./helpers";

let as: string;
let base: string;
let appBase: string;

const decode = async (res: Response) =>
  new TextDecoder("latin1").decode(new Uint8Array(await res.arrayBuffer()));

beforeAll(async () => {
  const t = await setupTenant("owner");
  as = t.userId;
  const created = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Elm Clinic",
      gcName: "Example Builders",
      originalContractSumCents: 1_000_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
    },
  });
  base = `/api/orgs/${t.orgId}/projects/${created.id}`;
  const p = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Rough-in", originalCents: 1_000_000 }] },
  });
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: "2026-11-01", periodTo: "2026-11-30", applicationDate: "2026-11-30" },
  });
  appBase = `${base}/pay-apps/${app.id}`;
  await call(`${appBase}/lines`, {
    method: "PUT",
    as,
    json: {
      lines: [
        {
          sovLineId: p.sovLines[0]?.id,
          workThisPeriodCents: 250_000,
          storedMaterialsCents: 0,
          retainageReleasedCents: 0,
        },
      ],
    },
  });
});

describe("pencil draft", () => {
  it("prints a draft as the pencil copy, named so, on request only", async () => {
    const plain = await api(`${appBase}/application.pdf`, { as });
    expect(plain.status).toBe(200);
    expect(await decode(plain)).toContain("DRAFT - NOT SUBMITTED");

    const pencil = await api(`${appBase}/application.pdf?pencil=1`, { as });
    expect(pencil.status).toBe(200);
    expect(pencil.headers.get("content-disposition")).toContain("-pencil.pdf");
    const text = await decode(pencil);
    expect(text).toContain("PENCIL DRAFT - FOR GC REVIEW, NOT FOR PAYMENT");
    expect(text).not.toContain("DRAFT - NOT SUBMITTED");

    const packet = await api(`${appBase}/packet.pdf?pencil=1`, { as });
    expect(packet.status).toBe(200);
    expect(packet.headers.get("content-disposition")).toContain("-pencil-with-backup.pdf");
  });

  it("ignores the pencil request once the application is submitted", async () => {
    await call(`${appBase}/submit`, { method: "POST", as });
    const res = await api(`${appBase}/application.pdf?pencil=1`, { as });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).not.toContain("-pencil");
    expect(await decode(res)).not.toContain("PENCIL");
  });
});
