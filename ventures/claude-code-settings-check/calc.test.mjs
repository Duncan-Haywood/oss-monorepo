import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSettingsFile,
  checkHooks,
  checkPermissions,
  checkCrossFile,
  lintSettings,
  summaryText,
  KNOWN_HOOK_EVENTS,
  KNOWN_HOOK_TYPES,
} from "./calc.mjs";

// ---- parseSettingsFile ------------------------------------------------------

test("parseSettingsFile: blank text is 'not supplied', not an error", () => {
  const result = parseSettingsFile("   ", "settings.local.json");
  assert.equal(result.ok, true);
  assert.equal(result.supplied, false);
  assert.equal(result.data, null);
});

test("parseSettingsFile: valid JSON object parses", () => {
  const result = parseSettingsFile('{"hooks": {}}', "settings.json");
  assert.equal(result.ok, true);
  assert.equal(result.supplied, true);
  assert.deepEqual(result.data, { hooks: {} });
});

test("parseSettingsFile: invalid JSON reports the parse error", () => {
  const result = parseSettingsFile("{not json", "settings.json");
  assert.equal(result.ok, false);
  assert.match(result.error, /not valid JSON/);
});

test("parseSettingsFile: a top-level array is rejected", () => {
  const result = parseSettingsFile("[1, 2, 3]", "settings.json");
  assert.equal(result.ok, false);
  assert.match(result.error, /top level/);
});

// ---- checkHooks --------------------------------------------------------

test("checkHooks: no hooks key is fine", () => {
  assert.deepEqual(checkHooks({}, "settings.json"), []);
});

test("checkHooks: every known event name is accepted without a caution", () => {
  for (const event of KNOWN_HOOK_EVENTS) {
    const data = { hooks: { [event]: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] }] } };
    const findings = checkHooks(data, "settings.json");
    assert.equal(findings.some((f) => f.category === "unknown-hook-event"), false, event);
  }
});

test("checkHooks: a misspelled event name is a caution, not silently accepted", () => {
  const data = { hooks: { PreToolUseX: [] } };
  const findings = checkHooks(data, "settings.json");
  const f = findings.find((f) => f.category === "unknown-hook-event");
  assert.ok(f, "expected an unknown-hook-event finding");
  assert.equal(f.severity, "medium");
});

test("checkHooks: hooks not an object is a high finding", () => {
  const findings = checkHooks({ hooks: [] }, "settings.json");
  assert.ok(findings.some((f) => f.category === "hooks-not-object" && f.severity === "high"));
});

test("checkHooks: an event whose value isn't an array is flagged", () => {
  const findings = checkHooks({ hooks: { PreToolUse: {} } }, "settings.json");
  assert.ok(findings.some((f) => f.category === "event-not-array"));
});

test("checkHooks: an invalid matcher regex is flagged", () => {
  const data = { hooks: { PreToolUse: [{ matcher: "Bash(", hooks: [{ type: "command", command: "echo hi" }] }] } };
  const findings = checkHooks(data, "settings.json");
  assert.ok(findings.some((f) => f.category === "invalid-matcher-regex" && f.severity === "high"));
});

test("checkHooks: a valid matcher regex is not flagged", () => {
  const data = { hooks: { PreToolUse: [{ matcher: "Bash|Read", hooks: [{ type: "command", command: "echo hi" }] }] } };
  const findings = checkHooks(data, "settings.json");
  assert.equal(findings.some((f) => f.category === "invalid-matcher-regex"), false);
});

test("checkHooks: an empty matcher is not flagged (matches everything, which is valid)", () => {
  const data = { hooks: { Notification: [{ matcher: "", hooks: [{ type: "command", command: "echo hi" }] }] } };
  const findings = checkHooks(data, "settings.json");
  assert.equal(findings.length, 0);
});

test("checkHooks: a matcher group with no hook commands is flagged", () => {
  const data = { hooks: { PreToolUse: [{ matcher: "Bash", hooks: [] }] } };
  const findings = checkHooks(data, "settings.json");
  assert.ok(findings.some((f) => f.category === "no-hook-commands"));
});

test("checkHooks: a missing hooks array on the group is flagged the same way", () => {
  const data = { hooks: { PreToolUse: [{ matcher: "Bash" }] } };
  const findings = checkHooks(data, "settings.json");
  assert.ok(findings.some((f) => f.category === "no-hook-commands"));
});

