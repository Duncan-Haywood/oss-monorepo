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

**Live tool:** https://marisstella.app/ai-bookkeeper/

After using this, you can now **turn a month of bank and card statements into
balanced books in minutes, with the boring payees learning from your
corrections (on the benchmark, 60% of lines post themselves from the fourth month on)**, which used to take sorting every line by hand in a
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
| `plaid.mjs` | Reads Plaid transactions JSON (`/transactions/get`, or `added`/`modified` from `/transactions/sync`). Plaid's positive amount is money out, so signs are flipped; pending rows are skipped (Plaid reposts them under a new id); duplicate `transaction_id`s are dropped; the merchant name is the description. |
| `sepa.mjs` | Reads MT940 (SWIFT `:61:`/`:86:`, including German `?20` structured purpose lines) and CAMT.053 (ISO 20022 XML, namespaces and reversal flags handled), the formats European banks export. The closing balance is kept and checked by the reconcile close check. Fixtures are hand-written: `fixtures/checking.mt940`, `checking.camt053.xml`. |
| `bank.mjs` | Reads OFX/QFX (SGML or XML) and QIF files, which carry signed amounts as the account prints them, and CSV statements: RFC 4180 quoting, `,` `;` or tab, amount or debit/credit columns, US or day-first dates, `(12.00)` and `12.00-` negatives. Each row gets a stable id, so re-importing an overlapping month adds only new lines. When the bank prints a running balance, every row is checked against the one before. Dutch ING (Af/Bij, YYYYMMDD) and Rabobank (Omschrijving-1..3, Saldo na trn) layouts read, from remembered headers and made-up rows. |
| `opening.mjs` | Opening balances from a trial balance CSV (`code,amount` in natural sign, or `code,debit,credit`), dated; whatever does not balance goes to 3000 and is reported. For starting mid-stream with a receivable, a loan, equipment and prior earnings already on the books. CLI `opening FILE --date D`; agents `opening: {csv, date}`. |
| `payroll.mjs` | Pay-run register to books: wages, employer taxes, the 2300 liability, bank-line matching and a Form 941 worksheet. |
| `ledger.mjs` | The double-entry core, in integer cents: a 37-account small-business chart (or your own), entries that must balance, trial balance, monthly profit and loss, and a balance sheet where unclosed profit shows as current earnings, and an indirect-method cash flow statement (`cashFlow`, in `report`) that must tie to the change in the bank accounts (since 2026-10-26 depreciation is an operating add-back and a disposal shows proceeds in investing; 2026-10-26 `freeCashFlow` = operations less fixed-asset purchases; `monthlyBurn` and `runwayMonths` = cash used by operations and investing per month, and closing cash over it, null when not burning; 2026-10-27 `cashFlowByMonth` gives each month's statement and the last three months' burn and runway, in the CLI `report` and a table on the page; 2026-10-27 `ratios` (in `report`, the CLI and the page): gross and net margin, working capital, current and quick ratio, debt to equity, each null rather than invented when its denominator is zero or negative, with the loan counted as long term). |
| `categorize.mjs` | Four layers, in order: your rules (`keyword => account`), memory (the account you chose for this payee before), then, on a card line that carries the network's merchant category code or name (`mcc.mjs`), where these books filed that category before or a fixed table of codes (README "Merchant category codes"), a naive Bayes classifier trained on everything you filed, and conservative built-in keywords; then the bank's own category label, and for a payee never filed before a weak guess from the kind of name (person, business, other) and the line's size, read against every other payee's first line (never posted alone, at most 0.5 and at most its own record on earlier new payees, README "New payees"). Payees are normalised first: `SQ *BLUE BOTTLE 0412 OAKLAND CA` and `POS DEBIT SQ *BLUE BOTTLE 9981` are both `blue bottle`. |
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
| all | 62.5% | 90.4% | 111 | 4.2% |
| without memory | 0% | 88.1% | 88 | 7.7% |
| without the classifier | 62.5% | 89.7% | 82 | 6.3% |
| without built-in keywords | 62.5% | 86.0% | 121 | 8.1% |
| without the new-payee guess | 62.5% | 90.3% | 100 | 4.8% |
| memory only | 62.5% | 81.0% | 68 | 15.6% |
| classifier only | 0% | 78.1% | 77 | 18.2% |
| built-in keywords only | 0% | 67.6% | 90 | 28.0% |

Rerun 2026-11-10 (2,071 lines; the earlier table, 2,074 lines, predates later keyword
work). On this synthetic year the new-payee guess adds 0.1 points and 11 wrong
suggestions: the generator's payees are businesses the keywords already know. Its real
test is the labelled books below.

Reading it, same caveat as above (synthetic data, keywords written by the
generator's author): memory alone gets to 81%, and the other two layers add
about 8 points between them. Auto-posting comes only from memory and your
rules, so without memory nothing posts alone, however good the classifier is.
Wrong suggestions rise from 68 (memory only) to 100 (all layers) as the
extra layers widen coverage, while "right in all" rises from 81.1% to 88.8%.
Suggestions never post alone unless memory or a rule made them. Which
of the two extra layers adds the most cannot be read off this table: each
"without" row removes a layer the others partly cover.

**Measured since:** a local Qwen2.5 7B on synthetic lines (README "The AI layer") and,
with a 14B as well, on 140 real City of Toronto card lines ("A year of Toronto card lines and the AI layer");
real bank and card exports in the sections below. A hosted model (Claude, GPT, Gemini)
has not been measured: no key in the build environment.

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

### Labelled books from five fiscal hosts (2026-11-10)

`node eval/opencollective-labelled.mjs --host <slug> --pages 10` reads paid expenses from
Open Collective's public API, each with the accounting category the fiscal host's own
finance team assigned: real memos and payees, with an answer key the keyword author did not
write. Records are fetched at run time and never copied here (payees include private
people, so only aggregates are reported). Each host category is mapped to one or two chart
accounts in `MAPS`; categories with no counterpart (grants, donations, "Administrative")
are left unscored. "Online" is the import loop month by month: each line is suggested from
every earlier month's filed lines, then filed with the host's answer. Text is the memo the
submitter typed.

| host | scored lines | always the commonest category | keywords alone, before | after | online, before | after | posted alone (wrong) |
|---|---|---|---|---|---|---|---|
| opensource (rules written from it) | 8,386 | 47.5% | 21.5% | 38.5% | 87.0% | 87.4% | 46.8% (71, 1.8%) |
| foundation (rules written from it) | 6,749 | 29.3% | 23.3% | 35.6% | 61.0% | 62.9% | 16.6% (30, 2.7%) |
| raft (held out) | 1,581 | 18.8% | 16.4% | 26.3% | 71.3% | 73.1% | 27.8% (7, 1.6%) |
| pact_collective (held out) | 2,063 | 62.8% | 9.3% | 16.4% | 73.3% | 73.9% | 25.5% (9, 1.7%) |
| metagov (held out) | 1,226 | 57.2% | 13.1% | 23.2% | 74.6% | 74.7% | 14.5% (2, 1.1%) |

"Right of all" throughout. The rules added are the words people type on an expense
("web hosting", "legal services", "maintenance and development", "printing",
"supplies", "groceries"), last in `BUILT_IN` so a vendor name wins. On the three held-out
hosts, measured before and after with no rule written from them, keywords alone went from
9-16% to 16-26% right.

What it says, with care:

- **Learning does most of the work.** From memos alone the loop is right on 63-87% of
  lines, against 19-63% for always picking a host's commonest category. On pact_collective
  that margin is only 11 points: most of its lines are one category.
- **Bank-style text is much harder.** With the payee's name only (what a bank line
  carries), online right falls to 43-65%, and a payee seen for the first time is right on
  9-17%. A memo, receipt or invoice line is worth carrying into the books.
- **Hosts disagree on conventions.** pact_collective files programme groceries as
  supplies; the keywords say meals and are wrong 60% of the time they speak there (40.1%
  right of suggested). Memory learns the host's convention within a few months.
- **Lines posted without review were wrong 1.1% to 2.7% of the time** at the default 0.85.
- These are reimbursement and invoice records, not bank lines, the mapping to the chart is
  this repository's, and the newest 10,000 paid expenses were read for the two big hosts
  (all of them for the other three).

### Labelled bank lines from Mint exports (2026-11-10)

Open Collective's records carry memos and payee names, not bank text, and the step after them
was "new payees": how often a line from a merchant never seen before is right. A public Mint
export has exactly that: the raw bank descriptor ("Original Description") beside the category
Mint chose or its owner corrected. `node eval/mint-labelled.mjs --set tune|held|all` reads ten
such files from public GitHub repositories at pinned commits (fetched at run time, never copied:
they are personal spending, so only totals are written here) and replays each one month by
month like the import loop. Only money out in Mint categories that name one chart account is
scored (restaurants, travel, fuel, utilities, fees, taxes, rent and so on; groceries, shopping
and transfers are left out). Mint's category column is never shown to the categoriser. Four
files ("tune", 2,159 scored lines) were read for misses; six ("held", 767 lines from 2012 to
2023) were not looked at until the change was final.

Lines are replayed with their real amounts through the same model the engine builds, including
the new-payee guess (next section). "Before" is `main` with that guess already landed.

| held-out files, 767 lines | right before | right after | wrong before | wrong after |
|---|---|---|---|---|
| keywords alone, every line | 52.3% | 54.0% | 1.8% | 1.8% |
| learning loop, every line | 76.5% | 79.1% | 13.2% | 10.7% |
| learning loop, a payee seen for the first time (403) | 65.5% | 68.7% | 18.6% | 15.6% |
| same loop with the new-payee guess off, every line | 71.7% | 74.4% | 8.7% | 6.3% |
| same, a payee seen for the first time | 57.6% | 60.8% | 11.7% | 8.7% |

On the tune files the loop went 93.2% to 94.6% right (first-seen 87.5% to 89.6%). On bank
text the new-payee guess adds about 8 points right on first-seen payees here and about 7
points wrong: most bank spending in these books is meals, so the plurality is often right.

Three changes, each found on the tune files:

- **A city name overruled a keyword.** The naive Bayes layer runs before the built-in keywords
  and spoke at p >= 0.5. On one Brooklyn checking account, a few lines filed to dues taught it
  that "brooklyn" meant dues, so Shake Shack and a deli the keywords knew as meals went to dues
  (that file: keywords alone 57.8% right, the learning loop 35.6%). The classifier now needs
  p >= 0.95 to overrule a keyword that fires; with no keyword it speaks at 0.5 as before. This
  is most of the held-out gain (measured before the new-payee guess landed, every line at one fixed amount: 72.0% right and
  8.9% wrong without it, 75.0% and 5.9% with it).
- **Bank wrapper words became the payee.** "PRE-AUTHORIZATION DEBIT AT DUNKIN" and "Pending
  DEBIT PURCHASE ... AT GRAFTON ST" keyed every line of a bank to "authorization at" or
  "pending at", so payee memory pooled every merchant together. `pending`, `authorization`,
  `at`, `on`, `non`, `pin` are now noise words in the payee key. Memory saved under the old
  key for such lines is not found again; those keys pooled every merchant, so little is lost.
- **Keywords.** Restaurant words on bank lines (kitchen, grille, pub, tavern, cantina,
  trattoria, crepe, barbeque, soup, sandwich, burger,) and Seamless's glued descriptor
  ("SEAMLSSTHEMILL"); "taxi" no longer matches an Ohio tax site ("OHTAXITES"), and "southwest"
  no longer sends Moe's Southwest Grill to airfare.

