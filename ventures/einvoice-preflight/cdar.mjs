// Reads France's invoice life-cycle message: the CDAR (UN/CEFACT D22B
// CrossDomainAcknowledgementAndResponse) that carries a "CDV" status (200 Déposée,
// 213 Rejetée, 210 Refusée, 212 Encaissée ...) between the approved platforms (PA),
// the seller, the buyer and the PPF under the 2026 e-invoicing reform.
//
// What it does, all offline:
// - names each status and reason the message carries (labels as FNFE-MPE's own example
//   messages and Schematron spell them, github.com/fnfempe/France_RFE commit 97ba0f3);
// - when the invoice the status is about is in the same batch (matched on MDT-87 = BT-1),
//   checks that the message's invoice type (MDT-91), invoice date (MDT-100) and seller
//   SIREN (MDT-129) are the invoice's (BT-3, BT-2, BT-30): rules FR-CDV-101..103;
// - catches what the official set cannot (FR-CDV-105..107): no creation date-time or an
//   impossible one, no invoice number, a missing invoice date hidden by another reference's 501;
// - lists every status the batch holds for one invoice in time order (the journey).
// The official BR-FR-CDV rules (FNFE-MPE Schematron 1.4.0.04, plain/cdar-fr.json) run
// beside this on the plain route (plain-schematron.mjs).
//
// It reads what a platform said; it is not a platform and not tax advice.
import { parseXmlTree } from "./ubl.mjs";
import { frenchXmlValueFindings } from "./xmlvalues.mjs";

export const CDAR_NS = "urn:un:unece:uncefact:data:standard:CrossDomainAcknowledgementAndResponse:100";

// Labels: the ProcessCondition text of FNFE-MPE's example messages (Z.example/TEST/CDAR) and
// the status names in its Schematron's messages. 206 and 208 are named both ways round in
// that file (BR-FR-CDV-15 calls 206 Suspendue and 208 Approuvée partiellement; the
// BR-FR-CDV-CL-09 rules the reverse), so no label is given for them.
export const CDV_STATUS = {
  200: ["Déposée", "submitted to the issuer's platform"],
  202: ["Reçue", "received by the buyer's platform"],
  203: ["Mise à disposition", "made available to the buyer"],
  204: ["Prise en charge", "taken in hand by the buyer"],
  205: ["Approuvée", "approved by the buyer"],
  207: ["En litige", "disputed by the buyer"],
  210: ["Refusée", "refused by the buyer"],
  211: ["Paiement transmis", "payment sent by the buyer"],
  212: ["Encaissée", "payment received by the seller"],
  213: ["Rejetée", "rejected by a platform"],
  220: ["Annulée", "cancelled"],
  221: ["Erreur de routage", "routing error"],
  501: ["Irrecevable", "inadmissible"],
};
// The codes FNFE's BR-FR-CDV-CL-06 accepts (a warning outside it, to allow bilateral codes).
export const CDV_CODES = "200 201 202 203 204 205 206 207 208 209 210 211 212 213 214 220 221 224 225 226 227 228 250 251 300 301 400 401 500 501 601".split(" ");
// Statuses for which BR-FR-CDV-15 demands a reason (MDT-113).
export const NEEDS_REASON = new Set(["206", "207", "208", "210", "213", "501"]);

export const looksLikeCdar = (text) => /<(?:\w+:)?CrossDomainAcknowledgementAndResponse\b/.test(String(text).slice(0, 4096));

const local = (name) => String(name).replace(/^.*:/, "");
const kid = (node, name) => node?.children?.find((c) => local(c.name) === name);
const kids = (node, name) => (node?.children || []).filter((c) => local(c.name) === name);
const text = (node) => (node ? node.text.trim() : "");
const path = (node, ...names) => names.reduce((n, name) => kid(n, name), node);
const stamp = (node) => text(kid(node, "DateTimeString"));