test("checkHooks: an empty command string does nothing and is flagged", () => {
  const data = { hooks: { Stop: [{ hooks: [{ type: "command", command: "   " }] }] } };
  const findings = checkHooks(data, "settings.json");
  assert.ok(findings.some((f) => f.category === "empty-hook-command" && f.severity === "high"));
});

test("checkHooks: a missing command is flagged", () => {
  const data = { hooks: { Stop: [{ hooks: [{ type: "command" }] }] } };
  const findings = checkHooks(data, "settings.json");
  assert.ok(findings.some((f) => f.category === "empty-hook-command"));
});

test("checkHooks: an unrecognized hook type is a caution", () => {
  const data = { hooks: { Stop: [{ hooks: [{ type: "script", command: "echo hi" }] }] } };
  const findings = checkHooks(data, "settings.json");
  const f = findings.find((f) => f.category === "unrecognized-hook-type");
  assert.ok(f);
  assert.equal(f.severity, "medium");
});

test("checkHooks: 'command' is the only type accepted without caution", () => {
  assert.deepEqual([...KNOWN_HOOK_TYPES], ["command"]);
});

test("checkHooks: a well-formed hooks section produces no findings", () => {
  const data = {
    hooks: {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo pre" }] }],
      Stop: [{ hooks: [{ type: "command", command: "echo stop" }] }],
    },
  };
  assert.deepEqual(checkHooks(data, "settings.json"), []);
});

// ---- checkPermissions ------------------------------------------------------

test("checkPermissions: no permissions key is fine", () => {
  assert.deepEqual(checkPermissions({}, "settings.json"), []);
});

test("checkPermissions: permissions not an object is a high finding", () => {
  const findings = checkPermissions({ permissions: [] }, "settings.json");
  assert.ok(findings.some((f) => f.category === "permissions-not-object"));
});

test("checkPermissions: a plain tool name with no parens is fine", () => {
  const findings = checkPermissions({ permissions: { allow: ["Read"] } }, "settings.json");
  assert.equal(findings.length, 0);
});

test("checkPermissions: a well-formed tool(specifier) rule is fine", () => {
  const findings = checkPermissions({ permissions: { allow: ["Bash(git status:*)"] } }, "settings.json");
  assert.equal(findings.length, 0);
});

test("checkPermissions: unbalanced parentheses are flagged", () => {
  const findings = checkPermissions({ permissions: { allow: ["Bash(git status:*"] } }, "settings.json");
  assert.ok(findings.some((f) => f.category === "malformed-rule" && /parentheses/.test(f.detail)));
});

test("checkPermissions: trailing text after the closing paren is flagged", () => {
  const findings = checkPermissions({ permissions: { allow: ["Bash(git status:*)x"] } }, "settings.json");
  assert.ok(findings.some((f) => f.category === "malformed-rule"));
});

test("checkPermissions: an empty specifier is flagged", () => {
  const findings = checkPermissions({ permissions: { allow: ["Bash()"] } }, "settings.json");
  assert.ok(findings.some((f) => f.category === "malformed-rule" && /empty/.test(f.detail)));
});

test("checkPermissions: leading/trailing whitespace on a rule is flagged", () => {
  const findings = checkPermissions({ permissions: { allow: [" Bash(git status:*)"] } }, "settings.json");
  assert.ok(findings.some((f) => f.category === "malformed-rule" && /whitespace/.test(f.detail)));
});

test("checkPermissions: an empty rule string is flagged", () => {
  const findings = checkPermissions({ permissions: { allow: [""] } }, "settings.json");
  assert.ok(findings.some((f) => f.category === "malformed-rule" && /empty string/.test(f.detail)));
});

test("checkPermissions: a non-string rule entry is flagged", () => {
  const findings = checkPermissions({ permissions: { allow: [42] } }, "settings.json");
  assert.ok(findings.some((f) => f.category === "rule-not-string"));
});

test("checkPermissions: a list that isn't an array is flagged", () => {
  const findings = checkPermissions({ permissions: { allow: "Bash" } }, "settings.json");
  assert.ok(findings.some((f) => f.category === "list-not-array"));
});

test("checkPermissions: a rule repeated in the same list is flagged as a duplicate", () => {
  const findings = checkPermissions({ permissions: { allow: ["Read", "Read"] } }, "settings.json");
  assert.ok(findings.some((f) => f.category === "duplicate-rule"));
});

