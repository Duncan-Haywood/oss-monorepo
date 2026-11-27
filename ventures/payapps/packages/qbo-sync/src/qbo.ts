/**
 * QuickBooks Online implementation of the AccountingSync port (Accounting API v3, JSON, fetch).
 *
 * Base URLs, the default minor version and entity/field names follow Intuit's official SDKs
 * (intuit/oauth-jsclient and intuit/QuickBooks-V3-PHP-SDK, including its Finance.xsd schema):
 * see the README's "Sources" section.
 */
import { amountToCents, centsToAmount } from "./money.ts";
import type { AccessTokenProvider, FetchLike } from "./oauth.ts";
import {
  type Account,
  type AccountInput,
  type AccountingSync,
  type CreditApplicationInput,
  type CreditMemo,
  type CreditMemoInput,
  type Customer,
  type CustomerInput,
  DEFAULT_RETAINAGE_ACCOUNT_NAME,
  DEFAULT_RETAINAGE_ITEM_NAME,
  type Invoice,
  type InvoiceInput,
  type InvoiceLine,
  type Item,
  type ItemInput,
  type Payment,
  type PaymentApplication,
  type PaymentInput,
  type RetainageSetup,
  type RetainageSetupOptions,
  type TrackingCategory,
  type TrackingPrefs,
  type TransactionTracking,
  validateCreditApplicationInput,
  validateCreditMemoInput,
  validateInvoiceInput,
  validatePaymentInput,
} from "./port.ts";

export const QBO_BASE_URLS = {
  production: "https://quickbooks.api.intuit.com",
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
} as const;
export type QboEnvironment = keyof typeof QBO_BASE_URLS;

/** The default minor version in Intuit's PHP SDK (CoreConstants::DEFAULT_SDK_MINOR_VERSION). */
export const DEFAULT_MINOR_VERSION = "75";

// ---- Wire types (only the fields this package reads or writes) ----

export interface QboRef {
  value: string;
  name?: string;
}

export interface QboCustomer {
  Id: string;
  SyncToken: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address?: string };
}

export interface QboItem {
  Id: string;
  SyncToken: string;
  Name: string;
  Type: string;
  IncomeAccountRef?: QboRef;
}

export interface QboAccount {
  Id: string;
  SyncToken: string;
  Name: string;
  AccountType: string;
  AccountSubType?: string;
}

export interface QboLinkedTxn {
  TxnId: string;
  TxnType: string;
}

export interface QboLine {
  Id?: string;
  LineNum?: number;
  Amount?: number;
  Description?: string;
  DetailType: string;
  SalesItemLineDetail?: { ItemRef: QboRef; ClassRef?: QboRef; Qty?: number; UnitPrice?: number };
  LinkedTxn?: QboLinkedTxn[];
}

export interface QboInvoice {
  Id: string;
  SyncToken: string;
  CustomerRef: QboRef;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  BillEmail?: { Address?: string };
  CustomerMemo?: { value?: string };
  ClassRef?: QboRef;
  DepartmentRef?: QboRef;
  TotalAmt?: number;
  Balance?: number;
  Line?: QboLine[];
}

/** A Class or a Department (location): the same fields this package reads. */
export interface QboTrackingEntity {
  Id: string;
  Name: string;
  FullyQualifiedName?: string;
  Active?: boolean;
}

/** `GET /v3/company/{realmId}/preferences`, the fields this package reads. */
export interface QboPreferences {
  AccountingInfoPrefs?: {
    TrackDepartments?: boolean;
    DepartmentTerminology?: string;
    ClassTrackingPerTxn?: boolean;
    ClassTrackingPerTxnLine?: boolean;
  };
  CurrencyPrefs?: { MultiCurrencyEnabled?: boolean; HomeCurrency?: { value?: string } };
}

export interface QboPayment {
  Id: string;
  SyncToken: string;
  CustomerRef: QboRef;
  TotalAmt?: number;
  UnappliedAmt?: number;
  TxnDate?: string;
  PaymentRefNum?: string;
  Line?: QboLine[];
}

