// Browser port of check.py's classification logic, kept in lock-step so the
// verdict a visitor sees on this page matches the CLI exactly. Operates on
// plain pasted Dockerfile text -- nothing here calls any network API, and
// nothing here parses a Dockerfile with a library: it uses the same small
// line-by-line, name-pattern scan check.py does, on purpose, so the two
// never disagree about what an instruction means.
//
// classify.test.mjs pins this port against the same fixtures test_check.py
// uses, plus a parity test that shells out to `python3 check.py` and asserts
// identical findings on the same input.

export const ENV_SECRET = "env-secret";
export const ARG_LITERAL = "arg-literal";
export const ARG_DECLARED = "arg-declared";
export const SENSITIVE_COPY = "sensitive-copy";

export const RISK_CLASSIFICATIONS = new Set([ENV_SECRET, ARG_LITERAL, SENSITIVE_COPY]);

// Name-pattern heuristic, not a value scanner. Mirrors check.py's
// SECRET_NAME_SUBSTRINGS exactly.
export const SECRET_NAME_SUBSTRINGS = [
  "SECRET",
  "PASSWORD",
  "PASSWD",
  "PWD",
  "TOKEN",
  "APIKEY",
  "ACCESSKEY",
  "PRIVATEKEY",
  "CLIENTSECRET",
  "CREDENTIAL",
  "SIGNINGKEY",
  "ENCRYPTIONKEY",
  "SSHKEY",
  "GPGKEY",
  "AUTHKEY",
];

const SENSITIVE_BASENAME_RE = /^(\.env(\..+)?|id_rsa|id_dsa|id_ecdsa|id_ed25519|.*\.pem|\.npmrc|\.pypirc|\.netrc|\.git-credentials|\.htpasswd|\.dockercfg|credentials\.json)$/i;
const SENSITIVE_PATH_SUBSTRINGS = [".aws/credentials", ".docker/config.json", ".kube/config", "/.ssh/"];

const INSTRUCTION_RE = /^\s*(ARG|ENV|COPY|ADD)\s+(.*)$/i;
const ENV_PAIR_RE = /([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\S*)/g;
const ARG_RE = /^([A-Za-z_][A-Za-z0-9_]*)(?:=(.*))?$/;

export function looksSecret(name) {
  const normalized = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return SECRET_NAME_SUBSTRINGS.some((sub) => normalized.includes(sub));
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed[0] === trimmed[trimmed.length - 1] && '"\''.includes(trimmed[0])) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Yield {line, text} per Dockerfile logical line, joining a trailing
 * backslash continuation onto the following physical line. Mirrors
 * check.py's iter_logical_lines exactly. */
export function iterLogicalLines(text) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;
  const n = lines.length;
  while (i < n) {
    const start = i + 1;
    if (lines[i].trim().startsWith("#")) {
      out.push({ line: start, text: lines[i] });
      i += 1;
      continue;
    }
    const parts = [lines[i]];
    while (parts[parts.length - 1].replace(/\s+$/, "").endsWith("\\") && i + 1 < n) {
      parts[parts.length - 1] = parts[parts.length - 1].replace(/\s+$/, "").slice(0, -1);
      i += 1;
      parts.push(lines[i]);
    }
    out.push({ line: start, text: parts.map((p) => p.trim()).join(" ") });
    i += 1;
  }
  return out;
}

/** Parse an ENV instruction's remainder into [name, value] pairs. Mirrors
 * check.py's parse_env_pairs. */
export function parseEnvPairs(rest) {
  const pairs = [...rest.matchAll(ENV_PAIR_RE)];
  if (pairs.length) {
    return pairs.map(([, name, value]) => [name, stripQuotes(value)]);
  }
  const legacy = rest.match(/^\s*(\S+)(?:\s+([\s\S]*))?$/);
  if (!legacy) return [];
  const [, name, value] = legacy;
  return [[name, value !== undefined ? stripQuotes(value) : ""]];
}

/** Parse an ARG instruction's remainder into [name, defaultOrNull]. Mirrors
 * check.py's parse_arg -- `null` means no `=` at all (bare declaration). */
export function parseArg(rest) {
  const match = ARG_RE.exec(rest.trim());
  if (!match) return [null, null];
  const [, name, defaultValue] = match;
  if (defaultValue === undefined) return [name, null];
  return [name, stripQuotes(defaultValue)];
}

