// Writes one PDF out of pages copied from other PDFs and pages made from photos, and stamps every
// page with the packet's own page number ("Application #7 - page 12 of 40"), so a GC can cite a
// page of the backup. Copied pages keep their own content, fonts, images and form-field
// appearances byte for byte; only object numbers change. Objects are written uncompressed as
// they are copied, and the output is a list of chunks that share memory with the inputs.

import { PdfDict, PdfName, PdfRef, PdfStream, PdfString, type PdfValue } from "@shared/pdf/objects";
import type { PageRecord, PdfReader } from "@shared/pdf/reader";
import { textWidth, toPdfText } from "../pdf";
import { displaySize, orientationMatrix, type PdfImage } from "./images";

/** A reference to an object in the output file (as opposed to PdfRef, one in a source file). */
class OutRef {
  constructor(readonly num: number) {}
}
type OutValue = PdfValue | OutRef | OutValue[] | Map<string, OutValue>;

const enc = new TextEncoder();
/** Action types never copied from an uploaded PDF. */
const BLOCKED_ACTIONS = new Set([
  "JavaScript",
  "Launch",
  "SubmitForm",
  "ImportData",
  "Rendition",
  "Movie",
  "Sound",
]);
const STAMP_FONT = "PAStamp";
const STAMP_SIZE = 7;

const fmt = (n: number) => {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  const s = n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
};

const nameBytes = (name: string) => {
  let s = "/";
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i) & 0xff;
    const plain = c > 0x20 && c < 0x7f && !"#()<>[]{}/%".includes(String.fromCharCode(c));
    s += plain ? String.fromCharCode(c) : `#${c.toString(16).padStart(2, "0")}`;
  }
  return s;
};

const hexString = (b: Uint8Array) => {
  let s = "<";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return `${s}>`;
};

const pdfLiteral = (s: string) => `(${toPdfText(s).replace(/[\\()]/g, (c) => `\\${c}`)})`;

interface Stamp {
  num: number;
  /** Visible box [x0 y0 x1 y1] and rotation, to place the text at the displayed bottom right. */
  box: number[];
  rotate: number;
}

export interface PacketPageCount {
  pages: number;
}

export class PacketWriter {
  private readonly chunks: Uint8Array[] = [];
  private length = 0;
  private readonly offsets: number[] = []; // index = object number
  private next = 1;
  private readonly kids: number[] = [];
  private readonly stamps: Stamp[] = [];
  private readonly catalogNum: number;
  private readonly pagesNum: number;
  private readonly fontNum: number;
  private readonly openNum: number;

  constructor() {
    // The header's second line is binary so every tool treats the file as binary.
    this.push(Uint8Array.from([...enc.encode("%PDF-1.7\n%"), 0xe2, 0xe3, 0xcf, 0xd3, 10]));
    this.catalogNum = this.alloc();
    this.pagesNum = this.alloc();
    this.fontNum = this.alloc();
    this.write(this.fontNum, [
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ]);
    this.openNum = this.alloc();
    this.writeStream(this.openNum, "", enc.encode("q\n"));
  }

  get pageCount() {
    return this.kids.length;
  }

  private push(b: Uint8Array) {
    this.chunks.push(b);
    this.length += b.length;
  }

  private alloc() {
    return this.next++;
  }

  private write(num: number, parts: (string | Uint8Array)[]) {
    this.offsets[num] = this.length;
    this.push(enc.encode(`${num} 0 obj\n`));
    for (const p of parts) this.push(typeof p === "string" ? enc.encode(p) : p);
    this.push(enc.encode("\nendobj\n"));
  }

  private writeStream(num: number, entries: string, data: Uint8Array) {
    this.write(num, [`<< ${entries} /Length ${data.length} >>\nstream\n`, data, "\nendstream"]);
  }

  /** Serializes a value; `mapRef` turns a source reference into output text. */
  private ser(v: OutValue | undefined, mapRef: (r: PdfRef) => string): string {
    if (v === null || v === undefined) return "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return fmt(v);
    if (v instanceof PdfName) return nameBytes(v.name);
    if (v instanceof PdfString) return hexString(v.bytes);
    if (v instanceof PdfRef) return mapRef(v);
    if (v instanceof OutRef) return `${v.num} 0 R`;
    if (Array.isArray(v)) return `[${v.map((x) => this.ser(x, mapRef)).join(" ")}]`;
    if (v instanceof PdfStream) return "null"; // a stream can only be indirect
    const entries = v instanceof PdfDict ? v.map : v;
    // Backup is for reading: no scripts or program launches ride along from an uploaded file.
    const action = entries.get("S");
    if (action instanceof PdfName && BLOCKED_ACTIONS.has(action.name)) return "null";
    let s = "<<";
    for (const [k, x] of entries) {
      if (k === "AA") continue; // automatic actions (on open, on close, on hover)
      s += ` ${nameBytes(k)} ${this.ser(x, mapRef)}`;
    }
    return `${s} >>`;
  }

