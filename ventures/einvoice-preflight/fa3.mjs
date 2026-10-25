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
const cents = (n) => Math.round(n * 100) / 100;
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

function checkParty(label, node, path, out) {
  const nip = txt(node, "DaneIdentyfikacyjne", "NIP");
  if (nip && !nipValid(nip)) {
    out.push(finding("PL-002", `The ${label}'s NIP fails its check digit.`,
      `Re-key the ${label}'s NIP from a registration document (10 digits, no PL prefix or dashes).`, `${path}/DaneIdentyfikacyjne/NIP`));
  }
}

export function checkFa3(source) {
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  const tree = parseXmlTree(text);
  const root = tree.children.find((c) => c.name === "Faktura");
  if (!root) throw new Error("Not a FA(3) Faktura document");
  // The schema is the first gate: structure, order, code lists, lengths and patterns (PL-012..PL-017).
  // A bad tax rate keeps its own, more specific PL-004 below rather than the schema's generic PL-015.
  const out = checkAgainstFa3Schema(root, text).filter((f) => !(f.rule === "PL-015" && /\/P_12$/.test(f.path)));
  if (out.some((f) => f.rule === "PL-017")) return { findings: out, skipped: ["every other check (the XML is cut off)"] };
  const skipped = [];
  const head = child(root, "Naglowek");
  const variant = txt(head, "WariantFormularza");
  if (variant !== "3") {
    out.push(finding("PL-001", variant ? `WariantFormularza is ${variant}; this reader handles FA(3) only.` : "WariantFormularza is missing.",
      "Produce the invoice in the FA(3) structure (WariantFormularza 3); KSeF has taken FA(3) since 1 February 2026.", "/Faktura/Naglowek/WariantFormularza"));
  }
  checkParty("seller", child(root, "Podmiot1"), "/Faktura/Podmiot1", out);
  checkParty("buyer", child(root, "Podmiot2"), "/Faktura/Podmiot2", out);

  const fa = child(root, "Fa");
  if (!fa) {
    out.push(finding("PL-001", "The file has no Fa block.", "Add the Fa block with the invoice number, dates, totals and lines.", "/Faktura"));
    return { findings: out, skipped };
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
