// HTML -> main text + links. Regex-based (runs in Workers and Node without a DOM); good enough for
// grant listings and nonprofit websites. Strips scripts/styles/nav/header/footer/forms and, when
// present, keeps only <main>/<article> content.

export interface ExtractedHtml {
  title: string | null;
  text: string;
  links: string[]; // absolute http(s) URLs, fragment stripped, in document order, deduped
  robots: { noindex: boolean; nofollow: boolean };
}

const DROP_BLOCKS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "iframe",
  "object",
  "canvas",
  "head",
];
const BOILERPLATE_BLOCKS = ["nav", "header", "footer", "aside", "form", "dialog", "menu"];

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code =
        e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function removeElements(html: string, tags: string[]): string {
  let out = html;
  for (const tag of tags) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, "gi"), " ");
    out = out.replace(new RegExp(`<${tag}\\b[^>]*/>`, "gi"), " ");
  }
  return out;
}

function innerOf(html: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}\\s*>`, "gi");
  const parts = [...html.matchAll(re)].map((m) => m[1] ?? "");
  const joined = parts.join("\n");
  return joined.replace(/<[^>]+>/g, "").trim().length > 200 ? joined : null;
}

/** Converts an HTML fragment to readable plain text (block elements become line breaks). */
export function htmlFragmentToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<h([1-6])\b[^>]*>/gi, (_m, n: string) => `\n\n${"#".repeat(Number(n))} `)
      .replace(
        /<\/?(p|div|section|article|main|h[1-6]|ul|ol|li|tr|table|blockquote|pre|dl|dt|dd|figure|figcaption)\b[^>]*>/gi,
        "\n",
      )
      .replace(/<\/t[dh]\s*>/gi, " | ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractHtml(html: string, baseUrl: string): ExtractedHtml {
  const noComments = html.replace(/<!--[\s\S]*?-->/g, " ");
  const titleMatch = noComments.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  const title = titleMatch?.[1] ? decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim() : null;

  const metaRobots = [...noComments.matchAll(/<meta\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /name\s*=\s*["']?(robots|grantautopilotbot)["']?/i.test(tag))
    .map((tag) => tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1]?.toLowerCase() ?? "")
    .join(",");
  const robots = {
    noindex: /\b(noindex|none)\b/.test(metaRobots),
    nofollow: /\b(nofollow|none)\b/.test(metaRobots),
  };

  const links: string[] = [];
  const seen = new Set<string>();
  for (const m of noComments.matchAll(
    /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi,
  )) {
    const tag = m[0];
    if (/\brel\s*=\s*["'][^"']*nofollow/i.test(tag)) continue;
    const href = decodeEntities((m[1] ?? m[2] ?? m[3] ?? "").trim());
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript|data):/i.test(href)) continue;
    try {
      const u = new URL(href, baseUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      u.hash = "";
      if (!seen.has(u.href)) {
        seen.add(u.href);
        links.push(u.href);
      }
    } catch {
      // ignore malformed hrefs
    }
  }

  const bodyMatch = noComments.match(/<body\b[^>]*>([\s\S]*)<\/body\s*>/i);
  let body = bodyMatch?.[1] ?? noComments;
  body = removeElements(body, DROP_BLOCKS);
  const main = innerOf(body, "main") ?? innerOf(body, "article");
  // Inside <main>/<article> keep <header> (it usually holds the page's <h1>).
  const content = main
    ? removeElements(
        main,
        BOILERPLATE_BLOCKS.filter((t) => t !== "header"),
      )
    : removeElements(body, BOILERPLATE_BLOCKS);
  return { title, text: htmlFragmentToText(content), links, robots };
}

// Hidden elements: `hidden`, aria-hidden="true", or inline styles that hide text (display:none,
// visibility:hidden, zero font size / opacity). Text in them is not "visible on the page".
const HIDDEN_ATTR_SRC = String.raw`(?:\shidden(?=[\s=/>])|\saria-hidden\s*=\s*["']?true|\sstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:\.0+)?(?:px|em|rem|pt|%)?\s*(?:[;"'!])|opacity\s*:\s*0(?:\.0+)?\s*(?:[;"'!])))`;
const HIDDEN_ELEMENT_RE = new RegExp(
  String.raw`<([a-z][a-z0-9]*)\b(?=[^>]*${HIDDEN_ATTR_SRC})[^>]*>[\s\S]*?</\1\s*>`,
  "gi",
);

/**
 * Removes hidden elements (and HTML comments) so `extractHtml` returns only what a visitor sees.
 * Used to check that contact details a model extracted are visibly on the page (docs/SAFETY.md).
 */
export function stripHiddenElements(html: string): string {
  let out = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (let i = 0; i < 5; i++) {
    const next = out.replace(HIDDEN_ELEMENT_RE, " ");
    if (next === out) break;
    out = next;
  }
  return out;
}
