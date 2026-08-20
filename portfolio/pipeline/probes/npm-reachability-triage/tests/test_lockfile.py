import pytest

from triage.lockfile import UnsupportedLockfile, parse_lockfile_data


def _lock(packages, version=3):
    return {"lockfileVersion": version, "packages": packages}


class TestParsing:
    def test_extracts_name_version_and_dev_flag(self):
        installed = parse_lockfile_data(
            _lock({"node_modules/next": {"version": "14.2.0", "dev": False}})
        )
        assert len(installed) == 1
        assert installed[0].name == "next"
        assert installed[0].version == "14.2.0"
        assert installed[0].is_production

    def test_handles_scoped_packages(self):
        installed = parse_lockfile_data(
            _lock({"node_modules/@scope/pkg": {"version": "1.0.0"}})
        )
        assert installed[0].name == "@scope/pkg"

    def test_nested_install_resolves_to_the_inner_name(self):
        installed = parse_lockfile_data(
            _lock({"node_modules/a/node_modules/@scope/b": {"version": "2.0.0"}})
        )
        assert installed[0].name == "@scope/b"

    def test_skips_the_root_project_entry(self):
        installed = parse_lockfile_data(
            _lock({"": {"name": "root", "version": "1.0.0"}})
        )
        assert installed == []

    def test_skips_workspace_entries(self):
        # A workspace path carries no node_modules segment and is first-party.
        installed = parse_lockfile_data(
            _lock({"packages/web": {"version": "1.0.0"}})
        )
        assert installed == []

    def test_skips_entries_without_a_version(self):
        installed = parse_lockfile_data(
            _lock({"node_modules/linked": {"resolved": "packages/linked", "link": True}})
        )
        assert installed == []

    def test_devoptional_is_not_treated_as_dev_only(self):
        # devOptional means reachable from an optional production path too, so
        # the package can ship and must not be suppressed.
        installed = parse_lockfile_data(
            _lock({"node_modules/x": {"version": "1.0.0", "devOptional": True}})
        )
        assert installed[0].is_production

    def test_keeps_duplicate_installs_separate(self):
        # The measured glob case: same package, two versions, two paths.
        installed = parse_lockfile_data(
            _lock(
                {
                    "node_modules/glob": {"version": "7.2.3"},
                    "node_modules/rimraf/node_modules/glob": {
                        "version": "10.3.10",
                        "dev": True,
                    },
                }
            )
        )
        assert len(installed) == 2
        assert {p.version for p in installed} == {"7.2.3", "10.3.10"}
        assert {p.path for p in installed} == {
            "node_modules/glob",
            "node_modules/rimraf/node_modules/glob",
        }


class TestUnsupported:
    @pytest.mark.parametrize("version", [1, None, "3"])
    def test_rejects_lockfiles_without_a_packages_map(self, version):
        with pytest.raises(UnsupportedLockfile):
            parse_lockfile_data({"lockfileVersion": version, "dependencies": {}})

    def test_rejects_missing_packages_map(self):
        with pytest.raises(UnsupportedLockfile):
            parse_lockfile_data({"lockfileVersion": 3})
