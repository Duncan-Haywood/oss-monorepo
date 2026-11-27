/**
 * Reading job costs out of QuickBooks Online: the expense lines a company has tagged to a customer
 * or job (sub-customer). Read only; nothing here writes to QuickBooks.
 *
 * What counts as a cost here:
 * - **Bill** lines (vendor bills, accrual cost). The checks that later pay a bill are BillPayment
 *   transactions, which are not read, so a paid bill is counted once.
 * - **Purchase** lines: checks, cash and credit-card expenses written directly. A credit-card credit
 *   (`Credit: true`) is a refund and counts negative.
 * - **VendorCredit** lines count negative.
 * - **JournalEntry** lines whose `JournalEntryLineDetail.Entity` is the job's customer and whose
 *   account is an expense account (`Account.Classification` "Expense", or an `AccountType` of
 *   Expense, Cost of Goods Sold or Other Expense). This is how an outside payroll service (one that posts each payroll to
 *   QuickBooks as a journal entry, split by customer or job) and an accountant's reclass reach the
 *   job. A debit is a cost, a credit (a reversal or a reclass out) counts negative. Lines on any
 *   other kind of account (an Accounts Receivable write-off names the customer too) are left out.
 *
 * Purchase orders are read separately (`listPurchaseOrderLines`): they are commitments, cost still
 * to come, not cost. A bill or check made from a purchase order in QuickBooks carries a
 * `LinkedTxn` of type `PurchaseOrder` on its line; that link is passed through (`purchaseOrder`)
 * so the bill can be counted against the order instead of on top of it.
 *
 * A line is a cost of a job when its `AccountBasedExpenseLineDetail` or
 * `ItemBasedExpenseLineDetail` carries that job's `CustomerRef`, or, for a company that tracks jobs
 * by class instead of by customer, that job's `ClassRef` (`classIds` in the query). Classes are read
 * from the line only: Bill, Purchase and VendorCredit have no transaction-level class in Intuit's
 * schema, while a PurchaseOrder does, so an order's own `ClassRef` counts for its lines that carry
 * none. A journal entry line matches on its `JournalEntryLineDetail.ClassRef` the same way. Only
 * the exact class is matched, never its sub-classes, as only the exact customer is. Field names follow Intuit's PHP SDK
 * (`IPPBill`, `IPPPurchase`, `IPPVendorCredit`, `IPPLine`, `IPPAccountBasedExpenseLineDetail`,
 * `IPPItemLineDetail` (`ClassRef`), `IPPNameBase`, `IPPCustomer`, `IPPPurchaseOrder` (`POStatus`,
 * `ManuallyClosed`), `IPPPurchaseByVendor` (`VendorRef`), `IPPLinkedTxn` (`TxnId`, `TxnType`,
 * `TxnLineId`), `IPPJournalEntry`, `IPPJournalEntryLineDetail` (`PostingType`, `Entity`,
 * `AccountRef`, `ClassRef`), `IPPEntityTypeRef` (`Type`, `EntityRef`), `IPPAccount` (`Classification`, `AccountType`);
 * read 2026-11-26). Payroll run in QuickBooks
 * Payroll is not an Accounting API entity and is not read; QuickBooks "Projects" `ProjectRef` is
 * not read either (a project is also a sub-customer, which is what `CustomerRef` names).
 *
 * The adapters stay untouched: `costReaderFor(books)` returns a reader for the QuickBooks Online
 * adapter (through its client) or for the in-memory fake (seeded with `fakeCosts(books)`).
 */
import { FakeAccountingSync } from "./fake.ts";
import { amountToCents } from "./money.ts";
import type { AccountingSync, Cents, IsoDate } from "./port.ts";
import { type QboClient, type QboRef, QuickBooksOnlineSync } from "./qbo.ts";

export type ExpenseTxnType = "Bill" | "Purchase" | "VendorCredit" | "JournalEntry";

