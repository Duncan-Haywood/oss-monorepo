# BOI Reporting Exemption Checker

A free browser checker for whether an entity still owes a federal Corporate
Transparency Act beneficial ownership information (BOI) report after
FinCEN's August 2026 final rule. Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/boi-reporting-exemption-checker/

After using this, you can now **see whether your entity is still required to
file a federal beneficial ownership report, and if so, by when and for which
owners** — which used to mean tracking down whether the widely-publicized
2025 exemption for U.S. companies became permanent, and whether it applies
to your specific entity.

## Why this exists

Verified via WebSearch on 2026-09-25 against FinCEN.gov's own "Beneficial
Ownership Information Reporting" page, FinCEN's August 11, 2026 news release
"FinCEN Permanently Ends Beneficial Ownership Reporting Requirements for
Millions of Small Business Owners", the Federal Register notice "Beneficial
Ownership Information Reporting Requirement Revision" (2026-08-14, RIN
1506-AB67), and law-firm summaries from Holland & Knight and Mayer Brown:

- **FinCEN's August 11, 2026 final rule (effective August 14, 2026)
  permanently exempted every U.S.-formed entity and every U.S. person** from
  BOI reporting. This supersedes the March 2025 interim final rule that had
  made the same change on an interim basis — it is now permanent rather than
  provisional.
- **Only "foreign reporting companies" still have to file**: entities formed
  under a foreign country's law that have registered to do business in a
  U.S. state or Tribal jurisdiction.
- **Even then, only non-U.S.-person owners get reported.** A foreign
  reporting company still files its own company information even if every
  owner is a U.S. person, but reports zero individual beneficial owners in
  that case.
- **Deadlines**: registered before 2025-03-26 → initial report was due
  2025-04-25. Registered on or after 2025-03-26 → due within 30 calendar
  days of the earlier of actual or public notice of registration.

## Try it

Open [`index.html`](index.html). Choose where the entity was formed; if
foreign-formed and registered in the U.S., enter the registration date and
whether every owner is a U.S. person, then click **Check**.

## What it calculates

All in [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`boiExemptionOutcome`** — determines whether the entity must file at
  all, computes the initial filing deadline from the registration date, and
  flags whether any owner must actually be reported.

## What this does not cover

- Not a filing service — does not prepare or submit a BOI report.
- Does not verify formation jurisdiction, registration status, or any
  owner's actual U.S.-person status; all are self-reported.
- Does not walk through the definition of "U.S. person" itself.
- Point-in-time rule as of 2026-08-14; a future rulemaking or litigation
  could change it again.

## Disclaimers

Not legal, tax, or financial advice. This applies FinCEN's own published
final rule to the facts you enter; it is not a substitute for FinCEN.gov's
own guidance or consulting a qualified attorney.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The answers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`exemption_checked`, `example_loaded`) are counted in `localStorage` only,
never transmitted. Do Not Track and Global Privacy Control are honoured,
and a button on the page turns counting off entirely.

## Development

```sh
node --test
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The calculator and its
test suite are done; no external user contact has happened yet — see
`kill_criteria` in `VENTURE.yaml`.
