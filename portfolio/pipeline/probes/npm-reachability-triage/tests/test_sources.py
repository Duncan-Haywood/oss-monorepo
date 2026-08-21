"""Behaviour of the project source scan.

The scan can only ever *block* a suppression, so its failure mode is the mirror
image of the rest of the tool: over-matching is safe and under-matching is the
bug. The tests below pin the shapes it claims to cover, and pin the exclusions
that stop it reading dependency or build-output code as if it were the
project's own.
"""

import pytest

from triage.sources import (
    declared_production_dependencies,
    imports_in_text,
    package_name_from_specifier,
    scan_project_imports,
)


class TestSpecifierReduction:
    @pytest.mark.parametrize(
        "specifier,expected",
        [
            ("postcss", "postcss"),
            ("postcss/lib/parse", "postcss"),
            ("@scope/pkg", "@scope/pkg"),
            ("@scope/pkg/sub/path", "@scope/pkg"),
        ],
    )
    def test_reduces_to_the_package_name(self, specifier, expected):
        assert package_name_from_specifier(specifier) == expected

    @pytest.mark.parametrize(
        "specifier",
        ["./local", "../up", "/abs", "~/alias", "#internal", "https://example.com/m.js", "", "@"],
    )
    def test_non_packages_are_rejected(self, specifier):
        assert package_name_from_specifier(specifier) is None


class TestImportsInText:
    @pytest.mark.parametrize(
        "source",
        [
            'import postcss from "postcss"',
            "import postcss from 'postcss'",
            'const postcss = require("postcss")',
            'const mod = await import("postcss")',
            'import "postcss"',
            'export { parse } from "postcss/lib/parse"',
        ],
    )
    def test_finds_every_covered_shape(self, source):
        assert "postcss" in imports_in_text(source)

    def test_relative_imports_are_not_packages(self):
        assert imports_in_text('import x from "./postcss"') == set()

    def test_over_matching_is_accepted_deliberately(self):
        """A commented-out import still counts.

        Blocking a suppression is the safe failure, so the scan does not try to
        distinguish live code from a comment. This test exists so that a later
        change which "fixes" the over-match has to argue with it first.
        """
        assert "postcss" in imports_in_text('// import postcss from "postcss"')


class TestScanProject:
    def test_reads_the_projects_own_source(self, tmp_path):
        (tmp_path / "app").mkdir()
        (tmp_path / "app" / "page.tsx").write_text('import postcss from "postcss"')
        assert "postcss" in scan_project_imports(tmp_path)

    def test_config_files_count_as_project_source(self, tmp_path):
        (tmp_path / "next.config.mjs").write_text('import mdx from "@next/mdx"')
        assert "@next/mdx" in scan_project_imports(tmp_path)

    @pytest.mark.parametrize("directory", ["node_modules", ".next", "dist", "out", "build"])
    def test_dependency_and_build_output_are_skipped(self, tmp_path, directory):
        nested = tmp_path / directory / "inner"
        nested.mkdir(parents=True)
        (nested / "bundle.js").write_text('require("postcss")')
        assert "postcss" not in scan_project_imports(tmp_path)

    def test_an_empty_project_scans_clean(self, tmp_path):
        assert scan_project_imports(tmp_path) == frozenset()


class TestDeclaredDependencies:
    def test_production_fields_are_read(self, tmp_path):
        (tmp_path / "package.json").write_text(
            '{"dependencies": {"next": "14"}, "optionalDependencies": {"sharp": "0.33"}}'
        )
        declared = declared_production_dependencies(tmp_path)
        assert declared == frozenset({"next", "sharp"})

    def test_dev_dependencies_are_excluded(self, tmp_path):
        """Otherwise the build-surface rule could never fire at all.

        Every Next.js project in this portfolio lists postcss in
        devDependencies; treating that as runtime use would block the exact
        suppression the rule exists to make, and npm already encodes dev-ness
        per install location for the dependency-path rule to use.
        """
        (tmp_path / "package.json").write_text('{"devDependencies": {"postcss": "^8"}}')
        assert declared_production_dependencies(tmp_path) == frozenset()

    def test_missing_or_malformed_manifest_declares_nothing(self, tmp_path):
        assert declared_production_dependencies(tmp_path) == frozenset()
        (tmp_path / "package.json").write_text("{not json")
        assert declared_production_dependencies(tmp_path) == frozenset()
