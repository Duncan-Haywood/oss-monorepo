// Offline checks for a Polish KSeF invoice in the FA(3) structure (the national
// schema at http://crd.gov.pl/wzor/2025/06/25/13775/, in force from 1 February
// 2026). FA(3) is not EN 16931, so none of the UBL/CII rules apply to it. Rule
// ids are PL-nnn and are this tool's own, not KSeF error codes. Element names,
// tax-rate codes and the P_13_n / P_14_n meanings were read from the published
// XSD (schemat_FA(3)_v1-0E.xsd); the example in examples/fa3-invoice.xml
// validates against it with xmllint. Sums are only checked on a plain VAT invoice
// (RodzajFaktury VAT or UPR): advance, settlement and correcting invoices carry
// differences and part-amounts this reader does not model, so those checks are
// skipped and named in `skipped`, never counted as a pass. The XSD itself is run
// first from fa3-xsd.mjs (PL-012..PL-017). This is an offline observation, not
// KSeF's acceptance and not tax advice. Findings never repeat a tax number.

import { roundHalfUpToCents } from "./checks.mjs";
import { parseXmlTree } from "./ubl.mjs";
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

  const seen = new Set();
  lines.forEach((line, i) => {
    const nr = txt(line, "NrWierszaFa");
    if (nr && seen.has(nr)) {
      out.push(finding("PL-009", `Line number ${nr} is used twice.`, "Give each FaWiersz its own NrWierszaFa.", `/Faktura/Fa/FaWiersz[${i + 1}]/NrWierszaFa`));
    }
    seen.add(nr);
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
      } else if (Math.abs(cents(qty * price) - net) > TOLERANCE) {
        out.push(finding("PL-005", `Line ${nr || i + 1}: quantity x unit price is ${cents(qty * price).toFixed(2)} but P_11 says ${net.toFixed(2)}.`,
          "Make P_11 equal P_8B x P_9A to the grosz, or correct the quantity or price.", `/Faktura/Fa/FaWiersz[${i + 1}]/P_11`));
      }
    }
  });

  const plain = kind === "VAT" || kind === "UPR";
  if (!plain) {
    skipped.push(`totals against lines (RodzajFaktury ${kind || "missing"}: advance, settlement and correcting invoices carry differences this reader does not model)`);
  } else {
    const sums = new Map();
    let gross = false;
    for (const line of lines) {
      const rate = txt(line, "P_12");
      const net = num(txt(line, "P_11"));
      if (txt(line, "P_11A")) gross = true;
      if (!BUCKET[rate] || net === null) continue;
      sums.set(BUCKET[rate][0], (sums.get(BUCKET[rate][0]) || 0) + net);
    }
    if (gross) {
      skipped.push("P_13_n against lines (a line states a gross value, P_11A)");
    } else if (lines.length) {
      for (const [field, total] of sums) {
        const stated = num(txt(fa, field));
        if (stated === null) {
          out.push(finding("PL-006", `${field} is missing but the lines have ${cents(total).toFixed(2)} at that rate.`,
            `Add ${field} with the sum of those lines' P_11.`, `/Faktura/Fa/${field}`));
        } else if (Math.abs(stated - total) > TOLERANCE) {
          out.push(finding("PL-006", `${field} is ${stated.toFixed(2)} but the lines at that rate add up to ${cents(total).toFixed(2)}.`,
            `Set ${field} to the sum of the lines' P_11 for that rate.`, `/Faktura/Fa/${field}`));
        }
      }
      for (const field of NET_FIELDS) {
        if (!sums.has(field) && num(txt(fa, field)) && !["P_13_4", "P_13_5", "P_13_11"].includes(field)) {
          out.push(finding("PL-006", `${field} states ${txt(fa, field)} but no line carries the matching rate.`,
            "Remove it, or give the lines the rate it totals.", `/Faktura/Fa/${field}`));
        }
      }
    }
    // VAT per rate: stated tax against stated net x the lines' rate (the 23/22 and 8/7 totals take either rate).
    for (const [netField, vatField] of [["P_13_1", "P_14_1"], ["P_13_2", "P_14_2"], ["P_13_3", "P_14_3"]]) {
      const used = new Set(lines.map((l) => txt(l, "P_12")).filter((r) => BUCKET[r] && BUCKET[r][0] === netField));
      const net = num(txt(fa, netField));
      const vat = num(txt(fa, vatField));
      if (used.size !== 1 || net === null || vat === null) continue;
      const pct = BUCKET[[...used][0]][1];
      if (Math.abs(cents(net * pct / 100) - vat) > TOLERANCE) {
        out.push(finding("PL-007", `${vatField} is ${vat.toFixed(2)} but ${pct}% of ${netField} (${net.toFixed(2)}) is ${cents(net * pct / 100).toFixed(2)}.`,
          `Recompute ${vatField} as the net total times the rate, rounded once per rate.`, `/Faktura/Fa/${vatField}`));
      }
    }
    const total = num(txt(fa, "P_15"));
    if (total !== null) {
      const parts = [...NET_FIELDS, ...VAT_FIELDS].map((f) => num(txt(fa, f)) || 0);
      const expected = cents(parts.reduce((s, v) => s + v, 0));
      if (Math.abs(expected - total) > TOLERANCE) {
        out.push(finding("PL-008", `P_15 is ${total.toFixed(2)} but the net and tax totals add up to ${expected.toFixed(2)}.`,
          "Make P_15 the sum of every P_13_n and P_14_n.", "/Faktura/Fa/P_15"));
      }
    }
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
