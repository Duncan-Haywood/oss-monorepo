// Best-effort ISDOC (Czech national invoice XML) reader. UNVERIFIED: element names are
// from memory of the public ISDOC 6.x schema and have not been run against a real file
// (cz hosts are unreachable from the cloud runner). It maps into the same JSON shape as
// the UBL reader so the format-neutral arithmetic, VAT and date checks apply. It applies
// no Czech national rules and no XSD.
import { parseXmlTree } from "./ubl.mjs";
import { parseDecimal } from "./numbers.mjs";

function find(node, name) {
  if (node.name === name) return node;
  for (const c of node.children) { const f = find(c, name); if (f) return f; }
  return null;
}
function kids(node, name) { return node ? node.children.filter((c) => c.name === name) : []; }
function txt(node, name) {
  const n = node ? find(node, name) : null;
  return n ? n.text.trim() : "";
}
function num(s) {
  if (s === "") return "";
  const v = parseDecimal(s);
  return v === null ? s : v;
}

export function parseIsdocInvoice(source) {
  const tree = parseXmlTree(source);
  const root = find(tree, "Invoice");
  if (!root) throw new Error("ISDOC root element Invoice is missing");
  const party = (wrapper) => {
    const w = find(root, wrapper);
    return {
      id: txt(w, "ID") || txt(w, "CompanyID") || "",
      name: txt(find(w || root, "PartyName") , "Name"),
      ...(txt(find(w || root, "PartyTaxScheme"), "CompanyID") ? { vat_id: txt(find(w, "PartyTaxScheme"), "CompanyID") } : {}),
    };
  };
  const lines = kids(find(root, "InvoiceLines") || root, "InvoiceLine").map((l) => ({
    description: txt(find(l, "Item"), "Description") || txt(l, "Note") || "",
    quantity: num(txt(l, "InvoicedQuantity")),
    unit_price: num(txt(l, "UnitPrice")),
    tax_percent: num(txt(find(l, "ClassifiedTaxCategory"), "Percent")),
    net: num(txt(l, "LineExtensionAmount")),
  }));
  const total = find(root, "LegalMonetaryTotal");
  const docType = txt(root, "DocumentType");
  return {
    invoice_number: txt(root, "ID"),
    issue_date: txt(root, "IssueDate"),
    document_type: docType === "2" ? "credit_note" : "invoice",
    currency: txt(root, "ForeignCurrencyCode") || txt(root, "LocalCurrencyCode"),
    supplier: party("AccountingSupplierParty"),
    customer: party("AccountingCustomerParty"),
    lines,
    totals: {
      net: num(txt(total, "TaxExclusiveAmount")),
      tax: num(txt(find(root, "TaxTotal"), "TaxAmount")),
      gross: num(txt(total, "TaxInclusiveAmount")),
      due: num(txt(total, "PayableAmount")),
    },
  };
}
