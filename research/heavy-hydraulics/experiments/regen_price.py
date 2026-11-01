"""Milestone 5f: what would a 1-5 kW recovery e-machine cost, and how long to pay back in fuel?

Prices are RETAIL LISTINGS for wind/off-grid 48 V permanent-magnet generators seen on 2026-11-01
(WebSearch): 1.5 kW $819 (ato.com), 2 kW $480 / $874 (fruugo) and EUR 289 (ebay.de), 5 kW EUR 1,599
(ebay.de, with charge controller). They are a floor: no inverter/controller to hydraulic load
duty, no mounting, no automotive-grade certification. EUR->USD at 1.08 (assumed).
Energy inputs are from this log: mean shaft power 2.3 kW (5c); recovery share 3.3% central,
10.0% upper corner of 5a (applied to the same 2.3 kW: an upper bound on saving, since the corner
machine draws more); BSFC 250 g/kWh and $6.28/gal diesel (earlier entries; BSFC assumed).
Stdlib, deterministic.
"""
EUR = 1.08
prices = {"1.5kW ato": 819, "2kW fruugo-low": 480, "2kW fruugo-hi": 874, "2kW ebay": 289 * EUR,
          "5kW ebay+ctrl": 1599 * EUR}
P_SHAFT, BSFC, USD_GAL = 2.3, 250.0, 6.28
rho = 0.832  # kg/L diesel
usd_l = USD_GAL / 3.785
for share_name, share in (("central 3.3%", 0.033), ("upper 10%", 0.10)):
    kw_saved = P_SHAFT * share
    l_h = kw_saved * BSFC / 1000 / rho
    usd_h = l_h * usd_l
    print(f"{share_name}: saved {kw_saved*1000:.0f} W shaft, {l_h:.3f} L/h, ${usd_h:.3f}/h")
    for k, v in prices.items():
        print(f"   {k:16s} ${v:7.0f}  payback {v/usd_h:9.0f} h")
