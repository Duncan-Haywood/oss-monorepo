// @ts-check
// The readable view (added 2026-11-27): an e-invoice (UBL, CII or the XML inside a Factur-X /
// ZUGFeRD PDF) as a printable HTML page, with every finding of the check pinned to the field it is
// about and explained in the reader's language. Proprietary (see ../LICENSE, part 2).
//
// Why: an XRechnung is XML. The accountant who receives one cannot read it without a viewer, and
// the free viewers show the invoice but not what is wrong with it; the checker reports what is
// wrong but not where on the invoice. This page does both, from one check.
//
// The page is built from text only: every value read from the file is HTML-escaped, there is no
// script, and the page carries its own Content-Security-Policy so it stays inert when opened from
// disk. It shows the values exactly as the file has them (no rounding, no reformatting), since the
// point is to see what the file says. The verdict is the check's, never this module's.

import { isBlocking } from "../report.mjs";
import { decodeXmlRefs } from "../xmlvalues.mjs";

/** @typedef {"de" | "fr" | "en" | "nl" | "pl"} Lang */
/** @typedef {{ rule: string, message: string, fix?: string, path?: string, severity?: string, explanation?: { title?: string, action?: string, source?: string, notice?: string } }} Finding */
/** @typedef {{ file?: string, sha256?: string, status?: string, profile?: string, profileDetected?: boolean, schematron?: string, findings?: Finding[] }} Check */

/** The page's own policy (in a meta element, so it holds when the file is opened from disk). */
const META_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
/** The HTTP header's policy: frame-ancestors only works there. */
export const VIEW_CSP = `${META_CSP}; frame-ancestors 'none'`;

