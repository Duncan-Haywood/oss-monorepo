// Supplier list import: match a parsed approved-supplier list (src/shared/suppliers-import.ts) against
// the org's supplier register and apply it in one D1 batch with one audit entry. A row is the supplier
// already here with the same name (supplierKey); then only the fields the file fills and that differ
// change, so importing the same list twice changes nothing. Every other row becomes a new supplier, up
// to MAX_SUPPLIERS_PER_ORG.
//
// Each row is checked as the supplier will be after the import, with the same rules as the form
// (validateSupplier): a date that would break them (a CMMC Status Date with no status, an affirmation
// before the status date) is left blank with a note; a row that still fails is left out with the
// reasons. Plan gate as for the form: CUI or a Level 2 or 3 requirement needs the Level 2 plan.
import type { DateOrder } from "@shared/controls/poam-import";
import {
  type InfoFlowed,
  MAX_SUPPLIERS_PER_ORG,
  type SupplierLevel,
  type SupplierStatus,
  validateSupplier,
} from "@shared/suppliers";
import {
  planSupplierImport,
  type SupplierImportField,
  type SupplierImportFields,
  type SupplierImportIssue,
  type SupplierImportPlan,
  supplierKey,
} from "@shared/suppliers-import";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { supplier } from "../../db/schema";
import { conflict } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";
import { assertLevel2Plan } from "../billing";

type Existing = typeof supplier.$inferSelect;

export interface SupplierImportChange {
  line: number;
  name: string;
  kind: "new" | "update";
  /** What the order sends once imported, and where that came from. */
  infoFlowed: InfoFlowed;
  infoSource: "file" | "choice" | "kept";
  requiredLevel: SupplierLevel | null;
  status: SupplierStatus | null;
  /** The fields the file sets (new) or changes (update). */
  fields: SupplierImportField[];
}

export interface SupplierImportPreview {
  columns: SupplierImportPlan["columns"];
  dates: SupplierImportPlan["dates"];
  changes: SupplierImportChange[];
  unchanged: number;
  issues: SupplierImportIssue[];
  /** Rows left out only because they do not say what the order sends and no choice was made. */
  needInfo: number;
  existing: number;
  max: number;
  /** Some change records CUI or a Level 2 or 3 requirement, which needs the Level 2 plan. */
  needsLevel2Plan: boolean;
  applied: boolean;
}

export interface SupplierImportOptions {
  /** What rows with no "information flowed" cell send; null leaves them out. */
  infoDefault: InfoFlowed | null;
  dateOrder?: DateOrder;
}

const FIELD_ORDER: SupplierImportField[] = [
  "supplies",
  "infoFlowed",
  "cots",
  "requiredLevel",
  "status",
  "statusDate",
  "affirmedOn",
  "cmmcUids",
  "clauseFlowedDown",
  "subcontractRef",
  "checkedOn",
  "awardedOn",
  "notes",
];

type Merged = Omit<Existing, "id" | "orgId" | "createdAt" | "updatedAt">;

const blank = (name: string, infoFlowed: InfoFlowed): Merged => ({
  name,
  supplies: "",
  infoFlowed,
  cots: false,
  requiredLevel: null,
  status: null,
  statusDate: null,
  affirmedOn: null,
  cmmcUids: "",
  clauseFlowedDown: false,
  subcontractRef: "",
  checkedOn: null,
  awardedOn: null,
  evidenceRef: "",
  notes: "",
});

interface Planned extends SupplierImportChange {
  set: SupplierImportFields;
  merged: Merged;
  existing?: Existing;
}

