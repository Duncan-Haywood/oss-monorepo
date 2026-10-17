// X12 EDI checker and reader for small suppliers who trade with large retailers: the ISA/GS/ST
// envelope (control numbers and segment counts), then 850 purchase orders, 810 invoices, 856 ship
// notices and 997 acknowledgements read as tables, with UPC/GTIN and SSCC check digits, invoice
// totals against their lines, ship-notice hierarchy and the reasons a trading partner rejected a file.
// Pure functions, no DOM, no network.
//
// Written from memory of the public X12 004010/005010 layouts. No retailer's implementation guide or
// validator was available; partner-specific rules (required segments, qualifiers, code lists) are
// out of scope and the page says so.

export const SET_NAMES = {
  810: "Invoice", 820: "Payment order / remittance", 846: "Inventory inquiry / advice", 850: "Purchase order",
  855: "PO acknowledgement", 856: "Advance ship notice (ASN)", 860: "PO change", 940: "Warehouse shipping order",
  945: "Warehouse shipping advice", 997: "Functional acknowledgement", 999: "Implementation acknowledgement",
};
const GROUP_CODE = { 810: "IN", 820: "RA", 846: "IB", 850: "PO", 855: "PR", 856: "SH", 860: "PC", 940: "OW", 945: "SW", 997: "FA", 999: "FA" };
const ISA_LEN = [2, 10, 2, 10, 2, 15, 2, 15, 6, 4, 1, 5, 9, 1, 1, 1];
const ID_QUAL = { UP: "UPC", EN: "EAN-13", UK: "GTIN-14", VN: "Vendor item", BP: "Buyer part", SK: "SKU", IN: "Buyer item", UA: "UPC case code", CB: "Buyer catalog" };
const GTIN_LEN = { UP: [12], EN: [13], UK: [14] };

const ACK5 = { A: "Accepted", E: "Accepted, but errors were noted", R: "Rejected", M: "Rejected, message authentication failed", W: "Rejected, assurance failed", X: "Rejected, content could not be analyzed" };
const ACK5_ERR = { 1: "Transaction set not supported", 2: "Transaction set trailer missing", 3: "Control number in header and trailer do not match", 4: "Segment count in trailer does not match", 5: "One or more segments in error", 6: "Missing or invalid transaction set identifier", 7: "Missing or invalid transaction set control number", 23: "Transaction set control number not unique within the group" };
const ACK9 = { A: "Accepted", E: "Accepted, but errors were noted", P: "Partially accepted", R: "Rejected" };
const ACK9_ERR = { 1: "Functional group not supported", 2: "Functional group version not supported", 3: "Functional group trailer missing", 4: "Group control number in header and trailer do not match", 5: "Number of included transaction sets does not match actual count", 6: "Group control number violates syntax", 10: "Group control number not unique within the interchange" };
const AK3_ERR = { 1: "Unrecognized segment ID", 2: "Unexpected segment", 3: "Mandatory segment missing", 4: "Loop occurs over maximum times", 5: "Segment exceeds maximum use", 6: "Segment not in defined transaction set", 7: "Segment not in proper sequence", 8: "Segment has data element errors" };
const AK4_ERR = { 1: "Mandatory data element missing", 2: "Conditional required data element missing", 3: "Too many data elements", 4: "Data element too short", 5: "Data element too long", 6: "Invalid character in data element", 7: "Invalid code value", 8: "Invalid date", 9: "Invalid time", 10: "Exclusion condition violated" };

export function decodeBuffer(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8);
  const t = new TextDecoder("utf-8").decode(u8);
  return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;
}

// ---- numbers ---------------------------------------------------------------
const SCALE = 8n, ONE = 10n ** SCALE;
// Decimal string -> BigInt scaled by 1e8, or null.
export function dec(v) {
  const s = String(v ?? "").trim();
  const m = s.match(/^([-+]?)(\d*)(?:\.(\d*))?$/);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) return null;
  const frac = (m[3] ?? "").slice(0, 8).padEnd(8, "0");
  const n = BigInt(m[2] || "0") * ONE + BigInt(frac);
  return m[1] === "-" ? -n : n;
}
const mul = (a, b) => (a * b) / ONE;
export function money(n) { // scaled-1e8 -> "1,234.56" (rounded to cents)
  const neg = n < 0n, a = neg ? -n : n;
  const c = (a + ONE / 200n) / (ONE / 100n);
  const s = c.toString().padStart(3, "0");
  return `${neg ? "-" : ""}${s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${s.slice(-2)}`;
}
const qtyStr = (n) => { const neg = n < 0n, a = neg ? -n : n; const w = a / ONE, f = (a % ONE).toString().padStart(8, "0").replace(/0+$/, ""); return `${neg ? "-" : ""}${w}${f ? "." + f : ""}`; };
export { qtyStr };

