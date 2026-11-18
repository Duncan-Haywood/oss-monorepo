---
title: "The Research Page Said Zero Dependencies. 462 Projects Disagreed."
seo_title: "How Many Research Projects Need Only the Python Standard Library"
date: 2026-11-14
tags: [research, website, honesty]
description: "The research index said 0 runtime dependencies. 462 of 1,080 projects import numpy, scipy or others; the tile now shows a measured 618 stdlib-only."
---

The [research index](/research/) opens with four numbers: projects, unit tests, themes, and "0 runtime dependencies". The first three are counted at build time. The fourth was typed into the page template as a literal `0`.

That claim was true early on, when every project was a short standard-library script. It is not true now. Reading the `import` lines of every `.py` file outside `tests/` in all 1,080 project folders:

| | projects |
|---|---|
| import nothing outside the standard library and the repo's own code | 618 |
| import at least one third-party package | 462 |

The most common packages are numpy (424 projects), matplotlib (204), scipy (127), scikit-learn (54), MuJoCo (40) and scikit-fem (33). The repo's own modules don't count as dependencies: each project's `src/` packages, and shared stdlib-only helpers such as `research/_shared/linefig.py`, which 320 projects import to draw their figures.

The fourth tile now reads **618 need only the Python standard library**. The research builder (`research/_homepage/build.py`) counts it on every build, so it moves as projects change. The count is a lower bound. An optional `import numpy` inside a `try` block counts as a dependency, and so does a plotting script that only redraws a figure. As a check, no project whose `requirements.txt` names a package was counted as dependency-free.

A test in `platform/ci/test_research_homepage_publish.py` fails if the tile goes back to typed text. It failed on the old template and passes on the new one.

Why it matters: someone choosing a project to rerun uses that tile to judge what a clean machine needs. "Zero" told them `python3` was enough, and for 43% of the projects it wasn't.
