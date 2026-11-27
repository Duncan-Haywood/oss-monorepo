// Reads the receipts and notices Italy's Sistema di Interscambio (SdI) sends back
// for a FatturaPA file: the rejection receipt (ricevuta di scarto, NS), delivery
// receipt (RC), could-not-deliver receipt (MC), metadata notice (MT), and the
// public-administration flow's outcome (NE, EC01/EC02), deadline (DT),
// transmission attestation (AT) and refused-outcome (SE) notices. Both namespaces
// are read: the B2B one (ivaservizi.agenziaentrate.gov.it/.../messaggi/v1.0,
// RicevutaScarto with Hash and Suggerimento) and the older PA one
// (www.fatturapa.gov.it/sdi/messaggi/v1.0, NotificaScarto).
//
// Every error code in a rejection is explained from the Agenzia delle Entrate's
// specification 1.9 (Allegato A, read 2026-11-13 and 2026-11-15; its control list,
// Appendix 1), with the rule of this tool that checks the same fault offline, or
// the reason no file-only check can (tax-register lookups, the signature, SdI's
// archive). When the invoice the receipt is about is in the same batch, the
// receipt is paired with it by file name or SHA-256 (the receipt's Hash is the
// SHA-256 of the file SdI received, specification 1.9 Appendix 6), and each code
// is marked reproduced or not by this checker on that file.
//
// This reads what SdI said; it is not SdI and not tax advice. Long digit runs in
// SdI's own text (tax numbers) are withheld from the findings.
import { parseXmlTree } from "./ubl.mjs";
import { sha256 } from "./zatca-stamp.mjs";

const KINDS = {
  RicevutaScarto: { code: "NS", name: "rejection receipt (ricevuta di scarto)" },
  NotificaScarto: { code: "NS", name: "rejection notice (notifica di scarto, public-administration flow)" },
  RicevutaConsegna: { code: "RC", name: "delivery receipt (ricevuta di consegna)" },
  RicevutaImpossibilitaRecapito: { code: "MC", name: "could-not-deliver receipt (ricevuta di impossibilità di recapito)" },
  NotificaMancataConsegna: { code: "MC", name: "could-not-deliver notice (notifica di mancata consegna, public-administration flow)" },
  NotificaEsito: { code: "NE", name: "buyer's outcome notice (notifica esito)" },
  NotificaEsitoCommittente: { code: "EC", name: "buyer's outcome message (notifica esito committente)" },
  ScartoEsitoCommittente: { code: "SE", name: "refusal of the buyer's outcome (scarto esito committente)" },
  NotificaDecorrenzaTermini: { code: "DT", name: "deadline notice (notifica di decorrenza termini)" },
  AttestazioneTrasmissioneFattura: { code: "AT", name: "transmission attestation (attestazione di avvenuta trasmissione)" },
  FileMetadati: { code: "MT", name: "metadata notice (file metadati)" },
  MetadatiInvioFile: { code: "MT", name: "metadata notice (metadati invio file)" },
};

const SCHEMA_RULES = ["IT-018", "IT-019", "IT-020", "IT-021", "IT-022"];
const REGISTER = "SdI checks this against the tax register (anagrafe tributaria) or its own records, which no file-only check can see";
const TRANSPORT = "it concerns the file name, size, compression or signature, which this tool does not model";
const why = (code) => (/^00[01]/.test(code) ? TRANSPORT : REGISTER);

