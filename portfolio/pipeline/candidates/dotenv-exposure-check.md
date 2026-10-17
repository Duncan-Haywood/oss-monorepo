# Dotenv exposure checker

Scored 2026-09-23. Composite 6.375 · floor 1 (ai_leverage). Same shape as
this portfolio's other deterministic checker ventures: whether a dotenv
file is publicly exposed is decided by matching an HTTP response body
against the real `KEY=VALUE` line shape of a dotenv file, not a model in
the loop — which is what keeps the per-user cost at zero and every finding
traceable to one response.

A developer, DevOps engineer, or security researcher doing deploy
verification or due diligence hits a specific, long-documented, and still
-recurring exposure class: a deployment that serves its own `.env` file (or
one of its framework-defined siblings — `.env.local`, `.env.production`,
`.env.production.local`, `.env.development.local`) from the public web
root. Node.js's own `dotenv` package convention, and the frameworks built on
top of it (Next.js, and the equivalent pattern in Laravel, Django, and
Rails), read exactly this file for real secrets — database URLs, API keys,
session secrets — so when it ends up servable, the exposure is not
structural metadata like a git ref or a source map path: it is the
credentials themselves, in plaintext, in the clear.

## Why this venture, not another dev-tooling checker

`portfolio/pipeline/README.md`'s "archetype itself" section argues for the
checker/CLI shape over another `<trade>-bid-calculator`, and this portfolio
already has a family of "read what's actually there, name the exact
evidence" checkers (`cors-misconfig-check`, `security-headers-check`,
`git-exposure-check`, `source-map-leak-check`, `supabase-rls-check`, and
others). `duplicate_check.py`, run against a description naming exactly
this mechanism (real GET requests to a site's root `.env` file path,
verifying the response body against the real `KEY=VALUE` line format),
scored every existing venture at 0.25 or below — `git-exposure-check`
closest, a different static-file exposure class entirely (git-internal
plumbing files, not an application's own secrets file), and
`env-example-drift-check` next closest, a **local, zero-network** source
linter that diffs a repo's committed `.env.example` against variables its
own code reads — it never fetches a URL, never reads a real `.env`, and
catches a completely different bug (onboarding drift, not a live secret
leak). 0.25 is well under the 0.45 read-this-first bar. Nothing in
`screened-out.md` covers dotenv files, environment-variable exposure, or
this specific misconfiguration class.

## The design constraint this write-up exists to make explicit

Every prior checker in this family reads *structural* evidence — an HTTP
status, a git ref string, a JSON schema's field names, a source map's file
paths. A dotenv file is categorically different: its content **is** the
secret. A checker that faithfully reports what it found by printing
`DATABASE_URL=postgres://user:hunter2@host/db` back to a screen would not be
neutrally reporting an exposure — it would be a second, additional way the
same secret leaks, this time through this portfolio's own tool.

So `analyze.mjs` draws a hard line: a response body is parsed only to check
whether its overall shape looks like a real dotenv file (are most
non-comment, non-blank lines `KEY=VALUE` shaped) and to extract each line's
`KEY` name. The `VALUE` half of every line is discarded the moment it is
read and never appears in any return value, CLI output, JSON blob, or
rendered page — not truncated, not hashed, not partially shown. A variable
name like `STRIPE_SECRET_KEY` being present is already enough to know a
real credential is likely exposed; showing what that credential actually is
would only compound the exposure. `analyze.test.mjs` pins this directly: one
test builds a report against a worked example containing a literal fake
secret value and asserts `JSON.stringify(report)` never contains that
string anywhere.

**A soft-404 check is inherited from the family, and matters more here.**
Many servers answer every unknown path with their normal 200 page. This
tool requires the body to actually look like a dotenv file (not HTML, and a
majority of its content lines `KEY=VALUE` shaped) before calling anything
exposed — the same discrimination `git-exposure-check` and
`source-map-leak-check` already make for their own file formats, applied to
a format with no magic bytes or fixed header of its own to check instead.

## Scope, deliberately narrow

Five filenames are checked, chosen from the real precedence order Next.js's
own documentation defines: `.env`, `.env.local`, `.env.production`,
`.env.production.local`, `.env.development.local`. Each response is capped
at 1MB. The tool never attempts to guess additional filenames, never crawls
subpaths, and never treats a `.env.example` or `.env.sample` as a finding —
those are meant to be committed and public, and conflating them with a real
secrets file would manufacture false positives on every open-source
repository's own README instructions.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic classification: a fixed line-shape ratio and a name-pattern regex against a real HTTP response body; no model in the loop |
| Autonomous ops | 10 | Zero-dependency browser tool + CLI, no server, no queue, no ops |
| Time to revenue | 6 | Donations only; a developer who has just read a dotenv-exposure write-up or is doing pre-launch deploy verification wants an immediate self-check, plausible discovery via search inside weeks — same reasoning as `git-exposure-check` |
| Gross margin | 10 | Every request runs from the visitor's own browser (when CORS allows) or machine (for the CLI) against a site of their choosing, so serving one more user costs a static file |
| Defensibility | 2 | A line-shape check and a name-pattern regex are genuinely easy to reimplement; no data moat |
| Distribution | 7 | This is one of the most-cited web misconfigurations in security research: OWASP's own guidance on sensitive data exposure names environment file leakage explicitly, "dotenv" combined with "exposed"/"leak" is a recurring HackerOne/Bugcrowd report category and a standard dorking search term, and the exposure class predates and outlives any single framework, unlike a dated CVE |
| Liability containment | 7 | Every request is GET only, and the value-redaction guarantee above is structurally stronger than any sibling checker's mitigation needed to be: the subject matter here is literally the secret, so the tool is built from the ground up to never surface one, pinned by a dedicated test rather than left as an informal intention |
| Ethical robustness | 8 | Gets better for site owners as it is used more (a quick, free, zero-signup check that catches a real, damaging misconfiguration before an attacker's automated scanner does), makes no compliance claim, and a clean report is stated as evidence about the five checked paths only, never a full assessment |

Composite: (1+10+6+10+2+7+7+8)/8 = **6.375**. Floor: **1** (`ai_leverage`).

## Mitigation for the floor and near-floor dimensions

`ai_leverage` sits at the deliberate floor every deterministic checker in
this family carries, and needs no mitigation beyond what the family already
established: the classification is factual pattern-matching against a line
shape, not a judgment call, so there is no accuracy claim that needs a
model behind it. `defensibility` (2) is a real, named weakness rather than
one masked by the composite — mitigated the same way as the sibling
checkers: the free-and-correct version, shipped first with the
value-redaction guarantee as its distinguishing feature, is the moat
available to a zero-marginal-cost product.

## Verdict

**Graduate as a venture** (`ventures/dotenv-exposure-check`). Both gates
clear well above the floor of 5 (`liability_containment` 7,
`ethical_robustness` 8). Kill criteria: no organic traffic or CLI/repo
engagement after a fair run per `portfolio/usage/README.md`; hosting
platforms and frameworks converge on never reading a project-root dotenv
file in production by default, at which point this check would be
validating a misconfiguration that can no longer happen by default; or real
user reports show the line-shape classification produces false
positives/negatives that cannot be fixed without expanding scope past what
this liability read covers.
