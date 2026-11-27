// QuickBooks Online: connect a company, send a pay application as an invoice (docs/QUICKBOOKS.md).
// The invoice is planned by src/shared/qbo-invoice.ts from the application's own computed figures,
// so its total is always line 8. Retainage posts to a Retainage Receivable account through a
// Retainage item (packages/qbo-sync, "Retainage pattern").

import {
  type AccountingSync,
  AccountingValidationError,
  DEFAULT_RETAINAGE_ITEM_NAME,
  IntuitOAuthError,
  isSingleEmailAddress,
  parseCallback,
  QBO_EMAIL_MAX,
  QboApiError,
  type TokenSet,
  type TokenStore,
} from "@qbo-sync";
import type {
  PayAppQuickBooksDto,
  QuickBooksAutoSendDto,
  QuickBooksInvoiceLineDto,
  QuickBooksItemsDto,
  QuickBooksLineItemsDto,
  QuickBooksPaymentDto,
  QuickBooksShortCreditDto,
  QuickBooksStatusDto,
  UnsentQuickBooksPaymentsDto,
} from "@shared/api/types";
import { payDueOn } from "@shared/cash-report";
import { type MemberRole, ROLE_RANK } from "@shared/enums";
import { formatCents } from "@shared/money";
import { planQboCredit, QboCreditPlanError, qboCreditDocNumber } from "@shared/qbo-credit";
import { planQboInvoice, QboInvoicePlanError, qboDocNumber } from "@shared/qbo-invoice";
import { and, asc, count, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { AppContext } from "../context";
import {
  member,
  payAppPayments,
  payApps,
  projects,
  qboConnections,
  qboCreditMemoSyncs,
  qboInvoiceSyncs,
  qboOauthStates,
  qboPaymentSyncs,
  sovLines,
} from "../db/schema";
import { AppError, badRequest, conflict, notFound } from "../lib/errors";
import { openJson, sealJson, sha256Hex } from "../lib/token-box";
import type { QboGateway } from "../ports/accounting";
import { assertQuickBooks, orgPlan } from "./billing";
import { findPayApp, getProjectRow, loadBundle, paymentsOf } from "./payapps/bundle";

const TOKEN_PURPOSE = "qbo-tokens-v1";
const STATE_TTL_MS = 10 * 60_000;
/** Names used in the customer's QuickBooks company. Existing ones are reused, never changed. */
export const QBO_NAMES = {
  incomeAccount: "Contract Income",
  contractItem: "Contract Billing",
} as const;

const unavailable = () =>
  new AppError(
    503,
    "quickbooks_unavailable",
    "QuickBooks Online is not available on this server yet.",
  );

function gatewayOrThrow(ctx: AppContext): QboGateway {
  if (!ctx.qbo) throw unavailable();
  return ctx.qbo;
}

async function connectionRow(ctx: AppContext, orgId: string) {
  return ctx.db.select().from(qboConnections).where(eq(qboConnections.orgId, orgId)).get();
}

export async function quickbooksStatus(
  ctx: AppContext,
  orgId: string,
): Promise<QuickBooksStatusDto> {
  const [{ plan }, row] = await Promise.all([orgPlan(ctx, orgId), connectionRow(ctx, orgId)]);
  return {
    available: ctx.qbo !== null,
    mode: ctx.qbo?.mode ?? null,
    planIncludes: plan.quickbooks,
    connection: row
      ? {
          realmId: row.realmId,
          environment: row.environment,
          connectedAt: row.createdAt.toISOString(),
          refreshExpiresAt: row.refreshExpiresAt.toISOString(),
          invoiceItem:
            row.invoiceItemId && row.invoiceItemName
              ? { id: row.invoiceItemId, name: row.invoiceItemName }
              : null,
          autoSendPayments: row.autoSendPayments,
        }
      : null,
  };
}

/** Admin turns automatic payment sending on or off for the connected company. */
export async function setAutoSendPayments(
  ctx: AppContext,
  orgId: string,
  enabled: boolean,
): Promise<QuickBooksStatusDto> {
  gatewayOrThrow(ctx);
  if (enabled) await assertQuickBooks(ctx, orgId);
  const conn = await connectionRow(ctx, orgId);
  if (!conn) throw conflict("Connect QuickBooks first.");
  await ctx.db
    .update(qboConnections)
    .set({ autoSendPayments: enabled, updatedAt: ctx.now() })
    .where(eq(qboConnections.orgId, orgId));
  ctx.logger.info("quickbooks.auto_payments", { orgId, enabled });
  return quickbooksStatus(ctx, orgId);
}

function randomState(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Admin starts the connection: returns Intuit's consent URL with a single-use state. */
export async function startConnect(ctx: AppContext, orgId: string, userId: string) {
  const qbo = gatewayOrThrow(ctx);
  await assertQuickBooks(ctx, orgId);
  const state = randomState();
  const now = ctx.now();
  await ctx.db
    .delete(qboOauthStates)
    .where(and(eq(qboOauthStates.orgId, orgId), lt(qboOauthStates.expiresAt, now)));
  await ctx.db.insert(qboOauthStates).values({
    stateHash: await sha256Hex(state),
    orgId,
    userId,
    expiresAt: new Date(now.getTime() + STATE_TTL_MS),
  });
  return { url: qbo.authorizeUrl(state) };
}

export type CallbackOutcome =
  | { ok: true; orgId: string }
  | { ok: false; orgId: string | null; reason: string };

/**
 * Intuit redirects the admin's browser here. The state must be one this same signed-in user
 * started for an org they still administer, within 10 minutes; it is consumed either way.
 */
export async function finishConnect(
  ctx: AppContext,
  userId: string,
  callbackUrl: string,
): Promise<CallbackOutcome> {
  const qbo = gatewayOrThrow(ctx);
  const state = new URL(callbackUrl).searchParams.get("state") ?? "";
  if (!state) return { ok: false, orgId: null, reason: "missing_state" };
  const hash = await sha256Hex(state);
  const row = await ctx.db
    .delete(qboOauthStates)
    .where(eq(qboOauthStates.stateHash, hash))
    .returning()
    .get();
  if (!row) return { ok: false, orgId: null, reason: "unknown_state" };
  if (row.userId !== userId) return { ok: false, orgId: null, reason: "unknown_state" };
  if (row.expiresAt.getTime() < ctx.now().getTime()) {
    return { ok: false, orgId: row.orgId, reason: "expired" };
  }
  const m = await ctx.db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, row.orgId), eq(member.userId, userId)))
    .get();
  const role = (m && m.role in ROLE_RANK ? m.role : "viewer") as MemberRole;
  if (!m || ROLE_RANK[role] < ROLE_RANK.admin) {
    return { ok: false, orgId: null, reason: "not_admin" };
  }
  const parsed = parseCallback(callbackUrl, state);
  if (!parsed.ok) {
    // "access_denied" when the admin cancels on Intuit's page.
    return { ok: false, orgId: row.orgId, reason: parsed.error.slice(0, 64) };
  }
  let tokens: TokenSet;
  try {
    tokens = await qbo.exchange(parsed.code, parsed.realmId);
  } catch (e) {
    ctx.logger.warn("quickbooks.exchange_failed", { orgId: row.orgId, error: String(e) });
    return { ok: false, orgId: row.orgId, reason: "exchange_failed" };
  }
  const values = {
    realmId: tokens.realmId,
    environment: qbo.mode,
    tokensEnc: await sealJson(qbo.tokenKey, TOKEN_PURPOSE, row.orgId, tokens),
    refreshExpiresAt: new Date(tokens.refreshTokenExpiresAt),
    connectedBy: userId,
  };
  await ctx.db
    .insert(qboConnections)
    .values({ orgId: row.orgId, ...values })
    .onConflictDoUpdate({
      target: qboConnections.orgId,
      set: {
        ...values,
        // Item ids belong to one QuickBooks company: reconnecting the same one keeps the chosen
        // item, connecting a different one goes back to the default. (In an upsert's SET the
        // bare column is the row's old value, excluded.* the new one.)
        invoiceItemId: sql`CASE WHEN ${qboConnections.realmId} = excluded.realm_id THEN ${qboConnections.invoiceItemId} ELSE NULL END`,
        invoiceItemName: sql`CASE WHEN ${qboConnections.realmId} = excluded.realm_id THEN ${qboConnections.invoiceItemName} ELSE NULL END`,
        createdAt: ctx.now(),
        updatedAt: ctx.now(),
      },
    });
  ctx.logger.info("quickbooks.connected", { orgId: row.orgId, mode: qbo.mode });
  return { ok: true, orgId: row.orgId };
}

