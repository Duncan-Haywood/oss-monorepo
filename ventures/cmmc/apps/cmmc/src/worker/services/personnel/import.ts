// Roster and training-completion import: match a parsed sheet (src/shared/personnel-import.ts) against the
// org's People and apply it in one D1 batch with one audit entry. A row is the person already here with
// the same email, or failing that the same name; then only the fields it fills and that differ change
// (a training date only when it is later than the one recorded), so importing the same file twice
// changes nothing. In a roster every other row becomes a new person, up to MAX_PEOPLE_PER_ORG; in a
// completion export it is listed and left out.

import type { Training } from "@shared/personnel";
import { MAX_PEOPLE_PER_ORG, type PersonLike, validatePerson } from "@shared/personnel";
import {
  type DateOrder,
  type PersonImportField,
  type PersonImportIssue,
  type PersonImportPlan,
  type PersonImportRow,
  personEmailKey,
  personNameKey,
  planPersonnelImport,
} from "@shared/personnel-import";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { person } from "../../db/schema";
import { conflict } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";

export interface PersonImportChange {
  line: number;
  name: string;
  kind: "new" | "update";
  /** The fields set (a new person) or changed (an update). */
  fields: PersonImportField[];
}

export interface PersonImportPreview {
  mode: PersonImportPlan["mode"];
  columns: PersonImportPlan["columns"];
  dates: PersonImportPlan["dates"];
  courses: PersonImportPlan["courses"];
  changes: PersonImportChange[];
  unchanged: number;
  issues: PersonImportIssue[];
  /** People already recorded, and the most a roster holds. */
  existing: number;
  max: number;
  applied: boolean;
}

export interface PersonImportInput {
  csv: string;
  dateOrder?: DateOrder;
  courseMap?: Record<string, Training[]>;
}

type Existing = typeof person.$inferSelect;
type Values = Omit<PersonLike, "id"> & {
  jobTitle: string;
  email: string;
  screeningMethod: string;
  notes: string;
};

const TRAINING_DATES = new Set<PersonImportField>([
  "awarenessOn",
  "roleBasedOn",
  "insiderThreatOn",
]);

const blank = (name: string): Values => ({
  name,
  jobTitle: "",
  email: "",
  // The same default as adding a person by hand: most people in a small shop use the systems in scope.
  cuiAccess: true,
  securityDuties: false,
  dutiesDescription: "",
  screenedOn: null,
  screeningMethod: "",
  accessGrantedOn: null,
  awarenessOn: null,
  roleBasedOn: null,
  insiderThreatOn: null,
  leftOn: null,
  departureKind: null,
  accessRemovedOn: null,
  notes: "",
});

const fromRow = (p: Existing): Values => ({
  name: p.name,
  jobTitle: p.jobTitle,
  email: p.email,
  cuiAccess: p.cuiAccess,
  securityDuties: p.securityDuties,
  dutiesDescription: p.dutiesDescription,
  screenedOn: p.screenedOn,
  screeningMethod: p.screeningMethod,
  accessGrantedOn: p.accessGrantedOn,
  awarenessOn: p.awarenessOn,
  roleBasedOn: p.roleBasedOn,
  insiderThreatOn: p.insiderThreatOn,
  leftOn: p.leftOn,
  departureKind: p.departureKind,
  accessRemovedOn: p.accessRemovedOn,
  notes: p.notes,
});

/** The record after the row is applied, and the fields that changed. */
function merge(
  row: PersonImportRow,
  base: Values,
): { values: Values; fields: PersonImportField[] } {
  const values = { ...base };
  const fields: PersonImportField[] = [];
  for (const [k, v] of Object.entries(row.fields) as [PersonImportField, unknown][]) {
    if (v === undefined || v === "") continue;
    const cur = values[k];
    if (TRAINING_DATES.has(k) && typeof cur === "string" && cur >= (v as string)) continue;
    if (
      k === "email" &&
      typeof cur === "string" &&
      personEmailKey(cur) === personEmailKey(v as string)
    )
      continue;
    if (cur === v) continue;
    (values as Record<string, unknown>)[k] = v;
    fields.push(k);
  }
  return { values, fields };
}

