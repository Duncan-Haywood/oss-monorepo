from __future__ import annotations

from pathlib import Path

import pytest

from triage.pnpm import (
    UnsupportedPnpmLockfile,
    importer_paths,
    parse_pnpm_lockfile,
    parse_pnpm_lockfile_data,
)

REPO_ROOT = Path(__file__).resolve().parents[5]
RETAIL_PILOT_LOCKFILE = REPO_ROOT / "ventures" / "retail-pilot-intel" / "pnpm-lock.yaml"


def _lockfile(importers: dict, snapshots: dict) -> dict:
    return {"lockfileVersion": "9.0", "importers": importers, "snapshots": snapshots}


def test_a_direct_production_dependency_is_analysed_as_production():
    raw = _lockfile(
        importers={
            ".": {"dependencies": {"left-pad": {"specifier": "^1.0.0", "version": "1.3.0"}}}
        },
        snapshots={"left-pad@1.3.0": {}},
    )
    installed = parse_pnpm_lockfile_data(raw)
    assert len(installed) == 1
    assert installed[0].name == "left-pad"
    assert installed[0].version == "1.3.0"
    assert installed[0].dev is False


def test_a_direct_devdependency_with_no_production_path_is_dev_only():
    raw = _lockfile(
        importers={
            ".": {"devDependencies": {"eslint": {"specifier": "^9", "version": "9.0.0"}}}
        },
        snapshots={"eslint@9.0.0": {}},
    )
    installed = parse_pnpm_lockfile_data(raw)
    assert len(installed) == 1
    assert installed[0].name == "eslint"
    assert installed[0].dev is True


def test_a_transitive_production_dependency_is_not_dev_only():
    # next -> postcss, postcss is not itself an importer root.
    raw = _lockfile(
        importers={
            ".": {"dependencies": {"next": {"specifier": "^14", "version": "14.0.0"}}}
        },
        snapshots={
            "next@14.0.0": {"dependencies": {"postcss": "8.4.0"}},
            "postcss@8.4.0": {},
        },
    )
    installed = parse_pnpm_lockfile_data(raw)
    by_name = {p.name: p for p in installed}
    assert by_name["postcss"].dev is False


def test_a_package_reachable_from_both_prod_and_dev_roots_is_not_dev_only():
    # Same package pulled in by a production root and, separately, a
    # devDependency -- the production path must win, matching npm's "one
    # unproven/production location is enough to report the finding".
    raw = _lockfile(
        importers={
            ".": {
                "dependencies": {"a": {"specifier": "^1", "version": "1.0.0"}},
                "devDependencies": {"b": {"specifier": "^1", "version": "1.0.0"}},
            }
        },
        snapshots={
            "a@1.0.0": {"dependencies": {"shared": "2.0.0"}},
            "b@1.0.0": {"dependencies": {"shared": "2.0.0"}},
            "shared@2.0.0": {},
        },
    )
    installed = parse_pnpm_lockfile_data(raw)
    by_name = {p.name: p for p in installed}
    assert by_name["shared"].dev is False


def test_a_dependency_reached_only_through_an_optional_edge_is_production():
    raw = _lockfile(
        importers={
            ".": {
                "optionalDependencies": {
                    "fsevents": {"specifier": "^2", "version": "2.3.0"}
                }
            }
        },
        snapshots={"fsevents@2.3.0": {}},
    )
    installed = parse_pnpm_lockfile_data(raw)
    assert installed[0].dev is False


def test_a_snapshots_own_optionaldependencies_field_is_walked_as_production():
    raw = _lockfile(
        importers={
            ".": {"dependencies": {"chokidar": {"specifier": "^3", "version": "3.5.0"}}}
        },
        snapshots={
            "chokidar@3.5.0": {"optionalDependencies": {"fsevents": "2.3.0"}},
            "fsevents@2.3.0": {},
        },
    )
    installed = parse_pnpm_lockfile_data(raw)
    by_name = {p.name: p for p in installed}
    assert by_name["fsevents"].dev is False


def test_a_peer_suffixed_snapshot_key_resolves_to_its_bare_name_and_version():
    raw = _lockfile(
        importers={
            ".": {
                "dependencies": {
                    "react-dom": {"specifier": "^19", "version": "19.2.8(react@19.2.8)"},
                    "react": {"specifier": "^19", "version": "19.2.8"},
                }
            }
        },
        snapshots={
            "react-dom@19.2.8(react@19.2.8)": {"dependencies": {"react": "19.2.8"}},
            "react@19.2.8": {},
        },
    )
    installed = parse_pnpm_lockfile_data(raw)
    by_name = {p.name: p for p in installed}
    assert by_name["react-dom"].version == "19.2.8"
    assert by_name["react-dom"].path == "react-dom@19.2.8(react@19.2.8)"


def test_a_scoped_package_name_splits_on_the_second_at_sign():
    raw = _lockfile(
        importers={
            ".": {
                "dependencies": {
                    "@babel/core": {"specifier": "^7", "version": "7.29.7"}
                }
            }
        },
        snapshots={"@babel/core@7.29.7": {}},
    )
    installed = parse_pnpm_lockfile_data(raw)
    assert installed[0].name == "@babel/core"
    assert installed[0].version == "7.29.7"


