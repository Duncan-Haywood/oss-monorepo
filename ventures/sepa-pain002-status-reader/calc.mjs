// SEPA pain.002 payment status report reader. Pure functions, no DOM, no network, no dependencies.
//
// A bank answers an uploaded pain.001 / pain.008 file with a pain.002 status report: accepted,
// partly accepted or rejected, per file, per payment block and per transaction, each rejection with a
// terse ISO reason code (AC04, AM04, MD01 ...). This reads that XML with the same small tolerant
// tokenizer as the pain.001 validator, turns every status and reason into plain language with an
// action, totals the rejected amount as exact BigInt decimals, and builds a re-submission worksheet.
// It never edits or re-sends anything.
//
// Amounts are BigInt scaled by 10^6. No floating point is used anywhere in a sum.

export const SCALE = 6;
const SCALE_FACTOR = 10n ** BigInt(SCALE);
export function parseDecimal(str) {
  const s = String(str).trim();
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === "" && (m[2] === undefined || m[2] === ""))) return null;
  const frac = m[2] || "";
  if (frac.length > SCALE) return null;
  return BigInt(m[1] || "0") * SCALE_FACTOR + BigInt((frac + "0".repeat(SCALE)).slice(0, SCALE));
}

export function formatScaled(v, min = 2) {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = (a / SCALE_FACTOR).toString();
  let frac = (a % SCALE_FACTOR).toString().padStart(SCALE, "0").replace(/0+$/, "");
  if (frac.length < min) frac = frac.padEnd(min, "0");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

export function maskIban(iban) {
  const s = String(iban).replace(/\s+/g, "");
  if (s.length <= 8) return "*".repeat(s.length);
  return s.slice(0, 4) + "*".repeat(s.length - 8) + s.slice(-4);
}


const INDEXED = new Set(["OrgnlPmtInfAndSts", "TxInfAndSts", "StsRsnInf", "AddtlInf", "NbOfTxsPerSts", "OrgnlGrpInfAndSts"]);
const NAME_RE = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?/;

export function parseXml(srcIn) {
  const src = String(srcIn);
  const errors = [];
  const nl = [];
  for (let k = 0; k < src.length; k++) if (src.charCodeAt(k) === 10) nl.push(k);
  const lineAt = (pos) => {
    let lo = 0, hi = nl.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (nl[mid] < pos) lo = mid + 1; else hi = mid; }
    return lo + 1;
  };
  const err = (pos, code, title, cause, fix) => { if (errors.length < 25) errors.push({ line: lineAt(pos), code, title, cause, fix }); };

  let i = 0;
  const n = src.length;
  let bom = false;
  if (src.charCodeAt(0) === 0xfeff) { bom = true; i = 1; }
  const doc = { name: "#document", qname: "#document", children: [], parts: [], path: "", attrs: {}, line: 1 };
  const stack = [doc];
  let decl = null, doctype = false;

  const m0 = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.exec(src);
  if (m0) err(m0.index, "WF-CHAR", "Control character in the file", `A control character (code ${m0[0].charCodeAt(0)}) is not allowed anywhere in XML.`, "Delete the character; it is usually a copy and paste or export artefact.");
  const bad = src.indexOf("�");
  if (bad >= 0) err(bad, "WF-ENCODING", "Invalid bytes were replaced when the file was read", "The file is not valid UTF-8 (a replacement character appears). It was probably saved in Windows-1252 or ISO-8859-1.", "Re-export the file as UTF-8, which SEPA requires.");

  function decode(raw, pos) {
    return raw.replace(/&([^;\s<&]*)(;?)/g, (all, name, semi) => {
      if (!semi) { err(pos, "WF-AMP", "Unescaped & in text", "A bare & starts an entity in XML. Names like \"Smith & Sons\" must be written Smith &amp; Sons.", "Replace & with &amp; (or with + for a SEPA-safe character)."); return all; }
      if (name === "amp") return "&";
      if (name === "lt") return "<";
      if (name === "gt") return ">";
      if (name === "quot") return '"';
      if (name === "apos") return "'";
      let m = /^#x([0-9a-fA-F]+)$/.exec(name) || /^#([0-9]+)$/.exec(name);
      if (m) { const cp = parseInt(m[1], name.startsWith("#x") ? 16 : 10); try { return String.fromCodePoint(cp); } catch { /* fall through */ } }
      err(pos, "WF-ENTITY", `Unknown entity &${name};`, "Only &amp; &lt; &gt; &quot; &apos; and numeric references are defined without a DTD.", "Replace it with the character itself or a numeric reference.");
      return all;
    });
  }

  while (i < n) {
    const top = stack[stack.length - 1];
    if (src[i] !== "<") {
      let j = src.indexOf("<", i);
      if (j < 0) j = n;
      const raw = src.slice(i, j);
      if (stack.length === 1) {
        if (raw.trim()) err(i + raw.search(/\S/), "WF-OUTSIDE", "Text outside the root element", "Characters appear before or after the single <Document> element.", "Remove them. A stray character often sits in front of <?xml ...?> or after </Document>.");
      } else {
        top.parts.push(decode(raw, i));
      }
      i = j;
      continue;
    }
    if (src.startsWith("<!--", i)) {
      const e = src.indexOf("-->", i + 4);
      if (e < 0) { err(i, "WF-COMMENT", "Comment is never closed", "A <!-- comment has no closing -->.", "Add -->."); break; }
      i = e + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", i)) {
      const e = src.indexOf("]]>", i + 9);
      if (e < 0) { err(i, "WF-CDATA", "CDATA section is never closed", "A <![CDATA[ section has no closing ]]>.", "Add ]]>."); break; }
      if (stack.length > 1) { top.parts.push(src.slice(i + 9, e)); top.hasCdata = true; }
      i = e + 3;
      continue;
    }
    if (src.startsWith("<?", i)) {
      const e = src.indexOf("?>", i + 2);
      if (e < 0) { err(i, "WF-PI", "Processing instruction is never closed", "A <? has no closing ?>.", "Add ?>."); break; }
      const body = src.slice(i + 2, e);
      if (/^xml(\s|$)/.test(body)) {
        if (i !== (bom ? 1 : 0)) err(i, "WF-DECL-POS", "XML declaration is not at the very start", "<?xml ...?> must be the first thing in the file. Whitespace or a blank line before it makes parsers reject the file.", "Delete everything before <?xml.");
        decl = { version: (/version\s*=\s*["']([^"']*)["']/.exec(body) || [])[1] || null, encoding: (/encoding\s*=\s*["']([^"']*)["']/.exec(body) || [])[1] || null, line: lineAt(i) };
      }
      i = e + 2;
      continue;
    }
    if (src.startsWith("<!DOCTYPE", i) || src.startsWith("<!doctype", i)) {
      doctype = true;
      let depth = 0, j = i + 9;
      for (; j < n; j++) { const c = src[j]; if (c === "[") depth++; else if (c === "]") depth--; else if (c === ">" && depth <= 0) break; }
      err(i, "XML-DOCTYPE", "The file declares a DTD", "Payment files do not use a DTD, banks reject them, and a DTD is how XML entity-expansion attacks are written. This tool ignores it and expands nothing.", "Remove the <!DOCTYPE ...> declaration.");
      i = j + 1;
      continue;
    }
    if (src.startsWith("</", i)) {
      const e = src.indexOf(">", i);
      if (e < 0) { err(i, "WF-TAG", "Closing tag is never finished", "A </ has no closing >.", "Add >."); break; }
      const name = src.slice(i + 2, e).trim();
      let idx = -1;
      for (let k = stack.length - 1; k >= 1; k--) if (stack[k].qname === name) { idx = k; break; }
      if (idx < 0) {
        err(i, "WF-STRAY-CLOSE", `Closing tag </${name}> has no matching opening tag`, "A closing tag appears where nothing of that name is open.", "Delete it or add the missing opening tag.");
      } else {
        while (stack.length - 1 > idx) {
          const lost = stack.pop();
          err(i, "WF-MISMATCH", `<${lost.qname}> opened on line ${lost.line} is closed by </${name}>`, `The element <${lost.qname}> was never closed before </${name}> began.`, `Add </${lost.qname}> where it should end.`);
        }
        const node = stack.pop();
        node.contentEnd = i;
        node.closed = true;
      }
      i = e + 1;
      continue;
    }
    // start tag
    const nm = NAME_RE.exec(src.slice(i + 1, i + 200));
    if (!nm) {
      err(i, "WF-LT", "Unescaped < in text", "A < must start a tag; inside text it has to be written &lt;.", "Replace < with &lt;.");
      i += 1;
      continue;
    }
    const startPos = i;
    let p = i + 1 + nm[0].length;
    const attrs = {};
    let selfClosing = false, ok = true;
    for (;;) {
      while (p < n && /\s/.test(src[p])) p++;
      if (p >= n) { ok = false; err(startPos, "WF-TAG", `Tag <${nm[0]}> is never finished`, "The file ends inside a tag.", "Add >."); break; }
      if (src[p] === ">") { p++; break; }
      if (src[p] === "/" && src[p + 1] === ">") { selfClosing = true; p += 2; break; }
      const an = /^[A-Za-z_:][\w.:-]*/.exec(src.slice(p, p + 100));
      if (!an) { ok = false; err(p, "WF-ATTR", `Malformed attribute in <${nm[0]}>`, `Unexpected character "${src[p]}" inside the tag.`, "Check quotes and spacing."); const e = src.indexOf(">", p); p = e < 0 ? n : e + 1; break; }
      p += an[0].length;
      while (p < n && /\s/.test(src[p])) p++;
      if (src[p] !== "=") { ok = false; err(p, "WF-ATTR", `Attribute ${an[0]} has no value`, "XML attributes are always name=\"value\".", `Write ${an[0]}="..."`); const e = src.indexOf(">", p); p = e < 0 ? n : e + 1; break; }
      p++;
      while (p < n && /\s/.test(src[p])) p++;
      const q = src[p];
      if (q !== '"' && q !== "'") { ok = false; err(p, "WF-ATTR-QUOTE", `Attribute ${an[0]} is not quoted`, "XML attribute values must be in quotes.", `Write ${an[0]}="..."`); const e = src.indexOf(">", p); p = e < 0 ? n : e + 1; break; }
      const e = src.indexOf(q, p + 1);
      if (e < 0) { ok = false; err(p, "WF-ATTR-QUOTE", `Attribute ${an[0]} has no closing quote`, "A quoted value is not closed.", "Add the closing quote."); p = n; break; }
      if (Object.prototype.hasOwnProperty.call(attrs, an[0])) err(p, "WF-ATTR-DUP", `Attribute ${an[0]} appears twice`, "An element cannot repeat an attribute.", "Delete one.");
      attrs[an[0]] = decode(src.slice(p + 1, e), p);
      p = e + 1;
    }
    if (!ok && p >= n) { i = n; continue; }
    const parent = stack[stack.length - 1];
    const local = nm[0].includes(":") ? nm[0].split(":")[1] : nm[0];
    if (stack.length === 1 && parent.children.length >= 1) err(startPos, "WF-ROOTS", "More than one root element", "A well-formed XML document has exactly one root element, <Document>. Two files pasted together look like this.", "Keep one message per file.");
    const idx = parent.children.filter((c) => c.name === local).length + 1;
    const node = {
      name: local, qname: nm[0], attrs, children: [], parent, parts: [], line: lineAt(startPos), selfClosing,
      path: `${parent.path}/${local}${INDEXED.has(local) ? `[${idx}]` : ""}`,
      contentStart: p, contentEnd: selfClosing ? p : null, closed: selfClosing,
    };
    parent.children.push(node);
    if (!selfClosing) stack.push(node);
    i = p;
  }
  while (stack.length > 1) {
    const lost = stack.pop();
    err(n, "WF-UNCLOSED", `<${lost.qname}> opened on line ${lost.line} is never closed`, "The file ends while this element is still open, which usually means it was truncated.", `Add </${lost.qname}> (and any closing tags above it).`);
  }
  if (doc.children.length === 0) err(0, "WF-EMPTY", "No XML element found", "The text contains no XML elements.", "Paste a pain.002 status report.");
  const finish = (node) => {
    node.text = node.parts.join("");
    node.leaf = node.children.length === 0;
    for (const c of node.children) finish(c);
  };
  finish(doc);
  return { root: doc.children[0] || null, errors, decl, doctype, bom, source: src };
}

