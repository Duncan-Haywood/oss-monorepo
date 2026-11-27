// The company's price list (src/shared/price-list.ts holds the matching). Every query filters by
// orgId. Items are matched by their priceKey, kept unique per company, so the estimate page's "save
// these lines to the price list" and a supplier sheet's import update a price instead of listing it
// twice. Estimate lines copy costs from it; nothing here touches a saved estimate.
import type { MergePriceItemsBody, PriceItemBody, PriceItemUpdateBody } from "@shared/api/schemas";
import type { PriceItemDto, PriceListDto, PriceMergeDto } from "@shared/api/types";
import {
  cleanItem,
  itemProblems,
  MAX_PRICE_LIST_ITEMS,
  type PriceItem,
  type PriceItemInput,
  planMerge,
  priceKey,
} from "@shared/price-list";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { priceListItems } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";

type Row = typeof priceListItems.$inferSelect;

const dto = (r: Row): PriceItemDto => ({
  id: r.id,
  category: r.category,
  code: r.code,
  description: r.description,
  unit: r.unit,
  unitCostMicros: r.unitCostMicros,
  note: r.note,
  updatedAt: r.updatedAt.toISOString(),
});

const asItem = (r: Row): PriceItem => ({
  id: r.id,
  category: r.category,
  code: r.code,
  description: r.description,
  unit: r.unit,
  unitCostMicros: r.unitCostMicros,
  note: r.note,
});

const inputOf = (b: PriceItemBody): PriceItemInput =>
  cleanItem({
    category: b.category,
    code: b.code ?? null,
    description: b.description,
    unit: b.unit ?? null,
    unitCostMicros: b.unitCostMicros,
    note: b.note ?? null,
  });

async function rows(ctx: AppContext, orgId: string) {
  return ctx.db
    .select()
    .from(priceListItems)
    .where(eq(priceListItems.orgId, orgId))
    .orderBy(asc(priceListItems.category), asc(priceListItems.matchKey));
}

export async function listPrices(ctx: AppContext, orgId: string): Promise<PriceListDto> {
  return { items: (await rows(ctx, orgId)).map(dto), limit: MAX_PRICE_LIST_ITEMS };
}

async function getRow(ctx: AppContext, orgId: string, itemId: string) {
  const row = await ctx.db
    .select()
    .from(priceListItems)
    .where(and(eq(priceListItems.id, itemId), eq(priceListItems.orgId, orgId)))
    .get();
  if (!row) throw notFound("Price-list item");
  return row;
}

async function keyTaken(ctx: AppContext, orgId: string, key: string, except?: string) {
  const row = await ctx.db
    .select({ id: priceListItems.id })
    .from(priceListItems)
    .where(and(eq(priceListItems.orgId, orgId), eq(priceListItems.matchKey, key)))
    .get();
  return row !== undefined && row.id !== except;
}

const sameItemMessage =
  "That item is already on the price list (same category, description and unit); change its price there";

export async function addPrice(
  ctx: AppContext,
  orgId: string,
  body: PriceItemBody,
): Promise<PriceItemDto> {
  const item = inputOf(body);
  const problems = itemProblems(item);
  if (problems.length) throw badRequest(problems.join(" "));
  const existing = await rows(ctx, orgId);
  if (existing.length >= MAX_PRICE_LIST_ITEMS)
    throw conflict(`The price list holds ${MAX_PRICE_LIST_ITEMS} items; delete some first`);
  const key = priceKey(item);
  if (existing.some((r) => r.matchKey === key)) throw conflict(sameItemMessage);
  const id = newId("pli");
  await ctx.db.insert(priceListItems).values({ id, orgId, ...item, matchKey: key });
  return dto(await getRow(ctx, orgId, id));
}

export async function updatePrice(
  ctx: AppContext,
  orgId: string,
  itemId: string,
  body: PriceItemUpdateBody,
): Promise<PriceItemDto> {
  const row = await getRow(ctx, orgId, itemId);
  const item = cleanItem({
    category: body.category ?? row.category,
    code: body.code === undefined ? row.code : body.code,
    description: body.description ?? row.description,
    unit: body.unit === undefined ? row.unit : body.unit,
    unitCostMicros: body.unitCostMicros ?? row.unitCostMicros,
    note: body.note === undefined ? row.note : body.note,
  });
  const problems = itemProblems(item);
  if (problems.length) throw badRequest(problems.join(" "));
  const key = priceKey(item);
  if (key !== row.matchKey && (await keyTaken(ctx, orgId, key, itemId)))
    throw conflict(sameItemMessage);
  await ctx.db
    .update(priceListItems)
    .set({ ...item, matchKey: key })
    .where(and(eq(priceListItems.id, itemId), eq(priceListItems.orgId, orgId)));
  return dto(await getRow(ctx, orgId, itemId));
}

export async function deletePrice(ctx: AppContext, orgId: string, itemId: string) {
  await getRow(ctx, orgId, itemId);
  await ctx.db
    .delete(priceListItems)
    .where(and(eq(priceListItems.id, itemId), eq(priceListItems.orgId, orgId)));
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/**
 * Adds the items not on the list and updates the cost (and a code or note given) of those that are,
 * in one batch. Refused whole when the list would pass its limit.
 */
export async function mergePrices(
  ctx: AppContext,
  orgId: string,
  body: MergePriceItemsBody,
): Promise<PriceMergeDto> {
  const incoming = body.items.map(inputOf);
  for (const x of incoming) {
    const problems = itemProblems(x);
    if (problems.length) throw badRequest(problems.join(" "));
  }
  const existing = await rows(ctx, orgId);
  const plan = planMerge(existing.map(asItem), incoming);
  if (existing.length + plan.add.length > MAX_PRICE_LIST_ITEMS)
    throw conflict(
      `The price list holds ${MAX_PRICE_LIST_ITEMS} items; this would add ${plan.add.length} to ${existing.length}`,
    );
  const now = ctx.now();
  const statements = [
    // D1 binds at most 100 parameters a statement; an inserted row binds 11.
    ...chunk(
      plan.add.map((x) => ({
        id: newId("pli"),
        orgId,
        ...x,
        matchKey: priceKey(x),
        createdAt: now,
        updatedAt: now,
      })),
      9,
    ).map((values) => ctx.db.insert(priceListItems).values(values)),
    ...plan.update.map((u) =>
      ctx.db
        .update(priceListItems)
        .set({
          unitCostMicros: u.item.unitCostMicros,
          code: u.item.code,
          note: u.item.note,
          updatedAt: now,
        })
        .where(and(eq(priceListItems.id, u.id), eq(priceListItems.orgId, orgId))),
    ),
  ];
  if (statements.length > 0) {
    // biome-ignore lint/suspicious/noExplicitAny: drizzle's batch tuple type is not exported
    await ctx.db.batch(statements as any);
  }
  return {
    added: plan.add.length,
    updated: plan.update.length,
    unchanged: plan.unchanged,
    conflicts: plan.conflicts,
    list: await listPrices(ctx, orgId),
  };
}
