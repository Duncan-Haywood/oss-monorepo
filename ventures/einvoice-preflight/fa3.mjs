// Offline checks for a Polish KSeF invoice in the FA(3) structure (the national
// schema at http://crd.gov.pl/wzor/2025/06/25/13775/, in force from 1 February
// 2026). FA(3) is not EN 16931, so none of the UBL/CII rules apply to it. Rule
// ids are PL-nnn and are this tool's own, not KSeF error codes. Element names,
// tax-rate codes and the P_13_n / P_14_n meanings were read from the published
// XSD (schemat_FA(3)_v1-0E.xsd); the example in examples/fa3-invoice.xml
// validates against it with xmllint. Sums are checked on every RodzajFaktury: VAT,
// UPR and KOR against the lines (a correction's StanPrzed rows count minus); ZAL,
// ROZ, KOR_ZAL and KOR_ROZ against the payment split across the order's rates
// (PL-023), as the Ministry's 26 published FA(3) examples apply it; what cannot be
// computed is named in `skipped`, never counted as a pass. The XSD itself is run
// first from fa3-xsd.mjs (PL-012..PL-017). This is an offline observation, not
// KSeF's acceptance and not tax advice. Findings never repeat a tax number.

import { roundHalfUpToCents } from "./checks.mjs";
import { parseXmlTree } from "./ubl.mjs";
import { xmlValueFindings } from "./xmlvalues.mjs";
import { checkAgainstFa3Schema } from "./fa3-xsd.mjs";

const TOLERANCE = 0.01;
const RATES = new Set(["23", "22", "8", "7", "5", "4", "3", "0 KR", "0 WDT", "0 EX", "zw", "oo", "np I", "np II"]);
// Which P_13_n total a line rate belongs to, and the rate in percent where VAT is stated.
const BUCKET = {
  "23": ["P_13_1", 23, "P_14_1"], "22": ["P_13_1", 22, "P_14_1"],
  "8": ["P_13_2", 8, "P_14_2"], "7": ["P_13_2", 7, "P_14_2"],
  "5": ["P_13_3", 5, "P_14_3"],
  "0 KR": ["P_13_6_1"], "0 WDT": ["P_13_6_2"], "0 EX": ["P_13_6_3"],
  "zw": ["P_13_7"], "np I": ["P_13_8"], "np II": ["P_13_9"], "oo": ["P_13_10"],
};
const NET_FIELDS = ["P_13_1", "P_13_2", "P_13_3", "P_13_4", "P_13_5", "P_13_6_1", "P_13_6_2", "P_13_6_3", "P_13_7", "P_13_8", "P_13_9", "P_13_10", "P_13_11"];
const VAT_FIELDS = ["P_14_1", "P_14_2", "P_14_3", "P_14_4", "P_14_5"];

