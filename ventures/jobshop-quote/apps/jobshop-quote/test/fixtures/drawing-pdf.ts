// Builds a small, valid one-page drawing PDF for tests (an invented part; no real customer's file).
// The title block is a form XObject (CAD exporters draw title blocks that way) and the notes are on
// the page itself, both in Helvetica (a standard font: no embedding, one byte per character), with
// FlateDecode content streams like a real exporter writes. Node only (node:zlib).
import { deflateSync } from "node:zlib";

const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

/** Text lines as a content stream: one `Tj` per line, each line moved down with `Td`. */
function lines(x: number, y: number, rows: string[]) {
  return `BT /F1 9 Tf ${x} ${y} Td 11 TL\n${rows.map((r, i) => `${i ? "T* " : ""}(${esc(r)}) Tj`).join("\n")}\nET\n`;
}

export interface DrawingPdfInput {
  /** Rows in the title block (bottom right), e.g. "MATERIAL: 6061-T6 ALUMINUM". */
  titleBlock: string[];
  /** Rows in the notes (top left). */
  notes?: string[];
}

export function drawingPdf({ titleBlock, notes = [] }: DrawingPdfInput): Buffer {
  // A border and a part outline, so the page is a drawing and not only text.
  const page = deflateSync(
    Buffer.from(
      `0.5 w 20 20 752 572 re S 120 300 m 420 300 l 420 450 l 120 450 l h S\n` +
        (notes.length ? lines(40, 560, ["NOTES:", ...notes]) : "") +
        `q 1 0 0 1 520 40 cm /TB Do Q\n`,
      "latin1",
    ),
  );
  const block = deflateSync(
    Buffer.from(`0 0 240 120 re S\n${lines(8, 104, titleBlock)}`, "latin1"),
  );
  const objs: (string | [string, Buffer])[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Contents 4 0 R " +
      "/Resources << /Font << /F1 5 0 R >> /XObject << /TB 6 0 R >> >> >>",
    [`<< /Length ${page.length} /Filter /FlateDecode >>`, page],
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    [
      `<< /Type /XObject /Subtype /Form /BBox [0 0 240 120] /Resources << /Font << /F1 5 0 R >> >> ` +
        `/Length ${block.length} /Filter /FlateDecode >>`,
      block,
    ],
  ];
  return writePdf(objs);
}

/** A scanned sheet: one page that is a single grey image, with no text on it. */
export function scanPdf(): Buffer {
  const pixel = Buffer.from([0x80]);
  return writePdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Contents 4 0 R " +
      "/Resources << /XObject << /Im1 5 0 R >> >> >>",
    "<< /Length 30 >>\nstream\nq 792 0 0 612 0 0 cm /Im1 Do Q\nendstream",
    [
      "<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray " +
        "/BitsPerComponent 8 /Length 1 >>",
      pixel,
    ],
  ]);
}

/** Objects 1..n (a string body, or a dictionary and its stream bytes) with a valid xref table. */
function writePdf(objs: (string | [string, Buffer])[]): Buffer {
  const chunks: Buffer[] = [Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  const offsets: number[] = [];
  let at = chunks[0]?.length ?? 0;
  const add = (b: Buffer) => {
    chunks.push(b);
    at += b.length;
  };
  objs.forEach((o, i) => {
    offsets.push(at);
    if (typeof o === "string") add(Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, "latin1"));
    else {
      add(Buffer.from(`${i + 1} 0 obj\n${o[0]}\nstream\n`, "latin1"));
      add(o[1]);
      add(Buffer.from("\nendstream\nendobj\n", "latin1"));
    }
  });
  const xref =
    `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`;
  add(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}
