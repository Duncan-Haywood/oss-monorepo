---
kind: polish
topics: [design]
date: 2026-11-14
---
# Polish 2026-11-14: blog and updates pages kept typed entities and paired sub/sup

Track: polish/0. Picked from `polish-2026-11-14-research-entities.md`, "Still weakest" item 2
("the blog (`docs/posts`) renderer is a different code path and worth the same sweep"). Item 3's
blog meta row is PR #15905's, and the custom-development menu's `&amp;rsquo;` (354 of the 418
double-escaped entities on the built site) is in that PR too, so both were left alone. Searched
open PRs for `polish`, `entit`, `markdown`.

## What was wrong

`platform/devlog/markdown.mjs` `inline()` (blog posts, /updates/, /queue/, stories, podcast notes)
escapes all text outside code spans. So:

- an entity an author typed showed as its name: `*K*&radic;*P*` → "K&radic;\*P\*" (the `*em*` rule
  also needs a space or `(` before the star, so P stayed raw); `&minus;$1,197.16`; research
  log lines on /updates/ read `r_kt &lt; &minus;0.2`;
- raw `<sub>`/`<sup>` showed as tag text: 68 tags on 7 posts (p<sub>s</sub> six times in one
  paragraph of the hydraulic break-even post; CO<sub>2</sub>, c<sub>y</sub>, q<sub>N</sub>,
  N<sup>1.85</sup>).

## What changed

- After escaping, `&amp;(#d…|#x…|name);` goes back to `&…;` (as `research/_homepage/build.py`
  does since PR #15883), and `*em*` may open right after such an entity (not after the ones `esc`
  writes itself: `&amp; &lt; &gt; &quot; &#39;`, so "don't\*x\*" is unchanged).
- A paired, attribute-free `&lt;sub&gt;…&lt;/sub&gt;` / `sup` within 80 characters becomes the
  tag. Nothing else is restored.
- Code spans are held before escaping, so both stay literal inside backticks.
- `inline(…, { entities: false })` keeps the old behaviour; `updates.mjs` `entryHtml` (commit
  titles on /changelog/ and /updates/) uses it, since GitHub shows titles as plain text.
- Two tests in `platform/devlog/devlog.test.mjs`.

## Measured

Old vs new renderer over all 4,534 posts, outside code spans (`count.mjs` method: render, strip
`<code>`/`<pre>`, count `&amp;entity;` and `&lt;/?su[bp]&gt;`):

| | before | after |
|---|---|---|
| raw sub/sup tags as text | 68 on 7 posts | 0 |
| typed entities as text | 4 on 2 posts | 0 |

Built site, `&amp;entity;` occurrences (`grep -rhoE`): writing 57 → 54 (the rest are code spans and
the bank post's deliberate double escape), updates + changelog 6 → 4 (commit titles quoting
entities on purpose). Screenshots: `img/polish-2026-11-14-typed-entities-sprinkler-{before,after}-{390,1280}.png`,
`img/polish-2026-11-14-typed-entities-pressure-{before,after}-390.png`.

## Still weakest, and what I would do next

1. **Front-matter descriptions go through `esc()` only**, so a description can't use an entity or
   a subscript (this post's description avoids them). Fine for `<meta>`, but the blog index card
   and the post's dek show it too; probably leave it and keep descriptions plain.
2. **A check**: a `check.mjs` pass flagging `&amp;[a-z]+;` or `&lt;/?su[bp]&gt;` outside
   `<code>` on built pages would catch the next renderer that escapes twice. Needs an allowlist for
   the bank post and the entities posts, which quote them on purpose.
3. Carried over: `contrast.mjs` fallback without axe-core; answer leads on ~22 tools; lead cap
   100 → 90; 149 cut selects at 1,280 px (`polish-2026-11-14-select-track.md`).
