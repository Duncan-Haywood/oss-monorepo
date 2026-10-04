// NACHA ACH file validator and control-total repair.
//
// Everything here is plain arithmetic on 94-character fixed-width records. The
// field positions are from memory of the public NACHA file layout (file header
// 1, batch header 5, entry detail 6, addenda 7, batch control 8, file control 9);
// no bank's own validator was available when this was written, so the first
// user report of a file that passes here and is rejected by a bank, or the
// reverse, is the priority fix.
//
// Nothing in this module touches the network or the DOM.

export const RECORD_LENGTH = 94;

const CREDIT_CODES = new Set([22, 23, 24, 32, 33, 34, 42, 43, 44, 52, 53, 54]);
const DEBIT_CODES = new Set([27, 28, 29, 37, 38, 39, 47, 48, 49, 55, 56]);
const PRENOTE_CODES = new Set([23, 28, 33, 38, 43, 48, 53]);
const ZERO_DOLLAR_CODES = new Set([24, 29, 34, 39, 44, 49, 54]);

export const TRANSACTION_CODES = {
  22: "checking credit", 23: "checking credit prenote", 24: "checking zero-dollar credit",
  27: "checking debit", 28: "checking debit prenote", 29: "checking zero-dollar debit",
  32: "savings credit", 33: "savings credit prenote", 34: "savings zero-dollar credit",
  37: "savings debit", 38: "savings debit prenote", 39: "savings zero-dollar debit",
  42: "general ledger credit", 43: "general ledger credit prenote", 44: "general ledger zero-dollar credit",
  47: "general ledger debit", 48: "general ledger debit prenote", 49: "general ledger zero-dollar debit",
  52: "loan credit", 53: "loan credit prenote", 54: "loan zero-dollar credit",
  55: "loan debit (reversal only)", 56: "loan debit prenote",
};

export const SEC_CODES = new Set([
  "PPD", "CCD", "CTX", "WEB", "TEL", "POP", "ARC", "BOC", "RCK", "IAT", "CIE", "TRC", "TRX",
  "XCK", "ENR", "DNE", "MTE", "SHR", "POS", "ACK", "ATX",
]);

const SERVICE_CLASS = { 200: "mixed debits and credits", 220: "credits only", 225: "debits only" };

const num = (s) => (/^\d+$/.test(s) ? Number(s) : NaN);

// 1-indexed, inclusive, the way the layout tables are written.
const f = (line, from, to) => line.slice(from - 1, to);

export function routingCheckDigitOk(nine) {
  if (!/^\d{9}$/.test(nine)) return false;
  const d = [...nine].map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

export function checkDigitFor(eight) {
  for (let d = 0; d <= 9; d++) if (routingCheckDigitOk(eight + d)) return d;
  return null;
}

function parseYymmdd(s) {
  if (!/^\d{6}$/.test(s)) return null;
  const y = 2000 + Number(s.slice(0, 2)), m = Number(s.slice(2, 4)), d = Number(s.slice(4, 6));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

const iso = (dt) => dt.toISOString().slice(0, 10);
const addDays = (dt, n) => new Date(dt.getTime() + n * 86400000);

function nthWeekday(year, month, weekday, n) {
  const first = new Date(Date.UTC(year, month, 1));
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + shift + (n - 1) * 7));
}
function lastWeekday(year, month, weekday) {
  const last = new Date(Date.UTC(year, month + 1, 0));
  return new Date(Date.UTC(year, month, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7)));
}

// Federal Reserve holidays as the ACH operator observes them: a holiday on a
// Sunday moves to Monday, one on a Saturday is *not* moved to Friday.
export function federalReserveHolidays(year) {
  const fixed = [[0, 1, "New Year's Day"], [5, 19, "Juneteenth"], [6, 4, "Independence Day"], [10, 11, "Veterans Day"], [11, 25, "Christmas Day"]];
  const out = new Map();
  for (const [m, d, name] of fixed) {
    const dt = new Date(Date.UTC(year, m, d));
    if (dt.getUTCDay() === 6) continue;
    out.set(iso(dt.getUTCDay() === 0 ? addDays(dt, 1) : dt), name);
  }
  out.set(iso(nthWeekday(year, 0, 1, 3)), "Martin Luther King Jr. Day");
  out.set(iso(nthWeekday(year, 1, 1, 3)), "Washington's Birthday");
  out.set(iso(lastWeekday(year, 4, 1)), "Memorial Day");
  out.set(iso(nthWeekday(year, 8, 1, 1)), "Labor Day");
  out.set(iso(nthWeekday(year, 9, 1, 2)), "Columbus Day");
  out.set(iso(nthWeekday(year, 10, 4, 4)), "Thanksgiving Day");
  return out;
}

export function bankingDayInfo(dt) {
  const day = dt.getUTCDay();
  if (day === 0 || day === 6) return { open: false, reason: day === 0 ? "a Sunday" : "a Saturday" };
  const h = federalReserveHolidays(dt.getUTCFullYear()).get(iso(dt));
  if (h) return { open: false, reason: h };
  // A Saturday January 1 belongs to the next year's list only for the Friday before; not observed.
  return { open: true };
}

