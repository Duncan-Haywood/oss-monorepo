# Social preview checker

Scored 2026-09-10. Composite 6.875 · floor 1 (ai_leverage). The floor is the
point: whether an `og:image` URL is absolute, whether an image clears a
platform's documented minimum pixel size, and which tag wins when a CMS
plugin duplicates one are all decided by deterministic parsing and byte-level
image-header reads, not a model in the loop — which is what keeps the
per-user cost at zero and every finding traceable to the exact rule that
fired.

A developer, marketer, or content creator whose shared link shows a blank
preview, the wrong image, or no title carries a real, recurring, and
specifically named frustration: "why doesn't my `og:image` show up on
LinkedIn/Slack/Discord even though it looks fine on Facebook" is a real,
repeated question on r/webdev, r/SEO, r/marketing, and Stack Overflow, and
the two causes behind most of those threads — a **relative** `og:image` URL
(the Open Graph protocol at ogp.me requires it be absolute) and an image
**below a platform's documented minimum pixel size** — are exactly the two
this tool is built to name. Existing free tools check only one platform's
own cache after the fact (Facebook's Sharing Debugger, LinkedIn's Post
Inspector) rather than the tags and the real image bytes before a link is
ever shared, and none of them apply the `twitter:image`/`twitter:title`/
`twitter:description` → `og:*` fallback chain X/Twitter documents, so a page
with no `twitter:image` reads as "broken" to a naive tag-presence checker
when it is often working exactly as designed.

## Why this venture, not another dev-tooling checker

`portfolio/pipeline/README.md`'s "archetype itself" section already argues
for the checker/CLI shape over another `<trade>-bid-calculator`. This
write-up also weighs the *niche*, not just the shape: the fleet already has
several response-header/tag checker ventures serving a developer or security
audience (`security-headers-check`, `cors-misconfig-check`, `sri-check`,
`structured-data-drift-check`, `pwa-installability-check`). This candidate
checks a different metadata surface than any of them — none reads
`og:*`/`twitter:*` tags, fetches a preview image, or decodes an image file's
own byte header for its real pixel dimensions — and it deliberately targets a
partly different audience (marketers and content creators, not only
developers), the same reasoning `affiliate-disclosure-checker`'s write-up
used to justify a sixth checker venture.

**A genuine technical differentiator, not just a new label on the same
idea.** Two things no existing venture or, as far as this portfolio's
research found, free competitor tool does:

1. **Reads real image bytes for real pixel dimensions**, via a from-scratch,
   zero-dependency PNG/JPEG(baseline+progressive)/GIF/WebP(VP8/VP8L/VP8X)
   header parser (`imagesize.mjs`), fetching only the first ~64KB of the
   image (a `Range` request, capped regardless of whether the server honours
   it) rather than the whole file — so it never trusts a possibly-stale
   `og:image:width` meta tag or a source file that a CDN resize has since
   shrunk below a platform's minimum.
2. **Applies the documented fallback chain** (`twitter:image` →
   `og:image`, and the same for title/description) instead of scoring a
   missing `twitter:image` as an error on its own — the same
   "differentiation is getting a documented fallback rule right, not just
   reading a tag's presence" argument `security-headers-check`'s write-up
   made for CSP's `frame-ancestors`/`default-src` distinction, applied here
   to a different spec.

## Duplicate check

`duplicate_check.py` was run **before** any code was written, against the
niche description with no venture yet on disk: top score 0.11
(`pwa-installability-check`), 0.11 (`security-headers-check`) — both share
only the generic "checker that fetches a URL and classifies response
metadata" shape and read nothing about Open Graph, Twitter Cards, or image
pixel dimensions. Nowhere near the 0.45 review bar. Re-run after the venture
was built, it now (correctly) finds the venture itself at 0.81 — a
self-match against its own `VENTURE.yaml`, not evidence of a pre-existing
duplicate. A hand grep of every `VENTURE.yaml` for "og:image" and
"twitter:card" before this venture existed returned zero hits, and nothing
in `screened-out.md` covers Open Graph, Twitter Cards, or link-preview
rendering.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic tag parsing and image-byte-header decoding; no model in the loop |
| Autonomous ops | 10 | Static page + zero-dependency CLI, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a developer or marketer finding and using a free checker inside weeks is plausible via subreddit and search discovery, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user |
| Defensibility | 4 | A transparent, narrow tag/byte parser with no data moat; easy to reimplement, defensible only by being first and correct about the fallback chain and real-byte size checking specifically |
| Distribution | 7 | Named channels: r/webdev, r/SEO, r/marketing, r/DigitalMarketing, and Stack Overflow, where "og:image not showing", "twitter card validator not working", "linkedin post inspector alternative", and "slack link preview broken" are real, recurring search phrases and threads; sharper than a generic SEO-audit channel because the failure mode (a blank shared link) is specific and visible to the person hitting it |
| Liability containment | 8 | Reports which documented tag/size/fallback patterns were found from one page fetch, never a guarantee of how any platform will render the result; the disclaimer on both pages says so explicitly, and platform size numbers are attributed to each platform's own published documentation rather than asserted as this portfolio's claim |
| Ethical robustness | 9 | Gets more useful to a user as they check more of their own pages; benefits the visitor too (a correctly-rendering shared link is exactly what these tags exist to produce); no direction in which the operator profits from the tool being wrong, since there is no revenue model beyond optional donations |

Composite 6.875 (mean of eight). Both gates — `liability_containment` (8) and
`ethical_robustness` (9) — clear the floor of 5 with room, so this write-up
does not carry a gate mitigation beyond the disclaimer positioning above. The
only dimensions at or below 4 are `ai_leverage` (1) and `defensibility` (4),
matching the deliberate floor pattern of the portfolio's other deterministic
checker ventures rather than a defect needing mitigation.

**Mitigation for the sub-5 dimensions (`ai_leverage` 1, `defensibility` 4):**
keep the tag parsing and image-size decoding deterministic, byte-level, and
conservative — an unrecognised image format or a truncated read is reported
as "not decoded"/"dimensions undetermined", never guessed at; platform size
numbers cite each platform's own documentation and the disclaimer states
platform rendering behaviour is not guaranteed and can change without
notice; never claim a specific platform will or will not render a given
preview; measure real user reports before adding any AI-assisted feature.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not any of the fleet's other response-header checkers
(none reads `og:*`/`twitter:*` tags or an image file's own byte header for
pixel dimensions); it is not `structured-data-drift-check` (that venture
diffs JSON-LD against a page's own visible text, an entirely different
metadata surface from social-preview tags and images); and it does not
appear anywhere in `screened-out.md`.

## Verdict

**Build now.** Graduated 2026-09-10 as `ventures/social-preview-check` — a
static, deterministic browser report viewer and standalone in-browser
image-dimension tool (the latter works on any third-party image URL with no
CLI step, since loading an `<img>` element is not subject to CORS the way
fetching its bytes is), backed by a tested zero-dependency CLI
(`check.mjs`/`probe.mjs`/`analyze.mjs`/`metatags.mjs`/`imagesize.mjs`, 87
passing assertions), a companion fallback-chain-and-size-rules doc page with
`HowTo` structured data, usage counting, and the standard
disclaimer/privacy/sponsor copy. Repeat usage, organic search demand, and
distribution remain unmeasured, same as every other checker at graduation.
