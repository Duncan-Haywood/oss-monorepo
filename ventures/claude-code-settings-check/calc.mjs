// Claude Code Settings Check -- deterministic, mechanical checks against a
// pasted Claude Code settings.json (and, optionally, its sibling
// settings.local.json) for structural mistakes in the two sections that
// fail silently when they are wrong: `hooks` (a hook that never fires
// because its matcher can't compile, or fires and does nothing because it
// names no command) and `permissions` (a rule string malformed enough that
// it never matches anything, or the same exact rule duplicated -- or
// contradicted -- across allow/deny/ask or across the two files).
//
// This module never contacts a network and never claims to know Claude
// Code's actual runtime precedence between allow/deny/ask, or that a rule
// this tool cannot parse will or will not be honoured at run time -- see
// PRODUCT_PLAYBOOK.md 5b: a tool that can't verify a fact live must not
// assert it. Every check here is one of two kinds: a fact about the pasted
// text alone (valid JSON, a regex that does or doesn't compile, balanced
// parentheses, an exact string appearing more than once), or a caution
// dated against this tool's own documented reference (the hook event names
// and the "command" hook type below), never a claim about what Claude Code
// itself will do with the file.

// ---- hook event names, dated rather than asserted as exhaustive -----------
//
// The event names Claude Code's hook system documents as of this tool's
// last update. Anthropic can add a new one at any time, so a name outside
// this list is reported as a caution ("not one of the names documented as
// of [date] -- check for a typo, or this may be newer than this tool"),
// never as a hard error.
export const KNOWN_HOOK_EVENTS_AS_OF = "2026-01";
export const KNOWN_HOOK_EVENTS = new Set([
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "UserPromptSubmit",
  "Stop",
  "SubagentStop",
  "PreCompact",
  "SessionStart",
  "SessionEnd",
]);

// The only hook entry `type` documented as of the same date. Same caution
// discipline as the event names above.
export const KNOWN_HOOK_TYPES = new Set(["command"]);