export function nextBankingDay(dt) {
  let d = addDays(dt, 1);
  for (let i = 0; i < 10 && !bankingDayInfo(d).open; i++) d = addDays(d, 1);
  return d;
}

export function splitRecords(text) {
  const raw = String(text).replace(/^﻿/, "");
  let lines = raw.split(/\r\n|\n|\r/);
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  // Some banks and tools emit one unbroken string; accept it when it is a whole number of records.
  if (lines.length === 1 && lines[0].length > RECORD_LENGTH && lines[0].length % RECORD_LENGTH === 0) {
    const one = lines[0];
    lines = [];
    for (let i = 0; i < one.length; i += RECORD_LENGTH) lines.push(one.slice(i, i + RECORD_LENGTH));
  }
  return { lines, eol: /\r\n/.test(raw) ? "\r\n" : "\n", unbroken: false };
}

const pad = (n, w) => String(n).padStart(w, "0");
const mask = (acct) => {
  const t = acct.trim();
  return t.length <= 4 ? t : "…" + t.slice(-4);
};
const cents = (n) => "$" + (n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function newFinding(severity, code, line, title, detail) {
  return { severity, code, line, title, detail };
}

export function validate(text, opts = {}) {
  const { lines, eol } = splitRecords(text);
  const findings = [];
  const add = (sev, code, line, title, detail) => findings.push(newFinding(sev, code, line, title, detail));
  const today = opts.today instanceof Date ? opts.today : null;

  const summary = { records: lines.length, batches: 0, entries: 0, addenda: 0, debit: 0, credit: 0, hash: 0, header: null, batchList: [] };
  if (!lines.length) {
    add("error", "EMPTY", 0, "The file is empty", "Paste or choose an ACH file: 94-character records, one per line.");
    return { findings, summary, eol };
  }

  let file = null; // header info
  let batch = null; // current batch
  const batches = [];
  let fileControl = null;
  let afterControl = false;
  let entry = null; // current entry awaiting addenda
  const seenTrace = new Map();
  const seenDup = new Map();
  let padSeen = 0;

  const closeEntry = () => {
    if (entry && entry.indicator === "1" && entry.addenda === 0) {
      add("error", "ADD-MISSING", entry.line, "Entry says an addenda record follows, but none does",
        `The entry for ${entry.name || "this receiver"} has addenda indicator 1 and the next record is not a type 7 addenda. Set the indicator to 0 or add the addenda.`);
    }
    entry = null;
  };

  lines.forEach((line, idx) => {
    const n = idx + 1;
    if (line.length !== RECORD_LENGTH) {
      add("error", "LEN", n, `Record is ${line.length} characters, not ${RECORD_LENGTH}`,
        line.length < RECORD_LENGTH
          ? "A short record is usually a trimmed trailing space (some editors strip it) or a field that lost its padding. Banks reject the file."
          : "A long record usually has an unescaped delimiter or an extra field. Banks reject the file.");
    }
    if (/[^\x20-\x7E]/.test(line)) {
      add("error", "CHARS", n, "Record contains a tab or a non-ASCII character",
        "ACH files are plain printable ASCII. Smart quotes and accented letters from a spreadsheet export are the usual cause.");
    } else if (/[a-z]/.test(line)) {
      add("warning", "CASE", n, "Record contains lowercase letters",
        "The layout is uppercase alphanumeric; many banks reject lowercase in name and description fields. Convert the file to upper case.");
    }
    const type = line[0];

    if (afterControl) {
      if (type === "9" && /^9+$/.test(line)) { padSeen++; return; }
      add("error", "AFTER", n, "Record after the file control record", "Only blocking records made entirely of 9s may follow the file control (type 9) record.");
      return;
    }

    if (!file) {
      if (type !== "1") {
        add("error", "FIRST", n, "The first record is not a file header", `Expected a record starting with 1 but found "${type}". Nothing after this can be read in context.`);
        return;
      }
      const dest = f(line, 4, 13), orig = f(line, 14, 23);
      file = {
        line: n,
        priority: f(line, 2, 3),
        dest, orig,
        created: f(line, 24, 29),
        time: f(line, 30, 33),
        modifier: f(line, 34, 34),
        size: f(line, 35, 37),
        blocking: f(line, 38, 39),
        format: f(line, 40, 40),
        destName: f(line, 41, 63).trim(),
        origName: f(line, 64, 86).trim(),
      };
      summary.header = file;
      if (file.priority !== "01") add("warning", "F-PRIO", n, `Priority code is "${file.priority}", expected 01`, "01 is the only priority code in use.");
      if (!/^ \d{9}$/.test(dest)) {
        add("error", "F-DEST", n, "Immediate destination is not a space plus a 9-digit routing number",
          `Found "${dest}". The receiving bank's routing number goes in positions 4-13 with a leading space.`);
      } else if (!routingCheckDigitOk(dest.trim())) {
        add("error", "F-DEST-CD", n, "Immediate destination routing number fails its check digit", `${dest.trim()} is not a valid ABA routing number.`);
      }
      if (!/^[ 0-9]\d{9}$/.test(orig) && !/^\d{10}$/.test(orig.trim())) {
        add("error", "F-ORIG", n, "Immediate origin is not a 10-digit identifier", `Found "${orig}". Banks assign this: usually a space plus your routing number, or your 10-digit company ID.`);
      }
      const created = parseYymmdd(file.created);
      if (!created) add("error", "F-DATE", n, "File creation date is not a valid YYMMDD date", `Found "${file.created}".`);
      file.createdDate = created;
      if (!/^[A-Z0-9]$/.test(file.modifier)) add("error", "F-MOD", n, "File ID modifier must be A-Z or 0-9", `Found "${file.modifier}". It is what distinguishes two files sent on the same day; a repeated modifier on the same day is a common reason for a duplicate-file rejection.`);
      if (file.size !== "094") add("error", "F-SIZE", n, `Record size is "${file.size}", expected 094`, "Fixed at 094.");
      if (file.blocking !== "10") add("error", "F-BLOCK", n, `Blocking factor is "${file.blocking}", expected 10`, "Fixed at 10: records come in blocks of ten, padded with 9s.");
      if (file.format !== "1") add("error", "F-FORMAT", n, `Format code is "${file.format}", expected 1`, "Fixed at 1.");
      if (!file.destName) add("warning", "F-DESTNAME", n, "Immediate destination name is blank", "Banks usually want the receiving bank's name here.");
      if (!file.origName) add("warning", "F-ORIGNAME", n, "Immediate origin name is blank", "Banks usually want your company name here.");
      return;
    }

    switch (type) {
      case "1":
        add("error", "DUP-HDR", n, "A second file header", "An ACH file has exactly one file header record.");
        return;

      case "5": {
        closeEntry();
        if (batch) add("error", "NEST", n, "Batch header while the previous batch is still open", `The batch starting at line ${batch.line} has no batch control (type 8) record before this.`);
        const b = {
          line: n,
          service: f(line, 2, 4),
          company: f(line, 5, 20).trim(),
          companyId: f(line, 41, 50),
          sec: f(line, 51, 53),
          desc: f(line, 54, 63).trim(),
          effective: f(line, 70, 75),
          settle: f(line, 76, 78),
          status: f(line, 79, 79),
          odfi: f(line, 80, 87),
          number: f(line, 88, 94),
          entries: 0, addenda: 0, debit: 0, credit: 0, hash: 0, debits: 0, credits: 0,
          lastTraceSeq: -1,
        };
        batch = b;
        batches.push(b);
        if (!SERVICE_CLASS[b.service]) add("error", "B-SVC", n, `Service class code "${b.service}" is not 200, 220 or 225`, "200 mixed, 220 credits only, 225 debits only.");
        if (!b.company) add("error", "B-NAME", n, "Company name is blank", "Required: it appears on the receiver's statement.");
        if (!b.companyId.trim()) add("error", "B-CID", n, "Company identification is blank", "Required. Your bank assigns it; it is often a tax ID with a leading digit.");
        if (!SEC_CODES.has(b.sec)) add("error", "B-SEC", n, `Standard entry class "${b.sec}" is not recognised`, "Use PPD for consumer payroll or bill payments, CCD for company-to-company, WEB for online-authorised debits.");
        if (!b.desc) add("error", "B-DESC", n, "Company entry description is blank", "Required: a 10-character purpose such as PAYROLL or INVOICE.");
        if (b.settle.trim()) add("info", "B-SETTLE", n, "Settlement date field is filled in", "The ACH operator fills this in; originators normally leave it blank.");
        if (b.status !== "1") add("warning", "B-STATUS", n, `Originator status code is "${b.status}", expected 1`, "1 is correct for a depository institution's customers.");
        if (!/^\d{8}$/.test(b.odfi)) add("error", "B-ODFI", n, "ODFI identification is not 8 digits", `Found "${b.odfi}". It is the first 8 digits of your bank's routing number.`);
        if (!/^\d{7}$/.test(b.number)) add("error", "B-NUM", n, "Batch number is not 7 digits", `Found "${b.number}".`);
        const eff = parseYymmdd(b.effective);
        b.effectiveDate = eff;
        if (!eff) {
          add("error", "B-EFF", n, "Effective entry date is not a valid YYMMDD date", `Found "${b.effective}".`);
        } else {
          const info = bankingDayInfo(eff);
          if (!info.open) {
            add("warning", "B-EFF-HOL", n, `Effective date ${iso(eff)} is ${info.reason}`,
              `ACH does not settle on weekends or Federal Reserve holidays. Your bank will most likely settle it on ${iso(nextBankingDay(eff))}; if that is a due date, send it earlier.`);
          }
          if (file.createdDate && eff < file.createdDate) {
            add("warning", "B-EFF-OLD", n, `Effective date ${iso(eff)} is before the file was created (${iso(file.createdDate)})`,
              "An effective date in the past is treated as same-day or rejected, depending on the bank and the cut-off time.");
          } else if (today && eff < today) {
            add("warning", "B-EFF-PAST", n, `Effective date ${iso(eff)} has already passed`, "If this is the file you are about to send, the effective date needs to be today or later.");
          }
        }
        return;
      }

      case "6": {
        closeEntry();
        if (!batch) {
          add("error", "ORPHAN-6", n, "Entry detail outside a batch", "A type 6 record must come after a batch header (type 5).");
          return;
        }
        const code = num(f(line, 2, 3));
        const rdfi = f(line, 4, 11), cd = f(line, 12, 12), acct = f(line, 13, 29).trimEnd();
        const amtStr = f(line, 30, 39), amount = num(amtStr);
        const name = f(line, 55, 76).trim();
        const disc = f(line, 77, 78), ind = f(line, 79, 79), trace = f(line, 80, 94);
        entry = { line: n, name, indicator: ind, addenda: 0, trace, seq: num(f(trace, 9, 15)) };
        batch.entries++;
        summary.entries++;
        if (!(code in TRANSACTION_CODES)) {
          add("error", "E-CODE", n, `Transaction code "${f(line, 2, 3)}" is not one this checker knows`, "Valid examples: 22 checking credit, 27 checking debit, 32 savings credit, 37 savings debit.");
        }
        const rd = rdfi + cd;
        if (!/^\d{9}$/.test(rd)) {
          add("error", "E-ROUTE", n, "Receiving routing number is not 9 digits", `Found "${rd}" in positions 4-12.`);
        } else if (!routingCheckDigitOk(rd)) {
          const right = checkDigitFor(rdfi);
          add("error", "E-CHECKDIGIT", n, `Receiving routing number ${rd} fails its check digit`,
            `${name || "This receiver"}: the first 8 digits ${rdfi} would need check digit ${right}. A mistyped routing number is the commonest reason an entry is returned (R03/R04) or sent to the wrong bank. Do not edit the check digit to make it pass; confirm the number with the receiver.`);
        }
        if (/^\d{8}$/.test(rdfi)) batch.hash += Number(rdfi);
        if (!acct.trim()) add("error", "E-ACCT", n, "Receiving account number is blank", `${name || "This entry"} has no account number.`);
        else if (/[^A-Z0-9 \-]/i.test(acct)) add("warning", "E-ACCT-CH", n, "Account number contains unusual characters", `Account ${mask(acct)} has characters other than letters, digits, spaces or hyphens.`);
        if (!Number.isFinite(amount)) {
          add("error", "E-AMT", n, "Amount is not 10 digits", `Found "${amtStr}". The amount is in cents with no decimal point, e.g. 0000012550 for $125.50.`);
        } else {
          const isPrenote = PRENOTE_CODES.has(code), isZero = ZERO_DOLLAR_CODES.has(code);
          if (isPrenote && amount !== 0) add("error", "E-PRENOTE", n, "Prenote with a non-zero amount", `Transaction code ${code} is a prenotification and must carry $0.00; this one carries ${cents(amount)}.`);
          if (!isPrenote && !isZero && code in TRANSACTION_CODES && amount === 0) add("error", "E-ZERO", n, "Live entry with a zero amount", `Transaction code ${code} moves money but the amount is $0.00 for ${name || "this entry"}.`);
          if (isZero) {
            if (amount !== 0) add("error", "E-ZERO-AMT", n, "Zero-dollar entry with a non-zero amount", `Transaction code ${code} must carry $0.00.`);
            if (!["CCD", "CTX"].includes(batch.sec)) add("error", "E-ZERO-SEC", n, "Zero-dollar entry outside a CCD or CTX batch", "Zero-dollar entries are only allowed in CCD and CTX batches, and need an addenda record.");
            if (ind !== "1") add("error", "E-ZERO-ADD", n, "Zero-dollar entry without an addenda record", "A zero-dollar entry exists to carry remittance information, so the addenda indicator must be 1.");
          }
          if (CREDIT_CODES.has(code)) { batch.credit += amount; batch.credits++; summary.credit += amount; }
          if (DEBIT_CODES.has(code)) { batch.debit += amount; batch.debits++; summary.debit += amount; }
          const key = [rdfi, cd, acct.trim(), amount, code, batch.number].join("|");
          if (seenDup.has(key) && amount > 0) {
            add("warning", "E-DUP", n, "Possible duplicate payment",
              `Same routing number, account ${mask(acct)}, amount ${cents(amount)} and transaction code as the entry at line ${seenDup.get(key)} in this batch. Real repeat payments exist, but a double-click or re-run is the usual cause.`);
          } else seenDup.set(key, n);
        }
        if (!name) add("warning", "E-NAME", n, "Receiver name is blank", `Account ${mask(acct)} has no individual or company name. Banks may reject it, and the receiver will not recognise the entry.`);
        if ((batch.sec === "WEB" || batch.sec === "TEL") && !["R ", "S "].includes(disc)) {
          add("warning", "E-PAYTYPE", n, `${batch.sec} entry without a payment type code`, "WEB and TEL entries need R (recurring) or S (single) in the discretionary data field, positions 77-78.");
        }
        if (batch.sec === "IAT") {
          add("info", "E-IAT", n, "IAT entries are only partly checked", "International ACH transactions use a different record layout with seven mandatory addenda. Totals and trace numbers are checked; field-level checks are skipped.");
        }
        if (ind !== "0" && ind !== "1") add("error", "E-IND", n, `Addenda indicator is "${ind}", expected 0 or 1`, "");
        if (!/^\d{15}$/.test(trace)) {
          add("error", "E-TRACE", n, "Trace number is not 15 digits", `Found "${trace}".`);
        } else {
          if (/^\d{8}$/.test(batch.odfi) && trace.slice(0, 8) !== batch.odfi) {
            add("error", "E-TRACE-ODFI", n, "Trace number does not start with the batch's ODFI identification",
              `Trace ${trace} should begin ${batch.odfi} (your bank), as in the batch header. Banks reject entries whose trace prefix is not their own.`);
          }
          const prev = seenTrace.get(trace);
          if (prev && prev.batch === batch) add("error", "E-TRACE-DUP", n, "Trace number repeats within the batch", `Same trace as line ${prev.line}. Every entry in a batch needs its own trace number.`);
          else if (prev) add("warning", "E-TRACE-DUP-FILE", n, "Trace number repeats across batches", `Same trace as line ${prev.line} in an earlier batch. Many banks want trace numbers unique across the whole file; numbering straight on from the previous batch avoids the question.`);
          else seenTrace.set(trace, { line: n, batch });
          if (entry.seq <= batch.lastTraceSeq) {
            add("warning", "E-TRACE-ORDER", n, "Trace numbers are not ascending within the batch", `Sequence ${pad(entry.seq, 7)} follows ${pad(batch.lastTraceSeq, 7)}. Entries are normally numbered in order.`);
          }
          batch.lastTraceSeq = entry.seq;
        }
        return;
      }

      case "7": {
        if (!batch || !entry) {
          add("error", "ORPHAN-7", n, "Addenda record without an entry", "A type 7 record must directly follow an entry detail (type 6) or another addenda for it.");
          return;
        }
        batch.addenda++;
        summary.addenda++;
        entry.addenda++;
        const typeCode = f(line, 2, 3), seq = num(f(line, 84, 87)), detSeq = num(f(line, 88, 94));
        if (typeCode !== "05") add("error", "A-TYPE", n, `Addenda type code is "${typeCode}", expected 05`, "05 is the standard addenda; IAT and returns use other codes in their own record layouts.");
        if (entry.indicator !== "1") add("error", "A-IND", n, "Addenda follows an entry whose indicator is 0", "Set the addenda indicator (position 79) of the entry to 1, or remove the addenda.");
        if (seq !== entry.addenda) add("error", "A-SEQ", n, `Addenda sequence number is ${f(line, 84, 87)}, expected ${pad(entry.addenda, 4)}`, "Addenda are numbered 0001, 0002, … for each entry.");
        if (detSeq !== entry.seq) add("error", "A-LINK", n, "Addenda does not point back to its entry", `It carries entry detail sequence ${f(line, 88, 94)} but the entry's trace ends in ${pad(entry.seq, 7)}.`);
        const max = batch.sec === "CTX" ? 9999 : batch.sec === "IAT" ? 12 : 1;
        if (entry.addenda > max) add("error", "A-MAX", n, `More than ${max} addenda for one ${batch.sec} entry`, "PPD and CCD entries take at most one addenda record.");
        return;
      }

      case "8": {
        closeEntry();
        if (!batch) {
          add("error", "ORPHAN-8", n, "Batch control without a batch header", "");
          return;
        }
        const c = {
          line: n,
          service: f(line, 2, 4),
          count: num(f(line, 5, 10)),
          hash: num(f(line, 11, 20)),
          debit: num(f(line, 21, 32)),
          credit: num(f(line, 33, 44)),
          companyId: f(line, 45, 54),
          odfi: f(line, 80, 87),
          number: f(line, 88, 94),
        };
        batch.control = c;
        const expectCount = batch.entries + batch.addenda;
        const expectHash = batch.hash % 10 ** 10;
        if (c.count !== expectCount) add("error", "C-COUNT", n, `Batch entry/addenda count is ${f(line, 5, 10)}, the batch has ${expectCount}`, `Batch starting at line ${batch.line}: ${batch.entries} entries plus ${batch.addenda} addenda.`);
        if (c.hash !== expectHash) add("error", "C-HASH", n, `Batch entry hash is ${f(line, 11, 20)}, should be ${pad(expectHash, 10)}`, `Batch starting at line ${batch.line}: the sum of the 8-digit receiving routing numbers, right-most 10 digits.`);
        if (c.debit !== batch.debit) add("error", "C-DEBIT", n, `Batch total debits are ${cents(c.debit)}, the entries add to ${cents(batch.debit)}`, `Batch starting at line ${batch.line}.`);
        if (c.credit !== batch.credit) add("error", "C-CREDIT", n, `Batch total credits are ${cents(c.credit)}, the entries add to ${cents(batch.credit)}`, `Batch starting at line ${batch.line}.`);
        if (c.service !== batch.service) add("error", "C-SVC", n, "Batch control service class differs from the batch header", `Header ${batch.service}, control ${c.service}.`);
        if (c.companyId !== batch.companyId) add("error", "C-CID", n, "Batch control company identification differs from the header", `Header "${batch.companyId.trim()}", control "${c.companyId.trim()}".`);
        if (c.odfi !== batch.odfi) add("error", "C-ODFI", n, "Batch control ODFI identification differs from the header", `Header ${batch.odfi}, control ${c.odfi}.`);
        if (c.number !== batch.number) add("error", "C-NUM", n, "Batch control batch number differs from the header", `Header ${batch.number}, control ${c.number}.`);
        if (batch.service === "220" && batch.debits > 0) add("error", "B-220", batch.line, "Credits-only batch (220) contains debit entries", `${batch.debits} debit entr${batch.debits === 1 ? "y" : "ies"}. Change the service class to 200 or move the debits to their own batch.`);
        if (batch.service === "225" && batch.credits > 0) add("error", "B-225", batch.line, "Debits-only batch (225) contains credit entries", `${batch.credits} credit entr${batch.credits === 1 ? "y" : "ies"}. Change the service class to 200 or move the credits to their own batch.`);
        if (batch.entries === 0) add("warning", "B-EMPTY", batch.line, "Batch has no entries", "Banks reject empty batches.");
        summary.batchList.push({
          line: batch.line, service: batch.service, company: batch.company, sec: batch.sec, desc: batch.desc,
          effective: batch.effectiveDate ? iso(batch.effectiveDate) : batch.effective,
          entries: batch.entries, addenda: batch.addenda, debit: batch.debit, credit: batch.credit,
        });
        summary.hash += batch.hash;
        batch = null;
        return;
      }

      case "9": {
        closeEntry();
        if (batch) {
          add("error", "UNCLOSED", batch.line, "Batch has no batch control record", `The batch starting at line ${batch.line} is open when the file control arrives.`);
          batch = null;
        }
        fileControl = {
          line: n,
          batches: num(f(line, 2, 7)),
          blocks: num(f(line, 8, 13)),
          count: num(f(line, 14, 21)),
          hash: num(f(line, 22, 31)),
          debit: num(f(line, 32, 43)),
          credit: num(f(line, 44, 55)),
        };
        afterControl = true;
        return;
      }

      default:
        add("error", "TYPE", n, `Record type "${type}" is not a valid ACH record type`, "Record types are 1, 5, 6, 7, 8 and 9. A stray header row or a trailing summary line from a spreadsheet export is the usual cause.");
    }
  });

  closeEntry();
  if (batch) add("error", "UNCLOSED", batch.line, "Batch has no batch control record", "The file ends before the batch is closed.");
  if (file && !fileControl) add("error", "NO-9", lines.length, "The file has no file control record", "The last real record must be a type 9 file control, followed by 9-padding to a multiple of 10 records.");

  summary.batches = batches.length;
  if (fileControl) {
    const totalRecords = lines.length;
    const blocks = Math.ceil(totalRecords / 10);
    const entryCount = batches.reduce((a, b) => a + b.entries + b.addenda, 0);
    const hash = batches.reduce((a, b) => a + b.hash, 0) % 10 ** 10;
    const debit = batches.reduce((a, b) => a + b.debit, 0), credit = batches.reduce((a, b) => a + b.credit, 0);
    const L = fileControl.line;
    if (fileControl.batches !== batches.length) add("error", "T-BATCH", L, `File control batch count is ${fileControl.batches}, the file has ${batches.length}`, "");
    if (fileControl.count !== entryCount) add("error", "T-COUNT", L, `File control entry/addenda count is ${fileControl.count}, the file has ${entryCount}`, "");
    if (fileControl.hash !== hash) add("error", "T-HASH", L, `File control entry hash is ${pad(fileControl.hash, 10)}, should be ${pad(hash, 10)}`, "Sum of every batch's entry hash, right-most 10 digits.");
    if (fileControl.debit !== debit) add("error", "T-DEBIT", L, `File control total debits are ${cents(fileControl.debit)}, the batches add to ${cents(debit)}`, "");
    if (fileControl.credit !== credit) add("error", "T-CREDIT", L, `File control total credits are ${cents(fileControl.credit)}, the batches add to ${cents(credit)}`, "");
    if (totalRecords % 10 !== 0) {
      add("error", "T-PAD", totalRecords, `The file has ${totalRecords} records, not a multiple of 10`, `Add ${10 - (totalRecords % 10)} blocking record(s) of 94 nines after the file control. "Fix control totals" does this for you.`);
    }
    if (fileControl.blocks !== blocks) add("error", "T-BLOCKS", L, `File control block count is ${fileControl.blocks}, the file has ${blocks} block${blocks === 1 ? "" : "s"}`, `${totalRecords} records / 10, rounded up.`);
  }

  if (summary.debit !== summary.credit && batches.length) {
    const diff = summary.debit - summary.credit;
    add("info", "BALANCE", 0, `Debits and credits differ by ${cents(Math.abs(diff))}`,
      diff > 0
        ? "More is being pulled than paid out. Normal for a collections file; the credit side is your settlement account."
        : "More is being paid out than collected. Normal for payroll and vendor payments: your bank will debit your account for the difference unless an offsetting entry is in the file.");
  }
  if (batches.length && !findings.some((x) => x.severity === "error")) {
    add("info", "CLEAN", 0, "No structural errors found", "The file's structure, control totals and routing check digits are consistent. That is not the same as bank acceptance: your bank also checks that your company ID, limits and account standing are in order.");
  }
  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.line - b.line);
  return { findings, summary, eol };
}

