# Daily engineering brief and The Merge Report (`dev/daily/` on the Pages site)

Two daily write-ups of what merged to `main`, each to read or to listen to:

- **[Engineering brief](https://duncan-haywood.github.io/oss-monorepo/dev/daily/)**:
  about fifteen minutes for an engineering manager in charge of the whole
  repository. The bottom line; CI, main and the PR queue; the owner decisions
  still waiting; every product, research project, blog post and platform area
  that moved, with each PR linked; the agent fleet (runs, outcomes, cost,
  documentation friction, what runs wrote in their records); a watch list.
- **[The Merge Report](https://duncan-haywood.github.io/oss-monorepo/dev/daily/show/)**:
  a few light minutes on the same day for the general technical public. The
  headline change, new products and research, the plot twist (reverts and
  fix-forwards), the numbers, word of the day, the co-author leaderboard.

**Listen** uses the browser's own speech synthesis (Web Speech API): free to
make, host and play, nothing uploaded, choice of voice and speed, and the line
being read is highlighted. The page is the full script without JavaScript.

| Source | Gives |
|---|---|
| `git log --first-parent` of `main` | merges per day, titles, PR numbers, files and lines, areas, what was added, reverts, fix-forwards, co-author model |
| `prompts/runs/*.json` | runs per track and outcome, API-equivalent cost, documentation friction, the runs' notes |
| `portfolio/ledger/decision_queue.py --json` | owner decisions waiting, in the queue's own order |
| `dev/stats.json` (the dashboard, `platform/devstats/`) | red on main, CI pass rate, open PRs: newest edition only, since it is a snapshot of build time |

```
node platform/daily/build.mjs --out=_site/dev/daily [--stats=_site/dev/stats.json] [--asks=asks.json] [--days=7] [--now=<ISO time>]
node --test platform/daily/*.test.mjs
```

`portfolio-pages.yml` builds it after the dashboard on every publish and
every three hours. Editions cover the last seven complete UTC days and are
rebuilt from git each time, so there is no stored state; each has a
`facts.json` and both kinds are in `feed.xml` (Atom).

Rules: the words come from templates, not a model, so the same facts always
give the same script and nothing is invented. The show's jokes are framing;
its numbers and quoted titles are copied from the facts. A source missing from
a build is said to be missing, never shown as zero. The brief trims detail
(per-group items, first-item summaries, notes) until it fits ~2,400 words; a
light day is simply shorter.

The judgment these templates leave out (the most interesting things done,
whether the work is going where the flagships and goals say, what is stuck)
is a blog post written by a scheduled session daily, every three days and
weekly: [`.github/prompts/daily-progress-post.md`](../../.github/prompts/daily-progress-post.md).
`progress.mjs` prints the facts it starts from for any of those windows:

```
node platform/daily/progress.mjs --cadence=daily|3day|weekly [--end=YYYY-MM-DD] [--json] [--ref=origin/main]
```