function tokenStore(ctx: AppContext, qbo: QboGateway, orgId: string): TokenStore {
  return {
    async load() {
      const row = await connectionRow(ctx, orgId);
      if (!row) return null;
      return openJson<TokenSet>(qbo.tokenKey, TOKEN_PURPOSE, orgId, row.tokensEnc);
    },
    async save(tokens) {
      await ctx.db
        .update(qboConnections)
        .set({
          tokensEnc: await sealJson(qbo.tokenKey, TOKEN_PURPOSE, orgId, tokens),
          refreshExpiresAt: new Date(tokens.refreshTokenExpiresAt),
          updatedAt: ctx.now(),
        })
        .where(and(eq(qboConnections.orgId, orgId), eq(qboConnections.realmId, tokens.realmId)));
    },
  };
}

/** Revokes the tokens at Intuit (best effort) and forgets them. Sent-invoice records stay. */
export async function disconnect(ctx: AppContext, orgId: string) {
  const qbo = gatewayOrThrow(ctx);
  const row = await connectionRow(ctx, orgId);
  if (!row) return;
  try {
    const tokens = await tokenStore(ctx, qbo, orgId).load();
    if (tokens) await qbo.revoke(tokens.refreshToken);
  } catch (e) {
    ctx.logger.warn("quickbooks.revoke_failed", { orgId, error: String(e) });
  }
  await ctx.db.delete(qboConnections).where(eq(qboConnections.orgId, orgId));
  ctx.logger.info("quickbooks.disconnected", { orgId });
}

async function connectedBooks(ctx: AppContext, orgId: string) {
  const qbo = gatewayOrThrow(ctx);
  await assertQuickBooks(ctx, orgId);
  const conn = await connectionRow(ctx, orgId);
  if (!conn)
    throw conflict("Connect QuickBooks first (an admin can do it on the QuickBooks page).");
  return { conn, books: qbo.books(tokenStore(ctx, qbo, orgId), conn.realmId) };
}

/** The items an admin can choose to bill work with, read live from the connected company. */
export async function listInvoiceItems(
  ctx: AppContext,
  orgId: string,
): Promise<QuickBooksItemsDto> {
  const { conn, books } = await connectedBooks(ctx, orgId);
  try {
    const items = await books.listSaleItems();
    return {
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        type: i.type,
        incomeAccountName: i.incomeAccountName ?? null,
      })),
      current:
        conn.invoiceItemId && conn.invoiceItemName
          ? { id: conn.invoiceItemId, name: conn.invoiceItemName }
          : null,
      defaultItemName: QBO_NAMES.contractItem,
      defaultAccountName: QBO_NAMES.incomeAccount,
      jobs: await jobItems(ctx, orgId, conn.realmId),
    };
  } catch (e) {
    rethrowQbo(e, "the item list");
  }
}

/** The job's own item, when it was chosen in the connected company (else null: the company's). */
function jobItemOf(
  project: { qboItemId: string | null; qboItemName: string | null; qboItemRealmId: string | null },
  realmId: string,
): { id: string; name: string } | null {
  return project.qboItemId && project.qboItemRealmId === realmId
    ? { id: project.qboItemId, name: project.qboItemName ?? project.qboItemId }
    : null;
}

async function jobItems(ctx: AppContext, orgId: string, realmId: string) {
  const rows = await ctx.db
    .select({
      id: projects.id,
      name: projects.name,
      number: projects.number,
      status: projects.status,
      qboItemId: projects.qboItemId,
      qboItemName: projects.qboItemName,
      qboItemRealmId: projects.qboItemRealmId,
    })
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.isSample, false)))
    .orderBy(asc(projects.name));
  const counts = await ctx.db
    .select({ projectId: sovLines.projectId, n: count() })
    .from(sovLines)
    .where(
      and(
        eq(sovLines.orgId, orgId),
        isNotNull(sovLines.qboItemId),
        eq(sovLines.qboItemRealmId, realmId),
      ),
    )
    .groupBy(sovLines.projectId);
  const own = new Map(counts.map((c) => [c.projectId, c.n]));
  return rows
    .map((r) => ({
      projectId: r.id,
      name: r.name,
      number: r.number,
      status: r.status,
      item: jobItemOf(r, realmId),
      linesWithOwnItem: own.get(r.id) ?? 0,
    }))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1));
}

