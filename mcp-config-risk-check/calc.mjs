// MCP Config Risk Check -- deterministic, mechanical checks against a single,
// pasted MCP server config (mcp.json / claude_desktop_config.json / a VS
// Code .vscode/mcp.json / a generic list of server entries). This module
// never contacts a server, a registry, or a vulnerability database, and it
// never asserts that a server, package, or version is "safe" -- only that a
// structural pattern was or was not observed in the text the caller pasted.
// See PRODUCT_PLAYBOOK.md 5b: a tool that can't verify a fact live must not
// assert it, so every finding here is "flagged for review", not a verdict.
//
// Different shape from ventures/mcp-supply-chain-watch, which diffs two
// *captured tool manifests* over time to report drift between them. This
// tool looks at a *single* server-launch config (the file a client reads to
// start each server) and flags structural risk patterns in it: broad
// filesystem/shell access, secrets hardcoded as literals instead of
// referenced from the environment, missing version pins on the launched
// package/image, and -- when the pasted data happens to include each
// server's own tool list -- duplicate/shadowing tool names across servers.

const BROAD_PATHS = new Set(["/", "~", "$HOME", "%USERPROFILE%", "C:\\", "C:/", "/root"]);

const SHELL_COMMANDS = new Set([
  "bash", "sh", "zsh", "dash", "ksh", "fish",
  "cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "pwsh.exe",
  "wsl", "wsl.exe",
]);

const BROAD_FLAG_SUBSTRINGS = [
  "allow-all", "unrestricted", "no-sandbox", "dangerously-skip-permissions",
  "full-access", "--yolo", "skip-confirmation", "trust-all",
];

// Ordered so a more specific vendor shape is named before a generic fallback
// would otherwise also match part of it.
const TOKEN_SHAPE_PATTERNS = [
  { name: "OpenAI/Anthropic-style secret key", re: /\bsk-[A-Za-z0-9_-]{10,}\b/ },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "AWS access key ID", re: /\bAKIA[0-9A-Z]{12,}\b/ },
  { name: "Google OAuth access token", re: /\bya29\.[A-Za-z0-9_-]{10,}\b/ },
  { name: "bearer token", re: /\bBearer\s+[A-Za-z0-9._-]{15,}\b/i },
];

const SECRET_KEY_NAME = /token|key|secret|passwd|password|credential|apikey|auth/i;
const ENV_REF_SYNTAX = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$|^\$[A-Za-z_][A-Za-z0-9_]*$/;

const DOCKER_VALUE_FLAGS = new Set([
  "-e", "--env", "-v", "--volume", "-w", "--workdir", "--name",
  "--network", "-p", "--publish", "--entrypoint", "-u", "--user",
  "--mount", "--platform",
]);

/** Parses one of the accepted MCP config shapes into a flat, normalized list
 * of server entries. Accepts:
 *   - { "mcpServers": { "<name>": { command, args, env, ... } } }  (Claude
 *     Desktop, Claude Code, Cursor)
 *   - { "servers": { "<name>": { ... } } }                         (VS Code)
 *   - a bare object of "<name>": { ... } with no wrapper key
 *   - an array of [{ name, command, args, env, tools, ... }, ...]  (a
 *     generic list, or a manifest export that also carries each server's
 *     tool list)
 */
export function parseConfig(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`Not valid JSON: ${error.message}`);
  }
  if (value === null || typeof value !== "object") {
    throw new Error("Config must be a JSON object or array.");
  }

  let rawEntries;
  if (Array.isArray(value)) {
    rawEntries = value.map((item, i) => [item?.name || `server ${i + 1}`, item || {}]);
  } else {
    const map = value.mcpServers || value.servers || value;
    if (!map || typeof map !== "object" || Array.isArray(map)) {
      throw new Error('Expected an "mcpServers" or "servers" object, or a list of server entries.');
    }
    rawEntries = Object.entries(map);
  }
  if (rawEntries.length === 0) {
    throw new Error("No server entries found.");
  }

  return rawEntries.map(([name, cfg]) => normalizeEntry(name, cfg || {}));
}

function normalizeEntry(name, cfg) {
  return {
    name: String(name),
    command: typeof cfg.command === "string" ? cfg.command : null,
    args: Array.isArray(cfg.args) ? cfg.args.map(String) : [],
    env: cfg.env && typeof cfg.env === "object" && !Array.isArray(cfg.env) ? cfg.env : {},
    headers: cfg.headers && typeof cfg.headers === "object" && !Array.isArray(cfg.headers) ? cfg.headers : {},
    url: typeof cfg.url === "string" ? cfg.url : null,
    tools: Array.isArray(cfg.tools) ? cfg.tools : [],
  };
}

