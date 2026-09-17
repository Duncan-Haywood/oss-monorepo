#!/usr/bin/env python3
"""Tests for check.py.

Most of these pin the boundary the tool exists to draw: an ENV with a
secret-looking name is always flagged (it is unconditionally baked into the
image config), an ARG with a literal default is flagged as committed to the
Dockerfile, a bare ARG declaration is advisory only, and a handful of
well-known credential filenames are flagged when copied into the build.
"""

import io
import json
import os
import tempfile
import unittest
import unittest.mock

import check as dbs


class LooksSecret(unittest.TestCase):
    def test_plain_secret_name(self):
        self.assertTrue(dbs.looks_secret("SECRET"))

    def test_snake_case_password(self):
        self.assertTrue(dbs.looks_secret("DB_PASSWORD"))

    def test_camel_case_api_key(self):
        self.assertTrue(dbs.looks_secret("myApiKey"))

    def test_kebab_case_client_secret(self):
        self.assertTrue(dbs.looks_secret("oauth-client-secret"))

    def test_unrelated_name_is_not_secret(self):
        self.assertFalse(dbs.looks_secret("NODE_VERSION"))

    def test_username_is_not_secret(self):
        # "auth" as a substring of "AUTHOR"/similar must not false-positive;
        # USER_NAME normalises to USERNAME, which contains none of the
        # tracked substrings.
        self.assertFalse(dbs.looks_secret("USER_NAME"))

    def test_author_is_not_secret(self):
        self.assertFalse(dbs.looks_secret("AUTHOR"))


class ParseEnvPairs(unittest.TestCase):
    def test_single_modern_pair(self):
        self.assertEqual(dbs.parse_env_pairs("API_KEY=abc123"), [("API_KEY", "abc123")])

    def test_multiple_modern_pairs(self):
        self.assertEqual(
            dbs.parse_env_pairs("NODE_ENV=production API_KEY=abc123"),
            [("NODE_ENV", "production"), ("API_KEY", "abc123")],
        )

    def test_quoted_value(self):
        self.assertEqual(dbs.parse_env_pairs('API_KEY="abc 123"'), [("API_KEY", "abc 123")])

    def test_legacy_single_pair_form(self):
        self.assertEqual(dbs.parse_env_pairs("PATH /usr/local/bin:/usr/bin"), [("PATH", "/usr/local/bin:/usr/bin")])

    def test_legacy_form_with_no_value(self):
        self.assertEqual(dbs.parse_env_pairs("FOO"), [("FOO", "")])


class ParseArg(unittest.TestCase):
    def test_no_default(self):
        name, default = dbs.parse_arg("API_TOKEN")
        self.assertEqual(name, "API_TOKEN")
        self.assertIsNone(default)

    def test_literal_default(self):
        name, default = dbs.parse_arg("API_TOKEN=abc123")
        self.assertEqual(name, "API_TOKEN")
        self.assertEqual(default, "abc123")

    def test_quoted_default(self):
        name, default = dbs.parse_arg('API_TOKEN="abc 123"')
        self.assertEqual(default, "abc 123")

    def test_empty_default_is_not_none(self):
        # `ARG FOO=` explicitly assigns an empty string -- distinct from
        # `ARG FOO` (no `=` at all), even though both currently produce no
        # finding (an empty value has nothing to leak).
        name, default = dbs.parse_arg("FOO=")
        self.assertEqual(name, "FOO")
        self.assertEqual(default, "")


class ScanTextEnv(unittest.TestCase):
    def test_env_secret_name_is_flagged(self):
        findings = dbs.scan_text("FROM node:18\nENV API_KEY=abc123\n")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["classification"], dbs.ENV_SECRET)
        self.assertEqual(findings[0]["name"], "API_KEY")
        self.assertEqual(findings[0]["line"], 2)

    def test_env_secret_from_arg_interpolation_is_flagged(self):
        # The resolved value is baked in regardless of where it came from.
        findings = dbs.scan_text("ARG TOKEN\nENV TOKEN=$TOKEN\n")
        env_findings = [f for f in findings if f["instruction"] == "ENV"]
        self.assertEqual(len(env_findings), 1)
        self.assertEqual(env_findings[0]["classification"], dbs.ENV_SECRET)

    def test_env_non_secret_name_is_not_flagged(self):
        findings = dbs.scan_text("ENV NODE_ENV=production\n")
        self.assertEqual(findings, [])

    def test_env_secret_name_with_empty_value_is_not_flagged(self):
        findings = dbs.scan_text("ENV API_KEY=\n")
        self.assertEqual(findings, [])

    def test_multiple_env_pairs_on_one_line(self):
        findings = dbs.scan_text("ENV NODE_ENV=production DB_PASSWORD=hunter2\n")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["name"], "DB_PASSWORD")


