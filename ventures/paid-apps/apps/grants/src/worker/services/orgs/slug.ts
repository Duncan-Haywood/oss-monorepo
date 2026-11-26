// URL slugs for organizations: "Southwest Indian Foundation" -> "southwest-indian-foundation".

const MAX_SLUG_LENGTH = 48;

export function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return base || "org";
}

/** Picks `base`, else the first free `base-N` (N >= 2) given the slugs already taken. */
export function nextFreeSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${base}-${n}`;
    if (!set.has(candidate)) return candidate;
  }
  return `${base}-${randomSuffix()}`;
}

export function randomSuffix(len = 5): string {
  const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b & 31]).join("");
}