function finding(serverName, category, severity, detail) {
  return { serverName, category, severity, detail };
}

/** Broad filesystem/shell access: the command itself is a shell interpreter
 * (arbitrary code execution by design), an argument grants a known
 * broad-access flag, or an argument is exactly a root/home-directory path
 * handed to the server as its scope. */
export function checkBroadAccess(server) {
  const out = [];
  if (server.command && SHELL_COMMANDS.has(server.command.toLowerCase())) {
    out.push(finding(
      server.name, "broad-access", "high",
      `launches a shell interpreter ("${server.command}") directly -- this server can run arbitrary shell commands, not a fixed tool set.`,
    ));
  }
  for (const arg of server.args) {
    if (BROAD_PATHS.has(arg)) {
      out.push(finding(
        server.name, "broad-access", "high",
        `an argument grants access to "${arg}" -- the whole filesystem or home directory, not a scoped folder.`,
      ));
    }
    const lower = arg.toLowerCase();
    for (const flag of BROAD_FLAG_SUBSTRINGS) {
      if (lower.includes(flag)) {
        out.push(finding(
          server.name, "broad-access", "high",
          `an argument ("${arg}") matches a known broad-permission flag pattern ("${flag}").`,
        ));
        break;
      }
    }
  }
  return out;
}

function scanForTokenShapes(server, source, value) {
  const out = [];
  for (const { name: tokenName, re } of TOKEN_SHAPE_PATTERNS) {
    if (re.test(value)) {
      out.push(finding(
        server.name, "hardcoded-secret", "high",
        `${source} contains a value matching a known ${tokenName} format -- hardcoded in the config instead of referenced from the environment.`,
      ));
      return out; // one match per value is enough to flag it
    }
  }
  return out;
}

/** Secrets hardcoded as literals rather than referenced from the
 * environment: env/header values matching a known token shape (regardless
 * of key name), plus env/header keys that look like a secret but hold a
 * plain literal instead of a "${VAR}" / "$VAR" reference. Also scans launch
 * arguments for a token-shaped literal (e.g. "--api-key=sk-...."). */
export function checkHardcodedSecrets(server) {
  const out = [];
  for (const [source, bag] of [["env", server.env], ["a header", server.headers]]) {
    for (const [key, rawValue] of Object.entries(bag)) {
      if (typeof rawValue !== "string" || rawValue.length === 0) continue;
      const shapeHits = scanForTokenShapes(server, `${source} "${key}"`, rawValue);
      if (shapeHits.length > 0) {
        out.push(...shapeHits);
        continue;
      }
      if (SECRET_KEY_NAME.test(key) && !ENV_REF_SYNTAX.test(rawValue)) {
        out.push(finding(
          server.name, "hardcoded-secret", "medium",
          `${source} "${key}" looks like a secret but stores a literal value instead of an environment-variable reference (e.g. "\${${key.toUpperCase()}}").`,
        ));
      }
    }
  }
  for (const arg of server.args) {
    out.push(...scanForTokenShapes(server, "a launch argument", arg));
  }
  return out;
}

function firstNonFlag(args, { skipDockerValues = false } = {}) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("-")) return arg;
    if (skipDockerValues && DOCKER_VALUE_FLAGS.has(arg) && !arg.includes("=")) i++; // skip the flag's separate value
  }
  return null;
}

function npxPackageSpec(args) {
  const spec = firstNonFlag(args);
  if (!spec) return null;
  return spec;
}

function hasNpmVersionPin(spec) {
  // Scoped package ("@scope/name[@version]"): a version needs a second "@".
  if (spec.startsWith("@")) return spec.slice(1).includes("@");
  return spec.includes("@");
}

function dockerImageRef(args) {
  const runIndex = args.indexOf("run");
  if (runIndex === -1) return null;
  return firstNonFlag(args.slice(runIndex + 1), { skipDockerValues: true });
}

/** Missing version pin: the package or image the config launches has no
 * explicit version, so the server that runs today may not be the server
 * that runs tomorrow. Covers the launcher shapes actually seen in MCP
 * configs: `npx`, `uvx`, `pipx run`, and `docker run`. */
