// Claude Skill Scaffold Generator -- deterministic, template-driven
// generation of a starter SKILL.md (plus a suggested folder layout) from a
// few plain-language fields: what the skill does, when Claude should decide
// to use it, and which scripts/references/assets it bundles. No model call
// of any kind -- the frontmatter and body are assembled from the fields the
// visitor supplies by a fixed template, and every check below is a fact
// about that text (is the name a valid slug, does the description read as
// first person, is either field empty) or a caution dated against this
// tool's own documented reference, never a live-verified claim about
// Anthropic's current skill-authoring spec. See PRODUCT_PLAYBOOK.md 5b: a
// tool that cannot verify a fact live must not assert it as settled.

// ---- naming/length guidance, dated rather than asserted as exhaustive ----
//
// The practical limits documented for a skill's `name` and `description`
// frontmatter fields as of this tool's last update. Anthropic can change
// these at any time, so a field outside them is reported as a caution
// ("exceeds the length commonly documented as of [date] -- verify against
// Anthropic's current skill-authoring reference"), never as a hard error
// that blocks generating the file.
export const SKILL_LIMITS_AS_OF = "2026-01";
export const NAME_MAX_CHARS = 64;
export const DESCRIPTION_MAX_CHARS = 1024;
export const DESCRIPTION_MIN_CHARS = 20;

function finding(field, category, severity, detail) {
  return { field, category, severity, detail };
}

/** Turns free text into a lowercase, hyphenated slug: Anthropic's
 * documented shape for a skill's directory name and `name` frontmatter
 * field. Never throws -- an empty or all-punctuation input slugifies to
 * the empty string, which `checkName` then flags. */
