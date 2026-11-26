// ISO 10303-21 (STEP physical file) reader: turns the DATA section into a map of instances.
// Schema-agnostic: AP203, AP214 and AP242 all come through the same way.

export interface Ref {
  ref: number;
}
export interface Enum {
  enum: string;
}
export interface Typed {
  typed: string;
  value: Value;
}
export interface Derived {
  derived: true;
}
export type Value = number | string | null | Ref | Enum | Typed | Derived | Value[];

export interface Part {
  type: string;
  args: Value[];
}

/** A simple instance has one part; a complex instance `( A() B() )` has several. */
export interface Instance {
  id: number;
  type: string;
  args: Value[];
  parts: Part[];
}

export interface StepFile {
  schema: string;
  instances: Map<number, Instance>;
  errors: number;
}

export const isRef = (v: Value | undefined): v is Ref =>
  typeof v === "object" && v !== null && !Array.isArray(v) && "ref" in v;
export const isEnum = (v: Value | undefined): v is Enum =>
  typeof v === "object" && v !== null && !Array.isArray(v) && "enum" in v;
export const isTyped = (v: Value | undefined): v is Typed =>
  typeof v === "object" && v !== null && !Array.isArray(v) && "typed" in v;

class Cursor {
  i = 0;
  readonly s: string;
  constructor(s: string) {
    this.s = s;
  }

  skip(): void {
    const s = this.s;
    for (;;) {
      const c = s.charCodeAt(this.i);
      if (c === 32 || c === 9 || c === 10 || c === 13) {
        this.i++;
      } else if (c === 47 && s.charCodeAt(this.i + 1) === 42) {
        const end = s.indexOf("*/", this.i + 2);
        this.i = end < 0 ? s.length : end + 2;
      } else return;
    }
  }

  peek(): string {
    this.skip();
    return this.s[this.i] ?? "";
  }

  expect(ch: string): void {
    if (this.peek() !== ch) throw new Error(`expected ${ch} at ${this.i}`);
    this.i++;
  }

  keyword(): string {
    this.skip();
    const start = this.i;
    while (this.i < this.s.length && /[A-Za-z0-9_!]/.test(this.s[this.i] as string)) this.i++;
    return this.s.slice(start, this.i).toUpperCase();
  }

  value(): Value {
    const c = this.peek();
    const s = this.s;
    if (c === "'") {
      let out = "";
      this.i++;
      for (;;) {
        const end = s.indexOf("'", this.i);
        if (end < 0) throw new Error("unterminated string");
        out += s.slice(this.i, end);
        this.i = end + 1;
        if (s[this.i] === "'") {
          out += "'";
          this.i++;
        } else break;
      }
      return out;
    }
    if (c === '"') {
      const end = s.indexOf('"', this.i + 1);
      const v = s.slice(this.i + 1, end);
      this.i = end + 1;
      return v;
    }
    if (c === "#") {
      this.i++;
      const start = this.i;
      while (/[0-9]/.test(s[this.i] ?? "")) this.i++;
      return { ref: Number(s.slice(start, this.i)) };
    }
    if (c === "$") {
      this.i++;
      return null;
    }
    if (c === "*") {
      this.i++;
      return { derived: true };
    }
    if (c === ".") {
      const end = s.indexOf(".", this.i + 1);
      const v = s.slice(this.i + 1, end).toUpperCase();
      this.i = end + 1;
      return { enum: v };
    }
    if (c === "(") return this.list();
    if (/[-+0-9]/.test(c)) {
      const start = this.i;
      this.i++;
      while (/[0-9.eE+-]/.test(s[this.i] ?? "")) this.i++;
      return Number(s.slice(start, this.i));
    }
    if (/[A-Za-z]/.test(c)) {
      const typed = this.keyword();
      const args = this.list();
      return { typed, value: args.length === 1 ? (args[0] as Value) : args };
    }
    throw new Error(`unexpected ${c} at ${this.i}`);
  }

