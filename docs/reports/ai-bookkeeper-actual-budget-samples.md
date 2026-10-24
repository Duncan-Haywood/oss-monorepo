# AI Bookkeeper: Actual Budget sample files (2026-10-26)

Source: `packages/loot-core/src/mocks/files/` in actualbudget/actual (MIT, branch
`master`; `main` 404s). Raw URLs work through the proxy, the GitHub API tree
listing 403s, so paths are guessed. Found: `data.ofx`, `data.qif`, `camt/camt.053.xml`.
Not found: `data.csv` and several `camt/*` guesses.

Result: OFX (10 lines, closing balance 12798.01 attached) and QIF (18) read right.
camt.053 (6 entries): entry-level `AddtlNtryInf` after `</NtryDtls>` was missed, so
card entries came back blank. Fixed in `sepa.mjs`, 2 tests in `thirdparty.test.mjs`.
Still no real bank download. Next: other open-source projects' test folders
(beangulp, ofxstatement plugin fixtures) for formats not yet seen.
