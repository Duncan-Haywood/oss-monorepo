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
| `categorize.mjs` | Four layers, in order: your rules (`keyword => account`), memory (the account you chose for this payee before), then, on a card line that carries the network's merchant category code or name (`mcc.mjs`), where these books filed that category before or a fixed table of codes (README "Merchant category codes"), a naive Bayes classifier trained on everything you filed, and conservative built-in keywords; then the bank's own category label, then a chain's name from OpenStreetMap's name-suggestion-index (`brands.mjs`, README "Chain names from OpenStreetMap"), and for a payee never filed before a weak guess from the kind of name (person, business, other) and the line's size, read against every other payee's first line (never posted alone, at most 0.5 and at most its own record on earlier new payees, README "New payees"). Payees are normalised first: `SQ *BLUE BOTTLE 0412 OAKLAND CA` and `POS DEBIT SQ *BLUE BOTTLE 9981` are both `blue bottle`. |
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

### Merchant category codes on a third buyer: Durham County Council (2026-11-12)

Scotland and Toronto both shaped the layer. Durham County Council (England) did not:
nothing in `mcc.mjs` or `categorize.mjs` changed after its lines were read, so this is a
held-out reading on a new buyer. The council publishes every procurement-card line each
month, not only those over £500, with the merchant (`Beneficiary`), the network's
four-digit code (`Merchant Category Number`) and the expense type it filed the line to
(`node eval/durham-pcard.mjs --dir <folder>`, fetch command in the file; Durham County
Council data under the Open Government Licence v3.0, not copied here). 78 monthly files,
January 2020 to June 2026, 199,776 lines. 151,437 charges have an expense type that names
a chart account (`EXPENSE_MAP`, written from the expense-type names before the first
scored run; "Miscellaneous Expenses", "Services", grants and payments to clients left
out). They are replayed a day at a time from empty books.

| | every line (151,437) | first-seen merchant (7,354) |
|---|---|---|
| category layer off | 91.4% / 7.1% | 53.3% / 34.6% |
| fixed table only | 92.7% / 6.7% | 69.4% / 25.2% |
| table, then these books' own filings (default) | 94.0% / 5.9% | 87.8% / 11.6% |

Departments as their own books, first-seen merchants right / wrong, layer off then on:

| department | lines | first-seen | off | default |
|---|---|---|---|---|
| Resources | 10,635 | 931 | 40.2% / 25.2% | 75.1% / 20.4% |
| Adult and Health Services | 8,367 | 306 | 51.3% / 36.9% | 75.5% / 19.9% |
| Dedicated Schools Grant | 2,106 | 285 | 62.8% / 31.6% | 69.5% / 27.7% |
| Transformation and Partnerships | 440 | 92 | 54.3% / 28.3% | 72.8% / 18.5% |

What it says:

- **The layer holds on a buyer it was not built on**: 34.5 points more right and 23.0
  fewer wrong on first-seen merchants, the largest gain of the three buyers (Scotland
  24.6, Toronto 14.2 over a year). On the 7,082 first-seen lines where it spoke it was
  right 89.3% of the time.
- **The books' own filings carry most of it** (18.4 points over the table). Six years of
  one buyer's lines mean almost every code has a habit by the time a new merchant turns
  up: grocery stores (5411) and the catch-all 5999, left unmapped by the table, are
  23,820 and 28,050 lines here, learned as provisions and equipment.
- **Small books gain too.** A 440-line department went from 54.3% to 72.8% right on new
  merchants.
- **The split-category guess** (`--plurality`, off by default) changed nothing: 87.8% with
  it or without it. With the books' filings in place only 0.6% of first-seen lines are
  left blank, so it has almost nothing to fill. It stays off.
- **The report's `Merchant Category` column is not the network's name.** It is the
  council's own expense label for the code (5411 reads "Catering costs - provisions"), so
  reading it (`--field name`) scores 97.7% on first-seen merchants by giving the answer
  away. Every figure above reads the code only. The importer does the same: when a file
  has a code column, a name column beside it is ignored.
- Caveats: one council, its own expense list, and the map from it to a small business's
  chart is a judgment (equipment accepted as supplies or fixed assets; Adobe Creative
  Cloud filed as "equipment and materials" counts as a miss when the layer says
  software).

**Found on the way, fixed:** the real report did not import correctly. The header was
not recognised (`Date of Transaction`, `Beneficiary` and `Gross Amount` were not known
headings), so the reader fell back to guessing: the description was the department or
the purpose of the spend, never the merchant, the code was dropped, and **every charge
was booked as money in**. That last fault is not Durham's alone. A purchasing-card
report lists charges as positive and refunds as negative, with no "payment, thank you"
rows, which is what the sign check looks for, and a few refunds stop the "every amount
is positive" warning. Toronto's PCard report has the same shape (the same rule now covers
it; its real file was not read again in this run). Now `Date of Transaction`,
`Beneficiary` and `Merchant Category Number` are known headings, and `Gross Amount` is
the amount when a VAT column sits beside it and no fee column (SumUp's Gross/Fee/Net
export still books the net). A file with a merchant category column, one amount column,
no balance and at least 80% of amounts positive is read as a card file whose charges are
positive: signs are flipped and the import says so (`invert: false` keeps them as
printed). A merchant called "U OF I ONLINE PAYMENT" had matched the weak card-payment
pattern and blocked the flip on one month, so the rule now runs unless the payment rows
prove the charges are negative. All 78 real files now read every line with the right
sign, the code on every line, and totals to the penny. Tests: `durham-pcard.test.mjs`
(7, made-up rows under the real header).

### Oklahoma's purchasing cards: a US buyer, category names only (2026-11-15)

The State of Oklahoma publishes every state purchasing-card line, a month per file, with the merchant as the bank printed it and the card network's merchant category *name* cut to 40 characters ("STATIONERY,OFFICE SUPPLIES,PRINTING AND"); its counties publish a combined report for 2022 to 2024 (`node eval/oklahoma-pcard.mjs read|names --dir <folder>`, fetch command in the file; State of Oklahoma open data, not copied here; cardholder names are in the files and never read). Fiscal 2017 (416,812 charges) was read to write the changes; fiscal 2018 (407,011) and the county report (30 files, 7,797 lines) were held out. The files carry no account the state filed each line to, so there is no answer key: what is measured is whether the importer reads them, how often the category name gives an account, and how often the name-only layers agree with it.

**Found on the way, fixed: the county report booked every charge as money in.** 24 of its 30 monthly files spell the category column "MCC_DESCRPTION", which was not a known heading, so the card-file sign rule (Durham, above) never saw a category column. Now it is. The months also use " Amount ", "$425.60 ", "MERCHANT_NAME", "Purchase Date", CR-only line ends and two Excel 97 workbooks; all of those already read. After the fix all 30 county files and all 24 state files (858,879 lines in all) read every line, every charge as money out, the category on every line and totals to the penny against a separate plain reading of the Amount column (before: 6 of 30 county files).

**The category names the rules missed.** On fiscal 2017, 35% of charges had a category name that gave no account. Most of that is catch-alls that should say nothing (grocery stores, "business services", direct marketers, discount stores). But some was the rules' fault: the patterns ended in a word boundary, so stems never matched ("TRAVEL AGENCIES", "LANDSCAPE AND HORTICULTURAL SERVICES", "DISINFECTING AND EXTERMINATING SERVICES", "TOLLS, ROAD AND BRIDGE FEES"); hotel names are plural ("HOLIDAY INNS", "COMFORT INNS", "EMBASSY SUITES"); and codes 3000-3999 are named after one airline, car-hire firm or hotel chain each ("DELTA", "HERTZ CORPORATION", "WYNDHAM", "LUFTHANSA"). Each fix maps a name to the account its code already gets in `MCC_RANGES`, so a file with names now gets what a file with codes got. All 59 names that changed were read by eye and all are right.

| | fiscal 2017 (read) | fiscal 2018 (held out) | county 2022-24 (held out) |
|---|---|---|---|
| charges | 416,812 | 407,011 | 7,404 (1,705 before the header fix) |
| category name gives an account, before | 64.5% | 65.1% | 54.2% of 1,705 |
| after | 69.3% | 69.7% | 70.4% |

**The built-in keywords, checked against the category.** From empty books with the merchant name only, the keywords and the chain list spoke on about 35% of charges. Where the category also gave an account they agreed 90.4% of the time on the held-out year (scored against the new name rules in both columns). Reading fiscal 2017's disagreements turned up keyword faults, fixed in `categorize.mjs`: electrical supply houses ("CBI WHOLESALE ELECTRIC", "WHITE ELECTRICAL SUPPLY") and electricians filed as utilities through "electric"; "XEROX" filed as software through "xero"; "BRENNTAG SOUTHWEST" and "SOUTHWEST PARK AND REC" as the airline; "DOMINO EQUIPMENT" as the pizza chain; "PHILLIPS 66 - CRUISE AVIA" (an airport fuel stop) as a cruise; "HERTZ EQUIPMENT" as car hire; FedEx Office (a copy shop, by its category) as shipping. Then fiscal 2018's misses were read and two more fixed: "SPECTRUM PAINT" as the cable company and "PIKEPASS REBILLS" (Oklahoma's toll tag) as a utility through "ebill".

| agreement with the category where both speak | fiscal 2017 (read) | fiscal 2018 (held out) | county (held out) |
|---|---|---|---|
| keywords before | 90.6% (11,815 disagree) | 90.4% (12,130) | 89.3% (189) |
| after the fiscal-2017 fixes | 92.7% (9,099) | 92.8% (9,008) | 89.5% (186) |
| after reading fiscal 2018 too | 93.0% (8,708) | 93.1% (8,611) | 89.5% (186) |

What it says, with care:

- **Agreement is not correctness.** The category says what the merchant sells, not why the state bought it. The largest remaining disagreement is deliberate: NAPA and O'Reilly are filed as supplies by the keywords (the trades fixtures wanted parts as job materials), while their category says vehicle costs. That is a judgment the labelled sets made and this set cannot overrule.
- **The held-out gain is real but modest:** about 3,100 fewer disagreements in 127,000 lines where both spoke. The county set is too small and too local (feed stores, county road suppliers) for the keyword changes to show.
- **No change on the labelled sets:** the ten Mint exports (2,926 lines, keywords alone and the learning loop), the three YNAB registers (633) and Durham County Council's 151,437 card lines (keywords alone) read the same to the line before and after.
- **Left open:** the chain list files "SANTA CRUZ BIOTECHNOLOGY" and "NOVUS BIOLOGICALS" as food shops (OpenStreetMap lists chains by those names; 126 to 188 lines a year), and "NORTHEAST OKLAHOMA PUB", a public utility cut at 24 characters, as a pub. They need the chain-list builder (place names) and a rule for truncated names, not one more exception.

Pinned in `oklahoma-pcard.test.mjs` (6 tests: made-up rows under the real county and state headers, CR-only line ends, the eval's plain reading against the importer, the category names and the keyword cases).

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

**State due dates read on the states' own pages (2026-11-12).** Earlier due-date presets came
mostly from search excerpts, because the state tax sites refused the build container. On
2026-11-12, 26 of them answered, so each one's sales tax page (or its official guide, calendar
or form instructions) was read in full and saved, and every sentence relied on was checked
against the saved text. `STATE_SOURCES` in `salestaxreturn.mjs` lists the page for each state
and the filing frequencies it names. The tax calendar page links the source under the form, or
says the state is not yet checked. Results:

- **Two corrections.** Hawaii's annual GET return is due the 20th day of the fourth month
  after the year (April 20), not January 20 (tax.hawaii.gov); `--state HI --freq annual` now
  gives April 20. Iowa's note described semi-monthly prepayments, but revenue.iowa.gov says
  the July 1, 2022 changes "eliminate the semimonthly remittance". Iowa sales tax is annual
  (under $1,200 a year, due January 31) or monthly (the last day of the next month), and the
  quarterly rows on that page are withholding tax.
- **Frequencies a state does not offer now get a note.** Oklahoma lists monthly and
  semiannual (at $50 a month or less), not quarterly. New Mexico lists monthly, quarterly and
  semiannual, not annual. Iowa and Indiana list monthly and annual. A worksheet or calendar
  asked for another frequency still gives dates, with a note naming the ones the page lists.
- **New notes from the pages:** Kentucky accelerated filers are due the 25th. Wisconsin's
  early monthly filers are due the 20th. Every Michigan filer also files an annual return by
  February 28. Arizona's grace period (the last business day of the month electronic, the
  second-to-last on paper) does not stop penalties, which run from the 20th. New Mexico's
  quarterly and semiannual filing needs approval at $500 a month or less.
- **Confirmed unchanged:** AL, AZ, CA, CT, DC, FL, ID, KS, KY, LA, MI, MS, ND, NE, NM, OK,
  PA, SD, TX, VT, WI, WV, WY. Vermont's own 2026 table (Q1 due April 27, Q3 October 26) and
  North Dakota's (January 31, 2026 moved to February 2) match the calendar's weekend moves.
  These are pinned in `salestaxreturn.test.mjs`.
- **Still not read:** Indiana's pages name the frequencies but not the day of the month for
  sales tax (the handbook's 20th/30th table is withholding), so the 30th stays with its note.
  Maryland's (JavaScript only), Nevada's (bot check) and New Jersey's pages gave no due-date
  text. Utah, Tennessee, Arkansas, Rhode Island, Colorado, Maine, Massachusetts and Ohio
  refused the connection. Not tax advice: your own notice decides your date.

**Eight more states read on their own pages (2026-11-14).** Georgia, Illinois, Minnesota, North
Carolina, Nevada, South Carolina, Virginia and Washington answered this time. Each page's due-date
sentences match the presets already here (North Carolina's quarterly returns on the last day of the
next month, Minnesota's annual return on February 5, Washington's monthly 25th and annual April 15),
so no date changed. They are now in `STATE_SOURCES` with the day they were read: the tax calendar
links each page, and a frequency the page does not list gets a note. North Carolina and Virginia
list monthly and quarterly only, so `--state NC --freq annual` now says so. Georgia's 3% / 0.5%
vendor's compensation, until now from search excerpts, was read on Form ST-3 Part C itself. Quotes
and what still refused: [`eval/state-pages-2026-11-14.md`](eval/state-pages-2026-11-14.md).

**Indiana from the book's own history, Arkansas's 2%, and the last six states read (2026-11-14, fifth pass).**
Indiana's rules depend on your own past tax, so the worksheet now works them out from the book. DOR
Bulletin #83 (effective January 1, 2026) sets the collection allowance for a calendar year from tax in the
12 months to June 30 of the year before: 0.73% up to $60,000, 0.53% to $600,000, 0.26% above. Bulletin #102
puts monthly returns on the 30th, or on the 20th when the year before averaged over $1,000 a month. When
the book holds those months, `--state IN` applies that year's band to "IN state" and that year's due day,
and says which figures it used ("0.73% collection allowance, from $48,000.00 of "IN state" tax in July 2024
to June 2025"). A year it cannot look back on gets no allowance and the 30th, and a note names the missing
months. `--discount` and `--due-day` still win, and INTIME shows your real rate. Arkansas's rule GR-84 adds
a 23rd preset: 2% of state tax when paid by the 20th, at most $1,000 for each month the return covers (city
and county 2% uncapped, left to `--discount`). New Jersey's filing page, and the Rhode Island, Maine and
Massachusetts statutes, confirm the dates already here and print no vendor discount. New Jersey's monthly
rows are now explained as vouchers (required only above $30,000 a year), and Rhode Island's quarterly
filing as needing written authorization. Every state item (8) listed has now been read on its own text.
Quotes, worked figures and what refused: [`eval/state-pages-2026-11-14e.md`](eval/state-pages-2026-11-14e.md).
Tests: `salestaxreturn.test.mjs` (3 new) and `cli-flags-once.test.mjs` (1 new, through the CLI). Not tax advice.

**Maryland and Utah discounts, and Colorado's ended vendor fee (2026-11-14, fourth pass).** Three
more hosts answered: mgaleg.maryland.gov, le.utah.gov and leg.colorado.gov. `--state MD` now applies
Tax-General 11-105: 1.2% of the first $6,000 of tax on each timely return and 0.9% of the rest, at most
$500 a return (a $20,000 month gets $72 + $126 = $198). `--state UT --freq monthly` applies Utah Code
59-12-108: monthly filers "may retain each month 1.31%" of the state and local sales tax; quarterly and
annual filers retain nothing, so they get no preset. Colorado was about to be added at the 2024 statute's
4% (at most $1,000 a period), but the signed HB25B-1005 (August 2025) adds 39-26-105(1)(d)(V): from
January 1, 2026 "a retailer is not permitted to retain any money" for collecting state sales tax. So
`--state CO` applies nothing and its note gives the pre-2026 rule as a `--discount` for older periods.
Still open: Indiana's due day and its allowance (in.gov's bulletins and INTIME guide print neither),
New Jersey, Arkansas, Rhode Island, Maine's discount (its statute confirms the 15th, nothing on a
discount was read) and Massachusetts. Quotes: [`eval/state-pages-2026-11-14d.md`](eval/state-pages-2026-11-14d.md).

