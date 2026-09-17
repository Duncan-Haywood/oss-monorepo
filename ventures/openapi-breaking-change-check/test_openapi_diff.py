import json
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import openapi_diff  # noqa: E402

OLD_SPEC = {
    "openapi": "3.0.3",
    "info": {"title": "Pets", "version": "1.0.0"},
    "paths": {
        "/pets": {
            "get": {
                "parameters": [
                    {"name": "limit", "in": "query", "required": False, "schema": {"type": "integer"}},
                ],
                "responses": {"200": {"description": "ok"}},
            },
            "post": {
                "requestBody": {"required": False, "content": {}},
                "responses": {"201": {"description": "created"}},
            },
        },
        "/pets/{id}": {
            "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}],
            "get": {"responses": {"200": {"description": "ok"}}},
            "delete": {"responses": {"204": {"description": "gone"}}},
        },
        "/pets/{id}/status": {
            "get": {
                "parameters": [
                    {"name": "state", "in": "query", "required": False, "schema": {"type": "string", "enum": ["active", "sold"]}},
                ],
                "responses": {"200": {"description": "ok"}},
            }
        },
    },
}

NEW_SPEC = {
    "openapi": "3.0.3",
    "info": {"title": "Pets", "version": "2.0.0"},
    "paths": {
        "/pets": {
            "get": {
                "parameters": [
                    {"name": "limit", "in": "query", "required": False, "schema": {"type": "integer"}},
                    {"name": "sort", "in": "query", "required": True, "schema": {"type": "string"}},
                ],
                "responses": {"200": {"description": "ok"}},
            },
            "post": {
                "requestBody": {"required": True, "content": {}},
                "responses": {"201": {"description": "created"}},
            },
        },
        # /pets/{id} DELETE removed entirely; GET's path-level "id" param type changed
        "/pets/{id}": {
            "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}],
            "get": {"responses": {"200": {"description": "ok"}}},
        },
        "/pets/{id}/status": {
            "get": {
                "parameters": [
                    {"name": "state", "in": "query", "required": False, "schema": {"type": "string", "enum": ["active", "sold", "pending"]}},
                ],
                "responses": {"200": {"description": "ok"}},
            }
        },
        "/pets/{id}/photos": {
            "get": {"responses": {"200": {"description": "ok"}}},
        },
    },
}

REF_SPEC = {
    "openapi": "3.1.0",
    "info": {"title": "Refs", "version": "1.0.0"},
    "paths": {
        "/widgets": {
            "get": {
                "parameters": [{"$ref": "#/components/parameters/PageSize"}],
                "responses": {"200": {"$ref": "#/components/responses/Ok"}},
            }
        }
    },
    "components": {
        "parameters": {
            "PageSize": {"name": "pageSize", "in": "query", "required": False, "schema": {"type": "integer"}},
        },
        "responses": {"Ok": {"description": "ok"}},
    },
}


class DetectFormatTests(unittest.TestCase):
    def test_accepts_openapi_30_and_31(self):
        self.assertTrue(openapi_diff.detect_format({"openapi": "3.0.3"})["supported"])
        self.assertTrue(openapi_diff.detect_format({"openapi": "3.1.0"})["supported"])

    def test_rejects_swagger_2(self):
        result = openapi_diff.detect_format({"swagger": "2.0"})
        self.assertFalse(result["supported"])
        self.assertIn("Swagger 2.0", result["reason"])

    def test_rejects_missing_version_field(self):
        result = openapi_diff.detect_format({"paths": {}})
        self.assertFalse(result["supported"])
        self.assertIn("no \"openapi\" field", result["reason"])

    def test_rejects_unknown_version(self):
        result = openapi_diff.detect_format({"openapi": "4.0.0"})
        self.assertFalse(result["supported"])
        self.assertIn("unrecognized", result["reason"])


class ParseOpenApiTests(unittest.TestCase):
    def test_rejects_invalid_json(self):
        with self.assertRaisesRegex(ValueError, "not valid JSON"):
            openapi_diff.parse_openapi("{not json", label="broken.json")

    def test_rejects_unsupported_document(self):
        with self.assertRaisesRegex(ValueError, "Swagger 2.0"):
            openapi_diff.parse_openapi(json.dumps({"swagger": "2.0", "paths": {}}), label="old.json")

    def test_extracts_operations_with_merged_path_and_op_params(self):
        _, ops = openapi_diff.parse_openapi(json.dumps(OLD_SPEC))
        self.assertIn("GET /pets", ops)
        self.assertIn("DELETE /pets/{id}", ops)
        # path-level "id" param is visible on the nested GET operation too
        self.assertIn("path:id", ops["GET /pets/{id}"]["parameters"])

    def test_resolves_local_refs_for_parameters(self):
        _, ops = openapi_diff.parse_openapi(json.dumps(REF_SPEC))
        param = ops["GET /widgets"]["parameters"]["query:pageSize"]
        self.assertEqual(param, {"name": "pageSize", "in": "query", "required": False, "type": "integer", "enum": None})