/**
 * Checks an item can carry work lines: an active Service or NonInventory item posting to an
 * income account, and not the retainage item, which would book the work to Retainage Receivable.
 * Returns its name.
 */
async function checkSaleItem(books: AccountingSync, itemId: string): Promise<string> {
  try {
    const item = await books.getItem(itemId);
    if (!item) throw badRequest("That item is not in QuickBooks, or it was made inactive.");
    if (item.type !== "Service" && item.type !== "NonInventory") {
      throw badRequest(
        `"${item.name}" is a ${item.type} item; choose a Service or Non-inventory item.`,
      );
    }
    if (!item.incomeAccountId) {
      throw badRequest(`"${item.name}" does not post to an income account in QuickBooks.`);
    }
    const retainage = await books.findItemByName(DEFAULT_RETAINAGE_ITEM_NAME);
    if (retainage && retainage.id === item.id) {
      throw badRequest(
        `"${item.name}" is the retainage item; work billed with it would land in Retainage Receivable.`,
      );
    }
    return item.name;
  } catch (e) {
    rethrowQbo(e, "the item");
  }
}

/**
 * Chooses the company's own item for work lines (null: back to the default). The item must be an
 * active Service or NonInventory item posting to an income account, and not the retainage item,
 * which would book the work to Retainage Receivable.
 */
export async function setInvoiceItem(
  ctx: AppContext,
  orgId: string,
  itemId: string | null,
): Promise<QuickBooksItemsDto> {
  const { books } = await connectedBooks(ctx, orgId);
  const name = itemId === null ? null : await checkSaleItem(books, itemId);
  await ctx.db
    .update(qboConnections)
    .set({ invoiceItemId: itemId, invoiceItemName: name, updatedAt: ctx.now() })
    .where(eq(qboConnections.orgId, orgId));
  ctx.logger.info("quickbooks.invoice_item_set", { orgId, custom: itemId !== null });
  return listInvoiceItems(ctx, orgId);
}

/**
 * Chooses the item one job's work lines are billed with, when it differs from the company's (a
 * contractor billing service work and new construction to different income accounts); null goes
 * back to the company's item. Checked like the company's item, and tied to the connected company.
 */
export async function setJobInvoiceItem(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  itemId: string | null,
): Promise<QuickBooksItemsDto> {
  const project = await getProjectRow(ctx, orgId, projectId);
  if (project.isSample) throw conflict("The sample job is never sent to QuickBooks.");
  const { conn, books } = await connectedBooks(ctx, orgId);
  const name = itemId === null ? null : await checkSaleItem(books, itemId);
  await ctx.db
    .update(projects)
    .set({
      qboItemId: itemId,
      qboItemName: name,
      qboItemRealmId: itemId === null ? null : conn.realmId,
      updatedAt: ctx.now(),
    })
    .where(and(eq(projects.orgId, orgId), eq(projects.id, projectId)));
  ctx.logger.info("quickbooks.job_item_set", { orgId, projectId, custom: itemId !== null });
  return listInvoiceItems(ctx, orgId);
}

async function nonSampleProject(ctx: AppContext, orgId: string, projectId: string) {
  const project = await getProjectRow(ctx, orgId, projectId);
  if (project.isSample) throw conflict("The sample job is never sent to QuickBooks.");
  return project;
}

/**
 * One job's schedule-of-values lines and the item each is billed with when it has its own (a
 * contractor who books equipment, labor and a design fee on one job to different income accounts).
 */
export async function listLineItems(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<QuickBooksLineItemsDto> {
  const project = await nonSampleProject(ctx, orgId, projectId);
  const { conn, books } = await connectedBooks(ctx, orgId);
  let items: Awaited<ReturnType<AccountingSync["listSaleItems"]>>;
  try {
    items = await books.listSaleItems();
  } catch (e) {
    rethrowQbo(e, "the item list");
  }
  const lines = await ctx.db
    .select()
    .from(sovLines)
    .where(and(eq(sovLines.orgId, orgId), eq(sovLines.projectId, projectId)))
    .orderBy(asc(sovLines.sortOrder));
  return {
    projectId: project.id,
    name: project.name,
    number: project.number,
    fallbackItemName:
      jobItemOf(project, conn.realmId)?.name ?? conn.invoiceItemName ?? QBO_NAMES.contractItem,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      type: i.type,
      incomeAccountName: i.incomeAccountName ?? null,
    })),
    lines: lines.map((l) => ({
      sovLineId: l.id,
      itemNumber: l.itemNumber,
      description: l.description,
      item: jobItemOf(l, conn.realmId),
    })),
  };
}

/**
 * Chooses the item one schedule-of-values line's work is billed with, when it differs from the
 * job's and the company's; null goes back to theirs. Checked like the company's item, and tied to
 * the connected company.
 */
export async function setLineInvoiceItem(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  sovLineId: string,
  itemId: string | null,
): Promise<QuickBooksLineItemsDto> {
  await nonSampleProject(ctx, orgId, projectId);
  const line = await ctx.db
    .select({ id: sovLines.id })
    .from(sovLines)
    .where(
      and(eq(sovLines.orgId, orgId), eq(sovLines.projectId, projectId), eq(sovLines.id, sovLineId)),
    )
    .get();
  if (!line) throw notFound("Schedule-of-values line");
  const { conn, books } = await connectedBooks(ctx, orgId);
  const name = itemId === null ? null : await checkSaleItem(books, itemId);
  await ctx.db
    .update(sovLines)
    .set({
      qboItemId: itemId,
      qboItemName: name,
      qboItemRealmId: itemId === null ? null : conn.realmId,
      updatedAt: ctx.now(),
    })
    .where(and(eq(sovLines.orgId, orgId), eq(sovLines.id, sovLineId)));
  ctx.logger.info("quickbooks.line_item_set", {
    orgId,
    projectId,
    sovLineId,
    custom: itemId !== null,
  });
  return listLineItems(ctx, orgId, projectId);
}