  list(): Value[] {
    this.expect("(");
    const out: Value[] = [];
    if (this.peek() === ")") {
      this.i++;
      return out;
    }
    for (;;) {
      out.push(this.value());
      const c = this.peek();
      this.i++;
      if (c === ")") return out;
      if (c !== ",") throw new Error(`expected , or ) at ${this.i - 1}`);
    }
  }
}

const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c);
const isWordChar = (c: string | undefined) => c !== undefined && /\w/.test(c);

/**
 * Index of the `DATA;` (or `DATA(...);`) section header, or -1: the first match of
 * /\bDATA\s*(\([^)]*\))?\s*;/, found in linear time. The regex backtracks over whitespace once
 * per "DATA" (a file of "DATA" and a long run of tabs takes quadratic time); this scan reads each
 * whitespace run once and remembers the next ")" so every candidate shares one forward search.
 */
export function dataSectionStart(text: string): number {
  let close = -1; // the first ")" at or after the last "(" looked at; -2 once none is left
  let afterClose = -1; // the first non-space after `close`
  for (let at = text.indexOf("DATA"); at >= 0; at = text.indexOf("DATA", at + 1)) {
    if (isWordChar(text[at - 1])) continue;
    let i = at + 4;
    while (isSpace(text[i])) i++;
    if (text[i] === "(" && close !== -2) {
      if (close < i) {
        close = text.indexOf(")", i);
        if (close < 0) {
          close = -2;
        } else {
          afterClose = close + 1;
          while (isSpace(text[afterClose])) afterClose++;
        }
      }
      if (close >= 0) i = afterClose;
    }
    if (text[i] === ";") return at;
  }
  return -1;
}

/** Parse a STEP file. Instances that fail to parse are skipped and counted in `errors`. */
export function parseStep(text: string): StepFile {
  const schemaMatch = /FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i.exec(text);
  const schema = schemaMatch ? (schemaMatch[1] as string).trim() : "";
  const instances = new Map<number, Instance>();
  let errors = 0;
  const dataStart = dataSectionStart(text);
  if (dataStart < 0) return { schema, instances, errors: 1 };
  const cur = new Cursor(text);
  cur.i = text.indexOf(";", dataStart) + 1;
  for (;;) {
    const c = cur.peek();
    if (c === "") break;
    if (c !== "#") {
      // ENDSEC or junk: stop at ENDSEC, otherwise skip to the next statement
      if (text.startsWith("ENDSEC", cur.i)) break;
      const next = text.indexOf(";", cur.i);
      if (next < 0) break;
      cur.i = next + 1;
      errors++;
      continue;
    }
    const stmtStart = cur.i;
    try {
      cur.i++;
      const idStart = cur.i;
      while (/[0-9]/.test(text[cur.i] ?? "")) cur.i++;
      const id = Number(text.slice(idStart, cur.i));
      cur.expect("=");
      const parts: Part[] = [];
      if (cur.peek() === "(") {
        cur.i++;
        while (cur.peek() !== ")") {
          const type = cur.keyword();
          if (!type) throw new Error("empty keyword");
          parts.push({ type, args: cur.list() });
        }
        cur.i++;
      } else {
        const type = cur.keyword();
        parts.push({ type, args: cur.list() });
      }
      cur.expect(";");
      const first = parts[0] as Part;
      instances.set(id, {
        id,
        type: parts.length === 1 ? first.type : "COMPLEX",
        args: parts.length === 1 ? first.args : [],
        parts,
      });
    } catch {
      errors++;
      const next = skipStatement(text, stmtStart);
      if (next < 0) break;
      cur.i = next;
    }
  }
  return { schema, instances, errors };
}

/** Index just past the `;` ending the statement at `from`, honouring quoted strings. */
function skipStatement(s: string, from: number): number {
  let inStr = false;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === "'") inStr = !inStr;
    else if (c === ";" && !inStr) return i + 1;
  }
  return -1;
}

export function part(inst: Instance | undefined, type: string): Part | undefined {
  return inst?.parts.find((p) => p.type === type);
}
