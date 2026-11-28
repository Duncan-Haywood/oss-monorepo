// Spreadsheet import: diff a parsed sheet (src/shared/controls/csv-import.ts) against the org's control
// records, and apply it in two D1 batches (create missing records, then update), with one audit entry.
// Batches keep the query count per request flat (D1 counts each statement outside a batch).
import {
  controlById,
  type ImplementationStatus,
  type ImportIssue,
  type ImportLevel,
  type ImportPlan,
  planImport,
} from "@shared/controls";
import { and, eq, getTableColumns } from "drizzle-orm";
import type { AppContext } from "../../context";
import { controlRecord } from "../../db/schema";
import { newId } from "../../lib/ids";
import { audit } from "../audit";
import { listMembers } from "../orgs";
import { recordsFor } from "./index";

/** D1's limit on bound values in one statement. */
export const D1_MAX_BOUND = 100;
const GIVEN = new Set(["id", "orgId", "controlId"]);
/**
 * Bound values per inserted row: the three given, plus every column with a default, which Drizzle
 * binds too. Counted from the table so a new defaulted column cannot push a batch past D1's limit
 * (adding met_exception_detail took the row from 7 to 8 and 14 rows to 112 values, a 500).
 */
export const BOUND_PER_ROW =
  GIVEN.size +
  Object.entries(getTableColumns(controlRecord)).filter(([k, c]) => !GIVEN.has(k) && c.hasDefault)
    .length;
/** Rows per insert of new control records. */
export const INSERT_ROWS = Math.floor(D1_MAX_BOUND / BOUND_PER_ROW);

export interface ImportChange {
  line: number;
  controlId: string;
  status?: { from: ImplementationStatus; to: ImplementationStatus };
  owner?: { fromUserId: string | null; toUserId: string; toName: string };
  /** true when the field changes; the text itself is in the file the user holds. */
  notes?: boolean;
  statement?: boolean;
}

export interface ImportPreview {
  level: ImportLevel;
  columns: ImportPlan["columns"];
  changes: ImportChange[];
  /** Rows read whose values already match what is recorded. */
  unchanged: number;
  issues: ImportIssue[];
  applied: boolean;
}

export async function previewImport(
  ctx: AppContext,
  orgId: string,
  csv: string,
  level: ImportLevel,
): Promise<ImportPreview> {
  const plan = planImport(csv, level);
  const issues = [...plan.issues];
  const [records, members] = await Promise.all([
    recordsFor(ctx, orgId),
    plan.rows.some((r) => r.ownerEmail) ? listMembers(ctx, orgId) : Promise.resolve([]),
  ]);
  const byId = new Map(records.map((r) => [r.controlId, r]));
  const byEmail = new Map(members.map((m) => [m.email.toLowerCase(), m]));
  const changes: ImportChange[] = [];
  let unchanged = 0;
  for (const row of plan.rows) {
    if (!controlById(row.controlId)) continue;
    const rec = byId.get(row.controlId);
    const change: ImportChange = { line: row.line, controlId: row.controlId };
    const fromStatus = rec?.status ?? "not_assessed";
    if (row.status && row.status !== fromStatus) {
      change.status = { from: fromStatus, to: row.status };
    }
    if (row.ownerEmail) {
      const m = byEmail.get(row.ownerEmail);
      if (!m) {
        issues.push({
          line: row.line,
          message: `${row.ownerEmail} is not a member of this organization; the owner is left as it is. Add them on the Settings page, then import again.`,
        });
      } else if (m.userId !== (rec?.ownerUserId ?? null)) {
        change.owner = { fromUserId: rec?.ownerUserId ?? null, toUserId: m.userId, toName: m.name };
      }
    }
    if (row.notes !== undefined && row.notes !== (rec?.notes ?? "")) change.notes = true;
    if (row.statement !== undefined && row.statement !== (rec?.statement ?? "")) {
      change.statement = true;
    }
    if (change.status || change.owner || change.notes || change.statement) changes.push(change);
    else unchanged++;
  }
  issues.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return { level, columns: plan.columns, changes, unchanged, issues, applied: false };
}

export async function applyImport(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  csv: string,
  level: ImportLevel,
): Promise<ImportPreview> {
  const preview = await previewImport(ctx, orgId, csv, level);
  if (!preview.changes.length) return preview;
  const rows = new Map(planImport(csv, level).rows.map((r) => [r.controlId, r]));
  const existing = new Set((await recordsFor(ctx, orgId)).map((r) => r.controlId));
  const missing = preview.changes.filter((c) => !existing.has(c.controlId));
  const now = ctx.now();
  const statements = [];
  // BOUND_PER_ROW values a row (the given three plus every defaulted column). A fixed 30 (counting
  // three) and later a fixed 14 (counting seven) each failed full imports with a 500 once the table
  // grew; the count is now taken from the table.
  for (let i = 0; i < missing.length; i += INSERT_ROWS) {
    statements.push(
      ctx.db
        .insert(controlRecord)
        .values(
          missing
            .slice(i, i + INSERT_ROWS)
            .map((c) => ({ id: newId("ctl"), orgId, controlId: c.controlId })),
        )
        .onConflictDoNothing(),
    );
  }
  for (const c of preview.changes) {
    const row = rows.get(c.controlId);
    if (!row) continue;
    const set: Partial<typeof controlRecord.$inferInsert> = {};
    if (c.status) {
      set.status = c.status.to;
      // Partial credit (3.5.3, 3.13.11) is picked by hand; it means nothing off "partially".
      if (c.status.to !== "partially_implemented") set.partialCredit = null;
    }
    if (c.owner) set.ownerUserId = c.owner.toUserId;
    if (c.notes) set.notes = row.notes ?? "";
    if (c.statement) {
      set.statement = row.statement ?? "";
      set.statementUpdatedBy = actorUserId;
      set.statementUpdatedAt = now;
    }
    statements.push(
      ctx.db
        .update(controlRecord)
        .set(set)
        .where(and(eq(controlRecord.orgId, orgId), eq(controlRecord.controlId, c.controlId))),
    );
  }
  const [first, ...rest] = statements;
  if (first) await ctx.db.batch([first, ...rest]);
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "control.import",
    targetType: "control",
    targetId: `level${level}:${preview.changes.length}`,
  });
  return { ...preview, applied: true };
}
