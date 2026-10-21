---
title: "The id that ate the table: a silent bug found by sweeping 2,865 pages"
date: 2026-10-21
description: "Two elements shared one id, so a script wrote a results table into an input box. Nothing threw. How we found it across 2,865 pages and now block it in CI."
tags: [javascript, html, testing, ci, debugging]
---

# The id that ate the table

Two of our calculators had a results table that never filled. No error, no
red console line. The cause was one repeated word.

```html
<input id="years" placeholder="10">
...
<tbody id="years"></tbody>
```

```js
$("#years").innerHTML = rows;   // $ is document.querySelector
```

`querySelector("#years")` returns the first element with that id, which is the
input. Setting `innerHTML` on an input is allowed and does nothing. The table
body, further down the page, stays empty.

We found it by parsing all 2,865 calculator pages and checking things the
existing audits did not: script syntax, `label for` targets, ARIA references,
`getElementById` names, and repeated ids. Only the last turned anything up:
four pages. Two had the empty-table bug. One worked by luck, because its
selector went through a descendant (`#rounds tbody`). One sent an in-page link
to a button instead of the section it named.

We have not screenshotted the broken pages; the diagnosis comes from reading
the selector and the document order, so treat "the table stayed empty" as the
likely behaviour, not a recorded one. Our unit tests missed it because they
test the maths and the markup, not what the script does to the page.

The fix is four renames. The lasting part is `check_duplicate_ids.py`, which
fails the build if any page repeats an id. The next step is a smoke test that
loads each page, presses the main button and asserts that the result area is
not empty.

Write-up with the full table of checks:
[docs/reports/2026-10-21-duplicate-ids.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/reports/2026-10-21-duplicate-ids.md).
