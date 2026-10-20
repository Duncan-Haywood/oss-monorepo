// @ts-check
// Interview Content Studio: the engine shared by the page and the CLI.
//
// One interview (who you are, who you serve, your stories, opinions, tips,
// proof and offer) becomes a cadence plan per platform, a 4-week calendar,
// and a draft for every calendar slot, shaped to that platform's format and
// limits. Everything here is deterministic and builds drafts ONLY from the
// person's own answers: no statistics, testimonials or results are added.
// The optional AI pass (ai.mjs) rewrites these drafts on the user's own key
// and is checked against the same rules before anything is kept.

/** @typedef {{ id: string, section: string, prompt: string, help: string, type: "text"|"long"|"list"|"stories"|"url"|"tags"|"voice"|"platforms"|"hours", placeholder?: string }} Question */
/** @typedef {{ formal: number, playful: number, detailed: number, sample: string }} Voice */
/** @typedef {{ topic: string, name: string, about: string, audience: string, problem: string, outcome: string, stories: string[], opinions: string[], tips: string[], proof: string[], offer: string, link: string, keywords: string[], voice: Voice, banned: string[], platforms: string[], hours: number }} Answers */
/** @typedef {{ id: string, topic: string, createdAt: string, answers: Answers }} Interview */
/** @typedef {{ kind: "story"|"opinion"|"tip"|"proof"|"problem"|"offer"|"about", index: number }} Angle */
/** @typedef {{ key: string, label: string, max?: number, unit?: "chars"|"graphemes"|"x", soft?: boolean, title?: boolean }} FieldSpec */
/** @typedef {{ label: string, max?: number, unit?: "chars"|"graphemes"|"x", maxItems?: number }} PartsSpec */
/** @typedef {{ id: string, platform: string, name: string, minutes: number, floor: number, ideal: number, weekdays: boolean, deep: boolean, offer: boolean, fields: FieldSpec[], parts?: PartsSpec, rationale: string }} Format */
/** @typedef {{ id: string, date: string, day: number, format: string, platform: string, seq: number, angle: Angle }} Slot */
/** @typedef {{ slotId: string, date: string, format: string, platform: string, title: string, fields: Record<string, string>, parts: string[], text: string, warnings: string[], source: "template"|"model", angle: Angle }} Draft */

export const VERSION = 1;
export const STORAGE_KEY = "interview-content-studio-v1";

// ---------------------------------------------------------------------------
// The interview
// ---------------------------------------------------------------------------

/** @type {Question[]} */
export const QUESTIONS = [
  { id: "topic", section: "Start", type: "text", prompt: "What is this interview about?", help: "A name for this interview, so you can run several (one per brand, product or topic) and switch between them.", placeholder: "e.g. My bakery's wholesale launch" },
  { id: "name", section: "You", type: "text", prompt: "Your name or brand name, as you want it to appear", help: "Used to sign newsletters and in calls to action.", placeholder: "e.g. Rosa at Juniper Bakery" },
  { id: "about", section: "You", type: "long", prompt: "In one or two sentences: what do you do, and for whom?", help: "This becomes your short bio and the context line in longer pieces.", placeholder: "e.g. I bake sourdough for cafes in Leeds and teach small-batch baking." },
  { id: "audience", section: "Audience", type: "long", prompt: "Who exactly do you want to reach? Describe one person.", help: "Specific beats broad: a job, a situation, a stage.", placeholder: "e.g. independent cafe owners who want a better bread supplier" },
  { id: "problem", section: "Audience", type: "long", prompt: "What problem or frustration does that person have that you help with?", help: "Write it the way they would say it.", placeholder: "e.g. bread arrives late, stale by lunchtime, and the supplier never answers the phone" },
  { id: "outcome", section: "Audience", type: "long", prompt: "What changes for them after working with you or using what you make?", help: "The result in their words, not your features.", placeholder: "e.g. fresh loaves before opening and one person to call" },
  { id: "stories", section: "Stories", type: "stories", prompt: "Tell 3 to 5 short stories: a moment, a customer, a mistake, a turning point. What happened, and what did you learn?", help: "Leave a blank line between stories. Stories are the raw material for most posts, so detail helps. Only real ones.", placeholder: "We lost our biggest cafe client in week two because a delivery came at 9:30. I rebuilt the route so the first drop is at 6:45. Lesson: reliability sells more bread than flavour.\n\nA customer asked why our loaves cost more..." },
  { id: "opinions", section: "Opinions", type: "list", prompt: "What do you believe about your field that many people would disagree with?", help: "One per line. Strong, honest opinions make the posts people reply to.", placeholder: "e.g. Most cafes should stock fewer breads, not more." },
  { id: "tips", section: "Advice", type: "list", prompt: "What practical advice do you give again and again?", help: "One per line. Each becomes a tip post, a carousel or a short video.", placeholder: "e.g. Order bread for the day you have, not the day you hope for." },
  { id: "proof", section: "Proof", type: "list", prompt: "Results you can point to: numbers, outcomes, milestones.", help: "One per line. Only things that are true and that you could show someone. The tool never invents results, so anything not here will not appear.", placeholder: "e.g. 14 cafes supplied every morning since March" },
  { id: "offer", section: "Offer", type: "long", prompt: "What do you want people to do next?", help: "Book a call, buy, subscribe, download, visit. Used in roughly one piece in five; the rest give value with no ask.", placeholder: "e.g. Book a free tasting for your cafe" },
  { id: "link", section: "Offer", type: "url", prompt: "Link for that next step", help: "Optional. Platforms that do not allow clickable links in posts get \"link in bio\" instead.", placeholder: "https://" },
  { id: "keywords", section: "Discovery", type: "tags", prompt: "Words people search for when they need you", help: "Comma-separated. Used for blog titles, descriptions and a few hashtags.", placeholder: "e.g. sourdough wholesale, cafe bread supplier, Leeds bakery" },
  { id: "voice", section: "Voice", type: "voice", prompt: "How do you sound?", help: "The sliders steer the wording around your answers. A sample of your own writing helps the optional AI match you.", placeholder: "Paste two or three sentences you have written that sound like you." },
  { id: "banned", section: "Voice", type: "list", prompt: "Words or phrases you never want to use", help: "One per line. The tool avoids them in its own wording and flags them if they appear in a draft.", placeholder: "e.g. game-changer" },
  { id: "platforms", section: "Platforms", type: "platforms", prompt: "Which platforms do you use, or want to?", help: "Pick the ones you will actually keep up. Fewer, done consistently, beats everywhere at once." },
  { id: "hours", section: "Time", type: "hours", prompt: "How many hours a week can you spend on content?", help: "Writing, filming, editing and replying. The plan scales to fit this, so be realistic." },
];

/** @returns {Answers} */
export function emptyAnswers() {
  return {
    topic: "", name: "", about: "", audience: "", problem: "", outcome: "",
    stories: [], opinions: [], tips: [], proof: [], offer: "", link: "", keywords: [],
    voice: { formal: 40, playful: 40, detailed: 50, sample: "" },
    banned: [], platforms: ["linkedin", "instagram", "newsletter"], hours: 3,
  };
}

/** @param {string} topic @param {string} [id] @param {string} [now] @returns {Interview} */
export function newInterview(topic = "", id, now) {
  const answers = emptyAnswers();
  answers.topic = topic;
  return { id: id || `i-${Math.random().toString(36).slice(2, 10)}`, topic, createdAt: now || new Date().toISOString().slice(0, 10), answers };
}

