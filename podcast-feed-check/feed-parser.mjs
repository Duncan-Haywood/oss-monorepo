// Minimal, hand-rolled RSS 2.0 + iTunes/Podcast-namespace feed parser.
//
// This is deliberately NOT a general XML parser. It extracts exactly the
// elements engine.mjs needs to validate, using regex-based element/attribute
// extraction rather than a DOM. That is a real limitation (a CDATA section
// containing a literal "</item>" or "</channel>" string would confuse the
// block extractor below) accepted for the same reason
// hreflang-reciprocity-check and redirect-chain-check vendor their own small
// parsing helpers instead of a real XML/HTML parser: this portfolio's
// standalone ventures carry no npm dependencies, and real-world podcast feed
// generators overwhelmingly produce well-formed, non-pathological XML.
//
// Shared, pure, no I/O -- the same parser is used by the CLI (on a feed it
// fetched itself) and the browser page (on feed XML a visitor pastes in), so
// the two surfaces can never disagree about what a given feed means.

/** Strips a CDATA wrapper and decodes the handful of XML entities RSS feeds
 * actually use. Not a full XML-entity decoder (no DTD-defined entities),
 * which is fine: no podcast feed generator observed in the wild defines its
 * own entities. */
export function decodeText(raw) {
  if (raw == null) return null;
  let text = String(raw).trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(text);
  if (cdata) text = cdata[1];
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&') // must run last, or "&amp;lt;" would double-decode
    .trim();
}

function parseAttrs(attrString) {
  const attrs = {};
  if (!attrString) return attrs;
  const re = /([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(attrString)) !== null) {
    const name = m[1] ?? m[3];
    const value = m[2] ?? m[4];
    attrs[name] = decodeText(value) ?? '';
  }
  return attrs;
}

function escapeTagForRegex(tagName) {
  return tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every top-level occurrence of `<tagName ...>...</tagName>` or a
 * self-closing `<tagName ... />` directly in `xml` (not searched inside
 * nested same-named blocks -- callers pass the block they want searched, per
 * `parseFeed`'s channel/item split below). Returns `{attrs, text}` per
 * match, in document order. */
export function extractAll(xml, tagName) {
  const tag = escapeTagForRegex(tagName);
  const results = [];
  // Self-closing form first, at each position, then the open/close form --
  // running one combined alternation keeps document order.
  const re = new RegExp(
    `<${tag}\\b([^>]*?)\\/>|<${tag}\\b([^>]*?)>([\\s\\S]*?)<\\/${tag}>`,
    'gi',
  );
  let m;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] !== undefined) {
      results.push({ attrs: parseAttrs(m[1]), text: null });
    } else {
      results.push({ attrs: parseAttrs(m[2]), text: decodeText(m[3]) });
    }
  }
  return results;
}

/** The first occurrence of `tagName`, or `null` if absent. */
export function extractFirst(xml, tagName) {
  const all = extractAll(xml, tagName);
  return all.length > 0 ? all[0] : null;
}

/** Every `<itunes:category text="...">`'s `text` attribute, in document
 * order, regardless of nesting or self-closing form. Apple's documented
 * category syntax nests a subcategory one level inside its parent
 * (`<itunes:category text="Society & Culture"><itunes:category
 * text="Documentary"/></itunes:category>`) -- `extractAll`'s
 * open/close-pair matching would let the inner tag's close consume the
 * outer's too and miss the subcategory, so this reads every open tag's
 * attributes directly instead of trying to pair open and close tags. Safe
 * here specifically because callers only ever want the `text` attribute,
 * never this element's inner text. */
export function extractCategoryTexts(xml) {
  const re = /<itunes:category\b([^>]*)>/gi;
  const texts = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = parseAttrs(m[1]);
    if (attrs.text) texts.push(attrs.text);
  }
  return texts;
}

/** Pulls every top-level `<blockTag>...</blockTag>` block's *inner* XML
 * (used to split `<channel>` from its `<item>`s, and each `<item>` out on
 * its own). Non-greedy matching assumes `blockTag` is never nested inside
 * itself, true of `<channel>` and `<item>` in every real-world RSS feed. */
