// Skill Manifest Check -- deterministic, mechanical checks against one or
// more pasted SKILL.md files (the format Claude Code and similar agent
// systems use: a YAML frontmatter block with at least `name` and
// `description`, followed by a Markdown instruction body). This module
// never contacts a network, never runs the skill, and never judges whether
// the *instructions* are good -- only whether the manifest is well-formed
// and whether the `description` gives an agent enough to match a real
// request against. See PRODUCT_PLAYBOOK.md 5b: a tool that can't verify a
// fact live must not assert it, so every finding here is "worth a look",
// not a verdict that the skill will or will not trigger correctly.
//
// Four things get checked, matching four real, commonly-reported failure
// shapes for agent skills:
//   1. Missing/malformed required frontmatter (no name, no description, a
//      name that isn't kebab-case, missing or malformed "---" delimiters,
//      frontmatter that isn't parseable at all).
//   2. A description too vague to trigger reliably: too short, missing a
//      concrete trigger cue, or built almost entirely from generic filler
//      words with no distinctive vocabulary an agent could match against.
//   3. Overlapping triggers across 2+ pasted skills: descriptions that
//      share enough distinctive vocabulary to plausibly compete for the
//      same request.
//   4. A body-size caution against a documented (not vendor-asserted)
//      token-budget guideline -- never a hard fail, since a long skill can
//      be entirely justified by its job.

// ---- frontmatter parsing ---------------------------------------------------

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

/** Parses the minimal YAML subset actually seen in hand-written SKILL.md
 * frontmatter: flat "key: value" pairs, quoted scalars, block scalars
 * (">"/"|", with or without chomping indicators, and a bare indented
 * continuation with no indicator, which YAML folds the same way a ">" does),
 * and simple "- item" lists. It does not implement nested mappings, flow
 * collections ("{...}"/"[...]"), anchors, or multi-document files -- those
 * are rare in a skill manifest and are reported as a parse error rather than
 * silently misread. */
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

/** Splits a pasted SKILL.md into its frontmatter object and Markdown body,
 * or reports why it could not. Returns { ok, errors, data, body }. */
export function parseSkillFile(text) {
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

// ---- required-field checks -------------------------------------------------

const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function finding(source, category, severity, detail) {
  return { source, category, severity, detail };
}

function isBlank(value) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/** Missing/malformed `name` and `description`. Only meaningful once
 * `parseSkillFile` reports `ok: true` -- an unparseable frontmatter block
 * has already been reported as its own finding. */
export function checkRequiredFields(parsed) {
  const out = [];
  const { name, description } = parsed.data;

  if (isBlank(name)) {
    out.push(finding(
      "name", "missing-field", "high",
      'No "name" field in the frontmatter. Agent skill loaders use this to identify and reference the skill; without it the skill cannot be loaded.',
    ));
  } else if (typeof name !== "string") {
    out.push(finding(
      "name", "missing-field", "high",
      'The "name" field is not a plain text value -- check for stray YAML structure (a list or nested mapping) where a single line is expected.',
    ));
  } else if (!KEBAB_CASE_RE.test(name)) {
    out.push(finding(
      "name", "malformed-name", "medium",
      `"name: ${name}" is not kebab-case (lowercase letters, digits, and single hyphens, e.g. "pdf-form-filler"). Some agent runtimes reject or silently mangle a name outside this pattern.`,
    ));
  }

  if (isBlank(description)) {
    out.push(finding(
      "description", "missing-field", "high",
      'No "description" field in the frontmatter. This is the one field an agent matches a request against to decide whether to load the skill -- without it, the skill can never trigger.',
    ));
  } else if (typeof description !== "string") {
    out.push(finding(
      "description", "missing-field", "high",
      'The "description" field is not a plain text value -- check for stray YAML structure where a single string is expected.',
    ));
  }

  return out;
}

// ---- description vagueness -------------------------------------------------

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "to", "for", "with", "this", "that", "these", "those", "it", "its",
  "is", "are", "was", "were", "you", "your", "yours", "user", "users", "can", "will", "should", "would",
  "could", "of", "in", "on", "at", "as", "be", "by", "from", "about", "when", "which", "who", "whom",
  "what", "i", "we", "our", "ours", "their", "they", "them", "he", "she", "his", "her", "skill", "agent",
  "claude", "use", "used", "using", "uses", "if", "then", "so", "into", "over", "under", "via", "not",
  "no", "any", "all", "do", "does", "doing", "done", "get", "gets", "getting", "also", "more", "most",
  "such", "like", "than", "both", "each", "other", "others",
]);

// Words that read as concrete on their own but appear, in practice, almost
// exclusively inside descriptions that name no actual subject matter --
// "helps with various tasks" describes every skill and none of them.
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

