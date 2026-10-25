# AI Bookkeeper

Double-entry books from bank and card CSV exports, which learn from your
corrections. Every line gets a suggested account with a confidence and a reason.
The lines it is sure of post themselves and the rest wait in a review queue.
Each line you file teaches it the next statement. Transfers between your own
accounts are paired into one entry. Out come a trial balance, a profit and loss
by month, a balance sheet, close checks, and journals for QuickBooks Online,
Xero, QuickBooks Desktop (IIF) or any ledger. AI is optional: a model on your
own key, or one running on your own computer, can suggest accounts for the
review queue. It never posts anything by itself.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/

After using this, you can now **turn a month of bank and card statements into
balanced books in minutes, with the boring payees posting themselves from the
second month on**, which used to take sorting every line by hand in a
spreadsheet, or a bookkeeping subscription with a bank login.

## Run it

- **Page:** open `index.html`. There is no build step, no account and no key.
  The books are kept in this browser's storage and in a JSON file you download.
- **CLI:** `node cli.mjs --help`. The books are a JSON file named with `--books`:

  ```sh
  node ventures/ai-bookkeeper/cli.mjs --books books.json import checking.csv --account 1000
  node ventures/ai-bookkeeper/cli.mjs --books books.json import card.csv --account 2000 --invert
  node ventures/ai-bookkeeper/cli.mjs --books books.json review
  node ventures/ai-bookkeeper/cli.mjs --books books.json confirm <id>=6060
  node ventures/ai-bookkeeper/cli.mjs --books books.json accept 0.7
  LLM_PROVIDER=ollama LLM_MODEL=llama3.2 node ventures/ai-bookkeeper/cli.mjs --books books.json ai
  node ventures/ai-bookkeeper/cli.mjs --books books.json report
  node ventures/ai-bookkeeper/cli.mjs --books books.json checks
  node ventures/ai-bookkeeper/cli.mjs --books books.json export qbo > journal.csv
  ```
- **Agents:** `node platform/agents/tools.mjs call ai-bookkeeper analyze --input '{"example":true}'`
  or `{"statements":[{"csv":"...","account":"1000"}],"books":<previous books>,"confirm":{"<id>":"6060"}}`.
  It returns `{ status, review, reports, checks, books }`. Pass `books` back next time to keep what was learned.
- **Tests:** `node --test ventures/ai-bookkeeper/*.test.mjs`.

## How it works

| File | What it does |
|---|---|
| `bai2.mjs` | Reads BAI2 cash-management files (US business banks): 03 account, 16 transactions with 88 continuations, type codes 100-399 credit and 400-699 debit, S/V/D funds types, closing ledger balance 015 for the reconcile check. |
| `n43.mjs` | Reads Norma 43 (Cuaderno 43) files, the fixed-width 80-column statement every Spanish bank offers: 11 account header, 22 movements (debe/haber digit gives the sign, 14-digit amount with two decimals), 23 concept lines joined into the description, 33 final balance for the reconcile check (dated by the header's end date). |
| `cfonb.mjs` | Reads CFONB 120 files, the fixed-width 120-character statement French banks offer: 01 opening balance, 04 movements (sign from the overpunched last character of the 14-character amount), 05 complement lines (LIB, NPY, NBE, RCN, REF joined into the description), 07 closing balance for the reconcile check. |
| `sepa.mjs` | Reads MT940 (SWIFT `:61:`/`:86:`, including German `?20` structured purpose lines) and CAMT.053 (ISO 20022 XML, namespaces and reversal flags handled), the formats European banks export. The closing balance is kept and checked by the reconcile close check. Fixtures are hand-written: `fixtures/checking.mt940`, `checking.camt053.xml`. |
| `bank.mjs` | Reads OFX/QFX (SGML or XML) and QIF files, which carry signed amounts as the account prints them, and CSV statements: RFC 4180 quoting, `,` `;` or tab, amount or debit/credit columns, US or day-first dates, `(12.00)` and `12.00-` negatives. Each row gets a stable id, so re-importing an overlapping month adds only new lines. When the bank prints a running balance, every row is checked against the one before. Dutch ING (Af/Bij, YYYYMMDD) and Rabobank (Omschrijving-1..3, Saldo na trn) layouts read, from remembered headers and made-up rows. |
| `opening.mjs` | Opening balances from a trial balance CSV (`code,amount` in natural sign, or `code,debit,credit`), dated; whatever does not balance goes to 3000 and is reported. For starting mid-stream with a receivable, a loan, equipment and prior earnings already on the books. CLI `opening FILE --date D`; agents `opening: {csv, date}`. |
| `payroll.mjs` | Pay-run register to books: wages, employer taxes, the 2300 liability, bank-line matching and a Form 941 worksheet. |
| `ledger.mjs` | The double-entry core, in integer cents: a 37-account small-business chart (or your own), entries that must balance, trial balance, monthly profit and loss, and a balance sheet where unclosed profit shows as current earnings, and an indirect-method cash flow statement (`cashFlow`, in `report`) that must tie to the change in the bank accounts. |
| `categorize.mjs` | Four layers, in order: your rules (`keyword => account`), memory (the account you chose for this payee before), a naive Bayes classifier trained on everything you filed, and conservative built-in keywords. Payees are normalised first: `SQ *BLUE BOTTLE 0412 OAKLAND CA` and `POS DEBIT SQ *BLUE BOTTLE 9981` are both `blue bottle`. |
| `engine.mjs` | Import, transfer pairing, auto-posting, confirming, the journal, close checks and exports. `analyze()` is the one call for agents and the CLI. |
| `ai.mjs` | The optional fifth layer, through `byok.mjs` (a synced copy of `platform/llm/byok.mjs`): Anthropic, OpenAI, Gemini, any OpenAI-compatible endpoint, or Ollama, LM Studio or llama.cpp on your own computer. |

**What posts by itself.** Only a line decided by your own rule or by memory,
at or above the auto-post confidence (0.85 by default). Memory's confidence is
`times chosen / (times seen + 0.5)`, so three unanimous choices give 0.86 and
the fourth line from that payee posts alone. The classifier, the built-in
keywords and the AI only suggest.

**Transfers.** Two lines in different imported bank or card accounts, equal and
opposite, within 5 days, become one entry. Nearest dates pair first, and each
line pairs once. A card payment is a transfer, not an expense. If only one side
has been imported, the line waits in review and says why.

**Split lines.** A line that is several things at once posts as one entry with
a line per part. A Stripe payout of 970.00 is sales +1,000.00 and fees -30.00;
a loan payment of 1,000.00 is interest 200.00 and loan principal for the rest.
Parts are signed like the bank line and must add to it exactly, to the cent; at
most one part may leave its amount out to take the remainder. On the page, open
"Split" on a queue line and type `4000:1000.00, 6010:-30.00`. In the CLI:
`confirm ID=4000:1000.00,6010:-30.00`. For agents, pass an array in `confirm`:
`{"<id>": [{"account":"4000","cents":100000},{"account":"6010","cents":-3000}]}`.
A split is not learned from (the same payee splits differently each time), and
a later plain account choice for the line undoes it. The liability, suspense
and equipment checks read every part.

**Close checks.** Lines still in review; money in the uncategorized account;
duplicate lines; a charge more than 3 times a payee's median (and at least $50
over it); a supplies, office or repairs line of $2,500 or more that may be
equipment; a bank account dipping below zero; and the ledger compared with the
statement's own closing balance, when the file has a running balance column.

**AI guard rails.** Only lines in review are sent. Each line sends its date,
description and amount, along with the chart of accounts and up to 40 lines you
already filed as examples. An answer naming an account that is not in the chart
is dropped. An AI suggestion is shown in purple, kept if the deterministic
layers re-run, and posted only when you accept it.

## Verification

### Mutation fuzz of the statement readers

`node --test fuzz.test.mjs` corrupts every text fixture (deleted spans, junk,
truncation, duplicated spans, shuffled lines; seeded, `FUZZ_SEED` and
`FUZZ_ROUNDS` to explore) and asserts `readStatement` never throws and every
row has safe-integer cents and a string date. First run, 2026-10-24: 8 seeds x
400 rounds x every fixture found one fault, an MT940/CAMT amount of 30 digits
read as 3.7e+21 cents (`sepa.mjs` lacked `parseCents`'s safe-integer guard);
fixed, now a skipped line with a problem. Corrupted fixtures only, not real
bank files.

### Learning curve (synthetic data)

`node ventures/ai-bookkeeper/eval/benchmark.mjs --seeds 5`. `eval/synth.mjs`
writes a seeded year of lines for a made-up design studio. It has 35 recurring
payees with messy descriptions (store numbers, reference codes,
`PURCHASE AUTHORIZED ON 03/14 ...` wrappers). Three of them (Amazon, Costco,
Venmo) are filed to two different accounts. There are six one-off local
merchants a month, and a card paid from checking. Months are imported one at a
time. Before each month, every earlier line is confirmed with its true account,
as a person clearing the queue would. Auto-post is at 0.85.

| month | lines | posted alone | wrong of those | transfers | review suggestions right | no suggestion |
|---|---|---|---|---|---|---|
| 01 | 247 | 0.0% | 0 | 10 (0 wrong) | 133/133 (100.0%) | 42.1% |
| 02 | 239 | 7.5% | 0 | 10 (0 wrong) | 167/175 (95.4%) | 15.1% |
| 03 | 242 | 23.6% | 0 | 10 (0 wrong) | 130/155 (83.9%) | 8.3% |
| 04 | 244 | 44.3% | 0 | 10 (0 wrong) | 91/109 (83.5%) | 7.0% |
| 05 | 234 | 54.7% | 1 (0.8%) | 10 (0 wrong) | 68/79 (86.1%) | 7.3% |
| 06 | 240 | 58.3% | 0 | 10 (0 wrong) | 61/73 (83.6%) | 7.1% |
| 07 | 245 | 57.6% | 0 | 10 (0 wrong) | 69/79 (87.3%) | 6.1% |
| 08 | 240 | 60.4% | 0 | 10 (0 wrong) | 56/67 (83.6%) | 7.5% |
| 09 | 232 | 65.1% | 0 | 10 (0 wrong) | 49/59 (83.1%) | 5.2% |
| 10 | 240 | 65.8% | 0 | 10 (0 wrong) | 51/62 (82.3%) | 4.2% |
| 11 | 248 | 65.3% | 0 | 10 (0 wrong) | 52/59 (88.1%) | 6.9% |
| 12 | 241 | 69.3% | 0 | 10 (0 wrong) | 45/55 (81.8%) | 3.7% |

Over months 4 to 12, 1,300 of 2,164 lines posted alone (60.1%), and 1 of those
1,300 went to the wrong account. 90 transfer lines were paired, none wrongly.
542 of 642 review suggestions were right (84.4%), and 132 lines (6.1%) had no
suggestion. In total: 5 seeds, 2,892 lines, about one second.
`engine.test.mjs` pins the headline on seed 1.

**Read this with care.** The data is synthetic, and the same person wrote the
generator and the built-in keywords. So month 1's 100% (133 of 133 built-in
suggestions right) flatters the keywords and says nothing about real banks.
The learning numbers are the honest part: they measure how fast memory and the
classifier pick up a business's own payees through messy descriptions.
That 60% is held down by the payees deliberately filed two ways and by the
one-off merchants. Real bank files will be messier, and the first real export
someone reports is worth more than this table.

### Which layer earns its keep (ablation)

`node ventures/ai-bookkeeper/eval/ablation.mjs` reruns the same synthetic year
with layers switched off (`skipLayers`). Months 4 to 12, 5 seeds, 2,074 lines
that are not paired transfers; "right in all" counts lines posted alone or
carrying a right suggestion:

| layers | posted alone, right | right in all | wrong suggestions | no suggestion |
|---|---|---|---|---|
| all | 62.6% | 88.8% | 100 | 6.4% |
| without memory | 0% | 85.9% | 77 | 10.4% |
| without the classifier | 62.6% | 86.8% | 68 | 9.8% |
| without built-in keywords | 62.6% | 85.8% | 100 | 9.3% |
| memory only | 62.6% | 81.1% | 68 | 15.6% |
| classifier only | 0% | 78.2% | 77 | 18.1% |
| built-in keywords only | 0% | 54.7% | 0 | 45.3% |

