// Fills another program's fillable PDF (an AcroForm, ISO 32000-1 §12.7) and returns the same file
// with an incremental update appended (§7.5.6): new versions of the changed field and widget
// objects, the form's /NeedAppearances set so a viewer redraws the typed values, and a new
// cross-reference section whose /Prev points at the old one. The original bytes are left exactly as
// they were, so the agency's form (its layout, scripts and wording) is what goes back to the agency.
//
// Used for New Jersey's MW-562 (src/shared/nj-mw562.ts), which the NJ Wage Hub reads field by field
// when the filled PDF is uploaded. Pure and runs in the browser: the payroll never leaves it.
//
// What it does not do: draw appearance streams (the changed widgets' old /AP is dropped and
// /NeedAppearances asks the viewer to draw them), fill an XFA form (the /XFA entry is removed so a
// viewer uses the AcroForm values), or update an encrypted or damaged file (refused, with a reason).

import { ascii, PdfDict, PdfName, PdfRef, PdfStream, PdfString, type PdfValue } from "./objects";
import { PdfReader, PdfUnreadable } from "./reader";
import { textString } from "./text";

/** Why a form cannot be filled, worded for the person who chose the file. */
export class FormFillError extends Error {}

export type FieldKind = "text" | "checkbox" | "other";

export interface FormField {
  /** Fully qualified name: the partial names (/T) from the root joined by ".". */
  name: string;
  kind: FieldKind;
  /** Current value: text, true/false for a check box, null when unset. */
  value: string | boolean | null;
  /** A check box's "on" appearance state ("Yes", "On"...). */
  onState?: string;
}

interface FieldNode extends FormField {
  ref: PdfRef;
  dict: PdfDict;
  /** Widget annotations: the field's own dictionary when merged, else its kids without /T. */
  widgets: { ref: PdfRef | null; dict: PdfDict }[];
}

const MAX_FIELDS = 5000;
const MAX_DEPTH = 32;

function onStateOf(widgets: FieldNode["widgets"], reader: PdfReader): string | undefined {
  for (const w of widgets) {
    const ap = reader.dict(w.dict.get("AP"));
    const n = reader.dict(ap?.get("N"));
    if (!n) continue;
    for (const k of n.map.keys()) if (k !== "Off") return k;
  }
  return undefined;
}

function collect(reader: PdfReader): { fields: Map<string, FieldNode>; acroForm: PdfValue } {
  const base = reader.updateBase();
  const catalog = reader.dict(base?.trailer.get("Root"));
  const acroForm = catalog?.get("AcroForm");
  const form = reader.dict(acroForm);
  const roots = reader.resolve(form?.get("Fields"));
  if (!form || !Array.isArray(roots) || roots.length === 0) {
    throw new FormFillError("is not a fillable PDF form (it has no form fields)");
  }
  const fields = new Map<string, FieldNode>();
  const seen = new Set<number>();
  const walk = (v: PdfValue, prefix: string, ft: string | undefined, depth: number) => {
    if (depth > MAX_DEPTH) throw new FormFillError("has form fields nested too deep to read");
    if (!(v instanceof PdfRef) || seen.has(v.num)) return;
    seen.add(v.num);
    if (seen.size > MAX_FIELDS) throw new FormFillError("has too many form fields");
    const dict = reader.dict(v);
    if (!dict) return;
    const t = dict.get("T");
    const name =
      t instanceof PdfString
        ? prefix
          ? `${prefix}.${textString(t.bytes)}`
          : textString(t.bytes)
        : prefix;
    const own = dict.get("FT");
    const type = own instanceof PdfName ? own.name : ft;
    const kidsValue = reader.resolve(dict.get("Kids"));
    const kids = Array.isArray(kidsValue) ? kidsValue : [];
    const fieldKids: PdfValue[] = [];
    const widgets: FieldNode["widgets"] = [];
    const sub = dict.get("Subtype");
    if (sub instanceof PdfName && sub.name === "Widget") widgets.push({ ref: v, dict });
    for (const k of kids) {
      const kd = reader.dict(k);
      if (!kd) continue;
      if (kd.get("T") instanceof PdfString) fieldKids.push(k);
      else widgets.push({ ref: k instanceof PdfRef ? k : null, dict: kd });
    }
    if (t instanceof PdfString && (widgets.length > 0 || kids.length === 0)) {
      const kind: FieldKind = type === "Tx" ? "text" : type === "Btn" ? "checkbox" : "other";
      let value: FormField["value"] = null;
      const raw = reader.resolve(dict.get("V"));
      if (kind === "text" && raw instanceof PdfString) value = textString(raw.bytes);
      if (kind === "checkbox" && raw instanceof PdfName) value = raw.name !== "Off";
      // A button with Ff bit 17 (push button) or 16 (radio) is not a check box.
      const ff = reader.resolve(dict.get("Ff"));
      const flags = typeof ff === "number" ? ff : 0;
      const notCheckbox = kind === "checkbox" && (flags & ((1 << 15) | (1 << 16))) !== 0;
      const node: FieldNode = {
        name,
        kind: notCheckbox ? "other" : kind,
        value,
        ref: v,
        dict,
        widgets,
      };
      if (node.kind === "checkbox") node.onState = onStateOf(widgets, reader) ?? "Yes";
      fields.set(name, node);
    }
    for (const k of fieldKids) walk(k, name, type, depth + 1);
  };
  for (const r of roots) walk(r, "", undefined, 0);
  return { fields, acroForm: acroForm ?? null };
}

