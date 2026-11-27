// Tiny, SAFE markdown renderer (copied from apps/grants, styled for PayApps). Input is never injected as HTML: we parse into a small AST and emit
// React elements, so every piece of text is escaped by React. Raw HTML in the source renders as text.
// Supported: ATX headings, paragraphs, (nested-flattened) bullet / numbered lists, blockquotes, fenced
// code, horizontal rules, simple GFM tables, **bold**, *italic*, `code`, [links](href) with
// http(s) / mailto / relative hrefs only.
import * as React from "react";

const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "br" };

type Block =
  | { t: "h"; level: number; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "ul" | "ol"; items: Inline[][]; start?: number }
  | { t: "quote"; c: Block[] }
  | { t: "pre"; v: string }
  | { t: "hr" }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] };

/**
 * Returns the href if it is safe to put in an <a>, otherwise null.
 * Allowed: http:, https:, mailto:, and scheme-less relative URLs (/, #, ./, ../, path).
 * Control characters and whitespace are stripped before checking so "java\tscript:" is caught.
 */
export function safeHref(raw: string): string | null {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally stripping control chars
  const cleaned = raw.replace(/[\u0000- \u007f-\u009f]/g, "");
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if (/^https?:\/\/[^/\\]/.test(lower)) return cleaned;
  if (/^mailto:[^\s@]+@[^\s@]+$/.test(lower)) return cleaned;
  // Any other scheme (javascript:, data:, vbscript:, file:, ...) is rejected.
  if (/^[a-z][a-z0-9+.-]*:/.test(lower)) return null;
  // A colon before the first / ? # would be interpreted as a scheme by some parsers.
  const firstSep = lower.search(/[/?#]/);
  const colon = lower.indexOf(":");
  if (colon !== -1 && (firstSep === -1 || colon < firstSep)) return null;
  // Protocol-relative and backslash tricks ("//evil", "/\evil", "\\evil").
  if (/^[/\\]{2}/.test(lower) || lower.startsWith("\\")) return null;
  return cleaned;
}

// ---------- inline parsing ----------

function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    const rest = src.slice(i);

    // Backslash escape of punctuation.
    if (ch === "\\" && i + 1 < src.length && /[\\`*_[\]()#+\-.!>|~]/.test(src[i + 1] as string)) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    // Hard line break (two trailing spaces encoded as \n by the block parser).
    if (ch === "\n") {
      flush();
      out.push({ t: "br" });
      i += 1;
      continue;
    }
    if (ch === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: "code", v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (rest.startsWith("**") || rest.startsWith("__")) {
      const marker = rest.slice(0, 2);
      const end = src.indexOf(marker, i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: "strong", c: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (ch === "*" || ch === "_") {
      const end = src.indexOf(ch, i + 1);
      // Avoid treating snake_case or "a * b" as emphasis.
      const prev = i > 0 ? (src[i - 1] as string) : " ";
      const next = src[i + 1] ?? " ";
      if (end > i + 1 && !/\w/.test(prev) && next !== " " && src[end - 1] !== " ") {
        flush();
        out.push({ t: "em", c: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (ch === "[") {
      const m = /^\[([^\]]*)\]\(\s*([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)(?:\s+"[^"]*")?\s*\)/.exec(
        rest,
      );
      if (m) {
        flush();
        const label = parseInline(m[1] ?? "");
        const href = safeHref(m[2] ?? "");
        if (href) out.push({ t: "link", href, c: label });
        else out.push(...label); // unsafe link: keep the text, drop the href
        i += m[0].length;
        continue;
      }
    }
    // Bare URL autolink.
    if (ch === "h" && /^https?:\/\//.test(rest)) {
      const m = /^https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/.exec(rest);
      const href = m ? safeHref(m[0]) : null;
      if (m && href) {
        flush();
        out.push({ t: "link", href, c: [{ t: "text", v: m[0] }] });
        i += m[0].length;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

// ---------- block parsing ----------

const RE_HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RE_UL = /^\s*[-*+]\s+(.*)$/;
const RE_OL = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const RE_HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const RE_FENCE = /^\s*(```|~~~)/;
const RE_TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => parseInline(c.trim()));

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const isBlank = (l: string | undefined) => l === undefined || l.trim() === "";

  while (i < lines.length) {
    const line = lines[i] as string;
    if (isBlank(line)) {
      i++;
      continue;
    }
    // Fenced code
    const fence = RE_FENCE.exec(line);
    if (fence) {
      const marker = fence[1] as string;
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] as string).trim().startsWith(marker)) {
        body.push(lines[i] as string);
        i++;
      }
      i++; // closing fence
      blocks.push({ t: "pre", v: body.join("\n") });
      continue;
    }
    const h = RE_HEADING.exec(line);
    if (h) {
      blocks.push({ t: "h", level: (h[1] as string).length, c: parseInline(h[2] ?? "") });
      i++;
      continue;
    }
    if (RE_HR.test(line)) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i] as string)) {
        body.push((lines[i] as string).replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push({ t: "quote", c: parseMarkdown(body.join("\n")) });
      continue;
    }
    // Table: header row followed by a separator row.
    if (line.includes("|") && RE_TABLE_SEP.test(lines[i + 1] ?? "")) {
      const head = splitRow(line);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && !isBlank(lines[i]) && (lines[i] as string).includes("|")) {
        rows.push(splitRow(lines[i] as string));
        i++;
      }
      blocks.push({ t: "table", head, rows });
      continue;
    }
    const ul = RE_UL.exec(line);
    const ol = RE_OL.exec(line);
    if (ul || ol) {
      const kind = ul ? "ul" : "ol";
      const re = ul ? RE_UL : RE_OL;
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i] as string;
        const m = re.exec(l);
        if (m) {
          items.push((ul ? m[1] : m[2]) ?? "");
        } else if (!isBlank(l) && /^\s+\S/.test(l) && items.length) {
          // continuation line (or nested list of the other kind): fold into the current item
          const nested = RE_UL.exec(l) ?? RE_OL.exec(l);
          if (nested) items.push((RE_UL.exec(l)?.[1] ?? RE_OL.exec(l)?.[2]) as string);
          else items[items.length - 1] += ` ${l.trim()}`;
        } else if (isBlank(l) && re.test(lines[i + 1] ?? "")) {
          // loose list: blank line between items
        } else break;
        i++;
      }
      blocks.push({
        t: kind,
        items: items.map(parseInline),
        start: ol ? Number(ol[1]) : undefined,
      });
      continue;
    }
    // Paragraph: consume until blank line or another block starts.
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] as string;
      if (
        isBlank(l) ||
        RE_HEADING.test(l) ||
        RE_FENCE.test(l) ||
        /^\s*>/.test(l) ||
        (para.length > 0 && (RE_UL.test(l) || RE_OL.test(l) || RE_HR.test(l)))
      )
        break;
      para.push(/ {2,}$/.test(l) ? `${l.trim()}\n` : l.trim());
      i++;
    }
    blocks.push({ t: "p", c: parseInline(para.join(" ").replace(/\n /g, "\n").trim()) });
  }
  return blocks;
}

