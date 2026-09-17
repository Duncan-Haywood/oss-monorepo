# WordPress plugin review checker

Scored 2026-09-09. Composite 6.875 · floor 1 (ai_leverage). The floor is the
point: whether a readme.txt field, a plugin-header field, an escaping
function, or a nonce-verification call is present is decided by pattern
matching against plain text, not a model in the loop — which is what keeps
the per-user cost at zero and every finding traceable to the exact line or
file that did or didn't match.

A WordPress plugin developer preparing a wordpress.org Plugin Directory
submission or version update hits a specific, well-documented set of review
notes: a `readme.txt` **Stable tag** that doesn't match the plugin header's
**Version** (the directory serves whichever version `Stable tag` names, so a
stale tag ships an old build even after a new one is uploaded), a missing
`License`/`License URI` declaration (a GPL-compatible license is a hard
directory requirement), unescaped `$_GET`/`$_POST`/`$_REQUEST`/`$_COOKIE`/
`$_SERVER` output, and `$_POST` handling with no nonce-verification call.
Unlike a vague "compliance" concern, each of these is a mechanical, checkable
fact readable straight from a `readme.txt`, a plugin header comment block,
and PHP source the developer already has.

No existing free tool cross-checks a plugin's `readme.txt` against its main
file's header in both directions, alongside the two source-level security
patterns, in one pass. WordPress.org's own official
[Plugin Check](https://wordpress.org/plugins/plugin-check/) tool is closer in
spirit but is a WordPress plugin itself — it requires installing WordPress
core and running the check from inside a live install, not something a
developer can run against a bare source tree from the command line or a
browser tab before WordPress is even set up. Generic PHP static-analysis
tools (PHPCS with the WordPress-Coreruleset) flag output-escaping style
broadly across a whole coding-standards ruleset, not this narrow, specifically
review-relevant pair (Stable tag / Version, and a `$_POST` handler with no
nonce anywhere in the file) framed around the exact WordPress.org submission
gate.

## Why this venture, not another dev-tooling checker

`portfolio/pipeline/README.md`'s "archetype itself" section argues for the
checker/CLI shape over a 234th `<trade>-bid-calculator`. This candidate is,
honestly, a close structural sibling of `ios-privacy-manifest-check` and
`chrome-extension-permission-check` — all three cross-check a
platform-review-gating manifest/header file against real usage detected in
source, all are "evidence, not a determination," all ship a browser tool and
a CLI from the same detection module. That is a smaller concern than the
bid-calculator archetype for two reasons stated plainly rather than argued
around: first, the fleet has exactly **two** prior instances of this specific
shape (not 141), so this is nowhere near the point `DIRECTION.md` raises
about marginal variants; second, the audience, the platform documentation,
the field names, and the review mechanism (a text readme file plus a PHP
comment header, not a JSON manifest or a Swift/Obj-C API surface) are all
completely disjoint from both iOS's Required Reason API and Chrome's
`manifest.json` permissions — a WordPress plugin developer is a different
person searching different error terminology than an iOS or Chrome extension
developer, so this does not compete for the same visitor's attention the way
a 142nd trade calculator would compete with the 141 before it.

`duplicate_check.py`, run against the final description, scored **0.09**
against its closest match (`chrome-extension-permission-check`), well under
the 0.45 read-this-first bar — lower than `chrome-extension-permission-check`
itself scored against `ios-privacy-manifest-check` (0.29), because the field
names, file formats, and platform terminology involved (`readme.txt`,
`Stable tag`, nonces, `$_POST`) share even less surface vocabulary with the
other two than they share with each other. Nothing in `screened-out.md`
covers WordPress, plugin review, or PHP escaping/nonce patterns.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic pattern matching against fixed field names and function-name lists; no model in the loop |
| Autonomous ops | 10 | Static page + zero-dependency CLI, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a developer finding and using a free checker inside weeks is plausible via search and forum discovery, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user |
| Defensibility | 4 | A transparent, narrow pattern-matcher with no data moat; easy to reimplement, defensible only by being first, correct, and covering the readme/header cross-check plus both source-pattern checks together |
| Distribution | 7 | Named channels: developers searching the exact rejection terminology ("readme.txt stable tag mismatch", "wordpress plugin nonce verification missing"), r/WordPress, r/ProWordPress, the wordpress.org support forums' developer sections, and the Advanced WordPress Facebook group, where Stable tag confusion and review-note questions recur; the failure mode is a specific, platform-documented review note rather than a vague compliance posture |
| Liability containment | 8 | Reports which required fields are present, whether Stable tag and Version agree, which lines echo a superglobal with no escaping function detected, and which files read `$_POST` with no nonce check detected -- never a review-outcome determination; disclaimer on both pages and the FAQ schema state this explicitly, and the line-level/file-level heuristic's limits are stated plainly (an escaping function elsewhere in the flow, or a non-standard field spelling, is not something this can see) |
| Ethical robustness | 9 | Gets more useful to a developer as they check more of their own plugins; benefits the platform too (fewer Stable tag mismatches, fewer unescaped-output/missing-nonce security notes is exactly what Plugin Review exists to catch) -- no direction in which the developer profits from the tool being wrong |

Composite 6.875 (mean of eight). Both gates — `liability_containment` (8) and
`ethical_robustness` (9) — clear the floor of 5 with room. The only
dimensions at or below 4 are `ai_leverage` (1) and `defensibility` (4),
matching the deliberate floor pattern of the portfolio's other deterministic
checker ventures rather than a defect needing mitigation.

**Mitigation for the sub-5 dimensions (`ai_leverage` 1, `defensibility` 4):**
keep the readme/header field lists and the escaping/nonce function lists
deterministic and conservative — a field or function this tool has no
mapping for is named as "not checked" or reported plainly as missing rather
than guessed at; never claim a wordpress.org Plugin Review determination;
measure real user reports before adding any AI-assisted feature or paid
integration.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not `ios-privacy-manifest-check` (different platform,
different manifest format, different audience); it is not
`chrome-extension-permission-check` (different platform, different manifest
format, different audience); it is not `shopify-permission-drift` (that
watches customer-authorized Shopify admin app scopes over time on a live
installation, not a pre-submission static check on a plugin's own source and
readme); it is not `vscode-extension-drift-check` (a different marketplace
artifact entirely); and it does not appear anywhere in `screened-out.md`.
`duplicate_check.py` returned no match above the read-this-first threshold
against the final description.

## Verdict

**Build now.** Graduated 2026-09-09 as
`ventures/wordpress-plugin-review-check` — a static, deterministic browser
checker with a tested detection engine (readme.txt field parsing, plugin
header field parsing, a Stable-tag-vs-Version cross-check, an
unescaped-superglobal-output scanner, and a missing-nonce-check scanner), a
matching zero-dependency CLI for a pre-submission or pre-release CI gate, a
secondary doc page answering the Stable tag mismatch directly, usage
counting, and the standard disclaimer/privacy/sponsor copy. Repeat usage,
organic search demand, and distribution remain unmeasured, same as every
other checker at graduation.
