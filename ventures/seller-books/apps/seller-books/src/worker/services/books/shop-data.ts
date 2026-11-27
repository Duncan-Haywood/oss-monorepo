// The shop's own data, whole: one JSON download of every record it holds (the Privacy Policy's access
// and export right), and the check that stands before deleting the shop (a paid plan still renewing
// would keep billing a shop that no longer exists). Every query filters by the tenant's orgId.
import { asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  estimateSettings,
  expense,
  filedInventory,
  homeOffice,
  importBatch,
  inventoryItem,
  inventoryLot,
  leftOutMerchant,
  member,
  mileageTrip,
  organization,
  platformCharge,
  sale,
  saleFee,
  subscriptions,
  user,
} from "../../db/schema";

export const EXPORT_FORMAT = "seller-books-export";
export const EXPORT_VERSION = 1;

/** The org-scoped tables, in the order a reader would want them; each row loses its org_id. */
export const TABLE_KEYS = [
  "imports",
  "sales",
  "saleFees",
  "platformCharges",
  "inventoryLots",
  "inventoryItems",
  "mileageTrips",
  "expenses",
  "leftOutMerchants",
  "homeOffice",
  "filedInventory",
  "estimateSettings",
] as const;

type TableKey = (typeof TABLE_KEYS)[number];

export interface ShopExport {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  notes: string[];
  shop: { id: string; name: string; createdAt: string | null };
  members: { name: string; email: string; role: string; joinedAt: string | null }[];
  plan: {
    planKey: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  counts: Record<TableKey, number>;
  records: Record<TableKey, Record<string, unknown>[]>;
}

const iso = (d: Date | null | undefined) => (d instanceof Date ? d.toISOString() : null);

/** Row values as JSON can carry them: Dates as ISO strings, org_id dropped (it is the shop above). */
function plainRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "orgId") continue;
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

export async function exportShop(ctx: AppContext, orgId: string): Promise<ShopExport | null> {
  const org = await ctx.db.select().from(organization).where(eq(organization.id, orgId)).get();
  if (!org) return null;

  const db = ctx.db;
  const rows: Record<TableKey, Record<string, unknown>[]> = {
    imports: await db.select().from(importBatch).where(eq(importBatch.orgId, orgId)).all(),
    sales: await db.select().from(sale).where(eq(sale.orgId, orgId)).all(),
    saleFees: await db.select().from(saleFee).where(eq(saleFee.orgId, orgId)).all(),
    platformCharges: await db
      .select()
      .from(platformCharge)
      .where(eq(platformCharge.orgId, orgId))
      .all(),
    inventoryLots: await db.select().from(inventoryLot).where(eq(inventoryLot.orgId, orgId)).all(),
    inventoryItems: await db
      .select()
      .from(inventoryItem)
      .where(eq(inventoryItem.orgId, orgId))
      .all(),
    mileageTrips: await db.select().from(mileageTrip).where(eq(mileageTrip.orgId, orgId)).all(),
    expenses: await db.select().from(expense).where(eq(expense.orgId, orgId)).all(),
    leftOutMerchants: await db
      .select()
      .from(leftOutMerchant)
      .where(eq(leftOutMerchant.orgId, orgId))
      .all(),
    homeOffice: await db.select().from(homeOffice).where(eq(homeOffice.orgId, orgId)).all(),
    filedInventory: await db
      .select()
      .from(filedInventory)
      .where(eq(filedInventory.orgId, orgId))
      .all(),
    estimateSettings: await db
      .select()
      .from(estimateSettings)
      .where(eq(estimateSettings.orgId, orgId))
      .all(),
  };
  const records = {} as ShopExport["records"];
  const counts = {} as ShopExport["counts"];
  for (const k of TABLE_KEYS) {
    records[k] = rows[k].map(plainRow);
    counts[k] = rows[k].length;
  }

  const people = await ctx.db
    .select({ name: user.name, email: user.email, role: member.role, joinedAt: member.createdAt })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .orderBy(asc(member.createdAt))
    .all();

  const sub = await ctx.db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).get();

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: ctx.now().toISOString(),
    notes: [
      "Money is in integer cents (USD). Calendar dates are YYYY-MM-DD; timestamps are ISO 8601 UTC.",
      "Bank and card statements, and the report files you imported, are not kept, so they are not here: only the records saved from them.",
      "This is your shop's data as stored. It is not a tax return or tax advice.",
    ],
    shop: { id: org.id, name: org.name, createdAt: iso(org.createdAt) },
    members: people.map((p) => ({ ...p, joinedAt: iso(p.joinedAt) })),
    plan: sub
      ? {
          planKey: sub.planKey,
          status: sub.status,
          currentPeriodEnd: iso(sub.currentPeriodEnd),
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        }
      : null,
    counts,
    records,
  };
}

/** Statuses under which the merchant of record can still charge the seller again. */
const RENEWING = new Set(["active", "trialing", "past_due", "paused"]);

/**
 * Why the shop cannot be deleted yet, or null. A paid subscription that will renew must be cancelled
 * first (on the Billing page): deleting the shop would remove the only place to cancel it while the
 * merchant of record kept billing. A staff-granted plan ("comp") and one already set to end are fine.
 */
export function deletionBlocker(
  sub: { status: string; provider: string | null; cancelAtPeriodEnd: boolean } | null,
): string | null {
  if (!sub || !sub.provider) return null;
  if (!RENEWING.has(sub.status) || sub.cancelAtPeriodEnd) return null;
  return "This shop has a paid plan that will renew. Cancel it on the Billing page first, then delete the shop.";
}
