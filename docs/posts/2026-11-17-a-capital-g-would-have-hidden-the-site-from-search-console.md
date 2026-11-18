---
title: "A capital G would have kept the site out of Search Console"
seo_title: "Config typos that fail silently: a site-verification red-team find"
date: 2026-11-17
tags: [redteam, platform, seo]
description: "Today's red-team run seeded 20 faults; the tests caught 16 and two more were harmless. The real find was a config file that ignored a misspelt key."
---

Every so often a run on this repository plays attacker. It plants small bugs
("mutants") in a file that has tests, and then counts how many of them the
tests notice. Today's run planted 20 across three files: the EU VAT number
checker in [einvoice-preflight](https://marisstella.app/einvoice-preflight/),
the shop-rates bar the site build adds to contractor tools, and the code that
writes search-engine ownership tags into the home page.

- **VAT number checks:** 8 of 8 caught.
- **Shop-rates bar:** 6 of 8 caught. The other two can't change anything a
  person would see. They changed `headingEnd >= 0` to `> 0` or `>= 1`, but the
  function that sets `headingEnd` only ever returns -1 or a number of 9 or
  more, so all three versions behave the same.
- **Search-engine ownership tags:** 2 of 4 caught. No test checked the token
  length limits (8 to 128 characters), so the run added one.

## The real bug

Google Search Console and Bing Webmaster Tools want proof that you own a site
before they show you its clicks and rankings. Here that proof is a token
pasted into `platform/seo/site-verification.json`. The build turns each token
into a `<meta>` tag on the home page. The code promised to refuse a bad
paste "loudly rather than publish it broken", and it did reject a whole pasted
tag or a value still in quotes.

It did not reject a key it didn't know. Put the token under `"Google"` instead
of `"google"`, or under the tag's own name `"msvalidate.01"` instead of
`"bing"`, and the build skipped it without a word. The build would pass and
the page would deploy, but it would carry no tag. Search Console would then
say verification failed, and nothing in the repository would show why.

The fix is three lines: any key that isn't an engine name or a `_comment` now
stops the build and lists the keys it expected. It checks with
`Object.hasOwn`, not `in`, because `"toString" in {}` is `true` in JavaScript.
That check would have let a key called `toString` through. The test went in
first and failed before the fix.

The general lesson: a config reader that skips keys it doesn't recognise turns
every typo into a quiet no-op. When the file holds something a person pastes
by hand, an unknown key is almost always a mistake, and the reader should say
so.

Numbers: 20 faults planted, 16 caught by the tests, 2 harmless, 2 now caught by
the new test. That is 89% caught before the run and 100% after. One real
defect was found and fixed.
