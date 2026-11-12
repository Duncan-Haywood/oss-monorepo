---
title: "The page list that fell behind: 30 pages no test was reading"
seo_title: "Hand-kept page lists in tests drift: 30 pages unchecked"
date: 2026-11-12
tags: [process, testing, ventures]
description: "Three venture page tests looped a hand-kept list of pages. The lists missed 30 pages; 11 failed checks their siblings pass. Now they read the folder."
---

Most of the tool sites in this repository have a test that loops over their pages and checks each one: the no-warranty disclaimer is there, the sponsor link is there, the page has one `<h1>`, a canonical link, an `og:title`, structured data. The test names the pages in a literal list.

A run this morning said, in passing, that adding one page to the [wall framing takeoff](https://marisstella.app/wall-framing-takeoff/) meant editing two hand-kept page lists. That raised a question: what happens when a run forgets?

## What the folders held

I counted the `.html` files beside each venture test that loops a list of eight or more page names, and compared them with the list.

| Venture | Pages in the folder | Pages in the list | Unlisted pages that failed the test |
|---|---|---|---|
| wall-framing-takeoff | 47 | 37 | 3 |
| clothing-design-studio | 52 | 33 | 8 |
| state-residency-day-counter | 11 | 10 | 0 |

Thirty pages had shipped without the checks their siblings get. When the lists were replaced with the folder contents, eleven of them failed:

- Six clothing tools (currency risk, green claims, partners, print on demand, price point, shrinkage) had dropped the sponsor link.
- Two clothing pages (camera try-on, parcel duty) had no structured data.
- Two clothing pages were missing from the venture's `llms.txt`, the file that tells AI assistants what the site holds. The sitemap had them.
- The framers' branded bid package page had no `og:title`, no sponsor link, and a shorter disclaimer than the rest of the site.
- The concrete calculator said "not checked against any code" where its siblings say "span table or code". That one was the test being too narrow, so the pattern now accepts both.
- One file, the sample bid package, is generated output and has its own test against the code that builds it. It is now left out on purpose, with a comment saying why.

None of this was dangerous. The site-wide checker already refuses to publish a page without "No warranty". But it is the kind of quiet gap a per-page test exists to close, and the test had stopped seeing every page added after its list was written.

## The fix

Each test now reads its folder (`readdirSync(...).filter(f => f.endsWith(".html"))`) instead of a list. A new page is checked the day it lands, and nobody has to remember anything.

A new check, `platform/ci/check_page_lists.py`, finds the next list that drifts. It looks at every venture test for a literal list of eight or more page names that all exist beside the test, and fails if the folder holds a page the list leaves out. Short per-feature lists ("these three pages have a form") and lists of generated files are left alone. Run against `main` from before this change, it flagged exactly these three tests (four lists: the residency test kept two). It runs in the repository's main-health sweep with the other checks.

The general lesson is an old one: a list kept by hand next to the thing it describes will fall behind it. Where the thing can be listed by code, list it by code.
