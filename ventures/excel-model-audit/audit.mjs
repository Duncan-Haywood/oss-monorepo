// The audit: reads a workbook (xlsx.mjs), expands shared formulas, works
// out every formula's precedents, and runs the checks. Each check names
// the rule it follows; README "Spec sources" lists them.

import { readWorkbook, addr, numToCol } from "./xlsx.mjs";
import { tokenize, annotate, signature, shiftFormula, MAX_ROW } from "./formula.mjs";

const KEY = (r, c) => r * 16384 + c;
const AGG = new Set(["SUM", "AVERAGE", "COUNT", "COUNTA", "MIN", "MAX", "PRODUCT", "SUBTOTAL", "MEDIAN"]);
const VOLATILE = new Set(["OFFSET", "INDIRECT", "NOW", "TODAY", "RAND", "RANDBETWEEN", "RANDARRAY", "CELL", "INFO"]);
// Arguments where a typed number is a setting of the function, not an
// assumption of the model: ROUND(x, 2), VLOOKUP(k, t, 3, 0), LEFT(s, 4).
const SETTING_ARGS = new Map(Object.entries({
  ROUND: [1], ROUNDUP: [1], ROUNDDOWN: [1], TRUNC: [1], FIXED: [1, 2], MROUND: [], CEILING: [], FLOOR: [],
  INDEX: [1, 2, 3], MATCH: [2], VLOOKUP: [2, 3], HLOOKUP: [2, 3], XLOOKUP: [4, 5], XMATCH: [2, 3], LOOKUP: [],
  OFFSET: [1, 2, 3, 4], CHOOSE: [0], LEFT: [1], RIGHT: [1], MID: [1, 2], REPT: [1], FIND: [2], SEARCH: [2], SUBSTITUTE: [3],
  DATE: [0, 1, 2], TIME: [0, 1, 2], WEEKDAY: [1], WEEKNUM: [1], YEARFRAC: [2], NETWORKDAYS: [], EOMONTH: [1], EDATE: [1], DATEDIF: [],
  SUBTOTAL: [0], AGGREGATE: [0, 1], LARGE: [1], SMALL: [1], RANK: [2], "RANK.EQ": [2], "RANK.AVG": [2], PERCENTILE: [1], QUARTILE: [1],
  ADDRESS: [0, 1, 2, 3], INDIRECT: [1], COLUMN: [], ROW: [], TEXT: [1], SEQUENCE: [0, 1, 2, 3], RANDBETWEEN: [0, 1],
  CELL: [], SORT: [1, 2, 3], TAKE: [1, 2], DROP: [1, 2], CHOOSECOLS: [1, 2, 3, 4, 5], CHOOSEROWS: [1, 2, 3, 4, 5], MOD: [1],
}));
const SEV = new Map([["high", 0], ["medium", 1], ["info", 2]]);
const sevRank = (k) => SEV.get(k) ?? 3;

function cellAt(sheet, r, c) { return sheet.cells.get(KEY(r, c)); }
const isFormula = (cell) => !!(cell && cell.f);
const isNumberConst = (cell) => !!(cell && !cell.f && !cell.arrayMember && cell.kind === "number");

function sheetIndex(wb) {
  const m = new Map();
  wb.sheets.forEach((s, i) => m.set(s.name.toLowerCase(), i));
  return m;
}

