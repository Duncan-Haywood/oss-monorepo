// Quote revisions and the expiry job (services/quotes: reviseQuote, sendQuote, expireQuotes).
// A sent quote is never edited: Revise starts "Q-n Rev 2" with the same lines and prices; sending it
// marks the earlier one superseded in the same batch. The daily job expires sent quotes past their
// valid-until day. Never across shops; viewers cannot revise.
import { env } from "cloudflare:workers";
import type { QuoteDetailDto, QuoteDto, QuoteStatsDto } from "@shared/api";
import type { CostInputs } from "@shared/costing";
import { createAppContext } from "@worker/context";
import { quotes } from "@worker/db/schema";
import type { Env } from "@worker/env";
import { expireQuotes } from "@worker/services/quotes";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant, testDb } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

async function sentQuote(t: Tenant, customerCompany = "Example Robotics LLC") {
  const rates = await seedRateCard(t);
  const inputs: Partial<CostInputs> = {
    quantities: [10, 50],
    customerSuppliedMaterial: true,
    material: null,
    operations: [
      { machineId: rates.mill, label: "OP10 mill", setupMinutes: 60, cycleMinutesPerPart: 12 },
    ],
    finishing: [{ opId: rates.anodize }],
  };
  const q = await json<QuoteDetailDto>(
    api(t.path("/quotes"), { method: "POST", as: t.userId, json: { customerCompany } }),
    201,
  );
  await json<QuoteDetailDto>(
    api(t.path(`/quotes/${q.id}/lines`), {
      method: "POST",
      as: t.userId,
      json: { partNumber: "BRK-1001", revision: "B", inputs },
    }),
    201,
  );
  await json(
    api(t.path(`/quotes/${q.id}`), {
      method: "PATCH",
      as: t.userId,
      json: { notes: "Deburr all edges.", coverNote: "Thanks for the RFQ." },
    }),
  );
  const sent = await json<QuoteDetailDto>(
    api(t.path(`/quotes/${q.id}/send`), { method: "POST", as: t.userId }),
  );
  return { sent, rates };
}

const revise = (t: Tenant, quoteId: string, as = t.userId) =>
  api(t.path(`/quotes/${quoteId}/revise`), { method: "POST", as });
const get = (t: Tenant, quoteId: string) =>
  json<QuoteDetailDto>(api(t.path(`/quotes/${quoteId}`), { as: t.userId }));

