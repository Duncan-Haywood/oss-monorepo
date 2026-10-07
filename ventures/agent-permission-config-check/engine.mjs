// Zero-dependency, deterministic parser + rule engine for AI-coding-agent
// permission and MCP-server configuration -- Claude Code's `settings.json`
// (`permissions.allow` / `.deny` / `.ask`) and the `mcpServers` block shared,
// in the same JSON shape, by `.mcp.json` (Claude Code project scope),
// `.cursor/mcp.json` (Cursor) and `.vscode/mcp.json` (VS Code / Copilot).
//
// This module only parses a JSON string and looks for known-risky *shapes*
// in it -- it never touches the filesystem or the network, and it never
// executes, connects to, or contacts anything the config describes. cli.mjs
// supplies real file contents (and, best-effort, whether a file is tracked
// by git); index.html supplies whatever JSON a visitor pastes.
//
// This is a static config linter, not a runtime guard or a secret scanner
// with any claim of completeness: it flags patterns worth a human's own
// look, never a verdict that a config is "safe" or a value "is" a secret.

/** Parses one JSON config blob (settings.json, .mcp.json, or similar) into
 * the two independent facts this tool checks: a `permissions` rule set (may
 * be empty) and an `mcpServers` list (may be empty). Tolerates a file that
 * has only one of the two, or a bare `{allow, deny, ask}` object pasted on
 * its own without the `permissions` wrapper (the browser page's worked
 * example does this so it reads naturally as "just the permissions part"). */
export function parseConfig(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Expected a JSON object, not an array or a bare value.");
  }

  const bareRuleSet = ["allow", "deny", "ask"].some((k) => Array.isArray(data[k]));
  const permissions = data.permissions && typeof data.permissions === "object" && !Array.isArray(data.permissions)
    ? data.permissions
    : (bareRuleSet ? data : {});

  const stringsOnly = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  const allow = stringsOnly(permissions.allow);
  const deny = stringsOnly(permissions.deny);
  const ask = stringsOnly(permissions.ask);

  const mcpServersRaw = data.mcpServers && typeof data.mcpServers === "object" && !Array.isArray(data.mcpServers)
    ? data.mcpServers
    : {};
  const servers = Object.entries(mcpServersRaw)
    .filter(([, v]) => v && typeof v === "object" && !Array.isArray(v))
    .map(([name, v]) => ({
      name,
      command: typeof v.command === "string" ? v.command : null,
      url: typeof v.url === "string" ? v.url : null,
      env: v.env && typeof v.env === "object" && !Array.isArray(v.env) ? v.env : {},
      headers: v.headers && typeof v.headers === "object" && !Array.isArray(v.headers) ? v.headers : {},
    }));

  return { allow, deny, ask, servers };
}

// --- 1. Blanket Bash allow-all -------------------------------------------

// Claude Code's permission rules scope a tool by an optional parenthesised
// pattern, e.g. `Bash(git diff:*)`. A bare `"Bash"`, or a pattern whose
// scope is itself a wildcard, grants every shell command with no scoping at
// all -- functionally identical to running with permission prompts off for
// the one tool an agent can use to do anything else on the machine.
const BASH_ALLOW_ALL_RE = /^Bash(\(\s*\*(\s*:\s*\*)?\s*\))?$/;

export function isBashAllowAllRule(rule) {
  return BASH_ALLOW_ALL_RE.test(String(rule).trim());
}

export function findBashAllowAll(allow) {
  return allow.filter((rule) => isBashAllowAllRule(rule));
}

// --- 2. A destructive command family allowed with no matching deny -------

// Not an exhaustive "dangerous commands" list -- a short, named set of
// command families whose blast radius (data loss, privilege escalation, or
// arbitrary remote code execution) is large enough that an *unscoped* allow
// entry for one is worth a second look even when it is not literally
// allow-all. Scoped narrowly (e.g. `Bash(rm:./build/*)`) is not flagged --
// only an entry with no `:` scope at all, or whose scope is itself `*`.
const RISKY_COMMANDS = ["sudo", "rm", "curl", "wget", "chmod", "eval", "dd", "mkfs", "shutdown", "reboot"];
const BASH_RULE_RE = /^Bash\(\s*([^():]+?)\s*(?::\s*([^()]*))?\)$/;

