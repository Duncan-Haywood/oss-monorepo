# E-invoice preflight

**Validate a structured invoice before submission.** After using this, you can
now see which fields, totals, VAT digits, or payment instructions would fail a
local preflight — in the browser or in CI — which used to mean waiting for a
network rejection. Open `index.html` and drop a JSON, UBL, CII, or Factur-X
PDF file, or run the CLI below. The page never uploads the invoice.

**Live tool:** https://marisstella.app/einvoice-preflight/

This free local CLI also checks a small, transparent JSON, UBL XML,
UN/CEFACT CII (XRechnung CII / Factur-X), or Factur-X / ZUGFeRD PDF invoice
for missing fields and arithmetic mistakes, then prints rule IDs and
plain-language fixes. It is aimed at bookkeepers and ERP integrators
searching for an e-invoice preflight check. CII is the XML an ERP actually
emits when it is not UBL; a Factur-X PDF is only the envelope around that XML.
When a PDF unwraps, the result names the standard attachment
(`factur-x.xml`, `zugferd-invoice.xml`, or `xrechnung.xml`) and the syntax
(CII or UBL). Custom attachment names are not echoed. The attachment stream is
found whatever order the generator wrote its dictionary in (`/Filter` or `/Length`
before `/Type`) and with an indirect `/Length 5 0 R`; before 2026-10-22 those
PDFs were refused as having no invoice XML (found by building such files; tested
on hand-made PDFs, not yet on a real Mustang, Ghostscript or Acrobat export).
Opened in poppler (2026-10-30): the shipped example PDFs had an empty page tree
(`pdfinfo`: "Invalid page count 0"), so no viewer could show them. They now carry
one page, and a test (skipped where poppler is absent) repairs the credit note
with defects, checks `pdfinfo` reads one page with no syntax error and that
`pdfdetach` returns exactly the corrected XML. veraPDF and Acrobat are still unrun.

**PDF envelope checks (2026-10-30, `pdf-envelope.mjs`).** A Factur-X PDF now also
gets four checks on the PDF around the XML: PDF-001 (no PDF/A-3 marker in the
XMP; a note, not blocking), PDF-002 (attachment not named factur-x.xml,
zugferd-invoice.xml or xrechnung.xml), PDF-003 (no valid AFRelationship; a note)
and PDF-004 (XMP `fx:ConformanceLevel` names a different profile than the XML's
guideline ID). Tested on hand-built PDFs only (`pdf-envelope.test.mjs`); the
shipped example PDFs have no XMP, so they draw PDF-001. Not run on a real
Mustang, Ghostscript or Acrobat export, and not a PDF/A validator (veraPDF unrun).
The browser page and the Node CLI/server get these; the Python CLI does not yet.

**Two more envelope notes (2026-10-31).** PDF-005 (the embedded file's stream has
no `/Subtype`, the MIME type PDF/A-3 requires, `/text#2Fxml` for XML) and PDF-006
(the document catalog has no `/AF` array; read only when the catalog is in plain
text, so a catalog packed in a compressed object stream draws nothing). Both are
notes. Tested on hand-built PDFs only, same limits as PDF-001..004. The "page
button for PDFs" item was already done: the page runs these on any dropped PDF.

**XRechnung profile (Germany).** Tick "Also apply the German XRechnung rules"
on the page, or call the API with `POST /v1/validate?profile=xrechnung`, to add
nine `XR-001`..`XR-009` rules that mirror the BR-DE business rules a German
public buyer's portal enforces: buyer reference (BT-10), Leitweg-ID check
digits (ISO 7064 MOD 97-10, verified against published samples), payment
instructions, seller contact, seller and buyer city and postcode, invoice type
code, the XRechnung 3.x specification identifier, and a seller tax identifier.
Off by default. JS (page and API) only; the Python CLI does not apply it yet.
It is an offline observation, not the KoSIT validator.

**BG, MT and GB false rejects fixed (2026-11-10).** A differential run over 44,000 random numbers against python-stdnum 2.2 found valid numbers we flagged: BG 10-digit "other" numbers whose weighted sum is a multiple of 11 (check digit 0), MT numbers whose last two digits are 74 minus the sum or 00 (the rule is the eight-digit weighted sum 3,4,6,7,8,9,10,1 mod 37 = 0), GB 12-digit branch traders with branch digits other than 000, and GB numbers from 100 on with remainder 55. All fixed in `vat.mjs` and `vat.py`; BG, MT and GB now agree on every case. Not changed: EL 8-digit numbers (stdnum pads a zero; we still ask for 9 digits) and GB GD/HA government forms (not covered). No authority text read.

**Azerbaijan VOEN check digit (2026-11-09).** An `AZ` number of 10 digits now fails INV-023 unless the ninth digit equals the weighted sum of the first eight (4,1,8,6,2,7,5,3) mod 11 and the tenth is 1 or 2 (a remainder of 10 fits no digit, so such numbers are refused, as python-stdnum does). In `vat.mjs` only (`vat.py` does not cover AZ). Pinned on python-stdnum's three doctest numbers (1401555071 valid, 1401555081 bad digit, 1400057424 bad status); the Ministry of Taxes text is unread, and no real VOEN from an invoice was tried.

**VAT check digits for Bulgarian 10-digit and Czech 10-digit numbers (2026-11-09).** A BG number of 10 digits (a natural person's EGN, a foreigner's number or the "other" form) now fails INV-023 unless one of the three public check-digit rules holds, so about a quarter of wrong last digits still pass; a CZ 10-digit birth number (individuals, born 1954 on) must have a valid month and day and a first nine digits that leave the last digit mod 11. 9-digit CZ numbers carry no check digit and stay shape-only. In `vat.mjs` and `vat.py`; pinned on python-stdnum's published EGN example and a mutation each; no authority text read.

**Czech 8-digit and special 9-digit VAT numbers (2026-11-10).** An 8-digit CZ number starting 9 now fails INV-023, and a 9-digit number starting 6 (individuals without a birth number) has its check digit verified. Differential test on 1,800 random numbers against python-stdnum 2.2: 8-digit and 9-digit identical; 6 of 13 valid 10-digit numbers stdnum accepts are still flagged for months outside 01-12/21-32/51-62/71-82 (deliberate). No Czech authority text read. Pinned in `vat.test.mjs`.

**VAT check digits for CY, MT and XI (2026-11-08).** Cyprus (check letter), Malta (mod 37) and Northern Ireland digit forms (mod 97, as GB) now fail INV-023 on a bad check digit, in `vat.mjs` and `vat.py`. Same sourcing as below: public algorithms from memory, one published example number and a mutation each; no authority text read.

**VAT check digits for 11 more countries (2026-10-30).** EE, HU, SI, SK, HR, LV (companies), LT (9 digits), BG (9 digits), RO, EL and CZ (8 digits) now fail INV-023 on a bad check digit, not only INV-022 on length (`vat.mjs` and `vat.py`). Algorithms from memory of the public descriptions (python-stdnum), each tested on a published example number and a one-digit mutation; no real invoice, no tax-authority text read. Variants not implemented stay length-only.

**Peppol profile.** Tick "Also apply the Peppol BIS Billing 3.0 rules" on the
page, or call `POST /v1/validate?profile=peppol`, to add five `PP-001`..`PP-005`
rules that mirror what a Peppol access point rejects: the business process
(BT-23, R001), the Peppol 3.0 specification identifier (R004), seller and buyer
electronic addresses (R020, R010) and a buyer or order reference (R003). Off by
default, JS only, and an offline observation, not the OpenPeppol Schematron.
The UN/CEFACT CII reader now also captures the party electronic address.