function prepare(wb) {
  const byName = sheetIndex(wb);
  const names = new Map();
  for (const n of wb.names) {
    const key = n.name.toLowerCase();
    if (!names.has(key)) names.set(key, []);
    names.get(key).push(n);
  }
  wb.sheets.forEach((sheet, si) => {
    // Shared formulas: only the master cell stores the text; each other
    // cell in the group holds a copy moved by its offset (ECMA-376 18.3.1.40).
    for (const cell of sheet.cells.values()) {
      if (!cell.f && cell.sharedSi !== undefined) {
        const m = sheet.shared.get(cell.sharedSi);
        if (m) cell.f = shiftFormula(m.text, cell.r - m.r, cell.c - m.c);
      }
    }
    for (const cell of sheet.cells.values()) {
      if (!cell.array) continue;
      const [a, b] = cell.array.split(":");
      const p = /([A-Z]+)(\d+)/.exec(a), q = /([A-Z]+)(\d+)/.exec(b || a);
      if (!p || !q) continue;
      const toNum = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
      for (let r = +p[2]; r <= +q[2]; r++) for (let c = toNum(p[1]); c <= toNum(q[1]); c++) {
        const x = cellAt(sheet, r, c);
        if (x && x !== cell && !x.f) x.arrayMember = true;
      }
    }
    for (const cell of sheet.cells.values()) {
      if (!cell.f) continue;
      try { cell.toks = tokenize(cell.f); } catch { cell.toks = []; }
      const { sig, shape } = signature(cell.toks, cell.r, cell.c);
      cell.sig = sig; cell.shape = shape;
      cell.ann = annotate(cell.toks);
      cell.prec = [];
      cell.external = false;
      cell.badRef = cell.toks.some((t) => t.type === "err" && t.text === "#REF!") || cell.toks.some((t) => t.type === "ref" && t.ref.kind === "badref");
      for (const a of cell.ann) {
        if (a.tok.type === "ref") resolveRef(a.tok.ref, si, a, cell, 0);
        else if (a.tok.type === "name") resolveName(a.tok.name, si, a, cell, 0);
      }
    }
  });

  function resolveName(name, si, a, cell, depth) {
    const list = names.get(name.toLowerCase());
    if (!list || depth > 3) return;
    const def = list.find((n) => n.localSheetId === si) || list.find((n) => n.localSheetId === null) || list[0];
    def.used = true;
    for (const t of tokenize(def.text)) {
      if (t.type === "ref") resolveRef(t.ref, def.localSheetId ?? si, a, cell, depth + 1, true);
      else if (t.type === "name") resolveName(t.name, si, a, cell, depth + 1);
    }
  }

  function resolveRef(ref, si, a, cell, depth, viaName = false) {
    if (ref.external) { cell.external = true; return; }
    if (ref.kind === "badref") return;
    if (ref.kind === "name") { resolveName(ref.name, ref.sheet ? byName.get(ref.sheet.toLowerCase()) ?? si : si, a, cell, depth); return; }
    let sheets = [si];
    if (ref.sheet !== null) {
      const parts = ref.sheet.split(":");
      const i0 = byName.get(parts[0].toLowerCase());
      if (i0 === undefined) { cell.missingSheet = ref.sheet; return; }
      if (parts.length === 2) {
        const i1 = byName.get(parts[1].toLowerCase());
        if (i1 === undefined) { cell.missingSheet = ref.sheet; return; }
        sheets = []; for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) sheets.push(i);
      } else sheets = [i0];
    }
    for (const s of sheets) {
      cell.prec.push({ si: s, r1: Math.min(ref.r1, ref.r2), r2: Math.max(ref.r1, ref.r2), c1: Math.min(ref.c1, ref.c2), c2: Math.max(ref.c1, ref.c2), single: ref.kind === "area" && ref.single, ar1: ref.ar1, ar2: ref.ar2, ac1: ref.ac1, ac2: ref.ac2, func: a.func, funcs: a.funcs, viaName, kind: ref.kind });
    }
  }
  return { byName, names };
}

// Per sheet, formula cells by column then row, so "which formulas lie in
// this range" is a binary search instead of a scan of every cell.
function buildIndex(sheet, pred) {
  const cols = new Map();
  for (const cell of sheet.cells.values()) {
    if (!pred(cell)) continue;
    if (!cols.has(cell.c)) cols.set(cell.c, []);
    cols.get(cell.c).push(cell);
  }
  for (const list of cols.values()) list.sort((a, b) => a.r - b.r);
  return { cols, colKeys: [...cols.keys()].sort((a, b) => a - b) };
}

function* inRange(idx, p) {
  for (const c of idx.colKeys) {
    if (c < p.c1) continue;
    if (c > p.c2) break;
    const list = idx.cols.get(c);
    let lo = 0, hi = list.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].r < p.r1) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < list.length && list[i].r <= p.r2; i++) yield list[i];
  }
}

// Tarjan's strongly connected components, iterative (a long chain of
// formulas must not overflow the call stack).
function cycles(nodes, edgesOf) {
  const index = new Map(), low = new Map(), onStack = new Set(), stack = [], out = [];
  let counter = 0;
  for (const start of nodes) {
    if (index.has(start)) continue;
    const work = [[start, edgesOf(start), 0]];
    index.set(start, counter); low.set(start, counter); counter++; stack.push(start); onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1];
      const [v, edges] = frame;
      if (frame[2] < edges.length) {
        const w = edges[frame[2]++];
        if (!index.has(w)) {
          index.set(w, counter); low.set(w, counter); counter++; stack.push(w); onStack.add(w);
          work.push([w, edgesOf(w), 0]);
        } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
      } else {
        work.pop();
        if (work.length) { const u = work[work.length - 1][0]; low.set(u, Math.min(low.get(u), low.get(v))); }
        if (low.get(v) === index.get(v)) {
          const comp = [];
          let w;
          do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
          if (comp.length > 1 || edgesOf(v).includes(v)) out.push(comp);
        }
      }
    }
  }
  return out;
}

