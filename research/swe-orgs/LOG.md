# Research log: what engineering organisations that ship do

An ongoing log of the `swe-orgs` study: each run reads a new batch of sources on how software companies organise and run engineering, adds them to `data/`, re-scores the catalogue against the run ledger, and appends an entry here, newest first. The project page on the portfolio site shows this log. Numbers come from `experiments/results.txt` as it stood at each entry.

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