// Specification 1.9, Appendix 1 ("Elenco controlli"). `rules`: this tool's rules that
// check the same fault offline; `offline`: "yes", "partly" (a check digit or a shape, not
// the register) or "no". `what` paraphrases the specification's Italian text.
export const SDI_CODES = {
  "00001": { what: "The file name is not valid.", fix: "Name the file country code + sender's tax id + _ + a 5-character progressive, e.g. IT01234567890_00001.xml (specification 1.9, section 1.2.2).", offline: "no", rules: [] },
  "00002": { what: "A file with this name was already sent.", fix: "Every file sent to SdI needs a name it has never seen: change the progressive part of the name and send it again.", offline: "no", rules: [] },
  "00003": { what: "The file is larger than the channel allows.", fix: "Split the batch or reduce attachments (Allegati) and send again.", offline: "no", rules: [] },
  "00100": { what: "The signing certificate has expired.", fix: "Sign again with a valid qualified certificate.", offline: "no", rules: [] },
  "00101": { what: "The signing certificate is revoked.", fix: "Sign again with a valid qualified certificate.", offline: "no", rules: [] },
  "00102": { what: "The file's electronic signature is not valid: the file was changed after it was signed, or the signature is broken.", fix: "Sign the final file again and send it without touching it afterwards (no re-saving, re-encoding or line-end changes).", offline: "no", rules: [] },
  "00103": { what: "The qualified signature has no time reference.", fix: "Sign with a time reference.", offline: "no", rules: [] },
  "00104": { what: "The certificate's issuing CA is not on the list of trusted CAs.", fix: "Sign with a certificate from a trusted (AgID-listed) CA.", offline: "no", rules: [] },
  "00105": { what: "The signature's time reference is later than the time SdI received the file.", fix: "Check the signing device's clock and sign again.", offline: "no", rules: [] },
  "00106": { what: "The compressed file is empty or cannot be read.", fix: "Rebuild the ZIP and check it opens before sending.", offline: "no", rules: [] },
  "00107": { what: "The signing certificate is not valid.", fix: "Sign again with a valid qualified certificate.", offline: "no", rules: [] },
  "00200": { what: "The file does not conform to the format (SdI's description names the exact point).", fix: "Correct the element SdI names; this tool's schema rules IT-018 to IT-022 check the same XSD 1.2.3.", offline: "yes", rules: SCHEMA_RULES },
  "00201": { what: "More than 50 format errors: SdI stopped checking and lists only the first ones.", fix: "Fix the listed errors, then check the whole file again; more will follow.", offline: "yes", rules: SCHEMA_RULES },
  "00300": { what: "The transmitter's tax id (1.1.1.2 IdTrasmittente/IdCodice) is not valid.", fix: "Use the transmitter's partita IVA or codice fiscale exactly as registered.", offline: "partly", rules: ["IT-034"] },
  "00301": { what: "The seller's VAT number (1.2.1.1.2 IdCodice) is not valid.", fix: "Use the seller's partita IVA exactly as registered.", offline: "partly", rules: ["IT-003", "INV-023"] },
  "00303": { what: "The tax representative's or third-party issuer's VAT number (1.3.1.1.2 or 1.4.4.1.2 IdCodice) is not valid.", fix: "Use that party's partita IVA exactly as registered.", offline: "no", rules: [] },
  "00305": { what: "The buyer's VAT number (1.4.1.1.2 IdCodice) is not valid.", fix: "Use the buyer's partita IVA exactly as registered; ask the buyer for it if in doubt.", offline: "partly", rules: ["IT-003", "INV-023"] },
  "00306": { what: "The buyer's codice fiscale (1.4.1.2) is not valid (checked only when the buyer has no VAT number).", fix: "Use the buyer's codice fiscale from their tessera sanitaria or company record.", offline: "partly", rules: ["IT-004"] },
  "00311": { what: "The CodiceDestinatario (1.1.4) is not valid.", fix: "Re-key the buyer's 7-character code (6 for a public body), or use 0000000.", offline: "partly", rules: ["IT-002"] },
  "00312": { what: "The CodiceDestinatario (1.1.4) is not active.", fix: "Ask the buyer for their current code, or use 0000000 and let SdI place the invoice in their reserved area.", offline: "no", rules: [] },
  "00313": { what: "CodiceDestinatario XXXXXXX is only for buyers not resident in Italy (the buyer's IdFiscaleIVA must be present with an IdPaese other than IT).", fix: "Use the buyer's real code, or 0000000, for an Italian buyer.", offline: "yes", rules: ["IT-002"] },
  "00320": { what: "The seller's VAT number and codice fiscale do not match each other.", fix: "Check both against the seller's registration.", offline: "no", rules: [] },
  "00321": { what: "The seller's codice fiscale belongs to someone not in the VAT group.", fix: "Use the codice fiscale of the group member issuing the invoice.", offline: "no", rules: [] },
  "00322": { what: "The seller's codice fiscale is missing with a VAT-group IdFiscaleIVA.", fix: "Add the issuing member's codice fiscale (1.2.1.2).", offline: "no", rules: [] },
  "00323": { what: "The seller's VAT number was closed more than 5 years ago.", fix: "Use the seller's current partita IVA.", offline: "no", rules: [] },
  "00324": { what: "The buyer's VAT number and codice fiscale do not match each other.", fix: "Check both with the buyer.", offline: "no", rules: [] },
  "00325": { what: "The buyer's codice fiscale belongs to someone not in the VAT group.", fix: "Use the codice fiscale of the group member being invoiced.", offline: "no", rules: [] },
  "00326": { what: "The buyer's codice fiscale is missing with a VAT-group IdFiscaleIVA.", fix: "Add the member's codice fiscale (1.4.1.2).", offline: "no", rules: [] },
  "00330": { what: "PECDestinatario holds a value that is not allowed (SdI's own address).", fix: "Put the buyer's own PEC address, or leave it out.", offline: "yes", rules: ["IT-002"] },
  "00400": { what: "A line at 0% VAT has no Natura (2.2.1.14).", fix: "Add the Natura code that explains why the line is not taxed.", offline: "yes", rules: ["IT-011"] },
  "00401": { what: "A line with a VAT rate above zero has a Natura (allowed only for TD16).", fix: "Remove Natura from taxed lines.", offline: "yes", rules: ["IT-011"] },
  "00403": { what: "The invoice date (2.1.1.3) is after the day SdI received the file.", fix: "Date the invoice no later than the day it is sent.", offline: "yes", rules: ["IT-009"] },
  "00404": { what: "Duplicate invoice: SdI already has one from this seller with the same year and number.", fix: "If the earlier one was accepted, do not resend it; a new invoice needs a new number.", offline: "no", rules: [] },
  "00409": { what: "Duplicate invoice within the batch.", fix: "Give each invoice in the batch its own number.", offline: "no", rules: [] },
  "00411": { what: "A line has Ritenuta SI but there is no DatiRitenuta block.", fix: "Add DatiRitenuta (2.1.1.5) or remove Ritenuta from the line.", offline: "yes", rules: ["IT-027"] },
  "00413": { what: "A pension-fund contribution at 0% has no Natura.", fix: "Add Natura to DatiCassaPrevidenziale.", offline: "yes", rules: ["IT-011"] },
  "00414": { what: "A taxed pension-fund contribution has a Natura.", fix: "Remove Natura from the taxed contribution.", offline: "yes", rules: ["IT-011"] },
  "00415": { what: "A pension-fund contribution has Ritenuta SI but there is no DatiRitenuta block.", fix: "Add DatiRitenuta (2.1.1.5).", offline: "yes", rules: ["IT-027"] },
  "00417": { what: "The buyer has neither IdFiscaleIVA nor CodiceFiscale.", fix: "Add at least one of the buyer's partita IVA or codice fiscale.", offline: "yes", rules: ["IT-005"] },
  "00418": { what: "The invoice date is before the date of the document it links to (2.1.6.3).", fix: "Check the linked document's date or the invoice date.", offline: "yes", rules: ["IT-033"] },
  "00419": { what: "A VAT rate used on a line or contribution has no DatiRiepilogo.", fix: "Add a DatiRiepilogo for every rate used.", offline: "yes", rules: ["IT-024"] },
  "00420": { what: "Natura N6.x (reverse charge) with EsigibilitaIVA S (split payment): the two regimes do not mix.", fix: "Use EsigibilitaIVA I or D for reverse-charge summaries.", offline: "yes", rules: ["IT-026"] },
  "00421": { what: "Imposta (2.2.2.6) is not AliquotaIVA × ImponibileImporto / 100, rounded half up to the cent, ±1 cent.", fix: "Recompute the VAT for that summary.", offline: "yes", rules: ["IT-014"] },
  "00422": { what: "ImponibileImporto (2.2.2.5) is not, per rate, the lines plus pension-fund contributions plus Arrotondamento, ±1 euro.", fix: "Recompute each rate's taxable base from the lines.", offline: "yes", rules: ["IT-015"] },
  "00423": { what: "PrezzoTotale (2.2.1.11) is not (PrezzoUnitario ± discount) × Quantita, ±1 cent.", fix: "Recompute the line total.", offline: "yes", rules: ["IT-012"] },
  "00424": { what: "A VAT rate is not written as a percentage (10% is 10.00, not 0.10).", fix: "Write rates as percentages.", offline: "partly", rules: ["IT-021"] },
  "00425": { what: "The invoice number (2.1.1.4) has no digit.", fix: "Give the invoice number at least one digit.", offline: "yes", rules: ["IT-009"] },
  "00427": { what: "A 7-character CodiceDestinatario with FPA12, or a 6-character one with FPR12.", fix: "Public bodies have 6-character codes (FPA12); businesses 7 (FPR12).", offline: "yes", rules: ["IT-002"] },
  "00428": { what: "FormatoTrasmissione does not match the versione attribute.", fix: "Make both FPR12 or both FPA12.", offline: "yes", rules: ["IT-001"] },
  "00429": { what: "A DatiRiepilogo at 0% has no Natura.", fix: "Add Natura to the 0% summary.", offline: "yes", rules: ["IT-011"] },
  "00430": { what: "A DatiRiepilogo above 0% has a Natura (allowed only for TD16).", fix: "Remove Natura from taxed summaries.", offline: "yes", rules: ["IT-011"] },
  "00437": { what: "A document discount or surcharge has Tipo but neither Percentuale nor Importo.", fix: "Add Percentuale or Importo, or remove the block.", offline: "yes", rules: ["IT-028"] },
  "00438": { what: "A line discount or surcharge has Tipo but neither Percentuale nor Importo.", fix: "Add Percentuale or Importo, or remove the block.", offline: "yes", rules: ["IT-028"] },
  "00443": { what: "A VAT rate on a line or contribution is not among the DatiRiepilogo rates.", fix: "Add a summary for that rate.", offline: "yes", rules: ["IT-024"] },
  "00444": { what: "A Natura on a line or contribution is not among the DatiRiepilogo Natura codes.", fix: "Add a summary for that Natura.", offline: "yes", rules: ["IT-024"] },
  "00445": { what: "The bare Natura N2, N3 or N6 is no longer allowed (from 1 January 2021); use the detailed codes.", fix: "Use N2.1/N2.2, N3.1-N3.6 or N6.1-N6.9.", offline: "yes", rules: ["IT-011"] },
  "00460": { what: "A simplified invoice is over the EUR 400 limit.", fix: "Issue an ordinary invoice (FPR12).", offline: "no", rules: [] },
  "00471": { what: "For this TipoDocumento the seller and the buyer must not be the same.", fix: "Check the parties, or the document type.", offline: "yes", rules: ["IT-031"] },
  "00472": { what: "For TD21 and TD27 the seller and the buyer must be the same.", fix: "Put the issuer in both parties.", offline: "yes", rules: ["IT-031"] },
  "00473": { what: "The seller's IdPaese is not allowed for this TipoDocumento (TD17/18/19/28 need a foreign seller; TD29 an Italian one).", fix: "Check the document type against the seller.", offline: "yes", rules: ["IT-023"] },
  "00474": { what: "A TD21 (self-invoice for exceeding the plafond) has a line at 0%.", fix: "Every TD21 line needs a VAT rate above zero.", offline: "yes", rules: ["IT-032"] },
  "00475": { what: "This TipoDocumento needs the buyer's IdFiscaleIVA.", fix: "Add the buyer's VAT number.", offline: "yes", rules: ["IT-029"] },
  "00476": { what: "Seller and buyer both have a non-Italian IdPaese.", fix: "SdI takes no invoice with no Italian party.", offline: "yes", rules: ["IT-030"] },
  "00477": { what: "A non-taxable sale under art. 8(1)(c) cites a declaration of intent that has been invalidated.", fix: "Check the declaration of intent with the buyer; tax the sale if it is no longer valid.", offline: "no", rules: [] },
};