// ---------- rendering ----------

function renderInline(nodes: Inline[], keyPrefix = ""): React.ReactNode[] {
  return nodes.map((n, idx) => {
    const key = `${keyPrefix}${idx}`;
    switch (n.t) {
      case "text":
        return <React.Fragment key={key}>{n.v}</React.Fragment>;
      case "strong":
        return (
          <strong key={key} className="font-semibold text-slate-900">
            {renderInline(n.c, `${key}-`)}
          </strong>
        );
      case "em":
        return <em key={key}>{renderInline(n.c, `${key}-`)}</em>;
      case "code":
        return (
          <code key={key} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em]">
            {n.v}
          </code>
        );
      case "br":
        return <br key={key} />;
      case "link": {
        const external = /^https?:/i.test(n.href);
        return (
          <a
            key={key}
            href={n.href}
            className="font-medium text-slate-900 underline underline-offset-2"
            {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
          >
            {renderInline(n.c, `${key}-`)}
          </a>
        );
      }
      default:
        return null;
    }
  });
}

const headingClass: Record<number, string> = {
  1: "mt-8 mb-4 text-2xl font-semibold tracking-tight text-slate-900",
  2: "mt-8 mb-3 text-xl font-semibold tracking-tight text-slate-900",
  3: "mt-6 mb-2 text-lg font-semibold text-slate-900",
  4: "mt-5 mb-2 text-base font-semibold text-slate-900",
  5: "mt-4 mb-1 text-sm font-semibold uppercase tracking-wide text-slate-800",
  6: "mt-4 mb-1 text-sm font-semibold text-slate-800",
};

