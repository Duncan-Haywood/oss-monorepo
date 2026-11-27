// POA&M import: match a parsed sheet (src/shared/controls/poam-import.ts) against the org's POA&M items
// and apply it in one D1 batch with one audit entry. A row is the same item as one already here when
// its requirement and weakness match (poamKey); then only the fields it fills and that differ change,
// so importing the same sheet twice changes nothing. Every other row becomes a new item.
import { controlById, type ImportLevel, poamEligibility } from "@shared/controls";
import {
  type DateOrder,
  type DateOrderRead,
  type PoamImportIssue,
  type PoamImportPlan,
  type PoamImportRow,
  planPoamImport,
  poamKey,
} from "@shared/controls/poam-import";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { poamItem } from "../../db/schema";
import { newId } from "../../lib/ids";
import { audit } from "../audit";
import { recordsFor, statesFrom } from "../controls";

type Field = "remediation" | "milestones" | "responsible" | "scheduledCompletion" | "status";

export interface PoamImportChange {
  line: number;
  controlId: string;
  /** The weakness, cut to 120 characters, so the preview can name the item. */
  weakness: string;
  kind: "new" | "update";
  /** For an update, the fields that change. */
  fields: Field[];
  scheduledCompletion: string;
  /** Whether 32 CFR 170.21 allows the requirement on a POA&M as it is recorded now. */
  eligible: boolean;
  eligibilityReason: string;
}

export interface PoamImportPreview {
  level: ImportLevel;
  /** How numeric dates were read, so the browser can offer the other order. */
  dates: DateOrderRead;
  columns: PoamImportPlan["columns"];
  changes: PoamImportChange[];
  unchanged: number;
  issues: PoamImportIssue[];
  applied: boolean;
}

type Existing = typeof poamItem.$inferSelect;

function diff(row: PoamImportRow, cur: Existing): Field[] {
  const out: Field[] = [];
  if (row.remediation !== undefined && row.remediation !== cur.remediation) out.push("remediation");
  if (row.milestones !== undefined && row.milestones !== cur.milestones) out.push("milestones");
  if (row.responsible !== undefined && row.responsible !== cur.responsible) out.push("responsible");
  if (row.scheduledCompletion !== cur.scheduledCompletion) out.push("scheduledCompletion");
  if (row.status !== undefined && row.status !== cur.status) out.push("status");
  return out;
}

async function match(
  ctx: AppContext,
  orgId: string,
  csv: string,
  level: ImportLevel,
  dateOrder?: DateOrder,
) {
  const plan = planPoamImport(csv, level, dateOrder);
  const [items, records] = await Promise.all([
    ctx.db.select().from(poamItem).where(eq(poamItem.orgId, orgId)).all(),
    recordsFor(ctx, orgId),
  ]);
  const states = statesFrom(records);
  const byKey = new Map<string, Existing>();
  for (const it of items) {
    const k = poamKey(it.controlId, it.weakness);
    if (!byKey.has(k)) byKey.set(k, it);
  }
  const changes: (PoamImportChange & { row: PoamImportRow; existing?: Existing })[] = [];
  let unchanged = 0;
  for (const row of plan.rows) {
    const def = controlById(row.controlId);
    if (!def) continue;
    const eligibility =
      def.level === 2 && def.nistIds[0]
        ? poamEligibility(def.nistIds[0], states.get(row.controlId))
        : { eligible: false, reason: "Level 1 does not allow POA&Ms (32 CFR 170.21)" };
    const existing = byKey.get(poamKey(row.controlId, row.weakness));
    const fields = existing ? diff(row, existing) : [];
    if (existing && !fields.length) {
      unchanged++;
      continue;
    }
    changes.push({
      line: row.line,
      controlId: row.controlId,
      weakness: row.weakness.length > 120 ? `${row.weakness.slice(0, 119)}…` : row.weakness,
      kind: existing ? "update" : "new",
      fields,
      scheduledCompletion: row.scheduledCompletion,
      eligible: eligibility.eligible,
      eligibilityReason: eligibility.reason,
      row,
      existing,
    });
  }
  return { plan, changes, unchanged };
}

const publicChange = ({
  row: _row,
  existing: _existing,
  ...c
}: PoamImportChange & { row: PoamImportRow; existing?: Existing }): PoamImportChange => c;

export async function previewPoamImport(
  ctx: AppContext,
  orgId: string,
  csv: string,
  level: ImportLevel,
  dateOrder?: DateOrder,
): Promise<PoamImportPreview> {
  const { plan, changes, unchanged } = await match(ctx, orgId, csv, level, dateOrder);
  return {
    level,
    dates: plan.dates,
    columns: plan.columns,
    changes: changes.map(publicChange),
    unchanged,
    issues: plan.issues,
    applied: false,
  };
}

/** True when the sheet would create or change an item for a Level 2 requirement. */
export function touchesLevel2(preview: PoamImportPreview): boolean {
  return preview.changes.some((c) => controlById(c.controlId)?.level === 2);
}

export async function applyPoamImport(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  csv: string,
  level: ImportLevel,
  dateOrder?: DateOrder,
): Promise<PoamImportPreview> {
  const { plan, changes, unchanged } = await match(ctx, orgId, csv, level, dateOrder);
  const preview: PoamImportPreview = {
    level,
    dates: plan.dates,
    columns: plan.columns,
    changes: changes.map(publicChange),
    unchanged,
    issues: plan.issues,
    applied: false,
  };
  if (!changes.length) return preview;
  const now = ctx.now();
  const created = changes.filter((c) => c.kind === "new");
  const statements = [];
  // Twelve bound values a row (with the timestamps); D1 allows 100 per statement.
  for (let i = 0; i < created.length; i += 8) {
    statements.push(
      ctx.db.insert(poamItem).values(
        created.slice(i, i + 8).map(({ row }) => ({
          id: newId("poa"),
          orgId,
          controlId: row.controlId,
          weakness: row.weakness,
          remediation: row.remediation ?? "",
          milestones: row.milestones ?? "",
          responsible: row.responsible ?? "",
          scheduledCompletion: row.scheduledCompletion,
          status: row.status ?? "open",
          closedAt: row.status === "closed" ? now : null,
        })),
      ),
    );
  }
  for (const c of changes) {
    if (c.kind !== "update" || !c.existing) continue;
    const set: Partial<typeof poamItem.$inferInsert> = {};
    for (const f of c.fields) {
      if (f === "status") {
        set.status = c.row.status;
        set.closedAt = c.row.status === "closed" ? now : null;
      } else set[f] = c.row[f] ?? "";
    }
    statements.push(
      ctx.db
        .update(poamItem)
        .set(set)
        .where(and(eq(poamItem.orgId, orgId), eq(poamItem.id, c.existing.id))),
    );
  }
  const [first, ...rest] = statements;
  if (first) await ctx.db.batch([first, ...rest]);
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "poam.import",
    targetType: "poam",
    targetId: `new:${created.length},updated:${changes.length - created.length}`,
  });
  return { ...preview, applied: true };
}
