"""Check that each number quoted in draft.md appears in the results file it came from.

Run: python3 paper/check_numbers.py   (stdlib only; exit 1 on any miss)
Each entry is (results file, text that must appear in it, the paper's claim).
The README and LOG carry the same figures; this ties the paper to the raw outputs.
"""
import pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent.parent
LOG = (HERE / "LOG.md").read_text()
CHECKS = [
    ("experiments/correction_search/results.txt", "1.086", "best section ratio 1.086"),
    ("experiments/correction_search/results.txt", "1.157", "uncorrected ratio 1.157"),
    ("experiments/tail_search/results.txt", "naca0015 0.15 5.0 3.5", "best tail (0015, area 0.15, AR_t 5, arm 3.5)"),
    ("experiments/uiuc_naca241x/results.txt", "min 1.215  max 1.669", "NF/UIUC ratio 1.22 to 1.67"),
    ("experiments/uiuc_naca241x/results.txt", "mean 1.355", "mean ratio 1.36"),
    ("experiments/demonstrator_spec/results.txt", "6.1", "CG tolerance 6.1 mm"),
    ("experiments/demonstrator_spec/results.txt", "5.2", "CG tolerance 5.2 mm"),
    ("experiments/demonstrator_spec/results.txt", "2078", "span 2,078 mm"),
    ("experiments/tail_gust/results.txt", "within 10% at H = 12.5: 72 of 78", "72 of 78 within 10%"),
    ("experiments/tail_gust/results.txt", "all three H: 24 of 78", "24 of 78 within 5%"),
    ("experiments/thrust_phugoid_power/results.txt", "-1.00  1.00  25.2  +0.0087", "s=-1 phugoid +0.0087 at n=1 free"),
    ("experiments/thrust_phugoid_power/results.txt", "-1.00  1.00  21.2  +0.0062", "s=-1 phugoid +0.0062 tripped"),
    ("experiments/thrust_phugoid/results.txt", "s=-2.25: Re(ph) change n=1 -> 0.2: -0.0083", "phugoid change -0.0083"),
    ("experiments/tail_gust/results.txt", "1.2%", "best design 1.2%"),
    ("experiments/propeller_power_slope/results.txt", "curves 104; propellers 71", "5e: 104 curves, 71 propellers"),
    ("experiments/propeller_power_slope/results.txt", "0.9   -0.88", "5e: median s_P -0.88 at k 0.9"),
    ("experiments/propeller_power_slope/results.txt", "1.0   -1.10", "5e: median s_P -1.10 at the peak"),
    ("experiments/propeller_power_slope/results.txt", "1.1   -1.33", "5e: median s_P -1.33 at k 1.1"),
    ("experiments/propeller_power_slope/results.txt", "0.8   -0.67", "5e: median s_P -0.67 at k 0.8"),
    ("experiments/propeller_power_slope/results.txt", "1.2   -1.54", "5e: median s_P -1.54 at k 1.2"),
    ("experiments/imu_allan_scale/results.txt", "median 1409 deg/hr (min 1298)", "9z: BI for 10% of q rms ~1,300 to 1,400 deg/hr"),
    ("experiments/imu_allan_scale/results.txt", "median 0.1203 deg/s/sqrt(Hz)", "9z: noise density for 10% of q rms 0.12"),
    ("experiments/imu_allan_scale/results.txt", "max 6.8e-04", "9z: largest drift fraction 6.8e-4"),
    ("experiments/airspeed_sensor_scale/results.txt", "272 Pa = 4.0 %", "9aa: trim dynamic pressure 272 Pa, 4.0% of span"),
    ("experiments/airspeed_sensor_scale/results.txt", "TEB 1.0 % span | 68.95 | 2.669 | 1.48", "9aa: 1% TEB is 1.48 of u rms"),
    ("experiments/airspeed_offset_fit/results.txt", "OE | 0.37 | 0.10 | 1 | 0.75 | 0 of 160 | 6.07, 2.76, 4.10", "9ab: plain OE at offset 0.37"),
    ("experiments/airspeed_offset_fit/results.txt", "OE+b | 1.48 | 0.10 | 1 | 0.75 | 2 of 160 | 0.31, 0.80, 1.26", "9ab: OE+b at offset 1.48"),
    ("experiments/airspeed_scale_factor_fit/results.txt", "OE+b | 1.48 g0.894 | 0.10 | 2 | 0.75 | 8 of 160", "9ad: 8 of 160 failures at gain 0.894"),
    ("experiments/vtol_sizing/fnon_sweep_results.txt", "0.480 |   166   202   275   348", "10d: 166 km at f_non 0.48, 250 Wh/kg"),
    ("experiments/wingcopter_check/results.txt", "range 167 km (published 94", "10e: 167 km vs 94"),
    ("experiments/wingcopter_check/results.txt", "94 km: 5.7  (L/D 6.8)", "10e: implied L/D x eta_c 5.7"),
    ("experiments/wingcopter_check/results.txt", "hover 2 min at DL 150 N/m2 (10a values): 107 Wh of 1628", "10e: hover 107 Wh of 1628"),
    ("experiments/wingcopter_check/span_polar_results.txt", "S 0.5 m2 AR 7.8 chord 0.25 m CL 1.28 CDi 0.083: CD0 +0.105", "10g: CD0 0.105 at S 0.5"),
    ("experiments/wingcopter_check/span_polar_results.txt", "S 0.7 m2 AR 5.6 chord 0.35 m CL 0.91 CDi 0.059: CD0 +0.075", "10g: CD0 0.075 at S 0.7"),
    ("experiments/wingcopter_check/span_polar_results.txt", "S 1.0 m2 AR 3.9 chord 0.51 m CL 0.64 CDi 0.042: CD0 +0.053", "10g: CD0 0.053 at S 1.0"),
    ("experiments/wingcopter_check/span_polar_results.txt", "S 0.7: 9.7  8.4", "10g: clean L/D 9.7 at S 0.7"),
    ("experiments/wingcopter_check/rotor_drag_results.txt", "S 0.5: dCD0 +0.070  f 0.0351", "10h: f 0.035 at S 0.5"),
    ("experiments/wingcopter_check/rotor_drag_results.txt", "S 0.7: dCD0 +0.040  f 0.0281", "10h: f 0.028 at S 0.7"),
    ("experiments/wingcopter_check/rotor_drag_results.txt", "S 1.0: dCD0 +0.018  f 0.0176", "10h: f 0.018 at S 1.0"),
    ("experiments/wingcopter_check/rotor_count_results.txt", "4 stopped rotors: S0.5: 7.7  S0.7: 7.1  S1.0: 6.4", "10i: 4 rotors 7.7/7.1/6.4"),
    ("experiments/wingcopter_check/rotor_count_results.txt", "8 stopped rotors: S0.5: 6.0  S0.7: 5.6  S1.0: 5.1", "10i: 8 rotors 6.0/5.6/5.1"),
    ("experiments/vtol_sizing/fnon_sweep_results.txt", "0.550 |   131   161   220   279", "10d: 131 km at 0.55"),
    ("experiments/vtol_sizing/fnon_sweep_results.txt", "0.620 |    97   120   165   210", "10d: 97 km at 0.62"),
    ("experiments/vtol_sizing/fnon_sweep_results.txt", "0.620 |   257   478   700", "10d: 478 Wh/kg for 200 km at 0.62"),
    ("experiments/incidence_offset_fit/results_bisect.txt", "OE+b | 1.25 deg | 0.10 | 2 | 0.75 | 2 of 160", "9ah: OE+b 2 of 160 at 1.25 deg"),
    ("experiments/incidence_offset_fit/results_bisect.txt", "OE+b | 1.50 deg | 0.10 | 2 | 0.75 | 86 of 160", "9ah: OE+b 86 of 160 at 1.5 deg"),
    ("experiments/incidence_offset_fit/results_bisect.txt", "OE+b+d | 1.25 deg | 0.10 | 2 | 0.75 | 79 of 160", "9ah: OE+b+d 79 of 160 at 1.25 deg"),
    ("experiments/incidence_offset_fit/results.txt", "OE+b | 1.00 deg | 0.10 | 1 | 0.75 | 0 of 160", "9af: OE+b 0 failures at 1 deg"),
    ("experiments/incidence_offset_fit/results.txt", "OE+b | 2.00 deg | 0.10 | 1 | 0.75 | 21 of 160", "9af: OE+b 21 of 160 at 2 deg, 1 period"),
    ("experiments/incidence_offset_fit/results.txt", "OE+b | 2.00 deg | 0.10 | 2 | 0.75 | 80 of 160", "9ag: OE+b 80 of 160 at 2 deg, 2 periods"),
    ("experiments/incidence_offset_fit/results_gain_offset.txt", "OE+b | 0.60 deg | 0.10 | 2 | 0.75 | 4 of 160", "9ak: OE+b 4 of 160 at gain 1.19 + 0.596 deg, 2 periods"),
    ("experiments/incidence_offset_fit/results_gain_offset.txt", "OE+b | 0.60 deg | 0.10 | 1 | 0.75 | 0 of 160", "9ak: OE+b 0 of 160 at 1 period"),
    ("experiments/incidence_offset_fit/results_gain_offset.txt", "LS | 0.60 deg | 0.10 | 2 | 0.75 | 87 of 160", "9ak: LS 87 of 160 at 2 periods"),
    ("experiments/vtol_sizing/cruise_sized_hybrid_results.txt", "    1   0.15  0.2 30 -> 35", "10j: break-even 35 km at 1 kW/kg"),
    ("experiments/vtol_sizing/cruise_sized_hybrid_results.txt", "hover power 129 W/kg", "10j: hover 129 W/kg"),
    ("experiments/vtol_sizing/climb_transition_hybrid_results.txt", "100   2   30  0.6    1 -> 47  0.376", "10k: break-even 47 km, payload 0.376"),
    ("experiments/vtol_sizing/climb_transition_hybrid_results.txt", "100   1   30  0.6    1 -> 41", "10k: 41 km at 1 m/s"),
    ("experiments/vtol_sizing/climb_transition_hybrid_results.txt", "100   4   30  0.6    1 -> 59", "10k: 59 km at 4 m/s"),
    ("experiments/vtol_sizing/climb_transition_hybrid_results.txt", "100   2   30  0.6    4 -> 33", "10k: 33 km at 4 kW/kg"),
    ("experiments/vtol_sizing/total_effect_results.txt", "0.562 [+0.552,+0.573]        0.650", "10n: p_batt first 0.562, total 0.650"),
    ("experiments/vtol_sizing/total_effect_results.txt", "sum first-order 0.699; sum total-effect 1.172", "10n: sums 0.70, 1.17"),
    ("experiments/vtol_sizing/sourced_cells_results.txt", "P50S       260       5070       3549          22", "10o: P50S 22 km"),
    ("experiments/vtol_sizing/sourced_cells_results.txt", "P42A       230       2314       1620          44", "10o: P42A 44 km"),
    ("experiments/vtol_sizing/derated_cells_results.txt", "P42A    44       58       86       130      170", "10p: P42A derating row"),
    ("experiments/vtol_sizing/derated_cells_results.txt", "P50S    22       28       40       60       78", "10p: P50S derating row"),
    ("experiments/vtol_sizing/correlated_pack_results.txt", "-0.9      40   24   68     44", "10r: rho -0.9 row"),
    ("experiments/vtol_sizing/correlated_pack_results.txt", "+0.3      38   22   68     46", "10r: rho +0.3 row"),
    ("experiments/vtol_sizing/global_sensitivity_results_n20000.txt", "sum of first-order indices 0.823", "10m: first-order sum 0.82"),
    ("experiments/hub_throughput/results.txt", "error +0.6%", "6: simulated wait within 0.6% of Erlang C"),
    ("experiments/hub_throughput/results.txt", "4        4      8 |                   9.8 |           80.0 |               10.7", "6: 9.8, 80 and 10.7 flights/h"),
    ("experiments/hub_throughput/cargo_hub_results.txt", "100   1.0 |       42.0 |      11.4 |         12 |    0.09 |       0.28 |         1.60", "6b: 11.4 flights/h, 0.09 MW, 1.6 t at 100 km"),
    ("experiments/hub_throughput/cargo_hub_bursts_results.txt", "719 / 4964", "6c: p95 4,964 s at k = 8 and 24 spares"),
    ("experiments/hub_throughput/cargo_hub_taper_results.txt", "CC-CV 20-90%          43.1 min", "6d: 43.1 min"),
    ("experiments/hub_throughput/cargo_hub_taper_results.txt", "CC-CV 30-100%       24", "6d: 24 spares for 30-100%"),
    ("experiments/hub_throughput/cargo_hub_taper_results.txt", "CC-CV 30-100%         72.0 min   8-charger limit  6.67", "6d: 72.0 min, 6.7 flights/h"),
    ("experiments/rodrigues_energy/results_days.txt", "1.539", "day-cluster exponent"),
    ("experiments/rodrigues_energy/results_days.txt", "1.529", "date fixed effect exponent"),
]
LOGCHECKS = [  # figures that exist in LOG.md outcomes (the results files print them in tables)
    "1,273 km at engine 1 kW/kg", "145 to 167", "0.40 (cruise-sized), 0.34 (hover-sized, 10e) and 0.18",
    "78 of 4,474", "0 of 17", "+13% to +25%", "0.035 chords", "17 of 144", "78, 81, 79, 80",
    "1.29 to 1.45", "0.37 to 0.52", "6.5% faster", "97%",
    "76 at every true slope scale", "67 of the 78 designs keep every gust peak", "84 to 86% at sigma 2%",
    "0.33%, 0.70%, 4.45%", "66 of 78", "63, 51, 0, 0",
    "19.1% then 0.74%", "144 (LS start) against 9", "0.07, 0.65, 1.38%", "86.4 J/m [81.2, 91.5]", "77.4% [73.8, 80.8]", "153.8 against 60.1", "9.6 kJ [8.9, 10.3]", "384 J per metre", "0.26, 1.51, 2.55", "0.25, 1.21, 1.63", "median 0.878", "0.07, 0.67, 1.51%", "0.16, 1.57, 2.43", "0.21, 1.39, 2.56", "0.20, 1.30, 1.94", "median 0.623", "+28.6%, +24.4%, +25.9%", "Best worst-case over the three L: 14.8%", "0.15, 1.34, 2.36", "phi1 median 1.173", "0.845, 5th to 95th percentile 0.821 to 0.868", "-38.0%, -49.3%, -52.6%", "+34.2%, +9.8%, -9.1%", "+183.5%, +112.6%, +33.5%", "best worst case 51.0%", "0.28 to 0.70 deg/s", "0.096", "median -2.25", "[-0.24, 0.73]", "+0.0087 (free) and +0.0062 (tripped)", "+0.0127 at s = 0", "+0.0037"]
bad = 0
for path, needle, claim in CHECKS:
    text = (HERE / path).read_text()
    ok = needle in text
    bad += not ok
    print(("ok   " if ok else "MISS ") + f"{claim}: {needle!r} in {path}")
readme = (HERE / "README.md").read_text()
for needle in LOGCHECKS:
    ok = needle in LOG or needle in readme
    bad += not ok
    print(("ok   " if ok else "MISS ") + f"{needle!r} in LOG.md/README.md")
sys.exit(1 if bad else 0)