async function match(ctx: AppContext, orgId: string, input: PersonImportInput) {
  const today = ctx.now().toISOString().slice(0, 10);
  const plan = planPersonnelImport(input.csv, {
    today,
    dateOrder: input.dateOrder,
    courseMap: input.courseMap,
  });
  const items = await ctx.db.select().from(person).where(eq(person.orgId, orgId)).all();
  const byEmail = new Map<string, Existing>();
  const byName = new Map<string, Existing>();
  for (const it of items) {
    if (it.email && !byEmail.has(personEmailKey(it.email)))
      byEmail.set(personEmailKey(it.email), it);
    const k = personNameKey(it.name);
    if (!byName.has(k)) byName.set(k, it);
  }
  const issues = [...plan.issues];
  const changes: (PersonImportChange & { values: Values; existing?: Existing })[] = [];
  const claimed = new Set<string>();
  let unchanged = 0;
  for (const row of plan.rows) {
    const who = row.name || row.fields.email || "";
    const viaEmail = row.fields.email ? byEmail.get(personEmailKey(row.fields.email)) : undefined;
    // A name match whose recorded email differs is another person with the same name.
    const viaName = row.name ? byName.get(personNameKey(row.name)) : undefined;
    const existing =
      viaEmail ??
      (viaName &&
      (!row.fields.email ||
        !viaName.email ||
        personEmailKey(viaName.email) === personEmailKey(row.fields.email))
        ? viaName
        : undefined);
    if (existing && claimed.has(existing.id)) {
      issues.push({
        line: row.line,
        message: `${who}: matches ${existing.name}, already updated from an earlier line; the row is left out.`,
      });
      continue;
    }
    if (!existing) {
      if (plan.mode === "completions") {
        issues.push({
          line: row.line,
          message: `${who} is not on the People list, so the completion is left out. Add them (or import your roster) first, then import this file again.`,
        });
        continue;
      }
      if (!row.name) {
        issues.push({
          line: row.line,
          message: `${who}: a new person needs a name; the row is left out.`,
        });
        continue;
      }
    }
    const { values, fields } = merge(row, existing ? fromRow(existing) : blank(row.name));
    if (existing && !fields.length) {
      unchanged++;
      if (plan.mode === "roster") claimed.add(existing.id);
      continue;
    }
    const errors = validatePerson(values, today);
    if (errors.length) {
      issues.push({ line: row.line, message: `${who}: ${errors.join(" ")} The row is left out.` });
      continue;
    }
    if (existing) claimed.add(existing.id);
    changes.push({
      line: row.line,
      name: existing?.name ?? row.name,
      kind: existing ? "update" : "new",
      fields,
      values,
      existing,
    });
  }
  const created = changes.filter((c) => c.kind === "new").length;
  if (items.length + created > MAX_PEOPLE_PER_ORG)
    issues.unshift({
      line: null,
      message: `A roster holds at most ${MAX_PEOPLE_PER_ORG} people: ${items.length} are here and the file adds ${created}. Import fewer rows.`,
    });
  const preview: PersonImportPreview = {
    mode: plan.mode,
    columns: plan.columns,
    dates: plan.dates,
    courses: plan.courses,
    changes: changes.map(({ values: _v, existing: _e, ...c }) => c),
    unchanged,
    issues,
    existing: items.length,
    max: MAX_PEOPLE_PER_ORG,
    applied: false,
  };
  return { preview, changes, created };
}

export async function previewPersonnelImport(
  ctx: AppContext,
  orgId: string,
  input: PersonImportInput,
): Promise<PersonImportPreview> {
  return (await match(ctx, orgId, input)).preview;
}

export async function applyPersonnelImport(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  input: PersonImportInput,
): Promise<PersonImportPreview> {
  const { preview, changes, created } = await match(ctx, orgId, input);
  if (!changes.length) return preview;
  if (preview.existing + created > MAX_PEOPLE_PER_ORG)
    throw conflict(`A roster holds at most ${MAX_PEOPLE_PER_ORG} people.`);
  const statements = [];
  const fresh = changes.filter((c) => c.kind === "new");
  // Twenty bound values a row with the timestamps; D1 allows 100 per statement.
  for (let i = 0; i < fresh.length; i += 4) {
    statements.push(
      ctx.db
        .insert(person)
        .values(
          fresh.slice(i, i + 4).map(({ values }) => ({ ...values, id: newId("per"), orgId })),
        ),
    );
  }
  for (const c of changes) {
    if (c.kind !== "update" || !c.existing) continue;
    const set: Partial<typeof person.$inferInsert> = {};
    for (const f of c.fields) (set as Record<string, unknown>)[f] = c.values[f];
    statements.push(
      ctx.db
        .update(person)
        .set(set)
        .where(and(eq(person.orgId, orgId), eq(person.id, c.existing.id))),
    );
  }
  const [first, ...rest] = statements;
  if (first) await ctx.db.batch([first, ...rest]);
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "person.import",
    targetType: "person",
    targetId: `new:${fresh.length},updated:${changes.length - fresh.length}`,
  });
  return { ...preview, applied: true };
}
