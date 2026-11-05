# Catholic demographics: data and charts

Charts for three blog posts dated 2026-11-03: Newman Guide colleges, Traditional Latin Mass
attendees, and FOCUS and other Catholic lay missionaries.

- `newman_colleges.csv`: the 24 colleges in the 2026-27 Newman Guide
  (https://cardinalnewmansociety.org/college/), with IPEDS UNITIDs where one exists.
- `newman_ipeds.py <ipeds_dir>`: builds `newman_ipeds.csv` and `groups.csv` from the NCES IPEDS
  files HD2024, IC2024, EF2023A, EF2023B, SFA2223 and ADM2023
  (https://nces.ed.gov/ipeds/datacenter/data/<NAME>.zip, unzipped). The downloads are not committed (~60 MB).
- `newman_charts.py`, `tlm_charts.py`, `missions_charts.py`: draw the SVGs with `svgchart.py`
  (no dependencies). The TLM and missions numbers are typed in beside their sources; nothing is estimated.

Rebuild: `python3 newman_ipeds.py <ipeds_dir> && python3 newman_charts.py && python3 tlm_charts.py && python3 missions_charts.py`.

Known gaps (for a later run): no representative demographics of TLM attendees exist (Bullivant and
Cranney's *Trads*, OUP 2026, may have them); FOCUS publishes no missionary sex/age/tenure data and no
Form 990 since FY2014; the CARA/CVN 2013 volunteer alumni study PDF (nrvc.net) returned 503; there is
no online series of US Catholic missionaries overseas (the printed U.S. Catholic Mission Handbook is the next step).

`lay_groups_charts.py` (2026-11-05 post on who serves in FOCUS and other lay groups): SEEK attendance,
US missionaries overseas 1968 vs about 2011, vocations per 100 alumni, and a printed estimate of
FOCUS mean tenure (about 3 to 4 years; FOCUS publishes none). Still missing: any programme's median
tenure, alumni careers, and the CARA/CVN 2013 study tables (the nrvc.net PDF still would not load).
