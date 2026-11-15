// Differential test of the Facturae reader (facturae.mjs) against xmllint and the
// Ministerio de Hacienda's own XSDs:
//   node eval/facturae-differential.mjs <Facturaev3_2_1.xml> <Facturaev3_2_2.xml> <xmldsig-core-schema.xsd> [count] [seed]
// The XSDs are downloaded by hand from facturae.gob.es (they are not in the tree);
// their xmldsig import is pointed at the local copy before xmllint reads them.
//
// 1. Generates `count` random Facturae files (seeded): batches of 1-4 invoices, 1-5
//    lines, line discounts and charges, IVA, IGIC, recargo de equivalencia, IRPF
//    withholding, general discounts, advances, subsidies, suplidos, rectificativas,
//    foreign buyers and foreign-currency invoices. Each must pass xmllint and draw
//    no finding here (false rejects).
// 2. Applies one structural mutation to each and compares verdicts with xmllint:
//    does the schema layer (ES-018..022) reject exactly the files xmllint rejects?
// 3. Applies one arithmetic or consistency mutation that keeps the file XSD-valid
//    and checks the expected ES rule fires (catch rate per mutation).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkFacturae } from "../facturae.mjs";

const [xsd321, xsd322, dsig, countArg, seedArg] = process.argv.slice(2);
if (!xsd322) { console.error("usage: node eval/facturae-differential.mjs <3.2.1 xsd> <3.2.2 xsd> <xmldsig xsd> [count] [seed]"); process.exit(2); }
const COUNT = Number(countArg ?? 300);
let seed = Number(seedArg ?? 20261115);
const work = mkdtempSync(join(tmpdir(), "facturae-diff-"));
const local = {};
for (const [v, path] of [["3.2.1", xsd321], ["3.2.2", xsd322]]) {
  local[v] = join(work, `facturae-${v}.xsd`);
  writeFileSync(local[v], readFileSync(path, "utf8").replace("http://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd", dsig));
}
const NS = { "3.2.1": "http://www.facturae.es/Facturae/2014/v3.2.1/Facturae", "3.2.2": "http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml" };