async function open(bytes: Uint8Array): Promise<PdfReader> {
  try {
    return await PdfReader.open(bytes);
  } catch (e) {
    if (e instanceof PdfUnreadable) throw new FormFillError(e.message);
    throw e;
  }
}

/** The form's fields, by fully qualified name. */
export async function readFormFields(bytes: Uint8Array): Promise<Map<string, FormField>> {
  const reader = await open(bytes);
  const { fields } = collect(reader);
  const out = new Map<string, FormField>();
  for (const [k, f] of fields) {
    out.set(k, { name: f.name, kind: f.kind, value: f.value, onState: f.onState });
  }
  return out;
}

// --- serialisation -------------------------------------------------------------------------

const fmt = (n: number) => {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  const s = n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
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

function serialize(v: PdfValue, depth = 0): string {
  if (depth > 64) throw new FormFillError("has an object nested too deep to rewrite");
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return fmt(v);
  if (v instanceof PdfName) return nameToken(v.name);
  if (v instanceof PdfString) return hex(v.bytes);
  if (v instanceof PdfRef) return `${v.num} ${v.gen} R`;
  if (Array.isArray(v)) return `[${v.map((x) => serialize(x, depth + 1)).join(" ")}]`;
  if (v instanceof PdfDict) {
    let s = "<<";
    for (const [k, x] of v.map) s += `${nameToken(k)} ${serialize(x, depth + 1)}`;
    return `${s}>>`;
  }
  if (v instanceof PdfStream) throw new FormFillError("keeps a form field inside a stream");
  return "null";
}

/**
 * A text value as a PDF text string: PDFDocEncoding (here, printable ASCII and line breaks) where
 * that is enough, otherwise UTF-16BE with its byte order mark (§7.9.2.2).
 */
export function pdfTextString(s: string): PdfString {
  if (/^[\x20-\x7e\n\r\t]*$/.test(s)) return new PdfString(ascii(s));
  const out = new Uint8Array(2 + s.length * 2);
  out[0] = 0xfe;
  out[1] = 0xff;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[2 + i * 2] = c >> 8;
    out[3 + i * 2] = c & 0xff;
  }
  return new PdfString(out);
}

