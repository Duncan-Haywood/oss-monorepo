---
title: "One \"+ 1\" made 352 blog posts skip a heading level"
seo_title: "Lighthouse heading-order: one renderer line, 352 posts fixed"
date: 2026-11-11
tags: [site, accessibility, lighthouse, polish]
description: "Desktop Lighthouse scored 100 everywhere. A mobile sample of other page types found 415 pages with a heading skip or a layout shift, fixed in three places."
---

Earlier today the site's first desktop Lighthouse run came back clean.
Performance, accessibility and SEO scored 100 on all 16 pages a first-time
visitor is most likely to see: the home page, the research, blog and stories
indexes, a post, and the eleven flagship tools.

Every Lighthouse run so far had used those same 16 pages, so I ran it on 16
other kinds of page. Two problems turned up that the usual list could not
show.

**Every blog post skipped a heading level.** A post's sections are written
as `##` in markdown, but they reached the page as `<h3>`, straight under the
page's `<h1>`. The renderer, `platform/devlog/markdown.mjs`, added one to
every heading level, on the reasoning that "the page owns `<h1>`". That holds
for a document whose `#` is just another heading. A blog post's `#` is its
title, which the page already prints as the h1, so the extra level opened a
gap. A screen reader that lists headings shows each section as a child of a
missing parent, and Lighthouse's `heading-order` audit marked the post 98.
The same skip was on all 45 compare pages and on 17 category pages, where
tool cards titled `<h3>` sat right under the h1.

A full scan of the build found 414 such pages. The fixes were one condition
in the renderer and a heading level in two card templates. The card CSS gets
one more selector so the cards look exactly as before (16.48 px, measured
before and after).

**The Ask page jumped.** On [/ask/](https://marisstella.app/ask/) the assistant panel draws
itself after the page loads, at a fixed 460 px, and pushed the whole article
down by that much. Lighthouse measured a layout shift of 0.219 and a
performance score of 89. The page now reserves the 460 px, but only when
scripts run, so a reader without JavaScript does not get an empty box. Shift
is now 0.000 and performance 100.

The headings fix is also the one visible change. Section headings in posts
now use the size the stylesheet always had for them, 1.35rem instead of
1.15rem. Before this, the stylesheet's `article h2` rule almost never matched.

To keep the skips from coming back, `platform/pages/heading-order.mjs` scans
a build, and a test renders all of the site's real posts and fails if any of
them skips a level. That includes a post written with `##` followed by
`####`, which the renderer change would not have caught.

What's still weak: a first rough scan flagged one tool page in each of 123
tool directories. The two I opened draw their results with `<h4>` under an
`<h2>`, and the static scan can't see that because the headings are inside
scripts. The [run's notes](../reports/polish-2026-11-11-heading-order.md)
list that as the next item, along with a 656 ms main-thread block on the
guides index.
