"""FOCUS and Catholic lay mission charts. Numbers typed in from the sources named beside
them (fetched 2026-11-03). FOCUS figures are its own unaudited claims; where FOCUS wrote
"more than" or "nearly", the stated round number is plotted."""
import os
from svgchart import hbar, line

HERE = os.path.dirname(os.path.abspath(__file__))
out = lambda n: os.path.join(HERE, n)

# FOCUS missionaries by school year (x = year the school year starts). Sources: FOCUS press
# releases 2009-2023 (EWTN News, PR Newswire, focus.org) and FOCUS "Mission Update" PDF (2024-25, published Jun 2026).
missionaries = [(2009, 200), (2010, 250), (2011, 260), (2012, 361), (2014, 500), (2016, 550), (2017, 660),
                (2019, 730), (2020, 800), (2021, 800), (2023, 981), (2024, 1062)]
line(out("focus-missionaries.svg"), "FOCUS missionaries, 2009-10 to 2024-25",
     "Full-time missionaries by school year (start year shown); round figures are FOCUS's 'more than' / 'nearly'",
     "Source: FOCUS press releases 2009-2023 and FOCUS Mission Update (2024-25); FOCUS's own figures",
     [("Missionaries", missionaries)], ymax=1200)

# Cumulative "decisions to pursue priesthood or religious life" among FOCUS alumni (FOCUS's count).
voc = [(2009, 206), (2012, 384), (2015, 547), (2017, 674), (2019, 867), (2020, 959), (2023, 1206), (2025, 1469)]
line(out("focus-vocations.svg"), "FOCUS alumni who decided to pursue a vocation",
     "Cumulative decisions to pursue priesthood or religious life, as counted by FOCUS; about 78% men",
     "Source: FOCUS releases (2009-2023), OSV News (Nov 2023), FOCUS Mission Update (2025: 1,154 men, 315 women)",
     [("Cumulative decisions", voc)], ymax=1600)

# Fides / Vatican Statistical Yearbook of the Church: lay missionaries worldwide, 31 Dec of each year.
lay = [(2016, 354743), (2018, 376188), (2019, 410440), (2020, 413561), (2022, 413286), (2023, 444606), (2024, 463079)]
line(out("lay-missionaries-world.svg"), "Lay missionaries worldwide",
     "Catholic lay missionaries counted by the Church at 31 December (2017 and 2021 left out: not stated directly in the editions read)",
     "Source: Agenzia Fides 'Catholic Church Statistics' dossiers, from the Statistical Yearbook of the Church",
     [("Lay missionaries", lay)], ymax=500000)

# Jesuit Volunteer Corps, from America magazine (14 Mar 2024).
hbar(out("jvc-volunteers.svg"), "The Jesuit Volunteer Corps has shrunk",
     "Volunteers serving in a year", "Source: America magazine, 14 Mar 2024",
     ["Historical high", "2006", "About 2022", "2023-24"], [("Volunteers", [500, 350, 186, 89])], unit="", label_w=150)
