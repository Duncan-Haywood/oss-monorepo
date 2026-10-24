# Standby Generator Install Price Calculator

A free browser tool for electricians and generator installers: **enter the equipment, the gas and electrical runs, your crew and your margin, and get a price, the cash you need before install day, what an overrun does to a fixed price, what a service plan adds, and a rough generator size check**. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/standby-generator-install-price-calculator/

After using this, you can now **quote a standby generator install knowing the deposit that carries the equipment and how much slack the price has**, which used to take a spreadsheet and a guess about how long the gas run would take.

## Use

1. Open `index.html`, enter the equipment and fees, the runs, the crew, the plan and the loads, then click Price this job.
2. Pure logic is in `calc.mjs` (`plan()`, `price()`, `jobCost()`, `sizeCheck()`, `encodeShare()`); tests: `node --test`.

Modelled: generator, switch and pad; gas run and meter fee; electrical run; permit, subcontractors and commissioning; crew labour with drive time; expected callback cost; margin as a share of the price and a minimum charge; the deposit against pre-install cash; overrun and margin tables; a service-plan lifetime value; a rough size screen; a share link. Not modelled: sales tax, licences, insurance, utility or engineering fees, trenching beyond what you enter, local code.
Not legal, tax, financial, electrical or gas advice: the size check is not a load calculation. No warranty; see the page footer. MIT licensed (`LICENSE`).
