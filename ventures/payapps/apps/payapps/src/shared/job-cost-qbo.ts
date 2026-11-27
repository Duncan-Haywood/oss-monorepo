// Job costs read from QuickBooks (docs/QUICKBOOKS.md, "Job costs from QuickBooks"): the pure parts,
// shared by the Worker and the page.
import type { JobCostQboLinkDto } from "./api/types";
import type { CostCategory } from "./job-cost";

/** How a job's QuickBooks link reads in a sentence: "Acme:Riverside" or "class Riverside". */
export const linkLabel = (l: Pick<JobCostQboLinkDto, "by" | "name">) =>
  l.by === "class" ? `class ${l.name}` : l.name;

/** At most this many QuickBooks lines are imported in one request. */
export const MAX_QBO_IMPORT_LINES = 500;
/** The widest date window one read covers (two years and a day). */
export const MAX_QBO_COST_WINDOW_DAYS = 731;

export type QboExpenseTxnType = "Bill" | "Purchase" | "VendorCredit" | "JournalEntry";

/**
 * The key kept on an imported cost (or, for "PurchaseOrder", an imported commitment) so a
 * QuickBooks line is never imported twice in one company.
 */
export function qboCostSource(
  realmId: string,
  txnType: QboExpenseTxnType | "PurchaseOrder",
  txnId: string,
  lineId: string,
): string {
  return `${realmId}:${txnType}:${txnId}:${lineId}`;
}

/**
 * The purchase order a bill or check line was made from, as kept on the imported cost: the order
 * line's own key, or "<realm>:PurchaseOrder:<txn id>" when QuickBooks names only the order.
 */
export function qboPoSource(realmId: string, po: { txnId: string; lineId?: string }): string {
  return po.lineId
    ? qboCostSource(realmId, "PurchaseOrder", po.txnId, po.lineId)
    : `${realmId}:PurchaseOrder:${po.txnId}`;
}

/**
 * The commitment a cost made from a QuickBooks purchase order is counted against: the commitment
 * imported from that order line, or, when only the order is named, its one line imported into this
 * job. Null when there is none, or more than one and QuickBooks did not say which.
 */
export function commitmentForPo(
  poSource: string,
  commitments: readonly { id: string; qboSource: string | null }[],
): string | null {
  const exact = commitments.filter((c) => c.qboSource === poSource);
  if (exact.length === 1) return exact[0]?.id ?? null;
  if (poSource.split(":").length !== 3) return null;
  const prefix = `${poSource}:`;
  const onOrder = commitments.filter((c) => c.qboSource?.startsWith(prefix));
  return onOrder.length === 1 ? (onOrder[0]?.id ?? null) : null;
}

/** A purchase order to a subcontractor is a subcontract; anything else is a purchase order. */
export const commitmentKindFor = (category: CostCategory) =>
  category === "subcontract" ? ("subcontract" as const) : ("purchase_order" as const);

/**
 * A first guess at the category from the expense account or item name, for the person to check
 * before importing: words a contractor's chart of accounts commonly uses. "other" when nothing fits.
 */
export function suggestCostCategory(
  accountName: string | null | undefined,
  itemName: string | null | undefined,
): CostCategory {
  const t = `${itemName ?? ""} ${accountName ?? ""}`.toLowerCase();
  if (/\b(sub-?contract(or|ors|s)?|subs)\b/.test(t)) return "subcontract";
  if (/\b(labou?r|payroll|wages?|salar(y|ies))\b/.test(t)) return "labor";
  if (/\b(equipment|rentals?|equip|tools?|machinery|fuel)\b/.test(t)) return "equipment";
  if (/\b(materials?|supplies|supply|lumber|wire|pipe|fixtures?)\b/.test(t)) return "material";
  return "other";
}

/**
 * How a QuickBooks transaction reads in the list: "Bill", "Check", "Card", "Card credit", "Journal
 * entry" (a payroll service's posting or an accountant's reclass)...
 */
export function qboTxnLabel(
  txnType: QboExpenseTxnType,
  paymentType: string | null,
  amountCents: number,
) {
  if (txnType === "Bill") return "Bill";
  if (txnType === "VendorCredit") return "Vendor credit";
  if (txnType === "JournalEntry") return "Journal entry";
  if (paymentType === "CreditCard") return amountCents < 0 ? "Card credit" : "Card";
  if (paymentType === "Check") return "Check";
  if (paymentType === "Cash") return "Cash";
  return "Expense";
}

/** Whole days from `from` to `to` (ISO dates). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
