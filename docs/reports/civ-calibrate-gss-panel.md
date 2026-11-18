---
kind: note
tagged: auto
---
# civ-calibrate: GSS panel (agent doc, 2026-11-08)

- GSS 2016-2020 panel: `https://gss.norc.org/content/dam/gss/get-the-data/documents/stata/GSS_2020_panel_stata.zip` works through the proxy (~12 MB). The page's file links are JS-built; guessed names return an HTML page with HTTP 206/200, so check the first bytes for `PK`. The cumulative `GSS_stata.zip` (47 MB, ~600 MB .dta) has no respondent linkage. ANES 403s. Waves: `_1a` 2016, `_1b` 2018, `_2` 2020; pairs 2016-2020 and 2018-2020 only (no item pairs 2016-2018 in the 70 tables).
- Result and next step are in `research/civ-levers/README.md` (calibrate section) and `LOG.md`: eps is not identifiable from a pair-free panel (power 14% at eps 0.3). A next run needs interaction data (a network or contact-diary panel) or exposure experiments (Bail 2018 replication data on Dataverse?), not more GSS items.
- Pre-existing: `tests/test_cascades.py` fails at import in the system python (not investigated).
