// Claude Code Subagent Check -- deterministic, mechanical checks against one
// pasted Claude Code subagent definition file (the `.claude/agents/<name>.md`
// format: a YAML frontmatter block with `name`, `description`, and optional
// `tools`/`model` fields, followed by a Markdown system-prompt body). This
// module never contacts a network, never runs the subagent, and never claims
// to know whether Claude Code's orchestrator will actually delegate to it on
// a given request -- see PRODUCT_PLAYBOOK.md 5b: a tool that can't verify a
// fact live must not assert it. Every finding here is "worth a look", not a
// verdict that delegation will or will not fire correctly.
//
// Five things get checked, matching real, commonly-reported subagent
// authoring mistakes -- distinct from skill-manifest-check's SKILL.md checks
// because a subagent definition carries two fields a skill manifest does
// not (`tools`, which restricts what the subagent can call, and `model`,
// which picks which model runs it) and is matched for *delegation by an
// orchestrator*, not loaded by name:
//   1. Missing/malformed required frontmatter (no name, no description, a
//      name that isn't kebab-case, a name that doesn't match the file it
//      claims to be, missing or malformed "---" delimiters).
//   2. A description too vague to get picked for delegation reliably: too
//      short, missing a concrete trigger cue, or built almost entirely from
//      generic filler words.
//   3. A `tools` list with an entry that is empty (stray comma), duplicated,
//      or outside this tool's documented list of built-in tool names -- the
//      last one always a dated caution, never an error, because MCP and
//      custom tool names are open-ended.
//   4. A `model` value outside this tool's documented list of aliases and
//      not shaped like a full model id -- also a dated caution.
//   5. A near-empty or missing system-prompt body -- the subagent has
//      (almost) no instructions to run with.

// ---- frontmatter parsing ---------------------------------------------------
//
// Same minimal YAML subset skill-manifest-check parses (flat "key: value"
// pairs, quoted scalars, block scalars via ">"/"|" or a bare indented
// continuation, and simple "- item" lists) -- written independently for this
// venture's own object, not imported, because each published tool here runs
// standalone with no shared runtime dependency.

const DELIMITER_RE = /^---\s*$/;
const KEY_LINE_RE = /^([A-Za-z][A-Za-z0-9_-]*):(.*)$/;
const LIST_ITEM_RE = /^\s*-\s+(.*)$/;