// GS1 mod-10 check digit for a GTIN/SSCC body (digits without the check digit).
export function gs1CheckDigit(body) {
  let sum = 0;
  for (let i = body.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += Number(body[i]) * w;
  return (10 - (sum % 10)) % 10;
}
export function gs1Valid(code) { return /^\d{8,18}$/.test(code) && gs1CheckDigit(code.slice(0, -1)) === Number(code.slice(-1)); }

function validDate8(s) {
  const m = String(s ?? "").match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCDate() === +m[3] && d.getUTCMonth() === +m[2] - 1;
}
function validDate6(s) { return /^\d{6}$/.test(s ?? "") && validDate8("20" + s); }

// ---- segments --------------------------------------------------------------
export function detectSeparators(text) {
  const t = String(text ?? "").replace(/^\ufeff/, "").trimStart();
  if (/^ISA/.test(t) && t.length >= 106) {
    // Walk the 16 elements rather than trusting fixed offsets, so an ISA with a short field still finds its terminator.
    const el = t[3];
    let idx = 3, n = 0;
    while (n < 15 && idx !== -1) { idx = t.indexOf(el, idx + 1); n++; }
    if (idx !== -1 && idx + 2 < t.length) {
      const comp = t[idx + 1], seg = t[idx + 2];
      if (el !== comp && el !== seg && comp !== seg) return { el, comp, seg, fromIsa: true, rep: t[82] };
    }
  }
  return { el: "*", comp: ":", seg: "~", fromIsa: false, rep: "^" };
}

export function splitSegments(text) {
  const t = String(text ?? "").replace(/^﻿/, "");
  const lead = t.length - t.trimStart().length;
  const body = t.slice(lead);
  const sep = detectSeparators(body);
  const nl = [];
  for (let i = 0; i < t.length; i++) if (t[i] === "\n") nl.push(i);
  const lineOf = (idx) => { let lo = 0, hi = nl.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (nl[mid] < idx) lo = mid + 1; else hi = mid; } return lo + 1; };
  const segs = [];
  let pos = 0;
  const parts = body.split(sep.seg);
  parts.forEach((raw, i) => {
    const startIdx = lead + pos;
    pos += raw.length + sep.seg.length;
    const clean = raw.replace(/[\r\n]+/g, "").trim();
    if (!clean) return;
    const el = clean.split(sep.el);
    segs.push({ id: el[0], el, n: segs.length + 1, line: lineOf(startIdx + (raw.length - raw.trimStart().length)), raw: clean, terminated: i < parts.length - 1 });
  });
  return { segs, sep };
}

const get = (s, i) => (s.el[i] ?? "").trim();
const add = (out, severity, code, seg, title, detail) => out.push({ severity, code, seg: seg ? seg.n : null, line: seg ? seg.line : null, at: seg ? `${seg.id} · segment ${seg.n}` : "", title, detail });

// ---- parse envelope structure ---------------------------------------------
export function parse(text) {
  const { segs, sep } = splitSegments(text);
  const out = [];
  const interchanges = [];
  let isa = null, gs = null, st = null;
  if (!segs.length) return { sep, segs, interchanges, findings: out };
  if (!sep.fromIsa) add(out, "warning", "NOISA", segs[0], "No complete ISA header found", "Separators fall back to * : ~ because the 106-character ISA header was not found at the start of the file.");
  for (const s of segs) {
    switch (s.id) {
      case "ISA":
        if (isa) add(out, "error", "NESTING", s, "ISA inside an interchange that never closed", "The previous interchange has no IEA trailer.");
        isa = { seg: s, groups: [], trailer: null }; interchanges.push(isa); gs = null; st = null; break;
      case "GS":
        if (!isa) { add(out, "error", "NESTING", s, "GS outside an interchange", "A functional group must sit between ISA and IEA."); isa = { seg: s, groups: [], trailer: null, implicit: true }; interchanges.push(isa); }
        if (gs) add(out, "error", "NESTING", s, "GS inside a group that never closed", "The previous group has no GE trailer.");
        gs = { seg: s, sets: [], trailer: null }; isa.groups.push(gs); st = null; break;
      case "ST":
        if (!gs) { add(out, "error", "NESTING", s, "ST outside a functional group", "A transaction set must sit between GS and GE."); gs = { seg: s, sets: [], trailer: null, implicit: true }; if (!isa) { isa = { seg: s, groups: [], trailer: null, implicit: true }; interchanges.push(isa); } isa.groups.push(gs); }
        if (st) add(out, "error", "NESTING", s, "ST inside a transaction set that never closed", "The previous set has no SE trailer.");
        st = { seg: s, segs: [s], trailer: null }; gs.sets.push(st); break;
      case "SE":
        if (st) { st.segs.push(s); st.trailer = s; st = null; } else add(out, "error", "NESTING", s, "SE with no open ST", "The transaction set trailer has no header.");
        break;
      case "GE":
        if (gs) { gs.trailer = s; gs = null; } else add(out, "error", "NESTING", s, "GE with no open GS", "The group trailer has no header.");
        break;
      case "IEA":
        if (isa) { isa.trailer = s; isa = null; } else add(out, "error", "NESTING", s, "IEA with no open ISA", "The interchange trailer has no header.");
        break;
      default:
        if (st) st.segs.push(s);
    }
  }
  return { sep, segs, interchanges, findings: out };
}

