// Fills the text fields and check boxes of someone else's fillable PDF (an AcroForm, ISO 32000-1
// §12.7) and returns the file with an incremental update appended: the original bytes are kept as
// they are, and the changed field dictionaries, a new appearance for each filled text field and a
// new cross-reference section follow them (§7.5.6). That is what Acrobat does when it saves a
// filled form, so an agency's portal that reads the form back sees the values where a person
// typing into the form would have put them.
//
// Each filled text field gets its own appearance stream (Helvetica-style widths, the field's own
// font size, shrunk to fit), so the file prints and previews correctly even in viewers that ignore
// /NeedAppearances; /NeedAppearances is set too, so Acrobat redraws the fields its own way.
//
// Limits, all reported as PdfUnreadable for the contractor: a form that is encrypted (the update
// would have to be encrypted too), whose cross-reference was broken (an update needs a valid one to
// point back to), with no AcroForm, or an XFA-only form.
import { textWidth, toPdfText } from "../../worker/services/export/pdf";
import {
  ascii,
  Lexer,
  lastIndexOf,
  PdfDict,
  PdfName,
  PdfRef,
  PdfString,
  type PdfValue,
} from "./objects";
import { concatBytes, PdfReader, PdfUnreadable } from "./reader";

export interface FormField {
  /** Fully qualified name: the /T of each ancestor joined with "." (§12.7.3.2). */
  name: string;
  kind: "text" | "checkbox" | "other";
  maxLen: number | null;
  /** Check box: the "on" appearance state ("Yes", "On"); null for other kinds. */
  onState: string | null;
  /** The current value as text ("" when empty; a check box's state name). */
  value: string;
}

interface Terminal extends FormField {
  ref: PdfRef;
  dict: PdfDict;
  /** Widget annotations: the field itself when it has no widget kids. */
  widgets: { ref: PdfRef; dict: PdfDict }[];
  da: string;
  q: number;
}

export type FormValues = Record<string, string | boolean>;

const MAX_FIELDS = 5000;
const MAX_TREE_DEPTH = 32;

/** A PDF text string (§7.9.2.2): UTF-16BE with a BOM, or PDFDocEncoding read as Latin-1. */
export function decodeTextString(b: Uint8Array): string {
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
    let s = "";
    for (let i = 2; i + 1 < b.length; i += 2)
      s += String.fromCharCode(((b[i] as number) << 8) | (b[i + 1] as number));
    return s;
  }
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return s;
}

/** A text string for a value: PDFDocEncoding when it is printable Latin-1, else UTF-16BE. */
export function encodeTextString(s: string): Uint8Array {
  if (/^[\x20-\x7e\xa1-\xff\n\r\t]*$/.test(s)) return Uint8Array.from(s, (c) => c.charCodeAt(0));
  const out = new Uint8Array(2 + s.length * 2);
  out[0] = 0xfe;
  out[1] = 0xff;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[2 + i * 2] = c >> 8;
    out[3 + i * 2] = c & 0xff;
  }
  return out;
}

class Form {
  readonly fields = new Map<string, Terminal>();
  acroRef: PdfRef | null = null;
  acro = new PdfDict();
  catalog = new PdfDict();
  catalogRef: PdfRef;

  constructor(readonly reader: PdfReader) {
    if (reader.wasEncrypted) {
      throw new PdfUnreadable("is encrypted: open it, save an unprotected copy and choose that");
    }
    if (reader.wasRecovered) {
      throw new PdfUnreadable("is damaged (its cross-reference table is broken)");
    }
    const root = reader.trailerDict.get("Root");
    const catalog = reader.dict(root);
    if (!(root instanceof PdfRef) || !catalog) throw new PdfUnreadable("has no document catalog");
    this.catalogRef = root;
    this.catalog = catalog;
    const af = catalog.get("AcroForm");
    if (af instanceof PdfRef) this.acroRef = af;
    const acro = reader.dict(af);
    const list = reader.resolve(acro?.get("Fields"));
    if (!acro || !Array.isArray(list) || list.length === 0) {
      throw new PdfUnreadable(
        acro?.get("XFA") ? "is an XFA form, which PayApps cannot fill" : "has no form fields",
      );
    }
    this.acro = acro;
    for (const k of list) this.walk(k, "", {}, 0);
  }

