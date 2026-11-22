# A member's stored volume against its own Length x CrossSectionArea, 2026-11-22

**Question.** The `own-dimensions` cause (`explainChecks`, `qto.mjs`) named a
stored volume as the wrong figure when it disagreed with the element's own
stored Length x Height x Width and the geometry agreed with that product.
Beams, columns and members store `Length` and `CrossSectionArea`
(`Qto_BeamBaseQuantities`, `Qto_ColumnBaseQuantities`,
`Qto_MemberBaseQuantities`), not a height and width, so a member whose
stored volume contradicted its own length and section stayed `unexplained`
and the bill of quantities kept the stored volume, and weighed steel from it.

Found while writing the search guides: the sample office's IPE 200 stores
NetVolume 0.0142 m3 beside Length 4 m and CrossSectionArea 0.002848 m2
(0.011392 m3, the geometry's 0.011394 m3). Its BoQ line said 0.0142 m3 and
111.47 kg; the body gives 89.44 kg.

**Change.** When an element stores no Length x Height x Width triple but
stores a Length and a positive CrossSectionArea, their product is the
own-dimensions figure. The rule's order and conditions are unchanged: it
fires only when the stored volume disagrees with the product and the
computed volume agrees with it (within the tolerance), after every other
cause, including Tekla's simplified sections, has been tried.

**Result on the 13 public models** of
[stored-vs-computed-2026-11-21.md](stored-vs-computed-2026-11-21.md) (same
files and commits, `node eval/stored-vs-computed.mjs <13 files>`; output in
`member-length-section-2026-11-22.txt`): **identical** to the run before the
change, line for line (timings aside). No public member carries this fault;
the 120 Tekla NetVolumes keep `simplified-section` (their stored section is
the simplified one too, so the product agrees with the stored volume and the
rule does not fire). The rule is a guard for exports like the sample's, not
a measured improvement on these files; say so wherever it is cited.

**Tests.** `engine.test.mjs`: the rule on synthetic rows (fires; stays
unexplained when the body disagrees with the product too, or the section is
0) and on the sample office (reason `own-dimensions`, BoQ volume 0.011394 m3,
weight 89.44 kg).
