# JSON-LD Rich Result Validator

A free browser tool for site owners, SEOs, developers and agencies: **paste a page's HTML or a JSON-LD block and
see why it is not eligible for rich results.** It finds every structured-data entity, lists the required
properties that are missing and the recommended ones that would help, and flags the usual traps: a price written
`$14.00`, a lowercase currency, dates that are not ISO 8601, a duration like "30 minutes", an author given as a
plain string, an Event with no location, a remote job with no applicant location. A second panel builds starter
JSON-LD (FAQ, Product, local business, article, breadcrumbs) and checks it as you type. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/json-ld-rich-result-validator/

After using this, you can now **fix structured data that Google ignores, and ship valid markup for a new page
in minutes**.

## Checked types

Product, Article (and BlogPosting, NewsArticle), LocalBusiness (and common subtypes), Organization, Recipe, Event,
JobPosting, FAQPage, BreadcrumbList, SoftwareApplication, VideoObject. `@graph` documents are flattened. Other
types are reported as informational.

Not covered: Microdata and RDFa, whether markup matches visible page text (see `structured-data-drift-check`),
indexing, and anything Google decides at ranking time. Rules come from Google's public structured-data
documentation and may lag changes. Since August 2023 Google shows FAQ rich results only for well-known government
and health sites; the tool says so rather than promising otherwise.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of Google, Schema.org and all search engines.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`markup_checked`, `example_loaded`, `markup_built`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