describe("quote revisions", () => {
  it("starts Rev 2 with the same number and lines, and sending it supersedes Rev 1", async () => {
    const t = await setupTenant();
    const { sent, rates } = await sentQuote(t);
    expect(sent).toMatchObject({ status: "sent", revNumber: 1, supersedesQuoteId: null });

    const rev = await json<QuoteDetailDto>(revise(t, sent.id), 201);
    expect(rev).toMatchObject({
      status: "draft",
      quoteNumber: sent.quoteNumber,
      revNumber: 2,
      supersedesQuoteId: sent.id,
      supersededByQuoteId: null,
      customerCompany: "Example Robotics LLC",
      notes: "Deburr all edges.",
      coverNote: null,
      headlineTotalCents: sent.headlineTotalCents,
    });
    expect(rev.id).not.toBe(sent.id);
    // Lines copied exactly: same inputs, same prices, same snapshot, new ids.
    expect(rev.lines).toHaveLength(1);
    const [a] = sent.lines;
    const [b] = rev.lines;
    expect(b?.id).not.toBe(a?.id);
    expect(b).toMatchObject({
      partNumber: "BRK-1001",
      revision: "B",
      inputs: a?.inputs,
      breaks: a?.breaks,
      snapshot: a?.snapshot,
    });

    // Asking again opens the same draft instead of a second revision.
    const again = await json<QuoteDetailDto>(revise(t, sent.id), 201);
    expect(again.id).toBe(rev.id);

    // Until the revision goes out, Rev 1 is untouched and can still get an outcome.
    expect((await get(t, sent.id)).status).toBe("sent");

    // The revision is an ordinary draft: change a quantity break, which re-prices the line.
    const edited = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${rev.id}/lines/${b?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: {
          inputs: { ...b?.inputs, quantities: [25], finishing: [{ opId: rates.anodize }] },
        },
      }),
    );
    expect(edited.lines[0]?.breaks?.map((x) => x.quantity)).toEqual([25]);

    // The PDF names the revision and what it replaces.
    const pdf = await api(t.path(`/quotes/${rev.id}/pdf`), { as: t.userId });
    expect(pdf.headers.get("Content-Disposition")).toContain(`Q-${sent.quoteNumber}-R2.pdf`);
    const pdfText = new TextDecoder("latin1").decode(await pdf.arrayBuffer());
    expect(pdfText).toContain(`Q-${sent.quoteNumber} Rev 2`);
    expect(pdfText).toContain(`Replaces Q-${sent.quoteNumber}`);

    const revSent = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${rev.id}/send`), { method: "POST", as: t.userId }),
    );
    expect(revSent.status).toBe("sent");
    const old = await get(t, sent.id);
    expect(old).toMatchObject({ status: "superseded", supersededByQuoteId: rev.id });
    // The sent PDF of Rev 1 is still the exact one that went out.
    expect(old.sentPdfSha256).toBe(sent.sentPdfSha256);

    // Outcomes go on the live revision; the superseded one refuses them.
    const onOld = await api(t.path(`/quotes/${sent.id}/outcome`), {
      method: "POST",
      as: t.userId,
      json: { outcome: "won", poNumber: "PO-1" },
    });
    expect(onOld.status).toBe(409);
    // And it can no longer be revised (Rev 2 is the latest): the existing revision is returned.
    expect((await json<QuoteDetailDto>(revise(t, sent.id), 201)).id).toBe(rev.id);

    // The log counts the quoted value once, and the win rate ignores superseded quotes.
    const stats = await json<QuoteStatsDto>(api(t.path("/quotes/stats"), { as: t.userId }));
    expect(stats.byStatus).toMatchObject({ sent: 1, superseded: 1 });
    expect(stats.quotedCents).toBe(revSent.headlineTotalCents);
    const list = await json<{ items: QuoteDto[] }>(api(t.path("/quotes"), { as: t.userId }));
    expect(list.items.map((q) => [q.quoteNumber, q.revNumber, q.status])).toEqual(
      expect.arrayContaining([
        [sent.quoteNumber, 2, "sent"],
        [sent.quoteNumber, 1, "superseded"],
      ]),
    );

    // Rev 3 of Rev 2 works the same way.
    const rev3 = await json<QuoteDetailDto>(revise(t, rev.id), 201);
    expect(rev3).toMatchObject({ revNumber: 3, supersedesQuoteId: rev.id });
  });

  it("revises lost and expired quotes but not drafts or won quotes", async () => {
    const t = await setupTenant();
    const { sent } = await sentQuote(t);
    const draft = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { customerCompany: "X" } }),
      201,
    );
    expect((await revise(t, draft.id)).status).toBe(409);

    await json(
      api(t.path(`/quotes/${sent.id}/outcome`), {
        method: "POST",
        as: t.userId,
        json: { outcome: "lost", reason: "price" },
      }),
    );
    const fromLost = await json<QuoteDetailDto>(revise(t, sent.id), 201);
    expect(fromLost.revNumber).toBe(2);

    const t2 = await setupTenant();
    const won = (await sentQuote(t2)).sent;
    await json(
      api(t2.path(`/quotes/${won.id}/outcome`), {
        method: "POST",
        as: t2.userId,
        json: { outcome: "won", poNumber: "PO-9" },
      }),
    );
    const r = await revise(t2, won.id);
    expect(r.status).toBe(409);
    expect(await r.text()).toContain("new quote");
  });

  it("refuses to send a revision once the quote it replaces was won", async () => {
    const t = await setupTenant();
    const { sent } = await sentQuote(t);
    const rev = await json<QuoteDetailDto>(revise(t, sent.id), 201);
    await json(
      api(t.path(`/quotes/${sent.id}/outcome`), {
        method: "POST",
        as: t.userId,
        json: { outcome: "won", poNumber: "PO-2" },
      }),
    );
    const send = await api(t.path(`/quotes/${rev.id}/send`), { method: "POST", as: t.userId });
    expect(send.status).toBe(409);
    expect((await get(t, rev.id)).status).toBe("draft");
    expect((await get(t, sent.id)).status).toBe("won");
  });

  it("keeps revisions inside the shop and away from viewers", async () => {
    const t = await setupTenant();
    const { sent } = await sentQuote(t);
    const other = await setupTenant();
    const cross = await api(other.path(`/quotes/${sent.id}/revise`), {
      method: "POST",
      as: other.userId,
    });
    expect(cross.status).toBe(404);
    const viewer = await addMember(t.orgId, "viewer");
    expect((await revise(t, sent.id, viewer)).status).toBe(403);
    expect((await get(t, sent.id)).status).toBe("sent");
  });
});

describe("quote expiry job", () => {
  it("expires sent quotes the day after valid-until, and nothing else", async () => {
    const t = await setupTenant();
    const { sent } = await sentQuote(t);
    const db = testDb();
    await db.update(quotes).set({ validUntil: "2030-03-10" }).where(eq(quotes.id, sent.id));
    // A draft past its date and a sent quote with no date never expire on their own.
    const draft = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { customerCompany: "Y" } }),
      201,
    );
    await db.update(quotes).set({ validUntil: "2030-03-01" }).where(eq(quotes.id, draft.id));
    const undated = (await sentQuote(await setupTenant())).sent;
    await db.update(quotes).set({ validUntil: null }).where(eq(quotes.id, undated.id));

    const run = (iso: string) =>
      expireQuotes(createAppContext(env as unknown as Env, { now: () => new Date(iso) }));

    await run("2030-03-10T23:00:00Z");
    expect((await get(t, sent.id)).status).toBe("sent");

    expect(await run("2030-03-11T11:17:00Z")).toBeGreaterThanOrEqual(1);
    const expired = await get(t, sent.id);
    expect(expired.status).toBe("expired");
    expect(expired.decidedAt).toBe("2030-03-11T11:17:00.000Z");
    expect((await get(t, draft.id)).status).toBe("draft");
    const u = await db.select().from(quotes).where(eq(quotes.id, undated.id)).get();
    expect(u?.status).toBe("sent");

    // An expired quote can be revised for a customer who comes back.
    const rev = await json<QuoteDetailDto>(revise(t, sent.id), 201);
    expect(rev.revNumber).toBe(2);
  });
});
