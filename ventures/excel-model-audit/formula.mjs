// Excel formula tokenizer, reference parser, shared-formula expansion and
// R1C1 signatures. A formula's R1C1 form ("=R[-1]C*R2C") is how Excel
// itself decides that two cells hold "the same formula copied": it is the
// basis of the inconsistent-formula rule in the audit.
//
// Grammar source: ECMA-376 Part 1, 18.17 (formulas), and Microsoft's
// "Overview of formulas in Excel" / "Using structured references".

import { colToNum, numToCol } from "./xlsx.mjs";

const MAX_ROW = 1048576, MAX_COL = 16384;
const ERRORS = ["#NULL!", "#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#N/A", "#GETTING_DATA", "#SPILL!", "#CALC!", "#FIELD!", "#BLOCKED!", "#CONNECT!", "#BUSY!", "#UNKNOWN!"];

const SHEET = String.raw`(?:'((?:[^']|'')+)'|((?:\[[^\]]+\])?[A-Za-z_À-￿][\w.À-￿]*(?::[A-Za-z_À-￿][\w.À-￿]*)?|\[\d+\]))!`;
const CELL = String.raw`(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})`;
const reSheet = new RegExp(SHEET, "y");
const reArea = new RegExp(`${CELL}(?::${CELL})?`, "y");
const reCols = /(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})/y;
const reRows = /(\$?)(\d{1,7}):(\$?)(\d{1,7})/y;
const reNum = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const reName = /[A-Za-z_\\À-￿][\w.\\?À-￿]*/y;

