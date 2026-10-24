// Every place people's attention goes, in one table: what each platform
// accepts, whether we may publish to it by API (free, within its terms), and
// what it lets us measure afterwards.
//
// WHY THIS EXISTS
//
// `portfolio/distribution/README.md` grew one script per channel (Bluesky,
// Mastodon, dev.to, npm, ...). The owner asked (2026-10-20) for output to
// "most platforms" (Substack, Instagram, Facebook, Threads, X, TikTok,
// YouTube, email, search, AI assistants) from one tool that also measures
// what does best. This registry is the shared vocabulary for that hub:
// `compose.mjs` reads `limits` to fit each variant, `hub.mjs` reads `mode`
// to decide between publishing, delegating to an existing script, or writing
// a draft for the owner, and `metrics.mjs` reads `metrics` to know what can
// be read back.
//
// MODES
//
//   api        the hub publishes itself when DISTRIBUTE_<ENV>=true and the
//              listed secrets are set; otherwise it dry-runs.
//   delegated  an existing script in platform/distribution/ already publishes
//              there; the hub drafts the same item and points at the script.
//   draft      no free, terms-compliant way to automate it (no publishing
//              API, a paid API, an audit we have not passed, or a community
//              that forbids automated posts). The hub writes a paste-ready
//              draft for the owner and never posts.
//   discovery  search engines and AI assistants: nothing to post; they find
//              the site through sitemaps, structured data, IndexNow and
//              llms.txt, which the Pages build already ships.
//
// `checked` is the day the facts in `why` were last read. API terms and
// prices change often (X moved to pay-per-use in February 2026), so re-read
// them before enabling a channel, as the distribution spec requires.

export const MODES = Object.freeze(['api', 'delegated', 'draft', 'discovery']);

/** @typedef {{ id: string, name: string, kind: string, mode: string, ref: string|null, limits: { text: number, linkInBody: boolean, media: 'none'|'image'|'video', title?: number }, env?: string, secrets?: string[], vars?: string[], delegate?: string, metrics: { readable: boolean, what: string }, why: string, checked: string }} Platform */

