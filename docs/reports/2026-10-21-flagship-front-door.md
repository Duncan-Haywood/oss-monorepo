# Why a day-count adder led the front door: brief for an agent reader

**Date:** 2026-10-21. **Reader:** an LLM agent choosing venture work, scoring
a venture, or touching the hub's featured row. **Human version:**
[`../posts/2026-10-21-a-tool-has-to-beat-asking-a-chatbot.md`](../posts/2026-10-21-a-tool-has-to-beat-asking-a-chatbot.md).
**Asked by:** the owner, 2026-10-21, on seeing State Residency Day Counter
("How many days have I spent in each state, and am I near the 183-day
line?") at the front of the site: "the math behind this is basically basic
arithmetic ... analyze what led to this ... propose ways to fix the problem
going forward." Earlier study of the same pattern:
[`2026-10-16-calculator-glut.md`](2026-10-16-calculator-glut.md). This brief
covers what happened after that fix.

## Answer

1. **The front door ranked "depth" by `.html` file count.** `renderHub` in
   `platform/pages/build.mjs` filled "Featured: the fullest tool in each of
   the largest sections ... Each one goes deep" with `exampleTools(items, 1)`,
   which sorts by `pageCount`, the number of `.html` files in the venture
   folder. The day counter has 11 (one tool, ten SEO explainers), so it led
   the row. It is **not** in `portfolio/flagships.yaml`. **Fixed in this PR:**
   the row now leads with `flagshipSlugs()` (the flagship file, in order) and
   only fills leftover slots by page count. Test:
   `the featured row leads with the flagships` in `build.test.mjs`.
2. **The work unit is one merged PR, so tools grow by the smallest mergeable
   slice.** The day counter has 56 commits and 46 run records. The 29 with a
   measured `usage` block took a median of **2.9 active minutes** and $21.17
   in total at API list prices. Their own `human_equivalent.basis` reads "one rule row, test, and
   four text edits", "writing and testing a guide page", "research one
   statute, edit rules, pages, test". Each run passed `goals.md` "How a run
   is scored" (integrity, merged, errors, cost, friction). None of those
   five measures asks whether the tool beats the alternative.
3. **"Deepening" a flagship turned into adding pages.** Of einvoice-preflight's
   17 commits since 2026-10-16, 16 add or link a country mandate page.
   One (#8982, the official Schematron rules in plain JS) is engineering.
   The `next:` fields in `flagships.yaml` grow by a sentence per run. The
   changepoint entry is now about 1,300 words.
4. **The venture scorer rewards being cheap, not being hard.** Every static
   page scores `gross_margin: 10` and `autonomous_ops: 10`
   (`portfolio/scoring/venture-scores.yaml`). The day counter's composite is
   6.83, with its floor on `ai_leverage: 4`. No dimension asks "could a
   chatbot do this?"
5. **The liability guardrail leaves arithmetic as the safe region.** The
   day counter's gate note: "arithmetic on user-typed dates, never states
   anyone's tax residency." That boundary is correct, but it removes the
   judgment, which is the hard part of residency. Depth therefore has to come
   from data and engineering, not from advice.
6. **No outside signal ever arrived.** Every venture is `stage: prototype` and
   no row in `portfolio/usage/usage.yaml` has a non-null `live_url_visitors`.
   None of the 13 distribution workflows has ever posted
   ([`2026-10-21-discovery-switched-off.md`](2026-10-21-discovery-switched-off.md)).
   From this container on 2026-10-21, the catalogue root returned GitHub
   Pages' "Site not found" page. That was not confirmed from outside: the
   proxy may differ from a logged-out browser. With no users and no
   visit counts, proxies (pages, tests, merged PRs) were the only feedback.
7. **Meta-work crowds out product.** From 2026-10-16 to 2026-10-21 there
   were 1,831 non-merge commits on `main`:
   - 1,417 (77%) touched agent instructions or run records.
   - 1,364 run records and 110 reports and posts were added.
   - Flagship code added 7,729 lines.
   - About 20 of the 49 posts are about the agent fleet itself.

   The owner gave the same direction three times
   (2026-10-20 opinion, 2026-10-20 "depth over calculators", 2026-10-21
   "twenty hours"), and none of it reached the router or the scorer, the
   same failure the 10-16 report named.

## The test to apply (owner, 2026-10-21)

> "tools should have sufficient work required that it's not replaceable by
> chatgpt in less than a minute or two at least if not 20 minutes of chatgpt
> working as a better rule of thumb. there should be real depth in the work."

Before starting or deepening a tool, write down in one sentence each:

- **What a chatbot does with a voice or data dump in two minutes.** For
  the day counter: it counts days per state from a pasted trip list and
  quotes the 183-day rule. That is the whole value proposition.
- **What it does in twenty minutes of agent work.** It can also fetch statute
  text, write a calendar file and draft a summary.
- **What this tool does that neither does.** Name it: a solver, an exact
  method from a paper, a validator against an official rule set, data a
  chatbot does not have, or a private local pipeline over files a person
  will not paste into a chat.

If the third line is empty, do not build it, and do not deepen it with rows
or pages. Better or significantly cheaper than asking a chatbot is the bar.
Cheap to replicate is acceptable; trivial to replicate is not.

## Proposed fixes, in order of leverage

1. **Front door shows flagships** (done here). Rank by a list someone chose
   for engineering, not by a count a run can raise by writing pages.
2. **Put the chatbot test in a file a check reads.** Add a `beats_chatbot:`
   block to `VENTURE.yaml` with the three lines above. Have the router's
   "Deepen" task and the featured row skip ventures without it. Have the
   scorer add a `replication_cost` dimension (minutes of chatbot work to
   match the output), and cap `composite` for a venture whose answer is
   under two minutes. Prose alone has failed three times; this has to be
   code.
3. **Score a run on what it changed for the user, not on whether it merged.**
   Add a line to `goals.md` "How a run is scored": a run on a flagship
   reports the capability it added (a new input, a new exact method, a
   measured improvement), and a run whose diff is only rule rows, guide
   pages or links counts as upkeep, not as the run's useful thing.
4. **Freeze page-and-row growth on arithmetic tools.** No new guide pages
   or table rows on a venture that fails the test, and no red-team runs on
   them. Upkeep for real bugs still counts.
5. **Give the day counter a reason to exist or let it rest.** The one part
   with depth is #7884 (import the phone's Timeline.json export). A residency
   audit turns on proof of where you were, not on the count. A local
   pipeline that reconciles location history, card statements, photo EXIF
   and calendar exports into a day-by-day record would be work a chatbot
   cannot do on private files in twenty minutes. It would show its
   conflicts and gaps, and export an evidence log. That is the version
   worth building; failing that, take it off the front door and stop
   deepening it.
6. **Get one real reading before more SEO.** Confirm the site is served
   logged-out (owner), switch on the counter, and stop adding explainer
   pages until visits can be counted.
7. **Cap meta-work.** A run's write-up extends an existing doc unless the
   subject is new; a report per run is not the deliverable. This brief
   replaces a separate opinion file: the owner's words are quoted in the
   post and in `goals.md`.

## Method

All counts come from `origin/main` on 2026-10-21, using `git log --numstat`
since 2026-10-16, `prompts/runs/*.json` (fields `usage.time.active_minutes`,
`usage.totals.api_equivalent_usd`, `usage.human_equivalent.basis`),
`ls ventures/*/*.html` and a local `node platform/pages/build.mjs` before and
after the fix. Before the fix, featured row:
state-residency-day-counter, league-schedule-generator,
freelance-retainer-calculator, canonical-tag-check, ebay-fee-calculator,
einvoice-preflight. After: changepoint-detector, einvoice-preflight,
shift-roster-builder, photo-editing, quick-pick-survey,
league-schedule-generator. No chatbot was run to time the two-minute
claim. It is the owner's judgment, and the check in fix 2 asks each venture
to state it.
