# VSME Report Builder

Free, private browser tool for small EU suppliers whose customers or banks ask for ESG data: fill in energy, emissions, workforce, safety and pay figures and get a draft **VSME Basic Module** report (disclosures B1 to B11), a completeness check per disclosure, and flags where the figures contradict each other.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/vsme-report-builder/

After using this, you have a draft sustainability report to send a customer, with the gaps named, which used to mean reading a 100-page standard and building a spreadsheet.

- `calc.mjs`: the engine (field list, completeness, consistency checks, derived figures, Markdown report). `node --test` runs its tests.
- Blank is "not reported", never zero; a typed 0 is a reported zero.
- Emission factors are not supplied: the tool asks you to name the source.

**Limits (read before relying on it).** Written 2026-10-26 from secondary summaries of EFRAG's VSME standard (December 2024); the standard's own text could not be fetched from the build host, so datapoint wording, required fields and the accident-rate convention (per million hours) are ours and unverified against it. No real SME's report has been run through it. B2, B4, B5 and B6 are shallow. The Comprehensive Module is not covered. Next: check each datapoint against the standard's text, add the optional Scope 2 market-based figure and the micro-undertaking thresholds, and try it on a real supplier questionnaire.

**No warranty.** Free and as-is; not legal, tax, accounting or compliance advice. Nothing leaves your browser. See `VENTURE.yaml`.
