/**
 * In-memory AccountingSync for tests and offline demos. It applies the same input validation as
 * the QuickBooks Online adapter and tracks invoice balances as payments are applied.
 */
import {
  type Account,
  type AccountInput,
  type AccountingSync,
  AccountingValidationError,
  type CreditApplicationInput,
  type CreditMemo,
  type CreditMemoInput,
  type Customer,
  type CustomerInput,
  DEFAULT_RETAINAGE_ACCOUNT_NAME,
  DEFAULT_RETAINAGE_ITEM_NAME,
  type Invoice,
  type InvoiceInput,
  type Item,
  type ItemInput,
  type Payment,
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

export class FakeAccountingSync implements AccountingSync {
  readonly customers = new Map<string, Customer>();
  readonly items = new Map<string, Item>();
  readonly accounts = new Map<string, Account>();
  readonly invoices = new Map<string, Invoice>();
  readonly payments = new Map<string, Payment>();
  readonly creditMemos = new Map<string, CreditMemo>();
  private readonly paymentsByRequestId = new Map<string, Payment>();
  private readonly invoicesByRequestId = new Map<string, Invoice>();
  private readonly creditMemosByRequestId = new Map<string, CreditMemo>();
  /**
   * QuickBooks' "Automatically apply credits" company setting (tests): a new credit memo is
   * applied at once to the customer's open invoices, oldest first.
   */
  autoApplyCredits = false;
  /** The company's tracking settings (tests): both off by default, as in a new company. */
  trackingPrefs: TrackingPrefs = {
    classTracking: "off",
    locationTracking: false,
    locationLabel: null,
  };
  readonly classes = new Map<string, TrackingCategory>();
  readonly locations = new Map<string, TrackingCategory>();
  /** Ids of classes and locations made inactive (tests): they no longer read or list. */
  readonly inactiveTracking = new Set<string>();
  /** Every mutating call, in order, for assertions. */
  readonly calls: { method: string; input: unknown }[] = [];
  private seq = 0;

  private nextId(): string {
    this.seq += 1;
    return String(this.seq);
  }

  private bump<T extends { syncToken: string }>(entity: T): T {
    return { ...entity, syncToken: String(Number(entity.syncToken) + 1) };
  }

  async findCustomerByDisplayName(displayName: string): Promise<Customer | null> {
    for (const c of this.customers.values()) if (c.displayName === displayName) return { ...c };
    return null;
  }

  async upsertCustomer(input: CustomerInput): Promise<Customer> {
    this.calls.push({ method: "upsertCustomer", input });
    if (!input.displayName.trim()) throw new AccountingValidationError("displayName is required");
    const existing = await this.findCustomerByDisplayName(input.displayName);
    if (!existing) {
      const c: Customer = {
        id: this.nextId(),
        syncToken: "0",
        displayName: input.displayName,
        ...(input.companyName ? { companyName: input.companyName } : {}),
        ...(input.email ? { email: input.email } : {}),
      };
      this.customers.set(c.id, c);
      return { ...c };
    }
    const changed =
      (input.companyName !== undefined && input.companyName !== existing.companyName) ||
      (input.email !== undefined && input.email !== existing.email);
    if (!changed) return existing;
    const updated = this.bump({
      ...existing,
      ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
    });
    this.customers.set(updated.id, updated);
    return { ...updated };
  }

  async findItemByName(name: string): Promise<Item | null> {
    for (const i of this.items.values()) if (i.name === name) return { ...i };
    return null;
  }

  async ensureItem(input: ItemInput): Promise<Item> {
    this.calls.push({ method: "ensureItem", input });
    const existing = await this.findItemByName(input.name);
    if (existing) return existing;
    if (!this.accounts.has(input.incomeAccountId)) {
      throw new AccountingValidationError(`unknown account ${input.incomeAccountId}`);
    }
    const item: Item = {
      id: this.nextId(),
      syncToken: "0",
      name: input.name,
      type: input.type,
      incomeAccountId: input.incomeAccountId,
    };
    this.items.set(item.id, item);
    return { ...item };
  }

  /** Ids of items made inactive (tests): they no longer read or list, as in QuickBooks. */
  readonly inactiveItems = new Set<string>();

  async getItem(id: string): Promise<Item | null> {
    const i = this.items.get(id);
    return i && !this.inactiveItems.has(id) ? { ...this.withAccountName(i) } : null;
  }

  async listSaleItems(): Promise<Item[]> {
    return [...this.items.values()]
      .filter(
        (i) =>
          !this.inactiveItems.has(i.id) &&
          (i.type === "Service" || i.type === "NonInventory") &&
          i.incomeAccountId !== undefined,
      )
      .map((i) => this.withAccountName(i))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private withAccountName(i: Item): Item {
    const name = i.incomeAccountId ? this.accounts.get(i.incomeAccountId)?.name : undefined;
    return name ? { ...i, incomeAccountName: name } : { ...i };
  }

  async findAccountByName(name: string): Promise<Account | null> {
    for (const a of this.accounts.values()) if (a.name === name) return { ...a };
    return null;
  }

  async ensureAccount(input: AccountInput): Promise<Account> {
    this.calls.push({ method: "ensureAccount", input });
    const existing = await this.findAccountByName(input.name);
    if (existing) return existing;
    const account: Account = {
      id: this.nextId(),
      syncToken: "0",
      name: input.name,
      accountType: input.accountType,
      ...(input.accountSubType ? { accountSubType: input.accountSubType } : {}),
    };
    this.accounts.set(account.id, account);
    return { ...account };
  }

  /** Adds a class (tests and the demo); `parent` makes it a subclass ("Parent:Name"). */
  addClass(name: string, parent?: TrackingCategory): TrackingCategory {
    const c = { id: this.nextId(), name, fullName: parent ? `${parent.fullName}:${name}` : name };
    this.classes.set(c.id, c);
    return { ...c };
  }

  /** Adds a location (a QuickBooks department) for tests and the demo. */
  addLocation(name: string, parent?: TrackingCategory): TrackingCategory {
    const l = { id: this.nextId(), name, fullName: parent ? `${parent.fullName}:${name}` : name };
    this.locations.set(l.id, l);
    return { ...l };
  }

  async getTrackingPrefs(): Promise<TrackingPrefs> {
    return { ...this.trackingPrefs };
  }

  private activeOf(map: Map<string, TrackingCategory>): TrackingCategory[] {
    return [...map.values()]
      .filter((c) => !this.inactiveTracking.has(c.id))
      .map((c) => ({ ...c }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async listClasses(): Promise<TrackingCategory[]> {
    return this.activeOf(this.classes);
  }

  async getClass(id: string): Promise<TrackingCategory | null> {
    const c = this.classes.get(id);
    return c && !this.inactiveTracking.has(id) ? { ...c } : null;
  }

  async listLocations(): Promise<TrackingCategory[]> {
    return this.activeOf(this.locations);
  }

  async getLocation(id: string): Promise<TrackingCategory | null> {
    const l = this.locations.get(id);
    return l && !this.inactiveTracking.has(id) ? { ...l } : null;
  }

  /** QuickBooks refuses a reference to a class or location that is not in the company. */
  private checkTracking(input: TransactionTracking, lines: { classId?: string }[]): void {
    const ids = [input.classId, ...lines.map((l) => l.classId)];
    for (const id of ids) {
      if (id !== undefined && !this.classes.has(id)) {
        throw new AccountingValidationError(`unknown class ${id}`);
      }
    }
    if (input.locationId !== undefined && !this.locations.has(input.locationId)) {
      throw new AccountingValidationError(`unknown location ${input.locationId}`);
    }
  }

  async createInvoice(input: InvoiceInput): Promise<Invoice> {
    this.calls.push({ method: "createInvoice", input });
    validateInvoiceInput(input);
    // QuickBooks answers a repeated requestid with the invoice the first request created.
    const prior = input.requestId ? this.invoicesByRequestId.get(input.requestId) : undefined;
    if (prior) return structuredClone(prior);
    this.checkTracking(input, input.lines);
    if (!this.customers.has(input.customerId)) {
      throw new AccountingValidationError(`unknown customer ${input.customerId}`);
    }
    for (const l of input.lines) {
      if (!this.items.has(l.itemId))
        throw new AccountingValidationError(`unknown item ${l.itemId}`);
    }
    if (input.docNumber && (await this.findInvoiceByDocNumber(input.docNumber))) {
      throw new AccountingValidationError(`duplicate DocNumber ${input.docNumber}`);
    }
    const total = input.lines.reduce((s, l) => s + l.amountCents, 0);
    const invoice: Invoice = {
      id: this.nextId(),
      syncToken: "0",
      customerId: input.customerId,
      ...(input.docNumber ? { docNumber: input.docNumber } : {}),
      ...(input.txnDate ? { txnDate: input.txnDate } : {}),
      ...(input.dueDate ? { dueDate: input.dueDate } : {}),
      ...(input.billEmail ? { billEmail: input.billEmail } : {}),
      ...(input.customerMemo ? { customerMemo: input.customerMemo } : {}),
      ...(input.classId ? { classId: input.classId } : {}),
      ...(input.locationId ? { locationId: input.locationId } : {}),
      totalCents: total,
      balanceCents: total,
      lines: input.lines.map((l) => ({ ...l })),
    };
    this.invoices.set(invoice.id, invoice);
    if (input.requestId) this.invoicesByRequestId.set(input.requestId, invoice);
    return structuredClone(invoice);
  }

  async getInvoice(id: string): Promise<Invoice | null> {
    const i = this.invoices.get(id);
    return i ? structuredClone(i) : null;
  }

  async findInvoiceByDocNumber(docNumber: string): Promise<Invoice | null> {
    for (const i of this.invoices.values()) {
      if (i.docNumber === docNumber) return structuredClone(i);
    }
    return null;
  }

  async recordPayment(input: PaymentInput): Promise<Payment> {
    this.calls.push({ method: "recordPayment", input });
    validatePaymentInput(input);
    // Same requestid, same answer: a retry after a lost response returns the first payment.
    const prior = input.requestId ? this.paymentsByRequestId.get(input.requestId) : undefined;
    if (prior) return structuredClone(prior);
    if (!this.customers.has(input.customerId)) {
      throw new AccountingValidationError(`unknown customer ${input.customerId}`);
    }
    for (const a of input.applyTo) {
      const inv = this.invoices.get(a.invoiceId);
      if (!inv) throw new AccountingValidationError(`unknown invoice ${a.invoiceId}`);
      if (inv.customerId !== input.customerId) {
        throw new AccountingValidationError(`invoice ${a.invoiceId} belongs to another customer`);
      }
      if (a.amountCents > inv.balanceCents) {
        throw new AccountingValidationError(
          `payment of ${a.amountCents} exceeds invoice ${a.invoiceId} balance ${inv.balanceCents}`,
        );
      }
    }
    for (const a of input.applyTo) {
      const inv = this.invoices.get(a.invoiceId);
      if (inv)
        this.invoices.set(
          inv.id,
          this.bump({ ...inv, balanceCents: inv.balanceCents - a.amountCents }),
        );
    }
    const applied = input.applyTo.reduce((s, a) => s + a.amountCents, 0);
    const payment: Payment = {
      id: this.nextId(),
      syncToken: "0",
      customerId: input.customerId,
      totalCents: input.totalCents,
      unappliedCents: input.totalCents - applied,
      ...(input.txnDate ? { txnDate: input.txnDate } : {}),
      ...(input.paymentRefNum ? { paymentRefNum: input.paymentRefNum } : {}),
      appliedTo: input.applyTo.map((a) => ({ ...a })),
    };
    this.payments.set(payment.id, payment);
    if (input.requestId) this.paymentsByRequestId.set(input.requestId, payment);
    return structuredClone(payment);
  }

  async getPayment(id: string): Promise<Payment | null> {
    const p = this.payments.get(id);
    return p ? structuredClone(p) : null;
  }

  async createCreditMemo(input: CreditMemoInput): Promise<CreditMemo> {
    this.calls.push({ method: "createCreditMemo", input });
    validateCreditMemoInput(input);
    const prior = input.requestId ? this.creditMemosByRequestId.get(input.requestId) : undefined;
    if (prior) return structuredClone(this.creditMemos.get(prior.id) ?? prior);
    this.checkTracking(input, input.lines);
    if (!this.customers.has(input.customerId)) {
      throw new AccountingValidationError(`unknown customer ${input.customerId}`);
    }
    for (const l of input.lines) {
      if (!this.items.has(l.itemId))
        throw new AccountingValidationError(`unknown item ${l.itemId}`);
    }
    if (input.docNumber && (await this.findCreditMemoByDocNumber(input.docNumber))) {
      throw new AccountingValidationError(`duplicate DocNumber ${input.docNumber}`);
    }
    const total = input.lines.reduce((s, l) => s + l.amountCents, 0);
    let memo: CreditMemo = {
      id: this.nextId(),
      syncToken: "0",
      customerId: input.customerId,
      ...(input.docNumber ? { docNumber: input.docNumber } : {}),
      ...(input.txnDate ? { txnDate: input.txnDate } : {}),
      totalCents: total,
      remainingCents: total,
    };
    if (this.autoApplyCredits) {
      for (const inv of this.invoices.values()) {
        if (memo.remainingCents === 0) break;
        if (inv.customerId !== memo.customerId || inv.balanceCents === 0) continue;
        const take = Math.min(inv.balanceCents, memo.remainingCents);
        this.invoices.set(inv.id, this.bump({ ...inv, balanceCents: inv.balanceCents - take }));
        memo = { ...memo, remainingCents: memo.remainingCents - take };
      }
    }
    this.creditMemos.set(memo.id, memo);
    if (input.requestId) this.creditMemosByRequestId.set(input.requestId, memo);
    return structuredClone(memo);
  }

  async getCreditMemo(id: string): Promise<CreditMemo | null> {
    const c = this.creditMemos.get(id);
    return c ? structuredClone(c) : null;
  }

  async findCreditMemoByDocNumber(docNumber: string): Promise<CreditMemo | null> {
    for (const c of this.creditMemos.values()) {
      if (c.docNumber === docNumber) return structuredClone(c);
    }
    return null;
  }

  async applyCreditMemo(input: CreditApplicationInput): Promise<Payment> {
    this.calls.push({ method: "applyCreditMemo", input });
    validateCreditApplicationInput(input);
    const prior = input.requestId ? this.paymentsByRequestId.get(input.requestId) : undefined;
    if (prior) return structuredClone(prior);
    const inv = this.invoices.get(input.invoiceId);
    const memo = this.creditMemos.get(input.creditMemoId);
    if (!inv) throw new AccountingValidationError(`unknown invoice ${input.invoiceId}`);
    if (!memo) throw new AccountingValidationError(`unknown credit memo ${input.creditMemoId}`);
    if (inv.customerId !== input.customerId || memo.customerId !== input.customerId) {
      throw new AccountingValidationError("invoice and credit memo must belong to the customer");
    }
    if (input.amountCents > inv.balanceCents || input.amountCents > memo.remainingCents) {
      throw new AccountingValidationError(
        `credit of ${input.amountCents} exceeds the invoice balance ${inv.balanceCents} or the credit left ${memo.remainingCents}`,
      );
    }
    this.invoices.set(
      inv.id,
      this.bump({ ...inv, balanceCents: inv.balanceCents - input.amountCents }),
    );
    this.creditMemos.set(
      memo.id,
      this.bump({ ...memo, remainingCents: memo.remainingCents - input.amountCents }),
    );
    const payment: Payment = {
      id: this.nextId(),
      syncToken: "0",
      customerId: input.customerId,
      totalCents: 0,
      unappliedCents: 0,
      ...(input.txnDate ? { txnDate: input.txnDate } : {}),
      appliedTo: [{ invoiceId: inv.id, amountCents: input.amountCents }],
    };
    this.payments.set(payment.id, payment);
    if (input.requestId) this.paymentsByRequestId.set(input.requestId, payment);
    return structuredClone(payment);
  }

  async ensureRetainageSetup(options: RetainageSetupOptions = {}): Promise<RetainageSetup> {
    const account = await this.ensureAccount({
      name: options.accountName ?? DEFAULT_RETAINAGE_ACCOUNT_NAME,
      accountType: "Other Current Asset",
      accountSubType: options.accountSubType ?? "OtherCurrentAssets",
    });
    const item = await this.ensureItem({
      name: options.itemName ?? DEFAULT_RETAINAGE_ITEM_NAME,
      type: "Service",
      incomeAccountId: account.id,
    });
    if (item.incomeAccountId !== account.id) {
      throw new Error(
        `Item "${item.name}" posts to account ${item.incomeAccountId}, not ${account.id}`,
      );
    }
    return { account, item };
  }
}
