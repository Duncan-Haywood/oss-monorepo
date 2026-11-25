# Polish 2026-11-25: lien-waiver-checker title, links to pay-app guides, WY/MO states

Track: polish/0. Picked item 2 of "Still weakest" in
`polish-2026-11-25-lien-waiver-header-and-lien-links.md`: `lien-waiver-checker` (a free front
door to bet #1, pay-app billing) linked no pay-app guide.

## What I found

- `<title>` was "Lien Waiver Checker", no query words; meta description 310 characters
  (on `description-length-baseline.json`).
- Links in main and footer: 4 (two sibling tools, licence, sponsor). None to the five waiver
  guides in `pay-app-guides`, though three of those already link back to the checker.
- The checker's statutory-form state list (CA TX FL GA MI NV AZ UT) predated
  `pay-app-guides/lien-waiver-forms-by-state.html`, which read WY and MO from their statutes.
- `llms.txt` pointed at the old github.io address.

## What changed

- Title: "Lien Waiver Checker: Review a Waiver Before You Sign" (52). Description 158 characters,
  facts from the old text. Baseline 2,836 to 2,835.
- New card `#next` "Before and after you sign" after the FAQ: conditional vs unconditional,
  forms by state, waiver log, joint checks, paid short, lien deadline calculator, plus the
  early-access line in the exact wording `pay-app-guides/index.html` uses (nothing for sale).
  Hidden in print. The state FAQ answer links the forms-by-state guide.
- `calc.mjs`: WY and MO added to `FORM_STATES` (and the select); Missouri's note says its form
  covers unconditional final residential waivers only. GA stays (it was already there; the guide
  could not open Georgia's official text, so this run neither confirms nor removes it).
- Tests: `page.test.mjs` checks the five guide links resolve to files; `calc.test.mjs` covers
  WY/MO. 29 pass.
- `llms.txt`: marisstella.app URLs, a Related section, the early-access line.
- Post: update section in `docs/posts/2026-11-25-which-states-make-you-use-their-lien-waiver-form.md`.

## Measured

- Links in main + footer: 4 to 12. Page height 5,280 to 6,058 px at 390 (one card added);
  `scrollWidth` 390 at 390 px and 1280 at 1280 px, before and after (no sideways scroll).
- `select-track.mjs lien-waiver-checker`: 0 pages would change.
- Screenshot: `docs/reports/img/polish-2026-11-25-lien-waiver-checker-next-390.png`.

## Still weakest, next

1. Georgia in the checker's state list is unverified against the official text (see above);
   a run that can reach legis.ga.gov should confirm or drop it, and add it to the guide if confirmed.
2. Four pay-app pages with 6 header links (carried).
3. Carried: meta descriptions over 160 on non-bet products; og:title on einvoice country
   guides; mid-title ellipses in `writing/` and `research/`.
