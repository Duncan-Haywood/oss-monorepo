// QuickBooks Online: connect a shop's company, and send a won quote as an invoice
// (docs/QUICKBOOKS.md). The invoice is planned by src/shared/qbo-invoice.ts from the quote's own
// stored breaks, so every amount on it is one the customer was quoted.
//
// Rules:
// - Connect and disconnect are admin actions; sending is an estimator's. Viewers see the status.
// - The OAuth state is single use, bound to the admin who started it and to the shop, 10 minutes.
// - Intuit's tokens are stored sealed (lib/token-box.ts) and bound to the org id.
// - One invoice per quote: the row in qbo_quote_invoices says it is sent. A send whose response
//   was lost is retried with the same QuickBooks requestid, and an invoice already in QuickBooks
//   under the quote's number is reused only when its total is what this send would bill.
// - Logs carry ids, never customer names, PO numbers or amounts.

import {
  type AccountingSync,
  AccountingValidationError,
  IntuitOAuthError,
  parseCallback,
  QboApiError,
  type TokenSet,
  type TokenStore,
} from "@qbo-sync";
import type {
  QuickBooksItemsDto,
  QuickBooksStatusDto,
  QuoteInvoiceLineDto,
  QuoteQuickBooksDto,
} from "@shared/api";
import { shopCurrency } from "@shared/currency";
import { type MemberRole, ROLE_RANK } from "@shared/enums";
import {
  currencyMismatch,
  type InvoiceChoice,
  invoiceMemo,
  planQuoteInvoice,
  qboDocNumber,
} from "@shared/qbo-invoice";
import { shopDay } from "@shared/time-zone";
import { and, eq, lt } from "drizzle-orm";
import type { AppContext } from "../context";
import {
  member,
  qboConnections,
  qboOauthStates,
  qboQuoteInvoices,
  quoteResponses,
  user,
} from "../db/schema";
import { AppError, badRequest, conflict } from "../lib/errors";
import { sha256Hex } from "../lib/hash";
import { openJson, sealJson } from "../lib/token-box";
import type { QboGateway } from "../ports/accounting";
import { getQuote } from "./quotes";
import { getSettings } from "./ratecard";

const TOKEN_PURPOSE = "qbo-tokens-v1";
const STATE_TTL_MS = 10 * 60_000;

