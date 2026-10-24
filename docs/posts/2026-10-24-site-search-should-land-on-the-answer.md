---
title: "Site search should land on the answer, not the shelf it sits on"
date: 2026-10-24
description: "Our search indexed 1,300 tools and none of the 1,700 guide pages inside them. What changed when guides, posts and comparison pages became results."
tags: [seo, site-search, github-pages, structured-data]
---

# Site search should land on the answer, not the shelf it sits on

This site carries about thirteen hundred free tools. Most of them come with
pages of their own: "how much to charge to install crown molding", "why is my
1099-K higher than what I actually made", "this calculator vs. Jobber". An
audit of the built site on 2026-10-24 counted 1,756 such pages, more than the
tools themselves.

The search box on the front page could not find any of them. It indexed tools
and research projects (2,353 entries) and nothing else. A guide's title was
folded into its tool's keywords, so typing the question found the right
tool, and then the visitor had to find the one page among that tool's thirty
that answered it. The blog's 72 posts weren't in the index at all: searching
for a post's own title found, at best, a tool that happened to share a word.

## What changed

Each guide, each blog post, and each collection page (the "free tools for
landlords" shelves and the "Jobber alternatives" comparison pages) is now its
own search result. The ranking code didn't change. Here is what it returns
over the new index, against the old one:

| Query | First result before | First result now |
|---|---|---|
| why is my 1099-k higher | the reconciliation tool | the guide answering that question |
| how much to charge for crown molding | the bid calculator | the guide of that name |
| should I use amazon awd | the FBA calculator | the AWD decision guide |
| jobber | an arbitrary bid calculator | "Jobber alternatives: 43 free tools" |
| guidelines not rules | no match | the blog post |
| ebay fee | the eBay fee calculator | the eBay fee calculator |

The last row matters as much as the others. A query that names a tool should
still get the tool. Guides sit after every tool in the index, and ties go to
the earlier entry, so the tool wins whenever both score alike.

## The first version was worse

Listing every guide as-is made "jobber" return 86 rows, nearly all reading
"This calculator vs. Jobber". Those pages are a template that many tools
carry, and the site already gathers them into one comparison page per
product. So a "vs" page whose comparison page exists is left out of the
search index, and that one page stands in for all of them. The rule is "is
this already gathered somewhere", which the site already computes, so it
also catches near-duplicate titles that a title-matching rule would miss.

## The cost

The index grew from 453 KB to 679 KB gzipped. It downloads on the first
keystroke, never on a plain visit, so someone who only browses pays nothing.
To keep it that small, each guide contributes its title and the opening of
its description, not its body. The question a guide answers is in its title.

## Breadcrumbs that say what the page shows

The same audit found a second mismatch. Every tool page has shown a trail like
"Home › Compliance checks › 1099-K Threshold Checker › Why did the threshold
keep changing?" since the shared site header landed. The structured data
search engines read declared a two-level trail on entry pages and nothing at
all on the 1,750 pages inside tools. An older code comment had decided that
those pages were "not a level of the site". The visible header had since made
them one.

Now one list builds both the visible trail and the markup, so the two can't
drift apart, and a test compares them on every published tool page. Blog
posts got the same treatment.

## What we did not change

2,623 page titles run past the roughly 65 characters a results page shows.
They are written by hand per tool, and search engines shorten a long title
rather than penalise it. Rewriting 2,600 of them mechanically would trade
keyword coverage for display length with nothing measured behind it, so it
waits for real search data.

The full audit, the method and the verification are in
[`docs/reports/2026-10-24-site-search-and-breadcrumbs.md`](../reports/2026-10-24-site-search-and-breadcrumbs.md).