/**
 * An account is a cost account when QuickBooks classifies it "Expense" or its type is one of these
 * (`AccountClassificationEnum`, `AccountTypeEnum` in Intuit's Finance.xsd, read 2026-11-26).
 */
const COST_CLASSIFICATION = "Expense";
const COST_ACCOUNT_TYPES: ReadonlySet<string> = new Set([
  "Cost of Goods Sold",
  "Expense",
  "Other Expense",
]);
/** `EntityTypeEnum`: "Job" is the older name some companies' entries still carry. */
const CUSTOMER_ENTITY: ReadonlySet<string> = new Set(["Customer", "Job"]);

export interface CostCustomer {
  id: string;
  displayName: string;
  /** "Parent:Child" for a job under a customer; the display name for a top-level customer. */
  fullyQualifiedName: string;
  parentId?: string;
}

export interface ExpenseLine {
  txnType: ExpenseTxnType;
  txnId: string;
  /** The line's own id inside the transaction. */
  lineId: string;
  txnDate: IsoDate;
  docNumber?: string;
  /** Check, Cash or CreditCard for a Purchase. */
  paymentType?: string;
  vendorName?: string;
  /** The line's customer or job, when it names one. */
  customerId?: string;
  /** The line's class, when it carries one. */
  classId?: string;
  /** The expense account (account-based lines) or the item (item-based lines). */
  accountName?: string;
  itemName?: string;
  description?: string;
  /** Signed: vendor credits and card credits are negative. */
  amountCents: Cents;
  /**
   * The purchase order this line was made from in QuickBooks (the line's `LinkedTxn` of type
   * `PurchaseOrder`). `lineId` is absent when QuickBooks names only the order.
   */
  purchaseOrder?: { txnId: string; lineId?: string };
}

/** One purchase-order line tagged to a customer: a commitment, not a cost. */
export interface PurchaseOrderLine {
  txnId: string;
  lineId: string;
  txnDate: IsoDate;
  docNumber?: string;
  vendorName?: string;
  customerId?: string;
  /** The line's class, or the order's own class when the line has none. */
  classId?: string;
  accountName?: string;
  itemName?: string;
  description?: string;
  /** The ordered amount, positive. */
  amountCents: Cents;
  /** QuickBooks' `POStatus`: "Open" until the order is fully billed or closed by hand. */
  status: "Open" | "Closed" | null;
  /** `ManuallyClosed`: closed by a person, so the part not yet billed is no longer to come. */
  manuallyClosed: boolean;
}

export interface PurchaseOrderResult {
  lines: PurchaseOrderLine[];
  truncated: boolean;
}

export interface ExpenseQuery {
  fromDate: IsoDate;
  toDate: IsoDate;
  /** Lines tagged to one of these customer ids are returned. */
  customerIds: string[];
  /** And lines tagged to one of these class ids (a company that tracks jobs by class). */
  classIds?: string[];
}

export interface ExpenseResult {
  lines: ExpenseLine[];
  /** True when a page cap was reached and older transactions in the window were not read. */
  truncated: boolean;
}

export interface JobCostReader {
  /** Active customers and jobs (sub-customers), sorted by fully qualified name. */
  listCustomers(): Promise<CostCustomer[]>;
  listExpenseLines(query: ExpenseQuery): Promise<ExpenseResult>;
  /** Purchase-order lines tagged to the customers, by the order's date. */
  listPurchaseOrderLines(query: ExpenseQuery): Promise<PurchaseOrderResult>;
}

// ---- Wire types (only what is read) ----

interface QboExpenseDetail {
  CustomerRef?: QboRef;
  ClassRef?: QboRef;
  AccountRef?: QboRef;
  ItemRef?: QboRef;
}

interface QboLinkedTxn {
  TxnId?: string;
  TxnType?: string;
  TxnLineId?: string;
}

