// Browser port of check.py's classification logic, kept in lock-step so the
// verdict a visitor sees on this page matches the CLI exactly. Operates on
// plain pasted Dockerfile text -- nothing here calls any network API, and
// nothing here parses a Dockerfile with a library: it uses the same small
// line-by-line regex scan check.py does, on purpose, so the two never
// disagree about what a line means.
//
// classify.test.mjs pins this port against the same fixtures test_check.py
// uses, plus a parity test that shells out to `python3 check.py` and asserts
// identical findings on the same input.

export const PINNED = "pinned";
export const MUTABLE = "mutable";
export const STAGE = "stage";
export const SCRATCH = "scratch";
export const VARIABLE = "variable";
export const UNRESOLVED = "unresolved";

export const RISK_CLASSIFICATIONS = new Set([MUTABLE, UNRESOLVED]);

// A digest reference is `@<algorithm>:<hex>`. The reference grammar allows
// any lowercase alphanumeric algorithm with at least 32 hex characters; the
// OCI image spec fixes sha256 at exactly 64 and sha512 at exactly 128
// lowercase hex characters. Mirrors check.py's digest_is_valid.
const DIGEST_RE = /^([a-z0-9]+(?:[+._-][a-z0-9]+)*):([0-9a-fA-F]{32,})$/;
const REGISTERED_DIGEST_HEX = { sha256: 64, sha512: 128 };

export function digestIsValid(digest) {
  const m = DIGEST_RE.exec(digest);
  if (!m) return false;
  const want = REGISTERED_DIGEST_HEX[m[1]];
  if (want === undefined) return true;
  return m[2].length === want && m[2] === m[2].toLowerCase();
}

const ARG_RE = /^\s*ARG\s+(.+?)\s*$/i;
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const VAR_RE = /\$(?:\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-+])([^}]*))?\}|([A-Za-z_][A-Za-z0-9_]*))/g;

/** Record each `NAME` or `NAME=value` of one ARG instruction in `args`
 * (a Map; a name with no default maps to null). Mirrors check.py's parse_arg. */
export function parseArg(body, args) {
  for (const token of body.split(/\s+/).filter(Boolean)) {
    const eq = token.indexOf("=");
    const name = eq === -1 ? token : token.slice(0, eq);
    if (!NAME_RE.test(name)) continue;
    if (eq === -1) {
      if (!args.has(name)) args.set(name, null);
      continue;
    }
    let value = token.slice(eq + 1);
    if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }
    const { text, missing } = expandArgs(value, args);
    args.set(name, missing.length ? null : text);
  }
}

/** Substitute build args as a plain `docker build` would. Returns
 * {text, missing}. Mirrors check.py's expand_args. */
export function expandArgs(text, args) {
  const missing = [];
  const out = text.replace(VAR_RE, (whole, braced, op, word = "", bare) => {
    const name = braced || bare;
    const value = args.has(name) ? args.get(name) : null;
    const isSet = value !== null;
    if (op === ":-") return isSet && value !== "" ? value : word;
    if (op === "-") return isSet ? value : word;
    if (op === ":+") return isSet && value !== "" ? word : "";
    if (op === "+") return isSet ? word : "";
    if (!isSet) {
      missing.push(name);
      return whole;
    }
    return value;
  });
  if (out.includes("$") && !missing.length) missing.push(out);
  return { text: out, missing };
}