function parseScalarValue(raw) {
  const value = raw.trim();
  if (
    value.length >= 2 &&
    ((value[0] === '"' && value[value.length - 1] === '"') ||
      (value[0] === "'" && value[value.length - 1] === "'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseFrontmatterBlock(frontmatterLines) {
  const data = {};
  const errors = [];
  let i = 0;
  while (i < frontmatterLines.length) {
    const line = frontmatterLines[i];
    if (line.trim() === "" || /^\s*#/.test(line)) {
      i++;
      continue;
    }
    if (/^\s/.test(line)) {
      errors.push(`Unexpected indentation on frontmatter line ${i + 1}: "${line.trim()}" -- expected a top-level "key: value" line.`);
      i++;
      continue;
    }
    const match = line.match(KEY_LINE_RE);
    if (!match) {
      errors.push(`Could not parse frontmatter line ${i + 1}: "${line}" (expected "key: value").`);
      i++;
      continue;
    }
    const key = match[1];
    const remainder = match[2].trim();
    i++;
    const isBlockIndicator = /^[>|][+-]?$/.test(remainder);
    if (remainder === "" || isBlockIndicator) {
      const contLines = [];
      while (i < frontmatterLines.length && (frontmatterLines[i].trim() === "" || /^\s/.test(frontmatterLines[i]))) {
        contLines.push(frontmatterLines[i]);
        i++;
      }
      while (contLines.length && contLines[contLines.length - 1].trim() === "") contLines.pop();
      if (contLines.length === 0) {
        data[key] = "";
      } else if (LIST_ITEM_RE.test(contLines[0])) {
        data[key] = contLines
          .filter((l) => LIST_ITEM_RE.test(l))
          .map((l) => parseScalarValue(l.match(LIST_ITEM_RE)[1]));
      } else {
        const indents = contLines.filter((l) => l.trim() !== "").map((l) => l.match(/^\s*/)[0].length);
        const minIndent = Math.min(...indents);
        const dedented = contLines.map((l) => l.slice(minIndent));
        data[key] = remainder.startsWith("|")
          ? dedented.join("\n")
          : dedented.map((l) => l.trim()).filter((l) => l !== "").join(" ");
      }
    } else {
      data[key] = parseScalarValue(remainder);
    }
  }
  return { data, errors };
}

/** Splits a pasted subagent definition into its frontmatter object and
 * Markdown system-prompt body, or reports why it could not. */
export function parseAgentFile(text) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (!DELIMITER_RE.test(lines[0] || "")) {
    return {
      ok: false,
      errors: ['Missing an opening "---" frontmatter delimiter as the very first line of the file.'],
      data: {},
      body: "",
    };
  }
  let closeIndex = -1;
  for (let j = 1; j < lines.length; j++) {
    if (DELIMITER_RE.test(lines[j])) {
      closeIndex = j;
      break;
    }
  }
  if (closeIndex === -1) {
    return {
      ok: false,
      errors: ['Missing the closing "---" delimiter -- the frontmatter block is never terminated.'],
      data: {},
      body: "",
    };
  }
  const { data, errors } = parseFrontmatterBlock(lines.slice(1, closeIndex));
  const body = lines.slice(closeIndex + 1).join("\n").replace(/^\n+/, "");
  return { ok: errors.length === 0, errors, data, body };
}

function finding(source, category, severity, detail) {
  return { source, category, severity, detail };
}

function isBlank(value) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

// ---- required fields: name, description ------------------------------------

const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Missing/malformed `name` and `description`. `expectedFilename`, if given
 * (without the .md extension), is compared against `name` -- Claude Code
 * derives no relationship between the two automatically, so a mismatch is a
 * caution against confusing yourself later, not a hard error. */
export function checkRequiredFields(parsed, expectedFilename) {
  const out = [];
  const { name, description } = parsed.data;

  if (isBlank(name)) {
    out.push(finding(
      "name", "missing-field", "high",
      'No "name" field in the frontmatter. This is how Claude Code identifies the subagent (for the "Task" tool and for /agents); without it the subagent cannot be invoked at all.',
    ));
  } else if (typeof name !== "string") {
    out.push(finding(
      "name", "missing-field", "high",
      'The "name" field is not a plain text value -- check for stray YAML structure (a list or nested mapping) where a single line is expected.',
    ));
  } else {
    if (!KEBAB_CASE_RE.test(name)) {
      out.push(finding(
        "name", "malformed-name", "medium",
        `"name: ${name}" is not kebab-case (lowercase letters, digits, and single hyphens, e.g. "code-reviewer"). A name outside this pattern is easy to mistype when invoking the subagent by name and some tooling rejects it outright.`,
      ));
    }
    const cleanExpected = (expectedFilename || "").trim().replace(/\.md$/i, "");
    if (cleanExpected !== "" && cleanExpected !== name) {
      out.push(finding(
        "name", "name-filename-mismatch", "medium",
        `"name: ${name}" does not match the filename you gave ("${cleanExpected}.md"). Claude Code does not cross-check the two -- a mismatch just means the subagent is invoked under a different name than the file suggests, which is easy to forget later.`,
      ));
    }
  }

  if (isBlank(description)) {
    out.push(finding(
      "description", "missing-field", "high",
      'No "description" field in the frontmatter. This is the one field the orchestrator matches a request against to decide whether to delegate to this subagent -- without it, delegation can never pick it automatically.',
    ));
  } else if (typeof description !== "string") {
    out.push(finding(
      "description", "missing-field", "high",
      'The "description" field is not a plain text value -- check for stray YAML structure where a single string is expected.',
    ));
  }

  return out;
}

// ---- description vagueness (tuned for delegation, not lookup) --------------

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "to", "for", "with", "this", "that", "these", "those", "it", "its",
  "is", "are", "was", "were", "you", "your", "yours", "user", "users", "can", "will", "should", "would",
  "could", "of", "in", "on", "at", "as", "be", "by", "from", "about", "when", "which", "who", "whom",
  "what", "i", "we", "our", "ours", "their", "they", "them", "he", "she", "his", "her", "subagent",
  "agent", "claude", "use", "used", "using", "uses", "if", "then", "so", "into", "over", "under", "via",
  "not", "no", "any", "all", "do", "does", "doing", "done", "get", "gets", "getting", "also", "more",
  "most", "such", "like", "than", "both", "each", "other", "others",
]);

