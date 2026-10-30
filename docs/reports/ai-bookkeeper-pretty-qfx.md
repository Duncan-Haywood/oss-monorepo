# ai-bookkeeper: pretty-printed OFX (2026-10-27)

`ofxTag` in `bank.mjs` now allows whitespace between a tag and its value. Found by sweeping
redstreet/beancount_reds_importers test files (GPL; clone at run time, read only).
Source of fresh sample files: raw `git clone --depth 1` of public repos works from cloud sessions
(firefly-iii/data-importer has no statements; guessed ofxstatement plugin repos 404).
Still open: a real statement from the Ally-style bank with credits and balances.
