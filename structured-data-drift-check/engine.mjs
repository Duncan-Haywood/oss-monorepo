// Structured-data drift engine: does a page's JSON-LD actually say, word for
// word, what the page's own visible text says?
//
// Google's structured-data policy requires FAQPage and HowTo markup to
// describe content the visitor can actually see -- markup that describes
// text nobody can read is, at best, ignored, and at worst treated as spam
// (Search Central: "structured data ... must be visible to users on the
// page"). AI answer engines go further and read JSON-LD as ground truth
// when they summarize a page, so stale or fabricated structured data can
// misrepresent the page even where no human ever notices. Either way the
// defect is the same: someone edited the visible copy, or wrote the JSON-LD
// by hand, and the two drifted apart.
//
// This module answers one narrow, deterministic question per claim ("is
// this exact string present in the page's rendered text?"), never "is this
// SEO-optimal" or "will this rank." No network call lives here -- it only
// reads the HTML text it is given, so the identical logic runs in the
// browser page (pasted HTML) and the Node CLI (a local file).
//
// The core technique -- strip script/style, collapse inline tags so markup
// doesn't invent or delete word boundaries, decode entities, then find the
// exact character where an authored string stops matching the rendered page
// by bisection rather than a linear scan -- is the same one
// `platform/pages/faq-visible.test.mjs` already proved out in this repo for
// FAQPage specifically (paired with `platform/pages/entities.mjs`). This
// generalizes it to more schema.org types. Standalone ventures in this
// portfolio do not import from `platform/` (every sibling checker vendors
// its own small text-processing helpers), so the entity table and the
// visible-text extraction are vendored here rather than imported.

// --- HTML entity decoding (vendored) ------------------------------------
//
// A *partial* table fails silently on the next character a page reaches
// for, and the failure reads as "the copy is missing" -- which invites
// rewriting prose that is already on the page. Kept deliberately close to
// `platform/pages/entities.mjs`'s table (proven against a real portfolio
// bug: `&tau;`/`&micro;` rendering as real `τ`/`µ` in JSON-LD) rather than
// trimmed to the few names this venture's own fixtures happen to use.
const NAMED_ENTITIES = Object.freeze({
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  nbsp: " ", mdash: "—", ndash: "–", ldquo: "“", rdquo: "”",
  lsquo: "‘", rsquo: "’", hellip: "…", middot: "·", bull: "•",
  times: "×", divide: "÷", minus: "−", plusmn: "±", asymp: "≈", ne: "≠",
  le: "≤", ge: "≥", radic: "√", sup2: "²", sup3: "³", frac12: "½",
  deg: "°", prime: "′", Prime: "″",
  micro: "µ", tau: "τ", Omega: "Ω", omega: "ω", alpha: "α", beta: "β",
  pi: "π", mu: "μ",
  larr: "←", rarr: "→", harr: "↔",
  cent: "¢", pound: "£", euro: "€", yen: "¥", copy: "©", reg: "®", trade: "™",
});

const ENTITY_RE = /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

/** `html` with its character references resolved. Unknown named references are left as-is (visible in a diff) rather than silently dropped. */
export function decodeEntities(html) {
  return String(html).replace(ENTITY_RE, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      if (code >= 0xd800 && code <= 0xdfff) return whole;
      return String.fromCodePoint(code);
    }
    return Object.hasOwn(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : whole;
  });
}

// --- Visible-text extraction --------------------------------------------

// Phrasing content only: a block tag stays a separator (sibling cells and
// list items can abut with no whitespace between them in the source), but
// an inline tag marks up part of a word rather than ending one --
// `V<sub>out</sub>` reads "Vout" to a visitor.
const INLINE_TAGS = [
  "a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "dfn", "em", "i",
  "kbd", "mark", "q", "rp", "rt", "ruby", "s", "samp", "small", "span",
  "strong", "sub", "sup", "time", "u", "var", "wbr",
];
const INLINE_TAG_RE = new RegExp(`</?(?:${INLINE_TAGS.join("|")})\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, "gi");

/** Page text as a visitor sees it: no `<script>`/`<style>`, no tags, entities decoded, whitespace collapsed. Case-preserving; callers that compare should squash case themselves. */
export function visibleText(html) {
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(INLINE_TAG_RE, "")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

/** Whitespace-collapsed, lower-cased -- how two strings are compared. */
export function squash(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

// --- Divergence -----------------------------------------------------------
//
// A bare "not found" tells a user only that a claim doesn't match, which
// reads as "rewrite the whole thing" even when the copy is present and one
// character off (a straight quote vs. curly, "--" vs. an em dash). Prefix
// matching is monotone -- if a prefix of length n is present so is every
// shorter one -- so the boundary is found by bisection rather than a scan.

/**
 * Where `needle` (already squashed) stops matching `haystack` (already
 * squashed), or `null` if `haystack` contains it whole.
 */
export function divergence(needle, haystack, { window = 28 } = {}) {
  if (!needle) return null;
  if (haystack.includes(needle)) return null;
  let low = 0;
  let high = needle.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (haystack.includes(needle.slice(0, mid))) low = mid;
    else high = mid - 1;
  }
  const matched = needle.slice(0, low);
  const at = matched ? haystack.indexOf(matched) : -1;
  return {
    index: low,
    authored: `${matched.slice(-window)}${needle.slice(low, low + window)}`,
    onPage: at === -1 ? "" : haystack.slice(Math.max(0, at + low - window), at + low + window),
  };
}

// --- JSON-LD extraction ---------------------------------------------------

const LD_SCRIPT_RE = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Every `<script type="application/ld+json">` block on the page, parsed. A block that fails to parse is reported (not thrown) as `{error}` so one bad block doesn't hide the rest. */
export function extractJsonLdBlocks(html) {
  const blocks = [];
  let i = 0;
  for (const match of String(html).matchAll(LD_SCRIPT_RE)) {
    i += 1;
    const raw = decodeEntities(match[1]);
    try {
      blocks.push({ index: i, data: JSON.parse(raw) });
    } catch (err) {
      blocks.push({ index: i, error: `script #${i}: not valid JSON (${err.message})` });
    }
  }
  return blocks;
}