// ---------------------------------------------------------------------------------------------
// Tree helpers.
// ---------------------------------------------------------------------------------------------

const kid = (n, name) => (n ? n.children.find((c) => c.name === name) : undefined);
const kids = (n, name) => (n ? n.children.filter((c) => c.name === name) : []);
const dig = (n, path) => path.split("/").reduce((x, p) => (x ? kid(x, p) : undefined), n);
const txt = (n) => (n ? n.text.trim() : "");

// ---------------------------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------------------------
export function decodeBufferInfo(buf) {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buf), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(buf), encoding: "windows-1252" };
  }
}
export const decodeBuffer = (buf) => decodeBufferInfo(buf).text;


// ---------------------------------------------------------------------------------------------
// Reference data. Read from memory of the public ISO 20022 external code lists and the EPC rulebooks;
// no bank documentation was available when this was built, and banks add private codes.
// ---------------------------------------------------------------------------------------------

export const STATUS = {
  ACTC: { label: "Accepted, technical validation passed", kind: "ok", note: "The bank can read the file and its checks passed. This is not yet settlement." },
  ACCP: { label: "Accepted, customer profile passed", kind: "ok", note: "Accepted for further processing." },
  ACSP: { label: "Accepted, settlement in process", kind: "ok", note: "The bank has accepted it and is settling it." },
  ACSC: { label: "Accepted, settlement completed", kind: "ok", note: "Settled on the debtor side." },
  ACCR: { label: "Accepted, request to cancel received", kind: "ok", note: "Accepted for processing." },
  ACWC: { label: "Accepted with change", kind: "warn", note: "Accepted, but the bank changed something (a date or an amount). Read the reason." },
  ACWP: { label: "Accepted without posting", kind: "warn", note: "Accepted, but not posted to the account yet." },
  PART: { label: "Partially accepted", kind: "warn", note: "Some payments in the file were accepted and some were not. Check the per-payment lines." },
  PDNG: { label: "Pending", kind: "warn", note: "Not decided yet. A further status report should follow." },
  RCVD: { label: "Received", kind: "warn", note: "The bank has the file and has not checked it yet." },
  RJCT: { label: "Rejected", kind: "bad", note: "Not accepted and not processed." },
};

