// What changed between revisions (GET /quotes/:id/changes, services/quotes/changes.ts): a fresh
// revision compares as identical, edits show per quantity break and operation, the original has
// nothing to compare, revisions of other quote numbers are refused, and never across shops.
import type {
  QuoteChangesDto,
  QuoteDetailDto,
  QuoteEmailsDto,
  QuoteRevisionsDto,
} from "@shared/api";
import type { CostInputs } from "@shared/costing";
import { testFakes } from "@worker/context";
import { describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

async function sentQuote(t: Tenant) {
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
    api(t.path("/quotes"), {
      method: "POST",
      as: t.userId,
      json: { customerCompany: "Example Robotics LLC" },
    }),
    201,
  );
  await json(
    api(t.path(`/quotes/${q.id}/lines`), {
      method: "POST",
      as: t.userId,
      json: { partNumber: "BRK-1001", revision: "B", description: "Motor bracket", inputs },
    }),
    201,
  );
  const sent = await json<QuoteDetailDto>(
    api(t.path(`/quotes/${q.id}/send`), { method: "POST", as: t.userId }),
  );
  return { sent, rates };
}

const revise = (t: Tenant, id: string) =>
  json<QuoteDetailDto>(api(t.path(`/quotes/${id}/revise`), { method: "POST", as: t.userId }), 201);
const changes = (t: Tenant, id: string, as = t.userId, qs = "") =>
  api(t.path(`/quotes/${id}/changes${qs}`), { as });

describe("quote revision changes", () => {
  it("compares a revision with the quote it replaces", async () => {
    const t = await setupTenant();
    const { sent, rates } = await sentQuote(t);
    const rev = await revise(t, sent.id);

    // Straight after Revise: same lines and prices, only a fresh valid-until date.
    const fresh = await json<QuoteChangesDto>(changes(t, rev.id));
    expect(fresh.identical).toBe(true);
    expect(fresh.from).toMatchObject({ id: sent.id, revNumber: 1, status: "sent" });
    expect(fresh.to).toMatchObject({ id: rev.id, revNumber: 2, status: "draft" });
    expect(fresh.lines.map((l) => l.kind)).toEqual(["unchanged"]);

    // Faster cycle, a 100-piece break instead of 50, and passivate instead of anodize.
    const line = rev.lines[0];
    await json(
      api(t.path(`/quotes/${rev.id}/lines/${line?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: {
          inputs: {
            ...line?.inputs,
            quantities: [10, 100],
            operations: [
              {
                machineId: rates.mill,
                label: "OP10 mill",
                setupMinutes: 60,
                cycleMinutesPerPart: 9,
              },
            ],
            finishing: [{ opId: rates.passivate }],
          },
        },
      }),
    );
    await json(
      api(t.path(`/quotes/${rev.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { leadTimeText: "2 weeks ARO" },
      }),
    );
    const d = await json<QuoteChangesDto>(changes(t, rev.id));
    expect(d.identical).toBe(false);
    // A PATCH of the inputs alone leaves the part revision and description as they were.
    expect(d.lines[0]?.fields).toEqual([]);
    expect(d.header.map((h) => h.field)).toContain("leadTimeText");
    const [l] = d.lines;
    expect(l?.kind).toBe("changed");
    expect(l?.prices.map((p) => [p.quantity, p.kind])).toEqual([
      [10, "changed"],
      [50, "removed"],
      [100, "added"],
    ]);
    // Prices are the ones each revision stored, never recomputed here.
    const before = sent.lines[0]?.breaks?.find((b) => b.quantity === 10)?.unitPriceCents;
    expect(l?.prices[0]?.fromUnitCents).toBe(before);
    expect(l?.prices[0]?.toUnitCents).toBeLessThan(before ?? 0);
    expect(l?.operations).toEqual([
      {
        kind: "changed",
        machine: "Haas VF-2",
        label: "OP10 mill",
        from: { setupMinutes: 60, cycleMinutesPerPart: 12 },
        to: { setupMinutes: 60, cycleMinutesPerPart: 9 },
      },
    ]);
    expect(l?.finishing).toEqual({ added: ["Passivate"], removed: ["Anodize Type II black"] });
    expect(d.headline.fromCents).toBe(sent.headlineTotalCents);

    // Viewers can read it; Rev 3 compares with Rev 2 by default and with Rev 1 on request.
    const viewer = await addMember(t.orgId, "viewer");
    expect((await changes(t, rev.id, viewer)).status).toBe(200);
    await json(api(t.path(`/quotes/${rev.id}/send`), { method: "POST", as: t.userId }));
    const rev3 = await revise(t, rev.id);
    expect((await json<QuoteChangesDto>(changes(t, rev3.id))).from.revNumber).toBe(2);
    const vsFirst = await json<QuoteChangesDto>(changes(t, rev3.id, t.userId, `?from=${sent.id}`));
    expect(vsFirst.from.revNumber).toBe(1);
    expect(vsFirst.lines[0]?.prices.map((p) => p.kind)).toEqual(["changed", "removed", "added"]);
  });

  it("has nothing to compare on an original, refuses other quote numbers and other shops", async () => {
    const t = await setupTenant();
    const { sent } = await sentQuote(t);
    expect((await changes(t, sent.id)).status).toBe(409);
    const rev = await revise(t, sent.id);
    expect((await changes(t, rev.id, t.userId, `?from=${rev.id}`)).status).toBe(400);

    const other = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { customerCompany: "Y" } }),
      201,
    );
    expect((await changes(t, rev.id, t.userId, `?from=${other.id}`)).status).toBe(400);

    // Another shop sees neither the quote nor, through ?from=, this shop's revision.
    const t2 = await setupTenant();
    expect((await changes(t2, rev.id, t2.userId)).status).toBe(404);
    const theirs = (await sentQuote(t2)).sent;
    const theirRev = await revise(t2, theirs.id);
    expect((await changes(t2, theirRev.id, t2.userId, `?from=${sent.id}`)).status).toBe(404);
  });
});