/** UI strings. The Polish and Dutch ones are the agent's, not yet read by a native speaker (as the rest of the workspace). */
const T = {
  en: {
    title: "E-invoice", reading: "Readable view of the e-invoice file. The XML is the invoice; this page is a reading aid and changes nothing in it.",
    file: "File", checked: "Checked", pass: "No blocking errors", fail: "Blocking errors", blocking: "blocking", warnings: "warnings",
    rules: "Rules applied", builtIn: "built-in rules", official: "official Schematron", detected: "detected from the file",
    general: "Findings not tied to one field", seller: "Seller", buyer: "Buyer", details: "Invoice details", lines: "Invoice lines",
    vat: "VAT breakdown", totals: "Totals", payment: "Payment", notes: "Notes", other: "Other values read from the file",
    missing: "missing", unreadable: "This view lays out EN 16931 invoices (UBL, CII, Factur-X / ZUGFeRD). This file is in another format or could not be read, so only the check's result is shown.",
    ai: "AI", checker: "Checker's text", path: "Field", none: "No findings.", page: "Page generated", warning: "warning",
    number: "Invoice number", issue: "Issue date", type: "Document type", currency: "Currency", due: "Due date", buyerRef: "Buyer reference (Leitweg-ID)",
    order: "Order reference", delivery: "Delivery date", periodStart: "Billing period start", periodEnd: "Billing period end", spec: "Specification",
    process: "Business process", preceding: "Preceding invoice", terms: "Payment terms", exemption: "VAT exemption reason", format: "Syntax",
    name: "Name", vatId: "VAT ID", id: "Identifier", legalId: "Legal registration", street: "Street", postal: "Postcode", city: "City", country: "Country",
    endpoint: "Electronic address", contact: "Contact", phone: "Phone", email: "Email",
    desc: "Description", qty: "Quantity", price: "Unit price", net: "Net amount", cat: "VAT category", rate: "VAT %", taxable: "Taxable amount", tax: "VAT amount",
    totNet: "Total without VAT", totTax: "Total VAT", totGross: "Total with VAT", prepaid: "Paid in advance", rounding: "Rounding", payable: "Amount due",
    taxAcc: "VAT in accounting currency", means: "Payment means", iban: "IBAN", bic: "BIC", remittance: "Remittance information",
  },
  de: {
    title: "E-Rechnung", reading: "Lesbare Ansicht der E-Rechnungsdatei. Die XML-Datei ist die Rechnung; diese Seite ist eine Lesehilfe und ändert nichts an ihr.",
    file: "Datei", checked: "Geprüft", pass: "Keine blockierenden Fehler", fail: "Blockierende Fehler", blocking: "blockierend", warnings: "Warnungen",
    rules: "Angewandte Regeln", builtIn: "eingebaute Regeln", official: "offizielles Schematron", detected: "aus der Datei erkannt",
    general: "Befunde ohne einzelnes Feld", seller: "Verkäufer", buyer: "Käufer", details: "Rechnungsangaben", lines: "Rechnungspositionen",
    vat: "Umsatzsteueraufschlüsselung", totals: "Summen", payment: "Zahlung", notes: "Bemerkungen", other: "Weitere Werte aus der Datei",
    missing: "fehlt", unreadable: "Diese Ansicht stellt EN-16931-Rechnungen dar (UBL, CII, Factur-X / ZUGFeRD). Diese Datei hat ein anderes Format oder ließ sich nicht lesen; daher wird nur das Prüfergebnis gezeigt.",
    ai: "KI", checker: "Text des Prüfprogramms", path: "Feld", none: "Keine Befunde.", page: "Seite erstellt", warning: "Warnung",
    number: "Rechnungsnummer", issue: "Rechnungsdatum", type: "Dokumentart", currency: "Währung", due: "Fälligkeitsdatum", buyerRef: "Käuferreferenz (Leitweg-ID)",
    order: "Bestellreferenz", delivery: "Lieferdatum", periodStart: "Abrechnungszeitraum von", periodEnd: "Abrechnungszeitraum bis", spec: "Spezifikation",
    process: "Geschäftsprozess", preceding: "Vorausgegangene Rechnung", terms: "Zahlungsbedingungen", exemption: "Grund der Steuerbefreiung", format: "Syntax",
    name: "Name", vatId: "USt-IdNr.", id: "Kennung", legalId: "Registernummer", street: "Straße", postal: "PLZ", city: "Ort", country: "Land",
    endpoint: "Elektronische Adresse", contact: "Kontakt", phone: "Telefon", email: "E-Mail",
    desc: "Bezeichnung", qty: "Menge", price: "Einzelpreis", net: "Nettobetrag", cat: "USt-Kategorie", rate: "USt %", taxable: "Bemessungsgrundlage", tax: "Steuerbetrag",
    totNet: "Summe ohne USt", totTax: "Summe USt", totGross: "Summe mit USt", prepaid: "Bereits gezahlt", rounding: "Rundung", payable: "Zahlbetrag",
    taxAcc: "USt in Buchungswährung", means: "Zahlungsart", iban: "IBAN", bic: "BIC", remittance: "Verwendungszweck",
  },
  fr: {
    title: "Facture électronique", reading: "Vue lisible du fichier de facture électronique. Le XML est la facture ; cette page est une aide à la lecture et n'y change rien.",
    file: "Fichier", checked: "Contrôlé le", pass: "Aucune erreur bloquante", fail: "Erreurs bloquantes", blocking: "bloquantes", warnings: "avertissements",
    rules: "Règles appliquées", builtIn: "règles intégrées", official: "Schematron officiel", detected: "détecté dans le fichier",
    general: "Constats sans champ unique", seller: "Vendeur", buyer: "Acheteur", details: "Informations de la facture", lines: "Lignes de facture",
    vat: "Ventilation de la TVA", totals: "Totaux", payment: "Paiement", notes: "Notes", other: "Autres valeurs lues dans le fichier",
    missing: "absent", unreadable: "Cette vue présente les factures EN 16931 (UBL, CII, Factur-X / ZUGFeRD). Ce fichier est dans un autre format ou n'a pas pu être lu ; seul le résultat du contrôle est affiché.",
    ai: "IA", checker: "Texte du contrôleur", path: "Champ", none: "Aucun constat.", page: "Page générée le", warning: "avertissement",
    number: "Numéro de facture", issue: "Date d'émission", type: "Type de document", currency: "Devise", due: "Date d'échéance", buyerRef: "Référence acheteur",
    order: "Référence de commande", delivery: "Date de livraison", periodStart: "Période facturée du", periodEnd: "Période facturée au", spec: "Spécification",
    process: "Processus métier", preceding: "Facture antérieure", terms: "Conditions de paiement", exemption: "Motif d'exonération de TVA", format: "Syntaxe",
    name: "Nom", vatId: "N° de TVA", id: "Identifiant", legalId: "Immatriculation (SIREN, SIRET…)", street: "Rue", postal: "Code postal", city: "Ville", country: "Pays",
    endpoint: "Adresse électronique", contact: "Contact", phone: "Téléphone", email: "E-mail",
    desc: "Désignation", qty: "Quantité", price: "Prix unitaire", net: "Montant HT", cat: "Catégorie de TVA", rate: "TVA %", taxable: "Base imposable", tax: "Montant de TVA",
    totNet: "Total HT", totTax: "Total TVA", totGross: "Total TTC", prepaid: "Acompte versé", rounding: "Arrondi", payable: "Net à payer",
    taxAcc: "TVA en devise comptable", means: "Moyen de paiement", iban: "IBAN", bic: "BIC", remittance: "Référence de paiement",
  },
  nl: {
    title: "E-factuur", reading: "Leesbare weergave van het e-factuurbestand. De XML is de factuur; deze pagina is een leeshulp en wijzigt er niets aan.",
    file: "Bestand", checked: "Gecontroleerd", pass: "Geen blokkerende fouten", fail: "Blokkerende fouten", blocking: "blokkerend", warnings: "waarschuwingen",
    rules: "Toegepaste regels", builtIn: "ingebouwde regels", official: "officiële Schematron", detected: "uit het bestand herkend",
    general: "Bevindingen zonder één veld", seller: "Verkoper", buyer: "Koper", details: "Factuurgegevens", lines: "Factuurregels",
    vat: "Btw-specificatie", totals: "Totalen", payment: "Betaling", notes: "Opmerkingen", other: "Andere waarden uit het bestand",
    missing: "ontbreekt", unreadable: "Deze weergave toont EN 16931-facturen (UBL, CII, Factur-X / ZUGFeRD). Dit bestand heeft een ander formaat of kon niet worden gelezen; alleen het resultaat van de controle wordt getoond.",
    ai: "AI", checker: "Tekst van de controle", path: "Veld", none: "Geen bevindingen.", page: "Pagina gemaakt", warning: "waarschuwing",
    number: "Factuurnummer", issue: "Factuurdatum", type: "Documentsoort", currency: "Valuta", due: "Vervaldatum", buyerRef: "Referentie koper",
    order: "Ordernummer", delivery: "Leverdatum", periodStart: "Factuurperiode van", periodEnd: "Factuurperiode tot", spec: "Specificatie",
    process: "Bedrijfsproces", preceding: "Eerdere factuur", terms: "Betalingsvoorwaarden", exemption: "Reden btw-vrijstelling", format: "Syntaxis",
    name: "Naam", vatId: "Btw-nummer", id: "Kenmerk", legalId: "Inschrijving (KBO, KvK…)", street: "Straat", postal: "Postcode", city: "Plaats", country: "Land",
    endpoint: "Elektronisch adres", contact: "Contactpersoon", phone: "Telefoon", email: "E-mail",
    desc: "Omschrijving", qty: "Aantal", price: "Prijs per eenheid", net: "Nettobedrag", cat: "Btw-categorie", rate: "Btw %", taxable: "Maatstaf van heffing", tax: "Btw-bedrag",
    totNet: "Totaal excl. btw", totTax: "Totaal btw", totGross: "Totaal incl. btw", prepaid: "Vooruitbetaald", rounding: "Afronding", payable: "Te betalen",
    taxAcc: "Btw in boekhoudvaluta", means: "Betaalwijze", iban: "IBAN", bic: "BIC", remittance: "Betalingskenmerk",
  },
  pl: {
    title: "E-faktura", reading: "Czytelny widok pliku e-faktury. Fakturą jest plik XML; ta strona tylko ułatwia odczyt i niczego w nim nie zmienia.",
    file: "Plik", checked: "Sprawdzono", pass: "Brak błędów blokujących", fail: "Błędy blokujące", blocking: "blokujące", warnings: "ostrzeżenia",
    rules: "Zastosowane reguły", builtIn: "wbudowane reguły", official: "oficjalny Schematron", detected: "rozpoznany z pliku",
    general: "Ustalenia niezwiązane z jednym polem", seller: "Sprzedawca", buyer: "Nabywca", details: "Dane faktury", lines: "Pozycje faktury",
    vat: "Zestawienie VAT", totals: "Sumy", payment: "Płatność", notes: "Uwagi", other: "Inne wartości odczytane z pliku",
    missing: "brak", unreadable: "Ten widok przedstawia faktury EN 16931 (UBL, CII, Factur-X / ZUGFeRD). Ten plik ma inny format lub nie udało się go odczytać, dlatego pokazano tylko wynik kontroli.",
    ai: "AI", checker: "Tekst walidatora", path: "Pole", none: "Brak ustaleń.", page: "Strona utworzona", warning: "ostrzeżenie",
    number: "Numer faktury", issue: "Data wystawienia", type: "Rodzaj dokumentu", currency: "Waluta", due: "Termin płatności", buyerRef: "Referencja nabywcy",
    order: "Numer zamówienia", delivery: "Data dostawy", periodStart: "Okres rozliczeniowy od", periodEnd: "Okres rozliczeniowy do", spec: "Specyfikacja",
    process: "Proces biznesowy", preceding: "Faktura pierwotna", terms: "Warunki płatności", exemption: "Podstawa zwolnienia z VAT", format: "Składnia",
    name: "Nazwa", vatId: "NIP / numer VAT", id: "Identyfikator", legalId: "Numer rejestrowy", street: "Ulica", postal: "Kod pocztowy", city: "Miejscowość", country: "Kraj",
    endpoint: "Adres elektroniczny", contact: "Kontakt", phone: "Telefon", email: "E-mail",
    desc: "Opis", qty: "Ilość", price: "Cena jednostkowa", net: "Kwota netto", cat: "Kategoria VAT", rate: "VAT %", taxable: "Podstawa opodatkowania", tax: "Kwota VAT",
    totNet: "Razem bez VAT", totTax: "Razem VAT", totGross: "Razem z VAT", prepaid: "Zapłacono z góry", rounding: "Zaokrąglenie", payable: "Do zapłaty",
    taxAcc: "VAT w walucie księgowej", means: "Forma płatności", iban: "IBAN", bic: "BIC", remittance: "Tytuł płatności",
  },
};