// Filler that reads as concrete on its own but, in practice, appears almost
// exclusively in descriptions that name no actual delegation trigger --
// "helps with various tasks" matches every subagent and none of them.
const VAGUE_FILLER_WORDS = new Set([
  "helps", "help", "helping", "assist", "assists", "assisting", "assistance", "provide", "provides",
  "providing", "useful", "general", "generally", "various", "different", "things", "thing", "stuff",
  "tasks", "task", "work", "working", "handle", "handles", "handling", "manage", "manages", "managing",
  "management", "process", "processes", "processing", "support", "supports", "supporting", "capability",
  "capabilities", "functionality", "feature", "features", "related", "relevant", "purpose", "purposes",
  "needs", "need", "needed", "requests", "request", "questions", "question", "many", "complex", "simple",
  "powerful", "comprehensive", "efficient", "effective", "advanced", "wide", "range", "variety",
]);

const FILLER_WORDS = new Set([...STOPWORDS, ...VAGUE_FILLER_WORDS]);

// Concrete cues real, well-written subagent descriptions use to tell the
// orchestrator *when* to delegate -- an explicit trigger phrase, a proactive
// directive ("use PROACTIVELY", "MUST BE USED"), or a worked example. This is
// pattern-matching against known-good shapes documented in the UI/README,
// never a semantic understanding of the sentence.
const TRIGGER_CUE_PATTERNS = [
  /\buse\s+(this\s+|it\s+)?when\b/i,
  /\bwhenever\b/i,
  /\btrigger(?:s|ed)?\s+(when|by|on)\b/i,
  /\bfor\s+(requests|tasks|questions)\s+(about|involving|related to)\b/i,
  /\bproactively\b/i,
  /\bmust\s+be\s+used\b/i,
  /\be\.g\.,?/i,
  /\bfor example\b/i,
  /\bsuch as\b/i,
  /\bif\s+the\s+user\b/i,
  /\bwhen\s+(the\s+)?user\b/i,
  /\bwhen\s+(the\s+)?(request|task|question)\b/i,
  /\bwhen\s+asked\b/i,
  /"[^"]{4,}"/,
];

const MIN_DESCRIPTION_WORDS = 8;
const MIN_CONTENT_WORDS = 4;

function words(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function contentWordCount(description) {
  let count = 0;
  for (const w of words(description)) {
    const cleaned = w.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleaned.length > 2 && !FILLER_WORDS.has(cleaned)) count++;
  }
  return count;
}

/** Flags a `description` too vague to be picked for automatic delegation
 * reliably. A pattern-matching heuristic (word count, trigger-cue presence,
 * surviving distinctive vocabulary) -- never a semantic judgment. A
 * description that passes every check here can still fail to get picked in
 * practice, and one that trips a check can still work fine; every finding
 * says so. */