  private walk(
    v: PdfValue,
    prefix: string,
    inh: { ft?: string; da?: string; q?: number; maxLen?: number },
    depth: number,
  ) {
    if (depth > MAX_TREE_DEPTH || this.fields.size > MAX_FIELDS) return;
    if (!(v instanceof PdfRef)) return;
    const d = this.reader.dict(v);
    if (!d) return;
    const t = this.reader.resolve(d.get("T"));
    const part = t instanceof PdfString ? decodeTextString(t.bytes) : null;
    const name = part === null ? prefix : prefix ? `${prefix}.${part}` : part;
    const ft = this.reader.resolve(d.get("FT"));
    const da = this.reader.resolve(d.get("DA"));
    const q = this.reader.resolve(d.get("Q"));
    const ml = this.reader.resolve(d.get("MaxLen"));
    const next = {
      ft: ft instanceof PdfName ? ft.name : inh.ft,
      da: da instanceof PdfString ? decodeTextString(da.bytes) : inh.da,
      q: typeof q === "number" ? q : inh.q,
      maxLen: typeof ml === "number" ? ml : inh.maxLen,
    };
    const kids = this.reader.resolve(d.get("Kids"));
    const kidRefs = Array.isArray(kids) ? kids.filter((k): k is PdfRef => k instanceof PdfRef) : [];
    const fieldKids = kidRefs.filter((k) => this.reader.dict(k)?.get("T") !== undefined);
    if (fieldKids.length > 0) {
      for (const k of fieldKids) this.walk(k, name, next, depth + 1);
      return;
    }
    if (!name) return;
    const widgets = kidRefs.length
      ? kidRefs.flatMap((k) => {
          const w = this.reader.dict(k);
          return w ? [{ ref: k, dict: w }] : [];
        })
      : [{ ref: v, dict: d }];
    const ff = this.reader.resolve(d.get("Ff"));
    const flags = typeof ff === "number" ? ff : 0;
    let kind: FormField["kind"] = "other";
    let onState: string | null = null;
    if (next.ft === "Tx") kind = "text";
    else if (next.ft === "Btn" && !(flags & (1 << 15)) && !(flags & (1 << 16))) {
      kind = "checkbox";
      for (const w of widgets) {
        const n = this.reader.dict(this.reader.dict(w.dict.get("AP"))?.get("N"));
        for (const key of n?.map.keys() ?? []) if (key !== "Off") onState ??= key;
      }
      onState ??= "Yes";
    }
    const cur = this.reader.resolve(d.get("V"));
    const value =
      cur instanceof PdfString
        ? decodeTextString(cur.bytes)
        : cur instanceof PdfName
          ? cur.name
          : "";
    this.fields.set(name, {
      name,
      kind,
      maxLen: next.maxLen ?? null,
      onState,
      value,
      ref: v,
      dict: d,
      widgets,
      da: next.da ?? "",
      q: next.q ?? 0,
    });
  }

  /** The font resource of a DA string ("/Helv 9 Tf 0 g"), if the AcroForm's /DR has it. */
  font(da: string): { name: string; size: number; ref: PdfValue } | null {
    const m = /\/([^\s/]+)\s+([\d.]+)\s+Tf/.exec(da || this.daDefault());
    if (!m) return null;
    const fonts = this.reader.dict(this.reader.dict(this.acro.get("DR"))?.get("Font"));
    const ref = fonts?.get(m[1] as string);
    if (ref === undefined) return null;
    return { name: m[1] as string, size: Number(m[2]), ref };
  }

  private daDefault(): string {
    const da = this.reader.resolve(this.acro.get("DA"));
    return da instanceof PdfString ? decodeTextString(da.bytes) : "";
  }
}

/** The form's fields, by fully qualified name. Throws PdfUnreadable when it cannot be filled. */
export async function readFormFields(bytes: Uint8Array): Promise<Map<string, FormField>> {
  const form = new Form(await PdfReader.open(bytes));
  const out = new Map<string, FormField>();
  for (const [k, f] of form.fields) {
    out.set(k, {
      name: f.name,
      kind: f.kind,
      maxLen: f.maxLen,
      onState: f.onState,
      value: f.value,
    });
  }
  return out;
}

// --- writing ---------------------------------------------------------------------------------

const fmt = (n: number) => {
  if (!Number.isFinite(n)) return "0";
  const s = Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
};

const nameToken = (name: string) => {
  let s = "/";
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i) & 0xff;
    const plain = c > 0x20 && c < 0x7f && !"#()<>[]{}/%".includes(String.fromCharCode(c));
    s += plain ? String.fromCharCode(c) : `#${c.toString(16).padStart(2, "0")}`;
  }
  return s;
};

const hex = (b: Uint8Array) => {
  let s = "<";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return `${s}>`;
};