const str = (/** @type {unknown} */ v, max = 4000) => (typeof v === "string" ? v : v == null ? "" : String(v)).replace(/\r\n?/g, "\n").trim().slice(0, max);
const list = (/** @type {unknown} */ v, max = 20, each = 2000) => (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : []).map((x) => str(x, each)).filter(Boolean).slice(0, max);
const clampNum = (/** @type {unknown} */ v, lo = 0, hi = 100, dflt = 50) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };

/**
 * Split a textarea into list items. Stories are separated by blank lines;
 * everything else by line.
 * @param {string} text @param {"stories"|"list"|"tags"} type
 */
export function splitList(text, type) {
  const t = String(text || "").replace(/\r\n?/g, "\n");
  if (type === "stories") return t.split(/\n\s*\n/).map((s) => s.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  if (type === "tags") return t.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  return t.split("\n").map((s) => s.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean);
}

/** @param {string[]} items @param {"stories"|"list"|"tags"} type */
export function joinList(items, type) {
  return (items || []).join(type === "stories" ? "\n\n" : type === "tags" ? ", " : "\n");
}

/**
 * Accept anything (an imported file, an old saved state) and return a clean
 * Answers object: strings trimmed and capped, lists of strings, unknown
 * platforms dropped, numbers clamped.
 * @param {any} a @returns {Answers}
 */
export function normalizeAnswers(a) {
  const src = a && typeof a === "object" ? a : {};
  const d = emptyAnswers();
  const v = src.voice && typeof src.voice === "object" ? src.voice : {};
  const link = str(src.link, 500);
  return {
    topic: str(src.topic, 120), name: str(src.name, 120), about: str(src.about, 600), audience: str(src.audience, 600),
    problem: str(src.problem, 600), outcome: str(src.outcome, 600),
    stories: list(src.stories, 8, 3000), opinions: list(src.opinions, 12, 600), tips: list(src.tips, 12, 600), proof: list(src.proof, 12, 400),
    offer: str(src.offer, 400), link: /^https?:\/\/\S+$/i.test(link) ? link : "",
    keywords: list(src.keywords, 12, 80), banned: list(src.banned, 40, 80),
    voice: { formal: clampNum(v.formal, 0, 100, d.voice.formal), playful: clampNum(v.playful, 0, 100, d.voice.playful), detailed: clampNum(v.detailed, 0, 100, d.voice.detailed), sample: str(v.sample, 1500) },
    platforms: Array.isArray(src.platforms) ? [...new Set(src.platforms.filter((p) => typeof p === "string" && PLATFORM_IDS.includes(p)))] : d.platforms,
    hours: clampNum(src.hours, 0, 60, d.hours),
  };
}

/** @param {any} i @returns {Interview} */
export function normalizeInterview(i) {
  const src = i && typeof i === "object" ? i : {};
  const answers = normalizeAnswers(src.answers || src);
  const id = typeof src.id === "string" && /^[\w-]{1,40}$/.test(src.id) ? src.id : `i-${Math.random().toString(36).slice(2, 10)}`;
  const createdAt = typeof src.createdAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(src.createdAt) ? src.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  return { id, topic: answers.topic || str(src.topic, 120), createdAt, answers };
}

/**
 * The whole saved state: several interviews, which one is open, and the
 * calendar start date.
 * @typedef {{ version: number, interviews: Interview[], activeId: string, startDate: string }} State
 */

/** @param {string} [today] @returns {State} */
export function emptyState(today) {
  const first = newInterview("My first interview");
  return { version: VERSION, interviews: [first], activeId: first.id, startDate: nextMonday(today || new Date().toISOString().slice(0, 10)) };
}

/** @param {any} s @param {string} [today] @returns {State} */
export function normalizeState(s, today) {
  if (!s || typeof s !== "object") throw new Error("not a studio file");
  const raw = Array.isArray(s.interviews) ? s.interviews : s.answers ? [s] : null;
  if (!raw || !raw.length) throw new Error("the file has no interviews in it");
  const interviews = raw.slice(0, 50).map(normalizeInterview);
  const seen = new Set();
  for (const it of interviews) { while (seen.has(it.id)) it.id += "x"; seen.add(it.id); }
  const activeId = interviews.some((i) => i.id === s.activeId) ? s.activeId : interviews[0].id;
  const startDate = typeof s.startDate === "string" && isISODate(s.startDate) ? s.startDate : nextMonday(today || new Date().toISOString().slice(0, 10));
  return { version: VERSION, interviews, activeId, startDate };
}

/** Parse an imported JSON file. Throws a readable Error on bad input. @param {string} text */
export function importState(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error("that file is not valid JSON"); }
  return normalizeState(parsed);
}