// code: [name, category, what it usually means, what to do]
export const REASONS = {
  AC01: ["Incorrect account number", "account", "The creditor's account number does not exist or is not the right format.", "Get the IBAN again from the payee and correct it in your master data."],
  AC02: ["Invalid debtor account number", "account", "The account you are paying from is not valid for this payment.", "Check the debtor IBAN in the file against the account you intended, or ask your bank."],
  AC03: ["Invalid creditor account number", "account", "The payee's account number is not valid.", "Get the payee's IBAN again and correct it."],
  AC04: ["Closed account number", "account", "The account has been closed.", "Ask the payee for their new account details."],
  AC05: ["Closed debtor account number", "account", "The account you are paying from is closed.", "Use an open account, or contact your bank."],
  AC06: ["Blocked account", "account", "The account is blocked.", "Contact your bank (debtor side) or the payee (creditor side)."],
  AC07: ["Closed creditor account number", "account", "The payee's account has been closed.", "Ask the payee for new account details."],
  AG01: ["Transaction forbidden", "service", "This kind of payment is not allowed on this account.", "Ask your bank whether the account may make this payment type."],
  AG02: ["Invalid bank operation code", "format", "The payment type or service code is not valid.", "Check the payment method and service level in the file."],
  AM01: ["Zero amount", "amount", "The amount is zero.", "Remove the payment or set the right amount."],
  AM02: ["Amount not allowed", "amount", "The amount is above or outside what the bank or scheme allows.", "Split the payment or check the limit with your bank."],
  AM03: ["Currency not allowed", "amount", "The currency is not supported for this payment.", "SEPA payments are in EUR; check the currency."],
  AM04: ["Insufficient funds", "funds", "There was not enough money on the account.", "Fund the account and send the payment again."],
  AM05: ["Duplication", "duplicate", "The bank saw this payment before.", "Check whether the first one went through before sending it again."],
  AM06: ["Amount too low", "amount", "The amount is below the minimum.", "Check the amount."],
  AM07: ["Blocked amount", "funds", "The amount is blocked or reserved.", "Contact your bank."],
  AM09: ["Wrong amount", "amount", "The amount differs from what was expected.", "Check the amount with the payee."],
  AM10: ["Invalid control sum", "format", "The total in the file does not match the payments.", "Recompute NbOfTxs and CtrlSum, for instance with the pain.001 validator, and resend."],
  BE01: ["Inconsistent with end customer", "account", "The name does not match the account holder.", "Check the payee's name against their account."],
  BE04: ["Missing creditor address", "account", "The payee's address is missing where it is required.", "Add the address."],
  BE05: ["Unrecognised initiating party", "service", "The initiating party is not known to the bank.", "Check the initiating party and your agreement with the bank."],
  CNOR: ["Creditor bank is not registered", "bank", "The payee's bank is not registered for this scheme.", "Ask the payee for another account."],
  DNOR: ["Debtor bank is not registered", "bank", "The payer's bank is not registered for this scheme.", "Contact your bank."],
  DT01: ["Invalid date", "date", "A date in the file is not valid.", "Check the requested execution date; it must be a future banking day."],
  DUPL: ["Duplicate payment", "duplicate", "The bank treats this as a payment it already has.", "Check before sending again."],
  ED05: ["Settlement failed", "bank", "The bank could not settle the payment.", "Ask your bank, then resend."],
  FF01: ["Invalid file format", "format", "The file could not be read in the expected format.", "Run it through the pain.001 validator and check the message version your bank wants."],
  FF05: ["Invalid local instrument code", "format", "The scheme code (CORE, B2B, SCT Inst) is not valid for this account.", "Check the scheme with your bank."],
  FRAD: ["Fraudulent origin", "service", "The payment was stopped on a fraud suspicion.", "Contact your bank."],
  MD01: ["No mandate", "mandate", "No valid mandate exists for this direct debit.", "Check the mandate id and signature date, and do not collect until you have a valid mandate."],
  MD02: ["Mandate data missing or incorrect", "mandate", "Some mandatory mandate information is missing.", "Complete the mandate information in the file."],
  MD06: ["Refund requested by the payer", "mandate", "The payer asked for the money back.", "Contact the payer."],
  MD07: ["End customer deceased", "mandate", "The debtor is deceased.", "Stop collecting and inform whoever manages the case."],
  MS02: ["Reason not specified, given by the customer", "other", "The account holder refused the payment without giving a reason.", "Contact the payer."],
  MS03: ["Reason not specified, given by the bank", "other", "The bank refused it without giving a reason.", "Ask your bank for the reason."],
  NARR: ["Narrative", "other", "The reason is in the free text next to the code.", "Read the additional information."],
  RC01: ["Bank identifier incorrect", "bank", "The BIC is not valid or not recognised.", "Check the BIC, or drop it if the IBAN is enough."],
  RR01: ["Missing debtor account or identification", "account", "Regulatory information about the payer is missing.", "Add the debtor account or identification."],
  RR02: ["Missing debtor name or address", "account", "Regulatory information about the payer is missing.", "Add the debtor name or address."],
  RR03: ["Missing creditor name or address", "account", "Regulatory information about the payee is missing.", "Add the payee name or address."],
  RR04: ["Regulatory reason", "service", "The payment was stopped for a regulatory reason.", "Contact your bank."],
  SL01: ["Specific service offered by the debtor agent", "service", "The debtor's bank has a service that stopped it, for instance a collection block or a limit.", "The payer must ask their bank; contact the payer."],
  TM01: ["Cut-off time", "date", "The file arrived after the cut-off time.", "Send it earlier or move the execution date."],
  TECH: ["Technical problem", "bank", "A technical problem at the bank.", "Resend later and ask your bank if it repeats."],
  UPAY: ["Unduly paid", "other", "The payment is treated as paid by mistake.", "Contact your bank."],
};

