# The Porezna uprava's own sample eRačuni, run through the checker (2026-11-14)

**Question.** The HR-CIUS add-on (2026-11-14, `eval/hr-cius-differential-2026-11-14.md`) had only
been tried on our own made-up invoice and edited copies of it. How does it do on Croatian
invoices the tax authority itself wrote?

**Files.** The eight "Primjeri eRačuna" published with the Fiskalizacija 2.0 documentation on
porezna.gov.hr, as mirrored at github.com/shunkica/fiskalizacija2 `docs/Primjeri_eRacuna`
("Dokumentacija i primjeri preuzeti sa službenih izvora"): exempt (`Oslobodjeno_PDV`), seller
outside the VAT system (`Nije_u_sustavu_PDV`), 25 % with cash accounting (`PDV25_Obracun_PDV_po_naplati`),
25 % plus an out-of-scope fee as a charge (`PDV25_i_Neoporeziva_naknada_trosak`), refundable
deposit as a line and as a charge (`POVRATNA_NAKNADA_stavka`, `_trosak`), `PP` charge
(`PDV_NEOP_PP_trosak`) and a leasing invoice with PPMV (`Racun_za_leasing_PDV_PPMV_aktivacija`).
Not committed here (we name the source rather than copy the files); fetch them and run
`node eval/hr-official-samples.mjs <dir> [hr.sef.json]` (Saxon side: see the header of
`eval/hr-cius-differential.mjs` for the SEF).

**Two runs per file.** As published, and with the placeholders made current: issue, due and
delivery dates moved from 2025 into 2026, and the OIB `12345678901` (whose check digit is
wrong) replaced by `12345678903`.

| | plain route | Saxon-JS on the authority's XSLT |
|---|---|---|
| As published (8 files) | HR-BR-40, -53, -9 on all 8; HR-BR-25 also on the leasing file | identical on all 8 |
| Placeholders fixed (8 files) | 7 clean; leasing file: HR-BR-25 only | identical on all 8 |
| EN 16931 base fatals | none on any of the 16 | (not run) |

- **16 of 16 runs agree** with the authority's own stylesheet, rule id for rule id, and the plain
  route skipped no rule on any file.
- **What fires is real.** The samples are dated 2025-12-01 (HR-BR-40 requires 2026 or later),
  and the seller and operator OIB `12345678901` fails the ISO 7064 MOD 11,10 check
  (HR-BR-53, HR-BR-9). The leasing invoice (type 394) has no KPD class on its line, and HR-BR-25
  only lets advance invoices and credit notes go without one. So the authority's own leasing
  sample fails the authority's own rules; we report it, and so does its XSLT.
- **Warnings.** Every file draws the EN base's UBL-CR warnings for elements outside the EN core
  (UBL-CR-001, -006, -200, -597, and -477, -481, -601 where present). Each of those already
  carries our "Keep it: ... Croatia's rules require ..." fix. UBL-CR-681 (PaymentMeans
  InstructionNote, "Opis plaćanja") also fires on all eight. No HR rule requires it, so it keeps
  the generic fix: it is a warning, the file is not rejected for it.

**The creator.** The same session added an `hr` profile to the invoice creator
(`generate.mjs`, `create.html`), which writes HRFISK20Data when a line is exempt (HR-BR-26).
Its element order follows `HRExtensionAggregateComponents-1.xsd` (as shipped in ph-ubl's
`ph-ubl-hr`) and the authority's samples. Generated S (25 % + 5 %), S + E, E only, Z, AE, 13 %, K and credit-note
files ran through both engines: no HR rule fired on any of them under either engine, and the
EN base reported no fatal (the K file's BR-IC-11/-12 were a creator bug, fixed the same day;
see the README). Tests: `generate-hr.test.mjs`.

**Not done.** These are the authority's samples, not a business's invoices; no access point
or Porezna uprava verdict on a real file has been seen. The creator does not write the
out-of-scope labels (HR:POVNAK, HR:PP, HR:PPMV, HR:N), whose EN category is E or S while the
HR breakdown says O, cash accounting (HRObracunPDVPoNaplati), document-level charges or a
non-EUR invoice's VAT total in EUR.