  /** Copies every page of a source PDF, in order. Returns how many pages were added. */
  addPdf(reader: PdfReader): number {
    const pages = reader.pages();
    const map = new Map<number, number>();
    const queue: number[] = [];
    const pageNums = new Map<number, number>();
    for (const p of pages) pageNums.set(p.ref.num, this.alloc());
    const mapRef = (r: PdfRef): string => {
      const page = pageNums.get(r.num);
      if (page !== undefined) return `${page} 0 R`;
      let target: PdfValue;
      try {
        target = reader.resolve(r);
      } catch {
        return "null";
      }
      if (target === null) return "null";
      const t = target instanceof PdfDict ? target.type() : undefined;
      // Never pull in the source's catalog or page tree (they would drag in the whole file).
      if (t === "Catalog" || t === "Pages" || t === "Page") return "null";
      let n = map.get(r.num);
      if (n === undefined) {
        n = this.alloc();
        map.set(r.num, n);
        queue.push(r.num);
      }
      return `${n} 0 R`;
    };

    const added: number[] = [];
    for (const p of pages) {
      const num = pageNums.get(p.ref.num) as number;
      this.writePage(num, p, reader, mapRef);
      added.push(num);
    }
    while (queue.length) {
      const src = queue.shift() as number;
      const out = map.get(src) as number;
      let v: PdfValue;
      try {
        v = reader.resolve(new PdfRef(src, 0));
      } catch {
        v = null;
      }
      if (v instanceof PdfStream) {
        const d = v.dict.clone();
        d.map.delete("Length");
        const head = this.ser(d, mapRef).slice(2, -2);
        this.writeStream(out, head, v.data);
      } else this.write(out, [this.ser(v, mapRef)]);
    }
    this.kids.push(...added);
    return added.length;
  }

  private writePage(num: number, p: PageRecord, reader: PdfReader, mapRef: (r: PdfRef) => string) {
    const d = new Map<string, OutValue>();
    for (const [k, v] of p.dict.map) {
      if (["Parent", "B", "Contents", "Resources", "MediaBox", "CropBox", "Rotate"].includes(k)) {
        continue;
      }
      d.set(k, v);
    }
    d.set("Type", new PdfName("Page"));
    d.set("Parent", new OutRef(this.pagesNum));
    d.set("MediaBox", p.mediaBox);
    if (p.cropBox) d.set("CropBox", p.cropBox);
    if (p.rotate) d.set("Rotate", p.rotate);
    // Resources with the stamp's font added, the source's own entries untouched.
    const res = new Map<string, OutValue>(reader.dict(p.resources)?.map ?? []);
    const fonts = new Map<string, OutValue>(reader.dict(res.get("Font") as PdfValue)?.map ?? []);
    fonts.set(STAMP_FONT, new OutRef(this.fontNum));
    res.set("Font", fonts);
    d.set("Resources", res);
    // Contents wrapped in q ... Q so whatever state the page leaves cannot move the stamp.
    const raw = p.dict.get("Contents");
    const resolved = raw instanceof PdfRef ? reader.resolve(raw) : raw;
    const contents: OutValue[] = Array.isArray(resolved)
      ? resolved
      : raw instanceof PdfRef
        ? [raw]
        : [];
    const stamp = this.alloc();
    d.set("Contents", [new OutRef(this.openNum), ...contents, new OutRef(stamp)]);
    this.stamps.push({ num: stamp, box: visibleBox(p.mediaBox, p.cropBox), rotate: p.rotate });
    this.write(num, [this.ser(d, mapRef)]);
  }