// Rebuild the batch control, file control and blocking records from the entries.
// Entry fields are never edited: a wrong routing number or amount is a payment
// decision, not a typo.
export function repair(text) {
  const { lines, eol } = splitRecords(text);
  const changes = [];
  if (!lines.length || lines[0][0] !== "1") return { text: null, changes, error: "The file does not start with a file header record, so the controls cannot be rebuilt." };

  const out = [];
  let batch = null;
  let batchCount = 0, entryCount = 0, fileHash = 0, fileDebit = 0, fileCredit = 0;
  let sawControl = false;

  const emitBatchControl = (original, header) => {
    const count = batch.entries + batch.addenda;
    const hash = pad(batch.hash % 10 ** 10, 10);
    const built = "8" + header.slice(1, 4) + pad(count, 6) + hash + pad(batch.debit, 12) + pad(batch.credit, 12) +
      header.slice(40, 50) + " ".repeat(19) + " ".repeat(6) + header.slice(79, 87) + header.slice(87, 94);
    const old = original ?? "";
    if (old !== built) {
      const parts = [];
      const o = (a, b) => f(old, a, b), nn = (a, b) => f(built, a, b);
      if (o(5, 10) !== nn(5, 10)) parts.push(`count ${o(5, 10) || "(missing)"} → ${nn(5, 10)}`);
      if (o(11, 20) !== nn(11, 20)) parts.push(`hash ${o(11, 20) || "(missing)"} → ${nn(11, 20)}`);
      if (o(21, 32) !== nn(21, 32)) parts.push(`debits ${o(21, 32) || "(missing)"} → ${nn(21, 32)}`);
      if (o(33, 44) !== nn(33, 44)) parts.push(`credits ${o(33, 44) || "(missing)"} → ${nn(33, 44)}`);
      if (!parts.length) parts.push("record rebuilt (service class, company ID, ODFI or batch number matched to the header)");
      changes.push(`Batch ${header.slice(87, 94)} control: ${parts.join("; ")}`);
    }
    out.push(built);
    batchCount++;
    entryCount += count;
    fileHash += batch.hash;
    fileDebit += batch.debit;
    fileCredit += batch.credit;
    batch = null;
  };

  let i = 0;
  out.push(lines[0]);
  i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i], type = line[0];
    if (type === "5") {
      if (batch) emitBatchControl(null, batch.header);
      batch = { header: line.padEnd(RECORD_LENGTH, " ").slice(0, RECORD_LENGTH), entries: 0, addenda: 0, hash: 0, debit: 0, credit: 0 };
      out.push(line);
    } else if (type === "6" && batch) {
      const code = num(f(line, 2, 3)), rdfi = f(line, 4, 11), amount = num(f(line, 30, 39));
      batch.entries++;
      if (/^\d{8}$/.test(rdfi)) batch.hash += Number(rdfi);
      if (Number.isFinite(amount)) {
        if (CREDIT_CODES.has(code)) batch.credit += amount;
        if (DEBIT_CODES.has(code)) batch.debit += amount;
      }
      out.push(line);
    } else if (type === "7" && batch) {
      batch.addenda++;
      out.push(line);
    } else if (type === "8" && batch) {
      emitBatchControl(line, batch.header);
    } else if (type === "9") {
      sawControl = true;
      if (batch) emitBatchControl(null, batch.header);
      break;
    } else {
      return { text: null, changes, error: `Line ${i + 1} is not in a place the controls can be rebuilt around (record type "${type}"). Fix the structure first, then rebuild the totals.` };
    }
  }
  if (batch) emitBatchControl(null, batch.header);
  if (!sawControl) changes.push("File control record was missing and has been added");

  const bodyRecords = out.length + 1;
  const blocks = Math.ceil(bodyRecords / 10);
  const built = "9" + pad(batchCount, 6) + pad(blocks, 6) + pad(entryCount, 8) + pad(fileHash % 10 ** 10, 10) + pad(fileDebit, 12) + pad(fileCredit, 12) + " ".repeat(39);
  const old = sawControl ? lines[i] : "";
  if (sawControl && old !== built) {
    const parts = [];
    const spans = [["batches", 2, 7], ["blocks", 8, 13], ["entries", 14, 21], ["hash", 22, 31], ["debits", 32, 43], ["credits", 44, 55]];
    for (const [label, a, b] of spans) if (f(old, a, b) !== f(built, a, b)) parts.push(`${label} ${f(old, a, b)} → ${f(built, a, b)}`);
    changes.push(`File control: ${parts.join("; ") || "record rebuilt"}`);
  }
  out.push(built);
  const existingPad = sawControl ? lines.slice(i + 1).filter((l) => /^9+$/.test(l) && l.length === RECORD_LENGTH).length : 0;
  let padCount = 0;
  while (out.length % 10 !== 0) { out.push("9".repeat(RECORD_LENGTH)); padCount++; }
  if (padCount !== existingPad) changes.push(`Blocking records: ${existingPad} → ${padCount} (file is now ${out.length} records, ${out.length / 10} block${out.length === 10 ? "" : "s"})`);
  return { text: out.join(eol) + eol, changes, error: null };
}