/** @param {{ getItem: (k: string) => string | null } | null | undefined} storage @returns {State | null} */
export function loadState(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** @param {{ setItem: (k: string, v: string) => void } | null | undefined} storage @param {State} state */
export function saveState(storage, state) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

/** How complete is the interview? Used for the progress bar and to warn before planning. @param {Answers} a */
export function completeness(a) {
  const checks = [
    ["about", !!a.about], ["audience", !!a.audience], ["problem", !!a.problem], ["outcome", !!a.outcome],
    ["stories", a.stories.length >= 3], ["opinions", a.opinions.length >= 1], ["tips", a.tips.length >= 1],
    ["proof", a.proof.length >= 1], ["offer", !!a.offer], ["platforms", a.platforms.length >= 1], ["hours", a.hours > 0],
  ];
  const missing = checks.filter((c) => !c[1]).map((c) => /** @type {string} */ (c[0]));
  return { done: checks.length - missing.length, total: checks.length, missing };
}

// ---------------------------------------------------------------------------
// Platforms, formats and limits
// ---------------------------------------------------------------------------
//
// Limits are the ones this tool enforces. Platforms change them; where a
// figure is a guideline rather than a hard limit (an SEO title, an email
// subject) the field is marked `soft` and the draft gets a note, not a cut.
//
// Cadences (`floor`, `ideal`, per 4 weeks) and effort (`minutes` per piece,
// editing a draft from this tool) are this tool's starting assumptions, not
// measured benchmarks. They exist to turn "post everywhere" into a number
// you can try for a month and adjust.

/** @type {{ id: string, name: string, formats: string[], links: string, ai: string }[]} */
export const PLATFORMS = [
  { id: "x", name: "X (Twitter)", formats: ["x-post", "x-thread"], links: "Links are clickable; the tool counts each link as 23 characters, as X does.", ai: "" },
  { id: "threads", name: "Threads", formats: ["threads-post"], links: "Links are clickable.", ai: "Meta asks people to label realistic AI-generated or altered media." },
  { id: "bluesky", name: "Bluesky", formats: ["bluesky-post"], links: "Links are clickable.", ai: "" },
  { id: "linkedin", name: "LinkedIn", formats: ["linkedin-post"], links: "Links are clickable.", ai: "" },
  { id: "instagram", name: "Instagram", formats: ["instagram-feed", "instagram-reel", "instagram-carousel"], links: "Links in captions are not clickable, so drafts say \"link in bio\".", ai: "Meta asks people to label realistic AI-generated or altered media." },
  { id: "facebook", name: "Facebook", formats: ["facebook-post"], links: "Links are clickable.", ai: "Meta asks people to label realistic AI-generated or altered media." },
  { id: "tiktok", name: "TikTok", formats: ["tiktok-video"], links: "Links in captions are not clickable, so drafts say \"link in bio\".", ai: "TikTok requires a label on realistic AI-generated content." },
  { id: "youtube", name: "YouTube", formats: ["youtube-video", "youtube-short"], links: "Links in descriptions are clickable.", ai: "YouTube requires creators to disclose realistic altered or synthetic content." },
  { id: "newsletter", name: "Newsletter / Substack / email", formats: ["newsletter"], links: "Links are clickable.", ai: "" },
  { id: "blog", name: "Blog / SEO article", formats: ["blog-article"], links: "Your own site, your own rules.", ai: "" },
  { id: "medium", name: "Medium", formats: ["medium-article"], links: "Links are clickable.", ai: "" },
  { id: "reddit", name: "Reddit", formats: ["reddit-post"], links: "Many subreddits forbid self-promotion; drafts carry no link.", ai: "" },
  { id: "pinterest", name: "Pinterest", formats: ["pinterest-pin"], links: "Each pin links to one page.", ai: "" },
  { id: "podcast", name: "Podcast clip", formats: ["podcast-clip"], links: "Put the link in the episode notes or caption.", ai: "" },
];
export const PLATFORM_IDS = PLATFORMS.map((p) => p.id);

const VIDEO_FIELDS = /** @type {FieldSpec[]} */ ([
  { key: "hook", label: "Hook (first 3 seconds)", max: 150 },
  { key: "onScreen", label: "On-screen text", max: 80 },
  { key: "cta", label: "Call to action", max: 200 },
  { key: "caption", label: "Caption", max: 2200 },
]);
const VIDEO_PARTS = /** @type {PartsSpec} */ ({ label: "Beats", max: 300, maxItems: 6 });

/** @type {Record<string, Format>} */
export const FORMATS = {
  "x-post": { id: "x-post", platform: "x", name: "Post", minutes: 5, floor: 8, ideal: 20, weekdays: false, deep: false, offer: true,
    fields: [{ key: "text", label: "Post", max: 280, unit: "x" }],
    rationale: "Short posts are cheap and the feed moves fast, so a steady rhythm matters more than polish. Start around once a day on weekdays." },
  "x-thread": { id: "x-thread", platform: "x", name: "Thread", minutes: 20, floor: 2, ideal: 4, weekdays: false, deep: true, offer: true,
    fields: [], parts: { label: "Posts", max: 280, unit: "x", maxItems: 8 },
    rationale: "A thread lets one story run longer than a post. One a week is a sustainable start." },
  "threads-post": { id: "threads-post", platform: "threads", name: "Post", minutes: 5, floor: 8, ideal: 16, weekdays: false, deep: false, offer: true,
    fields: [{ key: "text", label: "Post", max: 500 }],
    rationale: "Conversational and quick to write; reuse the same idea as your X or Bluesky post in your own words." },
  "bluesky-post": { id: "bluesky-post", platform: "bluesky", name: "Post", minutes: 5, floor: 8, ideal: 16, weekdays: false, deep: false, offer: true,
    fields: [{ key: "text", label: "Post", max: 300, unit: "graphemes" }],
    rationale: "Same rhythm as other short-post networks; 300 characters, so one idea per post." },
  "linkedin-post": { id: "linkedin-post", platform: "linkedin", name: "Post", minutes: 20, floor: 4, ideal: 12, weekdays: true, deep: false, offer: true,
    fields: [{ key: "text", label: "Post", max: 3000 }],
    rationale: "A few thoughtful posts a week, each built on one story or lesson, tend to do better than daily filler. Weekdays only, since it is a work network." },
  "instagram-feed": { id: "instagram-feed", platform: "instagram", name: "Feed post", minutes: 20, floor: 4, ideal: 8, weekdays: false, deep: false, offer: true,
    fields: [{ key: "caption", label: "Caption", max: 2200 }, { key: "visual", label: "Image idea", max: 300 }],
    rationale: "One or two feed posts a week keeps the grid alive while Reels do the reaching." },
  "instagram-reel": { id: "instagram-reel", platform: "instagram", name: "Reel", minutes: 45, floor: 4, ideal: 12, weekdays: false, deep: false, offer: true,
    fields: VIDEO_FIELDS, parts: VIDEO_PARTS,
    rationale: "Short video is where new people find you. Film several in one sitting; the same script works for TikTok and Shorts." },
  "instagram-carousel": { id: "instagram-carousel", platform: "instagram", name: "Carousel", minutes: 40, floor: 2, ideal: 6, weekdays: false, deep: true, offer: true,
    fields: [{ key: "caption", label: "Caption", max: 2200 }], parts: { label: "Slides", max: 220, maxItems: 10 },
    rationale: "Carousels turn a tip or story into something people save. One a week or every other week." },
  "facebook-post": { id: "facebook-post", platform: "facebook", name: "Post", minutes: 10, floor: 4, ideal: 12, weekdays: false, deep: false, offer: true,
    fields: [{ key: "text", label: "Post", max: 63206 }],
    rationale: "Works best for local and community audiences. Reuse your LinkedIn or Instagram idea in a friendlier tone." },
  "tiktok-video": { id: "tiktok-video", platform: "tiktok", name: "Video", minutes: 45, floor: 4, ideal: 16, weekdays: false, deep: false, offer: true,
    fields: VIDEO_FIELDS, parts: VIDEO_PARTS,
    rationale: "Frequency matters on TikTok more than production. Batch-film scripts from your stories and tips." },
  "youtube-video": { id: "youtube-video", platform: "youtube", name: "Long video", minutes: 240, floor: 1, ideal: 4, weekdays: false, deep: true, offer: true,
    fields: [{ key: "title", label: "Title", max: 100, title: true }, { key: "description", label: "Description", max: 5000 }], parts: { label: "Outline", max: 400, maxItems: 10 },
    rationale: "Long video is your most expensive piece and your most searchable. Even one a month gives the short formats something to cut from." },
  "youtube-short": { id: "youtube-short", platform: "youtube", name: "Short", minutes: 40, floor: 4, ideal: 12, weekdays: false, deep: false, offer: true,
    fields: [{ key: "title", label: "Title", max: 100, title: true }, ...VIDEO_FIELDS], parts: VIDEO_PARTS,
    rationale: "Reuse your Reel or TikTok script; most of the effort is already spent." },
  "newsletter": { id: "newsletter", platform: "newsletter", name: "Issue", minutes: 60, floor: 2, ideal: 4, weekdays: true, deep: true, offer: true,
    fields: [{ key: "subject", label: "Subject", max: 60, soft: true }, { key: "preview", label: "Preview text", max: 90, soft: true }, { key: "body", label: "Body", max: 20000 }],
    rationale: "Email is the audience you keep if a platform changes. Weekly or fortnightly, on a fixed day, beats irregular bursts." },
  "blog-article": { id: "blog-article", platform: "blog", name: "Article", minutes: 150, floor: 1, ideal: 4, weekdays: true, deep: true, offer: true,
    fields: [{ key: "seoTitle", label: "SEO title", max: 60, soft: true, title: true }, { key: "meta", label: "Meta description", max: 160, soft: true }, { key: "slug", label: "URL slug", max: 80 }, { key: "body", label: "Draft (Markdown)", max: 40000 }],
    rationale: "Articles are slow to pay off and keep paying. One a month answering a question your audience searches for is a good floor." },
  "medium-article": { id: "medium-article", platform: "medium", name: "Article", minutes: 20, floor: 1, ideal: 2, weekdays: true, deep: true, offer: true,
    fields: [{ key: "title", label: "Title", max: 100, title: true }, { key: "subtitle", label: "Subtitle", max: 140 }, { key: "body", label: "Body (Markdown)", max: 40000 }],
    rationale: "A republish of your article, so it costs little. If it appeared on your site first, set Medium's canonical link to that page." },
  "reddit-post": { id: "reddit-post", platform: "reddit", name: "Value post", minutes: 30, floor: 1, ideal: 2, weekdays: false, deep: true, offer: false,
    fields: [{ key: "title", label: "Title", max: 300, title: true }, { key: "body", label: "Body", max: 40000 }],
    rationale: "Reddit rewards being useful and punishes promotion. Read each subreddit's rules first; post only where your experience genuinely answers what people ask." },
  "pinterest-pin": { id: "pinterest-pin", platform: "pinterest", name: "Pin", minutes: 10, floor: 4, ideal: 16, weekdays: false, deep: false, offer: true,
    fields: [{ key: "title", label: "Title", max: 100, title: true }, { key: "description", label: "Description", max: 500 }, { key: "overlay", label: "Image text", max: 60 }, { key: "link", label: "Link", max: 500 }],
    rationale: "Pins keep sending visitors for months. Several a week, each pointing at an article or offer page." },
  "podcast-clip": { id: "podcast-clip", platform: "podcast", name: "Clip", minutes: 30, floor: 2, ideal: 4, weekdays: false, deep: true, offer: true,
    fields: [{ key: "title", label: "Clip title", max: 100, title: true }, { key: "caption", label: "Caption", max: 2200 }], parts: { label: "Talking points", max: 300, maxItems: 6 },
    rationale: "A 30 to 90 second clip of you telling one story, from an episode or recorded on its own. Shareable everywhere video goes." },
};

// ---------------------------------------------------------------------------
// Measuring and fitting text
// ---------------------------------------------------------------------------

const URL_RE = /https?:\/\/[^\s]+/g;

/** Count graphemes (what a reader sees as a character). @param {string} s */
export function graphemes(s) {
  const Seg = /** @type {any} */ (Intl).Segmenter;
  if (typeof Seg === "function") { let n = 0; for (const _ of new Seg("en", { granularity: "grapheme" }).segment(s)) n++; return n; }
  return Array.from(s).length;
}

/**
 * Length in a platform's unit. "x" counts every link as 23 characters, which
 * is how X shortens links; it is otherwise a plain character count, so very
 * long CJK or emoji-heavy posts may count differently on X itself.
 * @param {string} s @param {"chars"|"graphemes"|"x"} [unit]
 */
export function measure(s, unit = "chars") {
  const t = String(s || "");
  if (unit === "graphemes") return graphemes(t);
  if (unit === "x") return Array.from(t.replace(URL_RE, "")).length + (t.match(URL_RE) || []).length * 23;
  return Array.from(t).length;
}

/**
 * Cut `s` to fit `max` in `unit`, at a word boundary where possible. Titles
 * are cut clean; everything else gets an ellipsis so the cut is visible.
 * @param {string} s @param {number} max @param {"chars"|"graphemes"|"x"} [unit] @param {boolean} [clean]
 */
export function clip(s, max, unit = "chars", clean = false) {
  const t = String(s || "").trim();
  if (measure(t, unit) <= max) return t;
  const tail = clean ? "" : "…";
  let chars = Array.from(t);
  let lo = 0, hi = chars.length;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (measure(chars.slice(0, mid).join("").trimEnd() + tail, unit) <= max) lo = mid; else hi = mid - 1; }
  let cut = chars.slice(0, lo).join("");
  const space = cut.lastIndexOf(" ");
  if (space > cut.length * 0.6) cut = cut.slice(0, space);
  cut = cut.replace(/[\s,;:–—-]+$/, "");
  return cut + tail;
}

