# Are any licences worth considering instead of MIT?

Date: 2026-11-01. Asked by the owner: "report on whether any other types of
software licenses are worth considering for this repo as opposed to mit?"

This is a report, not a change. `prompts/goals.md` ("Licensing and
attribution") says original work is MIT-licensed, and `prompts/` is owner-only
(`.github/CODEOWNERS`). Any switch is the owner's decision. This is engineering
analysis, not legal advice.

## Short answer

**Keep MIT for code.** No alternative earns the cost of switching. The gap
worth closing is **non-code content**: research papers, blog posts, figures and
data. MIT is a software licence, and two creative ventures already put their
content under CC BY-SA 4.0 even though the repo's top-level files say
everything is MIT. The rest of this report explains both points.

## What the repo has today (measured 2026-11-01)

- `LICENSE` (root): MIT, "Copyright (c) 2026 Duncan Haywood".
- 1,341 `LICENSE` files start with "MIT License". 894 `pyproject.toml` files
  declare `license = { text = "MIT" }`. Every `package.json` with a licence
  field says MIT. `CITATION.cff` says `license: MIT`.
- The only non-MIT licence files are third-party eval fixtures in
  `ventures/sales-agent/eval/` (Apache-2.0 talon, MIT email_reply_parser,
  and the mail/flufl bounce corpora's own notices). That is correct: vendored
  code keeps its licence.
- **CC BY-SA 4.0 content:** `ventures/hearth-and-horizon` and
  `ventures/saints-by-candlelight` (stories, scripts, audio and cover art),
  `platform/pages/stories.mjs` (the stories page), and about 35 story posts
  in `docs/posts/`. `prompts/creative/prompt-0.md` makes that the rule for
  creative work. Both venture directories also contain an MIT `LICENSE`, and
  only `saints-by-candlelight/README.md` says outright that the split is
  "Code: MIT; scripts, audio, art: CC BY-SA 4.0".
- Research uses third-party inputs under CC BY 4.0, CC BY-SA, CC BY-NC-SA
  (cited only, e.g. `research/religion-origins`) and GPL (installed or fetched
  at run time, never vendored). The READMEs already handle this well.

## The candidates, judged against what the owner wants

The owner's stated aims (`goals.md`, README): free tools people use, forks
welcome, "you may run the result for profit", wide reuse by people and agents,
and research others can build on. Here is how each option fits those aims:

| Licence | What it adds over MIT | Fit here | Verdict |
|---|---|---|---|
| **MIT** (current) | Shortest and best-known permissive licence; compatible with almost everything | Matches "fork it, run it for profit" | **Keep for code** |
| **Apache-2.0** | Explicit patent grant and patent-retaliation clause; contributions licensed by default (s.5); NOTICE file | The patent grant matters most to corporate adopters of libraries. The repo holds no patents and takes few outside contributions. Incompatible with GPLv2-only code | Not worth a repo-wide switch. Maybe per package, see below |
| **MIT OR Apache-2.0** (dual, the Rust convention) | Users choose: MIT's simplicity or Apache's patent terms | Costs a second licence file and SPDX `OR` everywhere | Optional for research libraries meant for industry reuse |
| **BSD-2/3, ISC, 0BSD** | Nothing material (BSD-3 adds a no-endorsement clause; 0BSD drops attribution) | 0BSD/Unlicense would lose the credit MIT asks for | No |
| **MPL-2.0** (file-level copyleft) | Changes to these files must stay open; the code can still be combined with closed code | Protects against closed forks of a single app, but adds friction for little gain | No |
| **GPL-3.0 / AGPL-3.0** | Derivatives must stay open. AGPL also covers network use, so a SaaS fork must publish its source | Permits for-profit use but blocks closed forks. Many companies ban AGPL (the repo's own `ventures/lockfile-license-check` ranks it most restrictive), so adoption suffers. Weak protection when much of the code is AI-written (see below) | No, unless the owner wants to stop closed SaaS forks of the self-hosted apps |
| **Source-available** (FSL, BSL 1.1, Elastic 2.0, PolyForm) | Blocks competing commercial use; FSL/BSL convert to open source after 2 to 4 years | **Not open source** under the OSI definition. Contradicts the repo name, the README, the MCP server text ("Free, open-source (MIT)") and the forks-for-profit stance. Relicensing would also make every "MIT licensed" claim false, which touches the honest-marketing guardrail | **No** |
| **CC BY 4.0** | The academic norm for papers and figures (arXiv, Zenodo, most open-access journals) | Fits research prose and blog posts better than a licence about "the Software" | **Yes, for research text and figures** |
| **CC BY-SA 4.0** | Like CC BY, but adaptations must use the same licence | Already used for the stories; fine to keep | Keep for creative work, and document it |
| **CC0 / ODC-PDDL** | Public-domain dedication | Best for derived data tables people may want to merge without carrying attribution | Consider for original datasets (not third-party-derived ones) |

## Two facts that weigh on the choice

1. **AI authorship weakens any licence that relies on copyright.** The US
   Copyright Office (Copyright and AI, Part 2, January 2025) and the D.C.
   Circuit in *Thaler v. Perlmutter* (March 2025) hold that material with no
   human author is not protected by copyright. The repo says its work is
   produced with AI assistance. Where human authorship is thin, there may be
   little copyright to enforce. That hurts copyleft (GPL, AGPL, BY-SA) and
   source-available terms most, because they depend on enforcement. A
   permissive licence loses almost nothing, because it mostly hands out
   permissions. This is a strong practical reason not to move to a
   restrictive licence: the restriction may not hold. Copyrightability of
   AI-assisted work is unsettled and depends on jurisdiction.
2. **Switching is expensive and only works going forward.** Code already
   published under MIT stays MIT for anyone who copied it. A switch would
   mean rewriting about 2,200 licence declarations, the README, CITATION.cff,
   the MCP descriptions and the marketing pages. All earlier forks would keep
   MIT anyway.

## Recommendations, in order

1. **Keep MIT for all original code.** No change.
2. **Declare a licence for non-code content.** One short owner-approved edit
   to `goals.md` plus a root `LICENSES.md` (or REUSE-style `REUSE.toml`) that
   maps each path to its licence:
   - code: MIT;
   - research white papers, figures and blog posts: CC BY 4.0 (or keep them
     MIT, but say so on purpose);
   - stories, audio and cover art (`ventures/hearth-and-horizon`,
     `ventures/saints-by-candlelight`, `docs/posts` fiction): CC BY-SA 4.0, as
     already practised;
   - third-party files: their own licences, as already practised.
   Then update `CITATION.cff` and the README "License" section so they no
   longer say everything is MIT. This removes a real inconsistency: those two
   venture directories carry an MIT `LICENSE` while their content is BY-SA.
3. **Optional: Apache-2.0 or dual MIT/Apache-2.0 for new research Python
   packages** aimed at industry users, where an explicit patent grant helps
   corporate legal approval. Only worth doing package by package if someone
   asks.
4. **Do not adopt AGPL or a source-available licence** unless the owner's
   goals change from "forks welcome" to "no closed commercial forks". Even
   then, point 1 under "Two facts" limits what those licences can enforce.

## Next step for a run

Recommendation 2 needs a change under `prompts/` (owner-only). A run can
draft it as a small separate PR that waits for owner approval, plus a
non-control-plane PR adding `LICENSES.md` and fixing the README and
CITATION.cff wording. It should not merge the README wording before the owner
has picked a licence for research prose.
