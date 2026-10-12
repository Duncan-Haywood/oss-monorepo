import test from "node:test";
import assert from "node:assert/strict";
import {
  parseConfig,
  isBashAllowAllRule,
  findBashAllowAll,
  findUnscopedRiskyAllows,
  findInsecureMcpUrls,
  findHardcodedSecrets,
  hasNoDenyRules,
  analyze,
} from "./engine.mjs";

test("parseConfig reads permissions.allow/deny/ask under a settings.json wrapper", () => {
  const { allow, deny, ask } = parseConfig(JSON.stringify({
    permissions: { allow: ["Bash(npm test:*)"], deny: ["Bash(rm:*)"], ask: ["Bash(git push:*)"] },
  }));
  assert.deepEqual(allow, ["Bash(npm test:*)"]);
  assert.deepEqual(deny, ["Bash(rm:*)"]);
  assert.deepEqual(ask, ["Bash(git push:*)"]);
});

test("parseConfig also accepts a bare {allow,deny,ask} object with no wrapper", () => {
  const { allow } = parseConfig(JSON.stringify({ allow: ["Bash"], deny: [] }));
  assert.deepEqual(allow, ["Bash"]);
});

test("parseConfig reads mcpServers regardless of which permission shape is present", () => {
  const { servers } = parseConfig(JSON.stringify({
    mcpServers: { local: { command: "node", args: ["s.js"], env: { KEY: "${MY_KEY}" } } },
  }));
  assert.equal(servers.length, 1);
  assert.equal(servers[0].name, "local");
  assert.equal(servers[0].command, "node");
});

test("parseConfig rejects a non-object top level", () => {
  assert.throws(() => parseConfig("[1,2,3]"));
  assert.throws(() => parseConfig('"just a string"'));
});

test("parseConfig throws on invalid JSON (caller's job to catch)", () => {
  assert.throws(() => parseConfig("{not json"));
});

test("isBashAllowAllRule matches bare Bash and Bash(*) but not a scoped rule", () => {
  assert.equal(isBashAllowAllRule("Bash"), true);
  assert.equal(isBashAllowAllRule("Bash(*)"), true);
  assert.equal(isBashAllowAllRule("Bash(*:*)"), true);
  assert.equal(isBashAllowAllRule("Bash(npm run build:*)"), false);
  assert.equal(isBashAllowAllRule("Read(~/.zshrc)"), false);
});

test("findBashAllowAll finds only the allow-all entries", () => {
  const allow = ["Bash(npm test:*)", "Bash", "Read(*)"];
  assert.deepEqual(findBashAllowAll(allow), ["Bash"]);
});

test("findUnscopedRiskyAllows flags an unscoped risky command and reports deny coverage", () => {
  const allow = ["Bash(rm:*)", "Bash(sudo)", "Bash(git diff:*)"];
  const deny = ["Bash(sudo:*)"];
  const found = findUnscopedRiskyAllows(allow, deny);
  assert.equal(found.length, 2);
  const rm = found.find((f) => f.command === "rm");
  const sudo = found.find((f) => f.command === "sudo");
  assert.equal(rm.guardedByDeny, false);
  assert.equal(sudo.guardedByDeny, true);
});

test("findUnscopedRiskyAllows does not flag a narrowly scoped risky command", () => {
  const found = findUnscopedRiskyAllows(["Bash(rm:./build/*)"], []);
  assert.equal(found.length, 0);
});

test("findInsecureMcpUrls flags http:// but not https://", () => {
  const servers = [
    { name: "a", url: "http://example.com/mcp" },
    { name: "b", url: "https://example.com/mcp" },
    { name: "c", url: null },
  ];
  const found = findInsecureMcpUrls(servers);
  assert.equal(found.length, 1);
  assert.equal(found[0].name, "a");
});