/** Serialises a value read from the same file (references keep their numbers: this is an update). */
function serialize(v: PdfValue): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return fmt(v);
  if (v instanceof PdfName) return nameToken(v.name);
  if (v instanceof PdfString) return hex(v.bytes);
  if (v instanceof PdfRef) return `${v.num} ${v.gen} R`;
  if (Array.isArray(v)) return `[${v.map(serialize).join(" ")}]`;
  if (v instanceof PdfDict) {
    let s = "<<";
    for (const [k, x] of v.map) s += `${nameToken(k)} ${serialize(x)}`;
    return `${s}>>`;
  }
  // A stream is never a field or widget dictionary; refuse rather than write it wrong.
  throw new PdfUnreadable("has a form field stored in an unexpected way");
}

const pdfText = (s: string) => `(${toPdfText(s).replace(/[\\()]/g, (c) => `\\${c}`)})`;

/** One line of text in a widget's box: the content stream of its normal appearance. */
function textAppearance(
  text: string,
  box: { w: number; h: number },
  font: { name: string; size: number },
  q: number,
): string {
  if (!text) return "/Tx BMC EMC";
  const narrow = /narrow|condensed/i.test(font.name) ? 0.82 : 1;
  const one = Math.max(textWidth(text, 1) * narrow, 0.001);
  const pad = 2;
  const room = Math.max(box.w - 2 * pad, 1);
  let size = font.size > 0 ? font.size : Math.min(9, box.h * 0.7);
  if (one * size > room) size = Math.max(room / one, 3);
  size = Math.min(size, Math.max(box.h - 1, 3));
  const tw = one * size;
  const x = q === 1 ? (box.w - tw) / 2 : q === 2 ? box.w - pad - tw : pad;
  const y = (box.h - size) / 2 + size * 0.22;
  return [
    "/Tx BMC",
    "q",
    `1 1 ${fmt(box.w - 2)} ${fmt(box.h - 2)} re W n`,
    "BT",
    `${nameToken(font.name)} ${fmt(size)} Tf 0 g`,
    `${fmt(Math.max(x, 1))} ${fmt(y)} Td`,
    `${pdfText(text)} Tj`,
    "ET",
    "Q",
    "EMC",
  ].join("\n");
}

function boxOf(reader: PdfReader, d: PdfDict): { w: number; h: number } {
  const r = reader.resolve(d.get("Rect"));
  const n = Array.isArray(r) ? r.map((x) => reader.resolve(x)) : [];
  if (n.length !== 4 || !n.every((x) => typeof x === "number")) return { w: 0, h: 0 };
  const [a, b, c, e] = n as number[];
  return { w: Math.abs((c as number) - (a as number)), h: Math.abs((e as number) - (b as number)) };
}

/** The byte offset the file's last `startxref` points to, and whether that section is a stream. */
function lastXref(bytes: Uint8Array): { offset: number; stream: boolean } {
  const at = lastIndexOf(bytes, ascii("startxref"));
  const offset = Number(new Lexer(bytes, at + 9).word());
  const lx = new Lexer(bytes, offset);
  return { offset, stream: lx.peekWord() !== "xref" };
}

export class FormFillError extends Error {}

/**
 * Fills `values` (text for text fields, true/false for check boxes) and returns the updated file.
 * A name the form does not have, a text longer than the field's MaxLen, or a value of the wrong
 * kind throws FormFillError, so a changed form is never filled half right.
 */