function parseBashRule(rule) {
  const trimmed = String(rule).trim();
  if (trimmed === "Bash") return { command: null, scope: null }; // bare Bash: handled by allow-all above
  const m = BASH_RULE_RE.exec(trimmed);
  if (!m) return null;
  return { command: m[1].trim(), scope: (m[2] ?? "").trim() };
}

/** Risky command families allowed with no scope (or a `*` scope), so the
 * rule in practice covers every invocation of that command family. Each
 * result names whether a `deny` rule for the same command family exists. */
export function findUnscopedRiskyAllows(allow, deny) {
  const found = [];
  for (const rule of allow) {
    const parsed = parseBashRule(rule);
    if (!parsed || !parsed.command) continue;
    const command = parsed.command.toLowerCase();
    if (!RISKY_COMMANDS.includes(command)) continue;
    if (parsed.scope && parsed.scope !== "*") continue; // narrowly scoped: not flagged
    const guarded = deny.some((d) => {
      const dp = parseBashRule(d);
      return dp && dp.command && dp.command.toLowerCase() === command;
    });
    found.push({ rule, command, guardedByDeny: guarded });
  }
  return found;
}

// --- 3. MCP server reached over plain HTTP --------------------------------

export function findInsecureMcpUrls(servers) {
  return servers.filter((s) => typeof s.url === "string" && /^http:\/\//i.test(s.url.trim()));
}

// --- 4. A literal-looking secret in a committed MCP server's env/headers -

// Known prefixes for widely-issued API token formats. A match here is
// reported at "high" confidence; nothing outside this list is ever reported
// above "medium", because a generic entropy guess cannot tell a real secret
// from a long non-secret identifier.
const KNOWN_SECRET_PREFIXES = [
  { re: /^sk-ant-/, label: "an Anthropic API key" },
  { re: /^sk-proj-/, label: "an OpenAI project API key" },
  { re: /^sk-[A-Za-z0-9]{20,}$/, label: "an OpenAI-style API key" },
  { re: /^gh[oprsu]_[A-Za-z0-9]{20,}$/, label: "a GitHub token" },
  { re: /^github_pat_[A-Za-z0-9_]{20,}$/, label: "a GitHub fine-grained PAT" },
  { re: /^xox[baprs]-[A-Za-z0-9-]{10,}$/, label: "a Slack token" },
  { re: /^AKIA[0-9A-Z]{16}$/, label: "an AWS access key ID" },
  { re: /^AIzaSy[A-Za-z0-9_-]{20,}$/, label: "a Google API key" },
  { re: /^glpat-[A-Za-z0-9_-]{20}$/, label: "a GitLab personal access token" },
  { re: /^npm_[A-Za-z0-9]{30,}$/, label: "an npm access token" },
];

function stripAuthScheme(value) {
  return value.replace(/^(Bearer|Basic|Token)\s+/i, "").trim();
}

function isEnvReference(value) {
  // `${VAR}`, `$VAR`, or a value that interpolates one alongside literal
  // text (`Bearer ${TOKEN}`) is a reference, not a literal -- the config
  // still needs the real value from *somewhere*, but not from this file.
  return /\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(value) || /(^|[^A-Za-z0-9_])\$[A-Za-z_][A-Za-z0-9_]*/.test(value);
}

/** Scans every MCP server's `env` and `headers` values for a literal that
 * looks like a credential rather than an environment-variable reference.
 * `kind` distinguishes an `env` entry (read by the launched subprocess)
 * from a `headers` entry (sent on every request to a remote server). */
export function findHardcodedSecrets(servers) {
  const found = [];
  for (const server of servers) {
    for (const [kind, bag] of [["env", server.env], ["header", server.headers]]) {
      for (const [key, rawValue] of Object.entries(bag)) {
        if (typeof rawValue !== "string") continue;
        const value = rawValue.trim();
        if (!value || isEnvReference(value)) continue;
        const candidate = kind === "header" ? stripAuthScheme(value) : value;
        const known = KNOWN_SECRET_PREFIXES.find((p) => p.re.test(candidate));
        if (known) {
          found.push({ server: server.name, kind, key, confidence: "high", label: known.label });
          continue;
        }
        // Generic fallback: long, no whitespace, no path separators --
        // shaped like a token rather than a filesystem path or a plain
        // word. Reported at "medium" confidence on purpose: this catches a
        // real but unrecognised secret format, and also catches ordinary
        // long non-secret values, which the report must not overclaim.
        if (candidate.length >= 20 && !/\s/.test(candidate) && !candidate.includes("/") && /^[A-Za-z0-9+_.=-]+$/.test(candidate)) {
          found.push({ server: server.name, kind, key, confidence: "medium", label: "a value shaped like a hardcoded credential rather than a reference" });
        }
      }
    }
  }
  return found;
}

// --- 5. No deny rules at all, while allow is non-trivial ------------------

export function hasNoDenyRules(allow, deny) {
  return allow.length > 0 && deny.length === 0;
}

/** Runs every check over one parsed config and returns a flat, sorted list
 * of findings plus a one-line summary. `gitTracked` is an optional
 * `Map<serverName, boolean|null>`-shaped hint the CLI supplies for the
 * hardcoded-secret findings (null/absent = unknown, e.g. the browser page
 * or a config outside a git repo); it only changes the finding's message,
 * never whether it fires. */
export function analyze({ allow, deny, ask, servers }, { gitTrackedFile = null } = {}) {
  const findings = [];

  for (const rule of findBashAllowAll(allow)) {
    findings.push({
      severity: "high",
      kind: "bash-allow-all",
      message: `"${rule}" grants Bash with no scope at all -- every shell command runs without a permission prompt.`,
    });
  }

  for (const { rule, command, guardedByDeny } of findUnscopedRiskyAllows(allow, deny)) {
    if (guardedByDeny) continue; // an explicit deny for the same command family already covers it
    findings.push({
      severity: "medium",
      kind: "unscoped-risky-allow",
      message: `"${rule}" allows every invocation of "${command}" with no scope and no matching deny rule -- consider scoping it (e.g. "Bash(${command}:./specific/path/*)") or adding a deny rule for the cases it should never cover.`,
    });
  }

  for (const server of findInsecureMcpUrls(servers)) {
    findings.push({
      severity: "high",
      kind: "insecure-mcp-url",
      server: server.name,
      message: `MCP server "${server.name}" is reached over plain http:// (${server.url}) -- traffic, including any credential sent in its headers, is unencrypted on the wire.`,
    });
  }

  for (const secret of findHardcodedSecrets(servers)) {
    const trackedNote = gitTrackedFile === true
      ? " This file is tracked by git -- treat the value as already leaked and rotate it."
      : gitTrackedFile === false
        ? " This file is not tracked by git in this check, but confirm it is actually gitignored before relying on that."
        : "";
    findings.push({
      severity: secret.confidence === "high" ? "high" : "medium",
      kind: "hardcoded-secret",
      server: secret.server,
      message: `MCP server "${secret.server}" ${secret.kind} "${secret.key}" looks like ${secret.label}, written as a literal value instead of an environment-variable reference (e.g. "\${${secret.key}}").${trackedNote}`,
    });
  }

  if (hasNoDenyRules(allow, deny)) {
    findings.push({
      severity: "info",
      kind: "no-deny-rules",
      message: `No "deny" rules at all, alongside ${allow.length} "allow" rule(s) -- a future edit that widens "allow" has nothing blocking it. Consider an explicit deny for destructive command families (${RISKY_COMMANDS.join(", ")}) even where they are not currently allowed.`,
    });
  }

  findings.sort((a, b) => {
    const order = { high: 0, medium: 1, info: 2 };
    return order[a.severity] - order[b.severity] || a.kind.localeCompare(b.kind);
  });

  const counted = findings.filter((f) => f.severity !== "info").length;
  const summary = counted === 0
    ? (findings.length === 0
      ? "No findings -- no allow-all Bash, no unscoped risky command family, no plain-http MCP server, and no hardcoded-looking secret."
      : `No allow-all Bash, no unscoped risky command family, no plain-http MCP server, and no hardcoded-looking secret (${findings.length} informational note).`)
    : `${counted} finding(s): ${findings.filter((f) => f.severity !== "info").map((f) => f.kind).join(", ")}.`;

  return { findings, summary, status: counted === 0 ? "ok" : "findings" };
}

export { RISKY_COMMANDS };
