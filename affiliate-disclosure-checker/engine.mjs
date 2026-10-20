// Zero-dependency, deterministic checker: does a page's visible text carry an
// affiliate/sponsored-content disclosure *before* the first affiliate link a
// reader would encounter? No filesystem or network access here -- callers
// (cli.mjs for the CLI, index.html for the browser page) supply plain HTML
// text; this module only parses strings and reports facts about them.
//
// This is a pattern-matching fact-checker, not a legal or compliance
// determination. It never says "you are compliant" or "the FTC will not act
// on this" -- it reports which known affiliate-link signals it found, which
// known disclosure phrases it found, and whether a disclosure appears before
// the first affiliate link in reading order. The user remains the one who
// decides whether that is enough; see the FTC's own Endorsement Guides and
// Amazon's Associates Program Operating Agreement for what "enough" means in
// their words, not this tool's.

// Affiliate-link signals. Each has a short, named reason so the report can
// say *why* a link was flagged, not just that it was. Grouped by how the
// network makes itself identifiable in a plain href/rel, not by brand.
const LINK_SIGNALS = [
  // Amazon Associates: the tracking parameter is `tag=`, present on every
  // Associates-generated link regardless of Amazon storefront TLD (.com,
  // .co.uk, .de, ...). amzn.to is Amazon's own link shortener, used almost
  // exclusively to wrap an Associates link.
  {
    reason: "Amazon Associates link (amazon.* with a tag= parameter, or an amzn.to short link)",
    test: (href) => /amazon\.[a-z.]{2,10}\/[^\s"'<>]*[?&]tag=/i.test(href) || /(^|\/)amzn\.to\//i.test(href),
  },
  // rel="sponsored" is Google's own recommended annotation for a paid,
  // sponsored, or affiliate link (any network) -- a network-agnostic signal
  // checked separately, against the tag's rel attribute rather than the href.
  // (handled in isSponsoredRel(), not here -- it needs the rel string, not href)

  // Widely-used affiliate-network tracking/redirect domains. These hosts are
  // used almost exclusively to wrap a commission-tracked outbound link, so a
  // link through one of them is strong evidence of an affiliate relationship
  // regardless of the destination merchant.
  {
    reason: "known affiliate-network tracking link",
    test: (href) =>
      /(^|\/\/|\.)(shareasale\.com|shrsl\.com|awin1\.com|click\.linksynergy\.com|anrdoezrs\.net|dpbolvw\.net|tkqlhce\.com|kqzyfj\.com|jdoqocy\.com|evyy\.net|pxf\.io|sjv\.io|skimresources\.com|go\.skimresources\.com|redirect\.viglink\.com|viglink\.com|rstyle\.me|shopstyle\.it|avantlink\.com|impact\.com|partnerize\.com)\b/i.test(
        href,
      ),
  },
  // Generic tracking parameters used across many affiliate networks
  // (network-agnostic): an Impact Radius click id, or an explicit
  // affiliate/aff id parameter on any href.
  {
    reason: "generic affiliate tracking parameter (irclickid=, affiliate_id=, or aff_id=)",
    test: (href) => /[?&](irclickid|affiliate_id|aff_id)=/i.test(href),
  },
];

/** Does an anchor's `rel` attribute carry Google's recommended affiliate/sponsored annotation? */
function isSponsoredRel(rel) {
  return /\bsponsored\b/i.test(rel || "");
}

/** Classifies one anchor's href+rel. Returns a reason string, or null if it isn't a recognised affiliate link. */
export function classifyLink(href, rel) {
  if (isSponsoredRel(rel)) return 'rel="sponsored" attribute (Google\'s recommended affiliate/paid-link annotation)';
  for (const signal of LINK_SIGNALS) {
    if (signal.test(href || "")) return signal.reason;
  }
  return null;
}

// Amazon's Associates Program Operating Agreement requires this specific
// statement (case- and punctuation-insensitive here) on every page that
// carries an Associates link -- not just "some" disclosure. Matched as two
// short phrases within 140 characters of each other so minor rewording
// ("As an Amazon Associate, I earn from qualifying purchases.") still counts,
// while two unrelated sentences that each contain one half do not.
const AMAZON_PHRASE_PART_A = /as an amazon associate/i;
const AMAZON_PHRASE_PART_B = /earn(?:s)? from qualifying purchases/i;
const AMAZON_PHRASE_WINDOW = 140;

// Generic FTC-style affiliate/sponsored-content disclosure phrasing. Any one
// of these, appearing before the first affiliate link, is treated as a
// "clear and conspicuous" disclosure attempt for a non-Amazon affiliate
// link. (Amazon links additionally need the exact phrase above -- see
// `missingAmazonRequiredPhrase` in checkDisclosure.)
const GENERIC_DISCLOSURE_PHRASES = [
  /affiliate links?/i,
  /this post contains affiliate/i,
  /may earn (?:a |an )?(?:small )?commission/i,
  /earns? (?:a |an )?commission/i,
  /we (?:may )?(?:receive|earn) (?:a )?commission/i,
  /paid link/i,
  /sponsored post/i,
  /paid partnership/i,
  /#ad\b/i,
  /#sponsored\b/i,
  /at no (?:extra|additional) cost to you/i,
  /compensated for (?:referring|referrals)/i,
];

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
function decodeEntities(s) {
  return s.replace(/&(#39|amp|lt|gt|quot|apos|nbsp);/g, (_, name) => ENTITIES[name]);
}

// Tokenises HTML into: an HTML comment, a whole <script>...</script> or
// <style>...</style> block (dropped entirely -- code and CSS text is not
// content a reader sees), a single tag, or a run of plain text. Order
// matters: script/style must match before the generic tag pattern so their
// contents are never treated as visible text.
const TOKEN_RE = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>|<[^>]+>|[^<]+/gi;

const ANCHOR_OPEN_RE = /^<a\s+([^>]*)>$/i;
function attr(name, attrs) {
  const re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const m = re.exec(attrs);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

/**
 * Walks `html` once, building the flattened visible-text stream and noting
 * the character offset (into that stream) of every recognised affiliate
 * anchor. Offsets are what let `checkDisclosure` answer "does the disclosure
 * appear *before* the first affiliate link", not just "is it on the page
 * somewhere".
 */
export function extractVisibleText(html) {
  const text = [];
  const affiliateLinks = [];
  const re = new RegExp(TOKEN_RE.source, TOKEN_RE.flags);
  let match;
  while ((match = re.exec(String(html ?? "")))) {
    const token = match[0];
    if (token.startsWith("<!--")) continue; // comment: not visible
    if (/^<(script|style)\b/i.test(token)) continue; // code/CSS: not visible text
    if (token.startsWith("<")) {
      const anchor = ANCHOR_OPEN_RE.exec(token);
      if (anchor) {
        const href = attr("href", anchor[1]) || "";
        const rel = attr("rel", anchor[1]) || "";
        const reason = classifyLink(href, rel);
        if (reason) affiliateLinks.push({ href, reason, position: text.join("").length });
      }
      continue; // any other tag contributes no visible text of its own
    }
    text.push(decodeEntities(token));
  }
  return { text: text.join(""), affiliateLinks };
}

/** Every disclosure-phrase match in `text`, each with its character offset. */
export function findDisclosures(text) {
  const found = [];

  // Amazon's exact required statement: two halves within a short window.
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const a = AMAZON_PHRASE_PART_A.exec(text.slice(searchFrom));
    if (!a) break;
    const aPos = searchFrom + a.index;
    const windowEnd = aPos + a[0].length + AMAZON_PHRASE_WINDOW;
    const b = AMAZON_PHRASE_PART_B.exec(text.slice(aPos, windowEnd));
    if (b) {
      found.push({ phrase: "as an Amazon Associate I earn from qualifying purchases", kind: "amazon-required", position: aPos });
    }
    searchFrom = aPos + a[0].length;
  }

  for (const re of GENERIC_DISCLOSURE_PHRASES) {
    const g = new RegExp(re.source, re.flags);
    const m = g.exec(text);
    if (m) found.push({ phrase: m[0], kind: "generic", position: m.index });
  }

  found.sort((x, y) => x.position - y.position);
  return found;
}

/**
 * Full report for one page's HTML: every affiliate link found, every
 * disclosure phrase found, and whether a disclosure appears before the
 * first affiliate link. Never a compliance verdict -- see the module
 * comment.
 */
export function checkDisclosure(html) {
  const { text, affiliateLinks } = extractVisibleText(html);
  const disclosures = findDisclosures(text);

  const hasAffiliateLinks = affiliateLinks.length > 0;
  const hasAmazonLink = affiliateLinks.some((l) => l.reason.startsWith("Amazon Associates"));
  const hasAmazonRequiredPhrase = disclosures.some((d) => d.kind === "amazon-required");
  const hasAnyDisclosure = disclosures.length > 0;

  const earliestLinkPosition = hasAffiliateLinks ? Math.min(...affiliateLinks.map((l) => l.position)) : null;
  const earliestDisclosurePosition = hasAnyDisclosure ? disclosures[0].position : null;

  let status;
  if (!hasAffiliateLinks) {
    status = "no-affiliate-links";
  } else if (!hasAnyDisclosure) {
    status = "missing-disclosure";
  } else if (earliestDisclosurePosition > earliestLinkPosition) {
    status = "disclosure-too-late";
  } else {
    status = "ok";
  }

  return {
    affiliateLinks,
    disclosures,
    hasAffiliateLinks,
    hasAnyDisclosure,
    hasAmazonLink,
    hasAmazonRequiredPhrase,
    missingAmazonRequiredPhrase: hasAmazonLink && !hasAmazonRequiredPhrase,
    earliestLinkPosition,
    earliestDisclosurePosition,
    status,
  };
}

export function summarize(report) {
  switch (report.status) {
    case "no-affiliate-links":
      return { level: "info", text: "No affiliate links recognised on this page -- nothing to disclose." };
    case "missing-disclosure":
      return {
        level: "fail",
        text: `${report.affiliateLinks.length} affiliate link(s) found and no disclosure phrase found anywhere on the page.`,
      };
    case "disclosure-too-late":
      return {
        level: "fail",
        text: "A disclosure phrase was found, but only after the first affiliate link -- not before it, as FTC guidance calls for.",
      };
    default:
      return {
        level: report.missingAmazonRequiredPhrase ? "warn" : "ok",
        text: report.missingAmazonRequiredPhrase
          ? "A disclosure appears before the first affiliate link, but no Amazon link carries Amazon's own required exact statement."
          : "A disclosure phrase appears before the first affiliate link.",
      };
  }
}
