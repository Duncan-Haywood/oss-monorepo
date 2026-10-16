# Childcare Center Break-Even Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/childcare-center-break-even-calculator/>

A free browser calculator for daycare and childcare center owners: classrooms, licensing ratios, tuition, wages and rent become monthly profit, break-even enrollment, the ratio cliffs where one more child forces another teacher, and the tuition increase that would close a gap. Entirely client-side; nothing is uploaded.

After using this, you can now **see how many children you actually need and which enrollment steps lose money**, which used to mean a spreadsheet that averaged staffing as if teachers were hired by the child.

- Staffing is a step function: `ceil(enrolled / ratio)` teachers per group, times a coverage factor for long open hours and absences.
- Break-even is found by scanning uniform occupancy 0-100%; the occupancy ladder shows the sawtooth.

Scope: arithmetic on the user's own numbers; does not know state licensing rules. Not legal, tax or financial advice.

Run the tests: `node --test 'ventures/childcare-center-break-even-calculator/**/*.test.mjs'`