const finding = (rule, message, fix, path) => ({ rule, message, fix, path });
const cents = roundHalfUpToCents;
const child = (node, name) => (node ? node.children.find((c) => c.name === name) : undefined);
const kids = (node, name) => (node ? node.children.filter((c) => c.name === name) : []);
const txt = (node, ...names) => {
  let cur = node;
  for (const name of names) cur = child(cur, name);
  return cur ? cur.text.trim() : "";
};
const num = (value) => {
  if (value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// Amounts are compared in whole grosze: |a - b| > 0.01 in floating point called 2050.99 against 2051 a
// two-grosz gap (the Ministry's example 1).
const offBy = (a, b, grosze = 1) => Math.abs(Math.round(a * 100) - Math.round(b * 100)) > grosze;
const TAXED = (rate) => BUCKET[rate] && BUCKET[rate].length === 3;

/** Zamowienie on an advance invoice: each line's quantity x price and the order's gross value (PL-024, PL-025). */
function checkOrder(order, out) {
  const rows = kids(order, "ZamowienieWiersz");
  rows.forEach((row, i) => {
    const qty = num(txt(row, "P_8BZ"));
    const price = num(txt(row, "P_9AZ"));
    const net = num(txt(row, "P_11NettoZ"));
    if (qty !== null && price !== null && net !== null && offBy(qty * price, net)) {
      out.push(finding("PL-025", `Order line ${txt(row, "NrWierszaZam") || i + 1}: quantity x unit price is ${cents(qty * price).toFixed(2)} but P_11NettoZ says ${net.toFixed(2)}.`,
        "Make P_11NettoZ equal P_8BZ x P_9AZ to the grosz, or correct the quantity or price.", `/Faktura/Fa/Zamowienie/ZamowienieWiersz[${i + 1}]/P_11NettoZ`));
    }
  });
  const value = num(txt(order, "WartoscZamowienia"));
  const after = rows.filter((r) => txt(r, "StanPrzedZ") !== "1");
  if (value === null || !after.length || after.some((r) => num(txt(r, "P_11NettoZ")) === null)) return;
  const gross = after.reduce((s, r) => s + num(txt(r, "P_11NettoZ")) + (num(txt(r, "P_11VatZ")) || 0), 0);
  if (offBy(gross, value)) {
    out.push(finding("PL-024", `WartoscZamowienia is ${value.toFixed(2)} but the order lines (net plus tax${rows.length > after.length ? ", after the correction" : ""}) add up to ${cents(gross).toFixed(2)}.`,
      "Make WartoscZamowienia the order's value including tax: the sum of P_11NettoZ and P_11VatZ over its lines.", "/Faktura/Fa/Zamowienie/WartoscZamowienia"));
  }
}

/** VAT, UPR and KOR: each P_13_n against the lines at that rate (PL-006), P_14_n against it x the rate (PL-007). */
function checkLineTotals(fa, lines, kind, before, out, skipped) {
  const stated = (f) => num(txt(fa, f));
  const sums = new Map();
  // A line with a rate code outside the list is PL-004's; one with no amount or no rate leaves the totals unknowable.
  const priced = lines.length > 0 && lines.every((l) => txt(l, "P_12") && num(txt(l, "P_11")) !== null);
  if (lines.some((l) => txt(l, "P_11A"))) {
    skipped.push("P_13_n against lines (a line states a gross value, P_11A)");
  } else if (!lines.length) {
    if (kind === "KOR") skipped.push("P_13_n against lines (a correction with no lines, such as a discount on a period's supplies)");
  } else if (!priced) {
    skipped.push("P_13_n against lines (not every line states both P_11 and a rate, P_12)");
  } else {
    for (const line of lines) {
      if (!BUCKET[txt(line, "P_12")]) continue;
      const field = BUCKET[txt(line, "P_12")][0];
      const net = num(txt(line, "P_11")) * (before(line) ? -1 : 1);
      sums.set(field, (sums.get(field) || 0) + net);
    }
    const how = kind === "KOR" && lines.some(before) ? " (after rows minus StanPrzed rows)" : "";
    for (const [field, total] of sums) {
      const value = stated(field);
      if (value === null && Math.round(total * 100) === 0) continue;
      if (value === null) {
        out.push(finding("PL-006", `${field} is missing but the lines have ${cents(total).toFixed(2)} at that rate${how}.`,
          `Add ${field} with the sum of those lines' P_11${how}.`, `/Faktura/Fa/${field}`));
      } else if (offBy(value, total)) {
        out.push(finding("PL-006", `${field} is ${value.toFixed(2)} but the lines at that rate add up to ${cents(total).toFixed(2)}${how}.`,
          `Set ${field} to the sum of the lines' P_11 for that rate${how}.`, `/Faktura/Fa/${field}`));
      }
    }
    for (const field of NET_FIELDS) {
      if (!sums.has(field) && stated(field) && !["P_13_4", "P_13_5", "P_13_11"].includes(field)) {
        out.push(finding("PL-006", `${field} states ${txt(fa, field)} but no line carries the matching rate.`,
          "Remove it, or give the lines the rate it totals.", `/Faktura/Fa/${field}`));
      }
    }
  }
  // VAT per rate: stated tax against stated net x the lines' rate (the 23/22 and 8/7 totals take either rate).
  for (const [netField, vatField] of [["P_13_1", "P_14_1"], ["P_13_2", "P_14_2"], ["P_13_3", "P_14_3"]]) {
    const used = new Set(lines.map((l) => txt(l, "P_12")).filter((r) => BUCKET[r] && BUCKET[r][0] === netField));
    const net = stated(netField);
    const vat = stated(vatField);
    if (used.size !== 1 || net === null || vat === null) continue;
    const pct = BUCKET[[...used][0]][1];
    if (offBy(net * pct / 100, vat)) {
      out.push(finding("PL-007", `${vatField} is ${vat.toFixed(2)} but ${pct}% of ${netField} (${net.toFixed(2)}) is ${cents(net * pct / 100).toFixed(2)}.`,
        `Recompute ${vatField} as the net total times the rate, rounded once per rate.`, `/Faktura/Fa/${vatField}`));
    }
  }
}

/**
 * The split of a payment across rates (art. 106f ust. 1 pkt 3 of the VAT Act, as the Ministry's FA(3)
 * examples 10-18 apply it): each rate gets the payment x its gross / the order's gross, rounded to the
 * grosz; its tax is that share x rate / (100 + rate), rounded; its net is the rest. Rows are
 * [rate, net, tax-or-null]. Returns Map field -> amount, or null when a row cannot be placed.
 */
export function splitPayment(paid, rows) {
  const gross = new Map();
  for (const [rate, net, tax] of rows) {
    if (!BUCKET[rate] || net === null) return null;
    const g = net + (tax ?? (TAXED(rate) ? net * BUCKET[rate][1] / 100 : 0));
    gross.set(rate, (gross.get(rate) || 0) + g);
  }
  const all = [...gross.values()].reduce((s, g) => s + g, 0);
  if (!gross.size || Math.round(all * 100) === 0) return null;
  const out = new Map();
  const add = (f, v) => out.set(f, (out.get(f) || 0) + v);
  for (const [rate, g] of gross) {
    const share = cents(paid * g / all);
    if (TAXED(rate)) {
      const [netField, pct, vatField] = BUCKET[rate];
      const tax = cents(share * pct / (100 + pct));
      add(netField, share - tax);
      add(vatField, tax);
    } else {
      add(BUCKET[rate][0], share);
    }
  }
  return out;
}

/** ZAL, ROZ, KOR_ZAL, KOR_ROZ: P_13_n and P_14_n against the payment split (PL-023). */
function checkPaymentSplit(fa, kind, out, skipped) {
  const stated = (f) => num(txt(fa, f));
  const advance = kind === "ZAL" || kind === "KOR_ZAL";
  const correction = kind.startsWith("KOR_");
  const rows = advance
    ? kids(child(fa, "Zamowienie"), "ZamowienieWiersz").map((r) => ({ before: txt(r, "StanPrzedZ") === "1", row: [txt(r, "P_12Z"), num(txt(r, "P_11NettoZ")), num(txt(r, "P_11VatZ"))] }))
    : kids(fa, "FaWiersz").map((l) => ({ before: txt(l, "StanPrzed") === "1", row: [txt(l, "P_12"), num(txt(l, "P_11")), num(txt(l, "P_11Vat"))] }));
  const where = advance ? "the order (Zamowienie)" : "the lines";
  const paid = stated("P_15");
  if (paid === null || !rows.length) {
    skipped.push(`P_13_n and P_14_n against the payment split (RodzajFaktury ${kind}: no P_15 or no rows in ${where})`);
    return;
  }
  let expected;
  let basis;
  if (!correction) {
    expected = splitPayment(paid, rows.map((r) => r.row));
    basis = `splitting P_15 (${paid.toFixed(2)}) across the rates of ${where}`;
  } else {
    const was = stated("P_15ZK");
    const pre = rows.filter((r) => r.before).map((r) => r.row);
    const post = rows.filter((r) => !r.before).map((r) => r.row);
    if (was === null || !pre.length || pre.length !== post.length) {
      skipped.push(`P_13_n and P_14_n against the payment split (RodzajFaktury ${kind}: ${was === null ? "no P_15ZK, the amount before the correction" : `${where} are not shown as before (StanPrzed) and after rows, one for one`})`);
      return;
    }
    const a = splitPayment(was + paid, post);
    const b = splitPayment(was, pre);
    if (a && b) {
      expected = new Map(a);
      for (const [f, v] of b) expected.set(f, (expected.get(f) || 0) - v);
    }
    basis = `the split of ${(was + paid).toFixed(2)} after the correction minus the split of P_15ZK (${was.toFixed(2)}) before it, across the rates of ${where}`;
  }
  if (!expected) {
    skipped.push(`P_13_n and P_14_n against the payment split (RodzajFaktury ${kind}: a row in ${where} has no amount or a rate this reader does not place)`);
    return;
  }
  // Two roundings per rate (share, then tax), four on a correction: allow 2 grosze.
  for (const field of [...NET_FIELDS, ...VAT_FIELDS]) {
    const want = expected.get(field) || 0;
    const have = stated(field);
    if (offBy(have || 0, want, 2)) {
      out.push(finding("PL-023", `${field} is ${have === null ? "missing" : have.toFixed(2)} but ${basis} gives ${cents(want).toFixed(2)}.`,
        `On ${advance ? "an advance" : "a settlement"}${correction ? " correction" : ""} invoice P_13_n and P_14_n are the payment split by each rate's share of the gross, tax = share x rate / (100 + rate) (art. 106f of the VAT Act; the Ministry's FA(3) examples 10-18).`,
        `/Faktura/Fa/${field}`));
    }
  }
}

export function looksLikeFa3(text) {
  const head = String(text).slice(0, 4096);
  return /<(?:[A-Za-z0-9_]+:)?Faktura[\s>]/.test(head) && /crd\.gov\.pl\/wzor\//.test(head);
}

/** Polish NIP: 10 digits, weights 6 5 7 2 3 4 5 6 7 mod 11, the remainder is the last digit (10 is never valid). */
export function nipValid(value) {
  if (!/^\d{10}$/.test(value)) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const r = w.reduce((s, k, i) => s + k * Number(value[i]), 0) % 11;
  return r !== 10 && r === Number(value[9]);
}

function checkParty(label, node, path, out, ksefOnly = false) {
  const nip = txt(node, "DaneIdentyfikacyjne", "NIP");
  const prod = ksefOnly ? " KSeF's production environment checks it (the test environment does not)." : "";
  if (nip && !nipValid(nip)) {
    out.push(finding("PL-002", `The ${label}'s NIP fails its check digit.${prod}`,
      `Re-key the ${label}'s NIP from a registration document (10 digits, no PL prefix or dashes).`, `${path}/DaneIdentyfikacyjne/NIP`));
  }
  // Podmiot3's internal id (IDWew) is NIP-nnnnn. The verification page checks the NIP part's
  // check digit; the Ministry's own client (KSeF.Client IdentifierValidators.IsValidInternalId)
  // checks the id's last digit instead. Both are run, each named.
  const idw = txt(node, "DaneIdentyfikacyjne", "IDWew");
  if (ksefOnly && /^\d{10}-\d{5}$/.test(idw)) {
    if (!nipValid(idw.slice(0, 10))) {
      out.push(finding("PL-002", `The NIP inside the ${label}'s internal id (IDWew) fails its check digit.${prod}`,
        "IDWew is the parent taxpayer's NIP, a dash and five digits: re-key the NIP part.", `${path}/DaneIdentyfikacyjne/IDWew`));
    } else if (!internalIdValid(idw)) {
      out.push(finding("PL-002", `The ${label}'s internal id (IDWew) fails its own check digit (the last of the five digits).${prod}`,
        "KSeF issues internal ids with a check digit (weights 1,3,1,3... over the 14 digits before it, sum mod 10); copy the id from KSeF rather than re-keying it.", `${path}/DaneIdentyfikacyjne/IDWew`));
    }
  }
}

/** KSeF internal id NIP-nnnnn: the last digit is the 1,3,1,3... weighted sum of the 14 before it, mod 10 (as KSeF.Client checks it). */
export function internalIdValid(value) {
  if (!/^\d{10}-\d{5}$/.test(value)) return false;
  const d = value.replace("-", "");
  let sum = 0;
  for (let i = 0; i < 14; i++) sum += Number(d[i]) * (i % 2 ? 3 : 1);
  return sum % 10 === Number(d[14]);
}

// KSeF's own acceptance checks beyond the XSD, read from the Ministry of Finance's
// "Weryfikacja faktury" (CIRFMF/ksef-docs, faktury/weryfikacja-faktury.md, dated
// 09.04.2026, read at commit ce3670e). Rules PL-018..PL-022 are this tool's ids.
export const KSEF_MAX_BYTES = 1_000_000;
export const KSEF_MAX_BYTES_WITH_ATTACHMENT = 3_000_000;
// The "discouraged" code points KSeF refuses (XML 1.0 section 2.2), as the document lists them.
const DISCOURAGED = [[0x7f, 0x84], [0x86, 0x9f], [0xfdd0, 0xfdef],
  ...Array.from({ length: 16 }, (_, i) => [(i + 1) * 0x10000 + 0xfffe, (i + 1) * 0x10000 + 0xffff])];
// XML 1.0's Char production: what may appear in a document at all.
export const isXmlChar = (cp) => cp === 9 || cp === 10 || cp === 13 || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);
export const isKsefDiscouraged = (cp) => DISCOURAGED.some(([a, b]) => cp >= a && cp <= b);
const hex = (cp) => "U+" + cp.toString(16).toUpperCase().padStart(4, "0");

/** Today's date in Poland (Europe/Warsaw), yyyy-mm-dd: KSeF compares P_1 with the day it receives the file. */
export function warsawToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The triple KSeF uses to spot a duplicate (error 440): seller NIP, RodzajFaktury, P_2. Null if any is missing. */
export function fa3DuplicateKey(text) {
  const nip = /<(?:[A-Za-z0-9_]+:)?Podmiot1[\s>][\s\S]*?<(?:[A-Za-z0-9_]+:)?NIP>\s*([^<]*?)\s*</.exec(text)?.[1];
  const kind = /<(?:[A-Za-z0-9_]+:)?RodzajFaktury>\s*([^<]*?)\s*</.exec(text)?.[1];
  const nr = /<(?:[A-Za-z0-9_]+:)?P_2>\s*([^<]*?)\s*</.exec(text)?.[1];
  return nip && kind && nr ? `${nip}|${kind}|${nr}` : null;
}

function checkKsefTransport(source, text, root, out) {
  const bytes = typeof source === "string" ? null : source;
  const size = bytes ? bytes.length : new TextEncoder().encode(text).length;
  if (bytes && bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    out.push(finding("PL-018", "The file is UTF-16 (it starts with a UTF-16 byte-order mark); KSeF takes UTF-8 only.",
      "Save the XML as UTF-8 without a byte-order mark.", "/"));
    return;
  }
  if ((bytes && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) || text.charCodeAt(0) === 0xfeff) {
    out.push(finding("PL-018", "The file starts with a UTF-8 byte-order mark (EF BB BF); KSeF rejects a file with one.",
      "Save the XML as UTF-8 without BOM (in most editors: \"UTF-8\", not \"UTF-8 with BOM\"; in .NET, new UTF8Encoding(false)).", "/"));
  }
  if (bytes) {
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch {
      out.push(finding("PL-018", "The file is not valid UTF-8 (a byte sequence does not decode); KSeF takes UTF-8 only.",
        "Re-export the XML as UTF-8; a file saved as Windows-1250 or ISO-8859-2 shows this.", "/"));
    }
  }
  const decl = /^\uFEFF?\s*<\?xml\s[^?]*?encoding\s*=\s*["']([^"']*)["']/.exec(text);
  if (decl && !/^utf-8$/i.test(decl[1])) {
    out.push(finding("PL-018", `The XML declaration names encoding "${decl[1]}"; KSeF accepts a prolog only if it names UTF-8.`,
      "Write the file as UTF-8 and set encoding=\"UTF-8\" in the declaration, or drop the declaration.", "/"));
  }
  // Processing instructions other than the XML declaration (comments and CDATA removed first).
  const bare = text.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const realPis = [...bare.matchAll(/<\?([A-Za-z_:][\w.:-]*)/g)].filter((m, i) => !(m[1] === "xml" && i === 0 && /^\uFEFF?\s*$/.test(bare.slice(0, m.index))));
  if (realPis.length) {
    const names = [...new Set(realPis.map((m) => m[1]))].join(", ");
    out.push(finding("PL-018", `The file holds ${realPis.length} processing instruction${realPis.length > 1 ? "s" : ""} (<?${names} ...?>); KSeF rejects any.`,
      "Remove them (an <?xml-stylesheet?> line is the usual one); only the XML declaration at the very start is allowed.", "/"));
  }
  let count = 0, first = 0, line = 1, firstLine = 0;
  let bad = 0, firstBad = 0, firstBadLine = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === 10) line++;
    else if (!isXmlChar(cp)) { if (!bad) { firstBad = cp; firstBadLine = line; } bad++; }
    else if (isKsefDiscouraged(cp)) { if (!count) { first = cp; firstLine = line; } count++; }
  }
  if (bad) {
    out.push(finding("PL-019", `The file holds ${bad} character${bad > 1 ? "s" : ""} that XML 1.0 does not allow at all (first: ${hex(firstBad)} on line ${firstBadLine}); KSeF cannot parse it.`,
      "Remove them; control characters below U+0020 (other than tab, line feed and carriage return), U+FFFE, U+FFFF and unpaired surrogates usually come from a database field copied raw.", "/"));
  }
  if (count) {
    const mojibake = /[\u00c2\u00c3\u00c4\u00c5\u0139\u0102][\u0080-\u009f]/.test(text);
    out.push(finding("PL-019", `The file holds ${count} character${count > 1 ? "s" : ""} from the ranges KSeF refuses (first: ${hex(first)} on line ${firstLine}).`,
      mojibake
        ? "The text looks double-encoded (UTF-8 read as ISO-8859-2 or Latin-1 and saved again: \"Ĺ\" or \"Ä\" followed by a hidden control character where a Polish letter was). Fix the export's encoding at the source, then re-issue; deleting the hidden characters alone leaves the names garbled."
        : "Remove them; C1 control characters (U+0080-U+009F) usually come from text pasted out of an older system's code page.", "/"));
  }
  const attached = Boolean(child(root, "Zalacznik"));
  const cap = attached ? KSEF_MAX_BYTES_WITH_ATTACHMENT : KSEF_MAX_BYTES;
  if (size > cap) {
    out.push(finding("PL-020", `The file is ${size.toLocaleString("en-US")} bytes; KSeF's cap for an invoice ${attached ? "with" : "without"} an attachment (Zalacznik) is ${cap.toLocaleString("en-US")} bytes.`,
      attached ? "Shorten the attachment's data, or move it out of the invoice." : "Split the invoice, or shorten the line descriptions; the cap is 3,000,000 bytes only with a Zalacznik block.", "/"));
  }
  if (attached) {
    out.push({ ...finding("PL-020", "The invoice has an attachment (Zalacznik): KSeF takes it in a batch session only, and only once the seller has enabled attachments in e-Urząd Skarbowy.",
      "Send it in a batch session, after registering for attachments in e-Urząd Skarbowy; an interactive session refuses it.", "/Faktura/Zalacznik"), severity: "note" });
  }
}

