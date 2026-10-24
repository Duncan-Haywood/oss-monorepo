# Setup: get the code and run something

## Get only the part you need

The full history is about 5 GB and a plain checkout of the tree is close to
1 GB, because it holds over 1,300 tools and their pages. You almost never need
all of it. A shallow, sparse clone of one tool takes a couple of seconds and a
few megabytes:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo.git
cd oss-monorepo
git sparse-checkout set ventures/roofing-bid-calculator    # the tool you want
```

That gives you the root files plus that one directory. Add more directories
later with `git sparse-checkout add <path>`, for example `platform/pages` if
you want to build the site, or `research/<project>` plus the projects it
imports (listed in its `pyproject.toml` under `pythonpath`).

If you want the whole tree, still clone shallow:

```bash
git clone --depth 50 https://github.com/duncan-haywood/oss-monorepo.git
```

To contribute, fork the repository on GitHub first and clone your fork the
same way.

## Toolchain

| Tool | Version | Used for |
|---|---|---|
| Node.js | 22 (what CI uses) | Browser tools, their tests (`node --test`), the site build, self-hosted apps |
| Python | 3.12 (what CI uses; most tools work on 3.9+) | Command-line checkers, research projects, CI scripts |
| `pytest` | any recent | Python tests |
| `numpy`, sometimes `matplotlib` or `mujoco` | as the project's `pyproject.toml` says | Research projects |

Most browser tools have **no dependencies at all**: no `npm install`, no build
step. A few self-hosted apps and larger products have a `package.json`; run
`npm install` inside that tool's directory only.

## Run a browser tool

Open its `index.html` in a browser, or serve the directory (module scripts
need a server in some browsers):

```bash
cd ventures/roofing-bid-calculator
python3 -m http.server 8080        # then open http://localhost:8080/
```

## Run the checks

Inside a tool's directory:

```bash
node --test                        # browser tools: every *.test.mjs here
python3 -m pytest -q               # tools and research projects with test_*.py
```

Each tool's own `README.md` lists anything else it needs. For example, a
command-line checker runs directly:

```bash
python3 ventures/actions-timeout-check/check.py --help
python3 ventures/actions-timeout-check/check.py .          # scan this repository
```

With the whole tree checked out, one command runs the CI workflows your
change would trigger, on your machine:

```bash
python3 platform/ci/run_workflow_locally.py --for-changes
```

It compares your branch with `origin/main`, so fetch `main` first. It can take
several minutes when your diff touches shared code; touching one tool's
directory keeps it short. Paste what it prints into your PR.

Also worth running when you edit Markdown:

```bash
python3 platform/ci/check_md_links.py CONTRIBUTING.md docs/contributing/*.md   # relative links that point at nothing
```

## Build the site locally

Needs `platform/pages` and the `ventures/` and `research/` directories (a full
checkout):

```bash
node platform/pages/build.mjs      # writes platform/pages/dist
node platform/pages/check.mjs      # checks that build
cd platform/pages/dist && python3 -m http.server 8899
```

More, including the browser checks CI runs, is in
[`platform/pages/README.md`](../../platform/pages/README.md).

## Before you open a pull request

- Your branch is up to date with `main` (merge it in).
- The tests in the directory you changed pass, and you say so in the PR with
  the output.
- The change does one thing, and the PR description says what was wrong, how
  you know (a source, a reproduction), and what you changed.
- No secrets, personal data or copied third-party code
  ([`CONTRIBUTING.md`](../../CONTRIBUTING.md), "Ground rules").
