# Usage

Revenue is zero by design right now — everything ships free and full-feature —
so **usage is the only honest signal about which product deserves more of the
fleet's time.** This directory is where it lands.

Two rules decide everything else in this file:

1. **Count events, never people.** No accounts, no cookies, no IP storage, no
   device fingerprints, no cross-site identifiers, no content. If a number
   could help identify or re-identify a user, we don't collect it.
2. **A number nobody wrote down does not exist.** A counter that only lives in
   a running process is not a signal — it has to reach
   [`usage.yaml`](usage.yaml), which is what the router and the next session
   read.

## Prefer signals that already exist

Cheapest first. Most products need nothing beyond these, and none of them
collect anything about a person:

| Signal | Where it comes from | Good for |
|---|---|---|
| Release download counts | GitHub releases API, per asset | CLIs, desktop tools, plugins |
| Package downloads | npm / PyPI / crates registry stats | libraries, CLIs |
| Repo views and clones (14-day window) | GitHub repo traffic API | anything whose repo is the landing page |
| Referring sites and popular paths | GitHub repo traffic API | which docs page the niche actually lands on |
| Stars, forks, issues opened | GitHub API | weak, but real, engagement |
| Action installs / workflow runs | Marketplace or the consuming repos | GitHub Actions products |

These are public, aggregate, and free. Read them, write them down, move on.

## When a product needs its own counter

Only when the signals above cannot answer "is anyone using the thing at all",
and then under all of these constraints:

- **Aggregate only.** Increment a count of an event name. Never store a
  per-user record, never a session identifier that outlives the page.
- **No IPs, no user agents retained.** If a request must hit a server, log the
  event name and the day, and nothing about the caller.
- **No content.** Not the file they processed, not the text they typed, not the
  URL they checked — the *fact* that the feature ran is the whole payload.
- **Visible and off-switchable.** Say what is counted in the README's privacy
  line, and give a real off switch (a settings toggle, an env var, a
  `--no-usage` flag). Honour `DNT`/`Sec-GPC` when the platform sends it.
- **Local-first where possible.** A browser app can keep counts in
  `localStorage`, show the user their own numbers, and offer a one-click
  "share anonymous usage" — which is more honest than a silent beacon and
  usually enough to tell alive from dead.
- **No analytics vendor.** Third-party analytics is a data-sharing decision we
  are not in a position to make on a user's behalf, and it would make the
  privacy line in every README untrue.

An acceptable event payload, in full:

```json
{"event": "report_exported", "day": "2026-08-24", "product": "eaa-triage"}
```

Anything richer than that needs a reason written next to it in `usage.yaml`.

## What to record here

Update [`usage.yaml`](usage.yaml) whenever you read a number — shipping a
product, checking in on one, or noticing a change worth acting on. It is
append-friendly: add a dated reading rather than overwriting the old one, so a
trend is visible.

```yaml
period: 2026-08
products:
  - slug: example-product              # venture dir or product_lines slug
    surface: github-pages              # where users reach it
    readings:
      - as_of: 2026-08-24
        signals:
          repo_views_14d: 0
          release_downloads_total: 0
        note: Shipped today; first reading is the baseline.
```

Keep the note to one line. If a number moved, say what you think moved it; if
it didn't, say that — "listed for two weeks, still zero, stopping work on it"
is a genuinely useful row and costs nothing to write.

## How to read it

- **Any product with returning users outranks every candidate in
  `portfolio/pipeline/`.** Put the fleet's time where people already are.
- **Zero after a fair run is a result, not a failure to report.** Record it,
  stop working on that product, and take the lesson to the next niche.
- **Don't optimise the number.** The point is to find out which products
  create value, not to make a chart go up. Counting more things does not
  substitute for one person using the product twice.