/** UNTDID 1001 document types the EN 16931 profiles use, named per language. */
const DOC_TYPES = {
  "380": { en: "Commercial invoice", de: "Handelsrechnung", fr: "Facture commerciale", nl: "Handelsfactuur", pl: "Faktura handlowa" },
  "381": { en: "Credit note", de: "Gutschrift (Rechnungskorrektur)", fr: "Avoir", nl: "Creditnota", pl: "Faktura korygująca (nota kredytowa)" },
  "383": { en: "Debit note", de: "Belastungsanzeige", fr: "Note de débit", nl: "Debetnota", pl: "Nota obciążeniowa" },
  "384": { en: "Corrected invoice", de: "Korrigierte Rechnung", fr: "Facture rectificative", nl: "Gecorrigeerde factuur", pl: "Faktura skorygowana" },
  "386": { en: "Prepayment invoice", de: "Vorauszahlungsrechnung", fr: "Facture d'acompte", nl: "Vooruitbetalingsfactuur", pl: "Faktura zaliczkowa" },
  "389": { en: "Self-billed invoice", de: "Gutschrift (Selbstfakturierung)", fr: "Autofacture", nl: "Self-billing factuur", pl: "Samofakturowanie" },
  "326": { en: "Partial invoice", de: "Teilrechnung", fr: "Facture partielle", nl: "Deelfactuur", pl: "Faktura częściowa" },
  "875": { en: "Partial construction invoice", de: "Abschlagsrechnung (Bau)", fr: "Situation de travaux", nl: "Termijnfactuur (bouw)", pl: "Faktura częściowa (budowa)" },
  "877": { en: "Final construction invoice", de: "Schlussrechnung (Bau)", fr: "Décompte final de travaux", nl: "Eindafrekening (bouw)", pl: "Faktura końcowa (budowa)" },
};

