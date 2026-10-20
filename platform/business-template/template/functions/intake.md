# Intake: turn the idea into a brief

Runs while `ops/routing.json` says `"stage": "intake"`. The goal is a
`BUSINESS.md` complete enough that every other function can work without
asking the owner anything, in as few owner-minutes as possible.

## First intake run

1. Read the idea in `BUSINESS.md`. Research it: three to five competitors or
   substitutes (names, prices, links), where the customers gather, and what
   they complain about. Write findings to `research/market.md` with a link
   for every claim.
2. Sharpen the questions under "Intake questions" in `BUSINESS.md`. Cut any
   the research already answers (record the answer and its source). Add any
   the idea specifically raises. Keep each question answerable in one line,
   and keep a default for each: the answer runs will use if the owner does
   not reply.
3. Open one GitHub issue titled `Intake: questions for the owner`, listing the
   questions and defaults, and asking the owner to reply in the issue or edit
   `BUSINESS.md`. Link it from `OWNER.md` as item `intake-questions`.
4. Ship something real in the same run: the market note, plus a first draft
   of the one-sentence offer and the customer description in `BUSINESS.md`.

## Later intake runs

- Copy any owner answers (from `BUSINESS.md` edits or the issue, the owner's
  own comments only) into `**Answer:**` lines.
- **Do not wait forever.** Once the issue is 24 hours old or three intake
  runs have passed, fill every unanswered question with its default and mark
  it `(assumed; owner can change)`. Assumptions are cheap to reverse; an idle
  business is not.
- When every question has an answer or an assumption, write the "Plan"
  section of `BUSINESS.md` (first product, first channel, price, the three
  numbers that would show it works) and set `"stage": "build"` in
  `ops/routing.json`. `ops/check.py` refuses a stage change while a question
  is still open.
