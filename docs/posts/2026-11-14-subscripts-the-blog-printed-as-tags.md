---
title: "Nine blog posts printed their subscripts as HTML tags"
seo_title: "Subscripts and entities in the blog's Markdown, fixed"
date: 2026-11-14
tags: [polish, writing, typography, testing]
description: "Nine posts showed subscript tags and HTML entity names as text. The blog's renderer now keeps typed entities and paired sub/sup tags, and nothing else."
---

This morning's polish run fixed the research pages, which printed `&minus;` where a minus sign belonged. Its notes said the blog uses a different renderer and should get the same sweep. The sweep found the same fault and a second one.

The first fault was entities. A post about [sprinkler hydraulics](2026-11-13-a-sprinkler-grid-solved-like-a-water-main.md) says an emitter "leaks *K*&radic;*P*". On the site it read "leaks *K*" followed by the text `&radic;*P*`, entity name and asterisks included. A bookkeeping post showed sales tax payable at `&minus;$1,197.16`.

The second fault was subscripts, and it was bigger. Authors writing about physics and statistics reach for `<sub>` and `<sup>`: p<sub>s</sub> for a supply pressure, CO<sub>2</sub>, c<sub>y</sub> for a camera's principal point, q<sub>N</sub> and q<sub>P</sub> in a microfinance model, N<sup>1.85</sup> graph paper. The renderer escapes every tag so that a post can never inject markup. That is right in general, but it meant 68 tags (34 pairs) across seven posts showed up as literal `<sub>` text, sometimes six times in one paragraph.

![Before: the square-root sign and the superscript printed as an entity name and tag text](../reports/img/polish-2026-11-14-typed-entities-sprinkler-before-390.png)
![After: K√P with P in italics](../reports/img/polish-2026-11-14-typed-entities-sprinkler-after-390.png)

## What changed

The blog, the updates page, the work queue and the stories all share one small Markdown renderer (`platform/devlog/markdown.mjs`). It still escapes everything first. Afterwards it now puts back two things:

- **An entity the author typed**, like `&minus;`, `&radic;` or `&#8722;`. An entity can only ever decode to a character, never to a tag, so this can't inject anything. `&lt;b&gt;` still reads as the text "<b>". Inside a code span the entity stays as source text, which is how a post shows one (this post does it).
- **A paired `<sub>…</sub>` or `<sup>…</sup>` with no attributes**, closed on the same line within 80 characters. A lone `<sub>`, a `<sub onclick=…>` or any other tag stays text.

Commit titles on the changelog opt out, because GitHub shows those as plain text: a title that says "`&minus;` as text" means the literal string.

## Numbers

Rendering all 4,534 posts with the old and new renderer, and counting only text outside code spans:

| | before | after |
|---|---|---|
| raw `<sub>`/`<sup>` shown as text | 68, on 7 posts | 0 |
| typed entities shown as their names | 4, on 2 posts | 0 |
| posts whose rendering changed | | 9 |

The one entity left on the blog is an image's alt text that quotes `&minus;` on purpose. On the built site the updates page's research log lines changed too: "r_kt < −0.2" had read `r_kt &lt; &minus;0.2`. The site build's 1,637 tests pass, and two new renderer tests pin what is and isn't kept.