export function checkDescriptionVagueness(description) {
  const out = [];
  const tokens = words(description);

  if (tokens.length < MIN_DESCRIPTION_WORDS) {
    out.push(finding(
      "description", "description-too-short", "medium",
      `The description is only ${tokens.length} word(s) long (floor: ${MIN_DESCRIPTION_WORDS}). A short description rarely gives the orchestrator enough to decide when to delegate to this subagent over another -- say what it does and when to reach for it.`,
    ));
    return out; // a too-short description will also read as generic/cueless; one finding is enough
  }

  const hasCue = TRIGGER_CUE_PATTERNS.some((re) => re.test(description));
  if (!hasCue) {
    out.push(finding(
      "description", "description-no-trigger-cue", "medium",
      'No concrete trigger cue found -- no "use when...", "use PROACTIVELY", "MUST BE USED", example phrasing ("e.g." / "such as"), or quoted example request. The orchestrator matches a request against this text; without a cue like this, getting picked is left to chance.',
    ));
  }

  const contentWords = contentWordCount(description);
  if (contentWords < MIN_CONTENT_WORDS) {
    out.push(finding(
      "description", "description-too-generic", "medium",
      `After removing generic filler words ("helps", "various", "tasks", common stopwords, ...), only ${contentWords} distinctive word(s) remain (floor: ${MIN_CONTENT_WORDS}). A description built mostly from filler could describe almost any subagent and gives the orchestrator little to match against.`,
    ));
  }

  return out;
}

// ---- tools list --------------------------------------------------------

// Built-in tool names this tool documents as of its own last update. Anthropic
// can rename or add one at any time, so a name outside this list is a dated
// caution ("not one this tool recognizes as of [date] -- check for a typo, or
// this may be an MCP/custom tool"), never a hard error -- MCP tool names
// (typically "mcp__<server>__<tool>") and custom tool names are open-ended.
export const KNOWN_BUILTIN_TOOLS_AS_OF = "2026-09";
export const KNOWN_BUILTIN_TOOLS = new Set([
  "Task", "Bash", "BashOutput", "KillShell", "Glob", "Grep", "Read", "Edit", "Write",
  "NotebookEdit", "WebFetch", "WebSearch", "TodoWrite", "ExitPlanMode", "SlashCommand",
]);

const MCP_TOOL_RE = /^mcp__[A-Za-z0-9_]+__[A-Za-z0-9_]+$/;
const PLAIN_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function toolEntries(rawTools) {
  if (rawTools === undefined) return null; // "tools" omitted entirely: inherits every tool, nothing to check
  if (Array.isArray(rawTools)) return rawTools.map((t) => String(t).trim());
  if (typeof rawTools === "string") return rawTools.split(",").map((t) => t.trim());
  return null;
}

/** Checks a `tools` field: an empty entry (stray/trailing comma), a name
 * duplicated in the list, and a name outside the documented built-in list as
 * a dated caution. Returns [] when `tools` is omitted -- an omitted field
 * means "inherit every tool" and there is nothing to flag. */
export function checkTools(rawTools) {
  const out = [];
  if (rawTools === undefined) return out;
  if (typeof rawTools !== "string" && !Array.isArray(rawTools)) {
    out.push(finding(
      "tools", "tools-not-list", "high",
      `"tools" must be a comma-separated string or a YAML list of tool names, not ${typeof rawTools}.`,
    ));
    return out;
  }
  const entries = toolEntries(rawTools);
  const seen = new Map();
  entries.forEach((entry, i) => {
    if (entry === "") {
      out.push(finding(`tools[${i}]`, "empty-tool-entry", "medium", "Empty tool name -- likely a stray or trailing comma in the \"tools\" list."));
      return;
    }
    seen.set(entry, (seen.get(entry) || 0) + 1);
    if (!MCP_TOOL_RE.test(entry) && !KNOWN_BUILTIN_TOOLS.has(entry)) {
      if (PLAIN_NAME_RE.test(entry)) {
        out.push(finding(
          `tools[${i}]`, "unrecognized-tool-name", "low",
          `"${entry}" is not one of the built-in tool names documented as of ${KNOWN_BUILTIN_TOOLS_AS_OF} (${[...KNOWN_BUILTIN_TOOLS].join(", ")}) and does not match the "mcp__server__tool" MCP naming shape. Check for a typo, or this may be a custom/MCP tool this tool doesn't recognize by name.`,
        ));
      } else {
        out.push(finding(`tools[${i}]`, "malformed-tool-name", "medium", `"${entry}" contains a character other than letters, digits, or underscore -- not a shape any tool name (built-in or MCP) uses.`));
      }
    }
  });
  for (const [entry, count] of seen) {
    if (count > 1) {
      out.push(finding("tools", "duplicate-tool", "low", `"${entry}" appears ${count} times in "tools" -- redundant.`));
    }
  }
  return out;
}

