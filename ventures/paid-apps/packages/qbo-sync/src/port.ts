/**
 * The AccountingSync port: what an app needs from an accounting system, in the app's own terms.
 *
 * Money is always integer cents in this port. Implementations convert at their boundary
 * (QuickBooks Online uses decimal amounts). Dates are ISO calendar dates, "YYYY-MM-DD".
 */

export type Cents = number;
export type IsoDate = string;

export interface CustomerInput {
  /** Unique per company in QuickBooks Online; used as the match key by `upsertCustomer`. */
  displayName: string;
  companyName?: string;
  email?: string;
}

export interface Customer {
  id: string;
  syncToken: string;
  displayName: string;
  companyName?: string;
  email?: string;
}

export type ItemType = "Service" | "NonInventory";

export interface ItemInput {
  /** Match key for `ensureItem`. */
  name: string;
  type: ItemType;
  /** Account the item posts to when it appears on an invoice line. */
  incomeAccountId: string;
  description?: string;
}

export interface Item {
  id: string;
  syncToken: string;
  name: string;
  type: string;
  incomeAccountId?: string;
  /** The income account's name, when the accounting system returns it with the item. */
  incomeAccountName?: string;
}

export type AccountType = "Other Current Asset" | "Income" | "Other Current Liability";

export interface AccountInput {
  /** Match key for `ensureAccount`. */
  name: string;
  accountType: AccountType;
  /** An AccountSubTypeEnum value, e.g. "OtherCurrentAssets". */
  accountSubType?: string;
  description?: string;
}

export interface Account {
  id: string;
  syncToken: string;
  name: string;
  accountType: string;
  accountSubType?: string;
}

export interface InvoiceLineInput {
  itemId: string;
  /** Signed: a negative amount is allowed (the retainage-held line is negative). */
  amountCents: Cents;
  description?: string;
  qty?: number;
  /** When set with `qty`, unitPriceCents × qty must equal amountCents. */
  unitPriceCents?: Cents;
}

export interface InvoiceInput {
  customerId: string;
  /** Your reference (e.g. "PA-0003"). Used for idempotent retries via `findInvoiceByDocNumber`. */
  docNumber?: string;
  txnDate?: IsoDate;
  dueDate?: IsoDate;
  privateNote?: string;
  /**
   * The invoice's own billing email (QuickBooks `BillEmail`), where QuickBooks sends the invoice
   * when the user emails it from QuickBooks. One address. Set per invoice, not on the customer, so
   * two jobs for the same customer can bill different contacts.
   */
  billEmail?: string;
  lines: InvoiceLineInput[];
}

export interface InvoiceLine {
  itemId: string;
  amountCents: Cents;
  description?: string;
  qty?: number;
  unitPriceCents?: Cents;
}

export interface Invoice {
  id: string;
  syncToken: string;
  customerId: string;
  docNumber?: string;
  txnDate?: IsoDate;
  dueDate?: IsoDate;
  billEmail?: string;
  totalCents: Cents;
  balanceCents: Cents;
  lines: InvoiceLine[];
}

export interface PaymentApplication {
  invoiceId: string;
  amountCents: Cents;
}

export interface PaymentInput {
  customerId: string;
  totalCents: Cents;
  txnDate?: IsoDate;
  /** Check number or processor reference. */
  paymentRefNum?: string;
  /** Sum may be less than totalCents; the remainder stays unapplied on the customer. */
  applyTo: PaymentApplication[];
  /**
   * Idempotency key, sent as QuickBooks' `requestid` query parameter (Intuit's Java SDK sends a
   * 32-character hex id on every create). Use one stable id per payment so a retry after a lost
   * response does not record the payment twice. Letters, digits and hyphens, at most 50.
   */
  requestId?: string;
}

export interface Payment {
  id: string;
  syncToken: string;
  customerId: string;
  totalCents: Cents;
  unappliedCents: Cents;
  txnDate?: IsoDate;
  paymentRefNum?: string;
  appliedTo: PaymentApplication[];
}

