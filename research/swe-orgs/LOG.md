# Research log: what engineering organisations that ship do

An ongoing log of the `swe-orgs` study: each run reads a new batch of sources on how software companies organise and run engineering, adds them to `data/`, re-scores the catalogue against the run ledger, and appends an entry here, newest first. The project page on the portfolio site shows this log. Numbers come from `experiments/results.txt` as it stood at each entry.

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