function extractBlockInnerXmlAll(xml, blockTag) {
  const tag = escapeTagForRegex(blockTag);
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const blocks = [];
  let m;
  while ((m = re.exec(xml)) !== null) blocks.push(m[1]);
  return blocks;
}

/**
 * Parses a podcast RSS feed's XML into the shape `engine.mjs` validates.
 * Never throws -- a feed that isn't RSS at all comes back with
 * `parseErrors` set and empty channel/items, so the caller can render that
 * as a finding rather than a crash.
 */
export function parseFeed(xmlText) {
  const xml = String(xmlText ?? '');
  const parseErrors = [];

  const channelBlocks = extractBlockInnerXmlAll(xml, 'channel');
  if (channelBlocks.length === 0) {
    parseErrors.push('No <channel> element found -- this does not look like an RSS feed.');
    return { channel: null, items: [], parseErrors };
  }
  const channelXml = channelBlocks[0];

  const itemXmlBlocks = extractBlockInnerXmlAll(channelXml, 'item');
  // Channel-only fields must never accidentally match a same-named tag
  // inside an <item> (both carry <title>, <description>, <guid>-adjacent
  // tags) -- strip every <item>...</item> block out before reading them.
  let channelOnlyXml = channelXml;
  for (const itemXml of itemXmlBlocks) {
    channelOnlyXml = channelOnlyXml.replace(`<item>${itemXml}</item>`, '');
  }
  // The replace above only matches a bare `<item>` opening tag; items with
  // attributes (rare, but valid XML) are removed by the more general pass
  // below instead.
  channelOnlyXml = channelOnlyXml.replace(/<item\b[^>]*>[\s\S]*?<\/item>/gi, '');

  const title = extractFirst(channelOnlyXml, 'title')?.text ?? null;
  const description = extractFirst(channelOnlyXml, 'description')?.text
    ?? extractFirst(channelOnlyXml, 'itunes:summary')?.text
    ?? null;
  const language = extractFirst(channelOnlyXml, 'language')?.text ?? null;
  const link = extractFirst(channelOnlyXml, 'link')?.text ?? null;

  const itunesCategories = extractCategoryTexts(channelOnlyXml);

  const itunesExplicit = extractFirst(channelOnlyXml, 'itunes:explicit')?.text ?? null;

  const itunesImageEl = extractFirst(channelOnlyXml, 'itunes:image');
  const itunesImage = itunesImageEl?.attrs?.href ?? null;

  const atomSelfLinkEl = extractAll(channelOnlyXml, 'atom:link').find(
    (l) => (l.attrs.rel ?? '').toLowerCase() === 'self',
  );
  const atomSelfLink = atomSelfLinkEl?.attrs?.href ?? null;

  const itunesOwnerBlocks = extractBlockInnerXmlAll(channelOnlyXml, 'itunes:owner');
  const itunesOwnerEmail = itunesOwnerBlocks.length > 0
    ? (extractFirst(itunesOwnerBlocks[0], 'itunes:email')?.text ?? null)
    : null;

  const channel = {
    title, description, language, link,
    itunesCategories, itunesExplicit, itunesImage, atomSelfLink, itunesOwnerEmail,
  };

  const items = itemXmlBlocks.map((itemXml) => {
    const itemTitle = extractFirst(itemXml, 'title')?.text ?? null;
    const guidEl = extractFirst(itemXml, 'guid');
    const guid = guidEl
      ? { value: guidEl.text, isPermaLink: (guidEl.attrs.isPermaLink ?? 'true').toLowerCase() !== 'false' }
      : null;
    const pubDate = extractFirst(itemXml, 'pubDate')?.text ?? null;
    const enclosureEl = extractFirst(itemXml, 'enclosure');
    const enclosure = enclosureEl
      ? { url: enclosureEl.attrs.url ?? null, type: enclosureEl.attrs.type ?? null, length: enclosureEl.attrs.length ?? null }
      : null;
    const itunesDuration = extractFirst(itemXml, 'itunes:duration')?.text ?? null;
    const itunesEpisodeType = extractFirst(itemXml, 'itunes:episodeType')?.text ?? null;

    return { title: itemTitle, guid, pubDate, enclosure, itunesDuration, itunesEpisodeType };
  });

  return { channel, items, parseErrors };
}
