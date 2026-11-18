# Mandate texts read: Taiwan and Oman (2026-11-14, later)

The flagship row listed the Taiwan and Oman pages as written from excerpts, with
dates and duties that disagreed between sources. This run read the texts.

| Host | Answer from the runner |
|---|---|
| law.moj.gov.tw (Taiwan, Ministry of Justice law database) | 200, plain HTML |
| www.einvoice.nat.gov.tw (Taiwan e-invoice platform) | 403 |
| www.rootlaw.com.tw (copy of the Executive Yuan Gazette PDF) | 200 |
| qanoon.om (Oman, reproduces the Official Gazette; says it is not an official source) | 200 |
| taxoman.gov.om | 404 at the root; tms.taxoman.gov.om 200 (not read) |

## Taiwan

Read on law.moj.gov.tw: the Value-added and Non-value-added Business Tax Act
(pcode G0340080, last amended 28 May 2025), its amendment history, and the
Regulations Governing the Use of Uniform Invoices (G0340082, amended 12 December 2024).

- **Act Art. 32(4):** a uniform invoice is printed by the government, self-printed
  with approval, or issued, sent or received over the internet or other electronic
  means. Electronic is one of the lawful ways.
- **Regulations Art. 7:** five kinds of uniform invoice: triplicate, duplicate,
  special, cash-register, and electronic. Art. 7-1(2): a business under Act
  Art. 6(4) (a foreign entity with no fixed place in Taiwan selling electronic
  services to individuals there) **must** issue cloud invoices.
- So the vendor claim that "eGUI has been compulsory for all tax-registered
  businesses since 1 January 2021" is not in either text. The page had this as
  "sources disagree"; it now says what the law says and names the exception. A
  separate Ministry designation for some sectors may exist; none was found in
  these two texts, and the page says to ask the tax office.
- **Act Art. 32-1:** a business that issues e-invoices sends them and the related
  data to the Ministry's platform within the time limit the Ministry announces.
  Amended, with new **Art. 48-2** (fine TWD 1,500 to 15,000 for late or untrue
  transmission, after notice, repeatable), by the law promulgated 7 August 2024;
  in force **1 January 2025** (Executive Yuan order of 30 August 2024, from the
  amendment history).
- **Time-limit table** ("營業人開立電子發票應傳輸至財政部電子發票整合服務平台存證之資訊範圍及時限表"),
  Executive Yuan Gazette vol. 30 no. 233, 12 December 2024 (read from the Gazette
  PDF as copied by rootlaw.com.tw): **7 days** when the buyer is a business, **2 days**
  when not, counted from the day after issue, correction, voidance or credit note;
  carrier and donation data with the invoice (changes within 2 days); unused number
  ranges and branch allocations within 10 days of each two-month period; a last day
  on a weekend or holiday is not extended; after force majeure, apply within 3 days
  to make up. Data follows the Ministry's data-exchange guideline (the MIG).
  The vendor guides' "48 hours" for B2C is not in the table.
- **Not confirmed:** a six-month no-fine guidance period in the first half of 2025
  (news reports only); MIG 4.1 timing (Turnkey manual not opened; the platform
  site answers 403); Peppol.

## Oman

Read on qanoon.om: Tax Authority Decision No. 189/2026 amending the VAT Executive
Regulation (Decision 53/2021), with its annex, in Arabic.

- Issued 19/2/1448 AH = **3 August 2026**; published in **Official Gazette issue 1660 of
  9 August 2026**.
- **Article 3:** in effect from **1 April 2027** for taxable persons whose annual supplies
  exceed OMR 5 million, and from **1 October 2027** for those whose supplies do not.
  Article 2 repeals anything contrary. The older August 2026 / February 2027 /
  August 2027 schedule in some guides is not in it.
- Annex, new **Art. 143:** the tax invoice is issued in an approved, secured electronic
  format with a unique number, for a supply (including to a non-taxable person or for
  own use), a deemed supply, or consideration received before the supply, **within
  15 days**; source and content verifiable and readable until the end of retention.
  **Art. 146** (2nd paragraph): simplified tax invoices on the same deadlines.
  **Art. 143 bis:** the Authority announces the companies licensed to provide
  electronic tax invoicing. **143 bis 1:** security, outage and recovery measures.
  **143 bis 2:** the Chairman may grant a time-limited exemption on a reasoned request,
  provided returns are filed and tax paid on time. **Art. 147 item 11:** any other
  data the Authority specifies.
- **Not in the decision:** the name Fawtara, Peppol, PINT-OM, a five-corner model,
  the pilot of about 100 taxpayers, a B2G phase, any penalty. The page keeps those
  marked as reported.

## Also fixed

- The Oman page still said 4 of OpenPeppol's 49 PINT OM examples draw a false total
  mismatch on baisa lines; that was fixed on 2026-11-12 (README "Baisa line nets").
  The hub's check column said "no PINT-OM rules" though PINT OM 1.0.1 has run since
  2026-11-12. Both corrected.
- The "which mandate applies" page said Oman was "reported only from secondary
  sources"; it now quotes the decision.

Regenerated: the hub table, `mandate-dates.json` and `mandate-calendar.ics` (one new
Taiwan event, 1 January 2025), `e-invoicing-deadlines-2027.html`,
`which-e-invoice-mandate-applies.html`. Tests: one new test in each country page's
test file pinning what was read.

## Still open

Nigeria, Thailand, Pakistan and Jordan pages are still from excerpts; Israel (gov.il
403); the Taiwan platform's own MIG and Turnkey texts (403).
