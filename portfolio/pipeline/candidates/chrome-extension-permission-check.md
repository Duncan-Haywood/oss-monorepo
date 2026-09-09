# Chrome extension permission checker

Scored 2026-09-09. Composite 6.875 · floor 1 (ai_leverage). The floor is the
point: whether a declared permission has a matching API call in source is
decided by pattern matching against plain text, not a model in the loop —
which is what keeps the per-user cost at zero and every finding traceable to
the exact symbol that did or didn't match.

A Chrome/Edge extension developer submitting to the Chrome Web Store hits a
specific, well-documented review gate: Google's own troubleshooting
documentation names requesting a permission the reviewer cannot match to a
feature — "Purple Potassium" — as the single most common rejection reason,
covering both individual API permissions (`storage`, `tabs`, ...) and broad
`host_permissions` patterns (`<all_urls>`). Unlike a vague "compliance"
concern, this is a mechanical, checkable fact: does the manifest declare a
permission with no matching `chrome.*` call anywhere in the source. The
reverse direction is a real bug independent of review — code that calls a
`chrome.*` API whose permission was never declared fails at runtime.

No existing tool does this specific static cross-check. `webext-permissions`
(npm) returns which permissions a user has *granted at runtime*, not a
source-vs-manifest diff; `chrome-manifest` and
`chrome-extension-manifest-json-schema` validate manifest *shape*, not
usage; `browser-extension-compat-data` checks API *compatibility* across
browsers, not permission-to-usage matching. A web search for a CI checker
that flags unused Chrome extension permissions against actual API usage
returned no dedicated tool — only Chrome's own advice to "map every
permission to a visible feature by hand."

## Why this venture, not another dev-tooling checker

`portfolio/pipeline/README.md`'s "archetype itself" section argues for the
checker/CLI shape over a 233rd `<trade>-bid-calculator`. This candidate is,
honestly, a close structural sibling of `ios-privacy-manifest-check` — both
cross-check a platform-review-gating manifest file against real API usage
detected in source, both are "evidence, not a determination," both ship a
browser tool and a CLI from the same detection module. That is a smaller
concern than the bid-calculator archetype for two reasons stated plainly
rather than argued around: first, the fleet has exactly **one** prior
instance of this specific shape (not 141), so this is nowhere near the
point `DIRECTION.md` raises about marginal variants; second, the audience,
the platform documentation, the permission list, and the rejection
mechanism are all completely disjoint from iOS's Required Reason API — a
Chrome extension developer and an iOS developer are different people
searching different error terminology, so this does not compete for the
same visitor's attention the way a 142nd trade calculator would compete
with the 141 before it.

`duplicate_check.py`, run against the final `VENTURE.yaml` description,
scored 0.99 against this venture's own just-written file (expected — it is
comparing the description to itself) and topped out at **0.29** against
`ios-privacy-manifest-check`, the true structural analog, with every other
match at 0.08 or below. 0.29 is well under the 0.45 read-this-first bar,
and reading it confirms what the score suggests: no shared subject matter,
only a shared *shape*. Nothing in `screened-out.md` covers Chrome
extensions, manifest permissions, or Chrome Web Store review.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic pattern matching against a fixed permission-to-namespace map; no model in the loop |
| Autonomous ops | 10 | Static page + zero-dependency CLI, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a developer finding and using a free checker inside weeks is plausible via search and forum discovery, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user |
| Defensibility | 4 | A transparent, narrow pattern-matcher with no data moat; easy to reimplement, defensible only by being first, correct, and covering both directions (unused *and* undeclared) |
| Distribution | 7 | Named channels: developers searching the exact rejection terminology ("purple potassium chrome extension", "chrome web store unused permission rejected"), r/chrome_extensions, r/webdev, and the chromium-extensions Google Group where permission-rejection and "chrome.X is undefined" runtime-error threads recur; the failure mode is a specific, Google-documented rejection category rather than a vague compliance posture |
| Liability containment | 8 | Reports which known permission-to-API signatures matched or didn't, never a review-outcome determination; disclaimer on both pages and the FAQ schema state this explicitly; an unmapped permission is named as "not checked" rather than guessed at, bounding the cost of being wrong |
| Ethical robustness | 9 | Gets more useful to a developer as they check more of their own extensions; benefits the platform too (fewer over-permissioned extensions is exactly what the review gate exists to produce); no direction in which the developer profits from the tool being wrong |

Composite 6.875 (mean of eight). Both gates — `liability_containment` (8) and
`ethical_robustness` (9) — clear the floor of 5 with room. The only
dimensions at or below 4 are `ai_leverage` (1) and `defensibility` (4),
matching the deliberate floor pattern of the portfolio's other deterministic
checker ventures rather than a defect needing mitigation.

**Mitigation for the sub-5 dimensions (`ai_leverage` 1, `defensibility` 4):**
keep the permission-to-API map deterministic and conservative — an unmapped
permission is named as "not checked," never guessed at or wrongly flagged;
never claim a Chrome Web Store review determination; measure real user
reports before adding any AI-assisted feature (e.g. drafting a permission
justification for the CWS form, per the API-key-switch pattern) or paid
integration.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not `ios-privacy-manifest-check` (different platform,
different permission model, different audience); it is not
`shopify-permission-drift` (that watches customer-authorized Shopify admin
app scopes over time — a drift monitor on a live installation, not a
pre-submission source-vs-manifest static check on a codebase); it is not
`vscode-extension-drift-check` (checks a different marketplace artifact
entirely); it is not `mcp-supply-chain-watch` (MCP server trust, unrelated
platform); and it does not appear anywhere in `screened-out.md`.
`duplicate_check.py` returned no match above the read-this-first threshold
against the final description.

## Verdict

**Build now.** Graduated 2026-09-09 as
`ventures/chrome-extension-permission-check` — a static, deterministic
browser checker with a tested detection engine (45+ Chrome extension
permissions mapped to their `chrome.*` namespace or web API signature,
checked in both directions: declared-but-unused and used-but-undeclared),
broad `host_permissions` pattern detection, an explicit "not automatically
checkable" bucket for permissions with no code signature (`activeTab`,
`background`, `unlimitedStorage`) so those are never falsely flagged, a
matching zero-dependency CLI for a pre-submission CI gate, a secondary doc
page answering the "Purple Potassium" rejection directly, usage counting,
and the standard disclaimer/privacy/sponsor copy. Repeat usage, organic
search demand, and distribution remain unmeasured, same as every other
checker at graduation.
