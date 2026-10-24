# How people steer this repository: brief for an agent reader

**Date:** 2026-10-24. **Reader:** an agent handling a request from a person,
or editing the docs that describe how people contribute. **Asked by:** the
owner: "onboarding docs agent instructions blog etc for the general way for
humans to contribute to this repo. basically replicating my process."
**People version:** [`docs/posts/2026-10-24-how-one-person-steers-an-agent-fleet.md`](../posts/2026-10-24-how-one-person-steers-an-agent-fleet.md).
**Data and code:** `prompts/runs/*.json` as of 2026-10-24, counted by
[`assets/human-asks/count_asks.py`](assets/human-asks/count_asks.py).

## Answer

People reach this repository three ways, and each now has one doc:

| Who | Doc | What agents do with their words |
|---|---|---|
| Outside reporters and fork-PR authors | [`CONTRIBUTING.md`](../../CONTRIBUTING.md), [`docs/contributing/`](../contributing/README.md) (PR #9956) | Data to verify; fork PRs untouched (hard limit) |
| People steering agents (owner, collaborators, people copying the process) | [`docs/contributing/steering-agents.md`](../contributing/steering-agents.md) | Direct requests |
| Agents handling either | [`.github/prompts/human-requests.md`](../../.github/prompts/human-requests.md) | The runbook |

Two sessions wrote a `CONTRIBUTING.md` within the same hour on 2026-10-24
(PR #9956 and PR #9960); neither PR was open when the other searched. They
were consolidated: #9956's file kept for outside contributors, #9960 adding
the steering guide and the runbook. Before them, the owner's process existed
only as agent-facing rules plus 90 run records.

## What the run records show (2,601 runs, 2026-10-13 to 2026-10-24)

- **Direct asks are 3.5% of runs** (90); the other 2,511 started from a
  scheduled one-line prompt. Full days ran 231 to 295 runs.
- **A direct run costs about five times a scheduled one:** median $3.75 vs
  $0.69 at API prices (`runcost.py`; measured on 48 of 90 and 1,187 of
  2,511 records, so a ratio, not a bill).
- **Kinds of ask** (keyword sort, first rule wins, spot-checked by reading
  all 90): question answered as a report or post 42%, new project or
  direction 22%, change to how runs work 19%, feedback on the site or a
  product 9%, other 8%.
- **28 of 90 name the output shape** ("report and blog post", "agent doc").
  Deliver that shape; it is what the person will read.
- **By track:** process 40, ventures 24, research 21, explore 3, red team 1,
  review 1. Requests about the process itself are the largest group; route
  them to `process`.
- **Lasting directions end up in `prompts/goals.md`:** 37 lines there cite
  the owner by date. Each started as a sentence in a session like these.

## Traps found while writing the docs

1. **Check `platform/edge/site.json` before saying whether the site has a
   no-account feedback form.** It had an empty `url` (issue links only) until
   PR #9963 pointed it at the deployed Worker on 2026-10-24, while this run
   was in progress. A claim either way goes stale with that one file.
2. **Two site URLs are in use.** `platform/pages/build.mjs`
   (`DEFAULT_BASE_URL`) and `README.md` say `/monorepo-projects/`;
   `CLAUDE.md` and `portfolio/hosting/README.md` (line 343) say
   `/oss-monorepo/`, which is also what `portfolio-pages.yml` builds when
   `vars.PAGES_BASE_URL` is unset. A session cannot load `github.io` to check
   (`cloud-session.md`). The new docs link files, not the site, where they
   can.
3. **`wall_minutes` in run records is low for scheduled runs** (median 3.4
   minutes, a run that opens and merges a PR usually takes longer). It may
   cover only part of a transcript. These docs do not use it.

## How sure

Counts are exact for the records as committed. The scheduled/direct split is
a text rule over `input` (see the script); a direct ask paraphrased by the
recording agent as "scheduled" would be missed, and a few early records may
be misfiled. The kinds are a rough sort, not a coding.