async function syncRow(ctx: AppContext, orgId: string, payAppId: string) {
  return ctx.db
    .select()
    .from(qboInvoiceSyncs)
    .where(and(eq(qboInvoiceSyncs.orgId, orgId), eq(qboInvoiceSyncs.payAppId, payAppId)))
    .get();
}

/**
 * The invoice's billing email: the job's GC billing contact, so "Send" from QuickBooks reaches
 * accounts payable for this job (set per invoice, never on the QuickBooks customer, which other
 * jobs for the same GC share). An address QuickBooks would refuse is left off with a note rather
 * than failing the whole send.
 */
export function invoiceBillEmail(gcBillingEmail: string | null): {
  billEmail: string | null;
  billEmailNote: string | null;
} {
  const email = gcBillingEmail?.trim() || null;
  if (!email) {
    return {
      billEmail: null,
      billEmailNote:
        "No billing email on the invoice: add the GC billing contact on the job page and QuickBooks can email the invoice to them.",
    };
  }
  if (!isSingleEmailAddress(email)) {
    return {
      billEmail: null,
      billEmailNote: `The GC billing contact's email is longer than QuickBooks takes (${QBO_EMAIL_MAX} characters) or not one plain address, so the invoice goes without a billing email.`,
    };
  }
  return { billEmail: email, billEmailNote: null };
}

async function planFor(ctx: AppContext, orgId: string, projectId: string, payAppId: string) {
  const b = await loadBundle(ctx, orgId, projectId);
  const { app, computed } = findPayApp(b, payAppId);
  const index = b.payApps.findIndex((a) => a.id === app.id);
  const previous = index > 0 ? (b.computed[index - 1] ?? null) : null;
  return {
    project: b.project,
    sov: b.sov,
    app,
    computed,
    previous,
    payments: paymentsOf(b, app.id),
  };
}

async function paymentSyncRows(ctx: AppContext, orgId: string, payAppId: string) {
  return ctx.db
    .select()
    .from(qboPaymentSyncs)
    .where(and(eq(qboPaymentSyncs.orgId, orgId), eq(qboPaymentSyncs.payAppId, payAppId)))
    .all();
}

export async function payAppQuickBooks(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
): Promise<PayAppQuickBooksDto> {
  const [status, p, sent, paymentSyncs, credit] = await Promise.all([
    quickbooksStatus(ctx, orgId),
    planFor(ctx, orgId, projectId, payAppId),
    syncRow(ctx, orgId, payAppId),
    paymentSyncRows(ctx, orgId, payAppId),
    creditRow(ctx, orgId, payAppId),
  ]);
  const synced = new Map(paymentSyncs.map((r) => [r.paymentId, r]));
  const payments = p.payments.map((pm): QuickBooksPaymentDto => {
    const r = synced.get(pm.id);
    return {
      paymentId: pm.id,
      amountCents: pm.amountCents,
      receivedOn: pm.receivedOn,
      reference: pm.reference,
      sent: r
        ? {
            qboPaymentId: r.qboPaymentId,
            byHand: r.qboPaymentId === null,
            sentAt: r.createdAt.toISOString(),
          }
        : null,
    };
  });
  let preview: PayAppQuickBooksDto["preview"] = null;
  let previewProblem: string | null = null;
  if (p.app.status === "draft") {
    previewProblem = "Submit the application first: only a sent application becomes an invoice.";
  } else {
    try {
      const plan = planQboInvoice(p.computed, p.previous);
      const realmId = status.connection?.realmId ?? null;
      const workItemName =
        (realmId ? jobItemOf(p.project, realmId)?.name : null) ??
        status.connection?.invoiceItem?.name ??
        QBO_NAMES.contractItem;
      const own = new Map(
        realmId
          ? p.sov.flatMap((l) => {
              const item = jobItemOf(l, realmId);
              return item ? [[l.id, item.name] as const] : [];
            })
          : [],
      );
      preview = {
        docNumber: qboDocNumber(p.project, p.app.number),
        customerName: p.project.gcName,
        workItemName,
        lines: plan.lines.map(
          (l): QuickBooksInvoiceLineDto => ({
            kind: l.kind,
            sovLineId: l.sovLineId,
            description: l.description,
            amountCents: l.amountCents,
            itemName:
              l.kind === "work" ? ((l.sovLineId && own.get(l.sovLineId)) ?? workItemName) : null,
          }),
        ),
        totalCents: plan.totalCents,
        ...invoiceBillEmail(p.project.gcBillingEmail),
      };
    } catch (e) {
      if (!(e instanceof QboInvoicePlanError)) throw e;
      previewProblem = e.message;
    }
  }
  return {
    status,
    sent: sent
      ? {
          invoiceId: sent.invoiceId,
          docNumber: sent.docNumber,
          totalCents: sent.totalCents,
          lineCount: sent.lineCount,
          sentAt: sent.createdAt.toISOString(),
          realmId: sent.realmId,
        }
      : null,
    preview,
    previewProblem,
    payments,
    shortCredit: shortCreditDto(p.app, payments, credit),
  };
}

async function creditRow(ctx: AppContext, orgId: string, payAppId: string) {
  return ctx.db
    .select()
    .from(qboCreditMemoSyncs)
    .where(and(eq(qboCreditMemoSyncs.orgId, orgId), eq(qboCreditMemoSyncs.payAppId, payAppId)))
    .get();
}

type CreditRow = NonNullable<Awaited<ReturnType<typeof creditRow>>>;

function shortCreditDto(
  app: Awaited<ReturnType<typeof planFor>>["app"],
  payments: QuickBooksPaymentDto[],
  row: CreditRow | undefined,
): QuickBooksShortCreditDto | null {
  if (!app.shortClosedCents || !app.shortReason || !app.shortClosedOn) return null;
  const unsent = payments.filter((pm) => !pm.sent).length;
  return {
    cents: app.shortClosedCents,
    reason: app.shortReason,
    closedOn: app.shortClosedOn,
    sent: row
      ? {
          creditMemoId: row.creditMemoId,
          docNumber: row.docNumber,
          byHand: row.creditMemoId === null,
          applied: row.applied,
          sentAt: row.createdAt.toISOString(),
        }
      : null,
    waitingFor:
      unsent > 0
        ? `Send or mark the ${unsent === 1 ? "payment" : `${unsent} payments`} above first, so the invoice's open balance in QuickBooks is only what was closed short.`
        : null,
  };
}