**France profile.** Tick "Also apply the French rules" on the page, or call
`POST /v1/validate?profile=france`, to add eight `FR-001`..`FR-008` rules for
invoices to French buyers under the e-invoicing reform (reception mandatory
from 1 September 2026, issuing phased in after): the seller and buyer SIREN or
SIRET (`legal_id`, scheme 0002) must be present and pass the Luhn check digit
(La Poste's SIREN 356000000 uses its documented digit-sum exception), the
SIREN inside a French VAT number must be the seller's own, and the three
mentions the Code de commerce has always required on a B2B invoice must
appear in the notes or payment terms: late-payment penalty rate (L441-10),
the fixed 40 euro recovery indemnity (D441-5) and the early-payment discount
condition (L441-9). Factur-X subject codes `#PMD#`, `#PMT#` and `#AAB#` are
recognised, as are French and English wording. The UBL and CII readers now
capture the party legal identifier and the invoice and payment-terms notes.
Off by default, JS only, and an offline observation, not a certified
platform's validator or legal advice. Findings never echo the number.

**Poland: KSeF FA(3) (new, 2026-10-24).** An XML file whose root is `Faktura` in the `crd.gov.pl/wzor/` namespace is read by `fa3.mjs` with its own rules `PL-001`..`PL-011`: NIP check digit for seller and buyer (weights 6 5 7 2 3 4 5 6 7, mod 11), tax-rate code list, `P_8B x P_9A = P_11` per line, each `P_13_n` against the lines at that rate, `P_14_n` against net x rate, `P_15` against all totals, duplicate line numbers, and the PLN tax (`P_14_nW`) on foreign-currency invoices. Element names, rate codes and what each total means were read from the published schema (`schemat_FA(3)_v1-0E.xsd`, namespace `http://crd.gov.pl/wzor/2025/06/25/13775/`, taken from the `ksef-client-ts` npm package because crd.gov.pl was unreachable from the build host); `examples/fa3-invoice.xml` validates against it with `xmllint`, and the defect file fails the XSD on its unknown rate code only (the other faults are arithmetic that a schema cannot see). Sums are checked only on `RodzajFaktury` VAT or UPR; advance, settlement and correcting invoices skip them and say so in `skipped`. Not done: the KSeF-side business rules, and any real invoice: no genuine FA(3) file was available, so the rules are measured on one hand-made example and its planted-defect twin (`fa3.test.mjs`, 6 tests). The 1-grosz tolerance is an assumption. **Schema gate (2026-10-25, `PL-012`..`PL-017`).** `build-fa3-schema.mjs` reads `schemat_FA(3)_v1-0E.xsd` and its three base files into `fa3-xsd-data.mjs` (content models with occurrence counts, attributes, and length, pattern, range, digit and code-list facets; it throws on any XSD construct it does not model, and the one union, `TNrREGON`, is read as two patterns). `fa3-xsd.mjs` runs a file against it before the arithmetic rules: `PL-012` an element the schema does not allow there or one too many, `PL-013` elements out of sequence, `PL-014` a required element missing, `PL-015` a value outside its pattern, length, date, digits or code list (every enumeration is enforced here, because v1-0E is the schema in force; the generic PL-015 for a bad tax rate yields to the more specific `PL-004`), `PL-016` a missing or non-fixed attribute (`kodSystemowy="FA (3)"`, `wersjaSchemy="1-0E"`), `PL-017` a cut-off file (the other checks are then skipped and named). Messages never echo the value. **Measured against xmllint on the real XSD** (`eval/fa3-xsd-diff.mjs`; xmllint needs the remote import pointed at the local `bazowe/` copy): from two xmllint-valid seeds (`examples/fa3-invoice.xml`, and `fa3-invoice-rich.xml` with an EU buyer, exemption branch, payment, footer and registers), 3 x 1,620 seeded mutations (an element deleted, duplicated, swapped with its neighbour, an unknown element added, a value emptied, lengthened by 1,100 characters, given a euro sign, made text or negative, or a date cut to year-month): 4,860 of 4,860 verdicts agree with xmllint. **Branch seeds (2026-11-06).** `examples/fa3-correction.xml` (RodzajFaktury KOR: reason, type, two corrected-invoice blocks, one by KSeF number and one outside KSeF, period) and `examples/fa3-settlement.xml` (ROZ: a partial advance, an advance-invoice reference, a `Zalacznik` data block) are made-up, xmllint-valid on the real XSD, and joined the differential: 4 seeds, 6,520 mutations in 10 kinds (652 each) (an element deleted, duplicated, swapped, unknown, emptied, lengthened, euro, text, negative, short date), 6,520 of 6,520 verdicts agree with xmllint. The official CIRF/KSeF client templates (13 distinct files, `eval/ksef-official-templates.mjs`) hold no correction, advance or settlement file, so these seeds are hand-built from the XSD and no real one has been tried. **Transport seed (2026-11-08).** `examples/fa3-transport.xml` (made up, xmllint-valid on the real XSD) adds a `WarunkiTransakcji` block with two `Transport` entries (one by `RodzajTransportu` with carrier, cargo, times and a three-country route, one by the `TransportInny` / `LadunekInny` choice branch). With it as a fifth seed, 6,550 mutations in 10 kinds (655 each, `--per 1300`): 6,550 of 6,550 verdicts agree with xmllint. Limits: the seeds cover the blocks they contain (the transport block is now seeded; other choice branches are mutated only if present); no real KSeF file; the namespace is not checked; KSeF's own business rules beyond the XSD are not modelled.

**Brazil: NF-e and NFC-e 4.00 (new, 2026-11-12).** An XML file whose root is `NFe` or `nfeProc` in `http://www.portalfiscal.inf.br/nfe` is read by `nfe.mjs` with its own rules `BR-001`..`BR-052` (this tool's ids); where a rule matches a SEFAZ rejection the finding names the cStat, with texts from nfephp-org/sped-nfe's `docs/cStat.md` (MIT option of its triple licence). **Schema:** `build-nfe-schema.mjs` reads `leiauteNFe_v4.00.xsd` and `tiposBasico_v4.00.xsd` (package PL_009_V4) from sped-nfe at a pinned commit (`ff80086aa165`; the Portal da NF-e did not answer from the build host) into `nfe-xsd-data.mjs`, 63 KB: 114 complex types, each content model compiled to a regular expression over child names (sequences, nested choices, occurrence bounds), and 335 simple types with their enumerations, patterns and lengths. `BR-002` element not allowed, missing, out of order or a repeated `det/@nItem` (the schema's `xs:unique`), `BR-003` attribute, `BR-004` a value outside its type (a line break inside a text field is named as such). A file with no `ds:Signature` is read as not yet signed and says so in `skipped`; the signature itself is never checked. The alphanumeric CNPJ (NT 2025.001) postdates PL_009_V4's digit-only patterns, so its shape is accepted in CNPJ fields and keys; the reform groups (`IBSCBS`, `IS`, `IBSCBSTot`, NT 2025.002-RTC) have been read since the move to PL_010_V1.30 (below). **Access key:** `Id` = `NFe` + 44 digits (`BR-010`, cStat 227), the mod-11 check digit with weights 2 to 9 from the right (`BR-011`, 236), and cUF, year-month, CNPJ/CPF, mod, serie, nNF, tpEmis, cNF and cDV against `ide` and `emit` (`BR-012`, 502), and an attached protocol's `chNFe` against the key. **Identifiers:** CNPJ and CPF check digits from `brazil.mjs` (`BR-013`, 207/208/237). **Sums, exact in cents:** each item's `vProd` against `qCom` x `vUnCom` (BigInt, flagged beyond a cent; the MOC's own tolerance was not read) (`BR-020`, 629); every `ICMSTot` field present against the items (`BR-021`: vProd with `indTot` 1, vBC, vICMS, vICMSDeson, vBCST, vST, vFCP, vFCPST, vFrete, vSeg, vDesc, vOutro, vII, vIPI, vIPIDevol, vPIS and vCOFINS on items without ISSQN, vTotTrib; cStat 531-538, 564, 601-604, 685, 795); `vNF` = vProd - vDesc - deducted vICMSDeson + vST + vFCPST + vICMSMonoReten + vFrete + vSeg + vOutro + vII + vIPI + vIPIDevol + vServ + summed PIS/COFINS-ST, the formula sped-nfe's `Make.php` builds, or the same without vII when the duty sits inside vProd (a real authorised import, below) (`BR-030`, 610; skipped for new-vehicle direct billing, `tpOp` 2); an NFC-e's payments less `vTroco` against `vNF` unless a payment is `tPag` 90 (`BR-031`, 767). **Consistency:** `cUF`, the issuer's `cMun` and `cMunFG` against the issuer's state by IBGE code (`BR-040`, 226/247/271/273); CFOP's first digit against `tpNF` (`BR-041`, 518/519) and `idDest` (`BR-042`). The Brazil page (`brazil-nfe-e-invoice-mandate.html`) runs the same check on a dropped file with a three-fault sample, and the main report routes NF-e files to it.

*Measured (2026-11-12).* `eval/nfe-xsd-diff.mjs` against xmllint on the real PL_009_V4 schemas: four seeds xmllint accepts (sped-nfe's `nfe_layout4.xml`, `nfce_com_qrcode.xml` and `nfce_sem_qrcode.xml`, read from a checkout, not copied, and `fixtures/nfe-4.00-invoice.xml` with a signature block added), 2,600 single mutations in eleven kinds (a value deleted, emptied, given junk, lengthened, negative, over-precise or space-padded; an element deleted, duplicated or swapped; an unknown element): **2,600 of 2,600 verdicts agree**. The first run disagreed on two: a deleted `infNFe` (now `BR-002` rather than a version error) and a duplicated `det` (the `xs:unique` on `nItem`, now checked). The access-key digit rule reproduces 16 of the 22 distinct keys in sped-nfe's test fixtures; the six others look like test keys with an edited digit (one carries an emitter CNPJ whose own check digits fail, and two NFC-e fixtures name a Mato Grosso `cMunFG` under Bahia's `cUF`), and chance agreement would be about 2 of 22. `nfe.test.mjs` plants each rule's defect in the made-up fixture (two items, interstate, ICMS 12%, IPI 5%, PIS/COFINS, freight and discount; every amount worked by hand and accepted by xmllint) and checks the rule and cStat named. Not done: a real SEFAZ rejection compared, the MOC's full rule list (state-specific rules, NCM/CEST and CST/CSOSN/CFOP tables), NFS-e, and an alphanumeric-CNPJ key's check digit (skipped and said).

*On 35 real files (2026-11-12, later).* `eval/nfe-corpus.mjs` runs the checker on 35 NF-e/NFC-e XML files copied into `eval/nfe-corpus/` from sped-nfe (`tests/fixtures/xml`, MIT option) and akretion/nfelib (`nfe/samples/v4_0`, MIT); sources, commits and licences in `eval/nfe-corpus/README.md`. **17 read clean, 14 of them carrying a SEFAZ protocol with cStat 100 (13 from production, `tpAmb` 1).** The other 18 are fixtures with real inconsistencies: layout 3.10 or a SOAP request (`BR-001`, 5), keys built for another CNPJ, emission type or digit, a 12-digit CPF, a line break in `infCpl`, IBGE city codes in the wrong state, and nfelib's IBS/CBS illustration whose totals do not add up. Six of the 18 carry a cStat 100 protocol, but every signed file in the set has been re-indented since signing (no XML-DSig digest recomputes under lxml c14n), so an edit after authorisation cannot be ruled out; read those findings as "this file as published would not pass". **One false finding, fixed:** the first run flagged nfelib's authorised Santa Catarina import NF-e (`42210775...-procNFe.xml`, production) with `BR-030`: its vNF R$ 95,700.68 is vProd + vIPI + vOutro, without the R$ 13,921.27 import duty that `Make.php` adds, the duty being already inside vProd. SEFAZ authorised it, so `vNF` now passes with or without vII (the reading with vII is still the first one tried). **Seeded faults** on the 17 clean files, nine kinds (one key digit; the key rebuilt with a fresh digit for another number; cNF; dhEmi a month on; the issuer CNPJ's last digit; an item vProd, vNF, ICMSTot vICMS and vPIS each +R$ 0.01): **153 of 153 caught** by the rule named for them (`BR-011`/`BR-012`/`BR-013`/`BR-021`/`BR-030`). Exits 1 on a miss.

**The IBS/CBS reform layout (2026-11-12, latest).** `build-nfe-schema.mjs` now reads package **PL_010_V1.30** (`leiauteNFe_v4.00.xsd`, `tiposBasico_v4.00.xsd` and the new `DFeTiposBasicos_v1.00.xsd`, the same sped-nfe commit; 193 complex and 370 simple types, 86 KB) instead of PL_009_V4, so the reform groups of NT 2025.002-RTC (`IBSCBS` with `gIBSCBS`, `gIBSCBSMono`, `gTransfCred`, `gCredPresOper` and the rest; `IS`; `vItem`; `ISTot`, `IBSCBSTot`, `vNFTot`) are checked against the schema like everything else instead of being skipped. Before switching, xmllint gave **the same verdict on all 35 corpus files under PL_009_V4 and PL_010_V1.30**, except nfelib's reform sample, which only PL_010 accepts, so files without the reform groups read as before. Three sum rules are new, with no SEFAZ rejection code named because none was read (sped-nfe's `docs/cStat.md` lists none for the reform): `BR-050` an item's `gIBSCBS/vIBS` against `vIBSUF` + `vIBSMun`; `BR-051` every field of `IBSCBSTot` (`vBCIBSCBS`; `gIBSUF` and `gIBSMun` `vDif`, `vDevTrib` and their values; `gIBS/vIBS`; `gCBS`; presumed credit from `gCredPresOper`; `gMono` from `gIBSCBSMono`; `gEstornoCred`) and `ISTot/vIS` against the items, each in exact cents; `BR-052` `vNFTot` against the `vItem` of the items with `indTot` 1. The sums follow the schema's own field notes ("Valor total do IBS", and for `vItem` "A soma dos itens deverá corresponder ao total da nota") and sped-nfe's totaliser (`TraitTagDetIBSCBS.php`, `TraitCalculations.php`), not the NT's own rule table, which was not read. `vItem` itself is not recomputed: sped-nfe adds IBS, CBS and IS to it only from 2027 by the calendar year, a reading not checked against the NT. *Measured:* `eval/nfe-xsd-diff.mjs` against xmllint on the real PL_010_V1.30 schemas: the four old seeds, 2,563 mutants, all agree; with the new `--under` option aiming every mutant inside the reform groups, `fixtures/nfe-4.00-reform.xml` (the made-up invoice with IBS 0.1% and CBS 0.9%, the 2026 test-year rates, worked by hand and accepted by xmllint once signed) 969 of 969 and nfelib's reform sample (deferral, returned tax, reduced rate, regular-regime and government-purchase groups) 1,455 of 1,455: **4,987 of 4,987, 2,424 inside the reform groups**. The corpus run is unchanged (17 clean, 153 of 153 seeded). nfelib's reform sample is a layout illustration whose sums do not add up (its item `vIBS` is 0 against 16 + 25, its `vBCIBSCBS` 2,000.50 against one item's 800), and the new rules name each of those. sped-nfe's four PL_010 example files under `examples/fixtures/` are XMLSpy templates with "string" in every field, so no consistent real reform file was found. Not done: a real reform NF-e from a SEFAZ test environment, the cClassTrib/CST tables and rates, the NT's own rejection codes.

**Brazil: national NFS-e (new, 2026-11-12).** Services are invoiced on an NFS-e, not an NF-e. An XML file whose root is `DPS` (the request a provider's system sends) or `NFSe` (what the national system returns, with the DPS inside) in `http://www.sped.fazenda.gov.br/nfse` is read by `nfse.mjs` with its own rules `NFSE-001`..`NFSE-033` (this tool's ids; no rejection code of the national system was read, so none is named). `build-nfse-schema.mjs` reads `DPS_v1.01.xsd`, `NFSe_v1.01.xsd`, `tiposComplexos_v1.01.xsd` and `tiposSimples_v1.01.xsd` from package NFSe-ESQUEMAS_XSD-RTC-v1.02-20261020 (leiaute 1.04.01, NT SE/CGNFS-e 009, with the IBS/CBS groups) via akretion/nfelib (MIT, pinned commit; its `CHANGELOG_SCHEMAS.md` names the gov.br zip, which did not answer from the build host) into `nfse-xsd-data.mjs` (74 complex, 139 simple types, 33 KB), with the NF-e compiler. Layers: the schema (`NFSE-002`..`004`), and where a file from an earlier layout fails, the fix says what moved (`finNFSe` now required in `infDPS`, `xDescServ` after `cNBS`, `CST`/`cClassTrib` out of `gIBSCBS` into `trib`, `vCalcReeRepRes` gone); a bare `&` (`NFSE-001`, which the shared XML reader would let pass); the DPS `Id` against `cLocEmi`, the issuer named by `tpEmit`, `serie` and `nDPS` as the schema's `TSIdDPS` note composes it (`NFSE-010`); the NFS-e key's check digit (`NFSE-011`: mod 11 with weights 2 to 9 as in NF-e, not read from a specification but reproduced on all three real issued keys found and nfelib's sample; chance agreement for all three is about 1 in 1,000) and its parts against `ambGer`, `nNFSe`, the issuer, the municipality and the YYMM of `dhEmi`/`dhProc` (`NFSE-012`); CNPJ and CPF check digits (`NFSE-013`); and the sums each field note of the schema states: the ISSQN base `vBC = vServ - vDescIncond - adjustment - municipal benefit` (`NFSE-020`), `vISSQN = vBC x pAliqAplic` within a cent (`021`), `vTotalRet = vRetCP + vRetIRRF + vRetCSLL + ISSQN retained` (`022`; where PIS/COFINS is retained, a total with them is accepted too, since the note does not list them), `vLiq = vServ - vDescCond - vDescIncond - retentions` (`023`), the IBS/CBS base (to 2026 net of ISSQN, PIS and COFINS; 2027-2032 net of ISSQN) (`030`), each IBS/CBS amount at its effective rate and the effective rate equal to the stated one when no reduction is given (`031`; a stated reduction is skipped and said, since whether `pRedAliq` is a fraction or a percentage was not read), `vIBSTot = vIBSUF + vIBSMun` (`032`) and `vTotNF` (`vLiq` in 2026, plus IBS and CBS from 2027) (`033`). A DPS has no totals, so its sums are skipped and said. *Measured:* `eval/nfse-xsd-diff.mjs` against xmllint on the same four schemas: eight seeds xmllint accepts (the made-up `fixtures/nfse-nacional.xml` and its DPS `fixtures/nfse-dps.xml`, every amount worked by hand; nfelib's `nfse-ibscbs.xml` and `dps-simples.xml`, the latter given `finNFSe`; kursku/emissor-nfse's synthetic DANFSe file; three real NFS-e issued by the national system in December 2025 from nfse-nacional/nfse-php's tests (MIT; Pará, Ceará and Rio de Janeiro, one in production), moved to the current layout in a scratch copy, read from a checkout, not copied): **7,843 of 7,843 verdicts agree**, and with `--under IBSCBS` **1,439 of 1,439**. The three real NFS-e pass every sum rule and their keys' check digits as issued; their schema findings are exactly the layout moves above (and one bare `&` in an ERP's file). nfelib's sample draws `NFSE-030` (its IBS/CBS base 1,000.00 does not deduct its 20.00 ISSQN; the real Rio file's 8,740.00 = 10,000 - 500 ISSQN - 760 COFINS does) and `NFSE-013` (all-zero CNPJs): it is a layout illustration. On the main checker and on `brazil-nfe-e-invoice-mandate.html` (a sample with three planted errors). Not done: a rejection from the national system compared, municipal rates and benefits, the cClassTrib and NBS tables, municipal ABRASF layouts, the signature, an alphanumeric CNPJ's key digit (skipped and said).

**Brazil: municipal NFS-e in the ABRASF layout (new, 2026-11-13).** Before (and alongside) the national NFS-e, most Brazilian city halls take services invoices through web services built on the ABRASF model, namespace `http://www.abrasf.org.br/nfse.xsd`. A file carrying one (an RPS sent for conversion: `GerarNfseEnvio`, `EnviarLoteRpsEnvio`, `EnviarLoteRpsSincronoEnvio`; an issued `CompNfse`; or a city's reply such as `ConsultarNfseRpsResposta`, also when it sits inside a SOAP envelope or is escaped as text in a SOAP parameter) is read by `abrasf.mjs` with rules `ABR-001`..`ABR-023` (this tool's ids; no city's rejection code is named). Layers: the schema (`ABR-002`..`006`) for layouts **2.03 and 2.04**, compiled by `build-abrasf-schema.mjs` from the ABRASF XSDs as carried by OpenAC-Net/OpenAC.Net.NFSe (MIT, pinned commit; abrasf.org.br did not answer from the build host; akretion/nfselib's UNINFE-derived copy drops the target namespace and adds a `1.07` item code, so it was compared and not used) into `abrasf-xsd-data.mjs` (64 KB, mostly the LC 116/2003 item list) and checked by `abrasf-xsd.mjs` (the FA(3) content-model matcher); a declared document element outside the namespace (`ABR-002`: a dropped `xmlns`, or the `http:/www...` typo found in a real repository); CNPJ and CPF check digits (`ABR-010`); every IBGE city code (`CodigoMunicipio`, `MunicipioIncidencia`, `CodigoMunicipioGerador`) against IBGE's list of 5,571 codes (`build-ibge-municipios.mjs`, from kelvins/municipios-brasileiros, MIT, pinned), its check digit (weights 1,2,1,2,1,2, digits of each product summed; nine real codes do not follow it, measured on the list and kept as exceptions) and the `Uf` beside it (`ABR-011`); and the values (`ABR-020`..`023`): `BaseCalculo = ValorServicos - ValorDeducoes - DescontoIncondicionado`; `ValorIss = BaseCalculo x Aliquota` within a cent (a percentage, 5.00 for 5%; 1.00 files write 0.05 and both readings are tried under 1); `ValorLiquidoNfse = ValorServicos - PIS - COFINS - INSS - IR - CSLL - OutrasRetencoes - ISS retained (IssRetido 1) - DescontoIncondicionado - DescontoCondicionado`; deductions plus the unconditional discount no more than the service value. The ABRASF manual itself was not reachable from the build host; these formulas are as two integration manuals quote it (a Thomson Reuters NFS-e integration manual and the oobj knowledge base, both seen through a search engine, not opened), and were then measured on the real files below. A zero `ValorIss` beside a rate on an RPS, from a Simples Nacional provider or with `ExigibilidadeISS` other than 1 is read as not computed and said, not flagged; a file in layout 1.00 or 2.00-2.02, or a provider variant, skips the schema and keeps the other checks. On the main checker and on `brazil-nfe-e-invoice-mandate.html` (a sample with three planted errors).

*Measured (2026-11-13).* 394 ABRASF XML files found by GitHub code search (316 distinct; vendor examples from Unimake, ACBr test resources, library fixtures, templates and real files returned by city halls), read from download, not copied. `eval/abrasf-xsd-diff.mjs` against xmllint on the same two XSDs: of the 134 files whose ABRASF element is in layout 2.03 or 2.04, **132 got the same valid-or-invalid verdict** (34 both valid, 98 both invalid); the other two differ only inside `ds:Signature` (an out-of-range `HMACOutputLength` in Unimake's sample signature), which is free content here. On the 34 valid ones as seeds, **3,447 of 3,447 single-change mutants agree**. One rule came from that run: libxml2 (xmllint, and PHP's `schemaValidate`, which many Brazilian ERPs use) rejects a space around an `xs:int`, `xs:date` or `xs:dateTime` value though XSD would trim it (it trims for `xs:byte` and `xs:nonNegativeInteger`), so such a space is reported. On 15 real files returned by six city halls (Aparecida de Goiânia, Belém, Campo Novo do Parecis, Comodoro, João Dourado and Ribeirão Preto; 95 issued NFS-e; none with ISS retained) the value and identifier checks raised **nothing**; their schema findings are real and xmllint agrees: Aparecida de Goiânia's seven replies omit the required `Numero` in an `Endereco`, Ribeirão Preto's leaves `NomeFantasia` empty, and Campo Novo do Parecis's 2.03/2.04 replies carry provider elements (`tsStatusRps`, `tsStatusNfse`) the schema does not allow. Not done: the ISS-retained branch on a real file, a city's rejection compared, city variants (ISSNet, GINFES, Betha and others extend the model), layouts 2.01/2.02 in their own schemas, municipal rates, the signature.

**Mexico: CFDI 4.0 (new, 2026-11-12).** An XML file whose root is `Comprobante` in `http://www.sat.gob.mx/cfd/4` is read by `cfdi.mjs` with its own rules `MX-001`..`MX-036` (this tool's ids, not SAT's CFDI40xxx codes; the Anexo 20 error matrix was not read). Three layers. **Schema:** `build-cfdi-schema.mjs` reads SAT's `cfdv40.xsd`, `tdCFDI.xsd` and `catCFDI.xsd` (from the public-domain phpcfdi/resources-sat-xml mirror, because sat.gob.mx did not answer from the build host) into `cfdi-xsd-data.mjs`, 96 KB: element order and counts, required attributes, patterns, lengths, digits and every catalogue code, including c_ClaveProdServ (52,747 codes as 4,620 runs) and c_CodigoPostal (95,777 codes as 15 runs). `MX-002` missing attribute, `MX-003` a value outside its type or catalogue, `MX-004` unknown attribute, `MX-005` element not allowed or out of order, `MX-006` element missing or repeated. **Sums:** line Importe within Cantidad x ValorUnitario widened by half a unit in each last written decimal (`MX-020`; the bound rule Anexo 20 describes, as PAC vendors document it), line discount (`MX-021`), each tax = Base x TasaOCuota by the same rule (`MX-024`), the tax summary grouped by tax, factor and rate against the lines (`MX-034`), the summary totals (`MX-033`), SubTotal, Descuento and Total rounded to the currency's decimals (`MX-030`, `MX-031`, `MX-035`; ISO 4217 minor units from Intl, since c_Moneda's decimals are not in the XSD), as CfdiUtils (MIT) recomputes them. **4.0 rules:** currency decimals (`MX-010`), MXN/XXX/foreign exchange rate (`MX-011`), T and P documents (`MX-012`), PPD with FormaPago 99 (`MX-013`), XAXX010101000 and XEXX010101000 receivers (S01, 616, the issuer's postal code, ResidenciaFiscal, InformacionGlobal for PUBLICO EN GENERAL; `MX-014`), ObjetoImp 01/02 against the line's taxes (`MX-022`), exempt and withheld tax lines (`MX-023`), RFC check digit (`MX-007`, mod 11 from `mexico.mjs`), stamped more than 72 hours after Fecha (`MX-036`). Local taxes (ImpuestosLocales) skip the Total check and say so; Pagos 2.0 is read since the same day (next paragraph). The Mexico page (`mexico-cfdi-e-invoice-mandate.html`) runs the same check on a dropped file in the browser, and the main report routes CFDI files to it.

*Measured (2026-11-12).* `eval/cfdi-xsd-diff.mjs` against xmllint on SAT's real XSD: 5 seeds (`fixtures/cfdi-4.0-invoice.xml`, made up, and four CFDI 4.0 files from CfdiUtils' tests, read from a checkout, not copied, two of them PAC-stamped), 3,666 mutations in 10 kinds (an attribute deleted, emptied, given junk, lengthened, made negative or over-precise; an unknown attribute; an element deleted, duplicated or swapped): **3,666 of 3,666 verdicts agree**. The first run disagreed on 15: libxml2 rejects a decimal of more than 24 digits, which the XSD does not say, so `MX-003` now does too. `eval/cfdi-mutations.mjs`, 24 planted defects per file: **91 of 92 caught** by the rule named for them over the four files they apply to (the example and three CfdiUtils files); the miss is a line tax written without decimals (`Base="1500"`, `Importe="240"`), where the half-unit rule tolerates 239 to 241, so 241 passes. Clean files: no finding on four of five; on CfdiUtils' `cfdi40-valid.xml`, `MX-007` on the receiver RFC MCI7306249Y1, whose digit python-stdnum also rejects (a SAT test-environment RFC; the fix text says SAT has issued a few such RFCs). Not done: the seal and stamp, RFC/name/postal code against SAT's lists, the foreign-trade complement (payroll is read since 2026-11-12, "Mexico: payroll" below), and any PAC's rejection compared.

**Mexico: regimes and uses (new, 2026-11-12).** CFDI 4.0 asks for the receiver's tax regime (`RegimenFiscalReceptor`) and the use the receiver will give the invoice (`UsoCFDI`), and SAT's catalogue spreadsheet (catCFDI.xls) says which codes a person (13-character RFC) or a company (12) may carry and, for each use, which receiver regimes it is allowed with. The XSD lists only the codes, so `MX-003` could not see a company asking for `D01` (medical fees) or a receiver in regime 616 (no tax obligations) asking for `G03`. `build-cfdi-regimen.mjs` reads those columns from phpcfdi/resources-sat-catalogs (public domain, a SQL transcription of the spreadsheet; sat.gob.mx answers from the build host but serves the .xls only behind its own pages) into `cfdi-regimen-data.mjs`: 19 regimes and 24 uses, rows past their end date dropped. **Rules:** `MX-015` the issuer's RegimenFiscal is not one SAT allows for its kind of RFC (601 on a person, 612 on a company); `MX-016` the same for the receiver's regime, or a use the receiver's kind may not take (D01-D10 and CN01 on a company); `MX-017` the use is not allowed with the receiver's regime, and the fix lists the uses that are (with 616: G02, S01). Generic RFCs stay with `MX-014`, a payment's CP01 with `MX-040`, codes outside the catalogue with `MX-003`, and a regime wrong for the RFC draws `MX-016` alone rather than a second, derived `MX-017`. *Measured (2026-11-12):* of the 483 regime/use pairs a receiver of the right kind could write (CP01 aside), SAT's table allows 245; `cfdi.test.mjs` walks every one and pins a finding exactly on the other 238. Four new planted defects in `eval/cfdi-mutations.mjs` (an issuer or receiver regime for the other kind of RFC, D01 on a company, G03 with regime 610 or 616): **14 of 14 caught** over the four seed files they apply to (105 of 106 for the whole set, the one miss as before). On the 13 distinct CFDI 4.0 files in the public CfdiUtils, cfdi-cleaner, cfdi-to-json and cfdi-expresiones test folders (read from checkouts, not copied; two are PAC-stamped real invoices), no `MX-015`..`MX-017` finding. Not done: whether the regime matches the one SAT holds for that RFC (that needs SAT's records), and SAT's own CFDI40xxx codes for these checks (the error matrix was not read).

**Mexico: payments, the Pagos 2.0 complement (new, 2026-11-12).** A CFDI 4.0 of type P (the *complemento de pago* a seller issues when an invoice paid later, PPD, is paid) is now read by `pagos20.mjs`, rules `MX-040`..`MX-049` (this tool's ids, not SAT's CRP2xxxx codes; SAT's error matrix was not read). **Shell (`MX-040`):** Moneda XXX, the single concept (84111506, 1, ACT, "Pago", 0, ObjetoImp 01, no unit, discount or taxes), UsoCFDI CP01, the complement present exactly when the type is P, and Pagos 1.0 named rather than read. The old `MX-014` told a foreign or general-public receiver of a payment to use S01; a payment uses CP01 for everyone, so `MX-014` no longer fires on type P (found on CfdiUtils' `005.xml`). **Schema:** `build-cfdi-schema.mjs` now also reads SAT's `Pagos20.xsd` and `catPagos.xsd` into `cfdi-xsd-data.mjs` (the CFDI tables come out byte-for-byte the same), and the same `MX-002`..`MX-006` checks run on the complement, naming Pagos20.xsd in the fix. **Payments and documents:** MonedaP not XXX, TipoCambioP 1 for pesos and present otherwise, FormaDePagoP not 99, Monto above 0 and within the currency's decimals (`MX-042`); EquivalenciaDR 1 when the invoice and payment share a currency and present when they don't (`MX-044`); ImpSaldoAnt - ImpPagado = ImpSaldoInsoluto exactly, nothing negative, decimals per MonedaDR (`MX-045`); ObjetoImpDR 01/02 against ImpuestosDR (`MX-046`); each DR tax: exempt without rate or amount, ImporteDR = BaseDR x TasaOCuotaDR by the half-unit rule (`MX-047`). **Sums:** Monto at least the documents' ImpPagado / EquivalenciaDR, truncated to MonedaP's decimals (`MX-043`); each ImpuestosP row against the documents' taxes divided by EquivalenciaDR and grouped by tax, factor and rate (`MX-048`); Totales (MontoTotalPagos and the ten IVA/ISR/IEPS totals) against each payment converted to pesos (`MX-049`). The arithmetic is CfdiUtils' SumasPagos20 calculator (MIT) redone in BigInt at scale 24: divide, round half away from zero to 6 decimals per payment and 2 for Totales. Where issuers differ legitimately, every reading CfdiUtils supports is accepted (rounded or truncated payment taxes, fewer decimals written, Totales from the written ImpuestosP or from the recomputed ones), so a finding means none of them reproduces the number. A document without a usable EquivalenciaDR stops that payment's tax comparison and says so in `skipped` rather than raising a second, derived finding. The Mexico page has a second sample button, a payment with four planted faults.

*Measured (2026-11-12).* Seeds: `fixtures/cfdi-4.0-pago.xml` (made up, two payments, MXN and USD, one invoice in pesos paid in dollars at EquivalenciaDR 17.25, IVA 16% and ISR 1.25% withheld; every sum worked out with Python's `decimal`; xmllint accepts it against SAT's cfdv40.xsd and Pagos20.xsd) and nine public type P files from CfdiUtils' tests (`tests/assets/pagos20-calculator/001..008.xml`, `created-cfdi40-pago20-valid.xml`; read from a checkout, not copied: one to 43 documents per payment, USD documents paid in MXN and the reverse, IVA 16/0/exempt, IEPS, ISR and IVA withheld, a Monto above the minimum). **No MX-040..MX-049 finding on any of the ten clean files.** `eval/pagos-mutations.mjs`, 23 planted defects per file where they apply: **202 of 202 caught** by the rule named for them. `eval/pagos-xsd-diff.mjs` against xmllint on the real Pagos20.xsd (the complement's subtree alone): five seeds whose subtree is valid (the other five have their UUIDs blanked by CfdiUtils, and both sides call them invalid), 1,446 mutations in ten kinds, **1,446 of 1,446 verdicts agree**. Not done: whether the paid invoices exist, are PPD and carry the balance claimed (SAT's records), NumParcialidad sequence across payments, the bank fields' patterns by payment form (only the XSD's), CRP rules that need SAT's c_Moneda variation table for TipoCambioP, and any PAC's rejection compared.

**Mexico: payroll, the Nómina 1.2 complement (new, 2026-11-12).** A CFDI 4.0 of type N (the *recibo de nómina* every Mexican employer stamps for each pay to an employee or assimilated earner) is now read by `nomina12.mjs`, rules `MX-050`..`MX-057` (this tool's ids, not SAT's NOMxxx codes; the error matrix was not read). **Source:** SAT's own *Guía de llenado del comprobante del recibo de pago de nómina y su complemento* (`GuiaNomina11102019.pdf`, fetched from omawww.sat.gob.mx on 2026-11-12, 117 pages, written for CFDI 3.3 with complement 1.2); where it names a 3.3 value (UsoCFDI P01) the 4.0 catalogue's CN01 is used and the finding says so. **Shell (`MX-050`):** no TipoCambio, FormaPago 99, MetodoPago PUE, no CondicionesDePago and no tax nodes (ISR withheld is deduction 002 in the complement), a person (13-character RFC) as receiver without ResidenciaFiscal or NumRegIdTrib, UsoCFDI CN01, TipoRelacion 04 only, and the single concept 84111505 / 1 / ACT / "Pago de nómina" whose ValorUnitario and Importe are TotalPercepciones + TotalOtrosPagos and whose Descuento is TotalDeducciones (summed over the complements when one CFDI carries two, as the guide allows for a separation beside the last ordinary pay); a Nómina complement in another type, a type N without one, and Nómina 1.1 are named. **Schema:** `build-cfdi-schema.mjs` also reads `nomina12.xsd` and `catNomina.xsd` (the CFDI and Pagos tables come out byte-for-byte the same; it now throws if two catalogues define the same type), so `MX-002`..`MX-006` run on the complement. **Sums, exact in cents:** TotalPercepciones, TotalDeducciones and TotalOtrosPagos against the lines and present exactly when their node is (`MX-051`); TotalSueldos (every perception but 022, 023, 025, 039, 044), TotalSeparacionIndemnizacion (022, 023, 025), TotalJubilacionPensionRetiro (039, 044), TotalGravado and TotalExento, each perception above 0, SeparacionIndemnizacion / JubilacionPensionRetiro when their codes are paid, 039 against 044 attributes, HorasExtra on 019, AccionesOTitulos on 045 (`MX-052`); TotalImpuestosRetenidos = the 002 deductions and absent without them, TotalOtrasDeducciones = the rest, each above 0 (`MX-053`); each other payment above 0 (0.01 for a subsidy owed but not paid in cash, the guide's Apéndice 5), SubsidioAlEmpleo on 002 with SubsidioCausado at least the amount paid, CompensacionSaldosAFavor on 004 with SaldoAFavor at least RemanenteSalFav and Año the year before the payment (or its own year on a December pay) (`MX-054`). A wrong subtotal draws only its own rule: the Nomina totals are compared with the lines, not the written subtotals. **Periods (`MX-055`):** FechaInicialPago not after FechaFinalPago; TipoNomina O not with PeriodicidadPago 99, E only with 99; FechaInicioRelLaboral not after the period, and Antigüedad (weeks, or calendar years/months/days) not longer than the time between them, counted inclusively. **Employment (`MX-056`):** contract 01-08 needs the employer's RegistroPatronal and regime 02/03/04, 09 and up a regime from 05; with a RegistroPatronal the five social-security fields (NumSeguridadSocial, FechaInicioRelLaboral, Antigüedad, RiesgoPuesto, SalarioDiarioIntegrado) are required and without one absent; no employer CURP on a company; the CURP check digit (python-stdnum's rule; SAT's generic foreign woman's CURP XEXX010101MNEXXXA8 does not fit it, nor can any digit rule of that shape, so both generics are exempt); an 18-digit CLABE with no Banco and a valid control digit (weights 3-7-1, pinned to three published CLABEs; the guide's own sample account fails it), a 10/11/16-digit account with a Banco; SubContratacion shares adding to 100; MontoRecursoPropio exactly with OrigenRecurso IM and below the pay. **Disability (`MX-057`):** perception 014 or deduction 006 needs Incapacidades, whose ImporteMonetario adds to the 014 amount or the 006 Importe; with both present the guide does not say how the amounts divide, so the check is skipped and says so. *Measured (2026-11-12):* no real payroll file was at hand (none in the CfdiUtils, cfdi-cleaner, cfdi-to-json, cfdi-expresiones or cfditopdf test folders), so two made-up seeds: `fixtures/cfdi-4.0-nomina.xml` (an ordinary fortnight: wage, vouchers, social security, ISR, travel allowance, CLABE) and `fixtures/cfdi-4.0-nomina-finiquito.xml` (an extraordinary pay on leaving: overtime, disability subsidy, seniority premium and indemnity, ISR and a loan, subsidy 0.01, last year's balance, time split 60/40). Both draw no finding. `eval/nomina-mutations.mjs`, 39 planted defects, each one the guide calls wrong: **62 of 62 caught** over the two seeds by the rule named for them (16 of the 78 pairings do not apply: no overtime in the ordinary pay, no CLABE in the leaving one, and so on). `eval/nomina-xsd-diff.mjs` against xmllint on the real nomina12.xsd (the complement's subtree alone): 3,638 mutations in ten kinds, **3,638 of 3,638 verdicts agree**. The Mexico page has a third sample button, a payroll receipt with five planted faults. Not done: any real payroll file or PAC rejection; whether the ISR withheld, the subsidy owed or the exempt shares are right (that is payroll arithmetic under the LISR, not a filling rule); the RFC, CURP and NSS against SAT's and RENAPO's records; the guide's Total limits by c_TipoDeComprobante (SAT has not published them); the 2024 subsidy changes and catalogue codes added after the 2019 guide (TipoOtroPago 007-009, TipoPercepcion 054-057) beyond their presence in catNomina.

**Mexico: exports, the Comercio Exterior 2.0 complement (new, 2026-11-12).** A CFDI 4.0 with `Exportacion="02"` (a definitive export, pedimento A1) carries the *complemento para comercio exterior*, which customs and SAT read beside the invoice. It is now checked by `cce20.mjs`, rules `MX-060`..`MX-069` (this tool's ids; every message names the SAT code it stands for, `CCE101`..`CCE172`). **Sources, fetched from omawww.sat.gob.mx on 2026-11-12:** SAT's error matrix for the complement (`Matriz_de_Errores_CCE_v2.0.xls`, 68 rules), the technical standard (`EstandarComercioExterior_v20.pdf`, section 4, which gives the limit formulas) and the filling guide (`Guia_complemento_Comercio_Exterior.pdf`, revision of 2026-01-16), whose Apéndice 4 works four invoices through by hand. **Schema:** `build-cfdi-schema.mjs` also reads `ComercioExterior20.xsd` and `catComExt.xsd` (the CFDI, Pagos and Nómina tables come out byte-for-byte the same), so `MX-002`..`MX-006` run on the complement; the XSD's 26,092 tariff codes (8 and 10 digits, most retired) are left out and the code is checked against the ones in force instead. **Catalogue columns the XSD lacks:** `build-cce20-data.mjs` reads phpcfdi/resources-sat-catalogs (public domain) into `cce20-data.mjs`, 59 KB: the 11,519 tariff codes in force with their unit (UMT) and validity dates, the states of Mexico, the US and Canada, municipalities and localities by state, the state of each postal code (34 boundaries cover 95,748 codes), and c_Pais's postal-code and tax-id patterns and EU grouping. **Rules:** the document (`MX-060`: types I, E, T; Exportacion 02 needs the complement, 03 forbids it, one complement, only beside the stamp, implocal, leyendas fiscales, registro fiscal and Carta Porte; Comercio Exterior 1.1 named), the CFDI under an export (`MX-061`: no InformacionGlobal, ACuentaTerceros or CuentaPredial; a transfer is to oneself with ObjetoImp 01), the header (`MX-062`: MotivoTraslado only and always on a transfer, 05 with Propietario, 01 with the sale's UUID, the certificate of origin number, the EU approved-exporter number only to an EU country, Incoterm on Exportacion 02), TotalUSD = the ValorDolares summed and rounded to cents (`MX-063`), the issuer (`MX-064`: CURP for a person and not for a company, a Mexican address whose municipality and locality belong to the state and whose postal code is in that state), the receiver (`MX-065`: NumRegIdTrib exactly for XEXX010101000 and not with a Mexican address, the US and Canadian 9-digit patterns, state codes and postal-code patterns for the US and Canada, the catalogues for a Mexican address), owners and addressees (`MX-066`: the same, one addressee on a transfer), goods against lines (`MX-067`: every line has a NoIdentificacion, every Mercancia matches a line, no repeated NoIdentificacion + tariff code, the three customs fields together and on every Mercancia once on one, a transfer line's Cantidad, Unidad and ValorUnitario without them), tariff code and unit (`MX-068`: none for a service, UnidadAduana 99 or ClaveUnidad E48, required otherwise, in force on the CFDI date, UnidadAduana or else the line's Unidad equal to the tariff's unit, a unit customs value above 0), and dollar values (`MX-069`). **The dollar arithmetic, exact in BigInt:** ValorDolares within CantidadAduana x ValorUnitarioAduana, each widened by half a unit in its last written decimal, the lower limit truncated and the upper (less 10^-12 on each factor) rounded up to cents, as the standard writes it; for an invoice or credit note, the ValorDolares of each NoIdentificacion within its lines' Importe x TipoCambio / TipoCambioUSD by the same rule (pesos at a rate of exactly 1; a CFDI in dollars at its Importe, whatever rate the parties agreed, which is the guide's procedure 2 and the only reading under which its examples 2 and 3 pass); each rate is widened by its own decimals, where the standard writes the CFDI rate's for both, since the narrower reading would reject files the guide calls right; ValorDolares 0 or 1 skips the limits, and 0 is only for a service; samples (9801000100) worth no more than their line's discount. *Measured (2026-11-12):* the four Apéndice 4 invoices (pesos, dollars at an agreed rate of 18, dollars with a piece holding half a litre, euros) as `fixtures/cfdi-4.0-cce20-{mxn,usd,litre,eur}.xml`, plus a made-up consignment transfer (`cfdi-4.0-cce20-traslado.xml`), draw no finding; the limits come out at the guide's own 1,022,424.57 to 1,022,425.06 and 99.89 to 100.11 (`cce20.test.mjs`). `eval/cce20-mutations.mjs`, 57 planted defects, each a case the matrix gives a CCE code for: **208 of 208 caught** over the five seeds by the rule named for them (77 of the 285 pairings do not apply, such as transfer-only rules on an invoice). `eval/cce20-xsd-diff.mjs` against xmllint on the real ComercioExterior20.xsd: 1,594 mutations in ten kinds, **1,594 of 1,594 verdicts agree**. The Mexico page has a fourth sample button, an export with five planted faults. Not done, and said in `skipped` when a file leans on it: whether TipoCambioUSD is Banxico's FIX rate for the day (`CCE121`), a Mexican receiver in SAT's l_RFC list (`CCE107`), a tax id in a country's online register. A postal code's colonia, municipality and locality are checked since the same day ("Mexico: postal codes" below). The catalogue is as phpcfdi published it (last tariff change 2024-03-22; it lists the United Kingdom under Unión Europea, as SAT's c_Pais does). No real export file or PAC rejection was at hand.

**Mexico: waybills, the Carta Porte 3.1 complement (new, 2026-11-12).** Goods that move by road, sea, air or rail in Mexico travel under a CFDI (a transfer, type T, or the carrier's freight invoice, type I) carrying the *complemento Carta Porte*: where the goods leave from and go to, what they are and weigh, the vehicle, vessel, aircraft or train, and who drives or owns it. It is now read by `cartaporte31.mjs`, rules `MX-070`..`MX-079` (this tool's ids, not SAT's CPxxx codes: SAT's error matrix for the complement was not read, because omawww.sat.gob.mx refused the build host's proxy on 2026-11-12, so every rule cites what it does rest on). **Schema:** `build-cfdi-schema.mjs` also reads `CartaPorte31.xsd` and `catCartaPorte.xsd` (the CFDI, Pagos, Nómina and Comercio Exterior tables come out the same), so `MX-002`..`MX-006` run on the complement; c_ClaveProdServCP's 48,757 product keys are stored as runs, and c_Estaciones (8,447 stations) and c_MaterialPeligroso (4,686 UN numbers) are checked from `cartaporte-data.mjs` instead (`MX-003`). **Catalogue columns the XSD lacks:** `build-cartaporte-data.mjs` reads phpcfdi/resources-sat-catalogs (public domain) into `cartaporte-data.mjs`, 51 KB: each station's transport mode (5,280 stations; the other 3,167 codes in the XSD, EA001.., EF001.., EF0001.., have no row in the mirror and are accepted with the mode check skipped and said so), each permit's mode (c_TipoPermiso), whether a vehicle configuration takes a trailer (c_ConfigAutotransporte: 1, 0 or either), and the 2,694 product keys whose "Material peligroso" column is 1 or "0,1". **Rules:** the document (`MX-070`: version 3.1 only, 2.0 and 3.0 named rather than read; one complement; a transport node present); locations (`MX-071`: an origin and a destination, IDUbicacion OR for an origin and DE for a destination as the XSD's note says, ids unique, each CantidadTransporta's IDOrigen and IDDestino an existing location of the right type, no arrival before the first departure); `MX-072` TotalDistRec = the DistanciaRecorrida summed ("la suma de las distancias recorridas", the XSD), and present when they are; `MX-073` NumTotalMercancias = the Mercancia nodes, PesoBrutoTotal = the PesoEnKg summed when UnidadPeso is KGM (another unit is named in `skipped`), PesoNetoTotal = the DetalleMercancia PesoNeto summed; `MX-074` a station's mode (c_Estaciones) and each PermSCT's mode (c_TipoPermiso, which the XSD says "debe corresponder") against the transport nodes present; `MX-075` Remolques present for a trailer configuration (T3S2) and absent for one without (C2); `MX-076` hazardous goods: a product key flagged 1 is MaterialPeligroso "Sí", "0,1" says which, 0 leaves it out, "Sí" needs CveMaterialPeligroso and Embalaje and "No" neither, and by road the environmental insurer and policy (the XSD: "cuando exista al menos una mercancía tipificada como material peligroso se debe registrar"); `MX-077` an international move (TranspInternac Sí) names EntradaSalidaMerc, PaisOrigenDestino (not MEX) and a ViaEntradaSalida the complement transports by, and a domestic one names none of them nor RegimenesAduaneros; `MX-078` a road driver (TipoFigura 01) has NumLicencia, a figure has an RFC or a foreign tax id but not both, and a foreign tax id has its country; `MX-079` RFC check digits on the locations and figures (the `MX-007` rule and caveat). Amounts are compared exactly in BigInt. A reading of a catalogue column the matrix may word differently (the hazardous flag, the trailer flag) is this tool's, and the README says so here.

*Measured (2026-11-12).* Five made-up waybills, `fixtures/cfdi-4.0-cp31-{road,road-intl,air,rail,sea}.xml` (fuel and soft drinks by tractor and semi-trailer to two depots with the environmental policy; laptops leaving for the US by road; an air, a rail and a sea transfer between catalogue stations), each accepted by xmllint against SAT's CartaPorte31.xsd and drawing no finding. `eval/cartaporte-xsd-diff.mjs` against xmllint on the real XSD: 1,848 mutations in eleven kinds, **1,848 of 1,848 verdicts agree**. `eval/cartaporte-mutations.mjs`, 43 planted defects: **125 of 125 caught** over the five seeds by the rule named for them, none on the clean files. **Public files:** a GitHub code search for "CartaPorte31" gave 699 XML files, 322 distinct CFDI 4.0 files with the complement (not copied into the tree; URLs and the script in `eval/cartaporte-public-files.md`). Against xmllint on their CartaPorte subtrees, **314 of 314 readable files agree** on schema validity; the other 8 are not CFDIs (a deliberately broken root, Odoo QWeb templates) and stop at `MX-001`. Only 21 of the 322 are schema-valid: 257 come from one project's generated demo and stress files with SAT's test stamp, which also carry PesoBrutoTotal unequal to the goods' weights (`MX-073`) and T3S2 trucks without Remolques (`MX-075`). Five carry a real PAC's stamp; two real waybills from one business draw no finding at all; one draws only `MX-079`/`MX-007` on RFCs the PAC accepted (so registered RFCs that fail the mod-11 digit, the known caveat); one test-environment file draws `MX-071` for a CantidadTransporta sent to `DE202021`, a location that does not exist, which its PAC stamped anyway (so a stamp does not prove the cross-references hold); one SDK sample is clean. That run also found a bug in the shared schema layer: `fractionDigits` counted written zeros, so a real stamped `PesoBrutoVehicular="27.8900"` (XSD: 2 decimals) drew `MX-003`; xmllint and the PAC accept it, and `cfdi.mjs` now compares the value's decimals (trailing zeros dropped), for every CFDI complement. **Not done:** SAT's CPxxx matrix (its codes and any rule it adds: the date windows, the IdCCP's link to the stamp, the vehicle weight limits under NOM-012), a RFC in SAT's l_RFC list, Carta Porte 2.0 and 3.0, and any rejection compared.

**Mexico: postal codes (new, 2026-11-12).** A Mexican address in an export or a waybill names its state, municipality, locality and colonia as SAT catalogue codes beside a postal code, and SAT's export matrix rejects a municipality or locality that is not the postal code's (`CCE130`, and `CCE141`/`CCE150` for the receiver and addressees) and a colonia code not listed for it (`CCE129`, `CCE136`, `CCE145`). Until now only the postal code's state was checked. `build-mx-address-data.mjs` reads c_CodigoPostal and c_Colonia from phpcfdi/resources-sat-catalogs (public domain) into `mx-address-data.mjs`, 481 KB (about 210 KB gzipped): the 32,808 postal codes whose row names a municipality, with their state, municipality and locality, and the 145,366 colonia codes of 32,333 postal codes, without the names; decoding it reproduces both tables exactly (95,748 and 145,366 rows compared). `mx-address.mjs` does the comparison. A column the catalogue leaves empty is no constraint: 62,940 rows of c_CodigoPostal are unassigned codes inside a state's block with no municipality, and most rows have no locality. In exports the findings carry the CCE code under the rule of the party (`MX-064`..`MX-066`). In waybills, whose XSD types these fields as free text, a new rule `MX-080` checks every Mexican Domicilio on a location or transport figure: Estado a c_Estado code, Municipio and Localidad codes of that state, the postal code in c_CodigoPostal and in that state, then the same postal-code cross-check. It rests on SAT's export matrix for the same catalogues and the schema's note ("la clave de la colonia"), not on the Carta Porte matrix, which was not read. A municipality or colonia written as a name is not compared, and `skipped` says so. *Measured (2026-11-12):* `eval/mx-address-public-files.mjs` on 1,595 public XML files from a GitHub code search for Carta Porte 2.0/3.0/3.1 and Comercio Exterior 1.1/2.0 (`eval/mx-address-public-files.md`; not copied): 189 distinct CFDIs carry 408 Mexican addresses, 380 of them at a postal code whose row names a municipality. **56 files stamped by a real PAC (155 addresses; 19 municipality, 13 locality and 19 colonia codes compared): no disagreement.** The disagreements are all in unstamped or test files: Odoo's Carta Porte 3.0 test template puts Municipio 032 at postal code 20928, which is Aguascalientes' 005 (Jesús María), in 8 files (4 distinct); an unstamped Carta Porte 2.0 file (three copies) puts that postal code under Michoacán; an unstamped Comercio Exterior 1.1 file gives colonia 0048 to 53040, whose only listed colonia is 2285; and seven name the state ("Coahuila", "Mexico City") or use DIF, the code for the Federal District before it became CMX (a 2017 file with a placeholder stamp). Over all 408 addresses, Municipio was a code 227 times and a name 11, Colonia a code 129 times and a name 7. Tests: `cce20.test.mjs` (CCE129 and CCE130 on the transfer fixture, an empty catalogue column), `cartaporte31.test.mjs` (`MX-080`: municipality, locality, colonia, state codes, the postal code's state, names skipped, foreign addresses left alone). Not done: SAT's own wording of the Carta Porte rules, catalogue revisions after the phpcfdi copy, and whether a street exists.

**Italy: FatturaPA (new).** An XML file whose root is `FatturaElettronica` (FPR12 business, FPA12 public body) is not EN 16931, so it is read by `fatturapa.mjs` with its own rules `IT-001`..`IT-024`: partita IVA (Luhn) and codice fiscale check digits, SdI destination code length, TipoDocumento, RegimeFiscale and Natura codes, 0% lines needing a Natura, line / VAT-summary / document-total arithmetic to the cent, payment IBAN, and, from 2026-10-30, the Agenzia delle Entrate's own schema read into a table (`fatturapa-xsd.mjs`, below). Rule ids are this tool's own; since 2026-11-13 a finding that reproduces an SdI rejection carries its code in `sdi` and names it, with the tolerance read from the Agenzia delle Entrate's specification 1.9 itself (below). When a cassa, bollo, withholding, rounding or document discount is present the totals checks are skipped and named in `skipped`, never reported as a pass. **Spec 1.9 codes (2026-10-24).** TD29 (omitted or irregular invoicing report) and RF20 (cross-border VAT franchise) joined the code lists, per the Agenzia delle Entrate's specification 1.9 in force from 1 April 2025 (read from press and software-vendor summaries; the primary site is unreachable from the build host). `IT-023`: a TD29 whose seller's IdPaese is not IT, which SdI rejects (error 00473 as the summaries give it). Tested in `fatturapa.test.mjs`; not yet against a real SdI file. **2026-11-11 (red team).** `IT-024`: lines at an AliquotaIVA and Natura that no DatiRiepilogo covers (the reverse of `IT-015`). Dates are now checked as real calendar days: `Date.parse` had let 2026-02-30 through as 2 March, in `IT-009` and in the schema check `IT-021`. Not checked: the signature, duplicate numbers, SdI acceptance. **Schema 1.2.3 and its code lists (2026-11-12).** `build-fatturapa-schema.mjs` now reads XSD 1.2.3, the schema of specification 1.9, instead of 1.2.1. The Agenzia's sites refuse the build host, so the script downloads the copy in phax/ph-fatturapa (Apache-2.0) and refuses it unless its SHA-256 matches a pin. The pin was set from three independent copies that agree byte for byte (phax/ph-fatturapa, LucaCappelletti94/fatturapa, amusarra/dontesta-fisco-hub). Two more (invopop/gobl.it.sdi, deved-it/fattura-elettronica) differ only in the xmldsig import path, documentation text and, in deved's FPR12-only copy, the FPA12 code. Every code list is now read from the schema and enforced: TipoDocumento (`IT-008`), RegimeFiscale (`IT-006`) and Natura (`IT-011`) keep their own rule ids, and the other 15 lists raise `IT-021`. The schema keeps CausalePagamento `Z` and Natura `N2`, `N3` and `N6` for old files, but its own comments say they are not valid for invoices issued from 1 January 2021. The build reads those comments, so the tool refuses these codes even though xmllint accepts them. Changes from 1.2.1: TipoRitenuta RT03-RT06, CausalePagamento M2 and ZO, and ModalitaPagamento MP23 were added; DatiRitenuta may now repeat; ImportoBollo is optional; a ScontoMaggiorazione Importo takes 8 decimals; CodiceValore allows Latin-1; and contact emails have their own type. **Fixed wrong verdicts**, each checked against xmllint on the 1.2.3 schema (`fatturapa.test.mjs`): **TD07-TD09 were accepted.** They are simplified-invoice codes (FSM10) and are not in the FatturaElettronica schema, so SdI's first gate refuses them; `IT-008` now flags them. Before this change the tool also accepted RT07, MP24 and CausalePagamento `Z`. It wrongly flagged a second DatiRitenuta (withholding plus INPS) as `IT-019` and a DatiBollo without ImportoBollo as `IT-020`. **Differential against xmllint** (`eval/fatturapa-xsd-diff.mjs`, now with a `code` mutation that swaps a coded value for another code in the list, a made-up code of the same shape such as MP24, or a retired code): 2 seeds x 1,040 mutations of the 13 schema-valid corpus files, 2,080 of 2,080 verdicts agree. The old 1.2.1 checker run on the same mutations missed 29 of the 260 code mutations, all of them made-up FormatoTrasmissione values such as FPA13. Still not done: no real SdI acceptance or rejection to compare, and SdI's own error codes for these cases are not read from the primary text. `examples/fatturapa-invoice.xml` is clean; `examples/fatturapa-invoice-with-defects.xml` is the same invoice with six planted faults that raise nine rules (IT-002, 003, 006, 011, 012, 014, 015, 016 as a warning, 021), pinned in `fatturapa.test.mjs`. **Specification 1.9 read from the source (2026-11-13).** The Agenzia's site answered a cloud session for the first time, so its Allegato A v1.9 (Italian and English) and XSD 1.2.3 were read directly (`eval/sdi-error-codes-2026-11-13.md`). The official XSD hashes to the pin set from mirrors. Three tolerances were wrong: Imposta (`IT-014`, SdI 00421) is now rounded half up before the one-cent tolerance; ImponibileImporto (`IT-015`, 00422) is now summed per AliquotaIVA over lines, cassa contributions and Arrotondamento with SdI's **one-euro** tolerance (it was a cent per line, per rate and Natura, and was skipped whenever a cassa was present), and a gap within the euro is the warning `IT-025`; and ImportoTotaleDocumento (`IT-016`) has no SdI check at all, so it is now a warning. `IT-024` checks rates (00443) and Natura codes (00444) as two sets, cassa included. New offline checks: 00313 and 00330 (`IT-002`), 00403 (`IT-009`, dated after today in Italy), 00413/00414/00429/00430 and the TD16 exception (`IT-011`), 00411/00415 (`IT-027`), 00418 (`IT-033`), 00420 (`IT-026`), 00437/00438 (`IT-028`), 00471/00472 (`IT-031`), 00473 for TD17-19/28 (`IT-023`), 00474 (`IT-032`), 00475 (`IT-029`), 00476 (`IT-030`). The eval lists every code in the 1.9 error table and what covers it; codes that need SdI's registers (00300-00326, 00404, 00477) or the signature stay out of reach offline. On 50 public FatturaPA files the new verdicts were each checked by hand against the specification's text: none is a false positive by that text. Not yet compared with a real SdI rejection receipt. **Schema checks (2026-10-30, `IT-018`..`IT-022`).** `build-fatturapa-schema.mjs` reads the FatturaPA XSD 1.2.1 (from the `@digitalia/fatturapa` npm package; fatturapa.gov.it is unreachable from the build host) into `fatturapa-xsd-data.mjs`: element order, how many times each may occur, and the length, pattern and range facets. The XSD itself is not copied. `fatturapa-xsd.mjs` then raises `IT-018` (out of sequence, for every block, not the hand-written list of eleven), `IT-019` (an element not allowed there, or one too many), `IT-020` (a required element missing, including the Denominazione-or-Nome+Cognome choice), `IT-021` (a value too long, empty, not a number or date, or holding a character outside Basic Latin and Latin-1: a euro sign or a smart quote in a description, which SdI refuses) and `IT-022` (cut-off or mismatched XML). Messages name the element and the reason and never echo the value. Until 2026-11-12 (1.2.3 upgrade, above), code lists were not read from 1.2.1, which predates TD16-TD28, RF17-RF19 and the N2.x/N3.x/N6.x codes (our own clean example uses N2.2 and fails the 1.2.1 enumeration); only ten lists that have not grown (`STABLE_ENUMS`: EsigibilitaIVA, CondizioniPagamento, TipoCessionePrestazione and so on) are enforced. A missing child of an element with a schema `default` (Nazione) is accepted, as the schema fills it in. **Measured against xmllint on the real XSD** (`eval/fatturapa-xsd-diff.mjs`): of the 15 corpus files, xmllint accepts 13; the Agenzia's own sample `FPR02` fails it on exactly the order this tool had exempted (ContattiTrasmittente must come before PECDestinatario, so that exemption is gone and the sample now draws `IT-018`), and eigor's `con-ritenuta-acconto-e-cassa-previdenziale.xml` is cut off before its closing tag (now `IT-022`; the old reader passed it). Then 2 x 819 seeded mutations of the 13 valid files (an element deleted, duplicated or swapped with its neighbour, an unknown element added, a value emptied, lengthened by 1,100 characters, or given a euro sign), each judged by xmllint and by this tool: 1,638 of 1,638 verdicts agree. Not done: the namespace and attribute checks, the signature block, the 1.2.2 and later schema changes (anything the Agenzia added to the structure after 1.2.1 would be reported as `IT-019` here, so the message says what the schema allows, not that SdI refuses; the 15 corpus files show no such case), and no real SdI acceptance.

**Official Schematron (optional).** Beside the built-in rules you can
run the CEN EN 16931 validation artefacts (ConnectingEurope/eInvoicing-EN16931,
EUPL-1.2) for UBL and CII invoices, in Saxon-JS, with each BR-xx failure mapped
to a plain-language fix (`schematron-fixes.mjs`). When the invoice's
specification identifier (BT-24) names XRechnung, the KoSIT XRechnung rules
(BR-DE-xx, Apache-2.0, UBL and CII) run too; when it names Peppol BIS Billing 3,
the OpenPEPPOL rules (PEPPOL-EN16931-Rxxx, MPL-2.0, UBL invoices and credit notes, and CII) run. Findings carry
the official rule ID and `source` of `en16931-schematron`, `xrechnung-schematron`
or `peppol-schematron`; the built-in `INV-nnn` rules still run. Neither the engine nor the compiled rules ship in this folder:

```sh
cd ventures/einvoice-preflight
npm i --no-save saxon-js xslt3     # Saxon-JS is Saxonica's, free to use, not MIT
node build-schematron.mjs          # clones the artefacts (needs git, curl, unzip), compiles ./schematron/*.sef.json (~2 min)
node schematron-cli.mjs examples/ubl-invoice-with-defects.xml   # or --json
# API: POST /v1/validate?schematron=1 (report.reports[].schematron is "ok" or "unavailable")
```

Checked on the bundled examples: the clean UBL, CII and Factur-X invoices pass
the base rules, and the defects file raises BR-CO-15, BR-CO-16, BR-CO-17, BR-S-09
and BR-61. The bundled UBL example names XRechnung 3.0 and the XRechnung rules
find what a German public buyer would reject: no seller contact (BR-DE-2) and no
buyer post code (BR-DE-9). The Docker image builds the rules in a first stage and
ships them with Saxon-JS (`?schematron=1`). JSON drafts have no XML to check. On a self-hosted copy the web page has an "Also run the official EN 16931 Schematron" box: it posts the XML to the page's own `/v1/validate?schematron=1` (`official.mjs`) and lists the official findings beside the built-in ones; on a static host with no API it says the check did not run, never a pass.

**In the page, on any static host (shipped).** `plain/` holds the same official rules as plain JSON, compiled from the Schematron source by `node build-plain-rules.mjs` (`plain-compile.mjs`; needs `npm i --no-save slimdom fontoxpath esbuild`), and fontoxpath (MIT, bundled) to run them (`plain-schematron.mjs`, loaded by `official-browser.mjs`). No Saxon, no server, no licence caveat: the web page runs the EN 16931, XRechnung and Peppol rules in your browser and downloads only the sets your file's BT-24 needs (about 0.3 MB for a base-only check). `plain/manifest.json` records the upstream commit of each set. It is checked against the Saxon route: every example in `examples/` and the official eInvoicing-EN16931 examples (40 files) give the same rule at the same location as the compiled SEFs, and 353 of 353 randomly edited copies (deleted elements, changed amounts and codes, blanked values) do too (`plain-schematron.test.mjs` repeats the example comparison when the SEFs are built). Where it differs from XSLT by design, it says so:
- fontoxpath keeps numbers in doubles where the rules assume exact `xs:decimal`; a failed top-level equality is re-asked as "equal within 1e-7", which can only clear a finding (the XRechnung-O example's BR-O-08 is floating-point noise without it), never raise one;
- IBAN mod-97 checks (DE-R-019/020 and XRechnung's `checkIBAN`) cast a 24-digit string to `xs:integer`; they run as a digit-by-digit remainder;
- a rule that cannot be evaluated is returned in `skipped` and named on the page ("N rule(s) ... were NOT checked"), never counted as a pass. None skip on the examples.
Both are `EUPL-1.2` (EN 16931), `Apache-2.0` (XRechnung) and `MPL-2.0` (Peppol) data; the licences and commits are in `plain/manifest.json`.

**No server needed (in-browser).** `node build-schematron.mjs && node build-browser.mjs` writes `./browser/` (Saxon-JS's browser runtime fetched from saxonica.com, the compiled rules, a manifest). Serve it beside `index.html` on any static host and the same box runs the official rules in the visitor's browser (`official-browser.mjs`): the invoice never leaves the page, and the note says so. Checked in headless Chromium on `ubl-invoice-with-defects.xml`: BR-CO-15, BR-61, BR-CO-16, BR-S-09 and the XRechnung BR-DE-2, zero POST requests. The folder is git-ignored and not on the owner's Pages copy on purpose: Saxon-JS's licence does not allow copying it to a site whose main purpose is to serve it to third parties, so each deployer builds their own (`official-browser.test.mjs` runs the real runtime when it exists). The
XRechnung messages are in German, as the KoSIT rules publish them; the `fix` line
is English. `examples/xrechnung-cii-invoice.xml`, `examples/xrechnung-cii-credit-note.xml` (CII credit note, type 381, with its BT-25 invoice reference) and `examples/peppol-credit-note.xml` (Peppol BIS 3 UBL credit note) pass the official rules (the CII ones with one information-level note, BR-DE-TMP-32) and are pinned by tests. `examples/ubl-credit-note-with-defects.xml` is a credit note with six faults (a 380 type code, no buyer reference, a VAT total that disagrees with its subtotal, a German seller without a contact); the official rules report BR-CL-01, BR-CO-14, BR-CO-15, DE-R-015, PEPPOL-EN16931-P0101 and PEPPOL-EN16931-R003, each with a specific English fix, pinned by tests. `examples/xrechnung-cii-credit-note-with-defects.xml` is the clean CII credit note with four faults (no buyer reference, no seller contact, a VAT amount that is not 19% of its basis, a type code outside UNTDID 1001); the official EN 16931 and XRechnung rules report BR-CL-01, BR-CO-14, BR-CO-17, BR-DE-15, BR-DE-17, BR-DE-2, BR-DE-TMP-32 and BR-S-09, each with a specific English fix, pinned by tests. `examples/peppol-nl-credit-note.xml` (a Dutch Peppol credit note, KVK identifiers) passes; `examples/peppol-nl-credit-note-with-defects.xml` drops the invoice reference, the seller's street and the KVK scheme, and the official rules report NL-R-001, NL-R-002 and NL-R-003, each with an English fix (all nine Peppol NL-R rules now have one; pinned by tests). Building it also showed the endpoint check rejected scheme 0106 (the Dutch KVK number, a registered EAS code), a false INV-039 on Dutch KVK endpoints; it is accepted now (JS and Python). The NLCIUS rules themselves now run too (see the next paragraph). Peppol also applies its German `DE-R-nnn` rules to a domestic German invoice (seller contact, buyer post code, payment groups); each has an English fix.

```sh
cd ventures/einvoice-preflight
# Browser: open index.html, or `python3 -m http.server 8765` and visit
# http://127.0.0.1:8765/ — same rule IDs as the CLI. After a check,
# Download remediation CSV is the same one-row-per-rule queue as
# --format remediation-csv. Other CLI formats include VAT/IBAN/BIC/RF
# credit-note document type (INV-032 through INV-034), 0% / exempt
# tax reasons (INV-035 and INV-036), mixed-rate tax breakdown
# (INV-037 and INV-038), buyer/seller electronic addresses
# (INV-039 through INV-041), invoice period start/end
# (INV-042 and INV-043), and payment means vs IBAN
# (INV-044 through INV-046), buyer / purchase-order
# references (INV-047 through INV-049), header
# allowances or charges (INV-050 through INV-052),
# and payment terms days vs due date
# (INV-053 and INV-054).
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-invoice.json
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-credit-note.json
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-mixed-rate.json
PYTHONPATH=src python3 -m einvoice_preflight examples/cii-invoice.xml
PYTHONPATH=src python3 -m einvoice_preflight examples/factur-x-invoice.pdf
# examples/factur-x-credit-note.pdf: a Factur-X (EN 16931) credit note, type 381; its XML passes the official rules. Both readers now take BT-25 (the invoice a CII credit note reverses) from the settlement header; before, every CII or Factur-X credit note drew a false INV-033.
PYTHONPATH=src python3 -m einvoice_preflight examples/ubl-invoice.xml
PYTHONPATH=src python3 -m einvoice_preflight examples/peppol-credit-note.xml
# The one example that is meant to fail: six planted defects, annotated at the
# top of the file and pinned by tests/test_examples.py. Exits 1.
PYTHONPATH=src python3 -m einvoice_preflight examples/ubl-invoice-with-defects.xml
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-invoice.json --format json
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-invoice.json --format sarif > preflight.sarif
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format github
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format markdown > review.md
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format html > review.html
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format csv > triage.csv
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format remediation-csv > remediation.csv
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format junit > preflight.junit.xml
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format summary
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format remediation
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format checklist
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --max-files 500 --max-depth 2 --format json
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --max-files 500 --max-bytes 1048576 --format json
cat invoice.json | PYTHONPATH=src python3 -m einvoice_preflight - --format json
PYTHONPATH=src python3 -m einvoice_preflight examples/valid-invoice.json --usage-file ~/.local/state/einvoice-preflight/usage.json
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format json
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format jsonl
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format json --max-files 500
PYTHONPATH=src python3 -m einvoice_preflight invoice.json --max-bytes 1048576 --format json
PYTHONPATH=src python3 -m einvoice_preflight invoice.xml --format json
PYTHONPATH=src python3 -m einvoice_preflight ./invoices/ --format sarif --output preflight.sarif
```

For an installed command, run `python3 -m pip install .` from this directory,
then use `einvoice-preflight invoice.json` from anywhere. The installed command
also supports `einvoice-preflight --version` for CI logs and adapter diagnostics.
The package has a focused GitHub Actions workflow that installs the command,
runs the standard-library test suite, and smoke-tests the installed entry point
whenever this venture changes.
Pass `-`
as the filename to read one JSON, UBL XML, CII XML, or Factur-X PDF invoice from
standard input, which is useful for ERP adapters and CI pipelines. SARIF reports
use `stdin.json` as the artifact name for piped input. Directories are scanned
recursively for `.json`, `.xml`, and `.pdf` files. A Factur-X / ZUGFeRD /
XRechnung PDF is unwrapped to its embedded invoice XML before the same checks
run. Encrypted PDFs and scanned paper PDFs with no attachment are refused.
XML input maps common UBL Invoice, CreditNote, and
DebitNote elements, and CII CrossIndustryInvoice, into the same checks. It is
not a full Peppol or EN 16931 conformance validator. Use
`--max-files N` in CI or ERP jobs to refuse a directory scan when more than `N`
invoice files are present. This bounds accidental scans of a broad working
tree; the command exits `2` without reading any invoice contents.
Use `--max-bytes N` to refuse an individual file or stdin stream larger than
`N` bytes before parsing it. This provides a memory and denial-of-service guard
for CI and ERP jobs; oversized inputs are reported as read errors and exit `2`.
The tool never submits an invoice, chooses a tax rate, contacts a tax
authority, or claims that an invoice is legally valid. It only checks the
document facts represented in the input schema. The user remains responsible
for selecting the correct format, tax treatment, and submission process.

**Saudi Arabia: ZATCA (Fatoora) rules (shipped 2026-10-25).** A UBL file whose `cbc:ProfileID` is `reporting:1.0` (simplified) or `clearance:1.0` (standard) is checked by ZATCA's own published rules *instead of* the EU base (KSA invoices carry no BT-24 profile, so the PINT matcher gained a `profileId` test). Two sets: ZATCA's cut of the EN 16931 UBL rules (105 checks) and the KSA business rules, BR-KSA-* (152 checks, including the VAT-number, CRN, QR, cryptographic-stamp, prepayment and 24-hour reporting rules). The rules ship only as SchXslt-compiled XSLT in the `phive-rules-zatca` artefact on Maven Central (rules version 3.4.6; ZATCA publishes them under LGPL-3.0); `build-zatca-rules.mjs` reads them through a second reader in `plain-from-xslt.mjs`, because SchXslt's shape differs from the one PINT and RO use: one mode for all rules with the pattern named inside, and ZATCA's hand-written `xsl:if`, `xsl:for-each` and `xsl:choose` around each assert. The reader rebuilds each assert as one XPath that is true when the check fails (a for-each becomes `exists((select)[violation])`, a `when`/`otherwise` branch carries the negation of the branches before it) and throws on any construct it does not know. Count check: 152 of the 152 `failed-assert`s in the stylesheet come out (the first pass lost 4 that sat in a template with no `xsl:choose`; the test would not have caught it, the id count against the stylesheet did). fontoxpath has no `fn:format-number`, which ZATCA's VAT-amount rules (BR-CO-17, BR-S-09, BR-KSA-51/79/80) use; `plain-compile.mjs` now rewrites it to a prolog function for the two pictures in use (`0.00`, `#.00`: two decimals, half to even), without which those five rules were skipped, not passed. ZATCA's `error` flag is shown as `fatal`. Verification (`zatca.test.mjs`, 6 tests; made-up invoices `examples/zatca-simplified-invoice.xml` and `-with-defects.xml`): the clean file runs with no skipped rule and raises only BR-KSA-98 (the clock rule: any fixed issue date is more than 24 hours old) and BR-KSA-29; the defect file adds BR-CO-14, BR-CO-15, BR-CO-17, BR-S-09 (VAT 14.00 on 100.00 at 15%), BR-KSA-27 (no QR), BR-KSA-40 (a VAT number that does not start and end in 3) and BR-KSA-F-08 (a CRN that is not 10 digits); an unsigned simplified invoice draws BR-KSA-28, -30 and -60. The suite also pins the reader on a tiny fixture. Not done and not known: no real ZATCA sandbox invoice or Fatoora verdict has been tried (the invoices are ours, written against the rule texts), so false positives on real files are possible. BR-KSA-29 used to fire on every signed invoice, ours included: the rules' svrl namespace list binds `sbc` to CommonSignatureComponents-2 (an upstream typo), while the compiled stylesheet's own `xmlns:sbc` is SignatureBasicComponents-2, the namespace ZATCA's samples use and the one an XSLT engine resolves with. Read against the 3.4.6 jar on 2026-11-05; `plain-from-xslt.mjs` now lets the stylesheet's declaration win, `plain/zatca-ksa-ubl.json` is rebuilt, and BR-KSA-29 fires only on an invoice with no stamp (pinned in `zatca.test.mjs`). Signatures, the QR TLV and the invoice hash chain are not checked beyond their presence; the Saxon route and server API still run the EU base on a KSA file; no CII form exists; credit notes (2026-10-26, `examples/zatca-simplified-credit-note.xml`, 2 tests): ZATCA's rules treat a credit or debit note as an `Invoice` document with type code 381 or 383, not a UBL `CreditNote` root. Ours passes, and without its `BillingReference` and `InstructionNote` it draws BR-KSA-56 and BR-KSA-17. A `CreditNote`-rooted file draws EU-base false positives (BR-22 and others read `InvoicedQuantity` and `/ubl:Invoice/...` paths), so a KSA file should not use that root; no real ZATCA credit note was tried. Debit notes (2026-10-25, `examples/zatca-simplified-debit-note.xml`, type 383, 1 test) behave the same: clean, and BR-KSA-17 and BR-KSA-56 without the reason and reference; also made up, no real one tried; the 2.0.3 and 2.3.8 rule versions in the jar are not run; XRechnung-style English fixes for BR-KSA ids are not written (the messages are ZATCA's own English).

**Netherlands NLCIUS (SI-UBL 2.0), shipped 2026-10-25.** A UBL file whose BT-24 names `urn:fdc:nen.nl:nlcius:v1.0` (or the G-account variant `gaccount:v1.0`) now also gets the Dutch national rules, 39 checks (BR-NL-1 to BR-NL-35 and SI-UBL-2), compiled by `build-nl-rules.mjs` from `si-ubl-2.0.3.13.xslt` in `phive-rules-simplerinvoicing` 4.6.3 on Maven Central (set `EINVOICE_NL_JAR` for a jar on disk, `EINVOICE_NL_RULES` for another rules version). The XSLT bundles the EU base, so the builder keeps only the pattern that holds the national checks and throws if it mixes in base checks. Errors cover the KVK/OIN identifiers, street/city/post code, buyer or order reference, type codes 380/381/384/389 against the Invoice or CreditNote document, a payment means and its code (30, 48, 49, 57, 58, 59); the warnings flag fields NLCIUS says to leave out (tax point date, country subdivision, address line 3, reason codes). The rules only fire for a Dutch seller. A Peppol BIS file does not match; it keeps the Peppol NL-R rules. UBL and, from 2026-10-25, CII (34 checks from `nlcius-cii-1.0.3.13.xslt`, same artefact and builder; the CII twin of the empty-element rule reports as `empty-element-check`); plain route only (browser and Node fallback), no Saxon form. CII verification (`nlcius.test.mjs`, 4 more tests): `examples/nlcius-cii-invoice.xml` (made up) passes with no skipped rule; `examples/nlcius-cii-invoice-with-defects.xml` raises BR-NL-2, BR-NL-3, BR-NL-12 and the warning BR-NL-28-2. A CII file with an empty `ApplicableHeaderTradeDelivery` draws the official empty-element warning, so a clean example carries a delivery date. Verification (`nlcius.test.mjs`, 5 tests): `examples/nlcius-invoice.xml` (made up) passes with no skipped rule; `examples/nlcius-invoice-with-defects.xml` raises BR-NL-2, BR-NL-3, BR-NL-12 and the warning BR-NL-28-2, each with an English fix. The official ids repeat in places (the charge-reason warning BR-NL-34 is reported as `BR-NL-32-n`), kept as published. No real Dutch invoice or Digipoort/Peppol access point verdict has been tried.

**Peppol PINT: Singapore InvoiceNow and Australia/New Zealand (shipped 2026-10-23).** A UBL file whose BT-24 names `...billing:international:sg:3.0`, `...billing:international:aunz:3.0` or the A-NZ self-billing id is checked by that profile's own rules *instead of* the EU base and the Peppol BIS add-on, because PINT uses GST category codes (SR, ZR, NG...) that the EU base rejects (before this, an SG invoice drew a false `PEPPOL-EN16931-R004`/category finding). Singapore runs three sets (the CEN subset with GST amounts, the Peppol subset, the SG GST rules, 931 checks), A-NZ two (958 checks, including the ABN rules AUNZ-R-004 and PEPPOL-COMMON-R050). OpenPeppol publishes these only as Schematron already compiled to XSLT, and GitHub is not reachable from every build host, so `build-pint-rules.mjs` takes the XSLT from the `phive-rules-peppol` artefact on Maven Central (set `EINVOICE_PINT_JAR` to use a jar on disk) and `plain-from-xslt.mjs` reads the generator's fixed XSLT shape back into the same plain JSON (rules, rule order, lets, `xsl:param` roots, XQuery functions). It throws on any template shape it does not know rather than dropping a rule. Fidelity check: the same reader on OpenPeppol's own BIS XSLT yields 55 checks, every id also in the `.sch`-compiled Peppol set, and on the EN 16931 XSLT 979 checks against 982 (the XSLT is a different release: it has BR-CO-25, BR-66, BR-67, UBL-CR-631 and lacks UBL-SR-51..59, which validation 1.3.14 added; 2026-11-12). Verification (`pint.test.mjs`, 6 tests, made-up invoices in `examples/pint-sg-invoice.xml`, `pint-sg-invoice-with-defects.xml`, `pint-aunz-invoice.xml`): both clean files pass with no skipped rule; the SG defect file raises BR-109-GST-SG, BR-NG-08/09/12-GST-SG and BR-CO-17-GST-SG; a missing buyer ABN raises AUNZ-R-004 and a wrong check digit PEPPOL-COMMON-R050; ordinary Peppol BIS files still get the EU base. Not done: the Saxon route itself still runs the EU base on a PINT file, but since 2026-11-10 the report (page and server API) sends PINT files to the plain route instead (see "Server API runs PINT and ZATCA rules" below); CII has no PINT form; no real InvoiceNow or Peppol A-NZ invoice or an access point's verdict has been tried, only the rule sets as published (versions: SG 2026.6, A-NZ 1.0.12); the Japan and Malaysia PINT sets are not in that artefact. The same Maven artefacts also hold RO_CIUS (`phive-rules-cius-ro`) and the Dutch NLCIUS XSDs (`phive-rules-energieefactuur`), the open items below, readable with this same tool next.

**Current PINT releases, measured on OpenPeppol's own examples (2026-11-11).** The SG and A-NZ sets above are the older releases, which name the profile BIS-style (`...poacc:billing:international:sg:3.0`). Current PINT files say `urn:peppol:pint:billing-1@sg-1`, `urn:peppol:pint:billing-1@aunz-1` or `urn:peppol:pint:selfbilling-1@aunz-1` with BT-23 `urn:peppol:bis:billing`. Those matched no profile, so a current Singapore or Australian invoice got the EU base: on OpenPeppol's 40 published examples for SG 1.4.1 and A-NZ 1.1.3 (the good-case files phive-rules runs in its own tests, commit 36d1f09), **0 of 40 passed**, with BR-47, BR-48, BR-CO-04 and BR-CO-17 on every A-NZ file and BR-CL-17/18 and UBL-CR-005 on every SG file. `node eval/phive-corpus.mjs <phive-rules checkout>` reruns it (fetch commands in the file; the examples are not copied here). Four changes, each read against the file that tripped it:

| change | why |
|---|---|
| the current rule sets, from `phive-rules-peppol-pint` 4.6.4 on Maven Central (`build-pint-rules.mjs`; PINT-UBL 170 checks plus 92 SG and 74 A-NZ jurisdiction checks, each count equal to the stylesheet's `failed-assert`s), matched on the new ids (`schematron-core.mjs`) | the cause above; the older ids keep the older sets |
| the plain runner's "equal within 1e-7" allowance now also covers an equality inside a top-level `or`/`and` chain (`slackTest`, `plain-schematron.mjs`) | `aligned-ibrp-004` (`not(cbc:BaseAmount) or PriceAmount = BaseAmount - Amount`) fired on 5 NZ files: 69.99 - 10.00 is 59.989999... in doubles. Loosening one disjunct or conjunct can only clear a finding, never raise one; 70.10 - 20.11 still fires (test) |
| line allowances and charges are summed with their sign (`linenet.mjs`, `linenet.py`); on a negative invoice a header percentage may be negative, -100 to 0, still checked against base times percent (`adjustment.mjs`, `adjustment.py`) | the A-NZ negative invoice: line 2 is -4 days x 400 per 2 days, a -200 charge and a -100 allowance = -900.00, which INV-012 read as -800; its header charge is -10% of 1500 = -150.00, which INV-051 rejected as a percentage below 0 |
| under a PINT set the built-in INV-026 (BIC shape), INV-044 (UNCL 4461 code) and INV-035 (exemption reason) step aside, as INV-024 already did (`report.mjs`) | the branch id carries an Australian BSB or a Singapore bank code (28 of 40 files), Singapore adds `Z01` for GIRO and a PayNow code, and ZR/NG/OS lines need no EU exemption reason; PINT's own sets carry those rules |

After: **39 of 40 pass** (A-NZ 24/24, SG 15/16) with no rule skipped. The one left is a real fault in OpenPeppol's example, not ours: SG example 07 (foreign buyer) carries a 2,300.00 SGD transport charge at SR 7% but no SR row in the tax breakdown and GST of 0.00, so 161.00 of GST is missing; INV-018 and INV-038 report it and the official PINT rules do not. Tests: `pint-current.test.mjs` (8; made-up `examples/pint-current-sg-invoice.xml` and `pint-current-aunz-invoice.xml`, the older examples with the new ids) and 2 in `tests/test_adjustment.py`. The same script reads the NLCIUS, CIUS-RO, CIUS-PT and ZATCA folders, but those mix good and deliberately broken files, and SimplerInvoicing's carry placeholder IBANs and VAT numbers (`NL11 BANK 1111111111`) that rightly fail INV-023/INV-025; scoring them needs each module's good-file list from `CTestFiles.java`, which is the next step. Japan, Malaysia, UAE and Oman PINT: loaded 2026-11-12 (next section). Not done: no access point's verdict on any file; examples written by the rule authors are not invoices from a real business.

**PINT Japan, Malaysia, UAE and Oman (2026-11-12).** These four ship in the same `phive-rules-peppol-pint` 4.6.4 jar as SG and A-NZ, but their ids (`urn:peppol:pint:billing-1@jp-1`, `@my-1`, `@ae-1`, `@om-1`, the `selfbilling-1` forms and Japan's `nontaxinvoice-1` for sellers not registered for consumption tax) matched no profile, so their files got the EU base: BR-CO-09 on every Japanese, Malaysian and Emirati tax id, BR-CL-17/18 on MYR SST categories, UBL-DT-01 on the UAE's and Oman's dates. `build-pint-rules.mjs` now compiles nine more profiles (JP 1.1.3, JP-NTR 1.1.3, JP-SB 1.1.3, MY 1.3.1 billing and self-billing, AE 2026.5 billing and self-billing, OM 1.0.1 billing and self-billing; jurisdiction sets of 43, 41, 42, 28, 28, 132, 132, 154 and 154 checks beside the 170-check PINT-UBL set). Where a release ships the shared PINT-UBL stylesheet byte for byte (JP, MY and OM billing match SG's), the compiled file is written once and the manifest records `sameAs`. Measured with `eval/phive-corpus.mjs` on phive-rules commit dfa902d, every example file, the whole preflight as the page runs it:

| set | files | before (EU base) | after |
|---|---|---|---|
| PINT JP 1.1.3 | 9 | 0 | 8 |
| PINT JP non-tax-registered 1.1.3 | 7 | 0 | 7 |
| PINT MY 1.3.1 | 26 | 2 | 26 |
| PINT AE 2026.5 | 32 | 0 | 31 |
| PINT OM 1.0.1 | 49 | 0 | 45 |
| **total** | **123** | **2** | **117** |

On the `--good` lists from `CTestFiles.java`: JP 8/9, JP-NTR 7/7, MY 24/24, AE 14/14, OM 43/46. Once the right rules ran, the official sets passed every file; what still blocked was ours, and each was read before it changed:

- **A report with no flag (our fault).** PINT OM writes its severity as `role="..."` with no `flag`, and opens every file with an always-true information report naming the ruleset version (BTOM-META-001). `plain-from-xslt.mjs` read a missing flag as fatal, so every Oman invoice would have failed on a banner. Now `flag`, then `role`, then fatal, on both the plain and the Saxon (SVRL) route; an unconditional information report is left out; `information` joins `note` and `warning` as non-blocking.
- **19 Peppol EAS codes missing from INV-039.** OpenPeppol's own list, as the PINT rules carry it, has 0188 (Japan corporate number), 0248 (Oman), 0097, 0135, 0142, 0154, 0158, 0177, 0199, 0200, 0202, 0215, 0218, 0242, 0244, 0245, 0246, 9949 and 9959, which `endpoint.mjs` did not. This applies to every route, EU included.
- **Type code 480.** PINT's InvoiceTypeCode list adds it; Japan's non-tax-registered invoice and the UAE's commercial invoice use it (INV-032).
- **A missing percent on E, Z, AE, K and G.** EN 16931 fixes those at 0% and PINT AE and OM leave BT-119 out; it now reads as 0 (as O already did), and the official sets still flag a missing element where a profile requires it.
- **A breakdown repeated in the tax currency.** PINT JP repeats the TaxSubtotal in the tax accounting currency (IBG-38); `ubl.mjs` added both into one breakdown (INV-038 "repeats the same percentage"). When a TaxTotal is in the document currency only its rows are read.
- **Stepping aside under these four, as under ZATCA:** INV-022 (the buyer's tax id is a T-number, TIN, TRN or OM VATIN), INV-034 (a debit note is an Invoice with code 383), INV-027 (the branch id read as a BIC is a local bank code, beside INV-026). Under JP-NTR, INV-018/038 (the seller states 10% and charges nothing, by design); under AE, INV-018/038 when a reverse-charge (AE) or margin-scheme (N) row states 5% with no tax; anywhere, INV-018/038 when a breakdown row is a non-VAT flat-amount tax with no percent (Malaysia's tourism tax, scheme AAL, 10 MYR a night). A real tax fault still blocks under JP (test).

Left, and why: JP Example2-TaxAcctCur gives the seller `0088:9482348239847239874`, 19 digits where a GLN has 13 (INV-041; a fault in the example). AE's volume-discount credit note names no invoice it corrects (INV-033); a period discount may legitimately cover many invoices, so this is open, not dropped. OM's four "baisa gap" files were fixed the same day (next paragraph). Tests: `pint-jp-my-ae-om.test.mjs` (10; made-up `examples/pint-current-jp-invoice.xml`). Not done: a real business's file for any of the four; no access point or ASP verdict.

**The EU-only built-in rules step aside on every route (2026-11-12).** The built-in INV-024/026/027/044/035/022/034 checks assume EU conventions, and since 2026-11-11 they stepped aside on PINT and ZATCA files, but only when the plain runner had run that profile's own rules (`--schematron` on the server API). The page never takes that route: it runs the built-in checks and `official.mjs` adds the official findings beside them. So on the page, with or without the official box, and in the Python CLI, a Japanese PINT invoice drew INV-022 ("use a two-letter country prefix, for example DE and nine digits" on a T-number) and INV-035, and every Singapore and A-NZ example drew INV-024 on its local account number. `aside.mjs` now reads BT-24 (CustomizationID) and the UBL ProfileID and drops the same rule ids on every route; `src/einvoice_preflight/aside.py` mirrors it for the CLI and `tests/test_js_parity.py` compares the two tables. Checked: all seven PINT and five ZATCA files in `examples/` give the same rules from the page's route and the CLI, the clean ones pass, and the defect files still raise INV-038 (`aside.test.mjs`). What this does not do: on these files the built-in route no longer checks the tax id or account number at all; that is the profile's own rules' job, so tick the official box (or pass `?schematron=1`) for a real check.

**Baisa line nets and Oman's line VAT (2026-11-12).** Four of OpenPeppol's PINT Oman examples (`P2-multi-line-baisa-gap`, `P3-multi-line-accumulated-gap`, `SB-INV-02` and `SB-CN-01`) carry line nets to three decimals, 0.047 OMR (a baisa is a thousandth of a rial), under two-decimal totals. The official sets passed them; our built-in checks did not, for two reasons, both read before changing:

- **Line nets were rounded to cents before adding.** Thirty lines of 0.047 became thirty of 0.05, so the expected net was 1.50 against the stated 1.41 (INV-014, and INV-038 on the breakdown row). `summedLineNet` now adds the stated nets as stated and rounds only the sum, in `checks.mjs` (which also rounded at every step of the running total) and `taxGroups`, and in the Python mirror. EN 16931 line nets have two decimals (BR-DEC-23), where both readings give the same total, so the EU route is unchanged. A draft JSON invoice is still summed from quantity times price, rounded per line.
- **Oman's tax is the sum of the lines' own VAT.** Each Oman line states its VAT (BTOM-016, `cac:ItemPriceExtension/cac:TaxTotal/cbc:TaxAmount`), and ALIGNED-IBRP-S-09-OM makes the category tax their sum: 30 x 0.002 = 0.06, where 5% of 1.41 is 0.07. `ubl.mjs` (and `ubl.py`) now read the line amount as `tax_amount`, and INV-018 and INV-038 accept either reading, rate x summed taxable or the sum of the line amounts per rate. The second applies only when every line at that rate states a VAT amount within a cent of its net x rate, and no header allowance or charge falls at that rate. A line VAT ten times too big does not qualify (test), and a file with no line VAT has only the first reading.

Measured with `eval/phive-corpus.mjs` on phive-rules commit dfa902d, the whole preflight as the page runs it: PINT OM 45 to 49 of 49 files with no blocking finding. Every other set scored the same file for file before and after (PINT A-NZ 24, SG 15, JP 8, JP-NTR 7, MY 26, AE 31, ZATCA 19 clean; NLCIUS, NLCIUS-CII, CIUS-RO and CIUS-PT unchanged per file).

**The repair button had the same fault, and worse.** On a correct Oman baisa file it "fixed" the net from 1.41 to 1.50 and the tax from 0.06 to 0.08. `repair-ubl.mjs` now sums a kept line net as written, rounds the sum once, and keeps a subtotal's tax when it equals the sum of its lines' plausible ItemPriceExtension VAT (that sum does not depend on the written taxable amount, so it holds when the taxable is also wrong). Oman's ItemPriceExtension TaxTotal is no longer reported as an unrecognised line TaxTotal ("only ZATCA's KSA-11/12 say..."). Measured with `eval/repair-seeded.mjs`, before and after: PINT OM clean files left unchanged 45 to 49 of 49, seeded faults restored 427 to 461 of 658; ZATCA 257/258, PINT A-NZ 270/270 and PINT SG 158/164 identical. What the repair still does not restore on Oman: 125 seeded line VAT amounts (BTOM-016, left as written; Oman's IBR-168-OM checks them, to 0.001) and 70 line nets written to three decimals, which the repair writes back with two (`fmt`).

Tests: `baisa.test.mjs` (10) and `tests/test_baisa.py` (7), on a made-up 30-line OMR invoice built in the test; 7 of the first 8 JS tests fail on the code before this change. Not done: the repair writing a baisa line net at its own precision and an Oman line VAT from net x rate; the AE volume-discount credit note; a real Omani business's file.

**The national examples, scored on their good-case lists (2026-11-11).** `node eval/phive-corpus.mjs <phive-rules checkout> --good` now reads each module's `CTestFiles.java` and scores only the files it lists as good cases (commented-out entries and SimplerInvoicing's error list left out); `--builtin` runs the built-in checks alone in a second and `--messages` prints one message per rule. Run on phive-rules commit 36d1f09, the whole preflight as the page runs it (built-in INV checks plus the official sets on the plain route). Files with no blocking finding:

| set | good cases | before | after |
|---|---|---|---|
| PINT A-NZ 1.1.3 | 24 | 24 | 24 |
| PINT SG 1.4.1 | 16 | 15 | 15 |
| ZATCA 3.4.6 | 19 | 8 | 18 |
| NLCIUS SI-UBL 2.0.3.2 | 61 | 0 | 0 (54 once the placeholder VAT and IBAN numbers are set aside) |
| NLCIUS-CII 1.0.3 | 1 | 0 | 0 |
| CIUS-RO 1.0.9 | 10 | 0 | 0 |
| CIUS-PT 2.1.1 | 10 | did not finish | 0 (every file in about 3 s) |

Four faults of ours, found and fixed:

- **CIUS-PT hung on any invoice with an attachment.** AMA's rule DT-CIUS-PT-111.1 is `matches(.,'^(.{1,6826666})$')` on the embedded document. fontoxpath compiles an XSD regex to an automaton and expands a bounded repeat into one state per count, so the run reached 4.4 GB and had not finished after 15 minutes on any of AMA's ten examples. The page runs the same code in the browser, so a Portuguese invoice with a PDF attached would have frozen the tab. `plain-schematron.mjs` now rewrites a whole-string `.{m,n}` test with a bound of 1,000 or more to `string-length` bounds plus "no newline or carriage return", the same test (30 small-bound cases agree with fontoxpath's own regex). It is the only rule of that shape in the shipped sets.
- **Official warnings failed the file.** A finding whose Schematron flag is `warning` (BR-NL-19 to BR-NL-35, UBL-CR-*, PINT and ZATCA warnings) counted as blocking, so SimplerInvoicing's 25 warning examples, all good cases, failed on them. KoSIT, Peppol and phive validators pass a file whose only findings are warnings. Warnings are now listed and labelled but do not fail a file: page, Markdown report, audit pack, JSON `exit_code` and the server API's status.
- **A Romanian buyer that is not VAT registered was read as having a bad VAT number.** CIUS-RO puts such a buyer's fiscal code (CUI, `8609468`) in a `PartyTaxScheme` with an empty `TaxScheme`. The reader took any unlabelled scheme as BT-48, so INV-022 fired on the buyer in 4 of ANAF's 10 examples. EN 16931's BR-CO-9 reads only `TaxScheme/ID` = `VAT`; an unlabelled scheme now counts as a VAT number only when it starts with a two-letter prefix (JS and Python readers both).
- **Five EU-only built-in checks fired on ZATCA files.** A simplified (B2C) invoice names no buyer (INV-006); KSA credit and debit notes are `Invoice` documents with type code 381 or 383 (INV-034); ZATCA's own cut of the EN 16931 rules leaves out BR-33, allowance reason (INV-052) and BR-61, account for a credit transfer (INV-045), checked in `plain/zatca-en16931-ubl.json`; and a prepayment adjustment repeats a rate in the tax breakdown (INV-038, that message only). These are now dropped where a ZATCA set governs, like INV-005/017/018/022 before. (2026-11-12: the INV-017, INV-018 and INV-038 drops are gone again; they were a reader fault, see "A line's own TaxTotal is not the document's".)

Read and left alone, because they are faults in the examples, not in the checks: SimplerInvoicing's `NL11 BANK 1111111111` IBANs and `NL…B01` VAT numbers fail their checksums (INV-023/025, 57 files); ANAF's seller id `RO1111111111118` has 13 digits where a Romanian VAT number has 2 to 10 (INV-022, all 10); line nets that are not quantity times price, such as 2 × 1273.00 billed as 1273.00 or a returned line with a positive quantity and a negative net (INV-012 on 6 RO files, 3 NL and the CII example; EN 16931 has no rule for this but Peppol's PEPPOL-EN16931-R120 does); and AMA's files are syntax templates with placeholders (`$%()*`, `#ENTITY@ATMPAYMENT#12345#`, type code `NC`), which the EU base rejects as it should. UBL-SR-53 fired on 4 RO files with an empty `TaxScheme`: a rule-version gap, closed 2026-11-12, see "CIUS-RO runs on EN 16931 1.3.8"; ZATCA's rate-change prepayment example left INV-038 "row 2 taxable amount" (a prepayment at the old rate), closed 2026-11-12, see "A line's own TaxTotal is not the document's"; INV-026 read BT-86 as a BIC, while EN 16931 also allows a national clearing code; closed 2026-11-12, see "BT-86 clearing codes" (the NL examples' placeholder `BA11` is still INV-026, as it should be). Tests: `official-good-cases.test.mjs` (6: the CUI reading, the warning severity, the regex rewrite, a PT invoice with an 8,000-character attachment finishing in under 2 s), 2 more in `report-plain-route.test.mjs`, 3 in `tests/test_ubl_party.py`. The examples are not copied here.

**Romania RO e-Factura national rules, CIUS-RO (shipped 2026-10-24).** A UBL file whose BT-24 names `CIUS-RO` now also gets Romania's 122 national rules (v1.0.9 from `phive-rules-cius-ro` on Maven Central) after the EU base, in the browser and on the Node plain route: date format `YYYY-MM-DD`, an invoice number with a digit, the profile id, RON as the VAT accounting currency, `SECTOR1..6` city and `RO-xx` county codes, address and tax-id presence, two-decimal amounts and the length caps. It is an add-on (`ADDONS["cius-ro"]`), not a replacement like PINT, because the national file only adds to EN 16931. The messages are bilingual in the source (`Romanian #English`); the English half is shown, each rule has an English fix. `build-ro-rules.mjs` rebuilds `plain/cius-ro-ubl.json` (set `EINVOICE_RO_JAR` for a jar on disk). Verification (`cius-ro.test.mjs`, 5 tests; made-up invoices `examples/ro-invoice.xml` and `ro-invoice-with-defects.xml`): the clean RON invoice passes both sets with no skipped rule; the defect file raises BR-RO-001, -010, -030, -110 and -DT001; removing the buyer street raises BR-RO-082. Not done: the Saxon route and server API do not run it (no `.sef.json` built); the bundled `EN16931-CIUS_RO` XSLT (EN rules with RO changes) is not used; no real invoice from a Romanian ERP and no ANAF SPV verdict has been tried, so false positives or gaps against ANAF's live validator are unmeasured.

**Portugal national rules, CIUS-PT (shipped 2026-10-25).** A UBL file whose BT-24 names `CIUS-PT` (`...urn:feap.gov.pt:CIUS-PT:2.1.1`) now also gets the Portuguese profile's checks that the EU base lacks (368 of the 1,154 in AMA's v2.1.1 stylesheet, from `phive-rules-cius-pt` 4.6.3 on Maven Central): VAT identifier and tax scheme for seller and buyer (`BR-CIUS-PT-01..04`), a Deliver to group (`-66`), a credit or debit note's preceding-invoice reference (`-25`, `-65`), "lower rate" `AA` rules, and about 290 field-format rules (`DT-CIUS-PT-*`: VAT rate as `23.00`, quantities with three decimals, a remittance reference framed as `#REFERENCE@ATMPAYMENT#...#`). It is an add-on (`ADDONS["cius-pt"]`), plain route only (no Saxon form). `build-pt-rules.mjs` rebuilds `plain/cius-pt-ubl.json` (set `EINVOICE_PT_JAR` for a jar on disk); to read it, `plain-from-xslt.mjs` now also turns an `xsl:if` around a `successful-report` (a Schematron `<report>`) into an assert. Verification (`cius-pt.test.mjs`, 5 tests; made-up invoice `examples/pt-invoice.xml`, NIFs with valid check digits): it passes the EU base and the PT set with no skipped rule; a bare `23` rate, an unframed payment reference, a removed Deliver to group, a removed seller VAT block and a type-383 note without a reference each raise exactly the expected PT rule. Not done: no real invoice from a Portuguese ERP and no AT/eFatura verdict has been tried, so false positives are unmeasured; the stylesheet's own EU-base copy is dropped, and Portuguese `AA`, `RED`, `INT`, `NOR`, `ISE`, `OUT` and `NA` VAT codes fail the EU base's BR-CL-17/18 (measured 2026-10-25 on `examples/pt-invoice.xml`), although AMA's stylesheet has no BR-CL rule at all and its own DT-CIUS-PT-091/-105/-131 and BR-AA-* rules admit them; the finding now says so (`PT_CODE_NOTE`, 1 test) and is not suppressed, since which validator the receiver runs is unknown; the Portuguese page still says nothing is mandated for B2B.

## Mandate calendar (shipped 2026-11-02)

`node mandate-calendar.mjs` turns the "Key dates" column of the mandates hub
into `mandate-dates.json` and `mandate-calendar.ics` (87 dated milestones
across 48 countries), so a finance team can subscribe in any calendar app and
the feed cannot drift from the table. Only full day-month-year dates become
events; "Sep 2026" or "late 2028" are left out rather than guessed. Brackets
stay whole when a cell is split, and a cell with several dates is split so each
date keeps only its own words. `--check` fails when the files are stale;
`--upcoming [date]` prints what starts next. `mandate-calendar.test.mjs` pins
the parser, the RFC 5545 folding and escaping, and freshness. Not done: the
text is a clause cut from the hub cell, so a few summaries are terse ("Spain:
1 Jul 2027 (others)"); the description carries the status and the country
page link. Use: a lead magnet and a link-worthy asset for the mandate pages;
no accounts, no cost.

**Deadlines page (shipped 2026-11-02).** `node deadlines-page.mjs` writes `e-invoicing-deadlines-2027.html` from `mandate-dates.json`: the 18 full-date milestones in 14 countries between 2 Nov 2026 and 31 Dec 2027, grouped by quarter, each linking its country page, with an ItemList JSON-LD block and the no-warranty footer. A static, link-worthy page for the search "e-invoicing deadlines 2027"; linked from the hub and the sitemap. `deadlines-page.test.mjs` pins freshness against the JSON, date order, links, escaping and the disclaimer. The window start (`FROM`) is fixed in the file so the output is reproducible; move it when refreshing. Not done: months/years without a day (Germany 2027 and 2028) are not listed; they stay in the hub table.

**Countdown on the hub (shipped 2026-11-02).** `mandate-countdown.js` reads `mandate-dates.json` and shows the next 8 milestones with days left on the mandates hub, or the next 12 for one chosen country. Days are whole calendar days in the visitor's browser (DST safe); no tracking, one same-origin fetch, and the table below still holds every date if the script fails. `mandate-countdown.test.mjs` (4 tests) pins the day arithmetic, sorting, filtering and links; opened in headless Chromium: 8 rows, Poland filter gives its dated entry, no console errors. **Size selector (shipped 2026-11-08).** `whichapplies.mjs` writes `which-e-invoice-mandate-applies.html`: country plus one number (France: a size class) gives the start date and days left for Germany (EUR 800,000), Spain (EUR 8 million), the UAE (AED 50 million), Poland (PLN 200 million; the smallest wave is defined by monthly sales and only noted), Oman (OMR 5 million) and France. The cut-offs are the ones on the country pages; `whichapplies.test.mjs` (8 tests) pins the edges, every date against `mandate-dates.json`, freshness and the links; clicked in headless Chromium, no console errors. **Malaysia added 2026-11-09:** five turnover bands from the MyInvois phases table on its country page (above RM100 million 1 Aug 2024, down to up to RM1 million 1 Jul 2026, reported; the page notes sources disagree on that last band), each date checked against that table by `whichapplies.test.mjs` (the hub cell holds only the first date). Not done: other countries with size waves (Saudi waves, Singapore, Ireland), headcount-based rules, and any confirmation from a tax authority.

## Run it as your own API (self-hosted, one click)

The same rules are available as a small HTTP service you run in **your own**
account. Nothing is stored, nothing is forwarded, and the author runs nothing
in between. Use it from an ERP, a webhook or a CI job instead of shelling out
to the CLI.

**Deploy:** fork this repository, then open
`https://render.com/deploy?repo=<your fork URL>`. `render.yaml` builds the
`Dockerfile` here on Render's free plan and generates an `EINVOICE_API_KEY`
for you. Anywhere that runs Docker works too:

```sh
cd ventures/einvoice-preflight
docker build -t einvoice-preflight . && docker run -p 8080:8080 -e EINVOICE_API_KEY=change-me einvoice-preflight
# or, with Node 20+ and no Docker:  EINVOICE_API_KEY=change-me node server.mjs
```

```sh
# one invoice: body is the raw file; Content-Type (or ?name=x.pdf) picks the parser
curl -H "Authorization: Bearer $KEY" -H "Content-Type: application/xml" \
  --data-binary @invoice.xml https://YOUR-HOST/v1/validate
# a batch (base64 for PDFs); also flags duplicate invoice numbers (INV-019)
curl -H "Authorization: Bearer $KEY" -d '{"documents":[{"name":"a.json","content":"{...}"}]}' \
  https://YOUR-HOST/v1/validate/batch
```

The response is the CLI's `--format json` report plus a `disclaimer`. With no
`EINVOICE_API_KEY` the API is open, so set one on anything public.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | listen port |
| `EINVOICE_API_KEY` | none | require `Authorization: Bearer <key>` on `/v1/*` |
| `EINVOICE_MAX_BYTES` | `1048576` | per-invoice size limit |
| `EINVOICE_MAX_BATCH` | `50` | documents per batch |
| `EINVOICE_RATE_LIMIT_PER_MIN` | `120` | per client IP (honours `X-Forwarded-For`) |
| `EINVOICE_CORS_ORIGIN` | none | allow browser calls from this origin |
| `EINVOICE_SERVE_UI` | on | `0` serves the API only |

If this saves you a rejected invoice run, you can chip in at
<https://buymeacoffee.com/duncanhaywood>. Same safety boundary as below:
preflight, not a Peppol/EN 16931 conformance validator, and no warranty.

## Create an e-invoice (new)

The checker's other half. Germany already requires businesses to *receive*
structured e-invoices and makes *sending* mandatory from 2027 (2028 for small
firms); Belgium, Poland and France follow. A PDF no longer counts, and the
usual answer is a paid invoicing subscription. This writes the file instead.

```sh
# Browser: open create.html (or GET /create.html on the server). No upload.
node generate-cli.mjs examples/draft-invoice.json -o RE-2026-001.xml          # XRechnung 3.0 UBL
node generate-cli.mjs examples/draft-invoice.json -f cii -p peppol -o out.xml # CII, Peppol BIS 3.0
curl -H "Authorization: Bearer $KEY" -d '{"draft":{...},"format":"ubl"}' https://YOUR-HOST/v1/generate
```

A *draft* is who, what and how much (`examples/draft-invoice.json`). Line
nets, the per-rate/category VAT breakdown, the totals and the amount due are
computed in integer cents, so they cannot disagree with each other. Standard,
zero, exempt (`E`, e.g. Kleinunternehmer § 19 UStG), reverse-charge (`AE`),
intra-EU (`K`), export (`G`) and out-of-scope (`O`) VAT; invoices and credit
notes; a seller VAT ID or national tax number; prepayments. Profiles:
`xrechnung` (BR-DE contact, buyer reference and payment checks), `peppol`
(BIS 3.0), `en16931`. Missing required data is an *error* and nothing is
written; what only your profile wants (a Leitweg-ID, a seller contact) is a
*warning*. Every file is read back through the same readers and rules as the
checker, and the API returns that result as `preflight`.

Not a certified invoicing system: it does not sign, archive, transmit, look
up a Leitweg-ID or a Peppol participant, or do document-level allowances
(put discounts into the line price). It is a preflight-grade writer, not a
schema/Schematron validator, so run the output through your network's validator
(e.g. the KoSIT validator) before sending.

## Input shape

The supported v0 JSON shape is intentionally small and format-neutral. UBL XML
and UN/CEFACT CII (XRechnung CII / Factur-X XML) both map into this shape.
A Factur-X / ZUGFeRD / XRechnung PDF is unwrapped to that embedded XML first.
UBL input maps common `Invoice`, `CreditNote`, `DebitNote`, line, party, tax, and
monetary-total elements. CII maps `CrossIndustryInvoice` header, parties, lines,
tax, payment, and totals the same way. When an invoice contains multiple UBL `TaxTotal`
elements, their `TaxAmount` values are added to obtain the invoice tax total.
This keeps split tax schemes from being silently ignored; it is still an
arithmetic check, not a tax-law determination:

```json
{
  "invoice_number": "INV-1001",
  "issue_date": "2026-08-24",
  "due_date": "2026-09-23",
  "period": {"start": "2026-07-01", "end": "2026-07-31"},
  "buyer_reference": "COST-441",
  "order_reference": "PO-9001",
  "document_type": "invoice",
  "currency": "EUR",
  "supplier": {"id": "DE123", "name": "Supplier GmbH", "vat_id": "DE136695976", "endpoint": {"scheme": "0088", "id": "1234567890128"}},
  "customer": {"id": "DE456", "name": "Customer GmbH", "endpoint": {"scheme": "EM", "id": "ap@customer.example"}},
  "payment": {"means": "30", "iban": "DE89370400440532013000", "bic": "COBADEFFXXX", "remittance": "RF18539007547034"},
  "adjustments": [{"kind": "allowance", "amount": 20, "base": 200, "percent": 10, "reason": "Early payment discount"}],
  "lines": [{"description": "Consulting", "quantity": 2, "unit_price": 100, "tax_percent": 19, "net": 200}],
  "totals": {"net": 180, "tax": 38, "gross": 218, "prepaid": 38, "due": 180}
}
```

`supplier.vat_id` and `customer.vat_id` are optional. When supplied, they are
checked against published national VAT shapes and checksums (DE, FR, BE, NL,
AT, IT, ES, PL, SE, DK, FI, PT, LU, IE, GB, and length-only checks for other
EU prefixes). A matching complete VAT in `id` is checked the same way. Short
codes such as `DE123` stay internal ERP identifiers and are not treated as
VAT numbers. Failed checksums are `INV-023`; a `vat_id` that is not a known
shape is `INV-022`. Messages never repeat the identifier. This is a typo
catch, not a VIES registration lookup and not a determination that a party
may charge tax. UBL `PartyTaxScheme/CompanyID` maps into `vat_id`.

`supplier.endpoint` and `customer.endpoint` are optional. When supplied they
are `{ "scheme": "<EAS>", "id": "<address>" }`. A missing or unknown Peppol
EAS scheme is `INV-039`. An empty id is `INV-040`. A known scheme that fails
its published shape — GS1 check digit on `0088` (GLN), an email shape on
`EM`, or the digit length for `0007` / `0184` / `0190` / `0192` / `0208` /
`0212` — is `INV-041`. Other known schemes only require a non-empty
identifier. Messages never repeat the address. This is a typo catch, not a
Peppol SMP lookup and not a claim that the party can receive e-invoices.
UBL `Party/EndpointID` maps into `endpoint.id` and `schemeID` maps into
`endpoint.scheme`.

`payment.means` is optional. When supplied it is a UNCL 4461 payment means
code (BT-81) such as `30` (credit transfer), `58` (SEPA credit transfer),
or `10` (cash). An empty code, or one outside the UNCL 4461 list in the CEN
rule BR-CL-16, is `INV-044`. A credit transfer or SEPA transfer without a
complete IBAN is `INV-045` (direct debits name the payer's account, so they do not need one). Cash, cheque, or card together with a complete IBAN is
`INV-046`. Omitted means stay clean even when an IBAN is present.
Messages never repeat the typed code or the account. This is a code-list
and consistency check, not a Peppol profile determination and not a claim
that the buyer can pay that way. UBL `PaymentMeans/PaymentMeansCode` maps
into `payment.means`.

`payment.iban` is optional. When supplied, it is checked against published
IBAN lengths and the ISO 13616 MOD-97 checksum. Failed checksums are
`INV-025`; a value that is not a country-prefixed IBAN (or that uses the
wrong national length) is `INV-024`. Short internal account numbers stay
internal unless they are placed in `payment.iban`. Messages never repeat
the account number. This is a typo catch, not a bank lookup and not a
determination that the account exists or belongs to the named party. UBL
`PaymentMeans/PayeeFinancialAccount/ID` maps into `payment.iban`.

`payment.bic` is optional. EN 16931's BT-86 (payment service provider
identifier) admits a BIC or a national clearing code, so either is accepted:
an 8- or 11-character ISO 9362 identifier (four letters, a two-letter
country, a two-character location, and an optional three-character branch),
a clearing code of 3 to 11 digits (UK sort code, German BLZ, US ABA routing
number, Australian BSB, Italian ABI/CAB and so on), or an Indian IFSC. A
value that is none of these is `INV-026`, and so is a nine-digit number with
a US district prefix whose ABA check digit fails (a **note** when it starts
with 0, since Canada's EFT form and Russia's BIK do too). When both a
complete IBAN and a complete BIC are present, a country mismatch is
`INV-027`; when a clearing code and a complete IBAN are present and the
IBAN's country carries its bank code in a known place (23 countries, from
the SWIFT IBAN registry's bank and branch positions: DE, GB, IE, AT, CH, IT,
FR, ES and others), a code that is not that bank code is also `INV-027`
(see "BT-86 clearing codes" below). Messages never repeat the BIC
or the account number. This is a typo catch, not a SWIFT directory lookup
and not a determination that the institution will accept the payment. UBL
`PayeeFinancialAccount/FinancialInstitutionBranch/ID` (or the nested
`FinancialInstitution/ID`) maps into `payment.bic`.

**BT-86 clearing codes (2026-11-12).** Before this, every non-BIC value in
BT-86 was `INV-026`, so a UK supplier quoting a sort code, a US one quoting a
routing number, or an Australian one quoting a BSB failed the preflight on a
field the standard lets them fill that way (the PINT route already dropped
INV-026 for this reason; EU files had no such escape). Now `classifyProviderId`
in `bic.mjs` (mirrored by `classify_provider_id` in the Python package) reads
the value as a BIC, a clearing code, or neither, and a clearing code is checked
against the IBAN: a German BLZ must be the IBAN's first eight BBAN digits, a
UK sort code its six digits after the bank letters, an Italian ABI or ABI+CAB
the digits after the CIN letter, a Swiss IID the five-digit bank code (written
with or without leading zeros). That catches a typo a BIC check never could:
`37040045` against `DE89 3704 0044 ...` is INV-027. The ABA check (weights 3,
7, 1, sum divisible by 10) is checked on published routing numbers (021000021,
121000358). Not done: no bank directory lookup (a well-formed sort code may
not exist); countries outside the 23 are not compared; the Python package has
no note severity, so the leading-0 routing note is silent there. Tests:
`bic.test.mjs` (4 new), `tests/test_bic.py` (`ClearingCodeTest`, 3), and
`pint-current.test.mjs` now uses a malformed value for its "EU still checks"
case, since a BSB on an EU file is no longer wrong.

`payment.remittance` is the text the buyer should quote on the transfer.
When a complete IBAN is present and remittance is missing, that is
`INV-030`, a **note** (`severity: "note"`): it is listed in every report but does not
fail the file or change the exit code, because the standard does not require it — an unmatched SEPA credit is how paid invoices sit in
unallocated cash. When remittance is supplied, an ISO 11649 RF creditor
reference that fails its MOD-97 check (or that is not RF-shaped after
starting with `RF`) is `INV-031`. Unstructured notes are accepted up to
140 characters. Messages never repeat the reference. This is a matching
and typo catch, not a bank lookup and not a determination that a payment
will be allocated. UBL `PaymentMeans/PaymentID` maps into
`payment.remittance`; `InstructionNote` is used when `PaymentID` is
absent.

`document_type` is optional and defaults to a commercial invoice. Use
`invoice`, `credit_note`, or `debit_note` (UN/CEFACT 1001 codes `380`,
`381`, and `383` are accepted). An unknown type is `INV-032`. A credit
or debit note without `original_invoice` is `INV-033` — networks reject
a reversing document that does not name the invoice it applies to. A
commercial invoice that carries a credit or debit type code, or a
credit that names itself as the original, is `INV-034`. Messages never
repeat the original invoice number. This is a document-shape check, not
a Peppol profile determination. UBL `CreditNote` and `DebitNote` roots
map into `document_type`; `InvoiceTypeCode` / `CreditNoteTypeCode` /
`DebitNoteTypeCode` map into `document_code`;
`BillingReference/InvoiceDocumentReference/ID` maps into
`original_invoice`.

A line with `tax_percent` of `0`, or a UNECE 5305 category of `E`, `AE`,
`K`, `G`, `O`, or `Z`, needs an exemption reason. Put it on the line as
`tax_reason` or `tax_reason_code` (for example `VATEX-EU-IC`), or on the
invoice as `tax_exemption_reason` / `tax_exemption_reason_code`. A missing
reason is `INV-035`. An empty reason field is `INV-036`. Messages never
repeat the reason text. This is a document-shape check — the tool does
not decide whether 0% is legally correct. UBL
`ClassifiedTaxCategory/ID` maps into `tax_category`;
`TaxExemptionReason` and `TaxExemptionReasonCode` map into the line
reason fields. `TaxTotal/TaxSubtotal/TaxCategory` exemption fields map
into the invoice-level reason.

When line items use more than one `tax_percent`, the invoice needs
`tax_breakdown`: one row per rate with `tax_percent`, `taxable` (the net
of those lines), and `tax` (taxable times the rate, rounded to cents).
A mixed-rate invoice without that list is `INV-037`. A present breakdown
that is the wrong shape, repeats a rate, misses a rate the lines use,
or disagrees with the line nets is `INV-038`. A single-rate invoice may
omit the list. This is per-rate arithmetic — the same relationship EN
16931 expresses as `TaxTotal/TaxSubtotal` — not a determination that a
percentage is legally correct. UBL `TaxSubtotal` rows map into
`tax_breakdown` (`TaxableAmount`, `TaxAmount`, `TaxCategory/Percent`,
and optional `TaxCategory/ID` as `tax_category`).

`due_date` is optional. When supplied, it must use `YYYY-MM-DD` and cannot be
earlier than `issue_date`; this is a date-shape and document-consistency check,
not a judgment about payment terms or legal requirements. UBL `DueDate` is
mapped into the same optional field.

`payment.terms_days` is optional. When supplied it is a positive whole number
of days (Net-N). An empty or non-integer value is `INV-053`. When both
`issue_date` and `due_date` are present ISO dates, a due date that is not
issue date plus those days is `INV-054`. Terms without a due date stay
clean — the due date is not required just because terms are named.
Omitted terms stay clean. Messages never repeat party or account data.
The expected due date may appear in the fix. This is arithmetic, not a
Peppol profile determination and not a claim that the buyer must pay by
that date. UBL `PaymentTerms/SettlementPeriod/DurationMeasure` with
`unitCode="DAY"` maps into `payment.terms_days`. CII
`SpecifiedTradePaymentTerms/SpecifiedPeriod/DurationMeasure` with the
same unit maps the same way.

`buyer_reference` and `order_reference` are optional (EN 16931 BT-10 /
BT-13). When supplied they must be non-empty text, not a placeholder such
as `N/A` or `none`, and no longer than 70 characters. An empty or
placeholder buyer reference is `INV-047`. The same defects on the
purchase-order field are `INV-048`. A purchase-order value that repeats
the invoice number is `INV-049`. Omitted references stay clean. Messages
never repeat the typed reference. This is a shape and consistency check,
not a Peppol profile determination and not a claim that the buyer issued
that order. UBL `BuyerReference` maps into `buyer_reference` and
`OrderReference/ID` maps into `order_reference`.

`adjustments` is optional (EN 16931 BT-92 / BT-99). When supplied it is a
list of document-level allowances and charges: `{ "kind": "allowance" |
"charge", "amount": <money>, "base": <money>, "percent": <0-100>,
"reason": "<text>", "reason_code": "<code>" }`. An empty list, a
non-list, a missing kind, or a missing or negative amount is `INV-050`.
When both `percent` and `base` are present, an amount that does not
equal the percentage of the base (rounded to cents) is `INV-051`. A
missing, empty, or placeholder reason (and reason code) is `INV-052`.
Omitted adjustments stay clean. Invoice net then equals line nets minus
allowances plus charges (`INV-014`). Messages never repeat the amount,
percent, or reason. This is arithmetic and shape, not a Peppol profile
determination and not a claim that the discount is commercially
correct. UBL invoice-level `AllowanceCharge` maps into `adjustments`
(`ChargeIndicator`, `Amount`, `BaseAmount`, `MultiplierFactorNumeric`,
`AllowanceChargeReason`, `AllowanceChargeReasonCode`). Line-level
`AllowanceCharge` is ignored.

`period` is optional. When supplied it is `{ "start": "YYYY-MM-DD", "end":
"YYYY-MM-DD" }` — the EN 16931 invoice period (BT-73 / BT-74). A period that
is not an object, that names only one date, or that is not an ISO date is
`INV-042`. An end earlier than the start is `INV-043`. Omitted periods stay
clean. Messages never repeat the dates. This is a date-shape check, not a
Peppol profile determination and not a claim that the dates match the
underlying contract. UBL invoice-level `InvoicePeriod/StartDate` and
`EndDate` map into `period`; line-level `InvoicePeriod` is ignored.

`totals.prepaid` and `totals.due` are optional. When `prepaid` is supplied, it
must be a non-negative amount no greater than `totals.gross` (`INV-028`). When
`due` is supplied, it must equal gross minus prepaid, treating a missing
prepaid as zero (`INV-029`). This is remaining-balance arithmetic — the same
relationship EN 16931 expresses as PrepaidAmount and PayableAmount — not a
determination that a payment was received or that a balance is legally due.
UBL `LegalMonetaryTotal/PrepaidAmount` maps into `totals.prepaid` and
`LegalMonetaryTotal/PayableAmount` maps into `totals.due`.

Amounts use the currency's major unit and are compared to cent precision. Each
line must include a numeric `net` amount matching quantity times unit price. Each
line's tax is calculated from its rounded line net and the supplied
`tax_percent`; the invoice tax total must equal the sum of those per-line
rounded amounts. This reports arithmetic discrepancies only and does not
decide whether a tax percentage is legally correct.
`--format json` is suitable for an ERP adapter. It always returns the same
envelope, whether the input is one file or a directory: `status`,
`files_checked`, `files_failed`, `observations`, per-file `reports`, and
`read_errors`. Each flattened finding in `errors` includes its source `file` as
well as the rule, message, fix, and JSON Pointer, so a batch adapter can route a
finding without joining against `reports`. Each `reports` item also includes an explicit `status` (`pass` or
`fail`) and `observations` count, so adapters can render a batch queue without
inferring state from the errors array. Each finding also includes a `path` JSON Pointer (for example,
`/totals/gross`), so adapters can focus a field-level repair UI without
reimplementing the rules. `--format sarif` emits SARIF
2.1.0 for GitHub code scanning, CI annotations, and
editor integrations. It contains the rule IDs, fixes, JSON Pointer paths, and the local invoice
filename, never invoice fields or line contents. Unreadable files are emitted as `INV-READ`
results so a CI consumer cannot mistake a skipped file for a clean check. Both formats exit `1` when
any check fails and `2` for an unreadable input file. Pass a directory to scan
all `.json` files recursively; batch JSON includes per-file errors and batch
SARIF uses paths relative to the input directory. An empty directory is an
input error and exits `2`. Batch scans also flag a supplier (matched by id, VAT id or
name) who reuses an `invoice_number` as `INV-019`; the number itself is never
emitted. Two different suppliers that both issue `1001` are not flagged.
Credit notes are tied to their originals when both are in the batch (same seller,
reference matched ignoring case): `INV-056` for a currency mismatch, `INV-057` when
the credit notes against one invoice add up to more than its gross total, `INV-058`
when the named invoice in the batch belongs to a different seller. A credit note whose
original is not in the batch is left alone. Tested on hand-written invoices (JS and
Python CLI); not tried on real ERP exports.
JSON output uses the same versioned summary fields for single files and
directories: `schema_version` (currently `1`), `status`, `exit_code`,
`files_checked`, `files_failed`, `observations`, `rules`, `fixes`, and `read_errors`.
`exit_code` mirrors the process result (`0` pass, `1` findings, `2` read/input
errors), so an adapter can handle captured output without reimplementing exit
logic. `fixes` is a sorted, privacy-safe remediation queue with one item per
rule, its occurrence count, check message, and recommended fix. Single-file output also includes `file` and `errors`; directory output
includes the per-file `reports` array. Rule counts let a CI or ERP adapter show
a compact defect summary without parsing human text.
`--format jsonl` emits one compact JSON object per invoice (or read error),
which is suitable for streaming directory results into CI or an ERP adapter
without parsing an aggregate document. Each record has `schema_version`,
`status`, `file`, `observations`, `fixes`, and `errors`; read-error records also
have `error`. `fixes` is the per-invoice remediation queue grouped by rule, with
occurrence counts, the check message, and recommended fix. The line-oriented
mode uses the same privacy boundary and exit codes as JSON.
`--format markdown` produces a reviewable report with filenames, rule IDs,
observations, and fixes for single files and recursive directory scans. Batch
reports also include a finding summary grouped by rule, so repeated defects can
be triaged before reviewing individual invoices. Markdown-sensitive local names
and messages are escaped in the report.
`--format github` emits GitHub Actions `::error` annotations for each finding and
read error, so a CI job can place defects directly in its Checks UI. It uses the
same privacy boundary as SARIF: only the local filename, rule ID, observation,
and fix are emitted, never invoice numbers or line contents. It exits `1` for
findings and `2` for read errors.
`--format csv` produces one spreadsheet row per finding, plus explicit pass and
read-error rows. Its stable columns are `file`, `status`, `rule`, `path`,
`message`, `fix`, and `error`, making it suitable for triage queues without
exposing invoice values or contents.
`--format remediation-csv` produces one spreadsheet row per rule across the
batch, with an occurrence count, check message, and recommended fix. It is
useful when an operator wants a compact queue of repeated fixes rather than
one row per invoice. Read errors are represented as `INV-READ`; invoice
values, numbers, and line contents are never included. The JSON
`--format remediation` queue stays the per-invoice adapter payload.
`--format junit` produces a JUnit XML report for CI dashboards. Each invoice is
one testcase; failed checks are failures and unreadable files are errors. The
report contains only local filenames, rule IDs, JSON Pointer paths, observations,
 and fixes, never invoice values or line contents. Directory scans do not follow
symbolic links; linked JSON files are reported as read errors so a scan stays
bounded to its selected directory.
`--format html` produces a standalone browser report with summary cards, finding
counts, and per-file review sections. It has the same privacy boundary as the
other report formats and can be opened locally without a server.
`--format summary` prints a compact batch result for CI logs, followed by sorted
rule counts when findings exist. It includes counts and rule IDs only, never
invoice values, numbers, or line contents.
`--format remediation` emits a versioned JSON queue grouped by invoice and rule.
Each item includes the local file, rule ID, occurrence count, distinct JSON
Pointer paths, check message, and recommended fix. This is intended for ERP or
ticket adapters that need a repair queue without parsing the full finding
report; it never includes invoice values, numbers, or line contents. Read errors
remain in `read_errors`, and the output uses exit code `2` for those errors.
`--format checklist` emits a plain-text, copyable repair checklist grouped by
local filename and rule. It starts with status and counts, making it useful for
handing a complete batch triage summary to a reviewer without asking them to
parse JSON. It does not modify invoices or decide whether they may be submitted.
Use `--output PATH` with any format to write the report atomically to a local
file instead of stdout. Parent directories are created when needed. A failed
write returns exit code `2` and never replaces an existing report with a partial
file.

`--max-depth N` limits how far a directory scan descends. `1` checks only
files in the scan root; `2` includes one subdirectory. Deeper folders are
not walked, so a nested export dump cannot expand a CI job. The same
positive-integer syntax as `--max-files` applies. Files below the bound are
skipped rather than failing the scan, so a top-level folder next to an
archive still checks.
`--max-files N` accepts a positive integer, including the usual `+N` CLI
notation, and rejects zero, negative, or non-numeric values before any invoice
is read.
`--max-bytes N` uses the same positive-integer syntax and rejects zero,
negative, or non-numeric values before any invoice is read. It refuses an
oversized regular file before reading it and reads stdin only through `N+1`
bytes, returning a structured exit-2 read error when the limit is exceeded.

Machine-readable formats remain valid JSON, JSONL, SARIF, CSV, remediation-csv,
JUnit, Markdown, or HTML when a directory is empty or a `--max-files` limit
refuses the scan.
These input errors are reported in the selected format and the command exits
`2`, so CI and ERP adapters do not need to special-case an unstructured stderr
or stdout message.

## Measured on real FatturaPA samples (2026-10-28)

`node eval/fatturapa-corpus.mjs <ZUGFeRD corpus>/fatturaPA` ran `IT-001`..`IT-018` over 15 files: the Agenzia delle Entrate's six official samples (FPR01-03, FPA01-03) and nine from eigor. Result: `IT-003`/`IT-004` on 8 and 9 files (the samples use the placeholder partita IVA 01234567890, which fails its check digit, so these are right); `IT-017` on 3 (placeholder IBANs); `IT-015` on FPR02 and FPR03 (the first body's lines sum to 25.00 but its summary base is 27.00, a real inconsistency in the sample); and `IT-018` on FPR02, **a false positive of ours**: the official sample puts `PECDestinatario` before `ContattiTrasmittente` in `DatiTrasmissione`, against the order this tool had written from memory. Reading the XSD (2026-10-30) settled it: the schema puts ContattiTrasmittente first, xmllint rejects the sample, and the exemption was removed. The corpus marks all 15 as valid, which only means they pass its own check, not that SdI accepted them. Rules for cassa, bollo and ritenuta files are skipped and named, as before.

## Measured on the official examples (2026-10-24)

The CEN EN 16931 test repository (ConnectingEurope/eInvoicing-EN16931, EUPL, not copied here) ships 41 example invoices in UBL, CII and other syntaxes. They pass the official Schematron, so a built-in rule that fires on one is a false positive of ours or a real inconsistency in the example's data. `node eval/official-examples.mjs <checkout>` runs the built-in rules over them (31 are readable UBL or CII; 9 are EDIFACT or other syntaxes this tool does not read; one file is over the 1 MB limit: it is not FatturaPA but a 3.3 MB UBL invoice with an embedded attachment, `FT G2G_TD01 con Allegato, Bonifico e Split Payment.xml`; `MAX_CHARS=5000000 node eval/official-examples.mjs <checkout>` reads it, and on 2026-10-24 it drew one finding, the non-blocking INV-030 note, no false positive).

Before this run **none** of the 41 passed the built-in rules; 29 of the 31 readable files drew a finding, mostly arithmetic ones. The causes, all fixed in the JS and Python rules:

| Rule | Files before | After | Cause |
|---|---|---|---|
| INV-014, INV-018, INV-038 | 16, 16, 19 | 0, 1, 1 | line allowances/charges ignored; tax summed per line instead of per rate (BR-CO-17); a second `TaxTotal` in the VAT accounting currency (BT-111) added to BT-110; CII net read from `LineTotalAmount` (BT-106) instead of `TaxBasisTotalAmount` (BT-109); CII header allowances not read; breakdown rows keyed by rate only, so S, Z and E at 0% collided; a negative taxable amount rejected |
| INV-009 | 5 | 0 | a negative quantity (a credit line) rejected |
| INV-011, INV-015 | 2, 2 | 0 | category O has no `Percent` and invoices with no VAT carry no tax total |
| INV-012 | 13 | 12 | unit prices rounded to cents before multiplying (0.0088 EUR per kWh read as 0.01); price base quantity (BT-149) ignored. The 12 left are real: the example's stated line net is not quantity times price (for instance quantity 2, price 800, net 800) |
| INV-005 | 6 | 6 | unchanged on purpose: a buyer known by name alone is still flagged, a buyer with a VAT id, legal id or endpoint is not |

What is left on the readable files is mostly the examples' placeholder data (VAT numbers and IBANs that fail their checksums: INV-022/023/024/025), plus INV-012 above, one HUF invoice whose VAT is rounded to whole forints (INV-018/038 use cents; since 2026-10-24 a HUF tax total rounded to the unit is accepted, a unit-rounded total in any other currency is not) and INV-033 on a credit note without BT-25. One file is clean. A line whose stated net disagrees with quantity times price is reported once (INV-012); in a parsed file the totals are then summed from the stated nets, as BR-CO-10 does, so the error is not repeated in every total. Draft JSON still sums quantity times price. Where a line states a price base quantity and its net matches quantity times price without it, the net is accepted (the official CII example 8 does this).

Behaviour changes that tests pin: tax is worked out per rate on the summed taxable amount; header allowances and charges move the taxable amount of their rate (or of the only rate); a UBL or CII buyer may omit BT-46 when another identifier is present; negative quantities are allowed.

## Measured on the XRechnung test suite (2026-10-26)

The KoSIT XRechnung test suite (itplr-kosit/xrechnung-testsuite, Apache-2.0, not copied here) holds 72 valid German documents in UBL and CII (36 cases, each in both syntaxes: 33 standard, 3 extension; `node eval/official-examples.mjs <checkout>/src/test/business-cases`). They pass KoSIT's validator, so a finding is a false positive of ours, placeholder data, or a style note. Before this run 72 of 72 drew a finding. Real false positives found and fixed, in the JS and Python rules:

| Rule | Cause | Files before / after |
|---|---|---|
| INV-044 | the means list held 13 codes; BR-CL-16 allows the whole UNCL 4461 list (here code 68, online payment service) | 2 / 0 |
| INV-045 | direct debits (49, 59) were asked for a payee IBAN; they name the payer's account | 7 / 0 |
| INV-035 | zero-rated category Z was asked for an exemption reason (BR-Z-10: none) | 2 / 0 |
| INV-029 | the payable rounding amount (BT-114) was ignored; a negative amount due (prepayments above the gross, BR-CO-16 has no sign limit) was refused; CII amounts due were never checked | 3 / 1 |
| INV-028 | prepaid above gross, same credit-balance case | 2 / 0 |
| INV-038 | a zero tax-breakdown row (0 taxable, 0 tax) that exists only for a zero-amount header allowance or charge was called a rate no line uses; a non-zero row with no line is still flagged | 6 / 0 |

A negative amount due is accepted only when it equals gross minus prepaid plus rounding; a negative `due` typed with no prepayment is still `INV-029`. Left, not fixed: placeholder VAT ids and IBANs (INV-022/023, 27 and 42 files), the `[BIC]` placeholder (INV-026), 6 files whose line net is not quantity times price (INV-012), 39 files with an IBAN and no remittance reference (INV-030, a style note the standard does not require), and one extension case whose amount due differs from the totals on purpose (INV-029). The same 31 CEN examples also lose 2 INV-035, 2 INV-044 and 1 INV-045.

## Measured on the Peppol BIS 3.0 examples and the ZUGFeRD corpus (2026-10-27)

The OpenPEPPOL `peppol-bis-invoice-3` examples (9 UBL files), the ZUGFeRD community corpus (`ZUGFeRD/corpus`; 51 XRechnung files, 13 ZUGFeRD 2 files) were read, not copied: `node eval/official-examples.mjs <checkout>` (set `PATH_FILTER` to pick a folder). Before: 0 of 9 Peppol files and 2 of 51 XRechnung files were clean. Real false positives fixed in the JS and Python rules (`negative-invoice.test.mjs`, `tests/test_checks.py`):

| Rule | Cause | Fix |
|---|---|---|
| INV-013, 015, 016, 029, 050, 038 | the Peppol "negative invoice" example (type 380, negative net, tax, gross and a negative header charge) was refused: totals and header amounts had to be non-negative | a negative net and gross make a negative invoice; its totals, amount due and header allowances/charges keep their sign and the arithmetic is still checked |
| INV-028 | a negative prepaid amount (KoSIT-valid German insurance invoice, prepaid -220) | accepted when the stated amount due equals gross minus prepaid |
| INV-032 | only 9 UNCL 1001 codes known; 204, 387, 575, 877 and others in valid files | the BR-CL-01 invoice, credit and debit codes added |
| INV-048 | Peppol's `NA` purchase-order id with a `SalesOrderID`, and an empty id with one | the sales order number is the reference |
| INV-045 | an IBAN that is present but malformed (a placeholder) was reported as missing | INV-024 reports it; INV-045 only when none is given |

After: the 9 Peppol examples draw only placeholder-data findings (fake VAT ids, IBANs, GLNs; INV-034 where the example credit note names itself "Snippet1"); XRechnung corpus 8 of 51 clean (INV-032, 048, 028 gone); the rest are placeholders (INV-023 34 files), 7 files whose line net is not quantity times price (true, e.g. 20 x 2.77 stated as 55.46) and style notes. A negative invoice is not valid in every country's rules; this tool only stops calling it arithmetic nonsense.

## Measured on the Ministry's own FA(3) templates (2026-10-27)

`node eval/ksef-official-templates.mjs <clones> <schemy/FA>` reads the FA(3) sample invoices that the Polish Ministry of Finance and CIRF ship in `ksef-client-csharp`, `ksef-client-java` and `ksef-pdf-generator` (MIT; read from a checkout, not copied here), fills their `#placeholders#` (NIP, number, date, internal ids) with valid values, and compares the schema gate with xmllint on the real XSD. **14 distinct files; the verdict agrees with xmllint on all 14; 12 draw no finding at all** (so no false positive from `PL-001`..`PL-011` on files KSeF's own tooling emits, including the attachment, self-invoicing and third-party-subject variants). The other two (`...custom-subject_3` with a `Nazwa` where `IDWew` belongs, `...multiple-Subject3` with `IDWew` before `Nazwa`) are rejected by xmllint too: they are element-order faults in the Ministry's templates, which we report as `PL-013`. Limits: these are templates, not invoices a business issued; the rate and total branches they exercise are the plain-VAT ones, so the correction and advance branches remain unmeasured on real files.

## Measured on the ZUGFeRD corpus PDFs (2026-10-29)

`node eval/facturx-corpus.mjs <ZUGFeRD/corpus checkout>` unwraps every PDF in the corpus with `facturx.mjs` and runs the built-in rules on the embedded XML (the files are read, not copied). Before: of 126 PDFs in the corpus's `correct` folders, **only 40 unwrapped** and 5 were clean. Three faults, all ours:

- The invoice sniff looked at the first 4,096 bytes of the attachment. The official ZUGFeRD samples open with a licence comment of over 5 KB, so the root element was out of range and 59 valid PDFs were refused as "no UBL or CrossIndustryInvoice". Comments are now dropped before sniffing (`facturx.test.mjs`).
- One attachment that would not inflate (a report PDF, a mis-sliced stream) aborted the whole read, 5 files. It is now skipped; the error is raised only when no attachment is usable.
- MINIMUM and BASIC WL carry totals and no lines by design, so INV-007, 014, 018 and 038 fired on all of them. They are skipped when `specification_id` ends in `minimum` or `basicwl` and there are no lines; MINIMUM also has no prepaid field, so INV-029 (amount due vs gross) is skipped there (`negative-invoice.test.mjs`).

After: 104 of 126 unwrap, 18 are clean. The 24 ZUGFeRD 1.0 files and one unstructured PDF remain refused (1.0 uses the older `CrossIndustryDocument`; the message now says so) and one has no attachment. What is left is real or placeholder data: INV-023 (placeholder VAT ids, 72 files), INV-005 (no buyer id, a style note), INV-012 (e.g. 20 x 2.77 stated as 55.46), INV-021 (the BASIC WL sample is dated 2019 with a 2017 due date), INV-024 (11 files, placeholder IBANs). Fixed 2026-10-24: the EXTENDED "Warenrechnung" samples drew INV-014/018/038 because `SpecifiedLogisticsServiceCharge` (3.00 freight at 19%, EXTENDED only) was not read as a header charge; `cii.mjs` now maps it (1 test; both samples now draw only the placeholder-VAT INV-023). The corpus's `fail` folders hold files failing for PDF/A or XSD reasons we do not check, so findings there prove nothing either way.

## Measured on Mustang's test PDFs (2026-10-28)

`node eval/facturx-corpus.mjs <ZUGFeRD/mustangproject checkout>` (read, not copied): 36 PDFs from other generators. One Aspose.Words invoice (2026-03-24) was refused as "compressed in a way this tool cannot read": `/Subtype /application#2Foctet-stream` contains the word `stream`, so the reader began inside the dictionary. Fixed in `facturx.mjs` (keyword must be followed by a line break; test in `facturx.test.mjs`). Unwrapped 18 before, 19 after; the rest hold no invoice XML. Remaining findings on the others are placeholder VAT ids, a bank checksum in a French sample and a missing remittance.

## Privacy and usage

Everything is local. Invoice contents are never uploaded or retained by this
tool, including when read from standard input. Usage counting is opt-in with
`--usage-file` and stores only aggregate event counts, never invoice data,
paths, IPs, or identifiers. It records `invoice_preflight_attempted` once per
command invocation and `invoice_preflight_checked` once per successfully parsed
invoice, so failed input is not silently missing from adoption signals. Usage
recording is best effort and never changes
the validation result if its state file cannot be read or written. Omit the
flag to disable it. There are no accounts, cookies, or analytics vendors.

## Safety boundary

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax or legal advice, and it does not
replace a qualified professional. **You are responsible for reviewing and
verifying its output before relying on it**, and for meeting any obligation it
helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

This is a preflight observation, not a declaration that an invoice is valid or
compliant. Format-specific validators and professional review are still
needed before submission.

## FAQ

### Does this submit invoices?

No. It reads one local JSON file and writes a report to stdout.

### Does it calculate VAT?

No. It checks the arithmetic for the tax percentage supplied in each line; it
does not decide whether that percentage is legally correct.

### Does a 0% line need a reason?

When a line is 0% or uses an exempt / zero-rated category (`E`, `AE`,
`K`, `G`, `O`, `Z`), the preflight expects `tax_reason` or
`tax_reason_code` (or an invoice-level exemption reason). That is the
same shape Peppol and many EN 16931 CIUS reject when the reason is
missing. The tool never chooses the reason and never claims the
exemption is legally valid.

### Does it look up VAT registrations?

No. Optional `vat_id` values (and a complete VAT shape in `id`) are checked
with published checksums only. The tool never calls VIES or any network
service, never stores the identifier, and never claims a party is registered.

### Does it confirm a deposit was paid?

No. Optional `totals.prepaid` and `totals.due` (and UBL PrepaidAmount /
PayableAmount) are checked only as remaining-balance arithmetic against
`totals.gross`. The tool never contacts a payment processor and never claims
a balance is legally due.

### Does it look up bank accounts?

No. Optional `payment.iban` values (and a UBL payee account ID) are checked
with the published IBAN length and MOD-97 checksum only. Optional
`payment.bic` values are checked for ISO 9362 shape and, when both are
complete, for the same country as the IBAN. Optional `payment.remittance`
(and UBL `PaymentID` / `InstructionNote`) is required when a complete
IBAN is present and, when it looks like an RF creditor reference, is
checked with the published ISO 11649 checksum only. The tool never
contacts a bank, never stores the account number, BIC, or remittance,
and never claims funds can be received or allocated there.

`examples/factur-x-credit-note-with-defects.pdf` wraps the defective CII credit note in a Factur-X envelope: the built-in rules report INV-032 (unknown type code) and INV-038 (tax amount), identical to the bare XML (`facturx.test.mjs`); the official-rule findings for the same XML are pinned in `schematron.test.mjs`.

## Repair a JSON invoice's arithmetic

UBL files (Invoice, CreditNote) are repaired too, in place: see "Repair a UBL file" below.

`node repair-cli.mjs invoice.json -o fixed.json` (or `POST /v1/repair`)
recomputes line nets, the net, tax, gross and amount-due totals from the
invoice's own quantities, unit prices, tax percents and header adjustments,
and upper-cases a lower-case currency code. It logs each change (path, old
value, new value, reason), re-runs the checks on the result and lists what is
left. It never chooses a tax rate, date, identifier, bank detail or party:
those findings stay for a person (exit 1 while any remain). If a line's
quantity, price or tax percent is invalid, no totals are touched. Tests in
`repair.test.mjs` and `server.test.mjs`. The web page has a "Repair the arithmetic (JSON, UBL or CII)" button (paste JSON, click, read the change table; clicked through with `eval/browser-repair.mjs`).

## Repair a UBL file

`node repair-cli.mjs invoice.xml -o fixed.xml` (or `POST /v1/repair` with the
XML as the body) edits only the amount elements of a UBL Invoice or
CreditNote and leaves every other byte alone (comments, namespaces, order).
It recomputes each line's net (quantity x price / base quantity, plus the
line's own charges, minus its allowances; a discount inside `Price` is already
in the net price), the taxable amount and VAT of each `TaxSubtotal` (line nets
minus document allowances plus document charges in that category, times the
rate, rounded half up, the EN 16931 way), the document `TaxAmount`, and the
line-extension, allowance, charge, tax-exclusive, tax-inclusive and payable
totals. A net written with more decimals that rounds to the right cent (PINT
allows them) is kept; on a PINT Oman file a recomputed net is written to the
baisa (three decimals), see "PINT Oman, UAE and Malaysia" below. It reads the document's tax from the root-level
`TaxTotal` that carries subtotals; a root-level one without subtotals is
BT-111, set equal to the new tax when it is in the document currency and left
alone (with a note) when converting it would need an exchange rate. It
declines the tax part, and says so in `skipped`, when a tax group or a
document allowance's category does not match the subtotals one to one: it
never adds an element or picks a rate or category. Lines with sub-lines keep
their net. The result is re-parsed and re-checked. On
`examples/ubl-invoice-with-defects.xml` it fixes 3 amounts and clears
INV-017, INV-018, INV-029 and INV-038; INV-021 (due date) and INV-045 (no
IBAN) stay for a person.

**Saudi files (ZATCA, 2026-11-12).** A ZATCA invoice (`ProfileID`
`reporting:1.0`, or an `InvoiceTypeCode` name of `01xxxxx`/`02xxxxx`) carries
a `TaxTotal` on every line. Before, the repair counted those as extra
document `TaxTotal`s, or stopped at the header allowance most ZATCA examples
carry, so it declined the tax part on all 19 of ZATCA's good cases. Now, on a
ZATCA file only:

- the line VAT (KSA-11) is rewritten to net x rate when it is more than 0.01
  off, and kept within 0.01 (ZATCA's "Standard Invoice with Payable Rounding
  Adjustment" writes 869.57 + 130.43 = 1000.00, a cent under 869.57 x 15%);
  the line amount with VAT (KSA-12) is set to net + KSA-11 (BR-KSA-51);
- a prepayment line's VAT (KSA-32) is recomputed from its taxable amount
  (KSA-31) and rate (BR-KSA-79); KSA-31 and the prepaid amount are facts,
  and a prepaid amount that is not KSA-31 + KSA-32 is reported (BR-KSA-80),
  never edited;
- a subtotal's VAT within ZATCA's own tolerance of the exact figure (0.01 per
  invoice line, BR-S-09/BR-CO-17 in ZATCA's cut of EN 16931) is kept.

A line `TaxTotal` outside ZATCA is left as written, with a note.

Measured with `eval/repair-seeded.mjs` (2026-11-12): every amount the repair
may recompute is pushed off by 7.00, one at a time, in files the publisher
lists as valid, and the repaired file is compared with the original.

| Files | Before | After | Repaired file draws a rule id the original did not |
| --- | --- | --- | --- |
| ZATCA 3.4.6, 19 good cases (phive-rules dfa902d) | 42 of 258 restored; tax part reached on 0 of 19 | **257 of 258**; 19 of 19 | 0 of 258 (`--rules`, the official ZATCA sets on the plain route) |
| PINT A-NZ 1.1.3, 24 files | 140 of 270 | **270 of 270** | not run |
| PINT SG 1.4.1, 16 files | 27 of 164 | **158 of 164** | not run |
| The repo's 14 clean UBL examples | not measured | **147 of 147** | 0 of 147 |

"Restored" counts the same values; 64 of the 257 ZATCA ones are written
`300.00` where the original wrote `300`. Every clean file still comes back
byte for byte. What is not restored: on ZATCA's rounding example a seeded
KSA-11 comes back as 130.44 (net x rate, rounded half up), not the 130.43 the
publisher chose; the file still passes every rule. PINT SG example 07 is
declined (a 7% charge with no 7% subtotal and 0.00 tax: the example itself
does not add up) and example 11 writes its line nets with six decimals, which
the repair keeps but cannot restore exactly. 17 of the 258 ZATCA seeds, all
in the SAR repeat of the tax (BT-111), drew no finding from our checks or
ZATCA's rules: a SAR invoice whose BT-111 disagrees with BT-110 passes them
all. The repair fixes it, and since 2026-11-12 the checks flag it too (INV-059,
"BT-111 in the invoice's own currency" below). Tests:
`repair-ubl.test.mjs` (20). Not tried on a real ERP export or a Fatoora
verdict.

**PINT Oman, UAE and Malaysia (2026-11-12, second pass).** Scored the same way on
OpenPeppol's PINT examples (phive-rules dfa902d), the repair had four faults,
two of them on correct files, which the repair must never make worse:

- **UAE reverse charge and margin scheme got VAT added.** PINT UAE states the
  rate on an `AE` (reverse charge) or `N` (margin scheme) subtotal, 5%, with a
  tax of 0, as its rules require (aligned-ibrp-ae-09-ae, ibr-108-ae). The repair
  computed 5% anyway: "Supply under Reverse charge mechanism" went from 0 to
  148.50 of VAT and its amount due from 2,970.00 to 3,118.50. A category `AE`
  subtotal (any file; EN 16931 BR-AE-08 says the same) and `N` on a PINT UAE
  file now always come to 0.
- **More decimals on a PINT subtotal were rounded off.** UAE's examples write
  a subtotal tax of 532.1645 and a taxable amount of 949.405. On a PINT file
  (`CustomizationID` `urn:peppol:pint:...`) one that rounds to the right cent is
  kept, as a line net already was.
- **LHDN's Malaysian sample was re-netted from 100.00 to 10.00.** It states a
  price of 10.00 per base quantity of 10, for 10 hours, and nets the line as
  quantity x price. The checks already accept that reading
  (`acceptedLineNet`); now the repair does too. A net that matches neither
  reading still goes to the base-quantity one.
- **Oman lines to the baisa.** On a PINT Oman file (`...@om-1`) a recomputed line
  net is rounded to three decimals (0.047, not 0.05). A line VAT (BTOM-016)
  more than 0.001 off net x rate is rewritten to it, to three decimals
  (IBR-168-OM's own tolerance). The line amount with VAT (BTOM-017) is
  rewritten to net + VAT when it is more than 0.01 off (IBR-158-OM), except on
  a profit margin invoice (BTOM-001 position 10), where it is the item's sale
  value. A subtotal's tax that is wrong is rewritten to the sum of its lines'
  corrected VAT where every line states one (ALIGNED-IBRP-S-09-OM), not to rate
  x taxable.

- **A rate inside an XML comment was read.** LHDN's tourism tax samples keep
  a commented-out `<cbc:Percent>10</cbc:Percent>` in a per-unit tax subtotal
  (10.00 a room-night, `PerUnitAmount`). The repair now reads the file with
  comments blanked out (offsets kept, comments written back untouched), and
  declines the tax part, with a note, when a subtotal is a per-unit amount.
  Found reading those samples while checking `--rules`; on them the repair
  already declined the tax part (their tax groups do not match the subtotals
  one to one), so no number moves. It matters for a file whose groups do
  match (tests). With `--rules` on PINT MY, 28 of 342 repaired files draw a
  rule id the original did not, the same 28 before and after: all are seeded
  faults in the four TTX samples that the repair declines and leaves in place,
  not changes it made.

`eval/repair-seeded.mjs` now also seeds the line amounts inside
`ItemPriceExtension` (Oman's BTOM-016/017, UAE's BTAE-08) under their own
labels; before, the line VAT ones were counted as "KSA-11". Same seeds before
and after this change:

| Files | Correct files left unchanged | Seeded faults restored | `ItemPriceExtension` amount (new seeds) |
| --- | --- | --- | --- |
| PINT OM 1.0.1, 49 | 49 to 49 | 461 to **657 of 658** | 0 to 120 of 124 |
| PINT AE 2026.5, 32 | 20 to **32** | 166 to **286 of 346** | 0 of 40 (not touched) |
| PINT MY 1.3.1, 26 | 22 to **26** | 208 to **244 of 300** | 0 of 42 (not touched) |
| ZATCA 19, PINT A-NZ 24, SG 16, JP 9 | unchanged, all | 257/258, 270/270, 158/164, 116/121, unchanged | none |

Not restored on Oman: one line `TaxTotal` outside `ItemPriceExtension` on
Exports-2 (left as written, as outside ZATCA); BTOM-017 on the two profit margin
files (a fact, deliberately not touched); and two on Summary-Utilities, which
writes BTOM-017 to the cent (392.18) where the repair writes 373.5 + 18.675 =
392.175. Both are within IBR-158-OM's 0.01. UAE and Malaysia's
`ItemPriceExtension` amounts are not recomputed yet, and most of their
remaining misses are there and in multi-currency and summary files.
Tests: `repair-pint.test.mjs` (17, made-up invoices built in the test; 10 fail
on the code before this change). Not done: a real
business's file for any of the three. UAE's BTAE-08/10 and Malaysia's
`ItemPriceExtension` are covered in the next section.

### UAE line VAT (BTAE-08) and line amount payable (BTAE-10), 2026-11-12 later

Every PINT UAE line restates its VAT (BTAE-08, `ItemPriceExtension/TaxTotal/TaxAmount`)
and its amount payable (BTAE-10, `ItemPriceExtension/Amount`). The UAE rule set
fixes no arithmetic for them: it requires both (ibr-104-ae, ibr-194-ae), wants
BTAE-08 absent on exempt lines (ibr-163-ae) and 0 on reverse-charge and zero-rated
ones (ibr-162-ae, ibr-165-ae). Every one of OpenPeppol's 40 example lines reads as
net x rate and net + VAT, kept to the precision of the arithmetic (999.375 x 5%
written 49.9688, 1,049.3438 payable). So `repair-ubl.mjs` now:

- rewrites a BTAE-08 more than 0.01 off net x rate (0 in categories AE, Z and the
  UAE's margin scheme N), and leaves an exempt line's absent one absent;
- rewrites a BTAE-10 more than 0.01 off net + BTAE-08 (net alone on an exempt line);
- writes both with the decimals the file used there, 2 to 4 (`fmtAs`), and does
  the same for a PINT subtotal tax written to more than two decimals (532.1645);
- groups a zero-tax category (reverse charge AE; the UAE's margin scheme N) by
  category alone, whatever rate it states. Two UAE examples put a reverse-charge
  header allowance at AE 0% beside AE 5% lines and an AE 5% subtotal; the 0% and
  5% rows read as two groups against one subtotal, so the whole tax part was
  skipped ("groups do not match") and a wrong total stayed wrong.

The 0.01 tolerance is ours, not the UAE's, chosen so a VAT-inclusive price that
comes out a fils under net x rate is kept.

**Malaysia is left alone on purpose.** LHDN's 26 PINT MY samples write
`ItemPriceExtension/Amount` as 100.00 on 5,000.00 and 6,000.00 lines and 0.00 on a
100.00 line, under a comment that it "is not part of Schematron calculations at
this moment". No reading of the line gives those numbers, so there is nothing to
recompute it from: the repair keeps it as written, and `eval/repair-seeded.mjs` no
longer seeds it (the 42 "not restored" in the table above were never restorable).

`eval/repair-seeded.mjs` also now writes each seed with the decimals of the value it
replaces (at least two). It used to write `toFixed(2)`, so a seeded 532.1645 became
539.16 and the original precision was gone before the repair saw it.

Measured on phive-rules commit dfa902d, same seeds, code before and after:

| Files | Correct files left unchanged | Seeded faults restored | `ItemPriceExtension` seeds |
| --- | --- | --- | --- |
| PINT AE 2026.5, 32 | 32 to 32 | 286 to **380 of 386** | 0 to **76 of 76** |
| PINT OM 1.0.1, 49; MY 1.3.1, 26; ZATCA 3.4.6, 19; A-NZ 1.1.3, 24; SG 1.4.1, 16; JP 1.1.3, 9 | unchanged, all | 777/782, 244/300, 257/258, 270/270, 158/164, 116/121, identical | OM 244/248, identical |

With `--rules` (the whole preflight with the official PINT AE sets on the plain
route), the repaired file drew a rule id the original did not in **0 of 386**; before
the zero-tax grouping fix it was 10, all on the two AE-category allowance files whose
tax part was skipped. The same run shows the checks' gap: a seeded BTAE-10 drew a
finding from nothing, ours or the UAE's (**0 of 40**), and a seeded BTAE-08 from
something in 11 of 36. The repair fixes them when asked; no check says to ask.

Still not restored on UAE (6): the three line `TaxTotal`s outside
`ItemPriceExtension` on Continuous supplies and the two Exports files (left as
written, as outside ZATCA), and three seeds on the disclosed-agent invoice (its
three-decimal line net and its subtotal). Tests: `repair-pint.test.mjs` (11 more,
28 in all; 7 of the new ones fail on the code before). Not done: a real UAE
business's file, or an ASP's verdict on a BTAE-08 written to two decimals.

### INV-060: the checks now flag a wrong line VAT or amount payable (2026-11-12, latest)

The section above ended with the gap: "The repair fixes them when asked; no check
says to ask." **INV-060** closes it. On a PINT UAE (`@ae-1`) or PINT Oman (`@om-1`)
file, the UBL reader now keeps each line's `ItemPriceExtension/Amount` (BTAE-10,
BTOM-017) beside its line VAT (BTAE-08, BTOM-016), and `lineext.mjs` (mirrored in
`src/einvoice_preflight/lineext.py`) flags a line whose

- VAT is more than 0.01 off net x rate, or off 0 in reverse charge (AE), the UAE's
  margin scheme (N) or on an exempt line;
- amount is more than 0.01 off net + line VAT (net alone on an exempt line that
  states none).

The tolerance is the repair's, so a check never flags what the repair would keep,
and the fix text names the figure the repair writes. PINT Malaysia is left out for
the reason given above (LHDN's amounts tie to nothing).

Measured on phive-rules commit dfa902d, built-in checks only, each
`ItemPriceExtension` amount pushed off by 7, 0.05 and 0.02 in turn, one at a time:

| Files | Correct files with INV-060 | Line VAT seeds flagged | Line amount seeds flagged |
| --- | --- | --- | --- |
| PINT AE 2026.5, 32 files, 40 lines | 0 | **36 of 36** (was 0 built-in; 11 with the UAE sets) | **40 of 40** (was 0, ours or the UAE's) |
| PINT AE 2026.3, 14 files | 0 | 17 of 17 | 17 of 17 |
| PINT OM 1.0.1, 49 files, 124 lines | 0 | 124 of 124 (50 already drew INV-018) | 124 of 124 (was 0 built-in) |
| PINT OM 1.0.0, 41 files | 0 | 50 of 50 | 50 of 50 |
| PINT MY 1.3.1, 26 files | 0 (left out) | none written | 0 of 42, by design |

Same result at every delta. The Python mirror agrees on AE 2026.5, OM 1.0.1 and MY
1.3.1 (0 on the 107 correct files, one finding on each of 133 seeded ones). A first
seeding run missed 0.05 seeds on values written with one decimal (`524.3`): the
seeder's `toFixed(1)` rounded the seed away, not a gap in the check; seeds are now
written with at least two decimals. Tests: `lineext.test.mjs` (10),
`tests/test_lineext.py` (7). Not done: a real UAE business's file, or what an
accredited service provider does with a BTAE-10 a few fils off.

## BT-111 in the invoice's own currency

A file may state its VAT total twice: once in the invoice currency (BT-110, the
`TaxTotal` with subtotals) and once in the VAT accounting currency (BT-111, a
`TaxTotal` with only a `TaxAmount`; in CII a second `TaxTotalAmount`). When the
two currencies are the same, as on every SAR invoice under ZATCA, which asks
for BT-111 in SAR, the repeat is the same tax written twice. **INV-059** fires
when it differs from BT-110 (to the cent), at `/totals/tax_accounting_currency`,
naming both figures; the repair pass rewrites the repeat. A BT-111 in another
currency needs the seller's exchange rate and is not compared. Code:
`taxcurrency.mjs` (and `src/einvoice_preflight/taxcurrency.py` for UBL);
the UBL and CII readers keep the repeat as `totals.tax_accounting_currency`.

Measured 2026-11-12 with `node eval/repair-seeded.mjs <ZATCA 3.4.6 good cases> --rules`
(phive-rules, 19 files, every amount pushed off by 7, one at a time, the
official rules on the plain route; that route needs `npm i --no-save slimdom
fontoxpath`, and without it `--rules` silently runs the built-in checks only):

| | before | after |
|---|---|---|
| seeded BT-111 repeats flagged | 0 of 17 | **17 of 17** |
| all seeds flagged by some rule | 241 of 258 | **258 of 258** |
| repaired files drawing a rule the original did not | 0 of 258 | 0 of 258 |

`eval/phive-corpus.mjs --good` (141 publisher-valid files across PINT A-NZ and
SG, NLCIUS, CIUS-RO, CIUS-PT and ZATCA): INV-059 on none. The eval now prints
"seed flagged n/m" per site. Not tried: a real ERP's SAR export, or what
Fatoora itself says about a mismatched repeat. Tests: `taxcurrency.test.mjs`
(8), `tests/test_taxcurrency.py` (5).

## Repair a CII file (XRechnung CII, ZUGFeRD, Factur-X XML)

The same command and endpoint take a `CrossIndustryInvoice` file
(`repair-cii.mjs`; the CLI and `POST /v1/repair` pick CII or UBL by content).
**Factur-X PDFs** (CII inside) are repaired too (`repair-facturx.mjs`; CLI
`node repair-cli.mjs in.pdf -o out.pdf`; `POST /v1/repair` with the PDF returns
`pdf_base64`): the embedded XML goes through the CII repair and the PDF is
extended by an incremental update (all original bytes kept, a newer copy of the
attachment appended). The printed pages are not re-rendered, so if they show
wrong amounts, re-issue the PDF from the source system. A PDF 1.5 file whose
newest cross-reference is a stream (most modern generators) gets an appended
uncompressed xref stream (`/W [1 4 2]`, `/Prev` chained) instead of a table
(2026-10-22). Encrypted PDFs, or ones whose xref dictionary cannot be read, come
back with only the corrected XML. Tested on PDFs built by this repo's own writer
(plain and Flate streams, classic table and a hand-built xref-stream file); no
real ERP or Factur-X export tried, so a PDF viewer or veraPDF opening the
result is the open check.
Same contract as UBL: only amounts are edited, in place: each line's
`LineTotalAmount` (quantity x net price / basis quantity), each header
`ApplicableTradeTax` block's `BasisAmount` and `CalculatedAmount`, and the
header monetary summation (line total, tax basis, tax, grand total, amount due
= grand - prepaid + rounding). Skipped, and said so: lines with their own
allowance, charge or sub-line, header allowances or charges, more than one
`TaxTotalAmount`, and tax groups that do not match the header blocks one to
one. On `examples/xrechnung-cii-credit-note-with-defects.xml` it fixes the
wrong VAT amount (150.00 to 190.00) and leaves the type code and missing
fields for a person. Hand-written examples only (`repair-cii.test.mjs`,
`server.test.mjs`), no real ERP or Factur-X export tried. The web page's
repair button takes pasted JSON, UBL or CII (clicked through in headless
Chromium with `eval/browser-repair.mjs`, which pastes the defective CII
credit note).

The web page's repair button also takes one dropped Factur-X PDF (empty paste
box): it lists the changes and offers `<name>-repaired.pdf` to download. The
printed pages are not redrawn. Clicked through in headless Chromium with
`eval/browser-repair.mjs` on a PDF built by this repo.

## Metamorphic fuzz (2026-10-25)

`node eval/metamorphic-fuzz.mjs [N] [seed]` builds seeded random valid JSON
invoices (1 to 5 lines, five tax rates, fractional quantities, per-rate
breakdowns rounded to cents) and perturbs each one in a way with a known
answer. On 3,000 invoices per seed (seeds 7, 99, 12345): 0 valid invoices
flagged, and every one-cent change to a line net, a breakdown tax, the net
total or the gross, a changed quantity, a swapped line rate and a negated
quantity was caught (3,000 of 3,000 each). An empty `tax_breakdown` on a
single-rate invoice is accepted by design (`breakdown.mjs`, INV-037 needs two
or more rates). Synthetic invoices only; it says nothing about real ERP
exports, which stay the open item.
- Austria mandate page, 2026-10-26 (`austria-e-invoice-mandate.html`, 8 tests, hub counts 33 pages): federal-government suppliers must e-invoice (since 1 Jan 2014; EN 16931 since 18 Apr 2020, e-Rechnung.gv.at or Peppol, ebInterface or Peppol BIS 3.0); B2B voluntary with no adopted date, ViDA 1 Jul 2030. Vendor and guide excerpts only (BMF and RIS unread), no penalty stated. The checker does not read ebInterface XML: that is the open gap this page names. To refresh when Austria adopts a B2B date.
- Malta mandate page, 2026-10-26 (`malta-e-invoice-mandate.html`, 8 tests, hub counts 32 pages): no domestic B2B mandate (voluntary), public bodies receive EN 16931 over Peppol BIS 3.0 (Legal Notices 403/404 of 2018), ViDA 1 Jul 2030; Commission sheet and vendor excerpts only (the Commission and vendor hosts were unreachable, MTCA unread), sources disagree on the B2G readiness year (2020 or 2021) and on whether suppliers must send; no penalty stated. To refresh when the MTCA announces B2B dates.
- Finland mandate page, 2026-10-26 (`finland-e-invoice-mandate.html`, 8 tests, hub counts 34 pages; the Austria page is PR 10673's): voluntary for domestic B2B with ViDA 1 Jul 2030 as the first fixed date; Austria federal B2G e-invoicing since 1 Jan 2014 (ebInterface or Peppol BIS 3.0, USP), Finland government over Peppol since 2019/2020 plus a reported buyer right to request a structured invoice (Finvoice 3.0 common). Search excerpts of vendor and advisory pages only; the BMF, Vero and the laws were unreachable and unread, no penalty stated, sources disagree on Austrian regional/local reach and on a 2027 to 2028 Austrian B2B date. To refresh from the primary texts. The checker has no ebInterface or Finvoice reader (open item).
- Luxembourg mandate page, 2026-10-25 (`luxembourg-e-invoice-mandate.html`, 8 tests, hub now counts 31 pages): draft bill approved 17 Jul 2026 (receive 1 Jan 2028, large and medium issue 1 Jul 2028, all 1 Jan 2029, domestic B2B, Peppol, EN 16931); dates from vendor and advisory pages, the bill text unread, no penalty stated. To refresh when the bill is tabled.
- Luxembourg refresh, 2026-10-26 (same page, 1 new test): the bill is tabled as draft law No. 8815, filed 30 Jul 2026; alternative technical solutions to receive reported until 30 Jun 2028 (31 Dec 2028 small businesses); the first issuing phase is two of three thresholds on 2026 figures; Peppol with MyGuichet.lu as fallback sits in a draft Grand-Ducal Regulation. Read from search excerpts of KPMG Luxembourg, Arendt and Deloitte Luxembourg summaries (chd.lu and the firms' sites are unreachable from cloud sessions); the bill text is still unread.
- Luxembourg primary-source read, 2026-11-02 (same page, 1 new test): chd.lu was reachable today, so the French deposit text of draft law No. 8815 and the Bar Association opinion (30 Sep 2026) were read. Confirms the dates and thresholds (7.5m balance sheet, 15m turnover, 50 staff, 2026 figures). New: a usage fee (2/3/4/5 euros per invoice above a regulatory cap, bands of 20/30/50/then rest, ex VAT), same-format corrections, no recipient acceptance, only the e-invoice is the invoice, no penalty provision found (searched 'amende', 'sanction'). Grand-Ducal Regulations (caps, network) still unread.
- UK mandate page, 2026-10-25 (`uk-e-invoice-mandate.html`, 8 tests, hub test now counts 28 pages): VAT invoices B2B and B2G from April 2029 over Peppol, roadmap due with Budget 2026; sources are search excerpts from law-firm, accountancy and vendor pages (gov.uk and HMRC unreachable), so no penalty or phasing is stated. To refresh after Budget 2026.
- Norway mandate page, 2026-10-25 (`norway-e-invoice-mandate.html`, 8 tests, hub counts 30 pages): send duty 1 Jan 2027, receive and digital bookkeeping 1 Jan 2030, EHF / Peppol BIS 3.0; from search excerpts only (Lovdata and skatteetaten.no unread), so no penalty stated and exemptions flagged as reported. No ELMA lookup.
- Lithuania mandate page, 2026-10-25 (`lithuania-e-invoice-mandate.html`, 8 tests, hub test now counts 29 pages): B2G mandatory since 2017 (SABIS from 2024), i.SAF monthly reporting since 2016, no enacted B2B mandate; a 2028 target and the 2030 ViDA date come from secondary sources that disagree, and vmi.lt and e-tar.lt were not read (search excerpts only). To refresh when a B2B law is tabled.
- Built-in checks beside PINT/ZATCA, 2026-11-10 (`report.mjs`, 1 test): clean example files drew INV-024 (Singapore and A-NZ local account numbers) and, for the KSA file, INV-022, INV-005, INV-017 and INV-018 (non-EU tax id, no buyer on a simplified invoice, a second TaxTotal repeating the tax double-counted). When a PINT or ZATCA set governs the file those rules are dropped; other INV-0xx checks still run. Made-up invoices only.
- Server API runs PINT and ZATCA rules, 2026-11-10 (`report.mjs`, `Dockerfile`, `report-plain-route.test.mjs`, 3 tests): `?schematron=1` on `/v1/validate` used only the Saxon route, which runs the EU base, so a Singapore or KSA file got `unavailable` or EU false positives while the browser page already used the plain-JS runner. The report now runs the plain runner first; a file matched to a PINT or ZATCA set takes that set, any other file keeps the Saxon route (the plain runner stands in when the Saxon files are not built). The Docker image now carries `plain/` and slimdom, fontoxpath and their three dependencies (checked by running the runner from a folder holding only those). Not done: no Docker build was run here; the built-in INV-0xx checks still run beside PINT/ZATCA rules (an SG file with a local account number draws INV-024); the Saxon route itself is unchanged. Made-up invoices only.
- Sweden mandate page, 2026-10-26 (`sweden-e-invoice-mandate.html`, 8 tests, hub counts 35 pages): no dated domestic B2B mandate; public-sector suppliers on e-invoices since April 2019 with Peppol BIS 3.0 preferred; EU ViDA 1 Jul 2030. Search excerpts of vendor pages only (Invopop, B2Brouter, Stripe, VATcalc); Skatteverket, DIGG and the law unread, no penalty stated, sources disagree on whether Svefaktura/EDIFACT ended 1 Jul 2025. To refresh from primary texts.
- Albania mandate page, 2026-11-03 (`albania-e-invoice-mandate.html`, 8 tests, hub counts 74 pages): clearance through the DPT under Law 87/2019, B2G 1 Jan 2021, cashless B2B 1 Jul 2021, B2C cash 1 Sep 2021; UBL 2.1 or CII signed with an AKSHI certificate, NIVF/NSLF. Search excerpts of vendor pages only (DPT, the law and the vendor sites unreachable from the build host); sources disagree on retention (5 vs 10 years). No future date, so no calendar entry. Not tested: Albanian schema, signing, clearance.
- Mauritius mandate page, 2026-11-03 (`mauritius-e-invoice-mandate.html`, 8 tests, hub counts 75 pages): MRA invoice registration (EBS to IFP, IRN and QR); MUR 100m from 15 May 2024, widening to MUR 40m from 1 Sep 2026. Search excerpts only (mra.mu and vatupdate unreachable from the build host); sources disagree on the 2025 and 2026 wave dates, and the Finance Act 2026 fine is one aggregator's claim, not stated as fact. Not tested: Mauritian schema, registration.
- Côte d'Ivoire mandate page, 2026-11-03 (`cote-divoire-fne-e-invoice-mandate.html`, 8 tests, hub counts 77 pages): DGI facture normalisée électronique (FNE) under the 2025 tax annex and arrêté 0337/MFB/DGI; press and vendor pages give start dates from 1 Jun 2025 to 1 Jun 2026, DGI controls from 1 Sep 2026 and an API specification deadline of 29 Oct 2026 (aggregator citing a DGI notice), so the page lays out the conflict and states no single date. Search excerpts only (page fetches blocked in the build); DGI, Journal Officiel and portal unread; no penalty amounts found. Not tested: Ivorian format, certification.
- Morocco mandate page, 2026-11-03 (`morocco-e-invoice-mandate.html`, 8 tests, hub counts 76 pages): DGI pre-clearance (Simpl-TVA); vendor guides give 1 Jan and 1 Jul 2026 waves, the newest source read (about 28 Sep 2026) says no decree is published, so the page states no binding date. Search excerpts only; Official Bulletin and DGI unread. Not tested: Moroccan format, clearance.
- New Zealand mandate page, 2026-11-03 (`new-zealand-e-invoice-mandate.html`, 8 tests, hub counts 73 pages): no general B2B mandate; central agencies receive Peppol e-invoices since 2022; large suppliers to government reported required from 1 Jan 2027; PINT A-NZ, MBIE as Peppol authority. Search excerpts of vendor and compliance pages only (MBIE, Inland Revenue and the procurement rules unreachable from the build host); sources disagree on the PINT A-NZ send date, the NZD 33 million line and how firm 2027 is. Calendar, JSON and the 2027 deadlines page regenerated. Not tested: PINT A-NZ rules, NZBN identifiers.
- Turkey mandate page, 2026-10-26 (`turkey-e-invoice-mandate.html`, 8 tests, hub counts 36 pages): e-Fatura at TRY 3 million gross sales (TRY 500,000 in listed sectors, some categories regardless), e-Arşiv for all other invoices since the TRY 3,000 threshold went on 1 Jan 2026; UBL-TR through GİB or a licensed integrator, so the checker has no rules for it and says so. Vendor and advisory excerpts only (communiqués and GİB unread; a 2027 simplified-method date and Communiqué 535 are single-source or unread). Open: UBL-TR rules from GİB's published schematron.
- Switzerland mandate page, 2026-10-26 (`switzerland-e-invoice-mandate.html`, 8 tests, hub counts 38 pages): federal B2G e-invoices for contracts of CHF 5,000 or more since 2016, no private B2B mandate or timeline. Vendor guides only (zoneandco, Comarch, B2Brouter, ecosio, Vertex); they disagree on whether a central EFV platform exists and on the format list, both flagged. EFV and the ordinance unread. No eCH rules in the checker.
- Cyprus mandate page, 2026-10-26 (`cyprus-e-invoice-mandate.html`, 8 tests, hub counts 39 pages): public bodies must receive structured e-invoices (central 18 Apr 2019, sub-central 18 Apr 2020, national law of 26 Jun 2019 under Directive 2014/55/EU); suppliers not required to send; no domestic B2B or B2C mandate found; EU-wide cross-border step 1 Jul 2030 (ViDA). Vendor and advisory guides only (EU Commission summary, ecosio, Sovos, Zenolegal, e-invoice.app); TAD and the gazette unread. No Cypriot rules in the checker.
- Mexico CFDI page and RFC check, 2026-10-27 (`mexico-cfdi-e-invoice-mandate.html`, `mexico.mjs`, 6+8 tests, hub counts 40 pages, widget run in headless Chromium over http): CFDI as stamped XML via a SAT-authorised PAC, 4.0 requiring the customer's RFC, exact name, postal code and tax regime, cancellation by reason code; vendor blogs only (SAT and the Resolución Miscelánea Fiscal unread, sources disagree on the 3.3 to 4.0 dates, no penalty stated). RFC check digit (mod 11, weights 13 to 2, a company's RFC padded with a leading space) reproduces four RFCs I know (SAT970701NN3, GODE561231GR8, CACX7605101P8, XEXX010101000), not read from SAT's specification; generic XAXX010101000 and XEXX010101000 accepted by shape. Measured blind spot: 60 of 385 single-character substitutions in the first 11 characters of a sample RFC leave the digit unchanged (character values run to 37, mod 11), so a pass is not confirmation. Open: CFDI 4.0 XML reader and SAT catalogues from the published Anexo 20 / XSD, a real PAC rejection to compare, Brazil NF-e.
- Colombia and Chile pages with NIT and RUT check digits, 2026-10-27 (`colombia-dian-e-invoice-mandate.html`, `chile-sii-e-invoice-mandate.html`, `colombia.mjs`, `chile.mjs`, 9+5+7 tests, hub counts 43 pages, widgets run in headless Chromium over http). Colombia: UBL 2.1 XML validated by DIAN before delivery, 96-character CUFE, electronic documento soporte for purchases from non-invoicers. Chile: DTE numbered from SII-authorised folios (CAF), 8 calendar days to claim before a received invoice is presumed accepted. Search excerpts of vendor blogs, law-firm notes and SII PDFs only (page fetches were blocked here; DIAN annex, the laws and the CUFE hash unread; sources disagree on CAF validity and on the Chilean mandatory-from date, flagged on the page). Check digits (Colombia: mod 11, weights 3 to 71, remainder 0 or 1 is the digit; Chile: mod 11, weights 2 to 7, 10 is K) reproduce 4 numbers each that I know, including DIAN's 800.197.268-4 and the SII's 60.805.000-0; not read from the specifications. Measured: Chile's digit never misses one wrong digit or a swap (0 of 12,667 swaps); Colombia's misses 3,015 of 162,000 single-digit errors (1.9%) because remainders 1 and 10 both give 1, so only NITs ending in 1 hide them. Open: the DIAN technical annex, the CUFE hash, the SII DTE schema; Peru (SUNAT) and Argentina.
- Japan qualified-invoice page and T-number check, 2026-10-26 (`japan-invoice-system-e-invoice-mandate.html`, `japan.mjs`, 6+8 tests, hub counts 37 pages with Turkey, widget run in headless Chromium): T plus 13 digits; the corporate-number check digit (9 minus the weighted mod-9 sum) reproduces the tax agency's own number 7000012050002 only (one sample, formula from memory of the public rule, not the specification). Mod 9 cannot see a 0/9 swap (8 of 117 single-digit typos on the sample pass); an individual's number is not a corporate number, so a mismatch is worded as maybe-a-typo. Dates (80% to 30 Sep 2026, 50% to 30 Sep 2029) are from search excerpts of vendor pages; the 2026 reform revisions (rates, cap on large purchases from one unregistered seller) are unread and not applied. Open: the agency's specification for the check digit, the registrant web-API lookup, Peppol JP PINT rules.
- Turkey mandate page, 2026-10-26 (`turkey-e-invoice-mandate.html`, 8 tests, hub counts 37 pages with Turkey): e-Fatura at TRY 3 million gross sales (TRY 500,000 in listed sectors, some categories regardless), e-Arşiv for all other invoices since the TRY 3,000 threshold went on 1 Jan 2026; UBL-TR through GİB or a licensed integrator, so the checker has no rules for it and says so. Vendor and advisory excerpts only (communiqués and GİB unread; a 2027 simplified-method date and Communiqué 535 are single-source or unread). Open: UBL-TR rules from GİB's published schematron.
- Brazil NF-e page and CNPJ/CPF check, 2026-10-26 (`brazil-nfe-e-invoice-mandate.html`, `brazil.mjs`, 6+8 tests, hub counts 41 pages, widget run in headless Chromium over http): NF-e as XML authorised by SEFAZ before goods move; alphanumeric CNPJ for new registrations (NT 2025.001, schemas NT 2026.004 v1.01, production reported 1 Jul 2026; IBS/CBS layout NT 2025.002-RTC, production reported 3 Aug 2026). Sources are web-search excerpts only (the notice sites were unreachable through the proxy; Portal da NF-e unread; test-environment dates differ; production go-live not confirmed). Check digit (value = ASCII minus 48, weights 2 to 9 from the right, mod 11) reproduces 11.222.333/0001-81, 00.000.000/0001-91, 12.ABC.345/01DE-35 and CPF 111.444.777-35 as I know them, not read from the Receita Federal specification. Measured: a digit swapped for another digit is never missed (108 and 63 cases), but allowing letters 24 and 27 of 420 single-character substitutions leave both digits unchanged. Open: NFS-e, a real SEFAZ rejection (the NF-e 4.00 XML reader landed 2026-11-12, "Brazil: NF-e and NFC-e 4.00" above).
- Peru and Argentina pages with RUC and CUIT check digits, 2026-10-27 (`peru-sunat-e-invoice-mandate.html`, `argentina-arca-e-invoice-mandate.html`, `peru.mjs`, `argentina.mjs`, hub counts 45 pages). Peru: CPE through SEE-SOL (free per SUNAT), own system or OSE; factura to a buyer with a RUC. Argentina: CAE from ARCA (ex-AFIP) gives the invoice tax value; public invoice check. Both ID rules use weights 5,4,3,2,7,6,5,4,3,2 mod 11; pinned on SUNAT's RUC and the tax authority's CUIT (plus a second CUIT); 0 of 90 single-digit errors missed on each. Search excerpts only; resolutions unread, dates and exceptions flagged unsettled on the pages.
- Uruguay page with RUT check digit, 2026-10-27 (`uruguay-dgi-e-invoice-mandate.html`, `uruguay.mjs`, 4+8 tests, hub counts 46 pages). CFE in DGI's XML format, reportedly mandatory for all VAT taxpayers (a Dec 2023 KPMG bulletin and 2026 vendor guides, search excerpts; resolutions unread, legal basis cited inconsistently). RUT check digit: weights 4,3,2,9,8,7,6,5,4,3,2 over 11 digits, 11 - mod 11 (11 read as 0, 10 treated as no digit: sources do not say what DGI does). Pinned on ONE RUT (Antel's 21-100342-001-7, from a forum thread and a vendor validator, sum checked by hand); 0 of 99 single-digit errors missed. Open: DGI's specification for the digit and for 10, the CFE XSD.
- Paraguay page with RUC check digit, 2026-10-27 (`paraguay-dnit-e-invoice-mandate.html`, `paraguay.mjs`, 4+8 tests, hub counts 47 pages). SIFEN: electronic documents in DNIT's XML, phased in by group (press: 1 Jun 2026 to 1 Sep 2027 under RG 52; State suppliers from 2 Jan 2026; sources differ on that rule's resolution). Search excerpts only; the proxy blocked every page that could give a confirmed RUC. Check digit: weights 2,3,... from the right of the base, 11 - sum mod 11 (0 when the remainder is 0 or 1), as open-source implementations describe it; pinned on a HAND-COMPUTED 80016875-5, not a registered RUC. 0 of 72 single-digit errors missed on that base. Open: DNIT's own rule and a real RUC; Ecuador next.
- Spain B2B update, 2026-10-27 (`spain-verifactu-e-invoice-mandate.html`, hub row, index line): Order HAC/1028/2026 (BOE 5 Oct 2026, in force 6 Oct): B2B e-invoicing 6 Oct 2027 above 8 million euro turnover, 6 Oct 2028 for the rest; EN 16931 UBL via the public solution; private platforms send a copy. Read from search excerpts of EY, KPMG, Seeburger, Fiscal Solutions, peppol.nu and VATupdate; BOE unread. Verifactu postponement to Oct 2028 is reported by one outlet only, not adopted on the page.
- Ecuador page with RUC and clave de acceso check digits, 2026-10-27 (`ecuador-sri-e-invoice-mandate.html`, `ecuador.mjs`, 8+8 tests, hub counts 48 pages). SRI: electronic receipts as signed XML authorised by the tax authority, each with a 49-digit clave de acceso. Search excerpts of vendor guides and libraries only; the SRI technical sheet and resolutions are unread, so no dates or penalties are stated. RUC: third digit 0-5 modulo 10, 6 modulo 11 (weights 3,2,7,6,5,4,3,2), 9 modulo 11 (4,3,2,7,6,5,4,3,2), province 01-24 or 30; a recalled company RUC (1790010937001) and cédula (1710034065) fit it, unconfirmed with the SRI. Key: modulo 11, weights 2..7 from the right, 11 to 0, 10 to 1; pinned on a hand-built key (sum 490, digit 5), recomputed in Python. Every single-digit substitution in the key changes the digit (0 of 432 missed); the RUC-in-key is also tested. Fixed a stray Paraguay link in the Uruguay hub row. Measured 2026-10-27 (ecuador.test.mjs): in a 13-digit RUC the establishment digits sit outside the check, so 26 of 117 single-digit typos pass for a company (1790016919001) and 35 of 117 for a public body (1760001550001), against 0 of 90 in a 10-digit cédula; only a register lookup catches those.
- Vietnam page with tax code (MST) check digit, 2026-10-28 (`vietnam-e-invoice-mandate.html`, `vietnam.mjs`, 4+8 tests, hub counts 49 pages; the widget ran in headless Chromium over http with no page errors). Decree 123/2020 and Circular 78/2021 (compulsory 1 Jul 2022; coded C and uncoded K invoices) and Decree 70/2025 (from 1 Jun 2025: cash-register invoices for households at VND 1 billion or more), from web-search excerpts of secondary summaries only (the authority's site was unreachable; decree texts unread; no penalty amount found, so none stated). Check digit: weights 31,29,23,19,17,13,7,5,3, 10 - sum mod 11, none when the remainder is 0; reproduces python-stdnum's published example 0100233488 (and rejects its invalid twin 0100233480), not read from the authority's specification; 12-digit citizen IDs are length-only. 0 of 81 single-digit errors missed. Also fixed the hub's Uruguay row, which had gained a stray Paraguay link. Open: the authority's own rule, a registered MST, Vietnam's XML schema.
- Indonesia page with NPWP shape check, 2026-10-30 (`indonesia-coretax-e-invoice-mandate.html`, `indonesia.mjs`, 3+8 tests, hub counts 54 pages, every country page links to it; the full venture suite passes). Faktur pajak issued and approved in Coretax since 1 Jan 2025 (PMK 81/2024); NPWP 16 digits (NIK for citizens, 0 + old 15 digits for entities) from the tax authority's own article, as a search excerpt. pajak.go.id, DDTC and fiscal-requirements.com did not resolve from the cloud runner, so everything is from search excerpts; the PMK text is unread. Sources disagree on the 17-digit serial number, the upload deadline and the large-taxpayer transition; no penalty amount found, none stated. No check digit is claimed (none found), so the widget tests length only. Open: the PMK text, DJP's Coretax XML schema, a real NPWP check rule.

## How often a check digit misses a typo (2026-10-27)

`node eval/id-blindspots.mjs [N] [seed]` takes N seeded random IDs that pass each validator (Mexico RFC, Colombia NIT, Chile RUT, Brazil CNPJ plain and alphanumeric, Peru RUC, Argentina CUIT, Japan T-number), then tries every single-character substitution and every adjacent swap of two different characters. At 2,000 IDs per seed (seeds 7, 99, 12345), share of mistyped IDs that still pass: Chile 0% and Argentina 0% (substitution and swap); Brazil CNPJ 0.03 to 0.04% (swap 0.11 to 0.15%); Peru 1.3 to 1.4% (swap 1.7 to 2.0%); Colombia 1.4 to 1.8% (swap 1.5 to 2.1%); Japan 2.0 to 2.1% (swap 2.0 to 2.2%); Brazil alphanumeric CNPJ 5.9% (swap 5.7 to 6.1%); Mexico RFC 14.5% of substitutions (swaps 0%, the shape check catches them). Mexico's rate is stable across seeds because the name and homoclave letters take values up to 37 under mod 11. Synthetic IDs on rules pinned to a few known numbers, not read from the authorities' specifications; it says nothing about how often real people mistype. Test: `id-blindspots.test.mjs`. A pass is never confirmation that a number is registered.

## India INV-01 payload check (2026-10-30)

`india-inv01.mjs` (`checkInv01`, 4 tests) pre-checks an IRP INV-01 (version 1.1) JSON payload and names the field for each fault: required blocks, GSTIN shape and check character on seller and buyer, six-digit PIN, DD/MM/YYYY date, HSN length, GST slab, IGST versus CGST+SGST from seller state against place of supply, line arithmetic (Qty x UnitPrice, discount, tax, TotItemVal) and the ValDtls totals, with a one-rupee rounding tolerance. Field names, the slab list and the tolerance are from memory of the public schema and secondary guides; the IRP specification and JSON schema were not read, and no real IRP payload or rejection was run. Tests use a made-up consistent invoice. CLI (2026-10-30): `node india-cli.mjs payload.json [--json]` (exit 0 clean, 1 findings, 2 usage; examples `examples/india-inv01.json` and `-with-defects.json`, made up, tested in `india-inv01.test.mjs`). Page card (2026-10-30): the India page has a paste box that runs `checkInv01` in the browser (nothing sent); run in headless Chromium on both examples, clean and defective. Open: a real IRP sandbox payload, export/SEZ and e-way-bill blocks.

**Turkey (2026-10-30).** The Turkey page tests a VKN (10 digits) or TCKN (11 digits) by length and check digits (`turkey.mjs`). Rules are the widely published ones from open-source validators, not GİB's text; a pass is not a registry lookup. Wanted: a real VKN from a GİB-issued e-Fatura to confirm.

## Branded audit pack (built dark, 2026-11-03)

The monetization plan (`portfolio/monetization/models.yaml`) says checking a
document is a commodity (about $4 per 1,000 on API marketplaces, plus free
official validators), so checks are never charged for. What an accountant or
finance team lacks is the dated record of what was checked before sending.
`auditpack.mjs` turns a batch run (`preflightDocuments()` output) into one
printable document on their own letterhead: logo, name, contact, a verdict, a
row per file, findings grouped by rule with the fix, the findings per file,
unreadable files, their notes, and a fixed statement that a PASS is not a
declaration of legal validity. Typed text, file names and findings are
escaped; the logo is accepted only as a raster data: URL; the accent only as
`#rrggbb`.

It sits behind the same licence-key check as the sibling ventures' packs
(`licence.mjs`, `checkout.mjs`). `CHECKOUT_URL` is empty, so the card on
`index.html` stays hidden and nothing can be bought; `python3
portfolio/monetization/golive.py` sets the link once the owner has made the
merchant-of-record product. The validate call is written from memory of the
provider's docs and not run against a live product. Checked 2026-11-03:
`node --test auditpack.test.mjs` (5 tests, including that the committed
`sample-audit-pack.html` equals what `node build-sample-pack.mjs` makes), and
a headless-browser run with a stubbed checkout link and licence answer: card
shown, key accepted, pack opened with the typed title escaped, no console
errors. Marketing page: `audit-pack-for-accountants.html`.

## ISDOC detection (2026-11-03)

`looksLikeIsdoc` (`report.mjs`) matches the `http://isdoc.cz/namespace/2013` namespace; `preflightDocuments` then gives a read error naming the format and the fix instead of "UBL field TaxAmount is missing". `isdoc.test.mjs`, 3 tests, on a made-up stub; `report.test.mjs` and `page.test.mjs` still pass. The namespace string is from memory of the public ISDOC schema, not read here (cz hosts unreachable from the cloud runner). Open: an ISDOC reader and a real file.

**Update 2026-11-03 (later):** `isdoc.mjs` now reads ISDOC best-effort instead of only refusing it: header, parties, lines and totals map into the neutral invoice shape, so the arithmetic, date and VAT-shape checks run; the report's envelope says "best-effort, unverified". Element names are from memory of the public ISDOC 6.x schema, no real ISDOC file or the XSD was read (cz hosts unreachable), no Czech national rules, no payment block. `isdoc.test.mjs` (made-up file, one good and one wrong-total case, a non-ISDOC root falls back to the old message). A full-suite run has one failure that also fails on a clean checkout: "every other country page links to the Hungary page and back". Open: a real ISDOC file to confirm element names and the credit-note/document-type codes.
- Slovenia primary-source read, 2026-11-07 (`slovenia-e-invoice-mandate.html`, test tightened): uradni-list.si answered, so the ZIERDED text in Uradni list RS 85/2025 (item 3032) was read from the gazette PDF. Corrects the page: Article 28(1) applies the law from 1 Jan 2028 but Chapter 4 (e-route providers) from 1 Apr 2027, so the earlier "1 Apr 2027 not supported" note was wrong; Article 26 sets the provider list for 1 Oct 2027; Article 24 fines 1,000 to 3,000 euros (company), 500 to 1,500 (sole trader), 100 to 500 (responsible person), Article 25 consumer-invoice fines 500 to 1,500; no invoice-data reporting duty found. Implementing regulations (due within 12 months) and fu.gov.si pages still unread.
- Estonia primary-source read, 2026-11-07 (`estonia-e-invoice-mandate.html`): riigiteataja.ee is a JavaScript app, so the Accounting Act (Raamatupidamise seadus) was rendered in headless Chromium and read in Estonian. § 7¹ (3): the register is the commercial register (äriregister), not an "e-business register"; (7): a registered recipient may demand an e-invoice from the seller, EN 16931-1 is presumed proper, parties may agree another standard; (8) exceptions (security agencies, state secrets, professional secrecy); no penalty in the section; the 2024 amendment is RT I, 10.10.2024, 1, in force 1 Jul 2025. No 2027 e-invoice date is in the Act (the one 2027 date is large-company reporting), so the page now calls 2027 a policy target. Unread: the 2019 public-sector duty's basis beyond the transitional section, and any bill for a B2B mandate.

- Mexico RFC in the party VAT check, 2026-11-08 (`vat.mjs`, `vat.test.mjs`): an `MX`-prefixed identifier now runs `checkRfc` from `mexico.mjs` (shape, YYMMDD, mod-11 digit; generic XAXX/XEXX accepted), so a mistyped RFC raises INV-023 and a malformed one INV-022. The normaliser keeps `&` and `Ñ` only after an MX prefix. Same limits as the Mexico page: the digit rule is pinned to four RFCs I know, SAT's text unread, and 14.5% of single-character substitutions still pass (eval/id-blindspots.mjs).
- Ukraine EDRPOU check digit, 2026-11-09 (`vat.mjs` `uaEdrpouOk`, 1 test, 5 well-known published EDRPOUs pass and a one-digit change fails): weights 1..7 (7,1..6 for 30000000-60000000) mod 11, a remainder of 10 retries with weights plus 2, a second 10 means 0. Rule from memory of the public algorithm; tax service text unread. Ten-digit RNOKPP (sole traders) is shape-checked only. Open: the RNOKPP check, the ERPN tax-invoice rules.
- Guatemala NIT check character, 2026-11-09 (`vat.mjs` `gtNitOk`, 1 test): a `GT`-prefixed identifier now gets INV-022 for a bad shape and INV-023 for a wrong check character (weights n+1..2 over the base, check = (11 - s mod 11) mod 11, K for 10). Pinned on hand-computed numbers, not registered NITs; rule from open-source validators, SAT text unread (host unreachable). Open: a real NIT, and the FEL document rules.
- Dominican Republic RNC/cedula and Venezuela RIF check digits, 2026-11-09 (`vat.mjs` `doTaxIdOk`, `veRifOk`, 1 test): a `DO` id of 9 digits gets the RNC check (weights 7,9,8,6,5,4,3,2; 22 real RNCs that predate the rule are accepted), 11 digits the cedula Luhn test; a `VE` id (V, E, J, P or G, 8 digits, check digit) gets the SENIAT weights. INV-022 for shape, INV-023 for a wrong check. Checked against python-stdnum 2.2 on 900 seeded numbers (88 valid, all verdicts equal; 120 pinned in the test); rule source only, DGII and SENIAT text unread. Open: a real e-CF with RNC and a real Venezuelan invoice.
- Moldova IDNO check digit, 2026-11-09 (`vat.mjs` `mdIdnoOk`, `vat.test.mjs`): an `MD` id of 13 digits now gets INV-023 when the last digit is not the first twelve weighted 7,3,1 repeating, summed, mod 10; other lengths INV-022. Checked against python-stdnum 2.2 `md.idno` on 500 random numbers (46 valid, all verdicts equal; 3 pinned). Rule source only, State Tax Service text unread. Open: a real IDNO from an e-Factura file.
- Taiwan page MIG timing, 2026-11-10 (`taiwan-gui-e-invoice-mandate.html`): the "sources differ on MIG 4.0" line now says what the Ministry of Finance Turnkey manual v3.9 (Feb 2025) is reported to say: MIG 3.2.1 and 3.1.2 retired, MIG 4.1 fully used from 1 January 2026; MIG 4.0 acceptance after that is not stated. Read from a search summary of the manual, the PDF was not opened (einvoice.nat.gov.tw is not reachable from cloud runs). The Oman page's 1 April / 1 October 2027 dates were re-checked against search summaries of KPMG, Comarch, Sovos and Oman Observer pieces: they agree on the dates, but one says the Gazette text was not on the portal and the Tax Authority FAQ still shows the older four-phase schedule, which the page already says. No rules changed; page tests pass (8).
- Taiwan GUI and Thailand TIN check digits, 2026-11-09 (`vat.mjs` `twGuiOk`, `thTinOk`, 1 test): `TW` (8 digits, weights 1,2,1,2,1,2,4,1, digit sums, multiple of 5, with the seventh-digit-7 allowance) and `TH` (13 digits, weights 13..2, check = (11 - s mod 11) mod 10) party VAT ids now get INV-022 for a bad shape and INV-023 for a wrong check digit. Thai example 0105536112014 and Taiwan 04595257 are the shapes the open-source validators use; the Ministry of Finance and Revenue Department texts were not read. Open: a real GUI and TIN from an issued invoice.
- UAE TRN shape in the party VAT check, 2026-11-09 (`vat.mjs`, `vat.test.mjs`): an `AE`-prefixed identifier must be 15 digits, else INV-022. Shape only: no public check digit is known, so a typo that keeps 15 digits passes. FTA text unread; 1 test on made-up numbers.
- Singapore GST/UEN and Philippines TIN shapes in the party VAT check, 2026-11-09 (`vat.mjs`, `vat.test.mjs`): an `SG` identifier must match a GST number or UEN shape, a `PH` one 9 or 12 digits, else INV-022. Shape only, no check digit; IRAS and BIR text unread; tests on made-up numbers.
- Malaysia LHDN TIN shape in the party VAT check, 2026-11-09 (`vat.mjs`, `vat.test.mjs`): an `MY` identifier must be a known prefix (C, IG, OG, SG, D, F, PT, TA, TC, TN, TR, TP, J, LE, CS) and 8 to 11 digits, else INV-022. Shape only; LHDN text unread; tests on made-up numbers.
- Tax-id shape checks for MA (ICE, 15 digits), AZ (VOEN, 10), UZ (INN, 9), MD (IDNO, 13), GE (9 or 11), AM (8), TZ (9), UG (10), ZM (10) and RW (9), 2026-11-09 (`vat.mjs`, `vat.test.mjs`): a wrong length or a letter is INV-022. Shape only; authority texts unread; tests on made-up numbers.
- Russia INN, Canada BN and Dominican RNC check digits, 2026-11-09 (`vat.mjs` `ruInnOk`, `doRncOk`, Luhn for the BN's first nine digits; `vat.test.mjs`, 1 test): an `RU` id of 10 or 12 digits gets INV-023 when the control digit(s) fail (7707083893 and 500100732259 pass, a last-digit change fails); `CA` accepts nine digits with an optional `RT0001`-style program account and Luhn-checks the nine; `DO` is nine digits, weights 7,9,8,6,5,4,3,2. Rules from memory of the public algorithms; CRA, FNS and DGII texts unread, so only the Russian pair are known real numbers. Open: a real invoice from each country.
- Tunisia MF shape in the party VAT check, 2026-11-09 (`vat.mjs` `tnMfShapeOk`, `vat.test.mjs`): a `TN` identifier must be 7 digits and a control letter (not I, O or U), optionally followed by a VAT code (A, P, B, D, N), a category code (M, P, C, N, E) and a 3-digit branch number that is 000 unless the category is E, else INV-022. Structure from python-stdnum `tn.mf`; the control letter's own rule is not published there, so it is not checked, and the Tunisian tax text is unread. Not tested on a real MF.
- Morocco ICE, Montenegro PIB and North Macedonia EDB check digits, 2026-11-10 (`vat.mjs` `maIceOk`, `mePibOk`, `mkEdbOk`, `vat.test.mjs`): wrong control digit INV-023, wrong shape INV-022. Rules from python-stdnum 2.2; 3,000 random numbers per country agree with it (9,000 verdicts, 597 valid, 0 mismatches), docstring vectors pinned. Authority texts unread. Ukraine's RNOKPP check landed 2026-11-10 too.
- Senegal NINEA, Ghana TIN, El Salvador NIT check digits and Algeria NIF shape, 2026-11-10 (`vat.mjs` `snNineaOk`, `ghTinOk`, `svNitOk`, `vat.test.mjs`): wrong control digit INV-023, wrong shape INV-022 (these countries were unknown before). Rules from python-stdnum 2.2; 21,000 random numbers agree (0 mismatches). Authority texts unread. Full-suite run: one unrelated failure, the Hungary page does not link the Ethiopia page, fails on main too.
- Mozambique NUIT check digit and Costa Rica tax-id shape, 2026-11-10 (`vat.mjs` `mzNuitOk`, `vat.test.mjs`): `MZ` 9 digits with weights 8,9,4,5,6,7,8,9 mod 11 gets INV-023 on a wrong check digit; `CR` 9 to 12 digits, else INV-022 (shape only). Rules from python-stdnum 2.2; 4,000 random NUITs agree (0 mismatches). Authority texts unread.
- Singapore UEN check letters, 2026-11-10 (`vat.mjs` `sgUenOk`, `vat.test.mjs`): the three UEN forms (8 digits + letter, 9 digits + letter, R/S/T + 2 digits + entity type + 4 digits + letter) get INV-023 when the check letter fails; GST numbers starting with M stay shape-only. Rules from python-stdnum `sg.uen`; 3,000 random UENs agree with it (119 valid, 0 mismatches); ACRA's text unread. The old test's made-up `SG200812345K` was not a valid UEN and was replaced with the library's documented examples. Full venture suite: 1,324 pass, 1 fails (Hungary page cross-link test, fails the same on the untouched tree, not looked into).
- Andorra NRT, Guinea NIFp, Liechtenstein PEID and San Marino COE, 2026-11-10 (`vat.mjs` `adNrtShapeOk`, `vat.test.mjs`): Guinea gets INV-023 on a failed Luhn digit; Andorra checks letter, six digits, letter and the published component ranges (control letter unchecked); Liechtenstein and San Marino are shape only; wrong shape INV-022 (these were unknown before). Rules from python-stdnum 2.2; 3,000 random Guinea numbers agree (326 valid, 0 mismatches). Authority texts unread.
- Hungary page cross-link fix, 2026-11-10: the Hungary mandate page now links the Ethiopia page, so the long-reported failing cross-link test passes; full suite 1,326 pass, 0 fail.
- Faroe Islands V-number shape, 2026-11-10 (`vat.mjs`, `vat.test.mjs`): `FO` plus 6 digits, else INV-022. Rule from python-stdnum 2.2 `fo.vn`.
- Half-cent VAT rounding fix and generated-XML fuzz, 2026-11-10 (`eval/generated-xml-fuzz.mjs`, `checks.mjs`, `breakdown.mjs`, `linenet.mjs`, `adjustment.mjs`, 2 tests): `x * 100 + Number.EPSILON` rounded 0.285 (1.50 at 19%) down, so INV-038 and INV-018 rejected correct invoices when a rate group's VAT fell on a half cent (7 of 20,000 single-line amounts per sweep, ~1 in 150 random drafts). Rounding now goes through `toPrecision(12)`. After: 0 findings on 1,500 random generated drafts (3 seeds, UBL and CII), +1.00 on gross and due caught every time. Not fixed: `repair-ubl.mjs`, `fa3.mjs`, `fatturapa.mjs` use plain `Math.round(n * 100)`. Made-up invoices only.

## VAT differential vs python-stdnum (2026-11-10, 2026-11-11)

`python3 eval/vat-differential.py | node eval/vat-differential.mjs` draws random numbers python-stdnum accepts per country and lists those `vat.mjs` flags (false rejects); `eval/vat-differential-reverse.{py,mjs}` does the reverse (numbers `vat.mjs` passes that stdnum rejects). Needs `pip install python-stdnum` (2.2 used); stdnum is an oracle, no authority text was read. 2026-11-11 results: the false-accept direction found letters passing in the digit-only shape-only countries (BG, CZ, EE, EL, HR, HU, LT, LV, MT, RO, SI, SK, XI; e.g. CZA97957793, 8,000 of 19,587 random CZ strings) and a leading 0 in DK and PT numbers; fixed in both ports (Cyprus stays eight digits and a letter). Remaining differences are deliberate or unproven: EE not starting 1 and SK third digit outside 2,3,4,7,8,9 are flagged where stdnum is lenient (stdnum also accepts a Slovak birth number); ES P/Q/R/S/N/W take a letter control (stdnum accepts either); CO needs 8 to 10 digits before the check digit (stdnum takes 7); EL with 8 digits (stdnum pads a zero). **Prefix rules closed (2026-11-10 run, same oracle, no authority text read):** BE 10-digit numbers must start 0 or 1; IT office code (digits 8-10) 001-100, 120, 121, 888 or 999 and a non-zero first seven; RO leading zero rejected; CZ 9-digit birth numbers (before 1954) need a real date and a year no later than 1953; LV natural-person numbers (first digit 0-3) need a real ddmmyy plus century digit and the personal-code check digit, `32...` codes only the check digit (that check digit is unconfirmed even in stdnum). Reverse run, 20,000 per country: BE, CZ, IT, LV, RO now 0 stdnum-invalid numbers pass; forward run still finds no false rejects beyond the deliberate list above. FR letter keys are closed (see below). TR rare cases settled (2026-11-10 run): of 18,973 random 10 or 11 digit strings that stdnum's `tr.vat` (VKN only) rejects, 84 pass here and all 84 are 11 digits satisfying the T.C. Kimlik check (individuals trade under their TCKN, which stdnum's VAT module does not cover); no 10-digit VKN differs either way, 0 false rejects. Deliberate; no GIB text read.

## French TVA letter keys and SIREN Luhn (2026-11-12)

`vat.mjs` `frOk` and the Python port `_fr` now accept the letter-key form of French TVA numbers (alphabet without I and O; digit+letter and letter+digit formulas) and check the SIREN's Luhn digit unless it starts 000 (Monaco). Before, any letter key passed unchecked, 2,379 of 19,980 random FR strings passed where python-stdnum 2.2 rejected. `eval/vat-differential-fr.{py,mjs}`: 39,986 random numbers (5,506 valid per stdnum), 0 false rejects, 0 false accepts (keys starting `FR` are skipped: stdnum strips a leading FR twice). Tests: `vat.test.mjs`, `tests/test_vat.py`; venture suite 1,348 pass. Authority text unread. Note: the half-cent rounding gap listed above for `repair-*`, `fa3`, `fatturapa` was already closed (they use `roundHalfUpToCents`). TR rare cases: deliberate TCKN acceptance, see above.

## IBAN structure and national check digits vs python-stdnum (2026-11-10)

`iban.mjs` only checked length and mod-97. `eval/iban-differential.py 7 300 | node eval/iban-differential.mjs` (python-stdnum 2.2 as oracle, no SWIFT text read) draws IBANs for all 89 registry countries: 27,001 stdnum-valid ones all passed, but **26,399 of 26,399 stdnum-invalid ones with the right length and a correct mod-97 also passed** (letters where digits belong, etc.), and 15 registry countries (BI, DJ, FK, HN, MN, NI, OM, RU, SC, SD, SO, ST, SV, TL, YE) were unknown. Now `BBAN_FORMATS` carries the registry's per-country structure (wrong structure is INV-024), the 15 countries are known, and BE, ES, ME, NO national check digits fail as INV-025. Re-run, seeds 7 and 11, 400 per kind: 0 false rejects, 1 false accept in 70,000 (BE: stdnum also requires the bank code to be in its Belgian bank list, which we do not carry). Tests in `iban.test.mjs`; venture suite 1,349 pass, 0 fail.

## Malawi and Namibia pages (2026-11-10)

`malawi-mra-eis-e-invoice-mandate.html` and `namibia-namra-e-invoice-mandate.html` (2 test files), wired into the hub table (93 rows), index, sitemap, Hungary cross-links and `mandate-dates.json`/`.ics` (regenerated). Written from web-search summaries only (Edicom, Shared Services Link, VATupdate, e-invoice.app, KPMG, Comarch); no MRA, NamRA or Ministry notice read. Malawi's mandatory date is shown as disputed (1 May 2026 vs 1 Feb 2026); Namibia is `Planned, no binding date`. Open: the MRA public notices of 4 Nov 2025 and 30 Jan 2026, and any 2026 MRA notice settling the date. Venture suite: 1,365 pass, 0 fail.

## A line's own TaxTotal is not the document's (2026-11-12)

The UBL reader (`ubl.mjs`, and `src/einvoice_preflight/ubl.py` to match) took every `TaxSubtotal` in the file as a row of the document's tax breakdown (BG-23) and added every `TaxTotal` to the document tax (BT-110). ZATCA invoices carry a `TaxTotal` on each line (KSA-11/12), a prepayment-deduction line puts the advance's subtotal at its own rate inside it (KSA-31/32), and a SAR invoice repeats BT-110 as BT-111 in SAR with no subtotal. So every one of ZATCA's 19 good-case examples drew INV-017 and INV-018, and the three prepayment examples INV-038 ("repeats the same tax percentage", or, at a changed rate, "row 2 taxable amount"). The report had papered over this by dropping those three ids whenever a ZATCA set governed, which also hid real tax-arithmetic faults on KSA files.

Now the reader takes only the `TaxTotal` elements that are children of the root (falling back to all of them only when none is), and when several are in the document currency and some carry subtotals, the subtotal-less one is the BT-111 repeat and is left out. A tax per scheme (several `TaxTotal`s that each carry subtotals) is still summed. The breakdown check also stops asking for a row for a rate whose lines net to zero, the mirror of the zero row with no line it already accepted: the prepayment line has quantity 0 and net 0.00 at the old 5%, and SimplerInvoicing's `SI-UBL-2.0_ok_full.xml` has a 21% charge and allowance that cancel. INV-017, INV-018 and INV-038 now run on KSA files.

Measured with `eval/phive-corpus.mjs --good` on phive-rules commit dfa902d, before and after: ZATCA 18 to **19 of 19** with no blocking finding, with the three drops removed; SimplerInvoicing loses 3 INV-038 and 1 INV-017/018 that were also false (the `UBL-CR-561_warning` file is SimplerInvoicing's example of a line-level `TaxTotal`, a warning-only good case, whose 6.00 the old reader added to the tax); every other set unchanged. Tests: `line-taxtotal.test.mjs` (7) and `tests/test_line_taxtotal.py` (4), on a made-up prepayment-at-the-old-rate invoice, `examples/zatca-prepayment-rate-change.xml`, which passes ZATCA's own rules (only the 24-hour clock rule fires) and on which the old reader raised INV-017, INV-018 and INV-038. Not done: no real ZATCA sandbox invoice or Fatoora verdict. (`repair-ubl.mjs` used to count line-level `TaxTotal`s and decline the tax part on ZATCA files; fixed later on 2026-11-12, see "Repair a UBL file".)

## CIUS-RO runs on EN 16931 1.3.8 (2026-11-12)

Romania's rules are not checked against today's EU base. phive-rules registers CIUS-RO 1.0.9 as `basedOn` EN 16931 validation **1.3.8** (`CIUS_ROValidation.java`, phive-rules commit dfa902d), and ANAF's own bundled `EN16931-CIUS_RO-UBL-validation.xslt` in the same artefact carries no UBL-SR-51..59. Those nine rules arrived in validation 1.3.14 (read from the `validation-1.3.11` to `1.3.17` branches of eInvoicing-EN16931: absent through 1.3.13, present from 1.3.14). The earlier README line said later releases *drop* UBL-SR-53; that was backwards.

The rule matters on ANAF's own files: UBL-SR-53 (`exists(cac:TaxScheme/cbc:ID) and exists(cbc:CompanyID)` on every `PartyTaxScheme`) fails a buyer that is not VAT registered, whose CUI sits in a `PartyTaxScheme` with an empty `TaxScheme`, the shape CIUS-RO asks for. So a valid Romanian invoice got a blocking finding from a rule its receiver never runs.

What changed:

- `plain/en16931-1.3.8-ubl.json` (977 checks) compiled from tag `validation-1.3.8` (commit 0cabbbf) by `build-plain-rules.mjs`, beside the current base (982). Against it the current base adds UBL-SR-51..59, lacks BR-CO-25, BR-66, BR-67 and UBL-CR-631, and words 44 other tests differently.
- An add-on may name the base release it sits on (`ADDONS["cius-ro"].base` in `schematron-core.mjs`); the plain route (page and Node) runs that base under it and reports the set as `en16931-1.3.8`. A copy without the file falls back to the current base.
- The report (CLI and server API) sends files that carry a national add-on (CIUS-RO, CIUS-PT, NLCIUS) to the plain route even when the Saxon files are built. Before, a self-hosted server with Saxon checked a Romanian file against the current EU base alone, with none of the 122 Romanian checks, since those sets have no Saxon form.

Measured with `eval/phive-corpus.mjs --good --set cius-ro/1.0.9` on ANAF's 10 good cases: UBL-SR-53 on 4 files before, 0 after; the 1.3.8 base raises no new official finding, so the official rule sets now pass all 10. What remains on them is built-in INV checks already read as faults in the examples (the 13-digit seller id, line nets that are not quantity times price) or not yet read (INV-025/027 on example0's Danish IBAN with a mismatched BIC, INV-041, INV-046, INV-051). Tests: `cius-ro-base.test.mjs` (4). Not done: the Saxon route (and the page's optional `./browser/` Saxon build) still has no 1.3.8 base; it no longer sees Romanian files from the report, but a direct `runSchematron` call does. No real ANAF-accepted invoice from a business has been run.