// ---- envelope checks -------------------------------------------------------
function checkEnvelope(p, out) {
  for (const ic of p.interchanges) {
    const s = ic.seg;
    if (s.id === "ISA") {
      if (s.el.length !== 17) add(out, "error", "ISA-ELEMS", s, `ISA has ${s.el.length - 1} elements, not 16`, "The interchange header has exactly 16 elements; a stray separator or a missing field shifts everything after it.");
      else ISA_LEN.forEach((len, i) => {
        const v = s.el[i + 1];
        if (v.length !== len) add(out, "error", "ISA-LEN", s, `ISA${String(i + 1).padStart(2, "0")} is ${v.length} characters, must be ${len}`, `ISA fields are fixed width and padded with spaces; “${v}” is the wrong length, which also moves the 106-character header out of place.`);
      });
      if (s.el[9] && !validDate6(s.el[9])) add(out, "error", "DATE", s, "ISA09 is not a valid YYMMDD date", `Found “${s.el[9]}”.`);
      if (s.el[15] === "T") add(out, "info", "TEST", s, "Interchange is marked as test", "ISA15 = T. Many partners drop test files in production, or the reverse.");
      else if (s.el[15] && s.el[15] !== "P") add(out, "warning", "ISA15", s, "ISA15 usage indicator is not P or T", `Found “${s.el[15]}”.`);
      if (s.el[13] && !/^\d{9}$/.test(s.el[13])) add(out, "error", "ISA13", s, "ISA13 control number is not 9 digits", `Found “${s.el[13]}”.`);
    }
    if (!ic.trailer) { if (!ic.implicit) add(out, "error", "MISSING-IEA", s, "Interchange has no IEA trailer", "The file may be truncated."); }
    else {
      const t = ic.trailer;
      if (s.id === "ISA" && get(t, 2) !== get(s, 13)) add(out, "error", "IEA-CTRL", t, `IEA02 ${get(t, 2)} does not match ISA13 ${get(s, 13)}`, "The interchange control number must be the same in the header and the trailer.");
      if (get(t, 1) !== String(ic.groups.length)) add(out, "error", "IEA-COUNT", t, `IEA01 says ${get(t, 1) || "nothing"} group(s), found ${ic.groups.length}`, "IEA01 counts the GS/GE groups in the interchange.");
    }
    for (const g of ic.groups) {
      const gh = g.seg;
      if (gh.id === "GS") {
        if (!validDate8(get(gh, 4))) add(out, "error", "DATE", gh, "GS04 is not a valid CCYYMMDD date", `Found “${get(gh, 4)}”.`);
        if (g.sets.length && GROUP_CODE[get(g.sets[0].seg, 1)] && get(gh, 1) !== GROUP_CODE[get(g.sets[0].seg, 1)]) add(out, "warning", "GS01", gh, `GS01 is ${get(gh, 1) || "empty"}, usual code for an ${get(g.sets[0].seg, 1)} is ${GROUP_CODE[get(g.sets[0].seg, 1)]}`, "The functional identifier code usually matches the transaction type inside the group.");
      }
      if (!g.trailer) { if (!g.implicit) add(out, "error", "MISSING-GE", gh, "Group has no GE trailer", "The file may be truncated."); }
      else {
        if (gh.id === "GS" && get(g.trailer, 2) !== get(gh, 6)) add(out, "error", "GE-CTRL", g.trailer, `GE02 ${get(g.trailer, 2)} does not match GS06 ${get(gh, 6)}`, "The group control number must be the same in the header and the trailer.");
        if (get(g.trailer, 1) !== String(g.sets.length)) add(out, "error", "GE-COUNT", g.trailer, `GE01 says ${get(g.trailer, 1) || "nothing"} transaction set(s), found ${g.sets.length}`, "GE01 counts the ST/SE sets in the group.");
      }
      for (const st of g.sets) {
        const h = st.seg;
        if (!st.trailer) { add(out, "error", "MISSING-SE", h, `Transaction set ${get(h, 2)} has no SE trailer`, "The file may be truncated."); continue; }
        if (get(st.trailer, 2) !== get(h, 2)) add(out, "error", "SE-CTRL", st.trailer, `SE02 ${get(st.trailer, 2)} does not match ST02 ${get(h, 2)}`, "The set control number must be the same in the header and the trailer.");
        if (get(st.trailer, 1) !== String(st.segs.length)) add(out, "error", "SE-COUNT", st.trailer, `SE01 says ${get(st.trailer, 1) || "nothing"} segment(s), the set has ${st.segs.length}`, "SE01 counts every segment from ST to SE inclusive. Adding or removing a line without updating it is the most common reason a partner rejects a file.");
      }
    }
  }
}

// ---- transaction readers ---------------------------------------------------
function idPairs(s, from) {
  const pairs = [];
  for (let i = from; i + 1 < s.el.length; i += 2) { const q = get(s, i), v = get(s, i + 1); if (q || v) pairs.push({ q, v }); }
  return pairs;
}

function readLine(s, firstPair) {
  return { seg: s, no: get(s, 1), qty: dec(get(s, 2)), qtyText: get(s, 2), uom: get(s, 3), price: dec(get(s, 4)), priceText: get(s, 4), basis: get(s, 5), ids: idPairs(s, firstPair) };
}
const idOf = (l, ...quals) => (l.ids.find((p) => quals.includes(p.q)) || {}).v || "";