/** @type {readonly Platform[]} */
export const PLATFORMS = Object.freeze([
  {
    id: 'threads', name: 'Threads', kind: 'social', mode: 'api', ref: 'threads',
    limits: { text: 500, linkInBody: true, media: 'none' },
    env: 'DISTRIBUTE_THREADS', secrets: ['THREADS_TOKEN'], vars: ['THREADS_USER_ID'],
    metrics: { readable: true, what: 'views, likes, replies, reposts, quotes per post (Threads Insights API, threads_manage_insights)' },
    why: 'Threads API publishes text posts in two calls (create container, publish) with threads_content_publish; free.',
    checked: '2026-10-20',
  },
  {
    id: 'facebook', name: 'Facebook Page', kind: 'social', mode: 'api', ref: 'facebook',
    limits: { text: 2000, linkInBody: true, media: 'none' },
    env: 'DISTRIBUTE_FACEBOOK', secrets: ['FACEBOOK_PAGE_TOKEN'], vars: ['FACEBOOK_PAGE_ID'],
    metrics: { readable: true, what: 'reactions, comments and shares per post (Graph API post fields)' },
    why: 'Graph API POST /{page-id}/feed with message and link, using a Page access token (pages_manage_posts) for a Page the owner admins; free.',
    checked: '2026-10-20',
  },
  {
    id: 'instagram', name: 'Instagram', kind: 'social', mode: 'api', ref: 'instagram',
    limits: { text: 2200, linkInBody: false, media: 'image' },
    env: 'DISTRIBUTE_INSTAGRAM', secrets: ['INSTAGRAM_TOKEN'], vars: ['INSTAGRAM_USER_ID', 'INSTAGRAM_IMAGE_BASE'],
    metrics: { readable: true, what: 'likes and comments per post (Graph API media fields); reach via insights' },
    why: 'Content Publishing API needs a professional account and a public JPEG URL per post; links in captions are not clickable, so arrivals come through the bio link. Posts only items that have an image under INSTAGRAM_IMAGE_BASE.',
    checked: '2026-10-20',
  },
  {
    id: 'email', name: 'Email newsletter (Buttondown)', kind: 'newsletter', mode: 'api', ref: 'email',
    limits: { text: 20000, linkInBody: true, media: 'none', title: 150 },
    env: 'DISTRIBUTE_EMAIL', secrets: ['BUTTONDOWN_API_KEY'],
    metrics: { readable: false, what: 'arrivals by ?ref=email only: the hub never turns on open or click tracking' },
    why: 'Opt-in list only (double opt-in, one-click unsubscribe, postal address per CAN-SPAM is an owner decision). Buttondown has a free tier and a REST API; emails are created as drafts unless EMAIL_SEND=true.',
    checked: '2026-10-20',
  },
  {
    id: 'bluesky', name: 'Bluesky', kind: 'social', mode: 'delegated', ref: 'bluesky', delegate: 'platform/distribution/bluesky.mjs',
    limits: { text: 300, linkInBody: true, media: 'none' },
    metrics: { readable: true, what: 'likes, reposts, replies, quotes per post; public, no login needed' },
    why: 'Already automated by bluesky.mjs (labelled bot account).',
    checked: '2026-10-15',
  },
  {
    id: 'mastodon', name: 'Mastodon', kind: 'social', mode: 'delegated', ref: 'mastodon', delegate: 'platform/distribution/mastodon.mjs',
    limits: { text: 500, linkInBody: true, media: 'none' },
    metrics: { readable: true, what: 'favourites, boosts, replies per status; public on most instances' },
    why: 'Already automated by mastodon.mjs (refuses to post from an account not flagged as a bot).',
    checked: '2026-10-15',
  },
  {
    id: 'devto', name: 'DEV (dev.to)', kind: 'blog', mode: 'delegated', ref: 'devto', delegate: 'platform/distribution/devto.mjs',
    limits: { text: 100000, linkInBody: true, media: 'none', title: 128 },
    metrics: { readable: true, what: 'page views, reactions, comments per article (needs the API key)' },
    why: 'Already automated by devto.mjs with canonical_url back to the page.',
    checked: '2026-10-15',
  },
  {
    id: 'hashnode', name: 'Hashnode', kind: 'blog', mode: 'delegated', ref: 'hashnode', delegate: 'platform/distribution/hashnode.mjs',
    limits: { text: 100000, linkInBody: true, media: 'none', title: 250 },
    metrics: { readable: true, what: 'views and reactions per post (needs the token)' },
    why: 'Already automated by hashnode.mjs with originalArticleURL back to the page.',
    checked: '2026-10-15',
  },
  {
    id: 'x', name: 'X (Twitter)', kind: 'social', mode: 'draft', ref: 'x',
    limits: { text: 280, linkInBody: true, media: 'none' },
    metrics: { readable: false, what: 'reading metrics is also metered; use ?ref=x arrivals' },
    why: 'X made pay-per-use the default API pricing on 2026-02-06 and closed the free tier to new developers; a post with a link is billed per request. The spec says unpaid means unpaid, so X is drafts for the owner, never a paid tier.',
    checked: '2026-10-20',
  },
  {
    id: 'linkedin', name: 'LinkedIn', kind: 'social', mode: 'draft', ref: 'linkedin',
    limits: { text: 3000, linkInBody: true, media: 'none' },
    metrics: { readable: false, what: 'post analytics need Community Management API partner access; use ?ref=linkedin arrivals' },
    why: 'Posting as a member is possible with w_member_social, but reading our own posts back (needed for stateless de-duplication) and analytics need partner-gated scopes. Drafts until that changes.',
    checked: '2026-10-20',
  },
  {
    id: 'substack', name: 'Substack', kind: 'newsletter', mode: 'draft', ref: 'substack',
    limits: { text: 100000, linkInBody: true, media: 'none', title: 280 },
    metrics: { readable: false, what: 'no API; Substack shows stats in its dashboard; use ?ref=substack arrivals' },
    why: 'Substack has no publishing API (its 2026 developer API is a profile lookup). Unofficial endpoints may break its terms, so the hub writes a paste-ready post and never automates it.',
    checked: '2026-10-20',
  },
  {
    id: 'medium', name: 'Medium', kind: 'blog', mode: 'draft', ref: 'medium',
    limits: { text: 100000, linkInBody: true, media: 'none', title: 100 },
    metrics: { readable: false, what: 'no stats API; use ?ref=medium arrivals' },
    why: 'Medium stopped issuing new integration tokens, so there is no supported way to post by API. Medium\'s own "Import a story" keeps the canonical link: paste the page URL there.',
    checked: '2026-10-20',
  },
  {
    id: 'tiktok', name: 'TikTok', kind: 'video', mode: 'draft', ref: 'tiktok',
    limits: { text: 2200, linkInBody: false, media: 'video' },
    metrics: { readable: false, what: 'needs an audited app; use ?ref=tiktok arrivals from the bio link' },
    why: 'Content Posting API restricts unaudited clients to private (SELF_ONLY) posts from private accounts, and every post needs a video. The hub writes the script and on-screen text; shorts.mjs renders it into a captioned vertical video. Uploading stays manual.',
    checked: '2026-10-20',
  },
  {
    id: 'youtube', name: 'YouTube (Shorts and videos)', kind: 'video', mode: 'draft', ref: 'youtube',
    limits: { text: 5000, linkInBody: true, media: 'video', title: 100 },
    metrics: { readable: true, what: 'views, likes, comments via the Data API once the owner uploads (read-only key is free)' },
    why: 'Every post needs a video, and uploads from unverified API projects are locked private until Google audits the project. The hub writes title, description (with link) and a Short script; shorts.mjs renders the Short.',
    checked: '2026-10-20',
  },
  {
    id: 'reddit', name: 'Reddit', kind: 'community', mode: 'draft', ref: 'reddit',
    limits: { text: 40000, linkInBody: true, media: 'none', title: 300 },
    metrics: { readable: false, what: 'use ?ref=reddit arrivals' },
    why: 'Most subreddits forbid automated or self-promotional posts, and Data API access now needs approval. Drafts only, posted by the owner after reading that subreddit\'s rules on the day.',
    checked: '2026-10-20',
  },
  {
    id: 'hackernews', name: 'Hacker News', kind: 'community', mode: 'draft', ref: 'hn',
    limits: { text: 0, linkInBody: true, media: 'none', title: 80 },
    metrics: { readable: false, what: 'use ?ref=hn arrivals' },
    why: 'HN has no posting API and forbids automated submissions. A title and URL for a Show HN by hand.',
    checked: '2026-10-20',
  },
  {
    id: 'google', name: 'Google and other search engines', kind: 'search', mode: 'discovery', ref: null,
    limits: { text: 160, linkInBody: true, media: 'none', title: 60 },
    metrics: { readable: true, what: 'src:google / src:bing ... arrivals from the counter; Search Console needs the owner\'s login' },
    why: 'Nothing to post. The Pages build ships titles, descriptions, JSON-LD, sitemap and IndexNow (platform/ci/indexnow_state.py).',
    checked: '2026-10-20',
  },
  {
    id: 'ai-assistants', name: 'AI assistants (ChatGPT, Claude, Perplexity, Gemini, Copilot)', kind: 'ai', mode: 'discovery', ref: null,
    limits: { text: 160, linkInBody: true, media: 'none' },
    metrics: { readable: true, what: 'src:chatgpt / src:claude / src:perplexity / src:gemini / src:copilot arrivals from the counter' },
    why: 'Nothing to post. Assistants find the site through search indexes, llms.txt and the MCP server (mcp-server channel).',
    checked: '2026-10-20',
  },
]);

export const byId = (id) => PLATFORMS.find((p) => p.id === id) ?? null;

/** Platforms by mode, in table order. */
export function grouped() {
  return Object.fromEntries(MODES.map((m) => [m, PLATFORMS.filter((p) => p.mode === m)]));
}

/** The `?ref=` tags this hub introduces or reuses, so the counter's closed list can be checked against it. */
export const HUB_REFS = Object.freeze([...new Set(PLATFORMS.map((p) => p.ref).filter(Boolean))].sort());