export async function fillForm(bytes: Uint8Array, values: FormValues): Promise<Uint8Array> {
  const reader = await PdfReader.open(bytes);
  const form = new Form(reader);
  const changed = new Map<number, { gen: number; dict: PdfDict }>();
  const edit = (ref: PdfRef, base: PdfDict) => {
    const cur = changed.get(ref.num);
    if (cur) return cur.dict;
    const dict = base.clone();
    changed.set(ref.num, { gen: ref.gen, dict });
    return dict;
  };
  const size = reader.trailerDict.get("Size");
  let nextNum = typeof size === "number" ? size : 0;
  const fresh: { num: number; body: string }[] = [];

  for (const [name, value] of Object.entries(values)) {
    const f = form.fields.get(name);
    if (!f) throw new FormFillError(`The form has no field named "${name}"`);
    if (f.kind === "checkbox") {
      if (typeof value !== "boolean") throw new FormFillError(`"${name}" is a check box`);
      const state = new PdfName(value ? (f.onState as string) : "Off");
      edit(f.ref, f.dict).set("V", state);
      for (const w of f.widgets) edit(w.ref, w.dict).set("AS", state);
      continue;
    }
    if (f.kind !== "text") throw new FormFillError(`"${name}" is not a text field or check box`);
    if (typeof value !== "string") throw new FormFillError(`"${name}" is a text field`);
    if (f.maxLen !== null && value.length > f.maxLen) {
      throw new FormFillError(`"${name}" holds at most ${f.maxLen} characters`);
    }
    edit(f.ref, f.dict).set("V", new PdfString(encodeTextString(value)));
    const font = form.font(f.da);
    for (const w of f.widgets) {
      const wd = edit(w.ref, w.dict);
      if (!font) {
        wd.map.delete("AP"); // the viewer draws it from /NeedAppearances
        continue;
      }
      const box = boxOf(reader, w.dict);
      const content = ascii(textAppearance(value, box, font, f.q));
      const num = nextNum++;
      const res = `<</Font<<${nameToken(font.name)} ${serialize(font.ref)}>>>>`;
      fresh.push({
        num,
        body: `<</Type/XObject/Subtype/Form/BBox[0 0 ${fmt(box.w)} ${fmt(box.h)}]/Resources${res}/Length ${content.length}>>\nstream\n${decodeLatin1(content)}\nendstream`,
      });
      const ap = new PdfDict().set("N", new PdfRef(num, 0));
      wd.set("AP", ap);
    }
  }

  // /NeedAppearances on the AcroForm (an indirect dictionary, or a direct one in the catalog).
  if (form.acroRef) edit(form.acroRef, form.acro).set("NeedAppearances", true);
  else
    edit(form.catalogRef, form.catalog).set(
      "AcroForm",
      form.acro.clone().set("NeedAppearances", true),
    );

  const prev = lastXref(bytes);
  const parts: Uint8Array[] = [bytes, ascii("\n")];
  let pos = bytes.length + 1;
  const offsets = new Map<number, { offset: number; gen: number }>();
  const push = (num: number, gen: number, body: string) => {
    const chunk = ascii(`${num} ${gen} obj\n${body}\nendobj\n`);
    offsets.set(num, { offset: pos, gen });
    parts.push(chunk);
    pos += chunk.length;
  };
  for (const [num, { gen, dict }] of changed) push(num, gen, serialize(dict));
  for (const x of fresh) push(x.num, 0, x.body);

  const t = reader.trailerDict;
  const keep = ["Root", "Info", "ID"].flatMap((k) => {
    const v = t.get(k);
    return v === undefined ? [] : [`/${k} ${serialize(v)}`];
  });
  const xrefAt = pos;
  if (prev.stream) {
    const selfNum = nextNum++;
    offsets.set(selfNum, { offset: xrefAt, gen: 0 });
    const { index, data } = xrefStreamData(offsets);
    const head = ascii(
      `${selfNum} 0 obj\n<</Type/XRef/Size ${nextNum}/W[1 4 2]/Index[${index.join(" ")}]/Prev ${prev.offset}${keep.join("")}/Length ${data.length}>>\nstream\n`,
    );
    parts.push(head, data, ascii("\nendstream\nendobj\n"));
  } else {
    let s = "xref\n";
    for (const run of runs([...offsets.keys()])) {
      s += `${run[0]} ${run.length}\n`;
      for (const n of run) {
        const o = offsets.get(n) as { offset: number; gen: number };
        s += `${String(o.offset).padStart(10, "0")} ${String(o.gen).padStart(5, "0")} n\r\n`;
      }
    }
    s += `trailer\n<</Size ${nextNum}/Prev ${prev.offset}${keep.join("")}>>\n`;
    parts.push(ascii(s));
  }
  parts.push(ascii(`startxref\n${xrefAt}\n%%EOF\n`));
  return concatBytes(parts);
}

function decodeLatin1(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return s;
}

function runs(nums: number[]): number[][] {
  const sorted = [...nums].sort((a, b) => a - b);
  const out: number[][] = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (last && last[last.length - 1] === n - 1) last.push(n);
    else out.push([n]);
  }
  return out;
}

function xrefStreamData(offsets: Map<number, { offset: number; gen: number }>) {
  const index: number[] = [];
  const rows: number[][] = [];
  for (const run of runs([...offsets.keys()])) {
    index.push(run[0] as number, run.length);
    for (const n of run) {
      const o = offsets.get(n) as { offset: number; gen: number };
      rows.push([1, o.offset, o.gen]);
    }
  }
  const data = new Uint8Array(rows.length * 7);
  rows.forEach(([type, off, gen], i) => {
    const b = i * 7;
    data[b] = type as number;
    data[b + 1] = ((off as number) >>> 24) & 0xff;
    data[b + 2] = ((off as number) >>> 16) & 0xff;
    data[b + 3] = ((off as number) >>> 8) & 0xff;
    data[b + 4] = (off as number) & 0xff;
    data[b + 5] = ((gen as number) >> 8) & 0xff;
    data[b + 6] = (gen as number) & 0xff;
  });
  return { index, data };
}