function rethrowQbo(e: unknown, what = "the invoice"): never {
  if (e instanceof AppError) throw e;
  if (e instanceof QboInvoicePlanError || e instanceof AccountingValidationError) {
    throw badRequest(e.message);
  }
  if (e instanceof QboCreditPlanError) {
    throw new AppError(409, "quickbooks_balance_mismatch", e.message);
  }
  if (e instanceof IntuitOAuthError) {
    throw new AppError(
      409,
      "quickbooks_reconnect",
      "QuickBooks needs to be reconnected (the connection expired or was revoked). An admin can reconnect it on the QuickBooks page.",
    );
  }
  if (e instanceof QboApiError) {
    const detail = e.errors[0]?.Detail ?? e.errors[0]?.Message ?? e.message;
    throw new AppError(
      e.retryable ? 503 : 502,
      "quickbooks_error",
      `QuickBooks refused ${what}: ${detail}${e.intuitTid ? ` (Intuit reference ${e.intuitTid})` : ""}`,
    );
  }
  throw e;
}

/** Creates the invoice for a sent application, once. A retry finds the invoice by its number. */
/** The sample job's invented numbers must never land in a company's real books. */
async function assertNotSample(ctx: AppContext, orgId: string, projectId: string) {
  const project = await getProjectRow(ctx, orgId, projectId);
  if (project.isSample) throw conflict("The sample job is never sent to QuickBooks.");
}

export async function sendPayApp(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  userId: string,
): Promise<PayAppQuickBooksDto> {
  await assertNotSample(ctx, orgId, projectId);
  const qbo = gatewayOrThrow(ctx);
  await assertQuickBooks(ctx, orgId);
  const conn = await connectionRow(ctx, orgId);
  if (!conn)
    throw conflict("Connect QuickBooks first (an admin can do it on the QuickBooks page).");
  const existing = await syncRow(ctx, orgId, payAppId);
  if (existing) {
    throw conflict(`Already in QuickBooks as invoice ${existing.docNumber}.`);
  }
  const p = await planFor(ctx, orgId, projectId, payAppId);
  if (p.app.status === "draft") {
    throw badRequest("Submit the application first: only a sent application becomes an invoice.");
  }
  const docNumber = qboDocNumber(p.project, p.app.number);
  try {
    const plan = planQboInvoice(p.computed, p.previous);
    const books: AccountingSync = qbo.books(tokenStore(ctx, qbo, orgId), conn.realmId);
    let invoice = await books.findInvoiceByDocNumber(docNumber);
    if (invoice && invoice.totalCents !== plan.totalCents) {
      throw conflict(
        `QuickBooks already has an invoice numbered ${docNumber} for a different amount. Rename or delete it in QuickBooks, then send again.`,
      );
    }
    if (!invoice) {
      const retainage = await books.ensureRetainageSetup();
      const own = await lineItems(books, conn.realmId, p.project, p.sov, plan.lines);
      // The job's or company's item, only when some work line has no item of its own.
      const needsContract = plan.lines.some(
        (l) => l.kind === "work" && !(l.sovLineId && own.has(l.sovLineId)),
      );
      const contract = needsContract ? await workItem(books, conn, p.project) : null;
      const workItemId = (sovLineId: string | null) => {
        const id = (sovLineId ? own.get(sovLineId) : undefined) ?? contract?.id;
        if (!id) throw new Error("A work line has no QuickBooks item (needsContract is wrong).");
        return id;
      };
      const customer = await books.upsertCustomer({
        displayName: p.project.gcName,
        companyName: p.project.gcName,
      });
      const txnDate = p.app.applicationDate;
      // Same due date as the cash report: the job's pay terms from the application date or the
      // period end, the owner's payment or a pay-when-paid outer limit (payDueOn in
      // src/shared/cash-report.ts).
      const dueDate = payDueOn(
        p.project.payTermsDays,
        p.project.payTermsBasis,
        p.app,
        p.project.payTermsOuterDays,
      );
      const period = `${p.app.periodFrom} to ${p.app.periodTo}`;
      const { billEmail } = invoiceBillEmail(p.project.gcBillingEmail);
      invoice = await books.createInvoice({
        customerId: customer.id,
        docNumber,
        txnDate,
        ...(dueDate !== null ? { dueDate } : {}),
        ...(billEmail !== null ? { billEmail } : {}),
        privateNote: `Pay application #${p.app.number}, ${p.project.name}, period ${period}. Sent from PayApps.`,
        lines: plan.lines.map((l) => ({
          itemId: l.kind === "work" ? workItemId(l.sovLineId) : retainage.item.id,
          amountCents: l.amountCents,
          description: l.description,
        })),
      });
    }
    await ctx.db
      .insert(qboInvoiceSyncs)
      .values({
        payAppId,
        orgId,
        projectId,
        realmId: conn.realmId,
        invoiceId: invoice.id,
        docNumber,
        totalCents: invoice.totalCents,
        lineCount: invoice.lines.length,
        syncedBy: userId,
      })
      .onConflictDoNothing();
    ctx.logger.info("quickbooks.invoice_sent", { orgId, payAppId, invoiceId: invoice.id });
  } catch (e) {
    rethrowQbo(e);
  }
  return payAppQuickBooks(ctx, orgId, projectId, payAppId);
}

/**
 * The item work lines are billed with: the job's own when one was chosen in this company, else the
 * company's chosen one, each checked to still be active (an item deleted or made inactive in
 * QuickBooks stops the send rather than falling back silently, which would post the income
 * somewhere the bookkeeper did not choose), else the default.
 */
async function workItem(
  books: AccountingSync,
  conn: { realmId: string; invoiceItemId: string | null; invoiceItemName: string | null },
  project: {
    name: string;
    qboItemId: string | null;
    qboItemName: string | null;
    qboItemRealmId: string | null;
  },
) {
  const own = jobItemOf(project, conn.realmId);
  if (own) {
    const item = await books.getItem(own.id);
    if (!item) {
      throw conflict(
        `The QuickBooks item chosen for the job ${project.name} ("${own.name}") is no longer active in QuickBooks. An admin can choose another on the QuickBooks page; nothing was sent.`,
      );
    }
    return item;
  }
  if (conn.invoiceItemId) {
    const item = await books.getItem(conn.invoiceItemId);
    if (!item) {
      throw conflict(
        `The QuickBooks item chosen for invoices ("${conn.invoiceItemName ?? conn.invoiceItemId}") is no longer active in QuickBooks. An admin can choose another on the QuickBooks page; nothing was sent.`,
      );
    }
    return item;
  }
  const income = await books.ensureAccount({
    name: QBO_NAMES.incomeAccount,
    accountType: "Income",
  });
  return books.ensureItem({
    name: QBO_NAMES.contractItem,
    type: "Service",
    incomeAccountId: income.id,
    description: "Progress billing on a subcontract (pay application)",
  });
}

