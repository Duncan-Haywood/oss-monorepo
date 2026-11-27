# Mandate texts read: Pakistan, Nigeria, Jordan, Thailand (2026-11-14, latest)

The flagship row listed the Nigeria, Thailand, Pakistan and Jordan pages as
written from excerpts. This run looked for each authority's own texts and
rewrote the pages from what it found. What was read, what was not, and why.

| Host | Answer from the runner | Used |
|---|---|---|
| download1.fbr.gov.pk (Pakistan, FBR document host) | 200, PDFs | S.R.O. 69(I)/2025, S.R.O. 1413(I)/2025, STGO 01 of 2026 |
| www.fbr.gov.pk SRO search | HTML 200, its AJAX list rejects plain posts; in Chromium the WAF serves "Web Page Blocked" | no |
| einvoice.nrs.gov.ng (Nigeria MBS portal) | 200 in Chromium (client-rendered) | Standards Adopted page, three updates of 13 Dec 2025 |
| www.nrs.gov.ng / nrs.gov.ng | Radware CAPTCHA in Chromium | no; not worked around |
| kpmg.com (KPMG Nigeria flash, 18 Feb 2026) | 200, PDF | rollout table as reproduced (secondary) |
| www.istd.gov.jo (Jordan ISTD) | 200 | consolidated Regulation No. 34 of 2019 (2023), Instructions No. 1 of 2019 |
| www.rd.go.th (Thailand Revenue Department) | 200 for /fileadmin PDFs; home page 302 to an error page | Notification of 7 June 2023; DG Notification No. 470 |
| ratchakitcha.soc.go.th (Royal Gazette) | 403 | no (the RD PDFs are Gazette copies with page headers) |

## Pakistan

**S.R.O. 69(I)/2025, 29 January 2025** (under s. 50 of the Sales Tax Act 1990,
with s. 3(9A), 22, 23 and 40C): substitutes Chapter XIV of the Sales Tax Rules
2006, "Procedure for licensing, issuance of electronic sales tax invoices and
integration of registered persons".

- 150Q: applies to registered persons the Board notifies in the official Gazette;
  persons already integrated at the point of sale count as integrated.
- 150R(3): no supply except through integrated outlets, points of sale or machines.
- 150R(4): the system generates, records and stores invoice data; issues the
  invoice in the prescribed format with a digital signature; transmits it and
  receives "the unique FBR invoice number"; prints a QR code built on it; closes
  day, week and month; logs every adjustment, modification or cancellation.
- 150R(9): exempt supplies are invoiced through the integrated system too.
- 150R(13): 26 particulars, (a) FBR invoice number `XXXXXX-DDMMYYHHMMSS-0001`,
  (b) QR code 7x7 mm, ... (x) HS code, (y) unit of measurement, (z) SRO and serial
  number; (s), (t), (u) and (z) may not apply to a retailer selling to the public
  (other than a manufacturer- or importer-cum-retailer).
- 150S: an invoice for every taxable supply, kept six years; debit and credit
  notes issued electronically through the integrated system.
- 150V: the Commissioner may extend integration by up to sixty days in aggregate,
  at fifteen-day intervals; paper invoices continue meanwhile.
- 150X: contravention draws the penalty under section 33 of the Act.
- 150XC: invoices issued during a software, internet or power failure are marked
  offline and uploaded within 24 hours of restoration.
- 150XE, 150XF: only a licensed integrator may integrate; PRAL acts as one free of
  cost. 150XJ(2): a licence is valid five years.

