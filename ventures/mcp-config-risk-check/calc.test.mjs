import test from "node:test";
import assert from "node:assert/strict";
import {
  parseConfig,
  checkBroadAccess,
  checkHardcodedSecrets,
  checkVersionPin,
  checkDuplicateTools,
  auditConfig,
  summaryText,
} from "./calc.mjs";

// ---- parseConfig ---------------------------------------------------------

test("parses the Claude Desktop / Claude Code mcpServers shape", () => {
  const servers = parseConfig(JSON.stringify({
    mcpServers: { inventory: { command: "npx", args: ["-y", "inventory-mcp"] } },
  }));
  assert.equal(servers.length, 1);
  assert.equal(servers[0].name, "inventory");
  assert.equal(servers[0].command, "npx");
  assert.deepEqual(servers[0].args, ["-y", "inventory-mcp"]);
});

test("parses the VS Code servers shape", () => {
  const servers = parseConfig(JSON.stringify({ servers: { foo: { command: "uvx", args: ["foo-mcp"] } } }));
  assert.equal(servers[0].name, "foo");
});

test("parses a bare object with no wrapper key", () => {
  const servers = parseConfig(JSON.stringify({ foo: { command: "node", args: ["server.js"] } }));
  assert.equal(servers[0].name, "foo");
});

test("parses an array of entries, including an optional tools list", () => {
  const servers = parseConfig(JSON.stringify([
    { name: "a", command: "npx", args: ["-y", "a-mcp@1.0.0"], tools: [{ name: "search" }] },
  ]));
  assert.equal(servers[0].name, "a");
  assert.deepEqual(servers[0].tools, [{ name: "search" }]);
});

test("rejects invalid JSON with a clear message", () => {
  assert.throws(() => parseConfig("{not json"), /Not valid JSON/);
});

test("rejects a JSON value that is neither object nor array", () => {
  assert.throws(() => parseConfig("42"), /object or array/);
});

test("rejects an empty server map", () => {
  assert.throws(() => parseConfig(JSON.stringify({ mcpServers: {} })), /No server entries/);
});

test("normalizes missing command/args/env/tools to safe defaults", () => {
  const servers = parseConfig(JSON.stringify({ mcpServers: { bare: {} } }));
  assert.equal(servers[0].command, null);
  assert.deepEqual(servers[0].args, []);
  assert.deepEqual(servers[0].env, {});
  assert.deepEqual(servers[0].tools, []);
});

// ---- checkBroadAccess -----------------------------------------------------

test("flags a shell interpreter launched directly", () => {
  const findings = checkBroadAccess({ name: "shell", command: "bash", args: ["-c", "echo hi"] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "high");
  assert.match(findings[0].detail, /arbitrary shell commands/);
});

test("is case-insensitive on the shell command name", () => {
  const findings = checkBroadAccess({ name: "s", command: "PowerShell.exe", args: [] });
  assert.equal(findings.length, 1);
});

test("flags a root or home directory argument", () => {
  const findings = checkBroadAccess({ name: "fs", command: "npx", args: ["-y", "server-filesystem", "/"] });
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /whole filesystem/);
});

test("flags a known broad-permission flag", () => {
  const findings = checkBroadAccess({ name: "risky", command: "npx", args: ["server", "--dangerously-skip-permissions"] });
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /broad-permission flag/);
});