export const CATEGORY = {
  account: "Fix the account or name data",
  funds: "Funds or blocked amount",
  mandate: "Mandate problem (direct debit)",
  format: "File format or totals",
  date: "Date or cut-off",
  amount: "Amount or currency",
  duplicate: "Possible duplicate: check before resending",
  service: "Service, limit or compliance with the bank",
  bank: "Bank or scheme registration, or a technical problem",
  other: "Reason not specified",
  unknown: "Code not in this tool's table",
};

// ---------------------------------------------------------------------------------------------
// Tree helpers.
// ---------------------------------------------------------------------------------------------

const digTxt = (n, path) => txt(dig(n, path));
// First descendant by name, depth first. pain.002 versions nest identical leaf names differently.
function find(n, name) {
  if (!n) return undefined;
  for (const c of n.children) { if (c.name === name) return c; const f = find(c, name); if (f) return f; }
  return undefined;
}
const findTxt = (n, name) => txt(find(n, name));

function readReasons(node) {
  const out = [];
  for (const si of kids(node, "StsRsnInf")) {
    const code = digTxt(si, "Rsn/Cd");
    const prop = digTxt(si, "Rsn/Prtry");
    const info = kids(si, "AddtlInf").map(txt).filter(Boolean);
    out.push({ line: si.line, path: si.path, code, prop, info });
  }
  return out;
}

