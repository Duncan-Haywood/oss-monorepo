// Cross-tenant isolation: a member of shop B can never read or change shop A's rate card, RFQs,
// files, quotes or PDFs, whether through A's org path or by using A's ids under B's path.
import type { QuoteDetailDto, RateCardDto, RfqDetailDto } from "@shared/api";
import { describe, expect, it } from "vitest";
import { RFQ_EMAIL } from "../fixtures/rfq";
import { api, json, seedRateCard, setupTenant } from "./helpers";

describe("tenant isolation", () => {
  it("keeps every shop's data to its own members", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const ratesA = await seedRateCard(a);
    const form = new FormData();
    form.set("bodyText", RFQ_EMAIL);
    form.append("files", new File(["DWG"], "BRK-1001.pdf", { type: "application/pdf" }));
    const rfq = await json<RfqDetailDto>(
      api(a.path("/rfqs"), { method: "POST", as: a.userId, body: form }),
      201,
    );
    const ex = await json<RfqDetailDto>(
      api(a.path(`/rfqs/${rfq.id}/extract`), { method: "POST", as: a.userId }),
    );
    const partId = ex.parts[0]?.id;
    const fileId = rfq.files[0]?.id;
    await json(
      api(a.path(`/rfqs/${rfq.id}/parts/${partId}`), {
        method: "PATCH",
        as: a.userId,
        json: { confirmed: true },
      }),
    );
    const quote = await json<QuoteDetailDto>(
      api(a.path("/quotes"), { method: "POST", as: a.userId, json: { rfqId: rfq.id } }),
      201,
    );
    const lineId = quote.lines[0]?.id;

    // 1. B's user on A's org path: 404 for everything (org ids cannot be probed).
    const onA = [
      ["GET", ""],
      ["GET", "/rate-card"],
      ["GET", "/members"],
      ["GET", "/rfqs"],
      ["GET", `/rfqs/${rfq.id}`],
      ["GET", `/rfqs/${rfq.id}/files/${fileId}/download`],
      ["POST", `/rfqs/${rfq.id}/extract`],
      ["GET", "/quotes"],
      ["GET", `/quotes/${quote.id}`],
      ["GET", `/quotes/${quote.id}/pdf`],
      ["POST", `/quotes/${quote.id}/send`],
      ["POST", "/rate-card/machines"],
    ] as const;
    for (const [method, p] of onA) {
      const res = await api(a.path(p), {
        method,
        as: b.userId,
        ...(method === "POST" ? { json: { name: "x", kind: "lathe", hourlyRateCents: 1 } } : {}),
      });
      expect(res.status, `${method} ${p}`).toBe(404);
    }

    // 2. A's ids under B's own org path: not found.
    const onB = [
      ["GET", `/rfqs/${rfq.id}`],
      ["GET", `/rfqs/${rfq.id}/files/${fileId}/download`],
      ["POST", `/rfqs/${rfq.id}/extract`],
      ["PATCH", `/rfqs/${rfq.id}/parts/${partId}`],
      ["DELETE", `/rfqs/${rfq.id}/parts/${partId}`],
      ["GET", `/quotes/${quote.id}`],
      ["GET", `/quotes/${quote.id}/pdf`],
      ["PATCH", `/quotes/${quote.id}`],
      ["PATCH", `/quotes/${quote.id}/lines/${lineId}`],
      ["POST", `/quotes/${quote.id}/send`],
      ["POST", `/quotes/${quote.id}/outcome`],
      ["PATCH", `/rate-card/machines/${ratesA.mill}`],
      ["DELETE", `/rate-card/machines/${ratesA.mill}`],
    ] as const;
    for (const [method, p] of onB) {
      const body =
        method === "PATCH" && p.includes("/parts/")
          ? { notes: "hijack" }
          : method === "PATCH" && p.includes("/lines/")
            ? { partNumber: "X" }
            : method === "PATCH" && p.includes("/machines/")
              ? { hourlyRateCents: 1 }
              : method === "PATCH"
                ? { notes: "hijack" }
                : p.endsWith("/outcome")
                  ? { outcome: "lost" }
                  : undefined;
      const res = await api(b.path(p), {
        method,
        as: b.userId,
        ...(body ? { json: body } : {}),
      });
      expect(res.status, `${method} ${p}`).toBe(404);
    }

    // 3. Creating a quote in B from A's RFQ, or pricing with A's machine/material ids, gets nothing.
    const cross = await api(b.path("/quotes"), {
      method: "POST",
      as: b.userId,
      json: { rfqId: rfq.id },
    });
    expect(cross.status).toBe(404);
    const preview = await json<{ ok: boolean; issues: { code: string }[] }>(
      api(b.path("/costing/preview"), {
        method: "POST",
        as: b.userId,
        json: {
          inputs: {
            quantities: [1],
            material: { materialId: ratesA.al, blank: { shape: "weight", weightLb: 1 } },
            operations: [{ machineId: ratesA.mill, setupMinutes: 1, cycleMinutesPerPart: 1 }],
          },
        },
      }),
    );
    expect(preview.ok).toBe(false);
    expect(preview.issues.map((i) => i.code)).toEqual(["unknown_material", "unknown_machine"]);
    const part = await api(b.path(`/rfqs/${rfq.id}/parts`), {
      method: "POST",
      as: b.userId,
      json: { partNumber: "X" },
    });
    expect(part.status).toBe(404);

    // 4. B's own lists are empty; A's data is untouched.
    const bCard = await json<RateCardDto>(api(b.path("/rate-card"), { as: b.userId }));
    expect(bCard.machines).toEqual([]);
    expect(
      (await json<{ items: unknown[] }>(api(b.path("/rfqs"), { as: b.userId }))).items,
    ).toEqual([]);
    expect(
      (await json<{ items: unknown[] }>(api(b.path("/quotes"), { as: b.userId }))).items,
    ).toEqual([]);
    const aPart = await json<RfqDetailDto>(api(a.path(`/rfqs/${rfq.id}`), { as: a.userId }));
    expect(aPart.parts[0]?.notes).toBeNull();
    const aCard = await json<RateCardDto>(api(a.path("/rate-card"), { as: a.userId }));
    expect(aCard.machines[0]).toMatchObject({ hourlyRateCents: 9_500, active: true });
  });

  it("requires sign-in", async () => {
    const a = await setupTenant();
    expect((await api(a.path("/quotes"))).status).toBe(401);
    expect((await api("/api/me")).status).toBe(401);
  });
});
