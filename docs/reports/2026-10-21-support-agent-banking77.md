# Support Agent on BANKING77: what moved the numbers (2026-10-21)

For agents extending `ventures/support-agent/` or building other "answer or hand off" systems. The public write-up is
`docs/posts/2026-10-21-ai-customer-service-that-knows-when-to-hand-off.md`; the method and every test-split run are
in `ventures/support-agent/fixtures/banking77/README.md`.

## Setup

- 22 articles written from 34 intent names (`kb.md`), 20 account-specific intents left uncovered (expected `handoff`).
- `dev.csv` (training split, 40 per intent) for every tuning decision; `examples.csv` (next 40 per intent) as labelled
  past tickets; `test.csv` (test split, 2,160 rows) scored with everything fixed.
- The headline metric is right answers under a cap on wrong answers (5% of answers), not accuracy. Handing off costs
  a few minutes of a person; a confident wrong answer costs trust.

## What moved the numbers (dev split, in order)

| Change | Effect on dev |
|---|---|
| Baseline: help-keeper BM25 over passages, coverage-first ranking | top-1 on answerable 59%; at bar 0, 1,262 wrong answers |
| Drop conversational filler (`COMMON`), fold synonyms (`SYNONYMS`), rank by BM25 not coverage | top-1 73.2%; confidence AUC (right vs wrong answers) 0.739 |
| Logistic confidence over 7 signals instead of raw coverage | AUC 0.839, but only 77 right at the 5% cap (3.6%) |
| Past questions as kNN votes (k=5), the article with half the vote goes first, 3 vote features | 10 per intent: top-1 83.7%, AUC 0.936, 763 right at 5%; 40 per intent: 89.0%, 0.964, 1,020 right |
| k = 3 or 10 instead of 5 | 1,017 and 971 right; kept 5 |

Lesson: the unknown-word weighting was the worst bug. A word the knowledge base never uses was treated as the
rarest, so "would" and "like" dominated coverage and typo-matched to random words. Any coverage or OOV signal needs
a stopword list first.

## Test split (README numbers)

65 / 786 / 1,007 right and 0 / 39 / 66 wrong with 0 / 10 / 40 past questions per intent. The bar set for 5% on dev
gave 4.7% and 6.2% on test: the cap drifts upward on unseen questions, so the product tells deployers to re-run their
own tests after every change.

## Product decisions that follow from the numbers

- **A "suggest" action between the bars.** Without past tickets the safe bar answers almost nothing, so the agent
  offers its two best articles instead (851 of 1,172 offers on test included the right article).
- **The model never decides.** Extractive answers can't invent facts; a model's rewording is rejected unless every
  number, link, email address and promise word is in the cited passages (`model.mjs checkAnswer`).
- **Rules before search** for refunds, legal, safety, security, privacy, anger and card numbers. Asking *how* refunds
  work does not trigger the money rule; asking *for* one does.

## Next, roughly in value order

1. **Embeddings as an optional signal** (local via Ollama `/api/embeddings`, or the deployer's key): a vote feature
   next to BM25, refit on dev, scored once on test. The lexical near-twins (declined payment vs contactless) are where
   it should help most.
2. **Import past tickets from Support Desk**: its CSV export has the subject, the first message and which saved reply
   was used. Map saved replies to articles and you get labelled examples for free.
3. **A second benchmark** outside banking (e.g. CLINC150's out-of-scope split for the "should refuse" side) so the
   built-in bar is not fitted to one domain.
4. Multi-turn: the agent sees only the latest question; a follow-up like "and for the UK?" loses the topic.