function explain(r) {
  const row = r.code ? REASONS[r.code.toUpperCase()] : null;
  if (row) return { name: row[0], category: row[1], meaning: row[2], action: row[3], known: true };
  if (r.code) return { name: `Code ${r.code}`, category: "unknown", meaning: "This code is not in the table this page carries. Banks add their own codes and the ISO list is long.", action: "Look the code up in your bank's documentation, and read the additional information line.", known: false };
  if (r.prop) return { name: `Bank-specific reason ${r.prop}`, category: "unknown", meaning: "The bank gave a proprietary reason, not an ISO code.", action: "Look it up in your bank's documentation.", known: false };
  return { name: "No reason given", category: "other", meaning: "The report names no reason for this status.", action: "Ask your bank.", known: false };
}

const SEV_ORDER = { error: 0, warning: 1, info: 2 };

// ---------------------------------------------------------------------------------------------
// readReport
// ---------------------------------------------------------------------------------------------

export function readReport(text) {
  const parsed = parseXml(text);
  const findings = [];
  const add = (severity, code, node, title, cause, fix) => findings.push({ severity, code, line: node ? node.line : null, path: node && node.path ? node.path : "", title, cause, fix: fix || "" });
  const summary = { version: null, msgId: "", created: "", originalMsgId: "", originalMsgType: "", groupStatus: "", groupReasons: [], declaredNb: null, declaredSum: null, blocks: [], txs: [], counts: {}, rejectedTotal: 0n, rejectedUnreadable: 0, acceptedCount: 0, rejectedCount: 0, otherCount: 0, byReason: [], byCategory: [] };
  const result = { findings, summary, parseErrors: parsed.errors };

  if (parsed.doctype) add("error", "XML-DTD", null, "A DOCTYPE declaration was found and ignored", "A DTD can define entities that expand into very large text. This reader never expands one.", "Remove the DOCTYPE; a bank status report does not need one.");
  for (const e of parsed.errors) add("error", e.code, { line: e.line, path: "" }, e.title, e.cause, e.fix);
  const root = parsed.root;
  if (!root) return finalize(result);

  const nsAttr = Object.entries(root.attrs).filter(([k]) => k === "xmlns" || k.startsWith("xmlns:")).map(([, v]) => v).join(" ");
  const ver = /xsd:(pain\.002\.\d{3}\.\d{2})/.exec(nsAttr);
  summary.version = ver ? ver[1] : null;
  if (!ver) {
    const other = /xsd:((?:pain|camt)\.\d{3}\.\d{3}\.\d{2})/.exec(nsAttr);
    const isPayment = other && /pain\.00[18]/.test(other[1]);
    add("error", "NS-NOT-PAIN002", root, other ? `This is a ${other[1]} message, not a pain.002 status report` : "The namespace is not a pain.002 status report", isPayment ? "This looks like the payment file you sent, not the bank's answer." : "A payment status report declares urn:iso:std:iso:20022:tech:xsd:pain.002.001.xx.", isPayment ? "Open the file your bank sent back. To check the file you sent, use the SEPA pain.001 validator." : "Use the status report file the bank returned for your upload.");
    return finalize(result);
  }
  const rpt = kid(root, "CstmrPmtStsRpt");
  if (!rpt) { add("error", "STRUCT-NO-RPT", root, "No <CstmrPmtStsRpt> element", "A pain.002 report carries its content under <CstmrPmtStsRpt>.", "Check that this is the whole file."); return finalize(result); }

  const hdr = kid(rpt, "GrpHdr");
  summary.msgId = digTxt(hdr, "MsgId");
  summary.created = digTxt(hdr, "CreDtTm");

  const og = kid(rpt, "OrgnlGrpInfAndSts");
  if (!og) add("warning", "STRUCT-NO-ORGNL", rpt, "No <OrgnlGrpInfAndSts>", "The report does not say which file it answers.", "Match it to your upload by time and name.");
  else {
    summary.originalMsgId = digTxt(og, "OrgnlMsgId");
    summary.originalMsgType = digTxt(og, "OrgnlMsgNmId");
    summary.groupStatus = digTxt(og, "GrpSts");
    summary.groupReasons = readReasons(og).map((r) => ({ ...r, ...explain(r) }));
    const nb = digTxt(og, "OrgnlNbOfTxs"); if (nb) summary.declaredNb = nb;
    const cs = digTxt(og, "OrgnlCtrlSum"); if (cs) summary.declaredSum = cs;
  }

  const txRows = [];
  const pushTx = (tx, block) => {
    const ref = kid(tx, "OrgnlTxRef");
    const amtNode = find(ref, "InstdAmt");
    const cdtrAcct = kid(ref, "CdtrAcct"), dbtrAcct = kid(ref, "DbtrAcct");
    const row = {
      line: tx.line, path: tx.path, block: block ? digTxt(block, "OrgnlPmtInfId") : "",
      statusId: digTxt(tx, "StsId"), e2e: digTxt(tx, "OrgnlEndToEndId"), status: digTxt(tx, "TxSts"),
      reasons: readReasons(tx).map((r) => ({ ...r, ...explain(r) })),
      amount: amtNode ? parseDecimal(amtNode.text.trim()) : null, amountText: amtNode ? amtNode.text.trim() : "", ccy: amtNode ? amtNode.attrs.Ccy || "" : "",
      creditor: findTxt(kid(ref, "Cdtr"), "Nm"), debtor: findTxt(kid(ref, "Dbtr"), "Nm"),
      creditorIban: cdtrAcct ? maskIban(findTxt(cdtrAcct, "IBAN")) : "", debtorIban: dbtrAcct ? maskIban(findTxt(dbtrAcct, "IBAN")) : "",
      execDate: findTxt(ref, "ReqdExctnDt") || findTxt(ref, "ReqdColltnDt"),
    };
    txRows.push(row);
  };
  for (const b of kids(rpt, "OrgnlPmtInfAndSts")) {
    const blk = { line: b.line, id: digTxt(b, "OrgnlPmtInfId"), status: digTxt(b, "PmtInfSts"), reasons: readReasons(b).map((r) => ({ ...r, ...explain(r) })), perStatus: kids(b, "NbOfTxsPerSts").map((p) => ({ nb: digTxt(p, "DtldNbOfTxs"), sum: digTxt(p, "DtldCtrlSum"), status: digTxt(p, "DtldSts") })), txs: 0 };
    for (const t of kids(b, "TxInfAndSts")) { pushTx(t, b); blk.txs++; }
    summary.blocks.push(blk);
  }
  for (const t of kids(rpt, "TxInfAndSts")) pushTx(t, null); // some banks report payments at the top level
  summary.txs = txRows;

  const kindOf = (code) => (STATUS[code] ? STATUS[code].kind : "other");
  const reasonMap = new Map(), catMap = new Map();
  for (const t of txRows) {
    summary.counts[t.status || "(none)"] = (summary.counts[t.status || "(none)"] || 0) + 1;
    const k = kindOf(t.status);
    if (k === "bad") {
      summary.rejectedCount++;
      if (t.amount === null) summary.rejectedUnreadable++; else summary.rejectedTotal += t.amount;
      const r = t.reasons[0] || { code: "", prop: "", name: "No reason given", category: "other" };
      const key = r.code || r.prop || "(none)";
      const e = reasonMap.get(key) || { code: r.code || r.prop || "", name: r.name, category: r.category, count: 0, total: 0n };
      e.count++; if (t.amount) e.total += t.amount; reasonMap.set(key, e);
      const c = catMap.get(r.category) || { category: r.category, label: CATEGORY[r.category], count: 0, total: 0n };
      c.count++; if (t.amount) c.total += t.amount; catMap.set(r.category, c);
    } else if (k === "ok") summary.acceptedCount++; else summary.otherCount++;
  }
  summary.byReason = [...reasonMap.values()].sort((a, b) => b.count - a.count || (a.code < b.code ? -1 : 1));
  summary.byCategory = [...catMap.values()].sort((a, b) => b.count - a.count);

  // ---- Findings ----
  const names = (rs) => rs.map((r) => `${r.code || r.prop || "none"} (${r.name})`).join(", ");
  if (summary.groupStatus) {
    const st = STATUS[summary.groupStatus];
    if (!st) add("warning", "GRP-STATUS-UNKNOWN", og, `Unknown file status ${summary.groupStatus}`, "The code is not one this page knows.", "Read it in your bank's documentation.");
    else if (st.kind === "bad") add("error", "GRP-REJECTED", og, "The whole file was rejected", st.note + (summary.groupReasons.length ? ` Reason: ${names(summary.groupReasons)}.` : " The report gives no reason."), summary.groupReasons.length ? summary.groupReasons[0].action : "Ask your bank for the reason, correct the file and send it again.");
    else if (st.kind === "warn") add("warning", "GRP-STATUS-" + summary.groupStatus, og, `File status: ${st.label}`, st.note, "Check the per-payment lines below.");
    else add("info", "GRP-ACCEPTED", og, `File status: ${st.label}`, st.note, "");
  }
  for (const b of summary.blocks) {
    const st = STATUS[b.status];
    if (st && st.kind === "bad") add("error", "BLK-REJECTED", { line: b.line, path: "" }, `Payment block ${b.id || "(no id)"} was rejected`, b.reasons.length ? `Reason: ${names(b.reasons)}.` : "The report gives no reason for the block.", b.reasons.length ? b.reasons[0].action : "Ask your bank for the reason.");
    else if (st && st.kind === "warn") add("warning", "BLK-STATUS", { line: b.line, path: "" }, `Payment block ${b.id || "(no id)"}: ${st.label}`, st.note, "Check the payments in this block.");
  }
  for (const t of txRows) {
    const st = STATUS[t.status];
    const at = { line: t.line, path: t.path };
    const id = t.e2e || "(no EndToEndId)";
    if (!t.status) add("warning", "TX-NO-STATUS", at, `Payment ${id} has no status`, "The report lists the payment but not its status.", "Ask your bank.");
    else if (!st) add("warning", "TX-STATUS-UNKNOWN", at, `Payment ${id}: unknown status ${t.status}`, "The code is not one this page knows.", "Read it in your bank's documentation.");
    else if (st.kind === "bad") {
      const r = t.reasons[0];
      add("error", "TX-REJECTED", at, `Payment ${id} rejected: ${r ? `${r.code || r.prop || "no code"} ${r.name}` : "no reason given"}${t.amountText ? ` (${t.amountText} ${t.ccy})` : ""}`, r ? r.meaning + (r.info.length ? ` Bank note: ${r.info.join(" ")}` : "") : "The report gives no reason.", r ? r.action : "Ask your bank.");
      for (const x of t.reasons) if (!x.known) add("warning", "REASON-UNKNOWN", { line: x.line, path: x.path }, `Reason ${x.code || x.prop || "(none)"} is not in this tool's table`, x.meaning, x.action);
    } else if (st.kind === "warn") add("warning", "TX-STATUS-" + t.status, at, `Payment ${id}: ${st.label}`, (t.reasons[0] ? `${t.reasons[0].code} ${t.reasons[0].name}. ` : "") + st.note, t.reasons[0] ? t.reasons[0].action : "");
  }

  if (summary.declaredNb !== null && txRows.length && Number(summary.declaredNb) !== txRows.length) {
    const more = txRows.length > Number(summary.declaredNb);
    add(more ? "warning" : "info", "COUNT-DIFFERS", og, `The report lists ${txRows.length} payment${txRows.length === 1 ? "" : "s"} but the original file had ${summary.declaredNb}`, "Banks often report only the payments that need attention, so a shorter list is normal; a longer one is not.", more ? "Check that this report belongs to the file you sent." : "Check the rest in your bank's portal.");
  }
  for (const b of summary.blocks) for (const p of b.perStatus) {
    const listed = txRows.filter((t) => t.block === b.id && t.status === p.status).length;
    if (p.nb && listed && Number(p.nb) !== listed) add("warning", "PERSTS-MISMATCH", { line: b.line, path: "" }, `Block ${b.id}: ${p.nb} payments declared as ${p.status}, ${listed} listed`, "The block summary and the per-payment lines disagree.", "Check the report, or ask your bank.");
  }
  const seen = new Set();
  for (const t of txRows) if (t.e2e) {
    const k = `${t.block}\u0000${t.e2e}`;
    if (seen.has(k)) add("warning", "E2E-DUP", { line: t.line, path: t.path }, `EndToEndId ${t.e2e} appears twice in block ${t.block || "(none)"}`, "Two status lines carry the same id, so a match back to your ledger is ambiguous.", "Match by amount and payee as well.");
    seen.add(k);
  }
  if (!txRows.length && STATUS[summary.groupStatus] && STATUS[summary.groupStatus].kind === "ok") add("info", "NO-TX-LINES", rpt, "The report has no per-payment lines", "The bank answered at file level only.", "Nothing to reconcile payment by payment.");
  if (summary.rejectedUnreadable) add("warning", "AMT-UNREADABLE", null, `${summary.rejectedUnreadable} rejected payment${summary.rejectedUnreadable === 1 ? " has" : "s have"} no readable amount`, "The report does not repeat the amount in <OrgnlTxRef>, so the rejected total is a lower bound.", "Look the amounts up in your original file by EndToEndId.");
  return finalize(result);
}

