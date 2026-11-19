---
kind: polish
topics: [seo, design]
date: 2026-11-19
---
# Polish, 2026-11-19: /ask/ reads "how much does Etsy take" as a fee question

Track: polish/0. PR #17821. I picked item 1 of "Still weakest" in
`polish-2026-11-19-ask-rare-words.md` ("There is still no Etsy *fee* page in the top 3"). No open PR
had `ask` or `polish` in its title.

## What was wrong

People ask about a marketplace's fee with a verb: "How much does Etsy **take**?", "What does eBay
**charge**?", "How much does PayPal **keep**?". The site's pages use the word "fee". `rankForQuestion`
(`platform/pages/assistant/fill.mjs`) matched words literally, so the verb only found the few posts
titled "How Much Does X Take Per Sale?" and pages that happen to say "take" ("Should I take this
Reverb offer?"). "How much does Etsy take?" got no strong match at all. Neither did "How much does
Poshmark take?", which a unit test had pinned as `[]`.

## What changed

- `feeVerbOf(query)`: matches `does|do|did|will|would <one word> take|charge|keep|cut`. It returns
  the verb unless the subject is a pronoun or an article (`it`, `a`, `they`, `the`...).
- `rankForQuestion`: when that matches, the verb's search forms gain `fee`/`fees`. This is an OR, as
  `searchVariants` already is, so it only widens the match. If the verb was dropped as a catalogue
  stopword (`charge` is one), `fee` is added as its own word.
- Tests (`ask-suggestions.test.mjs`): the Poshmark case now expects the fee calculator. A new test
  checks that `it`, `a plumber`, `paint does it` and `should I take` keep their literal reading. The
  one-word-question test uses a non-fee verb.

## Measured (full local build, real `search-index.json`, 11,455 entries, top 3 strong)

I ran 28 questions: 18 fee questions in this form and 10 controls (how long does it take, a plumber
charges, retire, bathroom remodel, roofing...). 16 changed and 12 stayed the same, including every
control except one.

| question | before | after |
|---|---|---|
| How much does Etsy take? | (none strong) | Etsy fee, profit and ads calculators; profit after fees; eBay vs Etsy fees |
| How much does eBay take? | eBay quantity discount; Poshmark vs Mercari vs eBay; **Reverb offer** | eBay Fee & Profit Calculator; eBay fee calculators shelf; vs eBay's own |
| How much does Poshmark take? | Poshmark take-per-sale post; Poshmark Fee Calculator; … | **Poshmark Fee Calculator** first |
| How much does Depop take? | Depop post; Depop Fee Calculator | **Depop Fee Calculator** first; reseller fee shelf |
| How much does Amazon take per sale? | Amazon bookkeeping; KDP; **Discogs** | Amazon bookkeeping; FBA box fee; low-inventory fee |
| How much does Stripe take? | 1 link | 3 Stripe fee pages |
| How much does PayPal keep? | 1 link (Shopify) | PayPal bookkeeping (fees); Shopify fee calc; PayPal on Shopify |
| How much does Uber take from drivers? | notary / tire van / process server "take" | DoorDash vs Uber Eats fees; gig driving taxes; **tennis feeder** (bad #3) |
| Does Square take a cut? | chi-square; square foot; siding | chi-square; **Square bookkeeping (fees)**; siding |
| How much does StockX take? | StockX post; **StockX Seller Payout Calculator** | StockX post; StockX vs eBay fees; StockX vs GOAT fees (**worse**: the calculator drops to #4) |
| How much do roofers charge per square? | flat roof; metal roof; metal special | metal special; price a roof by the square; flat roof (mixed) |

Shopify, Airbnb, DoorDash and "Etsy take from a sale" reordered toward fee pages. In the last one
the Etsy fee shelf replaces Etsy Profit Calculator at #3. Bookkeeping and "shop on sale" still lead,
on `sale`. Controls that did not change: how long does it take to get a refund / frame a wall, how
much does a plumber charge, how much does it take to retire, how much paint does it take, house
cleaning, bathroom remodel, retire, employee hours, roofing job.

`ask-suggestions-check.mjs` (browser, every /ask/ example question, with `dist/pf-fill.js`
replaced by this branch's `fill.mjs`) passes: "Every /ask/ example question gets an answer, and
every link in it loads."

## Still weakest, and what I would do next

1. **"from a sale" still pulls in Etsy pages that mention a sale.** `sale` scores 4 in "Should I put
   my Etsy shop on sale?". When the fee reading fires, `sale`/`sales` could be treated as part of
   the fee phrase (weight it down) instead of as a topic.
2. **StockX's payout calculator** says "payout", not "fee", so it loses to fee comparisons. Adding
   `payout` as a third form would also help "How much does Airbnb pay hosts?". Measure the same 28
   first.
3. **Plural trade subjects** ("do roofers charge") count as a name. That is harmless here, but
   telling a trade from a brand would need the catalogue's trade list.
4. Carried over: `ask-rare-words` items 2 and 3 (near-stopwords `tool`/`free`/`calculator`; the hub
   search box). The hub's `pf-search.js` doesn't use this rule.

## Reproduce

The script is about 15 lines. It imports `searchVariants`/`searchScore` from `build.mjs` and
`rankForQuestion` from a `fill.mjs` copy inside `platform/pages/assistant/` (a copy elsewhere can't
resolve its imports), reads `dist/search-index.json` with `stop = new Set(stopwords)`, and prints the
top 3 with `strongOnly` for each question.
