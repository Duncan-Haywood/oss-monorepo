# Mandate dates read from the primary texts: Latvia, Denmark, Czech Republic, Luxembourg (2026-11-14)

The flagship row listed "primary-source mandate dates (IL, DK, CZ, LV, LU)" as open.
This run probed each country's official law site from the cloud runner and read
what answered. Every claim below is from the text itself unless marked.

| Host | Answer from the runner |
|---|---|
| likumi.lv (Latvia) | 200, plain HTML |
| retsinformation.dk (Denmark) | 200, a JavaScript app: rendered in headless Chromium |
| zakonyprolidi.cz (Czech consolidated laws) | 200 |
| psp.cz (Czech Chamber of Deputies) | connection reset, twice |
| chd.lu (Luxembourg Chamber) | 200 via headless Chromium |
| gov.il, nevo.co.il (Israel) | 403: Israel stays open |

## Latvia: Law on Accounting and Cabinet Regulation No. 749

Read on likumi.lv: Grāmatvedības likums (id 324249, version in force 27.03.2026 to
09.01.2028), the amending law of 5 June 2025 (id 361104, Latvijas Vēstnesis 111,
11.06.2025, in force 12.06.2025), Cabinet Regulation No. 749 of 9 December 2025
(id 365040, LV 240, in force 13.12.2025), and Article 16 of the Law on
Administrative Liability (id 303007).

- Art. 11(14): an invoice to another business registered in Latvia is drawn up as a
  structured e-invoice. Art. 11(16): exceptions (cash-register receipts, invoices
  generated in the National Health Service's or the State Employment Agency's
  systems, some security and police bodies).
- Transitional provision 8: for recipients that are not budget institutions, from
  **1 January 2028** (the 5 June 2025 law replaced "2026" with "2028").
- Transitional provision 9: B2G contracts signed by 31 December 2024 from 1 January 2026
  at the latest.
- Transitional provision 10: data to the State Revenue Service from **1 January 2026**
  for invoices to budget institutions, from **1 January 2028** for the rest. The page
  had called this "unconfirmed, sources conflict"; the law settles it.
- Regulation 749 point 7: the XML follows **UBL 2.1 and Peppol BIS Billing 3.0**. The
  page had this from one vendor source.
- Point 4: channels are eAddress, a provider's channel, or another channel (system
  integration, email). Point 14: each e-invoice goes to the State Revenue Service once,
  **within five working days** of sending. Points 15 to 17: outage and late rules.
  Point 18: voluntary submission for B2B from 1 January 2026.
- Penalty: Art. 43(1), up to 86 fine units for breaking the rules on supporting
  documents; one unit is EUR 5 (Law on Administrative Liability, Art. 16(2)). That this
  article covers a missing e-invoice is our reading; the law does not say so in terms.

## Denmark: BEK nr 811 and BEK nr 915

Read on retsinformation.dk: BEK nr 811 of 22/09/2026 and BEK nr 915 of 13/10/2026,
both amending BEK nr 97 of 26/01/2023 (requirements for digital standard bookkeeping
systems).

- BEK 811 § 2: in force **29 September 2026**; § 1 no. 6 (new § 5 a, MitID for new and
  existing customers at first login) from **1 March 2027**; § 1 no. 7 (§ 5 b, MitID to
  change supplementary master data) from **1 January 2028**.
- New annex 2: send and receive e-invoices and credit notes over the common
  infrastructure (Act No. 1764 of 28 December 2023); response documents; MitID-based
  check of e-invoice enrolment and **default enrolment unless the customer opts out
  within four weeks**; NemHandel-register lookup and a prompt on manual invoices.
- New annex 3: from 1 January 2028, documents sent carry locked CVR master data;
  bank reconciliation, standard chart of accounts, standard file, VAT API.
- BEK 915: rewrites § 10 (restore records within the § 11 deadline), in force 28 October 2026.
- **Not found** in either order: "SAF-T 2.0 from 1 January 2027". The only SAF-T text is
  annex 3 point 7 (a CSV or SAF-T file for Regnskab Basis). The page keeps the date
  marked "reported", from Erhvervsstyrelsen's guidance as excerpted.
- The draft's 30 November 2026 date is not in the final order.

## Czech Republic: Act No. 134/2016 Coll.

Read on zakonyprolidi.cz: § 221 and § 279.

- § 221: a contracting authority may not refuse an e-invoice for a public contract
  because of its format if the format follows the European standard. An acceptance
  duty; no format, network or penalty of its own.
- § 279(1): the Act takes effect on the first day of the sixth month after
  promulgation (1 October 2016). § 279(5): **§ 221 takes effect** for § 4(1)(a)
  authorities (the state) and the Czech National Bank on the first day of the 18th
  month, for others the 30th month, after the OJ publication of the standard's
  reference. That was Commission Implementing Decision (EU) 2017/1870, OJ L 266,
  17.10.2017 (citation from the EFTA and legislation.gov.uk records via search; the
  EUR-Lex page redirected). Our count: **1 April 2019** and **1 April 2020**.
- So the page's and the hub's "B2G acceptance since 1 Oct 2016" was the Act's start
  date, not § 221's. Fixed.
- **Bug found on the way:** the Czech page's lede was Serbia's ("Serbia clears invoices
  ... SEF"), a copy-paste from the Serbia page. Fixed, with a test. A scan of all 93
  mandate pages for a lede that does not name its own country found no other case
  (the hits were adjectives: Belgian, Dutch, Greek and so on).

## Luxembourg: dossier 8815

The bill text was read on 2026-11-02. The Chamber's dossier page, rendered today
(last updated 23.10.2026): status "En commission" (Finance Committee); rapporteur
named 18.09.2026; returned to committee 08.10.2026; two opinions filed, 8815/01 the
Bar Council and 8815/02 the Chamber of Commerce. No vote and no Council of State
opinion listed, so the page's EY excerpt about a Council of State finding remains
unconfirmed. The row was added to the page's timeline.

## Still open

Israel (gov.il and nevo.co.il answer 403); the Czech bill tisk 218 (psp.cz resets);
the Danish SAF-T 2.0 date; whether Latvian Art. 43 is the article applied to a
missing e-invoice.