export function slugify(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** Structural checks on the skill name: non-empty once slugified, and
 * within the practical length this tool documents (a caution, not a hard
 * error -- Anthropic's own actual limit is not verified live here). */
export function checkName(rawName) {
  const out = [];
  const slug = slugify(rawName);
  if (slug === "") {
    out.push(finding("name", "empty-name", "high", "A skill needs a name -- this becomes both its directory and its `name:` frontmatter field."));
    return { slug, findings: out };
  }
  if (String(rawName ?? "").trim() !== slug) {
    out.push(finding("name", "name-not-slug", "medium", `"${rawName}" isn't already a lowercase, hyphenated slug -- this tool used "${slug}" instead. Rename the folder to match if you edit the name afterward.`));
  }
  if (slug.length > NAME_MAX_CHARS) {
    out.push(finding("name", "name-too-long", "medium", `"${slug}" is ${slug.length} characters, over the ${NAME_MAX_CHARS}-character length commonly documented as of ${SKILL_LIMITS_AS_OF} for a skill name -- verify against Anthropic's current skill-authoring reference before publishing.`));
  }
  return { slug, findings: out };
}

const FIRST_PERSON_OPENING = /^\s*(i\s|i'm\b|i've\b|we\s|we're\b|my\s|our\s)/i;

/** Builds the `description` frontmatter field from "what it does" and
 * "when to use it", and flags the common authoring mistakes: either half
 * missing, a first-person opening (public skill-authoring guidance asks
 * for third person, since the description is read by the model deciding
 * whether to load the skill, not by the skill's author), and a length
 * outside the documented practical range. */
export function checkDescription(whatItDoes, whenToUse) {
  const out = [];
  const what = String(whatItDoes ?? "").trim();
  const when = String(whenToUse ?? "").trim();
  if (what === "") {
    out.push(finding("whatItDoes", "empty-what", "high", "Describe what the skill does -- this is the capability half of the description Claude reads to decide whether to load it."));
  }
  if (when === "") {
    out.push(finding("whenToUse", "empty-when", "high", "Describe when Claude should use the skill -- a description with no trigger condition is the single most common reason a skill never fires: Claude has nothing concrete to match the user's request against."));
  }
  if (FIRST_PERSON_OPENING.test(what) || FIRST_PERSON_OPENING.test(when)) {
    out.push(finding("description", "first-person-description", "medium", 'Public skill-authoring guidance asks for third person ("Use this skill when...", not "I will..." or "I can help with..."), because the description is read by the model deciding whether to load the skill -- not spoken by the skill itself.'));
  }
  const description = buildDescription(what, when);
  if (description !== "" && description.length < DESCRIPTION_MIN_CHARS) {
    out.push(finding("description", "description-too-short", "medium", `The generated description is only ${description.length} character(s) -- likely too thin for Claude to reliably tell this skill apart from a similar one. Add more concrete trigger detail to "when to use it."`));
  }
  if (description.length > DESCRIPTION_MAX_CHARS) {
    out.push(finding("description", "description-too-long", "medium", `The generated description is ${description.length} characters, over the ${DESCRIPTION_MAX_CHARS}-character length commonly documented as of ${SKILL_LIMITS_AS_OF} for a skill description -- verify against Anthropic's current skill-authoring reference before publishing, and consider moving detail into the skill body instead.`));
  }
  return { description, findings: out };
}

/** Combines the two halves into one third-person description string.
 * Deterministic string assembly -- never rewrites the visitor's wording,
 * only appends a "Use when" clause if theirs doesn't already start with
 * one. */
export function buildDescription(whatItDoes, whenToUse) {
  const what = String(whatItDoes ?? "").trim();
  const when = String(whenToUse ?? "").trim();
  if (what === "" && when === "") return "";
  const whatSentence = what === "" ? "" : what.replace(/\.?\s*$/, ".");
  if (when === "") return whatSentence;
  const alreadyPhrased = /^(use\s|trigger|invoke)/i.test(when);
  const whenSentence = alreadyPhrased ? when.replace(/\.?\s*$/, ".") : `Use when ${when.replace(/^[A-Z]/, (c) => c.toLowerCase())}`.replace(/\.?\s*$/, ".");
  return [whatSentence, whenSentence].filter((s) => s !== "").join(" ");
}

const BUNDLE_KINDS = [
  { key: "scripts", dir: "scripts/", label: "Scripts (deterministic code the skill runs, not read into context)" },
  { key: "references", dir: "references/", label: "References (loaded into context on demand, not up front)" },
  { key: "assets", dir: "assets/", label: "Assets (templates or files the skill's output is built from)" },
];

/** Parses a textarea's worth of "path — purpose" lines (one bundled file
 * per line; the em/en dash or a plain hyphen both work) into
 * {path, purpose} entries. A line with no separator is kept as a bare
 * path with an empty purpose rather than dropped. */
export function parseBundleLines(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      // Only a dash *surrounded by whitespace* separates path from purpose --
      // an unspaced hyphen is almost always part of the path itself (e.g.
      // "validate-schema.py"), so requiring the space avoids splitting that.
      const match = line.match(/^(.*?)\s+[—–-]\s+(.+)$/);
      if (match) return { path: match[1].trim(), purpose: match[2].trim() };
      return { path: line, purpose: "" };
    });
}

/** Renders the suggested folder layout as plain text, including only the
 * subdirectories the visitor actually said they'd bundle -- an empty
 * skill is just SKILL.md, which is itself valid. */
export function buildFolderTree(slug, bundles) {
  const lines = [`${slug}/`, "  SKILL.md"];
  for (const kind of BUNDLE_KINDS) {
    const entries = bundles[kind.key] || [];
    if (entries.length === 0) continue;
    lines.push(`  ${kind.dir}`);
    for (const entry of entries) {
      const base = entry.path.replace(/^\/+/, "");
      lines.push(`    ${base}${entry.purpose ? `  # ${entry.purpose}` : ""}`);
    }
  }
  return lines.join("\n");
}

function yamlEscape(value) {
  const s = String(value ?? "");
  if (s === "") return '""';
  if (/[:#"'\n]|^[\s-]|\s$/.test(s)) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

/** Renders the full SKILL.md text: YAML frontmatter (`name`, `description`)
 * followed by a starter body naming the bundled files, if any, so the file
 * is never just an empty shell. */
export function renderSkillMd({ slug, description, title, bundles }) {
  const frontmatter = ["---", `name: ${yamlEscape(slug)}`, `description: ${yamlEscape(description)}`, "---", ""];
  const heading = title && title.trim() !== "" ? title.trim() : slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  const body = [`# ${heading}`, ""];
  const anyBundled = BUNDLE_KINDS.some((k) => (bundles[k.key] || []).length > 0);
  if (anyBundled) {
    body.push("## Files this skill bundles", "");
    for (const kind of BUNDLE_KINDS) {
      const entries = bundles[kind.key] || [];
      if (entries.length === 0) continue;
      body.push(`**${kind.label}:**`);
      for (const entry of entries) {
        body.push(entry.purpose ? `- \`${kind.dir}${entry.path}\` — ${entry.purpose}` : `- \`${kind.dir}${entry.path}\``);
      }
      body.push("");
    }
  }
  body.push(
    "<!-- Replace this body with what a reader needs to actually use the skill:",
    "     step-by-step instructions, the commands or APIs it wraps, and any",
    "     constraint worth stating once rather than per file it touches. -->",
  );
  return frontmatter.concat(body).join("\n") + "\n";
}

function countSeverities(findings) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  return counts;
}

/** Top-level entry point. Takes the visitor's plain-text fields and
 * returns every finding plus the generated SKILL.md and folder tree --
 * generation always runs, even over findings, the same way a linter
 * still renders a best-effort result rather than refusing outright. */
export function scaffold({ name, whatItDoes, whenToUse, title, scriptsText, referencesText, assetsText }) {
  const { slug, findings: nameFindings } = checkName(name);
  const { description, findings: descFindings } = checkDescription(whatItDoes, whenToUse);
  const bundles = {
    scripts: parseBundleLines(scriptsText),
    references: parseBundleLines(referencesText),
    assets: parseBundleLines(assetsText),
  };
  const findings = [...nameFindings, ...descFindings];
  const skillMd = renderSkillMd({ slug: slug || "your-skill-name", description, title, bundles });
  const folderTree = buildFolderTree(slug || "your-skill-name", bundles);
  return { slug, description, bundles, skillMd, folderTree, findings, counts: countSeverities(findings) };
}

/** Plain-text summary suitable for pasting into a review note or PR. */
export function summaryText({ findings, counts, slug }) {
  const lines = [
    `Claude skill scaffold for "${slug || "(unnamed)"}": ${findings.length} finding(s) (${counts.high} high, ${counts.medium} medium, ${counts.low} low).`,
  ];
  if (findings.length === 0) {
    lines.push("No authoring issues observed. This checks the fields you supplied, not whether Claude will actually invoke the skill correctly at runtime.");
  } else {
    for (const f of findings) {
      lines.push(`[${f.severity.toUpperCase()}] ${f.field} -- ${f.category}: ${f.detail}`);
    }
  }
  lines.push("Template-generated, not model-verified -- review the SKILL.md yourself, and check current Anthropic skill-authoring guidance for anything dated above.");
  return lines.join("\n");
}