function finding(source, category, severity, detail) {
  return { source, category, severity, detail };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses one pasted settings file. Blank/whitespace-only text is "not
 * supplied" rather than an error -- settings.local.json is optional, and a
 * project may have no local overrides at all. */
export function parseSettingsFile(text, label) {
  const trimmed = String(text ?? "").trim();
  if (trimmed === "") return { ok: true, supplied: false, data: null, error: null };
  try {
    const data = JSON.parse(trimmed);
    if (!isPlainObject(data)) {
      return {
        ok: false,
        supplied: true,
        data: null,
        error: `${label} must be a JSON object at the top level, not ${Array.isArray(data) ? "an array" : typeof data}.`,
      };
    }
    return { ok: true, supplied: true, data, error: null };
  } catch (err) {
    return { ok: false, supplied: true, data: null, error: `${label} is not valid JSON: ${err.message}` };
  }
}

// ---- hooks ------------------------------------------------------------------

/** Checks the `hooks` section of a parsed settings object. `label` names
 * which file this came from, for the finding's `source`. */
export function checkHooks(data, label) {
  const out = [];
  if (!isPlainObject(data) || data.hooks === undefined) return out;
  const hooks = data.hooks;
  if (!isPlainObject(hooks)) {
    out.push(finding(`${label}.hooks`, "hooks-not-object", "high", '"hooks" must be an object keyed by event name (e.g. "PreToolUse"), not ' + (Array.isArray(hooks) ? "an array" : typeof hooks) + "."));
    return out;
  }

  for (const [eventName, groups] of Object.entries(hooks)) {
    const eventSource = `${label}.hooks.${eventName}`;
    if (!KNOWN_HOOK_EVENTS.has(eventName)) {
      out.push(finding(
        eventSource, "unknown-hook-event", "medium",
        `"${eventName}" is not one of the hook event names documented as of ${KNOWN_HOOK_EVENTS_AS_OF} (${[...KNOWN_HOOK_EVENTS].join(", ")}). Check for a typo, or this may be an event added since -- a misspelled event name registers a hook that never fires, silently.`,
      ));
    }
    if (!Array.isArray(groups)) {
      out.push(finding(eventSource, "event-not-array", "high", `"${eventName}" must be an array of matcher groups, not ${typeof groups}.`));
      continue;
    }
    groups.forEach((group, i) => {
      const groupSource = `${eventSource}[${i}]`;
      if (!isPlainObject(group)) {
        out.push(finding(groupSource, "group-not-object", "high", "Each entry must be an object with a \"hooks\" array (and, for tool-scoped events, a \"matcher\")."));
        return;
      }
      if (typeof group.matcher === "string" && group.matcher !== "") {
        try {
          // eslint-disable-next-line no-new -- constructed only to test compilation
          new RegExp(group.matcher);
        } catch (err) {
          out.push(finding(groupSource, "invalid-matcher-regex", "high", `matcher "${group.matcher}" does not compile as a regular expression (${err.message}) -- a hook whose matcher can't compile never fires.`));
        }
      } else if (group.matcher !== undefined && typeof group.matcher !== "string") {
        out.push(finding(groupSource, "matcher-not-string", "high", `"matcher" must be a string, not ${typeof group.matcher}.`));
      }
      if (!Array.isArray(group.hooks) || group.hooks.length === 0) {
        out.push(finding(groupSource, "no-hook-commands", "medium", 'This matcher group has no "hooks" entries (or "hooks" is not an array) -- it matches but runs nothing.'));
        return;
      }
      group.hooks.forEach((hook, j) => {
        const hookSource = `${groupSource}.hooks[${j}]`;
        if (!isPlainObject(hook)) {
          out.push(finding(hookSource, "hook-not-object", "high", "Each hook entry must be an object."));
          return;
        }
        if (hook.type !== undefined && !KNOWN_HOOK_TYPES.has(hook.type)) {
          out.push(finding(hookSource, "unrecognized-hook-type", "medium", `"type: ${JSON.stringify(hook.type)}" is not one of the types documented as of ${KNOWN_HOOK_EVENTS_AS_OF} (${[...KNOWN_HOOK_TYPES].join(", ")}). Check for a typo, or this may be newer than this tool.`));
        }
        const command = hook.command;
        if (command === undefined || (typeof command === "string" && command.trim() === "")) {
          out.push(finding(hookSource, "empty-hook-command", "high", 'No (or an empty) "command" -- this hook entry runs nothing.'));
        } else if (typeof command !== "string") {
          out.push(finding(hookSource, "command-not-string", "high", `"command" must be a string, not ${typeof command}.`));
        }
      });
    });
  }
  return out;
}

// ---- permissions --------------------------------------------------------

const PERMISSION_LISTS = ["allow", "deny", "ask"];

/** Structurally validates one permission rule string: `ToolName` or
 * `ToolName(specifier)`. Returns null if the shape is fine, or a caution
 * string naming what's wrong. This never judges whether the tool name or
 * specifier is one Claude Code actually recognises -- MCP tool names and
 * specifiers are open-ended, so only the punctuation shape is checked. */
function checkRuleShape(rule) {
  const trimmed = rule.trim();
  if (trimmed === "") return "the rule is an empty string";
  if (trimmed !== rule) return "the rule has leading or trailing whitespace, which is easy to introduce by copy-paste and will not match anything";
  const openCount = (rule.match(/\(/g) || []).length;
  const closeCount = (rule.match(/\)/g) || []).length;
  if (openCount !== closeCount) return "the parentheses are not balanced";
  if (openCount === 0) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(rule)) return "the tool name contains a character other than letters, digits, or underscore";
    return null;
  }
  if (openCount > 1) return "more than one parenthesised group -- only one \"(specifier)\" is expected";
  const openIndex = rule.indexOf("(");
  if (!rule.endsWith(")")) return "there is text after the closing parenthesis";
  const toolName = rule.slice(0, openIndex);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(toolName)) return "the tool name (before the parenthesis) contains a character other than letters, digits, or underscore";
  const specifier = rule.slice(openIndex + 1, -1);
  if (specifier.trim() === "") return "the parentheses are empty -- an empty specifier is easy to mistake for \"match everything\"";
  return null;
}

/** Checks the `permissions` section of a parsed settings object. */
export function checkPermissions(data, label) {
  const out = [];
  if (!isPlainObject(data) || data.permissions === undefined) return out;
  const permissions = data.permissions;
  if (!isPlainObject(permissions)) {
    out.push(finding(`${label}.permissions`, "permissions-not-object", "high", `"permissions" must be an object, not ${Array.isArray(permissions) ? "an array" : typeof permissions}.`));
    return out;
  }

  const seenAcrossLists = new Map(); // rule string -> [listName, ...]
  for (const listName of PERMISSION_LISTS) {
    const list = permissions[listName];
    if (list === undefined) continue;
    const listSource = `${label}.permissions.${listName}`;
    if (!Array.isArray(list)) {
      out.push(finding(listSource, "list-not-array", "high", `"${listName}" must be an array of rule strings, not ${typeof list}.`));
      continue;
    }
    const seenInList = new Map(); // rule -> count
    list.forEach((rule, i) => {
      const ruleSource = `${listSource}[${i}]`;
      if (typeof rule !== "string") {
        out.push(finding(ruleSource, "rule-not-string", "high", `Each entry must be a string, not ${typeof rule}.`));
        return;
      }
      const problem = checkRuleShape(rule);
      if (problem) {
        out.push(finding(ruleSource, "malformed-rule", "high", `"${rule}" looks malformed: ${problem}.`));
      }
      seenInList.set(rule, (seenInList.get(rule) || 0) + 1);
      if (!seenAcrossLists.has(rule)) seenAcrossLists.set(rule, []);
      seenAcrossLists.get(rule).push(listName);
    });
    for (const [rule, count] of seenInList) {
      if (count > 1) {
        out.push(finding(listSource, "duplicate-rule", "medium", `"${rule}" appears ${count} times in "${listName}" -- redundant, and worth checking it wasn't meant to be two different rules.`));
      }
    }
  }
  for (const [rule, lists] of seenAcrossLists) {
    const distinct = [...new Set(lists)];
    if (distinct.length > 1) {
      out.push(finding(`${label}.permissions`, "rule-in-multiple-lists", "medium", `"${rule}" appears in more than one list (${distinct.join(", ")}) in the same file. This tool does not assert which list wins -- verify this is intentional rather than a copy-paste leftover.`));
    }
  }
  return out;
}