// A heuristic list of concrete cues real, well-written skill descriptions
// use to tell an agent *when* to reach for them -- an explicit trigger
// phrase, a worked example, or a quoted sample request. Documented
// explicitly (README/UI) as pattern-matching against known good shapes, not
// a semantic understanding of the sentence.
const TRIGGER_CUE_PATTERNS = [
  /\buse\s+(this\s+|it\s+)?when\b/i,
  /\bwhenever\b/i,
  /\btrigger(?:s|ed)?\s+(when|by|on)\b/i,
  /\bfor\s+(requests|tasks|questions)\s+(about|involving|related to)\b/i,
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

function contentWordSet(description) {
  const set = new Set();
  for (const w of words(description)) {
    const cleaned = w.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleaned.length > 2 && !FILLER_WORDS.has(cleaned)) set.add(cleaned);
  }
  return set;
}

/** Flags a `description` too vague to trigger reliably. This is a
 * pattern-matching heuristic against known failure shapes -- word count,
 * presence of a trigger cue, and how much distinctive vocabulary survives
 * filler-word removal -- never a semantic judgment of whether the
 * description is well-written. A description that passes every check here
 * can still fail to trigger in practice, and one that trips a check can
 * still work fine; every finding says so. */
export function checkDescriptionVagueness(description) {
  const out = [];
  const tokens = words(description);

  if (tokens.length < MIN_DESCRIPTION_WORDS) {
    out.push(finding(
      "description", "description-too-short", "medium",
      `The description is only ${tokens.length} word(s) long (floor: ${MIN_DESCRIPTION_WORDS}). A short description rarely gives an agent enough to match a real request against -- say what the skill is for and when to reach for it.`,
    ));
    return out; // a too-short description will also read as generic/cueless; one finding is enough
  }

  const hasCue = TRIGGER_CUE_PATTERNS.some((re) => re.test(description));
  if (!hasCue) {
    out.push(finding(
      "description", "description-no-trigger-cue", "medium",
      'No concrete trigger cue found -- no "use when...", "for requests about...", example phrasing ("e.g." / "such as"), or quoted example request. An agent matches a request against this text; without a cue like this, matching is left to chance.',
    ));
  }

  const contentWords = contentWordSet(description);
  if (contentWords.size < MIN_CONTENT_WORDS) {
    out.push(finding(
      "description", "description-too-generic", "medium",
      `After removing generic filler words ("helps", "various", "tasks", common stopwords, ...), only ${contentWords.size} distinctive word(s) remain (floor: ${MIN_CONTENT_WORDS}). A description built mostly from filler could describe almost any skill and gives an agent little to match against.`,
    ));
  }

  return out;
}

// ---- body size / context budget --------------------------------------------

// A rough, documented reference point -- not a vendor-published limit. See
// README for the reasoning: ~4 characters per token is a common
// English-text estimate, and the two thresholds mark "worth a look" and
// "well past it", not a hard cap. A long body can be entirely justified by
// the job the skill does; this is a caution, never a failure.
const CHARS_PER_TOKEN_ESTIMATE = 4;
const BODY_TOKENS_CAUTION = 1500;
const BODY_TOKENS_HIGH = 4000;

/** Estimates the instruction body's size in tokens and flags it as a
 * caution against a documented, non-authoritative context-budget
 * guideline. Never returns a "high"-severity finding -- see README. */
export function checkBodySize(body) {
  const out = [];
  const trimmed = (body || "").trim();
  if (trimmed === "") return out;
  const estimatedTokens = Math.round(trimmed.length / CHARS_PER_TOKEN_ESTIMATE);
  if (estimatedTokens >= BODY_TOKENS_HIGH) {
    out.push(finding(
      "body", "oversized-body", "medium",
      `The instruction body is roughly ${estimatedTokens} tokens (~${CHARS_PER_TOKEN_ESTIMATE} characters/token, a rough estimate) -- well past the ${BODY_TOKENS_HIGH}-token caution line. This is paid every time the skill loads, whether or not the request needed all of it; consider moving reference material into a file the skill loads only when needed.`,
    ));
  } else if (estimatedTokens >= BODY_TOKENS_CAUTION) {
    out.push(finding(
      "body", "oversized-body", "low",
      `The instruction body is roughly ${estimatedTokens} tokens (~${CHARS_PER_TOKEN_ESTIMATE} characters/token, a rough estimate) -- past the ${BODY_TOKENS_CAUTION}-token caution line. Worth a look if much of it is reference material a request rarely needs.`,
    ));
  }
  return out;
}

// ---- overlapping triggers across a bundle ----------------------------------

const MIN_OVERLAP_WORDS = 3;
const OVERLAP_THRESHOLD = 0.3;

