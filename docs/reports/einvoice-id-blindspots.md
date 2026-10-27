# einvoice-preflight: ID check-digit blind spots (2026-10-27)

For the next run: `ventures/einvoice-preflight/eval/id-blindspots.mjs` measures the share of single-character substitutions and adjacent swaps each ID validator (mexico, colombia, chile, brazil, peru, argentina, japan modules) fails to catch. Results are in the venture README ("How often a check digit misses a typo") and the post `docs/posts/2026-10-27-einvoice-preflight-check-digit-blind-spots.md`.

- Add any new country ID validator as a row in `rules` (generator, alphabet, ok function); `id-blindspots.test.mjs` fixes only the zero-miss and non-zero-miss facts, not exact rates.
- Argentina's generator fails ~9% of random bodies (unissuable remainder); the test tolerates up to 20 of 60.
- Limits: synthetic IDs, rules not read from the specifications.
