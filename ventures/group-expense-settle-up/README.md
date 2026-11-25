# Group Expense Settle Up

**Split a trip, a shared house or a party, and settle it in the fewest payments.**
A free, source-available (FSL-1.1-MIT) browser page: log who paid what in any currency, split
equally, by shares, exact amounts or percent, and get every balance to the cent
and the smallest list of who pays whom. No app, no account, no limit; one share
link carries the whole list.

Live: https://marisstella.app/group-expense-settle-up/

## Why someone would use it

Whoever holds the receipts after a group trip has three problems: costs that
not everyone shared, costs paid in another currency, and a group chat that
wants one short answer. Expense-sharing apps solve it if every person makes an
account; a spreadsheet solves it if someone builds one. This page does the
arithmetic properly with neither: shares that add back to the bill to the cent,
each foreign cost converted once, and an exact search for the fewest payments
rather than the usual largest-to-largest rule.

## Run it

Static page, ES modules, no build step:

```
cd ventures/group-expense-settle-up
python3 -m http.server 8000      # then open http://localhost:8000
node --test calc.test.mjs page.test.mjs usage.test.mjs
```

## The line format

```
[YYYY-MM-DD] payer amount [CUR] description [/ who shared it]
[YYYY-MM-DD] from -> to amount [CUR] [note]        a payment already made
```

- No slash: everyone shares equally.
- `/ Ana, Ben` equal; `/ Ana:2, Ben:1` shares; `/ Ana=30, Ben=20` exact
  amounts (must add to the bill); `/ Ana=60%, Ben=40%` percents (must add to
  100); `/ all -Ben` everyone but Ben.
- Two payers: `Ana+Ben 50 boat` (equal), `Ana=30+Ben=20 50 boat` (amounts).
- Currency: a code after the amount (`120 USD`) or a symbol before it (`€12`,
  `£8`; `$` is the main currency when that is a dollar, else USD). Amounts
  accept `1,234.56`, `1.234,56`, `12,50`.
- `#` starts a note line. Every problem is reported with its line number.

Names are matched case-insensitively against the people list. A name cannot
contain `,`, `/`, `+`, `=` or `->`, and should not start with a digit.

## How it works (`calc.mjs`)

1. **Cents.** Each cost is converted once into the main currency's minor units
   (ISO 4217 digits: JPY 0, KWD 3, most 2) and split by largest remainder
   (Hamilton): floor of each exact share, the leftover units to the largest
   remainders, ties to the person listed first. Parts always add back to the
   bill; several payers are allocated the same way.
2. **Balances.** paid − share + payments sent − payments received. They sum to
   zero exactly.
3. **Fewest payments.** With k people whose balance is not zero, the minimum
   number of payments is k minus the largest number of groups the balances can
   be cut into with each group summing to zero (each group of s settles in
   s − 1). Finding that cut is NP-hard in general (Verhoeff 2004). The page
   solves it exactly by dynamic programming over subsets:
   `best[mask] = max over i in mask of best[mask \ i] + [sum(mask) = 0]`,
   then walks the argmax chain back to read off the groups, and settles each
   group largest-to-largest. Up to 20 people with a balance (2^20 masks,
   about 1 MB of state) this runs in the browser in well under a second
   (tested). Above 20 it pairs off exactly opposite balances, settles the rest
   largest-to-largest, and the page says the answer is not proven minimal.
4. **Other modes.** Largest-to-largest (at most k − 1 payments, what most
   apps do) and pay back directly (each person's share owed to that cost's
   payers in proportion to what they paid, netted per pair).

## How often the exact search matters (`eval/greedy-gap.mjs`)

Not often, on simulated trips. 2,000 seeded random trips per row (3-12
expenses, 60% shared by everyone, the rest by a random subset):

| Amounts | 4 people | 6 | 8 | 10 |
|---|---|---|---|---|
| Multiples of 5 | 0.0% | 0.0% | 1.3% | 3.6% |
| Random cents | 0.0% | 0.0% | 0.0% | 0.0% |

(share of trips where the exact answer is one payment shorter than
largest-to-largest; never more than one in these runs). Zero-sum subgroups
need balances that cancel exactly, which round amounts and larger groups make
likelier and cent amounts almost never do. These are simulations, not real
groups; the page counts `fewer_than_greedy` against `settled` locally so a
real reading is possible later. The exact search costs well under a second, so
it stays the default, and the page says when it beat the shortcut.

## Spec sources

- Minimum number of transfers: Tom Verhoeff, "Settling Multiple Debts
  Efficiently: An Invitation to Computing Science", *Informatics in Education*
  3(1), 2004: the minimum is the number of nonzero balances minus the maximum
  number of zero-sum parts. `calc.test.mjs` checks the solver against a brute
  force over every set partition on 300 random groups, and pins a hand-worked
  case (+3 +5 +4 +6 −6 −12) where largest-to-largest takes 5 payments and the
  minimum is 4.
- Rounding: largest-remainder (Hamilton) apportionment, pinned by hand-worked
  splits (100.00 three ways is 33.34, 33.33, 33.33) and by the example trip's
  Dev balance (−17.62) worked line by line in the test.
- The person who would sign it off is any bookkeeper: every figure is
  arithmetic on typed amounts and rates, shown per person in the balances
  table and in the CSV.

## Privacy

Everything runs in your browser. Names, amounts and rates are never uploaded;
there are no accounts, cookies or analytics vendors. The latest list is kept in
this browser's local storage so it is there when you come back; Clear removes
it. A share link holds the whole list in the part after `#`, which browsers do
not send to the server, but anyone holding the link can read it. Anonymous
feature counts (`settled`, `example_loaded`, `line_added`, `marked_paid`,
`copied`, `link_made`, `link_opened`, `csv_downloaded`, `mode_*`,
`fewer_than_greedy`) stay in local storage; the page has an off switch, and Do
Not Track and Global Privacy Control are honoured.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax or financial advice, and it does
not replace a qualified professional. **You are responsible for reviewing and
verifying its output before relying on it**, and for any payment you send
because of it. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. Keep the share link or a CSV.

## Not done yet

- Exchange rates are typed by hand; no rate lookup (it would send data out).
- No receipts, reminders or accounts, on purpose.
- A share link grows with the list (about 850 characters for the 8-line
  example); a very long trip may outgrow what some chat apps keep in a link.
- Next: a "same as before" merge of two edited links, and a printable summary.

## Licence

FSL-1.1-MIT, see `LICENSE`.