export function checkVersionPin(server) {
  if (!server.command) return [];
  const command = server.command.toLowerCase();
  const out = [];

  if (command === "npx") {
    const spec = npxPackageSpec(server.args);
    if (spec && !hasNpmVersionPin(spec)) {
      out.push(finding(
        server.name, "unpinned-version", "medium",
        `runs "npx ${spec}" with no "@version" pin -- npx resolves whatever the registry currently publishes as latest.`,
      ));
    }
  } else if (command === "uvx") {
    const spec = firstNonFlag(server.args);
    if (spec && !spec.includes("==") && !spec.includes("@")) {
      out.push(finding(
        server.name, "unpinned-version", "medium",
        `runs "uvx ${spec}" with no version pin (no "==version" or "@ref").`,
      ));
    }
  } else if (command === "pipx") {
    const runIndex = server.args.indexOf("run");
    if (runIndex !== -1) {
      const spec = firstNonFlag(server.args.slice(runIndex + 1));
      if (spec && !spec.includes("==")) {
        out.push(finding(
          server.name, "unpinned-version", "medium",
          `runs "pipx run ${spec}" with no "==version" pin.`,
        ));
      }
    }
  } else if (command === "docker") {
    const image = dockerImageRef(server.args);
    if (image) {
      const tag = image.includes(":") ? image.slice(image.lastIndexOf(":") + 1) : null;
      if (!tag || tag === "latest") {
        out.push(finding(
          server.name, "unpinned-version", "medium",
          `runs docker image "${image}"${tag === "latest" ? ' pinned to "latest"' : " with no tag"} -- "latest" is not a pin; it is whatever was pushed most recently.`,
        ));
      }
    }
  }
  return out;
}

/** Duplicate/shadowing tool names across servers. Only runs when the pasted
 * data happens to include each server's own tool list (mcp.json launch
 * configs usually do not -- that comes from calling the server, e.g. an
 * `mcp-supply-chain-watch`-style captured manifest). Two servers exposing a
 * tool with the same name is a real risk even when neither config line is
 * individually wrong: whichever server the client resolves the name against
 * silently shadows the other. */
export function checkDuplicateTools(servers) {
  const owners = new Map(); // toolName -> [serverName, ...]
  for (const server of servers) {
    for (const tool of server.tools) {
      const toolName = typeof tool === "string" ? tool : tool?.name;
      if (!toolName) continue;
      if (!owners.has(toolName)) owners.set(toolName, []);
      owners.get(toolName).push(server.name);
    }
  }
  const out = [];
  for (const [toolName, serverNames] of owners) {
    if (serverNames.length > 1) {
      out.push({
        serverName: serverNames.join(", "),
        category: "duplicate-tool-name",
        severity: "medium",
        detail: `tool "${toolName}" is exposed by more than one connected server (${serverNames.join(", ")}) -- whichever one the client resolves the name against silently shadows the rest.`,
      });
    }
  }
  return out;
}

const CATEGORY_ORDER = ["broad-access", "hardcoded-secret", "unpinned-version", "duplicate-tool-name"];

/** Runs every check against a parsed config and returns the servers plus
 * every finding, sorted by category then severity so the most actionable
 * items (broad access, then secrets) lead. */
export function auditConfig(servers) {
  if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error("At least one server is required.");
  }
  const findings = [];
  for (const server of servers) {
    findings.push(...checkBroadAccess(server));
    findings.push(...checkHardcodedSecrets(server));
    findings.push(...checkVersionPin(server));
  }
  findings.push(...checkDuplicateTools(servers));
  findings.sort((a, b) => {
    const cat = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (cat !== 0) return cat;
    if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1;
    return a.serverName.localeCompare(b.serverName);
  });
  const counts = { high: 0, medium: 0 };
  for (const f of findings) counts[f.severity]++;
  return { servers, findings, counts };
}

/** Plain-text summary suitable for pasting into a review note or ticket. */
export function summaryText({ servers, findings, counts }) {
  const lines = [
    `MCP config risk check: ${servers.length} server(s), ${findings.length} finding(s) (${counts.high} high, ${counts.medium} medium).`,
  ];
  if (findings.length === 0) {
    lines.push("No structural risk patterns observed in this config. This is not a claim that the config is safe -- only that none of this tool's mechanical checks fired.");
  } else {
    for (const f of findings) {
      lines.push(`[${f.severity.toUpperCase()}] ${f.serverName} -- ${f.category}: ${f.detail}`);
    }
  }
  lines.push("Mechanical checks only -- review every finding yourself before acting on it. This is not a security audit.");
  return lines.join("\n");
}
