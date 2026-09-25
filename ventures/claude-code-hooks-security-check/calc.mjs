// Claude Code Hooks Security Check -- deterministic, mechanical pattern
// checks against the *command strings* inside a pasted Claude Code hooks
// configuration (the "hooks" section of settings.json/settings.local.json,
// or a standalone hooks-only object). Claude Code hooks run automatically,
// with no confirmation prompt, on every matching tool call -- so a command
// with a dangerous shape in a hook is a shape that fires unattended, every
// time, for everyone who trusts that project's settings.
//
// This is deliberately a different object and a different question from
// ventures/claude-code-settings-check: that tool asks "is this hook or
// permission rule shaped correctly" (does the matcher compile, is there a
// command at all). This tool assumes the JSON is well-formed and asks "does
// the command text itself match a known-dangerous shape" -- a remote
// download piped straight into a shell, a credential file read and sent
// over the network in the same line, a broad recursive delete with no
// guard, and half a dozen other shapes documented below.
//
// LIABILITY DISCIPLINE (see PRODUCT_PLAYBOOK.md 5b): this module never
// executes anything, never contacts a network, and never claims a command
// is safe -- only that it does, or does not, match one of the specific
// textual shapes below. A command that matches nothing here can still be
// dangerous in a way this tool doesn't recognise (a novel shape, an
// obfuscated one, or one that only becomes dangerous given a specific
// environment) -- see why-a-clean-scan-isnt-a-safety-guarantee.html. A
// command that matches is not proof of malice either -- `rm -rf /tmp/*` is
// a completely ordinary cleanup line that happens to share a broad-delete
// shape; every finding is worded as "worth a look", not a verdict.

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finding(source, category, severity, detail) {
  return { source, category, severity, detail };
}

/** Parses the pasted text as JSON and returns the object to treat as the
 * hooks map: if the parsed object has a "hooks" key, use that (so a full
 * settings.json paste works); otherwise treat the whole object as the hooks
 * map itself (so a standalone `{"PreToolUse": [...]}` paste also works). */
export function parseHooksInput(text) {
  const trimmed = String(text ?? "").trim();
  if (trimmed === "") return { ok: true, supplied: false, hooks: null, error: null };
  let data;
  try {
    data = JSON.parse(trimmed);
  } catch (err) {
    return { ok: false, supplied: true, hooks: null, error: `Not valid JSON: ${err.message}` };
  }
  if (!isPlainObject(data)) {
    return { ok: false, supplied: true, hooks: null, error: `Must be a JSON object at the top level, not ${Array.isArray(data) ? "an array" : typeof data}.` };
  }
  const hooks = isPlainObject(data.hooks) ? data.hooks : data;
  return { ok: true, supplied: true, hooks, error: null };
}

/** Walks a hooks map (event name -> array of matcher groups -> "hooks"
 * array of {type, command}) and returns every command string found, each
 * tagged with where it came from. Malformed shapes are skipped silently
 * here -- structural validation is claude-code-settings-check's job, not
 * this tool's; this tool only scans whatever command strings it can find. */
export function extractCommands(hooks) {
  const out = [];
  if (!isPlainObject(hooks)) return out;
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    groups.forEach((group, i) => {
      if (!isPlainObject(group) || !Array.isArray(group.hooks)) return;
      group.hooks.forEach((hook, j) => {
        if (!isPlainObject(hook) || typeof hook.command !== "string" || hook.command.trim() === "") return;
        out.push({
          source: `hooks.${event}[${i}].hooks[${j}]`,
          event,
          matcher: typeof group.matcher === "string" ? group.matcher : null,
          command: hook.command,
        });
      });
    });
  }
  return out;
}

// ---- pattern checks -------------------------------------------------------
//
// Each check takes one command string and returns null (no match) or a
// detail string. Split on shell separators with plain string/regex
// operations rather than a real shell parser -- this tool only needs to
// notice a shape, not execute the command, and a real parser would still
// be fooled by anything creative enough to fool these patterns too.

function pipeSegments(command) {
  return command.split("|").map((s) => s.trim()).filter(Boolean);
}

function statementParts(command) {
  return command.split(/;|&&|\|\||\n/).map((s) => s.trim()).filter(Boolean);
}

const RE_DOWNLOAD_START = /\b(curl|wget)\b/i;
const RE_SHELL_INTERP_START = /^(sudo\s+)?(sh|bash|zsh|dash|ksh|python[23]?|node|perl|ruby|powershell(\.exe)?|pwsh)\b/i;

function checkRemotePipeToShell(command) {
  const segs = pipeSegments(command);
  for (let i = 0; i < segs.length - 1; i++) {
    const dl = segs[i].match(RE_DOWNLOAD_START);
    const sh = segs[i + 1].match(RE_SHELL_INTERP_START);
    if (dl && sh) {
      return `pipes a "${dl[0]}" download straight into "${sh[0]}" -- runs whatever the remote server returns at the moment the hook fires, with nobody reviewing it first`;
    }
  }
  return null;
}