export interface CreditMemoInput {
  customerId: string;
  /** Your reference (e.g. "CR24-117-03"). Used for idempotent retries via `findCreditMemoByDocNumber`. */
  docNumber?: string;
  txnDate?: IsoDate;
  privateNote?: string;
  /** Positive amounts: what the customer is credited. */
  lines: InvoiceLineInput[];
  /** Idempotency key, sent as `requestid` (see `PaymentInput.requestId`). */
  requestId?: string;
}

export interface CreditMemo {
  id: string;
  syncToken: string;
  customerId: string;
  docNumber?: string;
  txnDate?: IsoDate;
  totalCents: Cents;
  /** Credit not yet applied to any invoice (QuickBooks `RemainingCredit`). */
  remainingCents: Cents;
}

/**
 * Apply part of a credit memo to one invoice: in QuickBooks Online a payment of zero whose lines
 * link the invoice and the credit memo for the same amount.
 */
export interface CreditApplicationInput {
  customerId: string;
  invoiceId: string;
  creditMemoId: string;
  amountCents: Cents;
  txnDate?: IsoDate;
  requestId?: string;
}

/** The account and item used by the retainage pattern (see retainage.ts and the README). */
export interface RetainageSetup {
  account: Account;
  item: Item;
}

export interface RetainageSetupOptions {
  accountName?: string;
  itemName?: string;
  /** Defaults to "OtherCurrentAssets". */
  accountSubType?: string;
}

export const DEFAULT_RETAINAGE_ACCOUNT_NAME = "Retainage Receivable";
export const DEFAULT_RETAINAGE_ITEM_NAME = "Retainage";

export interface AccountingSync {
  findCustomerByDisplayName(displayName: string): Promise<Customer | null>;
  /** Find by display name; create if missing; update email/company name if they differ. */
  upsertCustomer(input: CustomerInput): Promise<Customer>;

  findItemByName(name: string): Promise<Item | null>;
  /** Find by name or create. An existing item is returned unchanged. */
  ensureItem(input: ItemInput): Promise<Item>;
  /** One active item by id; null when it does not exist or was made inactive. */
  getItem(id: string): Promise<Item | null>;
  /**
   * The active Service and NonInventory items that post to an income account: the items a
   * company could bill a pay application with. Sorted by name; at most 1,000.
   */
  listSaleItems(): Promise<Item[]>;

  findAccountByName(name: string): Promise<Account | null>;
  /** Find by name or create. An existing account is returned unchanged. */
  ensureAccount(input: AccountInput): Promise<Account>;

  createInvoice(input: InvoiceInput): Promise<Invoice>;
  getInvoice(id: string): Promise<Invoice | null>;
  findInvoiceByDocNumber(docNumber: string): Promise<Invoice | null>;

  recordPayment(input: PaymentInput): Promise<Payment>;
  getPayment(id: string): Promise<Payment | null>;

  createCreditMemo(input: CreditMemoInput): Promise<CreditMemo>;
  getCreditMemo(id: string): Promise<CreditMemo | null>;
  findCreditMemoByDocNumber(docNumber: string): Promise<CreditMemo | null>;
  /** Apply a credit memo to an invoice (a zero payment linking both). */
  applyCreditMemo(input: CreditApplicationInput): Promise<Payment>;

  /** Ensure the retainage-receivable account and the retainage item exist. Idempotent. */
  ensureRetainageSetup(options?: RetainageSetupOptions): Promise<RetainageSetup>;
}

/** Thrown for invalid input before anything is sent to the accounting system. */
export class AccountingValidationError extends Error {
  override name = "AccountingValidationError";
}

/** QuickBooks Online caps an email address at 100 characters. */
export const QBO_EMAIL_MAX = 100;

/** One plain address: no spaces, commas, semicolons or angle brackets, one "@", a dotted domain. */
export function isSingleEmailAddress(value: string): boolean {
  return value.length <= QBO_EMAIL_MAX && /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>".]+$/.test(value);
}

