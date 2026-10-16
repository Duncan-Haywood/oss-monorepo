# App Listing Metadata Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/app-listing-metadata-check/>

Free browser tool and zero-dependency CLI that lints App Store and Google Play listing text before you submit: character limits, wasted characters in the 100-character iOS keyword field, promotional claims in names, placeholder text, keyword stuffing, other-platform mentions, and any competitor terms you ask it to avoid.

```
node check.mjs fastlane/metadata            # iOS and android locales, auto-detected
node check.mjs fastlane/metadata/android --store play
node check.mjs fastlane/metadata --avoid "uber,lyft" --strict --json
node --test                                 # engine, CLI, page and usage tests
```

Limits are failures; everything else is a heuristic reported as a notice with the evidence. Rules last reviewed 2026-10-06 (`SPEC_REVIEWED` in `engine.mjs`). Not affiliated with Apple or Google; no warranty; not review advice. Text is never uploaded.
