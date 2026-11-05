"""Charts and one estimate for the 2026-11-05 post on FOCUS and other Catholic lay groups.
Numbers typed in from the sources named beside them (fetched 2026-11-05). Almost all are the
groups' own claims. Run: python3 lay_groups_charts.py (prints the tenure estimate)."""
import os
from svgchart import hbar, line

HERE = os.path.dirname(os.path.abspath(__file__))
out = lambda n: os.path.join(HERE, n)

# SEEK conference attendance (all registrants). 2010: CNA via Wikipedia; 2015: FOCUS FY2015 annual
# report ("nearly 10,000"); 2023: FOCUS FY2023 annual report ("more than 19,000"); 2024: CNA via
# Wikipedia (~24,000); 2025: FOCUS 2024-25 stats sheet (21,426 across Salt Lake City, Washington, Cologne).
seek = [(2010, 3500), (2015, 10000), (2023, 19000), (2024, 24000), (2025, 21426)]
line(out("seek-attendance.svg"), "SEEK conference attendance",
     "Registrants at FOCUS's annual conference; 2025 was split across three cities",
     "Source: FOCUS annual reports FY2015, FY2023 and 2024-25 stats sheet; CNA (2010, 2024)",
     [("Attendees", seek)], ymax=30000)

# US Catholic missionaries overseas, from the U.S. Catholic Mission Association handbook data as
# reported by Catholic World Report, 30 Jun 2011.
groups = ["Sisters", "Religious priests", "Brothers", "Lay people", "Diocesan priests", "Seminarians"]
y1968 = [4150, 3715, 869, 419, 282, 208]
y2011 = [1962, 784, 171, 358, 68, 9]
hbar(out("us-missionaries-overseas.svg"), "US Catholic missionaries overseas, 1968 and about 2011",
     "Lay people fell least: from 4% of the total to 11%",
     "Source: U.S. Catholic Mission Association data, via Catholic World Report (30 Jun 2011)",
     groups, [("1968", y1968), ("About 2011", y2011)], unit="", label_w=150)

# Church vocations per 100 alumni. The definitions differ, so this is a rough comparison only.
voc_labels = ["CVN service alumni: now priest/religious (survey)", "NET: priests + religious",
              "NET: priests only", "FOCUS: 'decisions' / all alumni", "Lasallian Volunteers: Brothers"]
voc_vals = [6.0, round(100 * (77 + 40) / 3400, 1), round(100 * 80 / 3400, 1),
            round(100 * 1469 / 80000, 1), round(100 * 12 / 775, 1)]
hbar(out("lay-vocation-rates.svg"), "Priests and religious per 100 alumni",
     "Each group counts differently; read as orders of magnitude, not a ranking",
     "Sources: CARA/CVN 2013 survey (n=5,051); NET (NCRegister 2020, netusa.org); FOCUS FY2025 report; Lasallian Volunteers (2020)",
     voc_labels, [("Per 100 alumni", voc_vals)], unit="", vmax=8, label_w=330)

# How long do FOCUS missionaries serve? FOCUS publishes no mean or median. Two rough estimates:
# (a) person-years served / people who have ever served. Annual counts from the 2026-11-03 post's
#     series (FOCUS's own figures), filled in linearly between reported years; 1998-2008 grown
#     geometrically from 4 to 200. People ever served = 2,377 missionary alumni + 1,062 serving (2024-25).
reported = {1998: 4, 2009: 200, 2012: 361, 2014: 500, 2017: 660, 2021: 800, 2023: 981, 2024: 1062}
years = sorted(reported)
counts = {}
g = (200 / 4) ** (1 / 11)
for y in range(1998, 2009):
    counts[y] = 4 * g ** (y - 1998)
for a, b in zip(years[1:], years[2:]):
    for y in range(a, b + 1):
        counts[y] = reported[a] + (reported[b] - reported[a]) * (y - a) / (b - a)
counts[2009] = 200
person_years = sum(counts.values())
ever = 2377 + 1062
# (b) Little's law: mean tenure = headcount / yearly leavers, with Curtis Martin's "probably 25%
#     ... left on campus" (EWTN News, 3 Jan 2026).
if __name__ == "__main__":
    print(f"(a) {person_years:,.0f} person-years / {ever:,} people = {person_years / ever:.1f} years "
          "(a lower bound: current missionaries are mid-tenure)")
    print(f"(b) 1 / 0.25 = {1 / 0.25:.1f} years in steady state; with growth the true figure is a bit lower")
