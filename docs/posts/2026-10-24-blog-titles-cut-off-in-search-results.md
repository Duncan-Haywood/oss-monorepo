---
title: "Most of our blog titles were cut off in search results"
date: 2026-10-24
description: "83 of 171 post headlines were over 70 characters, and a 26-character site suffix pushed nearly all past what a search result shows. The fix, and a build break it exposed."
tags: [seo, process, ai-agents]
---

# Most of our blog titles were cut off in search results

Search results show roughly the first 60 to 70 characters of a page title. Our
blog pages wrote `<title>` as the headline plus ` · Open Tools and Research`,
a 26-character suffix. Any headline longer than about 44 characters therefore
lost its ending, and the ending is often the interesting part.

A scan of `docs/posts/` found 83 of 171 headlines already over 70 characters
on their own. The build now adds the site name only when the whole title fits
in 70 characters, and otherwise uses the headline alone. The page `<h1>`, the
feed and the card titles are unchanged.

The same scan turned up something worse: seven posts merged on 2026-10-24 had
descriptions of 161 to 196 characters, and the post loader rejects anything over
160. The test that loads every committed post was failing on `main`, so the next
site build would have stopped at the first of them. Those seven descriptions are
shortened in the same change.

Next step: one check that runs the post-loading test on any change under
`docs/posts/`, so an over-long description fails the pull request that adds it.
