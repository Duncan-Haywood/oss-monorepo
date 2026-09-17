# Card processing fee audit

A free, browser-only tool that splits one month of card processing fees into
the part the card networks set and the part the processor keeps.

**Live:** <https://duncan-haywood.github.io/monorepo-projects/card-processing-fee-audit/>

## The problem

Ask a small business what they pay to take cards and you get an effective rate:
total fees divided by total sales. It is the only number a bundled merchant
statement makes easy to compute, and it cannot answer the question people
actually have, which is *am I paying too much*.

The reason is that the effective rate moves with the business, not only with
the pricing. Two merchants on character-for-character identical processor
pricing — interchange plus 0.25% plus $0.10 — running the same $42,000 month
will show effective rates almost a full percentage point apart if one has a $10
average ticket and the other a $200 one, purely because the per-transaction
cents spread over different amounts. Any rule of the form "over 2.9% is too
high" is right by accident on one of them and wrong on the other.

What is comparable is the three-way split:

| component | who keeps it | negotiable |
|---|---|---|
| interchange | the card-issuing bank, on published network schedules | no |
| assessments | the card network | no |
| processor markup + monthly fees | the processor | **yes** |

A bundled statement prints the total and never the split, which is why a quote
that undercuts a competitor is impossible to evaluate without doing this
arithmetic first.

## What it does

Enter five numbers off the summary page of one statement — card sales,
transaction count, total fees, roughly what share was taken in person, and the
flat monthly fees — and it reports:

- the effective rate and the average fee per transaction;
- an estimate of the network pass-through for that volume and mix, **as a
  band**;
- the processor markup implied by that band, in dollars and as a percentage of
  sales;
- what the same month would have cost under a competing interchange-plus quote,
  priced on the same pass-through so the comparison is like for like;
- two to four observations specific to that statement's shape — the annual cost
  of the flat monthly fees, whether per-transaction cents or the percentage
  dominates at that ticket size, and how much of a poor-looking rate is
  card-not-present interchange nobody can give back.

### Why the estimate is a band

Interchange depends on the exact mix of cards presented, and a regulated debit
card and a small-business rewards card on the same terminal differ by well over
a percentage point. Nothing on a bundled statement reveals that mix, so a single
markup figure would imply a precision the inputs do not carry. Since the point
of the tool is that the number gets taken to a processor, a figure the merchant
cannot defend when challenged is worse than an honest range. The band is
reported everywhere the midpoint is, and the page says why.

The interchange and assessment figures in `RATE_MODEL` are typical published
ranges for US small-merchant traffic. They are an estimate of a blend, not a
lookup of the rates on any particular account, and the page says that too.

## Running it

Open `index.html` in a browser. No build, no dependencies, no server.

```
node --test          # 29 assertions across calc.mjs and usage.mjs
```

## Privacy

Everything runs in your browser. Your data is never uploaded — there is no
network request in the page at all, no accounts, no cookies, and no analytics
vendor. A saved audit stores only the numbers you typed, in this browser's
`localStorage`, and reset deletes it. Anonymous feature events (which features
get used, nothing about who used them) are counted locally and can be turned
off from the footer; Do Not Track and Global Privacy Control disable them
automatically.

This matters more here than on most calculators: monthly card volume is
effectively the business's revenue.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not financial, accounting, or legal advice, and
it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting any
obligation it helps you prepare for. To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. We do not promise uptime,
backups of anything you type, or that a URL will keep working. Do not use this
as a system of record. If a tool needs to survive, export your inputs and run it
yourself.

## Licence

MIT — see [LICENSE](LICENSE). Support is optional and never changes what the
tool does: <https://github.com/sponsors/Duncan-Haywood>.