export interface QboCreditMemo {
  Id: string;
  SyncToken: string;
  CustomerRef: QboRef;
  DocNumber?: string;
  TxnDate?: string;
  TotalAmt?: number;
  RemainingCredit?: number;
  Line?: QboLine[];
}

export interface QboFaultError {
  Message?: string;
  Detail?: string;
  code?: string;
  element?: string;
}

export interface QboFault {
  Error?: QboFaultError[];
  type?: string;
}

/** A non-2xx response (or a 200 carrying a Fault) from the Accounting API. */
export class QboApiError extends Error {
  override name = "QboApiError";
  readonly status: number;
  readonly faultType: string | undefined;
  readonly errors: QboFaultError[];
  /** Quote this to Intuit support. */
  readonly intuitTid: string | undefined;
  constructor(status: number, fault: QboFault | undefined, intuitTid: string | undefined) {
    const first = fault?.Error?.[0];
    const detail = first
      ? `: ${first.Message ?? ""}${first.Detail ? ` (${first.Detail})` : ""}`
      : "";
    super(`QuickBooks Online API ${status}${first?.code ? ` code ${first.code}` : ""}${detail}`);
    this.status = status;
    this.faultType = fault?.type;
    this.errors = fault?.Error ?? [];
    this.intuitTid = intuitTid;
  }
  /** Worth retrying later with backoff (rate limit or server error). */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

/**
 * Escape a value for a single-quoted literal in a QuickBooks query.
 * Backslash-escapes `\` and `'`. Verify names containing quotes against your sandbox company.
 */
export function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export interface QboClientOptions {
  tokens: AccessTokenProvider;
  environment: QboEnvironment;
  minorVersion?: string;
  fetch?: FetchLike;
}

/** Low-level client: auth header, minor version, Fault parsing, one retry after a 401. */
export class QboClient {
  private readonly tokens: AccessTokenProvider;
  private readonly base: string;
  private readonly minorVersion: string;
  private readonly fetchFn: FetchLike;

  constructor(opts: QboClientOptions) {
    this.tokens = opts.tokens;
    this.base = `${QBO_BASE_URLS[opts.environment]}/v3/company/${encodeURIComponent(opts.tokens.realmId)}`;
    this.minorVersion = opts.minorVersion ?? DEFAULT_MINOR_VERSION;
    this.fetchFn = opts.fetch ?? ((input, init) => fetch(input, init));
  }

  async request<T>(
    method: "GET" | "POST",
    path: string,
    opts: { body?: unknown; query?: Record<string, string> } = {},
  ): Promise<T> {
    const q = new URLSearchParams({ ...opts.query, minorversion: this.minorVersion });
    const url = `${this.base}/${path}?${q.toString()}`;
    const send = async (token: string) =>
      this.fetchFn(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
      });

    let res = await send(await this.tokens.getAccessToken());
    if (res.status === 401) res = await send(await this.tokens.forceRefresh());

    const tid = res.headers.get("intuit_tid") ?? undefined;
    const json = (await res.json().catch(() => undefined)) as
      | (Record<string, unknown> & { Fault?: QboFault })
      | undefined;
    if (!res.ok || json?.Fault) throw new QboApiError(res.status, json?.Fault, tid);
    if (json === undefined) throw new QboApiError(res.status, undefined, tid);
    return json as T;
  }

  /** Run a query and return the rows of one entity (empty array when none match). */
  async query<T>(entity: string, where: string, maxResults = 1000): Promise<T[]> {
    const sql = `select * from ${entity}${where ? ` where ${where}` : ""} maxresults ${maxResults}`;
    const res = await this.request<{ QueryResponse?: Record<string, unknown> }>("GET", "query", {
      query: { query: sql },
    });
    const rows = res.QueryResponse?.[entity];
    return Array.isArray(rows) ? (rows as T[]) : [];
  }

  /** `requestId` goes out as `requestid`, QuickBooks' idempotency key for creates. */
  async create<T>(entity: string, body: unknown, requestId?: string): Promise<T> {
    const res = await this.request<Record<string, T>>("POST", entity.toLowerCase(), {
      body,
      ...(requestId ? { query: { requestid: requestId } } : {}),
    });
    const created = res[entity];
    if (created === undefined)
      throw new QboApiError(200, { Error: [{ Message: "empty body" }] }, undefined);
    return created;
  }
}

