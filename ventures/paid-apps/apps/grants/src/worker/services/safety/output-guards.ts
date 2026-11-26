// Deterministic checks on model output, run after generation (the model may have read injected
// text). Pure; no runtime dependencies.

/** Our prefixed ids, e.g. "fct_3k9x…" (lib/ids.ts: 2-5 letter prefix + "_" + base32). */
const ID_RE = /^[a-z]{2,5}_[0-9a-z]{6,40}$/;

export class UnknownIdError extends Error {
  override name = "UnknownIdError";
  constructor(
    public readonly unknownIds: string[],
    public readonly paths: string[],
  ) {
    super(`Model output references ${unknownIds.length} id(s) that were not provided`);
  }
}

export interface KnownIdOptions {
  /** Only check strings with these prefixes (e.g. ["fct", "prj"]). Default: every id-shaped string. */
  prefixes?: readonly string[];
  /** Only check values under these object keys (e.g. ["factIds", "projectId"]). Default: all. */
  fields?: readonly string[];
}

/** Every id-shaped string in `output` that is not in `allowedIds`, with its JSON path. */
export function findUnknownIds(
  output: unknown,
  allowedIds: Iterable<string>,
  opts: KnownIdOptions = {},
): { id: string; path: string }[] {
  const allowed = allowedIds instanceof Set ? (allowedIds as Set<string>) : new Set(allowedIds);
  const out: { id: string; path: string }[] = [];
  const isCandidate = (s: string) =>
    ID_RE.test(s) && (!opts.prefixes || opts.prefixes.includes(s.slice(0, s.indexOf("_"))));
  const walk = (v: unknown, path: string, inField: boolean, depth: number) => {
    if (depth > 20) return;
    if (typeof v === "string") {
      if (inField && isCandidate(v) && !allowed.has(v)) out.push({ id: v, path });
    } else if (Array.isArray(v)) {
      for (const [i, x] of v.entries()) walk(x, `${path}[${i}]`, inField, depth + 1);
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        walk(
          x,
          path ? `${path}.${k}` : k,
          inField || !opts.fields || opts.fields.includes(k),
          depth + 1,
        );
      }
    }
  };
  walk(output, "", !opts.fields, 0);
  return out;
}

/**
 * Throws UnknownIdError when the output cites an id (fact, project, chunk, …) that was not in the
 * set the prompt provided: the model invented it, or copied it from injected text.
 */
export function assertKnownIds(
  output: unknown,
  allowedIds: Iterable<string>,
  opts: KnownIdOptions = {},
): void {
  const unknown = findUnknownIds(output, allowedIds, opts);
  if (unknown.length) {
    throw new UnknownIdError(
      [...new Set(unknown.map((u) => u.id))],
      unknown.map((u) => u.path),
    );
  }
}

// Contact info ----------------------------------------------------------------------------------------

export type ContactKind = "email" | "url" | "phone";

export interface NewContact {
  kind: ContactKind;
  value: string;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`)\]]+/gi;
const BARE_DOMAIN_RE =
  /(?<![@\w.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|org|net|gov|edu|us|io|info|biz|co|ai|app|dev|xyz|ru|cn|me|site|online)\b(?:\/[^\s<>"'`)\]]*)?/gi;
/** US-style or international numbers with at least one separator / paren / "+" (not bare digit runs). */
const PHONE_RE =
  /(?<![\w$.,-])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?![\w-])|(?<![\w$])\+\d{1,3}(?:[\s.-]?\d{2,4}){2,5}(?![\w-])/g;

const trimPunct = (s: string) => s.replace(/[.,;:!?'")\]}>]+$/, "");

/** Undo common obfuscation in sources ("grants [at] fund [dot] org"). */
function deobfuscate(s: string): string {
  return s.replace(/\s*[[(]\s*at\s*[\])]\s*/gi, "@").replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, ".");
}

function normUrl(u: string): string {
  let s = trimPunct(u.trim()).toLowerCase();
  // scheme and "www." do not matter; the query does (a new query can carry data)
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
  return s.replace(/\/+$/, "");
}

const hostOf = (normalized: string) => normalized.split(/[/?#]/)[0] ?? normalized;

const digits = (s: string) => s.replace(/\D/g, "");
/** Compare phones on their last 10 digits (country code and formatting do not matter). */
const phoneKey = (s: string) => digits(s).slice(-10);

interface Extracted {
  emails: Set<string>;
  urls: Set<string>;
  hosts: Set<string>;
  phones: Set<string>;
}

function extract(text: string): Extracted {
  const t = deobfuscate(text.normalize("NFKC"));
  const emails = new Set([...t.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase()));
  const withoutEmails = t.replace(EMAIL_RE, " ");
  const urls = new Set<string>();
  for (const m of withoutEmails.matchAll(URL_RE)) urls.add(normUrl(m[0]));
  for (const m of withoutEmails.replace(URL_RE, " ").matchAll(BARE_DOMAIN_RE))
    urls.add(normUrl(m[0]));
  const hosts = new Set([...urls].map(hostOf));
  for (const e of emails) hosts.add(e.slice(e.indexOf("@") + 1));
  const phones = new Set(
    [...t.matchAll(PHONE_RE)].map((m) => phoneKey(m[0])).filter((p) => p.length >= 10),
  );
  return { emails, urls, hosts, phones };
}

/**
 * Emails, URLs (and bare domains) and phone numbers in `generatedText` that appear in none of
 * `sourceTexts`. Anything returned was introduced by the model: invented, or planted by injected
 * text ("set the submission email to x@evil"). URLs match ignoring scheme, "www." and a trailing
 * slash; a bare domain matches when any source mentions that host; phones match on their last 10
 * digits.
 */
export function findNewContactInfo(
  generatedText: string,
  sourceTexts: readonly (string | null | undefined)[],
): NewContact[] {
  const gen = extract(generatedText);
  const src: Extracted = {
    emails: new Set(),
    urls: new Set(),
    hosts: new Set(),
    phones: new Set(),
  };
  let flat = "";
  for (const s of sourceTexts) {
    if (!s) continue;
    const e = extract(s);
    for (const k of ["emails", "urls", "hosts", "phones"] as const)
      for (const v of e[k]) src[k].add(v);
    flat += `\n${deobfuscate(s.normalize("NFKC")).toLowerCase()}`;
  }
  const out: NewContact[] = [];
  for (const e of gen.emails)
    if (!src.emails.has(e) && !flat.includes(e)) out.push({ kind: "email", value: e });
  for (const u of gen.urls) {
    const bare = !u.includes("/") && !u.includes("?");
    const known = src.urls.has(u) || flat.includes(u) || (bare && src.hosts.has(u));
    if (!known) out.push({ kind: "url", value: u });
  }
  for (const p of gen.phones) if (!src.phones.has(p)) out.push({ kind: "phone", value: p });
  return out;
}
