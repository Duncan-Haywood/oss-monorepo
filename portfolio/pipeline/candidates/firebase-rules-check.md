# Firebase security rules exposure checker

Scored 2026-09-23. Composite 6.125 · floor 1 (ai_leverage). Same shape as
`supabase-rls-check`, screened and graduated the same session: whether a
Realtime Database path or Firestore collection returns real data to an
unauthenticated request is decided by the HTTP status and a shallow/capped
read, not a model in the loop -- which is what keeps the per-user cost at
zero and every finding traceable to one response.

A developer, security researcher, or agency doing due diligence on a
Firebase-backed project hits a specific, well-documented, and structurally
recurring exposure class. Both Firebase products -- the Realtime Database
and Firestore -- start a new project in **test mode**: a security rule that
allows any read and write with no authentication, specifically so a team can
build against real data before writing real rules. The client config
(`apiKey`, `projectId`, `databaseURL`) is meant to be public by design, the
same as Supabase's anon key -- it ships in every client app's JavaScript
bundle. What keeps data safe after test mode is Security Rules, and only
that.

This is not a hypothetical niche. Appthority's 2018 research, one of the
first large-scale looks at this exposure class, found more than **2,300
mobile apps** leaving a Firebase backend open this way, exposing tens of
millions of records including passwords, health information, and financial
data. The same underlying shape -- test mode extended past its 30-day
expiry, or a hand-written rule broader than intended -- keeps recurring in
security research and bug-bounty write-ups since, because the failure mode
is structural: nothing in the SDK stops a developer from shipping against an
open database, and an absent or overly broad rule on a newly added
collection falls through silently rather than failing closed. OWASP's Mobile
Application Security Testing Guide names Firebase backend misconfiguration
as its own test case, which is durable evidence this is a standing item in
professional security review checklists, not a one-time incident.

## Why this venture, not another dev-tooling checker

`portfolio/pipeline/README.md`'s "archetype itself" section argues for the
checker/CLI shape over another `<trade>-bid-calculator`, and this portfolio
already has a family of "read what's actually there, name the exact
evidence" checkers, most directly `supabase-rls-check` (the same
default-open-unless-locked-down shape for a different backend).
`duplicate_check.py`, run against a description naming exactly this
mechanism (real, read-only, unauthenticated requests to a Firebase
project's Realtime Database and named Firestore collections), scored every
existing venture at 0.16 or below (0.19 against `supabase-rls-check`'s own
pipeline write-up, the closest match) -- well under the 0.45
read-this-first bar. Nothing in `screened-out.md` covers Firebase, Realtime
Database, or Firestore.

**One structural difference from `supabase-rls-check` is worth stating
plainly.** Supabase's PostgREST layer publishes a schema-listing endpoint,
so that checker discovers every table the anon key can see on its own.
Firebase has no equivalent for Firestore -- there is no unauthenticated
"list every collection" endpoint -- so this tool asks the caller to name
the Firestore collections to check (the same "I already know what to
check" fallback `supabase-rls-check`'s own `runProbes` offers via its
`tables` option, just the primary path here rather than a fallback). The
Realtime Database half needs no such list: a `shallow=true` request at any
path returns only the immediate child key names with no field values, so
the root of the tree is probed directly with no collection list required.

**Also unlike `supabase-rls-check`, the browser page's live check is only
guaranteed for the Realtime Database half.** The Realtime Database REST API
is documented and designed to be called with plain HTTP directly from a
browser tab -- the `.json` suffix convention exists for exactly that. The
Firestore REST API's CORS behaviour for an unauthenticated cross-origin
fetch is less certain across every project configuration, so the page
attempts the live Firestore check too but tells a visitor to fall back to
the CLI if their browser reports a network/CORS error -- the same
CLI-as-guaranteed-fallback posture `security-headers-check` and
`cors-misconfig-check` already use in this portfolio for a request a
browser cannot reliably make itself.

## Liability, read carefully

The same dimension where `supabase-rls-check` is not a straightforward copy
of the sibling header/manifest-only checker pattern applies here too: this
tool has to attempt a real read against the user's own project to tell
whether rules block it, because there is no way to answer "can an
unauthenticated request read this" without asking. The mitigation is the
same shape, narrowed further where the Realtime Database is concerned: the
`shallow=true` request never downloads a field value at all, only key
*names* -- more conservative than `supabase-rls-check`'s single-row peek,
since even a successful "exposed" finding on the Realtime Database side
never holds real field content in memory, only key existence.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic classification: HTTP status + shallow key list / document count against a fixed decision table; no model in the loop |
| Autonomous ops | 10 | Zero-dependency browser tool + CLI, no server, no queue, no ops |
| Time to revenue | 6 | Donations only; a developer who has just inherited a project or read a Firebase-misconfiguration write-up wants an immediate self-check, plausible discovery via search inside weeks |
| Gross margin | 10 | Zero marginal cost per user; every Realtime Database request runs from the visitor's own browser (or machine, for the CLI) against a project of their choosing |
| Defensibility | 2 | Transparent, narrow probe-and-classify tool with no data moat; the Firebase console's own Rules Playground and multiple free open-source scanner scripts already cover the same underlying misconfiguration for a project member or a developer willing to run a script |
| Distribution | 6 | One point below `supabase-rls-check`'s 7: the exposure class is older and more evergreen (documented since 2018, recurring in security research and OWASP MASTG's own Firebase test case since) rather than anchored to one specific, dated, named 2026 incident and a named hosted paid competitor the way `supabase-rls-check` is -- real, durable search demand ("firebase security rules checker", "is my firebase database public") but weaker as a single piece of evidence |
| Liability containment | 6 | Read-only by construction (GET only; the Realtime Database probe never downloads a field value at all, only child key names via `shallow=true`; the Firestore probe is capped to one document per collection); every request runs from the user's own browser or machine directly to a project they name, nothing proxied through or logged by this portfolio. Explicit "only test a project you own or are authorised to test" caution on every page and in the README |
| Ethical robustness | 8 | Gets more protective as adopted -- exists to let an owner find their own exposure before an attacker does, and the tool cannot be used to *cause* the exposure, only to reveal one that already exists. A false "clean" report costs the user a false sense of security about the specific paths/collections checked, which the "evidence, not a determination" disclaimer names directly on every page |

Composite: (1+10+6+10+2+6+6+8)/8 = **6.125**. Floor: **1** (ai_leverage).

**Mitigation (floor <= 4, and the more novel liability dimension both need
one):** Keep the check strictly read-only and conservative -- the Realtime
Database probe uses `shallow=true` (child key names only, never field
values) and the Firestore probe is capped to one document per collection
via `pageSize=1`, and the tool never attempts a write/update/delete even as
a secondary "is this also writable" test. Never render or store actual
field values in the report; show only Realtime Database key names and
Firestore field *names*, never values. A response this tool cannot classify
(a network error, an unexpected status) is reported as `error`, never
silently folded into either "exposed" or "blocked". Measure real user
reports before expanding scope into Cloud Storage bucket rules or Cloud
Functions, each of which would need its own liability read rather than
inheriting this one's.

Not affiliated with, endorsed by, or sponsored by Google LLC or Firebase;
named only to describe what this checker tests.

**Verdict: graduate as a venture.** Both gates clear (liability_containment
6, ethical_robustness 8, both >= 5), the floor (1, ai_leverage) carries the
same "deterministic by design" reasoning as every sibling checker, and the
one dimension that is genuinely different from the sibling pattern
(liability) has a named, specific mitigation rather than an inherited one.
Graduated the same session as `ventures/firebase-rules-check`; distribution
and organic search demand are unmeasured.
