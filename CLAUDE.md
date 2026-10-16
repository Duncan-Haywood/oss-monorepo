# Repo instructions

> **Moved (2026-10-16).** This research portfolio now lives in
> [`Duncan-Haywood/oss-monorepo`, under `research/`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research), with this repository's full
> history (`git log -- research/<slug>` there shows each project's original commits). Its
> homepage is <https://duncan-haywood.github.io/monorepo-projects/research/>. This repository is kept as read-only history: do not open pull
> requests or push branches here.

**Active; mirroring into `oss-monorepo`.** All work is moving to `Duncan-Haywood/oss-monorepo`
(formerly `fp-monorepo`), under `research/`, with no history lost. oss-monorepo#6832 merged this
repository's history there. Until the owner's cutover, work lands here, on this repository's
`main`, and `oss-monorepo/research/` is an exact copy that its `research/_mirror/mirror.py`
refreshes. Keeping the mirror current is standing work. The rules are under Repository merge in
`prompt.md`, and the action list is the "Repository merge" section of `PROJECTS.md`.

New projects come from the priority tracks in [`PROJECTS.md`](PROJECTS.md).

## Every run ships something useful

Set by the owner on 2026-10-15. A run that ends without doing anything useful
has wasted the compute budget. Every run lands at least one thing of real value
on `main`, such as a research result, a new or improved project, an open-source
tool, or a write-up that uses real data to tell the owner something new. "Nothing
to do", a blocked milestone, an empty track, or finding that your task already
landed is never a reason to stop. Take the next milestone in `PROJECTS.md`, and
if none fits, come up with something new that is valuable, useful or
insightful and ship it. It can be academic or industry research, an
open-source tool, a product, marketing, or anything else. Restated blockers and
re-verifying unchanged work do not count. The research integrity rules still
apply: never fabricate a result to have something to ship.

## Land what you push

A branch that never reaches `main` is lost work: nobody sees it, and the next run redoes it.
When you push a branch here, open a pull request for it in the same run. Merge it yourself once
CI is green, or close it with a one-line reason. Never leave a branch without a pull request,
and never push to a branch whose pull request has merged. Scheduled runs follow the full rules
in `prompt.md` under Landing work.

## Keep the GitHub Pages homepage up to date

The portfolio homepage <https://duncan-haywood.github.io/oss-research-monorepo/> is generated
by `site/build.py` and deployed by `.github/workflows/pages.yml` on every push to `main`.
Nothing under `site/` is published directly; the build writes `_site/index.html` (gitignored).

Sources:
- `site/projects.json` — themes (id, name, blurb), the `featured` slugs, and per project:
  `slug`, `title` (a question the project answers), `summary` (the abstract, HTML).
- `README.md` — each project's bullet is reused as the card's one-line lede.
- `research/<slug>/` — test counts are the `def test_` functions in its `test*.py` files.
- `research/<slug>/LOG.md` (optional) — an ongoing project's research log: `## <date> · <title>` entries, newest first, with bullets. The project page shows it under "Research log" and the homepage lists every project that has one.
- `site/template.html` — layout, styles and search script. `site/project.html` — the per-project home page (`_site/<slug>/index.html`); it shows the first image under the project's `experiments/` if there is one.

Whenever you add, rename or remove a project under `research/`, or change its headline
results, in the same commit:

1. Update its bullet in `README.md`: ``- [`research/<name>`](research/<name>) — one-line summary.``
2. Add or edit its entry in `site/projects.json`, in the theme it fits best:
   ```json
   {"slug": "<name>", "title": "Question the project answers?",
    "summary": "Plain-language abstract with the key quantitative results and the model's main limitations (e.g. Stylised.)."}
   ```
   The summary is HTML: use entities for maths (`&minus;`, `&radic;`, `&times;`, `<sub>`, `<sup>`, `<em>`).
   Don't write the test count; the build adds it. Add a new theme only if several projects
   need it, and give it a `--t-<id>` colour in both the light and dark blocks of `site/template.html`.
3. Run `python site/build.py` and make sure it prints `ok`. It fails if any `research/`
   project is missing from `projects.json` or `README.md`, or if either lists one that no
   longer exists. CI runs the same build on every pull request and it blocks the deploy.
   Open `_site/index.html` to preview.
