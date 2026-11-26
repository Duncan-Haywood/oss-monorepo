---
kind: milestone
date: 2026-11-26
---
# PayApps (bet #1): GCPay schedule of values upload workbook

2026-11-26, ventures run. Private PR: Duncan-Haywood/private-monorepo#263. ROADMAP Next #4,
"GC portal export formats", part 3 (GCPay); claim `claim/payapps/gc-portal-gcpay`. Follows the
Procore (PRs 221, 224) and Textura (PR 241 and the To Date part) exports.

**What landed.**
- `apps/payapps/src/shared/gc-export/xlsx-write.ts`: the app's first .xlsx *writer*, no library. A
  stored (uncompressed) ZIP with CRC32, inline-string text cells, number cells styled `#,##0.00`,
  a `Normal` cell style (openpyxl warns without it). Round-trips through `sov-import/xlsx.ts`'s
  `readXlsx`, and opened with openpyxl under `-W error` during the run. Reuse it for any other
  "Excel only" portal or export instead of adding a dependency.
- `apps/payapps/src/shared/gc-export/gcpay-sov.ts`: base-contract lines → `Item Number,
  Description, Value` rows; a check of the total against `originalContractSumCents`, unnumbered
  lines and repeated item numbers; the file name.
- `apps/payapps/src/client/components/gcpay-sov.tsx`: "GCPay SOV (Excel)" on the job page, next to
  the Procore SSOV button. Tests: `gcpay-sov.test.ts` beside the module, `test/unit/gcpay-sov.test.tsx`.
- payapps-site feature bullet and llms "not built" line updated. The customer post
  `docs/posts/2026-11-25-procore-subcontractor-sov-csv-template.md` is extended with a GCPay section.

**Source.** GCPay's Subcontractor Training Guide, Rev. 12/19, as Chambers Construction publishes it
for its subs (chambersconstruction.com/uploads/1/3/4/9/134926541/gcpay_subcontractor_guide.pdf),
read 2026-11-26 with `pdftotext -layout` after WebFetch saved the PDF. GCPay's own help centre
(gcpayhelp.freshdesk.com) says the per-project template is downloaded from the SOV's Edit screen but
does not list its columns; the 2019 guide is the only public statement of them found.

**Not built, and why.** A GCPay *billing* upload: the guide describes none (amounts are typed into
"$ This Period" or "% Work to Date"). The unit-price SOV (five columns): the app has no unit
quantities on SOV lines yet. Not tried on a live GCPay project; the panel says to paste the rows
into GCPay's own template if the file is refused.

**For the next run.** Remaining free payapps Next items are mostly "if asked"/"once measured";
Next #4 now names GCPay unit price and Trimble Pay/Siteline. Verification here: payapps unit 708/708,
typecheck clean, site unit 21/21; the private repo's CI jobs were starved (no runner, 2 s red).