function rand() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
const pick = (a) => a[Math.floor(rand() * a.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const chance = (p) => rand() < p;
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const f2 = (n) => r2(n).toFixed(2);
const f6 = (n) => (Math.round(n * 1e6) / 1e6).toFixed(6);

const LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
function nif() {
  const kind = pick(["dni", "nie", "cifB", "cifP"]);
  const d7 = String(int(0, 9999999)).padStart(7, "0");
  if (kind === "dni") { const d8 = String(int(0, 99999999)).padStart(8, "0"); return d8 + LETTERS[Number(d8) % 23]; }
  if (kind === "nie") { const c = pick(["X", "Y", "Z"]); return c + d7 + LETTERS[Number("XYZ".indexOf(c) + d7) % 23]; }
  let total = 0;
  for (let i = 0; i < 7; i++) { const v = Number(d7[i]) * (i % 2 === 0 ? 2 : 1); total += Math.floor(v / 10) + (v % 10); }
  const check = (10 - (total % 10)) % 10;
  return kind === "cifB" ? `B${d7}${check}` : `P${d7}${"JABCDEFGHI"[check]}`;
}

const addrES = () => `<AddressInSpain><Address>Calle ${int(1, 99)}</Address><PostCode>${String(int(1000, 52999)).padStart(5, "0")}</PostCode><Town>Ciudad</Town><Province>Provincia</Province><CountryCode>ESP</CountryCode></AddressInSpain>`;
const addrX = () => `<OverseasAddress><Address>1 Main St</Address><PostCodeAndTown>10001 New York</PostCodeAndTown><Province>NY</Province><CountryCode>USA</CountryCode></OverseasAddress>`;

function party(tag, foreign) {
  const id = foreign ? `US${int(100000000, 999999999)}` : nif();
  const individual = chance(0.3);
  const who = individual
    ? `<Individual><Name>Ana</Name><FirstSurname>Pérez</FirstSurname>${foreign ? addrX() : addrES()}</Individual>`
    : `<LegalEntity><CorporateName>Empresa ${int(1, 999)} SL</CorporateName>${foreign ? addrX() : addrES()}</LegalEntity>`;
  return `<${tag}><TaxIdentification><PersonTypeCode>${individual ? "F" : "J"}</PersonTypeCode><ResidenceTypeCode>${foreign ? "E" : "R"}</ResidenceTypeCode><TaxIdentificationNumber>${id}</TaxIdentificationNumber></TaxIdentification>${who}</${tag}>`;
}

const RE = { 21: 5.2, 10: 1.4, 4: 0.5 };
function invoice(version, currency, n) {
  const igic = chance(0.15);
  const rates = igic ? [7, 3, 0] : [21, 10, 4];
  const code = igic ? "03" : "01";
  const singleRate = chance(0.5);
  const rate0 = pick(rates);
  const re = !igic && chance(0.15);
  const lines = [];
  const nLines = int(1, 5);
  for (let i = 0; i < nLines; i++) {
    const q = int(1, 40) / (chance(0.3) ? 4 : 1);
    const price = int(100, 90000) / 100;
    const cost = q * price;
    const disc = chance(0.3) ? r2(cost * 0.05) : 0;
    const charge = chance(0.15) ? int(100, 2000) / 100 : 0;
    const gross = cost - disc + charge;
    lines.push({ q, price, cost, disc, charge, gross, rate: singleRate ? rate0 : pick(rates) });
  }
  const tga = r2(lines.reduce((a, l) => a + r2(l.gross), 0));
  const gDisc = singleRate && chance(0.25) ? r2(tga * 0.02) : 0;
  const tgabt = r2(tga - gDisc);
  const byRate = new Map();
  for (const l of lines) byRate.set(l.rate, (byRate.get(l.rate) ?? 0) + r2(l.gross));
  if (gDisc) byRate.set(rate0, tgabt);
  const eur = currency === "EUR" ? null : 0.92;
  const amt = (v) => `<TotalAmount>${f2(v)}</TotalAmount>${eur ? `<EquivalentInEuros>${f2(v * eur)}</EquivalentInEuros>` : ""}`;
  let tto = 0;
  const taxes = [...byRate].map(([rate, base]) => {
    const due = r2(base * rate / 100);
    tto += due;
    let reXml = "";
    if (re && RE[rate]) { const ra = r2(base * RE[rate] / 100); tto += ra; reXml = `<EquivalenceSurcharge>${RE[rate].toFixed(2)}</EquivalenceSurcharge><EquivalenceSurchargeAmount>${amt(ra)}</EquivalenceSurchargeAmount>`; }
    return `<Tax><TaxTypeCode>${code}</TaxTypeCode><TaxRate>${rate.toFixed(2)}</TaxRate><TaxableBase>${amt(base)}</TaxableBase><TaxAmount>${amt(due)}</TaxAmount>${reXml}</Tax>`;
  });
  tto = r2(tto);
  const irpf = chance(0.25) ? pick([15, 7]) : 0;
  const ttw = irpf ? r2(tgabt * irpf / 100) : 0;
  const total = r2(tgabt + tto - ttw);
  const subsidy = chance(0.1) ? r2(total * 0.1) : 0;
  const advance = chance(0.15) ? r2(total * 0.3) : 0;
  const toa = r2(total - subsidy - advance);
  const suplido = chance(0.15) ? int(500, 9000) / 100 : 0;
  const withheldAmt = chance(0.1) ? r2(toa * 0.05) : 0;
  const tea = r2(toa - withheldAmt + suplido);
  const corrective = chance(0.15);
  const reason = int(0, 21);
  const REASON_CODES = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "80", "81", "82", "83", "84", "85"];
  const REASON_TEXT = ["Número de la factura", "Serie de la factura", "Fecha expedición", "Nombre y apellidos/Razón Social-Emisor", "Nombre y apellidos/Razón Social-Receptor", "Identificación fiscal Emisor/obligado", "Identificación fiscal Receptor", "Domicilio Emisor/Obligado", "Domicilio Receptor", "Detalle Operación", "Porcentaje impositivo a aplicar", "Cuota tributaria a aplicar", "Fecha/Periodo a aplicar", "Clase de factura", "Literales legales", "Base imponible", "Cálculo de cuotas repercutidas", "Cálculo de cuotas retenidas", "Base imponible modificada por devolución de envases / embalajes", "Base imponible modificada por descuentos y bonificaciones", "Base imponible modificada por resolución firme, judicial o administrativa", "Base imponible modificada cuotas repercutidas no satisfechas. Auto de declaración de concurso"];
  const corrXml = corrective ? `<Corrective><InvoiceNumber>A${int(1, 999)}</InvoiceNumber><ReasonCode>${REASON_CODES[reason]}</ReasonCode><ReasonDescription>${REASON_TEXT[reason]}</ReasonDescription><TaxPeriod><StartDate>2026-10-01</StartDate><EndDate>2026-10-31</EndDate></TaxPeriod><CorrectionMethod>01</CorrectionMethod><CorrectionMethodDescription>Rectificación íntegra</CorrectionMethodDescription>${version === "3.2.2" ? "<InvoiceIssueDate>2026-10-15</InvoiceIssueDate>" : ""}</Corrective>` : "";
  const linesXml = lines.map((l, i) => `<InvoiceLine><ItemDescription>Artículo ${i + 1}</ItemDescription><Quantity>${l.q}</Quantity><UnitPriceWithoutTax>${f6(l.price)}</UnitPriceWithoutTax><TotalCost>${f6(l.cost)}</TotalCost>${l.disc ? `<DiscountsAndRebates><Discount><DiscountReason>Descuento</DiscountReason><DiscountRate>5.00</DiscountRate><DiscountAmount>${f6(l.disc)}</DiscountAmount></Discount></DiscountsAndRebates>` : ""}${l.charge ? `<Charges><Charge><ChargeReason>Cargo</ChargeReason><ChargeAmount>${f6(l.charge)}</ChargeAmount></Charge></Charges>` : ""}<GrossAmount>${f6(l.gross)}</GrossAmount><TaxesOutputs><Tax><TaxTypeCode>${code}</TaxTypeCode><TaxRate>${l.rate.toFixed(2)}</TaxRate><TaxableBase>${amt(l.gross)}</TaxableBase><TaxAmount>${amt(l.gross * l.rate / 100)}</TaxAmount></Tax></TaxesOutputs></InvoiceLine>`).join("");
  const xml = `<Invoice><InvoiceHeader><InvoiceNumber>${n}</InvoiceNumber><InvoiceSeriesCode>S${int(1, 9)}</InvoiceSeriesCode><InvoiceDocumentType>FC</InvoiceDocumentType><InvoiceClass>${corrective ? "OR" : "OO"}</InvoiceClass>${corrXml}</InvoiceHeader>`
    + `<InvoiceIssueData><IssueDate>2026-11-${String(int(1, 14)).padStart(2, "0")}</IssueDate><InvoiceCurrencyCode>${currency}</InvoiceCurrencyCode>${eur ? "<ExchangeRateDetails><ExchangeRate>0.92</ExchangeRate><ExchangeRateDate>2026-11-01</ExchangeRateDate></ExchangeRateDetails>" : ""}<TaxCurrencyCode>EUR</TaxCurrencyCode><LanguageName>es</LanguageName></InvoiceIssueData>`
    + `<TaxesOutputs>${taxes.join("")}</TaxesOutputs>`
    + (irpf ? `<TaxesWithheld><Tax><TaxTypeCode>04</TaxTypeCode><TaxRate>${irpf.toFixed(2)}</TaxRate><TaxableBase>${amt(tgabt)}</TaxableBase><TaxAmount>${amt(ttw)}</TaxAmount></Tax></TaxesWithheld>` : "")
    + `<InvoiceTotals><TotalGrossAmount>${f2(tga)}</TotalGrossAmount>${gDisc ? `<GeneralDiscounts><Discount><DiscountReason>Pronto pago</DiscountReason><DiscountAmount>${f2(gDisc)}</DiscountAmount></Discount></GeneralDiscounts><TotalGeneralDiscounts>${f2(gDisc)}</TotalGeneralDiscounts>` : ""}`
    + `<TotalGrossAmountBeforeTaxes>${f2(tgabt)}</TotalGrossAmountBeforeTaxes><TotalTaxOutputs>${f2(tto)}</TotalTaxOutputs><TotalTaxesWithheld>${f2(ttw)}</TotalTaxesWithheld><InvoiceTotal>${f2(total)}</InvoiceTotal>`
    + (subsidy ? `<Subsidies><Subsidy><SubsidyDescription>Ayuda</SubsidyDescription><SubsidyAmount>${f2(subsidy)}</SubsidyAmount></Subsidy></Subsidies>` : "")
    + (advance ? `<PaymentsOnAccount><PaymentOnAccount><PaymentOnAccountDate>2026-10-20</PaymentOnAccountDate><PaymentOnAccountAmount>${f2(advance)}</PaymentOnAccountAmount></PaymentOnAccount></PaymentsOnAccount>` : "")
    + (suplido ? `<ReimbursableExpenses><ReimbursableExpenses><ReimbursableExpensesAmount>${f2(suplido)}</ReimbursableExpensesAmount></ReimbursableExpenses></ReimbursableExpenses>` : "")
    + `<TotalOutstandingAmount>${f2(toa)}</TotalOutstandingAmount>${advance ? `<TotalPaymentsOnAccount>${f2(advance)}</TotalPaymentsOnAccount>` : ""}`
    + (withheldAmt ? `<AmountsWithheld><WithholdingReason>Garantía</WithholdingReason><WithholdingAmount>${f2(withheldAmt)}</WithholdingAmount></AmountsWithheld>` : "")
    + `<TotalExecutableAmount>${f2(tea)}</TotalExecutableAmount>${suplido ? `<TotalReimbursableExpenses>${f2(suplido)}</TotalReimbursableExpenses>` : ""}</InvoiceTotals>`
    + `<Items>${linesXml}</Items>`
    + (chance(0.6) ? `<PaymentDetails><Installment><InstallmentDueDate>2026-12-15</InstallmentDueDate><InstallmentAmount>${f2(tea)}</InstallmentAmount><PaymentMeans>04</PaymentMeans><AccountToBeCredited><IBAN>ES9121000418450200051332</IBAN></AccountToBeCredited></Installment></PaymentDetails>` : "")
    + "</Invoice>";
  return { xml, total, toa, tea };
}

function file() {
  const version = pick(["3.2.1", "3.2.2", "3.2.2"]);
  const nInv = chance(0.7) ? 1 : int(2, 4);
  const currency = chance(0.1) ? "USD" : "EUR";
  const foreign = chance(0.15);
  const invs = Array.from({ length: nInv }, (_, i) => invoice(version, currency, `F${int(1, 99999)}-${i}`));
  const s = (k) => f2(invs.reduce((a, x) => a + x[k], 0));
  const eq = (v) => currency === "EUR" ? "" : `<EquivalentInEuros>${f2(Number(v) * 0.92)}</EquivalentInEuros>`;
  return { version, xml: `<?xml version="1.0" encoding="UTF-8"?>\n<fe:Facturae xmlns:fe="${NS[version]}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><FileHeader><SchemaVersion>${version}</SchemaVersion><Modality>${nInv === 1 ? "I" : "L"}</Modality><InvoiceIssuerType>EM</InvoiceIssuerType><Batch><BatchIdentifier>LOTE${int(1, 99999)}</BatchIdentifier><InvoicesCount>${nInv}</InvoicesCount>`
    + `<TotalInvoicesAmount><TotalAmount>${s("total")}</TotalAmount>${eq(s("total"))}</TotalInvoicesAmount><TotalOutstandingAmount><TotalAmount>${s("toa")}</TotalAmount>${eq(s("toa"))}</TotalOutstandingAmount><TotalExecutableAmount><TotalAmount>${s("tea")}</TotalAmount>${eq(s("tea"))}</TotalExecutableAmount><InvoiceCurrencyCode>${currency}</InvoiceCurrencyCode></Batch></FileHeader>`
    + `<Parties>${party("SellerParty", false)}${party("BuyerParty", foreign)}</Parties><Invoices>${invs.map((x) => x.xml).join("")}</Invoices></fe:Facturae>\n` };
}

function xmllint(version, xml) {
  const path = join(work, "f.xml");
  writeFileSync(path, xml);
  try { execFileSync("xmllint", ["--noout", "--schema", local[version], path], { stdio: "pipe" }); return true; } catch { return false; }
}
const SCHEMA_RULES = new Set(["ES-018", "ES-019", "ES-020", "ES-021", "ES-022"]);
const check = (xml) => checkFacturae(xml, { today: "2026-11-15" }).findings;

// Structural mutations: string edits; xmllint decides which ones break the schema.
const STRUCT = {
  "drop TaxCurrencyCode": (x) => x.replace(/<TaxCurrencyCode>EUR<\/TaxCurrencyCode>/, ""),
  "drop ItemDescription": (x) => x.replace(/<ItemDescription>[^<]*<\/ItemDescription>/, ""),
  "drop BatchIdentifier": (x) => x.replace(/<BatchIdentifier>[^<]*<\/BatchIdentifier>/, ""),
  "drop an optional SeriesCode": (x) => x.replace(/<InvoiceSeriesCode>[^<]*<\/InvoiceSeriesCode>/, ""),
  "swap Quantity/UnitPrice": (x) => x.replace(/(<Quantity>[^<]*<\/Quantity>)(<UnitPriceWithoutTax>[^<]*<\/UnitPriceWithoutTax>)/, "$2$1"),
  "unknown element": (x) => x.replace("<InvoiceClass>", "<Notas>x</Notas><InvoiceClass>"),
  "duplicate IssueDate": (x) => x.replace(/(<IssueDate>[^<]*<\/IssueDate>)/, "$1$1"),
  "bad InvoiceClass": (x) => x.replace(/<InvoiceClass>O[OR]</, "<InvoiceClass>XX<"),
  "bad TaxTypeCode": (x) => x.replace(/<TaxTypeCode>0[13]</, "<TaxTypeCode>99<"),
  "bad CountryCode": (x) => x.replace("<CountryCode>ESP<", "<CountryCode>ES<"),
  "decimal comma": (x) => x.replace(/<TotalGrossAmount>(\d+)\.(\d\d)</, "<TotalGrossAmount>$1,$2<"),
  "nine decimals": (x) => x.replace(/<TotalGrossAmount>(\d+\.\d\d)</, "<TotalGrossAmount>$11234567<"),
  "exponent amount": (x) => x.replace(/<InvoiceTotal>(\d+)\.\d\d</, "<InvoiceTotal>$1e0<"),
  "long InvoiceNumber": (x) => x.replace(/<InvoiceNumber>F/, "<InvoiceNumber>FFFFFFFFFFFFFFFFFFFFFF"),
  "Feb 30": (x) => x.replace(/<IssueDate>2026-11-\d\d</, "<IssueDate>2026-02-30<"),
  "4-digit PostCode": (x) => x.replace(/<PostCode>\d(\d{4})</, "<PostCode>$1<"),
  "cut-off file": (x) => x.slice(0, Math.floor(x.length * 0.7)),
  "both address forms": (x) => x.replace(/(<AddressInSpain>[\s\S]*?<\/AddressInSpain>)/, `$1${addrX()}`),
};
// Arithmetic and consistency mutations: XSD-valid, each should draw `rule`.
const bump = (re, by) => (x) => x.replace(re, (m, v) => m.replace(v, (Number(v) + by).toFixed(v.split(".")[1]?.length ?? 2)));
const ARITH = {
  "TotalCost +1.00": { rule: "ES-007", f: bump(/<TotalCost>([\d.]+)</, 1) },
  "GrossAmount +0.50": { rule: "ES-008", f: bump(/<GrossAmount>([\d.]+)</, 0.5) },
  "TotalGrossAmount +0.05": { rule: "ES-009", f: bump(/<TotalGrossAmount>([\d.]+)</, 0.05) },
  "TaxAmount +0.02": { rule: "ES-013", f: bump(/<\/TaxableBase><TaxAmount><TotalAmount>([\d.]+)</, 0.02) },
  "TotalTaxOutputs +1.00": { rule: "ES-014", f: bump(/<TotalTaxOutputs>([\d.]+)</, 1) },
  "TotalTaxesWithheld +3.00": { rule: "ES-015", f: bump(/<TotalTaxesWithheld>([\d.]+)</, 3) },
  "InvoiceTotal +0.10": { rule: "ES-016", f: bump(/<InvoiceTotal>([\d.]+)</, 0.1) },
  "TotalOutstandingAmount -5.00": { rule: "ES-017", f: bump(/<TotalOutstandingAmount>([\d.]+)</, -5) },
  "TotalExecutableAmount +2.00": { rule: "ES-024", f: bump(/<TotalExecutableAmount>([\d.]+)</, 2) },
  "Batch TotalInvoicesAmount +1.00": { rule: "ES-004", f: bump(/<TotalInvoicesAmount><TotalAmount>([\d.]+)</, 1) },
  "InvoicesCount +1": { rule: "ES-003", f: (x) => x.replace(/<InvoicesCount>(\d+)</, (m, v) => `<InvoicesCount>${Number(v) + 1}<`) },
  "OR without Corrective": { rule: "ES-027", f: (x) => x.replace(/<InvoiceClass>OO<\/InvoiceClass>/, "<InvoiceClass>OR</InvoiceClass>") },
  "seller NIF typo": { rule: "ES-032", f: (x) => x.replace(/(<SellerParty><TaxIdentification><PersonTypeCode>[FJ]<\/PersonTypeCode><ResidenceTypeCode>R<\/ResidenceTypeCode><TaxIdentificationNumber>[^<]{3})(\d)/, (m, a, d) => a + ((Number(d) + 1) % 10)) },
  "SchemaVersion mismatch": { rule: "ES-001", f: (x) => x.replace(/<SchemaVersion>3\.2\.[12]</, (m) => (m.includes("3.2.1") ? "<SchemaVersion>3.2.2<" : "<SchemaVersion>3.2.1<")) },
};

const stats = { files: 0, xsdValid: 0, falseRejects: 0, falseRejectRules: {}, struct: {}, arith: {} };
for (let i = 0; i < COUNT; i++) {
  const { version, xml } = file();
  stats.files++;
  const ok = xmllint(version, xml);
  if (ok) stats.xsdValid++;
  const f = check(xml);
  if (f.length) { stats.falseRejects++; for (const x of f) stats.falseRejectRules[x.rule] = (stats.falseRejectRules[x.rule] ?? 0) + 1; if (stats.falseRejects <= 3) console.error("false reject sample:", JSON.stringify(f.slice(0, 3))); }
  for (const [name, mut] of Object.entries(STRUCT)) {
    if (rand() > 0.35) continue;
    const m = mut(xml);
    if (m === xml) continue;
    const lint = xmllint(version, m);
    const ours = !check(m).some((x) => SCHEMA_RULES.has(x.rule));
    const s = (stats.struct[name] ??= { n: 0, agree: 0, lintRejects: 0, oursRejects: 0 });
    s.n++; if (!lint) s.lintRejects++; if (!ours) s.oursRejects++; if (lint === ours) s.agree++;
  }
  for (const [name, { rule, f: mut }] of Object.entries(ARITH)) {
    if (rand() > 0.35) continue;
    const m = mut(xml);
    if (m === xml) continue;
    const s = (stats.arith[name] ??= { n: 0, caught: 0, xsdValid: 0 });
    s.n++;
    if (xmllint(version, m)) s.xsdValid++;
    if (check(m).some((x) => x.rule === rule)) s.caught++;
  }
}
console.log(JSON.stringify(stats, null, 1));
