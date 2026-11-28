// Packing slip (page 1, more if the parts run over) and certificate of conformance (next page) for
// a won quote, built from shared/shipment.ts. No price, rate or markup on either. The certificate's
// signature line is left blank for the shop to sign.
import type { ShopSettingsDto } from "@shared/api";
import { quoteLabel } from "@shared/quote-label";
import { CONFORMANCE_STATEMENT, type ShipmentLine } from "@shared/shipment";
import { buildPdf, PAGE_HEIGHT, PAGE_WIDTH, type PdfOp, textWidth, wrapText } from "../../lib/pdf";

const M = 54;

export interface ShipmentHeader {
  quoteNumber: number;
  revNumber: number;
  customerCompany: string;
  customerContact: string | null;
  poNumber: string | null;
  shipDate: string;
  shipTo: string[];
  signer: string | null;
  certificate: boolean;
}

function clip(text: string, width: number, size: number): string {
  if (textWidth(text, size) <= width) return text;
  let t = text;
  while (t.length > 1 && textWidth(`${t}...`, size) > width) t = t.slice(0, -1);
  return `${t}...`;
}

export function renderShipmentPdf(
  shop: ShopSettingsDto,
  header: ShipmentHeader,
  lines: ShipmentLine[],
): Uint8Array<ArrayBuffer> {
  const label = quoteLabel(header.quoteNumber, header.revNumber);
  const right = PAGE_WIDTH - M;
  const pages: PdfOp[][] = [];
  let ops: PdfOp[] = [];
  let y = PAGE_HEIGHT - M;
  const text = (x: number, t: string, size = 10, bold = false, alignRight = false) =>
    ops.push({ kind: "text", x, y, text: t, size, bold, alignRight });
  const rule = (x1 = M, x2 = right) => ops.push({ kind: "line", x1, y1: y, x2, y2: y });
  const finishPage = () => {
    pages.push(ops);
    ops = [];
  };

  // Shop block, title, and the order details, at the top of every page.
  const top = (title: string, continued: boolean) => {
    y = PAGE_HEIGHT - M;
    text(right, title, 16, true, true);
    text(M, clip(shop.displayName, right - M - textWidth(title, 16, true) - 16, 14), 14, true);
    y -= 15;
    const contact = [shop.phone, shop.email].filter((v): v is string => !!v);
    for (const l of [...shop.addressLines, ...(contact.length ? [contact.join("   ")] : [])]) {
      text(M, clip(l, 300, 9), 9);
      y -= 11;
    }
    y -= 8;
    const left = [
      `Customer: ${header.customerCompany}`,
      ...(header.poNumber ? [`PO: ${header.poNumber}`] : ["PO: ________________"]),
      `Quote: ${label}`,
    ];
    const rightCol = [`Ship date: ${header.shipDate}`, ...(continued ? ["(continued)"] : [])];
    for (let i = 0; i < Math.max(left.length, rightCol.length); i++) {
      const l = left[i];
      const r = rightCol[i];
      if (l) text(M, clip(l, 330, 10), 10, i === 1 && !!header.poNumber);
      if (r) text(right, r, 10, i === 0, true);
      y -= 13;
    }
    y -= 8;
  };

  const rev = (l: ShipmentLine) => l.revision ?? "not given";

  // Packing slip.
  const cPart = M;
  const cRev = M + 120;
  const cDesc = M + 175;
  const cOrdered = M + 440;
  const cShipped = right;
  let continued = false;
  top("PACKING SLIP", continued);
  text(M, "Ship to", 9, true);
  y -= 12;
  const shipTo = header.shipTo.length
    ? header.shipTo
    : [
        header.customerCompany,
        ...(header.customerContact ? [`Attn: ${header.customerContact}`] : []),
      ];
  for (const l of shipTo) {
    text(M + 8, clip(l, 360, 10), 10);
    y -= 12;
  }
  y -= 10;
  const slipHeader = () => {
    text(cPart, "Part number", 9, true);
    text(cRev, "Rev", 9, true);
    text(cDesc, "Description", 9, true);
    text(cOrdered, "Ordered", 9, true, true);
    text(cShipped, "Shipped", 9, true, true);
    y -= 6;
    rule();
    y -= 14;
  };
  slipHeader();
  for (const l of lines) {
    if (y - 30 < M + 90) {
      finishPage();
      continued = true;
      top("PACKING SLIP", continued);
      slipHeader();
    }
    text(cPart, clip(l.partNumber, cRev - cPart - 6, 10), 10, true);
    text(cRev, clip(rev(l), cDesc - cRev - 6, 9), 9);
    text(cDesc, clip(l.description ?? "", cOrdered - 50 - cDesc, 9), 9);
    text(cOrdered, l.ordered === null ? "-" : String(l.ordered), 10, false, true);
    text(cShipped, String(l.shipped), 10, true, true);
    y -= 13;
    if (l.partial) {
      text(cDesc, "Partial shipment", 8, true);
      y -= 11;
    }
    y -= 4;
  }
  y -= 10;
  const totalShipped = lines.reduce((s, l) => s + l.shipped, 0);
  text(
    M,
    `${lines.length} part number${lines.length === 1 ? "" : "s"}, ${totalShipped} piece${totalShipped === 1 ? "" : "s"} shipped`,
    10,
    true,
  );
  y -= 16;
  if (header.certificate) {
    text(M, "Certificate of conformance enclosed.", 9);
    y -= 14;
  }
  y = Math.min(y, M + 70);
  text(M, "Packed by: ______________________", 10);
  text(M + 260, "Received by: ______________________", 10);
  y -= 22;
  text(M, "Boxes: ______", 10);
  text(M + 260, "Date: ______________", 10);
  finishPage();

  if (!header.certificate) {
    return buildPdf(pages, `${shop.displayName} packing slip ${label}`, []);
  }

  // Certificate of conformance.
  const kRev = M + 105;
  const kQty = M + 175;
  const kMat = M + 215;
  const kLot = M + 370;
  continued = false;
  top("CERTIFICATE OF CONFORMANCE", continued);
  const certHeader = () => {
    text(cPart, "Part number", 9, true);
    text(kRev, "Rev", 9, true);
    text(kQty, "Qty", 9, true, true);
    text(kMat, "Material", 9, true);
    text(kLot, "Heat / lot no.", 9, true);
    y -= 6;
    rule();
    y -= 14;
  };
  certHeader();
  for (const l of lines) {
    const extra = l.outsideProcesses.length ? 11 : 0;
    if (y - 30 - extra < M + 170) {
      finishPage();
      continued = true;
      top("CERTIFICATE OF CONFORMANCE", continued);
      certHeader();
    }
    text(cPart, clip(l.partNumber, kRev - cPart - 6, 10), 10, true);
    text(kRev, clip(rev(l), kQty - 24 - kRev, 9), 9);
    text(kQty, String(l.shipped), 10, false, true);
    text(kMat, clip(l.material ?? "-", kLot - kMat - 6, 9), 9);
    if (l.lot) text(kLot, clip(l.lot, right - kLot, 9), 9);
    else {
      y -= 2;
      rule(kLot, right);
      y += 2;
    }
    y -= 12;
    if (l.outsideProcesses.length) {
      text(kMat, clip(`Outside processing: ${l.outsideProcesses.join(", ")}`, right - kMat, 8), 8);
      y -= 11;
    }
    y -= 5;
  }
  y -= 12;
  for (const l of wrapText(CONFORMANCE_STATEMENT, PAGE_WIDTH - 2 * M, 10)) {
    text(M, l, 10);
    y -= 14;
  }
  y = Math.min(y - 30, M + 110);
  text(M, "Authorized signature: ________________________________", 10);
  y -= 22;
  text(
    M,
    header.signer
      ? `Name and title: ${header.signer}`
      : "Name and title: ________________________________",
    10,
  );
  y -= 22;
  text(M, "Date: ________________", 10);
  y -= 22;
  text(
    M,
    `For ${header.customerCompany}, PO ${header.poNumber ?? "________"}, shipped ${header.shipDate}.`,
    8,
  );
  finishPage();

  return buildPdf(pages, `${shop.displayName} packing slip ${label}`, []);
}