  /** Adds a page showing one photo, fitted to a Letter page in the photo's own orientation. */
  addImagePage(img: PdfImage, caption: string) {
    const shown = displaySize(img);
    const landscape = shown.width > shown.height;
    const W = landscape ? 792 : 612;
    const H = landscape ? 612 : 792;
    const margin = 36;
    const top = 22; // caption band
    const scale = Math.min(
      (W - 2 * margin) / shown.width,
      (H - 2 * margin - top) / shown.height,
      1,
    );
    const dw = shown.width * scale;
    const dh = shown.height * scale;
    const x0 = (W - dw) / 2;
    const y0 = margin + (H - 2 * margin - top - dh) / 2;
    const m = orientationMatrix(img.orientation);
    const cm = [
      dw * (m.x[0] as number),
      dh * (m.y[0] as number),
      dw * (m.x[1] as number),
      dh * (m.y[1] as number),
      x0 + dw * (m.x[2] as number),
      y0 + dh * (m.y[2] as number),
    ];

    const imageNum = this.alloc();
    let smaskRef = "";
    if (img.smask) {
      const sm = this.alloc();
      this.writeStream(
        sm,
        `/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ${img.smask.entries}`,
        img.smask.data,
      );
      smaskRef = ` /SMask ${sm} 0 R`;
    }
    this.writeStream(
      imageNum,
      `/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ${img.entries}${smaskRef}`,
      img.data,
    );
    const text = fitCaption(caption, W - 2 * margin);
    const content =
      `q ${cm.map(fmt).join(" ")} cm /Im0 Do Q\n` +
      `BT /${STAMP_FONT} 9 Tf ${fmt(margin)} ${fmt(H - margin + 4)} Td ${pdfLiteral(text)} Tj ET\n`;
    const contentNum = this.alloc();
    this.writeStream(contentNum, "", enc.encode(content));
    const stamp = this.alloc();
    const pageNum = this.alloc();
    this.write(pageNum, [
      `<< /Type /Page /Parent ${this.pagesNum} 0 R /MediaBox [0 0 ${W} ${H}] ` +
        `/Resources << /XObject << /Im0 ${imageNum} 0 R >> /Font << /${STAMP_FONT} ${this.fontNum} 0 R >> >> ` +
        `/Contents [${this.openNum} 0 R ${contentNum} 0 R ${stamp} 0 R] >>`,
    ]);
    this.stamps.push({ num: stamp, box: [0, 0, W, H], rotate: 0 });
    this.kids.push(pageNum);
  }

  /** Finishes the file. `label` starts every page's stamp. */
  finish(info: { title: string; label: string }): { chunks: Uint8Array[]; length: number } {
    const total = this.kids.length;
    this.stamps.forEach((s, i) => {
      const text = `${info.label} - page ${i + 1} of ${total}`;
      const w = textWidth(text, STAMP_SIZE);
      const [x0, y0, x1, y1] = s.box as [number, number, number, number];
      const shownW = s.rotate % 180 ? y1 - y0 : x1 - x0;
      const X = shownW - 18 - w;
      const Y = 9;
      // Display coordinates to page coordinates for each rotation (the viewer turns the page
      // clockwise by /Rotate degrees).
      const m =
        s.rotate === 90
          ? [0, 1, -1, 0, x1, y0]
          : s.rotate === 180
            ? [-1, 0, 0, -1, x1, y1]
            : s.rotate === 270
              ? [0, -1, 1, 0, x0, y1]
              : [1, 0, 0, 1, x0, y0];
      const body =
        `\nQ\nq ${m.map(fmt).join(" ")} cm BT /${STAMP_FONT} ${STAMP_SIZE} Tf 0 g ` +
        `${fmt(X)} ${fmt(Y)} Td ${pdfLiteral(text)} Tj ET Q\n`;
      this.writeStream(s.num, "", enc.encode(body));
    });
    this.write(this.pagesNum, [
      `<< /Type /Pages /Kids [${this.kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${total} >>`,
    ]);
    this.write(this.catalogNum, [`<< /Type /Catalog /Pages ${this.pagesNum} 0 R >>`]);
    const infoNum = this.alloc();
    this.write(infoNum, [`<< /Title ${pdfLiteral(info.title)} /Producer (PayApps) >>`]);
    const xrefAt = this.length;
    let xref = `xref\n0 ${this.next}\n0000000000 65535 f \n`;
    for (let n = 1; n < this.next; n++) {
      const o = this.offsets[n];
      xref +=
        o === undefined ? "0000000000 65535 f \n" : `${String(o).padStart(10, "0")} 00000 n \n`;
    }
    xref +=
      `trailer\n<< /Size ${this.next} /Root ${this.catalogNum} 0 R /Info ${infoNum} 0 R >>\n` +
      `startxref\n${xrefAt}\n%%EOF\n`;
    this.push(enc.encode(xref));
    return { chunks: this.chunks, length: this.length };
  }
}

/** The part of the page a viewer shows: the crop box clipped to the media box. */
function visibleBox(media: number[], crop: number[] | undefined): number[] {
  const norm = (b: number[]) => [
    Math.min(b[0] as number, b[2] as number),
    Math.min(b[1] as number, b[3] as number),
    Math.max(b[0] as number, b[2] as number),
    Math.max(b[1] as number, b[3] as number),
  ];
  const m = norm(media);
  if (!crop) return m;
  const c = norm(crop);
  const box = [
    Math.max(m[0] as number, c[0] as number),
    Math.max(m[1] as number, c[1] as number),
    Math.min(m[2] as number, c[2] as number),
    Math.min(m[3] as number, c[3] as number),
  ];
  return (box[2] as number) > (box[0] as number) && (box[3] as number) > (box[1] as number)
    ? box
    : m;
}

function fitCaption(text: string, maxWidth: number) {
  const clean = toPdfText(text);
  if (textWidth(clean, 9) <= maxWidth) return clean;
  let s = clean;
  while (s.length > 1 && textWidth(`${s}...`, 9) > maxWidth) s = s.slice(0, -1);
  return `${s}...`;
}