/** UNCL 5305 VAT categories. */
const TAX_CATS = {
  S: { en: "Standard rate", de: "Normalsatz", fr: "Taux normal", nl: "Normaal tarief", pl: "Stawka podstawowa" },
  Z: { en: "Zero rated", de: "Nullsatz", fr: "Taux zéro", nl: "Nultarief", pl: "Stawka zerowa" },
  E: { en: "Exempt", de: "Steuerbefreit", fr: "Exonéré", nl: "Vrijgesteld", pl: "Zwolnione" },
  AE: { en: "Reverse charge", de: "Umkehr der Steuerschuld", fr: "Autoliquidation", nl: "Verlegd", pl: "Odwrotne obciążenie" },
  K: { en: "Intra-EU supply", de: "Innergemeinschaftliche Lieferung", fr: "Livraison intracommunautaire", nl: "Intracommunautaire levering", pl: "Dostawa wewnątrzwspólnotowa" },
  G: { en: "Export outside the EU", de: "Ausfuhr", fr: "Exportation hors UE", nl: "Uitvoer buiten de EU", pl: "Eksport poza UE" },
  O: { en: "Not subject to VAT", de: "Nicht steuerbar", fr: "Hors champ de la TVA", nl: "Niet onderworpen aan btw", pl: "Niepodlegające VAT" },
  L: { en: "Canary Islands IGIC", de: "IGIC (Kanaren)", fr: "IGIC (Canaries)", nl: "IGIC (Canarische Eilanden)", pl: "IGIC (Wyspy Kanaryjskie)" },
  M: { en: "Ceuta and Melilla IPSI", de: "IPSI (Ceuta und Melilla)", fr: "IPSI (Ceuta et Melilla)", nl: "IPSI (Ceuta en Melilla)", pl: "IPSI (Ceuta i Melilla)" },
};

/** UNCL 4461 payment means seen on EN 16931 invoices. */
const MEANS = {
  "10": { en: "Cash", de: "Bar", fr: "Espèces", nl: "Contant", pl: "Gotówka" },
  "30": { en: "Credit transfer", de: "Überweisung", fr: "Virement", nl: "Overschrijving", pl: "Przelew" },
  "31": { en: "Debit transfer", de: "Überweisung (Lastschrift)", fr: "Virement de débit", nl: "Debetoverschrijving", pl: "Przelew obciążeniowy" },
  "42": { en: "Payment to bank account", de: "Zahlung auf Bankkonto", fr: "Paiement sur compte bancaire", nl: "Betaling op bankrekening", pl: "Wpłata na rachunek bankowy" },
  "48": { en: "Bank card", de: "Bankkarte", fr: "Carte bancaire", nl: "Betaalkaart", pl: "Karta płatnicza" },
  "49": { en: "Direct debit", de: "Lastschrift", fr: "Prélèvement", nl: "Incasso", pl: "Polecenie zapłaty" },
  "57": { en: "Standing agreement", de: "Dauerauftrag", fr: "Accord permanent", nl: "Doorlopende opdracht", pl: "Zlecenie stałe" },
  "58": { en: "SEPA credit transfer", de: "SEPA-Überweisung", fr: "Virement SEPA", nl: "SEPA-overschrijving", pl: "Przelew SEPA" },
  "59": { en: "SEPA direct debit", de: "SEPA-Lastschrift", fr: "Prélèvement SEPA", nl: "SEPA-incasso", pl: "Polecenie zapłaty SEPA" },
  "97": { en: "Clearing between partners", de: "Verrechnung", fr: "Compensation", nl: "Verrekening", pl: "Kompensata" },
};