/** Depth-first walk of every object node reachable from `data` (arrays, `@graph`, and every nested property) -- catches a type nested anywhere, e.g. a `Review` inside a `Product`'s `review` field, or a `FAQPage` as a `WebPage`'s `mainEntity`, with no per-type nesting rules to maintain. */
function* walkNodes(data) {
  if (Array.isArray(data)) {
    for (const entry of data) yield* walkNodes(entry);
    return;
  }
  if (!data || typeof data !== "object") return;
  yield data;
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith("@") && key !== "@graph") continue; // @context, @id, @type -- not nodes
    if (value && typeof value === "object") yield* walkNodes(value);
  }
}

function typesOf(node) {
  const t = node["@type"];
  if (!t) return [];
  return Array.isArray(t) ? t.map(String) : [String(t)];
}

// --- Field mapping per schema.org @type ------------------------------------
//
// Only textual claims a visitor can read and check by eye -- never opaque
// numeric or URL fields (`ratingValue`, `priceCurrency`, `image`, ...),
// which this tool has no opinion on.

const ARTICLE_TYPES = ["Article", "BlogPosting", "NewsArticle"];

// LocalBusiness/Organization "and subtypes" has no closed list on
// schema.org, so this is a curated set of the subtypes actually seen in SEO
// guides plus a suffix heuristic (`…Business`, `…Organization`,
// `…Store`) for the many the curated list won't happen to name. Both are
// heuristics, stated plainly rather than presented as exhaustive coverage.
const ORG_TYPES = new Set([
  "LocalBusiness", "Organization", "Corporation", "NGO", "GovernmentOrganization",
  "EducationalOrganization", "OnlineBusiness", "Restaurant", "FoodEstablishment",
  "Hotel", "LodgingBusiness", "Store", "Attorney", "Dentist", "Physician",
  "MedicalBusiness", "ProfessionalService", "LegalService", "FinancialService",
  "AutomotiveBusiness", "RealEstateAgent", "HomeAndConstructionBusiness",
  "HealthAndBeautyBusiness", "SportsActivityLocation", "EntertainmentBusiness",
]);
const ORG_SUFFIX_RE = /(Business|Organization|Store)$/;

function isOrgType(type) {
  return ORG_TYPES.has(type) || ORG_SUFFIX_RE.test(type);
}

/** HowTo's `step` (or `itemListElement`) list, flattened past any `HowToSection` wrapper, into leaf `{name, text}` steps. */
function flattenHowToSteps(list) {
  const steps = [];
  for (const entry of Array.isArray(list) ? list : []) {
    if (!entry || typeof entry !== "object") continue;
    const nested = entry.itemListElement;
    const looksLikeSection = typesOf(entry).includes("HowToSection") || Array.isArray(nested);
    if (looksLikeSection && Array.isArray(nested)) {
      steps.push(...flattenHowToSteps(nested));
      continue;
    }
    steps.push({ name: entry.name, text: entry.text });
  }
  return steps;
}

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * All textual claims a page's JSON-LD makes, as `{type, field, label, text}`.
 * `label` is a human-readable pointer for the report; `text` is the exact
 * authored string to check against the visible page.
 */
