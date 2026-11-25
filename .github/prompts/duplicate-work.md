# Duplicate work: is someone already doing this?

Moved from `CLAUDE.md` ("Duplicate PRs") on 2026-10-20, so the entry file keeps
the rule and this runbook keeps the steps. Read it before you open a PR, and
before you close one in favour of another.

Scheduled sessions overlap. Before opening a PR, check open PRs (with
`search_pull_requests`, `minimal_output` and a slug or keyword `in:title`;
`list_pull_requests` returns ~60KB of unrelated PRs; a query with no keyword
returned 199KB even with `minimal_output` on 2026-10-28, so always include the
keyword and set `perPage` to 5-10) and recent
commits on `main`, then extend or consolidate instead of duplicating. If the
backlog is large, merge the strongest and close the rest with a pointer. An
open-PR check cannot see a sibling that merged ten minutes ago, but the tree
can:

```
node platform/pages/surface-budget.mjs --for <slug>   # marketing pages a venture already has
python3 portfolio/ledger/supersede_check.py <pr>      # before closing a PR as "already on main"
```

- **Before closing a PR in favour of another, check the survivor is still
  open, immediately before and after.** Two sessions once closed each
  other's PRs 38 seconds apart and shipped neither. If the one you deferred
  to is closed, reopen one rather than writing a third.
- **`supersede_check.py` exit 0** means the branch adds nothing `main`
  lacks. Exit 1 prints what a close would destroy. Its **RENAME SUSPECTED**
  section (the feature is on `main` under other names) and **STALE DRAFT
  SUSPECTED** section (`main` has a later draft of these very lines) are
  evidence to read, not licences to close: read the pairs and decide.
- **Overlap is not supersession, and a conflict is not a reason to close.**
  Merge `main` into the branch and resolve it. A conflict means the work is
  still wanted where others are editing.
- **Shared page lists conflict when siblings add pages to one venture.**
  Its `sitemap.xml` merges by union (`.gitattributes`; the build overwrites
  it anyway), and a page test should read the folder rather than list pages.
  The rest (llms.txt, README table, nav) you resolve by keeping both sides.
- **Claim a private roadmap item before you build it.** Sibling ventures runs
  read the same `ROADMAP.md` "Next" list in `private-monorepo` and pick the same
  item. On 2026-11-25 one session built the pay-when-paid outer limit and then
  the change-order history panel, and each time a sibling merged the same
  feature (private PRs 95 and 96) minutes before it was ready. Two checks cost
  seconds: right before starting, `git ls-remote origin 'refs/heads/claude/<app>-*'`
  (a sibling's branch named after the item means it is taken) and the last five
  PRs by `created` with `state: all` (an open-PR check misses one merged ten
  minutes ago). Then claim the item by pushing your branch at once, before any
  code: `git push -u origin HEAD` on a branch named after the item. Re-run both
  checks before opening the PR.
- **Shallow clones lie about history.** History-based checks need a
  deeper fetch first: [`cloud-session.md`](cloud-session.md), "Shallow clones".