// ---- model alias --------------------------------------------------------

export const KNOWN_MODEL_ALIASES = new Set(["sonnet", "opus", "haiku", "inherit"]);
const MODEL_ID_RE = /^claude-/i;

/** Checks a `model` field against the documented short aliases plus a loose
 * shape check for a full model id. Outside both is a dated caution -- new
 * aliases and model ids are added over time. */
export function checkModel(rawModel) {
  const out = [];
  if (rawModel === undefined) return out;
  if (typeof rawModel !== "string" || rawModel.trim() === "") {
    out.push(finding("model", "model-not-string", "high", `"model" must be a non-empty string, not ${typeof rawModel === "string" ? "an empty string" : typeof rawModel}.`));
    return out;
  }
  const model = rawModel.trim();
  if (!KNOWN_MODEL_ALIASES.has(model) && !MODEL_ID_RE.test(model)) {
    out.push(finding(
      "model", "unrecognized-model", "low",
      `"model: ${model}" is not one of the documented aliases (${[...KNOWN_MODEL_ALIASES].join(", ")}) and is not shaped like a full model id (does not start with "claude-"). Check for a typo, or this may be an alias added since this tool was last updated.`,
    ));
  }
  return out;
}

// ---- system-prompt body -------------------------------------------------

const MIN_BODY_WORDS = 10;

/** Flags a missing or near-empty system-prompt body -- the subagent has
 * (almost) no instructions to run with, distinct from a missing description
 * (which stops it being picked at all). */
export function checkBody(body) {
  const out = [];
  const trimmed = (body || "").trim();
  if (trimmed === "") {
    out.push(finding("body", "empty-body", "high", "No system-prompt body after the frontmatter -- this subagent has no instructions at all beyond its name and description."));
    return out;
  }
  const count = words(trimmed).length;
  if (count < MIN_BODY_WORDS) {
    out.push(finding("body", "near-empty-body", "medium", `The system-prompt body is only ${count} word(s) long (floor: ${MIN_BODY_WORDS}) -- likely a placeholder rather than real instructions for how this subagent should do its job.`));
  }
  return out;
}

// ---- orchestration ----------------------------------------------------------

function countSeverities(findings) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  return counts;
}

/** Top-level entry point: lints one pasted subagent definition file.
 * `expectedFilename` is optional (without the .md extension). */
export function lintAgent(text, expectedFilename) {
  const parsed = parseAgentFile(text);
  const findings = [];
  if (!parsed.ok) {
    for (const err of parsed.errors) {
      findings.push(finding("frontmatter", "invalid-frontmatter", "high", err));
    }
    return { parsed, findings, counts: countSeverities(findings) };
  }
  findings.push(...checkRequiredFields(parsed, expectedFilename));
  if (typeof parsed.data.description === "string" && parsed.data.description.trim() !== "") {
    findings.push(...checkDescriptionVagueness(parsed.data.description));
  }
  findings.push(...checkTools(parsed.data.tools));
  findings.push(...checkModel(parsed.data.model));
  findings.push(...checkBody(parsed.body));
  return { parsed, findings, counts: countSeverities(findings) };
}

/** Plain-text summary suitable for pasting into a review note or PR. */
export function summaryText({ findings, counts }) {
  const lines = [
    `Claude Code subagent check: ${findings.length} finding(s) (${counts.high} high, ${counts.medium} medium, ${counts.low} low).`,
  ];
  if (findings.length === 0) {
    lines.push("No structural issues observed. This is not a claim that the orchestrator will delegate to this subagent on any given request -- only that none of this tool's mechanical checks fired.");
  } else {
    for (const f of findings) {
      lines.push(`[${f.severity.toUpperCase()}] ${f.source} -- ${f.category}: ${f.detail}`);
    }
  }
  lines.push("Mechanical, structural checks only against the text pasted in -- review every finding yourself, and verify against Claude Code's current documentation. This is not a guarantee of delegation or runtime behaviour.");
  return lines.join("\n");
}