/**
 * Fit `head` and `tail` together under `max`, cutting only the head, so a
 * link or call to action at the end survives.
 * @param {string} head @param {string} tail @param {number} max @param {"chars"|"graphemes"|"x"} [unit]
 */
export function fitWith(head, tail, max, unit = "chars") {
  if (!tail) return clip(head, max, unit);
  const room = max - measure(tail, unit);
  if (room < 20) return clip(`${head}${tail}`, max, unit);
  return clip(head, room, unit) + tail;
}

/** Sentences of a block of text, each ending with punctuation. @param {string} text */
export function sentences(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  return t.split(/(?<=[.!?…])\s+(?=[^a-z])/).map((s) => s.trim()).filter(Boolean).map(endPunct);
}

const endPunct = (/** @type {string} */ s) => (/[.!?…"')\]]$/.test(s) ? s : `${s}.`);
const noEnd = (/** @type {string} */ s) => String(s || "").trim().replace(/[.!?…]+$/, "");
const cap = (/** @type {string} */ s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lowerFirst = (/** @type {string} */ s) => (s && /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** Words from the banned list that appear in `text` (case-insensitive, whole words). @param {string} text @param {string[]} banned */
export function bannedHits(text, banned) {
  const t = String(text || "").toLowerCase();
  return (banned || []).filter((w) => {
    const word = w.toLowerCase().trim();
    if (!word) return false;
    const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, "u").test(t);
  });
}

/** Hashtags built from the user's own keywords. @param {string[]} keywords @param {number} n */
export function hashtags(keywords, n) {
  const out = [];
  for (const k of keywords || []) {
    const tag = k.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((w) => cap(w.toLowerCase())).join("");
    if (tag && !out.includes(`#${tag}`)) out.push(`#${tag}`);
    if (out.length >= n) break;
  }
  return out;
}

/** @param {string} s */
export function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
}

// ---------------------------------------------------------------------------
// Plan: how much to make for each platform
// ---------------------------------------------------------------------------

/**
 * @typedef {{ format: string, platform: string, name: string, perMonth: number, perWeek: number, minutes: number, floor: number, ideal: number, status: "ideal"|"between"|"below-floor"|"skipped", rationale: string }} PlanRow
 * @typedef {{ rows: PlanRow[], hours: number, budgetPerWeek: number, usedPerWeek: number, notes: string[] }} Plan
 */

/**
 * Scale each selected platform's starting cadence to the hours available.
 * Every platform first gets one piece of its main format if the time allows,
 * then formats are filled round-robin to their floor, then towards their
 * ideal, cheapest first in each round. A format the hours cannot reach is
 * reported, not silently dropped.
 * @param {string[]} platformIds @param {number} hoursPerWeek @returns {Plan}
 */
export function planCadence(platformIds, hoursPerWeek) {
  const hours = clampNum(hoursPerWeek, 0, 60, 0);
  const budget = hours * 60 * 4; // minutes per 4 weeks
  const chosen = PLATFORMS.filter((p) => (platformIds || []).includes(p.id));
  const formats = chosen.flatMap((p) => p.formats.map((f) => FORMATS[f]));
  /** @type {Record<string, number>} */
  const count = Object.fromEntries(formats.map((f) => [f.id, 0]));
  let used = 0;
  const add = (/** @type {Format} */ f) => { if (used + f.minutes > budget) return false; count[f.id]++; used += f.minutes; return true; };
  // 1. One piece of each platform's main format, cheapest platforms first.
  for (const p of [...chosen].sort((a, b) => FORMATS[a.formats[0]].minutes - FORMATS[b.formats[0]].minutes)) add(FORMATS[p.formats[0]]);
  // 2. Round-robin to the floor, then 3. to the ideal.
  for (const target of /** @type {const} */ (["floor", "ideal"])) {
    const byCost = [...formats].sort((a, b) => a.minutes - b.minutes);
    let moved = true;
    while (moved) {
      moved = false;
      for (const f of byCost) if (count[f.id] < f[target] && add(f)) moved = true;
    }
  }
  /** @type {PlanRow[]} */
  const rows = formats.map((f) => {
    const n = count[f.id];
    const status = n === 0 ? "skipped" : n >= f.ideal ? "ideal" : n >= f.floor ? "between" : "below-floor";
    return { format: f.id, platform: f.platform, name: `${platformName(f.platform)} ${f.name.toLowerCase()}`, perMonth: n, perWeek: Math.round((n / 4) * 10) / 10, minutes: f.minutes, floor: f.floor, ideal: f.ideal, status, rationale: f.rationale };
  });
  const notes = [];
  if (!chosen.length) notes.push("Pick at least one platform to get a plan.");
  else if (hours === 0) notes.push("Set how many hours a week you have; the plan is built to fit that time.");
  const skipped = rows.filter((r) => r.status === "skipped");
  const below = rows.filter((r) => r.status === "below-floor");
  if (hours > 0 && skipped.length) notes.push(`Not enough time for ${skipped.map((r) => r.name).join(", ")} at ${hours} h/week. Add time or drop a platform.`);
  if (below.length) notes.push(`${below.map((r) => r.name).join(", ")} ${below.length === 1 ? "is" : "are"} below the suggested starting rhythm. Fewer platforms done consistently usually beats more done thinly.`);
  if (rows.length && rows.every((r) => r.status === "ideal")) notes.push("Your hours cover the full starting rhythm everywhere you picked. Spend spare time replying to comments, not making more.");
  return { rows, hours, budgetPerWeek: hours * 60, usedPerWeek: Math.round(used / 4), notes };
}

/** @param {string} id */
export function platformName(id) {
  return PLATFORMS.find((p) => p.id === id)?.name.replace(/ \/.*$/, "").replace(" (Twitter)", "") ?? id;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

/** @param {string} s */
export function isISODate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
/** @param {string} iso @param {number} days */
export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** 0 = Sunday. @param {string} iso */
export function weekday(iso) { return new Date(`${iso}T00:00:00Z`).getUTCDay(); }
/** The Monday on or after `iso`. @param {string} iso */
export function nextMonday(iso) {
  const base = isISODate(iso) ? iso : new Date().toISOString().slice(0, 10);
  return addDays(base, (8 - weekday(base)) % 7);
}

/**
 * The material the drafts are made from, in the order they rotate: problem
 * first, then stories, opinions, tips and proof interleaved, with the offer
 * every fifth piece at most.
 * @param {Answers} a @returns {Angle[]}
 */
export function angleSequence(a) {
  /** @type {Angle[]} */
  const seq = [];
  if (a.problem) seq.push({ kind: "problem", index: 0 });
  const pools = /** @type {const} */ ([["story", a.stories], ["opinion", a.opinions], ["tip", a.tips], ["proof", a.proof]]);
  const longest = Math.max(0, ...pools.map((p) => p[1].length));
  for (let i = 0; i < longest; i++) for (const [kind, pool] of pools) if (i < pool.length) seq.push({ kind, index: i });
  if (!seq.length && a.about) seq.push({ kind: "about", index: 0 });
  if (!a.offer) return seq;
  if (!seq.length) return [{ kind: "offer", index: 0 }];
  /** @type {Angle[]} */
  const out = [];
  seq.forEach((x, i) => { out.push(x); if ((i + 1) % 4 === 0) out.push({ kind: "offer", index: 0 }); });
  if (out.length === seq.length) out.push({ kind: "offer", index: 0 });
  return out;
}

/** @param {Angle} angle @param {Answers} a */
export function material(angle, a) {
  switch (angle.kind) {
    case "story": return a.stories[angle.index] || "";
    case "opinion": return a.opinions[angle.index] || "";
    case "tip": return a.tips[angle.index] || "";
    case "proof": return a.proof[angle.index] || "";
    case "problem": return a.problem;
    case "offer": return a.offer;
    default: return a.about;
  }
}

/**
 * Lay the plan out over 28 days from `startDate`. Each format's pieces are
 * spread evenly over the days it may use (weekday-only formats skip
 * weekends), staggered so formats do not all land on the same days. Every
 * slot gets an angle: the day's theme, so one idea is repurposed across
 * platforms on the same day, adjusted where a format needs a deeper angle
 * or must not carry an offer.
 * @param {Plan} plan @param {string} startDate @param {Answers} answers @returns {Slot[]}
 */
export function buildCalendar(plan, startDate, answers) {
  const start = isISODate(startDate) ? startDate : nextMonday(new Date().toISOString().slice(0, 10));
  const days = Array.from({ length: 28 }, (_, i) => addDays(start, i));
  const seq = angleSequence(answers);
  /** @type {Slot[]} */
  const slots = [];
  plan.rows.forEach((row, fi) => {
    const f = FORMATS[row.format];
    const n = row.perMonth;
    if (!n) return;
    const cand = days.map((d, i) => ({ d, i })).filter((x) => !f.weekdays || (weekday(x.d) !== 0 && weekday(x.d) !== 6));
    const step = cand.length / n;
    const shift = step >= 2 ? (fi * 2) % Math.floor(step) : 0;
    for (let k = 0; k < n; k++) {
      const c = cand[Math.min(cand.length - 1, Math.floor(k * step) + shift)];
      slots.push({ id: `${c.d}-${f.id}-${k + 1}`, date: c.d, day: c.i, format: f.id, platform: f.platform, seq: k + 1, angle: { kind: "about", index: 0 } });
    }
  });
  slots.sort((x, y) => x.day - y.day || PLATFORM_IDS.indexOf(x.platform) - PLATFORM_IDS.indexOf(y.platform) || x.format.localeCompare(y.format) || x.seq - y.seq);
  /** @type {Record<string, number>} */
  const sameDay = {};
  for (const s of slots) {
    const key = `${s.day}:${s.format}`;
    const j = sameDay[key] = (sameDay[key] ?? -1) + 1;
    s.angle = pickAngle(seq, s.day + j * 3, FORMATS[s.format]);
  }
  return slots;
}

/** @param {Angle[]} seq @param {number} start @param {Format} f @returns {Angle} */
function pickAngle(seq, start, f) {
  if (!seq.length) return { kind: "about", index: 0 };
  const ok = (/** @type {Angle} */ a) => (f.offer || a.kind !== "offer") && (!f.deep || ["story", "opinion", "tip", "problem", "about"].includes(a.kind));
  for (let i = 0; i < seq.length; i++) { const a = seq[(start + i) % seq.length]; if (ok(a)) return a; }
  for (let i = 0; i < seq.length; i++) { const a = seq[(start + i) % seq.length]; if (f.offer || a.kind !== "offer") return a; }
  return { kind: "about", index: 0 };
}

// ---------------------------------------------------------------------------
// Template engine: drafts built only from the interview
// ---------------------------------------------------------------------------

/** Pick the first wording variant that avoids the banned list, rotating by `i`. @param {string[]} variants @param {string[]} banned @param {number} i */
function say(variants, banned, i = 0) {
  for (let k = 0; k < variants.length; k++) { const v = variants[(i + k) % variants.length]; if (!bannedHits(v, banned).length) return v; }
  return "";
}

/**
 * The pieces every format is assembled from: a hook, body sentences, a
 * lesson, and the call to action, all taken from the interview.
 * @param {Angle} angle @param {Answers} a @param {number} i
 */
export function ingredients(angle, a, i = 0) {
  const casual = a.voice.formal < 50;
  const text = material(angle, a);
  const s = sentences(text);
  const b = a.banned;
  let hook = s[0] || "";
  let body = s.slice(1);
  let lesson = "";
  if (angle.kind === "story") {
    if (s.length >= 3) { lesson = s[s.length - 1]; body = s.slice(1, -1); }
  } else if (angle.kind === "opinion") {
    hook = joinLead(say(casual ? ["Unpopular opinion:", "Hot take:", "I'll say it:"] : ["An opinion I hold firmly:", "A view worth stating plainly:", "Where I stand:"], b, i), s[0] || "");
  } else if (angle.kind === "tip") {
    hook = joinLead(say(casual ? ["Quick tip:", "Try this:", "Simple fix:"] : ["One practical recommendation:", "A practice worth adopting:", "Advice I give often:"], b, i), s[0] || "");
  } else if (angle.kind === "proof") {
    hook = joinLead(say(casual ? ["A result I'm proud of:", "Real numbers:", "Where this has got us:"] : ["A result worth sharing:", "For the record:", "What the work has produced:"], b, i), s[0] || "");
  } else if (angle.kind === "problem") {
    hook = a.audience ? `${say(casual ? ["If you're", "For"] : ["For", "If you are"], b, i)} ${lowerFirst(noEnd(a.audience))}: ${lowerFirst(endPunct(s[0] || ""))}` : (s[0] || "");
    if (a.outcome) body = [...body, `${say(["It doesn't have to stay that way.", "There is another way.", "It can change."], b, i)} ${endPunct(cap(a.outcome))}`];
  } else if (angle.kind === "offer") {
    hook = a.problem ? `${say(["If you want help with this:", "Want help with this?", "Need a hand?"], b, i)} ${cap(lowerFirst(noEnd(a.problem)))}.` : endPunct(cap(text));
    body = a.problem ? [endPunct(cap(text))] : [];
  }
  if (!body.length && ["opinion", "tip", "proof"].includes(angle.kind) && a.audience) {
    body = [`${say(["This matters if you're", "Worth knowing if you're", "Especially if you're"], b, i)} ${lowerFirst(noEnd(a.audience))}.`];
  }
  const ctaLine = a.offer ? endPunct(cap(a.offer)) : "";
  // `core` is the material's own first sentence, without a lead-in: used for titles.
  const core = cap(noEnd(angle.kind === "offer" || angle.kind === "problem" ? hook : s[0] || hook));
  return { hook: hook.trim(), core, body, lesson, cta: ctaLine, link: a.link, isOffer: angle.kind === "offer", casual, text };
}

/** @param {string} lead @param {string} s */
function joinLead(lead, s) { return lead ? `${lead} ${lowerFirst(s)}` : s; }

/** @param {Answers} a @param {number} i */
function question(a, i) {
  const who = a.audience ? cap(noEnd(a.audience).split(/[,.;]| who | that /)[0].trim()) : "";
  const casual = a.voice.formal < 50;
  const q = say(casual ? ["What's your take?", "Agree or disagree?", "How do you handle this?"] : ["How do you approach this?", "What has your experience been?", "I'd value your view."], a.banned, i);
  return who && who.length < 60 ? `${who}: ${lowerFirst(q)}` : q;
}

/** @param {string[]} items */
const paragraphs = (items) => items.filter(Boolean).join("\n\n");

/**
 * Build the template draft for one calendar slot.
 * @param {Slot} slot @param {Answers} a @returns {Draft}
 */
export function templateDraft(slot, a) {
  const f = FORMATS[slot.format];
  const g = ingredients(slot.angle, a, slot.seq);
  /** @type {Record<string, string>} */
  const fields = {};
  /** @type {string[]} */
  let parts = [];
  const notes = [];
  const kw = a.keywords[0] || "";
  const inBio = g.isOffer && g.link ? say(["Link in bio.", "The link is in my bio."], a.banned, slot.seq) : "";
  const offerTail = g.isOffer ? [g.link].filter(Boolean).join("") : "";
  const all = [g.hook, ...g.body, g.lesson].filter(Boolean);
  const vid = () => {
    const beats = [...g.body, g.lesson].filter(Boolean);
    if (beats.length < 2 && a.outcome && !g.isOffer && !beats.join(" ").includes(noEnd(cap(a.outcome)))) beats.push(endPunct(cap(a.outcome)));
    if (beats.length < 2 && a.audience) beats.unshift(`${say(["This is for", "Made for"], a.banned, slot.seq)} ${lowerFirst(noEnd(a.audience))}.`);
    let seconds = speak(g.hook);
    parts = [];
    for (const beat of beats.slice(0, 5)) { const t = speak(beat); if (seconds + t > 55) break; seconds += t; parts.push(beat); }
    const cta = g.isOffer ? `${g.cta} ${inBio}`.trim() : (kw ? `${say(["Follow for more on", "More on"], a.banned, slot.seq)} ${kw}.` : say(["Follow for more.", "Save this for later."], a.banned, slot.seq));
    seconds += speak(cta);
    fields.hook = g.hook;
    fields.onScreen = clip(noEnd(g.hook).split(/\s+/).slice(0, 8).join(" "), 80, "chars", true);
    fields.cta = cta;
    fields.caption = [g.hook, g.isOffer ? inBio : "", hashtags(a.keywords, 5).join(" ")].filter(Boolean).join("\n\n");
    fields.duration = `about ${Math.max(15, Math.round(seconds / 5) * 5)} seconds spoken (estimate at 150 words a minute)`;
  };
  if (g.text.trim()) switch (slot.format) {
    case "x-post": fields.text = fitWith(g.hook + (g.body[0] && !g.isOffer ? ` ${g.body[0]}` : ""), offerTail ? `\n\n${offerTail}` : "", 280, "x"); break;
    case "threads-post": fields.text = fitWith(paragraphs([g.hook, ...g.body.slice(0, 2)]), offerTail ? `\n\n${offerTail}` : "", 500); break;
    case "bluesky-post": fields.text = fitWith(g.hook + (g.body[0] && !g.isOffer ? `\n\n${g.body[0]}` : ""), offerTail ? `\n\n${offerTail}` : "", 300, "graphemes"); break;
    case "x-thread": {
      const posts = [`${g.hook} ${say(["A thread:", "(thread)", "Here's the story:"], a.banned, slot.seq)}`];
      for (const s of [...g.body, g.lesson].filter(Boolean)) {
        const last = posts[posts.length - 1];
        if (posts.length > 1 && measure(`${last} ${s}`, "x") <= 270) posts[posts.length - 1] = `${last} ${s}`; else posts.push(s);
      }
      if (a.offer) posts.push([g.cta, a.link].filter(Boolean).join(" "));
      parts = posts.slice(0, 8);
      parts = parts.map((p, k) => fitWith(p, ` ${k + 1}/${parts.length}`, 280, "x"));
      break;
    }
    case "linkedin-post": {
      const tags = hashtags(a.keywords, 3).join(" ");
      fields.text = paragraphs([g.hook, ...g.body, g.lesson, g.isOffer ? [g.cta, g.link].filter(Boolean).join(" ") : question(a, slot.seq), tags]);
      break;
    }
    case "facebook-post": fields.text = paragraphs([g.hook, ...g.body, g.lesson, g.isOffer ? [g.cta, g.link].filter(Boolean).join(" ") : question(a, slot.seq)]); break;
    case "instagram-feed":
      fields.caption = paragraphs([g.hook, ...g.body, g.lesson, g.isOffer ? `${g.cta} ${inBio}`.trim() : "", hashtags(a.keywords, 5).join(" ")]);
      fields.visual = `${say(["A photo from the moment, or plain text on a brand colour:", "Text graphic:", "Photo with this overlaid:"], a.banned, slot.seq)} "${clip(noEnd(g.hook), 90)}"`;
      break;
    case "instagram-carousel": {
      parts = [clip(noEnd(g.hook), 120)];
      for (const s of [...g.body, ...(g.lesson ? [g.lesson] : [])].slice(0, 7)) parts.push(clip(s, 200));
      if (parts.length < 3 && a.outcome && !g.isOffer && !parts.join(" ").includes(noEnd(cap(a.outcome)))) parts.push(endPunct(cap(a.outcome)));
      parts.push(g.isOffer ? `${g.cta} ${inBio}`.trim() : say(["Save this for later.", "Send this to someone who needs it.", "Follow for more like this."], a.banned, slot.seq));
      fields.caption = paragraphs([g.hook, say(["Swipe through.", "The details are in the slides.", "All the steps are in the slides."], a.banned, slot.seq), hashtags(a.keywords, 5).join(" ")]);
      break;
    }
    case "instagram-reel": case "tiktok-video": vid(); break;
    case "youtube-short": vid(); fields.title = clip(g.core, 100, "chars", true); break;
    case "youtube-video": {
      fields.title = clip(kw && !g.core.toLowerCase().includes(kw.toLowerCase()) ? `${g.core} | ${cap(kw)}` : g.core, 100, "chars", true);
      fields.description = paragraphs([[g.hook, ...g.body.slice(0, 1)].join(" "), a.about, g.link ? `${g.cta || say(["More:", "Learn more:"], a.banned, 0)} ${g.link}` : g.cta, "Chapters: [add timestamps after you edit]"]);
      parts = [`Intro: ${g.hook}`];
      if (a.problem && slot.angle.kind !== "problem") parts.push(`Why it matters: ${endPunct(cap(a.problem))}`);
      for (const s of g.body.slice(0, 5)) parts.push(`Point: ${s}`);
      if (g.lesson) parts.push(`Takeaway: ${g.lesson}`);
      if (a.proof[0] && slot.angle.kind !== "proof") parts.push(`Proof you can show: ${endPunct(cap(a.proof[0]))}`);
      parts.push(`Close: ${g.cta || (kw ? `subscribe for more on ${kw}.` : "subscribe for more.")}`);
      break;
    }
    case "newsletter": {
      fields.subject = clip(noEnd(g.hook), 60, "chars", true);
      fields.preview = clip(g.body[0] || a.about, 90, "chars", true);
      const hi = say(a.voice.formal < 50 ? ["Hi there,", "Hey,", "Hello,"] : ["Hello,", "Good morning,", "Dear reader,"], a.banned, slot.seq);
      const why = a.audience && a.problem && slot.angle.kind !== "problem" ? `${say(["Why this matters if you're", "Why I'm telling you this, if you're"], a.banned, slot.seq)} ${lowerFirst(noEnd(a.audience))}: ${lowerFirst(endPunct(a.problem))}` : "";
      const proofLine = a.proof[0] && slot.angle.kind !== "proof" ? `${say(["For context:", "Where we are now:"], a.banned, slot.seq)} ${lowerFirst(endPunct(a.proof[0]))}` : "";
      fields.body = paragraphs([hi, g.hook, ...g.body, g.lesson, why, proofLine, [g.cta, g.link].filter(Boolean).join(" "), a.name ? `— ${a.name}` : ""]);
      break;
    }
    case "blog-article": case "medium-article": {
      const base = g.core;
      const title = kw && !base.toLowerCase().includes(kw.toLowerCase()) ? `${cap(kw)}: ${base}` : base;
      const md = paragraphs([
        `# ${title}`,
        a.about ? `*${endPunct(a.about)}*` : "",
        a.problem && slot.angle.kind !== "problem" ? `## The problem\n\n${endPunct(cap(a.problem))}` : "",
        `## ${slot.angle.kind === "story" ? "What happened" : slot.angle.kind === "tip" ? "The advice" : slot.angle.kind === "opinion" ? "The argument" : "The short version"}\n\n${paragraphs([g.hook, ...g.body])}`,
        g.lesson ? `## The takeaway\n\n${g.lesson}` : "",
        "[Add detail: an example, a step-by-step, or an answer to the question a reader would ask next.]",
        a.proof.length ? `## Results\n\n${a.proof.map((p) => `- ${endPunct(cap(p))}`).join("\n")}` : "",
        a.outcome ? `## What changes\n\n${endPunct(cap(a.outcome))}` : "",
        a.offer ? `## Next step\n\n${[g.cta, a.link].filter(Boolean).join(" ")}` : "",
      ]);
      if (slot.format === "blog-article") {
        fields.seoTitle = clip(title, 60, "chars", true);
        fields.meta = clip([g.hook, a.about].filter(Boolean).join(" "), 160);
        fields.slug = slugify(fields.seoTitle);
        fields.body = md;
      } else {
        fields.title = clip(title, 100, "chars", true);
        fields.subtitle = clip(a.about || g.body[0] || "", 140);
        fields.body = md.replace(/^# .*\n\n/, "");
        notes.push("If this article is on your own site first, set Medium's canonical link to that page so search engines credit the original.");
      }
      break;
    }
    case "reddit-post": {
      fields.title = clip(g.core, 300, "chars", true);
      fields.body = paragraphs([...all.slice(1), a.problem && slot.angle.kind !== "problem" ? `${say(["The problem I keep seeing:", "The situation:"], a.banned, slot.seq)} ${lowerFirst(endPunct(a.problem))}` : "", a.about ? `${say(["For context, and so you know where I'm coming from:", "Disclosure, so you know where I'm coming from:"], a.banned, slot.seq)} ${lowerFirst(endPunct(a.about))}` : "", say(["Happy to answer questions.", "Curious how others have handled this."], a.banned, slot.seq)]);
      notes.push("Read the subreddit's rules before posting. Many forbid self-promotion and links; disclose that it is your business.");
      break;
    }
    case "pinterest-pin":
      fields.title = clip(noEnd(g.hook), 100, "chars", true);
      fields.description = clip([g.hook, g.body[0], a.about, a.keywords.length ? a.keywords.slice(0, 4).join(", ") : ""].filter(Boolean).join(" "), 500);
      fields.overlay = clip(noEnd(g.hook).split(/\s+/).slice(0, 8).join(" "), 60, "chars", true);
      fields.link = a.link || "[link to the article or page this pin is for]";
      break;
    case "podcast-clip":
      fields.title = clip(noEnd(g.hook), 100, "chars", true);
      parts = all.slice(0, 6);
      fields.caption = paragraphs([g.hook, g.isOffer ? [g.cta, g.link].filter(Boolean).join(" ") : "", hashtags(a.keywords, 3).join(" ")]);
      notes.push("Record or cut a 30 to 90 second clip of you telling this in your own words; the talking points are prompts, not a script to read.");
      break;
  }
  /** @type {Draft} */
  const d = { slotId: slot.id, date: slot.date, format: slot.format, platform: slot.platform, title: "", fields, parts, text: "", warnings: notes, source: "template", angle: slot.angle };
  return fitDraft(d, a);
}

/** Rough speaking time at 150 words a minute. @param {string} s */
function speak(s) { return (String(s || "").split(/\s+/).filter(Boolean).length / 150) * 60; }

/**
 * Enforce the format's limits on a draft (from either engine), re-render its
 * copy-ready text, and add warnings: what was cut, soft limits passed,
 * banned words found, and anything left empty.
 * @param {Draft} d @param {Answers} a @returns {Draft}
 */
export function fitDraft(d, a) {
  const f = FORMATS[d.format];
  const warnings = [...d.warnings];
  /** @type {Record<string, string>} */
  const fields = { ...d.fields };
  for (const spec of f.fields) {
    const v = String(fields[spec.key] ?? "").trim();
    fields[spec.key] = v;
    if (!spec.max) continue;
    const n = measure(v, spec.unit);
    if (n <= spec.max) continue;
    if (spec.soft) warnings.push(`${spec.label} is ${n} characters; under ${spec.max} is the usual guideline.`);
    else { fields[spec.key] = clip(v, spec.max, spec.unit, spec.title); warnings.push(`${spec.label} was cut to ${spec.max} ${spec.unit === "graphemes" ? "characters (graphemes)" : "characters"}; check the ending.`); }
  }
  let parts = (d.parts || []).map((p) => String(p).trim()).filter(Boolean);
  if (f.parts) {
    const ps = f.parts;
    if (ps.maxItems && parts.length > ps.maxItems) { parts = parts.slice(0, ps.maxItems); warnings.push(`Kept the first ${ps.maxItems} ${ps.label.toLowerCase()}.`); }
    parts = parts.map((p, i) => {
      if (!ps.max || measure(p, ps.unit) <= ps.max) return p;
      warnings.push(`${ps.label} ${i + 1} was cut to ${ps.max} characters.`);
      return clip(p, ps.max, ps.unit);
    });
  }
  if (d.format === "instagram-feed" || d.format === "instagram-carousel" || d.format === "instagram-reel") {
    const tags = (fields.caption || "").match(/#[\p{L}\p{N}_]+/gu) || [];
    if (tags.length > 30) warnings.push("Instagram allows at most 30 hashtags.");
  }
  const title = fields.title || fields.seoTitle || fields.subject || fields.hook || noEnd((fields.text || fields.caption || parts[0] || "").split("\n")[0]).slice(0, 80);
  const out = { ...d, fields, parts, title: clip(title, 100, "chars", true), warnings: [] };
  out.text = renderText(out);
  if (!out.text.replace(/\s/g, "")) warnings.push("Nothing to say yet: answer more of the interview (stories, opinions, tips) and this fills in.");
  const hits = bannedHits(out.text, a.banned);
  if (hits.length) warnings.push(`Contains words from your banned list: ${hits.join(", ")}.`);
  if (/\[(add|link to)[^\]]*\]/i.test(out.text)) warnings.push("Has a [bracketed] placeholder to fill in before posting.");
  out.warnings = [...new Set(warnings)];
  return out;
}

/** The copy-ready text of a draft. @param {Draft} d */
export function renderText(d) {
  const f = FORMATS[d.format];
  if (f.fields.length === 1 && !f.parts) return d.fields[f.fields[0].key] || "";
  if (d.format === "x-thread") return d.parts.join("\n\n---\n\n");
  const LONG = ["body", "caption", "description", "text"];
  const partsFirst = f.parts && (!f.fields.length || LONG.includes(f.fields[0].key));
  const out = [];
  if (partsFirst && d.parts.length) out.push(partsText(f, d.parts));
  f.fields.forEach((spec, i) => {
    const v = d.fields[spec.key] || "";
    out.push(LONG.includes(spec.key) ? `${spec.label}:\n${v}` : `${spec.label}: ${v}`);
    if (i === 0 && f.parts && !partsFirst && d.parts.length) out.push(partsText(f, d.parts));
  });
  if (d.fields.duration) out.push(`Length: ${d.fields.duration}`);
  return out.join("\n\n").trim();
}

/** @param {Format} f @param {string[]} parts */
function partsText(f, parts) {
  const label = f.parts?.label || "Parts";
  const unit = label === "Slides" ? "Slide" : label === "Beats" ? "Beat" : "";
  return `${label}:\n${parts.map((p, i) => (unit ? `${unit} ${i + 1}: ${p}` : `${i + 1}. ${p}`)).join("\n")}`;
}

/** All drafts for a calendar. @param {Slot[]} slots @param {Answers} a */
export function draftAll(slots, a) {
  return slots.map((s) => templateDraft(s, a));
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const EXPORT_NOTE = "This tool does not post anywhere. Review every draft, follow each platform's rules, label AI-generated content where a platform requires it (TikTok, YouTube and Meta ask for disclosure of realistic AI-generated or altered media), and do not use it for spam, fake accounts or fake reviews.";

/** Neutralise spreadsheet formula injection and quote per RFC 4180. @param {unknown} v */
export function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV for a scheduler import: date, platform, format, title, text. @param {Draft[]} drafts */
export function toCSV(drafts) {
  const rows = [["date", "platform", "format", "title", "text"]];
  for (const d of drafts) rows.push([d.date, platformName(d.platform), FORMATS[d.format].name, d.title, d.text]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** @param {Draft[]} drafts @param {Plan} plan @param {Interview} interview */
export function toMarkdown(drafts, plan, interview) {
  const a = interview.answers;
  const out = [`# Content plan: ${interview.topic || a.name || "untitled"}`, "", `> ${EXPORT_NOTE}`, "", "## Plan (per week)", "", "| Platform | Format | Per week | Minutes each |", "|---|---|---|---|"];
  for (const r of plan.rows) out.push(`| ${platformName(r.platform)} | ${FORMATS[r.format].name} | ${r.perWeek} | ${r.minutes} |`);
  out.push("", `About ${Math.round((plan.usedPerWeek / 60) * 10) / 10} of your ${plan.hours} hours a week.`, "");
  let day = "";
  for (const d of drafts) {
    if (d.date !== day) { day = d.date; out.push(`## ${d.date} (${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekday(d.date)]})`, ""); }
    out.push(`### ${platformName(d.platform)}: ${FORMATS[d.format].name}${d.source === "model" ? " (AI draft)" : ""}`, "", d.text, "");
    if (d.warnings.length) out.push(...d.warnings.map((w) => `- Note: ${w}`), "");
  }
  return out.join("\n");
}

/** @param {Draft[]} drafts @param {Plan} plan @param {Interview} interview */
export function toJSON(drafts, plan, interview) {
  return JSON.stringify({ tool: "interview-content-studio", version: VERSION, note: EXPORT_NOTE, interview, plan, drafts }, null, 2);
}

/** Everything in one call: plan, calendar and template drafts. @param {Interview} interview @param {string} startDate */
export function generate(interview, startDate) {
  const a = normalizeAnswers(interview.answers);
  const plan = planCadence(a.platforms, a.hours);
  const slots = buildCalendar(plan, startDate, a);
  return { plan, slots, drafts: draftAll(slots, a) };
}
