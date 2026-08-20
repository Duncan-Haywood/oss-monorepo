from triage import deployment
from triage.deployment import SERVER, STATIC_EXPORT, UNKNOWN, detect, detect_from_source


class TestStaticExport:
    def test_detects_the_measured_static_export_config(self):
        # The exact shape that split the sample in the source measurement.
        source = """
        const nextConfig = {
          output: "export",
          images: { unoptimized: true },
        };
        module.exports = nextConfig;
        """
        profile = detect_from_source(source)
        assert profile.mode == STATIC_EXPORT
        assert profile.confidence == "high"
        assert profile.ships_server_runtime is False
        assert any("unoptimized" in item for item in profile.evidence)

    def test_accepts_single_quotes(self):
        profile = detect_from_source("module.exports = { output: 'export' }")
        assert profile.mode == STATIC_EXPORT

    def test_export_without_unoptimized_still_detected(self):
        profile = detect_from_source('module.exports = { output: "export" }')
        assert profile.mode == STATIC_EXPORT
        assert len(profile.evidence) == 1


class TestServer:
    def test_no_output_key_is_the_server_default(self):
        profile = detect_from_source("module.exports = { reactStrictMode: true }")
        assert profile.mode == SERVER
        assert profile.ships_server_runtime is True

    def test_standalone_output_is_a_server_build(self):
        profile = detect_from_source('module.exports = { output: "standalone" }')
        assert profile.mode == SERVER
        assert profile.confidence == "high"


class TestUncertainty:
    def test_non_literal_output_is_undetermined(self):
        # A value this tool cannot read must not resolve to either answer.
        source = 'module.exports = { output: process.env.STATIC ? "export" : undefined }'
        profile = detect_from_source(source)
        assert profile.mode == UNKNOWN
        assert profile.ships_server_runtime is None

    def test_commented_out_directive_is_ignored(self):
        source = """
        // output: "export",
        /* output: "export" */
        module.exports = { reactStrictMode: true };
        """
        profile = detect_from_source(source)
        assert profile.mode == SERVER

    def test_commented_directive_does_not_create_a_false_export(self):
        source = '/* we used to set output: "export" here */\nmodule.exports = {}'
        assert detect_from_source(source).mode == SERVER


class TestDetectOnDisk:
    def test_missing_config_is_undetermined(self, tmp_path):
        profile = detect(tmp_path)
        assert profile.mode == UNKNOWN
        assert profile.config_path is None

    def test_reads_the_first_matching_config_name(self, tmp_path):
        (tmp_path / "next.config.js").write_text('module.exports={output:"export"}')
        profile = detect(tmp_path)
        assert profile.mode == STATIC_EXPORT
        assert profile.config_path.endswith("next.config.js")

    def test_finds_mjs_config(self, tmp_path):
        (tmp_path / "next.config.mjs").write_text('export default {output:"export"}')
        assert detect(tmp_path).mode == STATIC_EXPORT

    def test_config_resolution_order_matches_next(self, tmp_path):
        assert deployment.CONFIG_FILENAMES[0] == "next.config.js"