**Michigan and Virginia discounts, from their 2026 forms (2026-11-14, third pass).** Both were
left unapplied until now: Michigan's is a greater-of with a floor, and for Virginia only the statute
had been read. Today michigan.gov and tax.virginia.gov answered. `--state MI` now applies the 2026
Form 5080 rule for payment by the 20th: the greater of 0.5% of the 4% part of the tax (tax x .6667 x
.005, at most $15,000 a period) and $6 for each month of the period ($18 a quarter), never more than
2/3 of the tax; annual filers get $72, or 2/3 of a smaller tax (Form 5081). `--state VA` applies the
Form ST-1 (Rev. 09/26) worksheet: taxable sales x 0.043 x .01116, .00837 or .00558, the rate picked
by monthly taxable sales (a quarter's divided by 3). That is 1.116% to 0.558% of the state tax, not the
statute's 4% to 2% of the first 3%, so the earlier choice not to apply the statute held up. Two new
discount shapes carry them: `floorPerMonth`/`floorShare` and `onSales`/`bands`. Not applied: Michigan's
0.75% for payment by the 12th and accelerated filers' uncapped rate; Virginia dealers notified that
their average monthly liability exceeds $20,000 (remove it with `--discount "VA state=0"`). Quotes and
the one place Michigan's form and statute differ: [`eval/state-pages-2026-11-14c.md`](eval/state-pages-2026-11-14c.md).

**Missouri, New York, Ohio and Tennessee, and two new vendor discounts (2026-11-14, later).** A
second pass the same day reached dor.mo.gov, tax.ny.gov, tn.gov and Ohio's statute on codes.ohio.gov.
Every due date matched the preset already here (Missouri's month end, New York's 20 days after its
March-to-February periods, Ohio's 23rd, Tennessee's 20th and January 20). Two discounts are new:
Missouri's 2% timely payment allowance on "all sales tax returns filed and paid by the required due
date" (`--state MO`, no cap printed), and New York's vendor collection credit, 5% of the tax up to $200
per return for quarterly and annual filers only (`--state NY`; `--freq monthly` gets none, as the
bulletin says). Ohio's 0.75% and $750-a-month cap, until now from search excerpts, are now quoted from
R.C. 5739.12 itself. Both new presets apply to the "MO state" or "NY state" label only; a return's
local tax under other labels needs its own `--discount`. New Jersey, Maryland and Indiana's day still
have no due-date text on the pages reached. Quotes: [`eval/state-pages-2026-11-14b.md`](eval/state-pages-2026-11-14b.md).

**Vendor discounts read on the states' own pages (2026-11-12).** Before this, `--state`
applied a timely-filing discount for IL, TX, FL, OH and GA only. Nineteen more states were
read the same way: the official form instructions, publication, FAQ or statute was saved,
and every quoted sentence was checked against the saved text. `stateDiscounts` now carries
15 more, each pinned in `salestaxreturn.test.mjs` with a hand-worked figure. The preset goes on the
tax line whose description is exactly `<ST> state` (`MI state`, not `MI` or `Michigan`). Since
2026-11-14, when no tax line on the return carries that label, the worksheet says the preset
discount was not applied (`presetDiscountWarning`) in place of the state note. Before, a book
labelled `MI` took no discount while the note said it "is applied".

| State | Rule applied to the "<ST> state" line | Source |
|---|---|---|
| AL | 5% of the first $100 of tax, 2% of the rest, at most $400 a month | revenue.alabama.gov due-date calendar |
| AZ | 1.2% (e-filed; 1% on paper); yearly cap not tracked | A.R.S. 42-5017 |
| KY | 1.75% of the first $1,000, 1.5% of the rest, at most $50 a return | KRS 139.570 |
| LA | 0.84% (state tax plus excess collected), at most $750 a month from 2025 | R-1029 instructions, rev. 06/01/26 |
| MO | 2%, no cap | RSMo 144.140; Form 53-1 |
| MS | 2%, at most $50 (per return assumed) | dor.ms.gov business FAQ |
| ND | 1.5%, at most $110 a return | N.D.C.C. 57-39.2-12.1 |
| NE | 2.5% of state and local sales tax, at most $75 on the return | Neb. Rev. Stat. 77-2708; Form 10 1-2026 |
| PA | 1%, at most $25 monthly, $75 quarterly, $150 semiannual | pa.gov Sales Tax Discount Q&A |
| SC | 3% if the return's tax is under $100, else 2% of the whole; fiscal-year cap not tracked | Code 12-36-2610; ST-3 |
| WI | 0.75%, at least the lesser of $10 or the tax, at most $8,000 a period | Publication 201 |
| WY | 1.95%, at most $500 a period, only if postmarked by the 15th | Return 41 instructions, rev. 7.10.24 |
| FL, TX | unchanged (2.5% of the first $1,200, max $30, electronic only; 0.5%) | DR-15 instructions; comptroller.texas.gov |

Two new discount shapes: `steps` (one rate on the whole tax, picked by the return's tax, for
South Carolina) and `min` (a floor of the lesser of `min` and the tax, for Wisconsin).
`stateDiscountNote` adds what the preset leaves out to the CLI worksheet and the page's sales
tax card. That covers the Wyoming 15th, Arizona and South Carolina's yearly caps, Florida's
electronic-only rule and Texas's 1.25% prepayment discount. It also explains why no discount
is applied for Michigan (a greater-of rule on the 4% part with monthly limits, MCL 205.54; applied
since 2026-11-14, above), Indiana (the rate depends on the prior July-June liability), Virginia (statute only; the
rates in force not confirmed on tax.virginia.gov; applied from Form ST-1 since 2026-11-14, above), Oklahoma (STS-20002-C has no discount
line) and New Mexico (TRD-41413 has none). Local-tax discounts are not applied; add them
with `--discount "<label>=..."`.

**Found on the way, fixed: the CLI read some flags only once.** `cli.mjs`'s `flag()` removes
what it reads, and a few commands read the same flag twice, so the second read was always
empty:

- `salestax return --state` reached only the discount, so the due day, NY/PA/DC periods and
  every state note fell back to the defaults. Wyoming's month-end returns showed the 20th, and
  New York's quarters were calendar quarters.
- `receipts --min 50` used no minimum.
- `paybills --terms FILE` failed to read its file.
- `schedulec --meals 100` deducted meals at 0%. Without the flag it was correct at 50%.
- `scorp --salary-pct` read as 0.
- `estimate` without `--eitc-children` added the no-child earned income credit nobody asked
  for, and `--eitc-children 2` counted 0 children.

The page was not affected. Each flag is now read once. `cli-flags-once.test.mjs` runs the CLI
for the sales tax, `estimate` and `schedulec` cases, and fails on the old code.

**Landed 2026-11-14, two days late, and one more case found.** The work above sat in a draft PR
(#15283) whose session ended before merging, so `main` kept the bug. Meanwhile the 2026-11-14
New York credit passed `flag("--freq")` into `stateDiscounts` ahead of the worksheet's own read,
which consumed it: from that merge until this one, every `salestax return` came out quarterly
whatever `--freq` said (checked by running `main`'s CLI: `--state WY --freq monthly` printed
"SALES TAX RETURN WORKSHEET (quarterly)"). Merging the draft into today's `main` reads `--freq`
once and passes it to both. `cli-flags-once.test.mjs` now also checks `--state NY --freq monthly`
(monthly worksheet, April 20, no credit) and NY quarterly (5% credit); its three tests fail on
`main` before this merge and pass after.

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

`us-banks.test.mjs` pins six layouts that already read with no code change: US Bank (`Transaction, Name, Memo, Amount`), Navy Federal and Truist and TD (`Debit`/`Credit` plus `Balance`, the balance chain holds), Citi card (`Status`, `Debit`/`Credit`) and Bank of America (summary block above the header skipped, `Running Bal.`). Rows are made up and headers are from memory of each layout; no real download was tried. Navy Federal, Truist and TD are named by `sniffBank` since 2026-11-07 (`navy-federal`, `truist`, `td-bank`; headers from memory, informational only, no real download tried). Corrected 2026-11-12: those three remembered headers were all wrong; the real ones are in "Real US bank exports read" above.

### Real US bank exports read (2026-11-12)

`node eval/us-bank-exports.mjs` reads 22 US bank and card exports that people committed to public GitHub repositories: 11 look like a person's own downloads (Citi card x4, TD Bank checking x2, Truist, Bank of America card x2, Capital One x2, Discover x2, Amex), the rest are anonymised rows in the bank's real layout (Navy Federal x3, TD, Truist, Bank of America checking, Chase checking, US Bank). They carry no licence and some hold names and account digits, so the script fetches them from raw.githubusercontent.com at run time and nothing is committed; the tests use rows written here under the same headers (`us-bank-real-layouts.test.mjs`, 6 tests).

Before this slice: 1,498 of 1,499 rows read, every payment and deposit with the right sign, but four faults. (1) The Navy Federal, Truist and TD headers written from memory on 2026-11-04 were all wrong, so `sniffBank` named none of them. Navy Federal writes an unsigned `Amount` beside a `Credit Debit Indicator` column (read right already, by the indicator), Truist a signed amount in parentheses beside a `Daily Posted Balance`, TD its routing and account numbers then `Debit, Credit, Check Number, Account Running Balance`. (2) TD's `Account Running Balance` was not known as a balance, so the balance chain was never checked on 374 TD rows. It now chains on two of the three files. On the third it finds one row whose printed balance repeats an earlier day's, a fault in that file, not the reader. (3) TD leaves a comma inside a description unquoted (`EGOV STRATEGIES, SERVICE`), which pushed the debit into the next column and the row was dropped as "unreadable amount". When a row is wider than its header and its money cells only read once the description is rejoined, the pieces are joined back and the import says so. (4) Line numbers in import problems counted rows, not file lines, so after a blank line (Bank of America leaves one under its summary block) every problem named the line above the real one. `parseCsv` now keeps each row's file line. Truist's `Daily Posted Balance` is filled only on a day's last row, so it is deliberately not read as a running balance. The Bank of America card layout (`Posted Date, Reference Number, Payee, Address, Amount`) is named too. After: 1,499 of 1,499 rows, 22 of 22 files named. Citi's zero-amount `PLAN FEE - CITI FLEX PLAN` rows (29 in one file) are skipped as before. Not tried: Wells Fargo, US Bank or Chase downloads that look real, and any business account (all 22 are personal).

### More real US exports: Wells Fargo, Chase, Ally, Apple Card, a business account (2026-11-14)

The 2026-11-12 batch had no Wells Fargo, US Bank or Chase download and no business account. `node eval/us-bank-exports.mjs` now reads 19 more files people committed to public GitHub repositories (fetched at run time, none committed): Chase checking x5 (three look like a person's own downloads, one of them an LLC's account funded by Stripe payouts), Chase card x4 (472 rows in one), Wells Fargo's header-less checking export x4 (three real), Ally x4 (three real, one of 528 rows), an Apple Card file and a US Bank-layout card download. Totals across all 41 files: 3,284 rows read, 41 of 41 layouts named, no unexplained skip and no payment or deposit row with the wrong sign. Three faults were found and fixed, two of them with money consequences:

1. **Every sign flipped on a real Ally checking export.** Ally writes signed amounts with a `Type` of `Withdrawal` or `Deposit`. A utility paid through its bill-pay service shows as `LIPA DIRECTPAY~ Future Amount ...`, and "directpay" was a strong card-payment word (Discover writes `DIRECTPAY FULL BALANCE`). Its rows were negative, so the reader decided charges were positive and flipped all 528 rows: payroll became money out. Now "DIRECTPAY" counts only at the start of the description, sign inference never runs when the Type column was read as a debit/credit marker, and a `Type` column whose Withdrawal/Deposit (Debit/Credit) words agree with the signs on 95% of at least five rows keeps the signs even when one value (`Check`) stops it being a marker.
2. **Stripe payouts suggested as transfers, and every ACH line one payee.** Chase prints an ACH entry as the whole addenda: `ORIG CO NAME:STRIPE ORIG ID:... CO ENTRY DESCR:TRANSFER SEC:CCD TRACE#:... IND NAME:...`. The keyword rules saw "transfer" and asked for the other side of an internal transfer; and the payee key, built from the first two words without digits, was `orig name` for every ACH line, so payee memory would have learned Stripe payouts, payroll and tax debits as one payee. `achCompact` (categorize.mjs) reads the originator's name and the entry description (`STRIPE TRANSFER`, `IRS USATAXPYMT`; Chase pads the description to ten characters, so a full one abuts `SEC:`), the payee key and the keyword rules use that, and Stripe payouts go to Sales (4000) by the existing `stripe transfer` rule. The card payment and the savings transfers on the same file are still transfers.
3. **A pandas-saved file was not named.** A Chase export written back out of pandas has an unnamed index column first (`,Details,Posting Date,...`); `sniffBank` now drops one empty leading header cell. That file is a filtered subset (the index jumps 55, 111, 129), so its 22 balance breaks are real gaps, not a reader fault.

Pinned in `us-bank-downloads-2.test.mjs` (6 tests, rows written here under the real headers). Not tried yet: a US Bank checking download, a Chase business card, a credit union, and a business account at any bank other than Chase. A PNC sample with a hand-mangled row (`"$50.00$1234.56"`) is left out of the count; the reader names the row and skips it.

### Credit unions and the US Bank memo (2026-11-14, later)

`node eval/us-bank-exports.mjs` now reads 48 files (7 more, fetched at run time, none committed): a US Bank card download with ISO dates (57 rows, real merchants), a US Bank layout sample, and five files in a layout several US credit unions' online banking writes (`Transaction ID, Posting Date, Effective Date, Transaction Type, Amount, Check Number, Reference Number, Description, Transaction Category, Type, Balance, Memo, Extended Description`; the first column is missing in some): a 1,086-row checking download from a New Mexico credit union, a credit-union card download from Oregon, and three test files from other projects. Totals: 4,506 rows read, 48 of 48 layouts named, no unexplained skip, no payment or deposit row with the wrong sign.

Two findings, one a fault with a money consequence:

1. **The US Bank card download read 0 rows.** Its memo is `24269794038500527407893; 05411; ; ; ;`: five semicolons in every data line against four commas, so the delimiter picker chose the semicolon and found no date or amount column. A delimiter that splits some line of the file into two or more known column names now beats one that does not; with no recognisable header the old count decides, as before. After: 57 of 57 rows.
2. **That memo carries the card network's merchant category code** (the second field: 05411 on grocers, 05542 on fuel, 05814 on coffee shops, 05712 on furniture), and the categorizer already uses an MCC when a file has a column for one. It is now read from a memo of that shape (a 15 to 30 digit reference, then a four-digit code with a leading zero). On the real file, purchases with a suggestion on first sight go from 18 of 55 to 33 of 55; no suggestion that the payee names already gave changes. Read by eye, 13 of the 15 new ones are right; the two doubtful ones are a bookshop (MCC 5942) and a university museum (MCC 8220), both sent to Education and dues.

The credit-union layout read right with no code change (signed Amount, a Debit/Credit type) and is now named `credit-union`. Its running balance chains except where something is missing: the 1,086-row download breaks at exactly the two places where its owner blanked out rows (`,,,,,,,` lines), and the card file prints what is owed, which chains once flipped, as `importStatement` already does for card accounts. The three test files break where their authors' made-up balances do not add up. Pinned in `credit-union-usbank-memo.test.mjs` (7 tests, rows written here under the real headers). Still not tried: a US Bank checking download, a Chase business card, and a business account at any bank other than Chase.

### Chase business cards and a US Bank checking download (2026-11-14, third batch)

`node eval/us-bank-exports.mjs` now reads 63 files (15 more, fetched at run time, none committed): six Chase business card downloads (four look like a business's own: a software firm's quarter with four employee cards, 278 rows; a restaurant's month; a two-card month at a firm that buys groceries and Facebook ads; an 83-row single-card file), a US Bank checking download (47 rows, account digits masked by its owner), two US Bank card downloads and seven US Bank layout samples. Totals: 5,767 rows, 63 of 63 layouts named, no unexplained skip, no payment or deposit row with the wrong sign.

1. **Chase's business card layout was not named, and its employee cards were lost.** The download puts a `Card` column first (the last four digits of the card that made each charge), so `sniffBank` returned nothing, and the reader dropped the column. The layout is now named `chase-business-card`, and each line keeps its card's last four digits (`txn.card`; a full number in that column is cut to the last four; Brex's `Card Last Four` is read the same way).
2. **Spend by card** (`cards.mjs`; CLI `cards [--account CODE] [--card 1234] [--from D --to D] [--csv|--json]`): per card on a business card account, the lines, spend, refunds and net, where the money is filed, what is still waiting for an account (with the suggested accounts), and the top merchants (`SQ *`, `AMAZON MKTPL*<order>` and store numbers folded so one merchant is one row). Card payments are left out, and lines with no card (Chase puts interest on none) are listed apart. `--csv` lists every line with its card, amount and account: the start of an employee's expense report. On the software firm's quarter it gives four cards: $36,434.31 on the owner's (Upwork $16,749.60, AWS $9,692.96), $3,488.14, $382.33 and $264.36.
3. **Chase's "Professional Services" label stopped suggesting legal and professional fees.** The bank's own category is a last-resort hint when nothing else knows the merchant. On these files, 17 lines were suggested only by that label, and none read by eye as a legal or accounting fee: data APIs, AI tools, cloud storage, an e-commerce fee, a rent payment, a prop-trading shop, a person's name. Chase files Upwork, GitHub, Vercel and Facebook ads there too. The label now gives no suggestion, as the card network's own "professional services" name already did (`mcc.mjs`). Measured and kept: "Bills & Utilities" was right on 7 of 23 label-only lines (phone and fax, internet, a city utility), wrong on 10 (insurance, road tolls, domain names, Netflix) and unclear on 6 (web hosting, an unknown merchant). It stays because those lines are always sent to review, but it is the next label to look at.
4. **US Bank checking pays its cards in words the rules did not know.** `INTERNET BANKING PAYMENT TO CREDIT CARD 1234` and `WEB AUTHORIZED PMT AMERICANEXPRESS` had no suggestion; both are now suggested as transfers. Only card issuers' names count after `PMT`: `WEB AUTHORIZED PMT PAYPAL` or a phone company's bill is still a bill.

Pinned in `chase-business-card.test.mjs` (8 tests, rows written here under the real headers). US Bank's glued phone and reference numbers (`SPRINT8006396111`) were seen here and fixed in the next section. Still not tried: a business account at a bank other than Chase, and a Chase business checking file.

### Glued numbers in payee names (2026-11-14, fourth batch)

Banks glue phone, store and reference numbers straight onto the merchant: US Bank writes `WEB AUTHORIZED PMT SPRINT8006396111`, others `SQ *CREPELANDIA210`, `707-652-3328ADAPTDMIND`, `NGRID37 NGRID37WEB`, and Mint exports `AMERICANAIR0012321621819 800-428-4322 TX` or `SIREN53313 CHICAGO IL`. The payee key dropped every word with a digit in it, so those lines had no payee at all (nothing remembered, no new-payee guess) or keyed on the city alone (`chicago`, so every Chicago merchant shared one memory).

The rule now (`payeeTokens` in `categorize.mjs`): a token that is one run of three or more letters and one run of two or more digits, in either order, keeps its letters, but only while no clean payee word has come before it. After the merchant's name, glued tokens are store and city codes (`MARATHON PETRO13 MONROE6537`, `WALGREENS #1234 00CINCINNATI`): a first version that kept them everywhere split Walgreens and Marathon into one payee per town, and was dropped. Glued dates (`Jan29`, a Citi line in a Mint export) and mixed references (`2K3`, `IBEXHSDFR2`) are still dropped. The airline keyword now matches the glued `AMERICANAIR`, `DELTAAIR` and `UNITEDAIR` too.

Old books keep working: memory saved under the old key still answers (`legacyPayeeKey`, tried when the new key misses), a line whose old key is known is not treated as a new payee, and a W-9 flag or payee merge saved under the old key is still found by `contractors1099`.

Measured before and after, on the same files (all fetched at run time, none committed):

| set | before | after |
|---|---|---|
| 63 real US exports, 5,767 rows: lines with no payee key | 45 | 36 (the rest say only "Debit", "Deposit", "Credit Card Payment") |
| same: lines whose key changed | | 10 (9 from no key; 1 `bestbuy` to `bestbuycom bestbuy`) |
| Mint, 10 exports, 2,926 lines scored online: right | 90.6% | 90.7% (2 American Airlines lines from blank or Meals to Travel; no line newly wrong) |
| Mint first-seen payees right | 82.8% | 83.0% |
| Toronto p-card, 4,284 lines: right | 85.3% | 85.5% |
| Scottish Government cards, 11,087 lines: right | 78.8% | 78.8% (9 more lines count as first seen) |
| Capital One card, Chase card (billcat) | | identical |

The gain is small because glued names are rare in these sets, but each of those lines was a payee the books could never learn. Pinned in `glued-payee.test.mjs` (6 tests, descriptions written here in the real shapes). Not tried: a US Bank business checking download, where `WEB AUTHORIZED PMT` lines are commoner.

### Mercury business accounts (2026-11-14, fifth batch)

Every business file read so far was at Chase. `node eval/mercury-exports.mjs` reads five files in the layout Mercury's download writes, fetched at run time from public GitHub repositories at pinned commits (none committed; the two real ones hold names, emails and account digits): two that look like LLCs' own downloads (200 and 372 rows) and three samples in Mercury's layout. The first carries the owner's own `Category` on 105 lines (Bank Fees, Software & Subscriptions, Business Meals, Legal & Professional Services, Revenue, Transfer...): the first set of a firm's own labels on its own bank lines. Four findings, two with money consequences:

1. **Three accounts read as one.** Mercury writes every account into one file and names it on each row in `Source Account`: on the first LLC's file, a checking account, a second checking account and the Mercury Credit card. The reader did not know that column, so all 200 rows went into whichever account the user picked: card charges landed in the checking account, and each of the card's 24 autopayments (`IO AUTOPAY`) appeared twice in the same account, once out and once in, with nothing to pair against. `Source Account` is now read like Mint's `Account` column, so the page and `import file.csv --map "NAME"=CODE` ask for a chart code per account. Split that way, the 48 autopay and transfer lines pair as transfers between the accounts (0 before) and the card's charges land on the card.
2. **Mercury's merchant category was ignored.** The file has two category columns: the owner's own (`Category`) and Mercury's (`Mercury Category`: Software, Restaurants, FinancialInstitutionsAndFees...). Only the first was read. It still wins; Mercury's now fills the lines the owner left blank, as the same weak, review-only hint as Chase's label. Two labels gained a mapping: `FinancialInstitutionsAndFees` (Mercury's own foreign-transaction fee, 45 of 45 filed to Bank Fees by the owner; written looking at this file) and `CarRental`. `Retail`, `Grocery`, `Entertainment`, `ProfessionalServices`, `GovernmentServices` and `Electronics` name no account and stay silent.
3. **Card lines lost their card.** `Last Four Digits` is now read like Chase's `Card` column, so `cards` gives spend per card on a Mercury card account. The cardholder's name and email in the same row are never kept.
4. **Failed charges.** On the second LLC's file 197 of 372 rows are `Failed` card charges, retried until they went through; they were already skipped, and stay skipped. A sample file marks every deposit `Received`; that is now read as booked instead of skipping all 53 deposits.

Replayed in date order against the owner's labels (the `Category` column blanked first, so the categorizer never sees it; money out, labels that name an account; 100 lines):

| | before | after |
|---|---|---|
| every line, right / wrong | 85.0% / 6.0% | 90.0% / 3.0% |
| first-seen payee (25 lines) | 44.0% / 24.0% | 64.0% / 12.0% |

On the second LLC's file (no owner labels), a cold import suggests an account for 167 of 174 lines against 72 before; by eye the new ones are AI and developer tools under Mercury's `Software` and its foreign-transaction fees, all plausible. Caveats: one firm's 100 labelled lines, a few recurring payees, and the fee rule was written looking at the same file, so the gain is an upper bound. The three wrong suggestions left are all the new-payee guess (a lodging charge, an Airwallex transfer and a Wise fee sent to meals). Pinned in `mercury-business.test.mjs` (6 tests, rows written here under the real header).

### Monarch and Rocket Money exports (2026-11-14, sixth batch)

Mint closed in 2024; the budgeting apps people moved to were Monarch and Rocket Money. `node eval/aggregator-exports.mjs` reads one real export of each, fetched at run time from public GitHub repositories at pinned commits (never committed: both hold names and account digits; only counts are written here). The Rocket Money file is a small agency's American Express business card, March to June 2024 (958 lines), the first real business card in the labelled sets; the Monarch file is one household's 2025 accounts (1,581 lines in five accounts). Each line carries the app's category, its own guess or the owner's correction. The replay is the import loop: money out only, in categories that name one chart account (shopping, groceries and transfers unscored), the Category column blanked first so the categorizer never sees what it is scored against, each day suggested from every earlier day's filed lines.

1. **A Rocket Money export was booked as income.** Its layout was unknown, and it writes money out as a positive Amount and refunds as negative, on cards and checking alike (944 of 958 lines positive here; the 14 negative ones are airline and hotel refunds and Google credits; two other projects' test files agree). With no balance column and no "payment thank you" row, nothing told the reader to flip signs, so four months of a firm's card spending came in as money received. The layout is now named (`rocket-money`), signs are flipped with a note saying so, and each `Account Name` is its own account, as for Mint.
2. **Monarch's cleaned merchant hid the line.** The reader took Monarch's `Merchant` column, which folds `KROGER FUEL #3532` and `KROGER #532` into one "Kroger" and `EXXON 7-ELEVEN` into "7-Eleven"; 30 fuel lines then went to meals. It now reads `Original Statement`, the bank's own text, and keeps the merchant only where the statement is blank. The same switch on the ten Mint exports (Description to Original Description, through this reader) was measured too and not made: on the held-out six the loop went 68.1% to 70.0% right but 23.8% to 24.4% wrong, and first-seen wrong 22.8% to 25.3%. Mint's cleaned names are better than Monarch's.
3. **A glued Amex merchant had no payee.** `HOTELSCOM72791059909HOTELS.COM` is name, reference and web address in one token, so it keyed to nothing and nothing was learned from it. A first token of letters, six or more digits and letters now keeps its leading letters. Across 13,513 lines in 75 real files (the 63 US exports, these two and the ten Mint files) only these three lines changed key; a looser first try also turned two references (`OPE879BQLW`) into payees and was narrowed.
4. **Keywords and labels.** Hotels.com, Amex Travel, limousines, parking meters (`PRK METER`), auto washes, Texaco, natural-gas utilities and liability insurance (written after the reading below, so tuned on these files). The bank-category layer now reads both apps' label names (Restaurants & Bars, Dining & Drinks, Travel & Vacation, Software & Tech, Gas & Electric, Internet & Cable, Water, Parking & Tolls, Auto Maintenance) as the same review-only hint as Chase's. A bare "resorts" was tried and dropped: on the Mint files it sent a pet resort to travel.

Right / wrong of all scored lines. "Before" on Rocket Money is the first reading once its signs were right, with no rule written from the file; on Monarch it is `main`.

| file | scored | keywords alone, before | after | learning loop, before | after | first-seen payee, before | after |
|---|---|---|---|---|---|---|---|
| Rocket Money, a firm's Amex card | 710 (205 first-seen) | 69.2% / 1.1% | 70.0% / 1.1% | 93.2% / 5.5% | 94.1% / 5.1% | 79.0% / 17.6% | 81.0% / 16.1% |
| Monarch, household, 2025 | 502 (155) | 51.6% / 12.5% | 71.7% / 7.4% | 88.2% / 10.2% | 91.6% / 6.8% | 73.0% / 22.3% | 80.0% / 16.1% |

On Monarch the reader change alone (item 2) gives keywords 67.7% / 7.2%, loop 91.0% / 6.8%, first-seen 78.1% / 16.1%: most of the gain, and not a rule fitted to the file. On the ten Mint exports one line changed on keywords alone: a liability-insurance charge now goes to insurance, which counts as wrong there (3.2% to 3.3% of 2,926) because that owner files it under business services; the loop is unchanged (90.7% / 5.3%), and so is the Mercury replay.

What it says, with care: the labels are a consumer app's, and they are noisy (Rocket Money files a Midjourney subscription and an AI writing tool under Dining & Drinks and a restaurant booking under Auto & Transport); one firm's card and one household. Convenience stores that sell fuel (Wawa, Sheetz, 7-Eleven) are left as meals: in the Monarch file the same store is fuel on one line and snacks on the next, and only the amount tells them apart. One more finding for the Mint reading above: one of its six held-out files (a student project's) has labels that look shuffled (Uber trips filed as Restaurants, pizza as Ride Share), which pulls its held-out figures down; it is left in, as it was when the figures were first read. Pinned in `aggregator-exports.test.mjs` (6 tests, rows written here under the real headers).

### Copilot Money exports (2026-11-15)

Copilot Money is the other app Mint users moved to. `node eval/aggregator-exports.mjs` now reads two real Copilot exports too, fetched at run time at pinned commits from public GitHub repositories and never committed (names and account digits; only counts here): a Florida household's 2026 accounts, January to October (1,876 lines, 15 accounts, with its own joint and personal categories such as "Restaurants - Joint" and "Car + Gas"), and one person's cards and checking, February 2022 to November 2024 (2,492 lines, 10 accounts, on Copilot's default categories). Copilot writes a `type` beside the category: `regular`, `income` or `internal transfer`.

1. **A Copilot export was read with every sign backwards.** Copilot writes money out as a positive amount and income and refunds as negative, like Rocket Money (1,579 of the household's 1,751 regular lines positive, all 125 income lines negative). The layout was unknown and the household file has no "payment thank you" row, so 1,577 spending lines came in as money received and the paycheques as spending. The second file came out right by luck: its card-payment rows tripped the card test, and it was named Amex. The layout is now `copilot-money` (both header spellings, `name` and the older `description`, and a hand-trimmed one a third project committed), signs are flipped with a note, and each account is read on its own.
2. **Internal transfers are labelled as such.** A line Copilot typed `internal transfer` gets the label "Internal Transfer" whatever its category says ("miscellaneous" on 680 lines of the second file), and the bank-category layer files that label as a transfer for review. Of the second file's 707 internal transfers, with no history, 311 were marked transfers before and 645 now; 334 had no suggestion. The other 62 are `Zelle Payment From <a person>`, which the keyword files as income. They are left that way: in a business's books a person's Zelle is often a sale, and the owner can say otherwise once.
3. **The eval itself mis-scored a file.** `hideColumn` (shared by the Mercury, YNAB and aggregator evals) indexed the labels by record while the reader numbers rows by file line. One household note holds a line break, so every label after line 1,143 belonged to the line above. Hulu came out "labelled" as restaurants and the loop looked like 54.5% right. Labels are now keyed by the line each row starts on. The Mercury and YNAB replays and the ten Mint files give the same figures as before, so no published number changes.
4. **Keywords**, written from the household's first-seen misses only. The second file was scored after, but its top 25 misses had been read while finding item 1, so it is not a clean hold-out. The new rules cover Claude.ai, Otter.ai and Google One, Marathon fuel, JustPark, auto leases, Florida's E-PASS toll, Florida Power & Light and Duke Energy's glued `DUKEENERGY`. Most of the household's misses are its trip budget: a cafe, a grocer or an ATM on holiday filed as "Travel & Vacation". A bookkeeper would file those by what they are, so no keyword copies them. Netflix, Kindle and IRS payments stay with a person, as before.

Right / wrong of the scored lines (money out in categories that name one chart account; "Car + Gas" takes vehicle or travel, as Rocket Money's "Auto & Transport" does, because it holds tolls and parking). "Before" is today's reader with `main`'s keywords. Before the reader fix there was nothing to score on the household file: its spending was income.

| file | scored (first-seen) | keywords alone, before | after | learning loop, before | after | first-seen payee, before | after |
|---|---|---|---|---|---|---|---|
| Copilot, Florida household (tuned) | 760 (299) | 39.9% / 5.8% | 50.0% / 5.9% | 79.6% / 15.8% | 81.2% / 14.6% | 56.5% / 31.8% | 60.2% / 29.1% |
| Copilot, one person 2022-2024 (scored after) | 714 (245) | 58.7% / 5.2% | 59.2% / 5.2% | 92.3% / 6.7% | 92.4% / 6.6% | 79.2% / 18.0% | 79.6% / 17.6% |

The Rocket Money and Monarch rows above, the YNAB registers, the Mercury replay and the ten Mint files are unchanged by the new keywords. What it says, with care: two households and their own labels, not a bookkeeper's. The keywords barely move the second file, so most of the household gain is fitted to it. The reader fix is the larger change: a Copilot user's whole file had been booked backwards. Pinned in `copilot-money.test.mjs` (5 tests, rows written here under the real headers).

### YNAB registers: three households' own categories (2026-11-15)

`node eval/ynab-registers.mjs` reads three YNAB register exports that people committed to public GitHub repositories, fetched at run time at pinned commits and never committed (they hold names; only counts are written here): a Seattle family's 42 accounts, December 2024 to May 2025 (1,944 lines); a Utah couple's five accounts, April to September 2025 (602); a Chicago renter's six, June and July 2026 (257). YNAB's payee column is a name YNAB has already cleaned ("Seattle City Light", not the bank's descriptor), and the category is one the household chose itself, so this tests the built-in keywords on tidy names against labels no app guessed. The reader took all three registers with no problems. Every column that names the category (`Category Group/Category`, `Category Group`, `Category`) is blanked before the reader sees the file; emoji in front of a category ("🛒 Groceries") are dropped before the lookup. Only money out in categories that name one chart account is scored (dining, fuel and parking, insurance, utilities and phone, subscriptions, rent, a nanny's pay, interest and fees); groceries, gifts, allowances, trips, medical and transfers between the household's own accounts are left out.

The rules were written from the Seattle file's first-seen misses only, then Utah and Chicago were read as held out:

- the utilities rule matched "utility" but not "utilities", so "Seattle Public Utilities" went unsuggested; "city light", "espresso", Washington's toll pass ("Good To Go", WSDOT) and Impark parking; YNAB's own subscription.

Then, after that reading, from the Utah and Chicago misses (so tuned on all three): Hulu's glued card name (`HLU*HULUPLUS`), ComEd, Chicago's Ventra transit card, Maverik and Cenex fuel, tire shops, a DMV and RealPage rent payments. Conoco was tried and dropped: in the software LLC's books below, `CONOCO - CITYMART` is a convenience-store supply run. Netflix, Audible, YouTube Premium, Peloton, iTunes and Prime were left alone on purpose: the households filed them as subscriptions, but in a business's books they are as often the owner's own, and three existing tests pin that they wait for a person.

Right / wrong of the scored lines (first-seen: a payee key never filed before in that register):

| register | scored (first-seen) | keywords alone, before | Seattle rules | all rules | first-seen, before | Seattle rules | all rules |
|---|---|---|---|---|---|---|---|
| Seattle (tuned) | 393 (110) | 61.3% / 1.0% | 69.7% / 1.0% | 69.7% / 1.0% | 70.9% / 12.7% | 76.4% / 10.9% | 76.4% / 10.9% |
| Utah (held out) | 125 (48) | 41.6% / 0.0% | 42.4% / 0.0% | 56.0% / 0.0% | 66.7% / 20.8% | 68.8% / 18.8% | 79.2% / 10.4% |
| Chicago (held out) | 115 (61) | 35.7% / 0.0% | 36.5% / 0.0% | 54.8% / 0.0% | 62.3% / 16.4% | 63.9% / 16.4% | 68.9% / 14.8% |

The learning loop on every line, before / after all rules: Seattle 89.8% / 4.8% to 91.3% / 4.3%; Utah 71.2% / 14.4% to 76.0% / 10.4%; Chicago 77.4% / 9.6% to 80.9% / 8.7%.

What it says, with care: the held-out gain from the Seattle rules is small (one or two points on each held-out file, about one line in 50), because each household's money goes to local names (a Utah fuel chain, a Chicago transit card) that one Seattle file cannot teach; the larger "all rules" figures are fitted to the files they are read on. Built-in keywords stayed almost never wrong on cleaned names (4 of 633 lines across the three files); what goes wrong is mostly the new-payee guess, which on a first-seen payee with nothing known about it leans to meals (Utah "Gas: Conoco" and "Rent: Greystar" both went to meals before). Labels are three households' budgets, not a bookkeeper's answer key. On the other labelled sets: the ten Mint exports moved by one line (keywords alone, first-seen right 47.0% to 47.1%, wrong unchanged at 2.6%), the Monarch and Rocket Money replay and the software LLC's books are unchanged. Pinned in `ynab-registers.test.mjs` (6 tests; register lines made up under YNAB's real headers).

### Card payments as the banks print them, and a software LLC's own books (2026-11-15)

`node eval/nevarro-ledger.mjs` reads the published books of a single-member software LLC (MIT-licensed hledger journals, fetched at run time at a pinned commit; nothing committed): its Bluevine business checking and its Chase Ink business card, 2023 to 2026, 314 bank lines, each filed by the owner. The CSV downloads are not in that repository, but every journal entry keeps the bank's own description, so these are the first real Bluevine lines read here and the fourth set of a business's own labels (after Mercury, Rocket Money and Open Collective).

1. **Card payments were not seen as transfers, on either side.** Chase cuts the card's payment line to `AUTOMATIC PAYMENT - THANK`; Bluevine writes the same payment as `CHASE CREDIT CRD, AUTOPAYBUS`. Neither matched a transfer keyword, so on a one-sided import (only the card, or only the checking account) the line got no suggestion at all, instead of the review note that says "looks like a transfer, import the other account". 1 of 35 card payments and 1 of 29 Bluevine transfers were suggested as transfers. The same gap ran through the 63 real exports in `eval/us-bank-exports.mjs`: Citi's `ONLINE PAYMENT, THANK YOU`, Amex's `ELECTRONIC PAYMENT RECEIVED-THANK`, and on the paying side `DISCOVER E-PAYMENT`, `CHASE CREDIT CRD AUTOPAY` and `... EPAY`, `AMERICAN EXPRESS ACH PMT`, `APPLECARD GSBANK PAYMENT`, `Citi Autopay`, `Synchrony Bank CC PYMT`. Truist's `CCPYMT WELLS FARGO CARD ... INTERNET PAYMENT` and `EPAY CHASE CREDIT CRD` were worse: suggested as Wages (6150), six lines, and `Citi Autopay` as Utilities (6140), three lines. Two new first rules in `BUILT_IN` (`categorize.mjs`): money in reading "payment, thank" (with "received" allowed between), and a card issuer's name next to a payment word (`e-payment`, `epay`, `autopay`, `ach pmt`, `pmt`, `pymt`, `payment`, `crcardpmt`). After: 35 of 35 and 27 of 29 (the two left are Square deposits, suggested as sales, which the owner books as transfers from a Square balance). On the 63 exports plus the Mint, Monarch, Rocket Money and Mercury files (14,054 lines), 234 lines changed and every one became a transfer: 225 had no suggestion, the 9 others are the Wages and Utilities lines above. Read by eye, all 234 are card payments. Left alone: `CITI FLEX PAY` (an instalment plan), `WELLS FARGO CARD DES:CRD` (no payment word), `VENMO PAYMENT`, a phone or utility bill paid "by payment", `Thankyou Points Redeemed`, and loan payments (`CITIZENS MTG PMT`, `SALAL CU LOAN PYMT`), which are a liability's principal and interest, not a card payment.
2. **Keyword gaps on the LLC's vendors.** `CO SECRETARY STATE FEE` (the state's own wording, without "of") and `NC SEC OF STATE` were not filing fees, `GOOGLE *Workspace` missed the existing Workspace rule because of the `*`, and `Google Domains`, UptimeRobot, NodePing and Migadu had no rule. All now go to Taxes and licences (6110) or Software and subscriptions (6060), as does "registering a DBA". These were written looking at this file, so the keyword gain below is an upper bound; outside it the same change turned three more lines right (a Colorado filing fee on the Rocket Money file, a North Carolina one on a Wells Fargo download, `GOOGLE*DOMAINS` on a Fidelity card) and no other line.

Replayed in date order against the owner's labels (money out to an expense the default chart has: hosting, backup, mail, domains, monitoring and developer tools as software; foreign-transaction fees as bank fees; state fees as licences; donations unscored):

| account | scored | keywords alone, before | after | learning loop, before | after | first-seen payee, before | after |
|---|---|---|---|---|---|---|---|
| Chase Ink card | 227 (24 first-seen) | 89.0% / 0.4% | 97.4% / 0.4% | 95.6% / 2.2% | 97.8% / 2.2% | 58.3% / 20.8% | 79.2% / 20.8% |
| Bluevine checking | 3 | 0 / 0 | 3 / 0 | 0 / 0 | 3 / 0 | | |

What it says, with care: one small firm, a handful of recurring vendors, 227 scored lines; the loop was already near the top because the payees repeat monthly. The five first-seen lines still wrong are the new-payee guess sending a grocer, a fuel stop, a tutoring marketplace and a coworking charge to software (this book is almost all software, so its prior says software), and USPS suggested as postage where the owner filed a government fee. No change on the Mint (2,926 lines), Monarch, Rocket Money or Mercury replays, whose scored lines exclude transfers. Pinned in `card-payments.test.mjs` (5 tests: descriptions under the real wording, amounts made up, and the hledger reader).

### UK merchants in the built-in keywords: a fourth card buyer (2026-11-15)

The built-in keywords were written from US exports. On three UK public buyers' card lines, read from empty books with the merchant name only, they said nothing on 85-90% of lines: Trainline, Travelodge, Ryanair, Screwfix, Royal Mail and Tesco were all blank, while Kroger, Home Depot and USPS were not.

The new buyer is South Lakeland District Council (England, `node eval/southlakeland-pcard.mjs --dir <folder>`, fetch command in the file; Open Government Licence v3.0, not copied here): 54 monthly reports, July 2014 to November 2019, 8,182 lines. 5,029 carry the council's procurement class ("Public Transport", "Accommodation", "Stationery"), and 3,311 of those name a chart account (`CLASS_MAP`, written from the class names before the first scored run). The report has no merchant category code, so this is the first card buyer here where only the bank-line layers can speak. Its purpose column ("Train to Birmingham for planning event") would give the answer away and is not read.

A UK block now sits at the top of `BUILT_IN` (`categorize.mjs`), written from South Lakeland's blank list and from the UK twins of chains the table already filed: rail, coach and airlines and Travelodge as travel; Tesco, Sainsbury's, Asda, Morrisons, Waitrose, Lidl, Booths, Iceland, Greggs, Pret, Nando's and Wetherspoon as meals (as Kroger and Aldi already were); Screwfix, Toolstation, Travis Perkins, Jewson, Wickes, B&Q, Currys and RS Components as supplies; Ryman, WH Smith, Viking and Royal Mail as office and postage; Parcelforce, Evri and Yodel as shipping; CIPFA, CIEH, IRRV, CIPD, AAT, RICS and the chartered institutes as dues; Companies House as a licence; Money Claim and HM Courts as legal fees; E.ON and British Gas as utilities; DVLA (road tax) as a vehicle cost, the way HMRC's list of allowable expenses for the self-employed files it. General and department stores (Argos, Home Bargains, Poundland, B&M, M&S) stay blank, as Walmart and Target do, and HMRC stays blank because a payment to it is usually VAT or PAYE owed.

Keywords alone from empty books, right / wrong (`node eval/uk-card-keywords.mjs --sl <dir> --durham <dir> --scot <dir>`):

| buyer | lines | before | first block | after reading the misses |
|---|---|---|---|---|
| South Lakeland (written from) | 3,311 | 8.7% / 1.5% | 39.7% / 5.7% | 39.4% / 5.3% |
| Durham County Council (held out for the first block) | 151,437 | 10.6% / 2.1% | 28.1% / 3.0% | 28.2% / 2.8% |
| Scottish Government (held out for the first block) | 11,087 | 8.5% / 6.2% | 11.8% / 6.5% | 11.8% / 6.5% |

The middle column is the held-out reading: Durham's and the Scottish Government's lines were scored before the block was written and not looked at until it had run. Then their misses were read and the block changed: supermarket filling stations print the grocer's name ("TESCO PFS 4088", "ASDA PETROL", "TESCO PAY AT PUMP") and now go to vehicle and fuel; Asda's George clothing goes to supplies; "Iceland Travel" is no longer the grocer; Halfords (Durham right 26, wrong 87), NCP car parks (Durham 0 and 11, South Lakeland 2 and 6) and DVSA (Durham 0 and 55) were dropped as more often wrong than right. The last column is fitted to all three.

In the learning loop (books filed a day at a time, first-seen merchants right / wrong): South Lakeland 34.2% / 17.5% to 39.6% / 17.1%; Durham with the merchant code layer off 53.4% / 34.6% to 54.2% / 34.1%, and with it on unchanged at 87.8% (wrong 11.7% to 11.6%); the Scottish Government with the code layer off 42.6% / 45.5% to 42.8% / 45.4%, with it on unchanged at 64.8%.

What it says, with care:

- **The gain is on a new user's first import, not on books that have history.** From empty books a UK user now gets a suggestion on about three lines in ten instead of one in ten. Once a book has filed a merchant, its own memory does the work, and when the card file carries a merchant code that layer already covers almost every first-seen line, so the learning-loop figures barely move.
- **Most of the held-out gain is a few big names.** Tesco, Asda, Sainsbury's, Screwfix, Travelodge and DVLA are most of Durham's 26,000 newly right lines; counted once per merchant name, Durham moved from 7.3% to 8.9% right. The long tail of local firms is still the books' own job.
- **The Scottish Government's file barely moves** because it lists only lines over £500, few of them at chains.
- **Wrong went up on South Lakeland** (1.5% to 5.3%): the council filed some Trainline and Virgin Trains lines as accountancy or insurance, Sainsbury's mostly as consumables, and DVLA as vehicle maintenance. Those count as misses here; the labels are one council's.
- **No change on the US sets:** the YNAB, Mint, Monarch, Rocket Money, Mercury and software-LLC replays and the 63 US exports read the same or a line better (Mint first-seen 47.1% to 47.2%).

Pinned in `uk-merchants.test.mjs` (5 tests: descriptions in the shapes UK card reports print, amounts made up, and the South Lakeland reader on made-up rows under the real header).

### Chain names from OpenStreetMap (2026-11-15)

The built-in keywords know the big names. A new user's first import is mostly the rest: Heron Foods, Wolseley, Scotmid, Cava, Blake's Lotaburger. OpenStreetMap's name-suggestion-index (NSI, BSD 3-Clause) lists about 50,000 chains worldwide with the kind of place each one is (`shop=supermarket`, `amenity=fuel`, `tourism=hotel`). `brands-build.mjs` turns release 8.0.20261101 into `brands.mjs` (6,555 chain names that suggest an account and 71 that only block, 105 KB, the NSI notice kept in its header); `suggest` tries it after the keywords, the card code and the bank's own category, before the new-payee guess. Money out only, confidence 0.5, review only (`source: "brand"`, reason `"heron foods" is a chain listed by OpenStreetMap as a food shop, cafe or restaurant`).

How it was built, before any bank line was scored:

- **`CATEGORY_MAP`**, NSI kind of place to account, following what `BUILT_IN` already does with the same merchants: supermarkets, convenience stores, cafes and restaurants as meals (as Kroger and Tesco), hotels, car hire and travel agents as travel, fuel, tyres and car repair as vehicle, DIY, hardware and trade counters as supplies, stationers, copy shops and post offices as office and postage, telecoms as utilities, insurers, coworking and self-storage. Kinds that fit two accounts (clothes, department and variety stores, pharmacies, electronics, furniture, banks, parking) are unmapped.
- **Longest name wins, and an unmapped longer name blocks a shorter mapped one**: "Total" is fuel, "Total Wine" is an off-licence, so "TOTAL WINE" gets nothing. A name listed under two accounts says nothing.
- **One-word names that are common English words are dropped** (SCOWL sizes 10-50 through `wordlist-english`, MIT, read at build time only): Access, Bell, Advantage, Shell, Target, Express. The famous ones are already in `BUILT_IN`, which runs first. Parcel lockers were left out because their names are the retailers (Amazon, AliExpress).
- Names `BUILT_IN` measured and dropped (Halfords, NCP, DVSA) are excluded. This was the one change made after the development sets (South Lakeland and the Mint tuning half) were read.

Held out, from empty books with the merchant name only, right / wrong (`node eval/uk-card-keywords.mjs ... [--skip brand]`, `node eval/mint-labelled.mjs --set tune|held [--skip brand]`):

| set | lines | layer off | on | lines it spoke on (right) |
|---|---|---|---|---|
| South Lakeland (development) | 3,311 | 39.4% / 5.3% | 39.9% / 5.4% | 19 (16) |
| Mint, tuning half (development) | 2,159 | 57.5% / 3.8% | 59.1% / 3.8% | |
| Durham County Council (held out) | 151,437 | 28.2% / 2.8% | 29.6% / 2.9% | 2,210 (2,022) |
| Scottish Government (held out) | 11,087 | 11.8% / 6.5% | 12.3% / 7.1% | 134 (61) |
| Mint, six held-out files | 767 | 54.6% / 1.8% | 58.5% / 1.8% | |

On 63 real US exports with no labels (`node eval/brand-lines.mjs --cache DIR`, 4,927 lines out), the layer changed 48 lines from no suggestion to one, and all 48 read by eye as the right kind of place (Arby's, Cava, Peet's, Vons, Harris Teeter, Sprouts, Smashburger, Candlewood Suites, O'Reilly Auto Parts, Hobby Lobby as supplies).

Two changes came from reading held-out misses; the figures above include both, and together they moved the Durham and Scottish totals by at most 0.1 point:

- `BUILT_IN` knew "Iceland Travel" is not the grocer, and the chain list undid that. When the keywords know a chain's bare name, they now decide on the cleaned payee (`www.iceland.co.uk` is still the grocer; "Iceland Travel" gets nothing).
- The test suite's probe 6 caught "JOHN DEERE FINANCIAL" filed as supplies. A chain's name followed by "financial", "finance", "credit", "bank", "loan", "lease", "insurance" or "mortgage" now gets nothing.

In the learning loop (books filed a day at a time, first-seen merchants right / wrong):

| books | first-seen lines | card code off: layer off | on | card code on (default): layer off | on |
|---|---|---|---|---|---|
| Durham Resources | 933 | 43.1% / 24.9% | 43.3% / 25.1% | 75.3% / 20.4% | 75.3% / 20.4% |
| Durham Adult and Health Services | 306 | 52.6% / 36.9% | 52.6% / 36.9% | 75.8% / 20.6% | 75.8% / 20.6% |
| Durham Dedicated Schools Grant | 285 | 62.8% / 32.6% | 62.8% / 33.3% | 70.2% / 27.7% | 70.2% / 28.4% |
| Durham Transformation and Partnerships | 92 | 62.0% / 23.9% | 62.0% / 23.9% | 75.0% / 18.5% | 75.0% / 18.5% |
| Scottish Government, lines over £500 | 3,156 | 42.8% / 45.4% | 42.8% / 45.4% | (not run) | |
| Mint, six held-out files | 403 | 69.2% / 15.4% | 69.7% / 15.4% | | |
| YNAB, three households (`eval/ynab-registers.mjs`) | 219 | 74.9% / 11.9% | 74.4% / 12.3% | | |

The YNAB loss is two lines read after the run: "The Hampton Social" (a restaurant) matched Hampton, the hotel chain, and a payee called "Albert" matched Albert, a Czech supermarket. A first name or a surname that is also a chain was the layer's known weakness (fixed below, "Chain names that are people's names").

What it says, with care:

- **It is a first-import layer.** Once a book has filed a merchant its own memory takes over, and on card files with a merchant category code that layer places nearly every new merchant first, so the learning-loop figures barely move.
- **Where it speaks it is mostly right on the UK council and the US exports** (91.5% on Durham, 48 of 48 by eye), but the average gain is small: most lines are big names the keywords already know, or local firms no chain list has.
- **The Scottish Government's file got worse** (61 right, 73 wrong where it spoke). That file lists only lines over £500, and at that size a Malmaison, Crowne Plaza or Novotel line is a venue the government hired, filed as rent or hire, not travel. Baxter Storey, a caterer, matched Baxter, a car-service chain (26 lines). A name that is also a surname was the layer's known weakness (fixed below).
- Labels are three councils', one government's and some households'; the map from their categories to a small business's chart is a judgment.

Pinned in `brands.test.mjs` (7 tests at the time, 9 now: descriptions in the shapes real exports print, amounts made up, and the builder on a made-up index). To rebuild: the commands at the top of `brands-build.mjs`.

### Chain names that are people's names (2026-11-15, later)

The chain-name layer's two known misses were people and firms that share a chain's one-word name: "Baxter Storey", a caterer, filed as Baxter, a car-service chain (26 Scottish Government lines); "The Hampton Social", a restaurant, as Hampton, the hotel; a YNAB payee called "Albert" as the Czech grocer. Reading every line the layer spoke on turned up more of the same: "Michael's Phone" (a household's phone bill to a person) as Michaels, the craft store; "Granger Medical" as a hardware chain; "Alex Forbes & Son" as a restaurant.

The rule, set before any set was rescored: a one-word chain name that is also a person's first name, or one of the 5,000 commonest surnames, in the 1990 US Census lists (public domain; packaged by the `names` project, MIT, read at build time only) counts only when a store number follows it on the line. A chain's card line carries its store number ("KRYSTAL #0412", "O'REILLY 1938", "MICHAELS #1234"); a person or an independent firm carries another word or nothing. 72 of the 6,555 mapped names are affected (`BRAND_PERSON_NAMES` in `brands.mjs`, written by `brands-build.mjs --names`); their longer names ("Albert Heijn", "Costa Coffee", "Hyatt Place") are untouched, and Hilton, Hyatt, Costa, Ferguson and Hampton Inn are also in the built-in keywords, which run first. `skip: brand-names` turns the check off for comparison.

Every line it changed, read from empty books on the sets reachable from here (Durham's and South Lakeland's council hosts did not answer this session, so those two are not rescored):

| set | money-out lines | changed | wrong suggestion removed | right suggestion lost |
|---|---|---|---|---|
| 63 real US exports | 4,927 | 0 | | |
| Mint exports (nine files) | 4,565 | 3 | Hampton Chutney (hotel), "SANTA BARBARA" (a place, not the Santa grocer) | a bare "Michaels" (the craft store) |
| YNAB, three households | 2,234 | 8 | Michael's x3, Michael's Phone x2, Granger Medical, Albert, The Hampton Social | |
| Scottish Government, lines over £500 | 11,087 | 29 | Baxter Storey x26, Alex Forbes & Son, Alex Kirkwood & Son, O'Reilly UK Ltd (not the US auto-parts chain) | |

38 of 39 changed lines were wrong suggestions turned into no suggestion; one right one was lost. Scored against the owners' labels:

| set | before (check off) | after |
|---|---|---|
| YNAB, learning loop, first-seen payees (219) | 74.4% right / 12.3% wrong | 74.9% / 11.9% |
| YNAB, learning loop, every line (633) | 86.3% / 6.5% | 86.4% / 6.3% |
| Scottish Government, empty books (11,087 lines) | 12.3% / 7.1% | 12.3% / 6.9% |
| Mint tuning half, keywords alone, first-seen (835) | 50.5% / 2.5% | 50.4% / 2.4% |
| Mint held-out half | unchanged | unchanged |

What it says, with care: a small fix on a small layer. It takes back the whole YNAB loss the chain layer brought in (first-seen 74.9% / 11.9% is where that set stood before the layer) and most of its Scottish Government damage, at the cost of one bare chain name a budgeting app had already stripped of its store number. The name lists are American; a British or Dutch given name that is also a chain and is not on them still matches. Pinned in `brands.test.mjs` (two tests: the cases above in the shapes the files print, and the builder on a made-up index).

### Public transport from OpenStreetMap (2026-11-16)

The chain-name layer knew hotels and car hire as travel but no railway, bus company or ferry: a
first import filed "LONG ISLAND RAIL ROAD" by guessing (meals, on Hack Club's books). OpenStreetMap's
name-suggestion-index, the same pinned release 8.0.20261101, also lists the network and operator of
every bus, train, metro, tram, trolleybus and ferry route it knows (`transit/route/*`, tags `network`,
`operator` and their short and English forms). `brands-build.mjs` now adds those as travel (6120),
the account `BUILT_IN` already gives Amtrak and Uber. The rule was written from the index before any
bank line was scored:

- the chains' filters apply unchanged: at least four letters, no one-word common English word, a
  person's name only with a store number after it;
- a name must say it is transport (transit, metro, rail, bus, tram, ferry, coach, train, transport,
  shuttle, trolley, streetcar, and Verkehr, Bahn, trasporti, spoor, doprava, komunikacja), because
  NSI's network tag is often a bare place ("Renfrewshire", "Isle of Wight") or initials ("STAS",
  "CITA"), and a bank line starting with either is a council or a hotel as often as a fare. So SEPTA,
  WMATA and Greyhound are not added (Greyhound and Amtrak are in `BUILT_IN`);
- a city, county or region's name counts only when it names the service ("King County Metro"), and a
  department, ministry or public-works name never does (a payment to a DOT is a permit or a toll);
- read from the list itself: Network Rail and the Dutch "Hoofdrailnet" own track and sell no fares
  (`TRANSIT_EXCLUDE`); "ferr" was narrowed to ferry and ferrocarril after it let in "AMI Ferrara".

Result: 1,193 names added (7,819 in all), no chain name lost or re-filed, the people's-names list
unchanged. `--no-transit` rebuilds the 2026-11-15 file byte for byte. The reason a reviewer sees says
"a chain listed by OpenStreetMap as a hotel, car hire, travel agent or public transport service".

Scored with the old and the new list on every labelled set reachable from this session (layer on,
everything else unchanged):

| set | lines | before | after |
|---|---|---|---|
| Hack Club ledger, learning loop, first-seen payees (held out) | 185 | 54.1% right / 25.9% wrong | **55.1% / 25.4%** |
| Hack Club, every line | 1,241 | 89.0% / 7.7% | 89.2% / 7.6% |
| makerspace bank exports, Chase card | 16, 79 first-seen | unchanged | unchanged |
| Mint, tuning and held-out halves | 835, 403 first-seen | unchanged | unchanged |
| YNAB, three households | 219 first-seen | unchanged | unchanged |
| Scottish Government, empty books | 11,087 | unchanged | unchanged |
| 63 real US exports (no labels) | 4,927 out | 48 lines changed by the layer | the same 48 |

What it says, with care: **a small, clean gain.** The one line it changed was the Long Island Rail
Road, from a wrong meals guess to travel; it broke nothing anywhere. Fares are rare in these sets:
the Scottish file lists only lines over 500 pounds, the households' fares that are there print as
initials or fare-card names (Mint lines read "MTA" and "Clipper Service Ca") that the transport-word
rule skips on purpose,
and Toronto's and Durham's card hosts refused this session, so the sets where fares are common (a
council's or a city's card lines) were not rescored. Bolt Bus, Concord Coach Lines, United and the
Port Authority's AirTrain, among Hack Club's misses, are not in the index and were not added by hand
(Hack Club is held out). Tests: `brands.test.mjs` (13; three new: shapes card exports print, the
name filter, the builder on a made-up index).

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
covered. Scanned (image) PDFs have no text to copy; the CLI reads them by OCR
(next section).

### Scanned statements (image-only PDFs and page photos, 2026-11-14)

Some banks, and most paper statements, give a scan: a PDF with no text layer, or a
photo of the page. `import scan.pdf --account 1000` (also `.png`, `.jpg`, `.tif`)
now reads it by OCR on your own machine (`readStatementFile` in `ocr.mjs`):
`pdftoppm` draws each page at 300 dpi in grey, `tesseract --psm 6` reads it as one
block (one statement row per line), the digit look-alikes OCR leaves (`4.5O`) are
repaired, and the text goes to the pasted-statement reader above. Nothing is
uploaded. `STATEMENT_OCR_CMD` swaps in another OCR command (`myocr {file}`).

OCR misreads digits, and a statement is the rare document that carries its own
checksum, so the reading is checked against it:

- **Running balance.** When a row's amount does not take the previous balance to
  the printed one, the row is repaired only on two-sided evidence: the printed
  balance is confirmed by the next row (or the closing balance), so the amount was
  misread and becomes the balance's change; or the next row chains only from the
  previous balance plus this amount, so the printed balance was misread. A row
  whose amount OCR mangled (`1.22e,00`), leaving the balance to be read as the
  amount, is put back the same way. Each repair is printed with the old and new
  figure ("check it on the page"); the first row is never repaired against the
  opening balance alone, since the opening may be the misread figure. Pasted or
  text-layer statements are never repaired, only checked.
- **Opening to closing.** Opening plus the rows must reach the closing balance
  (`check` on the reader's result; a card statement's previous and new balance,
  where the balance is what is owed, run the other way). A miss is printed with
  the gap.
- **A second reading.** When a check still fails, the pages are read again as one
  column (`--psm 4`) and the reading with fewer faults is kept, the way a receipt
  photo is read twice.

Reader fixes found on the way, which apply to pasted text too: a card statement
with no section headings that prints payments with a minus (`PAYMENT THANK YOU
-1,238.92`) read every row as money out; now, when the header says card and no
row has a running balance, minus rows are payments and credits. A dated "Balance
brought forward" line (UK style) was not taken as the opening, so the first row's
direction was guessed. A summary line holding both balances ("Beginning balance
8,379.39 Ending balance 14,354.60") was read as an opening of 14,354.60. "New
Balance" is a closing balance.

Measured: `node eval/scanned-statements.mjs` (needs playwright, tesseract,
poppler and ImageMagick) draws 40 made-up statements in four layouts (withdrawal,
deposit and balance columns; Chase-style sections with no balance column; a card
statement, half with a previous/new balance summary; a UK current account with
day-first dates and balance brought forward), photographs them at 200 dpi,
degrades them like a scan (skew up to 1.2 degrees, seeded noise, blur, JPEG
quality 45 to 85), wraps each as an image-only PDF and reads it back. Same 40
images both ways (seed 7, tesseract 5.3.4):

| 40 scanned statements, 703 rows (same images) | one reading, no repair | repair + second reading |
|---|---|---|
| rows right (date, amount, direction) | 691 (98.3%) | 694 (98.7%) |
| wrong direction | 1 | 0 |
| wrong amount | 4 | 4 |
| rows missing | 7 | 5 |
| statements read perfectly | 32 | 36 |
| imperfect, and a balance check says so | 7 | 3 |
| imperfect and silent | 1 | 1 |

Both columns include the reader fixes above. Before them (an earlier run of the
benchmark on slightly different images: unseeded noise, and a generator bug that
printed negative balances without the minus) 27 of 40 were perfect and 8 imperfect
statements were silent: three UK statements whose first row's direction was guessed
(the brought-forward fault), one hit by the generator bug, and four where OCR lost
or mangled an amount (the card-minus fault was fixed before that run). By
layout, with every fix: sections 10 of 10 perfect, UK 9 of 10, card 9 of 10,
columns 8 of 10 (5 with one reading and no repair). A second reading ran on 9
statements and was kept on 2. The one silent miss is a card statement with no
previous/new balance, where a row went missing and nothing could tell. The 3
flagged ones lost a row or misread figures on two rows in a row, where the repair,
needing two-sided evidence, does not guess.

These are synthetic statements typeset in Arial, so they measure the route and
the checks, not accuracy on any real bank's scan, a phone photo of a curled page,
or a statement in another language; a real scanned statement is the next input
wanted. The check matters more than the reading rate: a statement whose rows do
not add up is reported, so the remaining risk is a statement that carries no
balance at all (a card statement with no summary). Not yet on the web page, which
reads text-layer PDFs only. Tests: `scanned-statement.test.mjs` (stubbed tools,
plus one real ImageMagick, pdftoppm and tesseract run when installed). OCR is
slow, about 5 s a page on 4 cores, and two tesseract processes at once on the same
cores slowed to minutes a page here (OpenMP threads competing; `OMP_THREAD_LIMIT=1`
is tesseract's advice for running several at once). Since 2026-11-18 every OCR command
the CLI runs gets `OMP_THREAD_LIMIT=1` unless your environment sets it, and a time limit
(`OCR_TIMEOUT` seconds, default 120, `0` for none), so a stalled read ends with a
message (README "OCR time limit", eval/ocr-time-limit-2026-11-18.md).

## Switching from QuickBooks or Xero

`migrate.mjs` starts these books from the files the old system exports, with nothing retyped. `cli.mjs switch chart ACCOUNT-LIST.csv` reads a QuickBooks Account List (Account, Type, Detail Type ...; the title rows above the header are skipped) or a Xero Chart of Accounts (*Code, *Name, *Type ...): an account whose name is already in the chart is matched, receivable and payable keep the codes invoices and bills post to (1100, 2050), Xero's own codes are kept when free, and the rest are added with a type and a bank flag for Bank and Credit Card accounts. A type the reader does not know is reported and the account left out. Then `switch balances TRIAL-BALANCE.csv [--date D]` maps the trial balance's account *names* to those codes and sets opening balances (`opening.mjs`); the date comes from "As of December 31, 2025" in the title rows unless given. A name not in the chart stops the import and is listed; an imbalance goes to 3000, as with `opening`.

Verification: `migrate.test.mjs` (7 tests) on hand-written files laid out from the column names those products print. No real QuickBooks or Xero export has been tried, so a layout difference (a renamed column, a localised type name) is not covered; try a real export before relying on it.

## Prepaid expenses

`prepaid.mjs` spreads an up-front payment (a year of insurance, software or rent) over the months it covers. File the bank line to Prepaid expenses (1400, now in the default chart), then register it: `cli.mjs prepaid add "State Farm policy" --amount 2400 --date 2026-03-01 --months 12 [--into 6030]`. The ledger then books one entry a month through the latest month in the books: debit the expense account (Insurance 6030 by default), credit 1400. Integer cents, the last month closes the amount exactly. `cli.mjs prepaid [--as-of D]` lists paid, expensed and still paid ahead. A close check ("prepaid") flags 1400 when the ledger and the register disagree. Test: `prepaid.test.mjs` (hand-written ledgers only; cash-basis tax treatment of prepaids, such as the 12-month rule, is for you or your preparer and is not modelled). The page has a card for it (item, first month, amount, months, expense account; register with expensed and still-paid-ahead; 2026-10-22, clicked through in headless Chromium with `eval/browser-click.mjs`: add, register totals, one-month item refused).

## Deferred revenue (money paid up front)

Added 2026-11-14. `deferred.mjs` is the prepaid register's mirror on the liability side: an annual plan, a retainer, a class pass or a support year that a customer pays for before it is delivered. File the payment (or the invoice) to **2400 Unearned revenue**, now in the default chart, then register the plan:

```
cli.mjs deferred add Annual plan --amount 1200 --start 2026-01-15 --months 12 --customer Acme   # or --end 2027-01-14
cli.mjs deferred add Retainer --amount 3000 --start 2026-03-01 --months 6 --monthly
cli.mjs deferred import plans.csv [--end-exclusive] [--monthly] [--into 4000]
cli.mjs deferred [--as-of D]                       # paid, earned, still to earn, refund owed
cli.mjs deferred waterfall [--as-of D] [--months 12] [--csv|--json]
cli.mjs deferred cancel DR-1 --date 2026-09-10 [--keep]
cli.mjs deferred refunded DR-1 --date 2026-09-20
```

- **Two methods.** *Daily* (default) earns by days of service: through any month end the amount earned is floor(cents x days served / days in the period), so a plan from 15 January earns 17/365 in January and the last month closes to the cent. *Monthly* gives each calendar month the period touches an equal share. One journal entry per month, dated at the month end (or the service end), debit 2400, credit the income account (4000 Sales by default); booked through the latest month in the books, like the prepaid register.
- **Cancellation.** `cancel` stops earning on the date (a monthly plan earns the part month by its days); the rest is a refund owed until `refunded` records it paid, or with `--keep` is earned that day.
- **Waterfall.** What is still to be earned in each month ahead, with the split a balance sheet needs: earned in the next twelve months (current) and after (long term). Refunds owed on cancelled plans are reported apart, not as revenue to come.
- **CSV import** matches headers by name: name/description/product/plan, amount/total/price, start/period start, end/period end or months/term, and optional customer, date (received), account and method. "(UTC)" suffixes are ignored. `--end-exclusive` takes a day off ends written as the next anniversary. Bad rows are skipped with their line number.
- **Close check** ("deferred"): 2400 in the ledger must equal the register's still-to-earn plus refunds owed; it names a payment with no plan, a plan with no payment, or a refund paid but not recorded.
- **Cash method.** `cashBasis` drops the monthly earning entries and counts each plan in full on the day received (a refund of a cancelled plan is not taken off there; noted in the report).
- **Page.** A "money paid up front" card: add one plan, paste a CSV, cancel from the register, and a twelve-month waterfall table. Guide page: `deferred-revenue-schedule.html` (a synthetic three-plan example whose every figure is pinned by a test).

Verification: `deferred.test.mjs` (16 tests: cents close exactly for 1-36 months and both methods, booking and a balanced trial balance, the close check both ways, cancel with refund and with keep, a monthly part-month cancel, the waterfall's current/long-term split, CSV import with a bad row, an invoice filed to 2400, the cash method, refusals, the guide page's numbers, the waterfall CSV's formula guard) and `eval/browser-click.mjs` (add, register, waterfall drawn, cancel leaves a refund owed, zero months refused; headless Chromium, 2026-11-14). Hand-made plans only; no real subscription export has been read, and bundles, set-up fees and variable pricing (ASC 606 / IFRS 15) are not modelled.

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

`loans.mjs` (2026-10-22): a fixed-rate, monthly, equal-payment loan. `cli.mjs loan add Van --amount 20000 --rate 6 --months 36 --first 2026-02-01` computes the level payment (608.44, the textbook figure, checked in the test) and the schedule; `loan apply LN-1` splits each unfiled bank outflow that equals a scheduled payment, within 5 days of its due date, into interest (6040) and principal (2200) as an ordinary split, so no one types the split each month; `loan` lists balance by schedule and the next payment; `loan LN-1` prints the schedule. Interest is balance x rate / 12 rounded to the cent, and the last payment clears the balance. Extra principal (2026-10-22): `loan extra LN-1 --amount 2000 --date 2026-06-10` records a prepayment; it comes off the balance after the last instalment on or before its date, the same payment then clears the loan sooner (the schedule has fewer rows and less interest), and `loan apply` files the matching bank outflow to 2200 (`loans.test.mjs`, hand-written case: 20,000 at 6% over 36 months with 2,000 extra in June ends early; no lender's real prepayment statement compared). Not modelled: balloon, interest-only periods, variable rates, day-count interest, prepayment penalties, and a lender's own schedule may differ by cents (use `--payment` to match its payment). `loan check LN-1 lender.csv` (2026-10-23, `checkLenderSchedule`) compares a lender's own amortization table (header row with date, payment, interest, principal, balance in any order) with the computed schedule row by row, prints the rows that differ by more than 2 cents and a plain-words guess: rounding only, a different payment (and the `--payment` to re-add the loan with), interest off from the first row (day-count or rate), or agreement through payment N then a fee, rate change or extra payment. It never edits the loan. Tested on tables derived from the schedule itself with one deliberate change each (`loans.test.mjs`); no lender's real table tried. **Lenders that round the payment up (2026-11-15).** On LendingClub's public loan book (466,285 real loans, 2007-2014) the payment rounded to the nearest cent was LendingClub's own on only 50.2%; rounded up to the next cent it was LendingClub's on 98.6%, and on 445,325 of 445,471 (99.97%) issued 2011-2014. `loan add ... --round up` (on the page: "Payment rounded: up to the next cent") takes the lender's rounding, so the schedule's balances and smaller last payment match and `loan apply` finds the bank line of the real amount; `loan check` now says "the lender rounds the payment up" when a pasted schedule is a cent higher every month, where before the cent sat inside the tolerance and only the later balance drift was flagged, as a supposed fee. Payments only: no full month-by-month table was compared (`eval/lendingclub-loans-2026-11-15.md`, `loan-rounding.test.mjs`). Tested with hand-written statements (`loans.test.mjs`); no lender's real schedule compared. The page has a loans card (terms form, register, a button that splits matching bank payments; 2026-10-22, clicked through in headless Chromium with `eval/browser-click.mjs`: add, register, nothing to split, bad rate refused).

## Payroll runs (US)

`payroll.mjs` (2026-10-22): a payroll provider's pay-run report (Gusto, ADP, Paychex, Square Payroll and similar; company totals or one row per employee, grouped by pay date; columns matched by name: pay date, gross, net, federal income tax, social security and medicare withheld, state tax, other deductions, employer social security and medicare, FUTA, SUTA) becomes books. `payroll FILE.csv` books each run (Dr Wages 6150 for gross, Dr Payroll taxes and benefits 6155, added on first use, for the employer's share, Cr Payroll liabilities 2300 for both) and finds the bank outflows that paid it: net pay (3 days before to 5 after the pay date), the federal deposit (withheld tax plus both FICA shares, within 45 days; a month's runs paid as one deposit are matched against the month's sum) and state withholding. `--apply` files the unambiguous lines to 2300, so 2300 shows what is still owed. A row whose net pay is not gross less deductions is refused and named; the same report twice changes nothing. `payroll` lists runs and what is still owed; `payroll 940 2026` prints a Form 940 worksheet (2026-10-22: FUTA wages capped at $7,000 per employee at the 0.6% net rate, per-employee check, quarterly deposit carry over $500; hand-made registers, state credit reduction not modelled); `payroll w2 2026` (2026-10-22) sums each employee's year into W-2 boxes 1 to 6 and the state tax, box 3 capped at the wage base, warning when other deductions may be pre-tax (box 1) or box 4 is off 6.2%; registers imported before this change lack per-employee withholding and need re-importing; hand-made fixtures only. `payroll 941 2026 1` prints a Form 941 worksheet from the register (wages, income tax withheld, both shares of social security and medicare) and warns when a run's FICA is off 6.2% / 1.45% by more than a cent per employee. With one row per employee it applies the year's Social Security wage base (2023-2026 built in) to each person's year-to-date wages, so tax that should have stopped, or a taxable-wage line 5a figure, is checked per employee (2026-10-22, hand-made registers). Also per employee (2026-10-22): the 0.9% Additional Medicare Tax on wages over $200,000 in the year, withheld from the employee only, is checked (a missing one or one charged to the employer is flagged) and the 941 worksheet prints line 5d. A provider's trailing "Total" row is skipped (it would double every run) and a pay date printed only on a group's first row fills down (2026-10-23, from the habit of such exports, not a sampled file). Tested with hand-written registers (`payroll.test.mjs`, 8 pass) and run through the CLI; no real provider export has been tried, and tips, state unemployment wage bases and the 941 adjustments are not modelled. `payroll 940 2025 --state CA` (2026-10-22) adds the FUTA state credit reduction on taxable wages (California 2025, 1.2%, from the November 2025 DOL announcement as reported by Bloomberg Tax, UHY and EY; other states or years: `--credit-reduction PCT` from the DOL list; the Benefit Cost Rate add-on is not modelled). `payroll deposits 2026 [--schedule monthly|semiweekly]` (2026-10-22, `deposits.mjs`, 6 tests on hand-made registers) works out the Publication 15 deposit schedule (lookback July 1 to June 30 against $50,000, the $100,000 next-day rule, monthly 15th, semiweekly Wednesday/Friday as the third business day, weekend and federal-holiday rollover, the $2,500 quarterly de minimis), then uses the bank-line matching to say whether each deposit was on time or late, with the 2/5/10% penalty tier as an estimate. `payroll 941 YEAR Q --schedule-b` (2026-10-22) also prints Schedule B: the quarter's liability by day of month the wages were paid, with each month's total (hand-made registers). `payroll reconcile 2026` (2026-10-22) ties the four quarters' Form 941 figures to the W-2 totals a W-3 would carry (wages, income tax, social security wages and tax, Medicare wages and tax) and names any that differ beyond a cent per person-run; hand-made registers only. Not payroll or tax advice. The page has a card for it too (2026-10-22: book the runs, post the matched bank lines, Form 941 worksheet; wired and tested for ids and imports, not driven in a browser).

### Payroll property test (2026-10-27)

`payroll-property.test.mjs`: 150 seeded random per-employee years (1 to 4 people, 2023 to 2026, pay up to $40,000 a run so the wage base bites) checked for: the four 941 quarters sum to the register's gross, W-2 box 1 equals each person's gross, box 3 never passes the wage base, 940 FUTA wages never pass $7,000 a person with no warnings, and the 941 to W-2 tie-out is clean. It found no fault; it guards the three worksheets against later edits. Made-up data only.

### Form 1099-K against the payout report and the books (2026-10-23)

A processor's 1099-K reports gross payments (before refunds and fees, sales tax included), while the books carry income net of both, so they never agree and the gap is what a notice asks about. `form1099k FILE.csv --year 2026 --gross 94000.00 [--months J,F,...,D] [--sales 4000]` (`form1099k.mjs`, `reconcile1099K(report, {gross, months}, year, books)`) lays out the bridge: gross the report shows for the year, box 1a, the gap, refunds and fees the form does not net, optional boxes 5a-5l month by month (a typo in their sum is caught), and what account 4000 should hold if every payout was split (gross less refunds). Notes name likely causes: export range, UTC year boundaries, unsplit payouts, a form that looks netted. `node --test ventures/ai-bookkeeper/form1099k.test.mjs`, 5 pass, on hand-written reports; no real 1099-K was tried, and the IRS thresholds and reportable-transaction rules change by year, so check the instructions for the year. No page card yet; a worked-example page, `form-1099-k-reconciliation.html` (2026-10-23), walks the stripe-payouts fixture from box 1a ($940.00) to sales ($850.00) to deposits ($708.00), pinned by a test.

### Payroll header probe (2026-10-23)

Ten hand-written provider-style headers found five faults in `readPayrollRegister`, all fixed (`payroll.test.mjs`, 24 pass): a title or period block above the header row made the file unreadable; a report listing kinds of pay (regular, overtime, bonus) with no gross column was refused (they now add up to gross); `Social Security (EE)`, `Medicare (ER)`, `...Tax` and `Withholding Tax` header spellings went unmatched; two columns feeding one field (a 401(k) and a health plan) kept only the last, so net pay failed to tie; `Last Name` and `First Name` columns gave no employee, so W-2 rows were lost. A reversal row (negative gross) now says so instead of reporting a net-pay mismatch. Layouts are recalled, not sampled from real exports. Landed after: `Additional Medicare` as its own column adds to Medicare withheld; a single `Total Employee Taxes` column (no split) is now read by taking Social Security at 6.2% and Medicare at 1.45% of gross and booking the rest as federal income tax, with a `notes` entry saying so (`payroll.test.mjs`, 26 pass, hand-written headers). The split is a guess when pre-tax benefits or the wage base apply, so prefer a report with split columns.

### A payroll journal with contractors, reimbursements and one employer-tax total (2026-11-14)

The open payroll item wants a real Gusto or ADP report, and none is reachable from a cloud session. The nearest thing on GitHub was a public, redacted test fixture of a Gusto-style "Payroll Journal" (a title row, then one row per worker per check date, with `Employee type`, `Employee taxes`, `Employer taxes`, `Employer benefits`, `Reimbursements`, `Net pay` and a `Totals` row). Its names are made up, so it is a layout, not a company's books. Run through `readPayrollRegister`, it found three faults; the `Totals` row and the title row were already handled:

1. **A 1099 contractor's pay was booked as W-2 wages.** It went into gross wages, the Form 941 and W-2 figures and the employee count. Rows whose worker type says `1099`, `contractor` or `freelance` are now contract labor (6020, added to the chart if missing), kept on the run as `contract` and `contractors`, and left out of wages, Forms 941, 940 and W-2. A contractor row with tax withheld or employer tax is refused and named, not guessed.
2. **Any employee whose check carried a reimbursement was dropped.** Net pay did not equal gross less taxes, so the row failed the tie-out and its wages disappeared from the books. A `Reimbursements` column now counts in that check. It is booked to 9999 (ask my accountant), with a note to move each one to the expense it repaid. It is not wages.
3. **The `Employer taxes` total was ignored.** No employer cost was booked unless the report split it into social security, Medicare, FUTA and SUTA. With only the total, 6.2% and 1.45% of gross go to employer social security and Medicare and the rest to unemployment tax, with a note. The 941 worksheet then shows the employer half, and the 940 worksheet still recomputes FUTA from wages. Separate columns, when present, win.

The bank match learnt the two ways a provider pays contractors: as their own debit, or inside one debit with net pay. `payrollSummary` counts both in what 2300 owes. Tests: `payroll-journal.test.mjs` (6, hand-written rows in that layout); all 35 payroll tests pass. Not claimed: no real company's journal has been read. Contractors paid through payroll are not in this tool's 1099 list, which reads bank lines; the provider usually files those 1099-NECs itself.

### A Gusto-style payroll journal with the pay day above the table (2026-11-15)

A second public layout, again a test fixture rather than a company's books: 85 weekly "Payroll Journal Report" CSVs (github.com/mc30ski/seedlings3, `apps/api/prisma/fixtures/payroll/`, no licence, so read from a sparse clone and not copied here; three made-up workers at a North Carolina lawn-care firm, August to November 2026). Each file has a title, the company's address, a `"Pay day"," 08/31/2026"` line, then one row per employee and a `Payroll Totals` row. Every tax has its own column with the side in brackets: `Federal Income Tax (Employee)`, `FUTA (Employer)`, `NC State Tax (Employee)`, `NC Unemployment Tax (Employer)`, next to `Employee Taxes` and `Employer Taxes` totals; `Net Pay` comes before `Reimbursements`, `Donations` and `Check Amount`.

Before this change `payroll FILE.csv` refused all 85 files ("needs a pay date column"). Four faults, all fixed:

1. **The pay date is printed once, above the table.** When no row has both a date and net pay column, the header is the first row with gross (or kinds of pay) and net pay, and a two-cell `Pay day` / `Pay date` / `Check date` line above it dates every row, with a note.
2. **Columns named with the side in brackets, or with a state in front, were not read.** A header ending `(Employee)` or `(Employer)` is now matched on the rest of its name and its side (`FUTA (Employer)` is FUTA, `Additional Medicare (Employee)` is Medicare withheld). A state-prefixed tax withheld (`NC State Tax`, `CA SDI (Employee)`) is state and local withholding; a state unemployment column (`NC Unemployment Tax (Employer)`, `CA SUI`, `CA ETT`) is SUTA; another employer-only tax is other employer cost. Without this, state tax was missed, net pay failed its tie-out and every row was left out; FUTA and SUTA would have been lost from the employer's cost.
3. **The `Payroll Totals` row would have counted as a fourth employee.** The total-row check looked only at an `Employee` column; it now also reads `Last Name`, `First Name` and the date, and knows `Payroll`, `Company`, `Report` and `Run Totals`.
4. **Net pay before reimbursements and donations.** When a `Check Amount` column exists and equals net pay plus reimbursements less donations, the check is what the bank shows, so it is the net pay matched, and donations count as a deduction.

Two cross-checks came with it, so an unknown column cannot slip through quietly: when a report prints both `Employee Taxes` and the taxes one by one, they must agree to the cent or the row is refused and named; when `Employer Taxes` exceeds the employer columns read, the gap is booked as other employer cost (6155) with a note, so the expense still matches the provider's total.

Measured (`node eval/payroll-journal-report.mjs DIR`, which scores each booked run against the file's own `Payroll Totals` row, a row the reader skips): 85 of 85 files read, 85 runs, 255 employee rows, no problems, and 0 mismatches on gross, net, federal, Social Security and Medicare (both sides), state tax, FUTA, SUTA and total employer taxes. Booked together, the Form 941 worksheet gives Q3 2026 wages $73,441.20 over 54 runs and Q4 $43,047.00 over 31, with no 6.2% / 1.45% warnings, and the W-2 summary three employees with no warnings. Tests: `payroll-journal-report.test.mjs` (6, made-up rows in this layout, plus CA SDI, SUI and ETT columns); all payroll tests pass.

Not claimed: these files were written by another project's fixture generator in a Gusto-like layout, not exported from Gusto, so they show the reader handles the layout and adds up; they say nothing about a real company's payroll. Tips (`Paycheck Tips`) are inside gross wages here and are not split out on the 941 worksheet (lines 5b and 5f are not modelled). A multi-section journal (contractor payments in their own block) has not been seen.

## Not modelled

Payroll filings (runs are booked, see below, but no filing, wage bases or state rules) and sales tax filings, inventory across several locations or with serial numbers (single-location stock is below), foreign-currency invoices and bills are modelled (see below, 2026-10-22; a credit note in the invoice's own foreign currency is applied in that currency, 2026-10-26; an instalment plan on a foreign invoice closes on the last payment within 10%, 2026-10-26) (foreign bank accounts too; the VAT worksheet is UK-layout, invoice basis). A statement PDF with a text layer is read by `import FILE.pdf` through pdftotext, and on the page by `pdftext.mjs`; a scanned (image-only) one, or a photo of a page, is read by OCR in the CLI (see "Scanned statements" below; not yet on the page). Receipts can be a PDF or a photo (see below).

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
everything is filed plainly). A bank line that pays several receipts at once (matched as a
group) is split by every receipt's items together, from any of its receipt
ids; when one of them has no usable item lines the split is refused (fixed
2026-11-15: before, the other receipts' totals were posted as a "tip" on one
account). `--fix WORD=CODE` (repeatable) places any item whose words contain WORD; items placed by `--fix` or `--other` are learned under their own words on `--apply`, so the next receipt with them needs no flag (hand-written receipts only; CLI, not the page). The page shows a "Split by items" button under the matched table when a receipt's items fall in two or more accounts (clicked through in headless Chromium). Tried on hand-written receipts only, no real ones,
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

### Receipt photos from a phone (CORD through tesseract.js, 2026-11-12)

Flagship item (5), "next: phone photos". CORD-v2's 200 validation and test
images are real phone photos of Indonesian shop and restaurant receipts
(shadows, tilt, table showing at the edges, about 150 to 250 dpi by
tesseract's estimate). The text in `eval/cord/*.jsonl` is the annotators'
hand-corrected word boxes, so until now CORD tested the reader on a perfect
transcription. This time the page's own engine read the photos:
`eval/cord_images.py` writes the photos out of CORD's parquet files (fetched
at run time from Hugging Face, revision `7f0115a4`, never copied here), and
`eval/sroie-tesseractjs.mjs` (which now reads any folder of `.jpg`/`.png`)
reads each in both modes with tesseract.js 5.1.1 and the page's English
model. `eval/cord-receipts.mjs --ocr <dir>[,<dir2>] [--settled]` scores the
OCR text instead of the hand-corrected text, and with `--settled` counts
whether the page's status line warned about each wrong total.

What it found, before any change (the page as it stood):

| CORD photos through tesseract.js | Hand-corrected text | Block mode | Column mode | Page (both, settled) | Wrong totals with no warning |
|---|---|---|---|---|---|
| validation, 98 labelled | 96 (98.0%) | 51 (52.0%) | 22 (22.4%) | 52 (53.1%), wrong 38 | 38 |
| test, 95 labelled | 90 (94.7%) | 45 (47.4%) | 24 (24.2%) | 45 (47.4%), wrong 40 | 39 |

So on phone photos the reader loses about 45 points to OCR, and the worse
part is that about 40% of totals came back **wrong and unflagged**. Reading
the validation misses: 28 of 39 wrong totals had no total line at all (OCR
lost the word `TOTAL`), and the fallback took the largest amount on the page,
which is usually the cash handed over; with a total line found, the total was
right 46 times in 54. Some photos read as noise throughout; nothing in the
text can recover those.

Three changes, written looking only at validation misses, then scored once on
test:

- **Split groups joined** (`joinSplitGroups` in `receipts.mjs`): on a
  whole-unit receipt, OCR prints `25 000`, `308. 000`, `304 ,326`; the
  reader took `25` or `308`. A number followed by exactly three digits that
  end it is joined; a lone `Table 12`, `100%` or `2 100,000` is left alone.
- **Total, cash, change** (`totalCashChange`): with no total line, three
  amount lines in a row where the second less the third is exactly the first
  (`45,500 / 50,000 / 4,500`, the words lost) give the first as the total. On
  a whole-unit slip amounts under 100 are left out: OCR noise (`5`, `2`, `3`)
  closed the sum by chance 4 times in 7 before that floor.
- **A guessed total says so** (`guessedTotal` in `photoocr.mjs`, added to
  `settleReadings`' note): when a photo's text has no total line and the
  total is only the largest amount, or there is none, the status line says
  "no total line found in the photo; X is only the largest amount on it: check
  the total".

| After | Hand-corrected text | Page (both, settled) | Warned on wrong / right | Wrong with no warning |
|---|---|---|---|---|
| validation (tuned on) | 96 (98.0%) | 61 (62.2%), wrong 29 | 19 / 11 | 10 |
| **test (held out)** | **92 (96.8%)** | **48 (50.5%), wrong 37** | 25 / 9 | **12** |

On the held-out photos the page reads 3 more totals right (45 to 48) and, the
part that matters for books, wrong totals shown with no warning fall from 39
to 12; the warning also fires on 9 right totals, which a person then confirms.
The same rules lift the hand-corrected text too (test 90 to 92, train 742 to
749 of 779, validation tax 45 to 46; `cord-receipts.test.mjs` pins the new
numbers) and SROIE: hand-corrected 609 to 611 of 625, tesseract.js block mode
490 to 495, the page's settled reading 499 (79.8%) to **505 (80.8%)**. The
"before" SROIE figures reproduce the section above exactly.

Tried and not kept: upscaling the photo 2x, greyscale with autocontrast, and
both, before OCR (Pillow, the same steps a page canvas can do), on
validation: 46.9%, 52.0% and 52.0% in block mode against 52.0% untouched. The
loss on these photos is not resolution or contrast that a simple filter fixes.

Limits: one country's receipts (rupiah, Indonesian words), merchant names and
dates masked in CORD so only totals and tax are scored, tesseract.js's
English model only, and 100 held-out photos (one receipt is a point). A
crumpled US thermal receipt photographed in poor light is still untried.
Reproduce:

```
python3 -m venv v && v/bin/pip install pyarrow
curl -LO https://huggingface.co/datasets/naver-clova-ix/cord-v2/resolve/7f0115a4/data/test-00000-of-00001-9c204eb3f4e11791.parquet
v/bin/python -I eval/cord_images.py test-00000-of-00001-9c204eb3f4e11791.parquet test photos
node eval/sroie-tesseractjs.mjs photos ocr <folder>/node_modules 4      # about 45 s per 100 photos on 4 cores
node eval/cord-receipts.mjs eval/cord/test.jsonl --ocr ocr/psm6,ocr/psm4 --settled
```

### US receipt photos (ExpressExpense SRD, 2026-11-12)

Flagship item (5), "next: a US thermal photo". ExpressExpense gives away 200
receipt photos as a free OCR dataset (the "large receipt image dataset", SRD):
US restaurant, fast-food and shop receipts on thermal paper, held in a hand or
laid on a table and taken with a phone, 750 x 1000 pixels or smaller, curled,
creased, faded, some with handwritten tips. 187 are in dollars; 13 are from
Europe, Canada, India, the UK, Malaysia and the UAE. `eval/srd-fetch.mjs`
fetches them at run time from a public MIT-licensed GitHub copy pinned to one
commit; they are never committed here.

**The labels were read by eye**, by four agent sessions working from the
photos alone (no OCR text in front of them), 50 photos each, to a written
brief: the last machine-printed amount charged (never a handwritten tip or
total), the printed subtotal and tax. They are in `eval/srd/labels.jsonl`
with a note on every judgement call. Checks: on 172 receipts with a subtotal
and tax, 146 add up exactly and every one of the other 26 has a printed reason
(service charge, printed tip, discount, a void, a split check); three labels
checked again by a fourth reader all matched. Two photos are duplicates
(`duplicate_of`) and two totals are unreadable (cut off, too blurred), so 196
totals are scored. Labels made this way can still hold a misread digit; the
misses are scored as they stand.

What the page did with them (tesseract.js 5.1.1, the page's model, both modes,
settled as the page settles them):

| SRD, 196 labelled totals | Total right | Wrong, page warned | Wrong, no warning | No total |
|---|---|---|---|---|
| block mode (`6`) alone | 116 (59.2%) | | | 7 |
| the page before: two readings | 119 (60.7%) | 65 | 8 | 4 |
| **the page now: four readings, vote** | **134 (68.4%)** | 57 | **3** | 2 |

Tax was right on 79 of 185 before and after: on these photos the tax line is
usually lost with the total line, not misparsed.

What goes wrong is OCR, not the reader. On the even-numbered half, 40
totals were wrong with two readings, and the right amount appeared anywhere in
either reading's text on only 7 of them. The big double-height `TOTAL` line
that US point-of-sale printers use is the line tesseract loses most often, and
the bottom of a curled receipt often reads as noise. Changing the reader's
rules could fix at most those 7 (one tried rule, preferring a reading with a
total line over one that guessed the largest amount, fixed one and broke one:
on a receipt with a printed tip the largest amount was the real total; not
shipped).

What helped was reading more. A grey copy of the photo at twice the size,
read in both modes, finds the total on many photos where the original does
not: any of the four readings had the right total on 146 of 196, against 126
for the original's two. Binarising (ImageMagick `-lat`, at either size) did
worse than the plain photo (56.6% and 57.6% on the even half) and is not used.

- **Four readings** (`PASSES` and `greyCopy` in `photoocr.mjs`): a photo
  under 2,000 pixels on its long side is also drawn on a canvas at 2,000,
  grey, and read in both modes. A larger photo (a full-size phone photo) is
  read twice as before; enlarging was measured only on small photos. The
  status line says how many readings were made. Reading takes about twice as
  long for a small photo.
- **A vote between them** (`voteTotal` in `receipts.mjs`, used by
  `parseReceiptPasses` only with three or more readings): each value scores
  one point per kind of arithmetic check that gives it (cash less change,
  subtotal plus tax, the items), one per reading that read it, and one more
  per reading that printed it on a total line; a tie goes to the earlier
  reading. With two readings the old rule stands unchanged, so the CLI's `--two-pass`
  and the hand-corrected CORD and SROIE box-text scores are unaffected.

The weights were chosen on the even-numbered photos (two readings 59 of 99,
four with the vote 68; enlarged with ImageMagick) and scored once on the odd
ones (60 to 66 of 97). The table above is the page exactly: the grey copies
drawn by Chromium's canvas with `greyCopy`'s settings
(`eval/srd-canvas-grow.mjs`), 67 of 99 on the even half and 67 of 97 on the
held-out odd half. One photo is already 2,000 pixels tall and is read twice.

**The scans got better too, not worse.** 437 of SROIE's 626 scans are under
2,000 pixels, so the page now reads them four times as well. Same engine, grey
copies drawn by the canvas script: the two-reading page reproduced its earlier
505 of 625 (80.8%) exactly, and the four-reading page reads **521 (83.4%)**
right (wrong 112 to 96). Merchant and date are unchanged, except that 2 merchants
another reading found are wrong. These scans were not looked at when the
weights were chosen, so this is a second held-out check.

Not measured then: CORD's phone photos with four readings (Hugging Face, where
they are fetched from, did not answer from this session); full-size 12
megapixel phone photos. Both were measured on 2026-11-15 ("Full-size photos" below). The CLI reads four times with `--four-pass` since
2026-11-14 (next section). Reproduce: `node eval/srd-fetch.mjs <photos>`, `node
eval/sroie-tesseractjs.mjs <photos> <ocr> <node_modules>`, `node
eval/srd-canvas-grow.mjs <photos> <grown>`, `node eval/sroie-tesseractjs.mjs
<grown> <ocr2> <node_modules>`, then `node eval/cord-receipts.mjs
eval/srd/labels.jsonl --ocr <ocr>/psm6,<ocr>/psm4,<ocr2>/psm6,<ocr2>/psm4
--settled` (a photo with no grown copy needs empty files in `<ocr2>`). Tests:
`photoocr.test.mjs` (11), `receipt-crosscheck.test.mjs` (12, text written
here); `node eval/photo-ocr-browser.mjs` shows four readings in headless
Chromium (6/6).

### The CLI reads a photo four times too (2026-11-14)

The page's four readings and vote ("US receipt photos" above) were the page's
alone: the CLI, which calls the tesseract binary, still read a photo at most twice.
`receipts photo.jpg --four-pass` now does what the page does: tesseract `--psm 6`
and `--psm 4` on the photo, then on a grey copy enlarged so its long side is
2,000 pixels (ImageMagick: `-colorspace Gray -resize 2000x2000`, `greyCopyFile` in
`ocr.mjs`), and `parseReceiptPasses` votes. A photo already 2,000 pixels or more is
read twice; with no ImageMagick on the machine it is read twice and nothing fails.
The vote's weights are unchanged (chosen on the page's even-numbered SRD photos);
nothing was tuned on this run.

Measured with the tesseract 5.3.4 binary (Ubuntu's `tesseract-ocr`), one thread per
process, labels as above (`eval/srd-cli.mjs` writes the four readings,
`eval/cord-receipts.mjs` and `eval/sroie-receipts.mjs` score them):

| totals right | one reading (`--psm 6`) | `--two-pass` | `--four-pass` |
|---|---|---|---|
| SRD US photos, all 196 | 112 (57.1%) | 113 (57.7%) | **131 (66.8%)** |
| SRD even half (where the vote's weights were chosen) | | 55 of 99 | 65 of 99 |
| SRD odd half (held out) | | 58 of 97 (59.8%) | **66 of 97 (68.0%)** |
| SROIE scans, 625 (434 get a grey copy) | 484 (77.4%) | 492 (78.7%) | **503 (80.5%)** |

On SRD, wrong totals fall from 76 to 62 and missing ones from 7 to 3. On SROIE,
wrong falls from 126 to 115; merchant and date are the same reading as before (one
merchant another reading found is wrong). The native binary lands within two points
of the page's tesseract.js on the same photos (page: 68.4% SRD, 83.4% SROIE): the
engines differ, not the reader. Tax on SRD is unchanged (73 to 74 of 185): the tax
line is lost with the total line.

**A damaged JPEG no longer stops the CLI.** SROIE scan 427 is a 4961 x 7016 JPEG with
a bad Huffman code; tesseract's image library refuses it ("jpeg: no pix returned")
and the CLI used to stop with "tesseract is needed", which was wrong. ImageMagick
salvages it, so a photo tesseract cannot open is now read again from a PNG copy
(`imageCopyFile`), and if that fails too the error quotes tesseract's own message.

Cost: four tesseract runs instead of two on a small photo, about 2.6 s on four cores
for a 750 x 1000 photo. `--two-pass` and the default single reading are unchanged.
Reproduce: `node eval/srd-fetch.mjs <photos>`, `node eval/srd-cli.mjs <photos> <out>
[k/n]` (shards for parallel runs; set `OMP_THREAD_LIMIT=1`), then `node
eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr <out>/psm6,<out>/psm4,<out>/g6,<out>/g4`;
for SROIE point `eval/srd-cli.mjs` at `<clone>/data/img` and score with `node
eval/sroie-receipts.mjs <clone>/data --ocr` and the same four folders. Tests:
`receipt-crosscheck.test.mjs` (14, two new: the four-pass calls and the damaged-JPEG retry).

### Full-size photos: a grey copy shrunk to 2,000 px, read first (2026-11-15)

Flagship item (5), "next: full-size photos". Until today a photo 2,000 pixels or more
on its long side (a phone's own 12 megapixel photo, a flatbed scan) was read only
twice, as it is. It now gets the same grey copy as a small photo, shrunk to 2,000 px
instead of enlarged, and the copy's two readings go **first**, ahead of the photo's.
The first reading is the one the receipt box shows and the one merchant and date
come from, and the vote's ties go to it. Page (`greyCopy` and `readPhotos` in
`photoocr.mjs`) and CLI (`--four-pass`, `greyCopyFile` in `ocr.mjs`) do the same.

Measured on SROIE's 189 scans over 2,000 px (flatbed scans, up to 4961 x 7016),
with the labels as before:

| 189 large SROIE scans | total right | date right (of 188) | merchant exact |
|---|---|---|---|
| CLI (tesseract 5.3.4), the photo twice (before) | 144 | 149 | 93 |
| CLI, photo first, then the shrunk copy | 152 | 150 | 94 |
| CLI, the shrunk copy alone, twice | 156 | 152 | 94 |
| **CLI now: shrunk copy first, then the photo** | **155** | **152** | **94** |
| page (tesseract.js 5.1.1), the photo twice (before) | 151 | 154 | 92 |
| page, photo first, then the canvas copy | 156 | 155 | 92 |
| **page now: canvas copy first, then the photo** | **160** | 154 | **95** |

The order was chosen on these 189 scans, so they are not a held-out test. The held-out
check is CORD's 17 test photos over 2,000 px (real Indonesian phone photos, 2304 x 4096
and 1836 x 3264, never looked at when choosing): 7 right before and 8 after, in either
order. That is one receipt, so it says little more than "no harm".

End to end, through the CLI's own code on every photo (`eval/srd-cli.mjs`):

| totals right, CLI `--four-pass` | before | now |
|---|---|---|
| SROIE, all 625 labelled scans | 503 (80.5%) | **514 (82.2%)** |
| CORD test, 95 phone photos with a total | 47 (49.5%) | **48 (50.5%)** |
| SRD US photos, 196 | 131 (66.8%) | 131 (66.8%) |

SROIE dates went from 490 to 493 of 611 and merchants from 287 to 288. SRD has one
full-size photo (3024 x 4032); its total was right before and is right now. The page's
full SROIE score, assuming the 437 smaller scans read as before (their code path did not
change): 521 + 9 = **530 of 625 (84.8%)**. Cost, CLI, one thread: on the largest scan
(4961 x 7016) one tesseract pass on the photo takes 2.3 s, making the copy 1.8 s and each
pass on it 0.5 s, so the four readings take about 7.6 s against 4.6 s for two.

**CORD's phone photos read four times, measured for the first time** (Hugging Face
answered today): the CLI's one reading gets 44 of 95 totals right, `--four-pass` 47
before today's change and 48 after.

**What did not help, kept so later runs need not try it again:**

- *More image variants.* On SRD the right total already appears somewhere in the four
  readings' text on 153 of 196 photos; the vote picks it on 131. Adding a fifth and sixth
  reading of another copy raised that ceiling by only 2 to 6 receipts: 3,000 px (+3),
  flattened lighting by dividing by a blur (+2 to +3; read alone, 36 of 196), sharpened and
  normalised (+5), deskewed (+4), the bottom 55% enlarged (+6). None was built: a pass costs
  as much as the others and the vote would have to find those few.
- *Two vote rules from the 22 receipts where the total was read but not picked.* (a) A
  reading taken as whole units ("8262", "190275" on a dollar receipt: 60 such readings on
  SRD, none right) sits out when at least half the readings use decimals: SRD 131 to 131,
  CORD 47 to 46. Not shipped. (b) A value whose digits end another's ("4.78" beside
  "94.78") lends its votes to the longer one: SRD 131 to 128. Not shipped. Both rules were
  written after looking at all 196 SRD misses, so SRD was not a fair test for them; they
  failed anyway.

Reproduce: `git clone --depth 1 https://github.com/zzzDavid/ICDAR-2019-SROIE`, then
`node eval/srd-cli.mjs <clone>/data/img <out> [k/n]` (for a photo over 2,000 px it writes
the shrunk copy's readings to `psm6`/`psm4` and the photo's to `g6`/`g4`, in reading
order) and `node eval/sroie-receipts.mjs <clone>/data --ocr
<out>/psm6,<out>/psm4,<out>/g6,<out>/g4`. For the page, `node eval/srd-canvas-grow.mjs
<photos> <grey>` now draws shrunk copies too (`--grow-only` for the old behaviour), then
`node eval/sroie-tesseractjs.mjs` on both folders and `--settled` scoring with the copy's
folders first. Numbers and commands: [`eval/full-size-photos-2026-11-15.md`](eval/full-size-photos-2026-11-15.md).
Tests: `receipt-crosscheck.test.mjs` (the four-pass test now checks a big photo's four
readings and their order) and `photoocr.test.mjs` (12, one new: a shrunk copy's reading
leads the block). `node eval/photo-ocr-browser.mjs` in headless Chromium: 6/6.

### Shaded photos: a local threshold, chosen per photo (2026-11-15)

Flagship item (5), "next: curled slips". Tesseract turns a photo into black and white
before reading it, with one threshold for the whole image (Otsu). On a phone photo with a
shadow across the slip, a dim room or a slip held in the hand, that one threshold loses
the print on the dark side. Tesseract 5 also has Sauvola's method, a threshold set from
each pixel's neighbourhood (`thresholding_method=2`, a parameter in tesseract.js and the
binary alike: no image work, nothing more to download).

**Now:** a photo that is unevenly lit is read with block mode twice, once with each
threshold, on the photo and on the grey copy, in place of block mode and `--psm 4`. An
evenly lit photo or scan is read exactly as before. "Unevenly lit" is `lightSpread` in
`photoocr.mjs`: the photo drawn as a 32 x 32 grey thumbnail, standard deviation over mean,
at or over 0.13 (`SHADED_CUT`). The page draws the thumbnail on a canvas
(`engine.shading`); the CLI asks ImageMagick for it (`photoSpread` in `ocr.mjs`) and keeps
`--psm 4` when ImageMagick is missing. The status line says when a photo was read this way.
Still four readings (two with `--two-pass`): no extra time beyond the thumbnail.

| totals right | before | now |
|---|---|---|
| page, SRD US photos, 196 | 134 (68.4%) | **145 (74.0%)** |
| page, SRD odd half (held out) | 67 of 97 | **73** |
| page, SROIE scans, 625 | 530 (84.8%) | 529 (84.6%) |
| CLI `--four-pass`, SRD 196 | 131 (66.8%) | **146 (74.5%)** |
| CLI `--four-pass`, SRD odd half (held out) | 66 of 97 | **72** |
| CLI `--two-pass`, SRD 196 | 113 (57.7%) | **120 (61.2%)** |
| CLI `--four-pass`, SROIE 625 | 514 (82.2%) | 514 (82.2%) |

On the page, wrong totals with no warning stay at 3 of 196 and tax at 79 of 185.

**Why per photo.** Sauvola on every photo did better still on the phone photos (page SRD
146, and the right total somewhere in the four readings on 169 photos against 153) but
cost the flatbed scans 11 totals (SROIE 530 to 519): a scan is evenly lit, and `--psm 4`
earns its place there. The cut was chosen on the even halves of both sets (SRD by photo
number, SROIE by position) with ImageMagick's thumbnail: any cut from 0.127 to 0.139 tuned
best, and the odd halves were scored once (SRD 67 to 73, SROIE 268 to 268). The canvas
thumbnail differs from ImageMagick's by up to 0.06, so 4 of 200 SRD photos and 7 of 626
scans sit on the other side of the cut on the page; the page's numbers above use the
canvas. Of the photos the change fixed, about half show a visible shadow or dim light by
eye; the rest look evenly lit, so "shaded" is the best single word for where it helps, not
the whole story. CORD's phone photos were not measured (Hugging Face refused this
session).

Numbers, the rejected variants and commands:
[`eval/shaded-photos-2026-11-15.md`](eval/shaded-photos-2026-11-15.md).
`eval/sroie-tesseractjs.mjs` takes `--set thresholding_method=2` and `--modes psm6`. Tests:
`photoocr.test.mjs` (a shaded photo gets `SHADED_PASSES`, a failed measurement falls back,
the threshold is set on every reading), `receipt-crosscheck.test.mjs` (the CLI's second
reading by lighting, with and without `--four-pass`); `node eval/photo-ocr-browser.mjs`:
6/6 in headless Chromium.

### A guessed total counts half in the vote (2026-11-15)

Flagship item (5), "vote picks 145 of 169". A reading that finds no total line falls
back on the largest amount on the page, and on a phone photo that is usually the cash
handed over, a card number or noise. The four readings come from one photo, so they
tend to guess the same wrong amount: three readings guessing 19.75 scored 3 in the vote
and beat the one reading that printed "Total 21.76" (2). Five SRD misses looked like that.

**Now:** a reading whose total is only the largest-amount fallback counts half
(`GUESS_VOTE` = 0.5 in `receipts.mjs`). Nothing else in the vote changed, and with two
readings there is no vote, so `--two-pass` is untouched.

| totals right | before | now |
|---|---|---|
| page, SRD US photos, 196 | 145 (74.0%) | **150 (76.5%)** |
| page, SRD odd half (held out) | 73 of 97 | **77** |
| page, SROIE scans, 625 | 529 (84.6%) | 529 (84.6%) |
| CLI `--four-pass`, SRD 196 | 146 (74.5%) | 147 (75.0%) |
| CLI `--four-pass`, SRD odd half (held out) | 72 of 97 | 71 |
| CLI `--four-pass`, SROIE 625 | 514 (82.2%) | **516 (82.6%)** |

Chosen on the even-numbered SRD photos with the page's readings: guess weights 0.75, 0.5
and 0.25 tie at 73 of 99 (72 before), and the middle one was taken; the same grid printed
the odd half, which every tied setting improves (74 to 78 against 73). On the page five
photos were fixed and none broken; wrong totals with no warning stay at 3 of 196. The CLI's
tesseract binary reads differently, and on SRD the change is mixed there: two photos fixed, one
broken (a garbled "AROUNT Due" line beat a right guess). On SROIE's scans, never looked at
while choosing, the CLI gains 2 (514 to 516; merchant and date unchanged), so it was kept
for both and not re-tuned on the binary.

The page's four readings can now be rebuilt from OCR folders without the browser:
`eval/canvas-shading.mjs` measures each photo as the page does (lightSpread of the canvas
thumbnail, and its size), and `eval/page-readings.mjs` lays out the four readings the page
would make in the page's order for `--settled` scoring. This run's OCR reproduced the
earlier page figures exactly (SRD 145, SROIE 529). Left in the gap: 17 SRD photos with the
right total in the text, most with no total line in any reading, two with letter swaps on
the total line ("Balance Due A7.90"). Grid, per-photo readings and commands:
[`eval/guess-vote-2026-11-15.md`](eval/guess-vote-2026-11-15.md). Test:
`receipt-crosscheck.test.mjs` ("readings that only guessed the largest amount count half").

### No total line: the card line; a letter glued to the total (2026-11-15)

Flagship item (5), the 17-photo gap above. Reading each missed photo's four texts for
the labelled amount turned up two things the reader did not know, and a third that was tried and dropped:

- **The card line.** "VISA 6.56", "Credit Card 13.22", "MASTERCARD ##4617 $52.47": with no
  total line, the amount the card was charged is a better answer than the largest amount
  on the page (a phone number, the cash handed over). It now comes before that fallback,
  skipping tip, change, cash-back, balance, points and savings lines, and counts fully in
  the vote. Not on whole-unit slips, where "[1] BCA DEBIT -259,000" reads as 1.
- **A glued letter.** "Balance Due A7 .90" for 47.90 (SRD 1177): the money pattern took
  7.90. A letter OCR makes of a digit (A 4, G and b 6, T 7, g and q 9), glued to the amount
  with nothing else before it, gives a candidate, taken only when the receipt's own sums or
  another total line give exactly that amount and nothing gives the amount as read. The
  note asks for a check.
- **"Tota 17.80"** (tried, dropped): reading "Tota", "TOTAI", "T0tal" and "Iotal" as total
  words fixed one SRD photo and broke three SROIE scans, where those spellings are mostly
  the worse reading of a line printed twice ("Tota Ami Rounded 108.00" for 104.00).

| totals right | before | now |
|---|---|---|
| page, SRD US photos, 196 | 150 (76.5%) | **153 (78.1%)** |
| SROIE OCR, 625 scans, two photo readings (held out) | 505 | **506** |
| SROIE, dataset's own text, 625 | 611 | 611 |
| CORD train / validation / test, dataset's own text | 749 / 96 / 92 | 749 / 96 / 92 |

Rules, not fitted weights, so there is no tuning half to report (the SRD gain is +1 on the
even photos, +2 on the odd). Fixed 1002, 1073, 1082, 1177; broken 1134 (its card line
reads 21.13 for 21.73). Wrong totals with no warning stay at 3 of 196. The CLI's
`--four-pass` was not re-measured (no tesseract binary in this session). Still in the gap:
"mount Due $2 17" (an amount split by a space; read since, next section), "Total before tip: $58.30", and photos where
no reading has any line with the amount. Per-photo readings, the SROIE OCR check and
commands: [`eval/total-line-gaps-2026-11-15.md`](eval/total-line-gaps-2026-11-15.md).
Tests: `receipt-crosscheck.test.mjs` ("no total line: the card line's amount", "a total's
first digit read as a glued letter").

### A total line with its decimal point lost (2026-11-15, later)

Flagship item (5), "split amounts ($2 17)". On four SRD photos the only total line holding the
right amount had lost its point: "TOTAL 184 47)" (in three readings of one photo), "esl TOTAL :
92:22", "dount Due 9, 70", "mount Due $2 17". The reader saw no amount on those lines and fell
back on a guess. Now, on a receipt written 12.50, a total line where no amount reads is read
again for dollars, a space, comma or colon, and exactly two cents digits, as the line's last
number after the total word (`splitDecimal` in `receipts.mjs`); a time, three digits after the
gap or a euro sign is left alone, and the note asks for a check.

| totals right | before | now |
|---|---|---|
| page, SRD US photos, 196 | 153 (78.1%) | **156 (79.6%)** |
| SROIE OCR, 625 scans, two photo readings (held out) | 506 | 506 (one fixed, one broken) |
| SROIE and CORD, the datasets' own text | 611; 749 / 96 / 92 | unchanged |

Fixed 1018, 1080, 1112, 1157; broken 1182, whose first total (43.60, before a printed 18% tip)
now reads and wins the vote over the last printed one (50.80). Wrong totals with no warning stay
at 3 of 196. Written looking at all SRD photos; SROIE's OCR is the held-out check. CLI
`--four-pass` not re-measured (no tesseract binary here). Per-photo lines and commands:
[`eval/split-decimal-2026-11-15.md`](eval/split-decimal-2026-11-15.md). Test:
`receipt-crosscheck.test.mjs` ("a total line with its decimal point lost ...").

### Tax on receipt photos (2026-11-15)

Flagship item (5). Earlier runs only measured the total. On the same 185 SRD photos that
carry a tax, the page read **78 taxes right (42.2%)** and left 92 empty. Of the misses,
31 had the right tax in another of the four readings, which the page never used, and 33
had it in the text with nothing able to read it: `Taxes: 3.85`, `Tax 8.75% 1.11`,
`TXTL .75`, `Tax 12,94`, and `Tax:: $0.70` overwritten by `Sbt1 w/Tax: $10.70` and then
dropped.

- **One text** (`readTax`): a rate beside the tax is not the amount, "Taxable" and
  "w/Tax" lines are not tax lines, a printed "Total Tax" wins, and two tax lines (state
  and resort, food and drink) are added when the subtotal plus their sum is the total.
  A tax line that lost its decimal point is read with a note.
- **Four readings** (`voteTax`): each reading's tax gets a vote, plus two when a subtotal
  plus that tax is the total. A tax one digit off the total less the subtotal takes the
  difference. A tax over 22% of the total is dropped. With no tax read anywhere, the
  total less the subtotal is used when it is under 15% of the subtotal.
- **The page** (`settleTax` in `photoocr.mjs`) writes the voted tax into the receipts
  box as a `Tax` line and says so in the photo's status line.

| SRD, 185 photos with a tax | before | now |
|---|---|---|
| page, tax right | 78 (42.2%) | **130 (70.3%)** |
| page, tax wrong | 15 | 13 |
| even / odd photos right | 40 / 38 | 63 / 67 |
| page totals, SRD 196 (unchanged by construction) | 156 | 156 |
| CORD tax, dataset's own text (train / validation / test) | 316 / 46 / 37 | 316 / 46 / 37 |

The odd half is not a clean held-out test: the first listing of misses showed both halves.
CORD's 404 labelled taxes did not move, and that set is a different country and layout.
SROIE has no tax labels. The CLI's `--four-pass` takes the same path but was not
re-measured (no tesseract binary here). Left: 28 photos with the tax nowhere in any
reading, and receipts with two or three tax lines where OCR lost one. Details and
commands: [`eval/receipt-tax-2026-11-15.md`](eval/receipt-tax-2026-11-15.md). Tests:
`receipt-tax.test.mjs` (11).

### Tax on receipt photos: misread labels and the arithmetic (2026-11-15)

A second pass over the 55 SRD photos whose tax the page still missed. Five readable shapes:
"Tax" with its first letter misread (`[ax 0.30`, `fax 1: 1.36`), an unlabelled amount that
closes the subtotal to the total (`TAXABLE SALES $25.85`, `Go's THY $2.46`, total 28.31), a
`Tax 2: 0.00` line read after `Tax 1: 6.35`, `Sub/Ttl` not known as a subtotal, and an
amount column shifted up a line (`Tax $21.50`, then `$1.37`). `readTax` now reads each, only
between the subtotal and the total and only when no real tax line is found, with a note
asking for a check; `voteTax` breaks a tie between two subtotals one digit apart by how many
readings read each.

| | before | now |
|---|---|---|
| page, SRD tax right (185) | 130 (70.3%) | **136 (73.5%)** |
| page, SRD tax wrong | 13 | 11 |
| CORD tax, dataset's own text (train / validation / test), held out | 316 / 46 / 37 | **322 / 46 / 41** |
| totals, SRD page and CORD | 156; 749 / 96 / 92 | unchanged |

CORD's ten fixes are Indonesian restaurant-tax lines the reader did not know (`PB-1 10%
2.818`, `P Resto 10% 3.273`, `PJR 4,909`) that close subtotal to total exactly. No receipt
lost a right tax. SRD gains are in-sample; CORD is the held-out check. Details:
[`eval/receipt-tax-labels-2026-11-15.md`](eval/receipt-tax-labels-2026-11-15.md). Tests:
`receipt-tax.test.mjs` (17).

### Tax on receipt photos: two and three tax lines (2026-11-15)

US hotel, stadium and city receipts print the tax in two or three lines (state and resort,
"IL Sales", "MPEA Tax", "Restaurant"), and OCR often keeps the amounts but loses the word
tax on some of them. `readTax` now adds the lines touching a tax line (each with one
amount; never a subtotal, total, tip, service charge, rounding, fee, carry-out or payment
line) when a subtotal, or the items above them, plus their sum is exactly the total, with a
note asking for a check. A "Total" printed before a tip counts as the total for that sum,
and across the page's four readings a reading's added tax lines can be checked against a
subtotal another reading found (`voteTax`).

| | before | now |
|---|---|---|
| page, SRD tax right (185) | 136 (73.5%) | **138 (74.6%)** |
| page, SRD tax wrong | 11 | 9 |
| CORD tax (train / validation / test), held out | 322 / 46 / 41 | 322 / 46 / 41 |
| totals, SRD page and CORD | 156; 749 / 96 / 92 | unchanged |

Both SRD fixes (1173, 1182) are in-sample. CORD's training split caught the first version
adding Indonesian service charges and rounding lines as tax (seven right taxes broken);
those words are excluded and CORD is back where it was. 1142 and 1198 are OCR-bound.
Details: [`eval/receipt-tax-lines-2026-11-15.md`](eval/receipt-tax-lines-2026-11-15.md).
Tests: `receipt-tax.test.mjs` (21).

### The CLI re-measured; item splits under the total (2026-11-16)

`receipts photo.jpg --four-pass` (tesseract 5.3.4) re-read on the 200 SRD photos for the
first time since the tax work: **totals 150 of 196 (76.5%)**, up from 147 when last
measured, and **tax 126 of 185 (68.1%)**, measured for the first time on the CLI (the page
reads 138). The CLI's 14 wrong and 45 missing taxes are listed in the eval file.

The item split (each line bought, kept only when the items close the total) was refused on
receipts that print something with an amount under the total: Food and Beverage summaries,
a suggested-gratuity table, "ITEMS 1.00", "DPP", "NET SALES", "TOTAL QTY 2". It was also
refused where the tax block's unlabelled tax lines ("IL Sales $1.52") were counted as items.
Now those tax lines are left out. When the whole list fails, the lines above the first
subtotal or total line are tried alone, under the same exact check. That retry runs only
against a total read from a total line, never a largest-amount guess, which on SRD 1160 was
the subtotal itself. OCR's "Subtota" is no longer an item.

| item split kept | before | now |
|---|---|---|
| SRD, CLI `--four-pass` (200) | 42 | **48** |
| CORD train / validation / test, dataset text (held out) | 342 / 51 / 49 | **436 / 62 / 60** |
| totals and tax, SRD CLI and CORD | 150, 126; 749 / 96 / 92, 322 / 46 / 41 | unchanged |

None lost. The six SRD gains were read by eye. Of CORD's 116, 115 close the labelled total
and one has no labelled total. CORD's committed files hold no item labels, so splits are
not scored item by item. The page shares `parseReceipt`, but its readings were not rebuilt
this run. Details, per-photo lists and commands:
[`eval/receipt-cli-four-pass-2026-11-16.md`](eval/receipt-cli-four-pass-2026-11-16.md).
Tests: `receipt-tax.test.mjs` (23).

### Tax on receipt photos: misspelt labels and damaged tax lines (2026-11-16)

The CLI's `--four-pass` read SRD tax on 126 of 185 photos, 45 with no tax at all. Its
readings (tesseract 5.3.4, re-read this run and matching the last run's figures exactly)
showed three kinds of fixable miss:

1. **The subtotal's label misspelt.** "Suototal 24.08", "Subtota | $20.00", "Sudtotal",
   "ubtotal": the subtotal was never read, so the tax could not be checked against it.
   `cleanOcr` now writes any word one letter from "subtotal" or "subtota" (seven letters
   or more) as "Subtotal". Two letters is not taken: photo 1133's total line reads
   "SOSTOTAL". "Tota]" and "Subtota|" become "Total" and "Subtotal", and a doubled decimal
   point ("146..57") is one.
2. **A tax line's decimal point lost with no separator left.** "TAX 211": the digits are
   taken as 2.11 only when a subtotal read on the receipt plus 2.11 is the total or a
   "Total" line (photo 1012: 22.25, "Total 24.36", then a tip).
3. **A tax line whose amount is gone but whose rate is printed.** "TAX 8.00% 44": the
   subtotal times the rate must make the total; with no subtotal read, the total split at
   the rate must give a tax whose last digits are the ones the line still shows (19.44 at
   8% is 18.00 + 1.44, the line kept "44"). With no digits to agree with (photo 1018,
   "TAX 8.25% *="), nothing is taken. Each fallback adds a "check the tax" note.

| SRD, CLI `--four-pass` | before | now |
|---|---|---|
| tax right (185) | 126 (68.1%) | **132 (71.4%)** |
| tax wrong / none | 14 / 45 | 12 / 41 |
| tax read where none labelled | 1 | 1 |
| totals right (196) | 150 | **151** |
| item splits kept (200) | 48 | **49** |

| held out, dataset text | before | now |
|---|---|---|
| CORD train tax (352) | 322 | **323** |
| CORD validation / test tax, all totals | 46 / 41; 749 / 96 / 92 | unchanged |
| SROIE merchant / date / total (626) | 531 / 601 / 611 | unchanged |

The six SRD gains are 1009, 1012, 1061, 1064, 1076 and 1153; two wrong taxes became right
(1061, 1153) and four missing ones were filled. The rules were written from these photos,
so the SRD figure is in-sample. CORD and SROIE were scored once after. Most CORD receipts
are decimal-comma or whole-unit, which rules 2 and 3 never touch, so they test mainly
rule 1. A leading-digit rule ("Tax » 415.35" read as 15.35, photo 1184) was tried and
dropped: it gained nothing (the subtotal-arithmetic rule then picks 17.35 from a misread
"176.00") and turned one missing tax wrong. Remaining misses:
[`eval/receipt-tax-ocr-labels-2026-11-16.md`](eval/receipt-tax-ocr-labels-2026-11-16.md).
Tests: `receipt-tax.test.mjs` (26), `cord-receipts.test.mjs`.

### Reading the total first (2026-11-16, later)

Of the 41 SRD photos where the CLI's `--four-pass` read no tax, 27 had the total wrong as
well, and the tax checks lean on the total. In each photo's four readings, two vote rules
picked a wrong total when another reading held the right one:

1. **The total's label damaged in every reading.** Photo 1133 reads "SUBTOTAL: 134.46" and
   "Tax(9%) 12.11" in two readings, and the total as "=—STOTAL: = -:146.57" and
   "SOSTOTAL: 146.57"; no reading took 146.57 as the total, and one read "A TOTAL: 12.11"
   (the tax). Now a reading's own subtotal plus its own tax is put to the vote too, but only
   when that amount is printed somewhere on the page, scoring one point per reading that
   prints it and no total-line point. A reading that read a total on a total line keeps
   it in a tie. The receipt notes "the subtotal 134.46 plus the tax 12.11, printed on the
   page: check the total".
2. **A total line with a leading zero.** "TOTAL: 04.78" (photo 1030) lost its first digit;
   another reading has "TOTAL: $94.78". A total line whose dollars start with 0 now counts
   as a guess (0.5) in the vote. Read alone, it is still read.

| SRD, CLI `--four-pass` | before | now |
|---|---|---|
| totals right (196) | 151 (77.0%) | **154 (78.6%)** |
| tax right (185) | 132 (71.4%) | **133 (71.9%)** |
| tax wrong / none | 12 / 41 | 12 / 40 |
| item splits kept (200) | 49 | 49 |

Gains: 1002 (total 7.61: 6.98 + 0.63, printed on the card line "Visa 7.61"), 1030 (total), 1133 (total and tax). None
lost. CORD and SROIE are scored on their dataset text, one reading each, where neither
rule runs, so they are unchanged (CORD tax 323 / 46 / 41, totals 749 / 96 / 92) and do not
test this. The rules were written from these photos: the SRD figure is in-sample and there
is no held-out set of multi-reading photos here yet. A third rule, a reading's total-line
amount counting nothing when its own cash less change disagrees, changed no photo and was
dropped (1022's "CASH: 100,00" reads with a comma on a dot receipt, so the check never
forms). The page's readings (tesseract.js) were not rebuilt this run, so the page's figures
are not re-measured; the page uses the same vote. What is left:
[`eval/receipt-total-first-2026-11-16.md`](eval/receipt-total-first-2026-11-16.md).
Tests: `receipt-crosscheck.test.mjs`.

**Held out (2026-11-16, evening).** SROIE's 625 labelled scans, read by the CLI's
`--four-pass`, are a held-out multi-reading set. There, rule 1 never fires (GST is printed
inside the total, and total lines survive OCR), and rule 2 cost one receipt: SROIE 169's
"Grand Total 029,30" is a stray 0 before an intact RM29.30, and with its vote halved a 3.00
guess won (521 to 520 of 625). A leading-zero total now counts as a guess only when another
reading holds the same digits with a digit in front (94.78 for 04.78). SROIE is back to
521 (83.4%), SRD keeps 154 and 133 tax, and nothing else moved. The SRD gain is still
in-sample; a held-out set with separate tax lines (the CORD photos, huggingface.co refused
this session) would test rule 1:
[`eval/receipt-total-first-heldout-2026-11-16.md`](eval/receipt-total-first-heldout-2026-11-16.md).

### CORD photos through the CLI's four readings (2026-11-16, night)

The held-out multi-reading check the last two runs asked for. CORD's 200 validation and test
photos went through `--four-pass` (tesseract 5.3.4), and every version of `receipts.mjs` since
2026-11-15 was scored on the same readings. The four-reading tax vote holds up out of sample:
+3 taxes on each split. It also tripled the wrong taxes on validation (3 to 10). The SRD-written
rules after it moved one test receipt, and the total-first rules never fire on rupiah slips.
Four changes, written from validation misses only:

- On a whole-unit slip with no total line, cash less change reads through a leading dash
  ("CASH -50,000", "CHANGE -30,000").
- "PBI", "PBl", "PB]", "PB!" and "P Resto" are PB1, Indonesia's restaurant tax.
- On a whole-unit slip, a tax under 1% of the total is lost digits or noise ("TAX 5.45" on
  172,000; "10.000%" read as 1.00). A yen receipt's ¥22 tax on ¥300 stays.
- A whole-unit tax one unit off the arithmetic is rounding (18,181 + 1,818 printed as 20,000),
  not a digit to repair.

| CORD photos, CLI `--four-pass` | validation before | after | test before | after |
|---|---|---|---|---|
| totals right | 63 / 98 | **64** | 53 / 95 | 53 |
| tax right / wrong / none | 16 / 10 / 21 | **22 / 4 / 21** | 14 / 4 / 23 | **16 / 2 / 23** |

Test was scored after each change, but no test receipt was read. SRD photos (re-read) stay at
154 totals and 133 tax, SROIE text is unchanged, and CORD's own text goes from 323 to 324 train
taxes. Most remaining misses are OCR-bound: the total's digits are in none of the four readings
on 23 of 34 validation misses and 27 of 42 test misses. Details:
[`eval/cord-photos-four-pass-2026-11-16.md`](eval/cord-photos-four-pass-2026-11-16.md).
Tests: `cord-receipts.test.mjs`.

### The page re-measured; a guess of the cash handed over gets no vote (2026-11-16, evening)

The page's own tesseract.js readings of the 200 SRD photos were rebuilt after the day's
changes: totals 156 of 196 and tax 138 of 185, the same totals as before the changes (the
total-first rules fire on CLI readings only, +3 there) and one wrong page tax turned to none.

When a reading finds no total line, it falls back on the largest amount on the page, and
on a cash slip that is often the cash handed over ("CASH 50,000" on a 21,000 bill, CORD
validation-30). Such a guess, printed on the cash line, now counts nothing in the vote
across readings (`CASH_GUESS_VOTE`), unless the receipt's arithmetic gives the same amount:
exact cash is the total (SRD 1108: "Tendered $52.06", subtotal plus tax 52.06). SRD page
and CLI readings, CORD and SROIE dataset text: unchanged. Not yet scored on CORD's photos
(huggingface.co refused this session). Details:
[`eval/receipt-cash-guess-2026-11-16.md`](eval/receipt-cash-guess-2026-11-16.md). Tests:
`receipt-crosscheck.test.mjs`.

### The cash rule on CORD's photos; exact cash and tax ties (2026-11-16, late)

CORD's 200 validation and test photos, read again through `--four-pass`, reproduce the last
measurement (validation 64 of 98 totals, test 53 of 95). The cash rule above fixed
validation-30 and broke validation-66: one bottle of water, `AIR MINERAL 7,000`, `CASH 7,000`,
no total line. That is exact cash with no subtotal or tax to confirm it. Two changes, written
from validation only:

- **A cash-line guess keeps its half vote when a reading prints the same amount on a line
  that is not the cash line** (an item or a total line). Validation totals 64 to 65.
- **A tie between two taxes goes to the amount more readings print on a tax line**, counting
  a reading that lost its total and so parsed no tax (validation-65: 4,964 twice, 4,264 once).
  Validation tax 22 to 23 right, 4 to 3 wrong.

Test was scored once at the end: no receipt moved. SRD photos re-read through the CLI: 153
totals and 134 taxes before and after. Details:
[`eval/cord-cash-guess-2026-11-16.md`](eval/cord-cash-guess-2026-11-16.md). Tests:
`receipt-crosscheck.test.mjs`.

### A dash and a section sign on whole-unit slips (2026-11-16, night)

Two OCR marks on CORD's rupiah photos, both changed from validation only:

- **The largest-amount fallback reads through a dash before a whole amount**
  (`AIR MINERAL -7,000`), as the cash and change lines already did; so do the cash-line
  checks of the vote. Validation-66 was already right; its psm6 reading now agrees.
- **A `§` glued to a grouped whole amount reads as 5** (`TOTAL SALES §2,000` for 52,000,
  validation-84). Validation totals 65 to 66 of 98.

Test, scored once at the end: 53 of 95, tax 16 of 41, unchanged; test-56's wrong total moved
from 8,181 to 10,000 (the cash handed over, flagged as a cash-line guess). SRD photos re-read through the CLI: 154 totals and 133 taxes, before and after. Details:
[`eval/cord-dash-section-sign-2026-11-16.md`](eval/cord-dash-section-sign-2026-11-16.md).
Tests: `receipt-crosscheck.test.mjs`.

### An unreadable PB1 line, read from the total (2026-11-16, late night)

Of CORD validation's 21 photos with no tax found, 11 are OCR-bound, 5 have a wrong total and
2 have the right total with a tax line no reading could read. For those, `voteTax` now splits
a settled whole-unit total at Indonesia's 10% (or 11%) when a reading prints a tax line and a
subtotal line shows the split's subtotal, whole or its last five digits (`SUBTOTAL 56,364`
for 156,364): 172,000 is 156,364 plus 15,636. The receipt says it split the total. Chosen on
validation only: tax 23 to 25 right, wrong 3, none 21 to 19; totals unchanged.

Test, scored once at the end: unchanged (53 of 95, tax 16 / 2 / 23); the rule took no test
tax. A misread-`PRI` tax line, tried too, cost test-14 its tax and was dropped (details in the
note). SRD photos re-read through the CLI: 154 totals and 133 taxes, before and after. Details:
[`eval/cord-tax-split-2026-11-16.md`](eval/cord-tax-split-2026-11-16.md).
Tests: `receipt-crosscheck.test.mjs`.

### A service charge in the tax vote (2026-11-17)

A printed service charge or tip sits between the subtotal and the total, so "subtotal plus
tax is the total" fails on those receipts. `voteTax` now reads every service, gratuity and tip
amount in any reading and lets subtotal + service + tax close to the total, both in the vote
and, when no reading has the tax's amount but one prints a tax line, as total less subtotal
less service. Chosen on half the SRD photos and CORD train text: SRD CLI tax 133 to 134 right
(wrong 12 to 11), page 134 to 135; the held-out SRD half unchanged; CORD train text 324 to
326, validation and test text unchanged. CORD photos were not read this run (huggingface.co
refused the download). Details:
[`eval/service-charge-vote-2026-11-17.md`](eval/service-charge-vote-2026-11-17.md).
Tests: `receipt-crosscheck.test.mjs`.

### Wrong totals on CORD photos: change lines and sums across readings (2026-11-17)

CORD validation's photos were read again (huggingface.co answered), which also scored last
run's service-charge vote there: no change (totals 66 of 98, tax 25 / 3 / 19). Of the five
wrong totals that have a tax line, two took a line that is not a total: "Total Kembalian"
(the change, in Indonesian) and "Total Qty" read as "Total aty"; both are now left out. Two
read the total line wrong where the receipt's own sums are right: when the readings' total
lines disagree, or a subtotal read twice is above the total, `parseReceiptPasses` takes a
cash-less-change (or subtotal-plus-tax) amount one digit from a read total line, when two
readings give it or a subtotal lies between, and the receipt says to check the total.
Validation photos: totals 66 to 69, tax 25 to 27; nothing lost. Held-out test photos, scored
once: unchanged (53, tax 16 / 2 / 23). SRD photos through the CLI and CORD text (also read
as three readings): unchanged, except CORD validation text 96 to 97. Details:
[`eval/cord-wrong-totals-2026-11-17.md`](eval/cord-wrong-totals-2026-11-17.md).
Tests: `receipt-crosscheck.test.mjs`.

### CORD train photos: a fresh development set (2026-11-17)

Every photo rule had been chosen on CORD validation or SRD. Read for the first time, 200 CORD
train photos score 115 of 196 totals (58.7%) against validation's 69 of 98 (70.4%): validation
was overfit, and unseen phone photos of Indonesian receipts sit near 57-59%. Rules written from
train misses only: `SUB. TOTAL` is a subtotal; `Bayar` (paid) and a cut `Kembal` (change) make
cash less change; a whole-unit total under 100 units gets no vote; long digit runs are not
amounts; `Qty: 3 Amount: 262,000` is a total line; a subtotal at Indonesia's 10% or 11% tax
rate is a check when a tax line is printed. Train photos 115 to 122; validation 69 to 70;
held-out test photos, scored once, 54 to 55, with wrong totals the page does not flag 5 to 2;
SRD 155 to 156; CORD text train 749 to 761 and test 92 to 93; SROIE unchanged. Details:
[`eval/cord-train-photos-2026-11-17.md`](eval/cord-train-photos-2026-11-17.md).
Tests: `cord-train-photos.test.mjs`.

### RapidOCR's parser misses on CORD train photos (2026-11-17)

With RapidOCR reading the photo, 45 of the 68 missed totals on CORD train shards 1-3 had the
right digits in the reading: the parser lost them. Rules written from those misses only, for
whole-unit (rupiah) slips: `Change:5,000` reads through its colon and `Pay Cash 50.000
Change:5,000` on one line splits into cash and change; `DU1,241,790` is a DUE line; `IDR` reads
like `Rp`; `Total Qty` read as `OTY`, `Discount total` and `Ch ange Due` are not totals; a
misspelt total word (`Tatai`, `Tota.......`) is a fallback when no real total line was read;
when no check confirms the total, cash less change or subtotal plus tax that the slip also
prints on a line of its own is taken (exactly one such amount, never under a subtotal); a stray
digit after a total (`TOTAL 127,500 4`) is dropped. Train 515 to 539 of 583; validation 83 to
85; US photos (SRD) 180 to 182; held-out CORD test, scored once, 80 to 83 (RapidOCR then
tesseract's four: 80 to 83; the page 81 to 84; tesseract's four alone 56 to 58); CORD text
train 761 to 767, test 93 to 94; SROIE text unchanged. No total went from right to wrong in any
set; two taxes did, each after its total became right. Details:
[`eval/rapidocr-parser-misses-2026-11-17.md`](eval/rapidocr-parser-misses-2026-11-17.md).
Tests: `receipt-rapidocr-misses.test.mjs`.

### RapidOCR's parser misses on US receipt photos (2026-11-17)

The same exercise on the SRD US photos, choosing on the even-index half and holding out the odd.
On a tilted photo RapidOCR boxes the word column and the amount column separately, and the rows
can slip by one: `Subtotal $5.50 / Tax $86.65 / Total: $6.93 / ... $93.58`. When no check
confirms the total read, the amount one row off the total line is taken if subtotal plus tax,
read at the same offset, gives it to the cent (and exactly one amount does); the receipt says so.
Also `TOTALDUE` is a total line, and a Paris phone number after `Tl:` (`01.48.28.44.81`) is not
an amount. Choose half 90 to 95 of 99 (RapidOCR then tesseract's four: 91 to 94; the page 92 to
95, wrong with no warning 5 to 2); held-out half 92 of 97, unchanged (it was scored once at 91,
the loss fixed by limiting the rule to the line the total was read from, so it is no longer
unseen for this rule); all 196, RapidOCR: 182 to 187; CORD text and SROIE text unchanged.
Details: [`eval/rapidocr-srd-misses-2026-11-17.md`](eval/rapidocr-srd-misses-2026-11-17.md).
Tests: `receipt-rapidocr-srd.test.mjs`.

### The page's own RapidOCR on the US photos, and a printed gratuity (2026-11-17)

The page's JavaScript port of RapidOCR, run in headless Chromium on all 196 SRD photos, slips
rows on the same two photos as the Python engine and the row-shift rule fixes both; it reads 189
totals right to Python's 187. With tesseract's four after it, the page gets 188. One of its misses
was the parser's: `SubTotal 3.99 / Tax 0.30 / Gratuity 1.00 / Total 5.29` was "corrected" to 4.29
because no check counted the gratuity. A gratuity line above the total now adds a check
(subtotal plus tax and gratuity). The page: 188 to **189 of 196**, wrong with no warning 2 to 1;
CORD and SROIE text unchanged. Details:
[`eval/rapidocr-web-srd-2026-11-17.md`](eval/rapidocr-web-srd-2026-11-17.md).

### The page with its own RapidOCR port leading (2026-11-17)

Re-scored with the page's JavaScript port (not Python RapidOCR) as the lead reading, on all 196 SRD
photos: **190 totals right**, wrong with no warning 1, the same as the port alone and one more than
the vote without the lead rule. Of the two taxes the lead cost, one (1027) was a parser fault: four
readings agreed on a Hawaii GET of 1.86, but a discount and a gratuity sat between subtotal and
total, and the "one digit from total less subtotal" fix swapped in 1.56. That fix now stands aside
when three readings agree and a gratuity or service line is printed. Tax with the lead 165 to 166.
The other (1009) is a lead that read no total line; left, still flagged. CORD photo sets not
re-scored (huggingface.co refused). Details:
[`eval/rapidocr-web-lead-srd-2026-11-17.md`](eval/rapidocr-web-lead-srd-2026-11-17.md).

### RapidOCR and tesseract together (2026-11-17)

`--rapidocr --four-pass` reads the photo with RapidOCR first, then with tesseract's four
readings, and all five vote (`RECEIPT_OCR_LEAD` does the same with any OCR command):

```
RAPIDOCR_PYTHON=v/bin/python node cli.mjs --books b.json receipts photo.jpg --rapidocr --four-pass
```

Against `--rapidocr` alone, totals stay about level and taxes go up. Held-out CORD test:
totals 80 and 80 of 95, tax 28 to 32 of 41. US receipt photos (SRD): 180 to 181 of 196, tax
142 to 162 of 185. CORD train shards 1-3 (where the order was chosen): 515 to 510 of 583, tax
172 to 203 of 267. Against tesseract's four alone, test totals go from 56 to 80. Details:
[`eval/second-ocr-engine-2026-11-17.md`](eval/second-ocr-engine-2026-11-17.md).

### RapidOCR's total kept over an unconfirmed tesseract majority (2026-11-17)

With tesseract's four readings of the 600 CORD train photos made, the five-reading vote
(`--rapidocr --four-pass`, and the page) read 526 of 583 totals, against 539 for RapidOCR alone:
19 times three tesseract readings agreeing on the same misread digit outvoted RapidOCR's right
total, with no check on the receipt confirming them. Now a total that outvotes the lead reading is
taken only when the receipt's arithmetic confirms it; otherwise RapidOCR's total stays, with a
"check the total" note on the CLI and the page. Train (where it was chosen) 526 to **542**, tax
205 to 209 of 267; validation 87 and 87 of 98; held-out test 83 and 83 (the page 84 to 83); US
photos (SRD) 186 to 188 of 196, tax 163 to 161. The five-reading mode now matches or beats
RapidOCR alone on totals in every set and keeps most of the four readings' tax gain. Details:
[`eval/lead-vote-2026-11-17.md`](eval/lead-vote-2026-11-17.md). Tests: `receipt-lead-vote.test.mjs`.

### The page keeps a rupiah tax the readings agree on; a total subtotal plus PAJAK gives stands (2026-11-17)

CORD train shard 0 (200 photos the RapidOCR rules and the lead rule never saw) through RapidOCR
and tesseract's four readings showed two faults. The page wrote the tax the five readings agreed
on as `Tax 8728.00`, which a rupiah slip does not read back as 8,728, so it dropped the tax
silently: on every CORD photo set the page's tax was exactly RapidOCR's alone. It now writes
`Tax 8,728` on such a slip. Page tax: shards 1-3 177 to **205** of 267, validation 36 to **41**
of 47, held-out test 28 to **31** of 41 (two of the three wrong, as the CLI's are), shard 0 63 to
69 of 85. And a real total of 17,001 (subtotal 15,455 plus `PAJAK 10% 1,546`) was "fixed" to the
17,000 paid by card under it, because `pajak` and `ppn` were not tax words for the arithmetic
check; they are now, and the zero-last-digit fix stands aside when the receipt's sums give the
total. Totals: shard 0 175 to 177, shards 1-3 542 to 543. US photos (SRD) and CORD's text do not
move; the `voteTax` guard of the SRD run moves nothing on CORD. Details:
[`eval/cord-shard0-lead-2026-11-17.md`](eval/cord-shard0-lead-2026-11-17.md). Tests:
`receipt-shard0.test.mjs`.

### Russian receipts: a fresh labelled source (2026-11-18)

Two "new" receipt sets on Hugging Face turned out to be CORD and SRD again (167 of 192 and 199 of
230 totals match), so the fresh source is [cdek-ocr/receipt-ocr-ru](eval/receipt-ocr-ru/README.md)
(MIT): about 1,000 phone photos of Russian shop receipts with totals labelled. RapidOCR has no
Cyrillic model and prints `ИТОГ` as `HTOr`, `MTOr`, `UTOr`; the parser knew no Russian total word
and got 81-86% of totals right by taking the largest amount. Now `ИТОГ`, `ИТОГО`, `К ОПЛАТЕ` and
their look-alikes are total words; `ИТОГО без скидки` (before the discount) is not; a dropped
kopeck digit, an item's `119.00*1` or a tax amount on the ИТОГ row are handled; and an ИТОГ amount
printed only once gives way to the amount the slip prints two or more times below it, or to the
card line, or to cash less change, unless two payments below add up to it. On train shard 1, read
only after the last change and scored once: **187 to 203 of 230 totals (81.3% to 88.3%)**, 20
gained, 4 lost. Development sets: val 120 to 138 of 145, train shard 0 198 to 213 of 231; test 126
to 136 of 148 (its misses were read, so not clean). CORD text unchanged. tesseract's default
reading ran over 9 minutes on each of these photos without finishing. That turned out to be OpenMP,
not the photos (next section). Details: [`eval/receipt-ocr-ru-2026-11-18.md`](eval/receipt-ocr-ru-2026-11-18.md).
Tests: `receipt-russian.test.mjs`.

### OCR time limit (2026-11-18)

The hang above was not the photos. tesseract's OpenMP threads spin while they wait, and with
anything else on the machine wanting a core, a 0.9 s read ran past 30 s (three busy loops beside
it) or 60 s (two tesseracts at once); with `OMP_THREAD_LIMIT=1` it takes 0.85 s and twelve at once
finish in 3 s. So every OCR command the CLI runs (receipt photos, RapidOCR, scanned statement pages)
now gets `OMP_THREAD_LIMIT=1` unless your environment sets it. A time limit, `OCR_TIMEOUT` seconds
(default 120, `0` for none), turns a stall into a message: when one pass runs out of time, the photo's later passes are skipped, and
RapidOCR's lead reading is kept when tesseract fails behind it. With tesseract able to run, val's
145 Russian totals: `--four-pass` 68 right (46.9%), `--psm 6 -l rus+eng` 57, `--psm 6` 51, against
RapidOCR's 138, so `--rapidocr` stays the advice for these slips. Details:
[`eval/ocr-time-limit-2026-11-18.md`](eval/ocr-time-limit-2026-11-18.md). Tests:
`ocr-time-limit.test.mjs`.

### SROIE through RapidOCR and the five readings; dates glued to the time (2026-11-18)

SROIE's 626 Malaysian receipt scans had only been read by tesseract. Read by RapidOCR and
tesseract's four (`--rapidocr --four-pass`), split before any change into 313 dev and 313 held
out: totals are right on 282 of 312 and 302 of 313 (96.5%), and the lead rule, chosen on CORD, adds
12 and 8 totals over the vote without it. Dates were the fault: RapidOCR drops the space between
the date and the clock time (`25/12/20188:13:39PM`, `18-11-1813:58` read as 1813, `05Mar201818:24`),
so with RapidOCR leading only 69% of held-out dates were right. The reader now splits a date glued
to a time before reading it, and refuses a year before 1990: held-out dates **69.1% to 94.1%** right,
wrong dates 34 to 11; totals unchanged. Also SRD 1009: a lead that took its subtotal as the total
(no total line read) gives way to a total line at most 35% above it (SRD totals 188 to 189, tax 164
to 165; unmeasured on CORD, which could not be fetched). Details:
[`eval/sroie-five-readings-2026-11-18.md`](eval/sroie-five-readings-2026-11-18.md).
Tests: `receipt-sroie-five.test.mjs`.

### Russian slips: tesseract's Cyrillic model behind RapidOCR (2026-11-18)

Would tesseract with its Russian model (`RECEIPT_OCR_CMD='tesseract {file} stdout --psm 6 -l rus+eng'`,
apt `tesseract-ocr-rus`), read four ways behind RapidOCR's lead (`--rapidocr --four-pass`), fix
the Russian slips RapidOCR gets wrong? No. On val's 145 totals the Cyrillic model lifts
tesseract's own four-reading vote from 68 to 79, far behind RapidOCR's 140. Behind the lead the four
gained no total on val or test (140 of 145, 137 of 148, as RapidOCR alone) and lost one on each,
where a line read as 0.00 (a card line, `БЕЗНАЛИЧНЫМИ -00.00`, or noise) beside one amount made it
"the items", which outvoted the right total. A Russian card or cash line is now a payment, not an
item, and one item beside 0.00 lines is no items check (it adds up only to itself); both losses are
gone. CORD text and RapidOCR alone are unchanged. Letting RapidOCR find the rows and tesseract read each row's crop
finds ИТОГ twice as often as tesseract's own layout (83 against 42 slips), but the digits stay
poor and it added nothing either. For Russian photos the advice stays `--rapidocr`. Details:
[`eval/receipt-ocr-ru-rus-vote-2026-11-18.md`](eval/receipt-ocr-ru-rus-vote-2026-11-18.md).
Tests: `receipt-lead-vote.test.mjs`.

### Russian slips: misread legal forms (2026-11-19)

The seller on a Russian slip is the line that opens with a legal form, and the Cyrillic model
sometimes misreads the form itself: `AD "…"` or `до "…"` for АО, `ИЛ ПЕТРОВА Ю.С.` for ИП, `ЗДО`
for ЗАО, `ОБЦЕСТВО` for ОБЩЕСТВО, or a spelled-out ООО whose name wrapped to the next line. Each is
now read, but only where what follows rules out an ordinary word (a quoted name after АО, a surname
with initials after ИП). **Held-out test: seller right on 104 to 106 of 146 slips (72.6%)**; val
113 to 117; no slip lost on either split; totals unchanged. Details:
[`eval/receipt-ocr-ru-forms-2026-11-19.md`](eval/receipt-ocr-ru-forms-2026-11-19.md).

### A second look for the seller (2026-11-19)

When a Russian slip's first RapidOCR reading names no seller (no line opens with ИП, ООО, АО and
the rest), `--rapidocr` now reads the photo again as three overlapping bands, top, middle and foot,
each enlarged twice (`rapidocr_rows.py --bands`). A seller found there is taken as the merchant.
Totals and items still come from the first reading. The seller is often printed small in the fiscal
block under the items, not in the header, which is why the bands cover the whole slip.
**Held-out test: seller right on 106 to 113 of 146 slips (77.4%)**; val 117 to 122; no slip lost
on either split; totals unchanged. It costs a few more seconds, and only on the slips that need it
(14% to 24% of Russian slips). Details:
[`eval/receipt-ocr-ru-bands-2026-11-19.md`](eval/receipt-ocr-ru-bands-2026-11-19.md). Tests:
`receipt-seller-bands.test.mjs`.

The page does the same since 2026-11-19 (`photoocr.mjs` `withSecondLook`). It draws the three
bands on a canvas and reads them with the same RapidOCR reader in the browser. **In headless
Chromium, held-out test sellers went from 105 to 114 of 146 (78.1%) and val from 116 to 121, with
none lost.** Every seller the bands put first was right, and totals did not change. The status
line says when a slip was read again. Details:
[`eval/receipt-ocr-ru-page-bands-2026-11-19.md`](eval/receipt-ocr-ru-page-bands-2026-11-19.md).
Tests: `receipt-seller-bands-page.test.mjs`.

### Russian slips with a Cyrillic recogniser (2026-11-18)

RapidOCR's default recognition model has no Cyrillic: on Russian slips it reads the totals well
but prints every word in Latin look-alikes, so the merchant and the item lines were noise. Swap in
PaddleOCR's East Slavic PP-OCRv5 recogniser (Apache-2.0, 7.9 MB; RapidOCR's detector stays):

```
curl -L -o eslav.onnx https://huggingface.co/monkt/paddleocr-onnx/resolve/main/languages/eslav/rec.onnx
curl -L -o eslav_dict.txt https://huggingface.co/monkt/paddleocr-onnx/resolve/main/languages/eslav/dict.txt
RAPIDOCR_REC_MODEL=eslav.onnx RAPIDOCR_REC_KEYS=eslav_dict.txt node cli.mjs --books b.json receipts photo.jpg --rapidocr
```

On cdek-ocr/receipt-ocr-ru the totals are the same as with the default model (held-out test 137
of 148 either way; no vote of the two readings beat either alone), but the seller's name is in the
reading on 86% of slips against 30%, and the labelled item names on 83% against 18%. The merchant
rules looked for Latin shop names and took the seller on 0 of 146 slips; now, on a Russian slip, the
column that opens with a legal form (ИП, ООО, АО, ПАО, ЗАО, ГУП, the spelled-out forms; `000` and
`AO` as the engines print them) is the merchant, a quoted name ends at its closing quote, and the
card's bank and the fiscal data operator (ОФД) are skipped. Held-out test, scored once:
**merchant right on 0 to 104 of 146 slips (71.2%)**; val, the development set, 113. ИТОГ read as
`НТОГ` or `МТОГО` (the Cyrillic model's misreads) is now a total word too; it cost one val total
(140 to 139) and no test total. CORD text and SROIE's 626 merchants, dates and totals are
unchanged. PaddleOCR's older `cyrillic_PP-OCRv3` read a sample slip as noise after conversion and
was not scored. Details: [`eval/receipt-ocr-ru-eslav-2026-11-18.md`](eval/receipt-ocr-ru-eslav-2026-11-18.md).
Tests: `receipt-russian-seller.test.mjs`.

### Russian slips on the page (2026-11-19)

The page's RapidOCR now has a "RapidOCR alphabet" choice: Latin (the default) or Cyrillic
(Russian, Ukrainian, Belarusian, Bulgarian). Cyrillic loads the same East Slavic recogniser the
CLI uses above, about 8 MB once, from Hugging Face at a pinned revision, and the page refuses the
files unless they hash to the pinned sha256. On the 149 val slips, read in headless Chromium the
way the page reads them: **totals 139 of 145, seller taken as the merchant 116 of 146, item names
412 of 482**, against the CLI's Python reading 139, 117 and 412; the Latin model takes the seller on
about 20. Details: [`eval/receipt-ocr-ru-page-2026-11-19.md`](eval/receipt-ocr-ru-page-2026-11-19.md).
Tests: `rapidocr-worker.test.mjs`.

### The receipt's alphabet, picked from the photo (2026-11-19)

The "RapidOCR alphabet" choice now defaults to **From the photo**. Each photo is read with the
Latin recogniser first; when that reading looks like a Cyrillic slip printed in Latin look-alikes
(`receiptScript` in `receipts.mjs`: three or more words with a lower-case letter before two
capitals, such as `CyMMA` for СУММА or `nPHXOA` for ПРИХОД), the page downloads the Cyrillic
recogniser once and reads that photo again, and the Cyrillic reading leads. A batch of Latin
receipts never downloads it. Picked right: Russian slips **147 of 149** (val) and **148 of 151**
(test, held out); Latin receipts **200 of 200** (SRD, US), **100 of 100** (CORD, Indonesia,
held out) and 470 of 472 (WildReceipt, held out; 472 after cutting glued quantities such as
`1xBTL`, the cause of both misses); in the page's own browser reading, 29 of 29 and 28 of 28. For a visitor who leaves
the default, held-out Russian sellers taken go from **16 to 106 of 146** and item names from 81
to 379 of 459, the same as picking Cyrillic by hand; one total of 148 is lost on a short slip the
rule left on Latin. Details: [`eval/receipt-script-2026-11-19.md`](eval/receipt-script-2026-11-19.md).
The CLI's `receipts FILE --rapidocr` says when a reading looks Cyrillic and `RAPIDOCR_REC_MODEL`
is unset. It also reads with RapidOCR again: the flag reader removes what it reads, so a lone `--rapidocr`
(without `--four-pass`) was spent by the first test and the photo went to tesseract.
Tests: `receipt-script.test.mjs`.

### WildReceipt: 472 held-out photos from a new source (2026-11-17)

Every CORD photo had been read, so the reader was measured on a source no rule was written from:
[WildReceipt](eval/wildreceipt/README.md) (Apache-2.0), shop, restaurant, fuel and hotel receipts
from the US, Europe, Asia and Australia. On its 472 test photos, before any change, the CLI's five
readings (`--rapidocr --four-pass`) read **357 of 405 totals (88.1%)** and 194 of 272 taxes;
tesseract alone 291 (71.9%). Its first train shard (634 photos) was the development set. Rules
written from its misses: a tax word glued to its rate or the word before (`MwSt19%`, `Tax1:`,
`SalesTax`, `TOTAL-TAX`; RapidOCR drops spaces); `TOTAL SAVED`, `TOTAL INCLUDES GST OF`,
`Total HT`, `TOTAL SIN IVA`, `Tax/Fee Total` and county tax lines are not the total; German
`Netto` with cents is the amount before VAT (Indonesian `Netto 137,500` stays a total);
`UKUPNO`, `RAZEM`, `CELKEM`, `TOPLAM` are total words. Held-out test, scored once after: CLI
totals 357 to 359, tax 194 to 204; page 356 to 358, tax 191 to 202; RapidOCR alone tax 164 to 185.
SRD tax 162 to 164, totals unchanged; CORD text tax 324 to 325. The run had seen the test miss
list before moving to the train shard, so the test gain is not perfectly clean (the report says
which rules that touches). Details: [`eval/wildreceipt-2026-11-17.md`](eval/wildreceipt-2026-11-17.md).
Tests: `receipt-wildreceipt.test.mjs`.

### CORD tax labels the scorer misread (2026-11-18)

`eval/cord-receipts.mjs --tax-misses` lists the receipts whose tax was missed (labelled and read
wrong or not at all, or read where none is labelled), with the line the parser took. Its first
list showed the scorer, not the parser, was wrong on three train taxes: a rate inside the label
(`10% 4,818`) or a list of a rate and an amount (`["10.000%", "546"]`) was read as one glued number.
Read right, CORD train tax is **328 of 352** (325 before), with the parser unchanged; validation,
test and every total are the same. Two real misses it found: a receipt with a 10% and a 0% tax line
reads the 0% one (train-744, train-778). Details: [`eval/cord-tax-labels-2026-11-18.md`](eval/cord-tax-labels-2026-11-18.md).

### WildReceipt train shard 1: tax in state lines, VAT tables and "includes GST" (2026-11-17)

WildReceipt's second train shard (633 photos, unread until now) was the development set. Its
unread taxes fell into four shapes, now read: Target's state tax line glued to its code
(`T=CTTAX 6.3500%on $117.15 $7.44`, `NJTAX`, `FLTAX`); a net / tax / gross row (`566.96 68.04
635.00` under `Net.Amt VAT Amount`, or `34.17 20.00% 41.00` with the tax amount lost, read as
gross less net when the rate makes it); `TOTAL INCLUDES GST OF 0.26` and `GST INCLUDED IN
TOTAL` as tax lines; and `TVA8%`, `IGIC7%`, `20.600TAX`, `TAXAMT`. `cleanOcr` no longer turns
`USS12.50` (US$ with the $ read as S) or `ECS161.04` into 5512.50 or 5161.04. Development shard: CLI tax 262 to 273 of 335,
RapidOCR alone 235 to 256, totals unchanged. Held-out test, scored once: CLI tax 204 to 207 of
272 and totals 359 to 360 of 405; page tax 202 to 205, totals 358 to 359 (RapidOCR alone: no
right answer went wrong). The test gain is small; the largest group is one chain's layout. SRD's US photos and CORD's text
do not move.
Details: [`eval/wildreceipt-train1-2026-11-17.md`](eval/wildreceipt-train1-2026-11-17.md).
Tests: `receipt-wildreceipt-train1.test.mjs`.

### Four tax shapes left from WildReceipt shard 1: HTVA, TUA, VAT in a subtotal, 0.00 (2026-11-17)

The four tax misses that [`eval/wildreceipt-train1-2026-11-17.md`](eval/wildreceipt-train1-2026-11-17.md)
left open, each now read: `Total HTVA 69.06` (French net before VAT) is a subtotal, not the
total, so two TVA lines at 10% and 20% add onto it to make 78.30; a `HT TIC TUA` header (TVA and
TTC bent by OCR) heads a net / rate / gross row, read in either decimal mark
(`LOCAL 412.50 20% 495,00`, tax 82.50); `Subtotal(12%VAT) Php32.14` is the VAT inside the total
when the total split at 12% gives it (else it stays a subtotal); and a `0.00` tax on a `0.00`
slip is kept. The OCR readings of those photos could not be re-scored here (huggingface.co is
refused from this session), so each fix is held by a test written in the photo's shape, and the
text corpora that are reachable confirm nothing else moved: CORD validation, train and test
text and SROIE's 626 receipts score exactly as before. Details:
[`eval/wildreceipt-tax-shapes-2026-11-17.md`](eval/wildreceipt-tax-shapes-2026-11-17.md).
Tests: `receipt-wildreceipt-train1.test.mjs`.

### WildReceipt re-scored; VAT tables with a row per rate (2026-11-17)

With huggingface.co reachable again, shard 1 and the held-out test were read again and the
four tax shapes above were scored. On shard 1 they add 3 taxes of 335 (CLI 273 to 276), and on
the held-out test 1 of 272. Re-scoring also turned up a shape they missed: a VAT table with a
row per rate (`TUA5.50% 10.26 0.56 10.82` over `TUA10.00% 9.07 0.91 9.98` on a 20.80 receipt),
where only the first row's tax was kept. When the rows' gross amounts make the total, every
row's tax is now added. A row right under a table row counts as a row, and a row of rate, tax
and gross whose net was lost is read when the gross at that rate gives the tax. Held out, from
before the four shapes to now: CLI taxes 207 to 209 of 272 and the page 205 to 208, with no
right answer turned wrong and no total moved. CORD text and SROIE did not move. Details:
[`eval/wildreceipt-rescore-2026-11-17.md`](eval/wildreceipt-rescore-2026-11-17.md); per-receipt
diffs between two parser copies: `eval/receipt-version-diff.mjs`.
Tests: `receipt-wildreceipt-train1.test.mjs`.

### CORD train shards 1-3: 600 more unseen photos (2026-11-17)

The other three CORD train shards, read for the first time, score 356 of 583 totals (61.1%)
through the CLI, in line with shard 0 and test: the unseen-photo rate holds near 60%. Two
changes, written from their misses only: a whole-unit total ending in `00` and one digit
(`Total 6.008`) is the amount ending `000` when a reading prints it (8 of CORD's 972 totals end
that way, 604 in `000`); and the page writes a rupiah total with no line of its own as
`Total 110,000`, not `Total 110000.00`, which the slip read back as another amount. Train photos
356 to 362 (CLI) and 341 to 357 (page); validation page 67 to 70; held-out test, scored once,
55 to 56 (CLI) and 53 to 55 (page); CORD text unchanged. A fifth reading of the bottom half of
the photo found the total on 5 of 149 OCR-bound misses, so it was dropped. Details:
[`eval/cord-train-shards-2026-11-17.md`](eval/cord-train-shards-2026-11-17.md).
Tests: `cord-train-shards.test.mjs`.

### A change line read as HANGE, a stray TL, a total under its subtotal (2026-11-17)

SRD 1022 read 7.07 for 37.37. Three narrow fixes, each needed: the change line is also found
when OCR drops its C (`HANGE 62.63`), so cash less change backs 37.37; a `tl` after a tax word
on the same line ("Tax (8.75%): 44 Of tl") no longer makes that line a total; and a reading's
total line under a subtotal the same reading prints loses its total-line point, but only when
some reading's cash less change is above that subtotal (without that condition it traded two
wrong CORD validation totals for other wrong ones). SRD CLI totals 154 to 155, tax 134 to 135;
the page, CORD validation and held-out test photos, CORD text and SROIE text unchanged, and
1022 is the only receipt that changed. Details:
[`eval/change-ocr-2026-11-17.md`](eval/change-ocr-2026-11-17.md).
Tests: `receipt-crosscheck.test.mjs`.

### A second OCR engine for photos: `--rapidocr` (2026-11-17)

`receipts photo.jpg --rapidocr` reads the photo with [RapidOCR](https://github.com/RapidAI/RapidOCR)
instead of tesseract: PaddleOCR's detection and recognition models run through ONNX Runtime
on your own CPU, offline (`pip install rapidocr-onnxruntime`, Apache-2.0; set
`RAPIDOCR_PYTHON` to a virtual environment's python if it is not in `python3`).
`rapidocr_rows.py` turns its word boxes into rows for the same parser. One reading, no parser
change, totals right:

| photos | tesseract, `--four-pass` | `--rapidocr` |
|---|---|---|
| CORD train shard 0 (development) | 122 / 196 | **172 / 196** |
| CORD validation | 70 / 98 | **83 / 98** |
| **CORD test, held out** | 55 / 95 | **80 / 95** |
| SRD, 196 US photos | 156 / 196 | **180 / 196** |

(Tesseract column before PR #16822, whose rules make test 56 of 95.) Taxes rise too (CORD test 16 to 28 of 41, SRD 135 to 142 of 185). It came out of a
failed idea: 49 of 81 CORD train misses had the total in no tesseract reading, and a crop to
the bottom third or five image variants (normalised, colour channels, a local threshold)
recovered at most 3 of them. Nothing was tuned on these photos, so every set but train is
unseen. Mixing RapidOCR with tesseract's four readings in the vote lowered totals (170 on
train), so it is a separate mode for now. (Since 2026-11-17 the page runs RapidOCR too: "RapidOCR on the page" below.) About 3.6 s a
photo on one core. Details:
[`eval/rapidocr-2026-11-17.md`](eval/rapidocr-2026-11-17.md). Tests: `rapidocr.test.mjs`.

### RapidOCR on the page (2026-11-17)

The receipts card's "Receipt photos" control now reads each photo with RapidOCR first, in the
browser, then with tesseract.js four times, and all five readings vote, as
`receipts --rapidocr --four-pass` does. `rapidocr-web.mjs` is a JavaScript port of
rapidocr-onnxruntime 1.4.4's pipeline (detection post-processing, crops, the 180-degree
classifier, CTC decoding) run through ONNX Runtime Web 1.20.1; the models (PaddleOCR PP-OCRv4,
Apache-2.0, npm `@gutenye/ocr-models@1.4.2`, outputs equal to the wheel's) and the runtime,
about 16 MB, come from jsDelivr the first time a photo is read with the box ticked. Nothing is
uploaded. Untick "also read with RapidOCR" for tesseract alone; if RapidOCR cannot load, the
page falls back to tesseract and says why.

On SRD's 196 US receipt photos, what the page puts in the receipts box:

| page readers | totals right | tax right of 185 |
|---|---|---|
| tesseract four (before) | 155 | 135 |
| **RapidOCR first, then tesseract four (now)** | **184** | **166** |

In headless Chromium the port's text matches the Python engine's on 170 of 199 photos and on
98.5% of lines. Two pieces had to be exact to get there: pyclipper's round-join unclip and
OpenCV's fixed-point linear resize. Caveats: tesseract's column was made with tesseract 5.3.4,
not tesseract.js; RapidOCR takes about 4 s a photo on one WASM thread (since the same day it
reads in a Web Worker: "RapidOCR in a Web Worker" below); CORD photos were not re-read (huggingface.co refused the
session's proxy). Details: [`eval/rapidocr-web-2026-11-17.md`](eval/rapidocr-web-2026-11-17.md).
Tests: `rapidocr-web.test.mjs`; the page end to end: `eval/photo-ocr-browser.mjs`.

### RapidOCR in a Web Worker (2026-11-17)

RapidOCR used to run on the page's own thread, so the tab froze for 3 to 4 seconds per photo.
It now runs in a Web Worker (`rapidocr-worker.mjs`): the page draws the photo and hands over
its pixels, and the worker runs ONNX Runtime Web and the rest of the pipeline. RapidOCR and
tesseract.js (which has its own worker) now read each photo at the same time. In headless
Chromium on SRD photos:

| | text | ms per photo (whole read, median) | tab's longest stall (median) |
|---|---|---|---|
| before | | 7,603 | 3,307 ms |
| **now** | identical (200 of 200 RapidOCR readings, 21 of 21 settled) | **5,326** | **51 ms** |

A browser that cannot start a module worker falls back to the old path, and the status line
says so. Details: [`eval/rapidocr-worker-2026-11-17.md`](eval/rapidocr-worker-2026-11-17.md).
Tests: `rapidocr-worker.test.mjs`; in a browser: `eval/rapidocr-worker.mjs`,
`eval/photo-read-timing.mjs`.

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
- January 31 file-and-pay rule, 2026-11-11 (`penalty2210.mjs`, `annualized.mjs`, CLI `--paid-with-return DATE:$`, page "Tax paid with the return"; `penalty2210.test.mjs` +2 tests, `annualized.test.mjs` +1). From the 2025 instructions, "Line 11" (pdftotext of irs.gov/pub/irs-pdf/i2210.pdf): "If you file your return and pay the tax due by January 31, 2026, include on line 11, column (d), the amount of tax you pay with your tax return. In this case, you won't owe a penalty for the payment due on January 15, 2026." A payment marked `withReturn: true` dated after the January due date and by January 31 now goes in column (d); the worksheet applies what is left of it, after column (d), to earlier columns only (line 1b), never to (d) a second time. Filed February 2 it is an ordinary payment dated the filing day (Table 1), 18 days late on the January installment. Example (60,000 earned evenly through 2025, single, nothing else paid, 12,000 paid January 30): 349.80 as a plain late payment, 341.98 marked as paid with a return. The January 31 date moves past a weekend or DC holiday since 2026-11-14 (`fileAndPayDeadline` in `taxforms.mjs`; IRC 7503, "the last day prescribed ... for performing any act", applied to IRC 6654(h)): for tax year 2025 the last day is Monday, February 2, 2026, which secondary tax calendars also give; the 2025 Form 1040-ES itself was not read (irs.gov refused the session). 2024 stays January 31, 2025 (a Friday); 2026 moves to February 1, 2027. Pinned in `estimated-due-dates.test.mjs` and `penalty2210.test.mjs` (a February 2, 2026 payment owes nothing; February 3 is 19 days late). Also fixed: the missing-rate warning printed "7.000000000000001%". Open question for a reader who prepares returns: the instructions' "Do not enter any withheld federal income tax ... on line 1b" means a later column's withholding, which Section A line 14 uses for an earlier column's shortfall, never stops that earlier column's days, so with even withholding a shortfall in column (a) runs to April 15 while column (b) also shows its own full shortfall. This follows the text as printed, unchecked against the IRS's own computation or IRC 6654(b)(3)'s crediting order.

### Time/Timestamp date headers and HELD rows (2026-11-04)

A bank CSV whose date column is headed `Time`, `Timestamp`, `Date/Time` or `Date Time` (the layout neobanks such as Up use, from memory, not a real export) was not recognised: the header was skipped as a preamble and the Status word became the payee. These are now date headers, and `HELD` joins the not-booked statuses (pending, declined and so on) so card holds are skipped and listed in problems. Test: `held-status.test.mjs` (made-up rows). Full ai-bookkeeper suite: 2,229 pass.

### Excel day-number dates (2026-11-04)

`parseDate` reads a five-digit number from 25569 to 60000 as an Excel day number (1900 system), which is what a bank CSV re-saved from Excel with General format holds. The 1904 system is not detected. Test: `excel-serial-dates.test.mjs` (made-up rows).

### Gumroad sales export (2026-11-06)

`readStatement` read a Gumroad sales CSV (Item Name, Sale Price, Gumroad Fee, Net Total, Date) as zero rows. It now books Net Total under the item name. Layout from memory; made-up rows only (`gumroad-sales.test.mjs`). A real export is wanted.

### Platform exports keep customers out of descriptions (2026-11-07)

`platform-exports-privacy.test.mjs` (5 tests, made-up rows, layouts from memory like the readers it covers) reads a Gumroad, Paddle, Patreon, Ko-fi and Lemon Squeezy export carrying a buyer name and email and asserts neither reaches a row description, which feeds the categorizer, payee memory and the CSV/QBO exports. All five passed with no code change; the test guards the property. Square's export was not added (its layout is covered in `square-export-net.test.mjs`). No real export seen.

2026-11-08, `salestax return` filing notes for AZ and IN (`stateFilingNote`, `salestaxreturn.test.mjs`, 53 pass): Arizona's date stays the statutory 20th, with a note that ADOR's due-dates page lists later month-end paper and electronic deadlines and that one guide says penalties still run from the 20th; Indiana's 30th stays, with a note that guides conflict (20th for larger monthly filers). Kansas's 25th was confirmed by search excerpt of a KDOR notice, no change. Sources were search excerpts only: every state tax site (tn.gov, azdor.gov, in.gov, tax.nd.gov and others) is refused by the session proxy, so no page was read. Also tried and refused by the session's permission classifier: fetching strangers' real Wells Fargo exports from public GitHub repos (personal data); that route was not worked around, so Wells Fargo stays unmeasured on a real file.
