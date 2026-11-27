// Minimal PDF 1.4 writer (no dependencies): text in the standard Helvetica / Helvetica-Bold fonts,
// lines and rectangles, JPEG images (a drawn signature), multiple pages of any size. Enough for
// tabular billing documents. Text is WinAnsi-encoded; characters outside printable ASCII are
// replaced with "?". Images are embedded as is (DCTDecode) behind ASCIIHexDecode, so the file stays
// ASCII and string length is still byte length.

export type FontName = "regular" | "bold";

// Advance widths (1/1000 em) for ASCII 32..126 of the standard 14 fonts (Adobe AFM metrics).
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/**
 * Replaces characters the standard fonts cannot show (outside printable ASCII) with "?", after
 * spelling out the section sign ("§ 8118" prints as "Sec. 8118", "§§" as "Secs."), which statutes
 * and citations use often.
 */
export function toPdfText(s: string): string {
  return s
    .replaceAll("§§", "Secs.")
    .replaceAll("§", "Sec.")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7e]/g, "?");
}

export function textWidth(text: string, size: number, font: FontName = "regular"): number {
  const table = font === "bold" ? HELVETICA_BOLD : HELVETICA;
  let w = 0;
  for (const ch of toPdfText(text)) w += table[ch.charCodeAt(0) - 32] ?? 556;
  return (w * size) / 1000;
}

/** Shortens text with "..." so it fits within maxWidth points. */
export function fitText(text: string, maxWidth: number, size: number, font: FontName = "regular") {
  const clean = toPdfText(text);
  if (textWidth(clean, size, font) <= maxWidth) return clean;
  let lo = 0;
  let hi = clean.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(`${clean.slice(0, mid)}...`, size, font) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${clean.slice(0, lo)}...`;
}

/** Splits text into lines no wider than maxWidth (word wrap). */
export function wrapText(text: string, maxWidth: number, size: number, font: FontName = "regular") {
  const out: string[] = [];
  // Split on line breaks before toPdfText, which turns any other control character into "?".
  for (const para of text.split(/\r?\n/).map(toPdfText)) {
    let current = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = current ? `${current} ${word}` : word;
      if (textWidth(next, size, font) <= maxWidth || !current) current = next;
      else {
        out.push(current);
        current = word;
      }
    }
    out.push(current);
  }
  return out;
}

const pdfEscape = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export interface TextOptions {
  size?: number;
  font?: FontName;
  align?: "left" | "right" | "center";
}

/** A JPEG to place on a page: its bytes and what its start-of-frame marker says. */
export interface PdfImage {
  bytes: Uint8Array;
  width: number;
  height: number;
  components: 1 | 3;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function hexOf(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 64) {
    let line = "";
    for (const b of bytes.subarray(i, i + 64)) line += HEX[b];
    parts.push(line);
  }
  return `${parts.join("\n")}>`;
}

/** One page. Coordinates are PDF points from the top-left corner (y grows downward). */
export class PdfPage {
  readonly ops: string[] = [];
  readonly images: PdfImage[] = [];
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  text(x: number, y: number, text: string, opts: TextOptions = {}): this {
    const size = opts.size ?? 9;
    const font = opts.font ?? "regular";
    const clean = toPdfText(text);
    const w = textWidth(clean, size, font);
    const left = opts.align === "right" ? x - w : opts.align === "center" ? x - w / 2 : x;
    const fontRef = font === "bold" ? "F2" : "F1";
    this.ops.push(
      `BT /${fontRef} ${num(size)} Tf ${num(left)} ${num(this.height - y)} Td (${pdfEscape(clean)}) Tj ET`,
    );
    return this;
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.5): this {
    this.ops.push(
      `${num(width)} w ${num(x1)} ${num(this.height - y1)} m ${num(x2)} ${num(this.height - y2)} l S`,
    );
    return this;
  }

  /** Draws a JPEG into the box at (x, y) of w by h points, top-left anchored. */
  image(x: number, y: number, w: number, h: number, img: PdfImage): this {
    this.images.push(img);
    const name = `Im${this.images.length}`;
    this.ops.push(
      `q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(this.height - y - h)} cm /${name} Do Q`,
    );
    return this;
  }

  rect(x: number, y: number, w: number, h: number, opts: { fill?: number; stroke?: boolean } = {}) {
    const y0 = this.height - y - h;
    if (opts.fill !== undefined) {
      this.ops.push(`${num(opts.fill)} g ${num(x)} ${num(y0)} ${num(w)} ${num(h)} re f 0 g`);
    }
    if (opts.stroke !== false) {
      this.ops.push(`0.5 w ${num(x)} ${num(y0)} ${num(w)} ${num(h)} re S`);
    }
    return this;
  }
}

export class PdfDocument {
  readonly pages: PdfPage[] = [];
  constructor(readonly info: { title: string; producer?: string }) {}

  addPage(width = 612, height = 792): PdfPage {
    const page = new PdfPage(width, height);
    this.pages.push(page);
    return page;
  }

  /** Serializes to PDF bytes (ASCII only, so string length = byte length). */
  toBytes(): Uint8Array {
    const objects: string[] = [];
    const add = (body: string) => {
      objects.push(body);
      return objects.length; // object number
    };
    const catalog = add(""); // placeholder, filled after pages are known
    const pagesObj = add("");
    const f1 = add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    );
    const f2 = add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    );
    const kids: number[] = [];
    for (const page of this.pages) {
      const content = page.ops.join("\n");
      const contentObj = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      const xobjects = page.images.map((img, i) => {
        const data = hexOf(img.bytes);
        const obj = add(
          `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ` +
            `/ColorSpace /${img.components === 1 ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 ` +
            `/Filter [/ASCIIHexDecode /DCTDecode] /Length ${data.length} >>\nstream\n${data}\nendstream`,
        );
        return `/Im${i + 1} ${obj} 0 R`;
      });
      const xobj = xobjects.length ? ` /XObject << ${xobjects.join(" ")} >>` : "";
      kids.push(
        add(
          `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] ` +
            `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${xobj} >> /Contents ${contentObj} 0 R >>`,
        ),
      );
    }
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objects[pagesObj - 1] =
      `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
    const infoObj = add(
      `<< /Title (${pdfEscape(toPdfText(this.info.title))}) /Producer (${pdfEscape(toPdfText(this.info.producer ?? "PayApps"))}) >>`,
    );

    let out = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new TextEncoder().encode(out);
  }
}