// ---- Mapping ----

function toCustomer(c: QboCustomer): Customer {
  return {
    id: c.Id,
    syncToken: c.SyncToken,
    displayName: c.DisplayName,
    ...(c.CompanyName ? { companyName: c.CompanyName } : {}),
    ...(c.PrimaryEmailAddr?.Address ? { email: c.PrimaryEmailAddr.Address } : {}),
  };
}

function toItem(i: QboItem): Item {
  return {
    id: i.Id,
    syncToken: i.SyncToken,
    name: i.Name,
    type: i.Type,
    ...(i.IncomeAccountRef ? { incomeAccountId: i.IncomeAccountRef.value } : {}),
    ...(i.IncomeAccountRef?.name ? { incomeAccountName: i.IncomeAccountRef.name } : {}),
  };
}

function toAccount(a: QboAccount): Account {
  return {
    id: a.Id,
    syncToken: a.SyncToken,
    name: a.Name,
    accountType: a.AccountType,
    ...(a.AccountSubType ? { accountSubType: a.AccountSubType } : {}),
  };
}

function toInvoiceLine(l: QboLine): InvoiceLine | null {
  if (l.DetailType !== "SalesItemLineDetail" || !l.SalesItemLineDetail) return null;
  const d = l.SalesItemLineDetail;
  return {
    itemId: d.ItemRef.value,
    amountCents: amountToCents(l.Amount),
    ...(l.Description ? { description: l.Description } : {}),
    ...(d.Qty !== undefined ? { qty: d.Qty } : {}),
    ...(d.UnitPrice !== undefined ? { unitPriceCents: amountToCents(d.UnitPrice) } : {}),
    ...(d.ClassRef?.value ? { classId: d.ClassRef.value } : {}),
  };
}

function toTrackingCategory(e: QboTrackingEntity): TrackingCategory {
  return { id: e.Id, name: e.Name, fullName: e.FullyQualifiedName || e.Name };
}

/**
 * The company's tracking settings. A company with both class settings on is read as per line
 * (QuickBooks offers one choice: one class to each row, or to the whole transaction).
 */
export function trackingPrefsFromQbo(p: QboPreferences | undefined): TrackingPrefs {
  const a = p?.AccountingInfoPrefs ?? {};
  const home = p?.CurrencyPrefs?.HomeCurrency?.value?.trim().toUpperCase();
  return {
    classTracking: a.ClassTrackingPerTxnLine
      ? "per-line"
      : a.ClassTrackingPerTxn
        ? "per-transaction"
        : "off",
    locationTracking: a.TrackDepartments === true,
    locationLabel: a.DepartmentTerminology?.trim() || null,
    ...(home && /^[A-Z]{3}$/.test(home) ? { homeCurrency: home } : {}),
  };
}

function toInvoice(i: QboInvoice): Invoice {
  return {
    id: i.Id,
    syncToken: i.SyncToken,
    customerId: i.CustomerRef.value,
    ...(i.DocNumber ? { docNumber: i.DocNumber } : {}),
    ...(i.TxnDate ? { txnDate: i.TxnDate } : {}),
    ...(i.DueDate ? { dueDate: i.DueDate } : {}),
    ...(i.BillEmail?.Address ? { billEmail: i.BillEmail.Address } : {}),
    ...(i.CustomerMemo?.value ? { customerMemo: i.CustomerMemo.value } : {}),
    ...(i.ClassRef?.value ? { classId: i.ClassRef.value } : {}),
    ...(i.DepartmentRef?.value ? { locationId: i.DepartmentRef.value } : {}),
    totalCents: amountToCents(i.TotalAmt),
    balanceCents: amountToCents(i.Balance),
    lines: (i.Line ?? []).map(toInvoiceLine).filter((l): l is InvoiceLine => l !== null),
  };
}