function matchAt(re, s, i) { re.lastIndex = i; return re.exec(s); }
const boundaryAfter = (s, j) => j >= s.length || !/[\w.(\[!À-￿]/.test(s[j]);

function areaRef(m, sheetTxt, ext) {
  const c1 = colToNum(m[2]), r1 = +m[4];
  const c2 = m[6] ? colToNum(m[6]) : c1, r2 = m[8] ? +m[8] : r1;
  if (c1 > MAX_COL || c2 > MAX_COL || r1 < 1 || r2 < 1 || r1 > MAX_ROW || r2 > MAX_ROW) return null;
  return {
    kind: "area", sheet: sheetTxt, external: ext,
    r1, c1, r2, c2,
    ar1: m[3] === "$", ac1: m[1] === "$", ar2: m[7] !== undefined ? m[7] === "$" : m[3] === "$", ac2: m[5] !== undefined ? m[5] === "$" : m[1] === "$",
    single: !m[6],
  };
}

function tryRef(s, i) {
  let j = i, sheet = null, ext = false;
  const sm = matchAt(reSheet, s, i);
  if (sm) {
    sheet = sm[1] !== undefined ? sm[1].replace(/''/g, "'") : sm[2];
    if (/^\[[^\]]+\]/.test(sheet)) ext = true;
    j = i + sm[0].length;
    if (s.startsWith("#REF!", j)) return { ref: { kind: "badref", sheet, external: ext }, end: j + 5 };
  }
  let m = matchAt(reArea, s, j);
  if (m && boundaryAfter(s, j + m[0].length)) {
    const ref = areaRef(m, sheet, ext);
    if (ref) return { ref, end: j + m[0].length };
  }
  m = matchAt(reCols, s, j);
  if (m && boundaryAfter(s, j + m[0].length)) {
    const c1 = colToNum(m[2]), c2 = colToNum(m[4]);
    if (c1 <= MAX_COL && c2 <= MAX_COL) return { ref: { kind: "cols", sheet, external: ext, r1: 1, r2: MAX_ROW, c1, c2, ac1: m[1] === "$", ac2: m[3] === "$", ar1: true, ar2: true }, end: j + m[0].length };
  }
  m = matchAt(reRows, s, j);
  if (m && boundaryAfter(s, j + m[0].length)) {
    return { ref: { kind: "rows", sheet, external: ext, c1: 1, c2: MAX_COL, r1: +m[2], r2: +m[4], ar1: m[1] === "$", ar2: m[3] === "$", ac1: true, ac2: true }, end: j + m[0].length };
  }
  if (sheet !== null) {
    // Sheet-qualified name (Sheet1!MyName) or external name.
    const nm = matchAt(reName, s, j);
    if (nm) return { ref: { kind: "name", sheet, external: ext, name: nm[0] }, end: j + nm[0].length };
  }
  return null;
}

export function tokenize(f) {
  const s = f.startsWith("=") ? f.slice(1) : f;
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") { let j = i; while (j < s.length && /\s/.test(s[j])) j++; toks.push({ type: "ws", text: s.slice(i, j) }); i = j; continue; }
    if (ch === '"') { let j = i + 1; while (j < s.length) { if (s[j] === '"') { if (s[j + 1] === '"') j += 2; else break; } else j++; } toks.push({ type: "str", text: s.slice(i, j + 1) }); i = j + 1; continue; }
    if (ch === "{") { const j = s.indexOf("}", i); const e = j < 0 ? s.length : j + 1; toks.push({ type: "array", text: s.slice(i, e) }); i = e; continue; }
    if (ch === "#") {
      const e = ERRORS.find((x) => s.toUpperCase().startsWith(x, i));
      if (e) { toks.push({ type: "err", text: e }); i += e.length; continue; }
    }
    if (ch === "(") { toks.push({ type: "open", text: ch }); i++; continue; }
    if (ch === ")") { toks.push({ type: "close", text: ch }); i++; continue; }
    if (ch === "," || ch === ";") { toks.push({ type: "sep", text: "," }); i++; continue; }
    if (/[0-9.]/.test(ch)) {
      const r = tryRef(s, i);
      if (r) { toks.push({ type: "ref", text: s.slice(i, r.end), ref: r.ref }); i = r.end; continue; }
      const m = matchAt(reNum, s, i);
      if (m) { toks.push({ type: "num", text: m[0], value: Number(m[0]) }); i += m[0].length; continue; }
    }
    if (ch === "'" || ch === "[" || ch === "$" || /[A-Za-z_\\À-￿]/.test(ch)) {
      const r = tryRef(s, i);
      if (r) { toks.push({ type: "ref", text: s.slice(i, r.end), ref: r.ref }); i = r.end; continue; }
      const nm = matchAt(reName, s, i);
      if (nm) {
        let j = i + nm[0].length;
        if (s[j] === "(") { toks.push({ type: "func", text: nm[0], name: nm[0].toUpperCase().replace(/^_XLFN\.(_XLWS\.)?|^_XLWS\./, "") }); i = j; continue; }
        if (s[j] === "[") {
          let depth = 0;
          for (; j < s.length; j++) { if (s[j] === "[") depth++; else if (s[j] === "]") { depth--; if (depth === 0) { j++; break; } } }
          toks.push({ type: "structref", text: s.slice(i, j) }); i = j; continue;
        }
        const up = nm[0].toUpperCase();
        if (up === "TRUE" || up === "FALSE") toks.push({ type: "bool", text: up });
        else toks.push({ type: "name", text: nm[0], name: nm[0] });
        i = j; continue;
      }
      if (ch === "[") { const j = s.indexOf("]", i); const e = j < 0 ? s.length : j + 1; toks.push({ type: "structref", text: s.slice(i, e) }); i = e; continue; }
    }
    const two = s.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>") { toks.push({ type: "op", text: two }); i += 2; continue; }
    toks.push({ type: "op", text: ch });
    i++;
  }
  return toks;
}