function checkLine(l, set, out, seen) {
  const s = l.seg, kind = s.id;
  if (!l.no) add(out, "warning", "LINE-NO", s, `${kind} has no line number`, "The first element is the assigned identification (line number). Partners match lines on it.");
  if (l.qty === null) add(out, "error", "QTY", s, `Quantity “${l.qtyText}” is not a number`, `${kind}02 must be numeric.`);
  else if (l.qty === 0n) add(out, "warning", "QTY-ZERO", s, "Quantity is zero", "A zero-quantity line is usually a mistake, or a line that should have been removed.");
  else if (l.qty < 0n) add(out, "warning", "QTY-NEG", s, "Quantity is negative", "Negative quantities appear on credit memos; check this is one.");
  if (!l.uom) add(out, "error", "UOM", s, "Unit of measure is missing", `${kind}03 is required (EA each, CA case, PK pack, BX box, LB pound…).`);
  if (l.price === null && l.priceText !== "") add(out, "error", "PRICE", s, `Unit price “${l.priceText}” is not a number`, `${kind}04 must be a plain decimal.`);
  else if (l.priceText === "") add(out, "warning", "PRICE", s, "Unit price is missing", "Without a price the line cannot be extended.");
  if (l.basis && !["PE", "PP"].includes(l.basis)) add(out, "info", "BASIS", s, `Price basis ${l.basis} is not “per each”`, "Line totals here are quantity × price. A different basis (per hundred, per thousand) changes the extension, so a total mismatch may be expected.");
  for (const p of l.ids) {
    if (GTIN_LEN[p.q]) {
      if (!/^\d+$/.test(p.v) || !GTIN_LEN[p.q].includes(p.v.length)) add(out, "error", "GTIN-LEN", s, `${ID_QUAL[p.q]} “${p.v}” is not ${GTIN_LEN[p.q].join(" or ")} digits`, "A leading zero dropped by a spreadsheet is the usual cause.");
      else if (!gs1Valid(p.v)) add(out, "error", "GTIN-CHECK", s, `${ID_QUAL[p.q]} ${p.v} fails its check digit`, `The last digit should be ${gs1CheckDigit(p.v.slice(0, -1))}. A mistyped or truncated barcode number.`);
    }
  }
  const key = idOf(l, "UP", "EN", "UK") || idOf(l, "VN", "SK", "BP");
  if (key) { if (seen.has(key)) add(out, "warning", "DUP-ITEM", s, `Item ${key} appears on more than one line`, `Also on the line at segment ${seen.get(key)}. Partners usually want one line per item.`); else seen.set(key, s.n); }
  else add(out, "warning", "NO-ITEM", s, "Line has no product identifier", "No UPC, vendor or buyer item number was found after the price basis.");
}

function readPO(st, out) {
  const beg = st.segs.find((s) => s.id === "BEG");
  const doc = { type: "850", control: get(st.seg, 2), lines: [], header: {} };
  if (!beg) { add(out, "error", "MISSING-SEG", st.seg, "850 has no BEG segment", "BEG carries the purchase order number and date."); }
  else {
    doc.header = { purpose: get(beg, 1), poType: get(beg, 2), po: get(beg, 3), date: get(beg, 5) };
    if (!doc.header.po) add(out, "error", "PO-NO", beg, "BEG03 purchase order number is empty", "Every reply and invoice is matched on this number.");
    if (get(beg, 5) && !validDate8(get(beg, 5))) add(out, "error", "DATE", beg, "BEG05 is not a valid CCYYMMDD date", `Found “${get(beg, 5)}”.`);
  }
  const seen = new Map();
  for (const s of st.segs.filter((x) => x.id === "PO1")) { const l = readLine(s, 6); doc.lines.push(l); checkLine(l, st, out, seen); }
  if (!doc.lines.length) add(out, "warning", "NO-LINES", st.seg, "850 has no PO1 lines", "A purchase order with no lines orders nothing.");
  const ctt = st.segs.find((x) => x.id === "CTT");
  if (ctt) {
    if (get(ctt, 1) !== String(doc.lines.length)) add(out, "error", "CTT-COUNT", ctt, `CTT01 says ${get(ctt, 1) || "nothing"} line(s), found ${doc.lines.length}`, "CTT01 counts the PO1 lines.");
    if (get(ctt, 2) !== "") { const sum = doc.lines.reduce((a, l) => a + (l.qty ?? 0n), 0n), declared = dec(get(ctt, 2)); if (declared !== null && declared !== sum) add(out, "warning", "CTT-HASH", ctt, `CTT02 hash total ${get(ctt, 2)} differs from the quantities, which add to ${qtyStr(sum)}`, "CTT02 is the sum of the PO102 quantities."); }
  }
  doc.totalQty = doc.lines.reduce((a, l) => a + (l.qty ?? 0n), 0n);
  doc.total = doc.lines.reduce((a, l) => a + (l.qty !== null && l.price !== null ? mul(l.qty, l.price) : 0n), 0n);
  return doc;
}