const concat = (parts: Uint8Array[]) => {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

export interface FillOptions {
  /** Clear every field not in `values` that holds a value (a blank form sent with sample entries). */
  clearOthers?: boolean;
}

/**
 * The form with `values` filled in: text fields take strings, check boxes true/false. A name the
 * form does not have, or a value of the wrong kind, is refused rather than silently dropped.
 */
export async function fillForm(
  bytes: Uint8Array,
  values: Readonly<Record<string, string | boolean>>,
  options: FillOptions = {},
): Promise<Uint8Array> {
  const reader = await open(bytes);
  const base = reader.updateBase();
  if (!base) {
    throw new FormFillError(
      reader.wasEncrypted
        ? "is encrypted, so PayApps cannot add the values to it"
        : "is damaged (its cross-reference had to be rebuilt), so PayApps cannot add the values to it",
    );
  }
  const { fields, acroForm } = collect(reader);

  const missing = Object.keys(values).filter((k) => !fields.has(k));
  if (missing.length) {
    throw new FormFillError(
      `does not have the field${missing.length > 1 ? "s" : ""} ${missing
        .slice(0, 5)
        .map((m) => `"${m}"`)
        .join(", ")}${missing.length > 5 ? ` and ${missing.length - 5} more` : ""}`,
    );
  }

  /** New versions of objects, by number. */
  const changed = new Map<number, { gen: number; value: PdfDict }>();
  const editable = (ref: PdfRef, dict: PdfDict) => {
    const had = changed.get(ref.num);
    if (had) return had.value;
    const copy = dict.clone();
    changed.set(ref.num, { gen: ref.gen, value: copy });
    return copy;
  };

  const setField = (f: FieldNode, value: string | boolean) => {
    if (f.kind === "text") {
      if (typeof value !== "string") throw new FormFillError(`field "${f.name}" takes text`);
      const d = editable(f.ref, f.dict);
      d.set("V", pdfTextString(value));
      for (const w of f.widgets) {
        if (!w.dict.get("AP")) continue;
        // A widget merged into its field is the same object: edit the same copy.
        const wd = w.ref ? editable(w.ref, w.dict) : null;
        if (!wd) throw new FormFillError(`field "${f.name}" has a widget PayApps cannot rewrite`);
        wd.map.delete("AP");
      }
      return;
    }
    if (f.kind === "checkbox") {
      if (typeof value !== "boolean") throw new FormFillError(`field "${f.name}" is a check box`);
      const state = value ? (f.onState ?? "Yes") : "Off";
      editable(f.ref, f.dict).set("V", new PdfName(state));
      for (const w of f.widgets) {
        if (!w.ref)
          throw new FormFillError(`field "${f.name}" has a widget PayApps cannot rewrite`);
        const n = reader.dict(reader.dict(w.dict.get("AP"))?.get("N"));
        const has = !value || !n || n.get(state) !== undefined;
        editable(w.ref, w.dict).set("AS", new PdfName(has ? state : "Off"));
      }
      return;
    }
    throw new FormFillError(`field "${f.name}" is not a text field or a check box`);
  };

  for (const [name, value] of Object.entries(values))
    setField(fields.get(name) as FieldNode, value);
  if (options.clearOthers) {
    for (const f of fields.values()) {
      if (f.name in values || f.value === null || f.value === "" || f.value === false) continue;
      if (f.kind === "text") setField(f, "");
      else if (f.kind === "checkbox") setField(f, false);
    }
  }

  // The form dictionary: /NeedAppearances so the dropped appearances are drawn; no /XFA.
  const root = base.trailer.get("Root") as PdfRef;
  if (acroForm instanceof PdfRef) {
    const d = editable(acroForm, reader.dict(acroForm) as PdfDict);
    d.set("NeedAppearances", true);
    d.map.delete("XFA");
  } else {
    const cat = editable(root, reader.dict(root) as PdfDict);
    const d = (reader.dict(acroForm) as PdfDict).clone();
    d.set("NeedAppearances", true);
    d.map.delete("XFA");
    cat.set("AcroForm", d);
  }

  // Append the objects and a cross-reference section of the same kind as the file's newest.
  const parts: Uint8Array[] = [bytes];
  let at = bytes.length;
  const push = (s: string) => {
    const b = ascii(s);
    parts.push(b);
    at += b.length;
  };
  if (bytes[bytes.length - 1] !== 0x0a && bytes[bytes.length - 1] !== 0x0d) push("\n");
  const offsets = new Map<number, { offset: number; gen: number }>();
  for (const num of [...changed.keys()].sort((a, b) => a - b)) {
    const { gen, value } = changed.get(num) as { gen: number; value: PdfDict };
    offsets.set(num, { offset: at, gen });
    push(`${num} ${gen} obj\n${serialize(value)}\nendobj\n`);
  }
  const keep = new PdfDict();
  for (const k of ["Root", "Info", "ID"]) {
    const v = base.trailer.get(k);
    if (v !== undefined) keep.set(k, v);
  }
  const classic = String.fromCharCode(...bytes.subarray(base.prev, base.prev + 4)) === "xref";
  if (classic) {
    const xrefAt = at;
    let table = "xref\n";
    for (const [num, e] of [...offsets].sort((a, b) => a[0] - b[0])) {
      table += `${num} 1\n${String(e.offset).padStart(10, "0")} ${String(e.gen).padStart(5, "0")} n\r\n`;
    }
    keep.set("Size", base.size).set("Prev", base.prev);
    push(`${table}trailer\n${serialize(keep)}\nstartxref\n${xrefAt}\n%%EOF\n`);
  } else {
    const xrefNum = base.size;
    const xrefAt = at;
    offsets.set(xrefNum, { offset: xrefAt, gen: 0 });
    const rows = [...offsets].sort((a, b) => a[0] - b[0]);
    const data = new Uint8Array(rows.length * 7);
    const index: number[] = [];
    rows.forEach(([num, e], i) => {
      index.push(num, 1);
      const p = i * 7;
      data[p] = 1;
      data[p + 1] = (e.offset >>> 24) & 0xff;
      data[p + 2] = (e.offset >>> 16) & 0xff;
      data[p + 3] = (e.offset >>> 8) & 0xff;
      data[p + 4] = e.offset & 0xff;
      data[p + 5] = (e.gen >> 8) & 0xff;
      data[p + 6] = e.gen & 0xff;
    });
    keep
      .set("Type", new PdfName("XRef"))
      .set("Size", xrefNum + 1)
      .set("Prev", base.prev)
      .set("W", [1, 4, 2])
      .set("Index", index)
      .set("Length", data.length);
    push(`${xrefNum} 0 obj\n${serialize(keep)}\nstream\n`);
    parts.push(data);
    at += data.length;
    push(`\nendstream\nendobj\nstartxref\n${xrefAt}\n%%EOF\n`);
  }
  return concat(parts);
}
