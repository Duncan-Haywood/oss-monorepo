// Podcast RSS feed validation engine: given a parsed feed (feed-parser.mjs),
// does it satisfy the specific, documented requirements that cause Apple
// Podcasts, Spotify, and other podcast-app feed ingestion to reject an
// episode, silently drop it, or re-show it to subscribers as "new" when it
// isn't? Every check below is traceable to a documented rule (Apple
// Podcasts' own feed requirements, the RSS 2.0 spec's own field
// definitions, or a named, well-known podcast-app behavior) -- see
// README.md for the citation on each one.
//
// Pure, no I/O, no network -- the identical function classifies a feed the
// CLI fetched for real (check.mjs) and a feed a visitor pasted into the
// browser page, so the two surfaces can never silently disagree about what
// a given feed means.

// Apple's own documented top-level Podcasts category list. Sourced from
// Apple's publicly documented category taxonomy at the time this tool was
// built -- Apple can and does revise it, and this tool has no live way to
// re-check that list (egress to arbitrary hosts is proxy-denied in the
// environment this was built in, per this repo's standing convention). A
// category not on this list is real evidence worth checking, not a
// certainty -- see the finding text and README.md.
export const APPLE_TOP_LEVEL_CATEGORIES = new Set([
  'Arts', 'Business', 'Comedy', 'Education', 'Fiction', 'Government',
  'History', 'Health & Fitness', 'Kids & Family', 'Leisure', 'Music',
  'News', 'Religion & Spirituality', 'Science', 'Society & Culture',
  'Sports', 'Technology', 'True Crime', 'TV & Film',
]);

const VALID_EXPLICIT = new Set(['true', 'false']);
const DEPRECATED_EXPLICIT = new Set(['yes', 'no', 'clean', 'explicit']);
const VALID_EPISODE_TYPES = new Set(['full', 'trailer', 'bonus']);
const RECOGNIZED_ENCLOSURE_TYPES = new Set([
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg',
  'video/mp4', 'video/quicktime', 'video/x-m4v',
]);
// RFC 822 date-time, the format the RSS 2.0 spec requires for <pubDate>.
// e.g. "Wed, 02 Oct 2024 15:00:00 GMT" or "...+0000". A podcast app's feed
// parser is entitled to reject a pubDate outside this shape even when
// JavaScript's own lenient Date.parse() would accept it (an ISO date like
// "2024-10-02" parses fine in JS and is not valid RSS).
const RFC822_DATE_RE =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4}\s+\d{1,2}:\d{2}(:\d{2})?\s+([+-]\d{4}|UT|GMT|[A-Z]{1,5})$/;

function looksLikeAbsoluteUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function finding(id, severity, title, detail, extra = {}) {
  return { id, severity, title, detail, ...extra };
}

/**
 * Classifies a parsed feed (the `{channel, items, parseErrors}` shape
 * `parseFeed` in feed-parser.mjs returns).
 */
