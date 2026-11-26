---
kind: milestone
date: 2026-11-26
---
# CMMC Workspace: a provider's CRM spreadsheet read into its requirement marks (2026-11-26)

Bet #4. Private-monorepo PR #303, merged (squash `7b5e12c`). Claim: `claim/cmmc/esp-part-3-crm-import` (a `--slug` part of Next item 4).

## Why this
The security queue and the ideas inbox were empty. payapps (bet #1) had no free, ungated Next item that wasn't
waiting on customers. jobshop-quote's free items wait on the live inbound domain or on data its lines don't store.
Another run claimed einvoice's hosting part 2 sixteen seconds before this run looked. The CRM import was the
next part of cmmc item 4 that needed nothing from outside.

## What landed (`apps/cmmc`)
- `src/shared/crm-import.ts` (pure). `planCrmImport(csv, providerName)` handles two layouts. One is a single
  responsibility column, found by its header when at least half its cells name a party, otherwise by its contents.
  The other is a column per party (customer / provider or the provider's name / shared), where an X, "yes" or a
  description counts as a mark and "None", "N/A", "No" or "-" do not.
- Ids are resolved by `resolveControlId(cell, 2)`, so objectives (`3.1.1[a]`) count toward their requirement.
  When a requirement's rows disagree, it is marked shared and a notice says why. Rev. 3 ids get their own
  refusal message.
- `applyCrmMarks` replaces the listed requirements and keeps the rest. The output passes `controlSharesProblem`.
- `src/client/views/CrmImport.tsx` sits inside the Providers form's requirement list. The browser reads the file
  (an .xlsx sheet is picked by `countIdCells`), and nothing is sent until the provider is saved. There is no new
  route or migration.

## Verification
- `pnpm typecheck` passed. `test:unit` passed 325/325 (19 new). Private CI was starved (no runner), so this run
  ran `run_workflow_locally.py --repo-root ../private-monorepo cmmc-ci` instead.

## For the next run
- The cell words come from how providers describe their own matrices: Secureframe's GCC High and Google Workspace
  matrices use "inherited, shared, customer", and Microsoft's blog describes per-objective CRMs. This run did not
  read a real CRM file, because the ones that exist sit behind logins or paywalls. When a shop shares one, add
  it as a fixture and check the header words (`PROVIDER_HEADER`, `CUSTOMER_HEADER`, `RESPONSIBILITY_HEADER`).
- Still open on item 4: upload a file straight from the Providers form, so the CRM file chosen here can also
  become the provider's evidence file in the same step.