interface QboJournalDetail {
  PostingType?: string;
  Entity?: { Type?: string; EntityRef?: QboRef };
  AccountRef?: QboRef;
  ClassRef?: QboRef;
}

interface QboExpenseLine {
  Id?: string;
  Amount?: number;
  Description?: string;
  DetailType?: string;
  LinkedTxn?: QboLinkedTxn[];
  AccountBasedExpenseLineDetail?: QboExpenseDetail;
  ItemBasedExpenseLineDetail?: QboExpenseDetail;
  JournalEntryLineDetail?: QboJournalDetail;
}

interface QboExpenseTxn {
  Id: string;
  TxnDate?: string;
  DocNumber?: string;
  PaymentType?: string;
  Credit?: boolean;
  VendorRef?: QboRef;
  EntityRef?: QboRef;
  /** Purchase orders only. */
  POStatus?: string;
  ManuallyClosed?: boolean;
  /** Purchase orders only: the order's own class. */
  ClassRef?: QboRef;
  Line?: QboExpenseLine[];
}

interface QboAccount {
  Id: string;
  Name?: string;
  Classification?: string;
  AccountType?: string;
}

interface QboCostCustomer {
  Id: string;
  DisplayName: string;
  FullyQualifiedName?: string;
  ParentRef?: QboRef;
  Active?: boolean;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** 1,000 rows a page (QuickBooks' maximum), at most this many pages per entity. */
export const PAGE_SIZE = 1000;
export const MAX_PAGES = 10;

function expenseDetail(l: QboExpenseLine) {
  return l.DetailType === "AccountBasedExpenseLineDetail"
    ? l.AccountBasedExpenseLineDetail
    : l.DetailType === "ItemBasedExpenseLineDetail"
      ? l.ItemBasedExpenseLineDetail
      : undefined;
}

/** Which customers and classes a read wants. */
export interface JobMatch {
  customerIds: ReadonlySet<string>;
  classIds: ReadonlySet<string>;
}

/** A match from a query (or from customer ids alone). Exported for tests. */
export function jobMatch(q: {
  customerIds: readonly string[];
  classIds?: readonly string[];
}): JobMatch {
  return { customerIds: new Set(q.customerIds), classIds: new Set(q.classIds ?? []) };
}

const emptyMatch = (m: JobMatch) => m.customerIds.size === 0 && m.classIds.size === 0;

/** The line is the job's when its customer or its class is one the read wants. */
const matches = (m: JobMatch, customerId: string | undefined, classId: string | undefined) =>
  (!!customerId && m.customerIds.has(customerId)) || (!!classId && m.classIds.has(classId));

function purchaseOrderOf(l: QboExpenseLine): ExpenseLine["purchaseOrder"] {
  const link = (l.LinkedTxn ?? []).find((t) => t.TxnType === "PurchaseOrder" && t.TxnId);
  if (!link?.TxnId) return undefined;
  return { txnId: link.TxnId, ...(link.TxnLineId ? { lineId: link.TxnLineId } : {}) };
}

/** Map one transaction's lines for the wanted customers. Exported for tests. */
export function expenseLinesOf(
  txnType: ExpenseTxnType,
  txn: QboExpenseTxn,
  match: JobMatch,
): ExpenseLine[] {
  const out: ExpenseLine[] = [];
  const negative = txnType === "VendorCredit" || (txnType === "Purchase" && txn.Credit === true);
  const vendor = (txnType === "Purchase" ? txn.EntityRef : txn.VendorRef)?.name;
  (txn.Line ?? []).forEach((l, i) => {
    const detail = expenseDetail(l);
    const customerId = detail?.CustomerRef?.value;
    const classId = detail?.ClassRef?.value;
    if (!detail || !matches(match, customerId, classId)) return;
    const cents = amountToCents(l.Amount);
    if (cents === 0) return;
    const po = purchaseOrderOf(l);
    out.push({
      txnType,
      txnId: txn.Id,
      lineId: l.Id ?? String(i + 1),
      txnDate: txn.TxnDate ?? "",
      ...(txn.DocNumber ? { docNumber: txn.DocNumber } : {}),
      ...(txnType === "Purchase" && txn.PaymentType ? { paymentType: txn.PaymentType } : {}),
      ...(vendor ? { vendorName: vendor } : {}),
      ...(customerId ? { customerId } : {}),
      ...(classId ? { classId } : {}),
      ...(detail.AccountRef?.name ? { accountName: detail.AccountRef.name } : {}),
      ...(detail.ItemRef?.name ? { itemName: detail.ItemRef.name } : {}),
      ...(l.Description ? { description: l.Description } : {}),
      amountCents: negative ? -cents : cents,
      ...(po ? { purchaseOrder: po } : {}),
    });
  });
  return out;
}

/** A journal line's customer: its entity when that is a customer or job. */
const journalCustomer = (d: QboJournalDetail | undefined) =>
  CUSTOMER_ENTITY.has(d?.Entity?.Type ?? "") ? d?.Entity?.EntityRef?.value || undefined : undefined;

/**
 * Map one journal entry's lines for the wanted customers and classes: a line counts when its
 * entity is one of the customers, or its class one of the classes, and its account is in
 * `costAccountIds` (expense accounts). Debits are costs, credits count negative. Exported for tests.
 */
export function journalLinesOf(
  txn: QboExpenseTxn,
  match: JobMatch,
  costAccountIds: ReadonlySet<string>,
): ExpenseLine[] {
  const out: ExpenseLine[] = [];
  (txn.Line ?? []).forEach((l, i) => {
    if (l.DetailType !== "JournalEntryLineDetail") return;
    const d = l.JournalEntryLineDetail;
    const customerId = journalCustomer(d);
    const classId = d?.ClassRef?.value;
    if (!d || !matches(match, customerId, classId)) return;
    const accountId = d.AccountRef?.value;
    if (!accountId || !costAccountIds.has(accountId)) return;
    if (d.PostingType !== "Debit" && d.PostingType !== "Credit") return;
    const cents = amountToCents(l.Amount);
    if (cents === 0) return;
    out.push({
      txnType: "JournalEntry",
      txnId: txn.Id,
      lineId: l.Id ?? String(i + 1),
      txnDate: txn.TxnDate ?? "",
      ...(txn.DocNumber ? { docNumber: txn.DocNumber } : {}),
      ...(customerId ? { customerId } : {}),
      ...(classId ? { classId } : {}),
      ...(d.AccountRef?.name ? { accountName: d.AccountRef.name } : {}),
      ...(l.Description ? { description: l.Description } : {}),
      amountCents: d.PostingType === "Credit" ? -cents : cents,
    });
  });
  return out;
}

/** The ids of the expense accounts among these (journal-entry lines on them are costs). */
export function costAccountIdsOf(accounts: readonly QboAccount[]): Set<string> {
  return new Set(
    accounts
      .filter(
        (a) =>
          a.Classification === COST_CLASSIFICATION || COST_ACCOUNT_TYPES.has(a.AccountType ?? ""),
      )
      .map((a) => a.Id),
  );
}

const namesJob = (txn: QboExpenseTxn, m: JobMatch) =>
  (txn.Line ?? []).some((l) => {
    const d = l.JournalEntryLineDetail;
    return matches(m, journalCustomer(d), d?.ClassRef?.value);
  });

/** Map one purchase order's lines for the wanted customers. Exported for tests. */
export function purchaseOrderLinesOf(txn: QboExpenseTxn, match: JobMatch): PurchaseOrderLine[] {
  const out: PurchaseOrderLine[] = [];
  const status = txn.POStatus === "Open" || txn.POStatus === "Closed" ? txn.POStatus : null;
  (txn.Line ?? []).forEach((l, i) => {
    const detail = expenseDetail(l);
    const customerId = detail?.CustomerRef?.value;
    const classId = detail?.ClassRef?.value ?? txn.ClassRef?.value;
    if (!detail || !matches(match, customerId, classId)) return;
    const cents = amountToCents(l.Amount);
    if (cents <= 0) return;
    out.push({
      txnId: txn.Id,
      lineId: l.Id ?? String(i + 1),
      txnDate: txn.TxnDate ?? "",
      ...(txn.DocNumber ? { docNumber: txn.DocNumber } : {}),
      ...(txn.VendorRef?.name ? { vendorName: txn.VendorRef.name } : {}),
      ...(customerId ? { customerId } : {}),
      ...(classId ? { classId } : {}),
      ...(detail.AccountRef?.name ? { accountName: detail.AccountRef.name } : {}),
      ...(detail.ItemRef?.name ? { itemName: detail.ItemRef.name } : {}),
      ...(l.Description ? { description: l.Description } : {}),
      amountCents: cents,
      status,
      manuallyClosed: txn.ManuallyClosed === true,
    });
  });
  return out;
}

const poByDate = (a: PurchaseOrderLine, b: PurchaseOrderLine) =>
  a.txnDate.localeCompare(b.txnDate) ||
  a.txnId.localeCompare(b.txnId, undefined, { numeric: true }) ||
  a.lineId.localeCompare(b.lineId, undefined, { numeric: true });

function checkQuery(q: ExpenseQuery) {
  if (!ISO.test(q.fromDate) || !ISO.test(q.toDate)) {
    throw new Error("fromDate and toDate must be YYYY-MM-DD");
  }
  if (q.fromDate > q.toDate) throw new Error("fromDate is after toDate");
}

const byDate = (a: ExpenseLine, b: ExpenseLine) =>
  a.txnDate.localeCompare(b.txnDate) ||
  a.txnType.localeCompare(b.txnType) ||
  a.txnId.localeCompare(b.txnId, undefined, { numeric: true }) ||
  a.lineId.localeCompare(b.lineId, undefined, { numeric: true });

/** Reads through the QuickBooks Online client, one page of 1,000 at a time. */
export class QboCostReader implements JobCostReader {
  private readonly client: QboClient;
  constructor(client: QboClient) {
    this.client = client;
  }

  private async pages<T>(
    entity: string,
    where: string,
  ): Promise<{ rows: T[]; truncated: boolean }> {
    const rows: T[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const sql = `select * from ${entity}${where ? ` where ${where}` : ""} startposition ${
        page * PAGE_SIZE + 1
      } maxresults ${PAGE_SIZE}`;
      const res = await this.client.request<{ QueryResponse?: Record<string, unknown> }>(
        "GET",
        "query",
        { query: { query: sql } },
      );
      const got = res.QueryResponse?.[entity];
      const list = Array.isArray(got) ? (got as T[]) : [];
      rows.push(...list);
      if (list.length < PAGE_SIZE) return { rows, truncated: false };
    }
    return { rows, truncated: true };
  }

  async listCustomers(): Promise<CostCustomer[]> {
    const { rows } = await this.pages<QboCostCustomer>("Customer", "");
    return rows
      .filter((c) => c.Active !== false)
      .map((c) => ({
        id: c.Id,
        displayName: c.DisplayName,
        fullyQualifiedName: c.FullyQualifiedName ?? c.DisplayName,
        ...(c.ParentRef?.value ? { parentId: c.ParentRef.value } : {}),
      }))
      .sort((a, b) => a.fullyQualifiedName.localeCompare(b.fullyQualifiedName));
  }

  async listExpenseLines(q: ExpenseQuery): Promise<ExpenseResult> {
    checkQuery(q);
    const m = jobMatch(q);
    if (emptyMatch(m)) return { lines: [], truncated: false };
    // Dates are checked against ISO above, so they are safe inside the quoted literal.
    const where = `TxnDate >= '${q.fromDate}' and TxnDate <= '${q.toDate}'`;
    const lines: ExpenseLine[] = [];
    let truncated = false;
    for (const entity of ["Bill", "Purchase", "VendorCredit"] as const) {
      const r = await this.pages<QboExpenseTxn>(entity, where);
      truncated ||= r.truncated;
      for (const t of r.rows) lines.push(...expenseLinesOf(entity, t, m));
    }
    const je = await this.pages<QboExpenseTxn>("JournalEntry", where);
    truncated ||= je.truncated;
    const naming = je.rows.filter((t) => namesJob(t, m));
    if (naming.length > 0) {
      // The chart of accounts is read only when a journal entry names the job: a journal line
      // carries its account's id and name but not its type.
      const accounts = await this.pages<QboAccount>("Account", "");
      const costIds = costAccountIdsOf(accounts.rows);
      for (const t of naming) lines.push(...journalLinesOf(t, m, costIds));
    }
    return { lines: lines.sort(byDate), truncated };
  }

  async listPurchaseOrderLines(q: ExpenseQuery): Promise<PurchaseOrderResult> {
    checkQuery(q);
    const m = jobMatch(q);
    if (emptyMatch(m)) return { lines: [], truncated: false };
    const where = `TxnDate >= '${q.fromDate}' and TxnDate <= '${q.toDate}'`;
    const r = await this.pages<QboExpenseTxn>("PurchaseOrder", where);
    const lines = r.rows.flatMap((t) => purchaseOrderLinesOf(t, m));
    return { lines: lines.sort(poByDate), truncated: r.truncated };
  }
}

// ---- The fake ----

export interface FakeExpenseInput {
  txnType: ExpenseTxnType;
  txnDate: IsoDate;
  docNumber?: string;
  paymentType?: "Check" | "Cash" | "CreditCard";
  /** A card refund (Purchase only): counts negative. */
  credit?: boolean;
  vendorName?: string;
  lines: {
    /** The purchase order (and its line) this bill or check line was made from. */
    purchaseOrder?: { txnId: string; lineId?: string };
    customerId?: string;
    /** The line's class (a company that tracks jobs by class). */
    classId?: string;
    accountName?: string;
    itemName?: string;
    description?: string;
    /** Positive, as QuickBooks stores it; the sign comes from the transaction type. */
    amountCents: Cents;
  }[];
}

export interface FakeJournalEntryInput {
  txnDate: IsoDate;
  docNumber?: string;
  lines: {
    postingType: "Debit" | "Credit";
    accountName: string;
    /** The account's QuickBooks classification; "Expense" (the default) makes its lines costs. */
    classification?: "Expense" | "Liability" | "Asset" | "Revenue" | "Equity";
    customerId?: string;
    classId?: string;
    description?: string;
    /** Positive, as QuickBooks stores it; the sign comes from the posting type. */
    amountCents: Cents;
  }[];
}

export interface FakePurchaseOrderInput {
  txnDate: IsoDate;
  docNumber?: string;
  vendorName?: string;
  status?: "Open" | "Closed";
  manuallyClosed?: boolean;
  /** The order's own class, for lines that carry none. */
  classId?: string;
  lines: {
    customerId?: string;
    classId?: string;
    accountName?: string;
    itemName?: string;
    description?: string;
    amountCents: Cents;
  }[];
}

const fakeLines = (lines: FakeExpenseInput["lines"]): QboExpenseLine[] =>
  lines.map((l, i) => {
    const detail: QboExpenseDetail = {
      ...(l.customerId ? { CustomerRef: { value: l.customerId } } : {}),
      ...(l.classId ? { ClassRef: { value: l.classId } } : {}),
      ...(l.accountName
        ? { AccountRef: { value: `a-${l.accountName}`, name: l.accountName } }
        : {}),
      ...(l.itemName ? { ItemRef: { value: `i-${l.itemName}`, name: l.itemName } } : {}),
    };
    return {
      Id: String(i + 1),
      Amount: l.amountCents / 100,
      ...(l.description ? { Description: l.description } : {}),
      ...(l.purchaseOrder
        ? {
            LinkedTxn: [
              {
                TxnId: l.purchaseOrder.txnId,
                TxnType: "PurchaseOrder",
                ...(l.purchaseOrder.lineId ? { TxnLineId: l.purchaseOrder.lineId } : {}),
              },
            ],
          }
        : {}),
      ...(l.itemName
        ? { DetailType: "ItemBasedExpenseLineDetail", ItemBasedExpenseLineDetail: detail }
        : { DetailType: "AccountBasedExpenseLineDetail", AccountBasedExpenseLineDetail: detail }),
    };
  });

/** In-memory customers and expense transactions for one fake company (tests and the demo). */
export class FakeCostBook implements JobCostReader {
  readonly customers: CostCustomer[] = [];
  readonly txns: { type: ExpenseTxnType; txn: QboExpenseTxn }[] = [];
  readonly purchaseOrders: QboExpenseTxn[] = [];
  readonly journalEntries: QboExpenseTxn[] = [];
  readonly accounts: QboAccount[] = [];
  private seq = 0;
  /** Lines with a customer outside this list are left out, as QuickBooks' inactive customers are. */
  readonly inactiveCustomers = new Set<string>();

  addCustomer(displayName: string, parentId?: string): CostCustomer {
    this.seq += 1;
    const parent = parentId ? this.customers.find((c) => c.id === parentId) : undefined;
    const c: CostCustomer = {
      id: `c${this.seq}`,
      displayName,
      fullyQualifiedName: parent ? `${parent.fullyQualifiedName}:${displayName}` : displayName,
      ...(parentId ? { parentId } : {}),
    };
    this.customers.push(c);
    return c;
  }

  addExpense(input: FakeExpenseInput): string {
    this.seq += 1;
    const id = String(1000 + this.seq);
    const ref = input.vendorName
      ? { value: `v-${input.vendorName}`, name: input.vendorName }
      : undefined;
    this.txns.push({
      type: input.txnType,
      txn: {
        Id: id,
        TxnDate: input.txnDate,
        ...(input.docNumber ? { DocNumber: input.docNumber } : {}),
        ...(input.paymentType ? { PaymentType: input.paymentType } : {}),
        ...(input.credit ? { Credit: true } : {}),
        ...(ref ? (input.txnType === "Purchase" ? { EntityRef: ref } : { VendorRef: ref }) : {}),
        Line: fakeLines(input.lines),
      },
    });
    return id;
  }

  /** A journal entry, as an outside payroll service posts one (accounts are made on first use). */
  addJournalEntry(input: FakeJournalEntryInput): string {
    this.seq += 1;
    const id = String(1000 + this.seq);
    const line: QboExpenseLine[] = input.lines.map((l, i) => {
      let acct = this.accounts.find((a) => a.Name === l.accountName);
      if (!acct) {
        acct = {
          Id: `a-${l.accountName}`,
          Name: l.accountName,
          Classification: l.classification ?? "Expense",
        };
        this.accounts.push(acct);
      }
      return {
        Id: String(i),
        Amount: l.amountCents / 100,
        ...(l.description ? { Description: l.description } : {}),
        DetailType: "JournalEntryLineDetail",
        JournalEntryLineDetail: {
          PostingType: l.postingType,
          AccountRef: { value: acct.Id, name: l.accountName },
          ...(l.classId ? { ClassRef: { value: l.classId } } : {}),
          ...(l.customerId
            ? { Entity: { Type: "Customer", EntityRef: { value: l.customerId } } }
            : {}),
        },
      };
    });
    this.journalEntries.push({
      Id: id,
      TxnDate: input.txnDate,
      ...(input.docNumber ? { DocNumber: input.docNumber } : {}),
      Line: line,
    });
    return id;
  }

  addPurchaseOrder(input: FakePurchaseOrderInput): string {
    this.seq += 1;
    const id = String(1000 + this.seq);
    this.purchaseOrders.push({
      Id: id,
      TxnDate: input.txnDate,
      ...(input.docNumber ? { DocNumber: input.docNumber } : {}),
      ...(input.vendorName
        ? { VendorRef: { value: `v-${input.vendorName}`, name: input.vendorName } }
        : {}),
      POStatus: input.status ?? "Open",
      ...(input.manuallyClosed ? { ManuallyClosed: true } : {}),
      ...(input.classId ? { ClassRef: { value: input.classId } } : {}),
      Line: fakeLines(input.lines),
    });
    return id;
  }

  /** Close (or reopen) a purchase order after the fact. */
  setPurchaseOrderStatus(txnId: string, status: "Open" | "Closed", manuallyClosed = false) {
    const po = this.purchaseOrders.find((t) => t.Id === txnId);
    if (!po) return;
    po.POStatus = status;
    po.ManuallyClosed = manuallyClosed;
  }

  /** Change one line's amount after the fact (tests: a bill or order edited in QuickBooks). */
  setLineAmount(txnId: string, lineId: string, amountCents: Cents) {
    const txn =
      this.txns.find((t) => t.txn.Id === txnId)?.txn ??
      this.purchaseOrders.find((t) => t.Id === txnId) ??
      this.journalEntries.find((t) => t.Id === txnId);
    const line = txn?.Line?.find((l) => l.Id === lineId);
    if (line) line.Amount = amountCents / 100;
  }

  async listCustomers(): Promise<CostCustomer[]> {
    return this.customers
      .filter((c) => !this.inactiveCustomers.has(c.id))
      .map((c) => ({ ...c }))
      .sort((a, b) => a.fullyQualifiedName.localeCompare(b.fullyQualifiedName));
  }

  async listExpenseLines(q: ExpenseQuery): Promise<ExpenseResult> {
    checkQuery(q);
    const m = jobMatch(q);
    const inWindow = (d: string | undefined) => (d ?? "") >= q.fromDate && (d ?? "") <= q.toDate;
    const lines = this.txns
      .filter((t) => inWindow(t.txn.TxnDate))
      .flatMap((t) => expenseLinesOf(t.type, t.txn, m));
    const costIds = costAccountIdsOf(this.accounts);
    for (const t of this.journalEntries.filter((j) => inWindow(j.TxnDate))) {
      lines.push(...journalLinesOf(t, m, costIds));
    }
    return { lines: lines.sort(byDate), truncated: false };
  }

  async listPurchaseOrderLines(q: ExpenseQuery): Promise<PurchaseOrderResult> {
    checkQuery(q);
    const m = jobMatch(q);
    const lines = this.purchaseOrders
      .filter((t) => (t.TxnDate ?? "") >= q.fromDate && (t.TxnDate ?? "") <= q.toDate)
      .flatMap((t) => purchaseOrderLinesOf(t, m));
    return { lines: lines.sort(poByDate), truncated: false };
  }
}

const fakeBooks = new WeakMap<FakeAccountingSync, FakeCostBook>();

/** The cost book behind a fake company, created on first use. */
export function fakeCosts(books: FakeAccountingSync): FakeCostBook {
  let b = fakeBooks.get(books);
  if (!b) {
    b = new FakeCostBook();
    fakeBooks.set(books, b);
  }
  return b;
}

/** A cost reader for the company behind an AccountingSync adapter. */
export function costReaderFor(books: AccountingSync): JobCostReader {
  if (books instanceof QuickBooksOnlineSync) return new QboCostReader(books.client);
  if (books instanceof FakeAccountingSync) return fakeCosts(books);
  throw new Error("This accounting adapter cannot read job costs");
}