def test_a_workspace_link_dependency_pulls_in_the_targets_production_graph():
    # packages/pos depends on the local packages/schemas workspace member,
    # which itself has one production and one dev dependency. Only the
    # production one should propagate to packages/pos's own reachability.
    raw = _lockfile(
        importers={
            "packages/pos": {
                "dependencies": {
                    "schemas": {"specifier": "workspace:*", "version": "link:../schemas"}
                }
            },
            "packages/schemas": {
                "dependencies": {"zod": {"specifier": "^3", "version": "3.22.0"}},
                "devDependencies": {"vitest": {"specifier": "^1", "version": "1.0.0"}},
            },
        },
        snapshots={"zod@3.22.0": {}, "vitest@1.0.0": {}},
    )
    installed = parse_pnpm_lockfile_data(raw, importer_path="packages/pos")
    names = {p.name for p in installed}
    assert names == {"zod"}
    assert installed[0].dev is False


def test_a_workspace_links_own_devdependencies_never_leak_to_the_consumer():
    raw = _lockfile(
        importers={
            "packages/pos": {
                "dependencies": {
                    "schemas": {"specifier": "workspace:*", "version": "link:../schemas"}
                }
            },
            "packages/schemas": {
                "devDependencies": {"vitest": {"specifier": "^1", "version": "1.0.0"}}
            },
        },
        snapshots={"vitest@1.0.0": {}},
    )
    installed = parse_pnpm_lockfile_data(raw, importer_path="packages/pos")
    assert installed == []


def test_a_cycle_between_snapshots_does_not_loop_forever():
    raw = _lockfile(
        importers={
            ".": {"dependencies": {"a": {"specifier": "^1", "version": "1.0.0"}}}
        },
        snapshots={
            "a@1.0.0": {"dependencies": {"b": "1.0.0"}},
            "b@1.0.0": {"dependencies": {"a": "1.0.0"}},
        },
    )
    installed = parse_pnpm_lockfile_data(raw)
    names = {p.name for p in installed}
    assert names == {"a", "b"}


def test_a_cycle_through_a_workspace_link_does_not_loop_forever():
    raw = _lockfile(
        importers={
            "packages/a": {
                "dependencies": {"b": {"specifier": "workspace:*", "version": "link:../b"}}
            },
            "packages/b": {
                "dependencies": {"a": {"specifier": "workspace:*", "version": "link:../a"}}
            },
        },
        snapshots={},
    )
    installed = parse_pnpm_lockfile_data(raw, importer_path="packages/a")
    assert installed == []


def test_a_lockfile_version_other_than_9_is_refused_not_misread():
    raw = _lockfile(importers={".": {}}, snapshots={})
    raw["lockfileVersion"] = "6.0"
    with pytest.raises(UnsupportedPnpmLockfile):
        parse_pnpm_lockfile_data(raw)


def test_an_importer_path_absent_from_the_lockfile_is_refused():
    raw = _lockfile(importers={".": {}}, snapshots={})
    with pytest.raises(UnsupportedPnpmLockfile):
        parse_pnpm_lockfile_data(raw, importer_path="apps/nonexistent")


def test_importer_paths_lists_every_workspace_member_sorted():
    raw = _lockfile(
        importers={"apps/portal": {}, ".": {}, "apps/docs": {}}, snapshots={}
    )
    assert importer_paths(raw) == [".", "apps/docs", "apps/portal"]


def test_importer_paths_is_empty_for_a_malformed_importers_map():
    assert importer_paths({"importers": "not-a-map"}) == []


@pytest.mark.skipif(
    not RETAIL_PILOT_LOCKFILE.is_file(), reason="retail-pilot-intel lockfile not present"
)
@pytest.mark.parametrize("importer_path", ["apps/docs", "apps/portal"])
def test_the_real_retail_pilot_intel_lockfile_finds_react_in_each_app(importer_path):
    installed = parse_pnpm_lockfile(RETAIL_PILOT_LOCKFILE, importer_path=importer_path)
    assert installed, f"expected at least one component for {importer_path}"
    assert any(p.name == "react" for p in installed)
    # Every reachable snapshot resolved to a real name/version pair; none
    # silently fell through the peer-suffix or link: handling.
    assert all(p.name and p.version for p in installed)


@pytest.mark.skipif(
    not RETAIL_PILOT_LOCKFILE.is_file(), reason="retail-pilot-intel lockfile not present"
)
@pytest.mark.parametrize(
    "importer_path", ["packages/analytics", "packages/edge", "packages/pos"]
)
def test_the_real_retail_pilot_intel_lockfile_resolves_workspace_link_only_members(
    importer_path,
):
    # Each of these depends, in production, only on the local
    # `@retail-pilot/schemas` workspace member (version: link:../schemas),
    # which itself has no production dependencies of its own -- so zero
    # *production* components is the correct answer, not a sign the link
    # never resolved. Each still has its own devDependencies (typescript and
    # friends), which should come back dev=True rather than vanish.
    installed = parse_pnpm_lockfile(RETAIL_PILOT_LOCKFILE, importer_path=importer_path)
    assert installed, f"expected at least the devDependencies for {importer_path}"
    assert all(p.dev for p in installed)