export function classifyFeed({ channel, items, parseErrors }) {
  const findings = [];

  if (parseErrors && parseErrors.length > 0) {
    return {
      findings: parseErrors.map((msg) => finding('unparseable-feed', 'danger', 'Could not parse this as an RSS feed', msg)),
      dangerCount: parseErrors.length, noticeCount: 0, itemCount: 0, ok: false,
    };
  }

  // --- Channel-level checks --------------------------------------------
  if (!channel.title) {
    findings.push(finding('missing-channel-title', 'danger', 'Channel is missing <title>',
      'The RSS 2.0 spec requires every channel to have a title -- podcast apps use it as the show name.'));
  }
  if (!channel.description) {
    findings.push(finding('missing-channel-description', 'danger', 'Channel is missing <description> and <itunes:summary>',
      'Apple Podcasts requires a show description (either the RSS <description> or the iTunes-namespace <itunes:summary>) to display and index the show.'));
  }
  if (!channel.language) {
    findings.push(finding('missing-channel-language', 'danger', 'Channel is missing <language>',
      'Apple Podcasts requires a valid language code (e.g. "en-us") to categorize and serve the show in the correct storefront.'));
  }
  if (!channel.link) {
    findings.push(finding('missing-channel-link', 'danger', 'Channel is missing <link>',
      'The RSS 2.0 spec requires a channel-level <link> to the show\'s own website or episode list page.'));
  }
  if (!channel.itunesImage) {
    findings.push(finding('missing-itunes-image', 'danger', 'Channel is missing <itunes:image>',
      'Apple Podcasts requires cover artwork declared via <itunes:image href="..."/> (JPEG or PNG, per Apple\'s documented artwork requirements) -- without it the show cannot be submitted.'));
  } else if (!/\.(jpe?g|png)(\?.*)?$/i.test(channel.itunesImage)) {
    findings.push(finding('itunes-image-wrong-format', 'notice', '<itunes:image> URL does not look like a JPEG or PNG',
      `Apple's documented artwork requirements call for JPEG or PNG cover art; the URL given (${channel.itunesImage}) does not end in .jpg, .jpeg, or .png. This check only looks at the URL's extension, not the file's real content-type or pixel dimensions.`));
  }

  if (channel.itunesCategories.length === 0) {
    findings.push(finding('missing-itunes-category', 'danger', 'Channel is missing <itunes:category>',
      'Apple Podcasts requires at least one category to submit or list a show.'));
  } else {
    const topLevel = channel.itunesCategories[0];
    if (!APPLE_TOP_LEVEL_CATEGORIES.has(topLevel)) {
      findings.push(finding('unrecognized-itunes-category', 'notice', `Top-level <itunes:category text="${topLevel}"> is not on Apple's documented category list`,
        "Apple's feed processor matches this string exactly against its own taxonomy. This tool checks against the top-level category list only (not subcategories) as documented at the time this tool was built, and that list can change -- verify against Apple's current Podcasts category list before assuming this is wrong."));
    }
  }

  if (!channel.itunesExplicit) {
    findings.push(finding('missing-itunes-explicit', 'danger', 'Channel is missing <itunes:explicit>',
      'Apple Podcasts requires every show (and Apple recommends every episode) to declare explicit content status.'));
  } else {
    const val = channel.itunesExplicit.toLowerCase();
    if (!VALID_EXPLICIT.has(val)) {
      if (DEPRECATED_EXPLICIT.has(val)) {
        findings.push(finding('deprecated-itunes-explicit-value', 'notice', `<itunes:explicit> uses the deprecated value "${channel.itunesExplicit}"`,
          'Apple\'s current documented format is the literal boolean string "true" or "false". Older values like "yes", "no", "clean", and "explicit" are deprecated and some podcast apps no longer recognize them.'));
      } else {
        findings.push(finding('invalid-itunes-explicit-value', 'danger', `<itunes:explicit> value "${channel.itunesExplicit}" is not a recognized value`,
          'Apple\'s documented format requires exactly "true" or "false".'));
      }
    }
  }

  if (!channel.atomSelfLink) {
    findings.push(finding('missing-atom-self-link', 'notice', 'Channel is missing an <atom:link rel="self"> pointing at its own feed URL',
      'Not required by Apple, but recommended by the RSS Advisory Board and widely followed: it lets a podcast app confirm it has the canonical feed URL after a host migration, rather than silently continuing to poll a stale redirect.'));
  }
  if (!channel.itunesOwnerEmail) {
    findings.push(finding('missing-itunes-owner-email', 'notice', 'Channel is missing <itunes:owner><itunes:email>',
      'Recommended by Apple for the account that submits and manages the show in Apple Podcasts Connect; not required for the feed to be valid RSS.'));
  }

  // --- Item-level checks --------------------------------------------
  if (!items || items.length === 0) {
    findings.push(finding('no-items', 'danger', 'Feed has no <item> elements', 'A podcast feed with zero episodes has nothing for a podcast app to show a subscriber.'));
  }

  const guidCounts = new Map();
  (items ?? []).forEach((item, i) => {
    const n = i + 1;
    if (!item.title) {
      findings.push(finding('item-missing-title', 'danger', `Episode ${n} is missing <title>`, 'Every episode item needs a title for a podcast app to list it.', { itemIndex: i }));
    }
    if (!item.enclosure || !item.enclosure.url) {
      findings.push(finding('item-missing-enclosure', 'danger', `Episode ${n} is missing an <enclosure> with a url`, 'The <enclosure> element\'s url attribute is what a podcast app actually plays -- without it, this item has no audio.', { itemIndex: i }));
    } else {
      if (!item.enclosure.type) {
        findings.push(finding('item-enclosure-missing-type', 'danger', `Episode ${n}'s <enclosure> is missing its type attribute`, 'Podcast apps use the enclosure\'s type attribute (e.g. "audio/mpeg") to decide how to play the file without downloading it first.', { itemIndex: i }));
      } else if (!RECOGNIZED_ENCLOSURE_TYPES.has(item.enclosure.type.toLowerCase())) {
        findings.push(finding('item-enclosure-unrecognized-type', 'notice', `Episode ${n}'s <enclosure> type "${item.enclosure.type}" is not a commonly recognized podcast audio/video MIME type`, 'This is a narrow, hand-maintained list of common podcast enclosure types -- an unusual but valid type is not necessarily wrong, just worth a second look.', { itemIndex: i }));
      }
      if (!item.enclosure.length || item.enclosure.length === '0') {
        findings.push(finding('item-enclosure-zero-length', 'notice', `Episode ${n}'s <enclosure> length attribute is missing or "0"`, 'The RSS spec\'s length attribute should be the exact file size in bytes. Many podcast hosts tolerate "0", but it is a documented sign of a feed generator that never actually checked the file.', { itemIndex: i }));
      }
    }
    if (!item.pubDate) {
      findings.push(finding('item-missing-pubdate', 'danger', `Episode ${n} is missing <pubDate>`, 'Podcast apps sort and display episodes by pubDate -- without it, an app cannot place the episode in the feed\'s timeline.', { itemIndex: i }));
    } else if (!RFC822_DATE_RE.test(item.pubDate)) {
      findings.push(finding('item-invalid-pubdate-format', 'danger', `Episode ${n}'s <pubDate> "${item.pubDate}" is not in RFC 822 format`, 'The RSS 2.0 spec requires pubDate in RFC 822 date-time format, e.g. "Wed, 02 Oct 2024 15:00:00 GMT". A different format (including a valid ISO 8601 date) is a documented cause of a podcast app failing to parse the episode\'s date, sorting it incorrectly, or dropping it.', { itemIndex: i }));
    }

    if (!item.guid) {
      findings.push(finding('item-missing-guid', 'notice', `Episode ${n} has no <guid>`, 'Not strictly required by the RSS spec (a podcast app may fall back to the enclosure URL), but a stable guid is what lets a podcast app tell "this is the same episode" across feed refreshes even if other fields change.', { itemIndex: i }));
    } else {
      if (item.guid.isPermaLink && !looksLikeAbsoluteUrl(item.guid.value)) {
        findings.push(finding('item-guid-permalink-not-url', 'notice', `Episode ${n}'s <guid> is treated as a permalink but "${item.guid.value}" is not an absolute URL`, 'guid\'s isPermaLink attribute defaults to true when omitted. A guid that is not really a URL (a UUID, an episode number) should be marked isPermaLink="false" -- otherwise some feed readers try to treat the value as a link.', { itemIndex: i }));
      }
      if (item.guid.value) {
        const key = item.guid.value;
        guidCounts.set(key, (guidCounts.get(key) ?? []).concat(n));
      }
    }

    if (item.itunesEpisodeType && !VALID_EPISODE_TYPES.has(item.itunesEpisodeType.toLowerCase())) {
      findings.push(finding('item-invalid-episode-type', 'notice', `Episode ${n}'s <itunes:episodeType> "${item.itunesEpisodeType}" is not one of full/trailer/bonus`, 'Apple\'s documented episode types are exactly "full", "trailer", or "bonus".', { itemIndex: i }));
    }
  });

  for (const [guidValue, episodeNumbers] of guidCounts) {
    if (episodeNumbers.length > 1) {
      findings.push(finding('duplicate-guid', 'danger', `Duplicate <guid> "${guidValue}" used by episodes ${episodeNumbers.join(', ')}`,
        'Podcast apps use guid to decide whether an item is one they have already shown a subscriber. Two items sharing a guid is a documented cause of an episode silently disappearing (the app treats the second as an update to the first) or reappearing as "new" out of order.'));
    }
  }

  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.filter((f) => f.severity === 'notice').length;

  return {
    findings, dangerCount, noticeCount,
    itemCount: items ? items.length : 0,
    ok: dangerCount === 0,
  };
}
