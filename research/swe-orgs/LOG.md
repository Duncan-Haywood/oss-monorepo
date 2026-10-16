# Research log: what engineering organisations that ship do

An ongoing log of the `swe-orgs` study: each run reads a new batch of sources on how software companies organise and run engineering, adds them to `data/`, re-scores the catalogue against the run ledger, and appends an entry here, newest first. The project page on the portfolio site shows this log. Numbers come from `experiments/results.txt` as it stood at each entry.

## 2026-10-16 · Batch 6: a testing post, Google's large-scale changes and Toyota's stop-the-line rule

- Added 3 sources and 3 practices (28 practices, 27 sources): Wacker's *Just Say No to More End-to-End Tests* (Google, 2015; P26), Winters, Manshreck and Wright's *Software Engineering at Google* (2020; P27) and Ohno's *Toyota Production System* (1988 English edition; P28). The catalogue's first manufacturing source, which is the track's own field.
- **P28 (anyone may stop the line) is already how this loop works**: a red CI check blocks the merge and a failing test is never skipped. Marked `adopted`. The difference that matters: a stopped line idles people, a stopped session only spends budget.
- **P27 is partly adopted.** The venture side has `regen.mjs` and `sync_tree_counts.py`, which rewrite shared files after a merge. `research/` has only `_homepage/build.py`, which fails on a mismatch and does not fix it, so every research run still hand-edits `README.md` and `projects.json`. Coordination is 2.2% of 495 runs (Wilson 1.2 to 3.9%), so the ceiling is small.
- **P26 transfers in part** and targets the tooling class (3.8%), alongside P19 (a runtime budget per suite). Neither clears the 5% bar.
- **Still no proposal.** The ledger has 495 rows (it had 480); the highest unadopted `yes` row is still P23 at 3.8%.
- Verification was by web search only; none of the three pages was fetched. Wacker's post is often quoted with a 70/20/10 split, which no search result attributed to him, so the catalogue does not use it. The Winters chapter on large-scale changes was not located, so P27 is stated in general terms. Ohno's andon and jidoka rest on a vendor's secondary page, with no page numbers used.

## 2026-10-16 · Batch 5: reversible migrations, a boundary checker's retrospective and a no-backlog rule

- Added 2 sources and 3 practices (25 practices, 24 sources): Xu's *Online migrations at scale* (Stripe, 2017; P23), McGibbon and Salzberg's *A Packwerk Retrospective* (Shopify, 2024; P24), and a third practice from Basecamp's *Shape Up* that the catalogue had not yet taken, no backlog (P25, source S8).
- **P23 is the highest-ranked new row and the first to top the old leaders**: migrate in stages (write both, backfill, switch reads, switch writes, delete the old data last). It targets the tooling class (4.0% of 480 runs, Wilson 2.5 to 6.1%), and it describes what went wrong when the run ledger moved from `prompts/runs.jsonl` to `prompts/runs/` and `swe-orgs/run.py` crashed (batch 4). It transfers as `yes`, with priority 4.0%, still below the 5% bar for a proposal. The tooling class is a keyword match including `bug` and `missing`, so the ceiling probably overstates it.
- **P24 is partly adopted.** `_homepage/build.py` fails when a project is missing from `README.md` or `projects.json`, a boundary check of a kind. Shopify's point that boundaries kept by agreement alone get broken fits, but the collision point here is the shared index files, which a directory check does not touch.
- **P25 is partly adopted** (CLAUDE.md tells runs not to maintain admin queues), but `PROJECTS.md` milestones are a standing list that sessions, which have no memory, need.
- **Still no proposal.** The ledger has 480 rows (it had 474); every failure class moved by under 0.2 points.
- Verification was by web search only, from excerpts and secondary write-ups. Neither new page was fetched. The Packwerk retrospective's claim that its privacy checks caused problems appeared in a single search summary, so the catalogue does not use it. Slack's 2022 incident postmortem was considered and left out because only its listing could be confirmed.

## 2026-10-16 · Batch 4: a CPU-budget postmortem, blameless review and two Amazon ideas; the ledger moved