test("findHardcodedSecrets flags a known-prefix literal at high confidence", () => {
  const servers = [{ name: "s", env: { ANTHROPIC_API_KEY: "sk-ant-api03-" + "x".repeat(40) }, headers: {} }];
  const found = findHardcodedSecrets(servers);
  assert.equal(found.length, 1);
  assert.equal(found[0].confidence, "high");
  assert.equal(found[0].kind, "env");
});

test("findHardcodedSecrets flags a Bearer-scheme header literal at high confidence", () => {
  const servers = [{ name: "s", env: {}, headers: { Authorization: "Bearer sk-ant-api03-" + "y".repeat(40) } }];
  const found = findHardcodedSecrets(servers);
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "header");
});

test("findHardcodedSecrets does not flag an env-var reference", () => {
  const servers = [{
    name: "s",
    env: { KEY: "${MY_KEY}" },
    headers: { Authorization: "Bearer ${TOKEN}" },
  }];
  assert.deepEqual(findHardcodedSecrets(servers), []);
});

test("findHardcodedSecrets does not flag an ordinary short/plain value", () => {
  const servers = [{ name: "s", env: { LOG_LEVEL: "debug", PORT: "3000" }, headers: {} }];
  assert.deepEqual(findHardcodedSecrets(servers), []);
});

test("findHardcodedSecrets flags a long unrecognised literal at medium confidence", () => {
  const servers = [{ name: "s", env: { SECRET: "a".repeat(32) }, headers: {} }];
  const found = findHardcodedSecrets(servers);
  assert.equal(found.length, 1);
  assert.equal(found[0].confidence, "medium");
});

test("hasNoDenyRules is true only when allow is non-empty and deny is empty", () => {
  assert.equal(hasNoDenyRules(["Bash(x:*)"], []), true);
  assert.equal(hasNoDenyRules([], []), false);
  assert.equal(hasNoDenyRules(["Bash(x:*)"], ["Bash(y:*)"]), false);
});

test("analyze on a clean config reports ok with no findings", () => {
  const result = analyze({
    allow: ["Bash(npm test:*)"],
    deny: ["Bash(rm:*)", "Bash(sudo:*)"],
    ask: [],
    servers: [{ name: "s", command: "node", url: null, env: { KEY: "${MY_KEY}" }, headers: {} }],
  });
  assert.equal(result.status, "ok");
  assert.deepEqual(result.findings, []);
});

test("analyze on a worked-bad config reports every finding kind, high severity first", () => {
  const result = analyze({
    allow: ["Bash"],
    deny: [],
    ask: [],
    servers: [{
      name: "remote",
      command: null,
      url: "http://example.com/mcp",
      env: { API_KEY: "sk-ant-api03-" + "z".repeat(40) },
      headers: {},
    }],
  });
  assert.equal(result.status, "findings");
  const kinds = result.findings.map((f) => f.kind);
  assert.ok(kinds.includes("bash-allow-all"));
  assert.ok(kinds.includes("insecure-mcp-url"));
  assert.ok(kinds.includes("hardcoded-secret"));
  // allow-all Bash makes the deny-rule-family check moot (no scoped risky
  // rule to check), but "no deny rules at all" still fires alongside it.
  assert.ok(kinds.includes("no-deny-rules"));
  assert.equal(result.findings[0].severity, "high");
});

test("analyze names gitTrackedFile in the hardcoded-secret message when supplied", () => {
  const config = {
    allow: [],
    deny: [],
    ask: [],
    servers: [{ name: "s", command: null, url: null, env: { KEY: "sk-ant-api03-" + "w".repeat(40) }, headers: {} }],
  };
  const tracked = analyze(config, { gitTrackedFile: true });
  assert.match(tracked.findings[0].message, /tracked by git -- treat the value as already leaked/);
  const untracked = analyze(config, { gitTrackedFile: false });
  assert.match(untracked.findings[0].message, /not tracked by git in this check/);
  const unknown = analyze(config, { gitTrackedFile: null });
  assert.doesNotMatch(unknown.findings[0].message, /tracked by git/);
});