class ScanTextArg(unittest.TestCase):
    def test_arg_literal_default_is_flagged(self):
        findings = dbs.scan_text("ARG API_KEY=abc123\n")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["classification"], dbs.ARG_LITERAL)

    def test_arg_declared_with_no_default_is_advisory(self):
        findings = dbs.scan_text("ARG API_KEY\n")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["classification"], dbs.ARG_DECLARED)

    def test_arg_non_secret_name_is_not_flagged(self):
        findings = dbs.scan_text("ARG NODE_VERSION=18\n")
        self.assertEqual(findings, [])


class ScanTextCopyAdd(unittest.TestCase):
    def test_copy_dotenv_is_flagged(self):
        findings = dbs.scan_text("COPY .env /app/.env\n")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["classification"], dbs.SENSITIVE_COPY)
        self.assertEqual(findings[0]["instruction"], "COPY")

    def test_add_id_rsa_is_flagged(self):
        findings = dbs.scan_text("ADD id_rsa /root/.ssh/id_rsa\n")
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["classification"], dbs.SENSITIVE_COPY)

    def test_copy_pem_file_is_flagged(self):
        findings = dbs.scan_text("COPY certs/server.pem /app/server.pem\n")
        self.assertEqual(len(findings), 1)

    def test_copy_npmrc_is_flagged(self):
        findings = dbs.scan_text("COPY .npmrc /app/.npmrc\n")
        self.assertEqual(len(findings), 1)

    def test_copy_aws_credentials_path_fragment_is_flagged(self):
        findings = dbs.scan_text("COPY secrets/.aws/credentials /root/.aws/credentials\n")
        self.assertEqual(len(findings), 1)

    def test_copy_ordinary_source_is_not_flagged(self):
        findings = dbs.scan_text("COPY package.json ./package.json\n")
        self.assertEqual(findings, [])

    def test_copy_dest_only_is_ignored(self):
        # Fewer than two tokens after stripping flags -- malformed, not this
        # tool's job to validate Dockerfile syntax.
        findings = dbs.scan_text("COPY .env\n")
        self.assertEqual(findings, [])

    def test_copy_with_chown_flag_is_tolerated(self):
        findings = dbs.scan_text("COPY --chown=node:node .env /app/.env\n")
        self.assertEqual(len(findings), 1)

    def test_copy_json_array_form_is_supported(self):
        findings = dbs.scan_text('COPY ["id_rsa", "package.json", "/app/"]\n')
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["name"], "id_rsa")

    def test_multiple_sources_all_checked(self):
        findings = dbs.scan_text("COPY .env id_rsa package.json /app/\n")
        names = {f["name"] for f in findings}
        self.assertEqual(names, {".env", "id_rsa"})


class ScanTextGeneral(unittest.TestCase):
    def test_commented_line_is_ignored(self):
        findings = dbs.scan_text("# ENV API_KEY=abc123\nENV FOO=bar\n")
        self.assertEqual(findings, [])

    def test_backslash_continued_env_line_is_joined(self):
        text = "ENV NODE_ENV=production \\\n    API_KEY=abc123\n"
        findings = dbs.scan_text(text)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["name"], "API_KEY")
        self.assertEqual(findings[0]["line"], 1)

    def test_line_numbers_track_logical_lines_after_join(self):
        text = "FROM node:18\n\nENV API_KEY=abc123\n"
        findings = dbs.scan_text(text)
        self.assertEqual(findings[0]["line"], 3)

    def test_instruction_is_case_insensitive(self):
        findings = dbs.scan_text("env API_KEY=abc123\n")
        self.assertEqual(len(findings), 1)


