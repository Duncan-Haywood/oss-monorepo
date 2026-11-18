---
title: "A copy button that said \"copied\" anyway: 621 clipboard calls, 8 that mishandled a refusal"
seo_title: "Handling navigator.clipboard.writeText failures on copy buttons"
date: 2026-11-17
tags: [quality, javascript, accessibility, clipboard, platform-ci]
description: "Of 621 clipboard copy calls in the catalogue, 8 mishandled a refused copy. One told the visitor a share link was copied when it wasn't."
---

Most of the catalogue's tools have a copy button: copy the summary, copy the
share link, copy the message for each person on the roster. Behind each one
is `navigator.clipboard.writeText(text)`, which returns a promise. That
promise gets rejected more often than you might expect:

- the page is embedded in an iframe that hasn't been given `clipboard-write`;
- the document has lost focus (the visitor clicked into devtools or another
  window at the wrong moment);
- in Safari, when the copy no longer runs inside the click's user gesture;
- on plain `http://` and in some in-app webviews, where
  `navigator.clipboard` is `undefined` and the call throws a `TypeError`.

So a copy button has two jobs: copy the text, and when the browser says no,
tell the visitor and leave the text somewhere they can select it.

## The sweep

`platform/ci/check_clipboard_guard.py` is new. It finds every clipboard write
in `ventures/` (pages, modules and inline scripts; tests skipped), skips
comments and strings, and sorts each call by what happens when the promise
is rejected:

| Shape | Calls |
|---|---|
| awaited inside `try`, or chained to `.catch` / a two-argument `.then` | 613 |
| no `try`, no `.catch`: the rejection escapes and the button goes quiet | 4 |
| inside `try` but not awaited: the `catch` never sees the rejection | 4 |

The first count includes two shapes the first draft wrongly reported: a
ternary wrapped in `( … ).then(ok, fail)`, and an `async function copyShare()`
whose every caller adds `.catch`. The checker follows both now.

## What a visitor saw

To check that the bugs were real and not just a pattern match, a Playwright
script stubbed `navigator.clipboard.writeText` to reject with
`NotAllowedError` and clicked each button, first on `main` and then on the
fixed branch:

| Page | On `main` when the copy is refused | After the fix |
|---|---|---|
| [Shift roster builder](/ventures/shift-roster-builder/), share link | "Share link copied. Anyone who opens it gets this setup…" | "Copy was blocked by the browser. The share link is now in the address bar: copy it from there." |
| [Retainage cash-flow calculator](/ventures/retainage-cashflow-calculator/), copy draft | nothing; uncaught `denied` error | "Copy was blocked; the draft is selected, so copy it by hand." |
| [Change order margin calculator](/ventures/change-order-margin-calculator/), copy summary | nothing; uncaught `denied` error | "Copy was blocked; the summary is selected, so copy it by hand." |

The shift roster is the worst of these. A manager who clicks the share link
and pastes it into the team chat would paste whatever was on the clipboard
before. The page had said the link was copied, so there's no reason to check.

The rest got the same kind of fix: the construction evidence log and the HVAC
maintenance contract calculator now say the copy was blocked instead of going
quiet, and the shift roster's per-person and open-shift copy buttons now
await the copy before falling back to `execCommand("copy")`. The clothing
design studio's quote-request copy now awaits and re-selects the text. Each
venture's own test suite still passes.

## The fix

The fix is the same few lines everywhere:

```js
try {
  await navigator.clipboard.writeText(text);
} catch {
  field.select();
  status.textContent = "Copy was blocked; the text is selected, so copy it by hand.";
  return;
}
status.textContent = "Copied.";
```

The `await` is what matters. Without it, `try` only catches the synchronous
`TypeError` when the API is missing, and the success message runs before the
browser has answered.

## Limits

This is a text check, not a browser run. It can't follow a promise that is
`return`ed to a caller in another file (no such call in the catalogue today),
and it doesn't judge whether a failure message is *helpful*, only that the
page handles the failure at all. It isn't wired into CI yet. Workflow
files need the owner's approval, so that's a separate small PR. Until then,
run it by hand:

```
python3 platform/ci/check_clipboard_guard.py
```
