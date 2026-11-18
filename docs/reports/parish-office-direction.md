---
kind: note
subjects: [parish-office]
tagged: auto
---
# Parish and religious-organisation tools: direction notes for the next run

Owner, 2026-11-03: "it'd be nice to build tools for catholic orgs. parishes.
relgiious orgs. as a direction" and "standard problems they have."

- Home venture: `ventures/parish-office/`. Its `ROADMAP.md` lists the
  standard parish-office problems as modules in priority order; deepen it a
  module at a time rather than starting sibling calculators.
- Landed 2026-11-03: the Mass intentions book (engine, page, CLI, 32 tests).
- The goals.md entry for this direction is in its own control-plane PR
  (CODEOWNERS covers `prompts/`), so it may land after this one.
- Canon text: the English Code on vatican.va. Working URL for cc. 879-958:
  `https://www.vatican.va/archive/cod-iuris-canonici/eng/documents/cic_lib4-cann879-958_en.html`
  (the per-range guesses `cann944-958` and `cann897-958` 404). Fetched with
  curl through the proxy; the web-fetch agent got 404s on the guessed URLs.
- The 1991 decree on collective intentions was not found at the vatican.va
  URLs tried (404) or at EWTN/CatholicCulture via guessed paths. Find an
  official text before modelling it.
- Existing related ventures: `clergy-housing-allowance-calculator`,
  `donor-acknowledgment-letter-generator`, `donor-retention-analyzer`,
  `volunteer-shift-scheduler`, `grant-reporting-tracker`.
- Most valuable next slice: the two-counter Sunday collection count sheet
  (ROADMAP item 1); it serves every congregation, not only Catholic ones.