function finalize(result) {
  result.findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || (a.line || 0) - (b.line || 0));
  result.summary.errors = result.findings.filter((x) => x.severity === "error").length;
  result.summary.warnings = result.findings.filter((x) => x.severity === "warning").length;
  return result;
}

// ---------------------------------------------------------------------------------------------
// Re-submission worksheet and CSV. A leading = + - @ is neutralised so a spreadsheet cannot run it.
// ---------------------------------------------------------------------------------------------

const q = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };

export function resubmissionCsv(result) {
  const rows = [["block", "end_to_end_id", "status", "reason_code", "reason", "category", "action", "amount", "currency", "creditor", "creditor_iban_masked", "debtor_iban_masked", "bank_note"].join(",")];
  for (const t of result.summary.txs) {
    if (!(STATUS[t.status] && STATUS[t.status].kind === "bad")) continue;
    const r = t.reasons[0] || { code: "", prop: "", name: "No reason given", category: "other", action: "Ask your bank.", info: [] };
    rows.push([q(t.block), q(t.e2e), t.status, q(r.code || r.prop || ""), q(r.name), q(CATEGORY[r.category]), q(r.action), t.amount === null ? "" : formatScaled(t.amount), t.ccy, q(t.creditor), q(t.creditorIban), q(t.debtorIban), q((r.info || []).join(" "))].join(","));
  }
  return rows.join("\n") + "\n";
}

