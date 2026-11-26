// Minimal PDF 1.4 writer (no dependencies): Letter pages, Helvetica / Helvetica-Bold text, lines.
// Enough for a quote document. Text is WinAnsi; characters outside it are replaced with "?".

export interface PdfText {
  kind: "text";
  x: number;
  y: number;
  text: string;
  size?: number;
  bold?: boolean;
  /** Right-align at x. */
  alignRight?: boolean;
}
export interface PdfLine {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export type PdfOp = PdfText | PdfLine;

export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;

/** Helvetica advance widths (1/1000 em) for ASCII 32..126, used for right alignment and wrapping. */
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

export function textWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    w += HELVETICA_WIDTHS[code - 32] ?? 556;
  }
  // Bold is ~5% wider on average; close enough for layout.
  return (w / 1000) * size * (bold ? 1.05 : 1);
}

/** Greedy word wrap to a width in points. */
export function wrapText(text: string, maxWidth: number, size: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (textWidth(next, size) <= maxWidth || !line) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

function escapePdfText(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 63;
    const c =
      code === 0x2013 || code === 0x2014
        ? "-"
        : code === 0x2018 || code === 0x2019
          ? "'"
          : code === 0x201c || code === 0x201d
            ? '"'
            : code === 0xb1 || code === 0xd7 || code === 0xb0
              ? ch
              : code >= 32 && code < 127
                ? ch
                : "?";
    if (c === "\\" || c === "(" || c === ")") out += `\\${c}`;
    else if (c.charCodeAt(0) > 126) out += `\\${c.charCodeAt(0).toString(8).padStart(3, "0")}`;
    else out += c;
  }
  return out;
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();

function pageStream(ops: PdfOp[]): string {
  const parts: string[] = ["0.5 w"];
  for (const op of ops) {
    if (op.kind === "line") {
      parts.push(`${n(op.x1)} ${n(op.y1)} m ${n(op.x2)} ${n(op.y2)} l S`);
    } else {
      const size = op.size ?? 10;
      const x = op.alignRight ? op.x - textWidth(op.text, size, op.bold) : op.x;
      parts.push(
        `BT /${op.bold ? "F2" : "F1"} ${n(size)} Tf ${n(x)} ${n(op.y)} Td (${escapePdfText(
          op.text,
        )}) Tj ET`,
      );
    }
  }
  return parts.join("\n");
}

/** Build a PDF from pages of drawing ops. */
export function buildPdf(pages: PdfOp[][], title = "Quote"): Uint8Array<ArrayBuffer> {
  const objects: string[] = [];
  // 1 catalog, 2 pages, 3 F1, 4 F2, 5 info, then per page: page + content.
  const pageIds = pages.map((_, i) => 6 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objects[5] = `<< /Title (${escapePdfText(title)}) /Producer (jobshop-quote) >>`;
  pages.forEach((ops, i) => {
    const pageId = 6 + i * 2;
    const stream = pageStream(ops);
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${latin1Length(stream)} >>\nstream\n${stream}\nendstream`;
  });

  let body = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = latin1Length(body);
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = latin1Length(body);
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return latin1Bytes(body);
}

function latin1Length(s: string): number {
  return s.length;
}

function latin1Bytes(s: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}
