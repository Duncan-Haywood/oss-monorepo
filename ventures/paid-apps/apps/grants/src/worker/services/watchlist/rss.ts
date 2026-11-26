// Minimal RSS 2.0 / Atom parsing (regex-based; Workers have no DOMParser). Pure.
import { decodeEntities, htmlFragmentToText } from "../imports/html";

export interface FeedItem {
  title: string;
  link: string | null; // absolute http(s) URL
  date: string | null; // ISO timestamp of publication/update
  description: string; // plain text
  guid: string | null;
}

export function looksLikeFeed(body: string, contentType = ""): boolean {
  if (/(rss|atom)\+xml/i.test(contentType)) return true;
  const head = body.slice(0, 2000);
  return /<rss\b|<feed\b[^>]*xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2005\/Atom|<rdf:RDF\b/i.test(
    head,
  );
}

function unwrap(raw: string | undefined): string {
  if (!raw) return "";
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  const inner = cdata ? (cdata[1] ?? "") : decodeEntities(raw);
  return inner;
}

function tag(xml: string, name: string): string | undefined {
  const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}\\s*>`, "i");
  return xml.match(re)?.[1];
}

function toText(raw: string | undefined): string {
  const s = unwrap(raw);
  return (/[<>]/.test(s) ? htmlFragmentToText(s) : s).replace(/\s+/g, " ").trim();
}

function toIso(raw: string | undefined): string | null {
  const s = toText(raw);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function absolute(href: string, base: string): string | null {
  try {
    const u = new URL(href.trim(), base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}

/** Parses RSS <item>s or Atom <entry>s. Unknown formats yield []. */
export function parseFeed(xml: string, baseUrl: string, max = 100): FeedItem[] {
  const body = xml.replace(/<!--[\s\S]*?-->/g, " ");
  const items: FeedItem[] = [];
  const isAtom = /<feed\b/i.test(body.slice(0, 2000)) && !/<rss\b/i.test(body.slice(0, 2000));
  const blocks = isAtom
    ? [...body.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry\s*>/gi)]
    : [...body.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi)];
  for (const m of blocks.slice(0, max)) {
    const b = m[1] ?? "";
    const title = toText(tag(b, "title"));
    if (!title) continue;
    let link: string | null = null;
    if (isAtom) {
      const links = [...b.matchAll(/<link\b([^>]*)\/?>/gi)].map((l) => l[1] ?? "");
      const pick =
        links.find((a) => /rel\s*=\s*["']alternate["']/i.test(a)) ??
        links.find((a) => !/rel\s*=/i.test(a)) ??
        links[0];
      const href = pick?.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
      link = href ? absolute(decodeEntities(href), baseUrl) : null;
    } else {
      const raw = toText(tag(b, "link"));
      link = raw ? absolute(raw, baseUrl) : null;
    }
    const date = isAtom
      ? (toIso(tag(b, "updated")) ?? toIso(tag(b, "published")))
      : (toIso(tag(b, "pubDate")) ?? toIso(tag(b, "dc:date")));
    const description = isAtom
      ? toText(tag(b, "summary") ?? tag(b, "content"))
      : toText(tag(b, "description") ?? tag(b, "content:encoded"));
    const guid = toText(tag(b, isAtom ? "id" : "guid")) || null;
    items.push({ title, link, date, description, guid });
  }
  return items;
}

/** One line per item (the feed's "page text" for hashing, snapshots and diffs). */
export function feedItemLine(item: FeedItem): string {
  return [item.title, item.link ?? "", item.date ?? ""].join(" | ");
}

export function feedToText(items: FeedItem[]): string {
  return items
    .map((i) => `${feedItemLine(i)}${i.description ? `\n${i.description.slice(0, 2000)}` : ""}`)
    .join("\n");
}

const GRANT_WORDS =
  /\b(grants?|funding|funds?|rfps?|rfas?|nofos?|proposals?|applications?|awards?|solicitations?|request for|fellowships?|scholarships?)\b/i;

/** Feed items worth turning into opportunities (titles/descriptions that talk about funding). */
export function isFundingItem(item: FeedItem): boolean {
  return GRANT_WORDS.test(`${item.title} ${item.description}`);
}