function isSensitiveSource(token) {
  const cleaned = token.replace(/^['"]|['"]$/g, "");
  const lowered = cleaned.toLowerCase();
  if (SENSITIVE_PATH_SUBSTRINGS.some((sub) => lowered.includes(sub))) return true;
  const basename = lowered.split("/").pop();
  return SENSITIVE_BASENAME_RE.test(basename);
}

/** Extract candidate source paths from a COPY/ADD instruction's remainder.
 * Mirrors check.py's parse_copy_sources. */
export function parseCopySources(rest) {
  const stripped = rest.trim();
  if (stripped.startsWith("[")) {
    let tokens;
    try {
      tokens = JSON.parse(stripped);
    } catch {
      return [];
    }
    if (!Array.isArray(tokens) || tokens.length < 2) return [];
    return tokens.slice(0, -1).map(String);
  }
  const tokens = stripped.split(/\s+/).filter((t) => t && !t.startsWith("--"));
  if (tokens.length < 2) return [];
  return tokens.slice(0, -1);
}

/** Scan one Dockerfile's text. Returns a list of finding objects, in the
 * same shape check.py's --format json emits. */
export function scanText(text, filename = "<Dockerfile>") {
  const findings = [];
  for (const { line: lineno, text: line } of iterLogicalLines(text)) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith("#")) continue;
    const match = INSTRUCTION_RE.exec(line);
    if (!match) continue;
    const instruction = match[1].toUpperCase();
    const rest = match[2];

    if (instruction === "ENV") {
      for (const [name, value] of parseEnvPairs(rest)) {
        if (!value || !looksSecret(name)) continue;
        findings.push({
          file: filename,
          line: lineno,
          instruction,
          name,
          classification: ENV_SECRET,
          remediation:
            `Pass ${name} with a BuildKit build secret instead: ` +
            `RUN --mount=type=secret,id=${name.toLowerCase()} ... ` +
            "(docs.docker.com/build/building/secrets/) -- a secret mounted " +
            "this way is available only during that RUN step and is never " +
            "written to a layer or the final image config.",
        });
      }
    } else if (instruction === "ARG") {
      const [name, defaultValue] = parseArg(rest);
      if (!name || !looksSecret(name)) continue;
      if (defaultValue) {
        findings.push({
          file: filename,
          line: lineno,
          instruction,
          name,
          classification: ARG_LITERAL,
          remediation:
            `A literal default for ${name} is committed to this Dockerfile. ` +
            "Remove the default and pass the value with a BuildKit build " +
            `secret instead: RUN --mount=type=secret,id=${name.toLowerCase()} ...`,
        });
      } else if (defaultValue === null) {
        findings.push({
          file: filename,
          line: lineno,
          instruction,
          name,
          classification: ARG_DECLARED,
          remediation:
            `If ${name} is meant to carry a secret at build time, mount it ` +
            `as a BuildKit build secret (RUN --mount=type=secret,id=${name.toLowerCase()}) ` +
            "rather than --build-arg, which BuildKit still records for the build.",
        });
      }
    } else if (instruction === "COPY" || instruction === "ADD") {
      for (const source of parseCopySources(rest)) {
        if (!isSensitiveSource(source)) continue;
        findings.push({
          file: filename,
          line: lineno,
          instruction,
          name: source,
          classification: SENSITIVE_COPY,
          remediation:
            `Add ${source} to .dockerignore so it is never sent to the build ` +
            "context. If the build genuinely needs it transiently, use " +
            "RUN --mount=type=secret or a multi-stage build that discards the " +
            "stage that copied it.",
        });
      }
    }
  }
  return findings;
}

/** Scan one or more pasted Dockerfiles at once. `files` is an array of
 * {name, text}. Returns the concatenated findings, in the order given. */
export function scanFiles(files) {
  const findings = [];
  for (const file of files) {
    findings.push(...scanText(file.text, file.name || "<Dockerfile>"));
  }
  return findings;
}

export function hasUnresolvedRisk(findings) {
  return findings.some((f) => RISK_CLASSIFICATIONS.has(f.classification));
}

/** Counts per classification. */
export function classificationCounts(findings) {
  const counts = {};
  for (const finding of findings) {
    counts[finding.classification] = (counts[finding.classification] ?? 0) + 1;
  }
  return counts;
}

/** One-line headline for the page. */
export function summaryLine(findings) {
  if (!findings.length) return "No secret-looking findings.";
  const counts = classificationCounts(findings);
  const risky = (counts[ENV_SECRET] ?? 0) + (counts[ARG_LITERAL] ?? 0) + (counts[SENSITIVE_COPY] ?? 0);
  const advisory = counts[ARG_DECLARED] ?? 0;
  if (risky) {
    return `${risky} high-risk finding${risky === 1 ? "" : "s"}, ${advisory} advisory-only.`;
  }
  return `No high-risk findings. (${advisory} advisory-only bare ARG declaration${advisory === 1 ? "" : "s"}.)`;
}