Reading it, same caveat as above (synthetic data, keywords written by the
generator's author): memory alone gets to 81%, and the other two layers add
about 8 points between them. Auto-posting comes only from memory and your
rules, so without memory nothing posts alone, however good the classifier is.
Wrong suggestions rise from 68 (memory only) to 100 (all layers) as the
extra layers widen coverage, while "right in all" rises from 81.1% to 88.8%.
Suggestions never post alone unless memory or a rule made them. Which
of the two extra layers adds the most cannot be read off this table: each
"without" row removes a layer the others partly cover.

**Not yet measured:** accuracy of the AI layer (no key or local model in the
build environment, and model hosts were not reachable from it), and any real
bank export.

### The AI layer (harness ready, no reading yet)

`node ventures/ai-bookkeeper/eval/ai-eval.mjs` sends the synthetic year's
review queue (months 4 to 12, lines the four layers did not post alone) to the
model in batches of 40, the same call the page makes, and reports the
deterministic top suggestion's hit rate, the model's, and how many lines the
model rescued against how many it broke. Point it at a model with the same
variables as the page (`LLM_PROVIDER=ollama LLM_MODEL=...`, or a provider key).
`--stub 0.8` swaps in a scripted reply to test the harness; its numbers are
about the script, not a model, and are not a result. On one seed the review
queue is 157 lines and the deterministic top suggestion is right on 63.7%,
with 22.3% having none: that is the bar a model has to beat.

### Round-trip property test (2026-10-22)

`node --test eval/roundtrip-fuzz.test.mjs` renders 40 seeded random statements (5-34 rows) with the quirks real exports have and checks `readStatement` returns exactly the rows rendered: BOM, CRLF, `;` delimiter, quoted commas and quotes, parenthesised negatives, thousands separators, European decimals, split debit/credit columns, and ISO, M/D/Y, D/M/Y and "12 Mar 2026" dates. 40 of 40 pass. Generated, not real bank data; a row that reads "PAYMENT - THANK YOU" is left out on purpose, because the card sign heuristic flips signs for it.

### Checked by hand

- The page runs in headless Chromium. It loads the example, accepts
  suggestions, and files the rest. Checking then agrees with the statement's
  closing balance ($10,947.46 on 2026-03-31). The balance sheet balances, the
  books survive a reload, and there is no horizontal scroll at 390px. The page
  makes no request outside its own folder.
- CLI: import, a second import of the same file (0 added, 87 already in the
  books), review, accept, report, checks and `export qbo`.

## Rules from your corrections

`suggestRules(books)` (also `ruleSuggestions` from `analyze`, and
`cli.mjs rules [--apply]`) lists payees you filed at least three times, at least
90% to one account, that no rule of yours already matches, as ready-made
`payee => code` lines; `addRules` appends them to the books' rules. Test:
engine.test.mjs, "offered as rules".

## Invoices and bills (accruals)

The page has an "Invoices and bills" card that takes the same CSV (paste or file)
and shows the aging table, and the setup card lists rule suggestions with one
button to add them. Checked in a headless browser, 2026-10-21.

Bank lines alone give cash-basis books: a sale counts the day the deposit
lands. Load an invoice and bill list and the books go accrual for those
documents. `accruals.mjs`; CLI `documents FILE`, `aging [--as-of D]`; agents
pass `documents: [{ "csv": "..." }]` to `analyze` and get `aging` back.

The CSV has a header `type,number,date,due,party,amount,account` (and `against`
for credit notes). `type` is `invoice` or `bill`, or a credit note. Rows that share a type and number are one document with a
line per row (an invoice's sales line to `4000`, its tax line to `2100`). A
document journals on its own date: an invoice debits Accounts receivable
(1100) and credits its lines; a bill credits Accounts payable (2050, added to
the chart if it is missing) and debits its lines. Loading a number twice adds
nothing.

**Statement of account.** `node cli.mjs --books books.json statement Acme --out acme.html` (or the
Statement button beside each open invoice on the page) prints one customer's
invoices, credit notes, payments, refunds and write-offs in date order with a
running balance, the amount owed and how much is past due; `--from DATE` rolls
earlier activity into a brought-forward line. The closing balance is tested
against the aging table. Node tests on hand-written ledgers; the page button was
not clicked through (playwright is not installed in the 2026-10-21 cloud session).

**Writing off.** `writeoff ID` takes an invoice's unpaid balance to Bad debts (6900); on a bill it records the supplier forgiving the balance: payable debited, Other income (4100, "Debts forgiven") credited. Either leaves aging. Node test on a hand-written bill (engine.test.mjs, 2026-10-21). Forgiven debt can be taxable income; ask your accountant.

A bank line clears a document when it has the **exact amount**, falls 0 to 180
days after the document date, and carries the **invoice number or the party's
name** in its description. It is then `settled` and posts to receivable or
payable instead of income, so revenue is counted once, in the month invoiced.
An amount match with nothing else (one open document of that amount) is only a
0.60 suggestion in the review queue. A bundled payment is handled below.

**Part-payments.** A line smaller than what is still owed, with the document's
number in its description (or its party's name, when that party has just one
open document), is a part-payment: it posts to receivable or payable, lowers
the balance, and the document stays open in `aging` (flagged as part-paid, with
its original amount) until the instalments reach the total. The last
instalment is matched like any exact payment.

**Credit notes.** Types `credit note` (sales) and `vendor credit` or `debit
note` (purchases) are documents too. They journal the invoice backwards (income
and tax debited, receivable credited). An optional `against` column names the
invoice or bill number it reduces; the credit is applied in date order, never
below zero, and the payment expected is the amount net of it. A credit with no
`against`, or more than the invoice still owes, shows in `aging` as a negative
item until you settle it.
**One payment across several documents.** A line that equals the open balances
of two or more documents of one party, to the cent, and names the party or one of
the numbers, settles them all (`docs` on the line lists them). The smallest
set wins and any number named in the description must be in it; if two sets
fit equally well, the line stays in review. Up to 16 open documents per party
are searched.

Matches are rebuilt on every pass, so filing a settled line elsewhere reopens
its document.

Close checks add: receivable or payable in the ledger that differs from the
open documents (a line filed to 1100 or 2050 with no document behind it), and
invoices or bills more than 30 days past due. `aging` buckets what is open as
current, 1-30, 31-60, 61-90 and 90+ days past due.

Tests: engine.test.mjs, "Accruals" and "Part-payments and credit notes". Not measured on real invoice exports (the
tests use a four-row list); the matching thresholds are a first guess.

## Self-employment tax and estimated payments (US)

`selfEmployment(profit, { year, wageBase, wages })`, `estimatedDueDates(year)` and
`seSetAside(books, { year, monthsElapsed })` in `taxforms.mjs`, and `cli.mjs se
[--year Y] [--months N] [--wages $] [--json]`, take the year's Schedule C profit so
far, annualise it to the months covered, work out Schedule SE (92.35% net earnings,
12.4% social security up to the wage base, 2.9% Medicare, half deductible) and split
it across the four federal payment dates (weekend dates move to Monday). Income tax is
not estimated, and the 0.9% additional Medicare tax, farm and church income are left
out. The 2025 and 2026 wage bases ($176,100, $184,500) matched published reports of the SSA announcement on 2026-10-23 (not the SSA page, unreachable here); 2024 is from memory. So
every result warns; pass `wageBase`. Node tests only; not on the page yet.

## Federal income tax estimate and safe-harbour payments (US)

`estimatedTax(books, opts)` in `estimatedtax.mjs` and `cli.mjs estimate [--year Y]
[--months N] [--filing single|mfj|hoh] [--wages $] [--other $] [--withholding $]
[--paid $] [--prior-tax $ --prior-agi $] [--as-of DATE] [--no-qbi] [--json]`
(2026-10-22) go on from the self-employment set-aside to the whole Form 1040-ES
picture: Schedule C profit annualised, SE tax, half-SE deduction, standard
deduction, a simplified 20% QBI deduction (the smaller of 20% of profit and of
taxable income), the bracket tax, and a payment plan on the IRS safe harbour: the
smaller of 90% of this year's total and 100% of last year's tax (110% when last
year's AGI was over $150,000), less withholding and what you have already paid,
spread over the due dates still ahead (`--as-of`). Under $1,000 owed after
withholding means no estimates. Without last year's tax the plan uses 90% and says
the prior-year route is often smaller. Tested against hand arithmetic
(`estimatedtax.test.mjs`, 7 pass); the 2026 brackets and standard
deductions (all three filing statuses) matched the IRS text of Rev. Proc. 2025-32 itself on 2026-10-23 (tables 1-3, standard deductions, the section 199A thresholds), the 2025 ones are typed from memory and unchecked (every result warns; pass `brackets`). Leaves out state tax, credits,
itemising, the QBI wage/property limits and service-business phase-out (it warns
above the threshold), and the 0.9% Additional Medicare Tax. Not tax advice. On the page since 2026-10-23 ("Optional: federal tax estimate and quarterly payments"), same function as the CLI.

## Schedule C worksheet (US sole proprietors)

`scheduleC(books, { from, to, mealsPct, map })` in `taxforms.mjs` (also the page's
"US Schedule C worksheet" table and CSV download, and `cli.mjs schedulec [--from D
--to D] [--meals PCT] [--csv|--json]`) regroups the profit and loss onto the lines
of Form 1040 Schedule C: gross receipts (1), cost of goods (4), other income (6),
each expense line, meals cut to 50% on 24b, and gross income (7), total expenses
(28) and net profit (31). Software, bank fees, education and shipping go to 27a
(other expenses) with their own rows for Part V. A chart code the map does not know
goes to 27a and is flagged; the uncategorized account and lines still in review are
left out and flagged. Pass `map` (`{ "6060": "18" }`) to move an account. It is a
worksheet to copy from, not a filing: no depreciation, home office, mileage,
health insurance or self-employment tax, and the meals rule has exceptions. The line
map is from the form's layout as the author knows it, not checked against this year's
instructions; confirm each line with your preparer. Test: `taxforms.test.mjs`.

**Preparer pack (2026-10-22).** `cli.mjs taxpack YEAR [--out DIR]` (`taxPack(books, year)` in `taxpack.mjs`) writes one folder for a bookkeeper or tax preparer: trial balance, profit and loss, balance sheet, full journal, Schedule C lines, self-employment tax, the 1099-NEC list and filing sheet, Form 941/940 worksheets, sales tax by month, tax depreciation, the mileage log and the close checks, plus `INDEX.txt` listing the files, the ones left out because nothing is behind them, and what to look at first (a contractor over the line with no W-9, an unmapped account, a failing close check). It only gathers what the other modules compute; hand-made fixtures only, so try it on a real year. Test: `taxpack.test.mjs`.

## Rental properties and Schedule E (US landlords)

`rental.mjs` (CLI `rental accounts|add ID [NAME]|tag ID --match TEXT|--account CODE|--ids A,B|untag|list`, then `schedulee [--from D --to D] [--csv|--json]`; marketing page `rental-property-bookkeeping.html`, 2026-10-23). `rental accounts` adds rental income (4300), management fees (6200), mortgage interest (6210), property taxes (6220), cleaning and maintenance (6230) and deposits held (2400). Bank lines carry a `property` tag (a split part can carry its own); `scheduleE` regroups income and expense onto Schedule E Part I lines 3 to 19, totals 20 and 21, one column per property, with untagged amounts shown as Unassigned (or given to the only property). It warns on untagged amounts, unmapped accounts, lines in review, no depreciation booked and no deposits account, and `taxpack` writes `schedule_e.csv` when properties exist. A worksheet: no passive-loss limits, personal-use days, vacation-home rules or depreciation schedule. The line map is from the form's layout as the author knows it, not checked against the current instructions; tested only on hand-written books (`rental.test.mjs`, 5 tests), no real landlord's year.

## Mileage and home office (US)

Two deductions a bank feed never shows. `trip add MILES --date D --purpose TEXT [--from A --to B]`
keeps a mileage log (a purpose is required; the IRS asks for one), `trip list --year Y` totals it, and
`homeoffice SQFT [--from D --to D]` records a home office under the simplified method ($5 a square foot,
300 square feet at most, prorated by months used, never more than the business profit). Neither is a
journal entry. `schedulec --year Y` adds the miles to line 9 at the year's standard rate and the home
office to line 30, and net profit is line 29 less line 30. Without `--year` the worksheet is as before.

Verification: `node --test deductions.test.mjs` (rate times miles in integer cents; the 300 sq ft cap;
part-year proration; the profit limit; line 9, line 30 and net profit on a small ledger) and a CLI
run on a three-line statement. **Not checked:** the 2024 and 2025 rates (67.0 and 70.0 cents) are from
memory of the IRS notices. 2026 is priced by trip date: 72.5 cents to June 30 and 76 cents from July 1
(Announcement 2026-11, 2026-10-22; read from several tax-press reports, irs.gov was unreachable from the
build sandbox). The earlier flat 72.5 would have under-deducted every second-half trip. No real mileage log was tried; the page card (trip log, home office, Schedule C lines 9 and 30) was clicked through in headless Chromium with `node eval/browser-click.mjs`. Whether
a space qualifies for the home office deduction, and whether to use actual expenses instead, is for you
or your preparer.

## 1099-NEC contractor worksheet (US)

`contractors1099(books, { year, threshold })` in `taxforms.mjs` (and `cli.mjs
contractors [--year Y] [--threshold DOLLARS] [--csv|--json]`) totals bank payments
filed to Contract labor (6020, whole lines and split parts) by payee for a calendar
year and marks who is over the 1099-NEC line. `cli.mjs w9 "PAYEE"` (`markW9`)
records that a W-9 is on file; only that yes/no flag is stored, never a tax ID.
`cli.mjs merge-payee FROM INTO [--off]` (`mergePayees`) counts two spellings of one
payee ("ZELLE ANNA LOPEZ", "UPWORK PAYMENT ANNA LOPEZ") as one, so their payments
add up against the line; only a pointer is kept, and `--off` undoes it. The page has
the same worksheet as a card (W-9 tick boxes, a merge picker, a CSV button). The
line is $600 for payments through 2025 and $2,000 from 2026 (read on the IRS's
Form 1099-NEC pages and fact sheet FS-2025-08 on 2026-10-21; indexed to inflation
from 2027, so check the current instructions then or pass `--threshold`). Card
payments are shown apart and left out of the totals (the processor reports those on
a 1099-K); payees over the line without a W-9 and unfiled bank lines from the year
are warned about. Payees are grouped by the first two payee words of the bank line,
so two spellings of one person can split: check the list. It is a worksheet, not a
filing: whether someone is a contractor, and exemptions such as corporations, are
yours to decide. `cli.mjs contractors --filing` (`nec1099FilingCsv`, and a button on the page) writes one row per payee over the line in the Form 1099-NEC's own box names (box 1, box 4) for a filing service's import sheet; services take their own column layouts, so it is the form's boxes, not any one service's file, and the TIN and address columns are blank because none is stored. The $2,000 line from 2026 is read on the IRS's own Instructions for Forms 1099-MISC and 1099-NEC (irs.gov/pub/irs-pdf/i1099mec.pdf, read with pdftotext 2026-10-23, along with the Form 945 instructions): they also say backup withholding is reported in box 4 and that a 1099-NEC is required for anyone you withheld from regardless of amount, and Form 945 line 2 is where it goes; the warning now says so. The 24% rate itself sits in Pub. 1099 part N, which was not fetched. `necDeadline` gives the filing date (January 31, rolled to the next weekday: February 1, 2027 for 2026 payments). From 2027 the $2,000 is indexed to inflation, so the worksheet warns unless you pass a threshold. Test: `taxforms.test.mjs`.

`cli.mjs b-notice 2026-10-05 [--received DATE] [--second [--first-notice DATE] [--b-notice-sent DATE]]` (`bNoticeDates` in `taxforms.mjs`) turns an IRS CP2100/CP2100A notice date into two dates: mail the First (or Second) B Notice within 15 business days, and start 24% backup withholding on later payments within 30 business days if the payee has not returned a signed W-9. Business days skip weekends and observed federal holidays; the count starts from the later of the notice date and the day it arrived. Rules read on the IRS B-program and CP2100 pages, then checked against Pub. 1281 itself on 2026-10-23 (Rev. 12-2023, pdftotext; pp. 14-15, Q&A 15-19): the 15 and 30 business-day windows match. Pub. 1281 adds three points now in the helper: for a Second B Notice the 30 business days run from the date of that B notice (`--b-notice-sent`; without it the CP2100 date is used, which can be earlier), a second CP2100 in the same calendar year as the first may be disregarded (`--first-notice`, Q17), and withholding stops within 30 calendar days of a signed W-9. An undeliverable B notice means withholding starts at once (Q18, not modelled). The page sets the start date from receipt, so `--received` matters. Test: `taxforms.test.mjs`.

## Sales tax report

`salesTax(books)` (also `salesTax` from `analyze`, the page's sales tax table and
`cli.mjs salestax [--from D --to D]`) reads account 2100 by month: sales (the
invoice lines other than tax, less credit notes), tax collected, tax taken off by
credit notes, tax paid over (bank lines filed to 2100) and what is still owed. Tax
on bills is left out. It is a worksheet to check a return against, not a return:
rates, nexus, exemptions and filing dates are yours to know. Test: engine.test.mjs,
"sales tax is collected".

**Return worksheet by jurisdiction** (`salestaxreturn.mjs`, 2026-10-22; CLI
`salestax return [--freq monthly|quarterly|annual] [--due-day N] [--rate "CA state=7.25"]`):
put the jurisdiction in the tax line's description column ("CA state", "LA county")
and the worksheet gives, per filing period and jurisdiction, taxable sales (net of
credit notes), non-taxable sales (invoices with no tax line), tax due, the rate
actually collected, and the due date (next month's `--due-day`, default the 20th).
`--rate` warns when the collected rate differs from the one you expect; tax lines
with no description are listed as "Unlabelled" with a warning. Hand-written
documents only (`salestaxreturn.test.mjs`, 5 pass). Added 2026-10-22: a due date on a
weekend or US federal holiday moves to the next business day (`--no-rollover` keeps
the calendar date; state calendars differ, so check yours); `--discount "CA state=0.5,100"`
takes a timely-filing discount (percent, dollar cap) off a jurisdiction's tax; and bank
lines filed to 2100 are matched to the last period that ended before the payment, so each
period shows payable, paid over and still owed, with a warning for an unpaid period past
its due date. Hand-made fixtures only; no state's own return layout is
modelled. Added 2026-10-24: non-calendar periods. `--state NY` groups quarters as Dec-Feb, Mar-May, Jun-Aug, Sep-Nov (labelled by the month they end in, `2026-05`), and `--freq semiannual --state PA` groups Feb-Jul and Aug-Jan, both from search excerpts of the states' instructions, not the forms; `--end-month N` sets the month the year's first period ends in for any other schedule. Added 2026-10-23: `--state CA|TX|FL|NY|WA|IL|PA` presets the due day (CA month end, WA the 25th, the rest the 20th; recalled from the states' published schedules, not checked against each state's current calendar, so confirm yours). Added 2026-10-24: checked CA, TX, FL and WA against the states' own pages (search excerpts of cdtfa.ca.gov, comptroller.texas.gov, floridarevenue.com, dor.wa.gov; the hosts themselves are unreachable from the build container). One correction: Washington quarterly returns are due the last day of the next month (Q3 2026: 10/31/26), only monthly ones on the 25th, now what `--state WA --freq quarterly` gives (`stateDueDay`). Florida's collection allowance (2.5% of the first $1,200, max $30, electronic and timely) equals `--discount "<label>=2.5,30"`. Added 2026-10-24 (second slice): NY, IL and PA monthly and quarterly returns are due the 20th (search excerpts of tax.ny.gov, tax.illinois.gov, revenue.pa.gov; PA's only official page found was the 2025 REV-819, so confirm the current one). One gap found: NY quarters are Mar-May, Jun-Aug, Sep-Nov, Dec-Feb, not calendar quarters, and PA also has semiannual returns (Aug 20, Feb 20); neither is modelled, so `--state NY --freq quarterly` and `--state PA --freq annual` add a warning (`stateFilingNote`). Not tax advice.

**Refunds and write-offs.** A bank line for the exact amount left on a credit
note nobody applied (money out for a customer's credit, money in for a
supplier's), with the credit's number or the party's name in the description,
settles it: it posts to receivable or payable and the credit leaves `aging`.
`writeoff ID [--date D]` (CLI; `writeOff` in the engine; the page lists open invoices with a Write off button) moves an invoice's
unpaid balance to Bad debts (6900, added if missing): debit bad debts, credit
receivable, on the date given. Invoices only. Tests: "Refunding a credit note,
and writing off a bad debt".

## GST return worksheets (Canada, Australia)

`gstReturn(books, { region: "ca" | "au", from, to })` in `gstreturn.mjs` and `cli.mjs gst --region ca|au --from D --to D` reuse the VAT return's accounts (2100 tax charged, 1300 tax on purchases). Canada gets GST/HST return lines 101 (sales before tax), 103/105 (collected), 106/108 (input tax credits) and 109 (net), in cents. Australia gets the BAS labels G1 and G11 (both include GST), 1A, 1B and the net, in whole dollars. Zero-rated, exempt and GST-free sales, capital purchases (G10), HST provincial rates and quick methods are not split out, and the warnings say so. Hand-made fixtures only; check one against a real return. Test: `gstreturn.test.mjs`. The page does not show these yet.

## VAT return worksheet (UK layout)

`vatReturn(books, { from, to })` and `cli.mjs vat --from D --to D` fill the nine boxes of
the UK VAT return from the books: box 1 is the VAT on invoices (account 2100) less credit
notes, box 4 the VAT on bills (an input account, 1300, in the default chart as an asset; add it by hand to a chart saved before 2026-10-21)
less vendor credits, box 5 the difference (the CLI says pay or reclaim), boxes 6 and 7 the
sales and purchases without VAT in whole pounds (pence dropped, as the form asks). Bank
lines filed straight to 2100 or 1300 count in boxes 1 and 4; a purchase paid without a bill
is in box 4 but not box 7, which it warns about. Invoice basis only (a document counts on
its own date, not when paid); boxes 2, 8 and 9 (EU) are 0; flat-rate, cash accounting,
partial exemption and Making Tax Digital submission are not modelled. A worksheet to check
a return against, not a filing. The page shows the same boxes in a card, for the From and To dates in the Reports section. Test: engine.test.mjs, "VAT return"; page.test.mjs; the card and the recurring and forecast card are clicked through in headless Chromium by `eval/browser-click.mjs` (2026-10-21).

## Recurring payments and a cash forecast

`node cli.mjs --books books.json recurring` finds the payees whose lines come at
a steady interval (weekly, every two weeks, monthly, quarterly, yearly), with the
usual amount, the cost per year, the next expected date, and a status: **overdue**
(the date passed and nothing came), **lapsed** (over two intervals of silence),
or **amount changed** (the latest line is over 10% off the usual one: a price
rise or a double charge). `forecast [--days 90]` rolls the bank balance forward
day by day with those items (lapsed ones left out) and the open invoices and
bills at their due dates, and reports the lowest point and when the balance would
go below zero. Code: `recurring.mjs`, tests in `recurring.test.mjs` (month-end
stepping, price rise, lapsed client, forecast arithmetic in integer cents).

Limits, stated plainly: it needs three lines at a steady gap (a payee with
irregular days, such as the synthetic example's jittered dates, is not reported),
it assumes tomorrow for anything overdue, it does not know about payroll
calendars, tax due dates or seasonality, and it is checked on hand-written series
only, not on real statements. It is a heads-up, not a budget.

## Locking a closed period

`lockPeriod(books, date)` (CLI `lock DATE`, `lock off` to undo) closes the books
through a date. After that, statement lines dated on or before it are left out of
imports (reported in `problems`), `confirm` refuses to re-file them, invoices and
bills dated in it are not loaded and a write-off cannot be dated in it. It refuses
while a line in the period still needs an account, and the lock cannot move back
without unlocking first. Rules added later can still re-categorize
auto-posted lines in the period; the lock guards your edits and imports, not the
learning. Test: engine.test.mjs, "a locked period".

## Bank export shapes

`bank.mjs` reads the CSV layouts of Chase (checking and card), Bank of America
(summary block above the header, a "Beginning balance" row), Wells Fargo (no
header row at all), Amex (charges positive) and Capital One (Debit and Credit
columns). The sign of a card file is inferred from its payment rows unless you
pass `--invert`. See `fixtures/` and the last test in `engine.test.mjs`.

### Revolut and Wise CSV (2026-10-22)

`bank.mjs` also recognises a Revolut account statement (`Type, Product, Started
Date, Completed Date, ...`) and a Wise statement (`TransferWise ID, Date, ...`).
Revolut: only `COMPLETED` rows are imported (pending, declined and reverted rows
are listed in the import's problems), the date is the completed date, the `Fee`
column is taken off the amount so the running balance chains, and a file that
mixes currencies is flagged (import one currency account at a time). Wise dates
are read day first. `node --test neobank.test.mjs` checks both on
`fixtures/revolut-current.csv` and `fixtures/wise-statement.csv`, which are
hand-written from the column headings those services publish, with made-up rows.
No real export has been tried; the column lists are from memory of the public
layouts, so check them against a real download.

### Monzo, Starling and Mercury CSV (2026-10-22)

`bank.mjs` also recognises Monzo (`Transaction ID, Date, Time, Type, Name, ...`; day-first dates, the `Name` column is the payee), Starling (`Counter Party`, `Amount (GBP)`, `Balance (GBP)`; day-first, balance chain checked) and Mercury (`Date (UTC)`, `Status`; only `Sent` rows are imported, pending, failed and cancelled are listed in problems). Fixtures `monzo-business.csv`, `starling-business.csv`, `mercury-checking.csv` are hand-written from the published column headings with made-up rows; no real export has been tried, so check them against a real download.

### Etsy payment-account CSV (2026-10-24)

Amount is `--` on fee rows, so a file with `Fees & Taxes` and `Net` columns uses `Net` as the amount and `Title` as the memo (test in `hledger-samples.test.mjs`; layout from memory, rows made up).

### Relay, Brex, Chime and Bluevine CSV (2026-10-23)

These already read through the generic column matcher; this slice names them in `sniffBank` (Relay's `Date, Description, Amount, Balance, Account Name` was mislabelled Amex) and pins them with `fixtures/relay-checking.csv`, `brex-card.csv`, `chime-checking.csv`, `bluevine-checking.csv` and tests in `neobank.test.mjs` (Brex pending rows skipped, balance chains on Relay and Bluevine). Layouts are hand-written from remembered headings with made-up rows; no real export tried.

### PNC CSV (2026-10-22)

`bank.mjs` labels a `Date, Description, Withdrawals, Deposits, Balance` export as PNC. The columns already read through the generic Debit/Credit matching; the fixture `pnc-checking.csv` (made-up rows, header from memory of PNC's layout, no real download tried) is tested in `neobank.test.mjs` with the running-balance chain.

### Schwab Bank CSV (2026-10-22)

`bank.mjs` labels a `Date, Status, Type, CheckNumber, Description, Withdrawal, Deposit, RunningBalance` export as Schwab and reads the `RunningBalance` column for the balance chain. The fixture `schwab-checking.csv` has made-up rows and a header from memory of Schwab's layout; no real download was tried, so check it against one.

### Nationwide-style UK export (2026-10-23)

A UK building-society CSV with an account summary block above the header, `Paid out` / `Paid in` columns, quoted `£1,200.50` amounts and newest-first rows already reads through the generic path; `fixtures/nationwide-current.csv` (made-up rows, layout from memory, no real export tried) pins it in `neobank.test.mjs`, balance chain included.

### Australian and Canadian CSVs with no header row (2026-10-22)

`bank.mjs` reads two more header-less shapes by their layout: Commonwealth Bank style (`date, signed amount, description, balance`, day-first dates; three columns without a balance, ANZ style) and TD style (`date, description, withdrawal, deposit, balance`, month-first dates). `headerless.test.mjs` checks both on `fixtures/cba-no-header.csv` and `fixtures/td-no-header.csv`, hand-written with made-up rows from memory of those layouts; no real download was tried. Headed exports from RBC (CAD$ column, MM/DD dates, both description columns joined), Westpac (day-first, debit/credit, balance) and NAB (`DD Mon YY`, signed amount, transaction details) are read and labelled too (2026-10-22, `neobank.test.mjs`, hand-written fixtures from memory of those layouts, no real download tried; a USD$ row is read as written and the file is flagged as mixing currencies, 2026-10-23, `neobank.test.mjs`).

### Statement text pasted from a PDF

Many banks give a small business a PDF and nothing else. Open the PDF, select
all, copy, paste into a `.txt` file and import that (page file picker, or
`import statement.txt --account 1000`); `statementtext.mjs` reads it when the
file has no CSV header. A transaction is a line that starts with a date
(`03/09`, `Mar 9`, `9 Mar 2026`, `2026-03-09`; a second posting date is skipped)
and ends with an amount, optionally followed by a running balance. Lines that
wrap are joined, and page footers, totals and beginning/ending balance lines are
left out. The year comes from the statement period printed above the rows (or a
year range that crosses New Year), and a file with no year anywhere is reported,
not guessed. The direction of an amount comes from, in order: its own sign,
parentheses, trailing `-` or `CR`/`DR`; the change in the running balance; the
section heading above it ("Deposits", "Withdrawals", "Purchases", "Payments and
credits"). A row with none of those is read as money out and the import says so.
Card statements follow the account's own convention (a purchase is negative).

Verification: `fixtures/pasted-*.txt` are hand-written to look like these
statements (made-up rows, not a real bank's PDF). `node eval/pasted-roundtrip.mjs`
renders the synthetic studio's checking lines as pasted text with unsigned
amounts and a running balance (the hardest case) and reads them back: 5 seeds,
1,094 rows, 0 wrong in cents, date or description. That checks the parser
against the author's own rendering, not against a bank's real layouts; PDF text
from a two-column statement, or one where the extractor reorders columns, is not
covered. Scanned (image) PDFs have no text to copy.

## Switching from QuickBooks or Xero

`migrate.mjs` starts these books from the files the old system exports, with nothing retyped. `cli.mjs switch chart ACCOUNT-LIST.csv` reads a QuickBooks Account List (Account, Type, Detail Type ...; the title rows above the header are skipped) or a Xero Chart of Accounts (*Code, *Name, *Type ...): an account whose name is already in the chart is matched, receivable and payable keep the codes invoices and bills post to (1100, 2050), Xero's own codes are kept when free, and the rest are added with a type and a bank flag for Bank and Credit Card accounts. A type the reader does not know is reported and the account left out. Then `switch balances TRIAL-BALANCE.csv [--date D]` maps the trial balance's account *names* to those codes and sets opening balances (`opening.mjs`); the date comes from "As of December 31, 2025" in the title rows unless given. A name not in the chart stops the import and is listed; an imbalance goes to 3000, as with `opening`.

Verification: `migrate.test.mjs` (7 tests) on hand-written files laid out from the column names those products print. No real QuickBooks or Xero export has been tried, so a layout difference (a renamed column, a localised type name) is not covered; try a real export before relying on it.

## Prepaid expenses

`prepaid.mjs` spreads an up-front payment (a year of insurance, software or rent) over the months it covers. File the bank line to Prepaid expenses (1400, now in the default chart), then register it: `cli.mjs prepaid add "State Farm policy" --amount 2400 --date 2026-03-01 --months 12 [--into 6030]`. The ledger then books one entry a month through the latest month in the books: debit the expense account (Insurance 6030 by default), credit 1400. Integer cents, the last month closes the amount exactly. `cli.mjs prepaid [--as-of D]` lists paid, expensed and still paid ahead. A close check ("prepaid") flags 1400 when the ledger and the register disagree. Test: `prepaid.test.mjs` (hand-written ledgers only; cash-basis tax treatment of prepaids, such as the 12-month rule, is for you or your preparer and is not modelled). The page has a card for it (item, first month, amount, months, expense account; register with expensed and still-paid-ahead; 2026-10-22, clicked through in headless Chromium with `eval/browser-click.mjs`: add, register totals, one-month item refused).

## Fixed assets and depreciation

`assets.mjs` is a register for equipment. You file the purchase to Equipment
(1500) from the bank line as usual, then register it (`cli.mjs asset add "Standing desk" --cost 900 --date 2026-02-01 --life 48`, or a CSV with `cli.mjs assets FILE`). From then on the ledger books
depreciation each month, from the month placed in service through the month of the
latest line in the books: debit Depreciation (6950), credit Accumulated depreciation
(1590). Straight-line in integer cents (month k carries `floor(base*k/life)` less the
months before, so the last month closes the cost exactly, with an optional salvage
value), or `--expense` to write the whole cost off in the first month (the choice of
whether you may is yours or your preparer's). `asset dispose` removes the cost and
accumulated depreciation, books the proceeds and the gain or loss (4150). `assets`
prints cost, depreciated and net book value; the close checks flag an Equipment
balance that disagrees with the register (a purchase nobody registered is not being
depreciated); the Schedule C worksheet carries 6950 to line 13. This is book
depreciation. Tax depreciation is a separate worksheet (below); `assets.test.mjs` covers the arithmetic, the journal, disposal, the check,
line 13 and the locked period. The page has an "equipment and depreciation" card: add an asset, see cost, depreciated and net book value, sell or scrap it (clicked through in headless Chromium by `eval/browser-click.mjs`). The same card has a US tax depreciation (MACRS) section (2026-10-21): pick an asset, set class, Section 179 and bonus percent, read the year's worksheet (tax against book, with the engine's warnings) and download it as CSV (`taxDepreciationCsv`); clicked through in headless Chromium (a $10,000 5-year asset with $1,000 of 179 shows $2,800.00 in year one).

### Tax depreciation worksheet (US, MACRS)

`taxdepr.mjs` (2026-10-21) computes the schedule a US return uses, beside the
book schedule above. It posts nothing. Give an asset a tax treatment with
`cli.mjs asset tax FA-1 --class 5 [--s179 1000] [--bonus 40]` (class 3, 5, 7,
10, 15 or 20 years), then `cli.mjs taxdepr 2026` lists, per asset, the Section
179 amount, bonus, MACRS and total for the year next to the book depreciation.
Order: Section 179 off the cost, then bonus percent of the rest, then the IRS
half-year percentages (Publication 946, Table A-1) on what remains; cents are
rounded cumulatively so the years add to the basis exactly. In the year of
disposal MACRS takes half of that year's amount, then stops. `taxdepr.test.mjs`
checks that every table sums to 100% and has class + 1 years, the 5-year
percentages on 10,000, odd cents, 179 and bonus ordering, disposal, and bad
The Section 179 taxable-income limit now runs from the books (2026-10-21):
`taxableBusinessIncome(books, year)` is the year's net profit with book
depreciation on treated assets swapped for their MACRS and bonus depreciation;
`cli.mjs taxdepr 2026` applies it (override with `--income N`, override the
carry with `--carry-in N`) and the page has a "179 carried in" box. Left empty, the
carry comes from the books (2026-10-22, `s179Carryforward`): each earlier year from the first
election applies the limit to that year's book-derived income, and a year with no
bookkeeping counts as zero income and says so. Node test on a hand-written asset
(`engine.test.mjs`); no preparer's real carryforward schedule was compared.
Self-employment-tax deduction, disposal gains and other businesses' income are
not in that figure, so confirm it with a preparer.
input. The mid-quarter convention is computed (2026-10-21): when over 40% of the
year's basis (cost less 179) went into service October to December, every asset
placed that year uses a table for its own quarter (`MACRS_MID_QUARTER`,
generated by the declining-balance rule; the 5-year Q1 and Q4 rows equal the
printed ones as remembered, the 7-year rows are typed as printed (the generator was 0.01 off in
some years; test added), 10, 15 and 20-year rows may differ from the printed row by a
few hundredths of a point in a year, and none is checked against Pub 946
because the hosts were unreachable). Disposal in a mid-quarter year takes
12.5, 37.5, 62.5 or 87.5% of the year's amount by the quarter of disposal (half in a half-year year). Section 179 dollar limit and investment phase-out are checked (`s179Check`, 2024 to 2026, 2025 and 2026 figures cross-checked 2026-10-22 against several secondary sources, not the Rev. Proc. itself; excess is warned, not removed). It warns and does not compute: the bonus rate in force, business-use share
and listed property. The tables were typed from memory of Table A-1, then checked (2026-10-21) by
deriving each class from its rule (200% or 150% declining balance, half-year,
switch to straight-line) in a test: all six agree within the printed rounding.
That checks the typed digits, not the publication itself: check them before filing. Not on the page yet.

## Year-end close

`closeYear(books, 2025)` (CLI `close 2025 [--draws]`) moves the year's income and
expense balances into Retained earnings (3900) with one entry dated 2025-12-31,
and locks the books through that date. It refuses while a line dated in the year
still needs an account, a year already closed, or a year before a later closed
one. `close report 2025` shows the entry and retained earnings before and after;
`close reopen 2025` removes the latest close and restores the earlier lock.
`--draws` also closes owner draws (3100) and contributions (3010).

The entry is worked out from the journal each time it is read, not stored, so it
always equals what the year posted. `journal(books)` leaves it out on purpose, so the
profit and loss, cash flow, budget and Schedule C keep showing the closed year;
`journal(books, { withClosing: true })` adds it, and the balance sheet and the
QuickBooks, Xero, IIF and CSV exports use that (the exported books close the same
way yours do). Tests: `yearend.test.mjs` (9; hand-written ledgers). A fiscal year
is named for the year it ends in: `close 2026 --month 6` closes 2025-07-01 to 2026-06-30, dated
2026-06-30 (`fiscalSpan`; the month is kept on the closed-year row, must be the same for every close,
and the page has a "Year ends in" picker; 2026-10-22, 4 new tests on hand-written ledgers, leap-day
February covered; the tax worksheets (Schedule C, SE tax) stay calendar-year, as US sole proprietors file). The page has a "year-end close" card (year, draws tick box, Close year, Reopen latest, table of closed years; clicked through in headless Chromium with `eval/browser-click.mjs`, 2026-10-21; a year with unfiled lines is refused).

## Inventory (cost of goods sold)

`inventory.mjs` (2026-10-22): stock bought for resale is filed from the bank to Inventory (1450, now in the default chart); `inventory buy MUG --qty 25 --amount 250 --date 2026-01-05` records the quantity and total cost, `inventory sell MUG --qty 10 --date D` moves that stock's cost to Cost of goods sold (5000) as a derived journal entry, and `inventory adjust` writes off lost or damaged stock at cost. Costing is FIFO by default or a moving average (`inventory method avg`); a part layer is pro-rated half up and the last unit clears the layer exactly, so cost of goods sold plus stock on hand always equals what was bought (tested, including 2.5 and 1.1 unit quantities, stored in thousandths). Selling more than is on hand, a purchase with no amount and a move in a locked period are refused. `inventory` lists on hand, unit cost, value, sold and COGS per SKU; a close check (`inventory`) flags account 1450 differing from the register, which catches a stock purchase paid but never entered, and the reverse. Revenue still comes from the bank line or invoice; this module books only the cost side, so gross margin on the profit and loss is real. Purchase returns (2026-10-22): `inventory return MUG --qty 3 --date D` sends stock back to the supplier at the newest layer's cost under FIFO (the average under `avg`), books no cost of goods sold, and the supplier's refund, filed to 1450, brings the account back to the register (tested: 3 of 20.00 units returned, then a FIFO sale takes the oldest layer). Tested with hand-written moves and a CLI run (`inventory.test.mjs`, 8 pass); no real stock sheet tried. Not modelled: landed cost (freight, duty) apportioned to units, sales returns back into stock, lower of cost or net realizable value, several locations, units of measure, tax-basis inventory methods (UNICAP, LIFO). The page has a card for it (move, SKU, date, quantity, total paid, costing method; register with on hand, unit cost, value and cost of goods sold; 2026-10-22, clicked through in headless Chromium with `eval/browser-click.mjs`: buy 100 for 450.00, sell 40 leaves 60 worth 270.00 and 180.00 cost of goods sold, selling 500 refused).

## Loans

`loans.mjs` (2026-10-22): a fixed-rate, monthly, equal-payment loan. `cli.mjs loan add Van --amount 20000 --rate 6 --months 36 --first 2026-02-01` computes the level payment (608.44, the textbook figure, checked in the test) and the schedule; `loan apply LN-1` splits each unfiled bank outflow that equals a scheduled payment, within 5 days of its due date, into interest (6040) and principal (2200) as an ordinary split, so no one types the split each month; `loan` lists balance by schedule and the next payment; `loan LN-1` prints the schedule. Interest is balance x rate / 12 rounded to the cent, and the last payment clears the balance. Extra principal (2026-10-22): `loan extra LN-1 --amount 2000 --date 2026-06-10` records a prepayment; it comes off the balance after the last instalment on or before its date, the same payment then clears the loan sooner (the schedule has fewer rows and less interest), and `loan apply` files the matching bank outflow to 2200 (`loans.test.mjs`, hand-written case: 20,000 at 6% over 36 months with 2,000 extra in June ends early; no lender's real prepayment statement compared). Not modelled: balloon, interest-only periods, variable rates, day-count interest, prepayment penalties, and a lender's own schedule may differ by cents (use `--payment` to match its payment). `loan check LN-1 lender.csv` (2026-10-23, `checkLenderSchedule`) compares a lender's own amortization table (header row with date, payment, interest, principal, balance in any order) with the computed schedule row by row, prints the rows that differ by more than 2 cents and a plain-words guess: rounding only, a different payment (and the `--payment` to re-add the loan with), interest off from the first row (day-count or rate), or agreement through payment N then a fee, rate change or extra payment. It never edits the loan. Tested on tables derived from the schedule itself with one deliberate change each (`loans.test.mjs`); no lender's real table tried. Tested with hand-written statements (`loans.test.mjs`); no lender's real schedule compared. The page has a loans card (terms form, register, a button that splits matching bank payments; 2026-10-22, clicked through in headless Chromium with `eval/browser-click.mjs`: add, register, nothing to split, bad rate refused).

## Payroll runs (US)

`payroll.mjs` (2026-10-22): a payroll provider's pay-run report (Gusto, ADP, Paychex, Square Payroll and similar; company totals or one row per employee, grouped by pay date; columns matched by name: pay date, gross, net, federal income tax, social security and medicare withheld, state tax, other deductions, employer social security and medicare, FUTA, SUTA) becomes books. `payroll FILE.csv` books each run (Dr Wages 6150 for gross, Dr Payroll taxes and benefits 6155, added on first use, for the employer's share, Cr Payroll liabilities 2300 for both) and finds the bank outflows that paid it: net pay (3 days before to 5 after the pay date), the federal deposit (withheld tax plus both FICA shares, within 45 days; a month's runs paid as one deposit are matched against the month's sum) and state withholding. `--apply` files the unambiguous lines to 2300, so 2300 shows what is still owed. A row whose net pay is not gross less deductions is refused and named; the same report twice changes nothing. `payroll` lists runs and what is still owed; `payroll 940 2026` prints a Form 940 worksheet (2026-10-22: FUTA wages capped at $7,000 per employee at the 0.6% net rate, per-employee check, quarterly deposit carry over $500; hand-made registers, state credit reduction not modelled); `payroll w2 2026` (2026-10-22) sums each employee's year into W-2 boxes 1 to 6 and the state tax, box 3 capped at the wage base, warning when other deductions may be pre-tax (box 1) or box 4 is off 6.2%; registers imported before this change lack per-employee withholding and need re-importing; hand-made fixtures only. `payroll 941 2026 1` prints a Form 941 worksheet from the register (wages, income tax withheld, both shares of social security and medicare) and warns when a run's FICA is off 6.2% / 1.45% by more than a cent per employee. With one row per employee it applies the year's Social Security wage base (2023-2026 built in) to each person's year-to-date wages, so tax that should have stopped, or a taxable-wage line 5a figure, is checked per employee (2026-10-22, hand-made registers). Also per employee (2026-10-22): the 0.9% Additional Medicare Tax on wages over $200,000 in the year, withheld from the employee only, is checked (a missing one or one charged to the employer is flagged) and the 941 worksheet prints line 5d. A provider's trailing "Total" row is skipped (it would double every run) and a pay date printed only on a group's first row fills down (2026-10-23, from the habit of such exports, not a sampled file). Tested with hand-written registers (`payroll.test.mjs`, 8 pass) and run through the CLI; no real provider export has been tried, and tips, state unemployment wage bases and the 941 adjustments are not modelled. `payroll 940 2025 --state CA` (2026-10-22) adds the FUTA state credit reduction on taxable wages (California 2025, 1.2%, from the November 2025 DOL announcement as reported by Bloomberg Tax, UHY and EY; other states or years: `--credit-reduction PCT` from the DOL list; the Benefit Cost Rate add-on is not modelled). `payroll deposits 2026 [--schedule monthly|semiweekly]` (2026-10-22, `deposits.mjs`, 6 tests on hand-made registers) works out the Publication 15 deposit schedule (lookback July 1 to June 30 against $50,000, the $100,000 next-day rule, monthly 15th, semiweekly Wednesday/Friday as the third business day, weekend and federal-holiday rollover, the $2,500 quarterly de minimis), then uses the bank-line matching to say whether each deposit was on time or late, with the 2/5/10% penalty tier as an estimate. `payroll 941 YEAR Q --schedule-b` (2026-10-22) also prints Schedule B: the quarter's liability by day of month the wages were paid, with each month's total (hand-made registers). `payroll reconcile 2026` (2026-10-22) ties the four quarters' Form 941 figures to the W-2 totals a W-3 would carry (wages, income tax, social security wages and tax, Medicare wages and tax) and names any that differ beyond a cent per person-run; hand-made registers only. Not payroll or tax advice. The page has a card for it too (2026-10-22: book the runs, post the matched bank lines, Form 941 worksheet; wired and tested for ids and imports, not driven in a browser).

### Form 1099-K against the payout report and the books (2026-10-23)

A processor's 1099-K reports gross payments (before refunds and fees, sales tax included), while the books carry income net of both, so they never agree and the gap is what a notice asks about. `form1099k FILE.csv --year 2026 --gross 94000.00 [--months J,F,...,D] [--sales 4000]` (`form1099k.mjs`, `reconcile1099K(report, {gross, months}, year, books)`) lays out the bridge: gross the report shows for the year, box 1a, the gap, refunds and fees the form does not net, optional boxes 5a-5l month by month (a typo in their sum is caught), and what account 4000 should hold if every payout was split (gross less refunds). Notes name likely causes: export range, UTC year boundaries, unsplit payouts, a form that looks netted. `node --test ventures/ai-bookkeeper/form1099k.test.mjs`, 5 pass, on hand-written reports; no real 1099-K was tried, and the IRS thresholds and reportable-transaction rules change by year, so check the instructions for the year. No page card yet; a worked-example page, `form-1099-k-reconciliation.html` (2026-10-23), walks the stripe-payouts fixture from box 1a ($940.00) to sales ($850.00) to deposits ($708.00), pinned by a test.

### Payroll header probe (2026-10-23)

Ten hand-written provider-style headers found five faults in `readPayrollRegister`, all fixed (`payroll.test.mjs`, 24 pass): a title or period block above the header row made the file unreadable; a report listing kinds of pay (regular, overtime, bonus) with no gross column was refused (they now add up to gross); `Social Security (EE)`, `Medicare (ER)`, `...Tax` and `Withholding Tax` header spellings went unmatched; two columns feeding one field (a 401(k) and a health plan) kept only the last, so net pay failed to tie; `Last Name` and `First Name` columns gave no employee, so W-2 rows were lost. A reversal row (negative gross) now says so instead of reporting a net-pay mismatch. Layouts are recalled, not sampled from real exports. Landed after: `Additional Medicare` as its own column adds to Medicare withheld; a single `Total Employee Taxes` column (no split) is now read by taking Social Security at 6.2% and Medicare at 1.45% of gross and booking the rest as federal income tax, with a `notes` entry saying so (`payroll.test.mjs`, 26 pass, hand-written headers). The split is a guess when pre-tax benefits or the wage base apply, so prefer a report with split columns.

## Not modelled

Payroll filings (runs are booked, see below, but no filing, wage bases or state rules) and sales tax filings, inventory across several locations or with serial numbers (single-location stock is below), foreign-currency invoices and bills are modelled (see below, 2026-10-22; credit notes and part-payments in a foreign currency are not) (foreign bank accounts too; the VAT worksheet is UK-layout, invoice basis), a scanned (image-only) bank-statement PDF. A statement PDF with a text layer is read by `import FILE.pdf` through pdftotext, and on the page by `pdftext.mjs`. Receipts can be a PDF or a photo (see below).

## Foreign-currency bank accounts

`fx.mjs` (2026-10-22): a EUR, GBP or other account in books kept in one currency. `fx account 1020 EUR` marks a bank account; `fx rate EUR 2026-03-01 1.0850` or `fx rates FILE` (lines `date,CUR,rate`, base units per one foreign unit) supply rates by hand, with no feed and no network. `import` then keeps each line's own amount (`foreign`) and books it at the latest rate on or before its date; a line with no rate is left out and named, never guessed. Each month end the account is remeasured from its foreign balance at that month's rate and the difference goes to Foreign exchange gain or loss (6190, added on first use; a gain shows as a negative expense), so the books balance and the entries cannot drift. The statement's closing balance is reconciled in the account's own currency. `fx` lists balance, rate, amount carried and gain or loss booked. Conversion is exact (BigInt, rate to six decimals, half away from zero). Tested with hand-written statements and rates (`fx.test.mjs`, 6 pass) and clicked through the CLI; no real multi-currency bank file or central-bank rate table tried. Transfers between a foreign and a base account (2026-10-22) are paired when the two sides are within 3% of each other (the bank's rate against the typed one) and within the transfer window; each account carries its own side and the difference is booked as realized gain or loss to 6190 (`fx.test.mjs`, hand-written statements; a transfer between two different foreign accounts is not paired). Foreign invoices and bills (2026-10-22): add `currency` (and optionally `rate`, base per one foreign unit) columns to the document CSV; amounts are in that currency and the books carry them at the rate on the document date (`fx rate` or the column; no rate means the document is refused and named, never guessed). A base-currency bank line within 3% of the booked amount that names the number or party settles it, and the difference becomes a derived entry to 6190 (realized loss, or gain on a bill paid for less), so receivable or payable clears exactly. Tested with hand-written documents (`fx.test.mjs`, 10 pass), no real invoice export or bank rate; Open foreign invoices and bills are now revalued at each month end (2026-10-22, `fx.mjs` `docRevals`): the foreign total at that month's rate against the booked amount, the change to 6190 against receivable or payable, and the payment then realizes only the difference from the revalued carrying amount (so gain and loss are never counted twice; `fx.test.mjs`, 12 pass, hand-written rates and documents). Documents with credits, write-offs or part-payments are not revalued. Not modelled: foreign credit notes, part-payments in a foreign currency, foreign payments into a foreign bank account. Not modelled: realized gain by lot, the tax treatment of foreign gains. The page has a card for it too (2026-10-22: book the runs, post the matched bank lines, Form 941 worksheet; wired and tested for ids and imports, not driven in a browser).

## Receipts matched to bank lines

`receipts FILE` also takes a PDF with a text layer (through `pdftotext -layout`) or a photo (through `tesseract`, or any command in `RECEIPT_OCR_CMD` such as `myocr --lang en {file}`); digit look-alikes OCR leaves in amounts and dates (`l2.5O`) are repaired before parsing (`ocr.mjs`). Node tests use stubbed tools and hand-written damaged text; no real scan or photo was run (neither tool is installed in the build container).

`node cli.mjs --books books.json receipts receipts.txt` reads receipt text
(blocks split by a `---` line) into merchant, date, total and tax, and pairs
each with the bank or card outflow that paid it: the same amount (or up to 25%
more, a tip, when the payee words agree), the bank date from 3 days before to
7 after the receipt date. Best pairs go first (shared payee words, exact
amount, closer date); a pair with no shared words needs an exact amount within
2 days and is marked "name differs: check". The report then lists receipts
with no bank line and the spending at or over `--min` (default 75) with no
receipt, leaving out lines filed to wages, owner draws and transfers.
`receipts --tax` sums the tax printed on receipts by month and by the account
the paid line was filed to (receipts with no tax line are listed apart, not
counted as zero; `taxOnReceipts` in `receipts.mjs`, also on the page).
`receipts attach RID LINEID`, `detach RID` and `remove RID` fix a pair by hand;
a receipt printed in another currency (a symbol such as € or £, or a code such as EUR) is
paired by rate: one you give (`rates`, or `fxRates` in the books file), else the
median of that currency's earlier pairs, within 6% for card fees; with no rate
known the payee words must agree. The rate each line implies is kept, and tax
and item splits for that receipt are converted at it. Hand-written fixtures
only (decimal-comma receipts are read; see below).
The same receipt twice is kept once. Item lines (words, then a price) are kept
when they add up to the total with the printed tax and tip, or already include
the tax; a receipt with a discount line or any other gap is not used for a
split, and says so. `receipts split RID [--other CODE] [--apply]` shows the
bank line divided by item: each item goes where the categorizer puts its own
words (your rules and past filings, then the built-in keywords), else to
`--other`, else to the account the merchant's name suggests; sales tax is shared
over the accounts in proportion (largest remainder, cents add up) and a tip
joins the biggest one. `--apply` posts it as a split (one account for
everything is filed plainly). `--fix WORD=CODE` (repeatable) places any item whose words contain WORD; items placed by `--fix` or `--other` are learned under their own words on `--apply`, so the next receipt with them needs no flag (hand-written receipts only; CLI, not the page). The page shows a "Split by items" button under the matched table when a receipt's items fall in two or more accounts (clicked through in headless Chromium). Tried on hand-written receipts only, no real ones,
no foreign currency. Engine: `receipts.mjs`; kept in the books
file, never in the journal. The page has a card for it (paste, read, tables;
clicked through in headless Chromium with `eval/browser-click.mjs`). Receipts
are read with regular expressions: a total is the last "total / amount due"
line that is not a subtotal, tip or change line, else the largest amount (and
the note says so). Checked by node tests on hand-written receipts in US/UK
layouts and a few hand-written German-style ones only, not on real receipts or
OCR output, which will have misread characters; receipts for several bank lines
are not handled. Decimal-comma receipts (12,50 or 1.234,56), dotted day-first
dates (04.05.2026) and German, French, Dutch or Italian total and tax words
(Gesamt, Summe, Zwischensumme, TVA, MwSt, IVA, BTW) are read too; the amount
style is chosen per receipt by which form is more common.
Many bookkeeping products (Dext, Hubdoc, Expensify) do this with image OCR and
a subscription; this does the matching and the missing-receipt list on your
own machine from text you already have.

### Measured on 1,000 real receipts (CORD-v2)

Until 2026-10-24 the receipt reader had only met receipts an agent wrote. CORD-v2
(Clova AI, CC BY 4.0) is 1,000 photographed Indonesian shop and restaurant
receipts whose text and fields were corrected and labelled by hand; the derived
text and labels are in [`eval/cord/`](eval/cord/README.md). The score is
whether `parseReceipt` reads the labelled total and tax exactly.

| Split | Receipts with a labelled total | Total right, before | Total right, after | Tax right, before | Tax right, after |
|---|---|---|---|---|---|
| train (rules changed looking at these) | 779 | 42 (5.4%) | 741 (95.1%) | 9 of 352 | 316 of 352 (89.8%) |
| validation (also looked at) | 98 | 2 (2.0%) | 96 (98.0%) | 0 of 47 | 45 of 47 |
| **test (held out, scored once before and once after)** | **95** | **4 (4.2%)** | **89 (93.7%)** | **0 of 41** | **37 of 41 (90.2%)** |

What was wrong, and what changed in `receipts.mjs`:

- **Whole-unit amounts were invisible.** Rupiah (and yen, won) are printed
  `45,500`, `60.000` or `91000`, with no decimals; the reader only knew `12.50`
  and `12,50`, so it found no amount on 87% of these receipts. A third amount
  style, chosen per receipt like the decimal comma, reads them: it is used when
  grouped whole amounts outnumber amounts with decimals, or when there are no
  decimals at all. A number glued to letters (`PB1`, `xx7730`), a percentage
  or part of a date, time or phone number is not an amount.
- **Total words**: `TL`, `DUE`, `GRANDTOTAL`, `Netto`, `Jumlah`, and a total word
  with its amount alone on the next line. `Total Qty 16` and `Total Item 5` are
  counts, not totals.
- **Tax words**: `PB1` and `P.Rest`/`P.Resto` (Indonesia's restaurant tax), `PPN`
  (its VAT), `Pajak`, and `Tax Total`; `Dasar Pengenaan Pajak` (the taxable base)
  is not tax.

What it does not show: OCR. The text is hand-corrected, so a phone photo read by
tesseract will do worse; merchant names and dates are masked in CORD, so the
merchant and date readers are still unmeasured on real receipts. The six test
misses: a `Total Kembalian 0` (change) line read as the total, `SUB, TOTAL` with
a stray comma, and four receipts with no total word where the largest amount (the
cash handed over) was taken. Score it: `node eval/cord-receipts.mjs
eval/cord/test.jsonl [--misses]`; `cord-receipts.test.mjs` pins the table.

## Budget against actual

`node cli.mjs --books books.json budget 6130 200` sets a monthly budget of $200
for account 6130 (amount 0 removes it); it is kept in the books file as integer
cents. `budget` alone sets the budgets beside what was posted for the latest
month (or `--from D --to D`; a period of several months multiplies each monthly
budget by the calendar months it touches). Each account shows budget, actual,
variance, percent and a status: `better` or `worse` for profit (income over
budget helps, expense over budget hurts), `on budget`, or `unbudgeted`.
Engine: `budgetVsActual`, `setBudget` in `budget.mjs`; `--json` gives the data.
Checked by node tests on hand-written ledgers only; whole-month scaling means a
part-month period is compared against a full month's budget. The page has a card for it
(pick an account, type a monthly amount, read the table for the From and To
dates; clicked through in headless Chromium with `eval/browser-click.mjs`).

### Processor payouts split into sales and fees (2026-10-22)

A Stripe deposit lands in the bank as one lump (970.00 for 1,000.00 of sales less
30.00 of fees), so books built from the bank alone understate sales and hide the
cost of taking cards. `node cli.mjs --books books.json payouts stripe-payouts.csv`
reads the processor's payout reconciliation CSV (columns matched by name:
`automatic_payout_id`, `automatic_payout_effective_at`, `reporting_category`,
`gross`, `fee`, `net`), finds the bank line each payout became (a positive,
unsplit line equal to the payout's net, from 2 days before to 7 days after the
payout date, nearest first, each line used once) and, with `--apply`, splits it:
charges to 4000, refunds to 4000 (negative), disputes and fees to 6010 (override
with `--sales`, `--refunds`, `--fees`, `--disputes`). Rows not yet paid out are
listed as pending; a row whose net is not gross less fee is refused as damaged;
a payout already split is reported as done, so a re-run posts nothing twice;
two lines that fit equally well are skipped, not guessed. Engine: `payouts.mjs`
(`--json` gives the plan). Checked by node tests and one CLI run on a hand-written
file in the documented layout (`fixtures/stripe-payouts.csv`): no real Stripe
export has been tried. Shopify Payments' payout-transactions column names
(Transaction Date, Type, Amount, Fee, Net, Payout Date, Payout ID) read through
the same aliases, from the documented layout and a hand-written fixture only.
The Stripe column names were checked against Stripe's published payout_reconciliation.itemized.5 schema on 2026-10-22 (all match); that check found `stripe_fx_fee`, `tax_fee` and `contribution` (Climate) falling into Other income, now booked as fees, and `partial_capture_reversal` now a refund. Stripe reserved funds (`risk_reserved_funds`, `reserve`; 2026-10-22) now post to Payment processor clearing 1200 (a hold negative, a release positive; role flag `--reserve`) instead of Other income; transfer categories are skipped; still no real export.
A PayPal activity CSV (Date, Time, Type, Status, Gross, Fee, Net, Transaction ID)
has no payout id, so completed rows since the previous "withdrawal" row are
grouped under it (fees read as negatives; pending rows listed as pending). A
withdrawal is split only when those rows net exactly to it; otherwise a balance
was carried over from before the report and it is listed under problems, not
guessed. Hand-written fixture only, no real PayPal export tried. Square's Payouts API
entries (ListPayoutEntries JSON, 2026-10-22: `payout_entries` with `payout_id`, `type`,
gross/fee/net money in minor units, fee sign read either way) read through the same
command (CHARGE sales, REFUND refunds, fee types fees, other types other income;
fixture `fixtures/square-payout-entries.json`, 2 tests; hand-made from the published
entry shape, type names checked against Square's ActivityType list 2026-10-25, so a fee refund books as a fee and holds, savings and loans as balance movements; no real API response tried). Square's
dashboard Transactions CSV (2026-10-23: `Deposit ID`, `Deposit Date`, `Event Type`, `Total Collected`, `Fees` as negatives, `Net Total`) reads too, grouped by deposit; payments are sales and refunds refunds, and, since 2026-10-23, tax and tip inside Total Collected are split out of it: tax to Sales tax payable 2100, tips to the sales account unless `--tips CODE` (say a staff liability) is given (`payouts.test.mjs`; fixture only). Layout from memory of Square's export, one hand-written fixture (`fixtures/square-transactions.csv`), no real export. Etsy's payment-account ledger CSV (Date, Type, Title, Amount, Fees & Taxes, Net; 2026-10-22) is grouped under each Deposit row the way PayPal is (newest-first order handled, split only when the rows net exactly to the deposit); layout from memory of Etsy's help pages, one hand-written test, no real export. Airbnb's host transaction-history CSV (Reservation, Adjustment and Payout rows; 2026-10-23) reads the same way, with a worked page `airbnb-bookkeeping.html` for short-term-rental hosts; layout from memory, one hand-written fixture, no real export.

**Amazon seller settlements** (2026-10-22): the settlement report, flat file V2 (tab-delimited; `settlement-id`, `deposit-date`, `total-amount`, `transaction-type`, `amount-type`, `amount-description`, `amount`), reads through the same `payouts` command. The summary row's total is the deposit; item price, shipping and promotions go to sales (refunds and promotions negative), tax collected and marketplace-facilitator tax withheld to Sales tax payable 2100 (they net to zero where Amazon remits), advertising to 6000, commissions, FBA, subscription and storage fees to 6010, reimbursements to other income. New role flags `--tax` and `--ads`. A settlement is split only when its rows add up to the summary total; a reserve line or a mismatch is listed under problems and left alone. Layout written from Amazon's published column names and a hand-written fixture (`fixtures/amazon-settlement-v2.txt`, 2 tests in `payouts.test.mjs`); no real settlement file tried. `Promotion` rows whose description names tax (`TaxDiscount`) go to tax, not refunds (2026-11-03; Amazon's reference pages 403 from the sandbox, so the names are from the fixture). The Seller Central date-range transaction CSV (2026-10-22; note lines, then `settlement id`, `type`, `product sales` ... `selling fees`, `fba fees`, `other`, `total`; dates like `Mar 2, 2026 9:15:02 AM PST`) is read too: a `Transfer` row is the deposit, a settlement is split only when its other rows add up to it and each row's columns add up to its own total, and a settlement with no transfer yet is pending (fixture `fixtures/amazon-date-range.csv`, 2 tests; hand-written from the published column names, no real export tried).
Shopify's full payout-transactions header (Order ID, Card Brand, Payout Status, Available On ... Business Entity Name; written from memory of the export, 2026-10-22) reads too; `chargeback_fee` and `dispute_fee` rows now post as fees and hold/withdrawal types as disputes instead of other income (1 test, no real export).
A worked-example page, `shopify-bookkeeping.html` (2026-10-23), is backed by `fixtures/shopify-payout-transactions.csv` (synthetic, hand-written): two payouts split into $495.50 of sales and $76.95 of fees and chargeback loss, one order pending; a test pins every figure on the page.
The page has a card for it (paste or pick the CSV, match, post), clicked through
in headless Chromium.

### Reconcile to a paper statement (2026-10-22)

`node cli.mjs --books books.json reconcile 1000 --date 2026-03-31 --balance 691.50`
ties an account to the closing balance printed on a statement (a card statement's
owed amount is typed as printed, positive). Exit 0 when the books agree, 1 when not.
When they differ it names the likeliest cause, strongest first: lines still waiting
for an account that make up the whole gap; one booked line equal to the gap (not on
the statement, or entered twice); one line equal to half the gap (booked with the
wrong sign); a pair of lines that sum to it; a gap divisible by 9 (two digits swapped
when typing an amount); lines dated within 5 days after the statement date. It only
points at lines; it never edits the books. Engine: `reconcile` in `reconcile.mjs`
(`--json` gives the data). Checked by node tests on hand-written ledgers only; the
hints are a search over lines, not a proof, and no real statement was tried. The page has a card for it (account, statement date, closing balance; the difference and the hints in a list; clicked through in headless Chromium with `eval/browser-click.mjs`, 2026-10-22). It
complements the automatic check in `checks`, which needs a closing balance in the
imported file.


## This period against the last

`node cli.mjs --books books.json compare` (engine: `compareProfit`, `compare.mjs`)
sets the profit and loss for the latest month beside the month before: income,
expenses and net, then every account that moved, largest change first, with the
percentage, whether it is new or gone, and whether the move lowers profit
(income down or expense up). For any other pair of periods pass all four of
`--from D --to D --vs-from D --vs-to D`; `--json` gives the same data. Lines
still in review are in neither period, and the output says how many. It reports
the difference and does not explain it: a 78% rise in sales is a question for
the owner, not a finding. Node tests on hand-built books and the built-in example
pass. Not on the page yet.

## Anomalies

`node cli.mjs --books books.json anomalies` (engine: `findAnomalies`, `anomalies.mjs`)
lists bank and card lines worth a second look before a close: a repeat of the
same payee and amount within seven days (double charge or a line imported
twice), an amount far above that payee's usual (median plus six robust spreads
and at least 2.5 times the median, with four or more other lines), and a large
first line from a payee never seen before (over five times the book's median
outflow; a payee counts as new only if its first word is unique, and transfers, draws and payroll are skipped). On the synthetic example it flags nothing. Each comes with its reason. Node tests on hand-written series pass;
the thresholds are judgment calls, not tuned on real books, and a flagged line
is often fine.

## Next

- PayPal payments sent, 2026-10-25 (`payouts.mjs`, 1 test): an activity row such as "Express Checkout Payment" with a negative gross is a purchase the account holder made, but it was grouped as a sale. It now books as other with a `problems` note asking for recategorisation. PayPal's transaction-code spec was not reachable from the cloud proxy (not in `paypal-rest-api-specifications/openapi` under the names tried), so type names beyond those in the fixtures are still unverified.
- A real merchant tail, 2026-10-25 (`eval/hcb-memos.mjs`, 1 test in `hcb-memos.test.mjs`): Hack Club's HCB transparency feed (`hcb.hackclub.com/api/v3`, transparent organisations only; it 403'd on 2026-10-24 and answers now; fetched at run time, never copied; card-charge memos only, no names kept). Memos have no category, so this measures coverage, not "right". Organisations 0-39 (2,056 card charges): built-in keywords suggested 34.9%. Rules for the merchants that were plainly one account (Zoom, Porkbun, Namecheap variants, hotels and inns, H-E-B, airports, DigiKey/Mouser/JLCPCB/McMaster, FedEx, Shiprocket and others) were written looking at that list, taking it to 50.2%. Organisations 40-99 (1,309 charges, not looked at while writing): 23.8% before, 33.2% after. Mixed-purpose retail (Walmart, Costco, CVS, Amazon, 232 of the first set) is left blank on purpose. I read the hit list and saw no wrong account, but that is one reader's judgement, not a score. Still wanted: a ledger with labels over this kind of tail.
- Square ActivityType checked against Square's OpenAPI spec, 2026-10-25 (`payouts.mjs`, 1 test extended): `square/connect-api-specification` `api.json` on raw.githubusercontent.com lists the enum; 6 names were not in `SQUARE_KIND`. `ESCHEATMENT` (unclaimed property remitted to a state) and `PERCENTAGE_PROCESSING_ENROLLMENT`/`_DEACTIVATION` (repayment-balance movements) were falling to other income and now book as balance movements; `LOCAL_OFFERS_FEE` already read as a fee. `OTHER_ADJUSTMENT` and `REDEMPTION_CODE` stay other, since the spec does not say which way they point. Meanings are the spec's one-line descriptions only.
- Stripe balance-transaction types from Stripe's OpenAPI spec, 2026-10-25 (`payouts.mjs`, 1 test): docs.stripe.com still 403s from cloud sessions, but `stripe/openapi` `spec3.json` on raw.githubusercontent.com is reachable and lists the 52 `type` values (names only). 13 were unmapped. `inbound_transfer`, its reversal, `tax_fund` and `payment_unreconciled` now book as clearing and `payment_reversal` as a refund; `issuing_*`, `obligation_*` and `stripe_balance_payment_debit*` stay other income because the name does not say cost or clearing. No real Stripe export tried yet.
- Shopify Payments transaction types checked against Shopify's Admin GraphQL reference (`ShopifyPaymentsTransactionType`, 116 values, fetched 2026-10-25; the page gives names only, so each meaning is read from its name), 2026-10-25 (`payouts.mjs`, 1 test): 97 of the 116 fell to other income, among them shipping labels, referral fees, billing debits, duties, loan remittances and merchant transfers. They now book as fees, refunds, disputes, tax, sales or clearing; anomaly, collections, ads-publisher, Markets Pro, goodwill and Shopify Collective/Source entries stay other income because nothing in the name says what they are. No real Shopify payout export tried.
- Stripe `currency_conversion`, 2026-10-25 (`payouts.mjs`, 1 test): now clearing, not other income, since a conversion between currency balances moves money and nets to zero. The other unbooked names (`revenue_share`, `tax_withholding`, `obligation_*`, `stripe_balance_payment_debit`) stay unmapped: docs.stripe.com was unreachable from the cloud session, so their meaning was not checked and none was guessed.
- Stripe's wide settlement layout, 2026-10-25 (1 test in `payouts.test.mjs`): the three Stripe test reports in Wikimedia's SmashPig repo (`PaymentProviders/Stripe/Tests/Data/`, licence not confirmed, so fetched with curl and never copied) use Stripe's 27 to 36 column export with bracketed `payment_metadata[...]` and customer columns. `payouts` reads all three and splits each payout; none matched a bank line because no bank file came with them. They are small hand-made rows, so this checks the layout, not real volume. A real account's export is still wanted.
- Stripe reporting categories checked against Stripe's own reference, 2026-10-25 (`payouts.mjs`, 1 test in `payouts.test.mjs`): the payout reader's table was written from memory and lacked 17 categories the reference lists (payout minimum balance and payment network reserve holds and releases, `transfer_refund`, `charge_failure`, Climate purchases and refunds, Issuing holds, `unreconciled_customer_funds` and older transfer types). They used to fall to "other income"; holds and releases are now clearing, Climate a fee, a failed charge a refund. Still unbooked by name: `revenue_share`, `tax_withholding`, `obligation_*`, `currency_conversion`, `stripe_balance_payment_debit`; a real export would show which matter.
- A third real set, 2026-10-24 (`eval/hledger-finance.mjs`, 1 test in `real-nonprofit-bank.test.mjs`): the hledger project's own Open Collective books (simonmichael/hledger_finance `oc.journal`, no licence file, fetched at run time and never copied). Not a long merchant tail as hoped: 1,052 sponsor contributions (`Monthly contribution from X (Bronze)`) and 59 bounty payments (`Expense from X - Regression finder bounty for #N`), 2 misc. Before: 0 of 1,052 income lines and 3 of 59 bounties suggested. After two keyword rules written *after* reading this data (so it is tuned on itself, not held out): 1,052 of 1,052 income lines to 4000 and 52 of 59 bounties to contractors 6020 (2 land on bank fees and 1 on software, where the title mentions a PayPal fee or the Claude API; 4 stay blank). Owner contributions still go to 3010. Still open: a real ledger with a long merchant tail.
- A second real set, held out by payee, 2026-10-24 (`eval/hackclub-ledger.mjs`, 2 tests in `real-nonprofit-bank.test.mjs`): hackclub/ledger `main.ledger` (a US nonprofit's own books 2015-2018, Open Data Commons licence, fetched with `curl https://raw.githubusercontent.com/hackclub/ledger/master/main.ledger` and never copied; raw.githubusercontent.com is reachable from cloud sessions for any public repo, which Hugging Face and the GitHub API are not). 1,297 transactions; payee text scored against the treasurer's first Expenses/Income account mapped to the default chart (1,241 scored). These are clean payee names, not bank text, so read it as easier than a bank export. Split by a hash of the payee, so no merchant is on both sides. Before any rule: train 15.2% suggested (97.5% right), **held-out 36.5% suggested, 100% right of suggested (0 wrong of 76)**. Rules added looking at the train fifth only (Uber, Clipper, SFMTA, Muni, BART, supermarkets and Instacart, Papertrail, Pingdom, FastMail, DNSimple, Sticker Mule, Mechanical Turk): train 40.9% suggested, 98.8% right (wrong 5, all inconsistent labels in the books: Fiverr and Facebook Adverts filed as Software, FedEx as Office Supplies, Cloud9 once as a taxi). Held-out stays 36.5% because no new rule touches a held-out merchant: that is the honest generalisation reading, vendor lists grow one merchant at a time. What stays blank on held-out: `Wells Fargo` (25 bank fees and 13 interest credits under one payee; only the sign tells them apart), people's names (salary or contractor, 35), and long-tail SaaS (Harvest, IRCCloud, HelloSign). Replayed in date order (`eval/hackclub-online.mjs`, 2026-10-30), each line suggested from everything filed before it (memory, naive Bayes, keywords) and then filed as the treasurer chose: keywords alone suggest 40.1% (99.0% right); learning online suggests **90.7%, 96.0% right of suggested, 87.1% right of all** (1,241 lines; wrong 45; by year 82.2%, 82.6%, 91.5%; 1,047 of the suggestions came from payee memory). Clean payee names and one consistent chart mapping make this an upper bound, and the books' own inconsistent labels count as wrong. Two more readings from `eval/hackclub-memory.mjs` (2026-10-24, same data): seeding with the first quarter as imported history and scoring the rest gives 79.3% suggested, 94.0% right of suggested; and confidence separates good suggestions from guesses (0.8 or above: 98.8% right of 896; below: 85.2% right of 230). Next: score a third set; the same replay on raw bank text (a real export with the treasurer's own filing).
- Bank analysis charge, 2026-10-29 (`categorize.mjs` bank-fee keywords, 1 test in `real-nonprofit-bank.test.mjs`): `DEBIT-ANALYSIS CHARGE` (queeriouslabs set) is a bank fee. Set now suggested 72.7%, right of suggested 96.0%. The rest of the unsuggested lines are 48 `CHECK WITHDRAWAL` (this org books as rent), deposits and ACH credits: undecidable from text, left to payee memory and review.
- Built-in keywords on a real small organisation's bank exports, 2026-10-29 (`eval/queeriouslabs-bank.mjs`, `real-nonprofit-bank.test.mjs`, 3 tests): queeriouslabs/bank-account-activity (a San Francisco makerspace's own 2019-2023 statements, 402 lines, its own Category per line, no licence file, so fetched at run time and never copied). The first real-merchant set; descriptors are the bank's raw text (`ACH DEBIT PGANDE -WEB ONLINE`, `GOOGLE*CLOUD 01E INTERNET`). 278 lines carry a label that names one account. Before, suggested 9.4%; after adding PG&E's truncated spellings, small ISPs (Monkeybrains, Sonic, Google Fiber, Starry...), Google Cloud and other hosts, Patreon and Open Collective as sales, and `secretary of` as a licence fee: suggested 71.9%, right of suggested 96.0% (wrong 8, all PayPal payouts that the engine books as a transfer and this org books as income; left alone, because with a PayPal account in the chart a transfer is right). Not fixable from text: `CHECK WITHDRAWAL` (their rent, 48 lines), `DEPOSIT - BRANCH` and `ACH CREDIT ... SENDER`; the payee memory and the review queue exist for those. Caveat: tuned on the same file it is scored on, one organisation, 3-4 recurring vendors carry most of the gain, so expect another org to land well below 72%. Replayed in date order with learning, 2026-10-24 (`eval/queeriouslabs-online.mjs`, 1 test; 2019 carries no labels, so 2020-2023): keywords alone suggest 72.7% (96.0% right); learning online suggests **98.9%, 97.1% right of suggested, 96.0% right of all** (278 lines, wrong 8, the same PayPal payouts; 250 of the 275 suggestions come from payee memory at 97.6% right). By year 93.5%, 98.7%, 94.3%, 97.1% right of all. Caveat: recurring bills and one rent cheque line dominate this ledger, so a repeat payee is most of it; an org with a long tail of merchants will land lower.
- Bank category, money in and more labels, 2026-10-24 (`BANK_CATEGORY_IN`, 1 test in `bank-category.test.mjs`): the Category hint above also suggests Interest income (4200) and Sales (4000) on money in for the labels that name only one income account, and adds fee, rent, repairs and tax labels on money out. Still review-only, still unmeasured on a real export. A parallel session landed the base feature (PR 10224) while another branch built the same thing; this is the part that was not duplicated.
- Issuer category labels widened, 2026-10-29 (`BANK_CATEGORY`, 1 test): the last-resort category layer (PR #10224) matched whole generic labels only. Added the Capital One, Discover and Chase spellings from memory of their exports ("Fee/Interest Charge" is interest expense, "Fees & Adjustments" bank fees, "Gas/Automotive", "Gasoline", "Other Travel", "Phone/Cable", "Home Improvement"); Shopping, Merchandise, Services, Home, Personal and Groceries stay blank. Spellings are unverified against real files.
- The bank's own category, 2026-10-29 (`bank-category.test.mjs`, 2 tests, rows made up): a `Category` column (Chase, Capital One, Mint, Maybe) is kept on each imported line as `bankCat` and used as the last layer, after rules, memory, learned and built-in keywords, for money out only, at 0.55 confidence, so it always goes to review rather than posting. Only labels that name one account (Food & Drink, Travel, Gas, Utilities, Insurance, Software, Advertising and a few more); "Shopping" and the like stay unsuggested on purpose. Not measured on a real export yet, so the share of lines it rescues is unknown.
- Maybe's sample import CSVs (read only, nothing copied), 2026-10-29: the transactions file read right; an accounts file (balances, no transactions) is reported as no lines; a trades file (`ticker, qty, price, amount`) booked every buy as money in. Fixed in `bank.mjs` (one test in `thirdparty.test.mjs`, own rows). The transactions file's `Account` and `Category` columns are not used yet.
- OFX dates checked against ofxparse's fixtures, 2026-10-29 (`bank.mjs` `ofxDate`, 1 test in `thirdparty.test.mjs`): ofxparse 0.21 (MIT, PyPI sdist) ships 24 OFX files from real institution layouts (Fidelity, Vanguard, Suncorp, ANZ, TD Ameritrade, TIAA). The reader matched the `<STMTTRN>` count on 22; of the other two, fidelity.ofx is brokerage lines read on purpose, and `fail_nice/date_missing.ofx` found a bug: `DTPOSTED` 20120231 was booked as 2012-02-31 because the OFX path never calendar-checked the date (the CSV path did). It now skips it with a problem line. Not tried: labelled merchant sets other than the synthetic one above (Hugging Face, Kaggle and data hosts were blocked from this session; the one GitHub set found has no licence, so it was not used).
- Beancount's example ledger, 2026-10-24 (`eval/beancount-example.mjs`, `builtin-wrappers.test.mjs`, 2 new tests): the generated `examples/example.beancount` (GPL-2.0, fetched at run time, never copied here; made-up payees, plain-English narrations). 776 single-expense transactions, 639 in the eleven expense accounts that map to our chart. Built-in keywords alone: suggested 35.8% then 85.3% after adding `paying the rent`/`monthly rent`/`rent payment`, `eating out`, `tram`/`metro transit`/`transit authority`; wrong 0 before and after. Not fixed on purpose: `Wine-Tarner Cable` (internet; a bare `cable` is also a hardware purchase) and made-up restaurant names, which the payee memory and Bayes layers are for. Synthetic data again; the merchants are not real.
- Built-in keywords against someone else's labelled descriptions, 2026-10-24 (`eval/hf-bank-categories.mjs`, `builtin-wrappers.test.mjs`, 5 tests): DoDataThings/us-bank-transaction-categories (MIT, 16,000 synthetic US bank descriptions in 16 personal-finance categories, no amounts; synthetic, so formats are real and merchants made up). Nine categories name one account in the default chart; the rest (groceries, shopping, health) have none and are not scored. Split by a hash of the text, rules tuned on four fifths, the fifth scored. Held-out test (2,039 scored lines), before then after: suggested 26.7% then 52.9%; right of those suggested 84.7% then 99.4%; wrong 83 then 6. Faults found: `PAYPAL INST XFER <merchant>` and `<biller> AUTOPAY <ref>` were booked as transfers (161 + 89 + 50 train lines), fee lines like `WIRE TRANSFER FEE` too; `avis` matched DAVIS and an added `ramen` matched SACRAMENTO (word boundaries now; the second was caught by this run's own scoring). Added chains, utilities, software, fuel, hotels, tuition and insurers. Limits: personal finance taxonomy mapped by hand to business accounts (streaming is not scored as software if it stays blank); streaming, groceries and payroll deposits stay unsuggested on purpose; tuned on the same generator as the test, so expect a real export to score lower. Dataset not committed; the script's header says where to fetch it.
- Rhode Island quarterly due date, 2026-10-24 (`stateDueDay` in `salestaxreturn.mjs`, 1 test): the Division of Taxation's sales tax calendars (2022 and 2024 PDFs on tax.ri.gov, via search excerpts; the full pages were unreachable from the session) put quarterly returns on the last day of the month after the quarter (Apr 30, Jul 31, Oct 31, Jan 31), not the 20th the worksheet used; monthly stays the 20th. Weekend dates move to the next business day. The 2026 calendar itself was not opened: check your own notice.
- Minnesota annual due date, 2026-10-24 (`stateDueDay`, 1 test): revenue.state.mn.us's Sales Tax Return Filing Due Dates page (search excerpt, not the full page) gives annual filers February 5, not the 20th the worksheet used; fixed with a `{ months, day }` due day. Colorado (DR 0100 instructions and filing pages, via search): monthly and quarterly the 20th, annual January 20, as modelled. Neither state page was fetched whole.
- North Carolina quarterly due date, 2026-10-24 (`stateDueDay` in `salestaxreturn.mjs`, 1 test): ncdor.gov's Filing Frequency page (fetched and read) says quarterly returns are due the last day of Jan/Apr/Jul/Oct; the worksheet had the 20th from third-party guides. Fixed. GA's 20th confirmed on dor.georgia.gov; CO and MN agree with third-party tables only (state pages not opened).
- Delimiter and column-order invariance, 2026-10-27 (`metamorphic.test.mjs`, `bank.mjs`): every rectangular CSV fixture re-written with ;, tab and | must read the same rows. Pipe-delimited files read 0 rows; fixed. Looking at why column reversal changed some named-bank files found a worse one: Stripe's balance-transactions export (Created (UTC), Fee, Net) imported as a single wrong row (the fee, with a preamble warning); it now reads Created (UTC) as the date and Net as the amount. Own fixtures; the Stripe header is from documentation, not a live export.
- ofxstatement plugins (Lloyds, KBC Belgium, Wise, N26, Länsförsäkringar; column layouts read from the sdists, nothing copied; rows made up), 2026-10-27: Lloyds UK, KBC (`;`, 18 fields), Wise and Länsförsäkringar-style layouts read right. One fault, fixed: N26's Italian, French and Spanish exports (`Beneficiario` / `Bénéficiaire`, `Riferimento di pagamento`) imported with **empty descriptions**; the payee and payment-reference headers are now known (1 test in `thirdparty.test.mjs`). Headers of the Italian, French and Spanish N26 files are from the plugin's type table and memory, not a download.
- Packaging invariance, 2026-10-27 (`metamorphic.test.mjs`, `bank.mjs`): every text fixture (62) re-read with CRLF, bare-CR, BOM, blank-line and trailing-space wrappings must give the same rows. 57 did; QIF (2) and pasted-text (3) files with classic-Mac bare-CR line endings read 0 rows. `readStatement` now turns a lone CR into a newline first. Own fixtures only; no real bank download.
- Actual Budget's import fixtures (MIT, read only, nothing copied), 2026-10-24: a 2019 Bank of America QIF (18 transactions, CRLF, `C*` cleared flags, truncated 32-character payees) and its QFX/OFX twin (10 transactions, `INTU.BID` sign-on block) were read by `readStatement`: every transaction counted, dates and signs right, no problems raised. No fault found; two tests of the same shapes in `thirdparty.test.mjs` (own snippets). Still no fresh bank download.
- ofxparse's fixtures (MIT) and ofxtools' test data, 2026-10-24 (read only, nothing copied; files fetched by guessing paths, 17 of ~45 guesses existed): 13 files read, every bank transaction counted (STMTTRN and INVBANKTRAN) matched the file, the Fidelity brokerage file booked its 4 dividends and 3 cash-sweep lines and reported its 10 trades as unbooked, and the Vanguard, TIAA and 401(k) files with trades only booked nothing and said so. Then 15 hand-made variants of what banks emit (entities, comma decimals, CDATA, `[+10:AEST]` zones, parentheses and trailing-minus amounts, duplicate FITIDs, memo-only rows, lower-case tags) were read. One fault, fixed (`xmlent.mjs`, `xmlent.test.mjs` 3 tests): numeric character references (`&#35;`, `&#x23;`) in an OFX payee were left as written, and `sepa.mjs` decoded `&amp;lt;` twice to `<`. Both readers now share one single-pass decoder. CDATA text is no longer entity-decoded (it is literal in XML). Still no fresh bank download.
- ofxstatement-intesasp (GPLv3, column layouts read from its PyPI sdist, nothing copied; rows made up), 2026-10-24: Intesa Sanpaolo's two Italian export layouts. Two faults, fixed (2 tests in `thirdparty.test.mjs`): the newer one (`Operazione`, `Dettagli`, `Importo`) imported with **empty descriptions** because neither header was known, and the older one (`Accrediti`, `Addebiti`, `Descrizione estesa`) was not recognised as having a header at all (the header line was dropped as a "preamble" and the long description lost). Both now read with the right amounts and a description of operation plus details. The sdist ships no sample file, so these are layouts, not bank downloads.
- Actual Budget's public samples (MIT), 2026-10-26: OFX (10 lines, closing balance kept), QIF (18) and a camt.053 file (6 entries, Swiss/German) fetched and read. One fault, fixed (`sepa.mjs`, 2 tests in `thirdparty.test.mjs`, own snippets): a card entry whose only text is `AddtlNtryInf`, written after `</NtryDtls>`, came back with an empty description; the whole entry is now searched. Still no real bank download.
- beangulp's test files (GPL-2.0, read only, nothing copied), 2026-10-26: a Chase-layout checking CSV (6 rows, running balance), two OFX downloads (12 and 27 transactions, the latter a Bank of America card file) and a small brokerage CSV all read with the right row counts, amounts, dates and closing balance; an OFX investment-only file (`example.qfx`) correctly books nothing and says so. No fault found, so no code change: the readers agree with files written by someone else's tooling. They are still test fixtures from another project, not a fresh bank download.
- ledger-autosync's fixtures (GPL-3.0, read only, nothing copied), 2026-10-24: PayPal (two layouts), Venmo, Mint and Amazon order-history CSVs imported with the CLI. PayPal, Mint and the second PayPal layout read right (signs, dates, thousands separators). One fault, fixed (`bank.mjs`, one test in `thirdparty.test.mjs`): a Venmo export whose header starts with a `Username` column was not recognised as Venmo, so the undated balance rows and the legal notice at the end of the file were glued onto the last transaction's description and the account-name row was reported as an unreadable date. Amazon's order-history CSV is items, not bank lines; it says no transaction lines were found. Fixtures are tiny and made up, not bank downloads.
- Layout sweep from memory of public export headers, 2026-10-24 (not real files; 22 layouts: Chase, Capital One, Amex, Wells Fargo, BofA, Citi, Apple Card, Discover, USAA, Ally, Schwab, SoFi, Mercury, Wise, Revolut, Monzo, Starling, N26, Venmo, Cash App, PayPal): all read correctly except Discover, whose `Trans. Date` lost to `Post Date` because the alias list is first-match. Fixed in `bank.mjs`, test in `bank2ynab-samples.test.mjs`. Suite: 816 pass. Real exports still unseen.
- Firefly III's bank configurations, 2026-10-24 (`eval/firefly-probe.mjs`, `currency-suffix-headers.test.mjs` 3 tests, `headerless.test.mjs` 1 test): the community configs in firefly-iii/import-configurations (MIT; delimiter, PHP date format and column roles for each bank; 42 fetched by guessing `country/bank` paths, raw.githubusercontent.com has no listing here) have no header wording, so the probe writes a header-less file in each layout and reads it. 41 layouts usable; 39 read right first time. Two faults, fixed: (1) a "Paid In (GBP)" / "Money in GBP" header lost its "in" to the currency-suffix pattern, so Revolut-style money-in columns were not found and the income rows were **dropped with no warning** (`detectColumns`); (2) a header-less file whose dates read "Mar 13, 2026" was not seen as having a date column. Not a fault: Wells Fargo's `m#d#Y` is the config's escape notation, not a real file. The files are synthetic from the layouts, not bank downloads. Full suite 683 pass.
- BAI2 samples from ministryofjustice/bai2 (MIT, read, not copied), 2026-10-24: four bank-shaped files (Citi, NatWest, SVB, a blank-trailer file). Amounts, dates, 88 continuations and the 015 balance read right. One fault, fixed (`bai2.mjs`, 1 test, own snippet): an account repeated in daily groups (SVB, same number on 2 days) was called "2 accounts" and lost its closing balance; accounts are now counted by distinct number and the latest group's 015 is kept. Full suite not rerun, `bai2.test.mjs` 7 pass. Still no real bank download.
- Five MT940 files from the WoLpH/mt940 tests (BSD-3, ABN AMRO, ING, KNAB, Rabobank, PostFinance; read, not copied), 2026-10-24: amounts, dates and balances read right. Three faults, fixed (`sepa.mjs`, `mt940slash.test.mjs`, 2 tests, own snippets): free-text `:86:` lines were glued together without a space ("VERKEERBETREFT"); now a line under 63 characters ends a word and a line cut at the 65-character SWIFT width continues it. Rabobank's several `:86:` lines after one `:61:` kept only the first (the reason and reference were lost); all are kept. A soft hyphen in dates ("10\u00ad06\u00ad2010") is now a hyphen. A 65-character line that ended on a word boundary still glues the next word on (ABN AMRO, KNAB): not decidable from the text. Full suite 672 pass. Still no real bank download.
- Actual Budget's test files (MIT, `packages/loot-core/src/mocks/files` and `e2e/data`, read only, nothing copied), 2026-10-24: 21 bank files imported with the CLI (QFX/OFX in 1252, 8859-1 and UTF-8, QIF, CSV in UTF-8 with BOM, UTF-16 LE and BE, Windows-1252, a Hungarian bank header set with `2025.12.04` dates); all read with the right dates, signs and accented payees. The file shapes are the ones real banks emit, but the rows are anonymised test data. One fault, fixed (`bank.mjs` `unescapeOfx`, one test in `xmlent.test.mjs`): `html-vals.qfx` (a Canadian bank) escapes text twice (`&amp;lt;DEFTPYMT&amp;gt;`), so the payee read `&lt;DEFTPYMT&gt;`; an OFX payee or memo that still holds `&lt; &gt; &amp; &quot; &apos;` after one pass is now decoded once more. Left as is: a GnuCash sample (one row, Deposit/Withdrawal columns, read right), YNAB demo zips and JSON (not bank files, not read).
- ofxtools (GPL-3.0, read only, nothing copied) `stmtrs.ofx` sample, 2026-10-24: amounts, dates and the ledger balance read right, but the check and ATM lines have neither NAME nor MEMO and came back with an empty description. `readOfx` now falls back to the transaction type and check number ("Check #1000", "ATM"); one test in `thirdparty.test.mjs` (own snippet). Full suite 655 pass. Still no real bank download.
- All-ambiguous dates, 2026-10-24 (`inferLocale` in `bank.mjs`, `ambiguous-dates.test.mjs`, 4 tests): when no date has a part above 12, a file of four or more dated rows is read day first if that packs the dates into 45 days or less and month first would take 90 or more (05/03..09/03 is 5-9 March, not May to September). Fewer rows keep the month-first default. Hand-made files only; full suite 654 pass.
- All 25 files of csv2ofx's `data/test` (MIT), 2026-10-24, imported with the CLI: 23 read (one skipping a repeated header row with a warning); Amazon's order-history report (no amount header, only `total`) read nothing and now does when an `order id` column is present (`bank.mjs`, one test in `hledger-samples.test.mjs`). The Xero file is a journal report (two sides per entry), left unread on purpose. Full suite 634 pass.
- Swedish, Norwegian, Danish, Thai and Icelandic bank CSV headers, 2026-10-24 (`ALIASES` and `DAY_FIRST_HEADER` in `bank.mjs`, `nordic-thai.test.mjs`, 5 tests): a probe of seven made-up files found a Swedish `Bokföringsdag`/`Referens` file booked with the date as the description, a Norwegian `Dato`/`Ut fra konto` file with a bogus "not labelled" sign warning, and a Thai `05/03/2026` file read month first (5 March became 3 May) with no warning. Headers are from memory of those exports, rows made up; no real file tried.
- Landing page "Mint export to business books", 2026-10-24 (`mint-export-to-business-books.html`, `fixtures/mint-export.csv`, in the sitemap and `llms.txt`): every figure is from running the real CLI on a made-up seven-line, two-account file in Mint's column layout (net profit 2,782.49; balance sheet agrees; card payment paired as a transfer). No real Mint, Monarch or Tiller download was tried.
- Files written by someone else, hledger's `examples/csv`, 2026-10-24 (`bank.mjs`, `hledger-samples.test.mjs`, 5 tests): cloned that project (GPL; layout only, new rows in the tests) and imported its sample data files with the CLI. Five faults, fixed: the CSB43 export (underscored headers like `transaction_date`) read nothing; Stripe's `created_utc` was not a date header, so the header was dropped as a preamble; Amazon Payments rows with a To/From column came in as money in; rows with a blank description (Stripe, Monefy) now take the category or type column, then the transaction id; and a letter-spelled currency before an amount (`د.ا.‏4.750`, `Rs. 1,200`) made it unreadable. Not fixed: a Bank of Ireland sample with only 07/12 dates reads month first (ambiguous without more rows). Full suite 620 pass.
- Russian, Hebrew, Greek and Vietnamese bank CSV headers, 2026-10-24 (`ALIASES` and `DAY_FIRST_HEADER` in `bank.mjs`, `russian-hebrew-greek-viet.test.mjs`, 4 tests): a probe of made-up files found all four unreadable (no column matched). Дата операции/Описание/Расход/Приход/Остаток, תאריך/תיאור/חובה/זכות/יתרה, Ημερομηνία/Περιγραφή/Χρέωση/Πίστωση/Υπόλοιπο and Ngày giao dịch/Nội dung/Ghi nợ/Ghi có/Số dư now map and read dates day first. Headers from memory, rows made up, no real export tried; Windows-1255 and 1253 files were read as Cyrillic nonsense (both are accented-Latin runs in 1252); `textcodec.mjs` now takes them when the decoded text carries that language's column names (`legacy-cyrillic-hebrew-greek.test.mjs`, 3 tests, bytes encoded from made-up text, 2026-10-24).
- Indian, Mexican/Spanish, Indonesian and Arabic bank CSV headers, 2026-10-24 (`bank.mjs`, `indian-latam-id-arabic.test.mjs`, 4 tests): a probe of made-up files found a real fault. An HDFC-style file (Narration, Withdrawal Amt., Deposit Amt.), a BBVA-style Cargo/Abono file and a Spanish `Fecha operación` file with no day above 12 were read month first (`05/03/26` became 3 May); they now read day first. Indonesian `Tanggal/Keterangan/Debet/Kredit` and Arabic `التاريخ/الوصف/مدين/دائن/الرصيد` headers matched nothing and were skipped as a preamble; they now map. Headers from memory, rows made up, no real export tried. SBI-style English Debit/Credit headers were already fine.
- Korean and Chinese CSV headers and East Asian code pages, 2026-10-24 (`bank.mjs`, `textcodec.mjs`, `eastasian.test.mjs`, 4 tests): 거래일자/적요/출금금액/입금금액/잔액 and 交易日期/摘要/支出/收入/余额 (and debit/credit-amount variants) now map. A non-UTF-8 file is read as Shift_JIS, GBK or EUC-KR when it decodes cleanly in that code page and carries one of that language's column names (Western text never does; a test with é, «», ’ in Windows-1252 stays 1252). Headers from memory, rows made up, test bytes encoded from the WHATWG tables, no real bank file tried.
- Japanese bank CSV headers, 2026-10-24 (`ALIASES` and the date parser in `bank.mjs`, `japanese.test.mjs`, 2 tests): the Swiss probe's open item. 取引日/日付, 摘要/お取引内容, 出金金額/入金金額 (or one signed 金額) and 残高 now map, and `2026年3月5日` dates parse; before, a Japanese header matched nothing. Headers from memory of bank exports, rows made up, no real file tried. Yen has no minor unit but is booked x100 like any currency here. Japanese exports are often Shift_JIS: see the next entry.
- Landing page "bank statement to QuickBooks or Xero", 2026-10-24 (`bank-statement-to-quickbooks-xero.html`, in the sitemap, `llms.txt` and linked from the app page): a worked example from running the real CLI (import, confirm, `export qbo|xero|iif`, `report`) on `fixtures/chase-checking.csv`. Every figure on the page is from that run; no real QuickBooks or Xero company file was tried.
- Swiss German-language CSV headers, 2026-10-24 (`bank.mjs`, `swiss.test.mjs`): a probe of made-up exports from six countries found one fault, a PostFinance-style file (Buchungsdatum, Avisierungstext, Gutschrift/Lastschrift in CHF, Saldo in CHF) read with deposits as withdrawals and the description blank. Those headers now map. Same probe: Japanese headers (取引日, 出金金額, 入金金額) are still unread. Headers from memory, rows made up.
- Gaps left after PR #9932, 2026-10-24 (`bank.mjs`, `polish-finnish-czech.test.mjs`): probing made-up files found PKO BP's `Opis transakcji` unread (description empty), mBank's `#`-prefixed headers unread, Finnish `Määrä EUROA` unread, Czech `Měna` not checked for mixed currencies, and German/Italian `Valuta` ranked above `Data` as the date (an Italian file with a currency column got wrong dates). Value-date headers now rank last. Headers from memory, rows made up.
- Italian, Portuguese, Brazilian, Polish, Finnish, Turkish and Czech bank CSV headers, 2026-10-23 (`ALIASES` and `DAY_FIRST_HEADER` in `bank.mjs`, `southern.test.mjs`, 8 tests): a probe of made-up exports found a real fault, not just unknown names. A Portuguese `05-01-2026` or Italian `05/01/2026` with no day above 12 in the file was read month first (5 January became 1 May) and the header line was skipped as a preamble. Those headers (Data mov., Data contabile, Descrição, Dare/Avere, Débito, Kwota, Kirjauspäivä, Tarih and so on) now map to columns, and a header word from those languages makes the file day first unless `dayFirst` is passed. Layouts from memory of the banks' exports, rows made up; no real export tried. A US file with English headers keeps month first.
- Hungarian OTP workbook headers, 2026-10-23 (`ALIASES` in `bank.mjs`, `otp-hu.test.mjs`, `fixtures/otp-hu.xlsx`): the ofxstatement-otp plugin (PyPI sdist, layout only) describes the current OTP netbank `.xlsx` (sheet `Tranzakciók`, metadata rows, then `Számlaszám`, `Ellenoldali számlaszám`, ... `Összeg`, `Pénznem`). Our `.xlsx` reader already got the CSV out but the Hungarian headers matched nothing, so it imported 0 rows. Added `Könyvelés dátuma`/`Tranzakció dátuma`, `Partner neve`, `Közlemény`, `Összeg` and `Pénznem` (mixed-currency check). Only the first two header words are from the plugin; the rest are my Hungarian, the fixture is written by me with made-up rows, and HUF amounts are booked as ×100 like any currency. Try a real OTP export.
- German bank CSVs, 2026-10-24 (`bank.mjs`, `german.test.mjs`, `fixtures/sparkasse-de.csv`, `dkb-de.csv`, `deutsche-bank-de.csv`): layouts written from memory of the Sparkasse, DKB and Deutsche Bank exports (rows made up). Amounts and dates already read; two gaps fixed. The payee column (`Beguenstigter/Zahlungspflichtiger`, `Auftraggeber / Begünstigter`, or the Deutsche Bank pair, chosen by sign) was dropped, leaving only the purpose text for the categorizer; and a `Valuta` value-date column was read as a currency, so a Soll/Haben file with `Waehrung` warned "mixes currencies". No real German export tried.
- $100,000 rule switches a monthly depositor to semiweekly, 2026-10-23 (`depositSchedule` in `deposits.mjs`, `deposits.test.mjs`, 2 new tests): the rule was flagged but the rest of the year stayed scheduled as monthly. Now the first day a month's liability reaches $100,000 sets `switchedOn` (next day); later runs are scheduled semiweekly, and the following year is semiweekly even when its lookback is small. From memory of Publication 15 section 7 (irs.gov refuses the shell here), hand-made registers only; check against your IRS notice.
- Payout report quirk probe, 2026-10-24 (`payouts.mjs`, `payouts.test.mjs`): 16 hand-made variants of a Stripe payout CSV (BOM, CRLF, timestamps, thousands separators, `$`, parenthesised negatives, `;` and decimal comma, title-case headers, blank lines): 14 read correctly. Two gaps, fixed: amount headers with the currency in them (`Gross (USD)`, `Net (EUR)`) threw "No gross column"; and a report with a `currency` column listing several currencies was summed without a word, so it now says so in `problems`. Variants are mine, not real exports (docs.stripe.com is blocked from the shell).
- Dutch bank CSVs, 2026-10-24 (`bank.mjs`, `neobank.test.mjs`, `fixtures/ing-nl.csv`, `knab-nl.csv`): layouts from the ofxstatement-dutch plugin's tests (rows made up). ING NL (`Af Bij` marker, `Bedrag (EUR)`) imported nothing, and Knab's `CreditDebet` column was ignored so every debit came in as money in. Both now read; markers `af/bij`, `debet/credit` and `soll/haben` set the sign. No real ING or Knab download tried.
- Will a 1099-K arrive? 2026-10-23 (`reportable1099K` in `form1099k.mjs`, `form1099k --processor card|marketplace`): card processors (Stripe, Square) report every payment; marketplaces and wallets (PayPal, Venmo, Etsy) only above $20,000 and 200 payments, the figures P.L. 119-21 restored. Written from memory of the Act, not re-fetched (irs.gov blocked here); counts the report's positive sales rows, which may differ from the processor's own transaction count. Without `--processor`, the CLI takes the rule from the report's format (PayPal, Etsy, Airbnb and Amazon files: marketplace; others: card; fixed 2026-10-24 after a post-merge review found every file defaulted to card). Hand-made reports only (`form1099k.test.mjs`).
- MT940 `/KEY/value` narratives, 2026-10-23 (`slashTags` in `sepa.mjs`, `mt940slash.test.mjs`): Dutch, Belgian and French banks (ING, ABN AMRO, Rabobank, KBC style) write `:86:` as `/TRTP/.../IBAN/.../BIC/.../NAME/Jan de Vries/REMI/Factuur 14/EREF/...`. The reader kept the whole string as the description, so IBANs and BICs sat in the payee and defeated payee memory and the categorizer. Now the description is the NAME (or the `/CNTP/` counterparty's name) plus the remittance text (`/REMI/USTD//` and `/REMI/STRD/CUR/ref` handled, wrapped lines rejoined); plain and German `?20` narratives are unchanged. Layout written from the banks' published field lists with made-up rows; no real export tried, so check it against a real download.
- BAI2 files, 2026-10-23 (`bai2.mjs`, `bai2.test.mjs`): the format US business banks offer for treasury and accounting imports was read as garbage CSV. Now detected (`01,...` header plus 16 records) and read: signs from the type code (100-399 in, 400-699 out), the group's as-of date or a `V` value date, bank and customer references and text (88 lines joined), the 015 closing ledger as the statement balance. Written from the BAI2 layout as I know it, with hand-made files only (`bai2.test.mjs`, 6 tests); no real bank file tried. Amounts assume two decimals (a zero-decimal currency would be off), loan type codes (7xx) are skipped with a note, several accounts in one file are merged with a warning.
- Norma 43 files, 2026-10-23 (`n43.mjs`, `n43.test.mjs`, 4 tests): Spanish banks' fixed-width statement was read as garbage CSV. Now detected (11 header plus 22 movement records) and read: sign from the debe/haber digit, date from the operation date, text from the 23 concept lines (else the reference fields), final balance from the 33 record. Written from the AEB layout as I know it, with files built by a test helper only; no real bank file tried. A non-978 currency code is warned about, several accounts in one file are merged with a warning, 24 currency-equivalence records are ignored.
- CFONB 120 files, 2026-10-23 (`cfonb.mjs`, `cfonb.test.mjs`, 4 tests): French banks' fixed-width statement was read as garbage CSV. Now detected (01 header plus 04 movement records) and read: sign from the overpunch ({ A-I credit, } J-R debit), operation date, label from the 04 record plus its 05 complement lines, closing balance and date from the 07 record. Written from the CFONB layout as I know it, with files built by a test helper only; no real bank file tried, so column offsets are unchecked against a real export. A non-EUR currency code is warned about, several accounts in one file are merged with a warning. CAMT.054 is already detected by the CAMT reader; not tested on a real file.
- Legacy Excel (.xls) bank exports, 2026-10-23 (`xls.mjs`, `xls.test.mjs`, `fixtures/generic-statement.xls`, `fixtures/long-statement.xls`): older bank portals still offer Excel 97-2003 files, which were read as garbage text. `xls.mjs` reads the OLE2 compound file (FAT/mini-FAT chains), then the BIFF8 records: the shared string table across CONTINUE splits (8-bit and UTF-16 strings, rich-text runs), RK/MULRK/NUMBER/LABELSST/LABEL/BOOLERR and cached formula results (including string results), date formats and the 1904 epoch. Same CSV shape as `.xlsx`, in the CLI, `statementTextFromFile` and the page's file picker, no dependency. Checked on files written by LibreOffice 24.2 (not a bank's own file): the converted `.xlsx` fixture reads identically to its original, and a 300-row sheet whose string table spans several records reads whole. BIFF5 (Excel 5/95, "Book" stream; byte strings in the CODEPAGE record's code page, LABEL cells, no string table) landed 2026-10-23, tested only on a workbook the test builds from the published record layouts (LibreOffice 24.2 cannot write BIFF5, so there is no file from a real writer). Not read: password-protected workbooks (refused with a message); try a real bank `.xls`.
- Excel (.xlsx) bank exports, 2026-10-23 (`xlsx.mjs`, `xlsx.test.mjs`, `fixtures/generic-statement.xlsx`): banks such as OTP (Hungary) and many business portals offer only an Excel download, and the importer saw a zip as garbage text. `xlsx.mjs` reads the zip directory, inflates the parts (browser `DecompressionStream("deflate-raw")`, CLI `node:zlib`), resolves shared, rich-text and inline strings, turns date-formatted cells (built-in and custom formats, 1900 and 1904 epochs) into ISO dates, keeps other numbers as written (float noise trimmed), picks the sheet with the most data and hands CSV to the existing reader, so the preamble rows, header detection, balance chaining and multi-account handling all apply. The page accepts `.xlsx` (read in the tab, nothing uploaded) and `import FILE.xlsx` works in the CLI, by content not extension. Checked on a workbook written by openpyxl (4 rows, balances chain, second sheet ignored) and hand-built zips; no bank's real workbook, and no Hungarian/other-language header words were added. Try a real `.xlsx` export; legacy `.xls` is not read.
- PostFinance (Switzerland) account CSV, 2026-10-23 (`detectColumns` in `bank.mjs`, `neobank.test.mjs`, `fixtures/postfinance-account.tsv`): the layout (tab-separated `Date, Posting details, Credit, Debit, Value, Balance`, YYYYMMDD dates) is from the column list in the ofxstatement-postfinance plugin (GPL; read from its PyPI sdist, rows made up). The importer took the `Value` column (a value date) as the amount, so every amount came out as 2026030200 cents and the balance check broke. Beside money-in/out columns `Value` is no longer an amount, and `Posting details` is a description. Also probed from the ofxstatement N26 and Revolut plugins: Revolut files with `HH:MM:SS` times and both N26 layouts read correctly. No real export tried.
- Czech "Pohyby na účtu" text statements, 2026-10-23 (`readCzBlocks` in `bank.mjs`, `thirdparty.test.mjs`): the block-per-movement text export (a header line, then `datum zaúčtování / částka / měna / zůstatek / symbols / označení operace / název protiúčtu / protiúčet / poznámka`) fell to the CSV reader and returned nothing. Now read: date D.M.YYYY, signed amount, balance after the movement (kept per row), operation type, counter-party, account and variable symbol in the description, and the fixed-width wrapped note rejoined (a number split across two lines comes back whole). Both real samples in the ofxstatement-czech sdist (GPLv3, layout only) read: `maxibps.txt` 3 movements, `erasvet01.txt` 99 movements with 93 of 98 consecutive balances chaining exactly; the 5 breaks sit at large jumps in the sample itself (it looks edited), not at parse errors I could find. UTF-8 files only here; a cp1250 copy goes through the existing code-page guess. No export from my own bank.
- Czech/Slovak/Slovene cp1250 without a flag, 2026-10-23 (`legacy` in `textcodec.mjs`): the 1250 rule needed Polish bytes or both e-caron and r-caron, so a Czech file with only c-caron, s-caron or z-caron stayed 1252. Now s/z with caron and t/z with acute (bytes Western bank text does not use) also pick 1250; French/Italian accents stay 1252 (tested). Hand-built bytes, no real bank file.
- Czech GPC statements, 2026-10-23 (`readGpc` in `bank.mjs`, `thirdparty.test.mjs`): the fixed-width `.gpc` file that Fio and other Czech banks export (`074` statement line with previous/new balance, `075` transaction lines: amount in hellers, code 1/2 debit/credit and 4/5 storno, variable symbol, bank code, client name, due date DDMMYY) was not recognised and fell to the CSV reader. The three real Fio samples in the ofxstatement-czech sdist (GPLv3, so read for the layout only, nothing copied) read: the 11 June 2014 file gives 10 rows and the closing balance 4,632.00, which feeds the reconcile check. The test builds its lines by hand with made-up names. Decode the file as Windows-1250 first; the code-page guess may call a file with only plain accents 1252, so pass the encoding if names look wrong. The two Czech text statements (`maxibps.txt`, `erasvet01.txt`) in that package are still unread. No file from my own bank.
- Baltic and Central European code pages, 2026-10-24 (`legacy` in `textcodec.mjs`, `textcodec.test.mjs`): a non-UTF-8 file was always decoded as Windows-1252, so a Lithuanian/Latvian cp1257 file (the LITAS-ESIS case above) or a Polish/Czech cp1250 file came out garbled on the page and in the CLI. Now 1257 is chosen on bytes that are eth/thorn in 1252 (and no Icelandic acute vowels), 1250 on Polish superscript-look bytes or Czech e-caron plus r-caron; Danish, Italian, Icelandic and French text stay 1252 (tested). Bytes built by hand from the code-page tables, no real bank file; text with none of those letters is still read as 1252.
- Lithuanian LITAS-ESIS statements, 2026-10-24 (`readEsis` in `bank.mjs`, `thirdparty.test.mjs`): the `.acc` sample in the ofxstatement-lithuanian project's tests (read from its PyPI sdist; cp1257, tab-separated, no header, `010` transaction lines with the amount in cents and a D/K flag, `020` balance lines) imported 0 rows ("No transaction lines were found"). It now reads: all 8 transactions with signs, payee plus purpose as the description. The test file is rewritten with made-up rows; the real sample was only checked by hand. The two Czech text statements the earlier note mentions were not in that package (I misattributed them), so they are still unread. No real bank download; the file must be decoded as cp1257 before it is passed in.
- Backup withholding checked against IRS Publication 1281, 2026-10-23 (irs.gov/pub/irs-pdf/p1281.pdf, fetched and read with pdftotext; irs.gov answered the shell this run): the 24% rate (effective after 2017) agrees with `BACKUP_WITHHOLDING_RATE`. The Pub. confirms that a payee who refuses or neglects to give a TIN means withholding "immediately", and that the 60-day awaiting-TIN grace covers only interest, dividends and readily-tradable-instrument payments, so non-employee compensation is withheld at once even if the payee has applied for a TIN. The 1099-NEC warning now says so (`taxforms.test.mjs`). The CP2100/CP2100A dates are now a helper (below, `cli.mjs b-notice`).
- Tax tables and backup withholding read at the source, 2026-10-23 (`estimatedtax.mjs`, `estimatedtax.test.mjs`): irs.gov and law.cornell.edu answered the shell this run, so the items marked unread above were read. IRC 3406(a)(1) (law.cornell.edu): a payer withholds "the fourth lowest rate of tax applicable under section 1(c)" when the payee gives no TIN; the fourth-lowest rate is 24% (10, 12, 22, 24), equal to `BACKUP_WITHHOLDING_RATE`. Rev. Proc. 2024-40 (irs.gov/pub/irs-drop/rp-24-40.pdf, pdftotext): all 2025 brackets for single, joint and head of household and the section 199A thresholds ($197,300 / $394,600) agree with `estimatedtax.mjs`. One difference, not a fault: the Rev. Proc. gives 2025 standard deductions of $15,000 / $30,000 / $22,500, but the 2025 law raised them to $15,750 / $31,500 / $23,625 (IRS 2026 inflation release and the Form 1040 instructions, both read), which is what the code uses; a test now pins it. The 2025 table no longer says "from memory". Still unread: Publication 1099 part N and the $400 minimum QBI deduction (not found on the IRS pages fetched), and no real bank file or tax return was tried.
- Mixed currencies, 2026-10-23 (`bank.mjs`, `thirdparty.test.mjs`): only Revolut files were checked for a currency mix; any file with a currency column (`Currency`, Swedbank's `Valiuta`, `Waluta`, `Währung`, `Devise`, `Moneda`...) that lists more than one now says so in `problems`, because amounts are booked as written with no conversion. Hand-written file; no real multi-currency export.
- Lithuanian bank CSVs, 2026-10-23 (`bank.mjs`, `thirdparty.test.mjs`): the Swedbank and Danske samples in the ofxstatement-lithuanian project's tests (read from its sdist; layouts rewritten with made-up rows, not copied) found three faults, fixed: `YYYY:MM:DD` dates were unreadable; Lithuanian headers (`Suma`, `Paaiškinimai`, a `D/K` flag with `K` = credit) were not recognised, so the file fell through to the text reader and found nothing; and "opening/closing balance" rows (`Likutis pradžiai/pabaigai`) would have been booked as transactions, so they are skipped and named. A row shorter than the header (Danske's sample drops two columns on some rows) was silently dropped as a zero amount; it now says the amount column is missing. The Danske sample itself still imports 0 rows because every row is short; mixed-currency files are now named (below). No real bank download.
- Header-less bank files in general, 2026-10-23 (`inferHeaderless` in `bank.mjs`, `eval/bank2ynab-probe.mjs`, `headerless.test.mjs`): bank2ynab's config (MIT, github.com/bank2ynab/bank2ynab, 117 banks; fetched from raw.githubusercontent.com) lists the column order, delimiter and date format of each bank's real export. Of the 16 banks it describes with no header row and a date column (Raiffeisen, easybank, ANZ, NAB, TD Canada, Rabobank, USAA, Barclaycard, POSB, OTP, Danish and Swedish banks), the importer read none: it knew only the Wells Fargo, CBA/ANZ and TD shapes and needed 4-digit years. I built a four-line file in each layout (made-up rows, the real column order) and the reader now finds the columns from the cells: the date column, a signed amount or an out/in pair with one cell filled per row, a balance that chains with the amounts in either sort order, a D/C flag that signs an unsigned amount, the longest text column as description, and day- or month-first from the dates. All 16 read right; one (Barclaycard, out/in order unlabelled, no balance) comes back with the signs flipped and a `problems` line saying the order is a guess, because the order cannot be known from the cells. A file with a header is never read this way. Not tried: the 100 layouts that have a header row (the config does not give its wording), real files. Try a real header-less export.
- Backup withholding rate, 2026-10-23: the IRS CP544 notice page (irs.gov/individuals/understanding-your-cp544-notice, updated 2026-03-25, read through web search because irs.gov is blocked from the shell) says the current rate is 24%, equal to `BACKUP_WITHHOLDING_RATE` in `taxforms.mjs`. Not read: Publication 1099 part N and IRC 3406 themselves (law.cornell.edu, govinfo, ecfr and irs.gov all refuse the shell here), so the "fourth lowest rate" link to the 24% bracket is from memory, and the $2,000 NEC threshold is still sourced to the IRS pages cited in `taxforms.mjs`. No code change.
- Social security wage base and 2025 table, 2026-10-23: SSA's page (ssa.gov/oact/cola/cbb.html, read through web search because ssa.gov is blocked from the shell) gives $176,100 for 2025 and $184,500 for 2026, equal to `SS_WAGE_BASE` in `payroll.mjs`. The 2025 single brackets and the head-of-household 10%/12%/22%/24% bounds match two secondary sites (TaxSlayer, Robert Hall); the MFJ 12% bound ($96,950) was disputed between them and is twice the single bound, as the statute's doubling requires. Rev. Proc. 2024-40 itself was not read (irs.gov returned 403), so the 2025 table stays flagged unchecked.
- `estimate` checked against the IRS text, 2026-10-23: Rev. Proc. 2025-32 (irs.gov/pub/irs-drop/rp-25-32.pdf, fetched and read with pdftotext) agrees with every 2026 bracket and standard deduction in `estimatedtax.mjs`. One fault, fixed (`estimatedtax.test.mjs`): the "above the QBI threshold" warning used the 2025 figures ($197,300 / $394,600) for every year; 2026 is $201,750 (single, head of household) and $403,500 (joint), section 3.26. The 2025 table and the social security wage base on ssa.gov are still unchecked; OBBBA's $400 minimum QBI deduction is not modelled.
- Header wider than the rows, 2026-10-23 (`bank.mjs`, `thirdparty.test.mjs`): the Danske Bank Lithuania sample in the ofxstatement-lithuanian test data (a real bank layout, read from its PyPI sdist; the Swedbank sample beside it already read correctly) names 12 columns but writes 10 or 11, so the amount was not where the header said and every row was skipped. When every data row is shorter than the header, the header is now dropped and the columns are found from the cells (`inferHeaderless`), with a note in `problems`; dates written `2012:03:01` and amounts with one decimal (`-7.8`, `-.46`) now count. The two Czech text statements in the same package (key: value blocks) are still not read. Lines in `problems` for such a file count from the first data row. Sample data is from a public test suite, not an account of mine; try a real Danske export.
- Fill-only AI mode measured with real local models, 2026-10-23 (`eval/ai-eval.mjs --mode fill`, Ollama 0.5.7, CPU only, 4 cores, `num_ctx 8192`, temperature 0, one synthetic seed, months 10-12, the same 44 review lines as the 3B replace run below). The rules, memory and classifier were right on 29 (65.9%) and had no account for 9. Qwen2.5 3B answered those 9 and was right on 2 (rescued 2, broke 0): 31 of 44, 70.5%. Qwen2.5 7B answered 9 and was right on 7 (rescued 7, broke 0): 36 of 44, 81.8%, in 9.5 minutes for 3 calls. So fill mode removes the harm the 3B replace run showed (broke 24) and a 7B model fills most of what the rules cannot; n=9 uncovered lines on synthetic data, one seed, so the 2-of-9 versus 7-of-9 gap is a signal, not a rate. Replace mode with 7B was not run (it sends all 44 lines, about ten times the time). Not tried: real bank descriptions, other seeds, models above 7B.
- CAMT.052 and .054, 2026-10-23 (`sepa.mjs`, `thirdparty.test.mjs`): the camt.052 account report in the fints project's tests (MIT, ISO-8859-1, camt.052.001.08; read from its sdist, rewritten in the test) reads correctly (amounts, signs, dates, remittance text, closing balance). Two gaps, fixed: the reader keyed on the camt.053 header, so a file whose root was `BkToCstmrAcctRpt` or a camt.054 `BkToCstmrDbtCdtNtfctn` notification was not recognised without the version string, and a file of several `<Rpt>` or `<Ntfctn>` blocks was merged without the warning that several `<Stmt>` blocks get. No real bank file; a search for MT940 sample files from third-party projects found none reachable here.
- More ofxparse (MIT) files, 2026-10-23 (`signon_fail`, `ofx-v102-empty-tags`, `td_ameritrade`, `investment_401k`, `tiaacref`, `vanguard401k`, `account_listing_aggregation`, `bank_small`): the empty-tags file reads right. One fault, fixed (`thirdparty.test.mjs`): a downloaded bank error reply (AMEX sign-on failure, code 15500) and the investment-only files (positions, no cash lines) all said "No transactions (STMTTRN) were found"; they now say it is an error reply (with the bank's code and message) or an investment statement whose lines are not booked. Files are small, some synthetic; still no real bank download.
- Card file of purchases only, 2026-10-23: csv2ofx's (MIT) `pcmastercard.csv` shape (Merchant, Card, Date, Time, Amount; all positive, no payment row) imported its charges as refunds, because the sign is normally read from payment rows. On a liability account, a file whose every line is positive with no balance column now flips to charges and says so in `problems` (`invert: false` keeps them; a checking account is untouched; `thirdparty.test.mjs`). The csv2ofx `xero.csv` journal export is not a bank file and is not read. File shape is third-party; no real bank download.
- Stripe Connect, top-up and financing categories, 2026-10-23 (`payouts.mjs`, `payouts.test.mjs`): `platform_earning` and `application_fee` are sales, their refunds refunds, and `topup`, `payout_reversal`, `transfer_reversal`, `advance`, `anticipation_repayment` and the Connect collection/reserve categories go to clearing (1200), where before every one of them fell into Other income (4100) and overstated revenue. Category names are from Stripe's balance-report documentation, from memory of the list; one hand-written report, no real Stripe Connect export tried.
- QIF quirk probe, 2026-10-23 (7 hand-written files from the QIF spec's layouts: `D1/ 3'26` dates, split lines, thousands separators, CRLF, `U` amounts, no final `^`): six read correctly. One fault, fixed (`thirdparty.test.mjs`): an `!Account` block (Quicken's multi-account export) was read as a transaction and gave "unreadable date" problems, and a file with several account sections merged them silently; account blocks are now skipped and a file with more than one `!Type` section says its rows share one account. Per-account splitting of QIF landed the same day (`splitQif`, `importQifAccounts`, CLI `import FILE.qif --map "Checking"=1000,"Visa Card"=2000`; `multiaccount.test.mjs`, a hand-written Quicken-shaped file; the page's picker splits QIF too, 2026-10-23: `fixtures/two-accounts.qif`, clicked through in `eval/browser-click.mjs`). Files are mine, not real Quicken exports.
- IIF export declares its accounts, 2026-10-23 (`exportJournal(books, "iif")`, `engine.test.mjs`): the file now opens with an `!ACCNT` block (name and QuickBooks type: BANK, AR, AP, OCASSET, FIXASSET, OCLIAB, LTLIAB, EQUITY, INC, EXP, COGS, guessed from the account's type and name) because QuickBooks Desktop's IIF import rejects a TRNS/SPL line naming an account the company file lacks, per Intuit's IIF documentation as I recall it. A ":" in a name (a sub-account separator there) becomes "-". Checked only by test (every account used is declared, each entry sums to zero); no copy of QuickBooks Desktop was tried, so import a small file first.
- Files that name the account on every row, 2026-10-23 (`importCsvAccounts`, CLI `import FILE --map "Checking"=1000,"Visa Card"=2000`, the page's account picker): Mint, Monarch, Tiller and YNAB write all accounts into one CSV with an Account (Name) column, which the importer ignored, so every row landed in one account and transfers between them never paired. Found by reading csv2ofx's sample files (MIT, third-party: `mint.csv`, `payoneer.csv`, `default.csv`, `creditunion.csv`; all four already read correctly, including Mint's bare-CR line breaks and its unsigned Amount plus debit/credit Type column). `multiaccount.test.mjs`, 4 tests; the files in the tests are rewritten in those shapes, not real exports. Try a real Mint or Monarch download.
- `export ledger` run through ledger-cli 3.3.2 itself (Ubuntu package), 2026-10-23: the example books and 29 awkward descriptions (`=`, `~`, `@`, `;`, `#`, `[x]`, `P 2026 x`, `include foo`, a date-like text, tabs, accents) all parse, with balances equal to hledger's. One gap, fixed (`engine.test.mjs`): the file declared no accounts or commodity, so `ledger --strict --pedantic` (which catches mistyped account names) rejected every posting; the file now starts with `commodity` and `account` lines, which hledger also accepts. A currency written with a trailing dot (`Fr.`) is trimmed because ledger-cli reads it as `Fr`. Currencies tried: USD, usd, $, €, £, A$, C$, CHF, kr, R$, ¥, zł. Descriptions are mine, not real bank files.
- `export ledger` run through hledger 1.43.2 (release binary), 2026-10-23: the example books (99 entries after accepting every suggestion) pass `hledger check`, and its income statement net (-784.33) and balances equal the app's own report. A probe of 22 awkward descriptions in nine currency spellings (`USD`, `usd`, `$`, `€`, `£`, `A$`...) all parse. One fault, fixed (`engine.test.mjs`): a description starting with `*` or `!` became a cleared/pending status mark and one starting with `(` became a transaction code, so the text was lost; they now get a `- ` prefix. Descriptions come from my own list, not real bank files; ledger-cli itself (as opposed to hledger) is still untried.
- Beancount export run through `bean-check` (beancount 3.2.3), 2026-10-23: the example books (86 entries) pass. Two faults found with awkward input and fixed (`engine.test.mjs`): a backslash in a bank description (`Back\slash`, or one ending a description) made the file unparseable, because Beancount reads `\"` as an escaped quote, so backslashes become `/` in the Beancount narration (ledger output keeps them); and a books currency written as a symbol or lower case (`$`, `usd`) gave invalid commodities, now `USD` and upper-cased. Quotes, semicolons, tabs, accents and emoji already parsed. hledger is checked separately (next entry).
- First files written by someone else, 2026-10-23: six OFX files from the MIT-licensed ofxparse project's tests (checking, a medium bank file, ANZ, Suncorp, a multi-account shell with no transactions, a Fidelity investment file whose cash lines sit in `INVBANKTRAN`), fetched from raw.githubusercontent.com and read with `readOfx`. They are small and some are synthetic, but the first layouts here not written by this repo. Two faults, fixed (`thirdparty.test.mjs`, 3 tests, snippets rewritten rather than copied): a `<![CDATA[...]]>` NAME or MEMO (Suncorp's shape) came back empty, so the line had no description and nothing to categorize on; and a MEMO that starts with the NAME (common) put the text in twice, which polluted payee memory and the classifier. Amounts, dates and signs, `+0000...0.2400` style amounts, `[-5:EST]` timezone dates and ledger balances all read correctly. Investment buys, sells and income in that file are not booked (only its cash lines). Still no real bank download.
- Fill-only AI mode, 2026-10-23 (`aiSuggest(..., {mode})`, `eval/ai-eval.mjs --mode fill|replace`): the default is now "fill", which sends the model only review lines the rules, memory and classifier had no account for and never overwrites a suggestion; "replace" is the old behaviour. Reason: the 3B local reading above broke 24 lines while rescuing 4. Tests use the scripted stub (a harness check, nothing about a real model: with the stub at 80% and fill mode, rescued 34, broke 0 on one seed, by construction). No real model has been run in fill mode yet; try Qwen2.5 3B or a larger one with `--mode fill` against `--mode replace`.
- Third quirk probe, 2026-10-23 (11 hand-written layouts for Chime, Brex, Relay, Novo, Truist, Fifth Third, KeyBank, Bluevine, a Quicken-style export, a US Bank variant and a German Sparkasse file; the layouts are mine, from memory, not real exports): two faults, both fixed (`neobank.test.mjs`, 3 tests). (1) A file with a `Status` or `State` column from a bank the importer has no named reader for (Chime's `Pending` and `Declined` rows) imported the pending rows; now any such column skips rows whose status is pending, declined, failed, cancelled, reversed, voided, rejected, authorised, processing, on hold or returned, and reports each. An unknown label such as `Settled` keeps the row. (2) A card export with positive charges whose payment row says just `Payment` (Brex-style) kept the charges positive; a row that is only "Payment" (or "Card payment", "Statement payment") now counts as a weak payment signal, used only when most rows are positive, so a checking account's outgoing `Payment` row is not flipped. The other nine layouts read correctly.
- Overlap re-imports, 2026-10-23: line ids now fold case, spacing and punctuation in the description (`rowIds(..., {loose:true})`), so the same line read from a CSV and later from an OFX or PDF of the same period, spelled with different spacing, is skipped instead of booked twice; ids stored by earlier versions still match (`reimport.test.mjs`, 3 tests, hand-written files; two genuinely identical lines in one file stay two). Different wording for the same line (a bank's pending vs posted text) is matched too, 2026-10-23 (`rewordedLines` in `engine.mjs`): an unmatched new row equal in cents to an unmatched booked line within 4 days, with differing text that shares a word of 4+ letters, is skipped and named in `problems`; identical text is never merged (a daily coffee stays new). Two tests in `reimport.test.mjs`, hand-written files; the 4-day and shared-word thresholds are my guess, not tuned on real pending/posted pairs.
- Second quirk probe, 2026-10-23 (about 25 hand-written variants: BOM, parenthesised and `$` amounts, trailing minus, quoted multi-line cells, tab-delimited, ISO timestamps, AM/PM, Chase's trailing comma, Citi, US Bank, Ally, Navy Federal, SoFi): one fault. A Discover card file whose payment row does not say "thank you" or "directpay" (or that has purchases only) kept charges positive, because the sign flip relied on spotting a payment row by its description. Discover's header is distinctive and its export always lists charges as positive, so that layout now flips by default (`neobank.test.mjs`; an explicit `invert` still wins). Amex is not given the same default because its header matches any `Date, Description, Amount` file. PayPal's activity CSV (`Gross, Fee, Net`) is not read by the bank importer. Variants are mine, not real files.
- Belgian bank CSVs, 2026-10-24 (`bank.mjs`, `belgian.test.mjs`, 3 tests): column positions read from the ofxstatement-be-kbc, -belfius, -triodos and -keytrade plugins (GPL, layout only; I downloaded 38 ofxstatement plugin sdists from PyPI, and only the Wise one ships a sample file, which already read right). I wrote Dutch header words to fit those positions and made up every row, so none of it is a real download and the header wording is a guess. Three faults, fixed: `Boekingsdatum` was not a date header, so Belfius, Triodos and Keytrade files were read by cell shape with the account number as the description; the KBC `Valuta` column (a value date in Dutch) was taken as a currency and raised a false "mixes currencies" warning; and the free message (`Mededeling(en)`, `vrije mededeling`) was dropped, so it is now joined to the counterparty or description, and `debet` counts as a debit header. Check against a real KBC, Belfius or Triodos export.
- Bank CSV quirks probed 2026-10-23 with hand-written variants, three faults fixed (`neobank.test.mjs`): `1-Mar-2026` dates were rejected; a `;`-delimited European file with `dd.mm.yyyy` dates and `1.200,50` amounts was misread unless `--day-first --decimal-comma` were given, and is now inferred from the cells (a day over 12, a dot separator, amounts ending `,dd` with none ending `.dd`; an explicit flag or page checkbox still wins, and the result's `inferred` says so); a `DR/CR` marker column beside an unsigned amount was ignored, so debits came in as credits. UTF-16 "Unicode text" exports from Excel (LE or BE, with or without a BOM) and Windows-1252 files are now decoded (`textcodec.mjs`, used by the CLI's file reader and the page's file picker; `textcodec.test.mjs`, 4 tests; synthetic bytes, no real Excel file). All variants are mine, not real bank files. A plain `Type` / `Transaction Type` column of DEBIT/CREDIT (or Withdrawal/Deposit) words beside an unsigned amount was also ignored (every debit came in positive); now read when every value is in that vocabulary and no amount carries a sign, so a card file's Sale/Return column is left alone (`headerless.test.mjs`, hand-written variants).
- Plain-text accounting exports, 2026-10-22: `export ledger` (ledger-cli and hledger) and `export beancount` (open lines, quoted narrations) write one dated entry per journal entry, accounts as `Assets:Checking`, amounts in the books' currency. Node test checks every entry sums to zero; the files were not loaded into hledger or bean-check here, so try them there.
- Bank statement PDF files read by the CLI (`import FILE.pdf --account CODE`, 2026-10-22: `pdftotext -layout`, then the pasted-text reader; node test builds a one-page PDF by hand and reads it with the real pdftotext; no real bank PDF tried, scans refused). Try real statements.
- A second generator, 2026-10-22: a 6-row table printed by LibreOffice 24.2 (`fixtures/statement-libreoffice.pdf`) reads identically to pdftotext, and a 140-row, 7-page Word-exported statement (generated here, not committed) imported 140 of 140 rows with every sign and the running balance right. It found one fault: a statement whose header names no year ("03/01" rows only) returned 0 rows and the unrelated message "No transaction lines were found". The reader now says there is no year, and `import FILE --year 2026` (and `readStatement(text, {year})`) supplies one. LibreOffice does compress object streams, so that path is exercised by this fixture. Still no real bank PDF.
- The in-tab PDF reader now decodes LZW, ASCII85, ASCIIHex and RunLength streams and PNG/TIFF predictors, alone or chained with Flate (2026-10-22; `pdftext.test.mjs` builds one-page PDFs with each filter and, where installed, poppler reads the same text; LZW code-width changes past 512/1024 entries and EarlyChange 0 covered; hand-built files, no real bank PDF; fonts with no ToUnicode map and a two-byte encoding are still unreadable)
- The page's file picker takes a statement PDF too (2026-10-22, `pdftext.mjs`): the text layer is read in the tab with no library and no upload (Flate streams, ToUnicode maps, text matrix and y-flip, widths for spacing). Verified on two PDFs printed by headless Chromium (a text statement and a table with a running balance over two pages): output equals `pdftotext -layout` after whitespace folding, 7 of 7 rows imported and reconciled, clicked through in headless Chromium. Not read: scans, encrypted files, non-Flate filters, two-byte fonts with no ToUnicode map; PDFs with compressed object streams are handled in code but no such file was tried. No real bank PDF has been tried.
- Opening balances from a trial balance (`opening.mjs`, CLI `opening`, agent input `opening`; 2026-10-21; node tests on hand-written trial balances, `node --test ventures/ai-bookkeeper/opening.test.mjs`, 8 pass; a page card (date, file or paste, set and remove; clicked through in headless Chromium with `node eval/browser-click.mjs`, 2026-10-21); a typed list replaces the opening inferred from a statement's running balance for the same account, and imported lines dated on or before the opening date raise a high `opening-overlap` close check).
- MT940 and CAMT.053 reading landed 2026-10-21 (`sepa.mjs`, hand-written fixtures); OFX, MT940 and CAMT closing balances now feed the reconcile check. Try real exports from a German, Dutch or UK bank.
- OFX/QFX and QIF reading landed 2026-10-21 against hand-written fixtures (`fixtures/checking.ofx`, `checking.qif`); try real downloads, and try a real multi-account OFX file. Those split per account (2026-10-21, `splitOfx`, `importOfxAccounts`, `fixtures/two-accounts.ofx`; CLI `import FILE --map OFXID=CODE,...`); the page's file picker shows one account picker per account (2026-10-21; clicked through in headless Chromium 2026-10-21 by `eval/browser-click.mjs`, which serves the folder, loads `two-accounts.ofx`, picks accounts, imports and loads the example; it skips when Playwright is absent).
- Check the five importers against real exports. `fixtures/` holds one file per
  shape (Chase checking and card, Bank of America, Wells Fargo, Amex, Capital
  One), written by hand from the layouts those banks document, with made-up
  rows. They are not real statements, so a bank changing its layout, or a quirk
  that only real data shows, is not covered until a real export is tried.
- First real-model reading of `eval/ai-eval.mjs`, 2026-10-23: Qwen2.5 3B (Ollama 0.5.7, CPU only, 4 cores, `num_ctx 8192`, temperature 0; about 4 minutes per 40-line call), one synthetic seed, months 10-12, 44 lines in review. Deterministic top suggestion right on 65.9% (20.5% had none). The model answered 93.2% of lines and was right on 15.9%: it rescued 4 lines and broke 24, so the combined result with the model's answer first is 20.5%. At this size the model is far worse than the deterministic layers and, as `aiSuggest` stands (it replaces the suggestion), makes the queue worse; n=44 on synthetic data, one seed, one model. Not tried: larger models, filling only lines with no deterministic suggestion. Two faults found on the way: the reader did not accept a bare JSON array, which this model returns, so every call fell back (fixed in `parseReply`, `ai.test.mjs`); and the default Ollama context (2048) truncates a 40-line prompt, so local runs need `num_ctx` of 8192 or a smaller `--batch`.


- PayPal activity CSV as a bank statement, 2026-10-23 (`bank.mjs`, bank `paypal`): the Net column (gross less fee) is the amount, only Completed rows are booked (pending ones reported), the description is "Name - Type", and the Balance column, when present, feeds the running-balance check. Before this the importer did not read that file at all (it has no Amount column); `payouts.mjs` still splits settlements into sales and fees. Hand-written fixture (`fixtures/paypal-activity.csv`), not a real export, so try one.
- PayPal's transaction types checked against PayPal's own reference, 2026-10-25 (`categorize.mjs` first four built-in rules, `paypal-types.test.mjs`, 5 tests): the 157 event codes at developer.paypal.com/docs/transaction-search/transaction-event-codes/, each description run through the suggester as `Name - Type` in both directions. Faults found: a customer's `Credit card payment` (T0005) was booked as a transfer, because the bank rule for card payments matched it; nine sale types (express checkout, subscription, donation, business...) were left blank; chargeback, dispute, partner, custody, campaign and bank-return fees and fee refunds were not fees; `General withdrawal`, `Bank deposit to PP account` and the currency conversions were blank, not transfers; `Mass payment` out is now contractors 6020. Left alone on purpose: holds and releases, refunds and reversals (no contra-revenue account in the default chart), `ATM withdrawal` (owner draw by the existing rule), tax withholding. The mapping is my reading of PayPal's descriptions, not a scored set, and the CSV's Type column may spell a type differently from the reference (the classic `Website Payment` is included; others unverified). No real PayPal export tried.
- Etsy ledger entry kinds read against Etsy's OpenAPI v3 spec, 2026-10-25 (etsy.com/openapi/generated/oas/3.0.0.json, `PaymentAccountLedgerEntry.description`: payment, refund, reversal of a failed refund, disbursement, returned disbursement, recoupment, miscellaneous credit/debit, bill payment). The spec describes the API ledger, not the CSV, so the CSV's Type spellings are still unverified. Fault found: a returned disbursement (money back after a failed bank deposit) fell to "other" and was booked as a negative fee. `readPayoutReport` now raises a problem for it and for a recoupment, telling the user to book them against the bank; the next deposit still splits. `payouts.test.mjs`, 44 pass. No real Etsy export tried.

- Minimum QBI deduction, 2026-10-23 (`estimatedtax.mjs`): for 2026 on, QBI of $1,000 or more gets at least a $400 deduction (the 2025 law's minimum; from memory of the statute, not read, since irs.gov and law sites refuse the shell here). It only changes results for QBI of $1,000 to $2,000. One test in `estimatedtax.test.mjs`.
- Minimum QBI deduction read at the statute, 2026-10-23: IRC 199A(i) (law.cornell.edu) confirms $400 and "at least $1,000" of QBI, but only from businesses the taxpayer materially participates in (§469(h)), and both amounts are indexed for years after 2026 (para. 3). Now `estimatedtax.mjs` warns when the floor is what sets the deduction (material participation) and that 2027+ uses unindexed figures. Whether the floor is capped by taxable income is not in the statute; the cap stays as an assumption. `estimatedtax.test.mjs`, 18 pass.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, or financial advice, and it does
not replace a qualified professional. **You are responsible for reviewing and
verifying its output before relying on it**, and for meeting any obligation it
helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

MIT licence (`LICENSE`).

### Section 179 taxable-income limit (engine)

`taxDepreciation(books, year, { businessIncome, carryIn })` and
`s179IncomeLimit` apply Form 4562 lines 9-13: the year's election (capped by the
dollar limit) plus any carry-in is deductible up to the year's taxable business
income before 179; the rest carries forward. Tested in `taxdepr.test.mjs`. The CLI (`--income`, `--carry-in`) and the page's "179 carried in" box use it, and the income can be read from the books.

## Invoices to send

`node cli.mjs profile name "Studio Co"` (also `address`, `email`, `taxId`, `payTo`, `terms`) stores your details in the books; `node cli.mjs invoice 7 --out inv-7.html [--as-of DATE]` writes one invoice or credit note as a single self-contained HTML page that prints to PDF. Lines use the document CSV's optional `description` column (else the account name; account 2100 shows as sales tax); it then shows credits applied, payments received, the balance due, a Paid stamp or the days overdue, and "How to pay" only while a balance is open. Everything is HTML-escaped. A bill is refused. Test: `invoice.test.mjs` (hand-written documents only; the layout was not checked on paper). On the page: "Your details for printed invoices" under the invoices card saves the same fields, and each open invoice in the write-off list has a Print button that opens the invoice in a new tab (a download if pop-ups are blocked) for the browser's Save as PDF; clicked through in headless Chromium with `eval/browser-click.mjs`. Paid invoices and credit notes have no button yet.

## Paying bills

The page has a card for it too ("when to pay your bills": a reserve box and a plan table; 2026-10-22). The headless Chromium click-through covers only the no-open-bills message; the plan table itself is covered by `billpay.test.mjs`.

`node cli.mjs paybills [--as-of DATE] [--days N] [--reserve AMOUNT] [--json]`
plans when to pay each open bill. It takes the cash forecast (bank balance,
recurring items, invoices expected in), removes the bills, and puts each bill on
its due date, or tomorrow if it is already late. A bill that would push the
balance under the reserve slides to the first day from which it fits, and one
that never fits is listed with the shortfall. Late and older bills get the cash
first. Verification: node tests on hand-written ledgers (`billpay.test.mjs`),
not tried on real books; it assumes no early-payment discounts or late fees. It
is a plan to read; nothing is paid from here, and it is not on the page yet.

## Payment reminders

`node cli.mjs reminders [--as-of DATE] [--min AMOUNT] [--out DIR]` lists each
customer with overdue invoices, oldest debt first, and with `--out` writes a
plain-text draft (subject line and body) per customer. The tone steps up with
how late the oldest invoice is: friendly under 15 days, firm from 15, final from
45 (`DEFAULT_STEPS` in `collections.mjs`; a common practice, not a rule, and the
final wording's 7-day notice is a template to edit, not legal advice).
Pair it with `statement` for the customer's account. Amounts come from the same open documents as `aging`, so
part-payments and credit notes are already netted. Nothing is sent from here.
Tested in `collections.test.mjs` on hand-written invoices only (tone steps,
one per customer, part-payments, the `--min` cut); on the page (2026-10-22): under the aging table, one row per overdue customer with its tone and a "Copy draft" button (clipboard, or a .txt download if the clipboard is blocked); clicked through in headless Chromium with `eval/browser-click.mjs`. No real customer has received one.

### European column names (2026-10-22)

`bank.mjs` also matches German, French, Spanish, Italian and Dutch headers (`Buchungstag`, `Verwendungszweck`, `Betrag`, `Soll`/`Haben`, `Libellé`, `Débit`/`Crédit`, `Fecha`, `Concepto`, `Importe`, `Saldo`, and similar). Pass day-first dates and decimal commas as for any European file. The names are from general knowledge of these languages, not from a specific bank's download; text month names in dates (`1. März 2026`, `3 déc. 2025`, `12 de marzo de 2026`, `31 gen 2026`, `5 mrt 2026`, `6 out 2026`) read in German, French, Spanish, Italian, Dutch and Portuguese as well as English (2026-10-23, `monthnames.test.mjs`; word lists from general knowledge, no real bank export tried).

### N26 and Venmo CSVs (2026-10-22)

`bank.mjs` recognises the N26 account export (Booking Date, Partner Name, Amount (EUR); the partner becomes the description) and the Venmo statement (preamble lines and the dateless balance rows are skipped, Pending and Cancelled payments are reported rather than imported, and the description names the other party and the note). Both are written from memory of the layouts, tested on hand-made fixtures (`fixtures/n26-account.csv`, `fixtures/venmo-statement.csv`, `neobank.test.mjs`), not on a real download. Venmo's beginning and ending balance are not chained yet.

### Cash App and SoFi CSVs (2026-10-22)

`bank.mjs` recognises the Cash App activity report (the Net Amount column is used so the fee is already taken off, non-COMPLETE rows such as canceled payments are reported rather than imported, and the description names the other party and the note) and the SoFi checking export (Pending rows skipped, running balance chained). Both are written from memory of the layouts and tested on hand-made fixtures (`fixtures/cashapp-report.csv`, `fixtures/sofi-checking.csv`, `neobank.test.mjs`), not on a real download.

### USAA CSV (2026-10-22)

`bank.mjs` recognises the USAA checking export (`Date, Description, Original Description, Category, Amount, Status`): the cleaned Description is used, Pending rows are reported rather than imported. Written from memory of the layout and tested on a hand-made fixture (`fixtures/usaa-checking.csv`, `neobank.test.mjs`), not on a real download.

- Legacy codepages, 2026-10-23 (`decodeBytes` in `textcodec.mjs`, `textcodec.test.mjs`): a file that is not UTF-8 and has no BOM used to be read as Windows-1252 always, so the page garbled a LITAS-ESIS `.acc` (cp1257) and Cyrillic exports (cp1251). It now recognises the ESIS header (`000<tab>YYYYMMDD<tab>`) as 1257 and a run of accent-only words as 1251, and takes an explicit `encoding` argument. Windows-1250 (Czech, Polish) shares too many letters with 1252 to guess and still needs the argument. Tested on byte arrays I encoded by hand, not on a real bank download.
- IRC 199A(i) read at law.cornell.edu, 2026-10-23 (`estimatedtax.mjs`, `estimatedtax.test.mjs`): the statute confirms the $400 floor, "at least $1,000" of QBI (so exactly $1,000 qualifies, as coded) and active-business (material participation) wording. It also says both amounts are indexed for tax years after 2026 (rounded to $5), which the code ignored: `estimate` for 2027 on now warns and takes `qbiMinimum { floor, threshold }` in cents. The earlier "unverified" note on this item is closed. The B-notice entry above had cited Pub. 1281 as Rev. 12-2025; the PDF on irs.gov is Rev. 12-2023 (text and windows unchanged, label corrected).
- 2027 social security wage base $192,300 added to `payroll.mjs` and `taxforms.mjs` (2026-10-23): SSA announced it in October 2026; seen in several trade-press reports (Journal of Accountancy, Kiplinger, Ascensus via search), not on ssa.gov (blocked from the sandbox), so the warning stays. The 2027 IRS revenue procedure was not yet out. `taxforms.test.mjs`.
- Brokerage OFX, 2026-10-24 (`bank.mjs` `readOfx`, `ofx-investment.test.mjs`): importing the Fidelity-style sample in the ofxparse project's fixtures (MIT, fetched from raw.githubusercontent.com, a 2012 sample with made-up values) booked its 3 `INVBANKTRAN` lines and silently dropped 4 `INCOME` dividends and 10 buys/sells. Now `INCOME` (positive) and `INVEXPENSE` (negative) lines are booked from `TOTAL`, and the buys and sells are reported as not booked. Vanguard and TD Ameritrade samples (positions only) still say there is nothing to book. Checked on that sample plus a made-up fixture; no current broker export seen.
- Semiweekly deposits spanning two quarters, 2026-10-24 (`deposits.mjs`, `deposits.test.mjs`): read against IRS Publication 15 (2026) (irs.gov/pub/irs-pdf/p15.pdf, pdftotext). Its "Semiweekly deposit period spanning 2 quarters" paragraph says pay dates in different quarters need separate deposits, both due the same day; `depositSchedule` merged them into one deposit and counted it all in the first quarter's $2,500 de minimis test. Now each quarter is its own deposit (Pub. 15's own example: Wed 2026-09-30 and Fri 2026-10-02, both due 2026-10-07). The lookback windows, $50,000 and $2,500 figures, and the Wed/Fri rules in the same pages match the code.
- $100,000 next-day rule checked against Pub. 15 (2026), 2026-10-24 (`deposits.test.mjs`): the pub's "Fir Co." example (Mon $110,000 due Tue; Tue $30,000 not added, due Fri) and its $95,000 Tuesday / $10,000 Wednesday example (separate periods, no next-day deposit) both come out as the pub says with the existing code; no code change, two tests added. The monthly-to-semiweekly switch ("on the next day, for the rest of the year and the next") matches the Caution paragraph.
- Massachusetts due dates, 2026-10-24 (`salestaxreturn.mjs`, `salestaxreturn.test.mjs`): `--state MA` now puts monthly returns on the 20th and quarterly/annual returns 30 days after the period closes (`dueDay: { after: 30 }`, the rule since 2021). From memory and search excerpts; not read on mass.gov, so check your own notice. Tested on hand-made invoices only.
- Virginia and Arizona due dates, 2026-10-24 (`salestaxreturn.mjs`, `salestaxreturn.test.mjs`): `--state VA` and `--state AZ` are listed in `STATE_DUE_DAYS` at the 20th of the month after the period (VA from the Tax Department's ST-9 instructions, AZ from azdor.gov and Phoenix TPT guidance, both via search excerpts). They matched the default already; now explicit and tested. Arizona e-filers get until month end, not modelled. Not read on the forms; check your own notice.
- Sales-tax due days for TN, AL, SC (20th) and NM (25th), 2026-10-24: TN from the state revenue page, the rest from third-party guides seen in search excerpts. Tested on hand-made invoices only.
- Sales-tax due days for AR, OK, KY, MS, NE (the 20th), 2026-10-24 (`salestaxreturn.mjs`): from Kintsugi and TaxJar calendars via search; state sites not read. Missouri left out because sources conflict (month end vs the 20th). Check your own notice.
- eBay payouts, 2026-10-24 (`readEbay` in `payouts.mjs`, `fixtures/ebay-transactions.csv`): `payouts` reads the Seller Hub transaction report (note lines, then `Transaction creation date`, `Type`, `Net amount`, `Payout ID`, `Gross transaction amount`, `Item subtotal`, `Shipping and handling`, `Seller collected tax`). Rows group by Payout ID like Stripe's; an Order's fee is gross less net, shipping labels and other fees are fees, holds and releases go to the reserve account, and a row with no Payout ID stays pending. A Payout row that does not equal its rows' net means the payout is not split. Seller-collected sales tax is split out of sales only when subtotal + shipping + tax equals the gross exactly. Treated as a marketplace for the 1099-K threshold. Layout written from memory of eBay's help pages and one hand-made fixture; no real export tried, so (3) in the flagship list is still open for a real one.
- Sales-tax due days for MI, CT, WI, UT, IN, KS, 2026-10-24 (`salestaxreturn.mjs`, `salestaxreturn.test.mjs`): `--state` now knows MI (20th), CT, WI and UT (last day of the month after), IN (30th, clamped to month end in February) and KS (25th). Read from search excerpts of the states' own pages (Treasury, DRS, DOR, Tax Commission, ST-36), not the full forms. Not modelled: WI and IN "early" monthly filers (20th), MI's Feb 28 annual return. Tested on hand-made invoices only.
- Colorado and Minnesota due dates, 2026-10-24 (`salestaxreturn.mjs`): `--state CO|MN` are the 20th (TaxCloud and TaxJar tables via search excerpts; state sites unreachable). Check your own notice.
- Nevada and Idaho due dates, 2026-10-24 (`salestaxreturn.mjs`): `--state NV` and `ID` are the 20th (Kintsugi, TaxJar and TaxCloud tables via search excerpts; Nevada moved from month end and the effective date was not confirmed). Iowa left out: sources disagree. Check your own notice.
- Louisiana and Maryland due dates, 2026-10-24 (`salestaxreturn.mjs`): `--state LA|MD` are the 20th (TaxCloud and Kintsugi tables via search excerpts; state sites not read). Check your own notice.
- Missouri and Iowa due dates, 2026-10-24 (`salestaxreturn.mjs`): `--state MO|IA` are the last day of the month after the period, settling the conflict earlier runs left (MO: dor.mo.gov's 2026 monthly table and FAQ say month end; the older instructions booklet's 20th is outdated. IA: revenue.iowa.gov filing-frequency page; Streamlined Model 1 sellers file the 20th and annual filers Jan 31, not modelled). Search excerpts, not the full forms; check your own notice.
- FUTA credit reduction 2026, 2026-10-24 (`POTENTIAL_CREDIT_REDUCTION` in `payroll.mjs`, `payroll.test.mjs`): `form940 --state CA` for 2026 now warns that California is on the DOL's potential list (1.5% base, up to 5.3% with the benefit-cost-rate add-on unless waived) and that it is final only after Nov 10, 2026. The rate is never applied automatically. The U.S. Virgin Islands paid off its loans in June 2026 per payroll.org, so it is not listed. From search excerpts (payroll.org, Bloomberg Tax); the DOL page was not reachable.
- bank2ynab's sample files, 2026-10-24 (`bank.mjs`, `textcodec.mjs`, `bank2ynab-samples.test.mjs`, 4 tests): imported the 40 files in bank2ynab's `test/test-data` (MIT, github.com/bank2ynab/bank2ynab; real column layouts, made-up rows) with the CLI. Six read nothing or lost lines; four fixed. A German card export (`Buchungsbetrag`, `Transaktionsbeschreibung`) and a UK card export (`Date Processed`) had no matching headers; `Pending` dates are now reported as pending rather than as unreadable. A Singapore export that puts a detail line (no date, no amount) under each transaction skipped every detail line with an "unreadable date" error; it now joins the description above. A Czech export in Windows-1250 with no letter unique to that codepage decoded as 1252 and read nothing; the codepage is now taken from Czech and Polish column names (`částka`, `účtu`, `Kwota`), and `Zaúčtovaná částka` and `Zpráva` are aliases. Not fixed: single-row header-less files (`dba33...csv`, `statement_1.csv`: one line is too little to infer columns from) and a Swedbank-style `.dat` (`kta_ei.dat`, pipe records). Still no real current export from a named bank.
- csv2ofx's sample files, 2026-10-28 (`bank.mjs`, `csv2ofx-samples.test.mjs`, 5 tests): read the seven CSVs in csv2ofx's `data/test` (MIT, github.com/reubano/csv2ofx; layouts of real exports, made-up rows). Five read correctly (Capital One debit/credit, Payoneer, Mint with its debit/credit type column, a credit-union file, a default export with accented names). Two did not: PC Financial's purchases-only card file (unsigned amounts) was booked as money in with no warning, now flagged "Every amount is positive" with the `invert` fix named (a debit/credit or mixed-sign file is never flagged); Xero's Journal Report (both sides of each entry) said only that no lines were found, now says it is a journal, not a bank statement. Not covered: the other 20 csv2ofx samples (404 through the proxy by guessed names).
- csv2ofx's sample CSVs, 2026-10-24 (MIT, from the PyPI source archive, read only, nothing copied): 26 files read with `readStatement`; 25 read as expected. A UBS-style file (French headings) lost its header because `Date de valeur` was not a known date column, so the header was skipped as a preamble, its first row had no description and the others kept only `Description 3`. Fixed in `bank.mjs`; `Description 1..4` columns are now joined in header order (`csv2ofx-samples.test.mjs`, 2 tests, made-up rows). Still no fresh bank download.

- CSV exports are formula-safe, 2026-10-24 (`safeText` in `engine.mjs`, `export-formula-safety.test.mjs`): bank descriptions are untrusted, and a memo starting with `=`, `+`, `-` or `@` opened as a formula in Excel or Sheets. Text columns of the csv, qbo and xero journal exports and the lines export now get a leading apostrophe; amounts and dates stay bare.