/**
 * The items of the lines this invoice bills that have their own (sovLineId to item id), each read
 * again and checked to be active: an item made inactive stops the send with the line named, rather
 * than posting that line's income to the job's or company's item.
 */
async function lineItems(
  books: AccountingSync,
  realmId: string,
  project: { name: string },
  sov: {
    id: string;
    itemNumber: string;
    description: string;
    qboItemId: string | null;
    qboItemName: string | null;
    qboItemRealmId: string | null;
  }[],
  planLines: { kind: string; sovLineId: string | null }[],
): Promise<Map<string, string>> {
  const billed = new Set(planLines.filter((l) => l.kind === "work").map((l) => l.sovLineId));
  const out = new Map<string, string>();
  const active = new Map<string, boolean>();
  for (const l of sov) {
    if (!billed.has(l.id)) continue;
    const item = jobItemOf(l, realmId);
    if (!item) continue;
    if (!active.has(item.id)) active.set(item.id, (await books.getItem(item.id)) !== null);
    if (!active.get(item.id)) {
      const label = [l.itemNumber, l.description].filter(Boolean).join(" ");
      throw conflict(
        `The QuickBooks item chosen for line ${label} on the job ${project.name} ("${item.name}") is no longer active in QuickBooks. An admin can choose another on the QuickBooks page; nothing was sent.`,
      );
    }
    out.set(l.id, item.id);
  }
  return out;
}

/** QuickBooks' PaymentRefNum holds at most 21 characters (packages/qbo-sync README, to verify). */
const QBO_REF_MAX = 21;

/**
 * The idempotency key for one payment: stable across retries, 32 hex characters like the ids
 * Intuit's own SDK sends, and not guessable from the payment id alone.
 */
async function paymentRequestId(orgId: string, paymentId: string) {
  return (await sha256Hex(`payapps-qbo-payment:${orgId}:${paymentId}`)).slice(0, 32);
}

export interface SendPaymentOptions {
  /** The payment was already entered in QuickBooks by hand: record that, send nothing. */
  alreadyInQuickBooks?: boolean;
}

/**
 * Records one payment received as a QuickBooks payment applied to the application's invoice.
 *
 * Before sending, the invoice's open balance in QuickBooks must equal what PayApps expects (the
 * invoice total less the payments already sent). Anything else means someone changed the invoice
 * or entered a payment in QuickBooks directly, and sending could count the money twice, so the
 * send is refused with both figures; the editor checks QuickBooks and, if the payment is there,
 * marks it "already in QuickBooks". The requestid key guards the remaining race (two sends at
 * once, or a lost response) on QuickBooks' side.
 */
export async function sendPayment(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  paymentId: string | undefined,
  userId: string,
  opts: SendPaymentOptions = {},
): Promise<PayAppQuickBooksDto> {
  await assertNotSample(ctx, orgId, projectId);
  const qbo = gatewayOrThrow(ctx);
  await assertQuickBooks(ctx, orgId);
  const p = await planFor(ctx, orgId, projectId, payAppId);
  const payment = p.payments.find((pm) => pm.id === paymentId);
  if (!payment) throw notFound("Payment");
  const conn = await connectionRow(ctx, orgId);
  if (!conn)
    throw conflict("Connect QuickBooks first (an admin can do it on the QuickBooks page).");
  const invoiceRow = await syncRow(ctx, orgId, p.app.id);
  if (!invoiceRow) {
    throw conflict(
      "Send the application to QuickBooks first: a payment is applied to its invoice.",
    );
  }
  if (invoiceRow.realmId !== conn.realmId) {
    throw conflict(
      `Invoice ${invoiceRow.docNumber} is in a different QuickBooks company from the one connected now. Enter this payment in that company by hand.`,
    );
  }
  const already = await paymentSyncRows(ctx, orgId, p.app.id);
  if (already.some((r) => r.paymentId === payment.id)) {
    throw conflict("This payment is already in QuickBooks.");
  }
  const row = {
    paymentId: payment.id,
    orgId,
    payAppId: p.app.id,
    realmId: conn.realmId,
    invoiceId: invoiceRow.invoiceId,
    amountCents: payment.amountCents,
    syncedBy: userId,
  };
  if (opts.alreadyInQuickBooks) {
    await ctx.db
      .insert(qboPaymentSyncs)
      .values({ ...row, qboPaymentId: null })
      .onConflictDoNothing();
    ctx.logger.info("quickbooks.payment_marked", { orgId, payAppId, paymentId: payment.id });
    return payAppQuickBooks(ctx, orgId, projectId, payAppId);
  }
  try {
    const books: AccountingSync = qbo.books(tokenStore(ctx, qbo, orgId), conn.realmId);
    const invoice = await books.getInvoice(invoiceRow.invoiceId);
    if (!invoice) {
      throw conflict(
        `Invoice ${invoiceRow.docNumber} is no longer in QuickBooks. Enter this payment there by hand, then mark it as already in QuickBooks.`,
      );
    }
    const credit = await creditRow(ctx, orgId, p.app.id);
    const sentCents =
      already.reduce((s, r) => s + r.amountCents, 0) + (credit?.applied ? credit.amountCents : 0);
    const expectedOpen = invoice.totalCents - sentCents;
    if (invoice.balanceCents !== expectedOpen) {
      throw new AppError(
        409,
        "quickbooks_balance_mismatch",
        `QuickBooks shows ${formatCents(invoice.balanceCents)} open on invoice ${invoiceRow.docNumber}; PayApps expected ${formatCents(expectedOpen)}. A payment may already be entered there, or the invoice was changed. Check the invoice in QuickBooks: if this payment is there, mark it as already in QuickBooks; nothing was sent.`,
      );
    }
    if (payment.amountCents > invoice.balanceCents) {
      throw conflict(
        `This payment (${formatCents(payment.amountCents)}) is more than the ${formatCents(invoice.balanceCents)} open on invoice ${invoiceRow.docNumber} in QuickBooks. Enter it there by hand (the extra is a credit on the customer), then mark it as already in QuickBooks.`,
      );
    }
    const ref = payment.reference?.trim().slice(0, QBO_REF_MAX);
    const created = await books.recordPayment({
      customerId: invoice.customerId,
      totalCents: payment.amountCents,
      txnDate: payment.receivedOn,
      ...(ref ? { paymentRefNum: ref } : {}),
      applyTo: [{ invoiceId: invoice.id, amountCents: payment.amountCents }],
      requestId: await paymentRequestId(orgId, payment.id),
    });
    await ctx.db
      .insert(qboPaymentSyncs)
      .values({ ...row, qboPaymentId: created.id })
      .onConflictDoNothing();
    ctx.logger.info("quickbooks.payment_sent", {
      orgId,
      payAppId,
      paymentId: payment.id,
      qboPaymentId: created.id,
    });
  } catch (e) {
    rethrowQbo(e, "the payment");
  }
  return payAppQuickBooks(ctx, orgId, projectId, payAppId);
}

