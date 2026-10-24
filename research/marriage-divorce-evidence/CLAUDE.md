# Claude Code continuation handoff

Read README.md, DATA_SOURCES.md, MODEL_CARD.md and this directory’s parent research/CLAUDE.md (when in the monorepo). This is a real-data research project, not synthetic data.

## First actions

1. Open Report.html through a local HTTP server; it is the complete latest snapshot.
2. Run `python3 -m unittest discover -s . -p 'test_*.py'`.
3. For authored UI changes: `cd report-app && npm ci && npm run dev -- --host 127.0.0.1`. `npm run build` runs the protected-runtime check, so a failure there means a protected file changed. Preserve the report artifact identity.
4. Restore optional analytical inputs using scripts/restore_inputs.py and the full local handoff bundle, or re-extract official sources using source scripts and recorded checksums. Raw data is usually not in Git.
5. Read source METHODS files before changing a denominator, model or claim. Model checkpoints need the pinned sklearn/Python environment. Prefer transparent coefficient/tree JSON/text for inspection; load only trusted checkpoints.

## What is already done

Original weighted ACS/NSFG/NLSY79 analyses; joint couple profiles; direct husband-only versus husband-majority contrast; duration splitting and threshold tests; first-birth milestone coverage; religion/party analyses; credential-by-broad-occupation ACS table; couple and individual interpretable Poisson prediction models with respondent-held-out evaluation and saved estimators.

## Important findings to retain

- Husband-only vs husband-majority dual earnings is a DIRECT covariance-aware comparison; the original full-sample RR≈1.29,95%CI≈0.98–1.69. Comparing significance against balanced earnings does not establish this contrast.
- The attendance-complete sensitivity is a different sample. Its profile-specification RR≈1.32 is almost unchanged by own attendance. Do not cherry-pick its nominal CI and erase sample dependence.
- Couple ML has modest gains; greater flexibility did not beat enriched additive prediction. Individuals including already-separated people look much more predictable than intact marriages.
- Current/last occupation in ACS can follow divorce, so those tables are not prospective ML predictors. Professional degree does not isolate MD/JD, and completed school years are not verified graduate credentials.
- No validated personalized minimum, safe anniversary, causal earnings-role effect or child-age threshold has been established.

## Useful next research

Prioritize a younger marriage-start cohort (NLSY97), wealth/business-income data (PSID/SIPP), properly linked baseline spouse occupations and religion, external/calendar validation and out-of-distribution abstention. Add events/time-varying histories before making claims about job loss, retirement or empty nest. Keep pre-outcome feature timing explicit; never pool incompatible survey targets. Any proposed individual calculator needs independent validation and should refuse unsupported profiles rather than manufacture precision.

## Portability

The local React project is fully copied; it is separate from the live Sites Worker/R2/D1 deployment. This portable export removes the Site binding. No bearer tokens, environment owner hashes or repository-write credentials are included. Do not repoint the live site inadvertently. Rebuild and host the standalone report independently, or explicitly reconfigure a backend if shared editing is required.
