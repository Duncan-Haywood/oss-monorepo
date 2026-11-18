# The creator writes Croatia's out-of-scope labels, and document-level charges (2026-11-14)

**Question.** The HR creator (earlier the same day) refused nothing a Croatian business needs
for an ordinary invoice except one thing: amounts *outside the VAT base*. A refundable bottle
deposit (HR:POVNAK), consumption tax on drinks (HR:PP), the special tax on a car sold or leased
(HR:PPMV) and other non-taxable fees such as the tourist tax (HR:N) are everyday lines on
Croatian invoices, and the creator could not write them. Three of the authority's eight sample
eRačuni carry them as *document-level charges*, which the creator could not write in any profile.

**How the authority writes them** (read from the Porezna uprava's samples, mirrored at
github.com/shunkica/fiskalizacija2 `docs/Primjeri_eRacuna`; not copied here):

| label | EN layer | HR breakdown (HRFISK20Data) | HR tax scheme |
|---|---|---|---|
| HR:POVNAK | E, 0 %, reason `#HR:POVNAK#Povratna naknada` | O, Name HR:POVNAK, 0 % | OTH |
| HR:PP | E, 0 %, reason `#HR:PP#Porez na potrošnju` | O, Name HR:PP | LOC |
| HR:PPMV | E, 0 %, reason `#HR:PPMV#Posebni porez na motorna vozila` | O, Name HR:PPMV | CAR |
| HR:N | E, 0 %, reason `#HR:N#<fee>` | O, Name HR:N | VAT |

The amount goes to `OutOfScopeOfVATAmount` (HR-BR-32) and is taken out of the HR tax base
(HR-BR-27). On a charge, the charge's TaxCategory carries the label as Name (HR-BR-11) and the
reason (HR-BR-13); the AllowanceChargeReason is `#HR:<label>#<text>`.

**What was built.** `hr_label` on a line or a charge (`generate.mjs`), and `allowances` /
`charges` lists for every profile, UBL and CII (EN 16931 BG-20, BG-21), counted in their VAT
rows (BR-S-08 and the like) and in the totals (BT-107, BT-108, BT-109). `create.html` has a
table for them and an HR label column on lines; the Factur-X page prints them.

**Results** (`node eval/hr-out-of-scope-creator.mjs hr.sef.json`; SEF built from the 1.0.4
XSLT in phive-rules-eracun 4.6.4, as in `eval/hr-cius-differential.mjs`):

| case (sample rebuilt) | sample's amount due | creator's | plain HR | Saxon HR | EN base fatal |
|---|---|---|---|---|---|
| deposit line (`..._POVRATNA_NAKNADA_stavka`) | 130.00 | 130.00 | none | none | none |
| deposit charge (`..._POVRATNA_NAKNADA_trosak`) | 130.00 | 130.00 | none | none | none |
| PP charge (`eRacun_PDV_NEOP_PP_trosak`) | 128.00 | 128.00 | none | none | none |
| PPMV charge (`Racun_za_leasing_PDV_PPMV_aktivacija`) | 14500.00 | 14500.00 | none | none | none |
| tourist tax, HR:N (`eRacun_PDV25_i_Neoporeziva_naknada_trosak`) | 135.00 | 135.00 | none | none | none |
| HR:E line + deposit + PP + 25 % delivery + discount | - | 275.78 | none | none | none |
| 25 % delivery + discount | - | 122.50 | none | none | none |

The generated PP and deposit files differ from the authority's only in `0` vs `0.00` for a
percent and the sample's optional `MultiplierFactorNumeric`/`BaseAmount` on the PP charge
(compared element by element on the extension, charges, tax total and monetary total).

**Are the rules looking?** Six edits on each generated file (34 edits that changed a file):
one euro more out of scope, one euro more HR tax base, the charge's label removed, the charge's
exemption reason removed, tax on an O row, an unknown label. The plain route and the
authority's XSLT under Saxon name the same rule ids on **34 of 34** (HR-BR-27/-32, -27, -11,
-13, -28/-29/-54, -CL-1). On the mixed file tax on one O row raises HR-BR-28 and -54 but not
HR-BR-29 under both engines: the authority's HR-BR-29 compares a sequence of TaxAmounts with
`= 0`, which XPath reads as "any is 0", so it only fires when every row is taxed.

**Every profile.** A 19 % discount and a 7 % shipping charge on a German invoice, XRechnung,
Peppol and EN 16931, UBL and CII: no fatal on the plain route (EN base plus XRechnung or Peppol
sets), the built-in checks find nothing, and the read-back totals match (net 284.89, VAT 41.54,
due 326.43). Tests: `generate-charges.test.mjs` (15).

**Not done.** No real Croatian business invoice with a deposit or PP has been seen; nor a
receiver's verdict. An HR:E line and an out-of-scope amount share the one EN E row that
BR-E-01 allows, with their reasons joined by "; " (both engines accept it; no sample shows
the case). Labels on allowances (a returned deposit) are refused: HR-BR-30 lists lines and
charges only. Percent-based allowances (`MultiplierFactorNumeric`, `BaseAmount`), reason codes,
line-level allowances and charges, cash accounting and a non-EUR invoice's EUR VAT total are
not written.