export function validateInvoiceInput(input: InvoiceInput): void {
  if (!input.customerId) throw new AccountingValidationError("customerId is required");
  if (input.billEmail !== undefined && !isSingleEmailAddress(input.billEmail)) {
    throw new AccountingValidationError("billEmail must be one email address");
  }
  if (input.lines.length === 0) {
    throw new AccountingValidationError("an invoice needs at least one line");
  }
  let total = 0;
  for (const [i, line] of input.lines.entries()) {
    if (!line.itemId) throw new AccountingValidationError(`line ${i}: itemId is required`);
    if (!Number.isInteger(line.amountCents)) {
      throw new AccountingValidationError(`line ${i}: amountCents must be an integer`);
    }
    if (line.unitPriceCents !== undefined && line.qty !== undefined) {
      const product = Math.round(line.unitPriceCents * line.qty);
      if (product !== line.amountCents) {
        throw new AccountingValidationError(
          `line ${i}: unitPriceCents × qty (${product}) does not equal amountCents (${line.amountCents})`,
        );
      }
    }
    total += line.amountCents;
  }
  if (total < 0) {
    throw new AccountingValidationError(`invoice total is negative (${total} cents)`);
  }
  for (const [field, value] of [
    ["txnDate", input.txnDate],
    ["dueDate", input.dueDate],
  ] as const) {
    if (value !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new AccountingValidationError(`${field} must be YYYY-MM-DD`);
    }
  }
}

export function validatePaymentInput(input: PaymentInput): void {
  if (!input.customerId) throw new AccountingValidationError("customerId is required");
  if (!Number.isInteger(input.totalCents) || input.totalCents <= 0) {
    throw new AccountingValidationError("totalCents must be a positive integer");
  }
  let applied = 0;
  for (const a of input.applyTo) {
    if (!Number.isInteger(a.amountCents) || a.amountCents <= 0) {
      throw new AccountingValidationError("each applied amount must be a positive integer");
    }
    applied += a.amountCents;
  }
  if (applied > input.totalCents) {
    throw new AccountingValidationError(
      `applied amounts (${applied}) exceed the payment total (${input.totalCents})`,
    );
  }
  if (input.requestId !== undefined && !/^[A-Za-z0-9-]{1,50}$/.test(input.requestId)) {
    throw new AccountingValidationError("requestId must be 1-50 letters, digits or hyphens");
  }
}

const REQUEST_ID = /^[A-Za-z0-9-]{1,50}$/;

export function validateCreditMemoInput(input: CreditMemoInput): void {
  if (!input.customerId) throw new AccountingValidationError("customerId is required");
  if (input.lines.length === 0) {
    throw new AccountingValidationError("a credit memo needs at least one line");
  }
  for (const [i, line] of input.lines.entries()) {
    if (!line.itemId) throw new AccountingValidationError(`line ${i}: itemId is required`);
    if (!Number.isInteger(line.amountCents) || line.amountCents <= 0) {
      throw new AccountingValidationError(`line ${i}: amountCents must be a positive integer`);
    }
  }
  if (input.txnDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.txnDate)) {
    throw new AccountingValidationError("txnDate must be YYYY-MM-DD");
  }
  if (input.requestId !== undefined && !REQUEST_ID.test(input.requestId)) {
    throw new AccountingValidationError("requestId must be 1-50 letters, digits or hyphens");
  }
}

export function validateCreditApplicationInput(input: CreditApplicationInput): void {
  if (!input.customerId) throw new AccountingValidationError("customerId is required");
  if (!input.invoiceId) throw new AccountingValidationError("invoiceId is required");
  if (!input.creditMemoId) throw new AccountingValidationError("creditMemoId is required");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new AccountingValidationError("amountCents must be a positive integer");
  }
  if (input.txnDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.txnDate)) {
    throw new AccountingValidationError("txnDate must be YYYY-MM-DD");
  }
  if (input.requestId !== undefined && !REQUEST_ID.test(input.requestId)) {
    throw new AccountingValidationError("requestId must be 1-50 letters, digits or hyphens");
  }
}