async function match(ctx: AppContext, orgId: string, csv: string, opts: SupplierImportOptions) {
  const today = ctx.now().toISOString().slice(0, 10);
  const plan = planSupplierImport(csv, today, opts.dateOrder);
  const items = await ctx.db.select().from(supplier).where(eq(supplier.orgId, orgId)).all();
  const byKey = new Map<string, Existing>();
  for (const it of items) {
    const k = supplierKey(it.name);
    if (!byKey.has(k)) byKey.set(k, it);
  }
  const issues = [...plan.issues];
  const planned: Planned[] = [];
  let unchanged = 0;
  let needInfo = 0;
  for (const row of plan.rows) {
    const existing = byKey.get(supplierKey(row.name));
    const fields: SupplierImportFields = { ...row.fields };
    let infoSource: SupplierImportChange["infoSource"] = row.infoFromFile ? "file" : "kept";
    if (!existing && !row.infoFromFile) {
      if (!opts.infoDefault) {
        needInfo++;
        issues.push({
          line: row.line,
          message: `${row.name}: the row does not say what the order sends (CUI, FCI only or neither), so it is left out. Add an "Information flowed" column, or choose below what rows without one send.`,
        });
        continue;
      }
      fields.infoFlowed = opts.infoDefault;
      infoSource = "choice";
    }
    const base: Merged = existing
      ? { ...existing }
      : blank(row.name, fields.infoFlowed as InfoFlowed);
    const merged: Merged = { ...base, ...fields };
    const note = (m: string) => issues.push({ line: row.line, message: `${row.name}: ${m}` });
    if (merged.statusDate && !merged.status && fields.statusDate) {
      note(
        "a CMMC Status Date with no CMMC status is left blank; add the status and import again.",
      );
      delete fields.statusDate;
      merged.statusDate = base.statusDate;
    }
    if (
      fields.affirmedOn &&
      merged.statusDate &&
      merged.affirmedOn &&
      merged.affirmedOn < merged.statusDate
    ) {
      note(
        `the latest affirmation (${merged.affirmedOn}) is before the CMMC Status Date (${merged.statusDate}); an affirmation follows the assessment, so it is left blank.`,
      );
      delete fields.affirmedOn;
      merged.affirmedOn = base.affirmedOn;
    }
    const errors = validateSupplier(merged, today);
    if (errors.length) {
      note(`${errors.join(" ")} The row is left out.`);
      continue;
    }
    const changed = FIELD_ORDER.filter(
      (f) => fields[f] !== undefined && (!existing || fields[f] !== existing[f]),
    );
    if (existing && !changed.length) {
      unchanged++;
      continue;
    }
    const set: SupplierImportFields = {};
    for (const f of changed) (set as Record<string, unknown>)[f] = fields[f];
    planned.push({
      line: row.line,
      name: row.name,
      kind: existing ? "update" : "new",
      infoFlowed: merged.infoFlowed,
      infoSource,
      requiredLevel: merged.requiredLevel,
      status: merged.status,
      fields: changed,
      set,
      merged,
      existing,
    });
  }
  const created = planned.filter((p) => p.kind === "new").length;
  if (items.length + created > MAX_SUPPLIERS_PER_ORG)
    issues.unshift({
      line: null,
      message: `A list holds at most ${MAX_SUPPLIERS_PER_ORG} suppliers: ${items.length} are here and the file adds ${created}. Import fewer rows.`,
    });
  const needsLevel2Plan = planned.some(
    (p) =>
      p.merged.infoFlowed === "cui" ||
      (p.merged.requiredLevel !== null && p.merged.requiredLevel !== "l1_self"),
  );
  const preview: SupplierImportPreview = {
    columns: plan.columns,
    dates: plan.dates,
    changes: planned.map(({ set: _s, merged: _m, existing: _e, ...c }) => c),
    unchanged,
    issues,
    needInfo,
    existing: items.length,
    max: MAX_SUPPLIERS_PER_ORG,
    needsLevel2Plan,
    applied: false,
  };
  return { preview, planned, created };
}

export async function previewSupplierImport(
  ctx: AppContext,
  orgId: string,
  csv: string,
  opts: SupplierImportOptions,
): Promise<SupplierImportPreview> {
  return (await match(ctx, orgId, csv, opts)).preview;
}

export async function applySupplierImport(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  csv: string,
  opts: SupplierImportOptions,
): Promise<SupplierImportPreview> {
  const { preview, planned, created } = await match(ctx, orgId, csv, opts);
  if (!planned.length) return preview;
  if (preview.existing + created > MAX_SUPPLIERS_PER_ORG)
    throw conflict(`A list holds at most ${MAX_SUPPLIERS_PER_ORG} suppliers.`);
  if (preview.needsLevel2Plan)
    await assertLevel2Plan(ctx, orgId, "Recording suppliers that get CUI or a Level 2 requirement");
  const statements = [];
  const fresh = planned.filter((p) => p.kind === "new");
  // Twenty bound values a row with the timestamps; D1 allows 100 per statement.
  for (let i = 0; i < fresh.length; i += 4) {
    statements.push(
      ctx.db
        .insert(supplier)
        .values(
          fresh.slice(i, i + 4).map(({ merged }) => ({ id: newId("sup"), orgId, ...merged })),
        ),
    );
  }
  for (const p of planned) {
    if (p.kind !== "update" || !p.existing) continue;
    statements.push(
      ctx.db
        .update(supplier)
        .set(p.set)
        .where(and(eq(supplier.orgId, orgId), eq(supplier.id, p.existing.id))),
    );
  }
  const [first, ...rest] = statements;
  if (first) await ctx.db.batch([first, ...rest]);
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "supplier.import",
    targetType: "supplier",
    targetId: `new:${fresh.length},updated:${planned.length - fresh.length}`,
  });
  return { ...preview, applied: true };
}