const pdfText = async (t: Tenant, id: string) =>
  new TextDecoder("latin1").decode(
    await (await api(t.path(`/quotes/${id}/pdf`), { as: t.userId })).arrayBuffer(),
  );

describe("changes on the customer PDF and the revision list", () => {
  it("prints only customer-safe changes, only when turned on, and keeps them in the sent PDF", async () => {
    const t = await setupTenant();
    const { sent, rates } = await sentQuote(t);
    const rev = await revise(t, sent.id);
    expect(rev.showChangesOnPdf).toBe(false);
    const line = rev.lines[0];
    await json(
      api(t.path(`/quotes/${rev.id}/lines/${line?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: {
          inputs: {
            ...line?.inputs,
            quantities: [10, 100],
            operations: [
              {
                machineId: rates.mill,
                label: "OP10 mill",
                setupMinutes: 60,
                cycleMinutesPerPart: 9,
              },
            ],
            finishing: [{ opId: rates.passivate }],
          },
        },
      }),
    );
    const label = `Q-${sent.quoteNumber}`;
    expect(await pdfText(t, rev.id)).not.toContain(`Changes from ${label}`);

    // Viewers cannot turn it on; estimators can, on a draft.
    const viewer = await addMember(t.orgId, "viewer");
    const denied = await api(t.path(`/quotes/${rev.id}`), {
      method: "PATCH",
      as: viewer,
      json: { showChangesOnPdf: true },
    });
    expect(denied.status).toBe(403);
    const on = await json<QuoteDetailDto>(
      api(t.path(`/quotes/${rev.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { showChangesOnPdf: true },
      }),
    );
    expect(on.showChangesOnPdf).toBe(true);

    const preview = await pdfText(t, rev.id);
    expect(preview).toContain(`Changes from ${label}`);
    expect(preview).toContain("BRK-1001 Rev B, qty 50: no longer quoted");
    expect(preview).toMatch(/BRK-1001 Rev B, qty 10: \$[\d.,]+ to \$[\d.,]+ each/);
    expect(preview).toMatch(/BRK-1001 Rev B, qty 100: added at \$[\d.,]+ each/);
    // Cost basis never reaches the customer: no machine, minutes or finishing change.
    for (const secret of ["Haas", "cycle", "setup", "Passivate", "Anodize"]) {
      expect(preview).not.toContain(secret);
    }

    // The sent PDF is the stored one, section included; a sent quote cannot change the toggle.
    await json(api(t.path(`/quotes/${rev.id}/send`), { method: "POST", as: t.userId }));
    expect(await pdfText(t, rev.id)).toContain(`Changes from ${label}`);
    const frozen = await api(t.path(`/quotes/${rev.id}`), {
      method: "PATCH",
      as: t.userId,
      json: { showChangesOnPdf: false },
    });
    expect(frozen.status).toBe(409);
  });

  it("lists every revision of the quote number, oldest first, and only the shop's own", async () => {
    const t = await setupTenant();
    const { sent } = await sentQuote(t);
    const rev = await revise(t, sent.id);
    await json(api(t.path(`/quotes/${rev.id}/send`), { method: "POST", as: t.userId }));
    const rev3 = await revise(t, rev.id);
    const list = await json<QuoteRevisionsDto>(
      api(t.path(`/quotes/${rev3.id}/revisions`), { as: t.userId }),
    );
    expect(list.map((r) => [r.id, r.revNumber, r.status])).toEqual([
      [sent.id, 1, "superseded"],
      [rev.id, 2, "sent"],
      [rev3.id, 3, "draft"],
    ]);
    const t2 = await setupTenant();
    expect((await api(t2.path(`/quotes/${rev3.id}/revisions`), { as: t2.userId })).status).toBe(
      404,
    );
  });

  it("repeats the PDF's changes in the quote email's body, and only when the PDF has them", async () => {
    const t = await setupTenant();
    const { sent } = await sentQuote(t);
    const label = `Q-${sent.quoteNumber}`;
    const emailForm = (id: string) =>
      json<QuoteEmailsDto>(api(t.path(`/quotes/${id}/emails`), { as: t.userId }));
    const emailIt = async (id: string) => {
      testFakes.email.sent.length = 0;
      await json(
        api(t.path(`/quotes/${id}/email`), {
          method: "POST",
          as: t.userId,
          json: { to: "sam@robotics.example", message: "Hi Sam" },
        }),
        201,
      );
      return testFakes.email.sent[0];
    };

    // The original has nothing to compare.
    expect((await emailForm(sent.id)).changes).toBeNull();
    expect((await emailIt(sent.id))?.text).not.toContain("Changes from");

    // A revision with the toggle on and a quantity break dropped.
    const rev = await revise(t, sent.id);
    const line = rev.lines[0];
    await json(
      api(t.path(`/quotes/${rev.id}/lines/${line?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { inputs: { ...line?.inputs, quantities: [10] } },
      }),
    );
    await json(
      api(t.path(`/quotes/${rev.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { showChangesOnPdf: true },
      }),
    );
    // A draft cannot be emailed, so its form shows no lines yet.
    expect((await emailForm(rev.id)).changes).toBeNull();
    await json(api(t.path(`/quotes/${rev.id}/send`), { method: "POST", as: t.userId }));

    const form = await emailForm(rev.id);
    expect(form.changes).toEqual({
      fromLabel: label,
      items: ["BRK-1001 Rev B, qty 50: no longer quoted"],
    });
    const pdf = await pdfText(t, rev.id);
    for (const item of form.changes?.items ?? []) expect(pdf).toContain(item);

    const msg = await emailIt(rev.id);
    expect(msg?.text).toContain(
      `Hi Sam\n\nChanges from ${label}:\n- BRK-1001 Rev B, qty 50: no longer quoted\n`,
    );
    expect(msg?.html).toContain("<li>BRK-1001 Rev B, qty 50: no longer quoted</li>");
    // Cost basis stays out of the body as it does the PDF.
    for (const secret of ["Haas", "cycle", "setup", "Anodize"]) {
      expect(msg?.text).not.toContain(secret);
    }

    // A revision sent without the toggle: the PDF has no section, so neither does the email.
    const rev3 = await revise(t, rev.id);
    await json(api(t.path(`/quotes/${rev3.id}/send`), { method: "POST", as: t.userId }));
    expect((await emailForm(rev3.id)).changes).toBeNull();
    expect((await emailIt(rev3.id))?.text).not.toContain("Changes from");
  });
});