export function findingsCsv(result) {
  const rows = [["severity", "code", "line", "path", "title", "cause", "fix"].join(",")];
  for (const x of result.findings) rows.push([x.severity, x.code, x.line || "", q(x.path), q(x.title), q(x.cause), q(x.fix)].join(","));
  return rows.join("\n") + "\n";
}

export const money = (scaled) => formatScaled(scaled);

// ---------------------------------------------------------------------------------------------
// Synthetic samples: made-up names and public test IBANs.
// ---------------------------------------------------------------------------------------------

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function sampleTx(i, e2e, amount, status, reason, name, iban, info) {
  const rs = reason ? `
        <StsRsnInf>
          <Rsn><Cd>${reason}</Cd></Rsn>${info ? `
          <AddtlInf>${esc(info)}</AddtlInf>` : ""}
        </StsRsnInf>` : "";
  return `      <TxInfAndSts>
        <StsId>STS-${String(i).padStart(3, "0")}</StsId>
        <OrgnlEndToEndId>${e2e}</OrgnlEndToEndId>
        <TxSts>${status}</TxSts>${rs}
        <OrgnlTxRef>
          <Amt><InstdAmt Ccy="EUR">${amount}</InstdAmt></Amt>
          <ReqdExctnDt>2026-10-06</ReqdExctnDt>
          <Cdtr><Nm>${esc(name)}</Nm></Cdtr>
          <CdtrAcct><Id><IBAN>${iban}</IBAN></Id></CdtrAcct>
        </OrgnlTxRef>
      </TxInfAndSts>`;
}

