---
kind: polish
topics: [design, browser, software-for-routine]
date: 2026-11-19
---
# Polish, 2026-11-19: /ask/'s example questions are checked in a browser; question words stop ranking the assistant's links

Track: polish/0. PR #17735. Picked `polish-2026-11-19-ask-page.md` item 2 ("The example questions
are checked by hand"), which `polish_queue.py` listed four times (carried over by the
phone-table-cells, stacked-tables and hub-links reports). No open PR claimed it (the PR search for
`ask in:title` found only #8159, on stockx).

## What changed

- `platform/pages/ask-suggestions.mjs`: the expectation for each `ASK_SUGGESTIONS` question
  (`link` pattern, `passage` pattern, `maxLinks`) and `judgeReply`, `coverage`, `splitReply`.
- `platform/pages/ask-suggestions-check.mjs`: serves `dist`, opens `/ask/` at 390 px, taps each
  `.pa-try` button on a fresh page, reads the last `.pa-bot` reply, judges it. Exit 0 / 1 / 2 as
  `fold-check.mjs`. About 2.3 s over the built site. Same `DIST`, `BASE_URL`, `PLAYWRIGHT`,
  `CHROME_PATH` variables.
- `platform/pages/serve-dir.mjs`: the static server `fold-check.mjs` had inline, moved out so this
  check (and the next) don't paste a copy. `fold-check.mjs` now imports it (rerun: for-retirees
  passes at 587 px, as before).
- `platform/pages/assistant/fill.mjs`: `QUESTION_WORDS` and `rankForQuestion`.
  `assistant/client.js`'s `searchSite` uses it, and the question path computes the page
  passage first so it can ask for strong matches only.
- `platform/pages/ask-suggestions.test.mjs`: 9 tests, including main's privacy reply failing.

## What the check found on its first run

All three questions answered, so a plain "is it empty" check would have passed. But the privacy
question ("Does what I type leave my device?") quoted the right FAQ answer and then listed five
**unrelated** tools under it: "Where does the sleeve end on my arm?", "Why does my semver range
skip prereleases?", "Does my job qualify for 'no tax on tips'?", an SMS segment explainer and a
Walmart WFS box size page.

Cause: the site search's stopwords (`SEARCH_STOPWORDS`, build.mjs) drop what/which/how but keep
does, my, can, much. A search box rarely sees those words; a typed question nearly always has
them. They matched 2,204 index entries, led by titles that start "Does my…". After dropping them, "type" +
"leave" still matched the chimney sweep calculator, because the index's text field is a long bag
of words.

Fix (the assistant only; the hub search box is untouched):
1. Drop `QUESTION_WORDS` (do/does/did/can/could/should/would/might/must/my/me/our/we/us/much/many…).
2. A **strong** match scores at least 5 by `searchScore`'s own weights (4 for a word in the name,
   1 in the text): one question word in the name plus another anywhere. A one-word question needs 4.
3. When the page itself answered (`bestPassage`), only strong matches are listed. Otherwise
   strong matches lead, with the old ranking kept as a fallback when none is strong.

Tried and reverted: adding tool/tools/free to the question words. "Which tool prices a roofing
job?" then lost "Free tools for roofing, gutter and siding contractors" and led with junk removal.

## Measured

/ask/ answers, Chromium at 390 px over the local build (before = main's `pf-assistant.js` and
`pf-fill.js` on the same build):

| question | before | after |
|---|---|---|
| Which tool prices a roofing job? | Bid calculators by trade; tools for roofing contractors; price a roof by the square | same |
| What does eBay charge to sell a $40 item? | Where to Sell; *How Much Does StockX Take*; eBay vs Etsy | Where to Sell; eBay vs Etsy; Reverb vs eBay |
| Does what I type leave my device? | FAQ passage + 5 unrelated links (1,740 px reply) | FAQ passage only (640 px) |

Twelve other typed questions (top 3 from the index, no page passage), judged by eye:
**7 better, 3 the same, 1 slightly worse, 1 mixed.**
- Better: "How much should I charge to mow a lawn?" (sealcoating, drywall, chimney sweep →
  lawn mowing guide, Lawn Care Bid Calculator), "How much do I need to retire?" (rib knit for a
  hoodie → FERS retirement planner), "How much does Poshmark take?" (Fiverr, Upwork → Poshmark
  Fee Calculator), "What does Amazon FBA cost for a small item?", "Can my landlord keep my
  deposit?", "Can I deduct my home office?", "How many hours can my employee work?".
- The same: no tax on tips, "Which tool checks my invoice?", "What should I charge for house
  cleaning?" (duct cleaning both times).
- Worse: "How do I price a bathroom remodel?" (change order, dog grooming → carpet cleaning,
  daycare, home inspection: poor both times; there is no bathroom tool).
- Mixed: "How much does Etsy take from a sale?" (three other marketplaces → Etsy pages, but
  not a fee page).

The check fails on main's assistant files (`maxLinks: 0` on the privacy question) and passes with
this PR. A renamed question with no expectation fails with "no expectation in ask-suggestions.mjs".

Screenshots: `img/polish-2026-11-19-ask-suggestions-{before,after}-390.jpg`.

## Still weakest, and what I would do next

1. **Register the check.** `ask-suggestions-check` belongs in `browser_checks.py`'s `CHECKS` and
   `browser-checks-ci.yml` next to fold-check. Both are control plane: one small PR for all the
   unregistered checks (framerate, band-gap, sticky-fit, fold, ask-suggestions).
2. **"How much does Etsy take?" doesn't find an Etsy fee page.** "Free Etsy fee, profit and ads calculators" is in the index;
   find why it ranks below "Etsy bookkeeping" (probably "take" and "sale" hit the bookkeeping text). Same for house cleaning (a house cleaning
   Quote Calculator is in the index, and "house" + "cleaning" are both in its name, yet duct and dryer vent cleaning outrank it; likely "charge" matching their "How much to charge" titles).
3. **The hub's search box keeps does/my/can/much.** For short queries that's right (people type
   the title). For long questions typed into it, the same rule could apply when the query has
   five or more words. Measure on the hub first.
4. **The floating panel on tool pages** uses the same `searchSite`, so it gets the fix, but no
   check covers it. A tool page with a FAQ (e.g. `/ebay-fee-calculator/`) would be a second target.