function renderBlocks(blocks: Block[], headingOffset: number): React.ReactNode[] {
  return blocks.map((b, idx) => {
    const key = String(idx);
    switch (b.t) {
      case "h": {
        const level = Math.min(6, Math.max(1, b.level + headingOffset));
        const Tag = `h${level}` as "h1";
        return (
          <Tag key={key} className={headingClass[level]}>
            {renderInline(b.c)}
          </Tag>
        );
      }
      case "p":
        return (
          <p key={key} className="my-3 leading-relaxed">
            {renderInline(b.c)}
          </p>
        );
      case "ul":
        return (
          <ul key={key} className="my-3 list-disc space-y-1.5 pl-6 marker:text-neutral-400">
            {b.items.map((it, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static content
              <li key={j} className="pl-1 leading-relaxed">
                {renderInline(it)}
              </li>
            ))}
          </ul>
        );
      case "ol":
        return (
          <ol
            key={key}
            start={b.start}
            className="my-3 list-decimal space-y-1.5 pl-6 marker:text-slate-400"
          >
            {b.items.map((it, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static content
              <li key={j} className="pl-1 leading-relaxed">
                {renderInline(it)}
              </li>
            ))}
          </ol>
        );
      case "quote":
        return (
          <blockquote
            key={key}
            className="my-4 border-l-4 border-amber-300 bg-amber-50 py-1 pl-4 text-slate-800"
          >
            {renderBlocks(b.c, headingOffset)}
          </blockquote>
        );
      case "pre":
        return (
          <pre
            key={key}
            className="my-4 overflow-x-auto rounded-lg bg-neutral-900 p-4 font-mono text-xs text-neutral-100"
          >
            <code>{b.v}</code>
          </pre>
        );
      case "hr":
        return <hr key={key} className="my-8 border-slate-200" />;
      case "table":
        return (
          <div key={key} className="my-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {b.head.map((c, j) => (
                    <th
                      // biome-ignore lint/suspicious/noArrayIndexKey: static content
                      key={j}
                      scope="col"
                      className="px-3 py-2 text-left font-semibold text-slate-800"
                    >
                      {renderInline(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {b.rows.map((row, r) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static content
                  <tr key={r}>
                    {row.map((c, j) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: static content
                      <td key={j} className="px-3 py-2 align-top text-slate-800">
                        {renderInline(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      default:
        return null;
    }
  });
}

/** Render untrusted markdown safely. Pass text as `source` or as a string child. */
export function Markdown({
  source,
  children,
  className,
  headingOffset = 0,
  size = "base",
}: {
  source?: string | null;
  children?: string;
  className?: string;
  /** Shift heading levels, e.g. 1 turns "#" into <h2> when the page already has an <h1>. */
  headingOffset?: number;
  size?: "sm" | "base";
}) {
  const text = source ?? children ?? "";
  const blocks = React.useMemo(() => parseMarkdown(text), [text]);
  return (
    <div
      className={cn(
        "max-w-none text-slate-800 [&>:first-child]:mt-0 [&>:last-child]:mb-0",
        size === "sm" ? "text-sm" : "text-[0.95rem]",
        className,
      )}
    >
      {renderBlocks(blocks, headingOffset)}
    </div>
  );
}

/** Inline-only markdown (bold/italic/code/links) for short strings such as claim text. */
export function InlineMarkdown({ source }: { source: string }) {
  const nodes = React.useMemo(() => parseInline(source), [source]);
  return <>{renderInline(nodes)}</>;
}
