# Candidate: Cut-list optimizer

Scored 2026-08-24. Composite 7.0 · floor 2 (ai_leverage). The low AI-leverage
score is intentional: deterministic packing is the complete free core, while
any future AI assistance remains optional.

**Target user and problem.** Independent woodworkers, sign shops, trim
carpenters, and makers buy dimensional stock or sheet-like bars, then manually
try to fit required pieces into stock lengths. A poor estimate creates paid
offcuts, another store run, and wasted setup time. Search phrases include
"wood cut list optimizer", "how many 8 foot boards do I need", and "lumber
cutting list calculator".

**Value and return use.** The tool turns quantities, stock length, and saw kerf
into a bar-by-bar plan before material is purchased. Users return for each job,
and the value is measurable in stock pieces and offcut avoided. The v0 uses a
transparent first-fit decreasing heuristic, so it is useful immediately without
claiming mathematical optimality.

**Alternatives and differentiation.** Existing options are spreadsheet
templates, calculator apps, and general nesting/CAD products. A local,
quantity-aware, zero-install page focused on small-shop linear stock is faster
than CAD and more private than hosted upload tools. Future differentiation can
come from reusable material presets, printable shop tickets, and comparisons of
planned versus purchased stock, without making the free core depend on AI.

**Acquisition and business model.** Long-tail SEO, woodworking forums, maker
communities, and links from lumber-estimating guides are plausible free
channels. A later hosted tier could offer saved job templates, team sharing, or
CSV import/export; a shop could also bring its own AI key for natural-language
cut-list cleanup. No payment, account, or API key is needed for v0.

**Delivery, cost, and operation.** A static browser app is implementable in one
session, runs with no server, inference, database, or support queue, and keeps
customer dimensions on-device. The current vertical slice includes validation,
kerf-aware packing, a rendered plan, local opt-out usage counting, SEO metadata,
and a license.

**Risks and portfolio fit.** This is planning evidence, not engineering advice:
the user must verify dimensions, saw kerf, blade safety, grain direction, and
the actual stock. It does not duplicate eBay/Etsy margin arithmetic, quote
pricing, accessibility evidence, or photo preparation. The primary unknowns are
repeat use and whether the heuristic saves material versus a maker's current
process. The launch experiment costs $0 and should be judged by repeat local
use, public repo traffic after publishing, and direct feedback from qualified
makers.

**Verdict: graduate as a venture and ship the browser v0.** It is a narrow,
searchable, low-liability workflow with a concrete savings outcome and a clear
path to repeat usage.