function toPayment(p: QboPayment): Payment {
  const appliedTo: PaymentApplication[] = [];
  for (const line of p.Line ?? []) {
    for (const linked of line.LinkedTxn ?? []) {
      if (linked.TxnType === "Invoice") {
        appliedTo.push({ invoiceId: linked.TxnId, amountCents: amountToCents(line.Amount) });
      }
    }
  }
  return {
    id: p.Id,
    syncToken: p.SyncToken,
    customerId: p.CustomerRef.value,
    totalCents: amountToCents(p.TotalAmt),
    unappliedCents: amountToCents(p.UnappliedAmt),
    ...(p.TxnDate ? { txnDate: p.TxnDate } : {}),
    ...(p.PaymentRefNum ? { paymentRefNum: p.PaymentRefNum } : {}),
    appliedTo,
  };
}

function toCreditMemo(c: QboCreditMemo): CreditMemo {
  return {
    id: c.Id,
    syncToken: c.SyncToken,
    customerId: c.CustomerRef.value,
    ...(c.DocNumber ? { docNumber: c.DocNumber } : {}),
    ...(c.TxnDate ? { txnDate: c.TxnDate } : {}),
    totalCents: amountToCents(c.TotalAmt),
    remainingCents: amountToCents(c.RemainingCredit),
  };
}

const salesLines = (lines: InvoiceInput["lines"]) =>
  lines.map((l) => ({
    DetailType: "SalesItemLineDetail",
    Amount: centsToAmount(l.amountCents),
    ...(l.description ? { Description: l.description } : {}),
    SalesItemLineDetail: {
      ItemRef: { value: l.itemId },
      ...(l.qty !== undefined ? { Qty: l.qty } : {}),
      ...(l.unitPriceCents !== undefined ? { UnitPrice: centsToAmount(l.unitPriceCents) } : {}),
      ...(l.classId ? { ClassRef: { value: l.classId } } : {}),
    },
  }));

const trackingRefs = (t: TransactionTracking) => ({
  ...(t.classId ? { ClassRef: { value: t.classId } } : {}),
  ...(t.locationId ? { DepartmentRef: { value: t.locationId } } : {}),
});

export function creditMemoToQbo(input: CreditMemoInput): Record<string, unknown> {
  return {
    CustomerRef: { value: input.customerId },
    ...(input.docNumber ? { DocNumber: input.docNumber } : {}),
    ...(input.txnDate ? { TxnDate: input.txnDate } : {}),
    ...(input.privateNote ? { PrivateNote: input.privateNote } : {}),
    ...trackingRefs(input),
    Line: salesLines(input.lines),
  };
}

/**
 * A zero payment linking the invoice and the credit memo for the same amount: how a credit is
 * applied to one chosen invoice through the Accounting API (to verify against a sandbox).
 */
export function creditApplicationToQbo(input: CreditApplicationInput): Record<string, unknown> {
  const amount = centsToAmount(input.amountCents);
  return {
    CustomerRef: { value: input.customerId },
    TotalAmt: 0,
    ...(input.txnDate ? { TxnDate: input.txnDate } : {}),
    Line: [
      { Amount: amount, LinkedTxn: [{ TxnId: input.invoiceId, TxnType: "Invoice" }] },
      { Amount: amount, LinkedTxn: [{ TxnId: input.creditMemoId, TxnType: "CreditMemo" }] },
    ],
  };
}

export function invoiceToQbo(input: InvoiceInput): Record<string, unknown> {
  return {
    CustomerRef: { value: input.customerId },
    ...(input.docNumber ? { DocNumber: input.docNumber } : {}),
    ...(input.txnDate ? { TxnDate: input.txnDate } : {}),
    ...(input.dueDate ? { DueDate: input.dueDate } : {}),
    ...(input.privateNote ? { PrivateNote: input.privateNote } : {}),
    ...(input.billEmail ? { BillEmail: { Address: input.billEmail } } : {}),
    ...(input.customerMemo ? { CustomerMemo: { value: input.customerMemo } } : {}),
    ...trackingRefs(input),
    Line: salesLines(input.lines),
  };
}

export function paymentToQbo(input: PaymentInput): Record<string, unknown> {
  return {
    CustomerRef: { value: input.customerId },
    TotalAmt: centsToAmount(input.totalCents),
    ...(input.txnDate ? { TxnDate: input.txnDate } : {}),
    ...(input.paymentRefNum ? { PaymentRefNum: input.paymentRefNum } : {}),
    Line: input.applyTo.map((a) => ({
      Amount: centsToAmount(a.amountCents),
      LinkedTxn: [{ TxnId: a.invoiceId, TxnType: "Invoice" }],
    })),
  };
}

