// The data every pay-application export (PDF, CSV) renders. Built by services/payapps/documents.ts.
import type { ComputedApplication } from "@shared/payapp-math";

export interface ApplicationDocumentData {
  contractor: { name: string };
  project: {
    name: string;
    number: string | null;
    location: string | null;
    gcName: string;
    gcAddress: string | null;
    /** The GC's billing contact (accounts payable), printed under "To" when set. */
    gcBillingName?: string | null;
    gcBillingEmail?: string | null;
    ownerName: string | null;
    architectName: string | null;
    contractDate: string | null;
    /** Print a notary's jurat (and a seal box) under the signatures on the summary page. */
    notaryBlock?: boolean;
    /** The sample job: every page says SAMPLE DATA so it is never sent as a real application. */
    sample?: boolean;
  };
  payApp: {
    number: number;
    periodFrom: string;
    periodTo: string;
    applicationDate: string;
    status: string;
  };
  computed: ComputedApplication;
}

/** Printed on every export of the sample job so its invented figures are never sent as real. */
export const SAMPLE_APPLICATION_MARK = "SAMPLE DATA - NOT A REAL APPLICATION";
export const SAMPLE_CHANGE_ORDER_MARK = "SAMPLE DATA - NOT A REAL CHANGE ORDER";

export const NOT_AIA_NOTICE =
  "Not an AIA document. This form carries the standard pay-application fields and math; it is not " +
  "affiliated with or endorsed by the American Institute of Architects.";

/** 123456 -> "1,234.56"; negatives in parentheses, as on accounting forms. */
export function fmtAmount(cents: number): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const s = `${whole}.${String(abs % 100).padStart(2, "0")}`;
  return cents < 0 ? `(${s})` : s;
}

export function fmtPct(bps: number | null): string {
  return bps === null ? "" : `${(bps / 100).toFixed(2)}%`;
}

export function exportFileName(data: ApplicationDocumentData, ext: string, suffix = ""): string {
  const base = `${data.project.number ?? data.project.name}-payapp-${data.payApp.number}${suffix}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "payapp"}.${ext}`;
}

/** "Attn: Pat Lee, ap@builder.example": the line under the GC's name, or null with no contact. */
export function attentionLine(project: {
  gcBillingName?: string | null;
  gcBillingEmail?: string | null;
}): string | null {
  const parts = [project.gcBillingName?.trim(), project.gcBillingEmail?.trim()].filter(Boolean);
  return parts.length ? `Attn: ${parts.join(", ")}` : null;
}
