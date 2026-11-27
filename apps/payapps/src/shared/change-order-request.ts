// A change order request to send the GC: the scope, the price by schedule-of-values line, and where
// the contract stands before and after it. Pure: built from the rows the project already holds, so
// the PDF (services/export/change-order-pdf.ts) and its tests share one model. Nothing is estimated:
// every amount is a change order item the contractor entered or a sum of them.
import { type AttachmentCategory, CHANGE_ORDER_CATEGORY_LABELS } from "./attachments";

export type ChangeOrderRequestStatus = "pending" | "approved" | "rejected";

export interface ChangeOrderRequestInput {
  contractor: { name: string };
  project: {
    name: string;
    number: string | null;
    location: string | null;
    gcName: string;
    gcAddress: string | null;
    /** The GC's project manager on the job, if entered: the request is addressed to them. */
    gcPmName?: string | null;
    gcPmEmail?: string | null;
    ownerName: string | null;
    contractDate: string | null;
    originalContractSumCents: number;
    /** The sample job: the request PDF says SAMPLE DATA on every page. */
    sample?: boolean;
  };
  sov: { id: string; itemNumber: string; description: string; changeOrderId: string | null }[];
  changeOrders: {
    id: string;
    number: string;
    description: string;
    status: ChangeOrderRequestStatus;
    approvedOn: string | null;
    submittedOn: string | null;
    /** Calendar days of contract time requested; 0 = no change; null = not stated. */
    scheduleDays: number | null;
    items: { sovLineId: string; amountCents: number }[];
  }[];
  changeOrderId: string;
  /** ISO date the document is printed (YYYY-MM-DD). */
  today: string;
  /** Files attached to this change order, oldest first (names as stored). */
  files?: { fileName: string; category: AttachmentCategory }[];
}

/** One file listed on the request as backup sent with it. */
export interface ChangeOrderBackupItem {
  fileName: string;
  /** Short kind: "Pricing backup", "Photo of the condition or work", "Other". */
  kind: string;
}

export interface ChangeOrderRequestLine {
  itemNumber: string;
  description: string;
  /** True when this change order created the line (new scope), false for a change to a line. */
  newLine: boolean;
  amountCents: number;
}

export interface ChangeOrderRequestData {
  contractor: { name: string };
  project: Omit<ChangeOrderRequestInput["project"], "originalContractSumCents">;
  changeOrder: {
    number: string;
    description: string;
    status: ChangeOrderRequestStatus;
    approvedOn: string | null;
    submittedOn: string | null;
    scheduleDays: number | null;
  };
  /** The date printed as the request's date: the date sent when recorded, else today. */
  date: string;
  lines: ChangeOrderRequestLine[];
  totalCents: number;
  /**
   * The change order's files to list as backup. The signed change order is left out: it is the
   * GC's answer, not backup sent with the request.
   */
  backup: ChangeOrderBackupItem[];
  contract: {
    originalCents: number;
    /** Net of every other approved change order (this one excluded). */
    approvedChangesCents: number;
    /** Original + approved changes, before this change order. */
    beforeCents: number;
    /** Before + this change order. */
    afterCents: number;
    /** Other change orders still pending, net and count: shown, never added. */
    otherPendingCents: number;
    otherPendingCount: number;
  };
}

export function buildChangeOrderRequest(input: ChangeOrderRequestInput): ChangeOrderRequestData {
  const co = input.changeOrders.find((c) => c.id === input.changeOrderId);
  if (!co) throw new Error("Change order not found");
  const byId = new Map(input.sov.map((l) => [l.id, l]));
  const sum = (items: { amountCents: number }[]) => items.reduce((s, i) => s + i.amountCents, 0);

  const lines = co.items.map((item) => {
    const line = byId.get(item.sovLineId);
    return {
      itemNumber: line?.itemNumber ?? "",
      description: line?.description ?? "(line removed)",
      newLine: line?.changeOrderId === co.id,
      amountCents: item.amountCents,
    };
  });
  const others = input.changeOrders.filter((c) => c.id !== co.id);
  const approvedChangesCents = others
    .filter((c) => c.status === "approved")
    .reduce((s, c) => s + sum(c.items), 0);
  const pending = others.filter((c) => c.status === "pending");
  const totalCents = sum(co.items);
  const beforeCents = input.project.originalContractSumCents + approvedChangesCents;
  const { originalContractSumCents, ...project } = input.project;

  return {
    contractor: input.contractor,
    project,
    changeOrder: {
      number: co.number,
      description: co.description,
      status: co.status,
      approvedOn: co.approvedOn,
      submittedOn: co.submittedOn,
      scheduleDays: co.scheduleDays,
    },
    date: co.submittedOn ?? input.today,
    lines,
    totalCents,
    backup: (input.files ?? [])
      .filter((f) => f.category !== "signed")
      .map((f) => ({
        fileName: f.fileName,
        kind: (CHANGE_ORDER_CATEGORY_LABELS[f.category] ?? "Other").split(" (")[0] as string,
      })),
    contract: {
      originalCents: originalContractSumCents,
      approvedChangesCents,
      beforeCents,
      afterCents: beforeCents + totalCents,
      otherPendingCents: pending.reduce((s, c) => s + sum(c.items), 0),
      otherPendingCount: pending.length,
    },
  };
}

/** "co-7-riverside-clinic.pdf": the change order number and the job number or name. */
export function changeOrderFileName(data: ChangeOrderRequestData): string {
  const base = `co-${data.changeOrder.number}-${data.project.number ?? data.project.name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "change-order"}.pdf`;
}

/** The contract-time sentence printed on the request. */
export function scheduleText(days: number | null): string {
  if (days === null) return "Contract time: not stated in this request.";
  if (days === 0) return "Contract time: no change requested.";
  return `Contract time: an extension of ${days} calendar day${days === 1 ? "" : "s"} is requested.`;
}
