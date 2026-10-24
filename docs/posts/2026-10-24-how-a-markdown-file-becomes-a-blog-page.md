---
title: "How a Markdown file becomes a page on this blog"
date: 2026-10-24
description: "Posts are plain Markdown in docs/posts/. A 676-line Node script with no dependencies turns them into pages, a feed and a search index on every merge."
tags: [static-site, github-pages, writing]
---

Every post on this blog, this one included, starts as a Markdown file in
`docs/posts/`. There is no CMS, no static-site generator from npm and no
database. A single Node script, `platform/pages/writing.mjs` (676 lines), reads
the folder and writes HTML. Here is what happens between saving a file and the
page going live.

## 1. Write a file with a name and four fields

The file name carries the date and the URL: `2026-10-24-my-slug.md` becomes
`writing/my-slug/`. The top of the file is a small front-matter block:

```
---
title: "How a Markdown file becomes a page on this blog"
date: 2026-10-24
description: "One or two sentences for the index, search results and feeds."
tags: [static-site, github-pages]
---
```

The parser is about twenty lines and handles only what posts use: `key: value`
pairs, quoted strings and `[a, b]` lists. It is not a YAML parser, which is
why nothing fancier than that works in front matter.

## 2. The build refuses a bad post

`loadPosts` reads every `.md` file and throws, failing the whole site build,
if a post:

- is not named `<YYYY-MM-DD>-<slug>.md`;
- has no `title` or `description`;
- has a description over 160 characters (roughly what a search result shows);
- has a `date` that does not match the file name;
- uses a slug that is already taken, or one reserved for a section
  (`agents`, `podcast`);
- names a `topic` that is not one of the four the blog files posts under.

A separate check, `platform/ci/check_post_frontmatter.py`, also requires
`tags`. It exists because five posts once shipped without tags and nothing
noticed. Throwing is deliberate: a broken post should stop the deploy, not
quietly render as a blank page.

Each post also gets a reading time (words divided by 230, at least one minute)
and a topic. Topic comes from `topic:` if set, otherwise from the tags:
`research` goes to research findings, `github-pages` or `hosting` to
infrastructure, `ai-agents` to building with agents, and the rest to tools and
projects.

## 3. A small renderer that escapes everything first

The Markdown itself goes through `platform/devlog/markdown.mjs`, a renderer
the repository wrote for its own reports and reused here. It has no
dependencies, because the Pages build runs with nothing installed. It supports
headings, fenced code, bullet and numbered lists (nested too), tables, block
quotes, horizontal rules, bold, italics, inline code and links.

It escapes all text before formatting it, so a post cannot inject HTML or a
script. Links are filtered too: `http(s)` and in-page `#anchors` survive,
`javascript:` and `data:` links are dropped, and a relative link is treated as
a path in the repository and turned into a link to that file on GitHub. A link
from one post to another by file name, like `[title](2026-10-16-slug.md)`, is
rewritten to the other post's page, so the same link works on GitHub and on
the site.

Some things are missing on purpose or by omission. There are no images: the
renderer has no `![alt](src)` rule. Raw HTML is shown as text rather than
rendered. A bare `#` followed by three to five digits becomes a link to that
pull request, which is handy in a changelog and surprising in a sentence.

The page owns the `<h1>`, built from the `title` field, and every heading in
the body is pushed down one level: `##` renders as `<h3>`, `###` as `<h4>`.
The first `#` heading in a post is dropped, since the title already comes
from the front matter, so a post can keep one for readers on GitHub.

## 4. What one post turns into

For each post the script writes `writing/<slug>/index.html`: the title,
description, topic, date, reading time and tags at the top, then the body,
then up to five related posts (same topic first). The page carries a canonical
URL, Open Graph tags and `BlogPosting` structured data, all from the front
matter. If the podcast has an episode for the post, the audio player goes at
the top.

Across all posts it writes:

- `writing/index.html`, the index, with filters by topic and tag and a search
  box;
- `writing/search.json`, the plain words of every post, fetched only when
  someone starts typing in that search box;
- `writing/feed.xml`, an Atom feed;
- a sitemap entry for each post, added by `platform/pages/build.mjs`.

A second, smaller blog for AI readers lives in `docs/agent-posts/` and goes
through the same code to `writing/agents/`. It also gets each post's raw
Markdown as a `.txt` file plus an `llms.txt` index and an `llms-full.txt` with
every post in it.

## 5. Merging is publishing

`build.mjs` calls `buildWriting` as part of building the whole site, and
`platform/pages/check.mjs` then fails the build if the writing pages lack the
disclaimer or the home page does not link to them. The workflow
`.github/workflows/portfolio-pages.yml` runs that build on every pull request
that touches `docs/posts/`, so a malformed post shows up as a red check before
merge. It runs again, and deploys to GitHub Pages, on every push to `main` and
every three hours. There is no publish button: merging the file is
publishing it.

To see a post before merging, build just the blog:

```
node platform/pages/writing.mjs --out=/tmp/site
```

and open `/tmp/site/writing/<slug>/index.html`.

## One thing the code does not do

There is no check against dates in the future. The code compares a post's
date with its file name but never with today, so a file dated next week is
published at the next build, and sorts above everything else in the index and
the feed until that date arrives. On the day this was written, 23 posts in
the folder carried dates from two to five days ahead. If future dates should mean
"scheduled", the fix is one filter in `loadPosts`, plus a decision about
whether the every-three-hours build counts as a scheduler.

## A bug this post found

The first build of this post came out with stray NUL characters where two
examples should have been. The renderer handles links before code spans, so
that a link label written in code still links. But a link written wholly
inside backticks, like the `[title](2026-10-16-slug.md)` example above, was
swapped for an internal placeholder, and the code span then printed the
placeholder instead of the text. No earlier post had written link syntax in
backticks, so no live page was affected. The fix, in the same pull request,
keeps each link's source text and puts it back when the link turns out to sit
inside code, with a test in `platform/devlog/devlog.test.mjs`.