- Added 4 sources and 4 practices (22 of each): Cloudflare's 2019 outage postmortem (P19), Allspaw's *Blameless PostMortems and a Just Culture* at Etsy (P20), Bryar and Carr's *Working Backwards* (P21) and Vogels's 2006 ACM Queue interview behind "you build it, you run it" (P22). Large-company sources this time, as batch 3 left the early-stage side alone.
- **Cloudflare's change passed a simulated-mode rollout and still took down traffic worldwide**, because nothing measured its CPU cost. It transfers in part to this loop: runs here lose work to suites that outrun the 10-minute tool cap, and no suite has a runtime budget (P19, tooling, 4.0% of runs). It is the highest-ranked practice that is not already adopted, at a 2.0% priority, still below the 5% bar.
- **P20 and P22 describe things the loop already does** (run records with `errors` and `doc_friction`; the rule that the session that wrote a change merges it), so they are marked adopted. P21 is partly adopted: READMEs open with a question, but nobody drafts the finished-state release first.
- **Two stale statuses fixed.** P16 and P4 said a research mirror was missing a check or under way. It was retired at the cutover, so both are now `adopted`, and batch 3's one lead (check the mirror) no longer applies.
- **The ledger moved under the project.** `prompts/runs.jsonl` no longer exists; each run is a file in `prompts/runs/`. `run.py` crashed on the new path, so `load_ledger` now reads either layout and one run's `errors` entry that is a dict. The ledger has 474 rows (it had 280), and every failure class fell (tooling 6.1% to 4.0%, duplicate 5.7% to 3.6%), because the extra runs mostly reported no error. Percentages in batches 1 to 3 used the old file and are not comparable.
- **Still no proposal**, and no practice that transfers as `yes` and is not adopted has a ceiling above 1.7%.
- Verification was by web search only; none of the four pages could be fetched. All are marked `partly` checked, and the Bryar and Carr row names the claims that were not confirmed (publisher, single-threaded teams, two-pizza teams), which the catalogue therefore does not use.

## 2026-10-16 · Batch 3: postmortems, a regulator's finding and two early-stage sources

- Added 4 sources and 4 practices (18 of each): GitLab's 2017 database-outage postmortem, the SEC's 2013 order on Knight Capital's 2012 deployment failure, Paul Graham's *Maker's Schedule, Manager's Schedule* (2009), and Linear's published method. These are the catalogue's first postmortem and first regulatory finding, which the earlier limitations named as missing.
- **The two failure reports say the same thing:** the safety mechanism existed and nobody checked it ran. GitLab's backups and alerts had failed silently. At Knight, one of eight servers missed a deploy, and a reused flag woke code that had been dead since 2003. Both map onto this loop, where guards that skip silently and a mirror that misses an update are the same kind of failure. Both transfer (`yes`) and both are only partly adopted here.
- **The early-stage sources transfer least.** Graham's maker's schedule assumes people who lose context to meetings, so it does not transfer (`no`): a session has no calendar. Linear's small single-owner issues and short cycles transfer in part. Runs here already claim one milestone each, but nothing rolls unfinished work into the next cycle.
- **Still no proposal.** The ledger now has 280 rows (it had 268). No practice that transfers cleanly and is not yet adopted has a ceiling of 5% or more. The highest new practice, Knight's "deploy to every target by a checked procedure" (P16), targets unlanded work, at 2.9% of runs (Wilson 1.5–5.5%).
- **Lead worth a small experiment:** P16 suggests a check that `oss-monorepo/research/` matches this repository after each merge. It is cheap and targets a failure that keyword matching would undercount.
- Verification was by web search only: the pages themselves could not be fetched from the container. All four sources are marked `partly` checked.

## 2026-10-15 · Batch 2: an early-stage book and a developer survey

- Added Eric Ries's *The Lean Startup* (2011) and Stripe's *The Developer Coefficient* survey (2018), for 14 sources and 14 practices.
- Ries's build-measure-learn loop transfers only in part. Stripe's finding, that maintenance and rework are a large measured share of developers' time, maps onto the ledger's rework class (3.0% of runs).
- Re-scored against 268 ledger rows. Still no practice cleared the 5% bar as a new proposal.

## 2026-10-15 · Batch 1: the first catalogue

- 12 practices from 12 sources, mostly Google, Microsoft and Facebook research (code review, monorepos, continuous deployment, static analysis), Netflix's chaos engineering, Basecamp's *Shape Up*, Spotify's squad model, DORA's *Accelerate* and Google's SRE book.
- Evidence is thin: only two rest on measurement (Google's log of about 9 million reviewed changes, and the DORA survey). Spotify's model has no outcome data at all.
- Each practice was scored against the 265-row run ledger. The failure classes runs report are small (1.9–6.0% of runs), so no new practice cleared a 5% ceiling. This is a negative, preliminary result. The practices that rank highest, continuous small batches and a scope circuit breaker, were already in `prompt.md`.
