# SdI error codes and tolerances, read from specification 1.9 (2026-11-13)

Until today every FatturaPA rule here was written from press and vendor
summaries, because agenziaentrate.gov.it and fatturapa.gov.it refused the
build host. On 2026-11-13 both answered from a cloud session, so this run read
the primary documents:

| Document | URL (agenziaentrate.gov.it) | SHA-256 |
|---|---|---|
| Allegato A, Specifiche tecniche vers. 1.9 (Italian, 191 pp.) | `/portale/documents/d/guest/allegato-a-specifiche-tecniche-vers-1-9` | `549a68ac4ff75200...` |
| Appendix A, Technical specifications vers. 1.9 (English, 180 pp.) | `/portale/documents/d/guest/appendix-a-technical-specifications-vers-1-9` | `357282b556b32118...` |
| Schema VFPR12 v1.2.3 | `/portale/documents/d/guest/schema_vfpr12_v1-2-3` | `152944f6eef9f5d6...` (raw) |

The PDFs are not copied into the repository. The text was extracted with
`pdftotext -layout`. Two checks came out of it.

**The pinned schema is the Agenzia's own.** `build-fatturapa-schema.mjs`
pinned XSD 1.2.3 from three mirrors that agreed byte for byte. The official
file, with its BOM dropped and line ends normalised the way the build does,
hashes to `ea951ee851892ae0...`, exactly the pin. The code lists and structure
we enforce are the Agenzia's own.

**The tolerances were partly wrong.** The rules below are now taken from the
field text (section 2.2) and the error table (the "Elenco controlli"
appendix) of the Italian original.

| SdI code | Specification 1.9 | Before | Now |
|---|---|---|---|
| 00423 PrezzoTotale | (PrezzoUnitario ± ScontoMaggiorazione) × Quantita, ±1 cent | IT-012, ±1 cent | unchanged, code named |
| 00421 Imposta | AliquotaIVA × ImponibileImporto / 100, **rounded half up to the cent**, then ±1 cent | compared with the unrounded product: base 0.25 at 22% (0.055 → 0.06) with Imposta 0.07 was flagged though SdI accepts it | rounds first (IT-014) |
| 00422 ImponibileImporto | **per distinct AliquotaIVA**: Σ PrezzoTotale + Σ ImportoContributoCassa + Σ Arrotondamento, **±1 euro** | per rate *and* Natura, ±1 cent per line, and skipped whenever a cassa or rounding was present | per rate, cassa and Arrotondamento included, ±1 euro blocking (IT-015); a gap between a cent per line and a euro is a warning (IT-025), because SdI accepts it but the books will not tie out |
| (none) ImportoTotaleDocumento | the specification gives no error code; the element is optional | IT-016 blocking | IT-016 is a **warning** that says SdI does not check this total |
| 00443 / 00444 | every line and cassa **rate** must be in a summary (00443), and every **Natura** (00444), as two separate sets | IT-024 on the (rate, Natura) pair, lines only | two sets, lines and cassa |

**The English translation contradicts itself on 00422.** Its field text says
"±1 euro", but its error table says "±1 eurocent". The Italian original says
"±1 euro" in both places ("è ammessa la tolleranza di ±1 euro"), so the
Italian wins here.

## Every error code in the table, and what checks it here

Codes in the 1.9 error table (45 in the Italian, 40 in the English), plus the
codes named only in the field text (00400, 00401, 00313, 00330, 00417, 00423,
00424). "Offline" means a file alone can show the fault.

