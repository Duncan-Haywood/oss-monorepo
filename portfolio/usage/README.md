# Usage

Revenue is zero by design right now — everything ships free and full-feature —
so **usage is the only honest signal about which product deserves more of the
fleet's time.** This directory is where it lands.

A reading cannot exist until a stranger can reach the product.

**That precondition was met on 2026-09-06, and the paragraph this replaces had
not noticed.** It read: "While every row here is still a zero baseline with
`live_url_visitors: null`, the next task is a public URL for something already
on `main`, not another instrumented-but-undeployed calculator." Both halves are
now false. All 175 finished products are served at
`https://duncan-haywood.github.io/monorepo-projects/` — measured, not inferred:
GitHub's own managed builder ran the `gh-pages` branch and concluded `success`
(`python3 platform/ci/pages_state.py`, the `deployed` row). So "get a public
URL" is no longer the next task, and a session reading the old line would have
gone looking for a deploy that was already done.

Note what the old line *was* right about, because it is the reason this
directory still reads mostly zeros: an unreachable product cannot be measured.
The correction is that unreachability is no longer the reason. The remaining
reason is narrower and worth stating plainly — **GitHub Pages exposes no
server-side visitor analytics**, and this portfolio will not add a third-party
one (see "No analytics vendor" below). So `live_url_visitors` stays `null` on
these rows not because nobody can visit, but because the honest signal on a
static host is the local-first, opt-in counter described further down, plus
whatever the products' own repos report. Record that distinction in a note
rather than letting a `null` read as "still dark".

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

**One event name is fleet-standard rather than per-product: `sponsor_link_clicked`.**
Every venture's own feature events are named for what that product does
(`bid_calculated`, `record_exported`, ...) and vary venture to venture on
purpose. The GitHub Sponsors link is the one thing identical across all 185
ventures, and as of 2026-09-06 it ships everywhere with no signal on whether
it is ever clicked — the fleet closed "does the link exist" without closing
"does anyone use it." Use the literal string `sponsor_link_clicked` on every
venture that wires it, the same way `PRODUCT_PLAYBOOK.md` §6 describes, so a
click on that one link is comparable across products instead of scattered
under a different name per venture.

**Wired the same day, on the published site, in one place rather than 186.**
The paragraph above asks each venture to wire it, and taking that literally
meant editing 186 `index.html` footers — of which only 155 have a `usage.mjs`
to call, so 31 would have had no way to comply and a 187th venture would ship
uncounted by default. The link is not a venture's own feature: it is identical
markup on every one of them, so it is counted where the identical markup is
already handled, in `platform/pages/build.mjs`. A build pass marks every
Sponsors anchor with `data-pf-sponsor` (`markSponsorLinks`), and the shared
`pf-site.js` that all 733 published pages already load counts a click on it
into `portfolio-hub-usage` — the same store, the same day-only granularity and
the same three off switches (DNT, Sec-GPC, `portfolio-hub-optout`) as the
`tool_viewed:*` events that are its denominator. It never transmits.

Two consequences worth knowing before reading the number. It counts on the
**published site**, so a venture's own repo or a locally opened `index.html`
still records nothing — wire `recordUsage(..., 'sponsor_link_clicked')` there
if a venture needs it. And, like every counter here, it lands in the visitor's
own browser: it makes the click *countable*, and getting the count back off
the device is still the open problem the next section describes.

## The published tool site counts itself