function readInvoice(st, out) {
  const big = st.segs.find((s) => s.id === "BIG");
  const doc = { type: "810", control: get(st.seg, 2), lines: [], header: {} };
  if (!big) add(out, "error", "MISSING-SEG", st.seg, "810 has no BIG segment", "BIG carries the invoice number, invoice date and purchase order number.");
  else {
    doc.header = { date: get(big, 1), invoice: get(big, 2), poDate: get(big, 3), po: get(big, 4) };
    if (!doc.header.invoice) add(out, "error", "INV-NO", big, "BIG02 invoice number is empty", "A partner cannot pay an invoice without a number.");
    if (!doc.header.po) add(out, "error", "PO-NO", big, "BIG04 purchase order number is empty", "Retailers match invoices to purchase orders on this number; a blank one is the classic unpaid-invoice cause.");
    if (!validDate8(get(big, 1))) add(out, "error", "DATE", big, "BIG01 is not a valid CCYYMMDD date", `Found “${get(big, 1)}”.`);
    if (get(big, 3) && !validDate8(get(big, 3))) add(out, "error", "DATE", big, "BIG03 is not a valid CCYYMMDD date", `Found “${get(big, 3)}”.`);
  }
  const seen = new Map();
  for (const s of st.segs.filter((x) => x.id === "IT1")) { const l = readLine(s, 6); doc.lines.push(l); checkLine(l, st, out, seen); }
  if (!doc.lines.length) add(out, "warning", "NO-LINES", st.seg, "810 has no IT1 lines", "An invoice with no lines bills nothing.");
  let lineTotal = 0n;
  for (const l of doc.lines) if (l.qty !== null && l.price !== null) { l.ext = mul(l.qty, l.price); lineTotal += l.ext; }
  let charges = 0n, taxes = 0n;
  const adj = [];
  for (const s of st.segs) {
    if (s.id === "SAC") {
      const amt = dec(get(s, 5));
      if (amt === null) continue;
      const v = amt / 100n; // N2: implied two decimals
      const ind = get(s, 1);
      if (ind === "C") { charges += v; adj.push({ kind: "Charge", amt: v, text: get(s, 15) || get(s, 4) }); }
      else if (ind === "A") { charges -= v; adj.push({ kind: "Allowance", amt: -v, text: get(s, 15) || get(s, 4) }); }
    } else if (s.id === "TXI") { const a = dec(get(s, 2)); if (a !== null) { taxes += a; adj.push({ kind: "Tax " + get(s, 1), amt: a, text: "" }); } }
  }
  const tds = st.segs.find((s) => s.id === "TDS");
  doc.lineTotal = lineTotal; doc.charges = charges; doc.taxes = taxes; doc.adjustments = adj;
  doc.expected = lineTotal + charges + taxes;
  if (!tds) add(out, "error", "MISSING-SEG", st.seg, "810 has no TDS total", "TDS carries the invoice total the partner will pay.");
  else {
    const t = get(tds, 1);
    const declared = /\./.test(t) ? dec(t) : (dec(t) === null ? null : dec(t) / 100n);
    doc.declared = declared;
    if (declared === null) add(out, "error", "TDS", tds, `TDS01 “${t}” is not a number`, "TDS01 is the invoice total in cents with no decimal point (123456 means 1,234.56).");
    else {
      const diff = declared - doc.expected, tol = ONE / 100n * BigInt(Math.max(1, Math.ceil(doc.lines.length / 2)));
      doc.diff = diff;
      if (diff !== 0n && (diff < 0n ? -diff : diff) <= tol) add(out, "info", "TDS-ROUND", tds, `Invoice total ${money(declared)} is ${money(diff)} from the lines (${money(doc.expected)})`, "Within what rounding line by line can explain.");
      else if (diff !== 0n) add(out, "error", "TDS-TOTAL", tds, `Invoice total ${money(declared)} does not equal the lines${adj.length ? " plus charges and tax" : ""}: ${money(doc.expected)}`, `Lines ${money(lineTotal)}${charges ? `, charges/allowances ${money(charges)}` : ""}${taxes ? `, tax ${money(taxes)}` : ""}; the invoice is ${money(diff)} ${diff > 0n ? "over" : "under"}. A quantity or price changed after the total was computed is the usual cause; the total is never edited for you.`);
    }
  }
  const ctt = st.segs.find((x) => x.id === "CTT");
  if (ctt && get(ctt, 1) !== String(doc.lines.length)) add(out, "error", "CTT-COUNT", ctt, `CTT01 says ${get(ctt, 1) || "nothing"} line(s), found ${doc.lines.length}`, "CTT01 counts the IT1 lines.");
  return doc;
}