/** @param {unknown} v */
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/**
 * The parsers keep element text as written (`R&amp;D`, `&#228;`); decode the references once so
 * the page shows the characters, then escape them again for HTML.
 * @param {any} v @returns {any}
 */
function decoded(v) {
  if (typeof v === "string") return decodeXmlRefs(v);
  if (Array.isArray(v)) return v.map(decoded);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decoded(x)]));
  return v;
}

/** @param {unknown} v */
const present = (v) => v !== undefined && v !== null && v !== "";

/** @param {unknown} value */
export function viewLang(value) {
  const v = String(value ?? "").toLowerCase().slice(0, 2);
  return /** @type {Lang} */ (v === "de" || v === "fr" || v === "nl" || v === "pl" ? v : "en");
}

/** A code with its name in the reader's language, when the code list has one. @param {Record<string, Record<Lang, string>>} list @param {unknown} code @param {Lang} lang */
function coded(list, code, lang) {
  const name = list[String(code ?? "").trim()]?.[lang];
  return name ? `${name} (${String(code)})` : String(code ?? "");
}

/** @param {any} v */
function flat(v) {
  if (v && typeof v === "object" && "id" in v) return v.scheme ? `${v.id} (${v.scheme})` : String(v.id);
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/**
 * The invoice as a printable HTML page with the check's findings on the fields they are about.
 * @param {any} invoice the parsed invoice (report.mjs inspectInvoiceSource), or null when unreadable
 * @param {Check} check the result of check.mjs checkInvoice
 * @param {{ lang?: string, now?: Date }} [opts]
 */
export function renderInvoiceView(invoice, check, opts = {}) {
  const lang = viewLang(opts.lang);
  const t = T[lang];
  invoice = invoice ? decoded(invoice) : null;
  /** @param {Finding} f */
  const blockingOf = (f) => isBlocking(f);
  const findings = (check.findings ?? []).map((f, i) => ({ f, n: i + 1, placed: false }));

  /** Findings whose path is exactly `path` (marked placed). @param {string} path */
  const at = (path) => {
    const hit = findings.filter((x) => !x.placed && x.f.path === path);
    for (const x of hit) x.placed = true;
    return hit;
  };
  /** Unplaced findings under `prefix` (the group's own path or deeper). @param {string} prefix */
  const under = (prefix) => {
    const hit = findings.filter((x) => !x.placed && typeof x.f.path === "string" && (x.f.path === prefix || x.f.path.startsWith(`${prefix}/`)));
    for (const x of hit) x.placed = true;
    return hit;
  };
  /** Does any unplaced finding point exactly at `path`? @param {string} path */
  const wanted = (path) => findings.some((x) => !x.placed && x.f.path === path);

  /** @param {{ f: Finding, n: number }[]} hits */
  const marks = (hits) =>
    hits.map((x) => ` <a class="mark ${blockingOf(x.f) ? "bad" : "warn"}" href="#f${x.n}" id="m${x.n}">${x.n}</a>`).join("");

  /** @param {{ f: Finding, n: number }[]} hits */
  const findingList = (hits) =>
    hits.length
      ? `<ol class="findings">${hits
          .map(({ f, n }) => {
            const e = f.explanation ?? {};
            const head = e.title || f.message;
            const blocking = blockingOf(f);
            return `<li id="f${n}" value="${n}" class="${blocking ? "bad" : "warn"}"><p><a class="back" href="#m${n}">${n}</a> <code>${esc(f.rule)}</code>${blocking ? "" : ` <span class="sev">(${esc(t.warning)})</span>`} <strong>${esc(head)}</strong></p>${
              e.action ? `<p>${esc(e.action)}</p>` : f.fix ? `<p>${esc(f.fix)}</p>` : ""
            }${e.title ? `<p class="small">${esc(t.checker)}: ${esc(f.message)}</p>` : ""}${f.path ? `<p class="small">${esc(t.path)}: <code>${esc(f.path)}</code></p>` : ""}${
              e.source === "llm" || e.notice ? `<p class="small notice">${e.source === "llm" ? `${esc(t.ai)}: ` : ""}${esc(e.notice ?? "")}</p>` : ""
            }</li>`;
          })
          .join("")}</ol>`
      : "";

  /**
   * Definition rows for the fields shown; a field is shown when the file has it or a finding names it.
   * @param {string} base JSON pointer of the object @param {any} obj @param {[key: string, label: string, bt: string, show?: (v: any) => string][]} fields
   */
  const rows = (base, obj, fields) =>
    fields
      .filter(([k]) => present(obj?.[k]) || wanted(`${base}/${k}`))
      .map(([k, label, bt, show]) => {
        const path = `${base}/${k}`;
        const v = obj?.[k];
        const hits = at(path);
        const value = present(v) ? esc(show ? show(v) : flat(v)) : `<em class="missing">${esc(t.missing)}</em>`;
        return `<tr${hits.length ? ` class="${hits.some((x) => blockingOf(x.f)) ? "bad" : "warn"}"` : ""}><th>${esc(label)}${bt ? ` <span class="bt">${esc(bt)}</span>` : ""}</th><td>${value}${marks(hits)}</td></tr>`;
      })
      .join("");

  /** A titled block: the field rows, then the findings for the group not tied to one of its fields. @param {string} title @param {string} base @param {string} body */
  const section = (title, base, body) => {
    const rest = base ? under(base) : [];
    if (!body && !rest.length) return "";
    return `<section><h2>${esc(title)}${marks(rest)}</h2>${body}</section>`;
  };

  const cur = invoice?.currency ? ` ${invoice.currency}` : "";
  /** @param {any} v */
  const money = (v) => `${String(v)}${cur}`;

  /** @param {"supplier" | "customer"} who */
  const party = (who) => {
    const p = invoice?.[who] ?? {};
    const seller = who === "supplier";
    const fields = /** @type {[string, string, string, ((v: any) => string)?][]} */ ([
      ["name", t.name, seller ? "BT-27" : "BT-44"],
      ["vat_id", t.vatId, seller ? "BT-31" : "BT-48"],
      ["id", t.id, seller ? "BT-29" : "BT-46"],
      ["legal_id", t.legalId, seller ? "BT-30" : "BT-47"],
      ["street", t.street, seller ? "BT-35" : "BT-50"],
      ["postal_code", t.postal, seller ? "BT-38" : "BT-53"],
      ["city", t.city, seller ? "BT-37" : "BT-52"],
      ["country", t.country, seller ? "BT-40" : "BT-55"],
      ["endpoint", t.endpoint, seller ? "BT-34" : "BT-49"],
    ]);
    let body = rows(`/${who}`, p, fields);
    if (p.contact) {
      body += rows(`/${who}/contact`, p.contact, [
        ["name", t.contact, seller ? "BT-41" : "BT-56"],
        ["phone", t.phone, seller ? "BT-42" : "BT-57"],
        ["email", t.email, seller ? "BT-43" : "BT-58"],
      ]);
    }
    if (Array.isArray(p.party_ids)) {
      p.party_ids.forEach((/** @type {any} */ id, /** @type {number} */ i) => {
        const hits = at(`/${who}/party_ids/${i}`);
        body += `<tr><th>${esc(t.id)}</th><td>${esc(flat(id))}${marks(hits)}</td></tr>`;
      });
    }
    return section(seller ? t.seller : t.buyer, `/${who}`, body ? `<table class="kv">${body}</table>` : "");
  };

  const general = () => {
    // Paths outside the invoice model (Schematron and XSD findings name XML paths) and findings
    // with no path at all, plus whatever no section claimed: listed first, so nothing is missed.
    const rest = findings.filter((x) => !x.placed);
    for (const x of rest) x.placed = true;
    return rest;
  };

  const blocking = (check.findings ?? []).filter((f) => blockingOf(f)).length;
  const warnings = (check.findings ?? []).length - blocking;
  const passed = check.status === "pass";
  const rulesRun = [`${t.builtIn}${check.profile ? ` + ${check.profile}${check.profileDetected ? ` (${t.detected})` : ""}` : ""}`];
  if (check.schematron === "ok") rulesRun.push(t.official);
  const when = (opts.now ?? new Date()).toISOString().slice(0, 16).replace("T", " ");

  let main = "";
  if (!invoice) {
    main = `<p class="note">${esc(t.unreadable)}</p>`;
  } else {
    const inv = invoice;
    const details = rows("", inv, [
      ["invoice_number", t.number, "BT-1"],
      ["issue_date", t.issue, "BT-2"],
      ["document_code", t.type, "BT-3", (v) => coded(DOC_TYPES, v, lang)],
      ["currency", t.currency, "BT-5"],
      ["due_date", t.due, "BT-9"],
      ["buyer_reference", t.buyerRef, "BT-10"],
      ["order_reference", t.order, "BT-13"],
      ["original_invoice", t.preceding, "BT-25"],
      ["delivery_date", t.delivery, "BT-72"],
      ["terms", t.terms, "BT-20"],
      ["tax_exemption_reason", t.exemption, "BT-120"],
      ["profile_id", t.process, "BT-23"],
      ["specification_id", t.spec, "BT-24"],
    ]);
    const period = inv.period ? rows("/period", inv.period, [["start", t.periodStart, "BT-73"], ["end", t.periodEnd, "BT-74"]]) : "";
    const fmt = inv.source_format ? `<tr><th>${esc(t.format)}</th><td>${esc(String(inv.source_format).toUpperCase())}</td></tr>` : "";
    main += section(t.details, "", `<table class="kv">${details}${period}${fmt}</table>`);
    main += `<div class="parties">${party("supplier")}${party("customer")}</div>`;

    const lines = Array.isArray(inv.lines) ? inv.lines : [];
    if (lines.length || wanted("/lines")) {
      const body = lines
        .map((/** @type {any} */ l, /** @type {number} */ i) => {
          const base = `/lines/${i}`;
          /** @param {string} k @param {(v: any) => string} [show] @param {string} [cls] */
          const cell = (k, show, cls) => {
            const hits = at(`${base}/${k}`);
            const v = l?.[k];
            const shown = present(v) ? esc(show ? show(v) : flat(v)) : hits.length ? `<em class="missing">${esc(t.missing)}</em>` : "";
            const bad = hits.some((x) => blockingOf(x.f)) ? "bad" : hits.length ? "warn" : "";
            return `<td class="${[cls, bad].filter(Boolean).join(" ")}">${shown}${marks(hits)}</td>`;
          };
          const own = under(base);
          return `<tr><td class="num">${i + 1}${marks(own)}</td>${cell("description")}${cell("quantity", undefined, "num")}${cell("unit_price", undefined, "num")}${cell("net", undefined, "num")}${cell(
            "tax_category",
            (v) => coded(TAX_CATS, v, lang),
          )}${cell("tax_percent", undefined, "num")}</tr>`;
        })
        .join("");
      const head = `<tr><th>#</th><th>${esc(t.desc)} <span class="bt">BT-153</span></th><th class="num">${esc(t.qty)} <span class="bt">BT-129</span></th><th class="num">${esc(t.price)} <span class="bt">BT-146</span></th><th class="num">${esc(t.net)} <span class="bt">BT-131</span></th><th>${esc(t.cat)} <span class="bt">BT-151</span></th><th class="num">${esc(t.rate)} <span class="bt">BT-152</span></th></tr>`;
      main += section(`${t.lines}${cur ? ` (${cur.trim()})` : ""}`, "/lines", `<table class="grid"><thead>${head}</thead><tbody>${body}</tbody></table>`);
    }

    const breakdown = Array.isArray(inv.tax_breakdown) ? inv.tax_breakdown : [];
    if (breakdown.length || wanted("/tax_breakdown")) {
      const body = breakdown
        .map((/** @type {any} */ b, /** @type {number} */ i) => {
          const base = `/tax_breakdown/${i}`;
          /** @param {string} k @param {(v: any) => string} [show] @param {string} [cls] */
          const cell = (k, show, cls) => {
            const hits = at(`${base}/${k}`);
            const v = b?.[k];
            const bad = hits.some((x) => blockingOf(x.f)) ? "bad" : hits.length ? "warn" : "";
            return `<td class="${[cls, bad].filter(Boolean).join(" ")}">${present(v) ? esc(show ? show(v) : flat(v)) : ""}${marks(hits)}</td>`;
          };
          const own = under(base);
          return `<tr>${cell("tax_category", (v) => coded(TAX_CATS, v, lang))}${cell("tax_percent", undefined, "num")}${cell("taxable", undefined, "num")}${cell("tax", undefined, "num")}<td>${marks(own)}</td></tr>`;
        })
        .join("");
      const head = `<tr><th>${esc(t.cat)} <span class="bt">BT-118</span></th><th class="num">${esc(t.rate)} <span class="bt">BT-119</span></th><th class="num">${esc(t.taxable)} <span class="bt">BT-116</span></th><th class="num">${esc(t.tax)} <span class="bt">BT-117</span></th><th></th></tr>`;
      main += section(`${t.vat}${cur ? ` (${cur.trim()})` : ""}`, "/tax_breakdown", `<table class="grid"><thead>${head}</thead><tbody>${body}</tbody></table>`);
    }

    const totals = rows("/totals", inv.totals ?? {}, [
      ["net", t.totNet, "BT-109", money],
      ["tax", t.totTax, "BT-110", money],
      ["tax_accounting_currency", t.taxAcc, "BT-111"],
      ["gross", t.totGross, "BT-112", money],
      ["prepaid", t.prepaid, "BT-113", money],
      ["rounding", t.rounding, "BT-114", money],
      ["due", t.payable, "BT-115", money],
    ]);
    main += section(t.totals, "/totals", totals ? `<table class="kv totals">${totals}</table>` : "");

    const pay = rows("/payment", inv.payment ?? {}, [
      ["means", t.means, "BT-81", (v) => coded(MEANS, v, lang)],
      ["iban", t.iban, "BT-84"],
      ["bic", t.bic, "BT-86"],
      ["remittance", t.remittance, "BT-83"],
    ]);
    main += section(t.payment, "/payment", pay ? `<table class="kv">${pay}</table>` : "");

    const notes = Array.isArray(inv.notes) ? inv.notes : [];
    if (notes.length) main += section(t.notes, "/notes", `<ul class="notes">${notes.map((/** @type {unknown} */ n, /** @type {number} */ i) => `<li>${esc(n)}${marks(at(`/notes/${i}`))}</li>`).join("")}</ul>`);

    // Anything the parser read that the sections above do not show, so the page hides nothing.
    const SHOWN = new Set(["invoice_number", "issue_date", "document_code", "document_type", "currency", "due_date", "buyer_reference", "order_reference", "original_invoice", "delivery_date", "terms", "tax_exemption_reason", "profile_id", "specification_id", "period", "source_format", "supplier", "customer", "lines", "tax_breakdown", "totals", "payment", "notes"]);
    /** @type {[string, string][]} */
    const other = [];
    /** @param {any} v @param {string} p */
    const walk = (v, p) => {
      if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${p}/${Array.isArray(v) ? k : k}`);
      else if (present(v)) other.push([p, String(v)]);
    };
    for (const [k, v] of Object.entries(inv)) if (!SHOWN.has(k)) walk(v, `/${k}`);
    for (const k of ["supplier", "customer"]) {
      for (const [kk, v] of Object.entries(inv[k] ?? {})) if (!["name", "vat_id", "id", "legal_id", "street", "postal_code", "city", "country", "endpoint", "contact", "party_ids"].includes(kk)) walk(v, `/${k}/${kk}`);
    }
    if (other.length) {
      main += `<section class="other"><h2>${esc(t.other)}</h2><table class="kv">${other.map(([p, v]) => `<tr><th><code>${esc(p)}</code></th><td>${esc(v)}${marks(at(p))}</td></tr>`).join("")}</table></section>`;
    }
  }

  const rest = general();
  const all = findings.length ? "" : `<p class="small">${esc(t.none)}</p>`;
  const top = rest.length ? `<section class="general"><h2>${esc(t.general)}</h2>${findingList(rest)}</section>` : "";
  // Every finding, in order, at the end: the marks on the fields link here.
  const listAll = findings.length ? `<section class="all"><h2>${esc(lang === "de" ? "Alle Befunde" : lang === "fr" ? "Tous les constats" : lang === "nl" ? "Alle bevindingen" : lang === "pl" ? "Wszystkie ustalenia" : "All findings")}</h2>${findingList(findings.filter((x) => !rest.includes(x)))}</section>` : "";

  const number = invoice?.invoice_number ? ` ${invoice.invoice_number}` : "";
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${META_CSP}">
<meta name="referrer" content="no-referrer">
<title>${esc(`${t.title}${number}`)}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
<h1>${esc(`${t.title}${number}`)}</h1>
<p class="verdict ${passed ? "ok" : "bad"}">${esc(passed ? t.pass : t.fail)} · ${blocking} ${esc(t.blocking)}, ${warnings} ${esc(t.warnings)}</p>
<p class="small">${esc(t.reading)}</p>
<p class="small">${esc(t.file)}: <code>${esc(check.file ?? "")}</code>${check.sha256 ? ` · SHA-256 <code>${esc(check.sha256)}</code>` : ""}<br>${esc(t.rules)}: ${esc(rulesRun.join("; "))} · ${esc(t.page)} ${esc(when)} UTC</p>
</header>
<main>
${top}${main}${listAll}${all}
</main>
</body>
</html>
`;
}

const STYLE = `
:root{color-scheme:light;--ink:#1d2430;--muted:#5b6575;--line:#d9dee6;--bad:#b3261e;--badbg:#fdecea;--warn:#8a5a00;--warnbg:#fff6e0;--ok:#1e6b34}
*{box-sizing:border-box}
body{margin:0 auto;max-width:960px;padding:24px 16px;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:#fff}
h1{font-size:22px;margin:0 0 6px}
h2{font-size:15px;margin:22px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--line)}
code{font:12px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
.small{font-size:12px;color:var(--muted);margin:4px 0}
.verdict{font-weight:600;margin:4px 0}.verdict.ok{color:var(--ok)}.verdict.bad{color:var(--bad)}
.note{padding:10px;border:1px solid var(--line);background:#f6f7f9}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;vertical-align:top;padding:4px 6px;border-bottom:1px solid var(--line);overflow-wrap:anywhere}
.kv th{width:42%;font-weight:500;color:var(--muted)}
.grid{font-size:13px}.grid th{font-weight:500;color:var(--muted);font-size:12px}
.num{text-align:right;white-space:nowrap}
.bt{font-size:10px;color:var(--muted);font-weight:400;white-space:nowrap}
tr.bad td,td.bad{background:var(--badbg)}tr.warn td,td.warn{background:var(--warnbg)}
.missing{color:var(--bad)}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:0 24px}
@media (max-width:640px){.parties{grid-template-columns:1fr}.grid{display:block;overflow-x:auto}}
.mark{display:inline-block;min-width:18px;padding:0 4px;margin-left:4px;border-radius:9px;font-size:11px;font-weight:700;text-align:center;text-decoration:none;color:#fff;vertical-align:1px}
.mark.bad{background:var(--bad)}.mark.warn{background:var(--warn)}
.findings{list-style:none;padding:0;margin:0}
.findings li{border-left:4px solid var(--bad);padding:6px 10px;margin:0 0 8px;background:var(--badbg)}
.findings li.warn{border-color:var(--warn);background:var(--warnbg)}
.findings p{margin:2px 0}
.back{font-weight:700;color:inherit}
.notes{margin:0;padding-left:18px}
@media print{body{padding:0;max-width:none;font-size:11px}a{color:inherit;text-decoration:none}.mark{color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}tr,li{break-inside:avoid}h2{break-after:avoid}td.bad,td.warn,tr.bad td,tr.warn td,.findings li{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;