/** Flags pairs of skills, from a bundle pasted together, whose descriptions
 * share enough distinctive vocabulary that an agent choosing between them on
 * a real request is plausibly a toss-up. `skills` is a list of
 * `{ name, description }`. Only ever a structural signal against shared
 * words, not a claim that the two skills actually conflict -- two skills can
 * share vocabulary and still be cleanly distinguishable in practice, and
 * two skills with no shared vocabulary can still both plausibly match the
 * same request. */
export function checkOverlap(skills) {
  const out = [];
  const sets = skills.map((s) => contentWordSet(s.description || ""));
  for (let a = 0; a < skills.length; a++) {
    for (let b = a + 1; b < skills.length; b++) {
      const setA = sets[a];
      const setB = sets[b];
      if (setA.size < MIN_OVERLAP_WORDS || setB.size < MIN_OVERLAP_WORDS) continue;
      const shared = [...setA].filter((w) => setB.has(w)).sort();
      if (shared.length === 0) continue;
      const union = new Set([...setA, ...setB]);
      const jaccard = shared.length / union.size;
      if (jaccard >= OVERLAP_THRESHOLD) {
        const nameA = skills[a].name || `skill ${a + 1}`;
        const nameB = skills[b].name || `skill ${b + 1}`;
        out.push({
          source: "overlap",
          category: "overlapping-trigger",
          severity: "medium",
          skillA: nameA,
          skillB: nameB,
          sharedWords: shared,
          detail: `"${nameA}" and "${nameB}" share enough distinctive description vocabulary (${shared.join(", ")}) that an agent choosing between them on a real request is plausibly a toss-up. Narrow one description, or merge the two skills.`,
        });
      }
    }
  }
  return out;
}

// ---- orchestration ----------------------------------------------------------

function countSeverities(findings) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  return counts;
}

/** Lints one pasted SKILL.md through every single-skill check (frontmatter,
 * required fields, description vagueness, body size). Overlap is a
 * cross-skill check and lives in `lintSkills` instead. */
function lintOne(text) {
  const parsed = parseSkillFile(text);
  const findings = [];
  if (!parsed.ok) {
    for (const err of parsed.errors) {
      findings.push(finding("frontmatter", "invalid-frontmatter", "high", err));
    }
    return { parsed, findings };
  }
  findings.push(...checkRequiredFields(parsed));
  if (typeof parsed.data.description === "string" && parsed.data.description.trim() !== "") {
    findings.push(...checkDescriptionVagueness(parsed.data.description));
  }
  findings.push(...checkBodySize(parsed.body));
  return { parsed, findings };
}

/** Lints one or more pasted SKILL.md files and, when 2+ are given, also
 * checks every pair for overlapping triggers. Returns per-skill results
 * plus a flat, combined finding list and severity counts. */
export function lintSkills(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error("At least one SKILL.md is required.");
  }
  const results = texts.map((t) => lintOne(t));
  const skills = results.map((r, i) => ({
    index: i,
    name: r.parsed.ok && typeof r.parsed.data.name === "string" && r.parsed.data.name.trim() !== ""
      ? r.parsed.data.name
      : `skill ${i + 1}`,
    description: r.parsed.ok && typeof r.parsed.data.description === "string" ? r.parsed.data.description : "",
    ok: r.parsed.ok,
    findings: r.findings,
  }));
  const overlapFindings = skills.length > 1 ? checkOverlap(skills) : [];
  const findings = [
    ...skills.flatMap((s) => s.findings.map((f) => ({ ...f, skillIndex: s.index, skillName: s.name }))),
    ...overlapFindings.map((f) => ({ ...f, skillIndex: null })),
  ];
  return { skills, overlapFindings, findings, counts: countSeverities(findings) };
}

/** Plain-text summary suitable for pasting into a review note or PR. */
export function summaryText({ skills, findings, counts }) {
  const lines = [
    `Skill manifest check: ${skills.length} skill(s), ${findings.length} finding(s) (${counts.high} high, ${counts.medium} medium, ${counts.low} low).`,
  ];
  if (findings.length === 0) {
    lines.push("No structural issues observed. This is not a claim that the skill will trigger correctly -- only that none of this tool's mechanical checks fired.");
  } else {
    for (const f of findings) {
      const label = f.category === "overlapping-trigger" ? `${f.skillA} / ${f.skillB}` : (f.skillName || f.source);
      lines.push(`[${f.severity.toUpperCase()}] ${label} -- ${f.category}: ${f.detail}`);
    }
  }
  lines.push("Mechanical, pattern-matching checks only -- review every finding yourself. This is not a guarantee the skill will or will not trigger correctly.");
  return lines.join("\n");
}