function readASN(st, out) {
  const bsn = st.segs.find((s) => s.id === "BSN");
  const doc = { type: "856", control: get(st.seg, 2), hl: [], header: {}, items: [], ssccs: [] };
  if (!bsn) add(out, "error", "MISSING-SEG", st.seg, "856 has no BSN segment", "BSN carries the shipment identification and date.");
  else {
    doc.header = { purpose: get(bsn, 1), shipment: get(bsn, 2), date: get(bsn, 3), structure: get(bsn, 5) };
    if (!doc.header.shipment) add(out, "error", "SHIP-NO", bsn, "BSN02 shipment ID is empty", "Partners key the receipt on the shipment identifier.");
    if (!validDate8(get(bsn, 3))) add(out, "error", "DATE", bsn, "BSN03 is not a valid CCYYMMDD date", `Found “${get(bsn, 3)}”.`);
  }
  const ids = new Map();
  let expectNext = 1, cur = null;
  for (const s of st.segs) {
    if (s.id === "HL") {
      const id = get(s, 1), parent = get(s, 2), level = get(s, 3);
      const h = { seg: s, id, parent, level, children: 0, refs: [], items: [] };
      if (Number(id) !== expectNext) add(out, "error", "HL-SEQ", s, `HL01 is ${id || "empty"}, expected ${expectNext}`, "Hierarchical IDs count up from 1 with no gaps.");
      expectNext = Number(id) + 1 || expectNext + 1;
      if (ids.has(id)) add(out, "error", "HL-DUP", s, `HL01 ${id} is used twice`, "Each hierarchical level needs a unique ID.");
      if (!parent && ids.size > 0) add(out, "error", "HL-PARENT", s, "HL02 parent is empty on a level that is not the first", "Every level after the first must name its parent.");
      if (parent && !ids.has(parent)) add(out, "error", "HL-PARENT", s, `HL02 parent ${parent} does not exist before this level`, "A level can only point at a parent that appeared earlier.");
      if (ids.size === 0 && parent) add(out, "error", "HL-PARENT", s, "First HL has a parent", "The first level (usually shipment) has no parent.");
      if (!/^[SOTPI]$/.test(level)) add(out, "warning", "HL-LEVEL", s, `HL03 level code “${level}” is not one of S, O, T, P, I`, "Shipment, Order, Tare, Pack and Item are the usual levels.");
      else if (ids.has(parent)) {
        const pl = ids.get(parent).level;
        if (level === "I" && !["P", "O", "T"].includes(pl)) add(out, "warning", "HL-ORDER", s, `Item level under a ${pl} level`, "Items normally sit under an order, tare or pack level.");
        if (level === "S" && ids.size) add(out, "warning", "HL-ORDER", s, "Shipment level that is not the first", "A shipment level normally opens the hierarchy.");
      }
      if (ids.has(parent)) ids.get(parent).children++;
      ids.set(id, h); doc.hl.push(h); cur = h;
    } else if (s.id === "MAN" && cur) {
      const q = get(s, 1), v = get(s, 2);
      cur.refs.push({ q, v });
      if (q === "GM" || (q === "CA" && v.length === 18)) {
        doc.ssccs.push({ v, seg: s });
        if (!/^\d{18}$/.test(v)) add(out, "error", "SSCC-LEN", s, `SSCC “${v}” is not 18 digits`, "A shipping container code is 18 digits; a leading 00 application identifier is not part of it.");
        else if (!gs1Valid(v)) add(out, "error", "SSCC-CHECK", s, `SSCC ${v} fails its check digit`, `The last digit should be ${gs1CheckDigit(v.slice(0, -1))}. Retailers scan this label and reject a carton whose number does not validate.`);
      }
    } else if (s.id === "LIN" && cur) {
      const l = { seg: s, ids: idPairs(s, 2), qty: null, uom: "" };
      cur.items.push(l); doc.items.push(l);
      for (const p of l.ids) if (GTIN_LEN[p.q]) {
        if (!/^\d+$/.test(p.v) || !GTIN_LEN[p.q].includes(p.v.length)) add(out, "error", "GTIN-LEN", s, `${ID_QUAL[p.q]} “${p.v}” is not ${GTIN_LEN[p.q].join(" or ")} digits`, "A leading zero dropped by a spreadsheet is the usual cause.");
        else if (!gs1Valid(p.v)) add(out, "error", "GTIN-CHECK", s, `${ID_QUAL[p.q]} ${p.v} fails its check digit`, `The last digit should be ${gs1CheckDigit(p.v.slice(0, -1))}.`);
      }
    } else if (s.id === "SN1" && cur && cur.items.length) {
      const l = cur.items[cur.items.length - 1];
      l.qty = dec(get(s, 2)); l.qtyText = get(s, 2); l.uom = get(s, 3);
      if (l.qty === null) add(out, "error", "QTY", s, `Shipped quantity “${get(s, 2)}” is not a number`, "SN102 must be numeric.");
    }
  }
  const dupSscc = new Map();
  for (const x of doc.ssccs) { if (dupSscc.has(x.v)) add(out, "error", "SSCC-DUP", x.seg, `SSCC ${x.v} is used on two cartons`, `Also at segment ${dupSscc.get(x.v)}. Every carton label carries its own number.`); else dupSscc.set(x.v, x.seg.n); }
  if (!doc.hl.length) add(out, "error", "NO-HL", st.seg, "856 has no HL segments", "A ship notice describes the shipment as a hierarchy of HL levels.");
  const ctt = st.segs.find((x) => x.id === "CTT");
  if (ctt && get(ctt, 1) !== String(doc.hl.length)) add(out, "error", "CTT-COUNT", ctt, `CTT01 says ${get(ctt, 1) || "nothing"} HL segment(s), found ${doc.hl.length}`, "CTT01 counts the HL segments.");
  return doc;
}

