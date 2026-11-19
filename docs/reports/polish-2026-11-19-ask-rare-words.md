---
kind: polish
topics: [aeo, search, assistant]
date: 2026-11-19
---
# Polish, 2026-11-19: /ask/ weighs a question's words by rarity

Track: polish/0. PR #17766. Picked item 2 of `polish-2026-11-19-ask-suggestions-check.md`
("How much does Etsy take?" doesn't find an Etsy fee page). `polish_queue.py` listed it open, and
no open PR had `polish` in its title.

## What was wrong

`rankForQuestion` (`platform/pages/assistant/fill.mjs`) gave every query word the same score: 4 in
an entry's name, 1 in its text. For "How much does Etsy take from a sale?" the words left are
`etsy`, `take` and `sale`. "How Much Does Discogs Take Per Sale?" scored 8 (take, sale), the same as
the Etsy bookkeeping page (etsy, sales), and won the tie on index order. Mercari, Poshmark and
Whatnot "take per sale" pages followed. `etsy` is in 0.3% of the 11,387 index entries; `take` is
in 9%.

## What changed

- `fill.mjs`: `questionWordWeights` (ln((N+1)/(df+1)) per word, df = entries the word reaches)
  and `rankForQuestion` sorting by the weighted score. Whether a match is *strong* (the bar
  `strongOnly` uses) is still the plain score, so the change only reorders.
- `ask-suggestions.test.mjs`: 2 tests. The Etsy one fails on main's `fill.mjs` and passes here.
- The hub's search box (`pf-search.js`) is untouched.

## Measured (local full build, real `search-index.json`, top 3)

| question | before | after |
|---|---|---|
| How much does Etsy take from a sale? | Etsy bookkeeping; **Discogs** take per sale; Etsy shop on sale | Etsy bookkeeping; Etsy shop on sale; **Etsy Profit Calculator** |
| What does Etsy charge per sale? | Etsy personalization; deposit %; **pergola** | Etsy personalization; Etsy bookkeeping; Etsy shop on sale |
| How do I price a bathroom remodel? | carpet cleaning; daycare; home inspection | bathroom rough-in; toilet replacement; walk-in shower bids |
| What should I charge for house cleaning? | duct; dryer vent; exterior paint | duct; **House Cleaning Quote Calculator**; duct special |
| How much do I need to retire? | FERS; "When do I need to send a 1099"; SRI crossorigin | FERS; retirement calculators shelf; withdrawal order |
| How many hours can my employee work? | nail tech; git hours; "twenty hours" | nail tech; contractor-or-employee checker; hire another employee |
| Which tool prices a roofing job? | bid calculators; roofing shelf; price a roof by the square | roofing shelf; bid calculators; **barn roof drawing post** (worse #3) |
| What does eBay charge to sell a $40 item? | Where to Sell; eBay vs Etsy; Reverb vs eBay | eBay vs Etsy; eBay multi-item rows (worse #2); Where to Sell |

26 questions in all: 9 better, 14 the same, 2 slightly worse (the last two rows), 1 mixed
("1099 income": a UK redundancy page replaces a state-income-tax post; both poor).
`ask-suggestions-check.mjs` passes before and after (with `dist/pf-fill.js` swapped).
Cost: 42 ms per question on this container vs 29 ms on main (11,387 entries), once per question
asked, not per keystroke.

## Still weakest, and what I would do next

1. **There is still no Etsy *fee* page in the top 3.** "Free Etsy fee, profit and ads calculators"
   (the shelf) has neither `take` nor `sale` in its index text. A question-to-fee synonym
   ("take", "cut", "charge" → "fee" when the question names a marketplace) would fix the family;
   measure "how long does it take" questions for false hits first.
2. **`tool`, `free`, `calculator` carry weight 2 to 3** though every page is one. Treating them as
   near-stopwords for questions only would move the price-a-roof page back above the barn post.
   (The previous report tried dropping `tool` outright and lost the roofing shelf; IDF is the
   gentler lever.)
3. **The hub search box** could take the same weighting for 3+ word queries; measure on the
   same 26 questions (the throwaway script is ~40 lines over `search-index.json`).
