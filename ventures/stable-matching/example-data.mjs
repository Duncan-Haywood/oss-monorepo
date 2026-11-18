// Example instances for the page, CLI and tests. Both are made up for
// illustration (labelled so on the page); data/SOURCE.md says why no real
// preference data ships.
import { SAMPLE_TEXT } from "./engine.mjs";

export const EXAMPLES = {
  residency: {
    label: "Residency match (made-up example: 12 residents, 4 programmes, 9 places)",
    proposer: "A",
    text: `# Made-up example (seeded random lists in which programmes favour residents who rank them lower).
# Residents rank programmes; programmes rank the residents who applied to them.
[residents]
Ada: Riverbend > Hillcrest
Bo: Northside > Riverbend > Hillcrest
Chen: Lakeview > Hillcrest > Northside > Riverbend
Dara: Riverbend > Hillcrest
Eli: Northside > Hillcrest
Fen: Lakeview > Riverbend
Gus: Riverbend > Northside > Hillcrest > Lakeview
Hana: Riverbend > Hillcrest > Lakeview > Northside
Ivo: Northside > Riverbend > Lakeview > Hillcrest
Jun: Riverbend > Lakeview
Kit: Lakeview > Hillcrest > Riverbend
Lu: Riverbend > Hillcrest > Northside
[programmes]
Northside (3): Hana > Lu > Chen > Gus > Eli > Ivo > Bo
Lakeview (2): Gus > Ivo > Hana > Fen > Jun > Chen > Kit
Riverbend (2): Chen > Kit > Fen > Ivo > Bo > Ada > Dara > Hana > Lu > Gus > Jun
Hillcrest (2): Ivo > Bo > Ada > Gus > Kit > Dara > Eli > Chen > Hana > Lu
`,
  },
  small: { label: "Four applicants, three programmes (made-up, five stable matchings)", proposer: "A", text: SAMPLE_TEXT },
  cyclic: {
    label: "Cyclic 3 x 3 (the kind of instance Gale & Shapley 1962 use to show several stable matchings)",
    proposer: "A",
    text: `[men]
x: A > B > C
y: B > C > A
z: C > A > B
[women]
A: y > z > x
B: z > x > y
C: x > y > z
`,
  },
};