// "20250701161000" (format 204) -> "2025-07-01 16:10:00"; "20250701" (102) -> "2025-07-01".
export function readStamp(s) {
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?$/);
  if (!m) return s || "";
  return m[4] ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : `${m[1]}-${m[2]}-${m[3]}`;
}

const party = (p) => p && {
  role: text(kid(p, "RoleCode")),
  name: text(kid(p, "Name")),
  id: text(kid(p, "GlobalID")),
  scheme: kid(p, "GlobalID")?.attrs?.schemeID || "",
};

export function readCdar(source) {
  const raw = (typeof source === "string" ? source : new TextDecoder().decode(source)).replace(/^\uFEFF/, "");
  const tree = parseXmlTree(raw);
  const root = tree.children.find((c) => local(c.name) === "CrossDomainAcknowledgementAndResponse");
  if (!root) throw new Error("not a CDAR (CrossDomainAcknowledgementAndResponse) message");
  const ctx = kid(root, "ExchangedDocumentContext");
  const doc = kid(root, "ExchangedDocument");
  const ack = kid(root, "AcknowledgementDocument");
  const refs = kids(ack, "ReferenceReferencedDocument").map((r) => {
    const code = text(kid(r, "ProcessConditionCode"));
    const statuses = kids(r, "SpecifiedDocumentStatus");
    return {
      invoiceId: text(kid(r, "IssuerAssignedID")),
      typeCode: text(kid(r, "TypeCode")),
      invoiceDate: readStamp(stamp(kid(r, "FormattedIssueDateTime"))),
      receivedAt: readStamp(stamp(kid(r, "ReceiptDateTime"))),
      status: code,
      statusText: text(kid(r, "ProcessCondition")),
      sellerSiren: text(path(r, "IssuerTradeParty", "GlobalID")),
      sellerScheme: path(r, "IssuerTradeParty", "GlobalID")?.attrs?.schemeID || "",
      reasons: statuses.flatMap((s) => (kid(s, "ReasonCode") ? [{ code: text(kid(s, "ReasonCode")), text: text(kid(s, "Reason")) }] : [])),
    };
  });
  return {
    // INV-065 (2026-11-17): a number or date holding a no-break space or another space XML
    // does not trim (frenchXmlValueFindings in xmlvalues.mjs says which leaves count).
    xmlValues: frenchXmlValueFindings(tree, "cdar"),
    process: text(path(ctx, "BusinessProcessSpecifiedDocumentContextParameter", "ID")),
    profile: text(path(ctx, "GuidelineSpecifiedDocumentContextParameter", "ID")),
    id: text(kid(doc, "ID")),
    createdAt: readStamp(stamp(kid(doc, "IssueDateTime"))),
    sender: party(kid(doc, "SenderTradeParty")),
    issuer: party(kid(doc, "IssuerTradeParty")),
    recipients: kids(doc, "RecipientTradeParty").map(party),
    ackType: text(kid(ack, "TypeCode")),
    statusAt: readStamp(stamp(kid(ack, "IssueDateTime"))),
    multiple: text(path(ack, "MultipleReferencesIndicator", "Indicator")) === "true",
    refs,
  };
}

export function statusName(code) {
  const known = Object.hasOwn(CDV_STATUS, code) ? CDV_STATUS[code] : null;
  if (known) return `${code} ${known[0]} (${known[1]})`;
  if (code === "206" || code === "208") return `${code} (FNFE-MPE's Schematron names 206 and 208 both ways round: Approuvée partiellement / Suspendue)`;
  if (CDV_CODES.includes(code)) return `${code} (in FNFE-MPE's list of allowed codes; no label in its files)`;
  return code ? `${code} (not in FNFE-MPE's list of status codes)` : "(no status code)";
}

const ROLES = { SE: "seller", BY: "buyer", WK: "platform (PA)", DFH: "PPF (tax administration's platform)", AB: "buyer's agent", DL: "factor", SR: "seller's agent", PE: "payee", PR: "payer", II: "invoice issuer", IV: "invoicee" };
const role = (p) => (p?.role ? `${(Object.hasOwn(ROLES, p.role) ? ROLES[p.role] : "") || p.role}${p.name ? ` ${p.name}` : ""}` : "");

