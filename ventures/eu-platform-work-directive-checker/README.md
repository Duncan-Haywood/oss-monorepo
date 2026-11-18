# EU Platform Work Directive Checker

Free, private browser tool for gig and app platforms and the people who work through them: answer yes/no questions about how a platform delivers, organises and controls work and what its algorithms do, and see whether it is likely a "digital labour platform" under Directive (EU) 2024/2831, how strong the rebuttable presumption of employment looks, which algorithmic-management rules to act on (prohibited data, written reasons, human review), and the days left to the 2 December 2026 transposition date.

**Live tool:** https://marisstella.app/eu-platform-work-directive-checker/

After using this, a platform knows which duties to plan for, and a worker knows what to ask for, before national law lands.

Open `index.html`. Tests: `node --test 'ventures/eu-platform-work-directive-checker/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal advice. Rules were written from memory of the Directive and must be verified against the source each result names. See `VENTURE.yaml`.

## Known gaps (quality census, 2026-11-15)

From [`portfolio/quality/audits/2026-11-15-eu-platform-work-directive-checker.json`](../../portfolio/quality/audits/2026-11-15-eu-platform-work-directive-checker.json); the Art. 10(5) human-decision rule and the Art. 5 carve-out wording are fixed. Still open:

- A platform with no automated monitoring or decision-making fails Art. 2(1)(a) but is reported "borderline" and still gets the Art. 5-11 findings.
- The prohibited-processing list omits Art. 7(1)(d) (predicting collective action) and (e) (inferring sensitive traits).
- The five control indicators come from the 2021 Commission proposal (Art. 4(2)), which the adopted text dropped; they are not labelled as such, and the strength bands are uncited.
- Art. 8 impact assessment, Art. 10 periodic oversight, the Art. 11 two-week reply deadline and Art. 12 health and safety are not covered.
- On 2 December 2026 itself the countdown says the date "has passed".