// ---- The adapter ----

export class QuickBooksOnlineSync implements AccountingSync {
  readonly client: QboClient;

  constructor(opts: QboClientOptions | { client: QboClient }) {
    this.client = "client" in opts ? opts.client : new QboClient(opts);
  }

  private async one<T>(entity: string, where: string): Promise<T | null> {
    const rows = await this.client.query<T>(entity, where, 1);
    return rows[0] ?? null;
  }

  async findCustomerByDisplayName(displayName: string): Promise<Customer | null> {
    const c = await this.one<QboCustomer>(
      "Customer",
      `DisplayName = '${escapeQueryValue(displayName)}'`,
    );
    return c ? toCustomer(c) : null;
  }

  async upsertCustomer(input: CustomerInput): Promise<Customer> {
    const existing = await this.findCustomerByDisplayName(input.displayName);
    const fields = {
      ...(input.companyName ? { CompanyName: input.companyName } : {}),
      ...(input.email ? { PrimaryEmailAddr: { Address: input.email } } : {}),
    };
    if (!existing) {
      const created = await this.client.create<QboCustomer>("Customer", {
        DisplayName: input.displayName,
        ...fields,
      });
      return toCustomer(created);
    }
    const changed =
      (input.companyName !== undefined && input.companyName !== existing.companyName) ||
      (input.email !== undefined && input.email !== existing.email);
    if (!changed) return existing;
    const updated = await this.client.create<QboCustomer>("Customer", {
      Id: existing.id,
      SyncToken: existing.syncToken,
      sparse: true,
      ...fields,
    });
    return toCustomer(updated);
  }

  async findItemByName(name: string): Promise<Item | null> {
    const i = await this.one<QboItem>("Item", `Name = '${escapeQueryValue(name)}'`);
    return i ? toItem(i) : null;
  }

  async ensureItem(input: ItemInput): Promise<Item> {
    const existing = await this.findItemByName(input.name);
    if (existing) return existing;
    const created = await this.client.create<QboItem>("Item", {
      Name: input.name,
      Type: input.type,
      IncomeAccountRef: { value: input.incomeAccountId },
      ...(input.description ? { Description: input.description } : {}),
    });
    return toItem(created);
  }

  async getItem(id: string): Promise<Item | null> {
    // A query (not GET item/{id}) so an inactive item reads as gone: QuickBooks queries return
    // active entities only unless asked otherwise.
    const i = await this.one<QboItem>("Item", `Id = '${escapeQueryValue(id)}'`);
    return i ? toItem(i) : null;
  }