export function cdarEnvelope(msg, pairs = []) {
  const first = msg.refs[0];
  const who = [msg.issuer && role(msg.issuer) ? `from ${role(msg.issuer)}` : msg.sender?.role ? `from ${role(msg.sender)}` : "", msg.recipients.length ? `to ${msg.recipients.map(role).filter(Boolean).join(", ")}` : ""].filter(Boolean).join(" ");
  const head = first
    ? `France life-cycle status (CDAR): ${statusName(first.status)} for invoice ${first.invoiceId || "(no number)"}${msg.refs.length > 1 ? ` and ${msg.refs.length - 1} more` : ""}`
    : "France life-cycle status (CDAR) with no referenced invoice";
  const paired = pairs.length ? `; checked against ${pairs.map((p) => p.name).join(", ")} in this batch` : "; the invoice is not in this batch, so its type, date and seller were not compared";
  return `${head}${who ? `, ${who}` : ""}${msg.statusAt ? `, status time ${msg.statusAt}` : ""}${paired}. Official BR-FR-CDV rules (FNFE-MPE 1.4.0.04) run on the official-rules route.`;
}

const info = (rule, message, fix = "") => ({ rule, message, fix, severity: "information", source: "cdar" });
const fault = (rule, message, fix) => ({ rule, message, fix, severity: "error", source: "cdar" });

// A real calendar date-time in readStamp's output ("2025-02-30 10:00:00" is not one).
const realStamp = (s) => {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/);
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= days[mo - 1] && (m[4] === undefined || (+m[4] < 24 && +m[5] < 60 && +m[6] < 60));
};

// Gaps in the official set (eval/cdar-crosscheck-2026-11-17.md, second round): six BR-FR-CDV
// rules can never fire (BR-FR-CDV-01, 04, 05, 06 and 10 put the element in the rule's context
// and test "."; BR-FR-CDV-07_MDT-38_no tests count(...) ge 0), the date functions are declared
// but never called, and BR-FR-CDV-11's 501 exemption reads every reference. These checks cover
// what a platform relying on that set alone would let through.
export function cdarGapFindings(msg) {
  const out = [];
  if (!msg.createdAt) out.push(fault("FR-CDV-105", "The message has no creation date-time (MDT-8, ExchangedDocument/IssueDateTime). FNFE-MPE's BR-FR-CDV-04 calls it mandatory but, as written, cannot fire when it is missing.", "Add ram:IssueDateTime with a format 204 DateTimeString (YYYYMMDDHHMMSS) to rsm:ExchangedDocument."));
  else if (!realStamp(msg.createdAt)) out.push(fault("FR-CDV-105", `The message's creation date-time (MDT-8) "${msg.createdAt}" is not a real date and time. No BR-FR-CDV rule checks it.`, "Write MDT-8 as a real date-time in format 204 (YYYYMMDDHHMMSS)."));
  if (msg.statusAt && !realStamp(msg.statusAt)) out.push(fault("FR-CDV-105", `The status date-time (MDT-78) "${msg.statusAt}" is not a real date and time. No BR-FR-CDV rule checks it.`, "Write MDT-78 as a real date-time in format 204 (YYYYMMDDHHMMSS)."));
  const any501 = msg.refs.some((r) => r.status === "501");
  msg.refs.forEach((ref, i) => {
    const which = msg.refs.length > 1 ? `Reference ${i + 1} of ${msg.refs.length}` : "The referenced invoice";
    if (!ref.invoiceId) out.push(fault("FR-CDV-106", `${which} has no invoice number (MDT-87, IssuerAssignedID = BT-1). FNFE-MPE's BR-FR-CDV-10 calls it mandatory but, as written, cannot fire when it is missing; without it nobody can tell which invoice the status is about.`, "Add ram:IssuerAssignedID with the invoice's BT-1 to ram:ReferenceReferencedDocument."));
    if (ref.invoiceDate && !realStamp(ref.invoiceDate)) out.push(fault("FR-CDV-105", `${which}: invoice date (MDT-100) "${ref.invoiceDate}" is not a real date. No BR-FR-CDV rule checks it.`, "Write MDT-100 as the invoice's BT-2 in format 102 (YYYYMMDD)."));
    if (!ref.invoiceDate && ref.status !== "501" && any501) out.push(fault("FR-CDV-107", `${which} (status ${ref.status || "none"}) has no invoice date (MDT-100). BR-FR-CDV-11 lets it through only because another reference in this message is 501 (Irrecevable): its exemption reads every reference, not this one.`, "Give every reference that is not 501 its invoice date (BT-2) in ram:FormattedIssueDateTime."));
  });
  return out;
}

