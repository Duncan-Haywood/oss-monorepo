# Workers' Comp Audit Dispute Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/workers-comp-audit-dispute-checker/>

A free browser tool that prices the lines of a workers' compensation premium audit a small employer may be able to dispute, names the
record that would prove each one, and drafts an editable dispute note. Entirely client-side; nothing is uploaded.

After using this, you can now **see which audit lines are worth a dispute in premium dollars and which paper to gather for each**,
which used to mean accepting the carrier's bill or paying a broker to read it.

## What it calculates

Each cause is priced alone at `amount / 100 x rate x load`, where load is mod x (1 + schedule) x (1 - discount) x (1 + surcharge):

- **Overtime** the audit did not exclude (premium share is (m-1)/m of overtime wages).
- **Payroll** the audit counted that your records do not.
- **Subcontractors** charged as uninsured that held a certificate (without one, the line is information only).
- **Officers** outside the minimum/maximum payroll band you type in, in either direction.
- **Reclass**: payroll you say belongs in a differently rated class.

No rate table ships; the user types rates from the audit. Premium discount is one flat percentage, not a tier table.

## Run it

Open [`index.html`](index.html). Tests: `node --test ventures/workers-comp-audit-dispute-checker/*.test.mjs`.

Not insurance, legal, tax, or financial advice. See the page for the full disclaimer.