export function extractClaims(html) {
  const blocks = extractJsonLdBlocks(html);
  const claims = [];
  const errors = [];

  for (const block of blocks) {
    if (block.error) {
      errors.push(block.error);
      continue;
    }
    for (const node of walkNodes(block.data)) {
      const types = typesOf(node);
      if (!types.length) continue;

      if (types.includes("FAQPage")) {
        (node.mainEntity ?? []).forEach((entry, i) => {
          const question = asText(entry?.name);
          const answer = asText(entry?.acceptedAnswer?.text);
          if (question) claims.push({ type: "FAQPage", field: "question", label: `FAQPage Q${i + 1} question`, text: question });
          if (answer) claims.push({ type: "FAQPage", field: "answer", label: `FAQPage Q${i + 1} answer ("${question.slice(0, 40)}${question.length > 40 ? "…" : ""}")`, text: answer });
        });
        continue;
      }

      if (types.includes("HowTo")) {
        const name = asText(node.name);
        const description = asText(node.description);
        if (name) claims.push({ type: "HowTo", field: "name", label: "HowTo name", text: name });
        if (description) claims.push({ type: "HowTo", field: "description", label: "HowTo description", text: description });
        const steps = flattenHowToSteps(node.step ?? node.itemListElement);
        steps.forEach((step, i) => {
          const stepName = asText(step.name);
          const stepText = asText(step.text);
          if (stepName) claims.push({ type: "HowTo", field: "stepName", label: `HowTo step ${i + 1} name`, text: stepName });
          if (stepText) claims.push({ type: "HowTo", field: "stepText", label: `HowTo step ${i + 1} text`, text: stepText });
        });
        continue;
      }

      if (types.includes("Review")) {
        const reviewBody = asText(node.reviewBody);
        const author = node.author;
        const authorName = asText(typeof author === "string" ? author : author?.name);
        if (reviewBody) claims.push({ type: "Review", field: "reviewBody", label: "Review reviewBody", text: reviewBody });
        if (authorName) claims.push({ type: "Review", field: "authorName", label: "Review author name", text: authorName });
        continue;
      }

      const articleType = types.find((t) => ARTICLE_TYPES.includes(t));
      if (articleType) {
        const headline = asText(node.headline);
        const description = asText(node.description);
        if (headline) claims.push({ type: articleType, field: "headline", label: `${articleType} headline`, text: headline });
        if (description) claims.push({ type: articleType, field: "description", label: `${articleType} description`, text: description });
        continue;
      }

      if (types.includes("Product")) {
        const name = asText(node.name);
        const description = asText(node.description);
        if (name) claims.push({ type: "Product", field: "name", label: "Product name", text: name });
        if (description) claims.push({ type: "Product", field: "description", label: "Product description", text: description });
        continue;
      }

      const orgType = types.find(isOrgType);
      if (orgType) {
        const name = asText(node.name);
        const description = asText(node.description);
        if (name) claims.push({ type: orgType, field: "name", label: `${orgType} name`, text: name });
        if (description) claims.push({ type: orgType, field: "description", label: `${orgType} description`, text: description });
      }
    }
  }

  return { claims, errors };
}

/**
 * Checks every extracted claim against the page's own visible text. Returns
 * `{results, errors, typesFound}` where each result carries `pass` and, on
 * failure, a `divergence` (see `divergence()` above) so a user can see
 * exactly where the copy and the markup part ways.
 */
export function checkPage(html) {
  const { claims, errors } = extractClaims(html);
  const visible = squash(visibleText(html));
  const results = claims.map((claim) => {
    const gap = divergence(squash(claim.text), visible);
    return { ...claim, pass: gap === null, divergence: gap };
  });
  return { results, errors, typesFound: [...new Set(claims.map((c) => c.type))] };
}

/** One-line status for a `checkPage()` result. */
export function summarize({ results, errors }) {
  if (results.length === 0) {
    if (errors.length) return { status: "error", text: `No checkable structured data found, and ${errors.length} JSON-LD block(s) failed to parse: ${errors.join("; ")}` };
    return { status: "none", text: "No FAQPage, HowTo, Article/BlogPosting/NewsArticle, Product, LocalBusiness/Organization, or Review JSON-LD found on this page." };
  }
  const failed = results.filter((r) => !r.pass);
  if (failed.length) {
    return { status: "drift", text: `${failed.length} of ${results.length} structured-data claim(s) diverge from the page's visible text.` };
  }
  const note = errors.length ? ` (${errors.length} JSON-LD block(s) also failed to parse -- see below)` : "";
  return { status: "ok", text: `All ${results.length} structured-data claim(s) match the page's visible text.${note}` };
}

/** The schema.org types this tool checks, and which of their fields, for display. */
export const CHECKED_TYPES = [
  { type: "FAQPage", fields: "mainEntity[].name (question), mainEntity[].acceptedAnswer.text (answer)" },
  { type: "HowTo", fields: "name, description, step[].name, step[].text" },
  { type: "Article / BlogPosting / NewsArticle", fields: "headline, description" },
  { type: "Product", fields: "name, description" },
  { type: "LocalBusiness / Organization (and common subtypes)", fields: "name, description" },
  { type: "Review", fields: "reviewBody, author.name" },
];