// invoices: [{ name, invoice }] with invoice as inspectInvoiceSource gives it (invoice_number,
// issue_date, document_code, supplier.legal_id). Returns { findings, pairs }.
export function cdarFindings(msg, invoices = []) {
  const findings = [];
  const pairs = [];
  findings.push(...(msg.xmlValues || []));
  findings.push(...cdarGapFindings(msg));
  for (const ref of msg.refs) {
    const reasons = ref.reasons.map((r) => `${r.code}${r.text ? ` (${r.text})` : ""}`).join("; ");
    findings.push(info("FR-CDV-100", `Invoice ${ref.invoiceId || "(no number)"}: status ${statusName(ref.status)}${reasons ? `, reason ${reasons}` : ""}.`,
      NEEDS_REASON.has(ref.status) ? "This status needs the seller's attention: read the reason, correct the invoice or answer the buyer, and issue a new invoice or credit note where the reason calls for it." : ""));
    const match = invoices.find((i) => i.invoice?.invoice_number && i.invoice.invoice_number === ref.invoiceId);
    if (!match) continue;
    pairs.push({ name: match.name, invoiceId: ref.invoiceId });
    const inv = match.invoice;
    if (ref.typeCode && inv.document_code && ref.typeCode !== String(inv.document_code)) {
      findings.push(fault("FR-CDV-101", `The status names invoice ${ref.invoiceId} as type ${ref.typeCode} (MDT-91), but ${match.name} is type ${inv.document_code} (BT-3).`, "A status must reference the invoice by number, type and date together: make MDT-91 the invoice's BT-3, or check which invoice this status answers."));
    }
    if (ref.invoiceDate && inv.issue_date && ref.invoiceDate !== inv.issue_date) {
      findings.push(fault("FR-CDV-102", `The status gives invoice ${ref.invoiceId} the date ${ref.invoiceDate} (MDT-100), but ${match.name} is dated ${inv.issue_date} (BT-2).`, "Make MDT-100 the invoice's BT-2: invoice number, type and date together identify the invoice a status is about."));
    }
    const siren = inv.supplier?.legal_id?.scheme === "0002" ? inv.supplier.legal_id.id : "";
    if (ref.sellerSiren && siren && ref.sellerSiren !== siren) {
      findings.push(fault("FR-CDV-103", `The status names seller SIREN ${ref.sellerSiren} (MDT-129), but ${match.name}'s seller SIREN is ${siren} (BT-30).`, "MDT-129 is the SIREN of the invoice's seller: correct it, or check which seller's invoice this status answers."));
    }
  }
  return { findings, pairs };
}

// The batch's statuses per invoice number, in time order: [{ invoiceId, steps: [{ at, status, file }] }].
export function cdarJourneys(messages) {
  const by = new Map();
  for (const { file, msg } of messages) {
    for (const ref of msg.refs) {
      if (!ref.invoiceId) continue;
      if (!by.has(ref.invoiceId)) by.set(ref.invoiceId, []);
      by.get(ref.invoiceId).push({ at: msg.statusAt || msg.createdAt, status: ref.status, file });
    }
  }
  return [...by].map(([invoiceId, steps]) => ({ invoiceId, steps: steps.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)) }));
}
