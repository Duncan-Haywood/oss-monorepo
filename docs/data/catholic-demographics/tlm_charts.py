"""Traditional Latin Mass charts. Every number is typed in from the source named beside it
(fetched 2026-11-03); nothing is estimated. See the post for caveats."""
import os
from svgchart import hbar, line

HERE = os.path.dirname(os.path.abspath(__file__))
out = lambda n: os.path.join(HERE, n)

# Pew Research Center, survey of US adults 3-9 Feb 2025 (1,787 Catholics), report of 16 Jun 2025, p. 36-37.
PEW = "Source: Pew Research Center, survey of US adults 3-9 Feb 2025 (1,787 Catholics), published 16 Jun 2025"
hbar(out("tlm-pew-2025.svg"), "Who has been to a Latin Mass? (Pew, 2025)",
     "% of US Catholics, by how often they attend any Mass", PEW,
     ["All US Catholics", "Attend Mass weekly", "Once or twice a month", "A few times a year / seldom", "Never attend Mass"],
     [("Attended a TLM in the last 5 years", [13, 22, 15, 8, 7]), ("Attend a TLM weekly now", [2, 4, 1, 0.5, 1])],
     vmax=40, label_w=200)

# Kloster 2018 self-selected survey (n ~1,770); comparison figures are the other surveys he cited.
hbar(out("tlm-kloster-2018.svg"), "A 2018 Latin Mass survey vs Catholics generally",
     "Self-selected survey of TLM attendees (n about 1,770) vs figures it cites from Pew and CARA, %",
     "Source: Fr. Donald Kloster, 2018 survey (liturgyguy.com, 24 Feb 2019); comparisons Pew 2016/2018, CARA 2018, Daily Wire 2017",
     ["Attend Mass weekly", "Approve of contraception", "Approve of abortion", "Approve of same-sex marriage"],
     [("TLM attendees (survey)", [99, 2, 1, 2]), ("Catholics generally (as cited)", [22, 89, 51, 67])],
     vmax=100, label_w=200)

# FSSP statistics as of 1 November each year, fssp.org.
yrs = list(range(2017, 2026))
priests = [287, 304, 320, 330, 341, 356, 368, 386, 387]
sems = [129, 142, 145, 162, 168, 169, 179, 182, 162]
line(out("tlm-fssp-growth.svg"), "FSSP priests have grown every year since 2017",
     "FSSP priests and seminarians (incl. postulants), 1 November each year; average member age 38-39",
     "Source: FSSP annual statistics, fssp.org (2017-2025)",
     [("Priests", list(zip(yrs, priests))), ("Seminarians", list(zip(yrs, sems)))],
     ymax=400, notes=[(2021, "Traditionis Custodes")])

# Latin Mass Directory counts reported by InfoVaticana, 14 Sep 2026.
c = [("United States", 446), ("France", 224), ("Poland", 117), ("Italy", 117), ("United Kingdom", 98), ("Brazil", 92), ("Germany", 87), ("Spain", 36)]
hbar(out("tlm-locations-by-country.svg"), "Where the approved Latin Mass is said, 2026",
     "Approved TLM locations in the Latin Mass Directory, top 8 countries (nearly 1,500 in 64 countries)",
     "Source: Latin Mass Directory figures as reported by InfoVaticana, 14 Sep 2026",
     [n for n, _ in c], [("Locations", [v for _, v in c])], unit="", label_w=150)

# Catholic Project (Catholic University of America) 2025 priest study, fielded by Gallup.
hbar(out("tlm-priests-by-ordination.svg"), "Younger priests want the Latin Mass more",
     "% of US priests who call access to the TLM a priority, by year of ordination",
     "Source: The Catholic Project (Catholic University of America) 2025 survey of priests, fielded by Gallup, via EWTN News",
     ["Ordained 2000 or later", "Ordained 1980-1999", "Ordained before 1980"],
     [("TLM access is a priority", [39, 20, 11])], vmax=40, label_w=170)
