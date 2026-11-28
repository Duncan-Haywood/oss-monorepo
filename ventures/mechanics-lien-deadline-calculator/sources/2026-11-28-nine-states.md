# Lien filing deadlines, nine states, read 2026-11-28

Each section was fetched from the state's own code site on 2026-11-28 and read in full for the
filing clock. The excerpts below are the sentences the rules in `../calc.mjs` and in PayApps
(`ventures/payapps/apps/payapps/src/shared/lien-deadline.ts`) rest on, quoted from public statute
text. Statutes change: re-read before relying on a date.

## Delaware, 25 Del. C. § 2711

https://delcode.delaware.gov/title25/c027/sc02/index.html

> (a)(1) A contractor who: a. Has made that contractor's contract directly with the owner ... shall
> file that contractor's statement of claim within 180 days after the completion of such structure.

> (b) All other persons embraced within this chapter and entitled to avail themselves of the liens
> herein provided shall file a statement of their respective claims within 120 days from the date
> from the completion of the labor performed or from the last delivery of materials furnished by
> them respectively. For purposes of this subsection, and without limitation, a statement of claim
> on behalf of such person shall be deemed timely if it is filed within 120 days of either of the
> following: (1) The date final payment, including all retainage, is due to such person; or (2) The
> date final payment is made to the contractor ...

Modeled: 120 days after last furnishing (the alternatives in (b) can only be later).

## Idaho, Idaho Code § 45-507

https://legislature.idaho.gov/statutesrules/idstat/title45/t45ch5/sect45-507/

> (2) The claim shall be filed within ninety (90) days after the completion of the labor or
> services, or furnishing of materials.

## Kansas, K.S.A. 60-1102 and 60-1103

https://www.ksrevisor.gov/statutes/chapters/ch60/060_011_0002.html
https://www.ksrevisor.gov/statutes/chapters/ch60/060_011_0003.html

> 60-1102(a) ... shall file with the clerk of the district court of the county in which property is
> located, within four months after the date material, equipment or supplies, used or consumed was
> last furnished or last labor performed under the contract a verified statement ...

> 60-1103(a) ... may obtain a lien for the amount due in the same manner and to the same extent as
> the original contractor except that: (1) The lien statement must state the name of the contractor
> and be filed within three months after the date supplies, material or equipment was last furnished
> or labor performed by the claimant ...

> ... on property other than residential property may be claimed pursuant to this section ...
> within five months only if the claimant has filed a notice of extension within three months since
> last furnishing labor, equipment, materials or supplies to the job site.

Modeled: 3 months after last furnishing (the sub and supplier clock, and the earlier of the two).

## Maryland, Real Property §§ 9-104 and 9-105

https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=grp&section=9-104&enactments=false
https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=grp&section=9-105&enactments=false

> § 9-104(a)(1) A subcontractor doing work or furnishing materials ... is not entitled to a lien
> under this subtitle unless, within 120 days after doing the work or furnishing the materials, the
> subcontractor gives written notice of an intention to claim a lien ...

> § 9-105(a) In order to establish a lien under this subtitle, a person entitled to a lien shall
> file proceedings in the circuit court for the county where the land or any part of the land is
> located within 180 days after the work has been finished or the materials furnished.

## Montana, MCA 71-3-535

https://archive.legmt.gov/bills/mca/title_0710/chapter_0030/part_0050/section_0350/0710-0030-0050-0350.html

> (1) A person's lien does not attach and may not be enforced unless, after entering into the
> contract under which the lien arises, the person has filed a lien not later than 90 days after:
> (a) the person's final furnishing of services or materials; or (b) the owner files a notice of
> completion pursuant to 71-3-533.

Modeled: 90 days after final furnishing; the notice-of-completion count is a note (it is earlier
only when the notice was filed before the claimant's last day).

## Nebraska, Neb. Rev. Stat. § 52-137

https://nebraskalegislature.gov/laws/statutes.php?statute=52-137

> (1) A claimant's lien does not attach and may not be enforced unless, after entering into the
> contract under which the lien arises and not later than one hundred twenty days after his or her
> final furnishing of services or materials, he or she has recorded a lien.

## North Dakota, N.D.C.C. § 35-27-13

https://ndlegis.gov/cencode/t35c27.pdf

> Every person desiring to perfect the person's lien shall record with the recorder of the county in
> which the property to be charged with the lien is situated, within ninety days after all the
> person's contribution is done, ... a lien describing the property and stating the amount due, the
> dates of the first and last contribution, and the person with which the claimant contracted.

## South Carolina, S.C. Code § 29-5-90 and § 29-5-120

https://www.scstatehouse.gov/code/t29c005.php

> § 29-5-90. Such a lien shall be dissolved unless the person desiring to avail himself thereof,
> within ninety days after he ceases to labor on or furnish labor or materials for such building or
> structure, serves upon the owner or, in the event the owner cannot be found, upon the person in
> possession and files in the office of the register of deeds or clerk of court of the county in
> which the building or structure is situated a statement of a just and true account of the amount
> due him ...

> § 29-5-120(A) Unless a suit for enforcing the lien is commenced and notice of pendency of the
> action is filed within six months after the person desiring to avail himself of it ceases to labor
> on or furnish labor or material for the building or structure, the lien must be dissolved.

## South Dakota, SDCL 44-9-15

https://sdlegislature.gov/Statutes/44-9-15

> The lien shall cease at the end of one hundred twenty days after doing the last of such work, or
> furnishing the last item of such skill, services, material, or machinery, unless within such
> period a statement of the claim therefor be filed with the register of deeds of the county in
> which the improved premises are situated ...

## Read and left out

- Iowa, § 572.9 (https://www.legis.iowa.gov/docs/code/572.9.pdf): "within two years and ninety
  days after the date on which the last of the material was furnished or the last of the labor was
  performed". What a sub's lien posted after the first ninety days still reaches is set by other
  sections of chapter 572, not read here, so Iowa is not dated.
- Not reachable from this session on 2026-11-28: Illinois (ilga.gov), Pennsylvania
  (legis.state.pa.us, palegis.us), Wisconsin, Connecticut, New Hampshire, West Virginia and
  Massachusetts (malegislature.gov timed out). Tennessee's code is published through a commercial
  host only and was not read.
