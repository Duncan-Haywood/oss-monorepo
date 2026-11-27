// What changed between two revisions of a quote (shared/quote-diff.ts): by default the one this
// quote revises, or `from` any other revision of the same quote number. Every query is scoped by
// orgId, so another shop's quote id is a 404 and never its lines.
import type { QuoteChangesDto, QuoteRevisionsDto } from "@shared/api";
import { type DiffNames, type DiffQuote, diffQuotes } from "@shared/quote-diff";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { finishingOps, machines, materials, quoteLines, quotes } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";

async function quoteWithLines(ctx: AppContext, orgId: string, quoteId: string) {
  const q = await ctx.db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)))
    .get();
  if (!q) return null;
  const lines = await ctx.db
    .select()
    .from(quoteLines)
    .where(and(eq(quoteLines.orgId, orgId), eq(quoteLines.quoteId, quoteId)))
    .orderBy(asc(quoteLines.position), asc(quoteLines.createdAt))
    .all();
  return { q, lines };
}

type Loaded = NonNullable<Awaited<ReturnType<typeof quoteWithLines>>>;

const asDiff = ({ q, lines }: Loaded): DiffQuote => ({
  customerCompany: q.customerCompany,
  customerContact: q.customerContact,
  customerEmail: q.customerEmail,
  leadTimeText: q.leadTimeText,
  validUntil: q.validUntil,
  notes: q.notes,
  headlineTotalCents: q.headlineTotalCents,
  lines: lines.map((l) => ({
    id: l.id,
    rfqPartId: l.rfqPartId,
    partNumber: l.partNumber,
    revision: l.revision,
    description: l.description,
    inputs: l.inputs,
    breaks: l.breaks,
  })),
});

const ref = ({ q }: Loaded) => ({
  id: q.id,
  quoteNumber: q.quoteNumber,
  revNumber: q.revNumber,
  status: q.status,
});

export async function quoteChanges(
  ctx: AppContext,
  orgId: string,
  quoteId: string,
  fromQuoteId?: string,
): Promise<QuoteChangesDto> {
  const to = await quoteWithLines(ctx, orgId, quoteId);
  if (!to) throw notFound("Quote");
  const fromId = fromQuoteId ?? to.q.supersedesQuoteId;
  if (!fromId)
    throw conflict("This is the original quote: there is no earlier revision to compare");
  if (fromId === quoteId) throw badRequest("Compare against a different revision");
  const from = await quoteWithLines(ctx, orgId, fromId);
  if (!from) throw notFound("Earlier revision");
  if (from.q.quoteNumber !== to.q.quoteNumber) {
    throw badRequest("Only revisions of the same quote number can be compared");
  }

  // Names as each line was priced (its snapshot), else the shop's own rows (retired ones too).
  const [m, mat, fin] = await Promise.all([
    ctx.db
      .select({ id: machines.id, name: machines.name })
      .from(machines)
      .where(eq(machines.orgId, orgId))
      .all(),
    ctx.db
      .select({ id: materials.id, name: materials.name })
      .from(materials)
      .where(eq(materials.orgId, orgId))
      .all(),
    ctx.db
      .select({ id: finishingOps.id, name: finishingOps.name })
      .from(finishingOps)
      .where(eq(finishingOps.orgId, orgId))
      .all(),
  ]);
  const names: DiffNames = {
    machines: Object.fromEntries(m.map((r) => [r.id, r.name])),
    materials: Object.fromEntries(mat.map((r) => [r.id, r.name])),
    finishingOps: Object.fromEntries(fin.map((r) => [r.id, r.name])),
  };
  for (const l of [...from.lines, ...to.lines]) {
    for (const r of l.snapshot?.machines ?? []) names.machines[r.id] ??= r.name;
    for (const r of l.snapshot?.materials ?? []) names.materials[r.id] ??= r.name;
    for (const r of l.snapshot?.finishingOps ?? []) names.finishingOps[r.id] ??= r.name;
  }

  return { ...diffQuotes(asDiff(from), asDiff(to), names), from: ref(from), to: ref(to) };
}

/** Every revision of this quote's number, oldest first (the compare picker's choices). */
export async function quoteRevisions(
  ctx: AppContext,
  orgId: string,
  quoteId: string,
): Promise<QuoteRevisionsDto> {
  const q = await ctx.db
    .select({ quoteNumber: quotes.quoteNumber })
    .from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)))
    .get();
  if (!q) throw notFound("Quote");
  return ctx.db
    .select({
      id: quotes.id,
      quoteNumber: quotes.quoteNumber,
      revNumber: quotes.revNumber,
      status: quotes.status,
    })
    .from(quotes)
    .where(and(eq(quotes.orgId, orgId), eq(quotes.quoteNumber, q.quoteNumber)))
    .orderBy(asc(quotes.revNumber))
    .all();
}