const wrap = (inner) => `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.002.001.03">
  <CstmrPmtStsRpt>
${inner}
  </CstmrPmtStsRpt>
</Document>
`;
const hdr = (id, at) => `    <GrpHdr>
      <MsgId>${id}</MsgId>
      <CreDtTm>${at}</CreDtTm>
    </GrpHdr>`;

export function sampleRejectedReport() {
  return wrap(`${hdr("STSRPT-2026-10-05-0042", "2026-10-05T10:02:11")}
    <OrgnlGrpInfAndSts>
      <OrgnlMsgId>MSG-2026-0001</OrgnlMsgId>
      <OrgnlMsgNmId>pain.001.001.03</OrgnlMsgNmId>
      <OrgnlNbOfTxs>5</OrgnlNbOfTxs>
      <OrgnlCtrlSum>7850.00</OrgnlCtrlSum>
      <GrpSts>PART</GrpSts>
    </OrgnlGrpInfAndSts>
    <OrgnlPmtInfAndSts>
      <OrgnlPmtInfId>PMT-0001</OrgnlPmtInfId>
      <PmtInfSts>PART</PmtInfSts>
${sampleTx(1, "INV-1001", "1200.00", "ACCP", "", "Alpha Supplies GmbH", "DE89370400440532013000")}
${sampleTx(2, "INV-1002", "2300.00", "RJCT", "AC04", "Beta Logistik AG", "DE75512108001245126199", "Account closed 2026-09-30")}
${sampleTx(3, "INV-1003", "450.00", "RJCT", "AM04", "Gamma Bau KG", "DE02120300000000202051")}
${sampleTx(4, "INV-1004", "3100.00", "RJCT", "XY99", "Delta Consulting SARL", "FR1420041010050500013M02606")}
${sampleTx(5, "INV-1005", "800.00", "ACSP", "", "Epsilon Handel e.K.", "DE89370400440532013000")}
    </OrgnlPmtInfAndSts>`);
}

export function sampleAcceptedReport() {
  return wrap(`${hdr("STSRPT-2026-10-05-0043", "2026-10-05T10:05:00")}
    <OrgnlGrpInfAndSts>
      <OrgnlMsgId>MSG-2026-0002</OrgnlMsgId>
      <OrgnlMsgNmId>pain.001.001.03</OrgnlMsgNmId>
      <OrgnlNbOfTxs>2</OrgnlNbOfTxs>
      <OrgnlCtrlSum>1500.00</OrgnlCtrlSum>
      <GrpSts>ACCP</GrpSts>
    </OrgnlGrpInfAndSts>`);
}

export function sampleFileRejectedReport() {
  return wrap(`${hdr("STSRPT-2026-10-05-0044", "2026-10-05T10:07:30")}
    <OrgnlGrpInfAndSts>
      <OrgnlMsgId>MSG-2026-0003</OrgnlMsgId>
      <OrgnlMsgNmId>pain.001.001.03</OrgnlMsgNmId>
      <OrgnlNbOfTxs>12</OrgnlNbOfTxs>
      <OrgnlCtrlSum>9400.50</OrgnlCtrlSum>
      <GrpSts>RJCT</GrpSts>
      <StsRsnInf>
        <Rsn><Cd>AM10</Cd></Rsn>
        <AddtlInf>Control sum does not match the sum of the payments</AddtlInf>
      </StsRsnInf>
    </OrgnlGrpInfAndSts>`);
}
