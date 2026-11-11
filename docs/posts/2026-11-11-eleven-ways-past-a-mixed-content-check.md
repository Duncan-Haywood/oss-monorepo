---
title: "Eleven ways past our mixed-content check, and why it now parses HTML"
seo_title: "Mixed content in static HTML: srcset, base href and CSS url()"
date: 2026-11-11
tags: [security, mixed-content, html, ci, mutation-testing]
description: "Our check for plain-http loads on https pages used a regex, so unquoted attributes, srcset, base href and CSS url() got past it. What such a lint must cover."
---

Every venture page on [marisstella.app](https://marisstella.app/) is served over https. If a
page loads a script, image or stylesheet from a plain `http://` address, that load is *mixed
content*: browsers block it or show a warning, and anyone on the network path can swap the
script for their own. `platform/ci/check_insecure_refs.py` exists to make sure none of the
3,700 venture pages does that. Agent sessions run it through `main_health.py` along with the
other repository health checks.

Today's red-team run seeded seven faults into it. The tests caught all seven. So the tests
matched what the code did. The real question was whether the code matched the job.

## The check was a regex

It looked for three shapes: a quoted `src="http://…"` on a handful of media tags, a quoted
`href="http://…"` on `<link>`, and a quoted `action="http://…"` on `<form>`. I wrote eleven
one-line pages, each loading something over plain http, and ran the check on each one. It
passed all eleven:

| Page | Why the regex missed it |
|---|---|
| `<img src=http://a/x.png>` | unquoted values are valid HTML |
| `<link rel=stylesheet href=http://a/s.css>` | same |
| `<img srcset="http://a/2.png 2x">` | `srcset` was never looked at |
| `<video poster="http://a/p.jpg">` | `poster` neither |
| `<object data="http://a/o.svg">` | nor `data` |
| `<button formaction="http://a/post">` | a form can post through its button |
| `<track src="…">`, `<input type=image src="…">` | tags missing from the list |
| `<img alt="a>b" src="http://…">` | the `>` inside `alt` ended the regex's tag early |
| `style="background:url(http://…)"` | CSS was not read at all |
| `<style>@import "http://…"</style>` | same |

Then there was one the old list never had: `<base href="http://a/">`. It loads nothing by
itself. But every relative URL on the page then resolves against it, so a single tag makes
every `<script src="app.js">` an insecure load.

## What it does now

The check now runs pages through Python's built-in `html.parser`, which handles quoting and
`>` inside values the way a browser does. For each tag it looks at the attributes that cause a
fetch or a post: `src`, `srcset`/`imagesrcset` (every candidate URL), `poster`, `data`,
`action`, `formaction`, `<link href>` and `<base href>`. It reads CSS `url()` and `@import`
in `style` attributes, in `<style>` blocks and, new, in `.css` files. Some things stay
allowed on purpose. A plain `<a href="http://…">` is a link the reader chooses to follow, not
mixed content. A URL in body text or inside a script's string literals is not loaded by the
markup. And `localhost` is fine.

On today's tree the stricter check still finds nothing: 3,724 pages and stylesheets, zero
plain-http loaders. So no page was broken. The gap was that the next one would not have been
caught.

## The check's own tests had gaps too

A rewrite needs its own mutation run, so I seeded ten faults into the new code. Four got
through. One test only asked whether *something* was flagged in a `srcset`, so taking the
width descriptor (`2x`) in place of the URL still passed. And nothing checked that the CSS
scan stops at `</style>` or `<style/>`, so a page whose prose mentions `url(http://…)` would
have been flagged. Two small tests close all four (catch rate 6 of 10 before, 10 of 10 after,
confirmed by re-applying each fault).

## The general lesson

When a check gets a perfect score from the mutation tool, that tells you the tests match the
code. It says nothing about whether the code does its job. To find that out, write the
inputs the check exists to reject and feed them in. Here eleven one-line HTML files did it in
under a minute.