/** Idempotency keys for the credit memo and for applying it, stable across retries. */
async function creditRequestIds(orgId: string, payAppId: string) {
  const memo = (await sha256Hex(`payapps-qbo-credit:${orgId}:${payAppId}`)).slice(0, 32);
  const apply = (await sha256Hex(`payapps-qbo-credit-apply:${orgId}:${payAppId}`)).slice(0, 32);
  return { memo, apply };
}

/**
 * Sends the balance closed short on an application (a backcharge, a dispute, a write-off) to
 * QuickBooks as a credit memo to the GC, applied to the application's invoice, so the invoice there
 * stops showing it as open. Every payment on the application must be in QuickBooks first, and the
 * invoice's open balance must be exactly what PayApps can account for (`planQboCredit`); otherwise
 * nothing is sent. The credit memo posts to the same item the invoice's work lines use, so the
 * income billed is reduced where it was booked.
 *
 * QuickBooks may apply a new credit memo itself ("Automatically apply credits"). PayApps reads the
 * invoice back: if the credit landed there, done; if it is still unapplied, PayApps applies it with
 * a zero payment linking both; if QuickBooks applied it to another invoice, the row records
 * `applied: false` and the panel tells the editor to move it in QuickBooks. A retry finds the credit
 * memo by its number (CR + the invoice number's tail) and records it, never a second one.
 */
export async function sendShortCredit(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  userId: string,
  opts: SendPaymentOptions = {},
): Promise<PayAppQuickBooksDto> {
  await assertNotSample(ctx, orgId, projectId);
  const qbo = gatewayOrThrow(ctx);
  await assertQuickBooks(ctx, orgId);
  const p = await planFor(ctx, orgId, projectId, payAppId);
  const { app } = p;
  if (!app.shortClosedCents || !app.shortReason || !app.shortClosedOn) {
    throw conflict("This application has no balance closed short to credit.");
  }
  const conn = await connectionRow(ctx, orgId);
  if (!conn)
    throw conflict("Connect QuickBooks first (an admin can do it on the QuickBooks page).");
  const invoiceRow = await syncRow(ctx, orgId, app.id);
  if (!invoiceRow) {
    throw conflict(
      "Send the application to QuickBooks first: the credit is applied to its invoice.",
    );
  }
  if (invoiceRow.realmId !== conn.realmId) {
    throw conflict(
      `Invoice ${invoiceRow.docNumber} is in a different QuickBooks company from the one connected now. Enter this credit in that company by hand.`,
    );
  }
  if (await creditRow(ctx, orgId, app.id)) {
    throw conflict("This balance is already in QuickBooks as a credit.");
  }
  const syncs = await paymentSyncRows(ctx, orgId, app.id);
  const synced = new Set(syncs.map((r) => r.paymentId));
  const unsent = p.payments.filter((pm) => !synced.has(pm.id)).length;
  if (unsent > 0) {
    throw conflict(
      "Send or mark every payment on this application in QuickBooks first, so the invoice's open balance there is only what was closed short.",
    );
  }
  const docNumber = qboCreditDocNumber(invoiceRow.docNumber);
  const row = {
    payAppId: app.id,
    orgId,
    realmId: conn.realmId,
    invoiceId: invoiceRow.invoiceId,
    syncedBy: userId,
  };
  if (opts.alreadyInQuickBooks) {
    await ctx.db
      .insert(qboCreditMemoSyncs)
      .values({ ...row, creditMemoId: null, docNumber: null, amountCents: app.shortClosedCents })
      .onConflictDoNothing();
    ctx.logger.info("quickbooks.credit_marked", { orgId, payAppId });
    return payAppQuickBooks(ctx, orgId, projectId, payAppId);
  }
  try {
    const books: AccountingSync = qbo.books(tokenStore(ctx, qbo, orgId), conn.realmId);
    const invoice = await books.getInvoice(invoiceRow.invoiceId);
    if (!invoice) {
      throw conflict(
        `Invoice ${invoiceRow.docNumber} is no longer in QuickBooks. Enter the credit there by hand, then mark it as already in QuickBooks.`,
      );
    }
    const paidCents = syncs.reduce((s, r) => s + r.amountCents, 0);
    const expectedOpen = invoice.totalCents - paidCents;
    const ids = await creditRequestIds(orgId, app.id);
    let memo = await books.findCreditMemoByDocNumber(docNumber);
    if (memo && memo.customerId !== invoice.customerId) {
      throw conflict(
        `QuickBooks already has a credit memo numbered ${docNumber} for another customer. Rename it in QuickBooks, then send again.`,
      );
    }
    let open = invoice.balanceCents;
    if (memo) {
      // A send that reached QuickBooks but not our database: the memo is there; the invoice is
      // either credited already or still open by the memo's amount.
      if (open === expectedOpen - memo.totalCents) open = expectedOpen;
      else if (open !== expectedOpen) {
        throw new AppError(
          409,
          "quickbooks_balance_mismatch",
          `QuickBooks shows ${formatCents(open)} open on invoice ${invoiceRow.docNumber}; PayApps expected ${formatCents(expectedOpen)}. Check the invoice and credit memo ${docNumber} in QuickBooks; nothing was sent.`,
        );
      }
    } else if (open !== expectedOpen) {
      throw new AppError(
        409,
        "quickbooks_balance_mismatch",
        `QuickBooks shows ${formatCents(open)} open on invoice ${invoiceRow.docNumber}; PayApps expected ${formatCents(expectedOpen)}. A payment or credit may already be entered there, or the invoice was changed. If the credit is there, mark it as already in QuickBooks; nothing was sent.`,
      );
    }
    const plan = planQboCredit({
      appNumber: app.number,
      shortClosedCents: app.shortClosedCents,
      reason: app.shortReason,
      note: app.shortNote,
      invoiceTotalCents: invoice.totalCents,
      certifiedAmountCents: app.certifiedAmountCents,
      openCents: open,
    });
    if (memo && memo.totalCents !== plan.totalCents) {
      throw conflict(
        `QuickBooks already has a credit memo numbered ${docNumber} for ${formatCents(memo.totalCents)}, not the ${formatCents(plan.totalCents)} PayApps would send. Check it in QuickBooks, then mark the credit as already there or rename that memo.`,
      );
    }
    if (!memo) {
      const item = await workItem(books, conn, p.project);
      memo = await books.createCreditMemo({
        customerId: invoice.customerId,
        docNumber,
        txnDate: app.shortClosedOn,
        privateNote: `Balance closed short on pay application #${app.number}, ${p.project.name} (invoice ${invoiceRow.docNumber}). Sent from PayApps.`,
        lines: plan.lines.map((l) => ({
          itemId: item.id,
          amountCents: l.amountCents,
          description: l.description,
        })),
        requestId: ids.memo,
      });
    }
    const target = expectedOpen - plan.totalCents;
    let after = await books.getInvoice(invoice.id);
    let applied = after?.balanceCents === target;
    if (!applied) {
      const current = await books.getCreditMemo(memo.id);
      if (
        current &&
        current.remainingCents >= plan.totalCents &&
        after?.balanceCents === expectedOpen
      ) {
        await books.applyCreditMemo({
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          creditMemoId: memo.id,
          amountCents: plan.totalCents,
          txnDate: app.shortClosedOn,
          requestId: ids.apply,
        });
        after = await books.getInvoice(invoice.id);
        applied = after?.balanceCents === target;
      }
    }
    await ctx.db
      .insert(qboCreditMemoSyncs)
      .values({ ...row, creditMemoId: memo.id, docNumber, amountCents: plan.totalCents, applied })
      .onConflictDoNothing();
    ctx.logger.info("quickbooks.credit_sent", {
      orgId,
      payAppId,
      creditMemoId: memo.id,
      applied,
    });
  } catch (e) {
    rethrowQbo(e, "the credit memo");
  }
  return payAppQuickBooks(ctx, orgId, projectId, payAppId);
}