export function checkFa3(source, { today = warsawToday() } = {}) {
  // A UTF-16 file (KSeF refuses it, PL-018) is still decoded as UTF-16 so the rest can be read.
  const utf16 = typeof source !== "string" && source.length >= 2 && ((source[0] === 0xff && source[1] === 0xfe) ? "utf-16le" : (source[0] === 0xfe && source[1] === 0xff) ? "utf-16be" : "");
  const text = typeof source === "string" ? source : new TextDecoder(utf16 || "utf-8").decode(source);
  const tree = parseXmlTree(text);
  const root = tree.children.find((c) => c.name === "Faktura");
  if (!root) throw new Error("Not a FA(3) Faktura document");
  // The schema is the first gate: structure, order, code lists, lengths and patterns (PL-012..PL-017).
  // A bad tax rate keeps its own, more specific PL-004 below rather than the schema's generic PL-015.
  const out = checkAgainstFa3Schema(root, text).filter((f) => !(f.rule === "PL-015" && /\/P_12$/.test(f.path)));
  if (out.some((f) => f.rule === "PL-017")) return { findings: out, skipped: ["every other check (the XML is cut off)"] };
  // INV-065 (2026-11-17): a number or date with a no-break space (xmlvalues.mjs).
  out.push(...xmlValueFindings({ children: [root] }));
  const skipped = [];
  checkKsefTransport(source, text, root, out);
  const head = child(root, "Naglowek");
  const variant = txt(head, "WariantFormularza");
  if (variant !== "3") {
    out.push(finding("PL-001", variant ? `WariantFormularza is ${variant}; this reader handles FA(3) only.` : "WariantFormularza is missing.",
      "Produce the invoice in the FA(3) structure (WariantFormularza 3); KSeF has taken FA(3) since 1 February 2026.", "/Faktura/Naglowek/WariantFormularza"));
  }
  checkParty("seller", child(root, "Podmiot1"), "/Faktura/Podmiot1", out);
  checkParty("buyer", child(root, "Podmiot2"), "/Faktura/Podmiot2", out);
  kids(root, "Podmiot3").forEach((p, i) => checkParty(`third party ${i + 1} (Podmiot3)`, p, `/Faktura/Podmiot3[${i + 1}]`, out, true));
  const pu = child(root, "PodmiotUpowazniony");
  if (pu) checkParty("authorised party (PodmiotUpowazniony)", pu, "/Faktura/PodmiotUpowazniony", out, true);

  const fa = child(root, "Fa");
  if (!fa) {
    out.push(finding("PL-001", "The file has no Fa block.", "Add the Fa block with the invoice number, dates, totals and lines.", "/Faktura"));
    return { findings: out, skipped };
  }
  const issued = txt(fa, "P_1");
  if (/^\d{4}-\d{2}-\d{2}$/.test(issued) && today && issued > today) {
    out.push(finding("PL-021", `The issue date P_1 (${issued}) is after today in Poland (${today}); KSeF refuses an invoice dated later than the day it receives it.`,
      "Set P_1 to the day the invoice is issued, or send it on or after that date.", "/Faktura/Fa/P_1"));
  }
  const currency = txt(fa, "KodWaluty");
  const kind = txt(fa, "RodzajFaktury");
  const lines = kids(fa, "FaWiersz");

  const before = (line) => txt(line, "StanPrzed") === "1";
  // A correction shows a changed line twice, before (StanPrzed) and after, and the Ministry's
  // own example 2 gives both rows the same NrWierszaFa, so a number is unique within each side.
  const seen = new Set();
  lines.forEach((line, i) => {
    const nr = txt(line, "NrWierszaFa");
    const key = `${before(line) ? "before" : "after"}:${nr}`;
    if (nr && seen.has(key)) {
      out.push(finding("PL-009", `Line number ${nr} is used twice.`, "Give each FaWiersz its own NrWierszaFa (a correction's before row, StanPrzed, may repeat its after row's number).", `/Faktura/Fa/FaWiersz[${i + 1}]/NrWierszaFa`));
    }
    seen.add(key);
    const rate = txt(line, "P_12");
    if (rate && !RATES.has(rate)) {
      out.push(finding("PL-004", `Line ${nr || i + 1} has a tax rate (${rate}) that is not in the FA(3) list.`,
        "Use 23, 22, 8, 7, 5, 4, 3, \"0 KR\", \"0 WDT\", \"0 EX\", zw, oo, \"np I\" or \"np II\".", `/Faktura/Fa/FaWiersz[${i + 1}]/P_12`));
    }
    const qty = num(txt(line, "P_8B"));
    const price = num(txt(line, "P_9A"));
    const net = num(txt(line, "P_11"));
    if (qty !== null && price !== null && net !== null) {
      if (txt(line, "P_10")) {
        skipped.push("line amount = quantity x unit price (a line discount, P_10, is present)");
      } else if (offBy(qty * price, net)) {
        out.push(finding("PL-005", `Line ${nr || i + 1}: quantity x unit price is ${cents(qty * price).toFixed(2)} but P_11 says ${net.toFixed(2)}.`,
          "Make P_11 equal P_8B x P_9A to the grosz, or correct the quantity or price.", `/Faktura/Fa/FaWiersz[${i + 1}]/P_11`));
      }
    }
  });

  const order = child(fa, "Zamowienie");
  if (order) checkOrder(order, out);
  const stated = (f) => num(txt(fa, f));
  const anyTotal = [...NET_FIELDS, ...VAT_FIELDS].some((f) => stated(f) !== null);
  // Which way the totals follow from the lines depends on RodzajFaktury (the XSD's notes on P_13_1,
  // P_14_1 and P_15, and the Ministry's 26 FA(3) examples):
  //  VAT, UPR, KOR: P_13_n is the lines' P_11 at that rate (a correction's before rows, StanPrzed, count minus);
  //  ZAL, ROZ:      the payment (or the remainder) P_15 split across the rates in proportion to each rate's
  //                 gross in the order (Zamowienie) or the lines, tax = share x rate / (100 + rate);
  //  KOR_ZAL, KOR_ROZ: that split after the correction (P_15ZK + P_15) minus the split before (P_15ZK).
  if (["VAT", "UPR", "KOR"].includes(kind)) {
    checkLineTotals(fa, lines, kind, before, out, skipped);
  } else if (["ZAL", "ROZ", "KOR_ZAL", "KOR_ROZ"].includes(kind)) {
    checkPaymentSplit(fa, kind, out, skipped);
  } else {
    skipped.push(`totals against lines (RodzajFaktury ${kind || "missing"} is not one this reader models)`);
  }
  // P_15 is the sum of every P_13_n and P_14_n on every kind (for a correction, the sum of the differences).
  const total = stated("P_15");
  if (total !== null && !(kind === "UPR" && !anyTotal)) {
    const expected = cents([...NET_FIELDS, ...VAT_FIELDS].reduce((s, f) => s + (stated(f) || 0), 0));
    if (offBy(expected, total)) {
      out.push(finding("PL-008", `P_15 is ${total.toFixed(2)} but the net and tax totals add up to ${expected.toFixed(2)}.`,
        "Make P_15 the sum of every P_13_n and P_14_n.", "/Faktura/Fa/P_15"));
    }
  } else if (total !== null) {
    skipped.push("P_15 against the totals (a simplified invoice, UPR, that states no P_13_n or P_14_n: the tax is read from the single rate, as the Ministry's example 16 allows)");
  }
  if (currency && currency !== "PLN") {
    for (const f of ["P_14_1", "P_14_2", "P_14_3", "P_14_4"]) {
      if (num(txt(fa, f)) && !txt(fa, `${f}W`)) {
        out.push(finding("PL-011", `The invoice is in ${currency} and states ${f}, but ${f}W (the tax converted to PLN) is missing.`,
          `Add ${f}W with the tax converted at the rate art. 106e(11) of the VAT Act prescribes.`, `/Faktura/Fa/${f}W`));
      }
    }
  }
  return { findings: out, skipped: [...new Set(skipped)] };
}