function readAck(st, out) {
  const doc = { type: "997", control: get(st.seg, 2), header: {}, results: [], groupStatus: null };
  let cur = null, curSeg = null;
  for (const s of st.segs) {
    if (s.id === "AK1") doc.header = { fgid: get(s, 1), group: get(s, 2) };
    else if (s.id === "AK2") { cur = { set: get(s, 1), control: get(s, 2), status: "", errors: [], segErrors: [] }; doc.results.push(cur); curSeg = null; }
    else if (s.id === "AK3" && cur) { curSeg = { id: get(s, 1), pos: get(s, 2), code: get(s, 4), text: AK3_ERR[get(s, 4)] || `code ${get(s, 4)}`, elements: [] }; cur.segErrors.push(curSeg); }
    else if (s.id === "AK4" && curSeg) curSeg.elements.push({ pos: get(s, 1), code: get(s, 3), text: AK4_ERR[get(s, 3)] || `code ${get(s, 3)}`, value: get(s, 4) });
    else if (s.id === "AK5" && cur) { cur.status = get(s, 1); for (let i = 2; i <= 6; i++) if (get(s, i)) cur.errors.push({ code: get(s, i), text: ACK5_ERR[get(s, i)] || `code ${get(s, i)}` }); }
    else if (s.id === "AK9") { doc.groupStatus = { status: get(s, 1), included: get(s, 2), received: get(s, 3), accepted: get(s, 4), errors: [5, 6, 7, 8, 9].map((i) => get(s, i)).filter(Boolean).map((c) => ({ code: c, text: ACK9_ERR[c] || `code ${c}` })) }; }
  }
  for (const r of doc.results) {
    const name = SET_NAMES[r.set] ? `${r.set} (${SET_NAMES[r.set]})` : r.set;
    if (r.status && r.status !== "A") {
      const why = [...r.errors.map((e) => e.text), ...r.segErrors.flatMap((g) => [`${g.id} segment ${g.pos}: ${g.text}`, ...g.elements.map((e) => `element ${e.pos}: ${e.text}${e.value ? ` (“${e.value}”)` : ""}`)])];
      add(out, r.status === "E" ? "warning" : "error", "ACK-" + r.status, st.seg, `Partner ${r.status === "E" ? "accepted with errors" : "rejected"} ${name} ${r.control}: ${ACK5[r.status] || r.status}`, why.length ? why.join("; ") + "." : "No error codes were given.");
    }
  }
  const g = doc.groupStatus;
  if (g && g.status && g.status !== "A") add(out, g.status === "R" ? "error" : "warning", "ACK-GROUP", st.seg, `Group ${doc.header.group || ""}: ${ACK9[g.status] || g.status} (${g.accepted} of ${g.received} accepted)`, g.errors.length ? g.errors.map((e) => e.text).join("; ") + "." : "See the per-set results.");
  return doc;
}

export function validate(text) {
  const p = parse(text);
  const out = [...p.findings];
  const docs = [];
  if (!p.segs.length) { add(out, "error", "EMPTY", null, "No segments found", "Paste or load an X12 file."); return { findings: out, summary: { segments: 0, interchanges: 0, groups: 0, sets: 0 }, docs, sep: p.sep }; }
  checkEnvelope(p, out);
  let groups = 0, sets = 0;
  for (const ic of p.interchanges) for (const g of ic.groups) {
    groups++;
    for (const st of g.sets) {
      sets++;
      const type = get(st.seg, 1);
      let d = null;
      if (!SET_NAMES[type]) add(out, "info", "SET-UNKNOWN", st.seg, `Transaction set ${type || "(empty)"} is not read by this tool`, "Its envelope is checked; its content is not.");
      else if (type === "850") d = readPO(st, out);
      else if (type === "810") d = readInvoice(st, out);
      else if (type === "856") d = readASN(st, out);
      else if (type === "997" || type === "999") d = readAck(st, out);
      else add(out, "info", "SET-UNREAD", st.seg, `${type} ${SET_NAMES[type]} is checked at the envelope only`, "850, 810, 856 and 997 are read in full.");
      if (d) { d.type = type; d.name = SET_NAMES[type]; d.startSeg = st.seg.n; d.segCount = st.segs.length; docs.push(d); }
    }
  }
  if (!out.some((f) => f.severity !== "info")) add(out, "info", "CLEAN", null, "No structural problems found", "Envelope counts and control numbers agree, and the readers found nothing to flag. This does not mean your trading partner will accept the file: their own implementation guide has rules this tool does not know.");
  out.sort((a, b) => (a.seg ?? 1e9) - (b.seg ?? 1e9));
  return { findings: out, summary: { segments: p.segs.length, interchanges: p.interchanges.length, groups, sets }, docs, sep: p.sep };
}

// Rebuild the counts: SE01, GE01, IEA01 and the line count in CTT01. Never touches an item, a quantity or a price.
export function repair(text) {
  const p = parse(text);
  const v = validate(text);
  if (v.findings.some((f) => f.severity === "error" && ["NESTING", "MISSING-SE", "MISSING-GE", "MISSING-IEA", "EMPTY", "ISA-ELEMS", "ISA-LEN"].includes(f.code))) {
    return { text: null, changes: [], error: "The envelope is broken (missing trailers, misplaced segments or a malformed ISA). Fix that first; only counts can be rebuilt." };
  }
  const changes = [];
  const set = (s, i, value) => { if (get(s, i) !== String(value)) { changes.push(`Segment ${s.n} (${s.id}): element ${String(i).padStart(2, "0")} ${get(s, i) || "(empty)"} → ${value}`); s.el[i] = String(value); } };
  for (const ic of p.interchanges) {
    for (const g of ic.groups) {
      for (const st of g.sets) {
        set(st.trailer, 1, st.segs.length);
        const type = get(st.seg, 1), ctt = st.segs.find((x) => x.id === "CTT");
        const lineSeg = { 850: "PO1", 810: "IT1", 856: "HL" }[type];
        if (ctt && lineSeg) set(ctt, 1, st.segs.filter((x) => x.id === lineSeg).length);
      }
      if (g.trailer) set(g.trailer, 1, g.sets.length);
    }
    if (ic.trailer) set(ic.trailer, 1, ic.groups.length);
  }
  const hadNl = /\n/.test(text);
  const sep = p.sep;
  const outText = p.segs.map((s) => s.el.join(sep.el)).join(sep.seg + (hadNl ? "\n" : "")) + sep.seg + (hadNl ? "\n" : "");
  return { text: outText, changes, error: null };
}