// A UBL or CII file sent through SdI is checked with the EN 16931 rules, which carry no SdI
// code. An Italian VAT number that fails its checksum (INV-023) cannot be in the register:
// the seller's is SdI 00301, the buyer's 00305.
const EN_MATCH = {
  "00301": (f) => f.rule === "INV-023" && /^Supplier/.test(f.message) && /\bIT\b/.test(f.message),
  "00305": (f) => f.rule === "INV-023" && /^Customer/.test(f.message) && /\bIT\b/.test(f.message),
};

const OUTCOME = {
  NS: "SdI rejected the file. Under specification 1.9 (section 1.6) the invoice, or the batch of invoices in the file, counts as not issued. Fix every cause below and send the file again under a new file name: SdI refuses a name it has already seen (00002).",
  RC: "SdI delivered the file to the recipient. The invoice passed SdI's checks.",
  MC: "SdI accepted the file but could not deliver it to the recipient's channel. The invoice passed SdI's checks and was not rejected; SdI says where it made the invoice available.",
  MT: "This is the metadata SdI sends to the recipient with an invoice, not an outcome.",
  NE: "The public body that received the invoice sent its outcome.",
  EC: "This is the buyer's own outcome message on an invoice.",
  SE: "SdI refused the buyer's outcome message.",
  DT: "The public body did not send an outcome within the term, so SdI closed the process for this file.",
  AT: "SdI could not deliver the invoice to the public body and attests that it was transmitted.",
};