// --- builders: used for the worked examples and by the tests ---------------

const rpad = (s, w) => String(s).slice(0, w).padEnd(w, " ");

export function buildFile({ destination, origin, destName, origName, created, time = "0930", modifier = "A", batches }) {
  const rec = [];
  rec.push("1" + "01" + " " + destination + rpad(origin, 10) + created + time + modifier + "094" + "10" + "1" + rpad(destName, 23) + rpad(origName, 23) + rpad("", 8));
  const totals = { batches: 0, count: 0, hash: 0, debit: 0, credit: 0 };
  let seq = 0;
  batches.forEach((b, bi) => {
    const number = pad(bi + 1, 7);
    const odfi = b.odfi;
    rec.push("5" + b.service + rpad(b.company, 16) + rpad("", 20) + rpad(b.companyId, 10) + b.sec + rpad(b.desc, 10) + rpad("", 6) + b.effective + "   " + "1" + odfi + number);
    let hash = 0, debit = 0, credit = 0, count = 0;
    for (const e of b.entries) {
      seq++;
      const rdfi = e.routing.slice(0, 8);
      const trace = odfi + pad(seq, 7);
      rec.push("6" + e.code + e.routing + rpad(e.account, 17) + pad(e.cents, 10) + rpad(e.id || "", 15) + rpad(e.name, 22) + rpad(e.disc || "", 2) + (e.addenda ? "1" : "0") + trace);
      count++;
      hash += Number(rdfi);
      if (CREDIT_CODES.has(Number(e.code))) credit += e.cents;
      if (DEBIT_CODES.has(Number(e.code))) debit += e.cents;
      if (e.addenda) {
        rec.push("7" + "05" + rpad(e.addenda, 80) + "0001" + pad(seq, 7));
        count++;
      }
    }
    rec.push("8" + b.service + pad(count, 6) + pad(hash % 10 ** 10, 10) + pad(debit, 12) + pad(credit, 12) + rpad(b.companyId, 10) + rpad("", 19) + rpad("", 6) + odfi + number);
    totals.batches++; totals.count += count; totals.hash += hash; totals.debit += debit; totals.credit += credit;
  });
  const blocks = Math.ceil((rec.length + 1) / 10);
  rec.push("9" + pad(totals.batches, 6) + pad(blocks, 6) + pad(totals.count, 8) + pad(totals.hash % 10 ** 10, 10) + pad(totals.debit, 12) + pad(totals.credit, 12) + rpad("", 39));
  while (rec.length % 10 !== 0) rec.push("9".repeat(RECORD_LENGTH));
  return rec.join("\n") + "\n";
}

