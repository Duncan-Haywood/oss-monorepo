---
kind: polish
topics: [design, privacy]
date: 2026-11-19
---
# Polish: /about/ names its outside-service tools once

Date: 2026-11-19. Track: polish/0. PR #17489. Picked item 3 of "Still weakest" in
`polish-2026-11-19-ask-page.md` ("/about/ (4th most loaded) is 19,771 px at 390"). I opened the
draft PR before the full rebuild to claim the item. The only polish PRs open at the start were #11730 and #14012.

## What was wrong

`renderAboutPage` (`platform/pages/build.mjs`) spliced `exceptionNames`, a linked prose list of
every `externalCallExceptions` entry, into three panel lines and the press kit's facts. A hero
`<details class="exceptions">` held a fifth copy. At 54 exceptions that added up to about 1,900 words, and the
privacy section was 9,790 of the page's 19,771 px at 390.

## What changed

- With more than 3 exceptions (`INLINE_EXCEPTIONS`), the four sentences say "the 54 tools listed
  below" and link to `#outside-services`. With 3 or fewer they name the tools inline as before.
- New `<h3 id="outside-services">` + `<ul class="callers">` (CSS columns: 2 at desktop, 1 on
  phones) + one `.hosts` line, placed under the panel. The hero disclosure is removed.
- Tests (`build.test.mjs`): the lede test reads the list instead of the hero disclosure. The
  plural-grammar regex drops ", above,". A new test checks that each exception is linked exactly once in
  `main.prose` once there are more than 3, that the list length equals the count, and that there is no hero `details`.

## Measured (Chromium, built site)

390 px: 19,771 → 13,138 px. 1280 px: 10,126 → 7,531 px. Privacy section at 390 px: 9,790 → 5,226 px.
No sideways scroll. `check.mjs`: publishable, no dead links. The About tests pass (10/10). For the
full `platform/pages` suite, see the run record.

## Still weakest, and what I would do next

1. **Scanner false positives.** `surfaceExternalFetchHosts` reports `x` for 25 tools, plus
   `h.example`, `proxy.local` and `www.w3.org`. These come from `new URL(req.url, "http://x")` base
   URLs and from eval code. llm-spend-guard's own page tells visitors their text "also goes to
   proxy.local", which is wrong. Before dropping reserved names (`.example`, `.local`, single-label
   hosts other than localhost), check what each affected tool really requests. Tools whose only
   host is `x` (changelog-keeper, error-keeper, sign-keeper, survey-keeper, testimonial-keeper,
   webhook-relay) would leave the exception list and claim "nothing leaves your browser". That
   claim has to be checked, not assumed.
2. **The shared footer is 2,128 px at 390** on every page (here it is 16% of the page). The
   disclaimer and footer nav are the bulk of it, so a site-wide trim lifts everything.
3. **The list is 2,000 px on a phone.** Grouping by kind (AI model you connect / account you
   connect / public lookup / your own server) would read better, but that needs a per-tool kind
   that the build doesn't have yet. Don't infer it from hosts that include the false positives above.
4. **"Browse by trade" (764 px at 390)** repeats the category list that the header's Tools tab
   already reaches.