class DiscoverDockerfiles(unittest.TestCase):
    def test_finds_dockerfile_and_variants(self):
        with tempfile.TemporaryDirectory() as tmp:
            open(os.path.join(tmp, "Dockerfile"), "w").close()
            open(os.path.join(tmp, "Dockerfile.prod"), "w").close()
            open(os.path.join(tmp, "worker.dockerfile"), "w").close()
            open(os.path.join(tmp, "notes.txt"), "w").close()
            files = dbs.discover_dockerfiles(tmp)
            names = sorted(os.path.basename(f) for f in files)
            self.assertEqual(names, ["Dockerfile", "Dockerfile.prod", "worker.dockerfile"])

    def test_skips_git_and_node_modules(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.makedirs(os.path.join(tmp, ".git"))
            open(os.path.join(tmp, ".git", "Dockerfile"), "w").close()
            os.makedirs(os.path.join(tmp, "node_modules", "some-pkg"))
            open(os.path.join(tmp, "node_modules", "some-pkg", "Dockerfile"), "w").close()
            open(os.path.join(tmp, "Dockerfile"), "w").close()
            files = dbs.discover_dockerfiles(tmp)
            self.assertEqual(len(files), 1)


class HasUnresolvedRisk(unittest.TestCase):
    def test_true_for_env_secret(self):
        self.assertTrue(dbs.has_unresolved_risk([{"classification": dbs.ENV_SECRET}]))

    def test_true_for_sensitive_copy(self):
        self.assertTrue(dbs.has_unresolved_risk([{"classification": dbs.SENSITIVE_COPY}]))

    def test_false_for_advisory_only(self):
        self.assertFalse(dbs.has_unresolved_risk([{"classification": dbs.ARG_DECLARED}]))

    def test_false_on_empty(self):
        self.assertFalse(dbs.has_unresolved_risk([]))


class Main(unittest.TestCase):
    def run_main(self, argv):
        buf = io.StringIO()
        with unittest.mock.patch("sys.stdout", buf):
            code = dbs.main(argv)
        return code, buf.getvalue()

    def make_repo(self, tmp, text, name="Dockerfile"):
        with open(os.path.join(tmp, name), "w", encoding="utf-8") as handle:
            handle.write(text)

    def test_clean_repo_exits_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "FROM node:18\nENV NODE_ENV=production\n")
            code, out = self.run_main([tmp])
            self.assertEqual(code, 0)
            self.assertIn("no secret-looking findings", out)

    def test_risky_repo_exits_zero_without_fail_on_risk(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "ENV API_KEY=abc123\n")
            code, out = self.run_main([tmp])
            self.assertEqual(code, 0)
            self.assertIn("high-risk finding", out)

    def test_risky_repo_with_fail_on_risk_exits_two(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "ENV API_KEY=abc123\n")
            code, _ = self.run_main([tmp, "--fail-on-risk"])
            self.assertEqual(code, 2)

    def test_advisory_only_repo_with_fail_on_risk_exits_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "ARG API_KEY\n")
            code, _ = self.run_main([tmp, "--fail-on-risk"])
            self.assertEqual(code, 0)

    def test_json_output_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_repo(tmp, "ENV API_KEY=abc123\n")
            code, out = self.run_main([tmp, "--format", "json"])
            self.assertEqual(code, 0)
            data = json.loads(out)
            self.assertEqual(len(data), 1)
            self.assertEqual(
                set(data[0]),
                {"file", "line", "instruction", "name", "classification", "remediation"},
            )
            self.assertEqual(data[0]["classification"], "env-secret")

    def test_no_dockerfiles_reports_clearly(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, out = self.run_main([tmp])
            self.assertEqual(code, 0)
            self.assertIn("No Dockerfile", out)

    def test_default_path_is_current_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            cwd = os.getcwd()
            try:
                os.chdir(tmp)
                code, _ = self.run_main([])
                self.assertEqual(code, 0)
            finally:
                os.chdir(cwd)


if __name__ == "__main__":
    unittest.main()