const withCd = (eight) => eight + checkDigitFor(eight);

export function sampleFile() {
  const odfi = "12345678";
  return buildFile({
    destination: withCd(odfi), origin: " " + withCd(odfi), destName: "SAMPLE BANK", origName: "EXAMPLE FOODS LLC",
    created: "261001",
    batches: [
      {
        service: "220", company: "EXAMPLE FOODS", companyId: "1234567890", sec: "PPD", desc: "PAYROLL", effective: "261009", odfi,
        entries: [
          { code: "22", routing: withCd("23456780"), account: "100200301", cents: 184250, name: "AVA SAMPLE", id: "E1001" },
          { code: "22", routing: withCd("34567890"), account: "400500602", cents: 152075, name: "BEN EXAMPLE", id: "E1002" },
          { code: "32", routing: withCd("45678901"), account: "700800903", cents: 96310, name: "CY DEMO", id: "E1003" },
        ],
      },
      {
        service: "225", company: "EXAMPLE FOODS", companyId: "1234567890", sec: "CCD", desc: "INVOICE", effective: "261009", odfi,
        entries: [
          { code: "27", routing: withCd("56789012"), account: "55501234", cents: 640000, name: "NORTHSIDE CAFE LLC", id: "INV-7781", addenda: "RMR*IV*INV-7781**6400.00~" },
          { code: "27", routing: withCd("67890123"), account: "66602345", cents: 215500, name: "HARBOR DELI INC", id: "INV-7782" },
        ],
      },
    ],
  });
}

// The sample with the faults a hand-edited or spreadsheet-exported file usually has.
export function sampleBrokenFile() {
  const lines = sampleFile().split("\n");
  // 1. bump an amount without touching the controls
  lines[2] = lines[2].slice(0, 29) + "0000185250" + lines[2].slice(39);
  // 2. mistype a routing digit
  lines[3] = lines[3].slice(0, 5) + "9" + lines[3].slice(6);
  // 3. strip trailing spaces from one record
  lines[0] = lines[0].trimEnd();
  // 4. effective date on a Saturday
  lines[1] = lines[1].slice(0, 69) + "261010" + lines[1].slice(75);
  // 5. drop the blocking records
  return lines.slice(0, 12).join("\n") + "\n";
}

export function maskedFindingsCsv(result) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["severity", "code", "line", "title", "detail"].join(",")];
  for (const x of result.findings) rows.push([x.severity, x.code, x.line || "", q(x.title), q(x.detail)].join(","));
  return rows.join("\n") + "\n";
}

export { cents, iso };

export function decodeBuffer(buf) {
  // ACH files are ASCII; latin1 never throws and keeps stray high bytes visible so they get reported.
  return new TextDecoder("latin1").decode(buf);
}
