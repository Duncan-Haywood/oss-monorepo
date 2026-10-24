# Start here: Claude Code handoff

This is the complete project export, prepared 19 October 2026. The source lives at research/marriage-divorce-evidence in Duncan-Haywood/oss-monorepo. Large record-level extracts remain in the complete local handoff ZIP.

1. Open this folder in Claude Code and ask it to read CLAUDE.md.
2. For the report: python3 -m http.server 8080, then open http://localhost:8080/Report.html?view=1 .
3. For editing: cd report-app; npm ci; npm run dev -- --host 127.0.0.1 . The original unbound template configuration passed the protected-runtime verification.
4. For analysis: create a Python3.11 virtual environment and install requirements.txt. The full analytical input extracts ARE INCLUDED here, so no restore step is needed for this ZIP. Official large ACS/NLSY archives can be downloaded by the extraction scripts if you want to rebuild from raw sources.

Includes latest standalone report, complete editable app source, original analysis and verification scripts, aggregate results, compact public-use analytical datasets, selected source documentation, raw NSFG inputs, thirteen trained interpretable model checkpoints, coefficient/tree exports, calibration tables and continuation instructions. No credentials or personal financial profile are included.

Important: predictions are not causal effects or validated personal forecasts. The models use an older cohort and do not establish an ideal partner or safe anniversary. Read MODEL_CARD.md and source METHODS files before changing claims.
