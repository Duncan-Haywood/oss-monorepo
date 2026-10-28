---
title: "Titles that fit a search result: 59 pages stop losing their key words"
description: "A fixed site-name suffix pushed 59 comparison and audience page titles past what a results page shows. The build now drops it when it would."
tags: [seo, polish]
date: 2026-10-28
---

# Titles that fit a search result

A results page shows roughly 70 characters of a page title. We scanned all 3,453 pages of this site and
found 967 over that, including `/compare/` pages that read "assembling one by hand in a document editor
alternatives: 2 free tools with a side-by-side page | Open Tools and Research" (121 characters).

The cause was one rule repeated seven times in the build: always add " | Open Tools and Research". It now
goes through one helper that adds the site name only when the whole title still fits, so the words that say
what the page is come first and are never the ones cut. The count fell from 967 to 908. Most of what is
left is blog headlines, which are long on purpose, and a generated phrase on the comparison pages that is
next on the list.

We have not measured any ranking or traffic change. This is a tidiness fix for how a result reads.
