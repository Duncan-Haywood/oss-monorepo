# PDF accessibility tag checker

Scored 2026-09-16. Composite 6.125 · floor 1 (ai_leverage). The floor is the
point, same as this portfolio's other deterministic checker ventures: whether
a PDF is tagged, titled, has a declared language, has alt-text-bearing
structure elements, and has a text layer at all is decided by reading the
PDF's own object graph — tag tree, catalog dictionary, content stream
operators — not a model in the loop, which is what keeps the per-user cost at
zero and every finding traceable to the exact structural element that proves
it.

## The niche and the evidence for it

DOJ's April 2024 final rule under ADA Title II adopts WCAG 2.1 AA as the
technical standard for state/local government websites and mobile apps, and
its own rule text defines PDFs and other conventional electronic documents
posted through a public entity's website or app as "web content" subject to
that standard — not an exception. Compliance dates were extended one year in
2026: large public entities (population 50,000+) now face April 26, 2027;
smaller entities and special districts, April 26, 2028. A parallel,
earlier-arriving deadline sits on HHS's Section 504 rule (May 2026) for
recipients of federal health-and-human-services funding. Every government
webmaster, county clerk's office, school district, and public university that
publishes permit forms, meeting agendas, public notices, or policy documents
as PDFs now has a concrete reason to check whether those specific files are
accessible — not just the rendered HTML pages this portfolio's existing
`ada-title-ii-evidence` and `shopify-a11y-evidence` already cover.

Real, searchable demand for exactly this check already exists and is easy to
verify without guessing: **PDFix** (pdfix.io/validate-pdf-ua), **PDF Audit**
(pdfaudit.org, built on the open-source `veraPDF` validator), **Free PDF
Checker** (freepdfchecker.com), and **axesCheck** are four separate, live,
free online PDF/UA-and-WCAG checkers, and **PAC (PDF Accessibility Checker)**
is a long-established free Windows desktop tool "globally used" in the
accessibility-consulting field. Five independent competitors serving the same
question is strong evidence the search demand is real (the University of
Washington's own accessible-technology documentation page for "checking PDFs
for accessibility" is itself a top result, which is the kind of institutional,
recurring reference page a niche with real practitioner traffic accumulates)
— and also the honest reason `defensibility` is scored low below.

## Why this venture, not a sixth trade calculator or a 47th checker

`portfolio/pipeline/README.md`'s "archetype itself" section already flags
both the `<trade>-bid-calculator` shape (141+ tries, zero confirmed
visitors) and the `-check`/`-checker` shape (38+ tries at last count) as
needing a genuinely new angle, not just a new niche, to count as evidence of
novelty. `duplicate_check.py` against a description naming this mechanism
(PDF tag structure, StructTreeRoot, alt text, form-field `/TU`, PDF/UA,
Section 508) topped out at **0.20** against `caption-quality-check` — a
different accessibility-adjacent artifact type entirely (SRT/WebVTT caption
tracks, not PDF structure) — with `ada-title-ii-evidence` itself only
scoring **0.13** (it checks *rendered HTML pages* via pasted axe-core JSON,
never opens a PDF). Nothing in `screened-out.md` mentions PDF, PDF/UA, or
document accessibility. 0.20 is well under the 0.45 read-this-first bar.