/** Compares `permissions` between a project settings.json and its optional
 * settings.local.json: flags the same exact rule string showing up in both
 * files (possibly redundant), and the same rule appearing in one file's
 * allow/ask and the other file's deny (a likely-unintentional contradiction
 * worth a look). Makes no claim about which file Claude Code honours. */
export function checkCrossFile(projectData, localData) {
  const out = [];
  if (!isPlainObject(projectData) || !isPlainObject(localData)) return out;
  const projectPerms = isPlainObject(projectData.permissions) ? projectData.permissions : {};
  const localPerms = isPlainObject(localData.permissions) ? localData.permissions : {};

  const ruleLists = (perms, listName) => (Array.isArray(perms[listName]) ? perms[listName].filter((r) => typeof r === "string") : []);

  for (const listName of PERMISSION_LISTS) {
    const inProject = new Set(ruleLists(projectPerms, listName));
    const inLocal = new Set(ruleLists(localPerms, listName));
    for (const rule of inProject) {
      if (inLocal.has(rule)) {
        out.push(finding("settings.json + settings.local.json", "duplicated-across-files", "low", `"${rule}" appears in "${listName}" in both files -- redundant, and settings.local.json's copy is the one most likely to go stale.`));
      }
    }
  }

  for (const denyListName of ["deny"]) {
    for (const otherListName of ["allow", "ask"]) {
      const projectDeny = new Set(ruleLists(projectPerms, denyListName));
      const localOther = new Set(ruleLists(localPerms, otherListName));
      for (const rule of projectDeny) {
        if (localOther.has(rule)) {
          out.push(finding("settings.json + settings.local.json", "cross-file-contradiction", "high", `"${rule}" is in settings.json's "${denyListName}" and settings.local.json's "${otherListName}" -- these directly disagree. This tool does not know which file Claude Code honours; verify against the current documentation before relying on either.`));
        }
      }
      const localDeny = new Set(ruleLists(localPerms, denyListName));
      const projectOther = new Set(ruleLists(projectPerms, otherListName));
      for (const rule of localDeny) {
        if (projectOther.has(rule)) {
          out.push(finding("settings.json + settings.local.json", "cross-file-contradiction", "high", `"${rule}" is in settings.local.json's "${denyListName}" and settings.json's "${otherListName}" -- these directly disagree. This tool does not know which file Claude Code honours; verify against the current documentation before relying on either.`));
        }
      }
    }
  }
  return out;
}

function countSeverities(findings) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  return counts;
}

/** Top-level entry point: lints a project settings.json and an optional
 * settings.local.json together. `projectText`/`localText` are the raw
 * pasted strings; `localText` may be blank. */
export function lintSettings(projectText, localText) {
  const project = parseSettingsFile(projectText, "settings.json");
  const local = parseSettingsFile(localText, "settings.local.json");

  const findings = [];
  if (!project.ok) {
    findings.push(finding("settings.json", "invalid-json", "high", project.error));
  } else if (project.supplied) {
    findings.push(...checkHooks(project.data, "settings.json"));
    findings.push(...checkPermissions(project.data, "settings.json"));
  }
  if (!local.ok) {
    findings.push(finding("settings.local.json", "invalid-json", "high", local.error));
  } else if (local.supplied) {
    findings.push(...checkHooks(local.data, "settings.local.json"));
    findings.push(...checkPermissions(local.data, "settings.local.json"));
  }
  if (project.ok && project.supplied && local.ok && local.supplied) {
    findings.push(...checkCrossFile(project.data, local.data));
  }

  return {
    project,
    local,
    findings,
    counts: countSeverities(findings),
  };
}

/** Plain-text summary suitable for pasting into a review note or PR. */
export function summaryText({ findings, counts }) {
  const lines = [
    `Claude Code settings check: ${findings.length} finding(s) (${counts.high} high, ${counts.medium} medium, ${counts.low} low).`,
  ];
  if (findings.length === 0) {
    lines.push("No structural issues observed. This is not a claim that every hook fires or that every rule behaves as intended at runtime -- only that none of this tool's mechanical checks fired.");
  } else {
    for (const f of findings) {
      lines.push(`[${f.severity.toUpperCase()}] ${f.source} -- ${f.category}: ${f.detail}`);
    }
  }
  lines.push("Mechanical, structural checks only against the text pasted in -- review every finding yourself, and verify against Claude Code's current documentation. This is not a guarantee of runtime behaviour.");
  return lines.join("\n");
}