const fmtNum = (v) => (Number.isInteger(v) ? String(v) : String(+v.toPrecision(10)));

export function auditWorkbook(wb) {
  const { names } = prepare(wb);
  const findings = [];
  const flagged = new Map();
  // At most CAP findings per sheet and rule are listed one by one; the
  // rest are counted in one closing line, so a sheet of 5,000 broken
  // cells is readable.
  const CAP = 50, perKey = new Map();
  const add = (f) => {
    const key = `${f.sheet}\u0000${f.rule}`;
    const n = (perKey.get(key)?.n || 0) + 1;
    perKey.set(key, { n, first: perKey.get(key)?.first || f });
    if (n > CAP) return;
    findings.push(f);
    if (f.sheet && f.cell) { const k = `${f.sheet}!${f.cell}`; if (!flagged.has(k) || sevRank(f.severity) < sevRank(flagged.get(k))) flagged.set(k, f.severity); }
  };
  const fIdx = wb.sheets.map((s) => buildIndex(s, isFormula));
  const eIdx = wb.sheets.map((s) => buildIndex(s, (c) => c.kind === "error"));

  wb.sheets.forEach((sheet, si) => {
    const S = sheet.name;
    const cells = [...sheet.cells.values()].sort((a, b) => a.r - b.r || a.c - b.c);
    const seenInconsistent = new Set();

    for (const cell of cells) {
      const A = addr(cell.r, cell.c);
      if (cell.f) {
        // #REF! in the formula text: a reference whose cells were deleted.
        if (cell.badRef) add({ rule: "ref-error", severity: "high", sheet: S, cell: A, formula: cell.f, title: "Formula contains #REF!", detail: "A cell or range this formula pointed at was deleted, so part of the formula no longer points anywhere. It returns #REF! or, inside IFERROR, a silent fallback." });
        if (cell.missingSheet) add({ rule: "missing-sheet", severity: "high", sheet: S, cell: A, formula: cell.f, title: `Formula names a sheet that is not in the workbook (${cell.missingSheet})`, detail: "The reference cannot be resolved inside this file." });

        // Inconsistent formula: both neighbours on a line share one R1C1
        // formula and this cell does not (Excel's "Formulas inconsistent
        // with other formulas in the region"). Ends of a run are flagged
        // only when the cell does the same operation with a different
        // reference, so a totals column at the end of a row is not.
        for (const [dr, dc, label] of [[0, 1, "row"], [1, 0, "column"]]) {
          if (seenInconsistent.has(cell)) break;
          const prev = cellAt(sheet, cell.r - dr, cell.c - dc), next = cellAt(sheet, cell.r + dr, cell.c + dc);
          let model = null, why = "";
          if (isFormula(prev) && isFormula(next) && prev.sig === next.sig && prev.sig !== cell.sig) { model = prev; why = `the cells either side of it in this ${label} share one formula`; }
          else {
            const p2 = cellAt(sheet, cell.r - 2 * dr, cell.c - 2 * dc), n2 = cellAt(sheet, cell.r + 2 * dr, cell.c + 2 * dc);
            if (isFormula(prev) && isFormula(p2) && prev.sig === p2.sig && prev.sig !== cell.sig && prev.shape === cell.shape && !(isFormula(next) && next.sig === cell.sig)) { model = prev; why = `it ends a run of copied formulas in this ${label}, does the same operation, but points at different cells`; }
            else if (isFormula(next) && isFormula(n2) && next.sig === n2.sig && next.sig !== cell.sig && next.shape === cell.shape && !(isFormula(prev) && prev.sig === cell.sig)) { model = next; why = `it starts a run of copied formulas in this ${label}, does the same operation, but points at different cells`; }
          }
          if (model) {
            seenInconsistent.add(cell);
            const expected = shiftFormula(model.f, cell.r - model.r, cell.c - model.c);
            const sameShape = model.shape === cell.shape;
            add({ rule: "inconsistent-formula", severity: sameShape ? "high" : "medium", sheet: S, cell: A, formula: cell.f, expected, title: sameShape ? "Copied formula points at a different cell from its neighbours" : "Formula breaks the pattern of its neighbours", detail: `${why[0].toUpperCase()}${why.slice(1)}. Copied along, the neighbours' formula here would be =${expected}.${sameShape ? " Same operation, different reference: the classic mistyped or dragged-wrong reference." : " If this cell is meant to differ (a total, an opening balance), ignore it."}` });
          }
        }

        // Typed numbers inside a formula (FAST Standard / ICAEW code: an
        // assumption belongs in its own labelled input cell).
        const hasRef = cell.toks.some((t) => t.type === "ref" || t.type === "name" || t.type === "structref");
        const nums = cell.ann.filter((a) => a.tok.type === "num" && a.tok.value !== 0 && a.tok.value !== 1 && !(a.func && (SETTING_ARGS.get(a.func) || []).includes(a.arg)) && !(a.func && SETTING_ARGS.get(a.func)?.length === 0));
        cell.hardcodes = nums.map((a) => (a.negative ? -a.tok.value : a.tok.value));
        cell.constOnly = !hasRef && cell.toks.some((t) => t.type === "num") && !cell.toks.some((t) => t.type === "func" && VOLATILE.has(t.name));
      } else if (isNumberConst(cell)) {
        // A typed number in the middle of a run of copied formulas: the
        // "plug" or overwritten formula auditors look for first.
        for (const [dr, dc, label] of [[0, 1, "row"], [1, 0, "column"]]) {
          const prev = cellAt(sheet, cell.r - dr, cell.c - dc), next = cellAt(sheet, cell.r + dr, cell.c + dc);
          if (isFormula(prev) && isFormula(next) && prev.sig === next.sig) {
            const expected = shiftFormula(prev.f, cell.r - prev.r, cell.c - prev.c);
            add({ rule: "overwritten-formula", severity: "high", sheet: S, cell: A, value: fmtNum(cell.v), expected, title: "Typed number where the neighbours have a formula", detail: `This cell holds the number ${fmtNum(cell.v)}, but the cells either side of it in this ${label} share a formula. Copied along, it would be =${expected}. A formula overwritten with its value stops updating when the inputs change.` });
            break;
          }
          // The two before it are copies of one formula and the one after
          // does the same operation: a typed value inside a formula row
          // whose next cell was also edited.
          const p2 = cellAt(sheet, cell.r - 2 * dr, cell.c - 2 * dc);
          if (isFormula(prev) && isFormula(p2) && prev.sig === p2.sig && isFormula(next) && next.shape === prev.shape) {
            const expected = shiftFormula(prev.f, cell.r - prev.r, cell.c - prev.c);
            add({ rule: "overwritten-formula", severity: "medium", sheet: S, cell: A, value: fmtNum(cell.v), expected, title: "Typed number inside a row of formulas", detail: `This cell holds the number ${fmtNum(cell.v)}; the two cells before it in this ${label} share a formula and the cell after it does the same operation. Copied along, it would be =${expected}.` });
            break;
          }
        }
      }
    }

    // Formulas that leave out adjacent numbers (Excel's "Formulas that
    // omit cells in a region"): SUM(B2:B9) with a number in B10 or B1.
    for (const cell of cells) {
      if (!cell.f) continue;
      for (const p of cell.prec) {
        if (p.si !== si || p.single || p.viaName || !AGG.has(p.func) || p.kind !== "area") continue;
        const vertical = p.c1 === p.c2, horizontal = p.r1 === p.r2;
        if (!vertical && !horizontal) continue;
        // A moving window (B5 = SUM(A3:A5) copied down) leaves numbers
        // out on purpose: relative ends along the range, copied along it.
        const copiedAlong = (dr, dc) => [[dr, dc], [-dr, -dc]].some(([a, b]) => { const n = cellAt(sheet, cell.r + a, cell.c + b); return n && n.sig === cell.sig; });
        if (vertical && !p.ar1 && !p.ar2 && copiedAlong(1, 0)) continue;
        if (horizontal && !p.ac1 && !p.ac2 && copiedAlong(0, 1)) continue;
        const ends = vertical ? [[p.r1 - 1, p.c1, "above"], [p.r2 + 1, p.c1, "below"]] : [[p.r1, p.c1 - 1, "left of"], [p.r1, p.c2 + 1, "right of"]];
        for (const [r, c, where] of ends) {
          if (r < 1 || c < 1 || (r === cell.r && c === cell.c)) continue;
          const x = cellAt(sheet, r, c);
          // A formula counts unless it shows text; files saved without
          // cached values (some generators) still mark it as a formula.
          if (!x || (x.f ? x.kind === "text" || x.kind === "bool" || x.kind === "error" : x.kind !== "number")) continue;
          if (x.f && x.toks && x.toks.some((t) => t.type === "func" && AGG.has(t.name))) continue;
          if (!x.f && Number.isInteger(x.v) && x.v >= 1900 && x.v <= 2100 && (where === "above" || where === "left of")) continue;
          const rangeTxt = `${addr(p.r1, p.c1)}:${addr(p.r2, p.c2)}`;
          add({ rule: "omits-adjacent", severity: "medium", sheet: S, cell: addr(cell.r, cell.c), formula: cell.f, title: `${p.func} range stops next to a number (${addr(r, c)})`, detail: `The formula adds up ${rangeTxt}, but ${addr(r, c)}, directly ${where} the range, holds ${x.f ? (x.kind === "number" ? `a formula giving ${fmtNum(x.v)}` : "a formula") : fmtNum(x.v)}. If a row or column was inserted at the edge of the range it is left out.` });
          break;
        }
      }
    }

    // Formulas that point at empty cells (Excel's "Formulas referring to
    // empty cells"): only single-cell references, so ranges with gaps do not count.
    for (const cell of cells) {
      if (!cell.f) continue;
      const empties = [];
      for (const p of cell.prec) {
        if (!p.single || p.funcs.includes("ISBLANK")) continue;
        const target = wb.sheets[p.si];
        const x = cellAt(target, p.r1, p.c1);
        if (!x || (x.kind === "empty" && !x.f)) empties.push(`${p.si === si ? "" : target.name + "!"}${addr(p.r1, p.c1)}`);
      }
      if (empties.length) add({ rule: "empty-reference", severity: "medium", sheet: S, cell: addr(cell.r, cell.c), formula: cell.f, title: `Points at ${empties.length === 1 ? "an empty cell" : `${empties.length} empty cells`} (${[...new Set(empties)].slice(0, 4).join(", ")})`, detail: "An empty cell counts as 0 in arithmetic, so a missing input gives a plausible wrong answer rather than an error." });
    }

    // Error values: a root is an error cell none of whose precedents is an error.
    for (const cell of cells) {
      if (cell.kind !== "error") continue;
      let inherited = false;
      if (cell.f) for (const p of cell.prec) { for (const x of inRange(eIdx[p.si], p)) { if (x !== cell) { inherited = true; break; } } if (inherited) break; }
      cell.errorRoot = !inherited;
    }
    const errs = cells.filter((c) => c.kind === "error");
    const typedErrs = errs.filter((c) => !c.f);
    if (typedErrs.length) add({ rule: "error-value", severity: "medium", sheet: S, cell: addr(typedErrs[0].r, typedErrs[0].c), title: `${typedErrs.length} error value${typedErrs.length === 1 ? "" : "s"} typed in or pasted as values`, detail: `For example ${typedErrs.slice(0, 6).map((c) => `${addr(c.r, c.c)} (${c.v})`).join(", ")}. A pasted error has no formula to fix; whatever reads it inherits the error.` });
    for (const cell of errs.filter((c) => c.errorRoot && c.f)) {
      const downstream = errs.filter((c) => !c.errorRoot).length;
      add({ rule: "error-value", severity: "high", sheet: S, cell: addr(cell.r, cell.c), formula: cell.f || "", title: `Shows ${cell.v}`, detail: `This is where the ${cell.v} starts: none of the cells it points at is an error.${downstream ? ` ${downstream} other error cell${downstream === 1 ? "" : "s"} on this sheet inherit${downstream === 1 ? "s" : ""} an error from somewhere.` : ""}` });
    }

    // Numbers stored as text (Excel's "Numbers formatted as text or preceded by an apostrophe").
    const textNums = cells.filter((c) => !c.f && c.kind === "text" && typeof c.v === "string" && /^\s*[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?([eE][-+]?\d+)?%?\s*$/.test(c.v) && /\d/.test(c.v));
    if (textNums.length) {
      const referenced = [], loose = [];
      for (const x of textNums.slice(0, 5000)) {
        let used = false;
        outer: for (const s2 of wb.sheets) for (const f of s2.cells.values()) {
          if (!f.f) continue;
          for (const p of f.prec) if (p.si === si && x.r >= p.r1 && x.r <= p.r2 && x.c >= p.c1 && x.c <= p.c2) { used = true; break outer; }
        }
        (used ? referenced : loose).push(x);
      }
      for (const x of referenced.slice(0, 200)) add({ rule: "number-as-text", severity: "medium", sheet: S, cell: addr(x.r, x.c), value: x.v, title: `Number stored as text ("${x.v}") is used by a formula`, detail: "SUM, AVERAGE and COUNT skip text, so this value is left out of totals; arithmetic like =A1+1 converts it, so the same input counts in one place and not another." });
      if (loose.length) add({ rule: "number-as-text", severity: "info", sheet: S, cell: addr(loose[0].r, loose[0].c), title: `${loose.length} number${loose.length === 1 ? "" : "s"} stored as text, not used by any formula`, detail: `For example ${loose.slice(0, 5).map((x) => addr(x.r, x.c)).join(", ")}. Harmless if they are codes (ZIP codes, account numbers); a problem if someone later adds them up.` });
    }

    // A formula typed into a cell formatted as Text, or pasted with a
    // leading apostrophe, shows its own text and never calculates.
    const asText = cells.filter((c) => !c.f && c.kind === "text" && typeof c.v === "string" && /^=\s*[A-Za-z$('"]/.test(c.v) && /[A-Za-z]+\d+|[A-Za-z]+\(/.test(c.v));
    for (const x of asText) add({ rule: "formula-as-text", severity: "medium", sheet: S, cell: addr(x.r, x.c), value: x.v, title: `Formula stored as text (${x.v.length > 40 ? x.v.slice(0, 40) + "…" : x.v})`, detail: "The cell shows the formula's text instead of calculating it, usually because the cell was formatted as Text before the formula was typed. Anything that reads it gets text, or 0 in a SUM." });

    // Typed numbers in formulas, grouped by value so 40 copies of *1.2 are one line.
    const byValue = new Map();
    for (const cell of cells) for (const v of cell.hardcodes || []) {
      if (!byValue.has(v)) byValue.set(v, []);
      if (!byValue.get(v).includes(cell)) byValue.get(v).push(cell);
    }
    for (const [v, list] of [...byValue].sort((a, b) => b[1].length - a[1].length)) {
      add({ rule: "hardcoded-number", severity: "info", sheet: S, cell: addr(list[0].r, list[0].c), formula: list[0].f, title: `${fmtNum(v)} typed into ${list.length} formula${list.length === 1 ? "" : "s"}`, detail: `In ${list.slice(0, 6).map((c) => addr(c.r, c.c)).join(", ")}${list.length > 6 ? ` and ${list.length - 6} more` : ""}. An assumption typed into formulas has to be found and changed in every copy; in its own labelled input cell it is changed once.` });
    }
    const constOnly = cells.filter((c) => c.constOnly);
    if (constOnly.length) add({ rule: "constant-formula", severity: "medium", sheet: S, cell: addr(constOnly[0].r, constOnly[0].c), formula: constOnly[0].f, title: `${constOnly.length} formula${constOnly.length === 1 ? "" : "s"} with numbers only and no references`, detail: `For example ${constOnly.slice(0, 5).map((c) => `${addr(c.r, c.c)} (=${c.f.length > 40 ? c.f.slice(0, 40) + "…" : c.f})`).join(", ")}. A sum typed as =1200+350 hides its inputs and never updates.` });

    // External links and volatile functions, grouped.
    const ext = cells.filter((c) => c.external);
    if (ext.length) add({ rule: "external-link", severity: "medium", sheet: S, cell: addr(ext[0].r, ext[0].c), formula: ext[0].f, title: `${ext.length} formula${ext.length === 1 ? "" : "s"} read another workbook`, detail: `For example ${ext.slice(0, 5).map((c) => addr(c.r, c.c)).join(", ")}. The values are whatever was cached when that file was last opened alongside; this check cannot see inside it.` });
    const vol = new Map();
    for (const cell of cells) for (const t of cell.toks || []) if (t.type === "func" && VOLATILE.has(t.name)) { if (!vol.has(t.name)) vol.set(t.name, new Set()); vol.get(t.name).add(cell); }
    for (const [fn, set] of vol) {
      const list = [...set];
      add({ rule: "volatile-function", severity: "info", sheet: S, cell: addr(list[0].r, list[0].c), formula: list[0].f, title: `${fn} in ${list.length} formula${list.length === 1 ? "" : "s"}`, detail: `${fn === "OFFSET" || fn === "INDIRECT" ? `${fn} builds its reference while calculating, so neither Excel's trace arrows nor this audit can see what it points at. ` : ""}It recalculates on every change in the workbook. For example ${list.slice(0, 5).map((c) => addr(c.r, c.c)).join(", ")}.` });
    }

    // Long or deeply nested formulas (FAST: "short formulas").
    const long = cells.filter((c) => c.f && (c.f.length > 250 || depth(c.toks) > 6));
    if (long.length) add({ rule: "long-formula", severity: "info", sheet: S, cell: addr(long[0].r, long[0].c), formula: long[0].f, title: `${long.length} formula${long.length === 1 ? "" : "s"} over 250 characters or nested more than 6 deep`, detail: `Longest: ${long.sort((a, b) => b.f.length - a.f.length).slice(0, 5).map((c) => `${addr(c.r, c.c)} (${c.f.length} chars)`).join(", ")}. Hard to read is hard to check; split into helper cells.` });

    // Hidden sheets, rows and columns holding inputs or formulas.
    if (sheet.state !== "visible" && sheet.cells.size) add({ rule: "hidden-sheet", severity: sheet.state === "veryHidden" ? "medium" : "info", sheet: S, cell: "", title: `Sheet is ${sheet.state === "veryHidden" ? "very hidden (only VBA can show it)" : "hidden"}`, detail: `It holds ${[...sheet.cells.values()].filter((c) => c.f).length} formulas and ${[...sheet.cells.values()].filter((c) => isNumberConst(c)).length} typed numbers that a reviewer clicking through the tabs will not see.` });
    const hiddenCol = (c) => sheet.hiddenCols.some(([a, b]) => c >= a && c <= b);
    const hiddenInputs = cells.filter((c) => (isNumberConst(c) || c.f) && (sheet.hiddenRows.has(c.r) || hiddenCol(c.c)));
    if (hiddenInputs.length && sheet.state === "visible") add({ rule: "hidden-cells", severity: "info", sheet: S, cell: addr(hiddenInputs[0].r, hiddenInputs[0].c), title: `${hiddenInputs.length} number${hiddenInputs.length === 1 ? "" : "s"} or formula${hiddenInputs.length === 1 ? "" : "s"} in hidden rows or columns`, detail: `For example ${hiddenInputs.slice(0, 6).map((c) => addr(c.r, c.c)).join(", ")}.` });
  });

  // Circular references across the whole workbook.
  const nodes = [];
  wb.sheets.forEach((s, si) => { for (const c of s.cells.values()) if (c.f) { c.si = si; nodes.push(c); } });
  const edgeCache = new Map();
  const edgesOf = (cell) => {
    if (edgeCache.has(cell)) return edgeCache.get(cell);
    const out = [];
    for (const p of cell.prec) {
      if (p.r2 - p.r1 > 200000 && p.kind !== "cols") continue;
      for (const x of inRange(fIdx[p.si], p)) out.push(x);
    }
    edgeCache.set(cell, out);
    return out;
  };
  for (const comp of cycles(nodes, edgesOf)) {
    const names = comp.map((c) => `${wb.sheets[c.si].name}!${addr(c.r, c.c)}`);
    const first = comp.reduce((a, b) => (a.si < b.si || (a.si === b.si && (a.r < b.r || (a.r === b.r && a.c < b.c))) ? a : b));
    add({ rule: "circular", severity: "high", sheet: wb.sheets[first.si].name, cell: addr(first.r, first.c), formula: first.f, title: comp.length === 1 ? "Formula refers to itself" : `Circular reference through ${comp.length} cells`, detail: `${names.slice(0, 10).join(" → ")}${names.length > 10 ? ` and ${names.length - 10} more` : ""}. ${wb.iterate ? "Iterative calculation is on, so Excel will not warn about it." : "Excel shows a warning and stops calculating these cells correctly."} A deliberate loop (interest on an average cash balance) should be broken with a switch or a copy-paste macro, not left live.` });
  }

  // Workbook-level checks.
  for (const n of wb.names) {
    if (/#REF!/.test(n.text)) add({ rule: "broken-name", severity: "high", sheet: "", cell: "", title: `Named range ${n.name} points at #REF!`, detail: `Its definition is ${n.text}. Every formula using ${n.name} gets #REF!.` });
  }
  const unusedNames = wb.names.filter((n) => !n.used && !/^_xlnm\./i.test(n.name) && !n.hidden && !/#REF!/.test(n.text));
  if (unusedNames.length) add({ rule: "unused-name", severity: "info", sheet: "", cell: "", title: `${unusedNames.length} named range${unusedNames.length === 1 ? "" : "s"} no formula uses`, detail: `${unusedNames.slice(0, 8).map((n) => n.name).join(", ")}${unusedNames.length > 8 ? " …" : ""}. Leftovers make a model harder to read (they may still be used by VBA, charts or data validation, which this audit does not read).` });
  if (wb.iterate) add({ rule: "iterative-calc", severity: "medium", sheet: "", cell: "", title: "Iterative calculation is switched on", detail: "Excel will not warn about circular references in this workbook, accidental ones included." });
  if (wb.calcMode === "manual") add({ rule: "manual-calc", severity: "medium", sheet: "", cell: "", title: "Calculation is set to manual", detail: "Values saved in the file may be stale: they are as of the last time someone pressed F9. The values this audit reads (error cells, numbers) are those saved values." });
  if (wb.externalLinks.length) add({ rule: "external-file", severity: "info", sheet: "", cell: "", title: `Linked to ${wb.externalLinks.length} other file${wb.externalLinks.length === 1 ? "" : "s"}`, detail: wb.externalLinks.slice(0, 6).join("; ") });
  if (wb.hasMacros) add({ rule: "macros", severity: "info", sheet: "", cell: "", title: "Workbook contains VBA macros", detail: "Macros can change values and formulas when run. This audit does not read or run them." });

  for (const { n, first } of perKey.values()) if (n > CAP) findings.push({ rule: first.rule, severity: first.severity, sheet: first.sheet, cell: "", title: `…and ${n - CAP} more like "${first.title}"`, detail: `Only the first ${CAP} of ${n} are listed; download the CLI to list all (it uses the same cap: run it per sheet after fixing the first ones).`, more: n - CAP });
  findings.sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
  const sheets = wb.sheets.map((s) => {
    const all = [...s.cells.values()];
    const f = all.filter((c) => c.f);
    return { name: s.name, state: s.state, kind: s.kind, cells: all.length, formulas: f.length, distinct: new Set(f.map((c) => c.sig)).size, numbers: all.filter(isNumberConst).length, text: all.filter((c) => !c.f && c.kind === "text").length, errors: all.filter((c) => c.kind === "error").length };
  });
  const sum = (k) => sheets.reduce((n, s) => n + s[k], 0);
  return {
    summary: {
      sheets: sheets.length, cells: sum("cells"), formulas: sum("formulas"), distinct: sum("distinct"),
      high: findings.filter((f) => f.severity === "high").length, medium: findings.filter((f) => f.severity === "medium").length, info: findings.filter((f) => f.severity === "info").length,
    },
    sheets, findings, flagged,
    map: (name, opts) => sheetMap(wb.sheets.find((s) => s.name === name), flagged, opts),
  };
}

function depth(toks) { let d = 0, m = 0; for (const t of toks || []) { if (t.type === "open" || t.type === "func") { if (t.type === "func") { d++; m = Math.max(m, d); } } else if (t.type === "close") d = Math.max(0, d - 1); } return m; }

// A character map of a sheet's used range, in the manner of auditing
// tools' "formula maps": F a formula that starts a pattern, f a copy of
// the formula to its left or above, n a typed number, t text, e an error,
// ! a flagged cell.
export function sheetMap(sheet, flagged = new Map(), { maxRows = 400, maxCols = 100 } = {}) {
  if (!sheet || !sheet.cells.size) return { rows: [], r0: 1, c0: 1, truncated: false };
  let r0 = Infinity, c0 = Infinity, r1 = 0, c1 = 0;
  for (const c of sheet.cells.values()) { if (c.kind === "empty" && !c.f) continue; r0 = Math.min(r0, c.r); c0 = Math.min(c0, c.c); r1 = Math.max(r1, c.r); c1 = Math.max(c1, c.c); }
  if (r1 === 0) return { rows: [], r0: 1, c0: 1, truncated: false };
  const truncated = r1 - r0 + 1 > maxRows || c1 - c0 + 1 > maxCols;
  r1 = Math.min(r1, r0 + maxRows - 1); c1 = Math.min(c1, c0 + maxCols - 1);
  const rows = [];
  for (let r = r0; r <= r1; r++) {
    let line = "";
    for (let c = c0; c <= c1; c++) {
      const x = cellAt(sheet, r, c);
      if (!x) { line += "."; continue; }
      const sev = flagged.get(`${sheet.name}!${addr(r, c)}`);
      if (sev === "high" || sev === "medium") { line += "!"; continue; }
      if (x.kind === "error") line += "e";
      else if (x.f) { const l = cellAt(sheet, r, c - 1), u = cellAt(sheet, r - 1, c); line += (l && l.sig === x.sig) || (u && u.sig === x.sig) ? "f" : "F"; }
      else if (x.arrayMember) line += "f";
      else if (x.kind === "number") line += "n";
      else if (x.kind === "empty") line += ".";
      else line += "t";
    }
    rows.push(line);
  }
  return { rows, r0, c0, cols: c1 - c0 + 1, truncated, colName: numToCol };
}

export async function auditBytes(bytes) { return auditWorkbook(await readWorkbook(bytes)); }

const csvCell = (v) => {
  let s = v === undefined || v === null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // CSV/formula injection guard (OWASP)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function findingsCsv(result) {
  const head = ["severity", "rule", "sheet", "cell", "title", "formula", "expected", "detail"];
  const lines = [head.join(",")];
  for (const f of result.findings) lines.push([f.severity, f.rule, f.sheet, f.cell, f.title, f.formula ? "=" + f.formula : "", f.expected ? "=" + f.expected : "", f.detail].map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

export { MAX_ROW };
