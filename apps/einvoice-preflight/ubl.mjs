// Maps a local UBL Invoice document into the format-neutral checker shape.
// Intentionally small: it is not a Peppol or EN 16931 validator. DTD and
// entity declarations are rejected so a dropped file cannot expand entities.
import { parseDecimal } from "./numbers.mjs";
import { decodeXmlRefs, unreadableLeaves } from "./xmlvalues.mjs";
import { normalizeDocumentType } from "./document.mjs";

function localName(tag) {
  const trimmed = tag.replace(/^\/+/, "").split(/[\s>/]/, 1)[0];
  if (trimmed.includes("}")) return trimmed.slice(trimmed.lastIndexOf("}") + 1);
  return trimmed.includes(":") ? trimmed.slice(trimmed.lastIndexOf(":") + 1) : trimmed;
}

function parseAttrs(token) {
  const attrs = {};
  const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match = pattern.exec(token);
  while (match) {
    const raw = match[1];
    const key = raw.includes(":") ? raw.slice(raw.lastIndexOf(":") + 1) : raw;
    attrs[key] = match[2] !== undefined ? match[2] : match[3];
    match = pattern.exec(token);
  }
  return attrs;
}

export function parseXmlTree(source) {
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  if (/<!DOCTYPE/i.test(text) || /<!ENTITY/i.test(text)) {
    throw new Error("DTD and entity declarations are not supported");
  }
  const tokens = text.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[^>]+>|[^<]+/g) || [];
  const root = { name: "#root", text: "", children: [] };
  const stack = [root];
  for (const token of tokens) {
    if (token.startsWith("<?") || token.startsWith("<!--") || token.startsWith("<![")) continue;
    if (token.startsWith("</")) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (token.startsWith("<")) {
      const selfClosing = /\/>$/.test(token);
      const node = { name: localName(token.slice(1)), text: "", children: [], attrs: parseAttrs(token) };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
      continue;
    }
    stack[stack.length - 1].text += token;
  }
  return root;
}

function descendants(node, name) {
  const found = [];
  const walk = (current) => {
    if (current.name === name) found.push(current);
    for (const child of current.children) walk(child);
  };
  walk(node);
  return found;
}

function textOf(node, name, required = true) {
  const match = descendants(node, name)[0];
  const value = match ? match.text.trim() : "";
  if (required && !value) throw new Error(`UBL field ${name} is missing`);
  return value;
}

function asNumber(value) {
  // Not Number(): it reads "0x64" as 100, an amount no receiver accepts (xs:decimal).
  // Character references are decoded first (2026-11-17): `238.00&#160;` refused
  // the whole file as "not a number"; now it reads as the literal does and
  // INV-065 names the field, and `&#50;38` reads as 238, as XML says it is.
  const number = parseDecimal(typeof value === "string" ? decodeXmlRefs(value) : value);
  if (number === null) throw new Error(`UBL amount is not a number: ${String(value).slice(0, 40)}`);
  return number;
}

function nestedText(node, parentName, childName) {
  const parent = descendants(node, parentName)[0];
  return parent ? textOf(parent, childName, false) : "";
}

/** The party's own identifier, in the order a receiver would resolve it.
 *
 * EN 16931 makes the seller and buyer identifiers (BT-29/BT-46) optional --
 * plenty of real Peppol invoices identify a party by its electronic address
 * and name alone. Treating the identifier as mandatory made those invoices
 * unreadable rather than reporting a finding, so this returns "" and lets
 * INV-005 decide what a missing identifier means.
 *
 * This mirrors `_party_identifier` in src/einvoice_preflight/ubl.py, which
 * already resolved it this way. The browser tool kept the stricter rule, so
 * the CLI read the shipped examples and the page they are published next to
 * refused them.
 */
function partyIdentifier(partyNode) {
  return nestedText(partyNode, "PartyIdentification", "ID")
    || textOf(partyNode, "EndpointID", false)
    || nestedText(partyNode, "PartyLegalEntity", "CompanyID")
    || nestedText(partyNode, "PartyTaxScheme", "CompanyID");
}