What it says, with care: the labels are agreement with Mint, a commercial merchant database,
plus each owner's corrections, not a bookkeeper's answer key, and the books are personal. Most
first-seen misses are one-off local restaurants whose names say nothing ("PEASANT", "BLUE
PIT"); no keyword can know them, and a merchant category code from the card network or a model
would. Tests: `mint-labelled.test.mjs` (5, made-up rows).
### New payees (2026-11-10)

The labelled books above showed the weak spot: from the payee's name alone, a payee seen
for the first time got a suggestion on 8-33% of lines and was right on 5-21%. Memory and
the classifier know nothing about a new name, and most names carry no keyword. So a sixth
layer, `guessNewPayee` in `categorize.mjs`, reads only two things a new line still has:
what kind of name it is (`payeeShape`: a person, a business by its suffix or trade word, or
other) and its size (under $50, $500, $5,000, or more). It counts the account of every
other payee's first filed line in the same view, and offers the plurality when at least 8
payees are in that view and at least 40% of them agree; otherwise it backs off from shape
and size to shape, size, then direction, and stops at the first view with 8 payees if that
view is split. It is a suggestion for review only: confidence at most 0.5, never posted
alone. Since 2026-11-11 the AI layer's default fill mode leaves the guess alone (on real
card lines a 7B model over the guess did worse than the guess, "A year of Toronto card
lines" below); `mode: "fill-guess"` lets the model take the line. The thresholds were set before
the first reading and not tuned.

Online, each line at its real amount, first-time payees only, right of all:

| host | text | before | after | the same layer, direction only | right of suggested, before / after |
|---|---|---|---|---|---|
| opensource | payee | 21.2% | 56.8% | 55.2% | 64.5% / 63.3% |
| foundation | payee | 10.3% | 19.5% | 10.3% (split, says nothing) | 50.0% / 40.2% |
| raft (held out) | payee | 13.8% | 32.6% | 13.8% (split) | 71.9% / 43.9% |
| pact_collective (held out) | payee | 4.7% | 41.4% | 41.4% | 58.3% / 52.4% |
| metagov (held out) | payee | 16.5% | 65.4% | 67.1% | 75.0% / 68.9% |
| the five, memo text | memo | 61.2-84.0% | 64.3-84.9% | | |

What it says, with care:

- **Most of the gain on three hosts is just "the account most new payees go to".** Where
  one category dominates (opensource, pact_collective, metagov) the direction-only prior
  does as well, and on metagov 1.7 points better. Shape and size earn their place where
  the prior is split: foundation and raft, where the prior alone says nothing and the
  layer gets 9 and 19 points.
- **It costs wrong suggestions.** On raft, 42% of first-time lines now carry a wrong
  guess, against 5% before; the reviewer changes a low-confidence pill instead of picking
  from blank. Right of suggested falls on every host. Nothing more posts alone: auto-posted
  share and its error count are identical with the layer on and off.
- With memo text the keywords and classifier already cover most lines, so the layer adds
  1-3 points.
- These are reimbursement and invoice records with the payee's display name, not bank
  descriptions; "person" is a guess from the name's form, not a lookup.

Reproduce: `node eval/opencollective-labelled.mjs --host raft --variants payee,memo --new-payee`
(the cache file name changed to `-v2` because amounts are now fetched). Tests:
`new-payee.test.mjs` (5 then; 7 since the record, below).

### New payees, held out: a ledger, a bank export and a card (2026-11-10)

The reading above is on Open Collective, the data the layer was designed on. This one is
on three labelled public sets it never saw, from raw.githubusercontent.com (Open
Collective's API was refused from this session):
`node eval/new-payees.mjs --hackclub main.ledger --makerspace DIR --chase cc_transactions.csv [--no-new-payee] [--levels direction] [--min-share 0.5]`
(fetch commands in the file's header; nothing is copied here). Each set is replayed day
by day at its real amounts (`hackclub-ledger.mjs` reads amounts since this run). Every
line is suggested from all earlier filed lines, and lines whose payee key and direction
are new are scored separately. On Chase the label is Chase's own category, so its
bank-category layer is off.

First-time lines, right / wrong of all:

| set | first-seen lines | layer off | layer on | direction-only prior | new-payee suggestions right |
|---|---|---|---|---|---|
| Hack Club ledger (US nonprofit, clean payee names, 2015-2017) | 184 | 41.8% / 4.3% | 53.3% / 25.0% | 48.9% / 26.6% | 21 of 59 (35.6%) |
| makerspace bank exports (raw bank text, 2020-2023) | 16 | 68.8% / 12.5% | unchanged | unchanged | never fires (too few payees) |
| Chase card (one person, Sep-Dec 2023) | 79 | 77.2% / 1.3% | 93.7% / 5.1% | 93.7% / 5.1% | 13 of 16 (81.3%) |

What it says:

- **On a second domain, the layer still adds right answers: 11.5 points on Hack Club and
  16.5 on Chase.** On Chase it is entirely the prior (a personal card is mostly food), as on
  three of the Open Collective hosts. On Hack Club, shape and size add 4.4 points over the
  prior.
- **The cost is larger here.** On Hack Club, a first-time line now carries a wrong guess
  25.0% of the time, against 4.3% before, and only 35.6% of the layer's own suggestions
  are right. That is under the 40% share the layer asks of its evidence. Nothing more
  posts alone (confidence at most 0.5).
- **"Person" is mostly not people on bank-style text.** `payeeShape` calls any two to
  four plain words a person. On Hack Club that is 83 payees, of which about 20 are
  people (the rest are "Bristol Farms", "Spice Kit", "Holy Grill"). On Chase it is 50
  payees and none are people ("SUPER WOK", "DD DOORDASH TACOCASA").
  A variant that required a common given name as the first word (about 400 names; a
  "words" shape for the rest) was tried and **not kept**: measured before the Mint-exports classifier change merged the
  same day, Hack Club went from 51.1% / 26.1% to 52.2% / 27.2%, Chase was unchanged, and it could not be checked on Open Collective,
  where the people's names are more varied.
- **A sweep of the 40% share, for information, not tuned here.** On Hack Club, right /
  wrong is 53.3/25.0 at 0.4, 50.5/15.8 at 0.5, 44.6/12.0 at 0.6 and 43.5/8.2 at 0.7. On
  Chase it is 93.7/5.1, 88.6/5.1, 84.8/3.8 and 78.5/2.5. At 0.5, Hack Club's wrong
  guesses drop 9 points for 3 points of right, but Chase gives up 5 points of right for
  nothing. Whether a reviewer is better served by fewer, surer pills is the same open
  question as above. A default change should be read on Open Collective too.

### New payees, gated on their own record (2026-11-10)

The held-out reading above left one question: Hack Club's new-payee guesses were right on
35.6% of the lines they took, under the 40% share the layer asks of its evidence. Share
says how much a view's payees agree; it does not say whether that agreement has predicted
the next new payee. So `trainNewPayee` now replays the payees' first lines in filing order
and keeps, for every view, a track record: how often its plurality, read before that payee
was added, named the account it was then filed to. A gate was set before the first reading
(not tuned): once a view has at least 8 tries (`minTries`, the payee floor), it must have
been right on at least 40% of them (`minRecord`, the share floor) or it says nothing.

First-time lines, right / wrong of all, gate off then on:

| set | first-seen lines | gate off | gate on | withheld lines, of them right |
|---|---|---|---|---|
| Hack Club ledger | 184 | 53.3% / 25.0% | 52.2% / 20.7% | 10, 2 |
| makerspace bank exports | 16 | 68.8% / 12.5% | unchanged | 0 |
| Chase card | 79 | 93.7% / 5.1% | unchanged | 0 |
| ten Mint exports (all) | 1,236 | 82.8% / 9.7% | 82.5% / 9.5% | about 6, 4 |
| Open Collective opensource | 1,913 | 57.1% / 32.7% | 55.1% / 31.6% | 59, 38 |
| foundation | 1,648 | 19.4% / 29.0% | 19.2% / 28.3% | 15, 3 |
| raft | 298 | 33.2% / 41.3% | 31.5% / 37.0% | 18, 5 |
| pact_collective | 295 | 41.4% / 37.6% | 33.6% / 28.4% | 50, 23 |
| metagov | 237 | 65.4% / 29.5% | 64.1% / 28.7% | 5, 3 |

(Open Collective wrong is suggested minus right; withheld lines are derived from the
printed percentages, so they are within a line. The opensource "gate off" row reads
57.1%, not the 56.8% of 2026-11-10, because the host's books grew since.)

What it says:

- **The gate is not kept on by default.** Over the seven sets it withheld about 163
  guesses and 78 of them (48%) were right: it removed about one right suggestion for each
  wrong one. On Hack Club it does what it was built for (4.3 points of wrong for 1.1 of
  right), on foundation and raft it helps a little, but on pact_collective it cost 7.8
  points of right and on opensource the withheld guesses were right 64% of the time. A
  record of 8 to 20 tries is noisy, and early in a set of books it is mostly noise.
- **What stays on is the record itself.** Once a view has 8 tries, its hit rate caps the
  suggestion's confidence (never above the 0.5 ceiling) and the reason says it, "this
  guess was right for 7 of 12 earlier new payees", so a reviewer can tell a guess that has
  been working in these books from one that has not. The withheld lines above are the ones
  whose pill now reads lowest; across the sets they were right 48% of the time, against
  35.6% (Hack Club) to 81.3% (Chase) for the layer's own suggestions, so the cap orders
  them only loosely.
- `--min-record 0.4` (eval/new-payees.mjs) and the "gate on" line of
  `eval/opencollective-labelled.mjs --new-payee` reproduce the gate; `minRecord` in
  `NEW_PAYEE` turns it on for a book. Tests: `new-payee.test.mjs` (7).

The card network's merchant category code landed next (below, "Merchant category codes");
the AI layer for one-off local merchants is still open.

### Merchant category codes, on real purchasing-card books (2026-11-11)

A card line can carry the card network's merchant category code (MCC, ISO 18245) or its
name: purchasing-card files from Bank of America Works and Citi, Tinkoff, some business
cards. The code says what kind of merchant took the money even when the merchant is new
to these books, which is where every other layer is weakest. `mcc.mjs` reads a code
(`4121`), a name (`Lodging-Hotels,Motels,Resorts-Not Classified`, in its many spellings)
or both, and maps it to one chart account where one is the usual answer. Catch-alls map
to nothing: 5999 miscellaneous retail, 7399 business services, 5964-5969 direct marketing
(Amazon), 9399 government services, 5045 computers and software, 8999 professional
services. The statement reader keeps an `MCC`, `Merchant Category Code`, `MCC
Description` or `Merchant Category Name` column on each line.

The table says what a merchant sells, not why these books bought it, so the layer first
asks the books: once a category has 3 earlier lines here and a majority of them went to
one account, that account is the suggestion ("4 of 5 earlier lines in the card network's
category ... went here", confidence at most 0.6). The fixed table speaks only before that.
It runs after your rules and payee memory and ahead of the classifier and keywords, on
money out only, and it never posts a line alone (only rules and memory do).

Measured on the Scottish Government's published payment-card lines over £500
(`node eval/scotgov-card.mjs --dir <govspend.opendata.scot>/_data/spendsOver500`, fetch
command in the file; Open Data Scotland's scrape of gov.scot's monthly reports, Open
Government Licence, not copied here). Each line has the merchant's name, the network's
category name and the expense description the staff filed it under. 11,087 of 13,998
lines have a description that names a chart account (the map was written before the first
reading); they are replayed a day at a time. The 2016-2019 lines chose the design
(memory on, layer ahead of the classifier, five name spellings and two catch-alls added);
the 2020-2026 lines were then read once.

Held out, 2020-01 to 2026-08, right / wrong of all:

| | every line (7,554) | first-seen merchant (1,923) |
|---|---|---|
| layer off | 72.4% / 22.9% | 41.4% / 43.3% |
| fixed table only | 75.7% / 22.1% | 52.4% / 40.2% |
| table, then these books' own filings (default) | 79.3% / 19.8% | 66.0% / 30.9% |

What it says:

- **For a merchant never seen before, the category is the strongest hint the books
  have:** 24.6 points more right and 12.4 fewer wrong on first-seen lines, and on the
  1,536 first-seen lines where the layer spoke it was right 74.2% of the time, against
  56.2% for the classifier and 36.2% for the new-payee guess on the same kind of line with
  the layer off.
- **The books' own filings matter more than the table.** On its own the table is right on
  71.6% of the lines it speaks for, but it is skewed by what a buyer uses cards for: on
  the 2016-2019 lines, 62 of 67 lines from "consulting, management and public relations"
  merchants were training courses or conferences, not consultants, and 68 of 120 from
  "computer software stores" were training, against 41 software. Learning the category's account from
  earlier lines turns those around without a rule for this buyer.
- Caveats: one buyer, a government, with its own expense list and only lines over £500;
  the map from its descriptions to a small business's chart is a judgment, and equipment
  is accepted as supplies or fixed assets. A file with codes rather than names is read the
  same way but was not measured here. Tests: `mcc.test.mjs` (8).

### Merchant category codes on a second buyer: the City of Toronto (2026-11-11)

The reading above has one buyer and category names only. The City of Toronto's monthly
PCard expenditure report has the merchant's name, the network's four-digit code ("Merchant
Type") beside its name, and the G/L account the city filed each line to. One month,
November 2017, is in a public repository (`node eval/toronto-pcard.mjs --file <xlsx>`,
fetch command in the file; City of Toronto data under the Open Government Licence -
Toronto, not copied here): 4,823 card lines, of which 4,284 charges have a G/L account
that names a chart account (`GL_MAP`, written from the account names before the first
reading; "miscellaneous", "other expenses" and "contracted services - general" left out).
They are replayed a day at a time from empty books, so most merchants are new. Nothing in
the layer was changed after reading it.

| | every line (4,284) | first-seen merchant (973) |
|---|---|---|
| layer off | 82.3% / 16.1% | 62.2% / 34.8% |
| fixed table only | 84.8% / 14.2% | 70.7% / 27.4% |
| table, then these books' own filings (default) | 85.3% / 13.8% | 72.7% / 25.5% |
| the same, code column only | 85.3% / 13.8% | 72.7% / 25.5% |
| the same, name column only | 85.2% / 13.9% | 72.3% / 25.9% |

What it says:

- **It holds on a second buyer: 10.5 points more right and 9.3 fewer wrong on first-seen
  merchants.** Smaller than Scotland's 24.6 because the classifier already does better
  here (62.2% against 41.4%: Toronto's card lines are small purchases at chains, ESSO,
  Home Depot, Staples, whose names repeat). On the 744 first-seen lines where the layer
  spoke it was right 78.6% of the time.
- **The code and the name read the same** (72.7% and 72.3%), so the code path `mcc.mjs`
  was written for, unmeasured until now, works.
- **On first-seen merchants the books' own filings add less here (2 points over the table) than in Scotland
  (13.6)**, because one month is short: a category needs 3 earlier lines before memory
  speaks. Grocery stores (5411, 791 lines) and discount stores (5310, 233) are left
  unmapped by the table and are learned from the books, as intended: the city files
  them to food and to recreation supplies.
- Caveats: one month, one city, and the G/L-to-chart map is a judgment.

**Found on the way, fixed:** the real report did not import at all ("No transaction
lines were found"). `Transaction Amt.` was not an amount heading, and the description
fell to the "Cost Center ... Description" column over `Merchant Name`; the per-card
subtotal rows each raised an "unreadable date" warning (1,234 of them). Now `merchant
name` and `transaction amt.` are known headings, `Merchant Type` and `Merchant Type
Description` are read as the MCC, and rows with an amount but no date or description are
counted in one note. The real file reads all 4,823 lines with their codes. Tests:
`toronto-pcard.test.mjs` (4, made-up rows under the real header).

### A year of Toronto card lines, and the AI layer on what the rules miss (2026-11-11)

The city's open-data portal answered from the session that wrote this, so the reading
above now runs on a full year: every PCard line from July 2025 to June 2026 in the
portal's `pcard-expenses.csv` (85,415 lines; fetch command in `eval/toronto-ai.mjs`,
data not copied here). In November 2025 the city moved to 7-digit G/L accounts;
`eval/toronto-gl-2025.json` pairs each new account with the 4-digit one that carried the
same G/L description in the July-November rows (167 pairs, all one to one), so the
account map written for 2017 still applies. 68,638 charges land on a chart account.
The importer reads the portal file as it comes (`2025-07-02 00:00:00` dates, the
`Cost Centre` spelling).

**The whole city as one set of books** (replayed a day at a time from empty books):

| | every line (68,638) | first-seen merchant (4,934) |
|---|---|---|
| category layer off | 88.2% / 10.8% | 60.6% / 32.5% |
| default | 89.6% / 10.1% | 74.8% / 24.0% |

The November 2017 month gave 62.2% to 72.7% on first-seen merchants; a year gives 60.6%
to 74.8%, so the gain holds and grows a little as the books learn which categories this
buyer files where.

**Each division as its own books** is closer to a small business (one buyer, one
spending pattern). Right / wrong; "blank" is no suggestion at all:

| division | lines | every line right (wrong) | first-seen | right | wrong | blank |
|---|---|---|---|---|---|---|
| Parks and Recreation | 34,799 | 92.7% (7.3%) | 2,016 | 83.6% | 16.2% | 0.1% |
| Toronto Water | 6,130 | 86.8% (13.0%) | 772 | 77.1% | 22.2% | 0.8% |
| Seniors Services & Long-Term Care | 5,000 | 88.8% (11.0%) | 498 | 71.7% | 26.7% | 1.6% |
| Legal Services | 3,686 | 98.9% (0.7%) | 50 | 50.0% | 38.0% | 12.0% |
| Economic Development & Culture | 2,814 | 76.6% (17.9%) | 792 | 56.8% | 26.1% | 17.0% |
| Solid Waste Management | 2,224 | 92.3% (7.5%) | 312 | 77.2% | 21.5% | 1.3% |
| Corporate Real Estate | 2,090 | 90.7% (9.1%) | 392 | 78.3% | 20.9% | 0.8% |
| Paramedic Services | 1,433 | 76.7% (18.6%) | 382 | 57.1% | 29.1% | 13.9% |
| Shelter & Support Services | 1,329 | 86.1% (13.2%) | 304 | 73.0% | 23.7% | 3.3% |
| Public Health | 1,317 | 77.0% (18.6%) | 339 | 62.5% | 23.3% | 14.2% |
| Transportation Services | 1,149 | 88.9% (8.9%) | 229 | 70.7% | 20.1% | 9.2% |
| Fire Services | 846 | 81.6% (15.5%) | 272 | 64.0% | 27.2% | 8.8% |
| Employment & Social Services | 793 | 88.9% (9.8%) | 194 | 71.6% | 23.2% | 5.2% |
| Municipal Licensing & Standards | 534 | 75.7% (20.4%) | 181 | 61.3% | 27.1% | 11.6% |
| City Clerk's Office | 438 | 68.5% (23.3%) | 180 | 55.0% | 26.1% | 18.9% |
| Fleet Services | 436 | 88.1% (9.4%) | 68 | 60.3% | 26.5% | 13.2% |

(`node eval/toronto-pcard.mjs --file <year csv> --division "<name>"`.) First-seen
merchants are right 55% to 84% of the time across sixteen buyers, wrong 16% to 38%. The
small divisions, the size of a small business's card spend, sit at the bottom: fewer
earlier lines to learn from, and more one-off merchants with no category the table
maps. That remainder is what the AI layer is for.

**The AI layer on what the rules leave** (`eval/toronto-ai.mjs`). On the whole-city year
the four layers leave 307 lines (0.4%) for the AI layer's fill mode: 220 with only the
new-payee guess, 87 with nothing. An evenly spaced 140 of them (from August 2025 on, so the
books have a month behind them) went to Qwen2.5 7B Instruct (Q4_K_M GGUF from Hugging
Face, llama.cpp through `llama-cpp-python` 0.3.16, CPU only, 4 cores, temperature 0) in 7
batches of 20 through the page's own `aiSuggest`, each with the 40 lines filed just before
it as examples, so nothing later leaks in. Every run sends the same 140 lines in the same
batches. Right / wrong of 140:

| | right | wrong | no answer |
|---|---|---|---|
| rules alone (new-payee guess on 98, nothing on 42) | 43 (30.7%) | 55 | 42 |
| model, prompt before this change (no merchant category) | 25 | 105 | 10 |
| model, merchant category on each line | 27 | 112 | 1 |
| model, merchant category and the account's name asked for | 35 | 104 | 1 |
| the same, name check on (code and name must agree) | 35 | 97 | 8 |
| model over the guess (old fill mode), best prompt | 38 (27.1%) | 100 | 2 |
| **guess kept, model on the 42 blank lines only (new default)** | **48 (34.3%)** | 90 | 2 |

What it says:

- **On real card lines a 7B model is worse than the rules' weakest layer.** The
  synthetic reading (7 of 9 blank lines filled right) does not carry over: here it is
  right on 18-25% of lines and wrong on most of the rest. Over the new-payee guess it
  rescued 22 lines and broke 27-30, so fill mode no longer replaces that guess (`ai.mjs`;
  the old behaviour is `mode: "fill-guess"`). Keeping the guess and letting the model fill
  only blank lines gives 48 right against the rules' 43, at the cost of 35 wrong
  suggestions on lines that had none (all go to review; nothing the model says posts).
- **The merchant category barely moves it** (25 to 27 right). It is sent now because a
  person reading the line would want it and it costs a few tokens, not because it was
  shown to help this model.
- **Asking for the account's name as well helped** (27 to 35 right), and the name check
  dropped 7 answers whose code and name disagreed, all 7 wrong (an answer "Utilities and
  phone" under code 6150, which is Wages). Both are now in `ai.mjs`.
- Caveats: one buyer (a city, not a small business), one model size, 140 lines, one
  sample; the reasons the model wrote were often sensible ("electricity or gas service")
  while the account was not, which points at the chart lookup more than at understanding.
  A hosted model is the obvious next reading. A 20-line batch took 3.5 to 8 minutes on 4
  cores; Node's fetch gives up at 300 s, so long local runs need `node --import` of an
  undici `Agent` with `headersTimeout: 0` (command in the file).

**A bigger local model on the same 140 (2026-11-11, later).** Qwen2.5 14B Instruct
(Q4_K_M GGUF, bartowski's build on Hugging Face; llama-cpp-python 0.3.16 server, CPU
only, 4 cores, `--n_ctx 8192 --use_mmap false`, temperature 0), the current prompt
(merchant category, account name asked for), the same 140 lines in the same seven
batches. Right / wrong / no answer of 140:

| | right | wrong | no answer |
|---|---|---|---|
| rules alone | 43 | 55 | 42 |
| 7B, best prompt (above) | 35 | 104 | 1 |
| **14B, same prompt** | **24** | 84 | 32 |
| 14B over the guess (old fill mode) | 33 | 95 | 12 |
| **14B, guess kept, model on the 42 blank lines only (default)** | **48 (34.3%)** | 80 | 12 |

- **The bigger model is not better at this.** It was right on fewer lines than the 7B
  (24 against 35). Over the new-payee guess it rescued 16 and broke 26.
- **The kind of error changed.** Every one of its 140 account names matched its code, so
  the name check dropped nothing, where the 7B lost its place in the chart 7 times. Its
  wrong answers were mostly sensible readings of the merchant that differ from how this
  buyer files. Software stores went to Software (6060) when the city filed them under
  supplies (6100) or dues and training (6170), and a hosting company went to "ask my
  accountant". It also answered 9999 (uncategorized) on 32 lines, which is an honest
  abstention and costs nothing.
- **Under the default fill mode the two models tie on right answers** (48 of 140, 5 of the
  42 blank lines). The 14B makes 10 fewer wrong suggestions (80 against 90) because it
  abstains instead of guessing. So the default stays as it is. Nothing in `ai.mjs` changed.
- **It is slow.** 509 to 602 s per 20-line batch, 65 minutes for the 140 (prompt about 3,300
  tokens at 16 tokens/s, then about 650 output tokens at 1.7/s). It needs about 11 GB of RAM:
  the first try, at `--n_ctx 16384` with the file memory-mapped, was killed for memory.
  `--resume` (below) keeps finished batches when a run dies.
- What would help is knowing this buyer's habits, not a bigger model. A hosted model is
  still unmeasured (no key in the build environment).

`eval/toronto-ai.mjs` now rewrites `--out` after every batch, and `--resume` keeps the
batches it already holds (a failed call is sent again). Tests: `toronto-ai.test.mjs`.

**Split categories: the books' habit for the category, measured and left off.** On the
same 140 lines the merchant category has a long history in these books (a median of 50
earlier lines) but no majority account, so the category memory (three lines, a majority)
says nothing and the line falls through to the new-payee guess. The commonest account
for the category anyway was right on 52 of the 140, against 43 for the rules and 24 to 35
for either model. Put ahead of the new-payee guess it gave 59. That reading is on the lines
that suggested the idea, so before turning anything on I built it as a layer
(`mccPlurality` in `categorize.mjs`: just before the new-payee layer, confidence capped at
0.4, never posts) and read it on data it was not found on. First-seen lines, right / wrong /
blank:

| books | off | on |
|---|---|---|
| Toronto, whole city year (4,934) | 74.8% / 24.0% / 1.2% | 75.1% / 24.2% / 0.7% |
| Toronto, sixteen divisions as their own books (7,057) | 5,116 / 1,552 / 389 | 5,138 / 1,598 / 321 |
| Scottish Government 2020-2026, held out (1,923) | 66.0% / 30.9% / 3.1% | 66.8% / 31.9% / 1.4% |

On the divisions it added 22 right and 46 wrong. Economic Development & Culture alone
added 17 right and 40 wrong. On the whole city and in Scotland it turned blanks into
guesses that were right about as often as wrong. Right of suggested fell slightly
everywhere. The 140-line gain came from where the 140 come from: lines the rules had
already given up on. So the layer is **off** (`MCC_MEMORY.plurality: false`) and kept for
measurement. `--plurality` on `eval/toronto-pcard.mjs` (with `--division`) and on
`eval/scotgov-card.mjs` reproduces the table. Test: `mcc.test.mjs`, "split category".

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
out. The 2024 and 2025 wage bases ($168,600, $176,100) match the IRS Schedule SE instructions for those years (read 2026-10-26, so no warning); 2026 and 2027 ($184,500, $192,300) match the SSA's Contribution and Benefit Base page (found by search 2026-11-05, so no warning); later years warn; pass `wageBase`. Node tests only; not on the page yet.

## S-corporation election worksheet (US)

`scorpFromBooks(books, opts)` in `scorp.mjs` and `cli.mjs scorp [--year Y] [--months N]
[--filing single|mfj|hoh] [--salary $ | --salary-pct N] [--extra-cost $] [--suta $]
[--other-income $] [--service] [--json]` compare, for the books' annualised Schedule C
profit, staying a sole proprietor with an S corporation that pays the owner a W-2
salary: self-employment tax on all the profit against both halves of FICA on the salary
plus FUTA, the 20% QBI deduction on the K-1 profit left after salary (50% of W-2 wages
cap above the threshold; a service business phases out over the range), and a yearly
cost of running the entity (default $1,500, an assumption: pass your own). It prints a
salary sweep and the break-even profit. Federal only, one owner. The salary must be
reasonable for the work; that is the owner's and the preparer's call. Wage base and
the 2026 QBI phase-in range (75,000/150,000) are unchecked against primary text (gov
hosts blocked 2026-10-28); pass `qbiRange` / `wageBase`. Competitors that sell this
as a paid advisory step: Gusto, Bench and Collective. Tests: `scorp.test.mjs`
(hand-checked $100,000 / $50,000-salary case, wage-base cap, QBI limit, CLI).

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
deductions (all three filing statuses) matched the IRS text of Rev. Proc. 2025-32 itself on 2026-10-23 (tables 1-3, standard deductions, the section 199A thresholds), the 2025 ones are typed from memory and unchecked (every result warns; pass `brackets`). Above the section 199A threshold (2026-10-28) the QBI deduction is limited to 50% of the business's own W-2 wages (`--business-wages $`; none for a sole proprietor with no staff), phased in over the range, and `--service` (a specified service trade) loses it over the same range, as `scorp` does; the $400 minimum still applies. The 2026 range (75,000 single / 150,000 joint) is unchecked against the statute (`qbiRange`), and the property leg is not modelled. `--itemized $` (2026-10-28) takes your Schedule A total (after the SALT cap and medical floor, which are yours to apply) and uses it when larger than the standard deduction; `--investment $` (the part of `--other` that is interest, dividends, gains or passive rent) adds the 3.8% net investment income tax (Form 8960) over the statutory $200,000 / $250,000 joint AGI line (tested by hand arithmetic, `estimatedtax.test.mjs`). Leaves out state tax, most credits (the child credits are in),
the 0.9% Additional Medicare Tax's withholding side. Not tax advice. On the page since 2026-10-23 ("Optional: federal tax estimate and quarterly payments"), same function as the CLI.

### Earned income credit, checked against the printed 2025 EIC Table (2026-11-11)

`--eitc-children N` adds the refundable earned income credit (built-in 2025 and 2026 schedules,
or `eitc` in a `--tax-table` file); `--eitc-table` (on by default in the page) works it the way the
return does. The 2025 EIC Table in the Form 1040 instructions (pages 49-60 of
`https://www.irs.gov/pub/irs-pdf/i1040gi.pdf`, read 2026-11-11) is in
`fixtures/eic-table-2025.json`: 1,374 rows of $50 bands, eight columns, the eight footnoted end
cells. `eicTableCredit` in `estimatedtax.mjs` reproduces all 10,992 cells: the credit at each
band's midpoint, rounded to the dollar, except that the band holding the earned-income amount
prints the (rounded) maximum, the phase-out starts only with the first band wholly above the
phase-out start, and the last band is cut where the credit runs out. `eic-table.test.mjs` checks
the bottom, middle and top of every band in cents (over 60,000 lookups). With the table on,
the estimate follows Worksheet A: earned income's lookup, or the smaller of it and AGI's lookup
when AGI differs and reaches the phase-out start.

Reading the worksheet found a bug in the old formula: it took the phase-out off the phase-in
credit, so someone with low earnings and other income (unemployment pay, a pension) above the
phase-out start got too little. Single with one child, $5,000 of wages and $25,000 of other
income: about $637 before, $1,709 now, which is the table's figure (26 U.S.C. 32(a)(2) subtracts
the phase-out from the maximum credit, not from the phase-in amount). Without `--eitc-table`
the exact figures are within $1 of the table on every band except the two straddle bands per
column, where the table rounds up to the maximum (up to $2.25). Still assumed: the
qualifying-child, age, residency and SSN tests. The 2026 table is not printed yet; the same rule
on Rev. Proc. 2025-32's figures is what it is expected to show. Not tax advice.

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

## Projects and jobs (profit and loss per project)

`projects.mjs` (CLI `project add ID [NAME]`, `project tag ID --match TEXT|--account CODE|--ids A,B|--docs INV-1,BILL-2`, `project untag ...`, `project list`, then `projects [--from D --to D] [--csv|--json]`). The QuickBooks "class" or "job" idea: tag bank lines and invoices or bills to a project, and get revenue, cost, net and margin for each. A split line can carry a different `project` on each part. Anything without a tag (overhead, depreciation, payroll runs) is shown as Unassigned, so the columns add up to the books' own profit. The uncategorized account and lines still in review are left off and warned about, and a project that loses money is named. Margin is before overhead. 6 tests in `projects.test.mjs`, on made-up statements; not checked against a real contractor's books.

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
yours to decide. `cli.mjs contractors --filing` (`nec1099FilingCsv`, and a button on the page) writes one row per payee over the line in the Form 1099-NEC's own box names (box 1, box 4) for a filing service's import sheet; services take their own column layouts, so it is the form's boxes, not any one service's file, and the TIN and address columns are blank because none is stored. The $2,000 line from 2026 is read on the IRS's own Instructions for Forms 1099-MISC and 1099-NEC (irs.gov/pub/irs-pdf/i1099mec.pdf, read with pdftotext 2026-10-23, along with the Form 945 instructions): they also say backup withholding is reported in box 4 and that a 1099-NEC is required for anyone you withheld from regardless of amount, and Form 945 line 2 is where it goes; the warning now says so. The 24% rate itself sits in Pub. 1099 part N, which was not fetched. `necDeadline` gives the filing date (January 31, rolled to the next weekday: February 1, 2027 for 2026 payments). From 2027 the $2,000 is indexed to inflation, so the worksheet warns unless you pass a threshold. Test: `taxforms.test.mjs`. `cli.mjs contractors --iris [--payer payer.json]` (`nec1099IrisCsv`, and a page button) writes the same payees in the IRS IRIS Taxpayer Portal's 1099-NEC template layout for tax year 2025, 54 columns from Form Type to State 2 - Special Data Entries, with the payer block from `payer.json` (`name`, `tin`, `tinType`, `address`, `city`, `state`, `zip`, `phone`). Since 2026-11-11 the layout is checked against the IRS's own TY2025 IRIS CSV template formatting guidelines (irs.gov/pub/irs-efile/ty2025-template-formatting-guidelines.zip, one PDF per form, read with pdftotext): every column letter, A to BB, matches, and the header spellings are the ones four independent open-source IRIS tools agree on (the CSV itself sits behind the portal login). Reading the guidelines found three things the export got wrong, now fixed: the payer TIN was written as nine bare digits where the guidelines want XX-XXXXXXX for an EIN and XXX-XX-XXXX for an SSN; names, addresses and cities went out as the bank spelled them, though the portal takes only letters, digits, space and - # ( ) & ' in a business name (40 characters), letters, space and hyphen in a person's name (20), letters, digits, space, - and / in an address line (35) and letters and space in a city (40), so a payee such as "SQ *BLUE DOOR DESIGN, L.L.C." would be refused (now "SQ BLUE DOOR DESIGN LLC", and the notes name each field changed or cut); and a ZIP+4 with its hyphen or a phone with +1 failed the digits-only rules. A 2026 file also says that the IRS lists IRIS guidelines only through TY2025, and that the December 2026 forms add cash-tip and overtime boxes and renumber the 1099-NEC's box 1 as 1a, so the TY2026 template has to be checked when it appears. `cli.mjs rents [--year Y] [--iris [--payer payer.json]]` (`rents1099`, `misc1099IrisCsv`, and a page button) does the same for Form 1099-MISC box 1: rent paid by bank from account 6080, per landlord, against the line the Rev. December 2026 instructions give ("$2,000 or more for all types of rents" from 2026, $600 before), written as the 64-column 1099-MISC template (A to BL; FATCA in AK, Rents in AM, no Box 13 or 14 column). Its warnings carry the instructions' own exceptions: rent paid to a real estate agent or property manager is theirs to report, a corporation generally needs no 1099-MISC, card payments are on the processor's 1099-K, and account 6080 also catches HOA dues and booth rent. The sibling `ventures/irs-iris-1099-csv-check` reads the same layout; `iris-export.test.mjs` runs the export through that checker and gets only the W-9 fields (recipient TIN type, TIN and address) as errors, and a clean result once they are filled. A name with a business word (LLC, Inc, Studio, ...) goes on the business line as name type B; any other is split at its last space into first and last name, type I, and the notes say it was a guess.

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
modelled. Added 2026-10-24: non-calendar periods. `--state NY` groups quarters as Dec-Feb, Mar-May, Jun-Aug, Sep-Nov (labelled by the month they end in, `2026-05`), and `--freq semiannual --state PA` groups Feb-Jul and Aug-Jan, both from search excerpts of the states' instructions, not the forms; `--end-month N` sets the month the year's first period ends in for any other schedule. Added 2026-10-23: `--state CA|TX|FL|NY|WA|IL|PA` presets the due day (CA month end, WA the 25th, the rest the 20th; recalled from the states' published schedules, not checked against each state's current calendar, so confirm yours). Added 2026-10-24: checked CA, TX, FL and WA against the states' own pages (search excerpts of cdtfa.ca.gov, comptroller.texas.gov, floridarevenue.com, dor.wa.gov; the hosts themselves are unreachable from the build container). One correction: Washington quarterly returns are due the last day of the next month (Q3 2026: 10/31/26), only monthly ones on the 25th, now what `--state WA --freq quarterly` gives (`stateDueDay`). Florida's collection allowance (2.5% of the first $1,200, max $30, electronic and timely) equals `--discount "<label>=2.5,30"`. Added 2026-10-24 (second slice): NY, IL and PA monthly and quarterly returns are due the 20th (search excerpts of tax.ny.gov, tax.illinois.gov, revenue.pa.gov; PA's only official page found was the 2025 REV-819, so confirm the current one). One gap found: NY quarters are Mar-May, Jun-Aug, Sep-Nov, Dec-Feb, not calendar quarters, and PA also has semiannual returns (Aug 20, Feb 20); neither is modelled, so `--state NY --freq quarterly` and `--state PA --freq annual` add a warning (`stateFilingNote`). Corrected 2026-10-27: Massachusetts monthly returns are also due 30 days after the period (mass.gov Sales and Use Tax guide, via search excerpt; the 20th in 830 CMR 62C.16.2 is the older rule), where `--state MA` gave the 20th. Added 2026-10-28: `--state IL|TX|FL` applies that state's timely-filing discount by default to the jurisdiction labelled "IL state" (etc.); an explicit `--discount` for the same label wins. Added 2026-10-29: `--state OH` joins them: 0.75% of the tax, capped at $750 per month on returns due from 2026-01-01 (R.C. 5739.12, ODT notice ST 2025-02, via search excerpts; tax.ohio.gov answers 404 here). Motor vehicle dealers' vehicle sales are uncapped and not modelled. Ohio's quarterly 23rd due date applies to use-tax and direct-pay accounts; vendors file monthly or semiannually. Not tax advice.

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

### Coinbase transaction-history CSV (2026-10-25)

Total (inclusive of fees) is the amount and the transaction type gives the sign; Convert rows move no cash and are listed in problems. The newer layout with a `Transactions / User` preamble and a leading `ID` column is recognised too (2026-10-25, `coinbase.test.mjs`). Layout from memory, rows made up; no real export tried.

### Etsy payment-account CSV (2026-10-24)

Amount is `--` on fee rows, so a file with `Fees & Taxes` and `Net` columns uses `Net` as the amount and `Title` as the memo (test in `hledger-samples.test.mjs`; layout from memory, rows made up).

### Relay, Brex, Chime and Bluevine CSV (2026-10-23)

These already read through the generic column matcher; this slice names them in `sniffBank` (Relay's `Date, Description, Amount, Balance, Account Name` was mislabelled Amex) and pins them with `fixtures/relay-checking.csv`, `brex-card.csv`, `chime-checking.csv`, `bluevine-checking.csv` and tests in `neobank.test.mjs` (Brex pending rows skipped, balance chains on Relay and Bluevine). Layouts are hand-written from remembered headings with made-up rows; no real export tried.

### US bank layouts pinned (2026-11-04)

`us-banks.test.mjs` pins six layouts that already read with no code change: US Bank (`Transaction, Name, Memo, Amount`), Navy Federal and Truist and TD (`Debit`/`Credit` plus `Balance`, the balance chain holds), Citi card (`Status`, `Debit`/`Credit`) and Bank of America (summary block above the header skipped, `Running Bal.`). Rows are made up and headers are from memory of each layout; no real download was tried. Navy Federal, Truist and TD are named by `sniffBank` since 2026-11-07 (`navy-federal`, `truist`, `td-bank`; headers from memory, informational only, no real download tried).

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

`inventory.mjs` (2026-10-22): stock bought for resale is filed from the bank to Inventory (1450, now in the default chart); `inventory buy MUG --qty 25 --amount 250 --date 2026-01-05` records the quantity and total cost, `inventory sell MUG --qty 10 --date D` moves that stock's cost to Cost of goods sold (5000) as a derived journal entry, and `inventory adjust` writes off lost or damaged stock at cost. Costing is FIFO by default or a moving average (`inventory method avg`); a part layer is pro-rated half up and the last unit clears the layer exactly, so cost of goods sold plus stock on hand always equals what was bought (tested, including 2.5 and 1.1 unit quantities, stored in thousandths). Selling more than is on hand, a purchase with no amount and a move in a locked period are refused. `inventory` lists on hand, unit cost, value, sold and COGS per SKU; a close check (`inventory`) flags account 1450 differing from the register, which catches a stock purchase paid but never entered, and the reverse. Revenue still comes from the bank line or invoice; this module books only the cost side, so gross margin on the profit and loss is real. Purchase returns (2026-10-22): `inventory return MUG --qty 3 --date D` sends stock back to the supplier at the newest layer's cost under FIFO (the average under `avg`), books no cost of goods sold, and the supplier's refund, filed to 1450, brings the account back to the register (tested: 3 of 20.00 units returned, then a FIFO sale takes the oldest layer). Tested with hand-written moves and a CLI run (`inventory.test.mjs`, 8 pass); no real stock sheet tried. Landed cost (2026-10-28): `inventory landed --amount 120 --date D --on INV-1,INV-2 [--by value|qty]` spreads freight or duty over the named purchases (by cost, or by quantity; odd cents to the largest share). The share for units still on hand joins their cost; the share for units already sold is cost of goods sold at once, so cost of goods sold plus stock always equals purchases plus freight (`inventory.test.mjs`, hand-made purchases, no real freight invoice tried). File the freight payment to 1450. Lower of cost or net realizable value (2026-10-28): `inventory writedown MUG --nrv 12.00 --date D` cuts stock on hand to the per-unit net realizable value (selling price less cost to sell) where it costs more, layer by layer under FIFO or on the blended value under `avg`; the cut is cost of goods sold (Dr 5000, Cr 1450), a new basis that a later higher value never writes back up (`inventory.test.mjs`, made-up purchases, no real stock sheet). Not modelled: sales returns back into stock, several locations, units of measure, tax-basis inventory methods (UNICAP, LIFO). The page has a card for it (move, SKU, date, quantity, total paid, costing method; register with on hand, unit cost, value and cost of goods sold; 2026-10-22, clicked through in headless Chromium with `eval/browser-click.mjs`: buy 100 for 450.00, sell 40 leaves 60 worth 270.00 and 180.00 cost of goods sold, selling 500 refused).

## Loans

`loans.mjs` (2026-10-22): a fixed-rate, monthly, equal-payment loan. `cli.mjs loan add Van --amount 20000 --rate 6 --months 36 --first 2026-02-01` computes the level payment (608.44, the textbook figure, checked in the test) and the schedule; `loan apply LN-1` splits each unfiled bank outflow that equals a scheduled payment, within 5 days of its due date, into interest (6040) and principal (2200) as an ordinary split, so no one types the split each month; `loan` lists balance by schedule and the next payment; `loan LN-1` prints the schedule. Interest is balance x rate / 12 rounded to the cent, and the last payment clears the balance. Extra principal (2026-10-22): `loan extra LN-1 --amount 2000 --date 2026-06-10` records a prepayment; it comes off the balance after the last instalment on or before its date, the same payment then clears the loan sooner (the schedule has fewer rows and less interest), and `loan apply` files the matching bank outflow to 2200 (`loans.test.mjs`, hand-written case: 20,000 at 6% over 36 months with 2,000 extra in June ends early; no lender's real prepayment statement compared). Not modelled: balloon, interest-only periods, variable rates, day-count interest, prepayment penalties, and a lender's own schedule may differ by cents (use `--payment` to match its payment). `loan check LN-1 lender.csv` (2026-10-23, `checkLenderSchedule`) compares a lender's own amortization table (header row with date, payment, interest, principal, balance in any order) with the computed schedule row by row, prints the rows that differ by more than 2 cents and a plain-words guess: rounding only, a different payment (and the `--payment` to re-add the loan with), interest off from the first row (day-count or rate), or agreement through payment N then a fee, rate change or extra payment. It never edits the loan. Tested on tables derived from the schedule itself with one deliberate change each (`loans.test.mjs`); no lender's real table tried. Tested with hand-written statements (`loans.test.mjs`); no lender's real schedule compared. The page has a loans card (terms form, register, a button that splits matching bank payments; 2026-10-22, clicked through in headless Chromium with `eval/browser-click.mjs`: add, register, nothing to split, bad rate refused).

## Payroll runs (US)

`payroll.mjs` (2026-10-22): a payroll provider's pay-run report (Gusto, ADP, Paychex, Square Payroll and similar; company totals or one row per employee, grouped by pay date; columns matched by name: pay date, gross, net, federal income tax, social security and medicare withheld, state tax, other deductions, employer social security and medicare, FUTA, SUTA) becomes books. `payroll FILE.csv` books each run (Dr Wages 6150 for gross, Dr Payroll taxes and benefits 6155, added on first use, for the employer's share, Cr Payroll liabilities 2300 for both) and finds the bank outflows that paid it: net pay (3 days before to 5 after the pay date), the federal deposit (withheld tax plus both FICA shares, within 45 days; a month's runs paid as one deposit are matched against the month's sum) and state withholding. `--apply` files the unambiguous lines to 2300, so 2300 shows what is still owed. A row whose net pay is not gross less deductions is refused and named; the same report twice changes nothing. `payroll` lists runs and what is still owed; `payroll 940 2026` prints a Form 940 worksheet (2026-10-22: FUTA wages capped at $7,000 per employee at the 0.6% net rate, per-employee check, quarterly deposit carry over $500; hand-made registers, state credit reduction not modelled); `payroll w2 2026` (2026-10-22) sums each employee's year into W-2 boxes 1 to 6 and the state tax, box 3 capped at the wage base, warning when other deductions may be pre-tax (box 1) or box 4 is off 6.2%; registers imported before this change lack per-employee withholding and need re-importing; hand-made fixtures only. `payroll 941 2026 1` prints a Form 941 worksheet from the register (wages, income tax withheld, both shares of social security and medicare) and warns when a run's FICA is off 6.2% / 1.45% by more than a cent per employee. With one row per employee it applies the year's Social Security wage base (2023-2026 built in) to each person's year-to-date wages, so tax that should have stopped, or a taxable-wage line 5a figure, is checked per employee (2026-10-22, hand-made registers). Also per employee (2026-10-22): the 0.9% Additional Medicare Tax on wages over $200,000 in the year, withheld from the employee only, is checked (a missing one or one charged to the employer is flagged) and the 941 worksheet prints line 5d. A provider's trailing "Total" row is skipped (it would double every run) and a pay date printed only on a group's first row fills down (2026-10-23, from the habit of such exports, not a sampled file). Tested with hand-written registers (`payroll.test.mjs`, 8 pass) and run through the CLI; no real provider export has been tried, and tips, state unemployment wage bases and the 941 adjustments are not modelled. `payroll 940 2025 --state CA` (2026-10-22) adds the FUTA state credit reduction on taxable wages (California 2025, 1.2%, from the November 2025 DOL announcement as reported by Bloomberg Tax, UHY and EY; other states or years: `--credit-reduction PCT` from the DOL list; the Benefit Cost Rate add-on is not modelled). `payroll deposits 2026 [--schedule monthly|semiweekly]` (2026-10-22, `deposits.mjs`, 6 tests on hand-made registers) works out the Publication 15 deposit schedule (lookback July 1 to June 30 against $50,000, the $100,000 next-day rule, monthly 15th, semiweekly Wednesday/Friday as the third business day, weekend and federal-holiday rollover, the $2,500 quarterly de minimis), then uses the bank-line matching to say whether each deposit was on time or late, with the 2/5/10% penalty tier as an estimate. `payroll 941 YEAR Q --schedule-b` (2026-10-22) also prints Schedule B: the quarter's liability by day of month the wages were paid, with each month's total (hand-made registers). `payroll reconcile 2026` (2026-10-22) ties the four quarters' Form 941 figures to the W-2 totals a W-3 would carry (wages, income tax, social security wages and tax, Medicare wages and tax) and names any that differ beyond a cent per person-run; hand-made registers only. Not payroll or tax advice. The page has a card for it too (2026-10-22: book the runs, post the matched bank lines, Form 941 worksheet; wired and tested for ids and imports, not driven in a browser).

### Payroll property test (2026-10-27)

`payroll-property.test.mjs`: 150 seeded random per-employee years (1 to 4 people, 2023 to 2026, pay up to $40,000 a run so the wage base bites) checked for: the four 941 quarters sum to the register's gross, W-2 box 1 equals each person's gross, box 3 never passes the wage base, 940 FUTA wages never pass $7,000 a person with no warnings, and the 941 to W-2 tie-out is clean. It found no fault; it guards the three worksheets against later edits. Made-up data only.

### Form 1099-K against the payout report and the books (2026-10-23)

A processor's 1099-K reports gross payments (before refunds and fees, sales tax included), while the books carry income net of both, so they never agree and the gap is what a notice asks about. `form1099k FILE.csv --year 2026 --gross 94000.00 [--months J,F,...,D] [--sales 4000]` (`form1099k.mjs`, `reconcile1099K(report, {gross, months}, year, books)`) lays out the bridge: gross the report shows for the year, box 1a, the gap, refunds and fees the form does not net, optional boxes 5a-5l month by month (a typo in their sum is caught), and what account 4000 should hold if every payout was split (gross less refunds). Notes name likely causes: export range, UTC year boundaries, unsplit payouts, a form that looks netted. `node --test ventures/ai-bookkeeper/form1099k.test.mjs`, 5 pass, on hand-written reports; no real 1099-K was tried, and the IRS thresholds and reportable-transaction rules change by year, so check the instructions for the year. No page card yet; a worked-example page, `form-1099-k-reconciliation.html` (2026-10-23), walks the stripe-payouts fixture from box 1a ($940.00) to sales ($850.00) to deposits ($708.00), pinned by a test.

### Payroll header probe (2026-10-23)

Ten hand-written provider-style headers found five faults in `readPayrollRegister`, all fixed (`payroll.test.mjs`, 24 pass): a title or period block above the header row made the file unreadable; a report listing kinds of pay (regular, overtime, bonus) with no gross column was refused (they now add up to gross); `Social Security (EE)`, `Medicare (ER)`, `...Tax` and `Withholding Tax` header spellings went unmatched; two columns feeding one field (a 401(k) and a health plan) kept only the last, so net pay failed to tie; `Last Name` and `First Name` columns gave no employee, so W-2 rows were lost. A reversal row (negative gross) now says so instead of reporting a net-pay mismatch. Layouts are recalled, not sampled from real exports. Landed after: `Additional Medicare` as its own column adds to Medicare withheld; a single `Total Employee Taxes` column (no split) is now read by taking Social Security at 6.2% and Medicare at 1.45% of gross and booking the rest as federal income tax, with a `notes` entry saying so (`payroll.test.mjs`, 26 pass, hand-written headers). The split is a guess when pre-tax benefits or the wage base apply, so prefer a report with split columns.

## Not modelled

Payroll filings (runs are booked, see below, but no filing, wage bases or state rules) and sales tax filings, inventory across several locations or with serial numbers (single-location stock is below), foreign-currency invoices and bills are modelled (see below, 2026-10-22; a credit note in the invoice's own foreign currency is applied in that currency, 2026-10-26; an instalment plan on a foreign invoice closes on the last payment within 10%, 2026-10-26) (foreign bank accounts too; the VAT worksheet is UK-layout, invoice basis), a scanned (image-only) bank-statement PDF. A statement PDF with a text layer is read by `import FILE.pdf` through pdftotext, and on the page by `pdftext.mjs`. Receipts can be a PDF or a photo (see below).

## Foreign-currency bank accounts

`fx.mjs` (2026-10-22): a EUR, GBP or other account in books kept in one currency. `fx account 1020 EUR` marks a bank account; `fx rate EUR 2026-03-01 1.0850` or `fx rates FILE` (lines `date,CUR,rate`, base units per one foreign unit) supply rates by hand, with no feed and no network. `import` then keeps each line's own amount (`foreign`) and books it at the latest rate on or before its date; a line with no rate is left out and named, never guessed. Each month end the account is remeasured from its foreign balance at that month's rate and the difference goes to Foreign exchange gain or loss (6190, added on first use; a gain shows as a negative expense), so the books balance and the entries cannot drift. The statement's closing balance is reconciled in the account's own currency. `fx` lists balance, rate, amount carried and gain or loss booked. Conversion is exact (BigInt, rate to six decimals, half away from zero). Tested with hand-written statements and rates (`fx.test.mjs`, 6 pass) and clicked through the CLI; no real multi-currency bank file or central-bank rate table tried. Transfers between a foreign and a base account (2026-10-22) are paired when the two sides are within 3% of each other (the bank's rate against the typed one) and within the transfer window; each account carries its own side and the difference is booked as realized gain or loss to 6190 (`fx.test.mjs`, hand-written statements; a transfer between two different foreign accounts is paired the same way, 2026-10-26). Foreign invoices and bills (2026-10-22): add `currency` (and optionally `rate`, base per one foreign unit) columns to the document CSV; amounts are in that currency and the books carry them at the rate on the document date (`fx rate` or the column; no rate means the document is refused and named, never guessed). A base-currency bank line within 3% of the booked amount that names the number or party settles it, and the difference becomes a derived entry to 6190 (realized loss, or gain on a bill paid for less), so receivable or payable clears exactly. Tested with hand-written documents (`fx.test.mjs`, 10 pass), no real invoice export or bank rate; Open foreign invoices and bills are now revalued at each month end (2026-10-22, `fx.mjs` `docRevals`): the foreign total at that month's rate against the booked amount, the change to 6190 against receivable or payable, and the payment then realizes only the difference from the revalued carrying amount (so gain and loss are never counted twice; `fx.test.mjs`, 12 pass, hand-written rates and documents). Documents with credits, write-offs or part-payments are not revalued. Not modelled: foreign credit notes, part-payments in a foreign currency, foreign payments into a foreign bank account. Not modelled: realized gain by lot, the tax treatment of foreign gains. The page has a card for it too (2026-10-22: book the runs, post the matched bank lines, Form 941 worksheet; wired and tested for ids and imports, not driven in a browser).

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

### Receipt photos in the page

The receipts card has a **Receipt photos** control (2026-10-25, `photoocr.mjs`). Pick one or more PNG, JPEG, WebP, BMP or GIF files and tesseract.js (WebAssembly) reads them in the browser; the image is never uploaded. Each photo becomes one block in the receipts box, separated by `---`, after the same digit look-alike repair as the CLI, so a misread amount can be fixed by hand before **Read receipts**. Nothing is requested from the network until a photo is chosen; then the reader (about 20 MB with the English model, cached by the browser) comes from jsDelivr, pinned to tesseract.js 5.1.1. Offline, the status line says so and pasting text still works. Measured: `node eval/photo-ocr-browser.mjs` draws a receipt on a canvas, sends the PNG through the control in headless Chromium with the reader served from the npm tarballs, and checks merchant, tax and total come back and parse (6/6 checks; one clean, rendered receipt, so it proves the wiring, not accuracy on crumpled thermal paper). `photoocr.test.mjs` pins the block, skip and cleanup rules with a stub engine. Real phone photos are still untried.

### Measured on 1,000 real receipts (CORD-v2)

Until 2026-10-24 the receipt reader had only met receipts an agent wrote. CORD-v2
(Clova AI, CC BY 4.0) is 1,000 photographed Indonesian shop and restaurant
receipts whose text and fields were corrected and labelled by hand; the derived
text and labels are in [`eval/cord/`](eval/cord/README.md). The score is
whether `parseReceipt` reads the labelled total and tax exactly.

| Split | Receipts with a labelled total | Total right, before | Total right, after | Tax right, before | Tax right, after |
|---|---|---|---|---|---|
| train (rules changed looking at these) | 779 | 42 (5.4%) | 742 (95.3%) | 9 of 352 | 316 of 352 (89.8%) |
| validation (also looked at) | 98 | 2 (2.0%) | 96 (98.0%) | 0 of 47 | 45 of 47 |
| **test (held out, scored once before and once after)** | **95** | **4 (4.2%)** | **90 (94.7%)** (89 before the SROIE fixes) | **0 of 41** | **37 of 41 (90.2%)** |

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
tesseract will do worse; merchant names and dates are masked in CORD; the
merchant and date readers are measured on SROIE below. The six test
misses: a `Total Kembalian 0` (change) line read as the total, `SUB, TOTAL` with
a stray comma, and four receipts with no total word where the largest amount (the
cash handed over) was taken. Score it: `node eval/cord-receipts.mjs
eval/cord/test.jsonl [--misses]`; `cord-receipts.test.mjs` pins the table.

### Totals checked against the receipt's own arithmetic (SROIE through tesseract)

2026-11-11, flagship item (5). On SROIE's 626 receipt scans read by tesseract
5.3.4 (`--psm 6`, no preprocessing), the reader got the total right on 76.2%,
against 97.4% from the dataset's hand-made word boxes. Most of the gap is one
misread digit in the total line: `9.60` for `9.00`, `34.00` for `31.00`, `64.50`
for `54.50`. A receipt states its total more than once, though: cash handed over
less change, the before-tax subtotal plus the GST/SST line (and any rounding),
the items added up, and often a second total line. Two changes in `receipts.mjs`:

- **One reading** (`parseReceipt`): when the printed total matches none of those
  checks, and one value that is the printed total with exactly one digit changed
  is confirmed by **two different kinds** of check, that value is taken, with a
  note asking the person to check the total. One check alone is not enough: on
  the clean box text, letting any single check overrule the total broke 15
  receipts that were right (a discount the items miss, a misprinted change), and
  through OCR single checks broke as many as they fixed, because the cash and
  change lines get misread too. A few cents either way is the 5-sen rounding, not
  a misread digit, and is left alone.
- **Two readings** (`parseReceiptPasses`, CLI `receipts photo.jpg --two-pass`,
  `ocr.mjs` `receiptPassesFromFile`): the photo is read again with tesseract's
  `--psm 4` (one column of text of varying sizes). Where the readings disagree on
  the total, the one confirmed by more kinds of check (cash less change, subtotal
  plus tax, the items) is taken; a tie keeps the first. "Another total line" is
  not counted here: in the second reading the first reading's own total line,
  misread differently, shows up as one, and counting it picked the wrong reading
  as often as the right one. The check kinds were chosen on the even-numbered
  receipts (6 changed, 6 right) and then scored on the odd ones (3 changed, 3
  right, 0 wrong). A date only the second reading found is not taken (18 filled,
  9 right, 9 wrong); the receipt asks instead.

| SROIE, 626 scans, 625 with a total | Total right | Wrong | Off by 5 cents or less |
|---|---|---|---|
| word boxes (no OCR), before and after | 609 (97.4%) | 16 | 6 |
| tesseract `--psm 6`, before | 476 (76.2%) | 141 | 22 |
| tesseract `--psm 6`, arithmetic check | 478 (76.5%) | 139 | 22 |
| tesseract default (`--psm 3`), what the CLI ran before | 422 (67.5%) | 186 | 20 |
| tesseract `--psm 4` alone | 425 (68.0%) | 188 | 23 |
| `--psm 6` then `--psm 4`, two readings | **487 (77.9%)** | 130 | 23 |

The CLI used to call tesseract with no mode, so it ran tesseract's own default
(`--psm 3`, page layout analysis), 8.7 points worse on totals than `--psm 6`, the
mode every SROIE number above was taken with. The CLI's default command is now
`tesseract {file} stdout --psm 6` (`RECEIPT_OCR_CMD` still overrides it), so a
photo read by the CLI goes from 67.5% to 76.5% on its own, 77.9% with
`--two-pass`. The page's tesseract.js read one block by default (and now reads twice, below).

The box-text scores (merchant 531, date 601, total 609) are unchanged. Either
reading had the right total on 509 receipts, so a perfect chooser would reach
81.4%; the rest are OCR-bound (the digit is wrong in both readings, or the
total line is lost). Reproduce: clone zzzDavid/ICDAR-2019-SROIE (MIT), run
`eval/sroie-ocr-variants.sh <clone>/data <out> base`, OCR the images again with
`--psm 4` into `<out>/psm4`, then `node eval/sroie-receipts.mjs <clone>/data --ocr
<out>/base,<out>/psm4`. Tests: `receipt-crosscheck.test.mjs` (11, receipt text
made up). Still flat scans, not phone photos. The page now reads twice as well
(next section).

### The page reads each photo twice (2026-11-12)

Flagship item (5), "the page reading twice". The **Receipt photos** control
(`photoocr.mjs`) now reads each photo in tesseract.js's block mode (`6`, what
it read before) and then in its column mode (`4`), and settles the two
readings the way `--two-pass` does. The receipts box holds plain text a person
can fix, so both readings cannot go in it: `settleReadings` keeps the first
reading, and where `parseReceiptPasses` takes the other reading's total
because the receipt's own arithmetic confirms it, swaps that one total line in
(a plain `Total 37.10` line when the winning total came from cash less change
with no line printing it), checks the swapped text reads that total, and says
so on the status line ("total read as 34.00 once and 31.00 once; kept 31.00,
which the receipt's own arithmetic confirms: check it"). A merchant only the
second reading found goes on top of the block; a date only it found does not
(the SROIE finding above).

Measured with the page's own engine for the first time: `eval/sroie-tesseractjs.mjs`
runs tesseract.js 5.1.1 with the same English model the page loads
(`@tesseract.js-data/eng@1.0.0`, LSTM) in Node on SROIE's 626 scans, both modes.
The settling rule was chosen on the tesseract binary's readings, so these are
fresh readings for it.

| SROIE, 626 scans, 625 with a total, tesseract.js 5.1.1 | Total right | Wrong | Off by 5 cents or less | No total |
|---|---|---|---|---|
| block mode (`6`), what the page read before | 490 (78.4%) | 127 | 22 | 8 |
| column mode (`4`) alone | 447 (71.5%) | 168 | 15 | 10 |
| both, `parseReceiptPasses` | 499 (79.8%) | 118 | 22 | 8 |
| both, the text the page puts in the box (`--settled`) | **499 (79.8%)** | 118 | 22 | 8 |

The box text scores the same as `parseReceiptPasses` on every receipt. The
second reading changed 14 totals: 10 from wrong to right, 1 from right to
wrong, 3 from one wrong value to another; all 14 carry the status-line note.
Either reading had the right total on 514, so a perfect chooser would reach
82.2%. Merchant (316 exact) and date (499 of 611) are unchanged. The page's
engine does a little better than the tesseract 5.3.4 binary the CLI calls
(78.4% against 76.2% in the same mode). Reading twice doubles the reading
time (about 1.5 s a reading per core here).

Found on the way: SROIE scan 427 is 4961 x 7016 pixels (35 megapixels) and
tesseract.js cannot load it ("Image file /input cannot be read"); seven other
scans read as empty in one mode or both. Before this change one unreadable photo
threw out the whole batch, and tesseract.js 5 also threw its rejection
uncaught; now that photo is listed as skipped with the reason and the rest are
read. Phone photos (12 megapixels) load; a larger one may not.

Reproduce: `npm install tesseract.js@5.1.1 @tesseract.js-data/eng@1.0.0` in any
folder, then `node eval/sroie-tesseractjs.mjs <clone>/data <out> <folder>/node_modules`
(about 40 minutes on four cores) and `node eval/sroie-receipts.mjs <clone>/data
--ocr <out>/psm6,<out>/psm4 --settled`. Tests: `photoocr.test.mjs` (9, receipt
text made up); `node eval/photo-ocr-browser.mjs` drives the page with the real
reader in headless Chromium (6/6). Still scans, not phone photos or crumpled
paper.

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
dashboard Transactions CSV (2026-10-23: `Deposit ID`, `Deposit Date`, `Event Type`, `Total Collected`, `Fees` as negatives, `Net Total`) reads too, grouped by deposit; payments are sales and refunds refunds, and, since 2026-10-23, tax and tip inside Total Collected are split out of it: tax to Sales tax payable 2100, tips to the sales account unless `--tips CODE` (say a staff liability) is given (`payouts.test.mjs`; fixture only). Layout from memory of Square's export, one hand-written fixture (`fixtures/square-transactions.csv`), no real export. Etsy's payment-account ledger CSV (Date, Type, Title, Amount, Fees & Taxes, Net; 2026-10-22) is grouped under each Deposit row the way PayPal is (newest-first order handled, split only when the rows net exactly to the deposit); layout from memory of Etsy's help pages, one hand-written test, no real export. Ko-fi's transactions CSV (DateTime (UTC), Received, Given, TransactionType; 2026-11-06) reads Received as money in and Given as money out (`kofi-export.test.mjs`); header from memory, made-up rows, no real export. Patreon's earnings report (Date, Event Type, Creator Share; 2026-11-06) books Creator Share, what the creator keeps after Patreon's fees, under the event type (`patreon-earnings.test.mjs`); column names from a third-party importer's notes, made-up rows, no real export. Paddle's transactions CSV (Transaction ID, Billed At, Product, Total, Fee, Earnings; 2026-11-06) books Earnings, what the merchant of record leaves after tax and its fee, under the product (`paddle-earnings.test.mjs`); header from memory of the Paddle Billing export, made-up rows, no real export. Airbnb's host transaction-history CSV (Reservation, Adjustment and Payout rows; 2026-10-23) reads the same way, with a worked page `airbnb-bookkeeping.html` for short-term-rental hosts; layout from memory, one hand-written fixture, no real export.

**Adyen settlement details, on Adyen's own sample** (2026-11-11). The Adyen reader (`readAdyen` in `payouts.mjs`, since 2026-10-25) was written from the column list and a hand-made fixture. Adyen links a sample Settlement details report from its docs (batch 134, 63 rows, the 2023 64-column layout); `node eval/adyen-sample.mjs` fetches it at run time (it is Adyen's file, so it is not copied here) and runs it through `payouts`. Before this change the reader got the file wrong in one way that matters: the two `Balancetransfer` rows (EUR 4,014,796.34 carried in from batch 133 and EUR 4,015,315.41 carried out to batch 135) were read as other income, and had the batch carried a payout they would have put four million euros through account 4100. Adyen's "Journal types" table (read the same day) says a Balancetransfer moves a balance between payout batches when a batch is not paid out. Now each batch must tie: carried in + activity - carried out = MerchantPayout (0 when none). On the sample: 4,014,796.34 + 519.07 (58 Settled rows, 525.27 net; three Fee rows, 6.20) = 4,015,315.41, so the batch ties to the cent; with no payout, its 61 rows stay pending and the problem line says which batch to export with it. Batches chained by a matching carry (out of 20 to 21, into 21 from 20, same amount) are merged, so the payout that reaches the bank splits into every sale behind it; a balance carried in from a batch not in the export is booked to the processor-balance account (1200, the `reserve` role) and named, never to sales. The same table fixed six journal types the reader misfiled: DepositCorrection and ReserveAdjustment (and MerchantPayin, BankInstructionReturned) move the reserve, not income; CaptureFailed was skipped as if it moved no money and SettledReversed was income, both now reduce sales; RefundFailed and RefundNotCleared undo a refund; PaidOut, EpaPaid, ManualCorrected and the other types that are not the merchant's sale or cost go to other income only with a problem line naming them. Tests: `adyen.test.mjs` (9 pass; the five new ones use made-up rows in the sample's 64-column layout). Not tried: a real merchant's report with a MerchantPayout, a batch in another currency than its payout, or the XLSX form; Adyen notes a real account's report can carry columns the sample lacks.

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
pass. On the page too (2026-10-26, "This period against the last"): the From and To dates are the period and the one of equal length just before is the comparison (`precedingPeriod`); with both empty it is the latest month against the month before.

## Customers and suppliers

`node cli.mjs --books books.json payees [--from D] [--to D] [--json]` (engine: `payeeReport`, `payees.mjs`, 4 tests in `payees.test.mjs`, lines made up) ranks who the money comes from and goes to, with each payee's share, line count and first and last date, the top-three share, and a Herfindahl index in `--json`. It warns when one payer is 25% or more of money in (customer concentration: the commonest way a small business is surprised) and when one supplier is half of money out. Payment processors (Stripe, PayPal, Square, Gusto and similar) and your own transfers are shown but marked and never warned about, since a payout is many customers in one line. Payees group by the categorizer's two-word key, so two shops sharing a first word merge; transfers between your own accounts are skipped. Not checked on a real book yet.

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

Landed slices (gap probes, trade fixtures, property tests, sources read) moved to [HISTORY.md](HISTORY.md), 2026-11-01; every item there says what was tested and what was not. Open work is in `portfolio/flagships.yaml` (`ai-bookkeeper`, `next:`): real bank exports, labelled books, a real processor settlement file, a real supplier terms letter, real OCR photos and payroll reports. Two real Apple Card exports (2026-11-07) showed gaps and are fixed ([HISTORY.md](HISTORY.md)); a business card or bank export is still wanted.

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

`node cli.mjs profile name "Studio Co"` (also `address`, `email`, `taxId`, `payTo`, `terms`) stores your details in the books; `node cli.mjs invoice 7 --out inv-7.html [--as-of DATE]` writes one invoice or credit note as a single self-contained HTML page that prints to PDF. Lines use the document CSV's optional `description` column (else the account name; account 2100 shows as sales tax); it then shows credits applied, payments received, the balance due, a Paid stamp or the days overdue, and "How to pay" only while a balance is open. Everything is HTML-escaped. A bill is refused. Test: `invoice.test.mjs` (hand-written documents only; the layout was not checked on paper). On the page: "Your details for printed invoices" under the invoices card saves the same fields, and each open invoice in the write-off list has a Print button that opens the invoice in a new tab (a download if pop-ups are blocked) for the browser's Save as PDF; clicked through in headless Chromium with `eval/browser-click.mjs`. Paid invoices and credit notes (latest 25) have a Print button too, in a settled list under the open ones (clicked through in headless Chromium, `eval/browser-click.mjs`).

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
- Nevada and Idaho due dates, 2026-10-24 (`salestaxreturn.mjs`): `--state NV` and `ID` are the 20th (Kintsugi, TaxJar and TaxCloud tables via search excerpts; Nevada moved from month end; confirmed 2026-10-28 by search: Assembly Bill 594, the Department of Taxation's 2026-01-23 release, the 20th for periods from January 2026, next business day if a weekend or holiday). Iowa left out: sources disagree. Check your own notice.
- Louisiana and Maryland due dates, 2026-10-24 (`salestaxreturn.mjs`): `--state LA|MD` are the 20th (TaxCloud and Kintsugi tables via search excerpts; state sites not read). Check your own notice.
- Missouri and Iowa due dates, 2026-10-24 (`salestaxreturn.mjs`): `--state MO|IA` are the last day of the month after the period, settling the conflict earlier runs left (MO: dor.mo.gov's 2026 monthly table and FAQ say month end; the older instructions booklet's 20th is outdated. IA: revenue.iowa.gov filing-frequency page; Streamlined Model 1 sellers file the 20th and annual filers Jan 31, not modelled). Search excerpts, not the full forms; check your own notice.
- FUTA credit reduction 2026, 2026-10-24 (`POTENTIAL_CREDIT_REDUCTION` in `payroll.mjs`, `payroll.test.mjs`): `form940 --state CA` for 2026 now warns that California is on the DOL's potential list (1.5% base, up to 5.3% with the benefit-cost-rate add-on unless waived) and that it is final only after Nov 10, 2026. The rate is never applied automatically. The U.S. Virgin Islands paid off its loans in June 2026 per payroll.org, so it is not listed. From search excerpts (payroll.org, Bloomberg Tax); the DOL page was not reachable.
- bank2ynab's sample files, 2026-10-24 (`bank.mjs`, `textcodec.mjs`, `bank2ynab-samples.test.mjs`, 4 tests): imported the 40 files in bank2ynab's `test/test-data` (MIT, github.com/bank2ynab/bank2ynab; real column layouts, made-up rows) with the CLI. Six read nothing or lost lines; four fixed. A German card export (`Buchungsbetrag`, `Transaktionsbeschreibung`) and a UK card export (`Date Processed`) had no matching headers; `Pending` dates are now reported as pending rather than as unreadable. A Singapore export that puts a detail line (no date, no amount) under each transaction skipped every detail line with an "unreadable date" error; it now joins the description above. A Czech export in Windows-1250 with no letter unique to that codepage decoded as 1252 and read nothing; the codepage is now taken from Czech and Polish column names (`částka`, `účtu`, `Kwota`), and `Zaúčtovaná částka` and `Zpráva` are aliases. Not fixed: single-row header-less files (`dba33...csv`, `statement_1.csv`: one line is too little to infer columns from) and a Swedbank-style `.dat` (`kta_ei.dat`, pipe records). Still no real current export from a named bank.
- Real Capital One card export, 2026-11-07 (`eval/capone-card.mjs`, `real-capone-card.test.mjs`, `categorize.mjs`): one public GitHub file (pythoninoffice/tutorials `sample_data/cc_statement.csv`, 533 rows of a Canadian card, no licence file, fetched at run time, never copied). The reader recognised the layout as `capital-one` and read all 533 rows, 18 payments in. Scored on the 135 purchases whose Capital One category names one account (Dining, Gas/Automotive, Phone/Cable, Fee/Interest, Insurance, Other Travel, Professional Services, Entertainment): before, 54.1% suggested, 95.9% right of suggested, 51.9% right of all, because the keywords were US-first and left PETROCAN, a bare SHELL, FIDO, PRESTO reloads and local restaurants blank. Added Canadian fuel, phone, transit, food, insurance and overlimit-fee descriptors: 82.2% suggested, 97.3% right of suggested, 80.0% right of all, 3 wrong. Tuned on this same file, so the after figures are optimistic; the 365 purchases in personal categories (Merchandise, "Internet" = Amazon Marketplace) are unscored. Still wrong: Intuit Canada (Capital One: Professional Services, ours: software), Eventbrite (ours: advertising), DHL (ours: shipping). Test lines are written, not copied.
- Real Bank of America checking export, 2026-11-08 (`bank.mjs`, `bofa-split-memo.test.mjs`, 2 tests): a public GitHub file (ShiweiHe0713/MoneyChat, 662 rows Aug 2023 to May 2024; fetched at run time, never copied, personal data). Its own summary block disagreed with the rows read (credits 15,311.58 vs 15,236.58), which exposed a real fault: BofA writes a Zelle memo containing a comma as two cells, so the amount sat one cell right and was read from the tail of the memo (a -40.30 payment became +47.00, balance -40.30) with no warning. Fixed: when the amount cell is not an amount but the next cell is, the split text is rejoined. After the fix the summary matches and the file reads with 0 problems. Also read cleanly, no change: a real Chase checking export (782 rows, 2024), a newer BofA file and a Discover card file (the latter two look generated, so not counted as real).
- Real business Chase checking export, 2026-11-09 (`categorize.mjs`, `third-party-wires.test.mjs`, 3 tests): a public MIT-licensed GitHub file (Delta-Compute/DeltaCFOAgent, 53 rows Apr to Jun 2024; fetched at run time, never copied). The reader took it as `chase-checking` with no problems. Found: outgoing wires to a named third party ($97,000 and $42,410) were suggested as own-account transfers, one even as a utility because the beneficiary bank's name tripped a keyword; ACH origination fees had no suggestion. Now wires and CHIPS or book-transfer credits that name a counterparty (VIA:, A/C:, B/O:) get no suggestion and wait for a person; ACH fees file as bank fees. 53 rows: 43 suggested, 0 wrong on read-through, 10 wait (the wires and credits, an ACH payment to a person). One bank, one company: not a rate.
- Real Wells Fargo checking export, 2026-11-09 (`categorize.mjs`, `wells-fargo-real.test.mjs`, 3 tests): a public GitHub file in the headerless `"date","amount","*","","description"` layout (jmcroft7/local-money `src/data/wellsFargo.csv`, 71 rows Jan to Mar 2026, one person's spending, no licence file; fetched at run time, never copied). The reader named it `wells-fargo` and read all 71 rows with no problems: the first real file in that layout (HISTORY had only hand-written ones). Keyword layer on its 63 debits: 10 suggested before, 14 after. Added: `INS PREM` and Allstate, Travelers and other insurers (6030) and CenterPoint, Xcel and other energy utilities (6140). The other 49 are personal (groceries, streaming, gas stations, Apple Card and credit-union payments) and rightly blank; no labels, so right-of-suggested is unmeasured. Wells Fargo's own descriptors (`PURCHASE AUTHORIZED ON mm/dd ... S<digits> CARD ####`) carry the merchant mid-string and still match. Still no labelled business Wells Fargo book.
- Real Amex exports, 2026-11-07 (`bank.mjs`, `amex-au-layout.test.mjs`, 2 tests): two public GitHub files in Amex's layout (bartonhammond/finance-nue, danTaler/Savvr; fetched at run time, never copied, personal data). The US one read correctly (signs flipped off its payment row). The Australian one, with a `Date Processed` column and `Amount ` with a trailing space, was not recognised as Amex, and with no payment row nothing flipped the signs, so every purchase was booked as money in with no warning. Fixed: the layout is sniffed with the extra column, and a file with `Card Member` always flips (Amex lists charges as positive). Plain `Date,Description,Amount` files are unchanged (guard test). Still no fresh Bank of America or Wells Fargo export.
- ofxstatement plugins' layouts, 2026-11-04 (`ofxstatement-layouts.test.mjs`, 2 tests): the sdists of ofxstatement-revolut and ofxstatement-n26 on PyPI name the real column layouts (the OTP, PayPal and N26 sdists carry no sample files). Revolut (Type, Product, Started/Completed Date, Fee, State, Balance) and N26 read correctly as they are: pending and reverted rows are skipped with a named warning, the fee joins the amount. No code change; the tests guard it. Still no fresh export from Chase, Bank of America, Wells Fargo or Amex.
- csv2ofx's sample files, 2026-10-28 (`bank.mjs`, `csv2ofx-samples.test.mjs`, 5 tests): read the seven CSVs in csv2ofx's `data/test` (MIT, github.com/reubano/csv2ofx; layouts of real exports, made-up rows). Five read correctly (Capital One debit/credit, Payoneer, Mint with its debit/credit type column, a credit-union file, a default export with accented names). Two did not: PC Financial's purchases-only card file (unsigned amounts) was booked as money in with no warning, now flagged "Every amount is positive" with the `invert` fix named (a debit/credit or mixed-sign file is never flagged); Xero's Journal Report (both sides of each entry) said only that no lines were found, now says it is a journal, not a bank statement. Not covered: the other 20 csv2ofx samples (404 through the proxy by guessed names).
- csv2ofx's sample CSVs, 2026-10-24 (MIT, from the PyPI source archive, read only, nothing copied): 26 files read with `readStatement`; 25 read as expected. A UBS-style file (French headings) lost its header because `Date de valeur` was not a known date column, so the header was skipped as a preamble, its first row had no description and the others kept only `Description 3`. Fixed in `bank.mjs`; `Description 1..4` columns are now joined in header order (`csv2ofx-samples.test.mjs`, 2 tests, made-up rows). Still no fresh bank download.

- CSV exports are formula-safe, 2026-10-24 (`safeText` in `engine.mjs`, `export-formula-safety.test.mjs`): bank descriptions are untrusted, and a memo starting with `=`, `+`, `-` or `@` opened as a formula in Excel or Sheets. Text columns of the csv, qbo and xero journal exports and the lines export now get a leading apostrophe; amounts and dates stay bare.
- Actual Budget's sample bank files, 2026-10-25 (`categorize.mjs`, `real-nonprofit-bank.test.mjs`): `data.ofx` and `data.qif` from actualbudget/actual (`packages/loot-core/src/mocks/files`, MIT, fetched from raw.githubusercontent.com, never copied) are real Bank of America card text, 28 lines. Both import with no errors (the QFX is the OFX byte for byte). Built-in keywords suggested 7 of 28 (25%: OFX 5 of 10, QIF 2 of 18). Misses were the long tail: a fuel stop (Citgo), a waste hauler, Amazon, Target, CVS, a medical clinic, restaurants. Two rules added (fuel stops, waste haulers), written looking at these same lines, so the new reading, 10 of 28 (36%), is tuned on itself and not a held-out figure. Amazon and Target are left unsuggested on purpose: the same descriptor is supplies, equipment or groceries. No labels, so right-of-suggested is unmeasured. Still open: a held-out labelled bank export.
- Stripe payout cross-check, 2026-10-25 (`readStripe` path in `payouts.mjs`, `payouts.test.mjs`): read Wikimedia SmashPig's Stripe test reports (GPL, fetched at run time, never copied; real column layouts, made-up rows). Lowercase currencies, `_utc` headers, `payout_minimum_balance_hold`/`release` rows and a dispute reversal with no payout id all read as intended. New: when the report carries Stripe's own `payout` row, its amount is compared with what the payout's other rows net to, and a difference is reported (a missing row or a left-out hold would otherwise post a split that does not add up to the bank line). Tested on hand-made rows only; no current real Stripe export seen, so (3) stays open.

- OFX fixtures from ofxparse (MIT), read at run time, 2026-10-25: 8 files read, 1 fault fixed. A MEMO written as `TYPE;NAME` (bank_medium.ofx) repeated the payee in the description; the reader now drops the repeated name (`thirdparty.test.mjs`). The brokerage-only files (Vanguard SELLMF, multi-account with no transactions) give 0 rows without a warning, which is correct for cash books. HCB was refused by the proxy again, so the page 9 held-out reading remains open.
- MT940 sample files from wolph/mt940, 2026-10-26 (`sepa.mjs`, `mt940slash.test.mjs`): read the six Dutch bank files in its `mt940_tests/jejik` folder (BSD-3, fetched from raw.githubusercontent.com at run time, never copied; real layouts, made-up rows): ABN AMRO, ING, KNAB, Rabobank, SNS, Triodos. Five read right (ABN AMRO's 65-column wrapped references, ING's soft hyphens inside dates, a 6-digit `:61:` date). Triodos writes `:86:` subfields as `000>10..>20..>21` and the description kept the `>20` markers; `>NN` is now read like `?NN`. Subfield chunks still join with a space, so a word cut at 27 characters shows a gap (`KOS TEN`). No current real export from these banks seen.
- Wrapped company name, 2026-10-26 (`receipts.mjs`, 1 test in `receipt-ocr-columns.test.mjs`; SROIE boxes, 626 receipts): counts unchanged (merchant 530, date 601, total 609); receipt 095 now reads `POPULAR BOOK CP. (M) SDN BHD` (the dataset's box has `CP.` for `CO.`) instead of the fragment `CP. (M) SDN BHD`. A short capitalised line over a `CO. (M) SDN BHD` line is one name wrapped over two lines. The 16 wrong totals were looked at again: Domino's receipts (173, 296, 297) are labelled with the pre-coupon sum while the receipt's grand total is after the coupon, and 7 more are rounded against unrounded labels, so the box-based total is at its ceiling; merchant misses are brand against registered company or OCR typos in the dataset's own boxes.

- Sales tax return property test, 2026-10-27 (`salestaxreturn-property.test.mjs`, 2 tests, made-up ledgers only): 150 seeded ledgers of invoices and credit notes with up to three jurisdictions, at monthly, quarterly and annual frequency; total tax equals the signed tax lines typed in, payable is tax less discount, and period totals match their rows. Every state's due-day rule gives a due date after the period that lands on a business day once moved. It passed first time; a flipped credit-note sign made it fail. It checks no state's real dates (state tax sites refused the session's proxy).
- Hawaii semiannual sales tax (GET) return, 2026-10-28 (`salestaxreturn.test.mjs`, 1 test): the worksheet already gave calendar halves (Jan-Jun, Jul-Dec) due the 20th after, i.e. Jul 20 and Jan 20; the code comment calling this "not modelled" was stale and is fixed. Source is one 2026 third-party guide (trykintsugi.com) plus a 2009 bill that moved the date from month end to the 20th; HRS 237-30 and tax.hawaii.gov were not read, so check your own notice.
- Annualized income check, 2026-10-30 (no code logic changed): the Schedule AI percentages (22.5, 45, 67.5, 90%) were matched to a search excerpt of the 2024 federal Form 2210, and the factors (4, 2.4, 1.5, 1) to Alabama and Iowa Schedule AI forms and a tax guide; the federal factors line and the second set of periods remain unread (irs.gov blocked). The worksheet's warning now says so.
- Form 2210 read and the penalty added, 2026-11-11 (`annualized.mjs`, `penalty2210.mjs`, `annualized.test.mjs` +5 tests, `penalty2210.test.mjs` 7 tests). irs.gov answered from the session, so the 2025 Form 2210 and its instructions were read with pdftotext (the form's own text, not an excerpt). Schedule AI checked line by line: line 2 factors 4, 2.4, 1.5, 1 and line 20 percentages 22.5 to 90% as coded; the "second set of periods" (2/28, 4/30, 7/31, 11/30) is for estates and trusts only, so not modelling it is right for a sole proprietor. One real difference: Part II (self-employment tax) has its own lines, and line 28 is zero when the *period's* net earnings are under $400, where the old shortcut taxed the annualized figure (a $300 first quarter, annualized to $1,108 of earnings, was charged about $170 of SE tax). Part II now runs line by line (line 29 reproduces the printed $44,025 / $73,375 / $117,400 / $176,100 from the 2025 wage base; lines 32 and 34 the printed 0.496 ... 0.029). New: the underpayment penalty itself (Part III Section A lines 10 to 18 and the instructions' penalty worksheet), for the regular and the annualized installments, at the IRS quarterly underpayment rates read from irs.gov/payments/quarterly-interest-rates (2025 all 7%; 2026 Q1 7%, Q2 6%, Q3 7%, Q4 7%; 2027 Q1 not out, last rate used with a warning). The tests reproduce the instructions' Examples 1, 3 and 4 and Table 2's day counts. Example (4,000 earned by February, 100,000 by November 2025, single, 20,000 paid January 15): regular-method penalty 602.92, Schedule AI 37.28, both checked by hand. The CLI and page show both and say when box C lowers it; the page takes dated estimates. Not modelled: box D (actual withholding dates), the January 31 file-and-pay rule, waivers.
- Box D and the 2026 draft Form 2210, 2026-11-11 (`penalty2210.mjs`, `annualized.mjs`, `annualized-boxd.test.mjs` 6 tests). Box D (withholding treated as paid on the dates it was actually withheld, instructions "Line 11") is now modelled: pass dated withholding (`withheld: [{ date, cents }]`, CLI `--withheld DATE:$`, page "Tax withheld, with dates") and the penalty is figured with and without it, regular and annualized, and the result says whether to check box D. Withholding still never goes on the worksheet's line 1b. Worked example (made-up books: 80,000 earned in January 2025, 12,000 withheld, no estimates): the default quarter-a-date spread gives a 285.25 penalty; the same 12,000 withheld on February 15 gives 52.15 with box D; withheld on December 15 it would give 686.65 with box D, so leave it unchecked and the even spread hides the late withholding. The 2026 form: irs.gov posted an early-release draft (irs-dft/f2210--dft.pdf, "Form 2210 (2026) Created 4/16/26"), read with pdftotext and diffed line by line against the 2025 form. Schedule AI is the same apart from the years, line 29 ($46,125, $76,875, $123,000, $184,500: the 2026 wage base $184,500 prorated, an IRS-printed check of `SS_WAGE_BASE[2026]` that SSA pages could not give from here) and a new line 9b "Additional deductions"; Part III dates 4/15/26, 6/15/26, 9/15/26, 1/15/27; Part I line 3 is renamed "Refundable credits and other adjustments". The draft instructions posted with it are still the 2025 text, so line 9b's contents are unprinted; the 2025 instructions put the Schedule 1-A deductions (tips, overtime, car-loan interest, senior) in the line 14 adjustment. The senior deduction is taken; tips, overtime and car-loan interest are not, and every result says so. Each year's result now names the form it follows (2025 final, 2026 draft, later years unread). Not modelled still: the January 31 file-and-pay rule, waivers.

### Time/Timestamp date headers and HELD rows (2026-11-04)

A bank CSV whose date column is headed `Time`, `Timestamp`, `Date/Time` or `Date Time` (the layout neobanks such as Up use, from memory, not a real export) was not recognised: the header was skipped as a preamble and the Status word became the payee. These are now date headers, and `HELD` joins the not-booked statuses (pending, declined and so on) so card holds are skipped and listed in problems. Test: `held-status.test.mjs` (made-up rows). Full ai-bookkeeper suite: 2,229 pass.

### Excel day-number dates (2026-11-04)

`parseDate` reads a five-digit number from 25569 to 60000 as an Excel day number (1900 system), which is what a bank CSV re-saved from Excel with General format holds. The 1904 system is not detected. Test: `excel-serial-dates.test.mjs` (made-up rows).

### Gumroad sales export (2026-11-06)

`readStatement` read a Gumroad sales CSV (Item Name, Sale Price, Gumroad Fee, Net Total, Date) as zero rows. It now books Net Total under the item name. Layout from memory; made-up rows only (`gumroad-sales.test.mjs`). A real export is wanted.

### Platform exports keep customers out of descriptions (2026-11-07)

`platform-exports-privacy.test.mjs` (5 tests, made-up rows, layouts from memory like the readers it covers) reads a Gumroad, Paddle, Patreon, Ko-fi and Lemon Squeezy export carrying a buyer name and email and asserts neither reaches a row description, which feeds the categorizer, payee memory and the CSV/QBO exports. All five passed with no code change; the test guards the property. Square's export was not added (its layout is covered in `square-export-net.test.mjs`). No real export seen.

2026-11-08, `salestax return` filing notes for AZ and IN (`stateFilingNote`, `salestaxreturn.test.mjs`, 53 pass): Arizona's date stays the statutory 20th, with a note that ADOR's due-dates page lists later month-end paper and electronic deadlines and that one guide says penalties still run from the 20th; Indiana's 30th stays, with a note that guides conflict (20th for larger monthly filers). Kansas's 25th was confirmed by search excerpt of a KDOR notice, no change. Sources were search excerpts only: every state tax site (tn.gov, azdor.gov, in.gov, tax.nd.gov and others) is refused by the session proxy, so no page was read. Also tried and refused by the session's permission classifier: fetching strangers' real Wells Fargo exports from public GitHub repos (personal data); that route was not worked around, so Wells Fargo stays unmeasured on a real file.
