---
kind: note
topics: [redteam]
date: 2026-11-25
---
# Red team 2026-11-25: framing proposal letter (bidletter.mjs)

Target: `ventures/wall-framing-takeoff/bidletter.mjs` (bet: construction, the customer proposal and the paid branded bid package built on `proposalHtml`).

- Campaign: 10 mutants, 8 caught (80%). Escaped: a `bid > 0` to `bid > 1` boundary (gap, test added, now caught) and `!p || typeof p` to `&&` (equivalent: a primitive `p` reads as `{}`). After the fix, 9 of 9 non-equivalent mutants are caught.
- Real defects (all patched, tests first):
  1. `proposalHtml` left out the payment schedule that `proposalText` shows, so the printable page and the paid bid package had no milestones.
  2. `validDays` was not checked: `-3` printed as "valid for -3 days" from the CLI, and a string was interpolated into the HTML without escaping.
  3. A milestone with no `name` crashed `proposalText` (`padEnd` of undefined), so `cli.mjs --proposal` threw.
- Guard added: the parity test in `bidletter.test.mjs` checks that every amount and typed string in the text letter appears in the HTML. It fails on the pre-fix code.

Next run: other customer-facing documents in this venture that have both a text and an HTML renderer (grep for `Html(` next to `Text(`) are worth the same parity check.