// BT-30/BT-47 (legal_id) and BT-29/BT-46 with a scheme (party_ids), read the
// same way for the seller, the buyer, the payee (BG-10: BT-60, BT-61) and the
// tax representative (BG-11). Peppol's PEPPOL-COMMON contexts match
// `cac:PartyIdentification/cbc:ID` and `cbc:CompanyID` wherever they sit, so
// each one meets its scheme's rule (endpoint.mjs, INV-062/INV-063).
function schemedIds(partyNode) {
  const mapped = {};
  const legalNode = descendants(partyNode, "PartyLegalEntity").flatMap((entity) => descendants(entity, "CompanyID"))[0];
  if (legalNode && legalNode.text.trim()) {
    const scheme = (legalNode.attrs && legalNode.attrs.schemeID) ? legalNode.attrs.schemeID.trim() : "";
    mapped.legal_id = { id: legalNode.text.trim(), scheme };
  }
  // BT-29/BT-46 with a scheme: Peppol checks each one against its scheme's
  // PEPPOL-COMMON rule, so keep every PartyIdentification/ID that names one
  // (endpoint.mjs, INV-062/INV-063).
  const partyIds = [];
  for (const identification of descendants(partyNode, "PartyIdentification")) {
    for (const idNode of identification.children.filter((child) => child.name === "ID")) {
      const scheme = idNode.attrs && idNode.attrs.schemeID ? idNode.attrs.schemeID.trim() : "";
      const id = idNode.text.trim();
      if (scheme && id) partyIds.push({ id, scheme });
    }
  }
  if (partyIds.length) mapped.party_ids = partyIds;
  return mapped;
}

// Every schemed id inside a UBL line that Peppol's COMMON id contexts reach
// (`cbc:EndpointID | cac:PartyIdentification/cbc:ID | cbc:CompanyID`, each
// with a schemeID, no parent named): a line-level cac:Delivery/cac:DeliveryParty,
// an OriginatorParty, an Item's ManufacturerParty. The item's own ids
// (StandardItemIdentification/ID, a GTIN under 0160) sit outside those
// contexts, so Peppol leaves them alone and so do we (added 2026-11-17).
function lineSchemeIds(line) {
  const found = [];
  const keep = (node) => {
    const scheme = node.attrs && node.attrs.schemeID ? String(node.attrs.schemeID).trim() : "";
    const id = (node.text || "").trim();
    if (scheme && id) found.push({ id, scheme });
  };
  for (const node of descendants(line, "EndpointID")) keep(node);
  for (const identification of descendants(line, "PartyIdentification")) {
    for (const node of identification.children.filter((child) => child.name === "ID")) keep(node);
  }
  for (const node of descendants(line, "CompanyID")) keep(node);
  return found.length ? { scheme_ids: found } : {};
}

// BG-10 payee and BG-11 seller tax representative: only their schemed ids,
// for INV-062/INV-063 (undefined when the file names none).
function sideParty(root, name) {
  const node = root.children.find((child) => child.name === name);
  if (!node) return undefined;
  const ids = schemedIds(node);
  return Object.keys(ids).length ? ids : undefined;
}

