"""Published practical figures. Every entry says where it was read and on what date.

`how` records how the figure was read in this run:
  primary    - read in the primary document (datasheet or agency record) fetched on CHECKED
  secondary  - read in a secondary page that cites a primary source we did not open
Nothing here is a measurement made by this project.
"""
CHECKED = "2026-10-20"
LHV_H2_KWH_PER_KG = 33.33  # lower heating value of H2, standard value, assumed (DOE's kWh/kg system figures are on LHV)

# key: (label, level, quantity, low, high, unit, source, how, ceiling_key)
PRACTICAL = [
    dict(key="ncr18650b", label="Panasonic NCR18650B cell (NCA)", level="cell", qty="wh_kg",
         low=243, high=243, unit="Wh/kg", ceiling="li_ion_lco",
         source="Panasonic/Sanyo NCR18650B data sheet, version 13.11 R1 (2012): 3.6 V, typ. 3350 mAh, max 48.5 g; "
                "'energy density based on bare cell dimensions'", how="primary"),
    dict(key="ncr18650b_vol", label="Panasonic NCR18650B cell (NCA)", level="cell", qty="wh_l",
         low=676, high=676, unit="Wh/L", ceiling=None, source="same data sheet", how="primary"),
    dict(key="lfp", label="LiFePO4 cells (commercial range)", level="cell", qty="wh_kg",
         low=95, high=172, unit="Wh/kg", ceiling="li_ion_lfp",
         source="Lithium Werks 18650 and 32140 cell data, as listed on Wikipedia 'Lithium iron phosphate battery' "
                "(read 2026-10-20); CATL's claimed 205 Wh/kg (2024) is a claim and is not used", how="secondary"),
    dict(key="lfp_vol", label="LiFePO4 cells (commercial range)", level="cell", qty="wh_l",
         low=227, high=396, unit="Wh/L", ceiling=None, source="same", how="secondary"),
    dict(key="lead_acid", label="Lead-acid batteries", level="battery", qty="wh_kg",
         low=35, high=40, unit="Wh/kg", ceiling="lead_acid",
         source="May, Davidson and Monahov (2018), J. Energy Storage 15, 145, 'Lead batteries for utility energy "
                "storage: A review', as quoted on Wikipedia 'Lead-acid battery' (read 2026-10-20)", how="secondary"),
    dict(key="lead_acid_vol", label="Lead-acid batteries", level="battery", qty="wh_l",
         low=80, high=90, unit="Wh/L", ceiling=None, source="same", how="secondary"),
    dict(key="vrfb", label="Vanadium redox flow battery", level="electrolyte", qty="wh_l_electrolyte",
         low=15, high=25, unit="Wh/L electrolyte", ceiling="vrfb_1p6",
         source="'Reported practical VRB energy density 15-25 Wh/L', Wikipedia (read 2026-10-19 in energy-density); "
                "not traced to a primary source", how="secondary"),
]

# Hydrogen: system-level wt% from the DOE record, a different basis, so it has its own entry.
H2_SYSTEM = dict(label="700 bar Type IV H2 tank system (5.6 kg usable H2)", kwh_kg=1.71, kwh_l=0.86,
                 year=2023, source="US DOE Hydrogen Program Record 24006 (28 April 2025), Table 1: 2023 status, "
                 "projected from finite-element and DFMA analysis (not a measured product); LHV basis", how="primary")

# Round-trip efficiency (%), system level, as listed by PNNL's GridPIQ page 'Energy Storage System Efficiency'
# (read 2026-10-20); where a source gave a range the page uses the median.
RTE = [
    ("Lithium-ion", 83, "W. G. Manuel, Energy Storage Study 2014 (2014)"),
    ("Advanced lead-acid", 85, "IEC, Electrical Energy Storage White Paper (2011)"),
    ("Vanadium redox flow", 75, "Viswanathan et al., National Assessment of Energy Storage ... Phase II Vol. 2 (2013)"),
    ("Pumped hydro", 81, "Viswanathan et al. (2013)"),
    ("Compressed air (CAES)", 50, "IEC, Electrical Energy Storage White Paper (2011)"),
    ("Flywheel", 81, "Viswanathan et al. (2013)"),
]
