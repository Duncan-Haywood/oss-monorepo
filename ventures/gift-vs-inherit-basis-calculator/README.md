# Gift vs Inherit Basis Calculator

A free browser tool: **type the value and cost basis of a house or stock position and see the tax each path costs: gift it now (the recipient takes your low basis), let it pass at death (the basis steps up), or sell now.** It adds the federal estate tax a gift can avoid, flags Form 709, and shows how the answer moves with the years to death. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/gift-vs-inherit-basis-calculator/

After using this, you can **decide whether putting a child on the deed or gifting shares is worth the lost step-up** before signing anything, instead of finding the capital gains bill when they sell.

## Model

- Gift: recipient basis is the donor's basis (IRC 1015), with the dual-basis rule for loss property. Inherit: basis resets to fair value at death (IRC 1014).
- Estate tax = rate x (other estate + prior gifts + property or taxable gift - exemption). A gift counts only its value net of the annual exclusion; an inheritance counts the grown value.
- Sell now applies the home sale exclusion to the owner. 2026 exemption and annual exclusion are editable inputs.

Not modelled: state estate or inheritance tax, gift splitting, trusts, depreciation recapture, the Medicaid look-back, portability, community property.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