const local = (name) => String(name || "").replace(/^.*:/, "");
function kid(node, name) {
  return node && node.children && node.children.find((c) => local(c.name) === name);
}
function text(node, ...names) {
  let n = node;
  for (const name of names) n = kid(n, name);
  return n ? String(n.text || "").trim() : "";
}
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
// SdI's own text can quote a tax number ("IdCodice non valido : 00174410993").
const decodeRefs = (s) => String(s || "").replace(/&#x([0-9a-f]+);/gi, (_, h) => codePointOr(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => codePointOr(+d))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
export const withhold = (s) => decodeRefs(s).replace(/\d{8,}/g, "[number withheld]").replace(/\s+/g, " ").trim();

export function looksLikeSdiReceipt(textIn) {
  const head = String(textIn).slice(0, 4096);
  const m = /<(?:[A-Za-z0-9_]+:)?([A-Z][A-Za-z]+)[\s>]/.exec(head.replace(/<\?[\s\S]*?\?>/g, ""));
  return !!(m && Object.hasOwn(KINDS, m[1])) && /fatturapa\.gov\.it\/sdi\/messaggi|agenziaentrate\.gov\.it\/docs\/xsd\/fattur[ae]\/messaggi|IdentificativoSdI/.test(head);
}

export function readSdiReceipt(source) {
  const t = typeof source === "string" ? source : new TextDecoder().decode(source);
  const tree = parseXmlTree(t);
  const root = tree.children.find((c) => Object.hasOwn(KINDS, local(c.name)));
  if (!root) throw new Error("Not an SdI receipt or notice");
  const rootName = local(root.name);
  const kind = KINDS[rootName];
  const errors = (kid(root, "ListaErrori")?.children || []).filter((c) => local(c.name) === "Errore").map((e) => ({
    code: text(e, "Codice"),
    description: withhold(text(e, "Descrizione")),
    suggestion: withhold(text(e, "Suggerimento")),
  }));
  const esito = kid(root, "EsitoCommittente") || (rootName === "NotificaEsitoCommittente" ? root : null);
  const ref = kid(esito || root, "RiferimentoFattura");
  const archive = kid(root, "RiferimentoArchivio");
  return {
    root: rootName,
    type: kind.code,
    kind: kind.name,
    namespace: (root.attrs && Object.entries(root.attrs).find(([k, v]) => k.startsWith("xmlns") && /messaggi/.test(v))?.[1]) || "",
    identificativoSdI: text(root, "IdentificativoSdI"),
    fileName: text(root, "NomeFile"),
    hash: (text(root, "Hash") || "").toLowerCase(),
    originalHash: (text(root, "HashFileOriginale") || "").toLowerCase(),
    received: text(root, "DataOraRicezione"),
    delivered: text(root, "DataOraConsegna"),
    availableFrom: text(root, "DataMessaADisposizione"),
    recipient: text(root, "Destinatario", "Codice") || text(root, "CodiceDestinatario"),
    recipientName: text(root, "Destinatario", "Descrizione"),
    archive: archive ? { identificativoSdI: text(archive, "IdentificativoSdI"), fileName: text(archive, "NomeFile") } : null,
    outcome: esito ? text(esito, "Esito") : "",
    outcomeReason: esito ? withhold(text(esito, "Descrizione")) : "",
    invoiceRef: ref ? { number: text(ref, "NumeroFattura"), year: text(ref, "AnnoFattura"), position: text(ref, "PosizioneFattura") } : null,
    refusal: text(root, "Scarto"),
    description: withhold(text(root, "Descrizione")),
    messageId: text(root, "MessageId"),
    errors,
  };
}

const baseName = (n) => String(n || "").split(/[\\/]/).pop().toLowerCase();
const stripSigned = (n) => baseName(n).replace(/\.p7m$/, "");

export function sha256Hex(source) {
  return hex(sha256(typeof source === "string" ? new TextEncoder().encode(source) : source));
}

// Finds the invoice a receipt is about among the other inputs: same file name (a .p7m
// suffix ignored), or the same SHA-256 as the receipt's Hash.
export function pairReceipt(receipt, inputs, isInvoice) {
  const want = stripSigned(receipt.fileName);
  let byName = null;
  for (const o of inputs) {
    if (!isInvoice(o)) continue;
    const digest = receipt.hash || receipt.originalHash ? sha256Hex(o.source) : "";
    if (digest && (digest === receipt.hash || digest === receipt.originalHash)) return { input: o, by: "hash", digest };
    if (!byName && want && stripSigned(o.name) === want) byName = { input: o, by: "name", digest };
  }
  return byName;
}

function codeLine(code) {
  const c = Object.hasOwn(SDI_CODES, code) ? SDI_CODES[code] : null;
  if (!c) return { known: false, text: `Code ${code} is not in specification 1.9's control list.` };
  return { known: true, text: c.what, c };
}

// Turns a read receipt into report findings. `pair` is { name, by, digest, findings } when
// the invoice is in the batch (findings = checkFatturaPa(...).findings), else null.
export function receiptFindings(r, pair) {
  const out = [];
  const where = r.fileName ? ` for ${r.fileName}` : "";
  for (const e of r.errors) {
    const { known, text: what, c } = codeLine(e.code);
    let coverage;
    if (!known) coverage = "This tool has no rule mapped to it.";
    else if (c.offline === "no") coverage = `This tool cannot check it: ${why(e.code)}.`;
    else coverage = `This tool checks it offline${c.offline === "partly" ? " in part (check digit or shape only; SdI also checks the register)" : ""}: ${c.rules.join(", ")}.`;
    let verdict = "";
    let reproduced = null;
    if (pair && known) {
      const hits = pair.findings.filter((f) => f.sdi === e.code || (c.rules === SCHEMA_RULES && SCHEMA_RULES.includes(f.rule)) || (Object.hasOwn(EN_MATCH, e.code) && EN_MATCH[e.code](f)));
      reproduced = hits.length > 0;
      if (reproduced) verdict = ` On ${pair.name} this checker raises it too (${[...new Set(hits.map((f) => f.rule))].join(", ")}).`;
      else if (c.offline === "yes") verdict = ` On ${pair.name} this checker does not raise it, though the check is offline${pair.by === "name" ? " (paired by file name only: the file may have changed since)" : ""}.`;
      else verdict = ` On ${pair.name} this checker does not raise it: ${c.offline === "partly" ? "the value passes its check digit, so the fault is one only the register shows" : why(e.code)}.`;
    }
    out.push({
      rule: `SDI-${e.code || "?"}`,
      sdi: e.code,
      message: `SdI rejected the file${where} with error ${e.code}: ${what}${e.description ? ` SdI's text: "${e.description}".` : ""}`,
      fix: `${known ? c.fix + " " : ""}${e.suggestion ? `SdI suggests: "${e.suggestion}". ` : ""}${coverage}${verdict}`,
      path: "/ListaErrori/Errore/Codice",
      ...(reproduced === null ? {} : { reproduced }),
    });
  }
  if (r.type === "NE" || r.type === "EC") {
    if (r.outcome === "EC02") {
      out.push({ rule: "SDI-EC02", message: `The buyer refused the invoice${r.invoiceRef ? ` ${r.invoiceRef.number} of ${r.invoiceRef.year}` : ""} (EC02)${r.outcomeReason ? `: "${r.outcomeReason}"` : ""}.`,
        fix: "This is the buyer's decision on the content, not an SdI check: read the reason, agree the correction with the buyer and handle it in your books. This tool does not say which document the correction needs.", path: "/EsitoCommittente/Esito" });
    } else if (r.outcome === "EC01") {
      out.push({ rule: "SDI-EC01", severity: "information", message: `The buyer accepted the invoice${r.invoiceRef ? ` ${r.invoiceRef.number} of ${r.invoiceRef.year}` : ""} (EC01).`, fix: "Nothing to do.", path: "/EsitoCommittente/Esito" });
    }
  }
  if (r.type === "SE") {
    out.push({ rule: "SDI-SE", message: `SdI refused the buyer's outcome message (code ${r.refusal || "missing"}).`, fix: "The buyer must send a corrected outcome; the invoice itself is not affected by this notice.", path: "/Scarto" });
  }
  if (pair && (r.type === "RC" || r.type === "MC")) {
    const blocking = pair.findings.filter((f) => !["note", "warning", "information"].includes(f.severity));
    if (blocking.length) {
      out.push({ rule: "SDI-PASSED", severity: "information", message: `SdI accepted ${pair.name}, yet this checker raises ${[...new Set(blocking.map((f) => f.rule))].join(", ")} on it.`,
        fix: "SdI's checks are not a full validation: it does not check tax ids issued abroad (specification 1.9, Appendix 1), and bank details are not in its control list. Read each finding: the buyer may still query it.", path: "/" });
    }
  }
  if (pair) {
    const digest = pair.digest;
    if (r.hash && digest && digest !== r.hash) {
      out.push({ rule: "SDI-HASH", severity: "warning", message: `The receipt's Hash is not the SHA-256 of ${pair.name}, so SdI received a different byte sequence: the file was edited, re-saved or re-encoded since, or SdI received a signed (.p7m) copy.`,
        fix: "Compare with the exact file you sent. Verdicts against this file may not match what SdI saw.", path: "/Hash" });
    } else if (r.hash && digest === r.hash) {
      out.push({ rule: "SDI-HASH", severity: "information", message: `The receipt's Hash is the SHA-256 of ${pair.name}: this is exactly the file SdI received.`, fix: "Nothing to do.", path: "/Hash" });
    }
  }
  return out;
}

export function receiptEnvelope(r, pair) {
  const bits = [`Read as an SdI ${r.kind} (${r.type}), not an invoice`];
  if (r.identificativoSdI) bits.push(`IdentificativoSdI ${r.identificativoSdI}`);
  if (r.received) bits.push(`received ${r.received}`);
  if (r.delivered) bits.push(`delivered ${r.delivered}`);
  if (r.availableFrom) bits.push(`in the recipient's reserved area from ${r.availableFrom}`);
  if (r.archive) bits.push(`from archive ${r.archive.fileName}`);
  if (pair) bits.push(`paired with ${pair.name} by ${pair.by === "hash" ? "SHA-256" : "file name"}`);
  return `${bits.join("; ")}. ${Object.hasOwn(OUTCOME, r.type) ? OUTCOME[r.type] : ""}`.trim();
}

// A character reference or escape past U+10FFFF (or not a number) becomes U+FFFD,
// as HTML parsers do, instead of throwing a RangeError on a stranger's input.
function codePointOr(n) { return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "\uFFFD"; }