/**
 * Every payment on an application whose invoice is in QuickBooks that is not itself there yet (not
 * sent, not marked as entered by hand), across the company's jobs, oldest first: what a refused
 * automatic send leaves behind. The cash report lists them with a send button, which goes through
 * `sendPayment` and all its checks. The sample job is left out, as everywhere QuickBooks is
 * concerned. Empty while the integration is dark.
 */
export async function unsentPayments(
  ctx: AppContext,
  orgId: string,
): Promise<UnsentQuickBooksPaymentsDto> {
  const status = await quickbooksStatus(ctx, orgId);
  if (!status.available) return { status, payments: [] };
  const rows = await ctx.db
    .select({
      paymentId: payAppPayments.id,
      projectId: projects.id,
      projectName: projects.name,
      projectNumber: projects.number,
      payAppId: payApps.id,
      payAppNumber: payApps.number,
      docNumber: qboInvoiceSyncs.docNumber,
      realmId: qboInvoiceSyncs.realmId,
      amountCents: payAppPayments.amountCents,
      receivedOn: payAppPayments.receivedOn,
      reference: payAppPayments.reference,
    })
    .from(payAppPayments)
    .innerJoin(
      qboInvoiceSyncs,
      and(eq(qboInvoiceSyncs.payAppId, payAppPayments.payAppId), eq(qboInvoiceSyncs.orgId, orgId)),
    )
    .innerJoin(payApps, and(eq(payApps.id, payAppPayments.payAppId), eq(payApps.orgId, orgId)))
    .innerJoin(projects, and(eq(projects.id, payApps.projectId), eq(projects.orgId, orgId)))
    .leftJoin(
      qboPaymentSyncs,
      and(eq(qboPaymentSyncs.paymentId, payAppPayments.id), eq(qboPaymentSyncs.orgId, orgId)),
    )
    .where(
      and(
        eq(payAppPayments.orgId, orgId),
        isNull(qboPaymentSyncs.paymentId),
        eq(projects.isSample, false),
      ),
    )
    .orderBy(asc(payAppPayments.receivedOn), asc(payAppPayments.createdAt))
    .all();
  const realm = status.connection?.realmId ?? null;
  return {
    status,
    payments: rows.map(({ realmId, ...r }) => ({ ...r, otherCompany: realmId !== realm })),
  };
}

/**
 * Right after a payment is recorded: when the company sends payments automatically and the
 * application's invoice is already in QuickBooks, send this one through `sendPayment`, with all its
 * checks (open balance, same company, plan, idempotency key). Never throws: recording the payment
 * has already happened and stands; a refusal comes back as the reason, and the payment waits in
 * the QuickBooks panel to be sent or marked by hand. Null when nothing was tried.
 */
export async function autoSendPayment(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  paymentId: string,
  userId: string,
): Promise<QuickBooksAutoSendDto | null> {
  if (!ctx.qbo) return null;
  const conn = await connectionRow(ctx, orgId);
  if (!conn?.autoSendPayments) return null;
  if (!(await syncRow(ctx, orgId, payAppId))) return null;
  try {
    await sendPayment(ctx, orgId, projectId, payAppId, paymentId, userId);
    return { sent: true, message: null };
  } catch (e) {
    ctx.logger.warn("quickbooks.auto_payment_failed", {
      orgId,
      payAppId,
      paymentId,
      error: String(e),
    });
    return {
      sent: false,
      message:
        e instanceof AppError
          ? e.message
          : "QuickBooks did not answer. The payment is recorded here; send it from the QuickBooks panel.",
    };
  }
}