const RE_PS_DOWNLOAD = /Invoke-WebRequest|iwr\b|New-Object\s+Net\.WebClient|DownloadString/i;
const RE_PS_EXEC = /Invoke-Expression|\biex\b/i;

function checkPowerShellDownloadExecute(command) {
  if (RE_PS_DOWNLOAD.test(command) && RE_PS_EXEC.test(command)) {
    return `downloads content with PowerShell and executes it with Invoke-Expression/iex in the same command -- the PowerShell equivalent of curl-piped-to-a-shell`;
  }
  return null;
}

const BROAD_RM_TARGETS = new Set(["/", "~", "*", ".", "..", "$HOME", "${HOME}", "/*", "~/*", "~/", "/home", "/home/*"]);
const RE_RECURSIVE_FORCE_FLAG = /^-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*$|^-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*$/i;

function checkBroadRecursiveDelete(command) {
  for (const part of statementParts(command)) {
    const tokens = part.split(/\s+/).filter(Boolean);
    const rmIdx = tokens.findIndex((t) => t === "rm" || t.endsWith("/rm"));
    if (rmIdx === -1) continue;
    const rest = tokens.slice(rmIdx + 1);
    const hasRecursiveForce =
      rest.some((t) => RE_RECURSIVE_FORCE_FLAG.test(t)) ||
      (rest.includes("-r") && rest.includes("-f")) ||
      (rest.includes("--recursive") && (rest.includes("--force") || rest.some((t) => /^-[a-zA-Z]*f/.test(t))));
    if (!hasRecursiveForce) continue;
    const broadTarget = rest.find(
      (t) => BROAD_RM_TARGETS.has(t) || t.startsWith("/*") || /^\$\{?HOME\}?\/?\*?$/.test(t),
    );
    if (broadTarget) {
      return `recursively deletes an unguarded broad path ("${broadTarget}") -- worth confirming this is exactly the path intended before letting it fire unattended`;
    }
  }
  return null;
}

