// Master list import: a parsed master list (src/shared/documents-import.ts) checked against the
// org's register and written in one D1 batch with one audit entry. A document number already on the
// list is left as it is (a revision there changes by revise and release, never by a spreadsheet), so
// importing the same list twice, or this register's own export, changes nothing. Every other row
// becomes a new document, up to MAX_DOCUMENTS_PER_ORG.
//
// A released row gets its release in the history, dated as the file dates it and attributed to the
// approver the file names (matched to a member by name or email when exactly one matches; otherwise
// the name is kept in the history and the approver is left blank, which the register shows as a gap
// until someone releases the next revision). A last-reviewed date adds a review row; an obsolete row
// adds its withdrawal, dated the import day when the file gives no date, and says so. Recording needs
// the quality plan, as the form does; the preview works on every plan.
import type { DateOrder } from "@shared/controls/poam-import";
import { MAX_DOCUMENTS_PER_ORG, reviewDueFrom } from "@shared/document-control";
import {
  type DocImportIssue,
  type DocImportPlan,
  type DocImportRow,
  docNumberKey,
  personKey,
  planDocumentImport,
} from "@shared/documents-import";
import { eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { controlledDocument, controlledDocumentEvent } from "../../db/schema";
import { conflict } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";
import { assertQualityPlan } from "../billing";
import { listMembers } from "../orgs";

export interface DocImportChange {
  line: number;
  docNumber: string;
  title: string;
  kind: DocImportRow["kind"];
  kindSource: DocImportRow["kindSource"];
  origin: DocImportRow["origin"];
  status: DocImportRow["status"];
  revision: string;
  approvedOn: string | null;
  /** The approver as a member's name, the file's name when no member matched, or empty. */
  approver: string;
  approverMatched: boolean;
  owner: string;
  reviewDue: string | null;
}

export interface DocImportPreview {
  columns: DocImportPlan["columns"];
  dates: DocImportPlan["dates"];
  changes: DocImportChange[];
  /** Rows whose number is already on the list: left as they are. */
  alreadyListed: number;
  issues: DocImportIssue[];
  existing: number;
  max: number;
  applied: boolean;
}

interface Member {
  userId: string;
  name: string;
}

/** The one member a name or email names, or null when none or several do. */
function memberFor(byKey: Map<string, Member[]>, name: string): Member | null {
  if (!name) return null;
  const hits = byKey.get(personKey(name)) ?? [];
  return hits.length === 1 ? (hits[0] as Member) : null;
}

interface Planned {
  row: DocImportRow;
  change: DocImportChange;
  approvedBy: string | null;
  ownerUserId: string | null;
  reviewDue: string | null;
}

async function match(ctx: AppContext, orgId: string, csv: string, dateOrder?: DateOrder) {
  const today = ctx.now().toISOString().slice(0, 10);
  const plan = planDocumentImport(csv, today, dateOrder);
  const [docs, members] = await Promise.all([
    ctx.db
      .select({ docNumber: controlledDocument.docNumber })
      .from(controlledDocument)
      .where(eq(controlledDocument.orgId, orgId))
      .all(),
    listMembers(ctx, orgId),
  ]);
  const listed = new Set(docs.map((d) => docNumberKey(d.docNumber)));
  const byKey = new Map<string, Member[]>();
  for (const m of members) {
    for (const k of new Set([personKey(m.name), personKey(m.email)])) {
      if (!k) continue;
      byKey.set(k, [...(byKey.get(k) ?? []), { userId: m.userId, name: m.name }]);
    }
  }
  const issues = [...plan.issues];
  const planned: Planned[] = [];
  let alreadyListed = 0;
  for (const row of plan.rows) {
    if (listed.has(docNumberKey(row.docNumber))) {
      alreadyListed++;
      continue;
    }
    const note = (m: string) => issues.push({ line: row.line, message: `${row.docNumber}: ${m}` });
    const approver = memberFor(byKey, row.approvedByName);
    if (row.approvedByName && !approver)
      note(
        `"${row.approvedByName}" is not one member of this workspace, so the approver is left blank (the history keeps the name). Invite them first to have it filled.`,
      );
    const owner = memberFor(byKey, row.ownerName);
    if (row.ownerName && !owner)
      note(`"${row.ownerName}" is not one member of this workspace, so the owner is left blank.`);
    let reviewDue: string | null = null;
    if (row.status === "released") {
      const last =
        row.lastReviewedOn && row.approvedOn && row.lastReviewedOn > row.approvedOn
          ? row.lastReviewedOn
          : row.approvedOn;
      reviewDue = row.reviewDue ?? (last ? reviewDueFrom(last, row.reviewMonths) : null);
    }
    planned.push({
      row,
      approvedBy: approver?.userId ?? null,
      ownerUserId: owner?.userId ?? null,
      reviewDue,
      change: {
        line: row.line,
        docNumber: row.docNumber,
        title: row.title,
        kind: row.kind,
        kindSource: row.kindSource,
        origin: row.origin,
        status: row.status,
        revision: row.revision,
        approvedOn: row.approvedOn,
        approver: approver?.name ?? row.approvedByName,
        approverMatched: approver !== null,
        owner: owner?.name ?? "",
        reviewDue,
      },
    });
  }
  if (docs.length + planned.length > MAX_DOCUMENTS_PER_ORG)
    issues.unshift({
      line: null,
      message: `A master list holds at most ${MAX_DOCUMENTS_PER_ORG} documents: ${docs.length} are here and the file adds ${planned.length}. Import fewer rows.`,
    });
  const preview: DocImportPreview = {
    columns: plan.columns,
    dates: plan.dates,
    changes: planned.map((p) => p.change),
    alreadyListed,
    issues,
    existing: docs.length,
    max: MAX_DOCUMENTS_PER_ORG,
    applied: false,
  };
  return { preview, planned, today };
}

export async function previewDocumentImport(
  ctx: AppContext,
  orgId: string,
  csv: string,
  dateOrder?: DateOrder,
): Promise<DocImportPreview> {
  return (await match(ctx, orgId, csv, dateOrder)).preview;
}

const IMPORTED = "Recorded from the imported master list";

export async function applyDocumentImport(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  csv: string,
  dateOrder?: DateOrder,
): Promise<DocImportPreview> {
  await assertQualityPlan(ctx, orgId);
  const { preview, planned, today } = await match(ctx, orgId, csv, dateOrder);
  if (!planned.length) return preview;
  if (preview.existing + planned.length > MAX_DOCUMENTS_PER_ORG)
    throw conflict(`A master list holds at most ${MAX_DOCUMENTS_PER_ORG} documents.`);
  const docs: (typeof controlledDocument.$inferInsert)[] = [];
  const events: (typeof controlledDocumentEvent.$inferInsert)[] = [];
  for (const { row, approvedBy, ownerUserId, reviewDue, change } of planned) {
    const id = newId("doc");
    const inForce = row.status === "draft" ? null : row.revision;
    docs.push({
      id,
      orgId,
      docNumber: row.docNumber,
      title: row.title,
      kind: row.kind,
      origin: row.origin,
      revision: row.revision,
      status: row.status,
      releasedRevision: inForce,
      issuer: row.issuer,
      location: row.location,
      ownerUserId,
      approvedBy: inForce ? approvedBy : null,
      approvedOn: inForce ? row.approvedOn : null,
      effectiveOn: inForce ? (row.effectiveOn ?? row.approvedOn) : null,
      reviewMonths: row.reviewMonths,
      reviewDue: row.status === "released" ? reviewDue : null,
      notes: row.notes,
    });
    if (!inForce) continue;
    const by = { byUserId: approvedBy, byName: change.approver };
    if (row.approvedOn)
      events.push({
        id: newId("dev"),
        orgId,
        documentId: id,
        kind: "released",
        revision: inForce,
        summary: `${IMPORTED}: released before the import.`,
        ...by,
        on: row.approvedOn,
        effectiveOn: row.effectiveOn ?? row.approvedOn,
      });
    if (row.lastReviewedOn && row.status === "released")
      events.push({
        id: newId("dev"),
        orgId,
        documentId: id,
        kind: "reviewed",
        revision: inForce,
        summary: `${IMPORTED}: last reviewed on this date.`,
        byUserId: null,
        byName: "",
        on: row.lastReviewedOn,
      });
    if (row.status === "obsolete")
      events.push({
        id: newId("dev"),
        orgId,
        documentId: id,
        kind: "obsoleted",
        revision: inForce,
        summary: row.withdrawnOn
          ? `${IMPORTED}: withdrawn on this date.`
          : `${IMPORTED}: marked obsolete there with no withdrawal date, so this is the import day.`,
        byUserId: null,
        byName: "",
        on: row.withdrawnOn ?? today,
      });
  }
  // About 22 bound values a document and 12 an event; D1 allows 100 per statement.
  const statements = [];
  for (let i = 0; i < docs.length; i += 4)
    statements.push(ctx.db.insert(controlledDocument).values(docs.slice(i, i + 4)));
  for (let i = 0; i < events.length; i += 8)
    statements.push(ctx.db.insert(controlledDocumentEvent).values(events.slice(i, i + 8)));
  const [first, ...rest] = statements;
  if (first) await ctx.db.batch([first, ...rest]);
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "document.import",
    targetType: "controlled_document",
    targetId: `new:${docs.length}`,
  });
  return { ...preview, applied: true };
}