  async listSaleItems(): Promise<Item[]> {
    const rows = await this.client.query<QboItem>("Item", "Type IN ('Service', 'NonInventory')");
    return rows
      .filter((i) => i.IncomeAccountRef?.value)
      .map(toItem)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findAccountByName(name: string): Promise<Account | null> {
    const a = await this.one<QboAccount>("Account", `Name = '${escapeQueryValue(name)}'`);
    return a ? toAccount(a) : null;
  }

  async ensureAccount(input: AccountInput): Promise<Account> {
    const existing = await this.findAccountByName(input.name);
    if (existing) return existing;
    const created = await this.client.create<QboAccount>("Account", {
      Name: input.name,
      AccountType: input.accountType,
      ...(input.accountSubType ? { AccountSubType: input.accountSubType } : {}),
      ...(input.description ? { Description: input.description } : {}),
    });
    return toAccount(created);
  }

  async createInvoice(input: InvoiceInput): Promise<Invoice> {
    validateInvoiceInput(input);
    return toInvoice(
      await this.client.create<QboInvoice>("Invoice", invoiceToQbo(input), input.requestId),
    );
  }

  async getInvoice(id: string): Promise<Invoice | null> {
    const i = await this.one<QboInvoice>("Invoice", `Id = '${escapeQueryValue(id)}'`);
    return i ? toInvoice(i) : null;
  }

  async findInvoiceByDocNumber(docNumber: string): Promise<Invoice | null> {
    const i = await this.one<QboInvoice>("Invoice", `DocNumber = '${escapeQueryValue(docNumber)}'`);
    return i ? toInvoice(i) : null;
  }

  async recordPayment(input: PaymentInput): Promise<Payment> {
    validatePaymentInput(input);
    return toPayment(
      await this.client.create<QboPayment>("Payment", paymentToQbo(input), input.requestId),
    );
  }

  async getPayment(id: string): Promise<Payment | null> {
    const p = await this.one<QboPayment>("Payment", `Id = '${escapeQueryValue(id)}'`);
    return p ? toPayment(p) : null;
  }

  async createCreditMemo(input: CreditMemoInput): Promise<CreditMemo> {
    validateCreditMemoInput(input);
    return toCreditMemo(
      await this.client.create<QboCreditMemo>(
        "CreditMemo",
        creditMemoToQbo(input),
        input.requestId,
      ),
    );
  }

  async getCreditMemo(id: string): Promise<CreditMemo | null> {
    const c = await this.one<QboCreditMemo>("CreditMemo", `Id = '${escapeQueryValue(id)}'`);
    return c ? toCreditMemo(c) : null;
  }

  async findCreditMemoByDocNumber(docNumber: string): Promise<CreditMemo | null> {
    const c = await this.one<QboCreditMemo>(
      "CreditMemo",
      `DocNumber = '${escapeQueryValue(docNumber)}'`,
    );
    return c ? toCreditMemo(c) : null;
  }

  async applyCreditMemo(input: CreditApplicationInput): Promise<Payment> {
    validateCreditApplicationInput(input);
    return toPayment(
      await this.client.create<QboPayment>(
        "Payment",
        creditApplicationToQbo(input),
        input.requestId,
      ),
    );
  }

  async getTrackingPrefs(): Promise<TrackingPrefs> {
    const res = await this.client.request<{ Preferences?: QboPreferences }>("GET", "preferences");
    return trackingPrefsFromQbo(res.Preferences);
  }

  private async listTracking(entity: "Class" | "Department"): Promise<TrackingCategory[]> {
    // Queries return active entities only unless asked otherwise (as for items).
    const rows = await this.client.query<QboTrackingEntity>(entity, "");
    return rows
      .filter((r) => r.Active !== false)
      .map(toTrackingCategory)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  private async getTracking(
    entity: "Class" | "Department",
    id: string,
  ): Promise<TrackingCategory | null> {
    const r = await this.one<QboTrackingEntity>(entity, `Id = '${escapeQueryValue(id)}'`);
    return r && r.Active !== false ? toTrackingCategory(r) : null;
  }

  listClasses(): Promise<TrackingCategory[]> {
    return this.listTracking("Class");
  }

  getClass(id: string): Promise<TrackingCategory | null> {
    return this.getTracking("Class", id);
  }

  listLocations(): Promise<TrackingCategory[]> {
    return this.listTracking("Department");
  }

  getLocation(id: string): Promise<TrackingCategory | null> {
    return this.getTracking("Department", id);
  }

  async ensureRetainageSetup(options: RetainageSetupOptions = {}): Promise<RetainageSetup> {
    const account = await this.ensureAccount({
      name: options.accountName ?? DEFAULT_RETAINAGE_ACCOUNT_NAME,
      accountType: "Other Current Asset",
      accountSubType: options.accountSubType ?? "OtherCurrentAssets",
      description: "Retainage withheld by customers on progress billings, not yet released.",
    });
    const item = await this.ensureItem({
      name: options.itemName ?? DEFAULT_RETAINAGE_ITEM_NAME,
      type: "Service",
      incomeAccountId: account.id,
      description: "Retainage held (negative lines) and released (positive lines).",
    });
    if (item.incomeAccountId !== undefined && item.incomeAccountId !== account.id) {
      throw new Error(
        `Item "${item.name}" already exists and posts to account ${item.incomeAccountId}, not the ` +
          `retainage account ${account.id}. Rename it in QuickBooks or pass a different itemName.`,
      );
    }
    return { account, item };
  }
}
