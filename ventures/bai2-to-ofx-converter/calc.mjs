// BAI2 bank statement reader, validator and converter to OFX/QBO, QIF and Xero CSV.
// (The reader half is the same code as ventures/bai2-statement-reader; the converters are at the end.)
//
// BAI2 is the comma-delimited cash-management file banks send to treasury and
// accounting systems: 01 file header, 02 group header, 03 account identifier
// (with balances), 16 transaction detail, 88 continuation, 49 account trailer,
// 98 group trailer, 99 file trailer. Amounts are integer cents with no decimal.
//
// The layout and the type-code table below are from memory of the public BAI
// cash management format; no bank's own validator was available when this was
// written. The one place banks differ in practice is what the 49 account
// control total includes, so the validator accepts any of the four common
// conventions and says which matched. The first user report of a file that
// passes here and is refused by a system, or the reverse, is the priority fix.
//
// Nothing in this module touches the network or the DOM.

const num = (s) => (/^-?\d+$/.test(s) ? Number(s) : NaN);
const pad = (n, w) => String(n).padStart(w, "0");
const cents = (n) => (n < 0 ? "-" : "") + "$" + (Math.abs(n) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mask = (a) => { const t = String(a).trim(); return t.length <= 4 ? t : "…" + t.slice(-4); };

// A selection of common type codes. Unlisted codes fall back to their range.
export const TYPE_CODES = {
  10: "Opening ledger", 11: "Average opening ledger, month to date", 15: "Closing ledger",
  40: "Opening available", 45: "Closing available", 72: "One-day float", 74: "Two or more days float",
  100: "Total credits", 108: "Credit", 115: "Lockbox deposit", 142: "ACH credit received",
  165: "Preauthorized ACH credit", 174: "Other deposit", 175: "Check deposit", 195: "Incoming money transfer",
  399: "Miscellaneous credit", 400: "Total debits", 451: "ACH debit received", 455: "Preauthorized ACH debit",
  475: "Check paid", 495: "Outgoing money transfer", 698: "Miscellaneous fee", 699: "Miscellaneous debit",
};

export function typeKind(code) {
  if (code >= 10 && code <= 99) return "status";
  if (code >= 100 && code <= 399) return "credit";
  if (code >= 400 && code <= 699) return "debit";
  if (code >= 700 && code <= 799) return "loan";
  return "other";
}
export const typeName = (code) => TYPE_CODES[code] || ({ status: "Balance / status", credit: "Credit", debit: "Debit", loan: "Loan activity", other: "Other" })[typeKind(code)] + ` (code ${pad(code, 3)})`;

function validDate(s) {
  if (!/^\d{6}$/.test(s)) return false;
  const y = 2000 + Number(s.slice(0, 2)), m = Number(s.slice(2, 4)), d = Number(s.slice(4, 6));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const fmtDate = (s) => (validDate(s) ? `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}` : s);
const validTime = (s) => /^\d{4}$/.test(s) && (Number(s) === 2400 || (Number(s.slice(0, 2)) < 24 && Number(s.slice(2)) < 60));

// Funds-type extra fields: S has three, V has two, D has a count then pairs.
function fundsExtra(fields, i) {
  const t = fields[i];
  if (t === "S") return 4;
  if (t === "V") return 3;
  if (t === "D") { const k = Number(fields[i + 1]); return Number.isFinite(k) ? 2 + 2 * k : 2; }
  return 1;
}

export function splitRecords(text) {
  let raw = String(text).replace(/^﻿/, "");
  let lines = raw.split(/\r\n|\n|\r/).map((l) => l.trim()).filter((l) => l.length);
  // A file delivered as one unbroken string: cut after each slash that precedes a record code.
  if (lines.length === 1 && /\/\s*(01|02|03|16|49|88|98|99),/.test(lines[0])) {
    lines = lines[0].split(/\/\s*(?=(?:01|02|03|16|49|88|98|99),)/).map((l) => (l.endsWith("/") ? l : l + "/"));
  }
  return { lines, eol: /\r\n/.test(raw) ? "\r\n" : "\n" };
}

function newFinding(severity, code, line, title, detail) { return { severity, code, line, title, detail }; }

export function validate(text, opts = {}) {
  const { lines, eol } = splitRecords(text);
  const findings = [];
  const add = (sev, code, line, title, detail) => findings.push(newFinding(sev, code, line, title, detail));
  const summary = { records: lines.length, groups: 0, accounts: 0, transactions: 0, credit: 0, debit: 0, header: null, accountList: [] };
  if (!lines.length) {
    add("error", "EMPTY", 0, "The file is empty", "Paste or choose a BAI2 file: comma-separated records beginning 01, 02, 03, 16, 49, 98 and 99.");
    return { findings, summary, eol, parsed: [] };
  }

  // Join 88 continuations onto the record before them; each physical line still counts as a record.
  const logical = []; // { code, line, fields, physical }
  lines.forEach((l, idx) => {
    const n = idx + 1;
    const code = l.slice(0, 2);
    if (!/^\d{2},/.test(l) && !/^\d{2}\/?$/.test(l)) {
      add("error", "FORMAT", n, "Line does not look like a BAI2 record", `Expected a two-digit record code and a comma at the start, found "${l.slice(0, 12)}". Wrapped lines should begin with 88.`);
      return;
    }
    if (/[^\x20-\x7E]/.test(l)) add("warning", "CHARS", n, "Record contains a non-ASCII character", "BAI2 is plain printable ASCII. Accented letters or smart quotes in text fields are the usual cause.");
    if (code === "88" && logical.length) {
      const prev = logical[logical.length - 1];
      prev.body = prev.body.replace(/\/$/, "") + "," + l.slice(3).replace(/\/$/, "");
      prev.physical++;
      prev.continued = true;
      prev.endsWithSlash = l.endsWith("/");
      return;
    }
    logical.push({ code, line: n, body: l.replace(/\/$/, ""), physical: 1, endsWithSlash: l.endsWith("/") });
  });
  for (const r of logical) {
    r.fields = r.body.split(",");
    if (!r.endsWithSlash) add("error", "SLASH", r.line, `Record ${r.code} has no closing slash`, "Every BAI2 record ends with a slash. A missing one makes the next system read the following line as part of this record.");
  }

  // Walk the structure.
  let file = null, group = null, account = null;
  let fileDone = false;
  const groups = [];
  let fileTrailer = null;
  const physicalCount = (from, to) => logical.slice(from, to + 1).reduce((s, r) => s + r.physical, 0);
  const idxOf = new Map(logical.map((r, i) => [r, i]));

  const closeAccountMissing = (r, why) => {
    if (account) {
      add("error", "NO-49", account.rec.line, "Account has no account trailer (49)", `${why} Account ${mask(account.number)} was opened here and never closed.`);
      account = null;
    }
  };

  for (const r of logical) {
    const fl = r.fields;
    if (!file && r.code !== "01") {
      add("error", "FIRST", r.line, "The first record is not a file header (01)", `Found record ${r.code}. Everything after this cannot be read in context.`);
      break;
    }
    if (fileDone) {
      add("error", "AFTER", r.line, "Record after the file trailer (99)", "Nothing but the end of the file may follow record 99.");
      continue;
    }
    switch (r.code) {
      case "01": {
        if (file) { add("error", "DUP-01", r.line, "A second file header (01)", "A BAI2 file has one 01 record at the top. Two files were probably pasted together."); break; }
        file = { rec: r, sender: fl[1] || "", receiver: fl[2] || "", created: fl[3] || "", time: fl[4] || "", fileId: fl[5] || "", version: fl[8] || "" };
        if (fl.length < 9) add("warning", "01-FIELDS", r.line, "File header has fewer than the 8 usual fields", "Expected sender, receiver, creation date, time, file ID, record length, block size and version number.");
        if (!file.sender) add("error", "01-SENDER", r.line, "File header has no sender ID", "Field 2 identifies the bank that sent the file; receiving systems match on it.");
        if (!file.receiver) add("error", "01-RECEIVER", r.line, "File header has no receiver ID", "Field 3 identifies your company or system; receiving systems match on it.");
        if (!validDate(file.created)) add("error", "01-DATE", r.line, `File creation date "${file.created}" is not a valid YYMMDD date`, "Field 4 is YYMMDD, for example 261003.");
        if (file.time && !validTime(file.time)) add("error", "01-TIME", r.line, `File creation time "${file.time}" is not HHMM`, "Field 5 is a 24-hour time such as 0930.");
        if (file.version && file.version !== "2") add("warning", "01-VERSION", r.line, `Version number is ${file.version}, not 2`, "BAI2 files carry version 2. A different value is accepted by some readers and rejected by others.");
        summary.header = { sender: file.sender, receiver: file.receiver, created: fmtDate(file.created), fileId: file.fileId };
        break;
      }
      case "02": {
        if (group) { add("error", "NO-98", group.rec.line, "Group has no group trailer (98)", "A new group header starts before the previous group closed."); closeAccountMissing(r, "A new group began."); }
        closeAccountMissing(r, "A group header appeared before the account closed.");
        group = { rec: r, receiver: fl[1] || "", originator: fl[2] || "", status: fl[3] || "", asOf: fl[4] || "", asOfTime: fl[5] || "", currency: fl[6] || "", modifier: fl[7] || "", accounts: [], idx: idxOf.get(r) };
        if (!/^[1-4]$/.test(group.status)) add("warning", "02-STATUS", r.line, `Group status "${group.status}" is not 1 to 4`, "Field 4 is 1 update, 2 deletion, 3 correction or 4 test-only. Anything else may be read as an unknown status.");
        if (!validDate(group.asOf)) add("error", "02-DATE", r.line, `As-of date "${group.asOf}" is not a valid YYMMDD date`, "Field 5 is the statement date. Without it a reader cannot date the transactions.");
        if (group.asOfTime && !validTime(group.asOfTime)) add("error", "02-TIME", r.line, `As-of time "${group.asOfTime}" is not HHMM`, "Field 6 is a 24-hour time, or blank.");
        if (group.currency && !/^[A-Z]{3}$/.test(group.currency)) add("warning", "02-CCY", r.line, `Currency "${group.currency}" is not a 3-letter code`, "Field 7 is an ISO currency code such as USD. Blank means the bank's default.");
        groups.push(group);
        summary.groups++;
        break;
      }
      case "03": {
        if (!group) { add("error", "03-ORPHAN", r.line, "Account identifier (03) outside a group", "An 03 record must follow an 02 group header."); break; }
        closeAccountMissing(r, "A new account began.");
        account = { rec: r, number: fl[1] || "", currency: fl[2] || group.currency || "", statuses: [], summaries: [], txns: [], sumStatus: 0, sumSummary: 0, sumDetail: 0, group, idx: idxOf.get(r) };
        if (!account.number) add("error", "03-ACCT", r.line, "Account number is blank", "Field 2 of the 03 record is the account the following lines belong to.");
        let i = 3;
        while (i < fl.length) {
          const tc = fl[i], rawAmt = fl[i + 1] ?? "", cnt = fl[i + 2] ?? "";
          if (tc === "" && rawAmt === "" && cnt === "" && i >= fl.length - 3) break;
          const code = num(tc);
          if (!/^\d{3}$/.test(tc)) {
            add("error", "03-TYPE", r.line, `Account summary type code "${tc}" is not three digits`, "Balance and summary entries come in groups of type code, amount, item count and funds type. A stray comma shifts every group after it.");
            break;
          }
          const amt = rawAmt === "" ? 0 : num(rawAmt);
          if (rawAmt !== "" && Number.isNaN(amt)) add("error", "03-AMT", r.line, `Amount "${rawAmt}" for code ${tc} is not a whole number of cents`, "BAI2 amounts have no decimal point: 1250.00 is written 125000.");
          const step = 3 + fundsExtra(fl, i + 3);
          const entry = { code, kind: typeKind(code), name: typeName(code), amount: Number.isNaN(amt) ? 0 : amt, count: cnt === "" ? null : Number(cnt) };
          if (entry.kind === "status") { account.statuses.push(entry); account.sumStatus += entry.amount; } else { account.summaries.push(entry); account.sumSummary += entry.amount; }
          i += step;
        }
        summary.accounts++;
        break;
      }
      case "16": {
        if (!account) { add("error", "16-ORPHAN", r.line, "Transaction detail (16) outside an account", "A 16 record must follow an 03 account record and come before its 49 trailer."); break; }
        const tc = fl[1] || "", rawAmt = fl[2] ?? "";
        const code = num(tc);
        if (!/^\d{3}$/.test(tc)) add("error", "16-TYPE", r.line, `Transaction type code "${tc}" is not three digits`, "Field 2 of a 16 record is a three-digit BAI type code such as 195 or 475.");
        const amt = num(rawAmt);
        if (Number.isNaN(amt)) add("error", "16-AMT", r.line, `Amount "${rawAmt}" is not a whole number of cents`, "BAI2 amounts have no decimal point: 1250.00 is written 125000. Check for a stray comma or decimal.");
        else if (amt < 0) add("warning", "16-NEG", r.line, "Transaction amount is negative", "Detail amounts are unsigned; the type code says credit or debit. A minus sign can make a reader flip it.");
        const kind = typeKind(code);
        if (kind === "status") add("warning", "16-STATUS", r.line, `Code ${tc} is a balance code, not a transaction`, "Codes 010 to 099 belong in the 03 record; a transaction using one will not be classed as a credit or debit.");
        const fi = 3, ft = fl[fi] ?? "";
        const next = fi + fundsExtra(fl, fi);
        const bankRef = fl[next] ?? "", custRef = fl[next + 1] ?? "";
        const textVal = fl.slice(next + 2).join(",");
        const amount = Number.isNaN(amt) ? 0 : Math.abs(amt);
        const tx = { line: r.line, account: account.number, date: group.asOf, type: code, kind, name: typeName(code), amount, signed: kind === "debit" ? -amount : kind === "credit" ? amount : 0, fundsType: ft, bankRef, custRef, text: textVal };
        account.txns.push(tx);
        account.sumDetail += Number.isNaN(amt) ? 0 : amt;
        summary.transactions++;
        if (kind === "credit") summary.credit += amount; else if (kind === "debit") summary.debit += amount;
        break;
      }
      case "49": {
        if (!account) { add("error", "49-ORPHAN", r.line, "Account trailer (49) without an account", "A 49 record closes the account opened by the previous 03."); break; }
        const declared = num(fl[1] ?? ""), declaredCount = num(fl[2] ?? "");
        const actualCount = physicalCount(account.idx, idxOf.get(r));
        const D = account.sumDetail, M = account.sumSummary, S = account.sumStatus;
        const options = { "detail only": D, "summaries and detail": D + M, "everything including balances": D + M + S, "balances and detail": D + S };
        const matched = Number.isNaN(declared) ? null : Object.entries(options).find(([, v]) => v === declared);
        if (Number.isNaN(declared)) add("error", "49-TOTAL", r.line, "Account control total is not a number", "Field 2 of the 49 record is the sum of the account's amounts, in cents.");
        else if (!matched) add("error", "49-SUM", r.line, `Account control total ${cents(declared)} matches none of the usual sums`, `For ${mask(account.number)} the amounts add to ${cents(D)} for transactions alone, ${cents(D + M)} with the summary lines, ${cents(D + M + S)} with balances too. A hand-edited amount or a deleted transaction leaves the trailer behind.`);
        if (Number.isNaN(declaredCount)) add("error", "49-COUNT", r.line, "Account record count is not a number", "Field 3 of the 49 record is the number of records in the account, 03 and 49 included.");
        else if (declaredCount !== actualCount) add("error", "49-RECORDS", r.line, `Account trailer says ${declaredCount} records, the account has ${actualCount}`, "The count includes the 03 record, every 16, every 88 continuation and the 49 itself. A deleted or wrapped line is the usual cause.");
        account.declared = Number.isNaN(declared) ? 0 : declared;
        account.convention = matched ? matched[0] : null;
        account.trailer = r;
        // Balance roll-forward: opening ledger + net detail = closing ledger.
        const open = account.statuses.find((s) => s.code === 10), close = account.statuses.find((s) => s.code === 15);
        if (open && close && account.txns.length && !account.txns.some((t) => t.kind === "other" || t.kind === "loan" || t.kind === "status")) {
          const net = account.txns.reduce((s, t) => s + t.signed, 0);
          if (open.amount + net !== close.amount) add("warning", "ROLL", account.rec.line, `Opening ledger plus transactions is ${cents(open.amount + net)}, closing ledger says ${cents(close.amount)}`, `Opening ${cents(open.amount)} + net activity ${cents(net)} should equal the closing ledger for ${mask(account.number)}. Pending items and bank adjustments can explain a gap, a missing or edited transaction can too.`);
        }
        // Possible duplicate: same credit amount and same bank reference twice.
        const seen = new Map();
        for (const t of account.txns) {
          if (!t.bankRef) continue;
          const k = `${t.type}|${t.amount}|${t.bankRef}`;
          if (seen.has(k)) add("warning", "DUP", t.line, "Possible duplicate transaction", `Line ${seen.get(k)} has the same type, amount and bank reference ${t.bankRef}. Check it is not posted twice.`);
          else seen.set(k, t.line);
        }
        summary.accountList.push({ number: account.number, masked: mask(account.number), currency: account.currency, date: group.asOf, line: account.rec.line, txns: account.txns, statuses: account.statuses, summaries: account.summaries, count: account.txns.length, credit: account.txns.filter((t) => t.kind === "credit").reduce((s, t) => s + t.amount, 0), debit: account.txns.filter((t) => t.kind === "debit").reduce((s, t) => s + t.amount, 0), declared: account.declared, convention: account.convention });
        group.accounts.push(account);
        account = null;
        break;
      }
      case "98": {
        closeAccountMissing(r, "The group closed.");
        if (!group) { add("error", "98-ORPHAN", r.line, "Group trailer (98) without a group", "A 98 record closes the group opened by the previous 02."); break; }
        const declared = num(fl[1] ?? ""), nAcc = num(fl[2] ?? ""), nRec = num(fl[3] ?? "");
        const sum49 = group.accounts.reduce((s, a) => s + a.declared, 0);
        const actualCount = physicalCount(group.idx, idxOf.get(r));
        if (Number.isNaN(declared) || declared !== sum49) add("error", "98-SUM", r.line, `Group control total ${Number.isNaN(declared) ? fl[1] : cents(declared)} is not the sum of the account totals, ${cents(sum49)}`, "The 98 total is the sum of every 49 account control total in the group. An account total was edited or an account was removed.");
        if (nAcc !== group.accounts.length) add("error", "98-ACCTS", r.line, `Group trailer says ${fl[2]} accounts, the group has ${group.accounts.length}`, "Field 3 of the 98 record counts the 03/49 account blocks in the group.");
        if (nRec !== actualCount) add("error", "98-RECORDS", r.line, `Group trailer says ${fl[3]} records, the group has ${actualCount}`, "The count includes the 02 and 98 records and everything between them.");
        group.declared = Number.isNaN(declared) ? 0 : declared;
        group.trailer = r;
        group.closed = true;
        group = null;
        break;
      }
      case "99": {
        closeAccountMissing(r, "The file closed.");
        if (group) { add("error", "NO-98", group.rec.line, "Group has no group trailer (98)", "The file trailer appeared before this group closed."); group = null; }
        const declared = num(fl[1] ?? ""), nGrp = num(fl[2] ?? ""), nRec = num(fl[3] ?? "");
        const closed = groups.filter((g) => g.closed);
        const sum98 = closed.reduce((s, g) => s + g.declared, 0);
        const actualCount = physicalCount(0, idxOf.get(r));
        if (Number.isNaN(declared) || declared !== sum98) add("error", "99-SUM", r.line, `File control total ${Number.isNaN(declared) ? fl[1] : cents(declared)} is not the sum of the group totals, ${cents(sum98)}`, "The 99 total is the sum of every 98 group control total.");
        if (nGrp !== groups.length) add("error", "99-GROUPS", r.line, `File trailer says ${fl[2]} groups, the file has ${groups.length}`, "Field 3 of the 99 record counts the 02/98 groups.");
        if (nRec !== actualCount) add("error", "99-RECORDS", r.line, `File trailer says ${fl[3]} records, the file has ${actualCount}`, "The count is every line in the file, 01 and 99 included, 88 continuations too.");
        fileTrailer = r;
        fileDone = true;
        break;
      }
      default:
        add("error", "UNKNOWN", r.line, `Unknown record code ${r.code}`, "BAI2 uses 01, 02, 03, 16, 49, 88, 98 and 99. Lockbox and other variants are not read here.");
    }
  }
  if (file && !fileDone) {
    closeAccountMissing(logical[logical.length - 1], "The file ended.");
    if (group) add("error", "NO-98", group.rec.line, "Group has no group trailer (98)", "The file ended before this group closed.");
    add("error", "NO-99", logical.length ? logical[logical.length - 1].line : 0, "File has no file trailer (99)", "The last record should be 99. A truncated download or a partly pasted file is the usual cause.");
  }
  if (file && !groups.length) add("error", "NO-GROUPS", file.rec.line, "File has a header but no groups", "Expected an 02 group header after the 01 record.");

  const hasErrors = findings.some((f) => f.severity === "error");
  if (!hasErrors && !findings.length) add("info", "CLEAN", 0, "No structural problems found", "Every trailer matches the records it closes. This does not mean your accounting system will accept the file.");
  findings.sort((a, b) => (a.line || 0) - (b.line || 0));
  summary.transactionList = groups.flatMap((g) => g.accounts.flatMap((a) => a.txns));
  return { findings, summary, eol, parsed: logical };
}

// Rebuild the 49, 98 and 99 trailers from the records. Never touches a 03 or 16 amount.
export function repair(text) {
  const res = validate(text);
  const { parsed, eol } = res;
  if (!parsed.length || parsed[0].code !== "01") return { text: null, changes: [], error: "A file header (01) is needed before trailers can be rebuilt." };
  // Which 49 convention does the file use? The one most accounts already follow; default to summaries + detail.
  const votes = {};
  for (const g of res.summary.accountList) if (g.convention) votes[g.convention] = (votes[g.convention] || 0) + 1;
  const convention = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0] || "summaries and detail";

  const out = [];
  const changes = [];
  const recs = parsed;
  const emit = (code, line, newBody, was) => {
    const body = newBody + "/";
    out.push(body);
    if (was !== body) changes.push(`Line ${line}: ${code} trailer rewritten as ${body}`);
  };
  let accountsInGroup = 0, groupTotal = 0, groupStartCount = 0, acctStartCount = 0, acctD = 0, acctM = 0, acctS = 0;
  let groupsInFile = 0, fileTotal = 0;
  let count = 0;
  for (const r of recs) {
    const raw = r.body + (r.endsWithSlash ? "/" : "");
    // Physical lines: re-split the logical body onto its original lines is lossy, so keep logical records whole when they were continued.
    if (r.code === "49") {
      const recordsInAccount = count - acctStartCount + 1;
      const total = convention === "detail only" ? acctD : convention === "everything including balances" ? acctD + acctM + acctS : convention === "balances and detail" ? acctD + acctS : acctD + acctM;
      emit("49", r.line, `49,${total},${recordsInAccount}`, raw);
      count++; groupTotal += total; accountsInGroup++;
      continue;
    }
    if (r.code === "98") {
      const recordsInGroup = count - groupStartCount + 1;
      emit("98", r.line, `98,${groupTotal},${accountsInGroup},${recordsInGroup}`, raw);
      count++; fileTotal += groupTotal; groupsInFile++;
      continue;
    }
    if (r.code === "99") {
      emit("99", r.line, `99,${fileTotal},${groupsInFile},${count + 1}`, raw);
      count++;
      continue;
    }
    if (r.code === "02") { groupStartCount = count; groupTotal = 0; accountsInGroup = 0; }
    if (r.code === "03") {
      acctStartCount = count; acctD = 0; acctM = 0; acctS = 0;
      const fl = r.fields; let k = 3;
      while (k < fl.length && /^\d{3}$/.test(fl[k])) {
        const amt = num(fl[k + 1] ?? "") || 0;
        if (typeKind(Number(fl[k])) === "status") acctS += amt; else acctM += amt;
        k += 3 + fundsExtra(fl, k + 3);
      }
    }
    if (r.code === "16") { const a = num(r.fields[2] ?? ""); if (!Number.isNaN(a)) acctD += a; }
    out.push(raw.endsWith("/") ? raw : raw + "/");
    count += r.physical;
  }
  // A continued record is written back on one line; that is still valid BAI2 but the physical count changed.
  const continued = recs.some((r) => r.physical > 1);
  const note = continued ? "Wrapped (88) records were joined onto one line, so record counts were recomputed for the joined file." : null;
  if (continued) {
    // Recompute counts for the joined layout: every logical record is now one line.
    return rebuildJoined(recs, convention, eol, note);
  }
  return { text: out.join(eol) + eol, changes, error: null, convention };
}

function rebuildJoined(recs, convention, eol, note) {
  const out = [];
  const changes = [note];
  let n = 0, aStart = 0, gStart = 0, aD = 0, aM = 0, aS = 0, gTotal = 0, gAcc = 0, fTotal = 0, fGrp = 0;
  const tot = () => (convention === "detail only" ? aD : convention === "everything including balances" ? aD + aM + aS : convention === "balances and detail" ? aD + aS : aD + aM);
  for (const r of recs) {
    const body = r.body.replace(/\/$/, "");
    if (r.code === "49") { const t = tot(); out.push(`49,${t},${n - aStart + 1}/`); n++; gTotal += t; gAcc++; continue; }
    if (r.code === "98") { out.push(`98,${gTotal},${gAcc},${n - gStart + 1}/`); n++; fTotal += gTotal; fGrp++; continue; }
    if (r.code === "99") { out.push(`99,${fTotal},${fGrp},${n + 1}/`); n++; continue; }
    if (r.code === "02") { gStart = n; gTotal = 0; gAcc = 0; }
    if (r.code === "03") {
      aStart = n; aD = 0; aM = 0; aS = 0;
      const fl = r.fields; let k = 3;
      while (k < fl.length && /^\d{3}$/.test(fl[k])) {
        const amt = num(fl[k + 1] ?? "") || 0;
        if (typeKind(Number(fl[k])) === "status") aS += amt; else aM += amt;
        k += 3 + fundsExtra(fl, k + 3);
      }
    }
    if (r.code === "16") { const a = num(r.fields[2] ?? ""); if (!Number.isNaN(a)) aD += a; }
    out.push(body + "/");
    n++;
  }
  return { text: out.join(eol) + eol, changes: changes.concat([`Account, group and file trailers (49, 98, 99) rebuilt using the "${convention}" convention.`]), error: null, convention };
}

function csvCell(v) { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

export function transactionsCsv(result) {
  const head = ["account", "date", "type_code", "description", "direction", "amount", "bank_reference", "customer_reference", "text"];
  const rows = result.summary.transactionList.map((t) => [mask(t.account), fmtDate(t.date), pad(t.type, 3), t.name, t.kind, (t.signed / 100).toFixed(2), t.bankRef, t.custRef, t.text]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export function maskedFindingsCsv(result) {
  const rows = [["severity", "code", "line", "title", "detail"], ...result.findings.map((f) => [f.severity, f.code, f.line, f.title, f.detail])];
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

// Build a file from accounts; trailers are computed so the result is valid under the "summaries and detail" convention.
export function buildFile({ sender = "123456789", receiver = "ACMEGARAGE", created = "261003", time = "0600", fileId = "1", groups }) {
  const L = [];
  let n = 0;
  const push = (s) => { L.push(s); n++; };
  push(`01,${sender},${receiver},${created},${time},${fileId},,,2/`);
  let fileTotal = 0;
  for (const g of groups) {
    const gStart = n;
    push(`02,${receiver},${sender},1,${g.date},${g.time || "2359"},${g.currency || "USD"},/`);
    let gTotal = 0;
    for (const a of g.accounts) {
      const aStart = n;
      const statuses = a.statuses.map(([c, amt]) => `${pad(c, 3)},${amt},,`).join(",");
      const sums = (a.summaries || []).map(([c, amt, cnt]) => `${pad(c, 3)},${amt},${cnt ?? ""},`).join(",");
      push(`03,${a.number},${g.currency || "USD"},${[statuses, sums].filter(Boolean).join(",")}/`);
      let total = (a.summaries || []).reduce((s, x) => s + x[1], 0);
      for (const t of a.txns) {
        push(`16,${pad(t[0], 3)},${t[1]},,${t[2] || ""},${t[3] || ""},${t[4] || ""}/`);
        total += t[1];
      }
      push(`49,${total},${n - aStart + 1}/`);
      gTotal += total;
    }
    push(`98,${gTotal},${g.accounts.length},${n - gStart + 1}/`);
    fileTotal += gTotal;
  }
  push(`99,${fileTotal},${groups.length},${n + 1}/`);
  return L.join("\n") + "\n";
}

const SAMPLE_GROUP = {
  date: "261002",
  accounts: [
    {
      number: "0001234567",
      statuses: [[10, 1250000], [15, 1541700]],
      summaries: [[100, 810000, 3], [400, 518300, 3]],
      txns: [
        [175, 420000, "DEP48211", "CHK DEPOSIT 4 ITEMS", "MOBILE DEPOSIT"],
        [142, 235000, "ACH77310", "INV 1042", "ACH CREDIT BAYSIDE PROPERTY MGMT"],
        [195, 155000, "FED90021", "WIRE 8812", "INCOMING WIRE HARBOR SUPPLY CO"],
        [475, 190000, "CHK10233", "10233", "CHECK PAID 10233"],
        [451, 128300, "ACH55102", "PAYROLL TAX", "ACH DEBIT IRS USATAXPYMT"],
        [698, 200000, "FEE00112", "", "ACCOUNT ANALYSIS FEE"],
      ],
    },
    {
      number: "0007654321",
      statuses: [[10, 52000], [15, 61500]],
      summaries: [[100, 20000, 1], [400, 10500, 1]],
      txns: [
        [108, 20000, "TRN00418", "", "TRANSFER FROM 1234567"],
        [699, 10500, "TRN00419", "", "TRANSFER TO RESERVE"],
      ],
    },
  ],
};

export function sampleFile() { return buildFile({ groups: [SAMPLE_GROUP] }); }

// A hand-edited version: one amount changed, one transaction deleted, one count left stale.
export function sampleBrokenFile() {
  const ls = sampleFile().split("\n").filter(Boolean);
  const i = ls.findIndex((l) => l.startsWith("16,142,"));
  ls[i] = ls[i].replace("16,142,235000", "16,142,253000");
  const j = ls.findIndex((l) => l.startsWith("16,475,"));
  ls.splice(j, 1);
  const k = ls.findIndex((l) => l.startsWith("16,108,"));
  ls[k] = ls[k].replace(",,TRN00418,", ",,TRN00418,").replace("20000", "20.00");
  return ls.join("\n") + "\n";
}

export { cents, mask, fmtDate };

export function decodeBuffer(buf) {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

// ---------------------------------------------------------------- converters
// One statement per 03/49 account block. OFX has one account and one currency per statement and QuickBooks
// and Quicken import one account per file, so each block is converted on its own.
// BAI2 amounts are whole minor units; two decimal places are assumed, which is right for USD, CAD, EUR, GBP.
export function statementsOf(result) {
  return result.summary.accountList.map((a, i) => {
    const find = (code, alt) => a.statuses.find((s) => s.code === code) || a.statuses.find((s) => s.code === alt) || null;
    const entries = [], skipped = [];
    for (const t of a.txns) (t.kind === "credit" || t.kind === "debit" ? entries : skipped).push(t);
    return { id: `${a.masked}-${a.date}${i ? "-" + (i + 1) : ""}`, account: a.number, currency: (a.currency || "USD").toUpperCase(), date: fmtDate(a.date), opening: find(10, 40), closing: find(15, 45), entries, skipped };
  });
}

const ascii = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "?");
const ofxText = (s) => ascii(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\s+/g, " ").trim();
const ymd = (iso) => iso.replace(/-/g, "");
const dec = (c) => (c / 100).toFixed(2);
const csvText = (s) => { const t = String(s ?? ""); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

function hash36(str) {
  let h = 5381;
  for (const ch of str) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36).toUpperCase().padStart(7, "0");
}

// QuickBooks and Quicken skip an entry whose FITID they hold. The id is therefore a function of the entry itself,
// so converting the same file twice gives the same ids, with a sequence number when two entries are identical.
export function exportEntries(st) {
  const seen = new Map();
  return st.entries.map((t) => {
    const base = hash36([st.account, st.date, t.type, t.amount, t.bankRef, t.custRef, t.text].join("|"));
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const name = ascii(t.text || t.custRef || t.bankRef || t.name).replace(/\s+/g, " ").trim().slice(0, 32) || "Bank entry";
    return { ...t, name, fitid: `${ymd(st.date)}${base}${n > 1 ? "-" + n : ""}` };
  });
}

export function accountId(st, { fullAccount = false } = {}) {
  const a = String(st.account || "").replace(/\s+/g, "");
  if (!a) return "UNKNOWN";
  return fullAccount ? a.slice(-22) : "XXXX" + a.slice(-4);
}

export function toOfx(st, o = {}) {
  const rows = exportEntries(st);
  const now = (o.now || new Date().toISOString()).replace(/[-:T]/g, "").slice(0, 14);
  const type = o.accountType || "checking";
  const card = type === "credit";
  const L = [
    "OFXHEADER:100", "DATA:OFXSGML", "VERSION:102", "SECURITY:NONE", "ENCODING:USASCII", "CHARSET:1252", "COMPRESSION:NONE", "OLDFILEUID:NONE", "NEWFILEUID:NONE", "",
    "<OFX>",
    `<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>${now}<LANGUAGE>ENG<FI><ORG>${ofxText(o.org || "Bank")}<FID>${ofxText(o.fid || "0000")}</FI>${o.intuBid ? `<INTU.BID>${ofxText(o.intuBid)}` : ""}</SONRS></SIGNONMSGSRSV1>`,
    card ? "<CREDITCARDMSGSRSV1><CCSTMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS><CCSTMTRS>" : "<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS><STMTRS>",
    `<CURDEF>${st.currency}`,
    card ? `<CCACCTFROM><ACCTID>${ofxText(accountId(st, o))}</CCACCTFROM>`
      : `<BANKACCTFROM><BANKID>${ofxText(o.bankId || "000000000")}<ACCTID>${ofxText(accountId(st, o))}<ACCTTYPE>${({ savings: "SAVINGS", moneymrkt: "MONEYMRKT" })[type] || "CHECKING"}</BANKACCTFROM>`,
    `<BANKTRANLIST><DTSTART>${ymd(st.date)}120000<DTEND>${ymd(st.date)}120000`,
  ];
  for (const e of rows) {
    const memo = ofxText([e.custRef, e.bankRef].filter(Boolean).join(" "));
    L.push(`<STMTTRN><TRNTYPE>${e.kind === "debit" ? "DEBIT" : "CREDIT"}<DTPOSTED>${ymd(st.date)}120000<TRNAMT>${dec(e.signed)}<FITID>${e.fitid}<NAME>${ofxText(e.name)}${memo ? `<MEMO>${memo.slice(0, 255)}` : ""}</STMTTRN>`);
  }
  L.push("</BANKTRANLIST>");
  if (st.closing) L.push(`<LEDGERBAL><BALAMT>${dec(st.closing.amount)}<DTASOF>${ymd(st.date)}120000</LEDGERBAL>`);
  L.push(card ? "</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1>" : "</STMTRS></STMTTRNRS></BANKMSGSRSV1>", "</OFX>");
  return L.join("\r\n") + "\r\n";
}

export function toQif(st, o = {}) {
  const out = [o.accountType === "credit" ? "!Type:CCard" : "!Type:Bank"];
  const [y, m, d] = st.date.split("-");
  for (const e of exportEntries(st)) {
    out.push(`D${m}/${d}/${y}`, `T${dec(e.signed)}`, `P${e.name}`);
    const memo = ascii([e.custRef, e.bankRef].filter(Boolean).join(" ")).trim();
    if (memo) out.push(`M${memo}`);
    out.push("^");
  }
  return out.join("\r\n") + "\r\n";
}

const xeroDate = (iso, order) => { const [y, m, d] = iso.split("-"); return order === "dmy" ? `${d}/${m}/${y}` : order === "mdy" ? `${m}/${d}/${y}` : iso; };

// Xero's statement import template: *Date, *Amount, Payee, Description, Reference.
export function toXeroCsv(st, o = {}) {
  const rows = [["*Date", "*Amount", "Payee", "Description", "Reference"]];
  for (const e of exportEntries(st)) rows.push([xeroDate(st.date, o.dateOrder || "iso"), dec(e.signed), e.name, ascii(e.text), e.custRef || e.bankRef]);
  return rows.map((r) => r.map(csvText).join(",")).join("\r\n") + "\r\n";
}