> **Not on the route that is currently serving.** Everything in this section
> describes nginx on the k3s cluster (`gitops/prod/site-usage.yaml`), and that
> cluster is down — `:6443` refused on both boxes, `Outage triage` run
> 33889983086. The origin strangers actually reach today is GitHub Pages,
> where there is no nginx in the path and GitHub exposes no visitor analytics
> we could read. So the live catalogue **does not count itself**: the only
> signal it produces is the opt-in `localStorage` counter each tool shows its
> own user.
>
> This is a gap, not a defect to fix by reaching for a vendor — see "No
> analytics vendor" above; adding one would make the privacy line on every
> page untrue. It closes when the cluster is restored
> (`hetzner-ssh-key-is-a-public-key`, #3184), and until then a `null` in
> `usage.yaml` means "not measurable on this route", not "nobody came".
> Say which one you mean in the note.

Every venture's `usage.mjs` is `localStorage`-only: the count lives in the
visitor's own browser and never transmits. That is the right default — a
contractor's pricing must not leave their device — but taken alone it means
publishing `tools.marisstella.dev` would *not* move any row in `usage.yaml`
off `null`. Nothing would ever reach us.

`gitops/prod/site-usage.yaml` closes that without asking the browser to send
anything new. nginx already receives every request; the change is what it is
allowed to write down. The access log is narrowed to four fields —
`$time_iso8601 $status $uri $portfolio_embed_view` — so no client address,
user agent, referrer or query string is recorded at all, and a nightly CronJob
reduces a day of those lines to one integer per tool. Rule 1 above is enforced
by what is never written, not by a promise to discard it afterwards. Shared
bids travel in the URL *fragment*, which a browser never sends to a server, so
they are not in the log by any route either.

The fourth field is one bit: was this view served inside somebody else's page.
It is **not** the query parameter it derives from — `$arg_pfEmbed` would write
whatever a caller put in the URL into the log, so nginx maps that parameter to
one of exactly two literals and logs the mapped variable. Nothing a visitor
chooses can reach the file. `gitops/tests/test_site_usage.py` pins both the
substitution and the closed set of values.

The last 30 days sit in a ConfigMap. Read them with:

```bash
kubectl -n prod get configmap portfolio-site-usage -o jsonpath='{.data.usage\.json}'
```

Keys are catalogue slugs, plus `_hub` for the catalogue's front page,
`c/<category>` for a category page, `embed/<slug>` for a view served inside
somebody else's page through the embed widget, and `_front` for the apex
front door at `marisstella.dev`.

`_front` and `_hub` are two different pages on two different hostnames, and
they are separate rows because they answer different questions: `_front` is
"did anyone find the portfolio at all", `_hub` is "did anyone go on to browse
the catalogue". Both resolve to `/index.html` in the log, so nothing
downstream could have taken them apart if they had shared a row — the split is
made where the line is read, by which workload served it
(`aggregate.py`'s `APP_KEYS`).

**`_front` is no longer the whole story for that pod.** It used to be a
single row because the front door served exactly one page — every request
resolved to `index.html` before `$uri` was logged. That stopped being true
when the apex began mirroring the catalogue's tools and category pages, and
again when it grew its own About page:

- `_front/<slug>` — a visit to a tool the apex mirrors at `/tools/<slug>/`,
  same slug the catalogue host uses for the tool itself.
- `_front/c/<category>` — a visit to one of the apex's seven category browse
  pages, e.g. `_front/c/trades`.
- `_front/about` — a visit to the apex's own About & privacy page. Distinct
  from `about`, the catalogue host's own About page under a different key
  (`APP_KEYS["portfolio-site"]` is `None`, so that host's rows keep
  `slug_for`'s bare names).
- `_front` itself is what remains: the apex's front page, since that pod's
  fallback `try_files` still resolves everything else to `index.html`.

See `aggregate.py`'s `fold_for_app` for the split logic and
`gitops/tests/test_site_usage.py` for what pins each row.

That last split is the point of the fourth field. The embed snippet points at
`/<slug>/?pfEmbed=1`, and `$uri` is resolved *past* the query string, so a
framed view and a direct visit are otherwise byte-identical in the log. Folded
into one row, a tool with 300 hits could be 300 people finding it in search or
one popular embed on a trade forum — and those imply opposite next moves. It is
the only distribution channel here that does not wait on search rankings, so
whether it works is worth being able to answer.

Copy what matters into `usage.yaml` as a dated reading.
That hop is manual on purpose: writing to this repository from inside the
cluster would need a GitHub token with write access, and `gitops/README.md`
keeps write credentials out of `prod`.

Two limits worth knowing before you read a number as gospel. It counts page
views, not people or sessions — a contractor who opens one calculator six
times in an afternoon is six. And it reads pod logs, so a day whose lines the
kubelet has already rotated away is a day that undercounts.

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

## Check it before you push

```
python3 portfolio/usage/validate_usage.py
```

It parses the file and enforces the two rules above: every product needs a
`surface` and at least one reading, every reading needs a date, numeric (or
null) signals, and a note, and no signal name may look like a person rather
than an event. One product may appear once per surface it ships on — a CLI and
a browser page are separate things to measure — but two rows for the same
surface split one history in half, so that is an error.

`portfolio-validate` runs this on every push and pull request touching
`portfolio/usage/`. It exists because nothing read this file in CI: a merge
resolution in #1387 left a stray blank line and a three-space `- slug:` under
`products:`, the whole file stopped parsing as YAML, and it stayed that way
with every check green.

## How to read it

- **Any product with returning users outranks every candidate in
  `portfolio/pipeline/`.** Put the fleet's time where people already are.
- **Zero after a fair run is a result, not a failure to report.** Record it,
  stop working on that product, and take the lesson to the next niche.
- **Don't optimise the number.** The point is to find out which products
  create value, not to make a chart go up. Counting more things does not
  substitute for one person using the product twice.
