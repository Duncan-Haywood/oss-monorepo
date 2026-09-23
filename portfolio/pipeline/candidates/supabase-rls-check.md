# Supabase RLS exposure checker

Scored 2026-09-23. Composite 6.25 · floor 1 (ai_leverage). Same shape as the
portfolio's other deterministic checker ventures: whether a table returns a
real row to an unauthenticated request is decided by the HTTP status and row
count PostgREST itself returns, not a model in the loop -- which is what
keeps the per-user cost at zero and every finding traceable to one response.

A developer, security researcher, or agency doing due diligence on a
Supabase-backed project hits a specific, well-documented, and currently very
live exposure class: Supabase's REST layer (PostgREST) treats the anon key
as public by design -- it ships in every client app's JavaScript bundle --
and puts the entire enforcement burden on Row Level Security (RLS). A table
created without RLS enabled (or with a policy broader than intended) is
readable by anyone who has ever loaded the app, because the anon role
already has a schema-level `USAGE` grant regardless of RLS state.

This is not a hypothetical niche. CVE-2025-48757 named 170+ applications and
303+ endpoints, most built with the AI app-builder platform Lovable, where
generated Supabase tables shipped with RLS off. A 2025 analysis of
AI-generated apps found roughly 10% of tested applications exposed a
vulnerable Supabase endpoint this way, and reporting continued into 2026 --
including at least one incident where an AI platform's own database was
exfiltrated after an attacker found a table missing RLS and pulled admin
emails and internal schema metadata. Multiple 2026 guide posts and security
write-ups (dev.to's "Missing RLS: The Most Underrated Breach Cause of 2026",
several "Supabase RLS Guide 2026" posts, a byteiota report naming the 170+
figure) show this is current, ongoing search demand, not a closed incident.
At least one named hosted competitor, **VibeAppScanner**, already exists as
a paid/hosted response to the same underlying problem -- evidence the niche
has real demand, not evidence it is unserved (the same reading this
portfolio's README already gives Corsy against `cors-misconfig-check`).

## Why this venture, not another dev-tooling checker

`portfolio/pipeline/README.md`'s "archetype itself" section argues for the
checker/CLI shape over another `<trade>-bid-calculator`, and this portfolio
already has a family of "read what's actually there, name the exact
evidence" checkers (`cors-misconfig-check`, `security-headers-check`,
`cache-control-check`, `dependency-confusion-check`, and others).
`duplicate_check.py`, run against a description naming exactly this
mechanism (reading a Supabase project's own schema listing, then a
capped read-only GET per table using the anon key), scored every existing
venture at 0.16 or below -- `security-headers-check` closest, a different
evidence class entirely (response headers, not row-level database access
control). 0.16 is well under the 0.45 read-this-first bar. Nothing in
`screened-out.md` covers Supabase, Row Level Security, or PostgREST.

**One structural difference from every sibling checker in this portfolio is
worth stating plainly, in the opposite direction from `cors-misconfig-check`:
this is the first one where the browser page *can* do the actual check
itself, live.** `cors-misconfig-check` needs a CLI because `Origin` is a
forbidden request header a browser tab can never set. The headers PostgREST
reads -- `apikey` and `Authorization: Bearer <key>` -- are ordinary headers a
page is allowed to set, and PostgREST answers with
`Access-Control-Allow-Origin: *` by design, because it is meant to be called
directly from a browser tab. So `probe.mjs` is a single module, imported
identically by `index.html` (a real live check, no CLI required first) and
by `check.mjs` (for CI), rather than the CLI-only-probe / browser-renders-
JSON split `cors-misconfig-check` needs. The CLI still exists because a CI
pipeline wants an exit code, not a browser.

## Liability, read carefully

This is the one dimension where this venture is *not* a straightforward
copy of the sibling pattern, and the mitigation below is deliberately
narrower than "point ordinary requests at a URL you choose": every prior
checker in this family reads response **headers** or a **manifest/config
file**, never row-level application data. This one, by construction, has to
attempt an actual `SELECT` against the user's own project to tell whether
RLS blocks it -- there is no way to answer "can the anon key read this
table" without asking the table.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic classification: HTTP status + row count + exact count against a fixed decision table; no model in the loop |
| Autonomous ops | 10 | Zero-dependency browser tool + CLI, no server, no queue, no ops |
| Time to revenue | 6 | Donations only; a developer who has just read one of the 2026 incident write-ups wants an immediate self-check, plausible discovery via search inside weeks |
| Gross margin | 10 | Zero marginal cost per user; every request runs from the visitor's own browser (or machine, for the CLI) against a project of their choosing |
| Defensibility | 2 | Transparent, narrow probe-and-classify tool with no data moat; a named hosted competitor (VibeAppScanner) already exists, and Supabase's own dashboard Advisor covers the same misconfiguration for a logged-in project member |
| Distribution | 7 | Named, dated 2026 channels: CVE-2025-48757/"170+ Lovable apps" coverage, multiple dev.to and security-blog "Supabase RLS" guide posts from 2026, r/Supabase and r/webdev, and the search terms those posts create ("supabase rls checker", "is my supabase table public") |
| Liability containment | 6 | Read-only by construction (GET only, capped at one row, never writes/updates/deletes); every request runs from the user's own browser directly to a project they name, nothing proxied through or logged by this portfolio, matching the "no different in kind from curl" posture of the sibling checkers. Scored below the sibling checkers' typical 7 specifically because a successful check, unlike a header check, briefly holds real row content in the browser's memory rather than only response metadata -- mitigated by never persisting or transmitting that content anywhere and rendering only counts/column names, never field values, in the report. Explicit "only test a project you own or are authorised to test" caution on every page and in the README |
| Ethical robustness | 8 | Gets more protective as adopted -- exists to let an owner find their own exposure before an attacker does, and the tool cannot be used to *cause* the exposure, only to reveal one that already exists. A false "clean" report costs the user a false sense of security about one specific check, which the "evidence, not a determination" disclaimer names directly on every page |

Composite: (1+10+6+10+2+7+6+8)/8 = **6.25**. Floor: **1** (ai_leverage).

**Mitigation (floor <= 4, and the more novel liability dimension both need
one):** Keep the check strictly read-only and conservative -- every request
is `GET`, capped to one row via `Range: 0-0`, and the tool never attempts a
write/update/delete even as a secondary "is this also writable" test, which
would materially raise both the liability and the implementation surface.
Never render or store actual row values in the report; show only row counts,
exact counts, and column *names* (from the OpenAPI schema and the returned
row's own keys), never field values, so a "clean" demonstration of exposure
never becomes a bulk data-viewing tool in its own right. A response this
tool cannot classify (a network error, an unexpected status) is reported as
`error`, never silently folded into either "exposed" or "blocked" --
guessing in either direction would be worse than an honest "could not
confirm." Measure real user reports before expanding scope into
authenticated-role testing, storage buckets, or Edge Functions, each of
which would need its own liability read rather than inheriting this one's.

Not affiliated with, endorsed by, or sponsored by Supabase, Inc. or
VibeAppScanner; both are named only to describe what this checker is and
compares against.

**Verdict: graduate as a venture.** Both gates clear (liability_containment
6, ethical_robustness 8, both >= 5), the floor (1, ai_leverage) carries the
same "deterministic by design" reasoning as every sibling checker, and the
one dimension that is genuinely different from the sibling pattern
(liability) has a named, specific mitigation rather than an inherited one.
Graduated the same session as `ventures/supabase-rls-check`; distribution
and organic search demand are unmeasured.
