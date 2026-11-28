# Lien filing deadlines, five more states, read 2026-11-28

Each section was fetched from the state's own code site on 2026-11-28 and read for the filing
clock (Alabama's site renders the code by script, so it was read in a headless browser; Wyoming's
from the legislature's Title 29 PDF). The excerpts below are the sentences the rules in
`../calc.mjs` and in PayApps (`ventures/payapps/apps/payapps/src/shared/lien-deadline.ts`) rest on,
quoted from public statute text. Statutes change: re-read before relying on a date.

## Alabama, Ala. Code §§ 35-11-215, 35-11-218, 35-11-221

https://alison.legislature.state.al.us/code-of-alabama?section=35-11-215

> The lien declared in this division shall be deemed lost unless the statement referred to in
> Section 35-11-213 shall be filed by every original contractor within six months and by every
> journeyman and day laborer within 30 days, and by every other person entitled to such lien within
> four months, after the last item of work or labor has been performed or the last item of any
> material, fixture, engine, boiler, or machinery has been furnished ...

https://alison.legislature.state.al.us/code-of-alabama?section=35-11-218

> Every person, except the original contractor, who may wish to avail himself of the provisions of
> this division, shall before filing his statement in the office of the judge of probate, give
> notice in writing to the owner or proprietor, or his agent, that he claims a lien on such building
> or improvement, setting forth the amount thereof, for what, and from whom it is owing ...

https://alison.legislature.state.al.us/code-of-alabama?section=35-11-221

> Any action for the enforcement of the lien declared in this division must be commenced within six
> months after the maturity of the entire indebtedness secured thereby ...

Modeled: 4 months after last furnishing ("every other person": subcontractors and suppliers).

## Alaska, AS 34.35.068

https://www.akleg.gov/basis/statutes.asp?media=print&secStart=34.35.068&secEnd=34.35.068

> (a) If a notice of completion is not recorded by the owner as provided in AS 34.35.071, a claim of
> lien shall be recorded not later than 120 days after the claimant (1) completes the construction
> contract; or (2) ceases to furnish labor, material, services, or equipment ...

> (b) If a notice of completion is recorded by the owner as provided in AS 34.35.071, (1) the
> following shall record a claim of lien or a notice of right to lien not later than 15 days after
> the notice of completion is recorded: (A) a claimant who has received advance notification of the
> date that the notice of completion is recorded ...; (B) a claimant who has not given a notice of
> right to lien as permitted in AS 34.35.064; (2) the following shall record a claim of lien not
> later than the time specified in (a) ...

Modeled: 120 days after last furnishing. The 15-day clock after a recorded notice of completion is
stated in the result's notes, not dated (which claimants it binds turns on notices the tools do not
track).

## Maine, 10 M.R.S. § 3255

https://legislature.maine.gov/statutes/10/title10sec3255.html

> 1. Enforcement by action. The liens mentioned in sections 3251 to 3254 may be preserved and
> enforced by action against the debtor and owner of the property affected and all other parties
> interested therein, filed with the Superior Court or District Court clerk in the county or
> division where the house, building or appurtenances ... is situated within 120 days after the last
> of the labor or services are performed or labor, materials or services are so furnished, except as
> provided in section 3256. If the labor, materials or services were not performed or furnished by a
> contract with the owner of the property affected, the claimant may not serve the complaint and
> summons ... on the owner until 30 days after the date of filing of the complaint ...

Modeled: 120 days after last furnishing, the act being the court filing.

## Rhode Island, R.I. Gen. Laws § 34-28-4

https://webserver.rilegislature.gov/Statutes/TITLE34/34-28/34-28-4.htm

> (a) ... any and all liens claimed or that could be claimed under §§ 34-28-1, 34-28-2 or 34-28-3
> shall be void and wholly lost to any person claiming under those sections unless the person
> shall, before or within two hundred (200) days after the doing of such work or the furnishing of
> such materials, mail by prepaid registered or certified mail, in either case return receipt
> requested, a notice of intention ... to the owner of record of the land ... and also shall before
> or within two hundred (200) days after the doing of the work or the furnishing of the materials
> file a copy of the notice of intention in the records of land evidence in the city or town ...

> ... shall perfect ... the lien of the person so mailing and filing as to work done or materials
> furnished by the person during the two hundred (200) days prior to the filing and thereafter, but
> not as to work done or materials furnished by the person before the two hundred (200) days prior
> to the filing ...

Modeled: 200 days after last furnishing; the notes say that only the last 200 days' work is covered.

## Wyoming, W.S. 29-2-106 and 29-2-107

https://wyoleg.gov/statutes/compress/title29.pdf

> 29-2-106(a) Except as provided in subsection (c) of this section, any contractor asserting a lien
> under this chapter shall file his lien statement within one hundred fifty (150) days and every
> other person asserting a lien under this chapter shall file within one hundred twenty (120) days:
> (i) Of the earlier of: (A) After the last day when work was performed or materials furnished under
> contract; (B) From the date of substantial completion of the project on which work was performed
> or materials were furnished under contract; or (ii) With respect to a subcontractor, after the
> last day he performed work at the direction of the contractor ...

> (c) The record owner may record a notice of substantial completion of the project ... the date the
> notice is recorded shall be presumed to be the date of substantial completion of the project. ...

> 29-2-107(a) Before filing a lien pursuant to this chapter a lien claimant shall send written notice
> to the record owner or his agent of any claim ... stating the amount of any claim and from whom it
> is due. The notice shall be sent no later than twenty (20) days prior to filing a lien statement.

Modeled: 120 days after the earlier of last furnishing and substantial completion (an entered
completion date is used whatever its order, as for Oregon and Virginia); the notice of intention 20
days before the lien date.

## Tried and left out the same day

- Vermont, 9 V.S.A. § 1921(c) (https://legislature.vermont.gov/statutes/section/09/051/01921), read:
  "A lien herein provided for shall not continue in force for more than 180 days from the time when
  payment became due for the last of such labor performed or materials furnished unless a notice of
  such lien is filed in the office of the town clerk". The clock runs from when payment became due,
  a date neither tool holds (Missouri was left out for the same reason).
- Kentucky (apps.legislature.ky.gov: no chapter index found for KRS 376), Indiana (iga.in.gov: a
  script-only page that rendered nothing in a headless browser), Oklahoma (oscn.net: a bot check),
  Louisiana (legis.la.gov: no lookup from section number to its document id) and New Mexico
  (nmonesource.com: no chapter index reached). Connecticut, West Virginia, New Hampshire, Illinois
  and Wisconsin timed out; Hawaii, Pennsylvania, and Justia's copies of Mississippi and Tennessee
  returned 403.