test("checkPermissions: the same exact rule in two different lists is flagged, without asserting which one Claude Code honours", () => {
  const findings = checkPermissions({ permissions: { allow: ["Bash(git status:*)"], deny: ["Bash(git status:*)"] } }, "settings.json");
  const f = findings.find((f) => f.category === "rule-in-multiple-lists");
  assert.ok(f);
  assert.match(f.detail, /does not assert which list wins/);
});

test("checkPermissions: an mcp__server__tool style name with double underscores is fine", () => {
  const findings = checkPermissions({ permissions: { allow: ["mcp__github__search_code"] } }, "settings.json");
  assert.equal(findings.length, 0);
});

// ---- checkCrossFile ---------------------------------------------------------

test("checkCrossFile: a rule duplicated verbatim across both files is a low finding", () => {
  const project = { permissions: { allow: ["Read"] } };
  const local = { permissions: { allow: ["Read"] } };
  const findings = checkCrossFile(project, local);
  assert.ok(findings.some((f) => f.category === "duplicated-across-files" && f.severity === "low"));
});

test("checkCrossFile: project deny vs. local allow of the same rule is a high contradiction", () => {
  const project = { permissions: { deny: ["Bash(rm -rf *)"] } };
  const local = { permissions: { allow: ["Bash(rm -rf *)"] } };
  const findings = checkCrossFile(project, local);
  const f = findings.find((f) => f.category === "cross-file-contradiction");
  assert.ok(f);
  assert.equal(f.severity, "high");
});

test("checkCrossFile: local deny vs. project ask of the same rule is also flagged", () => {
  const project = { permissions: { ask: ["WebFetch(domain:example.com)"] } };
  const local = { permissions: { deny: ["WebFetch(domain:example.com)"] } };
  const findings = checkCrossFile(project, local);
  assert.ok(findings.some((f) => f.category === "cross-file-contradiction"));
});

test("checkCrossFile: no overlap produces no findings", () => {
  const project = { permissions: { allow: ["Read"] } };
  const local = { permissions: { allow: ["Write"] } };
  assert.deepEqual(checkCrossFile(project, local), []);
});

test("checkCrossFile: never claims to know which file Claude Code honours", () => {
  const project = { permissions: { deny: ["Bash(*)"] } };
  const local = { permissions: { allow: ["Bash(*)"] } };
  const findings = checkCrossFile(project, local);
  assert.ok(findings.length > 0);
  for (const f of findings) assert.doesNotMatch(f.detail, /\bwins\b|\boverrides\b/);
});

// ---- lintSettings / summaryText ---------------------------------------------

test("lintSettings: a clean settings.json with no local file produces no findings", () => {
  const project = JSON.stringify({
    hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] }] },
    permissions: { allow: ["Read"], deny: ["Bash(rm -rf *)"] },
  });
  const result = lintSettings(project, "");
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.counts, { high: 0, medium: 0, low: 0 });
});

test("lintSettings: invalid project JSON is reported and nothing else runs against it", () => {
  const result = lintSettings("{bad", "");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].category, "invalid-json");
  assert.equal(result.findings[0].source, "settings.json");
});

test("lintSettings: invalid local JSON is reported independently of a clean project file", () => {
  const result = lintSettings("{}", "{bad");
  assert.ok(result.findings.some((f) => f.category === "invalid-json" && f.source === "settings.local.json"));
});

test("lintSettings: findings from both files and the cross-file check all appear together", () => {
  const project = JSON.stringify({ permissions: { deny: ["Bash(rm -rf *)"] } });
  const local = JSON.stringify({ permissions: { allow: ["Bash(rm -rf *)"] }, hooks: { Oops: [] } });
  const result = lintSettings(project, local);
  assert.ok(result.findings.some((f) => f.category === "cross-file-contradiction"));
  assert.ok(result.findings.some((f) => f.category === "unknown-hook-event" && f.source.startsWith("settings.local.json")));
});

test("summaryText: reports a clean result without claiming runtime correctness", () => {
  const text = summaryText({ findings: [], counts: { high: 0, medium: 0, low: 0 } });
  assert.match(text, /No structural issues observed/);
  assert.match(text, /not a claim/);
});

test("summaryText: lists every finding with its severity and source", () => {
  const findings = [{ source: "settings.json.hooks.Stop[0]", category: "empty-hook-command", severity: "high", detail: "No command." }];
  const text = summaryText({ findings, counts: { high: 1, medium: 0, low: 0 } });
  assert.match(text, /\[HIGH\] settings\.json\.hooks\.Stop\[0\] -- empty-hook-command: No command\./);
});
