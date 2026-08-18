#!/usr/bin/env python3
"""
Unit and contract tests for the module reachability control.

The logic half runs against synthetic git repositories built in tmpdirs. That
is deliberate and it is not the same thing as testing against `tmp_path`
skeletons only: `scripts/ci/gate_wiring.py` names that shape — a control
exercised entirely against scratch fixtures and never once asked about this
repository — as a way for a gate to be green about nothing. So the last class
here is a contract over the live tree, and it asserts the numbers this control
was written to produce rather than merely that it runs.

Most tests here assert a *failure*, because the ways this measurement can be
quietly wrong all look like a pass:

  * a test file counted as an entrypoint makes every module reachable;
  * a direct-importer scan calls a dead module live when a second dead module
    imports it;
  * a specifier the resolver cannot resolve makes a live module look dead,
    which is the mirror failure and the one that gets a control switched off;
  * a budget that no longer matches its project silently bounds nothing.

Each has a test whose green means the control refused.

No test here is skipped or conditionally skipped, and none should be.
`scripts/ci/audit_exceptions.py` treats the unittest skip decorator as a
suppression needing a registered owner and expiry, and it is right to.
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CI_DIR = REPO_ROOT / "scripts" / "ci"
if str(CI_DIR) not in sys.path:
    sys.path.insert(0, str(CI_DIR))

import json
import os
import re
import subprocess
import tempfile
import unittest
from datetime import date, timedelta

import cap_ratchet
import module_reachability
from module_reachability import (
    BUDGETS,
    MAX_REGISTRATION_DAYS,
    NEXT_APP,
    PINS_ON_UNREACHABLE_MODULES,
    UNCLASSIFIED,
    Finding,
    PinOnUnreachableModule,
    ReachabilityError,
    budget_constant_name,
    evaluate,
    has_computed_import,
    measure,
    pinned_paths,
    resolve,
    specifiers_in,
    strip_comments,
    strip_json_comments,
)

TODAY = date(2026, 8, 17)


def git(repo: Path, *args: str) -> str:
    env = dict(os.environ)
    env["GIT_CONFIG_GLOBAL"] = "/dev/null"
    env["GIT_CONFIG_SYSTEM"] = "/dev/null"
    return subprocess.run(
        ["git", *args], cwd=repo, capture_output=True, text=True, env=env, check=True
    ).stdout


class SyntheticRepo:
    """A tiny repository with one Next.js venture, built file by file.

    Everything the control reads comes from `git ls-files`, so a file that is
    written but not added is invisible to it — which is itself one of the things
    under test.
    """

    def __init__(self, root: Path):
        self.root = root
        git(root, "init", "--quiet", "--initial-branch=main")
        git(root, "config", "user.email", "test@example.invalid")
        git(root, "config", "user.name", "Module Reachability Tests")
        git(root, "config", "commit.gpgsign", "false")

    def write(self, rel: str, body: str = "", track: bool = True) -> None:
        target = self.root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(body, encoding="utf-8")
        if track:
            git(self.root, "add", "--force", rel)

    def venture(
        self,
        name: str = "demo",
        dependencies: str = '"next": "16.0.0"',
        aliases: str = '"@/*": ["./src/*"]',
        scripts: str = "",
    ) -> str:
        project = f"ventures/{name}"
        self.write(
            f"{project}/package.json",
            json.dumps(
                json.loads("{" + f'"name": "{name}", "dependencies": {{{dependencies}}}' + "}")
                | ({"scripts": json.loads(scripts)} if scripts else {})
            ),
        )
        self.write(
            f"{project}/tsconfig.json",
            '{"compilerOptions": {"paths": {' + aliases + "}}}",
        )
        self.write(f"{project}/src/app/page.tsx", "export default function Page() {}\n")
        return project

    def measure(self):
        return measure(self.root)


class TempRepoCase(unittest.TestCase):
    def setUp(self) -> None:
        # `tempfile` honours TMPDIR, and three tests elsewhere in this suite fail
        # when TMPDIR points inside a work tree. Nothing here depends on where it
        # lands, but a synthetic repo created *inside* the repository under test
        # would be seen by `git ls-files` from the outer tree, so it must not be.
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo = SyntheticRepo(Path(self._tmp.name))
        self.assertFalse(
            str(REPO_ROOT) in str(Path(self._tmp.name).resolve()),
            "the scratch repository was created inside the repository under test",
        )


# ---------------------------------------------------------------------------
# Reading source
# ---------------------------------------------------------------------------


class CommentStrippingTests(unittest.TestCase):
    def test_a_line_comment_is_removed(self):
        self.assertNotIn("gone", strip_comments("const a = 1; // gone\n"))

    def test_a_block_comment_is_removed(self):
        self.assertNotIn("gone", strip_comments("/* gone */ const a = 1;\n"))

    def test_a_double_slash_inside_a_string_survives(self):
        """The failure this exists to stop is silent and one-directional.

        A naive `//.*` strip truncates `import x from "https://…"` and, worse,
        any import that trails a string containing `//`. A dropped edge is a
        module reported dead, and a module reported dead over a budget is a red
        gate someone will widen.
        """
        source = 'const url = "https://example.invalid/a"; import x from "./real";\n'
        self.assertIn('"./real"', strip_comments(source))

    def test_a_specifier_inside_a_comment_is_not_an_edge(self):
        self.assertEqual(specifiers_in('// import x from "./ghost";\n'), [])


class SpecifierTests(unittest.TestCase):
    def test_a_default_import(self):
        self.assertEqual(specifiers_in('import x from "./a";\n'), ["./a"])

    def test_a_side_effect_import(self):
        self.assertEqual(specifiers_in('import "./a";\n'), ["./a"])

    def test_a_type_only_import(self):
        self.assertEqual(specifiers_in('import type { T } from "./a";\n'), ["./a"])

    def test_a_multiline_named_import(self):
        source = 'import {\n  a,\n  b,\n} from "./a";\n'
        self.assertEqual(specifiers_in(source), ["./a"])

    def test_an_export_from_is_an_edge(self):
        """A re-export is the edge a barrel file is made of."""
        self.assertEqual(specifiers_in('export * from "./a";\n'), ["./a"])

    def test_a_named_export_from_is_an_edge(self):
        self.assertEqual(specifiers_in('export { a } from "./a";\n'), ["./a"])

    def test_an_awaited_dynamic_import_is_an_edge(self):
        self.assertEqual(specifiers_in('const m = await import("./a");\n'), ["./a"])

    def test_a_require_is_an_edge(self):
        self.assertEqual(specifiers_in('const m = require("./a");\n'), ["./a"])

    def test_a_computed_import_is_detected_rather_than_silently_missed(self):
        """The one construct that would make this measurement an overestimate.

        `import(pathFromAVariable)` cannot be resolved statically, so a module
        only ever loaded that way is reported unreachable and is not. The
        contract test below refuses one in the enrolled tree; here we only prove
        the detector sees it.
        """
        self.assertTrue(has_computed_import("const m = await import(name);\n"))

    def test_a_literal_import_is_not_reported_as_computed(self):
        self.assertFalse(has_computed_import('const m = await import("./a");\n'))

    def test_a_literal_import_wrapped_across_lines_is_not_reported_as_computed(self):
        """Found by the live-repository contract, not invented.

        local-site-studio's Stripe webhook wraps `await import(` and its literal
        across three lines. The first version of the detector reported it as
        computed, because `\\s*` before the lookahead backtracked until the
        lookahead landed on a space. A control that says it cannot see part of
        the graph, wrongly, is a control nobody believes.
        """
        self.assertFalse(has_computed_import('await import(\n  "@/lib/email/resend"\n);\n'))

    def test_a_literal_import_wrapped_across_lines_is_still_an_edge(self):
        self.assertEqual(
            specifiers_in('await import(\n  "@/lib/email/resend"\n);\n'),
            ["@/lib/email/resend"],
        )

    def test_a_property_named_import_is_not_an_edge(self):
        self.assertEqual(specifiers_in('config.import("./a");\n'), [])


class JsonCommentTests(unittest.TestCase):
    def test_a_line_comment_is_stripped(self):
        self.assertEqual(json.loads(strip_json_comments('{"a": 1} // note')), {"a": 1})

    def test_a_block_comment_is_stripped(self):
        self.assertEqual(json.loads(strip_json_comments('{/* n */"a": 1}')), {"a": 1})

    def test_a_double_slash_inside_a_string_survives(self):
        """`"@/*": ["./src/*"]` must not become a truncated object.

        If it did, the alias table would come back empty and every `@/`-imported
        module in the venture would be reported unreachable — a 100-module
        finding indistinguishable from a real one.
        """
        raw = '{"paths": {"@/*": ["./src/*"]}, "url": "https://x.invalid"}'
        self.assertEqual(json.loads(strip_json_comments(raw))["url"], "https://x.invalid")


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------


class ResolutionTests(unittest.TestCase):
    ALIASES = {"@/*": ["ventures/demo/src/*"]}
    TRACKED = frozenset(
        {
            "ventures/demo/src/lib/a.ts",
            "ventures/demo/src/lib/b.tsx",
            "ventures/demo/src/lib/c/index.ts",
            "ventures/demo/src/lib/d.mjs",
            "ventures/demo/src/lib/notes.md",
        }
    )

    def resolve(self, specifier, importer="ventures/demo/src/app/page.tsx"):
        return resolve(specifier, importer, "ventures/demo", self.ALIASES, self.TRACKED)

    def test_a_relative_extensionless_specifier(self):
        self.assertEqual(self.resolve("../lib/a"), "ventures/demo/src/lib/a.ts")

    def test_a_relative_specifier_with_its_extension(self):
        self.assertEqual(self.resolve("../lib/a.ts"), "ventures/demo/src/lib/a.ts")

    def test_a_tsx_module(self):
        self.assertEqual(self.resolve("../lib/b"), "ventures/demo/src/lib/b.tsx")

    def test_a_directory_resolves_through_its_index(self):
        self.assertEqual(self.resolve("../lib/c"), "ventures/demo/src/lib/c/index.ts")

    def test_a_js_specifier_resolves_to_the_typescript_source(self):
        """`import "./a.js"` from a `.ts` module is NodeNext's spelling.

        Not resolving it drops a real edge, and a dropped edge is a live module
        reported dead.
        """
        self.assertEqual(self.resolve("../lib/a.js"), "ventures/demo/src/lib/a.ts")

    def test_a_path_alias(self):
        self.assertEqual(self.resolve("@/lib/a"), "ventures/demo/src/lib/a.ts")

    def test_a_package_specifier_is_not_ours(self):
        self.assertIsNone(self.resolve("react"))

    def test_a_node_builtin_is_not_ours(self):
        self.assertIsNone(self.resolve("node:crypto"))

    def test_a_non_source_file_is_not_a_module(self):
        self.assertIsNone(self.resolve("../lib/notes.md"))

    def test_an_unknown_relative_specifier_is_none(self):
        self.assertIsNone(self.resolve("../lib/missing"))

    def test_an_untracked_file_does_not_resolve(self):
        """Population comes from git, and so does resolution.

        A control that walked the filesystem would resolve an edge into a
        developer's build output. Here the target has to be tracked.
        """
        self.assertIsNone(
            resolve("../lib/a", "ventures/demo/src/app/page.tsx", "ventures/demo", self.ALIASES, frozenset())
        )


class AliasTableTests(TempRepoCase):
    def test_a_broken_tsconfig_fails_closed(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/tsconfig.json", "{not json at all")
        with self.assertRaises(ReachabilityError):
            self.repo.measure()

    def test_a_paths_entry_that_is_not_a_list_fails_closed(self):
        project = self.repo.venture(aliases='"@/*": "./src/*"')
        with self.assertRaises(ReachabilityError):
            self.repo.measure()

    def test_a_commented_tsconfig_is_read(self):
        project = self.repo.venture()
        self.repo.write(
            f"{project}/tsconfig.json",
            '{\n  // the alias every page uses\n  "compilerOptions": {"paths": {"@/*": ["./src/*"]}}\n}\n',
        )
        self.repo.write(f"{project}/src/app/page.tsx", 'import "@/lib/live";\n')
        self.repo.write(f"{project}/src/lib/live.ts", "export const a = 1;\n")
        [project_measured] = self.repo.measure().projects
        self.assertEqual(project_measured.unreachable, ())


# ---------------------------------------------------------------------------
# Entrypoints
# ---------------------------------------------------------------------------


class EntrypointTests(TempRepoCase):
    def unreachable(self):
        [project] = self.repo.measure().projects
        return list(project.unreachable)

    def test_an_app_router_page_is_a_root(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/src/app/a/page.tsx", 'import "@/lib/live";\n')
        self.repo.write(f"{project}/src/lib/live.ts", "export const a = 1;\n")
        self.assertEqual(self.unreachable(), [])

    def test_a_route_handler_is_a_root(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/src/app/api/x/route.ts", 'import "@/lib/live";\n')
        self.repo.write(f"{project}/src/lib/live.ts", "export const a = 1;\n")
        self.assertEqual(self.unreachable(), [])

    def test_a_colocated_file_under_app_is_not_a_root(self):
        """Next builds a route for `page`/`route`/`layout`, and for nothing else.

        A file colocated beside a page is ordinary source: live if the page
        imports it, dead if not. Treating the whole `app/` tree as roots would
        hide exactly that.
        """
        project = self.repo.venture()
        self.repo.write(f"{project}/src/app/a/helpers.ts", "export const a = 1;\n")
        self.assertEqual(self.unreachable(), [f"{project}/src/app/a/helpers.ts"])

    def test_middleware_is_a_root(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/src/middleware.ts", 'import "@/lib/live";\n')
        self.repo.write(f"{project}/src/lib/live.ts", "export const a = 1;\n")
        self.assertEqual(self.unreachable(), [])

    def test_proxy_is_a_root(self):
        """Next 16's rename of `middleware`.

        Two ventures in this repository are on 16.x and ship `src/proxy.ts`.
        Recognising only the older name reported quick-pick-survey's origin
        check — the file standing in front of eighteen mutating API handlers —
        as code nothing loads.
        """
        project = self.repo.venture()
        self.repo.write(f"{project}/src/proxy.ts", 'import "@/lib/live";\n')
        self.repo.write(f"{project}/src/lib/live.ts", "export const a = 1;\n")
        self.assertEqual(self.unreachable(), [])

    def test_a_root_config_is_a_root(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/playwright.config.ts", 'import "./src/lib/live";\n')
        self.repo.write(f"{project}/src/lib/live.ts", "export const a = 1;\n")
        self.assertEqual(self.unreachable(), [])

    def test_a_nested_config_is_not_a_root(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/src/lib/thing.config.ts", "export const a = 1;\n")
        self.assertEqual(self.unreachable(), [f"{project}/src/lib/thing.config.ts"])

    def test_a_public_asset_is_a_root(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/public/sw.js", "self.addEventListener('fetch', () => {});\n")
        self.assertEqual(self.unreachable(), [])

    def test_a_top_level_script_is_a_root(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/scripts/build-docs.mjs", 'import "../src/lib/live.js";\n')
        self.repo.write(f"{project}/src/lib/live.ts", "export const a = 1;\n")
        self.assertEqual(self.unreachable(), [])

    def test_a_helper_nested_under_scripts_is_not_a_root(self):
        """Depth one only, and the depth is the point.

        A script is run; a module it imports is reachable through it. A module
        nobody imports that happens to sit two directories down is dead in the
        same way anything else is.
        """
        project = self.repo.venture()
        self.repo.write(f"{project}/scripts/lib/helper.mjs", "export const a = 1;\n")
        self.assertEqual(self.unreachable(), [f"{project}/scripts/lib/helper.mjs"])

    def test_a_file_named_in_a_package_script_is_a_root(self):
        project = self.repo.venture(scripts='{"seed": "tsx prisma/seed.ts"}')
        self.repo.write(f"{project}/prisma/seed.ts", 'import "../src/lib/live";\n')
        self.repo.write(f"{project}/src/lib/live.ts", "export const a = 1;\n")
        self.assertEqual(self.unreachable(), [])

    def test_a_test_file_named_in_a_package_script_is_not_a_root(self):
        """`npm test` naming a suite does not make the suite an entrypoint.

        If it did, every module with a test would be reachable and this control
        would measure nothing at all — which is the exact confusion it exists to
        remove.
        """
        project = self.repo.venture(scripts='{"test": "node --test tests/dead.test.ts"}')
        self.repo.write(f"{project}/tests/dead.test.ts", 'import "../src/lib/dead";\n')
        self.repo.write(f"{project}/src/lib/dead.ts", "export const a = 1;\n")
        self.assertEqual(self.unreachable(), [f"{project}/src/lib/dead.ts"])

    def test_convex_modules_are_roots_only_when_convex_is_a_dependency(self):
        project = self.repo.venture(dependencies='"next": "16.0.0"')
        self.repo.write(f"{project}/convex/tasks.ts", "export const a = 1;\n")
        self.assertEqual(self.unreachable(), [f"{project}/convex/tasks.ts"])

    def test_convex_modules_are_roots_when_convex_is_a_dependency(self):
        project = self.repo.venture(dependencies='"next": "16.0.0", "convex": "1.0.0"')
        self.repo.write(f"{project}/convex/tasks.ts", "export const a = 1;\n")
        self.assertEqual(self.unreachable(), [])


# ---------------------------------------------------------------------------
# The closure
# ---------------------------------------------------------------------------


class ClosureTests(TempRepoCase):
    def unreachable(self):
        [project] = self.repo.measure().projects
        return list(project.unreachable)

    def test_a_module_two_hops_from_a_page_is_reachable(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/src/app/page.tsx", 'import "@/lib/a";\n')
        self.repo.write(f"{project}/src/lib/a.ts", 'import "@/lib/b";\n')
        self.repo.write(f"{project}/src/lib/b.ts", "export const b = 1;\n")
        self.assertEqual(self.unreachable(), [])

    def test_a_dead_module_held_up_by_another_dead_module_is_still_dead(self):
        """The whole reason this control computes a closure.

        A direct-importer scan sees `b` imported by `a` and calls it live. Dead
        code arrives in clusters, because a feature is built as a group of
        files, so this is the common case rather than the corner one: on
        print-atelier a direct scan reports 58 unreachable lib modules and the
        closure reports 63.
        """
        project = self.repo.venture()
        self.repo.write(f"{project}/src/lib/a.ts", 'import "@/lib/b";\n')
        self.repo.write(f"{project}/src/lib/b.ts", "export const b = 1;\n")
        self.assertEqual(
            self.unreachable(), [f"{project}/src/lib/a.ts", f"{project}/src/lib/b.ts"]
        )

    def test_a_test_files_import_confers_no_reachability(self):
        """Stated as its own test because it is the measurement.

        Every unreachable module this control reports on the live tree has a
        passing suite. A suite proves a module works; it does not prove anything
        calls it.
        """
        project = self.repo.venture()
        self.repo.write(f"{project}/tests/a.test.ts", 'import "../src/lib/dead";\n')
        self.repo.write(f"{project}/src/lib/dead.ts", "export const a = 1;\n")
        self.assertEqual(self.unreachable(), [f"{project}/src/lib/dead.ts"])

    def test_a_module_in_a_test_directory_is_not_product_code(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/src/test/setup.ts", "export const a = 1;\n")
        self.assertEqual(self.unreachable(), [])

    def test_a_cycle_between_two_reachable_modules_terminates(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/src/app/page.tsx", 'import "@/lib/a";\n')
        self.repo.write(f"{project}/src/lib/a.ts", 'import "@/lib/b";\n')
        self.repo.write(f"{project}/src/lib/b.ts", 'import "@/lib/a";\n')
        self.assertEqual(self.unreachable(), [])

    def test_a_cycle_between_two_dead_modules_is_still_dead(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/src/lib/a.ts", 'import "@/lib/b";\n')
        self.repo.write(f"{project}/src/lib/b.ts", 'import "@/lib/a";\n')
        self.assertEqual(
            self.unreachable(), [f"{project}/src/lib/a.ts", f"{project}/src/lib/b.ts"]
        )

    def test_an_untracked_module_is_not_in_the_population(self):
        """Population is `git ls-files`, never a filesystem walk.

        A `readdirSync`-style scan in this repository was found counting a
        developer's build output, which made a control's number differ between
        the working tree and a clean clone.
        """
        project = self.repo.venture()
        self.repo.write(f"{project}/src/lib/untracked.ts", "export const a = 1;\n", track=False)
        self.assertEqual(self.unreachable(), [])

    def test_a_declaration_file_is_not_a_module(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/src/types.d.ts", "declare const a: number;\n")
        self.assertEqual(self.unreachable(), [])

    def test_a_module_in_a_skipped_directory_is_not_in_the_population(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/node_modules/pkg/index.ts", "export const a = 1;\n")
        self.repo.write(f"{project}/.next/server/chunk.js", "export const a = 1;\n")
        self.assertEqual(self.unreachable(), [])


class ClassificationTests(TempRepoCase):
    def test_a_project_without_next_is_not_measured(self):
        self.repo.venture(name="lib", dependencies='"typescript": "5.0.0"')
        measurement = self.repo.measure()
        self.assertEqual(measurement.projects, [])
        self.assertEqual(measurement.unmeasured, ["ventures/lib"])

    def test_a_next_project_without_an_app_directory_is_not_measured(self):
        """Fails to `unmeasured`, never to `zero unreachable`.

        A pages-router or partially-migrated project has a different load rule,
        and guessing at it would produce a confident zero — the shape this
        repository records as a shipped feature that quietly does nothing.
        """
        self.repo.write("ventures/pages/package.json", '{"dependencies": {"next": "15.0.0"}}')
        self.repo.write("ventures/pages/src/pages/index.tsx", "export default function P() {}\n")
        measurement = self.repo.measure()
        self.assertEqual(measurement.projects, [])
        self.assertEqual(measurement.unmeasured, ["ventures/pages"])

    def test_a_nested_project_is_measured_under_its_own_rules(self):
        outer = self.repo.venture(name="outer")
        self.repo.write("ventures/outer/apps/inner/package.json", '{"dependencies": {}}')
        self.repo.write("ventures/outer/apps/inner/src/lib/thing.ts", "export const a = 1;\n")
        measurement = self.repo.measure()
        [measured] = measurement.projects
        self.assertEqual(measured.path, outer)
        self.assertNotIn("ventures/outer/apps/inner/src/lib/thing.ts", measured.modules)
        self.assertIn("ventures/outer/apps/inner", measurement.unmeasured)


# ---------------------------------------------------------------------------
# The ratchet and the cross-check
# ---------------------------------------------------------------------------


def fake_measurement(path="ventures/demo", unreachable=(), modules=None):
    project = module_reachability.Project(
        path=path,
        kind=NEXT_APP,
        modules=tuple(modules if modules is not None else unreachable),
        unreachable=tuple(unreachable),
    )
    return module_reachability.Measurement(projects=[project])


class BudgetTests(unittest.TestCase):
    def checks(self, *args, **kwargs):
        return sorted(f.check for f in evaluate(*args, **kwargs))

    def test_a_count_at_its_budget_is_clean(self):
        measurement = fake_measurement(unreachable=("a.ts", "b.ts"))
        self.assertEqual(
            self.checks(measurement, budgets={"ventures/demo": 2}, registered=(), pins=(), today=TODAY),
            [],
        )

    def test_a_count_above_its_budget_fails(self):
        measurement = fake_measurement(unreachable=("a.ts", "b.ts", "c.ts"))
        self.assertEqual(
            self.checks(measurement, budgets={"ventures/demo": 2}, registered=(), pins=(), today=TODAY),
            ["unreachable-grew"],
        )

    def test_a_count_below_its_budget_fails_as_a_stale_budget(self):
        """Two-directional, as `coverage_ratchet.py`'s comparison is.

        Slack is headroom the next dead module gets for free. The diff that
        removed dead code has to lower the budget in the same change, which is
        also the only way `cap_ratchet` will ever let it move.
        """
        measurement = fake_measurement(unreachable=("a.ts",))
        self.assertEqual(
            self.checks(measurement, budgets={"ventures/demo": 4}, registered=(), pins=(), today=TODAY),
            ["budget-stale"],
        )

    def test_a_measured_project_with_no_budget_fails(self):
        measurement = fake_measurement(unreachable=())
        self.assertEqual(
            self.checks(measurement, budgets={}, registered=(), pins=(), today=TODAY),
            ["unbudgeted-project"],
        )

    def test_a_budget_for_a_project_that_is_no_longer_measured_fails(self):
        """A budget over nothing reads as a passing gate.

        This is the direction that gets a control quietly switched off: rename
        the venture, and its ceiling still says PASS while measuring an empty
        set.
        """
        measurement = fake_measurement(unreachable=())
        self.assertEqual(
            self.checks(
                measurement,
                budgets={"ventures/demo": 0, "ventures/gone": 0},
                registered=(),
                pins=(),
                today=TODAY,
            ),
            ["budget-unmeasured"],
        )

    def test_the_constant_name_is_derived_from_the_project_path(self):
        self.assertEqual(
            budget_constant_name("ventures/photo-editing/docs-site"),
            "MAX_UNREACHABLE_PHOTO_EDITING_DOCS_SITE",
        )


class PinCrossCheckTests(unittest.TestCase):
    PIN = "ventures/demo/src/lib/money.ts"

    def checks(self, **kwargs):
        return sorted(f.check for f in evaluate(today=TODAY, **kwargs))

    def registration(self, path=None, expires="2026-10-01"):
        return PinOnUnreachableModule(
            path=path or self.PIN, owner="duncan", expires=expires, why="under review"
        )

    def test_a_pin_on_an_unreachable_module_fails(self):
        measurement = fake_measurement(unreachable=(self.PIN,))
        self.assertEqual(
            self.checks(
                measurement=measurement,
                budgets={"ventures/demo": 1},
                registered=(),
                pins=(self.PIN,),
            ),
            ["pin-on-unreachable-module"],
        )

    def test_a_pin_on_a_reachable_module_is_clean(self):
        measurement = fake_measurement(unreachable=(), modules=(self.PIN,))
        self.assertEqual(
            self.checks(
                measurement=measurement,
                budgets={"ventures/demo": 0},
                registered=(),
                pins=(self.PIN,),
            ),
            [],
        )

    def test_a_registered_pairing_is_accepted(self):
        measurement = fake_measurement(unreachable=(self.PIN,))
        self.assertEqual(
            self.checks(
                measurement=measurement,
                budgets={"ventures/demo": 1},
                registered=(self.registration(),),
                pins=(self.PIN,),
            ),
            [],
        )

    def test_a_registration_for_a_module_that_became_reachable_fails(self):
        """The registry is checked in both directions.

        A waiver list that is only ever appended to stops describing the tree it
        governs. When the argument is answered, the row has to go.
        """
        measurement = fake_measurement(unreachable=(), modules=(self.PIN,))
        self.assertEqual(
            self.checks(
                measurement=measurement,
                budgets={"ventures/demo": 0},
                registered=(self.registration(),),
                pins=(self.PIN,),
            ),
            ["stale-pin-registration"],
        )

    def test_a_registration_for_a_file_that_is_no_longer_pinned_fails(self):
        measurement = fake_measurement(unreachable=(self.PIN,))
        self.assertEqual(
            self.checks(
                measurement=measurement,
                budgets={"ventures/demo": 1},
                registered=(self.registration(),),
                pins=(),
            ),
            ["stale-pin-registration"],
        )

    def test_an_expired_registration_fails(self):
        measurement = fake_measurement(unreachable=(self.PIN,))
        self.assertEqual(
            self.checks(
                measurement=measurement,
                budgets={"ventures/demo": 1},
                registered=(self.registration(expires="2026-08-16"),),
                pins=(self.PIN,),
            ),
            ["registration-expired"],
        )

    def test_a_registration_dated_past_the_ceiling_fails(self):
        """An expiry field nothing bounds is one someone writes 2099 into."""
        far = (TODAY + timedelta(days=MAX_REGISTRATION_DAYS + 1)).isoformat()
        measurement = fake_measurement(unreachable=(self.PIN,))
        self.assertEqual(
            self.checks(
                measurement=measurement,
                budgets={"ventures/demo": 1},
                registered=(self.registration(expires=far),),
                pins=(self.PIN,),
            ),
            ["registration-too-far-out"],
        )

    def test_an_undated_registration_fails(self):
        measurement = fake_measurement(unreachable=(self.PIN,))
        self.assertEqual(
            self.checks(
                measurement=measurement,
                budgets={"ventures/demo": 1},
                registered=(self.registration(expires="soon"),),
                pins=(self.PIN,),
            ),
            ["registration-undated"],
        )

    def test_the_pin_population_comes_from_cap_ratchet_rather_than_a_second_list(self):
        """Imported, not re-typed. A copy of a population checks the copy."""
        expected = {pin.path for pin in cap_ratchet.PINS}
        self.assertTrue(expected.issubset(set(pinned_paths())))


# ---------------------------------------------------------------------------
# The command line
# ---------------------------------------------------------------------------


class CommandLineTests(TempRepoCase):
    def test_findings_exit_one(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/src/lib/dead.ts", "export const a = 1;\n")
        self.assertEqual(module_reachability.main(["--repo-root", str(self.repo.root)]), 1)

    def test_report_always_exits_zero(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/src/lib/dead.ts", "export const a = 1;\n")
        self.assertEqual(
            module_reachability.main(["--repo-root", str(self.repo.root), "--report"]), 0
        )

    def test_a_measurement_error_exits_one_without_report(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/tsconfig.json", "{broken")
        self.assertEqual(module_reachability.main(["--repo-root", str(self.repo.root)]), 1)

    def test_a_measurement_error_under_report_still_exits_zero(self):
        project = self.repo.venture()
        self.repo.write(f"{project}/tsconfig.json", "{broken")
        self.assertEqual(
            module_reachability.main(["--repo-root", str(self.repo.root), "--report"]), 0
        )

    def test_listing_an_unmeasured_project_exits_one(self):
        self.repo.venture()
        self.assertEqual(
            module_reachability.main(["--repo-root", str(self.repo.root), "--list", "nope"]), 1
        )


# ---------------------------------------------------------------------------
# The live repository
# ---------------------------------------------------------------------------


class RepositoryContractTests(unittest.TestCase):
    """Asked about this repository, not about a scratch fixture."""

    @classmethod
    def setUpClass(cls):
        cls.measurement = measure(REPO_ROOT)

    def test_the_repository_is_within_its_declared_budgets(self):
        findings = evaluate(self.measurement)
        self.assertEqual(
            [f"[{f.check}] {f.message}" for f in findings],
            [],
            "run `python3 scripts/ci/module_reachability.py` for the detail",
        )

    def test_print_atelier_is_the_finding_this_control_was_built_for(self):
        """The measurement, asserted rather than described.

        If this number ever falls the assertion is wrong and the fix is to lower
        the budget and this bound together — which is the ratchet working. It is
        written as `>=` on the module count and `==` on nothing, so ordinary
        product work does not fail it.
        """
        [project] = [p for p in self.measurement.projects if p.path == "ventures/print-atelier"]
        self.assertGreater(len(project.modules), 150)
        self.assertGreater(
            len(project.unreachable),
            40,
            "print-atelier's unreachable set collapsed; re-derive the budget with --emit-budgets",
        )
        self.assertTrue(
            all(rel.startswith("ventures/print-atelier/src/lib/") for rel in project.unreachable),
            "unreachable modules appeared outside src/lib; the entrypoint rule may have drifted",
        )

    def test_every_measured_project_declares_a_budget_under_its_derived_name(self):
        for project in self.measurement.projects:
            with self.subTest(project=project.path):
                self.assertIn(project.path, BUDGETS)
                name = budget_constant_name(project.path)
                self.assertTrue(
                    hasattr(module_reachability, name),
                    f"{project.path}'s budget must be declared as `{name}` so cap_ratchet's "
                    f"enrollment contract can see it",
                )
                self.assertEqual(getattr(module_reachability, name), BUDGETS[project.path])

    def test_every_budget_is_watched_by_the_cap_ratchet_and_only_downward(self):
        """The half of the ratchet that is not in this file.

        A baseline living beside the code it bounds is a baseline that code can
        edit. These are held to the lowest value they have ever had in git by a
        control with no dependency on this one.
        """
        watched = {
            watch.locator: watch
            for watch in cap_ratchet.WATCHES
            if watch.path == "scripts/ci/module_reachability.py"
        }
        for project in self.measurement.projects:
            name = budget_constant_name(project.path)
            with self.subTest(constant=name):
                self.assertIn(name, watched, f"{name} bounds dead code and nothing holds it")
                self.assertEqual(watched[name].direction, cap_ratchet.DOWN)
        self.assertIn("MAX_REGISTRATION_DAYS", watched)

    def test_no_enrolled_module_uses_a_computed_import(self):
        """The one construct that would make this an overestimate.

        A module loaded only through `import(variable)` is reported unreachable
        and is not. There are none today; if one appears, this fails rather than
        letting the number quietly become a guess.
        """
        offenders = []
        for project in self.measurement.projects:
            for rel in project.modules:
                if has_computed_import((REPO_ROOT / rel).read_text(encoding="utf-8")):
                    offenders.append(rel)
        self.assertEqual(
            offenders,
            [],
            "these load a module through a computed specifier, which this control cannot "
            "follow: " + ", ".join(offenders),
        )

    def test_every_registered_pairing_is_still_a_pin_on_an_unreachable_module(self):
        unreachable = {
            rel for project in self.measurement.projects for rel in project.unreachable
        }
        pins = set(pinned_paths())
        for entry in PINS_ON_UNREACHABLE_MODULES:
            with self.subTest(path=entry.path):
                self.assertIn(entry.path, pins)
                self.assertIn(entry.path, unreachable)
                self.assertGreater(
                    len(entry.why.split()),
                    12,
                    "a registered pairing needs an argument, not a label",
                )

    def test_no_two_registrations_name_the_same_module(self):
        paths = [entry.path for entry in PINS_ON_UNREACHABLE_MODULES]
        self.assertEqual(sorted(paths), sorted(set(paths)))

    def test_the_control_is_wired_into_the_runner(self):
        """A control that does not run is worth nothing.

        This repository has shipped correct gates that ran on no path anyone
        takes, so the registration is asserted here as well as by
        `scripts/ci/gate_wiring.py`.
        """
        runner = (REPO_ROOT / "scripts" / "test-ci.sh").read_text(encoding="utf-8")
        self.assertRegex(
            runner,
            r"run_ci_test\s+\"[^\"]+\"\s+python3\s+\"\$\{REPO_ROOT\}/scripts/ci/module_reachability\.py\"",
        )

    def test_the_unmeasured_projects_are_reported_rather_than_counted_as_clean(self):
        """Ten venture packages have no reachability model here.

        They are named in the report as NOT MEASURED. The failure this guards
        against is the opposite: a project silently classified as a Next app,
        measured with the wrong load rule, and reported as zero.
        """
        self.assertTrue(self.measurement.unmeasured)
        for path in self.measurement.unmeasured:
            with self.subTest(path=path):
                self.assertNotIn(path, BUDGETS)


if __name__ == "__main__":
    unittest.main()
