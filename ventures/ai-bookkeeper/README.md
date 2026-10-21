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

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ai-bookkeeper/

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
| `sepa.mjs` | Reads MT940 (SWIFT `:61:`/`:86:`, including German `?20` structured purpose lines) and CAMT.053 (ISO 20022 XML, namespaces and reversal flags handled), the formats European banks export. The closing balance is kept and checked by the reconcile close check. Fixtures are hand-written: `fixtures/checking.mt940`, `checking.camt053.xml`. |
| `bank.mjs` | Reads OFX/QFX (SGML or XML) and QIF files, which carry signed amounts as the account prints them, and CSV statements: RFC 4180 quoting, `,` `;` or tab, amount or debit/credit columns, US or day-first dates, `(12.00)` and `12.00-` negatives. Each row gets a stable id, so re-importing an overlapping month adds only new lines. When the bank prints a running balance, every row is checked against the one before. |
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
yours to decide. `cli.mjs contractors --filing` (`nec1099FilingCsv`, and a button on the page) writes one row per payee over the line in the Form 1099-NEC's own box names (box 1, box 4) for a filing service's import sheet; services take their own column layouts, so it is the form's boxes, not any one service's file, and the TIN and address columns are blank because none is stored. The $2,000 line from 2026 matches several tax-firm write-ups of the 2025 change (not yet read on the IRS page itself). `necDeadline` gives the filing date (January 31, rolled to the next weekday: February 1, 2027 for 2026 payments). From 2027 the $2,000 is indexed to inflation, so the worksheet warns unless you pass a threshold. Test: `taxforms.test.mjs`.

## Sales tax report

`salesTax(books)` (also `salesTax` from `analyze`, the page's sales tax table and
`cli.mjs salestax [--from D --to D]`) reads account 2100 by month: sales (the
invoice lines other than tax, less credit notes), tax collected, tax taken off by
credit notes, tax paid over (bank lines filed to 2100) and what is still owed. Tax
on bills is left out. It is a worksheet to check a return against, not a return:
rates, nexus, exemptions and filing dates are yours to know. Test: engine.test.mjs,
"sales tax is collected".

**Refunds and write-offs.** A bank line for the exact amount left on a credit
note nobody applied (money out for a customer's credit, money in for a
supplier's), with the credit's number or the party's name in the description,
settles it: it posts to receivable or payable and the credit leaves `aging`.
`writeoff ID [--date D]` (CLI; `writeOff` in the engine; the page lists open invoices with a Write off button) moves an invoice's
unpaid balance to Bad debts (6900, added if missing): debit bad debts, credit
receivable, on the date given. Invoices only. Tests: "Refunding a credit note,
and writing off a bad debt".

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
input. The mid-quarter convention is computed (2026-10-21): when over 40% of the
year's basis (cost less 179) went into service October to December, every asset
placed that year uses a table for its own quarter (`MACRS_MID_QUARTER`,
generated by the declining-balance rule; the 5-year Q1 and Q4 rows equal the
printed ones as remembered, other classes may differ from the printed row by a
few hundredths of a point in a year, and none is checked against Pub 946
because the hosts were unreachable). Disposal in a mid-quarter year still takes
half the year's amount, not the quarter rule. Section 179 dollar limit and investment phase-out are checked (`s179Check`, 2024 to 2026, figures typed from memory and unchecked; excess is warned, not removed). It warns and does not compute: the 179
taxable-income limit and carryforward, the bonus rate in force, business-use share
and listed property. The tables were typed from memory of Table A-1, then checked (2026-10-21) by
deriving each class from its rule (200% or 150% declining balance, half-year,
switch to straight-line) in a test: all six agree within the printed rounding.
That checks the typed digits, not the publication itself: check them before filing. Not on the page yet.

## Not modelled

Writing off a bill, the 179 taxable-income limit, mid-quarter disposal-year rules, inventory,
payroll and sales tax filings, multiple currencies, and receipts.

## Next

- MT940 and CAMT.053 reading landed 2026-10-21 (`sepa.mjs`, hand-written fixtures); OFX, MT940 and CAMT closing balances now feed the reconcile check. Try real exports from a German, Dutch or UK bank.
- OFX/QFX and QIF reading landed 2026-10-21 against hand-written fixtures (`fixtures/checking.ofx`, `checking.qif`); try real downloads, and try a real multi-account OFX file. Those split per account (2026-10-21, `splitOfx`, `importOfxAccounts`, `fixtures/two-accounts.ofx`; CLI `import FILE --map OFXID=CODE,...`); the page's file picker shows one account picker per account (2026-10-21; clicked through in headless Chromium 2026-10-21 by `eval/browser-click.mjs`, which serves the folder, loads `two-accounts.ofx`, picks accounts, imports and loads the example; it skips when Playwright is absent).
- Check the five importers against real exports. `fixtures/` holds one file per
  shape (Chase checking and card, Bank of America, Wells Fargo, Amex, Capital
  One), written by hand from the layouts those banks document, with made-up
  rows. They are not real statements, so a bank changing its layout, or a quirk
  that only real data shows, is not covered until a real export is tried.
- Run `eval/ai-eval.mjs` against a local model (it needs one the build
  environment lacked) and put the table in Verification.


## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, or financial advice, and it does
not replace a qualified professional. **You are responsible for reviewing and
verifying its output before relying on it**, and for meeting any obligation it
helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

MIT licence (`LICENSE`).
