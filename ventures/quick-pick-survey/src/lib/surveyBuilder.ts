/**
 * Validation for an admin-defined ranking survey.
 *
 * An admin pastes or posts their own options (one label per line, or objects
 * with a category) and gets back a survey that can be shared at /s/[slug].
 * Everything here is pure so the rules can be tested without a database; the
 * route only adds the uniqueness check against existing slugs.
 */

export const MAX_ITEMS = 60;
export const MIN_ITEMS = 3;
export const MAX_LABEL = 80;
export const MAX_TITLE = 100;
export const MAX_DESCRIPTION = 500;

export type ItemInput = string | { label: string; category?: string | null };

export const PAIR_SELECTORS = ["standard", "staged"] as const;
export type PairSelector = (typeof PAIR_SELECTORS)[number];

export type SurveyDefinition = {
  title: string;
  description: string | null;
  slug: string;
  /** null leaves the choice to the PAIR_SELECTOR env var. */
  pairSelector: PairSelector | null;
  items: { slug: string; label: string; category: string | null; sortOrder: number }[];
};

export type ParseResult =
  | { ok: true; survey: SurveyDefinition }
  | { ok: false; errors: string[] };

/** Slugs the app already routes on, which a survey must not shadow. */
const RESERVED = new Set(["admin", "api", "app", "couple", "insights", "login", "privacy", "profile", "s", "terms"]);

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Strip control characters and collapse whitespace; labels are one line. */
function clean(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Accepts either an array of items or a block of text, one item per line, with
 * an optional `category: label` prefix written as `Category | Label`.
 */
export function parseItems(raw: unknown): ItemInput[] | null {
  if (Array.isArray(raw)) return raw as ItemInput[];
  if (typeof raw === "string") {
    return raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const bar = line.indexOf("|");
        if (bar > 0) return { category: line.slice(0, bar), label: line.slice(bar + 1) };
        return line;
      });
  }
  return null;
}

export function parseSurveyDefinition(body: unknown, takenSlugs: ReadonlySet<string> = new Set()): ParseResult {
  const errors: string[] = [];
  if (!body || typeof body !== "object") return { ok: false, errors: ["Send a JSON object."] };
  const b = body as Record<string, unknown>;

  const title = typeof b.title === "string" ? clean(b.title) : "";
  if (!title) errors.push("A title is required.");
  else if (title.length > MAX_TITLE) errors.push(`Title is longer than ${MAX_TITLE} characters.`);

  let description: string | null = null;
  if (b.description != null && b.description !== "") {
    if (typeof b.description !== "string") errors.push("Description must be text.");
    else {
      description = clean(b.description);
      if (description.length > MAX_DESCRIPTION) errors.push(`Description is longer than ${MAX_DESCRIPTION} characters.`);
      if (!description) description = null;
    }
  }

  let pairSelector: PairSelector | null = null;
  if (b.pairSelector != null && b.pairSelector !== "") {
    if (PAIR_SELECTORS.includes(b.pairSelector as PairSelector)) pairSelector = b.pairSelector as PairSelector;
    else errors.push(`pairSelector must be one of: ${PAIR_SELECTORS.join(", ")}.`);
  }

  let slug = "";
  if (typeof b.slug === "string" && b.slug.trim()) {
    slug = slugify(b.slug);
    if (slug !== b.slug.trim()) errors.push(`Slug must be lowercase letters, digits and hyphens (try "${slug}").`);
  } else slug = slugify(title);
  if (!slug) errors.push("Could not make a slug from the title; give one.");
  else if (RESERVED.has(slug)) errors.push(`"${slug}" is reserved; pick another slug.`);
  else if (takenSlugs.has(slug)) errors.push(`A survey with slug "${slug}" already exists.`);

  const rawItems = parseItems(b.items);
  const items: SurveyDefinition["items"] = [];
  if (!rawItems) errors.push("Items must be a list or one option per line.");
  else {
    const seen = new Map<string, string>();
    for (const [i, it] of rawItems.entries()) {
      const label = clean(typeof it === "string" ? it : typeof it?.label === "string" ? it.label : "");
      const catRaw = typeof it === "object" && it && typeof it.category === "string" ? clean(it.category) : "";
      if (!label) { errors.push(`Item ${i + 1} is empty.`); continue; }
      if (label.length > MAX_LABEL) { errors.push(`Item ${i + 1} is longer than ${MAX_LABEL} characters.`); continue; }
      let islug = slugify(label) || `item-${i + 1}`;
      const prior = seen.get(islug);
      if (prior !== undefined) {
        if (prior.toLowerCase() === label.toLowerCase()) { errors.push(`"${label}" is listed twice.`); continue; }
        let n = 2;
        while (seen.has(`${islug}-${n}`)) n++;
        islug = `${islug}-${n}`;
      }
      seen.set(islug, label);
      items.push({ slug: islug, label, category: catRaw || null, sortOrder: items.length });
    }
    if (items.length > MAX_ITEMS) errors.push(`At most ${MAX_ITEMS} items (got ${items.length}).`);
    else if (items.length < MIN_ITEMS && errors.length === 0) errors.push(`At least ${MIN_ITEMS} items are needed to rank.`);
  }

  return errors.length ? { ok: false, errors } : { ok: true, survey: { title, description, slug, pairSelector, items } };
}
