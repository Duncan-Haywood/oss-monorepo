"""Print the tables behind the README to results.txt:  python experiments/run.py"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from house_adufees import model as m  # noqa: E402

out = []
p = out.append
p("== A. Flat ADU charge against a house (inside Denver)")
for st in m.STEPS:
    p(f"{st}: ADU ${m.adu_sdc(st):,.0f}; house on 2,000 sq ft ${m.house_sdc(2000, st):,.0f}; on 6,000 sq ft ${m.house_sdc(6000, st):,.0f}")
p("== B. Charge by charged area, July 2026 step: area_sqft house_usd adu_usd")
for a in (500, 1000, 2000, 3000, 4000, 6000, 8000, 10000):
    p(f"{a} {m.house_sdc(a):.0f} {m.adu_sdc():.0f}")
p("== C. Per floor sq ft: 480 sq ft ADU against 2,000 sq ft house (July 2026, inside Denver)")
p(f"ADU ${m.per_sqft(m.adu_sdc(), 480):.2f}/sq ft; house (2,000 sq ft charged) ${m.per_sqft(m.house_sdc(2000), 2000):.2f}/sq ft")
p("== D. Step increase of 1 July 2026 (inside Denver)")
p(f"ADU +{100 * m.step_increase('adu'):.1f}%; house on 2,000 sq ft +{100 * m.step_increase('house'):.1f}%")
p("== E. Inside against outside Denver, July 2026")
p(f"ADU ${m.adu_sdc():,.0f} vs ${m.adu_sdc(location='outside Denver'):,.0f}; house on 2,000 sq ft ${m.house_sdc(2000):,.0f} vs ${m.house_sdc(2000, location='outside Denver'):,.0f}")
p("== F. House-market's $16,930 water and sewer SDC minus Denver Water's January-step charge on 2,000 sq ft")
p(f"Denver Water ${m.house_sdc(2000, '2026-01-01'):,.0f}; remainder (sewer and other) ${m.residual():,.0f}")
p("== G. Charged area implied by the $10,450 single-family fee reported for Denver in 2026 (search excerpt, Colorado Sun)")
implied = (10450 - 3380) / 1.01
p(f"July 2026 schedule: ${m.house_sdc(implied):,.0f} at {implied:,.0f} sq ft charged (a lot-sized area, not a floor area)")
p("== H. DOTI 2026 sewer permit fees (inside Denver, July 2026 water step)")
p(f"fees: application $425 + inspection $150 = ${m.sewer_permit_fees(False):,.0f}; per-unit connection fee ${m.sewer()['total_per_unit']:,.0f}")
p(f"ADU sharing the house's water tap: SDC ${m.adu_sdc():,.0f} + sewer permit ${m.sewer_permit_fees(False):,.0f} = ${m.adu_water_sewer_total(False):,.0f}")
p(f"ADU with its own tap (upper-bound reading): ${m.adu_water_sewer_total(True):,.0f}")
p(f"house on 2,000 sq ft charged: ${m.house_water_sewer_total():,.0f}")
p(f"house-market's $16,930 less Denver Water Jan-step SDC less DOTI per-unit fee: ${m.unexplained_after_sewer():,.0f} still unexplained")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
