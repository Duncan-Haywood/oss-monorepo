# A subclass box for every class in a specification (2026-11-18)

**Question.** IDS matches exact classes: a specification naming `IFCSLAB`
does not check an `IFCSLABSTANDARDCASE`. The editor had one "and its
subclasses" box, on the first class only. Every further class in "Also applies
to" was exact, so a person writing "walls and slabs, with their subclasses"
had to type the slab subclasses by hand, and an opened file that listed
`IFCSLAB` with its subclasses showed every one of them as a separate exact
class. Does a box per class read the public files better, and does it change
anything they ask?

**What landed** (`editor.mjs`, `editor.html`):

- page state: `spec.alsoSub`, the classes in `also` whose concrete subclasses
  are included; `specClassNames()` writes each ticked class followed by its
  subclasses, so the entity facet names the same classes as typing them;
- `classListBases(S, names)`: an opened class list read back as the classes
  a person picked. A name whose concrete subclasses are all in the list, and
  that is not itself below another such name, opens ticked; the subclasses it
  covers are not listed again; every other name stays an exact class;
- the page: under the first class's box, one box per further class that has
  subclasses ("IFCSLAB and its 2 subclass(es): ..."); editing the list drops
  boxes for classes no longer in it; ticking one is counted
  (`editor_also_subclasses`, local usage counter).

**Measured** (`sh eval/fetch-audit-corpus.sh && sh eval/fetch-testcases.sh`,
then `node eval/also-subclasses.mjs --list` and `node eval/editor-open.mjs`;
output in `eval/also-subclasses.txt`):

| Files | Specs with several classes | Open differently | Names listed, before / after | Further classes ticked | Write back the same |
| --- | ---: | ---: | --- | ---: | --- |
| 64 public IDS | 29 | 4 (in 4 files) | 506 / **368** | 24 | 64 / 64 (507 of 507 specs) |
| 12 IDS-Audit-tool ValidFiles | 0 | 0 | 0 / 0 | 0 | 12 / 12 |
| 187 buildingSMART pass cases | 0 | 0 | 0 / 0 | 0 | 187 / 187 |

Editable facets are unchanged (1,871 of 2,012 public, 93.0%): the class lists
were already editable as exact classes; what changes is how they read and what
a schema change does. The two bSDD-Toolkit templates (IFC4X3, 147 classes)
now open as 79 classes, 11 of them with their subclasses ticked
(`IFCFLOWTERMINAL` and its 16, `IFCENERGYCONVERSIONDEVICE` and its 20, ...).
The two DfE COBie component specifications open `IFCFLOWCONTROLLER` ticked.
Audit errors after writing back are the same as before this change on every
file (the 10 public files whose errors change are the repairs of
`eval/editor-open-repair-2026-11-18.md`, identical before and after).

**Near misses, and why the page offers no "you left one out" hint.** Lists
that name a class and some but not all of its subclasses, on the public files:
every case is a deprecated class. The bSDD templates leave out
`IFCWALLSTANDARDCASE` (from `IFCBUILTELEMENT`, 34 of 35) and
`IFCELECTRICDISTRIBUTIONBOARD` (from three flow classes) in IFC4X3, both
deprecated there; two buildingSMART Spain specifications and one bim2sim file
leave out IFC4's `IFCWALLELEMENTEDCASE`, rarely exported. These read as
choices, so the boxes stay unticked and nothing warns. Whether the subclass
list should skip deprecated classes is open; it would change what a ticked box
writes, so it needs a reason from a real model first.

**Checked in a browser** (Chromium via Playwright, the page served locally):
opening the bSDD template shows 16 boxes on further classes, 11 ticked; ticking
`IFCBUILTELEMENT` makes 12; no console errors.

**Tests:** `editor.test.mjs`, "each further class has its own subclass box"
(groups found, nested groups not ticked twice, the same written set, an
opened file round-trips).