class DiffOperationsTests(unittest.TestCase):
    def setUp(self):
        _, self.old_ops = openapi_diff.parse_openapi(json.dumps(OLD_SPEC))
        _, self.new_ops = openapi_diff.parse_openapi(json.dumps(NEW_SPEC))
        self.diff = openapi_diff.diff_operations(self.old_ops, self.new_ops)

    def test_removed_operation_is_breaking(self):
        types = {(c["operation"], c["type"]) for c in self.diff["breaking"]}
        self.assertIn(("DELETE /pets/{id}", "removed-operation"), types)

    def test_added_operation_is_non_breaking(self):
        types = {(c["operation"], c["type"]) for c in self.diff["non_breaking"]}
        self.assertIn(("GET /pets/{id}/photos", "added-operation"), types)

    def test_new_required_param_is_breaking(self):
        match = [c for c in self.diff["breaking"] if c["type"] == "new-required-param" and c["operation"] == "GET /pets"]
        self.assertEqual(len(match), 1)
        self.assertEqual(match[0]["parameter"], "query:sort")

    def test_param_type_changed_is_breaking(self):
        match = [c for c in self.diff["breaking"] if c["type"] == "param-type-changed"]
        self.assertEqual(len(match), 1)
        self.assertEqual(match[0]["from"], "string")
        self.assertEqual(match[0]["to"], "integer")

    def test_removed_enum_value_is_breaking(self):
        match = [c for c in self.diff["breaking"] if c["type"] == "removed-enum-value"]
        # "active"/"sold" both survive in the new enum -- nothing removed here
        self.assertEqual(match, [])

    def test_added_enum_value_is_non_breaking(self):
        match = [c for c in self.diff["non_breaking"] if c["type"] == "added-enum-value"]
        self.assertEqual(len(match), 1)
        self.assertEqual(match[0]["values"], ["pending"])

    def test_request_body_now_required_is_breaking(self):
        match = [c for c in self.diff["breaking"] if c["type"] == "request-body-now-required"]
        self.assertEqual(len(match), 1)
        self.assertEqual(match[0]["operation"], "POST /pets")

    def test_has_breaking_change_true(self):
        self.assertTrue(openapi_diff.has_breaking_change(self.diff))

    def test_identical_documents_produce_no_changes(self):
        diff = openapi_diff.diff_operations(self.old_ops, self.old_ops)
        self.assertFalse(openapi_diff.has_breaking_change(diff))
        self.assertEqual(diff["breaking"], [])
        self.assertEqual(diff["non_breaking"], [])

    def test_removed_enum_value_detected_directly(self):
        old_ops = {"GET /x": {"parameters": {"query:s": {"name": "s", "in": "query", "required": False, "type": "string", "enum": ["a", "b"]}}, "request_body_required": None}}
        new_ops = {"GET /x": {"parameters": {"query:s": {"name": "s", "in": "query", "required": False, "type": "string", "enum": ["a"]}}, "request_body_required": None}}
        diff = openapi_diff.diff_operations(old_ops, new_ops)
        self.assertEqual(len(diff["breaking"]), 1)
        self.assertEqual(diff["breaking"][0]["type"], "removed-enum-value")
        self.assertEqual(diff["breaking"][0]["values"], ["b"])

    def test_render_text_reports_no_changes(self):
        text = openapi_diff.render_text({"breaking": [], "non_breaking": []})
        self.assertIn("No differences found", text)

    def test_render_text_lists_breaking_and_non_breaking(self):
        text = openapi_diff.render_text(self.diff)
        self.assertIn("Breaking changes", text)
        self.assertIn("Non-breaking changes", text)
        self.assertIn("breaking change(s) found", text)


class CliTests(unittest.TestCase):
    def _write(self, tmp_path, name, doc):
        path = tmp_path / name
        path.write_text(json.dumps(doc))
        return path

    def test_cli_json_output_and_exit_code(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            old = self._write(tmp_path, "old.json", OLD_SPEC)
            new = self._write(tmp_path, "new.json", NEW_SPEC)

            result = subprocess.run(
                [sys.executable, str(Path(__file__).parent / "openapi_diff.py"), str(old), str(new), "--format", "json"],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0)
            payload = json.loads(result.stdout)
            self.assertTrue(any(c["type"] == "removed-operation" for c in payload["breaking"]))

            fail_result = subprocess.run(
                [sys.executable, str(Path(__file__).parent / "openapi_diff.py"), str(old), str(new), "--fail-on-breaking"],
                capture_output=True,
                text=True,
            )
            self.assertEqual(fail_result.returncode, 2)

    def test_cli_no_breaking_change_exits_zero_even_with_fail_flag(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            same = self._write(tmp_path, "same.json", OLD_SPEC)

            result = subprocess.run(
                [sys.executable, str(Path(__file__).parent / "openapi_diff.py"), str(same), str(same), "--fail-on-breaking"],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0)

    def test_cli_reports_unreadable_file(self):
        result = subprocess.run(
            [sys.executable, str(Path(__file__).parent / "openapi_diff.py"), "/nonexistent/old.json", "/nonexistent/new.json"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("error:", result.stderr)

    def test_cli_reports_unsupported_swagger_document(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            swagger = self._write(tmp_path, "swagger.json", {"swagger": "2.0", "paths": {}})
            same = self._write(tmp_path, "same.json", OLD_SPEC)
            result = subprocess.run(
                [sys.executable, str(Path(__file__).parent / "openapi_diff.py"), str(swagger), str(same)],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("Swagger 2.0", result.stderr)


if __name__ == "__main__":
    unittest.main()
