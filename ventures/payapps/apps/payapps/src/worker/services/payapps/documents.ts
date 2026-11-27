// Builds the export model for one pay application (PDF / CSV). Also the hand-off point for the
// sibling packages: a lien waiver (packages/lien-waivers) and an accounting invoice
// (packages/qbo-sync) are both derived from this same ApplicationDocumentData (see ROADMAP.md).
import { buildChangeOrderRequest, type ChangeOrderRequestData } from "@shared/change-order-request";
import { eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { organization } from "../../db/schema";
import { notFound } from "../../lib/errors";
import type { ApplicationDocumentData } from "../export/model";
import { findPayApp, lineQuantities, loadBundle } from "./bundle";
import { changeOrderBackupList } from "./change-order-attachments";

export async function loadApplicationDocument(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
): Promise<ApplicationDocumentData> {
  const [b, org] = await Promise.all([
    loadBundle(ctx, orgId, projectId),
    ctx.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId))
      .get(),
  ]);
  if (!org) throw notFound("Organization");
  const { app, computed } = findPayApp(b, payAppId);
  const p = b.project;
  return {
    contractor: { name: org.name },
    project: {
      name: p.name,
      number: p.number,
      location: p.location,
      gcName: p.gcName,
      gcAddress: p.gcAddress,
      gcBillingName: p.gcBillingName,
      gcBillingEmail: p.gcBillingEmail,
      ownerName: p.ownerName,
      architectName: p.architectName,
      contractDate: p.contractDate,
      notaryBlock: p.notaryBlock,
      sample: p.isSample,
    },
    payApp: {
      number: app.number,
      periodFrom: app.periodFrom,
      periodTo: app.periodTo,
      applicationDate: app.applicationDate,
      status: app.status,
    },
    computed,
    quantities: lineQuantities(b, payAppId),
  };
}

/** The change order request model for one change order of a project (404 when not in it). */
export async function loadChangeOrderRequest(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  changeOrderId: string,
): Promise<ChangeOrderRequestData> {
  const [b, org, files] = await Promise.all([
    loadBundle(ctx, orgId, projectId),
    ctx.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId))
      .get(),
    changeOrderBackupList(ctx, orgId, changeOrderId),
  ]);
  if (!org) throw notFound("Organization");
  if (!b.changeOrders.some((co) => co.id === changeOrderId)) throw notFound("Change order");
  const p = b.project;
  return buildChangeOrderRequest({
    contractor: { name: org.name },
    project: {
      name: p.name,
      number: p.number,
      location: p.location,
      gcName: p.gcName,
      gcAddress: p.gcAddress,
      gcPmName: p.gcPmName,
      gcPmEmail: p.gcPmEmail,
      ownerName: p.ownerName,
      contractDate: p.contractDate,
      originalContractSumCents: p.originalContractSumCents,
      sample: p.isSample,
    },
    sov: b.sov,
    changeOrders: b.changeOrders,
    changeOrderId,
    today: ctx.now().toISOString().slice(0, 10),
    files,
  });
}
