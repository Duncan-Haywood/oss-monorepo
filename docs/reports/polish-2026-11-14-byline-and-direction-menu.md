---
kind: polish
topics: [design]
date: 2026-11-14
---
# Polish 2026-11-14: the Get it built form's research menu, and the blog byline row

Track: polish/0. Started from `polish-2026-11-14-research-entities.md` item 2 ("the product side
may have the same fault ... worth the same sweep") and the blog-meta item carried in the last three
polish notes. Open PRs searched first (`polish`, `custom-development`, `writing`): none touched
either.

## 1. Direction menu on /custom-development/ (the "Get it built" form)

**Measured.** `grep -rhoE '&amp;[a-z]+;' dist --include=*.html` outside `research/`: most hits
were in six pages, `custom-development/index.html` and `R-0001` to `R-0005`. All in the
`#cdf-dir` research-direction `<select>`: **50 of 1,080 project choices** showed a literal entity
(`market&rsquo;s`, `a &gamma;-fold`, `area&times;delay`, `range&ndash;Doppler`, `&le;`, `&sup2;`,
`&ldquo;`, `&nbsp;`). The rest of the hits were posts that show an entity on purpose, in code.

**Cause.** `renderDirectionOptions` in `build.mjs` passed research titles (authored HTML) straight
to `escapeHtml`. Fixed by decoding with `decodeEntities` (shared table, `entities.mjs`) before
the 110-character cut and the escape; optgroup labels too. `&gamma;` was missing from the shared
table, so I added the remaining Greek letters (the only unknown name across every research title,
programme question and theme name, checked with `unknownNamedEntities`).

**Check.** New `doubleEscapedInChrome(html)` in `entities.mjs` (test in `entities.test.mjs`):
`&amp;<entity>;` inside `<option>`, `<title>`, `<h1>`, `<h2>` or an optgroup label. Wired into
`check.mjs` over every served page: 9,707 pages in ~0.7 s. On the build before the fix it
reported exactly the six form pages; with only the `&gamma;` gap left it still reported the six
(that is how the gap was found); on the final build it reports none (see run record notes).

## 2. Blog post byline row (every post)

**Before** (`img/polish-2026-11-14-byline-before-{1280,390}.png`): the topic pill sat 3 px from the
date, the tags row touched the pill row (`<br>` inside the paragraph), and at 390 px the line broke
inside "11 November 2026 · / 2 min read · Source".

**After** (`img/polish-2026-11-14-byline-after-{1280,390}.png`, plus an agent-to-agent post at
390 px checked by eye): a wrapping flex row (`.post-meta` in `writing.mjs`). Pill, then date and
reading time kept on one line; a second row holds the tags with Source (and, on agent posts,
"Markdown (plain text)") at its right end, so no separator dot ever starts a wrapped line. Height at
390 px: 79 → 57 px. No sideways scroll at 390 or 1,280 (scrollWidth = viewport).

![Before, 1,280 px](img/polish-2026-11-14-byline-before-1280.png)
![After, 1,280 px](img/polish-2026-11-14-byline-after-1280.png)
![Before, 390 px](img/polish-2026-11-14-byline-before-390.png)
![After, 390 px](img/polish-2026-11-14-byline-after-390.png)

## Still weakest, and what I would do next

1. **The rest of the form pages' copy.** `/custom-development/` is where a business decides to ask
   for work; it was not given a visual pass this run. Screenshot it at 390 px and judge the form
   (label/hint spacing, the 1,100-choice menu: a search box or "programmes only" default may serve
   better than a giant `<select>`).
2. Carried over: `contrast.mjs` fallback without axe-core; answer leads on ~22 high-intent tools;
   lead cap 100 → 90; `MAX_LINKS` 8 → 6; TeX-ish text in research ledes.
3. The sweep in `check.mjs` covers headings and menus only. A wider one (all text outside
   `<code>`/`<pre>`) would catch prose too, but posts about entities would need an allow-list.
