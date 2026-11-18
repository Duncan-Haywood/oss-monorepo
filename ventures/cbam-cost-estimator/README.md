# CBAM Cost Estimator

Free, private browser tool for EU importers of steel, aluminium, cement, fertilisers and hydrogen: enter tonnes, embedded emissions and a carbon price to see the CBAM certificates needed, the euro cost and cost per tonne, whether you are under the 50-tonne threshold, and how the cost ramps from 2026 to 2034 as free allocation is phased out.

**Live tool:** https://marisstella.app/cbam-cost-estimator/

After using this, you know roughly what CBAM adds to a purchase, which supplier emissions data to ask for, and whether to apply for authorised declarant status.

Open `index.html`. Tests: `node --test 'ventures/cbam-cost-estimator/**/*.test.mjs'`.

**No warranty.** Free and as-is; not legal or customs advice. Emission presets are illustrative. See `VENTURE.yaml`.

## Known gaps

From the quality audit of 2026-11-12
([`portfolio/quality/audits/2026-11-12-cbam-cost-estimator.json`](../../portfolio/quality/audits/2026-11-12-cbam-cost-estimator.json)).
Fixed since: hydrogen is now never exempt under the 50 t threshold, exactly
50 t counts as not exceeding it, and "1,200" tonnes reads as 1,200, not 1.2.
Still open:

- **Fertiliser mark-up on default values.** The tool applies the general
  10/20/30% mark-up (2026/2027/2028+) to every sector. Secondary guides to
  Implementing Regulation 2025/2621 give fertilisers a 1% mark-up; confirm
  in the Official Journal before changing it.
- **Benchmark presets** mix EU ETS benchmark editions and are not the CBAM
  benchmarks that apply from 2026. They are labelled illustrative; enter the
  published benchmark for your CN code.
- **An exempt importer still sees a non-zero cost headline**, which a
  reader may take as a bill.
