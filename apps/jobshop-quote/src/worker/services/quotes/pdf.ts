// Customer-facing quote PDF. Shows parts, quantity breaks, unit and extended prices, lead time,
// validity, notes and terms. Never shows internal cost basis, rates or markup.
import type { QuoteDetailDto, ShopSettingsDto } from "@shared/api";
import { quoteLabel } from "@shared/quote-label";
import { buildPdf, PAGE_HEIGHT, PAGE_WIDTH, type PdfOp, wrapText } from "../../lib/pdf";

const M = 54;
const money = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export { quoteFileLabel, quoteLabel } from "@shared/quote-label";

/** "Changes from Q-1001": customer-safe bullet lines (shared/quote-change-summary.ts). */
export interface PdfChanges {
  fromLabel: string;
  items: string[];
}

export function renderQuotePdf(
  shop: ShopSettingsDto,
  quote: QuoteDetailDto,
  issuedOn: string,
  changes: PdfChanges | null = null,
): Uint8Array<ArrayBuffer> {
  const pages: PdfOp[][] = [];
  let ops: PdfOp[] = [];
  let y = PAGE_HEIGHT - M;
  const right = PAGE_WIDTH - M;
  const text = (x: number, t: string, size = 10, bold = false, alignRight = false) =>
    ops.push({ kind: "text", x, y, text: t, size, bold, alignRight });
  const rule = () => ops.push({ kind: "line", x1: M, y1: y, x2: right, y2: y });
  const newPage = () => {
    pages.push(ops);
    ops = [];
    y = PAGE_HEIGHT - M;
    text(
      M,
      `${shop.displayName} - Quote ${quoteLabel(quote.quoteNumber, quote.revNumber)} (continued)`,
      9,
    );
    y -= 24;
  };
  const need = (h: number) => {
    if (y - h < M + 20) newPage();
  };

  // Header
  text(M, shop.displayName, 18, true);
  text(right, "QUOTE", 18, true, true);
  y -= 18;
  const contact = [...shop.addressLines, shop.phone, shop.email].filter((s): s is string => !!s);
  const meta = [
    `Quote ${quoteLabel(quote.quoteNumber, quote.revNumber)}`,
    ...(quote.revNumber > 1
      ? [`Replaces ${quoteLabel(quote.quoteNumber, quote.revNumber - 1)}`]
      : []),
    `Date ${issuedOn}`,
    ...(quote.validUntil ? [`Valid until ${quote.validUntil}`] : []),
  ];
  for (let i = 0; i < Math.max(contact.length, meta.length); i++) {
    const c = contact[i];
    const m = meta[i];
    if (c) text(M, c, 9);
    if (m) text(right, m, 9, false, true);
    y -= 12;
  }
  y -= 10;
  text(M, "Prepared for", 9, true);
  y -= 13;
  for (const l of [quote.customerCompany, quote.customerContact, quote.customerEmail]) {
    if (!l) continue;
    text(M, l, 10);
    y -= 13;
  }
  if (quote.leadTimeText) {
    y -= 4;
    text(M, `Lead time: ${quote.leadTimeText}`, 10);
    y -= 13;
  }
  y -= 10;

  // Table: one block per part, one row per quantity break.
  const colQty = M + 300;
  const colUnit = M + 400;
  const header = () => {
    text(M, "Part", 9, true);
    text(colQty, "Qty", 9, true, true);
    text(colUnit, "Unit price", 9, true, true);
    text(right, "Extended", 9, true, true);
    y -= 6;
    rule();
    y -= 14;
  };
  header();
  for (const line of quote.lines) {
    const breaks = line.breaks ?? [];
    const desc = line.description ? wrapText(line.description, 280, 9) : [];
    const rows = Math.max(1 + desc.length, breaks.length);
    need(rows * 12 + 20);
    const left = [`${line.partNumber}${line.revision ? `  Rev ${line.revision}` : ""}`, ...desc];
    for (let r = 0; r < rows; r++) {
      const l = left[r];
      if (l) text(r === 0 ? M : M + 8, l, r === 0 ? 10 : 9, r === 0);
      const b = breaks[r];
      if (b) {
        text(colQty, String(b.quantity), 10, false, true);
        text(colUnit, money(b.unitPriceCents), 10, false, true);
        text(right, money(b.totalCents), 10, false, true);
      }
      y -= 12;
    }
    y -= 4;
    rule();
    y -= 14;
  }

  if (changes && changes.items.length > 0) {
    const width = PAGE_WIDTH - 2 * M - 10;
    need(16 + 11 * Math.min(changes.items.length, 4));
    y -= 4;
    text(M, `Changes from ${changes.fromLabel}`, 9, true);
    y -= 13;
    for (const item of changes.items) {
      const wrapped = wrapText(item, width, 9);
      need(wrapped.length * 11);
      wrapped.forEach((l, i) => {
        text(i === 0 ? M : M + 10, i === 0 ? `- ${l}` : l, 9);
        y -= 11;
      });
    }
    y -= 6;
  }

  for (const [title, body] of [
    ["Notes", quote.notes],
    ["Terms", shop.quoteTerms],
  ] as const) {
    if (!body?.trim()) continue;
    const wrapped = wrapText(body, PAGE_WIDTH - 2 * M, 9);
    need(16 + Math.min(wrapped.length, 6) * 11);
    y -= 4;
    text(M, title, 9, true);
    y -= 13;
    for (const l of wrapped) {
      need(11);
      text(M, l, 9);
      y -= 11;
    }
  }
  pages.push(ops);
  return buildPdf(
    pages,
    `${shop.displayName} quote ${quoteLabel(quote.quoteNumber, quote.revNumber)}`,
  );
}