// An element's text as an XML processor reads it: character references
// (`&#160;`, `&#x42;`) and the five predefined entities decoded, then only XML
// whitespace (space, tab, CR, LF) trimmed, as normalize-space does at the ends.
// parseXmlTree keeps text raw and several callers decode it themselves, so this
// is used where a value is checked character by character (VAT numbers): before
// 2026-11-17 `NL123456782&#66;01` (a valid number, B written as a reference)
// was a blocking INV-022, and String.trim() dropped a trailing no-break space
// that Peppol's normalize-space keeps (and warns on, R056-2).
const XML_REF = /&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g;
const NAMED_REF = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export function xmlValue(node) {
  const raw = node && typeof node.text === "string" ? node.text : "";
  const decoded = raw.replace(XML_REF, (whole, ref) => {
    if (ref[0] !== "#") return NAMED_REF[ref];
    const code = ref[1] === "x" ? parseInt(ref.slice(2), 16) : Number(ref.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
  return decoded.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
}

// BT-31/BT-48/BT-63: the first VAT-scheme PartyTaxScheme/CompanyID of a party.
function partyVatId(partyNode) {
  const node = partyVatNode(partyNode);
  return node ? xmlValue(node) : "";
}

function partyVatNode(partyNode) {
  for (const scheme of descendants(partyNode, "PartyTaxScheme")) {
    // A national tax number travels in the same element with TaxScheme/ID "FC"
    // (or similar); only a VAT scheme -- or an unlabelled one whose number starts
    // with a country prefix -- is a VAT ID. CIUS-RO puts a buyer that is not VAT
    // registered (a ministry, a school) in an unlabelled scheme with its bare
    // fiscal code (CUI, "8609468"); EN 16931's BR-CO-9 reads only TaxScheme/ID
    // "VAT", so that is not a VAT number either (ANAF's own examples, 2026-11-11).
    const schemeId = nestedText(scheme, "TaxScheme", "ID").toUpperCase();
    if (schemeId && schemeId !== "VAT") continue;
    const node = descendants(scheme, "CompanyID")[0];
    const vatId = node ? xmlValue(node) : "";
    if (!schemeId && vatId && !/^[A-Za-z]{2}/.test(vatId.trim())) continue;
    if (vatId.trim()) return node;
  }
  return null;
}

// Every VAT number PEPPOL-COMMON-R056-2 reads that no party's vat_id holds:
// its context is `cac:PartyTaxScheme[normalize-space(cac:TaxScheme/cbc:ID) =
// 'VAT']/cbc:CompanyID` anywhere in the document, so it reaches the payee's
// (BG-10) and the deliver-to party's (cac:Delivery/cac:DeliveryParty)
// PartyTaxScheme, a line's parties, and a second VAT scheme on the seller,
// none of which EN 16931 defines a VAT number for (added 2026-11-17;
// eval/nl-vat-r056-2-differential.mjs). `primary` holds the CompanyID nodes
// already read as BT-31/BT-48/BT-63.
const UBL_PARTY_KEYS = {
  AccountingSupplierParty: ["supplier", "Seller"],
  AccountingCustomerParty: ["customer", "Buyer"],
  TaxRepresentativeParty: ["tax_representative", "Tax representative"],
  PayeeParty: ["payee_party", "Payee"],
  DeliveryParty: ["delivery_party", "Deliver-to party"],
};
function ublVatRegistrations(root, primary) {
  const found = [];
  const walk = (node, ancestors) => {
    if (node.name === "PartyTaxScheme") {
      const schemeNode = node.children.find((child) => child.name === "TaxScheme");
      const idNode = schemeNode && schemeNode.children.find((child) => child.name === "ID");
      if (idNode && xmlValue(idNode).replace(/[ \t\r\n]+/g, " ") === "VAT") {
        for (const company of node.children.filter((child) => child.name === "CompanyID")) {
          if (primary.has(company)) continue;
          found.push({ ...registrationPlace(ancestors, UBL_PARTY_KEYS, /^(Invoice|CreditNote|DebitNote)Line$/, /Party$/), value: xmlValue(company) });
        }
      }
      return;
    }
    for (const child of node.children) walk(child, [...ancestors, node]);
  };
  walk(root, []);
  return found;
}

// Names the party a registration belongs to: the nearest ancestor that is a
// party, and the line it sits on, if any ("Line 2 deliver-to party").
export function registrationPlace(ancestors, keys, lineName, partyName) {
  let party = null;
  for (let i = ancestors.length - 1; i >= 0 && !party; i -= 1) {
    const name = ancestors[i].name;
    if (keys[name]) party = keys[name];
    else if (partyName.test(name) && name !== "Party") party = [name, name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()];
  }
  party = party || ["document", "A"];
  const lineIndex = ancestors.findIndex((node) => lineName.test(node.name));
  if (lineIndex < 0) return { party: party[0], label: party[1] };
  const line = ancestors[lineIndex];
  const parent = ancestors[lineIndex - 1];
  const number = parent ? parent.children.filter((child) => child.name === line.name).indexOf(line) + 1 : 1;
  return { party: party[0], line: number, label: `Line ${number} ${party[1].charAt(0).toLowerCase()}${party[1].slice(1)}` };
}

function party(node) {
  const partyNode = descendants(node, "Party")[0] || node;
  // XRechnung carries the legal name in PartyLegalEntity/RegistrationName and
  // may omit PartyName entirely, so that is a source for the name, not a
  // reason to refuse the document. Also matches the Python reader.
  const name = nestedText(partyNode, "PartyName", "Name")
    || nestedText(partyNode, "PartyLegalEntity", "RegistrationName")
    || textOf(partyNode, "Name", false);
  const mapped = { id: partyIdentifier(partyNode), name };
  const vatId = partyVatId(partyNode);
  if (vatId) mapped.vat_id = vatId;
  const addressNode = descendants(partyNode, "PostalAddress")[0];
  if (addressNode) {
    const street = textOf(addressNode, "StreetName", false);
    const city = textOf(addressNode, "CityName", false);
    const postal = textOf(addressNode, "PostalZone", false);
    const country = nestedText(addressNode, "Country", "IdentificationCode");
    if (street) mapped.street = street;
    if (city) mapped.city = city;
    if (postal) mapped.postal_code = postal;
    if (country) mapped.country = country;
  }
  const contactNode = descendants(partyNode, "Contact")[0];
  if (contactNode) {
    const contact = {};
    const cName = textOf(contactNode, "Name", false);
    const phone = textOf(contactNode, "Telephone", false);
    const email = textOf(contactNode, "ElectronicMail", false);
    if (cName) contact.name = cName;
    if (phone) contact.phone = phone;
    if (email) contact.email = email;
    if (Object.keys(contact).length) mapped.contact = contact;
  }
  for (const scheme of descendants(partyNode, "PartyTaxScheme")) {
    if (nestedText(scheme, "TaxScheme", "ID").toUpperCase() === "FC") {
      const number = textOf(scheme, "CompanyID", false);
      if (number) mapped.tax_number = number;
      break;
    }
  }
  Object.assign(mapped, schemedIds(partyNode));
  const endpointNode = descendants(partyNode, "EndpointID")[0];
  if (endpointNode) {
    const id = endpointNode.text.trim();
    const scheme = (endpointNode.attrs && endpointNode.attrs.schemeID) ? endpointNode.attrs.schemeID.trim() : "";
    if (id || scheme) mapped.endpoint = { id, scheme };
  }
  return mapped;
}

function branchBic(branch) {
  for (const child of descendants(branch, "ID")) {
    const value = child.text.trim();
    if (value) return value;
  }
  return "";
}

function optionalMonetaryTotals(total) {
  const extras = {};
  const prepaid = textOf(total, "PrepaidAmount", false);
  if (prepaid) extras.prepaid = asNumber(prepaid);
  const payable = textOf(total, "PayableAmount", false);
  if (payable) extras.due = asNumber(payable);
  const rounding = textOf(total, "PayableRoundingAmount", false);
  if (rounding) extras.rounding = asNumber(rounding);
  return extras;
}

function paymentReference(means) {
  for (const name of ["PaymentID", "InstructionNote"]) {
    for (const child of means.children) {
      if (child.name === name) {
        const value = child.text.trim();
        if (value) return value;
      }
    }
  }
  return "";
}

function paymentTermsDays(root) {
  for (const child of root.children) {
    if (child.name !== "PaymentTerms") continue;
    for (const period of descendants(child, "SettlementPeriod")) {
      for (const measure of period.children) {
        if (measure.name !== "DurationMeasure") continue;
        const unit = ((measure.attrs && measure.attrs.unitCode) || "").trim().toUpperCase();
        const value = measure.text.trim();
        if (value && (unit === "DAY" || unit === "D")) return value;
      }
    }
  }
  return "";
}

function payeePayment(root) {
  for (const means of descendants(root, "PaymentMeans")) {
    const payment = {};
    const code = textOf(means, "PaymentMeansCode", false);
    if (code) payment.means = code;
    const remittance = paymentReference(means);
    if (remittance) payment.remittance = remittance;
    for (const account of descendants(means, "PayeeFinancialAccount")) {
      for (const child of account.children) {
        if (child.name === "ID") {
          const value = child.text.trim();
          if (value) payment.iban = value;
        } else if (child.name === "FinancialInstitutionBranch") {
          const bic = branchBic(child);
          if (bic) payment.bic = bic;
        }
      }
    }
    if (Object.keys(payment).length) return payment;
  }
  return null;
}

const DOCUMENT_ROOTS = {
  Invoice: { type: "invoice", line: "InvoiceLine", quantity: "InvoicedQuantity" },
  CreditNote: { type: "credit_note", line: "CreditNoteLine", quantity: "CreditedQuantity" },
  DebitNote: { type: "debit_note", line: "DebitNoteLine", quantity: "DebitedQuantity" },
};

function taxCategoryFields(category) {
  const extras = {};
  for (const child of category.children) {
    if (child.name === "ID") {
      const value = child.text.trim();
      if (value) extras.tax_category = value;
    }
  }
  const reason = textOf(category, "TaxExemptionReason", false);
  if (reason) extras.tax_reason = reason;
  const reasonCode = textOf(category, "TaxExemptionReasonCode", false);
  if (reasonCode) extras.tax_reason_code = reasonCode;
  return extras;
}

// The document-level TaxTotal elements (BG-22/BG-23): children of the root. A line
// may carry its own TaxTotal (ZATCA's KSA-11/12 line VAT, and its prepayment lines'
// KSA-31/32 subtotal at the advance's rate), which is not the document's breakdown.
// Fall back to every TaxTotal only when none sits at the root.
function headerTaxTotals(root) {
  const direct = root.children.filter((child) => child.name === "TaxTotal");
  return direct.length ? direct : descendants(root, "TaxTotal");
}

const hasSubtotal = (taxTotal) => taxTotal.children.some((child) => child.name === "TaxSubtotal");

function headerSubtotals(root) {
  // PINT JP breaks the tax down again in the tax accounting currency (IBG-38, a JPY TaxTotal
  // with its own TaxSubtotal beside the EUR one, OpenPeppol's Example2-TaxAcctCur): that is
  // the same tax, so when a TaxTotal is in the document currency only those rows are read.
  const totals = headerTaxTotals(root);
  const docCurrency = textOf(root, "DocumentCurrencyCode", false);
  const currencyOf = (total) => total.children.find((child) => child.name === "TaxAmount")?.attrs?.currencyID || "";
  const own = docCurrency ? totals.filter((total) => currencyOf(total) === docCurrency) : [];
  const read = own.length && own.length < totals.length ? own : totals;
  return read.flatMap((total) => total.children.filter((child) => child.name === "TaxSubtotal"));
}

function taxBreakdown(root) {
  const rows = [];
  for (const subtotal of headerSubtotals(root)) {
    const taxable = textOf(subtotal, "TaxableAmount", false);
    const tax = textOf(subtotal, "TaxAmount", false);
    const category = descendants(subtotal, "TaxCategory")[0];
    const percent = category ? textOf(category, "Percent", false) : "";
    let taxId = "";
    if (category) {
      for (const child of category.children) {
        if (child.name === "ID") taxId = child.text.trim();
      }
    }
    if (!taxable && !tax && !percent) continue;
    const row = {};
    if (percent) row.tax_percent = asNumber(percent);
    if (taxable) row.taxable = asNumber(taxable);
    if (tax) row.tax = asNumber(tax);
    if (taxId) row.tax_category = taxId;
    // A tax other than VAT/GST (Malaysia's tourism tax, scheme AAL) can be a flat amount
    // with no percentage; the scheme is kept only then, so EU rows read as before.
    const scheme = category ? descendants(category, "TaxScheme")[0] : null;
    const schemeId = scheme ? textOf(scheme, "ID", false).trim().toUpperCase() : "";
    if (schemeId && !["VAT", "GST"].includes(schemeId)) row.tax_scheme = schemeId;
    if (Object.keys(row).length) rows.push(row);
  }
  return rows;
}

function documentExemption(root) {
  const extras = {};
  for (const subtotal of headerSubtotals(root)) {
    for (const category of descendants(subtotal, "TaxCategory")) {
      const reason = textOf(category, "TaxExemptionReason", false);
      if (reason && !extras.tax_exemption_reason) extras.tax_exemption_reason = reason;
      const reasonCode = textOf(category, "TaxExemptionReasonCode", false);
      if (reasonCode && !extras.tax_exemption_reason_code) extras.tax_exemption_reason_code = reasonCode;
    }
  }
  return extras;
}

// A line's own VAT amount where PINT states one: Oman's BTOM-016,
// cac:ItemPriceExtension/cac:TaxTotal/cbc:TaxAmount. "" when absent.
function lineTaxAmount(line) {
  const extension = line.children.find((child) => child.name === "ItemPriceExtension");
  const taxTotal = extension ? extension.children.find((child) => child.name === "TaxTotal") : null;
  return taxTotal ? textOf(taxTotal, "TaxAmount", false) : "";
}

// The line's own amount with VAT where PINT states one: UAE's BTAE-10, Oman's BTOM-017,
// cac:ItemPriceExtension/cbc:Amount. "" when absent.
function lineAmountWithVat(line) {
  const extension = line.children.find((child) => child.name === "ItemPriceExtension");
  const amount = extension ? extension.children.find((child) => child.name === "Amount") : null;
  return amount ? amount.text.trim() : "";
}

// BTAE-03 and the like: the reason codes of the document's own DiscrepancyResponse
// (header level only; a line's DiscrepancyResponse is about that line). PINT AE's
// ibr-055-ae reads them: a credit note with reason VD (volume discount) names no
// preceding invoice, since a period discount may cover many (aside.mjs).
function creditReasonCodes(root) {
  const codes = [];
  for (const child of root.children) {
    if (child.name !== "DiscrepancyResponse") continue;
    const code = child.children.find((c) => c.name === "ResponseCode");
    const value = code ? code.text.trim() : "";
    if (value) codes.push(value);
  }
  return codes;
}

function billingReference(root) {
  for (const ref of descendants(root, "BillingReference")) {
    for (const invoiceRef of descendants(ref, "InvoiceDocumentReference")) {
      const value = textOf(invoiceRef, "ID", false);
      if (value) return value;
    }
  }
  return "";
}

export function parseUblInvoice(source) {
  const tree = parseXmlTree(source);
  const root = descendants(tree, "Invoice")[0]
    || descendants(tree, "CreditNote")[0]
    || descendants(tree, "DebitNote")[0];
  if (!root) throw new Error("UBL document root must be Invoice, CreditNote, or DebitNote");
  const kind = DOCUMENT_ROOTS[root.name];

  const lines = descendants(root, kind.line).map((line) => {
    // A line can carry two categories (PINT MY: SST and the tourism tax, scheme AAL);
    // the VAT/GST one is the line's rate, whichever comes first.
    const categories = descendants(line, "ClassifiedTaxCategory");
    const vatScheme = (c) => {
      const scheme = descendants(c, "TaxScheme")[0];
      const id = scheme ? textOf(scheme, "ID", false).trim().toUpperCase() : "";
      return !id || id === "VAT" || id === "GST";
    };
    const category = categories.find(vatScheme) || categories[0] || line;
    const percent = textOf(category, "Percent", false);
    const priceNode = line.children.find((child) => child.name === "Price");
    const baseQuantity = priceNode ? textOf(priceNode, "BaseQuantity", false) : "";
    const adjustments = lineAdjustments(line);
    return {
      description: textOf(line, "Name"),
      quantity: asNumber(textOf(line, kind.quantity)),
      unit_price: asNumber(textOf(line, "PriceAmount")),
      // Category O has no Percent element (EN 16931 BR-O-05); leave it empty.
      tax_percent: percent === "" ? "" : asNumber(percent),
      net: asNumber(textOf(line, "LineExtensionAmount")),
      ...(parseDecimal(lineTaxAmount(line)) !== null ? { tax_amount: parseDecimal(lineTaxAmount(line)) } : {}),
      ...(parseDecimal(lineAmountWithVat(line)) !== null ? { amount_with_vat: parseDecimal(lineAmountWithVat(line)) } : {}),
      ...(baseQuantity ? { price_base_quantity: asNumber(baseQuantity) } : {}),
      ...(adjustments.length ? { adjustments } : {}),
      ...taxCategoryFields(category),
      ...lineSchemeIds(line),
    };
  });

  const supplier = descendants(root, "AccountingSupplierParty")[0] || root;
  const customer = descendants(root, "AccountingCustomerParty")[0] || root;
  const total = descendants(root, "LegalMonetaryTotal")[0] || root;
  const taxTotals = headerTaxTotals(root);
  if (taxTotals.length === 0) throw new Error("UBL field TaxAmount is missing");
  // BT-110 is in the document currency; a second TaxTotal in the VAT
  // accounting currency (BT-111) is the same tax again and must not be added.
  const docCurrency = textOf(root, "DocumentCurrencyCode", false);
  let sameCurrency = taxTotals.filter((item) => {
    const amount = item.children.find((child) => child.name === "TaxAmount");
    const code = amount && amount.attrs ? amount.attrs.currencyID : "";
    return !code || !docCurrency || code === docCurrency;
  });
  // When the VAT accounting currency is the document currency (ZATCA requires
  // BT-111 in SAR, so every SAR invoice repeats its tax), the repeat is the
  // TaxTotal with no TaxSubtotal: BT-110 is the one that carries the breakdown.
  // That repeat is kept as totals.tax_accounting_currency so INV-059 can compare it.
  let accountingRepeat = null;
  if (sameCurrency.length > 1 && sameCurrency.some(hasSubtotal)) {
    const repeats = sameCurrency.filter((item) => !hasSubtotal(item));
    if (repeats.length === 1) accountingRepeat = parseDecimal(textOf(repeats[0], "TaxAmount", false));
    sameCurrency = sameCurrency.filter(hasSubtotal);
  }
  const taxTotal = (sameCurrency.length ? sameCurrency : taxTotals)
    .reduce((sum, item) => sum + asNumber(textOf(item, "TaxAmount")), 0);
  const dueDate = textOf(root, "DueDate", false);
  const typeCode = textOf(root, "InvoiceTypeCode", false)
    || textOf(root, "CreditNoteTypeCode", false)
    || textOf(root, "DebitNoteTypeCode", false);
  const original = billingReference(root);
  const reasons = creditReasonCodes(root);
  const invoice = {
    invoice_number: textOf(root, "ID"),
    issue_date: textOf(root, "IssueDate"),
    ...(dueDate ? { due_date: dueDate } : {}),
    source_format: "ubl",
    // UBL 2.1's EN 16931 binding has no DebitNote document: a debit note (383, or Self-Billing's
    // 527, self-billed debit note) travels as an Invoice, so the type code says what it is
    // and INV-034 does not call the pair a mismatch (2026-11-18).
    document_type: kind.type === "invoice" && normalizeDocumentType(typeCode) === "debit_note" ? "debit_note" : kind.type,
    ...(typeCode ? { document_code: typeCode } : {}),
    ...(original ? { original_invoice: original } : {}),
    ...(reasons.length ? { credit_reason_codes: reasons } : {}),
    currency: textOf(root, "DocumentCurrencyCode"),
    supplier: party(supplier),
    customer: party(customer),
    lines,
    totals: {
      net: asNumber(textOf(total, "TaxExclusiveAmount")),
      tax: asNumber(String(taxTotal)),
      gross: asNumber(textOf(total, "TaxInclusiveAmount")),
      ...(accountingRepeat !== null ? { tax_accounting_currency: accountingRepeat } : {}),
      ...optionalMonetaryTotals(total),
    },
  };
  const payee = sideParty(root, "PayeeParty");
  if (payee) invoice.payee_party = payee;
  // BG-11 also carries BT-63, its VAT number (INV-022/023/064; read since 2026-11-17).
  const representativeNode = root.children.find((child) => child.name === "TaxRepresentativeParty");
  const representativeVat = representativeNode ? partyVatId(representativeNode) : "";
  const representative = sideParty(root, "TaxRepresentativeParty");
  if (representative || representativeVat) {
    invoice.tax_representative = { ...(representative || {}), ...(representativeVat ? { vat_id: representativeVat } : {}) };
  }
  // R056-2 reaches every VAT PartyTaxScheme, not only BT-31/48/63's (see
  // ublVatRegistrations): the rest are kept for INV-064.
  const primary = new Set([supplier, customer].map((node) => partyVatNode(descendants(node, "Party")[0] || node)));
  if (representativeNode) primary.add(partyVatNode(representativeNode));
  const registrations = ublVatRegistrations(root, primary);
  if (registrations.length) invoice.vat_registrations = registrations;
  // cac:Delivery/cac:DeliveryParty: Peppol's PartyIdentification/ID and
  // CompanyID contexts match its ids too (BT-71's DeliveryLocation/ID is not
  // under PartyIdentification, so Peppol does not; added 2026-11-17).
  const deliveryNode = root.children.filter((child) => child.name === "Delivery")
    .flatMap((delivery) => delivery.children.filter((child) => child.name === "DeliveryParty"));
  const deliverTo = deliveryNode.reduce((acc, node) => {
    const ids = schemedIds(node);
    if (ids.legal_id && !acc.legal_id) acc.legal_id = ids.legal_id;
    if (ids.party_ids) acc.party_ids = [...(acc.party_ids || []), ...ids.party_ids];
    return acc;
  }, {});
  if (Object.keys(deliverTo).length) invoice.delivery_party = deliverTo;
  const payment = payeePayment(root) || {};
  const termsDays = paymentTermsDays(root);
  if (termsDays) payment.terms_days = termsDays;
  if (Object.keys(payment).length) invoice.payment = payment;
  Object.assign(invoice, documentExemption(root));
  const breakdown = taxBreakdown(root);
  if (breakdown.length) invoice.tax_breakdown = breakdown;
  const period = invoicePeriod(root);
  if (period) invoice.period = period;
  Object.assign(invoice, commercialReferences(root));
  const specification = textOf(root, "CustomizationID", false);
  if (specification) invoice.specification_id = specification;
  const businessProcess = textOf(root, "ProfileID", false);
  if (businessProcess) invoice.profile_id = businessProcess;
  const adjustments = headerAdjustments(root);
  if (adjustments.length) invoice.adjustments = adjustments;
  const notes = [
    ...root.children.filter((child) => child.name === "Note").map((child) => child.text.trim()),
    ...root.children.filter((child) => child.name === "PaymentTerms").flatMap((terms) => descendants(terms, "Note").map((n) => n.text.trim())),
  ].filter(Boolean);
  if (notes.length) invoice.notes = notes;
  // INV-065: an amount, quantity or date that String.trim() reads and XML does
  // not (a no-break space at its end). Kept for checks.mjs; xmlvalues.mjs.
  const unreadable = unreadableLeaves(tree);
  if (unreadable.length) invoice.xml_values = unreadable;
  return invoice;
}

// BG-27 / BG-28: allowances and charges on one line (children of the line,
// not the price-level discount inside Price, which BT-146 already nets).
function lineAdjustments(line) {
  const rows = [];
  for (const child of line.children) {
    if (child.name !== "AllowanceCharge") continue;
    const indicator = textOf(child, "ChargeIndicator", false).toLowerCase();
    const amount = textOf(child, "Amount", false);
    if (!indicator || !amount) continue;
    rows.push({ kind: indicator === "true" || indicator === "1" ? "charge" : "allowance", amount: asNumber(amount) });
  }
  return rows;
}

function headerAdjustments(root) {
  const rows = [];
  for (const child of root.children) {
    if (child.name !== "AllowanceCharge") continue;
    const indicator = textOf(child, "ChargeIndicator", false);
    const amount = textOf(child, "Amount", false);
    const base = textOf(child, "BaseAmount", false);
    const percent = textOf(child, "MultiplierFactorNumeric", false);
    const reason = textOf(child, "AllowanceChargeReason", false);
    const reasonCode = textOf(child, "AllowanceChargeReasonCode", false);
    if (!indicator && !amount && !base && !percent && !reason && !reasonCode) continue;
    const row = {};
    if (indicator) {
      const token = indicator.trim().toLowerCase();
      row.kind = token === "true" || token === "1" ? "charge" : "allowance";
    }
    if (amount) row.amount = asNumber(amount);
    if (base) row.base = asNumber(base);
    if (percent) row.percent = asNumber(percent);
    if (reason) row.reason = reason;
    if (reasonCode) row.reason_code = reasonCode;
    const vat = descendants(child, "TaxCategory")[0];
    if (vat) {
      const vatPercent = textOf(vat, "Percent", false);
      if (vatPercent) row.tax_percent = asNumber(vatPercent);
      const vatCategory = textOf(vat, "ID", false);
      if (vatCategory) row.tax_category = vatCategory;
    }
    if (Object.keys(row).length) rows.push(row);
  }
  return rows;
}

function commercialReferences(root) {
  const extras = {};
  for (const child of root.children) {
    if (child.name === "BuyerReference") {
      extras.buyer_reference = (child.text || "").trim();
    } else if (child.name === "OrderReference") {
      extras.order_reference = textOf(child, "ID", false);
      // Peppol BIS 3.0: "NA" stands in for the mandatory ID when only a sales order exists.
      const sales = textOf(child, "SalesOrderID", false);
      if (sales && String(extras.order_reference || "").trim().toUpperCase() === "NA") extras.order_reference = sales;
      else if (sales && !String(extras.order_reference || "").trim()) extras.order_reference = sales;
    }
  }
  return extras;
}

function invoicePeriod(root) {
  for (const child of root.children) {
    if (child.name !== "InvoicePeriod") continue;
    const start = textOf(child, "StartDate", false);
    const end = textOf(child, "EndDate", false);
    if (!start && !end) continue;
    const period = {};
    if (start) period.start = start;
    if (end) period.end = end;
    return period;
  }
  return null;
}

export function looksLikeXml(name, source) {
  if (typeof name === "string" && name.toLowerCase().endsWith(".xml")) return true;
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  return text.trimStart().startsWith("<");
}