| Code | What SdI rejects | Covered by |
|---|---|---|
| 00001-00003 | file name, duplicate name, size | not here (transport) |
| 00100-00107 | signature and certificate | not here (signature not modelled) |
| 00200, 00201 | not compliant with the schema | IT-018..IT-022 (XSD 1.2.3; 2,080/2,080 mutations agree with xmllint) |
| 00300-00306, 00311, 00312, 00320-00326 | numbers or codes not in the tax register, inactive destination code, VAT group | not offline (register lookups); check digits only: IT-003, IT-004 |
| 00313 | CodiceDestinatario XXXXXXX with an Italian buyer | IT-002 (new) |
| 00330 | PECDestinatario is SdI's own address | IT-002 (new) |
| 00400 / 00429 | 0% with no Natura, line / summary | IT-011 (summary case new) |
| 00401 / 00430 | Natura on a taxed line / summary, except TD16 | IT-011 (TD16 exception and summary case new) |
| 00403 | Data after the day SdI receives the file | IT-009 (new; compared with today in Europe/Rome) |
| 00404, 00409 | duplicate invoice, in SdI's archive or in the lot | not offline; batch duplicates in INV-019 for EN 16931 only |
| 00411 / 00415 | Ritenuta SI on a line / cassa without DatiRitenuta | IT-027 (new) |
| 00413 / 00414 | cassa at 0% without Natura / taxed cassa with Natura | IT-011 (new) |
| 00417 | buyer has neither IdFiscaleIVA nor CodiceFiscale | IT-005 |
| 00418 | DatiFattureCollegate Data later than the document | IT-033 (new) |
| 00419, 00443, 00444 | rates or Natura codes with no summary | IT-024 (reworked) |
| 00420 | N6.x with EsigibilitaIVA S | IT-026 (new) |
| 00421, 00422, 00423 | arithmetic | IT-014, IT-015 / IT-025, IT-012 (above) |
| 00424 | AliquotaIVA not written as a percentage | partly: the schema's RateType (IT-021) refuses 0.1; 0.10 is schema-valid and not distinguishable from a real 0.10% |
| 00425 | Numero without a digit | IT-009 |
| 00427 | 7-character code in FPA12 / 6 in FPR12 | IT-002 |
| 00428 | FormatoTrasmissione ≠ versione | IT-001 |
| 00437 / 00438 | ScontoMaggiorazione Tipo without Percentuale or Importo, document / line | IT-028 (new) |
| 00460 | simplified-invoice limit | not applicable (FSM10 is refused by IT-008) |
| 00471 / 00472 | seller and buyer the same where they must differ / differ where they must be the same (TD21, TD27) | IT-031 (new; compared on IdFiscaleIVA, else CodiceFiscale) |
| 00473 | TD17/18/19/28 with an Italian seller; TD29 with a foreign one | IT-023 (first case new) |
| 00474 | TD21 line at 0% | IT-032 (new) |
| 00475 | TD16-20, 22, 23, 28, 29 without the buyer's IdFiscaleIVA | IT-029 (new) |
| 00476 | neither party Italian | IT-030 (new) |
| 00477 | declaration of intent invalidated | not offline (Agenzia's records) |

Every new or changed rule has a test in `fatturapa.test.mjs` (39 tests). Each
test asserts the finding's `sdi` code and the boundary: 0.06 and 0.07 pass
00421 while 0.04 and 0.08 fail it; 1.00 passes 00422 while 1.01 fails it; a
linked date the same day passes 00418 while the next day fails it.

## On real files

`eval/fatturapa-corpus.mjs` was run over the ZUGFeRD corpus's `fatturaPA/`
folder (15 files: the Agenzia's six samples and eigor's), phax/ph-fatturapa's
test resources (30 files) and FatturaElettronica.NET's samples (5). Each file
was checked with the code before and after this change.

- **Unchanged:** every finding the old code raised is still raised, now with
  its SdI code where there is one.
- **New on eigor's `A10-Licenses`, `A10-Licenses-CreditNote`, `A4-Subscription`
  and `fattpa-creditnote.to-ublcn-working-example` (00476):** both parties are
  Dutch (NL/NL). These are converter test files built from UBL examples.
  SdI takes no invoice with no Italian party, so these are true positives.
- **New on phax's `bad/IT01234567890_FPR01_TD29_RF20.xml` (00475):** a TD29
  whose buyer has only a CodiceFiscale. Phax files it as bad, and the
  specification agrees.
- **New on FatturaElettronica.NET's `IT02182030391_32.xml` (both encodings):**
  00418 (document dated 2017-01-27, linked invoice 2017-02-28), 00443 (a cassa
  at 23% with only a 22% summary) and 00422 (22% lines sum to 298.78 against a
  143.28 base). This is a parser fixture full of schema faults (IT-018..IT-021
  already fired on it). The old code skipped the base check because a cassa was
  present. All three verdicts follow the specification's text.
- **The Agenzia's own FPR02 and FPR03 still fail 00422.** Their first body's
  22% lines sum to 25.00, but the base says 27.00: 2.00 off, past the one-euro
  tolerance. These are layout samples, not files SdI accepted. We report what
  the specification's rule says.

No new verdict on these 50 files is a false positive by the specification's
text. That is still not SdI: no real acceptance or rejection receipt has been
compared. Next: a real SdI *ricevuta di scarto* (rejection receipt) for a file
we can run, which would confirm the codes end to end.