// Matches a `FROM` instruction, tolerating the optional `--platform=...` flag
// and an optional `AS <stage-name>` suffix. Mirrors check.py's _FROM_RE
// exactly, case-insensitively.
const FROM_RE = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?\s*(?:#.*)?$/i;

function looksVariable(text) {
  return text.includes("$");
}

/** Split an image reference into {name, tag, digest}. Mirrors
 * check.py's split_name_and_ref: the tag is read only from the last
 * `/`-separated path segment, so a `registry:port/` prefix is never
 * misread as a tag. */
export function splitNameAndRef(ref) {
  const at = ref.indexOf("@");
  if (at !== -1) {
    return { name: ref.slice(0, at), tag: null, digest: ref.slice(at + 1) };
  }
  const lastSlash = ref.lastIndexOf("/");
  const tail = ref.slice(lastSlash + 1);
  if (tail.includes(":")) {
    const prefix = ref.slice(0, lastSlash + 1);
    const colonIndex = tail.lastIndexOf(":");
    const repo = tail.slice(0, colonIndex);
    const tag = tail.slice(colonIndex + 1);
    return { name: `${prefix}${repo}`, tag, digest: null };
  }
  return { name: ref, tag: null, digest: null };
}

/** Classify one `FROM` reference. Returns {classification, name, tag, digest}. */
export function classifyFrom(ref, stageNames) {
  // BuildKit matches stage names case-insensitively; scanText stores them
  // lowercased.
  if (stageNames.has(ref.toLowerCase())) {
    return { classification: STAGE, name: ref, tag: null, digest: null };
  }
  if (ref.toLowerCase() === "scratch") {
    return { classification: SCRATCH, name: ref, tag: null, digest: null };
  }
  if (looksVariable(ref)) {
    return { classification: VARIABLE, name: ref, tag: null, digest: null };
  }

  const { name, tag, digest } = splitNameAndRef(ref);

  if (digest !== null) {
    if (digestIsValid(digest)) {
      return { classification: PINNED, name, tag: null, digest };
    }
    // Malformed digest-shaped suffix -- not this tool's job to validate
    // Dockerfile syntax, but not silently dropped either.
    return { classification: MUTABLE, name, tag: null, digest };
  }

  return { classification: MUTABLE, name, tag, digest: null };
}

/** The exact, read-only command to look up the digest a mutable tag
 * currently resolves to. This page never runs it. */
export function remediationCommand(name, tag) {
  if (!tag) {
    // A malformed digest on a tagged image keeps its tag in `name`.
    ({ name, tag } = splitNameAndRef(name));
  }
  const ref = tag ? `${name}:${tag}` : `${name}:latest`;
  return `docker buildx imagetools inspect ${ref}`;
}

const DIRECTIVE_RE = /^#\s*([a-zA-Z][a-zA-Z0-9]*)\s*=\s*(.+?)\s*$/;
const KNOWN_DIRECTIVES = new Set(["syntax", "escape", "check"]);

/** The line-continuation character a `# escape=` parser directive sets, or
 * a backslash. BuildKit reads directives only at the very top of the file,
 * before any blank line, comment or instruction, and an unknown directive
 * ends the run. Windows Dockerfiles set escape=` so a path like `C:\app\`
 * at the end of a line is not a continuation. Mirrors check.py's
 * escape_char. */
export function escapeChar(text) {
  let escape = "\\";
  for (const line of text.split(/\r\n|\r|\n/)) {
    const m = DIRECTIVE_RE.exec(line.trim());
    if (!m || !KNOWN_DIRECTIVES.has(m[1].toLowerCase())) break;
    if (m[1].toLowerCase() === "escape" && (m[2] === "\\" || m[2] === "`")) escape = m[2];
  }
  return escape;
}

// A heredoc opener as BuildKit reads one: a word of a RUN, COPY or ADD
// instruction shaped `<<NAME`, `<<-NAME`, `<<"NAME"` or `2<<NAME`. The lines
// after the instruction up to a line equal to NAME (leading tabs ignored for
// `<<-`) are the heredoc's body, not instructions. Mirrors check.py's
// heredoc_terminators.
const HEREDOC_INSTRUCTIONS = new Set(["RUN", "COPY", "ADD"]);
const HEREDOC_WORD_RE = /^\d*<<(-?)(["']?)([^<"'\s]+)\2$/;

/** The heredoc terminators one joined instruction opens, in order, as
 * [{name, chomp}]. Empty for an instruction that opens none. */
export function heredocTerminators(instruction) {
  const words = instruction.trim().split(/\s+/);
  if (!HEREDOC_INSTRUCTIONS.has((words[0] || "").toUpperCase())) return [];
  const out = [];
  for (const word of words.slice(1)) {
    const m = HEREDOC_WORD_RE.exec(word);
    if (m) out.push({ name: m[3], chomp: m[1] === "-" });
  }
  return out;
}

/** True when `line` closes the heredoc `pending` describes. */
function closesHeredoc(line, pending) {
  let candidate = line.replace(/\r$/, "");
  if (pending.chomp) candidate = candidate.replace(/^\t+/, "");
  return candidate === pending.name;
}

/** Join continued lines into one instruction, the way BuildKit reads them,
 * and drop comment lines. The continuation character is a backslash unless
 * an `# escape=` directive changes it. Returns [startLineNumber, text]
 * pairs. Comment and blank lines inside a continuation are skipped, as
 * BuildKit does. The body of a `RUN <<EOF` / `COPY <<EOF` heredoc is
 * skipped: a `FROM` line written into a nested Dockerfile is not an
 * instruction of this one. Mirrors check.py's logical_lines. */
export function logicalLines(text) {
  const escape = escapeChar(text);
  const out = [];
  let buffer = null;
  let start = 0;
  let heredocs = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (heredocs.length) {
      if (closesHeredoc(line, heredocs[0])) heredocs.shift();
      continue;
    }
    const stripped = line.trim();
    if (buffer === null) {
      if (stripped.startsWith("#")) continue;
      start = i + 1;
      buffer = "";
    } else if (stripped === "" || stripped.startsWith("#")) {
      continue;
    }
    const trimmed = line.trimEnd();
    if (trimmed.endsWith(escape)) {
      buffer += trimmed.slice(0, -1) + " ";
    } else {
      out.push([start, buffer + line]);
      heredocs = heredocTerminators(buffer + line);
      buffer = null;
    }
  }
  if (buffer !== null) out.push([start, buffer]);
  return out;
}

/** Scan one Dockerfile's text. Returns a list of finding objects, in the
 * same shape check.py's --format json emits. `filename` is carried through
 * for display only. When `stats` is an object, its `fromLines` count grows
 * by the number of FROM instructions read. */
export function scanText(text, filename = "<Dockerfile>", stats = null) {
  const findings = [];
  const stageNames = new Set();
  const globalArgs = new Map();
  let seenFrom = false;
  for (const [lineNumber, line] of logicalLines(text)) {
    if (!seenFrom) {
      const arg = ARG_RE.exec(line);
      if (arg) {
        parseArg(arg[1], globalArgs);
        continue;
      }
    }
    const match = FROM_RE.exec(line);
    if (!match) continue;
    seenFrom = true;
    if (stats) stats.fromLines = (stats.fromLines ?? 0) + 1;
    const original = match[1];
    const alias = match[2];
    let ref = original;
    let missing = [];
    if (looksVariable(ref)) ({ text: ref, missing } = expandArgs(ref, globalArgs));
    let classification, name, tag, digest;
    if (missing.length) {
      [classification, name, tag, digest] = [UNRESOLVED, original, null, null];
      const at = original.lastIndexOf("@");
      const afterAt = at === -1 ? "" : original.slice(at + 1);
      if (at !== -1 && !afterAt.includes("$") && digestIsValid(afterAt)) {
        [classification, name, digest] = [PINNED, original.slice(0, at), afterAt];
      }
    } else {
      ({ classification, name, tag, digest } = classifyFrom(ref, stageNames));
    }
    if (alias) stageNames.add(alias.toLowerCase());
    if (classification !== PINNED && classification !== MUTABLE && classification !== UNRESOLVED) continue;
    const finding = { file: filename, line: lineNumber, image: name, tag, digest, classification };
    if (original !== ref || missing.length) finding.from_arg = original;
    if (classification === MUTABLE) {
      finding.remediation = remediationCommand(name, tag);
    }
    if (classification === UNRESOLVED) {
      const names = [...new Set(missing.filter((m) => NAME_RE.test(m)))].sort();
      finding.unresolved_args = names;
      finding.note =
        "no ARG default before the first FROM sets " +
        (names.length ? names.join(", ") : "this substitution") +
        "; give it one pinned to a digest, or check what --build-arg passes";
    }
    findings.push(finding);
  }
  return findings;
}

/** Scan one or more pasted Dockerfiles at once. `files` is an array of
 * {name, text}. Returns the concatenated findings, in the order given. */
export function scanFiles(files, stats = null) {
  const findings = [];
  for (const file of files) {
    findings.push(...scanText(file.text, file.name || "<Dockerfile>", stats));
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
export function summaryLine(findings, fromLines = 0) {
  if (!findings.length) {
    return fromLines
      ? `All ${fromLines} FROM line${fromLines === 1 ? " is" : "s are"} scratch or earlier build stages, so nothing is pulled from a registry.`
      : "No FROM lines found to classify.";
  }
  const counts = classificationCounts(findings);
  const mutable = counts[MUTABLE] ?? 0;
  const pinned = counts[PINNED] ?? 0;
  const unresolved = counts[UNRESOLVED] ?? 0;
  const unresolvedText = unresolved
    ? ` ${unresolved} built from a build arg with no default, so not shown to be pinned.`
    : "";
  if (mutable) {
    return `${mutable} mutable base image reference${mutable === 1 ? "" : "s"} found, ${pinned} already pinned to a digest.${unresolvedText}`;
  }
  if (unresolved) {
    return `No mutable tag found, ${pinned} pinned to a digest.${unresolvedText}`;
  }
  return `Every base image reference is pinned to a content digest. (${pinned} checked.)`;
}
