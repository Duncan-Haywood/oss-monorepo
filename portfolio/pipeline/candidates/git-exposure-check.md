# Git exposure checker

Scored 2026-09-23. Composite 6.375 · floor 1 (ai_leverage). Same shape as
this portfolio's other deterministic checker ventures: whether a `.git`
directory is publicly exposed is decided by matching an HTTP response body
against the exact grammar of real git-internal files, not a model in the
loop — which is what keeps the per-user cost at zero and every finding
traceable to one response.

A developer, security researcher, or agency doing deploy verification or due
diligence hits a specific, long-documented, and still-recurring exposure
class: a static-site or webapp deploy that copies the whole working
directory — including the `.git` folder — into the webroot. When that
happens, every file `git init` and `git commit` ever wrote under `.git/` is
served to anyone who requests it, because nothing about a plain static
webserver treats a dotfile differently from any other file. A free public
tool (`git-dumper`, GitTools) then reconstructs the **entire commit
history** from those files — not just the current checkout, but every file
and secret ever committed and later removed. That is a materially worse
exposure than a live directory listing of the deployed site, which by
construction never shows anything that was deleted before deploy.

## Why this venture, not another dev-tooling checker

`portfolio/pipeline/README.md`'s "archetype itself" section argues for the
checker/CLI shape over another `<trade>-bid-calculator`, and this portfolio
already has a family of "read what's actually there, name the exact
evidence" checkers (`cors-misconfig-check`, `security-headers-check`,
`cache-control-check`, `dependency-confusion-check`, `supabase-rls-check`,
and others). `duplicate_check.py`, run against a description naming exactly
this mechanism (two GET requests, body-content classification of `.git/HEAD`
and `.git/config`), scored every existing venture at 0.17 or below —
`cors-misconfig-check` closest, a different evidence class entirely
(a reflected `Origin` response header, not a file body). 0.17 is well under
the 0.45 read-this-first bar. Nothing in `screened-out.md` covers git,
version control exposure, or deployment-artifact leakage.

**The one thing that makes this more than "check a URL returns 200," and the
reason it is worth building at all, is the body-content classification.** A
naive dork or scanner built on a bare status check produces a false positive
on any server that answers every unknown path with a 200-status custom error
page — a common pattern on shared hosting and several popular static-site
setups. This tool instead requires the response body to actually parse as
`ref: refs/heads/<branch>` (or a bare 40-hex-char commit SHA) for `.git/HEAD`,
and to contain the `[core]` section every real git config opens with, for
`.git/config` — content no generic error page would happen to produce. That
distinction is the entire value proposition over `curl -I` or a one-line
dork, and it is pinned by `analyze.test.mjs`'s soft-404 test case.

## Scope, deliberately narrow

Only two paths are ever requested — `.git/HEAD` and `.git/config` — and both
are capped at 8KB of body read. The tool never requests `.git/index`,
`.git/logs/HEAD`, or any packed object; if HEAD or config is exposed, the
rest of the directory almost always is too, and naming that inference in the
report is enough to make the point without this tool performing the actual
bulk extraction a real attacker (or an authorised tester using git-dumper)
would. That keeps the implementation surface and the liability read both
small: this reads two small, well-known static files, the same shape as
`security-headers-check` reading response headers, never application data.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic classification: two fixed regexes against response bodies against a fixed decision table; no model in the loop |
| Autonomous ops | 10 | Zero-dependency browser tool + CLI, no server, no queue, no ops |
| Time to revenue | 6 | Donations only; a developer who has just read a git-exposure write-up or is doing pre-launch deploy verification wants an immediate self-check, plausible discovery via search inside weeks |
| Gross margin | 10 | The CLI's requests run from the user's own machine against a site they choose; the browser page only renders a report already produced. Serving one more visitor costs a static file |
| Defensibility | 2 | Two fixed regexes and two GET requests — genuinely easy to reimplement, scored lower than the sibling checkers' typical 3 because there is no fallback-rule or multi-header interaction to get right, only the body-vs-status-code distinction |
| Distribution | 7 | Any web developer, security researcher, or agency doing due diligence is a plausible searcher; OWASP's Web Security Testing Guide names `.git` folder exposure explicitly under "Review Old Backup and Unreferenced Files", it is a recurring, bounty-paying HackerOne/Bugcrowd report category, and r/netsec and security blogs publish "found via dorking" posts on an ongoing basis |
| Liability containment | 7 | Two ordinary, unauthenticated GET requests to paths the target server already serves to any anonymous visitor if misconfigured — the same shape and score as `cors-misconfig-check` and `security-headers-check`. Never attempts to download packed objects or reconstruct history itself; reports evidence, names the risk, and points to `git-dumper`/GitTools as the tool an authorised owner would use to quantify it |
| Ethical robustness | 8 | Gets better for site owners as it is used more (a quick, free, zero-signup pre- or post-deploy check that catches a real and damaging misconfiguration before an attacker does), makes no compliance claim, and a clean report is stated as evidence about this one path only, never a full assessment |

Composite: (1+10+6+10+2+7+7+8)/8 = **6.375**. Floor: **1** (`ai_leverage`).

## Mitigation for the floor and near-floor dimensions

`ai_leverage` sits at the deliberate floor every deterministic checker in
this family carries, and needs no mitigation beyond what the family already
established: the classification is factual pattern-matching against a
published file grammar, not a judgment call, so there is no accuracy claim
that needs a model behind it. `defensibility` (2) is a real, named weakness
rather than one masked by the composite — mitigated the same way as the
sibling checkers: the free-and-correct version, shipped first with the
narrowest honest scope, is the moat available to a zero-marginal-cost
product; a copy competing on the same axis does not change the portfolio's
economics.

## Verdict

**Graduate as a venture** (`ventures/git-exposure-check`). Both gates clear
well above the floor of 5 (`liability_containment` 7, `ethical_robustness`
8). Kill criteria: no organic traffic or CLI/repo engagement after a fair
run per `portfolio/usage/README.md`; a materially better free tool at the
same zero-install, soft-404-aware bar becomes the obvious default; or real
user reports show the body-content classification produces false
positives/negatives that cannot be fixed without expanding scope past what
this liability read covers.