**S.R.O. 1413(I)/2025, 1 August 2025** (s. 50 with rule 150Q(2); "in supersession
of Notification No. S.R.O. 709(I)/2025, dated the 22nd April, 2025"): all sales tax
registered persons, by category, complete registration and testing through a
licensed integrator or PRAL and issue electronic invoices by:

| Category | Registration | Testing | E-invoices |
|---|---|---|---|
| All public companies | 10 Aug 2025 | 25 Aug 2025 | 1 Sep 2025 |
| Other companies, turnover > PKR 1 billion (last 12 months' returns) | 10 Aug 2025 | 25 Aug 2025 | 1 Sep 2025 |
| All importers | 10 Aug 2025 | 25 Aug 2025 | 1 Sep 2025 |
| Other companies, > PKR 100 million to 1 billion | 10 Sep 2025 | 30 Sep 2025 | 1 Oct 2025 |
| Other companies, up to PKR 100 million | 10 Oct 2025 | 30 Oct 2025 | 1 Nov 2025 |
| Individuals and AOPs, > PKR 100 million | 10 Sep 2025 | 30 Sep 2025 | 1 Oct 2025 |
| Registered persons not listed above | 10 Nov 2025 | 30 Nov 2025 | 1 Dec 2025 |

**Sales Tax General Order 01 of 2026, 30 March 2026** (citing s. 23(5) and (6)
of the Act and S.R.O. 1413): a registered person may engage one or more licensed
integrators; a valid invoice issued by bona fide mistake may be cancelled, deleted
or edited through the Board's system within 72 hours of generation, after that
only with the Commissioner's prior approval.

Not read: S.R.O. 1852(I)/2025 of 24 September 2025, reported by Dawn, Business
Recorder and vendors to move the dates (to 1 Nov 2025 for the first group and
31 Dec 2025 for the last). Its PDF was not found on download1.fbr.gov.pk by
search, and the FBR's SRO list is behind a WAF. The page keeps it as reported.
Also not read: section 33's penalty amounts, the PRAL Digital Invoicing API
document. Corrected on the page: "Tier-1 retailers first" (the rules now cover
all registered persons), "Rules 150ZEA and 150ZQZQ" (not the rules in force), and
the "60 percent input tax cut" (not in the rules read; now said so).

## Nigeria

Read on einvoice.nrs.gov.ng, rendered in Chromium:

- **Standards Adopted**: ISO 27001:2022, ISO 20022 (financial messaging), UBL
  ("standardizes the structure of invoices, credit notes, and other business
  documents"), GDPR and NDPA, NTP timestamping, elliptic-curve cryptography, PKI.
  Peppol is not named.
- **Updates, release date 13 December 2025**: direct fiscalization reporting for
  self-integrating taxpayers with their own keys ("Report Host"), beside
  APP-enabled reporting; new `invoice_kind` field (B2B, B2G, B2C); state and local
  government fields under the accounting parties; a B2B buyer with no TIN may be
  identified by incorporation number in the TIN field, format `RN-847789`; export
  customers keep their home-country identifiers.

Not read: the NRS public notice of 16/17 February 2026 (nrs.gov.ng news pages
answered with a Radware CAPTCHA; not worked around) and the July 2026 notice. The
rollout table on the page is the one KPMG Nigeria's flash of 18 February 2026
reproduces: Large (> NGN 5 billion): engagement, pilot and go-live completed,
post go-live review Jan to Mar 2026, enforcement Apr to Jun 2026; Medium (NGN 1 to
5 billion): engagement Jan to Mar 2026, pilot Apr to Jun 2026, go-live 1 July 2026,
review Oct to Nov 2026, enforcement Jan to Mar 2027; Emerging (< NGN 1 billion):
the same a year later (go-live 1 July 2027, enforcement Jan to Mar 2028). KPMG
also says the rollout "commenced in November 2025 for large taxpayers". The
31 July 2026 large-taxpayer deadline is from press reports (ThisDay, Guardian).
Corrected on the page: "Peppol-aligned; format not confirmed" (the portal names
UBL and not Peppol), and the 2027/2028 waves are now dated.

## Jordan

Read on istd.gov.jo ("نظام الفوترة الوطني" page), two PDFs whose text layer is
in a legacy Arabic font encoding, so read from page images:

**Regulation No. 34 of 2019, Regulation on Organising Invoicing Affairs and
Control, and its amendments** (consolidation dated April 2023), issued under
Article 23(f) of Income Tax Law No. 34 of 2014. Footnote: original in Official
Gazette 5572 of 1 May 2019, amended by Regulation No. 13 of 2023, Gazette 5851 of
16 April 2023. Art. 1: in force 60 days after publication.

- Art. 4(a): for the regulation, the electronic invoice issued from the national
  electronic invoicing program, or from a program linked to it, is adopted.
  4(b): the Department issues and organises invoices through the program or
  direct linking "according to the timetable prepared for this purpose".
- Art. 5(a): every seller of goods or services worth not less than one dinar
  issues an invoice of at least two copies: serial number; seller's full name and
  address; seller's tax number if registered for sales tax, national number if
  not; date; type, quantity, value of the goods or service and the invoice total.
  5(b): the buyer's name on deferred, instalment or part-payment sales. 5(c)(2):
  above JOD 10,000 the seller proves the buyer received it. 5(d): issued when the
  sale occurs.
- Art. 7: markets may issue one daily summary invoice with the Director's approval.
- Art. 8: kept four years from the latest of period end, return filing or
  assessment notice; the national program's data replaces the paper copy.
- Art. 10: seller and buyer are both responsible for an invoice that does not
  match the real transaction.
- Art. 11(a): exempt: licensed grocery, mini-market, supermarket or shop with
  annual sales under JOD 75,000; craftspeople under JOD 30,000; others named by
  the Minister's instructions. 11(b): the Director may oblige one whose sales pass
  the limit. 11(c): an exempt seller may ask in writing to invoice.
- Art. 17: penalties as in the Income Tax Law.

**Instructions No. 1 of 2019 on Invoicing Affairs and Control**, in force
1 July 2019 (under Arts. 11(a) and 16 of the regulation), signed by the Minister
of Finance: Art. 3 repeats the particulars and adds the identifier for a
non-Jordanian (number from the competent authority). Art. 4 exemptions: licensed
businesses with annual sales under JOD 75,000: groceries (mini-market,
supermarket, shop), bookshops and stationers, greengrocers, household goods
shops, bakeries, popular restaurants, home businesses, dairy shops,
sewing-supplies shops; licensed crafts under JOD 30,000; bakeries selling only
bread under JOD 150,000. Art. 5: goods on consignment need no invoice if
documented. Art. 6: lawyers with receipts up to JOD 50,000 a year may use
receipts; above it they invoice within 45 days; Art. 64 of Law No. 34 of 2014
fines apply.

Not read: Amended Regulation No. 2 of 2025 (not on the Department's page, which
still links the 2023 consolidation), the April 2025 phase, the 31 May 2024
registration date, any format specification. Corrected on the page: "purchaser
details are not required on invoices below JOD 10,000" (the text requires the
buyer's name on credit sales and proof of receipt above JOD 10,000; it does not
waive buyer details below it).

## Thailand

**Revenue Department Notification on making, sending or keeping tax invoices
or receipts using an electronic certificate to sign**, dated 7 June 2023, signed
by the Director-General, Royal Gazette vol. 140 special part 167 Ng, p. 11-16,
12 July 2023 (rd.go.th/fileadmin/user_upload/kormor/newlaw/pae_TaxInvoiceA.pdf):
issued under Ministerial Regulation No. 384 (B.E. 2565) after the Revenue Code
Amendment Act No. 53 (B.E. 2564), in force 19 August 2022, which ended DG
Notification No. 15 of 18 October 2019.

- Clause 2: a registered business or receipt issuer that wishes to issue
  electronically applies on form BO.01 through the Department's system, proving
  identity; once the Director-General publishes its name it may do so.
- Clause 4: data with the particulars of Revenue Code ss. 86/4, 86/6, 86/9, 86/10
  and 105 bis, in the format published on the Department's website, with an
  electronic signature from an approved certificate.
- Clause 10: the business "has the right to choose" electronic data or paper when
  VAT liability arises under s. 86 or payment is received under s. 105.
- Clause 11: the related data goes to the Department through its system by the
  15th of the following month, by the business, its agent or an appointed service
  provider, in the published standard and signed.

**DG Notification on income tax No. 470**, Royal Gazette vol. 143 special part
257 Ng, 28 October 2026: income tax exemption for individuals, up to THB 200,000,
for rooftop solar equipment and installation under Royal Decree No. 805 (B.E.
2569), contracts and grid connection from 3 March 2026 to 31 December 2028; the
evidence must be an e-Tax Invoice (as defined under s. 3 sexdecies and
Ministerial Regulation No. 384) naming the buyer's tax ID.

Not read: the Time Stamp (formerly By Email) notice and its THB 30 million line,
the incentive extension to 2027, the data standard itself. Kept as reported.