// ---- samples ---------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n, " ");

// Build a complete interchange from groups of transaction sets; each set is an array of segment strings
// (without ST/SE) and a set id. Counts and control numbers are computed.
export function interchange(groups, o = {}) {
  const { sender = "ACMEWIDGETS", receiver = "BIGRETAILER", date = "261003", longDate = "20261003", ctrl = 101 } = o;
  const segs = [["ISA", "00", pad("", 10), "00", pad("", 10), "ZZ", pad(sender, 15), "ZZ", pad(receiver, 15), date, "0830", "U", "00401", String(ctrl).padStart(9, "0"), "0", "P", ":"].join("*")];
  let gctrl = 0, sctrl = 0;
  for (const g of groups) {
    gctrl++;
    segs.push(["GS", GROUP_CODE[g.set], sender, receiver, longDate, "0830", gctrl, "X", "004010"].join("*"));
    for (const body of g.docs) {
      sctrl++;
      const c = String(sctrl).padStart(4, "0");
      segs.push(`ST*${g.set}*${c}`, ...body, `SE*${body.length + 2}*${c}`);
    }
    segs.push(`GE*${g.docs.length}*${gctrl}`);
  }
  segs.push(`IEA*${groups.length}*${String(ctrl).padStart(9, "0")}`);
  return segs.join("~\n") + "~\n";
}

const UPC1 = "012345678905", UPC2 = "036000291452"; // valid UPC-A check digits
const withCheck = (body) => body + gs1CheckDigit(body);
const SSCC1 = withCheck("00012345000000001"), SSCC2 = withCheck("00012345000000002");

export function sampleFile() {
  const po = ["BEG*00*SA*PO45001*20260929", "DTM*002*20261010", "PO1*1*48*EA*4.25*PE*UP*" + UPC1 + "*VN*WIDGET-A", "PO1*2*24*CA*18.5*PE*UP*" + UPC2 + "*VN*WIDGET-B", "CTT*2*72"];
  const inv = ["BIG*20261003*INV9001*20260929*PO45001", "IT1*1*48*EA*4.25*PE*UP*" + UPC1 + "*VN*WIDGET-A", "IT1*2*24*CA*18.5*PE*UP*" + UPC2 + "*VN*WIDGET-B", "TXI*ST*0", "TDS*64800", "CTT*2"];
  const asn = ["BSN*00*SHIP7001*20261003*0830*0001", "HL*1**S", "TD1*CTN25*2", "REF*BM*BOL-7001", "HL*2*1*O", "PRF*PO45001", "HL*3*2*P", `MAN*GM*${SSCC1}`, "HL*4*3*I", `LIN**UP*${UPC1}*VN*WIDGET-A`, "SN1**48*EA", "HL*5*2*P", `MAN*GM*${SSCC2}`, "HL*6*5*I", `LIN**UP*${UPC2}*VN*WIDGET-B`, "SN1**24*CA", "CTT*6"];
  return interchange([{ set: "850", docs: [po] }, { set: "810", docs: [inv] }, { set: "856", docs: [asn] }]);
}

// The same interchange after the edits that usually cause a rejection: a line deleted from the PO without
// updating the counts, a quantity changed on the invoice, a typo in a UPC and in a carton label.
export function sampleBrokenFile() {
  let t = sampleFile();
  t = t.replace("PO1*2*24*CA*18.5*PE*UP*" + UPC2 + "*VN*WIDGET-B~\n", "");
  t = t.replace("IT1*1*48*EA", "IT1*1*50*EA");
  t = t.replace(UPC1 + "*VN*WIDGET-A~\nIT1", "012345678906*VN*WIDGET-A~\nIT1");
  t = t.replace(SSCC2, SSCC2.slice(0, 17) + ((Number(SSCC2[17]) + 1) % 10));
  return t;
}

// ---- CSV -------------------------------------------------------------------
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

export function findingsCsv(result) {
  return toCsv([["severity", "segment", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, f.at, f.line ?? "", f.code, f.title, f.detail])]);
}

export function linesCsv(result) {
  const rows = [["document_type", "document_number", "po_number", "line", "quantity", "unit", "unit_price", "extended", "upc_or_gtin", "vendor_item", "buyer_item"]];
  for (const d of result.docs) {
    if (d.type === "850" || d.type === "810") {
      const docNo = d.type === "810" ? d.header.invoice : d.header.po;
      for (const l of d.lines) rows.push([d.type, docNo, d.header.po, l.no, l.qty === null ? l.qtyText : qtyStr(l.qty), l.uom, l.priceText, l.qty !== null && l.price !== null ? money(mul(l.qty, l.price)).replace(/,/g, "") : "", idOf(l, "UP", "EN", "UK"), idOf(l, "VN", "SK"), idOf(l, "BP", "IN")]);
    } else if (d.type === "856") {
      for (const it of d.items) rows.push([d.type, d.header.shipment, "", "", it.qty === null || it.qty === undefined ? "" : qtyStr(it.qty), it.uom, "", "", idOf(it, "UP", "EN", "UK"), idOf(it, "VN", "SK"), idOf(it, "BP", "IN")]);
    }
  }
  return toCsv(rows);
}