/** Names used in the shop's QuickBooks company. Existing ones are found by name and reused. */
export const QBO_NAMES = {
  /** QuickBooks' own default income account for product sales in a new US company. */
  incomeAccount: "Sales of Product Income",
  partsItem: "Machined parts",
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

type ConnectionRow = NonNullable<Awaited<ReturnType<typeof connectionRow>>>;

/** The shop's chosen item, when it was chosen in the company now connected (else null: default). */
function chosenItem(conn: ConnectionRow): { id: string; name: string } | null {
  return conn.invoiceItemId && conn.invoiceItemRealmId === conn.realmId
    ? { id: conn.invoiceItemId, name: conn.invoiceItemName ?? conn.invoiceItemId }
    : null;
}

export async function quickbooksStatus(
  ctx: AppContext,
  orgId: string,
): Promise<QuickBooksStatusDto> {
  const row = await connectionRow(ctx, orgId);
  return {
    available: ctx.qbo !== null,
    mode: ctx.qbo?.mode ?? null,
    connection: row
      ? {
          realmId: row.realmId,
          environment: row.environment,
          connectedAt: row.createdAt.toISOString(),
          refreshExpiresAt: row.refreshExpiresAt.toISOString(),
          invoiceItem: (() => {
            const own = chosenItem(row);
            return own
              ? { id: own.id, name: own.name, custom: true }
              : { id: null, name: QBO_NAMES.partsItem, custom: false };
          })(),
        }
      : null,
  };
}

function randomState(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Admin starts the connection: returns Intuit's consent URL with a single-use state. */
export async function startConnect(ctx: AppContext, orgId: string, userId: string) {
  const qbo = gatewayOrThrow(ctx);
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
 * started for a shop they still administer, within 10 minutes; it is consumed either way.
 */
export async function finishConnect(
  ctx: AppContext,
  userId: string,
  callbackUrl: string,
): Promise<CallbackOutcome> {
  const qbo = gatewayOrThrow(ctx);
  const state = new URL(callbackUrl).searchParams.get("state") ?? "";
  if (!state) return { ok: false, orgId: null, reason: "missing_state" };
  const row = await ctx.db
    .delete(qboOauthStates)
    .where(eq(qboOauthStates.stateHash, await sha256Hex(state)))
    .returning()
    .get();
  if (!row || row.userId !== userId) return { ok: false, orgId: null, reason: "unknown_state" };
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
      set: { ...values, createdAt: ctx.now(), updatedAt: ctx.now() },
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

/**
 * Turns a QuickBooks failure into a message the estimator can act on; nothing else leaks. `what`
 * names the thing QuickBooks was asked about ("the invoice", "the item list").
 */
function rethrowQbo(e: unknown, what = "the invoice"): never {
  if (e instanceof AppError) throw e;
  if (e instanceof IntuitOAuthError) {
    throw new AppError(
      409,
      "quickbooks_reconnect",
      "QuickBooks needs to be connected again (the connection expired or was revoked). An admin can reconnect it on the rate card page; nothing was sent.",
    );
  }
  if (e instanceof AccountingValidationError) {
    throw badRequest(`QuickBooks would refuse ${what}: ${e.message}. Nothing was sent.`);
  }
  if (e instanceof QboApiError) {
    throw new AppError(
      502,
      "quickbooks_error",
      `QuickBooks refused ${what}: ${e.message.slice(0, 300)}. Nothing was recorded here; try again or check QuickBooks.`,
    );
  }
  throw e;
}

async function acceptedChoices(ctx: AppContext, orgId: string, quoteId: string) {
  const r = await ctx.db
    .select({ decision: quoteResponses.decision, choices: quoteResponses.choices })
    .from(quoteResponses)
    .where(and(eq(quoteResponses.orgId, orgId), eq(quoteResponses.quoteId, quoteId)))
    .get();
  return r?.decision === "accepted"
    ? r.choices.map((c) => ({ lineId: c.lineId, quantity: c.quantity }))
    : null;
}

async function sentRow(ctx: AppContext, orgId: string, quoteId: string) {
  return ctx.db
    .select({
      row: qboQuoteInvoices,
      sentByName: user.name,
    })
    .from(qboQuoteInvoices)
    .leftJoin(user, eq(user.id, qboQuoteInvoices.sentBy))
    .where(and(eq(qboQuoteInvoices.orgId, orgId), eq(qboQuoteInvoices.quoteId, quoteId)))
    .get();
}

export async function quoteQuickBooks(
  ctx: AppContext,
  orgId: string,
  quoteId: string,
): Promise<QuoteQuickBooksDto> {
  const q = await getQuote(ctx, orgId, quoteId);
  const [conn, sent, accepted] = await Promise.all([
    connectionRow(ctx, orgId),
    sentRow(ctx, orgId, quoteId),
    acceptedChoices(ctx, orgId, quoteId),
  ]);
  return {
    available: ctx.qbo !== null,
    connected: conn !== undefined,
    invoice: sent
      ? {
          docNumber: sent.row.docNumber,
          invoiceId: sent.row.invoiceId,
          totalCents: sent.row.totalCents,
          lines: sent.row.lines,
          sentByName: sent.sentByName ?? null,
          sentAt: sent.row.createdAt.toISOString(),
        }
      : null,
    accepted,
    docNumber: qboDocNumber(q.quoteNumber, q.revNumber),
    memo: invoiceMemo(q),
  };
}

/** The connected company's books, or a 409 when there is no connection. */
async function connectedBooks(ctx: AppContext, orgId: string) {
  const qbo = gatewayOrThrow(ctx);
  const conn = await connectionRow(ctx, orgId);
  if (!conn) throw conflict("Connect QuickBooks first (an admin can do it on the rate card page).");
  return { conn, books: qbo.books(tokenStore(ctx, qbo, orgId), conn.realmId) };
}

/** The items an admin can choose to bill won quotes with, read live from the connected company. */
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
      current: chosenItem(conn),
      defaultItemName: QBO_NAMES.partsItem,
      defaultAccountName: QBO_NAMES.incomeAccount,
    };
  } catch (e) {
    rethrowQbo(e, "the item list");
  }
}

/**
 * Checks an item can carry quote lines: an active Service or NonInventory item that posts to an
 * income account. Returns its name.
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
    return item.name;
  } catch (e) {
    rethrowQbo(e, "the item");
  }
}

/**
 * Chooses the shop's own item for invoice lines, and with it the income account the sales post
 * to (null: back to "Machined parts"). Tied to the company connected now.
 */
export async function setInvoiceItem(
  ctx: AppContext,
  orgId: string,
  itemId: string | null,
): Promise<QuickBooksItemsDto> {
  const { conn, books } = await connectedBooks(ctx, orgId);
  const name = itemId === null ? null : await checkSaleItem(books, itemId);
  await ctx.db
    .update(qboConnections)
    .set({
      invoiceItemId: itemId,
      invoiceItemName: name,
      invoiceItemRealmId: itemId === null ? null : conn.realmId,
      updatedAt: ctx.now(),
    })
    .where(and(eq(qboConnections.orgId, orgId), eq(qboConnections.realmId, conn.realmId)));
  ctx.logger.info("quickbooks.invoice_item_set", { orgId, custom: itemId !== null });
  return listInvoiceItems(ctx, orgId);
}

/**
 * The item quote lines are billed with: the shop's own when one is chosen (refused, with nothing
 * sent, if it has since been made inactive), else "Machined parts" under the product income account.
 */
async function partsItem(books: AccountingSync, conn: ConnectionRow) {
  const own = chosenItem(conn);
  if (own) {
    const item = await books.getItem(own.id);
    if (!item) {
      throw conflict(
        `The QuickBooks item chosen for invoices ("${own.name}") is no longer active in QuickBooks. An admin can choose another on the rate card page; nothing was sent.`,
      );
    }
    return item;
  }
  const income = await books.ensureAccount({
    name: QBO_NAMES.incomeAccount,
    accountType: "Income",
  });
  return books.ensureItem({
    name: QBO_NAMES.partsItem,
    type: "NonInventory",
    incomeAccountId: income.id,
    description: "Made-to-order parts, per the quote",
  });
}

/** Stable per quote and shop, so a retry after a lost response is the same create to QuickBooks. */
async function invoiceRequestId(orgId: string, quoteId: string) {
  return (await sha256Hex(`jobshop-quote/qbo-invoice/${orgId}/${quoteId}`)).slice(0, 32);
}

export async function sendQuoteInvoice(
  ctx: AppContext,
  orgId: string,
  quoteId: string,
  userId: string,
  choices: InvoiceChoice[],
): Promise<QuoteQuickBooksDto> {
  const qbo = gatewayOrThrow(ctx);
  const q = await getQuote(ctx, orgId, quoteId);
  if (q.status !== "won") {
    throw conflict("Only a won quote becomes an invoice: record the win first.");
  }
  const conn = await connectionRow(ctx, orgId);
  if (!conn) throw conflict("Connect QuickBooks first (an admin can do it on the rate card page).");
  const existing = await sentRow(ctx, orgId, quoteId);
  if (existing) throw conflict(`Already in QuickBooks as invoice ${existing.row.docNumber}.`);

  const accepted = await acceptedChoices(ctx, orgId, quoteId);
  const plan = planQuoteInvoice(q.lines, choices, accepted);
  if (!plan.ok) throw badRequest(plan.error, plan.missing ? { lines: plan.missing } : undefined);
  const settings = await getSettings(ctx, orgId);
  const docNumber = qboDocNumber(q.quoteNumber, q.revNumber);
  const billed: QuoteInvoiceLineDto[] = plan.lines.map((l) => ({
    lineId: l.lineId,
    partNumber: l.partNumber,
    description: l.description,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    totalCents: l.totalCents,
  }));

  let invoiceId: string;
  try {
    const books = qbo.books(tokenStore(ctx, qbo, orgId), conn.realmId);
    const prefs = await books.getTrackingPrefs();
    const mismatch = currencyMismatch(shopCurrency(settings.currency), prefs.homeCurrency);
    if (mismatch) throw conflict(mismatch);
    let invoice = await books.findInvoiceByDocNumber(docNumber);
    if (invoice && invoice.totalCents !== plan.totalCents) {
      throw conflict(
        `QuickBooks already has an invoice numbered ${docNumber} for a different amount. Rename or delete it in QuickBooks, then send again.`,
      );
    }
    if (!invoice) {
      const item = await partsItem(books, conn);
      // An existing customer is used as it is: the shop's own record in QuickBooks is never edited.
      const name = q.customerCompany.trim().slice(0, 500);
      const customer =
        (await books.findCustomerByDisplayName(name)) ??
        (await books.upsertCustomer({ displayName: name, companyName: name.slice(0, 100) }));
      invoice = await books.createInvoice({
        customerId: customer.id,
        docNumber,
        txnDate: shopDay(ctx.now(), settings.timeZone),
        customerMemo: invoiceMemo(q),
        privateNote: `From Job Shop Quote: ${docNumber}.`,
        requestId: await invoiceRequestId(orgId, quoteId),
        lines: plan.lines.map((l) => ({
          itemId: item.id,
          description: l.description,
          qty: l.quantity,
          unitPriceCents: l.unitPriceCents,
          amountCents: l.totalCents,
        })),
      });
    }
    invoiceId = invoice.id;
  } catch (e) {
    rethrowQbo(e);
  }
  await ctx.db
    .insert(qboQuoteInvoices)
    .values({
      quoteId,
      orgId,
      realmId: conn.realmId,
      invoiceId,
      docNumber,
      totalCents: plan.totalCents,
      lines: billed,
      sentBy: userId,
    })
    .onConflictDoNothing();
  ctx.logger.info("quickbooks.quote_invoice_sent", { orgId, quoteId, invoiceId });
  return quoteQuickBooks(ctx, orgId, quoteId);
}