function quoteSheet(name) { return /^[A-Za-z_][\w.]*$/.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`; }

export function refText(ref) {
  const pre = ref.sheet === null ? "" : ref.external || /^\[/.test(ref.sheet) ? `${ref.sheet}!` : `${quoteSheet(ref.sheet)}!`;
  if (ref.kind === "badref") return pre + "#REF!";
  if (ref.kind === "name") return pre + ref.name;
  const d = (b) => (b ? "$" : "");
  if (ref.kind === "cols") return `${pre}${d(ref.ac1)}${numToCol(ref.c1)}:${d(ref.ac2)}${numToCol(ref.c2)}`;
  if (ref.kind === "rows") return `${pre}${d(ref.ar1)}${ref.r1}:${d(ref.ar2)}${ref.r2}`;
  const a = `${d(ref.ac1)}${numToCol(ref.c1)}${d(ref.ar1)}${ref.r1}`;
  if (ref.single) return pre + a;
  return `${pre}${a}:${d(ref.ac2)}${numToCol(ref.c2)}${d(ref.ar2)}${ref.r2}`;
}

// Moving a formula by (dr, dc) shifts each relative part, as copying does.
// A part pushed off the sheet becomes #REF!, as Excel writes it.
export function shiftRef(ref, dr, dc) {
  if (ref.kind === "badref" || ref.kind === "name") return ref;
  const n = { ...ref };
  if (ref.kind !== "cols") { if (!ref.ar1) n.r1 += dr; if (!ref.ar2) n.r2 += dr; }
  if (ref.kind !== "rows") { if (!ref.ac1) n.c1 += dc; if (!ref.ac2) n.c2 += dc; }
  if (n.r1 < 1 || n.r2 < 1 || n.c1 < 1 || n.c2 < 1 || n.r1 > MAX_ROW || n.r2 > MAX_ROW || n.c1 > MAX_COL || n.c2 > MAX_COL) return { kind: "badref", sheet: ref.sheet, external: ref.external };
  return n;
}

export function shiftFormula(f, dr, dc) {
  return tokenize(f).map((t) => (t.type === "ref" ? refText(shiftRef(t.ref, dr, dc)) : t.text)).join("");
}

function r1c1Part(axis, abs, v, host) { return abs ? `${axis}${v}` : v === host ? axis : `${axis}[${v - host}]`; }

export function r1c1Ref(ref, hr, hc) {
  const pre = ref.sheet === null ? "" : `${String(ref.sheet).toLowerCase()}!`;
  if (ref.kind === "badref") return pre + "#REF!";
  if (ref.kind === "name") return pre + ref.name.toUpperCase();
  if (ref.kind === "cols") return `${pre}${r1c1Part("C", ref.ac1, ref.c1, hc)}:${r1c1Part("C", ref.ac2, ref.c2, hc)}`;
  if (ref.kind === "rows") return `${pre}${r1c1Part("R", ref.ar1, ref.r1, hr)}:${r1c1Part("R", ref.ar2, ref.r2, hr)}`;
  const a = r1c1Part("R", ref.ar1, ref.r1, hr) + r1c1Part("C", ref.ac1, ref.c1, hc);
  if (ref.single) return pre + a;
  return `${pre}${a}:${r1c1Part("R", ref.ar2, ref.r2, hr)}${r1c1Part("C", ref.ac2, ref.c2, hc)}`;
}

// The R1C1 signature: equal for two cells exactly when one is a copy of
// the other. The "shape" drops references too, so it is equal for
// =B5*B6 and =B5*C6 (same operation, a different cell pointed at).
export function signature(toks, hr, hc) {
  let sig = "", shape = "";
  for (const t of toks) {
    if (t.type === "ws") continue;
    if (t.type === "ref") { sig += r1c1Ref(t.ref, hr, hc) + "\u0001"; shape += "@"; continue; }
    const x = t.type === "str" ? t.text : t.text.toUpperCase();
    sig += x + "\u0001"; shape += x + "\u0001";
  }
  return { sig, shape };
}

// Walks the tokens with a function stack, so each literal number and each
// reference knows which function argument it sits in.
export function annotate(toks) {
  const stack = [];
  const out = [];
  let prev = null;
  for (const t of toks) {
    if (t.type === "ws") continue;
    const top = stack[stack.length - 1];
    if (t.type === "func") { stack.push({ name: t.name, arg: 0, pendingOpen: true }); prev = t; continue; }
    if (t.type === "open") {
      if (top && top.pendingOpen) top.pendingOpen = false; else stack.push({ name: null, arg: 0 });
      prev = t; continue;
    }
    if (t.type === "close") { stack.pop(); prev = t; continue; }
    if (t.type === "sep") { if (top) top.arg++; prev = t; continue; }
    const ctx = stack.length ? stack.filter((x) => x.name).map((x) => x.name) : [];
    const fn = top;
    const negative = t.type === "num" && prev && prev.type === "op" && prev.text === "-";
    out.push({ tok: t, func: fn ? fn.name : null, arg: fn ? fn.arg : 0, funcs: ctx, negative });
    prev = t;
  }
  return out;
}

export { MAX_ROW, MAX_COL };