**The angle that is new, not just the niche:** every surveyed free
competitor requires uploading the PDF to a third-party server, and none
offers a batch/CLI mode. This venture is built around closing exactly those
two gaps — a browser page that reads the file with the native
`DecompressionStream` API entirely in the visitor's own tab (nothing
uploaded, which matters specifically for government forms, permits, and HR
documents), and a zero-dependency Node CLI that recursively scans a whole
document-library folder in one run and exits non-zero on a finding, usable
directly as a CI or scheduled-job gate. That is `PRODUCT_PLAYBOOK.md` §2's
CLI/library shape, reused for a reason: a government IT office's real unit of
work is a folder of hundreds of PDFs, not one file at a time the way PAC (a
single-file Windows desktop tool) or any of the four web checkers require.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic structural parsing: a lenient byte-level PDF object scanner plus exact checks against the tag tree, catalog dictionary, and content-stream operators; no model in the loop |
| Autonomous ops | 10 | Zero-dependency CLI + static browser page, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a government webmaster or accessibility coordinator finding and using a free, no-upload checker inside weeks via search is plausible, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user; the CLI runs on the user's own machine, and the browser page's decompression and parsing run in the visitor's own tab |
| Defensibility | 2 | Five separate existing free tools (PDFix, PDF Audit, Free PDF Checker, axesCheck, PAC) already serve this exact question — lower than this portfolio's typical checker floor of 3 specifically because the field is more crowded, not less; the no-upload/CLI-batch angle is a real but modest differentiation against established, well-known alternatives |
| Distribution | 6 | Named, verifiable channel: DOJ's own April 2024 rule text and its 2026 deadline-extension announcement (April 2027/2028), HHS's parallel May 2026 Section 504 deadline, and five live competitor tools proving sustained search demand for "PDF accessibility checker" and "PDF/UA checker online" terms; scored the same as this portfolio's other evidence/checker ventures rather than higher, because ranking against five established competitors for the head-term keywords is harder than the narrower queries some sibling checkers target |
| Liability containment | 6 | Reads a file the user supplies locally; never touches a third party, never bypasses anything, no different in kind from opening the file in a viewer. Every finding is evidence tied to a specific structural fact (a missing `/StructTreeRoot`, a `/Widget` with no resolvable `/TU`, a page with image content but no `Tj`/`TJ` operator) with an explicit, disclosed heuristic-approximation caveat on the alt-text count and an explicit encrypted-PDF limitation notice — never phrased as a PDF/UA or Section 508 conformance determination |
| Ethical robustness | 8 | Donations-only with no per-scan fee or volume-based revenue, so there is no direction in which the tool profits from over- or under-reporting; gets more useful to a user the more of their own document library they check; a false "clean" result only costs the user a false sense of confidence, which the "evidence, not a determination" disclaimer, the FAQ, and the explicit alt-text/encryption caveats all name directly rather than hide |

Composite 6.125 (mean of eight). Both gates clear the floor of 5:
`liability_containment` (6) and `ethical_robustness` (8). The dimensions at
or below 4 are `ai_leverage` (1) and `defensibility` (2), the second lower
than this portfolio's typical checker floor because of the crowded existing
field — named as the mitigation target below rather than treated as a
disqualifier, the same way this pipeline treats a low `distribution`/
`defensibility` floor on any other narrow, evidence-shaped checker.

**Mitigation for the sub-5 dimensions (`ai_leverage` 1, `defensibility` 2):**
keep the parsing and classification deterministic and conservative — a
stream this tool cannot decode (an unsupported filter, an encrypted PDF) is
reported as "could not be checked", never guessed at as clean; the
approximate image/alt-text count is disclosed as document-wide and
approximate rather than a confirmed per-image match; never claim a full
PDF/UA or Section 508 conformance audit; lean on the no-upload and CLI-batch
differentiation explicitly in the copy and FAQ rather than competing on
checklist breadth against five established tools; measure real user reports
and organic traffic before investing further, given the more crowded field
this dimension exists to flag.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not `ada-title-ii-evidence` (rendered HTML pages via
pasted axe-core JSON, never a PDF's own internal structure); not
`shopify-a11y-evidence` (a Shopify theme's rendered output); not
`vpat-acr-generator` (a vendor's self-reported conformance narrative for a
procurement bid, not a structural check of a specific file); not
`einvoice-preflight` (PDF/UA-adjacent only in that both read PDF-shaped
files, but that venture validates e-invoicing data-interchange format
compliance, an unrelated question); and not `caption-quality-check` (caption
tracks, not PDF structure). `duplicate_check.py` returned no match above the
read-this-first threshold against the final description, and nothing in
`screened-out.md` mentions PDF or document accessibility.

## Verdict

**Build now.** Graduated 2026-09-16 as `ventures/pdf-accessibility-tag-check`
— a zero-dependency Node CLI (`check.mjs`) and browser page (`index.html`)
sharing one checking engine (`engine.mjs`, built on a from-scratch lenient
PDF object parser, `pdf-parser.mjs`, that scans for `N G obj`/`endobj`
patterns directly rather than trusting a possibly-stale cross-reference
table, and expands compressed object streams and FlateDecode content via an
injected `inflate()` function — Node's built-in `zlib` for the CLI, the
browser's native `DecompressionStream` for the page, so neither surface adds
a dependency and neither ever uploads or transmits the file). 53 `node --test`
assertions cover the byte-level parser (including a real `zlib`-compressed
content stream and a compressed object stream built and decoded round-trip),
the checking logic across all six structural checks, the CLI's file and
directory handling and exit codes (via real subprocess runs), the usage
counter, and the page's structure, disclaimers, and bundled worked example.
Repeat usage, organic search demand, and distribution against five
established competitors remain unmeasured, same as every other checker at
graduation.