test("does not flag a normally-scoped filesystem server", () => {
  const findings = checkBroadAccess({ name: "fs", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem@1.2.0", "/home/user/projects/my-repo"] });
  assert.equal(findings.length, 0);
});

test("does not flag an ordinary node/npx launcher with no risky signal", () => {
  const findings = checkBroadAccess({ name: "ok", command: "node", args: ["server.js"] });
  assert.equal(findings.length, 0);
});

// ---- checkHardcodedSecrets ------------------------------------------------

test("flags an env value matching a known token shape, regardless of key name", () => {
  const findings = checkHardcodedSecrets({ name: "s", env: { SOME_VALUE: "sk-abcdefghijklmnop" }, headers: {}, args: [] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "high");
  assert.match(findings[0].detail, /OpenAI\/Anthropic-style secret key/);
});

test("flags a GitHub token shape in a header", () => {
  const findings = checkHardcodedSecrets({ name: "s", env: {}, headers: { Authorization: "ghp_abcdefghijklmnopqrstu" }, args: [] });
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /GitHub token/);
});

test("flags a bearer token shape", () => {
  const findings = checkHardcodedSecrets({ name: "s", env: {}, headers: { Authorization: "Bearer abcdefghijklmnop12345" }, args: [] });
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /bearer token/);
});

test("flags a secret-named env key holding a plain literal", () => {
  const findings = checkHardcodedSecrets({ name: "s", env: { API_KEY: "some-plain-literal-value" }, headers: {}, args: [] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "medium");
  assert.match(findings[0].detail, /environment-variable reference/);
});

test("does not flag a secret-named env key that references an environment variable", () => {
  const findings = checkHardcodedSecrets({ name: "s", env: { API_KEY: "${MY_API_KEY}", TOKEN2: "$OTHER_TOKEN" }, headers: {}, args: [] });
  assert.equal(findings.length, 0);
});

test("does not flag a non-secret-named env key with an ordinary literal", () => {
  const findings = checkHardcodedSecrets({ name: "s", env: { LOG_LEVEL: "debug" }, headers: {}, args: [] });
  assert.equal(findings.length, 0);
});

test("flags a token-shaped literal in a launch argument", () => {
  const findings = checkHardcodedSecrets({ name: "s", env: {}, headers: {}, args: ["--api-key=sk-abcdefghijklmnop"] });
  assert.equal(findings.length, 1);
});

test("one finding per value even if it happens to be scanned from multiple pattern candidates", () => {
  const findings = checkHardcodedSecrets({ name: "s", env: { TOKEN: "sk-abcdefghijklmnop" }, headers: {}, args: [] });
  assert.equal(findings.length, 1);
});

// ---- checkVersionPin -------------------------------------------------------

test("flags an unpinned npx package", () => {
  const findings = checkVersionPin({ name: "s", command: "npx", args: ["-y", "some-mcp-server"] });
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /no "@version" pin/);
});

test("does not flag a pinned unscoped npx package", () => {
  const findings = checkVersionPin({ name: "s", command: "npx", args: ["-y", "some-mcp-server@2.1.0"] });
  assert.equal(findings.length, 0);
});

test("flags an unpinned scoped npx package (a bare @ is the scope, not a version)", () => {
  const findings = checkVersionPin({ name: "s", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"] });
  assert.equal(findings.length, 1);
});

test("does not flag a pinned scoped npx package", () => {
  const findings = checkVersionPin({ name: "s", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem@1.2.0"] });
  assert.equal(findings.length, 0);
});

test("flags an unpinned uvx package", () => {
  const findings = checkVersionPin({ name: "s", command: "uvx", args: ["some-mcp-server"] });
  assert.equal(findings.length, 1);
});

test("does not flag a version-pinned uvx package", () => {
  const findings = checkVersionPin({ name: "s", command: "uvx", args: ["some-mcp-server==1.4.0"] });
  assert.equal(findings.length, 0);
});

test("flags an unpinned pipx run package", () => {
  const findings = checkVersionPin({ name: "s", command: "pipx", args: ["run", "some-mcp-server"] });
  assert.equal(findings.length, 1);
});

test("does not flag a version-pinned pipx run package", () => {
  const findings = checkVersionPin({ name: "s", command: "pipx", args: ["run", "some-mcp-server==1.4.0"] });
  assert.equal(findings.length, 0);
});

test("flags a docker image with no tag", () => {
  const findings = checkVersionPin({ name: "s", command: "docker", args: ["run", "-i", "--rm", "some/mcp-image"] });
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /no tag/);
});

test("flags a docker image explicitly pinned to latest", () => {
  const findings = checkVersionPin({ name: "s", command: "docker", args: ["run", "some/mcp-image:latest"] });
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /"latest"/);
});

test("does not flag a docker image pinned to a real tag, skipping value-taking flags", () => {
  const findings = checkVersionPin({ name: "s", command: "docker", args: ["run", "-e", "FOO=bar", "--rm", "some/mcp-image:1.4.0"] });
  assert.equal(findings.length, 0);
});

test("does not flag a command it has no rule for", () => {
  const findings = checkVersionPin({ name: "s", command: "node", args: ["server.js"] });
  assert.equal(findings.length, 0);
});

test("does not flag a remote server with no command at all", () => {
  const findings = checkVersionPin({ name: "s", command: null, args: [] });
  assert.equal(findings.length, 0);
});

// ---- checkDuplicateTools ---------------------------------------------------

test("flags a tool name exposed by more than one server", () => {
  const servers = [
    { name: "a", tools: [{ name: "search" }, { name: "fetch" }] },
    { name: "b", tools: [{ name: "search" }] },
  ];
  const findings = checkDuplicateTools(servers);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].category, "duplicate-tool-name");
  assert.match(findings[0].detail, /"search"/);
  assert.match(findings[0].detail, /a, b/);
});

test("does not flag distinct tool names across servers", () => {
  const servers = [{ name: "a", tools: [{ name: "search" }] }, { name: "b", tools: [{ name: "fetch" }] }];
  assert.equal(checkDuplicateTools(servers).length, 0);
});

test("is silent when no server carries a tools list", () => {
  const servers = [{ name: "a", tools: [] }, { name: "b", tools: [] }];
  assert.equal(checkDuplicateTools(servers).length, 0);
});

test("accepts a bare string tools list as well as {name} objects", () => {
  const servers = [{ name: "a", tools: ["search"] }, { name: "b", tools: ["search"] }];
  assert.equal(checkDuplicateTools(servers).length, 1);
});

// ---- auditConfig / summaryText --------------------------------------------

test("auditConfig runs every check and sorts findings by category then severity", () => {
  const servers = parseConfig(JSON.stringify({
    mcpServers: {
      shell: { command: "bash", args: ["-c", "true"] },
      unpinned: { command: "npx", args: ["-y", "some-mcp"] },
      leaky: { command: "node", args: ["s.js"], env: { API_KEY: "sk-abcdefghijklmnop" } },
    },
  }));
  const result = auditConfig(servers);
  assert.equal(result.findings.length, 3);
  assert.deepEqual(result.findings.map((f) => f.category), ["broad-access", "hardcoded-secret", "unpinned-version"]);
  assert.equal(result.counts.high, 2);
  assert.equal(result.counts.medium, 1);
});

test("auditConfig requires at least one server", () => {
  assert.throws(() => auditConfig([]), /At least one server/);
});

test("summaryText reports a clean config honestly, without claiming safety", () => {
  const servers = parseConfig(JSON.stringify({ mcpServers: { clean: { command: "node", args: ["s.js"] } } }));
  const text = summaryText(auditConfig(servers));
  assert.match(text, /No structural risk patterns observed/);
  assert.match(text, /not a claim that the config is safe/);
});

test("summaryText lists every finding with its severity and server", () => {
  const servers = parseConfig(JSON.stringify({ mcpServers: { shell: { command: "bash", args: [] } } }));
  const text = summaryText(auditConfig(servers));
  assert.match(text, /\[HIGH\] shell -- broad-access/);
  assert.match(text, /not a security audit/);
});

// ---- end-to-end on a realistic mixed config -------------------------------

test("end to end: a realistic config with one clean server and several risky ones", () => {
  const config = {
    mcpServers: {
      "github": { command: "npx", args: ["-y", "@modelcontextprotocol/server-github@1.0.3"], env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" } },
      "shell-runner": { command: "bash", args: ["-c", "$CMD"] },
      "inventory": { command: "npx", args: ["-y", "inventory-mcp"], env: { API_KEY: "sk-liveabcdefghijklmno" } },
      "files": { command: "npx", args: ["-y", "server-filesystem", "/"] },
    },
  };
  const servers = parseConfig(JSON.stringify(config));
  const result = auditConfig(servers);
  const categories = new Set(result.findings.map((f) => f.category));
  assert.ok(categories.has("broad-access"));
  assert.ok(categories.has("hardcoded-secret"));
  assert.ok(categories.has("unpinned-version"));
  const githubFindings = result.findings.filter((f) => f.serverName === "github");
  assert.equal(githubFindings.length, 0, "a pinned, env-referenced, non-shell server should have zero findings");
});
