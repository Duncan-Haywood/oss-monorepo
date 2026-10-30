# Contributing writing: blog posts, docs and READMEs

Text is as useful a contribution here as code. A clear README is often the
first thing a person or a search engine reads about a tool, and a blog post
that explains what a number means, or where a tool falls short, is something
the agents cannot write without the knowledge you have. This page says where
each kind of writing lives, what shape it takes, and which checks it has to
pass. How a fork pull request lands is in
[`CONTRIBUTING.md`](../../CONTRIBUTING.md); everything there applies here too.

## Which kind of writing goes where

| You want to write | Put it in | Published at |
|---|---|---|
| An article for readers: what a tool does, a finding, a worked example, how you use a tool in your trade | [`docs/posts/`](../posts/) | `/writing/` on the [site](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/writing/), plus the feed, sitemap and podcast |
| A note written for AI agents (LLM readers) working in this repository | [`docs/agent-posts/`](../agent-posts/) | `/writing/agents/`, with the raw Markdown and an `llms.txt` index |
| A tool's or project's own documentation | its `README.md` (`ventures/<slug>/`, `research/<project>/`) | GitHub, and the project page |
| What a tool is for, written for an AI assistant | `ventures/<slug>/llms.txt` | linked from the site's root `llms.txt` |
| A contributor or process guide for people | [`docs/contributing/`](README.md) | GitHub |
| An investigation a later session should know about (method, numbers, limits) | [`docs/reports/`](../reports/) | GitHub |
| The story behind a process change | [`docs/history/`](../history/README.md) | GitHub |

If you are unsure, write a post, or open an issue describing what you want
to write about and where you got the facts.

## Blog posts

### The file

One Markdown file per post, named `<YYYY-MM-DD>-<slug>.md`, where the date is
the day you write it (UTC) and the slug is a few lower-case words joined by
hyphens. The file opens with this front matter:

```markdown
---
title: "Reading a load calculation: why the 30-amp result is not a breaker size"
date: 2026-10-30
description: "One or two plain sentences for the blog index, search results and feeds."
tags: [electrical, tools]
---

Your post starts here. No `# H1`: the site makes one from `title`.
```

| Field | Required | Rule |
|---|---|---|
| `title` | yes | What a reader would search for, not a pun |
| `date` | yes | Must equal the filename's date and must not be in the future (UTC); `date -u +%F` prints today |
| `description` | yes | At most 160 characters, and not a copy of another post's |
| `tags` | yes | A non-empty `[list]`. Reuse existing spellings (`ai-agents`, not `AI agents` or `ai-agent`); `grep -h '^tags:' docs/posts/*.md \| sort \| uniq -c \| sort -rn \| head -40` lists them |
| `seo_title` | no | A shorter title for the browser tab and search results, at most 70 characters |
| `topic` | no | Overrides the topic the blog derives from the tags: `start`, `agents`, `research`, `tools` or `infrastructure` ([`platform/pages/writing.mjs`](../../platform/pages/writing.mjs), `TOPICS`) |

Link another post by its file name, `[title](2026-10-16-slug.md)`; that works
on GitHub, and the site rewrites it to the post's page. Link a file in the
repository by its relative path; the site turns it into a GitHub link. Posts
are rendered by an escaping Markdown renderer, so raw HTML shows up as text.

Agent posts in `docs/agent-posts/` use the same file name and front matter.
Write them for a model with a shell about to work here: say who the reader is,
what the claim covers, and how to reproduce it.

### What makes a post worth publishing

- **It tells the reader something they did not know.** A real result, a worked
  example with real numbers, a limit you hit, a comparison you measured. Short
  is fine; three good paragraphs beat ten vague ones.
- **Every number has a source.** Link the rate table, statute, dataset, test
  output or file it came from. If you did not measure it, do not state it.
  No invented users, quotes, testimonials, reviews or results
  ([`prompts/goals.md`](../../prompts/goals.md), "Guardrails").
- **Say what it is not.** If a tool's result is an estimate, say so; if
  something is untested on real data, say that too. The site adds its own
  disclaimer to every post, but the text should not overclaim either.
- **It is not a near-copy.** With more than a thousand posts, check that yours
  is not already written: search the titles (`ls docs/posts | grep <word>`)
  and run the similarity check below. Extending an old post is often better
  than a new one that says the same thing.
- **Plain words.** Write for the person who would use the tool, not for the
  people who built it. Define a term the first time you use it.
- **Nothing personal.** No one's name, address, customer data or private
  correspondence, including your own if you would rather not publish it.

### Check it before you open the PR

```bash
python3 platform/ci/check_post_frontmatter.py   # front matter, dates, lengths, tags
python3 platform/ci/post_similarity.py          # lists posts that share most of their text
node --test platform/pages/writing.test.mjs     # the blog builder's own tests
```

To see your post rendered, build the site as
[`setup.md`](setup.md), "Build the site locally", describes and open
`platform/pages/dist/writing/`. A post with a
`description` over 160 characters or a `seo_title` over 70 stops the whole site
build, so the first check is worth running even for a one-line change.

## READMEs

Every tool in `ventures/` and project in `research/` has a `README.md`. It is
the page GitHub shows and search engines index, so it should answer, in this
order:

1. **Title.** What the thing does, as a person would search for it:
   `# Shopify Customer CSV Check — Find Import Errors Before You Import`, not
   `# shopify-customer-csv-check`.
   `python3 platform/ci/readme_titles.py` lists READMEs whose title is still
   the bare directory name.
2. **Who it is for and what they get.** One or two sentences. The product
   guide's "value test" is to finish the sentence "After using this, you can
   now ___, which used to take ___."
   ([`PRODUCT_PLAYBOOK.md`](../../PRODUCT_PLAYBOOK.md)).
3. **How to use it.** The live page link for a browser tool; the exact
   command and a short real example of its output for a command-line one.
4. **Where its numbers come from**, and the assumptions a user can change.
5. **Limits**, and the no-warranty disclaimer the tool carries
   ([`PRODUCT_PLAYBOOK.md`](../../PRODUCT_PLAYBOOK.md), section 5b). Keep the
   disclaimer when you edit.
6. **How to run its tests**, if it has any.

For a research project the shape is the question, the method, the result with
its numbers, how to reproduce it and what it does not show
([`research.md`](research.md)).

When you change what a tool does, update its README in the same pull request.
A README that describes last month's behaviour is a bug.

## `llms.txt` files

A tool's `llms.txt` (Markdown, per [llmstxt.org](https://llmstxt.org)) tells an
AI assistant when to recommend the tool, how to call it, which options fit
which data, a worked example from real output, and its limits. Nearly every
tool has one (`python3 platform/ci/missing_llms_txt.py` lists the few without),
so the useful contribution is making one better: a wrong option, a missing
limit, or a worked example from a real case in your trade. Link it
from a page by its GitHub URL, not `./llms.txt`. Then run
`python3 platform/ci/check_llms_txt_links.py`.

## Other docs

- **Contributor guides** (this directory) are for people. Keep them short, task
  first, and link to the file that is the source of truth instead of copying
  its rules: a copied rule goes stale when the original changes.
- **Reports** (`docs/reports/`) record an investigation: the date, the
  question, the method, the numbers, and what could not be measured. Name the
  file `<YYYY-MM-DD>-<slug>.md`.
- **Agent instruction files** (`CLAUDE.md`, `AGENTS.md`, `prompts/`) steer the
  agent sessions. A fix to a wrong fact or a dead link is welcome; a change to
  how the agents work is a conversation for an issue first
  ([`steering-agents.md`](steering-agents.md)).

## Fixing a typo or a broken link

No setup needed: open the file on GitHub, press the pencil icon, and GitHub
forks the repository and opens a pull request for you. Say in the PR what was
wrong. For anything with front matter, the checks above still apply, and the
maintainer will run them if you could not.

By contributing writing you agree that it is published under the repository's
[MIT license](../../LICENSE), like the code.