const SENSITIVE_PATH_RE =
  /(~|\$HOME|\/home\/[^/\s"']+|\/Users\/[^/\s"']+)?\/?\.(ssh\/(id_rsa|id_ed25519|id_ecdsa|id_dsa)(\.pub)?\b|aws\/credentials\b|aws\/config\b|netrc\b|npmrc\b|git-credentials\b|kube\/config\b|docker\/config\.json\b|pypirc\b|gnupg\/|config\/gcloud\/)/i;

function findSensitivePath(command) {
  const match = command.match(SENSITIVE_PATH_RE);
  return match ? match[0] : null;
}

function checkCredentialFileRead(command) {
  const path = findSensitivePath(command);
  return path ? `reads a credential path (${path})` : null;
}

const NETWORK_SEND_RE =
  /\bcurl\b[^\n|;&]*(-d\b|--data(-raw|-binary)?\b|-F\b|--form\b|-T\b|--upload-file\b)|\bwget\b[^\n|;&]*--post-(data|file)\b|\bnc\b|\bncat\b|\/dev\/tcp\/|\bscp\s+\S+\s+\S+@|\bssh\s+\S+@\S+\s*</i;

function checkCredentialExfiltration(command) {
  const path = findSensitivePath(command);
  if (!path) return null;
  if (NETWORK_SEND_RE.test(command)) {
    return `reads a credential path (${path}) and the same command line also sends data out over the network -- a strong exfiltration shape, not just a read`;
  }
  return null;
}

const ENV_DUMP_RE = /\b(env|printenv|export\s+-p)\b/;

function checkEnvExfiltration(command) {
  if (!ENV_DUMP_RE.test(command)) return null;
  if (NETWORK_SEND_RE.test(command) || /\|\s*(curl|wget|nc|ncat)\b/i.test(command)) {
    return `dumps environment variables (env/printenv/export -p) and the same command line also sends data out over the network`;
  }
  return null;
}

const TLS_DISABLED_RE =
  /\bcurl\b[^\n|;&]*(-k\b|--insecure\b)|\bwget\b[^\n|;&]*--no-check-certificate\b|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|http\.sslVerify\s+false|verify\s*=\s*False\b/i;

function checkTlsVerificationDisabled(command) {
  return TLS_DISABLED_RE.test(command)
    ? "disables TLS/certificate verification for a network request -- makes every request in this command vulnerable to interception"
    : null;
}

const PERSISTENCE_RE =
  />>\s*\S*\.(bashrc|zshrc|bash_profile|profile|zprofile)\b|\bcrontab\s+-\b|>\s*\/etc\/cron|LaunchAgents|systemctl\s+--user\s+enable/i;

function checkPersistence(command) {
  return PERSISTENCE_RE.test(command)
    ? "appends to a shell startup file, crontab, or a user service -- runs again on a future login/boot, independent of this hook firing again"
    : null;
}

const CHMOD_WORLD_WRITABLE_RE = /\bchmod\b[^\n|;&]*\b(777|a\+w|o\+w)\b/i;

function checkWorldWritablePermissions(command) {
  return CHMOD_WORLD_WRITABLE_RE.test(command)
    ? "grants world-writable permissions (777 / a+w / o+w) -- any local user or process can then modify the target"
    : null;
}

const OBFUSCATED_EXEC_RE = /base64\s+(-d|--decode)\b[^\n|;&]*\|\s*(sudo\s+)?(sh|bash|zsh)\b|\|\s*base64\s+(-d|--decode)\s*\|\s*(sudo\s+)?(sh|bash|zsh)\b/i;

function checkObfuscatedExecute(command) {
  return OBFUSCATED_EXEC_RE.test(command)
    ? "base64-decodes a payload and pipes it straight into a shell -- the same risk as a remote pipe-to-shell, with the extra step of hiding the payload from a quick read"
    : null;
}

const DETACHED_RE = /\bnohup\b[\s\S]*&\s*(disown)?\s*$|\bsetsid\b|\bscreen\s+-dm\b|\btmux\s+new-session\s+-d\b|\bat\s+now\b/i;

function checkDetachedBackgroundProcess(command) {
  return DETACHED_RE.test(command)
    ? "starts a process detached from this hook invocation (nohup/setsid/screen -dm/tmux -d/at now) -- worth confirming it is meant to keep running after the hook returns"
    : null;
}

// Order matters only for readability of the findings list; severities are
// independent per category.
const CHECKS = [
  { category: "remote-pipe-to-shell", severity: "high", run: checkRemotePipeToShell },
  { category: "remote-pipe-to-shell", severity: "high", run: checkPowerShellDownloadExecute },
  { category: "broad-recursive-delete", severity: "high", run: checkBroadRecursiveDelete },
  { category: "credential-exfiltration", severity: "high", run: checkCredentialExfiltration },
  { category: "env-exfiltration", severity: "high", run: checkEnvExfiltration },
  { category: "obfuscated-payload-execute", severity: "high", run: checkObfuscatedExecute },
  { category: "credential-file-read", severity: "medium", run: checkCredentialFileRead },
  { category: "tls-verification-disabled", severity: "medium", run: checkTlsVerificationDisabled },
  { category: "persistence", severity: "medium", run: checkPersistence },
  { category: "world-writable-permissions", severity: "medium", run: checkWorldWritablePermissions },
  { category: "detached-background-process", severity: "low", run: checkDetachedBackgroundProcess },
];

/** Runs every pattern check against one command string. Skips
 * credential-file-read when credential-exfiltration already fired for the
 * same command, so a single read-and-send line produces one finding (the
 * more specific, higher-severity one) rather than two describing the same
 * fact. */
export function scanCommand(command) {
  const out = [];
  let exfiltrationFired = false;
  for (const { category, severity, run } of CHECKS) {
    const detail = run(command);
    if (!detail) continue;
    if (category === "credential-exfiltration") exfiltrationFired = true;
    if (category === "credential-file-read" && exfiltrationFired) continue;
    out.push({ category, severity, detail });
  }
  return out;
}

function countSeverities(findings) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  return counts;
}

/** Top-level entry point: scans every command string in a pasted hooks
 * configuration and returns the full findings list. */
export function scanHooks(text) {
  const parsed = parseHooksInput(text);
  const findings = [];
  let commands = [];
  if (!parsed.ok) {
    findings.push(finding("input", "invalid-json", "high", parsed.error));
  } else if (parsed.supplied) {
    commands = extractCommands(parsed.hooks);
    for (const { source, command } of commands) {
      for (const { category, severity, detail } of scanCommand(command)) {
        findings.push(finding(source, category, severity, detail));
      }
    }
  }
  return { parsed, commands, findings, counts: countSeverities(findings) };
}

/** Plain-text summary suitable for pasting into a review note or PR. */
export function summaryText({ findings, counts, commands }) {
  const lines = [
    `Claude Code hooks security check: ${commands.length} command(s) scanned, ${findings.length} finding(s) (${counts.high} high, ${counts.medium} medium, ${counts.low} caution).`,
  ];
  if (findings.length === 0) {
    lines.push(
      commands.length === 0
        ? "No hook commands found to scan."
        : "None of this tool's known-dangerous patterns matched. This is not a safety guarantee -- see \"Why a clean scan isn't a safety guarantee.\"",
    );
  } else {
    for (const f of findings) {
      lines.push(`[${f.severity.toUpperCase()}] ${f.source} -- ${f.category}: ${f.detail}`);
    }
  }
  lines.push("Mechanical, textual pattern checks only -- review every finding yourself. A match is worth a look, not a verdict, and a clean scan does not mean a command is safe.");
  return lines.join("\n");
}
