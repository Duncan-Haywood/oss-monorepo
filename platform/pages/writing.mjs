/**
 * The writing section: essays and write-ups about how this repository is
 * built and what it found, published at `writing/` on the Pages site.
 *
 *   node platform/pages/writing.mjs --out=dist      # writes dist/writing/
 *
 * Sources are Markdown files in `docs/posts/`, named `<YYYY-MM-DD>-<slug>.md`,
 * each with a small front-matter block:
 *
 *   ---
 *   title: "How a fleet of AI agents built 121 bid calculators nobody asked for"
 *   date: 2026-10-16
 *   description: "One or two sentences for the index, search results and feeds."
 *   tags: [ai-agents, automation]
 *   ---
 *
 * Link one post from another by its file name (`[title](2026-10-16-slug.md)`):
 * that works on GitHub, and the site rewrites it to the post's page.
 *
 * Optional front matter: `topic:` (one of TOPICS' ids) overrides the topic
 * `topicOf` derives from the tags. The blog index filters by topic and tag and
 * searches titles, summaries and full text; the podcast groups episodes by
 * their post's topic.
 *
 * A second, smaller blog is written by agents for agents (LLM readers):
 * Markdown in `docs/agent-posts/`, same front matter, published at
 * `writing/agents/` with each post's raw Markdown beside its page (as
 * `<slug>.txt`: the site checker only allows extensions the server types,
 * and `.md` is not one of them), an
 * `llms.txt` index and an `llms-full.txt` of every post.
 *
 * To publish a post, add the file. `build.mjs` calls `buildWriting` on every
 * site build, lists each post in the sitemap, and links the index from the
 * hub; `check.mjs` fails a build whose writing pages lack a disclaimer or a
 * link from the hub. Rendering reuses the devlog's escaping Markdown renderer,
 * so a post cannot inject markup and repository paths become GitHub links.
 */
import { promises as fs, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, renderMarkdown } from '../devlog/markdown.mjs';
import { formatCount } from './count.mjs';
import { SITE_NAME, TITLE_BUDGET, siteTitle, sponsorsNote, withSiteHeader } from './site-nav.mjs';
import { loadResearchRegistry } from './research-registry.mjs';
import { decodeEntities } from './entities.mjs';
import { completeArticleNode } from './article-ld.mjs';
import { stubPage } from './redirect-stubs.mjs';
import { softwareLines } from './business.mjs';
import { loadEpisodes, renderPlayer, renderPodcastBody, renderPodcastHero, writePodcastAssets, PODCAST_PATH, SHOW_DESCRIPTION, SHOW_TITLE } from './podcast.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');

export const WRITING_PATH = 'writing/';
export const POSTS_DIR = 'docs/posts';
export const AGENT_POSTS_DIR = 'docs/agent-posts';
export const AGENTS_PATH = `${WRITING_PATH}agents/`;
// Directories inside `writing/` that are not posts: a post with one of these slugs would overwrite them.
const RESERVED_SLUGS = new Set(['agents', 'podcast', 'page', 'topic']);
/** Each topic's own page, under the blog: `writing/topic/<id>/`. */
export const TOPIC_PATH = `${WRITING_PATH}topic/`;

/** Posts per index page. A page of 50 cards is about 50 kB of HTML; one page of every post was 2.3 MB. */
export const PAGE_SIZE = 50;

/**
 * The blog's topics, in the order the filters list them. Every post has
 * exactly one: its `topic:` front matter, else the first rule its tags match.
 * `seo` is the search-result title of the topic's page (`renderTopicPage`), written for
 * the query a reader would type; `label` is the chip and the page's `h1`.
 */
export const TOPICS = Object.freeze([
  // First since 2026-11-25 (owner: "blogs get moved from dev blog to marketing blog"): the blog
  // leads with what a paid product's customer came to read. See CUSTOMER_TAGS and topicOf.
  { id: 'business', seo: "Guides for contractors, machine shops, sellers and nonprofits", label: 'For your business', blurb: 'Practical answers for the businesses our products serve: builders and subcontractors, machine shops, resellers, e-invoicing firms and nonprofits.' },
  { id: 'start', seo: "Start here: what each free tool and research project is for", label: 'Start here', blurb: 'Who each project is for, what you get from it, and your first ten minutes with it.' },
  { id: 'quality', seo: "Quality audits of AI-built software, graded on a fixed rubric", label: 'Quality audits', blurb: 'Is the work finished, correct and at a senior professional level? Seeded random samples graded on a fixed rubric, with the evidence (portfolio/quality/).' },
  { id: 'agents', seo: "Building software with unattended AI coding agents", label: 'Building with AI agents', blurb: 'How the agent fleet builds, steers and measures itself: process, cost, mistakes and what changed.' },
  { id: 'research', seo: "Open research findings, with the numbers and caveats", label: 'Research findings', blurb: 'What the open research tracks found, with the numbers and caveats.' },
  { id: 'tools', seo: "Free browser tools and projects: what each does, who it is for", label: 'Tools and projects', blurb: 'What a tool or project does, who it is for and why it exists.' },
  { id: 'stories', seo: "Stories: science fiction, bedtime tales and saints' lives", label: 'Stories', blurb: 'Fiction from the story shelves: Hearth & Horizon science fiction, For Other Minds, Little Lamps and Saints by Candlelight.' },
  { id: 'site', seo: "Site design, accessibility, SEO and llms.txt: what changed", label: 'Site design and SEO', blurb: 'How the pages look, read and get found: design passes, accessibility, SEO, answer-engine optimisation and llms.txt.' },
  { id: 'testing', seo: "Red-team and mutation testing: do the tests catch real faults?", label: 'Testing and red team', blurb: 'Do the tests catch real faults? Red-team campaigns that seed bugs, mutation testing, and the checks that came out of them.' },
  { id: 'infrastructure', seo: "Static hosting, CI and build performance notes", label: 'Hosting and infrastructure', blurb: 'Hosting, CI, performance and the plumbing under the site.' },
]);
const TOPIC_IDS = new Set(TOPICS.map((t) => t.id));
/**
 * Tags that file a post under "For your business": `for-customers` (say so explicitly), or the id
 * of a paid software line or one of its free tools (business.mjs), so a post about framing takeoff,
 * pay applications or reseller fees reaches the customer blog without a re-tag. A post that also
 * carries a DEV_TAGS tag is about how the thing was built, not for its user, and stays where it was.
 */
export const CUSTOMER_TAGS = Object.freeze(new Set(['for-customers', ...softwareLines().flatMap((l) => [l.id, ...l.tools])]));
const DEV_TAGS = ['testing', 'test-coverage', 'property-testing', 'redteam', 'red-team', 'mutation-testing', 'fault-injection',
  'quality-audit', 'process', 'prompting', 'prompt-engineering', 'ai-agents', 'agents', 'opinion', 'ci', 'build', 'caching',
  'performance', 'perf', 'bug', 'bugfix', 'refactor', 'refactoring', 'polish', 'seo', 'aeo', 'llms-txt', 'site', 'github-actions', 'hosting', 'tooling', 'research'];
const TOOL_TAGS = ['projects', 'tools', 'mcp', 'distribution', 'voice-interfaces', 'byok', 'local-llm', 'privacy', 'podcasting', 'desktop-apps'];
const INFRA_TAGS = ['github-pages', 'hosting', 'kubernetes', 'github-actions', 'static-site', 'static-sites'];
const AGENT_TAGS = ['ai-agents', 'process', 'prompting', 'prompt-engineering', 'engineering-management'];
// Fiction: a fiction tag or a story shelf's name. The shelves are ventures, so until
// 2026-11-15 their stories were filed under "Tools and projects" (about 400) or, for the
// agent-facing shelf, "Building with AI agents". A post about how a shelf is run (its
// to-do list, its audio cap, its story queue) carries a process or hosting tag and stays
// where it was. `ai-agents` is not one of those: For Other Minds stories are about agents.
const FICTION_TAGS = ['fiction', 'science-fiction', 'short-story', 'bedtime-story', 'hearth-and-horizon', 'for-other-minds', 'little-lamps', 'saints-by-candlelight'];
// Site craft and test campaigns: about how the pages and test suites are made, even when a
// post names the tool it worked on, so they are checked before the venture rule. Until
// 2026-11-15 they filed under "Tools and projects" (about 300 of its 2,846 posts).
const SITE_TAGS = ['polish', 'seo', 'aeo', 'llms-txt'];
const TESTING_TAGS = ['redteam', 'red-team', 'mutation-testing', 'fault-injection'];
// Weaker signals, used only for a post that names no project: a design or accessibility
// change to one tool is about that tool, a generic one is about the site; likewise testing,
// CI. Not `performance`: a post making one tool faster carries it too.
const SITE_LOOSE_TAGS = ['accessibility', 'design', 'css', 'site', 'web-design', 'structured-data'];
const TESTING_LOOSE_TAGS = ['testing', 'test-coverage', 'property-testing'];
const PLUMBING_LOOSE_TAGS = ['ci', 'build', 'caching'];
const BACKSTAGE_TAGS = ['process', 'prompting', 'prompt-engineering', 'engineering-management', ...INFRA_TAGS];

/**
 * A post's topic from its tags, first rule wins (customer-facing posts, `CUSTOMER_TAGS`, come
 * fourth, before fiction and research): onboarding posts (`start-here`)
 * are the newcomer's way in, so they group together whatever else they name; quality audits
 * (`quality-audit`, portfolio/quality/) grade work from every track, so they group apart; opinion pieces are about
 * steering the fleet; then fiction (`FICTION_TAGS`, unless it is about running a shelf); then research (the `research` tag, or a tag naming a project in
 * `research/`); then red-team and mutation-testing campaigns; then polish, SEO and AEO work; then a named venture, tool or channel; then
 * hosting and CI plumbing; then anything about agents; then, for a post that matched none of those,
 * generic testing, site design, or CI and performance; everything else is a tool or project.
 * A post the rules file wrongly says so with `topic:` in its front matter.
 *
 * `projects` holds the slugs of `research/` and `ventures/` (`projectSlugs()`). Research posts
 * name their project (`marine-hull`, `cell-fidelity`) more often than they add `research`: until
 * 2026-11-13, 110 of them fell through to "Tools and projects".
 */
export function topicOf(tags = [], explicit = '', projects = NO_PROJECTS) {
  if (explicit) return explicit;
  const has = (list) => tags.some((t) => list.includes(t));
  if (tags.includes('start-here')) return 'start';
  if (tags.includes('quality-audit')) return 'quality';
  if (tags.includes('opinion')) return 'agents';
  if (tags.includes('for-customers') || (tags.some((t) => CUSTOMER_TAGS.has(t)) && !has(DEV_TAGS))) return 'business';
  if (has(FICTION_TAGS) && !has(BACKSTAGE_TAGS)) return 'stories';
  if (tags.includes('research') || tags.some((t) => projects.research.has(t))) return 'research';
  if (has(TESTING_TAGS)) return 'testing';
  if (has(SITE_TAGS)) return 'site';
  if (has(TOOL_TAGS) || tags.some((t) => projects.ventures.has(t))) return 'tools';
  if (has(INFRA_TAGS)) return 'infrastructure';
  if (has(AGENT_TAGS)) return 'agents';
  if (has(TESTING_LOOSE_TAGS)) return 'testing';
  if (has(SITE_LOOSE_TAGS)) return 'site';
  if (has(PLUMBING_LOOSE_TAGS)) return 'infrastructure';
  return 'tools';
}
const NO_PROJECTS = Object.freeze({ research: new Set(), ventures: new Set() });

/**
 * The project a post names first among its tags, or undefined: a venture for a "Tools and
 * projects" post, a `research/` programme for a "Research findings" post (since 2026-11-16).
 */
export function projectOf(tags = [], topic = '', projects = NO_PROJECTS) {
  const pool = PROJECT_TOPICS[topic];
  if (!pool) return undefined;
  return tags.find((t) => projects[pool].has(t) && !PROJECT_RESERVED.has(t));
}
/** The topics whose posts group by project, and the `projectSlugs()` set each one reads. */
export const PROJECT_TOPICS = Object.freeze({ tools: 'ventures', research: 'research' });
// Folder names under a project's topic page that are not projects.
const PROJECT_RESERVED = new Set(['page']);
/** A project needs this many posts for its own page; below it, its posts stay on the topic's date list only. */
export const PROJECT_MIN_POSTS = 3;

/**
 * A venture's display name: the first `# ` heading of its README, cut at the first ": " or
 * " — " ("# Wall Framing Takeoff: stud layout, ..." is "Wall Framing Takeoff"). The slug when
 * there is no README heading.
 */
export function projectName(slug, root = DEFAULT_ROOT) {
  const readme = path.join(root, 'ventures', slug, 'README.md');
  const heading = existsSync(readme) ? /^#\s+(.+)$/m.exec(readFileSync(readme, 'utf8'))?.[1] : '';
  const name = String(heading || '').split(/: | — | – | - /)[0].replace(/[*_`]/g, '').trim();
  return name || slug;
}

/**
 * The projects under "Tools and projects" with at least PROJECT_MIN_POSTS posts, most posts
 * first: `{ slug, name, count }`. Until 2026-11-16 the topic page was one 52-page date list
 * of 2,595 posts, 84% of them about 14 ventures.
 */
export function projectGroups(posts, { root = DEFAULT_ROOT, topic = 'tools', names = (slug) => projectName(slug, root), questions = () => '', ledes = topic === 'research' ? () => '' : (slug) => ventureLede(slug, root) } = {}) {
  const counts = new Map();
  for (const p of posts) if (p.project) counts.set(p.project, (counts.get(p.project) || 0) + 1);
  return [...counts]
    .filter(([, n]) => n >= PROJECT_MIN_POSTS)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([slug, count]) => {
      const question = topic === 'research' ? questions(slug) : '';
      const lede = ledes(slug);
      return { slug, name: topic === 'research' ? slug : names(slug), count, topic, ...(question ? { question } : {}), ...(lede ? { lede } : {}) };
    });
}

// Drop every tag, repeating until none is left, so removing one cannot leave another behind.
function stripTags(s) {
  let prev;
  do { prev = s; s = s.replace(/<[^>]+>/g, ''); } while (s !== prev);
  return s;
}

/**
 * Each research programme's card title (`research/_homepage/projects.json` or its own
 * `project.json`, via the registry the research site builds from): the question it asks.
 * A programme in the registry has a page at `research/<slug>/`.
 */
export function researchQuestions(root = DEFAULT_ROOT) {
  const data = loadResearchRegistry(root);
  const out = new Map();
  for (const t of data?.themes ?? []) for (const p of t.projects ?? []) if (p.slug && p.title) out.set(p.slug, stripTags(String(p.title)).trim());
  return out;
}

// Opening sentences that say what kind of page this is rather than what was found
// (2026-11-16: 4 of the 24 programmes with a findings page open this way).
const LEDE_BOILERPLATE = [/^an open research programme( rather than a finished project)?\.$/i, /^an open research programme with milestones [^;]*logged;/i];
// "et al. 2022", "e.g. x", "vs. y": a full stop there does not end the sentence.
const NOT_A_STOP = /(?:\bet al|\be\.g|\bi\.e|\bvs|\bcf|\bFig|\bNo|\bSec|\bEq|\bapprox|\b[A-Z])\.$/;

/**
 * A plain-text lede from a research registry card's `summary` (HTML): whole sentences, skipping
 * a boilerplate opener, up to `max` characters (the first sentence alone when it is longer, whole up to `stretch` × `max`
 * (1.5; 1 for a meta description, which search results cut near 160), clipped at a word with an ellipsis past that). The summaries run 180 to 30,000 characters; the page dek and
 * meta description want the first finding, not the whole log.
 */
export function researchLede(summaryHtml, max = 320, { stretch = 1.5 } = {}) {
  const text = decodeEntities(stripTags(String(summaryHtml || '').replace(/<sup>([^<]*)<\/sup>/gi, '^$1').replace(/<sub>([^<]*)<\/sub>/gi, '_$1'))).replace(/[ \t\r\n]+/g, ' ').trim(); // keeps a decoded &nbsp;
  if (!text) return '';
  const sentences = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?](?=\s+[A-Z0-9(“"])/g)) {
    const end = m.index + 1;
    if (NOT_A_STOP.test(text.slice(Math.max(start, end - 8), end))) continue;
    sentences.push(text.slice(start, end).trim());
    start = end;
  }
  if (start < text.length) sentences.push(text.slice(start).trim());
  while (sentences.length > 1 && LEDE_BOILERPLATE.some((re) => re.test(sentences[0]))) sentences.shift();
  let out = '';
  for (const s of sentences) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > max) break;
    out = next;
  }
  if (out) return out;
  // A first sentence up to half again the budget reads better whole than clipped.
  if (sentences[0].length <= max * stretch) return sentences[0];
  const cut = sentences[0].slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).replace(/[\s,;:(–—-]+$/, '')}…`;
}

/**
 * A venture's lede: the `> ` summary of its `llms.txt` (the line an assistant reads first, which
 * `goals.md` asks each product to keep true), as whole sentences up to `max` characters
 * (`researchLede`). Markdown links keep their text; code spans lose their backticks. Empty when
 * the venture has no `llms.txt` or no summary. Until 2026-11-16 all 17 tool project pages had
 * one generic dek ("Every blog post about X: what was built, ...").
 */
export function ventureLede(slug, root = DEFAULT_ROOT, max = 320) {
  const file = path.join(root, 'ventures', slug, 'llms.txt');
  if (!existsSync(file)) return '';
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const at = lines.findIndex((l) => /^>\s?\S/.test(l));
  if (at < 0) return '';
  const quote = [];
  for (let i = at; i < lines.length && /^>/.test(lines[i]); i++) quote.push(lines[i].replace(/^>\s?/, ''));
  const text = quote.join(' ').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`([^`]*)`/g, '$1').replace(/[*_]{2}([^*_]+)[*_]{2}/g, '$1');
  return researchLede(esc(text), max);
}

/** Each research programme's lede (`researchLede` of its registry card summary), by slug. */
export function researchLedes(root = DEFAULT_ROOT, max = 320) {
  const data = loadResearchRegistry(root);
  const out = new Map();
  for (const t of data?.themes ?? []) for (const p of t.projects ?? []) {
    const lede = p.slug && researchLede(p.summary, max);
    if (lede) out.set(p.slug, lede);
  }
  return out;
}

/** Project folder names under `research/` and `ventures/` (a folder with a README.md or index.html). */
export function projectSlugs(root = DEFAULT_ROOT) {
  const list = (dir, marks) => {
    const abs = path.join(root, dir);
    if (!existsSync(abs)) return new Set();
    return new Set(readdirSync(abs).filter((d) => !d.startsWith('_') && !d.startsWith('.') && marks.some((m) => existsSync(path.join(abs, d, m)))));
  };
  return { research: list('research', ['README.md']), ventures: list('ventures', ['index.html', 'README.md']) };
}
export const topicLabel = (id) => TOPICS.find((t) => t.id === id)?.label ?? id;
const REPO_BLOB = 'https://github.com/Duncan-Haywood/oss-monorepo/blob/main/';
// The site's old project Pages address (build.mjs's GITHUB_PAGES_BASE_URL; not
// imported, to keep this module free of an import cycle). Older posts link live
// tools by it; those links follow the base URL the site is built with.
const DEFAULT_SITE_ORIGIN = 'https://duncan-haywood.github.io/oss-monorepo/';
const FILE_RE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9][a-z0-9-]*)\.md$/;
// Posts link live tools by their full Pages URL so the Markdown reads right on
// GitHub. On the site those links become root-relative, so a build under a
// custom domain does not point readers (or canonical signals) at the old origin.
// Both the old Pages address and the live origin (build.mjs's DEFAULT_BASE_URL):
// posts written since the move to Cloudflare link https://marisstella.app/.
const PUBLISHED_ORIGINS = ['https://duncan-haywood.github.io/oss-monorepo/', 'https://marisstella.app/'];
export const relinkSite = (html, toRoot) =>
  PUBLISHED_ORIGINS.reduce((h, origin) => h.split(`href="${origin}`).join(`href="${toRoot}`), html);

/** Parse the `---` front-matter block. Returns { meta, body }. Only the subset posts use. */
// YAML's quoted scalars: "..." takes backslash escapes (\" and \\ are the ones posts use) and
// '...' doubles a quote. Until 2026-11-12 the quotes were stripped and the escapes kept, so 24
// post titles showed \"United States\" with the backslashes on the page, in <title> and in feeds.
const YAML_ESCAPES = { '"': '"', '\\': '\\', '/': '/', n: '\n', t: '\t', r: '\r', 0: '\0' };
export function unquoteYamlScalar(value) {
  const dq = /^"(.*)"$/.exec(value);
  if (dq) return dq[1].replace(/\\(.)/g, (m, c) => YAML_ESCAPES[c] ?? m);
  const sq = /^'(.*)'$/.exec(value);
  return sq ? sq[1].replace(/''/g, "'") : value;
}

export function parseFrontMatter(src) {
  const text = String(src).replace(/\r\n?/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim();
    if (/^\[.*\]$/.test(value)) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      value = unquoteYamlScalar(value);
    }
    meta[kv[1]] = value;
  }
  return { meta, body: text.slice(m[0].length) };
}

/**
 * Every post in `docs/posts/` (or `dirName`), newest first. Throws on a
 * malformed post so a bad file fails the build.
 *
 * `skipBad` (default: `PAGES_SKIP_BAD_POSTS=1`, which the deploy on `main`
 * sets) leaves a malformed post out with a warning instead. One over-long
 * description used to stop every deploy until someone fixed it: on
 * 2026-10-24, 64 of 100 runs on `main` failed this way and the median merge
 * took 48 minutes to go live (169 at worst). Pull requests stay strict, and
 * the `test` job still fails on `main`, so the bad post is still flagged.
 */
export function loadPosts(root = DEFAULT_ROOT, dirName = POSTS_DIR, { skipBad = process.env.PAGES_SKIP_BAD_POSTS === '1', moved = null } = {}) {
  const POSTS_DIR = dirName; // shadows the module constant so every message names the directory read
  const dir = path.join(root, POSTS_DIR);
  if (!existsSync(dir)) return [];
  const posts = [];
  const projects = projectSlugs(root);
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.md')) continue;
    try {
      posts.push(loadPost(root, POSTS_DIR, name, projects));
    } catch (err) {
      if (!skipBad) throw err;
      // A GitHub Actions annotation, so the skip shows on the run summary.
      console.warn(`::warning file=${POSTS_DIR}/${name}::left off the site: ${err.message}`);
    }
  }
  // A post dated after today waits for its date; the site rebuilds every three hours.
  const today = new Date().toISOString().slice(0, 10);
  for (let i = posts.length - 1; i >= 0; i--) if (posts[i].date > today) posts.splice(i, 1);
  // Seen twice means two files would write the same URL.
  const seen = new Set();
  for (const p of posts) {
    if (seen.has(p.slug)) throw new Error(`${POSTS_DIR}: two posts share the slug "${p.slug}"`);
    seen.add(p.slug);
  }
  // A post folded into another (`merged_into: <slug>`) leaves every list, feed and sitemap; its
  // old address becomes a redirect (`renderMovedPost`). The target must be a live post, so a
  // typo or a chain of moves fails the build instead of sending readers to a 404.
  const live = new Map(posts.filter((p) => !p.mergedInto).map((p) => [p.slug, p]));
  for (let i = posts.length - 1; i >= 0; i--) {
    const p = posts[i];
    if (!p.mergedInto) continue;
    if (!live.has(p.mergedInto)) throw new Error(`${p.source}: merged_into "${p.mergedInto}" is not a live post's slug`);
    posts.splice(i, 1);
    if (moved) moved.push(p);
  }
  return posts.sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : b.date.localeCompare(a.date)));
}

/**
 * The shorter title a long "Claim: detail" or "Question? detail" headline
 * gives a results page when the post sets no seo_title. Mirrors `cut()` in
 * propose_seo_titles.py; undefined when there is no clean cut.
 */
export function autoSeoTitle(title) {
  for (const sep of [': ', '? ']) {
    const i = title.indexOf(sep);
    if (i < 0) continue;
    const head = title.slice(0, i + (sep === '? ' ? 1 : 0));
    if (head.length >= 25 && head.length <= TITLE_BUDGET) return head;
  }
  return undefined;
}

/** One post, validated. Throws on a malformed one. */
function loadPost(root, POSTS_DIR, name, projects = NO_PROJECTS) {
  const dir = path.join(root, POSTS_DIR);
  const fm = FILE_RE.exec(name);
  if (!fm) throw new Error(`${POSTS_DIR}/${name}: name must be <YYYY-MM-DD>-<slug>.md`);
  const src = readFileSync(path.join(dir, name), 'utf8');
  const { meta, body } = parseFrontMatter(src);
  for (const key of ['title', 'description']) {
    if (!meta[key]) throw new Error(`${POSTS_DIR}/${name}: front matter needs "${key}"`);
  }
  // The site's checker holds every description to what a search result shows.
  if (meta.description.length > 160) {
    throw new Error(`${POSTS_DIR}/${name}: description is ${meta.description.length} characters; keep it to 160`);
  }
  if (meta.seo_title && String(meta.seo_title).length > TITLE_BUDGET) {
    throw new Error(`${POSTS_DIR}/${name}: seo_title is ${String(meta.seo_title).length} characters; keep it to ${TITLE_BUDGET} (python3 platform/pages/propose_seo_titles.py lists posts needing a shorter one)`);
  }
  const date = String(meta.date || fm[1]);
  if (date !== fm[1]) throw new Error(`${POSTS_DIR}/${name}: date ${date} does not match the file name`);
  if (RESERVED_SLUGS.has(fm[2])) throw new Error(`${POSTS_DIR}/${name}: the slug "${fm[2]}" is a section of the blog; pick another`);
  if (meta.topic && !TOPIC_IDS.has(meta.topic)) {
    throw new Error(`${POSTS_DIR}/${name}: topic "${meta.topic}" is not one of ${[...TOPIC_IDS].join(', ')}`);
  }
  const tags = Array.isArray(meta.tags) ? meta.tags : [];
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    slug: fm[2],
    date,
    title: meta.title,
    seoTitle: meta.seo_title ? String(meta.seo_title) : (String(meta.title).length > TITLE_BUDGET ? autoSeoTitle(String(meta.title)) : undefined),
    // Plain for <meta>, feeds, JSON-LD and the finder; `descriptionHtml` keeps `code` for the dek and cards.
    description: plainDescription(meta.description),
    descriptionHtml: descriptionHtml(meta.description),
    tags,
    topic: topicOf(tags, meta.topic, projects),
    // The venture a "Tools and projects" post is about: its first tag naming a folder in ventures/.
    project: projectOf(tags, topicOf(tags, meta.topic, projects), projects),
    source: `${POSTS_DIR}/${name}`,
    mergedInto: meta.merged_into ? String(meta.merged_into) : undefined,
    body,
    words,
    minutes: Math.max(1, Math.round(words / 230)),
  };
}

// Memoised per date string: `toLocaleDateString` builds an Intl formatter on
// every call, and the blog index and every post's related list format the same
// few hundred dates thousands of times (about 2 s of a warm build, 2026-11-12).
const LONG_DATES = new Map();
const longDate = (iso) => {
  let s = LONG_DATES.get(iso);
  if (s === undefined) {
    s = new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    LONG_DATES.set(iso, s);
  }
  return s;
};

// Post tables on a phone (polish, 2026-11-19): 10 px of side padding per cell
// is 80 px of a 288 px box in a four-column table at 320 px, and one long word
// then pushes a column out of sight behind a sideways scroll. Measured over all
// 1,829 post tables: tables wider than their box went 190 -> 12 at 320 px,
// 31 -> 1 at 360 and 6 -> 0 at 390. Hyphenation (the page is lang="en") only
// splits words, never numbers, so the 12 left are figure tables that should
// scroll. `overflow-wrap:anywhere` reached 0 but split amounts like $2,853.20.
export const PHONE_TABLE_CSS = '@media (max-width:420px) { th, td { padding:6px; -webkit-hyphens:auto; hyphens:auto; } }';

// The blog's stylesheet, written once to the site root (`buildWriting`) and
// linked where the inline <style> used to sit, so the cascade order against
// pf-site.css is unchanged. Until 2026-11-26 every post, tag and index page
// carried it inline: 12.9 KB on each of 7,815 pages, 96 MB of the 189 MB of post
// HTML, written by every full build and every test build (perf track,
// docs/history/pages-build-perf-2026-11-26-writing-stylesheet.md).
export const WRITING_STYLE_FILE = 'pf-writing.css';
export const renderWritingStyle = () => `${STYLE.trim()}\n`;

const STYLE = `
  :root { --bg:#f7f8fa; --panel:#fff; --ink:#1b2129; --muted:#5a6676; --line:#dde3ea; --accent:#2a5bd7; --code:#eef1f5; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f141a; --panel:#161d26; --ink:#e7edf4; --muted:#a3b0bf; --line:#2a3542; --accent:#86a8ff; --code:#1d2631; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:17px/1.65 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width:720px; margin:0 auto; padding:24px 16px 72px; --pf-hero-pull:24px; }
  a { color:var(--accent); }
  .crumbs { font-size:.85rem; color:var(--muted); margin:0 0 28px; } .crumbs a { color:inherit; }
  h1 { font-size:2rem; line-height:1.2; margin:.2em 0 .3em; letter-spacing:-.01em; }
  .dek { font-size:1.1rem; color:var(--muted); margin:0 0 .8em; }
  .meta { font-size:.85rem; color:var(--muted); margin:0 0 2em; }
  .tag { display:inline-block; font-size:.75rem; border:1px solid var(--line); border-radius:999px; padding:2px 8px; margin:0 4px 4px 0; color:var(--muted); }
  article h2 { font-size:1.35rem; margin:2em 0 .4em; } article h3 { font-size:1.15rem; margin:1.8em 0 .4em; }
  article h4 { font-size:1rem; margin:1.4em 0 .3em; }
  article p, article li { overflow-wrap:break-word; }
  article li { margin:.25em 0; }
  code { font-size:.88em; background:var(--code); border-radius:4px; padding:.05em .3em; overflow-wrap:anywhere; }
  pre { background:var(--code); border-radius:8px; padding:12px 14px; overflow-x:auto; font-size:.85rem; line-height:1.5; }
  pre code { background:none; padding:0; }
  blockquote { margin:1.2em 0; padding:.2em 0 .2em 16px; border-left:3px solid var(--accent); color:var(--muted); }
  .scroll { overflow-x:auto; max-width:100%; margin:1.2em 0; }
  table { border-collapse:collapse; width:100%; font-size:.9rem; background:var(--panel); }
  th, td { text-align:left; padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-size:.8rem; color:var(--muted); font-weight:600; }
  ${PHONE_TABLE_CSS}
  hr { border:0; border-top:1px solid var(--line); margin:2.4em 0; }
  .posts { list-style:none; padding:0; margin:0; }
  .posts li { position:relative; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:18px 20px 16px 22px; margin:0 0 14px;
    transition:transform .18s, box-shadow .18s, border-color .18s; }
  .posts li::before { content:""; position:absolute; left:-1px; top:16px; bottom:16px; width:3px; border-radius:0 3px 3px 0;
    background:linear-gradient(180deg,#1f4e8c,#3a6ea5); }
  .posts li:hover { transform:translateY(-2px); border-color:var(--accent); box-shadow:0 10px 28px rgba(20,30,60,.10); }
  .posts h2 { font-size:1.2rem; margin:0 0 .3em; line-height:1.3; } .posts h2 a { color:inherit; text-decoration:none; }
  .posts h2 a::after { content:""; position:absolute; inset:0; border-radius:14px; }
  .posts h2 a:hover, .posts h2 a:focus-visible { color:var(--accent); }
  .pager { margin:1.4rem 0; color:var(--muted); font-size:.95rem; } .pager .nums { display:flex; flex-wrap:wrap; gap:4px 6px; } .pager .nums > * { min-width:24px; min-height:24px; display:inline-flex; align-items:center; justify-content:center; } .pager [aria-current] { font-weight:700; color:var(--text, inherit); } .pager .gap { color:var(--muted); } .pager > p { margin:.25rem 0; } .pager details.all { flex-basis:100%; margin-top:.25rem; } .pager details.all summary { cursor:pointer; padding:4px 0; width:max-content; } .pager details.all .nums { margin:.5rem 0 0; } .pager details.all .here { font-weight:700; color:var(--text, inherit); }
  .posts p { margin:.3em 0; color:var(--muted); font-size:.95rem; }
  .posts .meta { display:flex; flex-wrap:wrap; align-items:center; gap:4px 10px; margin:.7em 0 0; font-size:.85rem; }
  .posts .when { white-space:nowrap; }
  .pf-hero .crumbs { margin:0 0 18px; } .pf-hero .meta { margin:0; } .pf-hero .tag { color:var(--muted); border-color:var(--line); }
  .pf-hero h1 { font-size:clamp(1.9rem,4.4vw,2.6rem); }
  .more { margin-top:3em; padding-top:1.4em; border-top:1px solid var(--line); font-size:.95rem; }
  .more h2 { font-size:1.15rem; margin:0 0 .7em; }
  .related { list-style:none; padding:0; margin:0; display:grid; gap:10px; }
  .related li { position:relative; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px 16px; line-height:1.4; transition:border-color .18s, box-shadow .18s; }
  .related li:hover { border-color:var(--accent); box-shadow:0 6px 18px rgba(20,30,60,.08); }
  .related a { color:var(--ink); font-weight:600; text-decoration:none; }
  .related a::after { content:""; position:absolute; inset:0; border-radius:12px; }
  .related a:hover, .related a:focus-visible { color:var(--accent); }
  .related a:focus-visible { outline:none; } .related li:focus-within { outline:2px solid var(--accent); outline-offset:2px; }
  .related .when { display:block; margin-top:4px; font-size:.8rem; color:var(--muted); }
  .pager.steps { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap:10px; margin:1.6em 0 0; font-size:.9rem; }
  .pager.steps a { display:block; padding:12px 16px; border:1px solid var(--line); border-radius:12px; color:var(--ink); text-decoration:none; line-height:1.4; }
  .pager.steps a:hover, .pager.steps a:focus-visible { border-color:var(--accent); color:var(--accent); }
  @media (min-width:600px) { .pager.steps a.next { text-align:right; } }
  .pager.steps .dir { display:block; font-size:.75rem; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); margin-bottom:3px; }
  .more .all { margin:1.4em 0 0; font-size:.9rem; }
  @media (prefers-reduced-motion: reduce) { .related li { transition:none; } }
  .episode { margin:0 0 2em; padding:12px 14px; background:var(--panel); border:1px solid var(--line); border-radius:12px; }
  .episode figcaption { font-size:.85rem; color:var(--muted); margin:0 0 8px; }
  audio { width:100%; display:block; margin:.4em 0; }
  details summary { cursor:pointer; color:var(--accent); font-size:.9rem; margin:.4em 0; }
  footer { margin-top:3em; font-size:.8rem; color:var(--muted); }
  [hidden] { display:none !important; }
  .finder { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:14px 16px; margin:0 0 18px; }
  .finder input[type=search] { width:100%; font:inherit; font-size:1rem; height:42px; padding:0 12px; border:1px solid var(--line); border-radius:10px; background:var(--bg); color:var(--ink); }
  /* One control row: Tag and Sort share the search box's height, radius and border, labels above their menus; Clear sits on the count line. */
  .finder .row { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:8px 10px; margin:12px 0 0; font-size:.75rem; font-weight:600; letter-spacing:.03em; color:var(--muted); }
  @media (min-width:640px) { .finder .row { grid-template-columns:minmax(0,16rem) minmax(0,12rem); } }
  .finder .row label { display:flex; flex-direction:column; gap:4px; min-width:0; }
  .finder select { font:inherit; font-size:.875rem; font-weight:400; letter-spacing:normal; height:42px; padding:0 8px; border:1px solid var(--line); border-radius:10px; background:var(--bg); color:var(--ink); width:100%; min-width:0; }
  .finder input[type=search], .finder select { box-sizing:border-box; }
  .finder input[type=search]:focus-visible, .finder select:focus-visible, .finder button:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0 0; }
  .chips button { font:inherit; font-size:.8rem; padding:3px 11px; border-radius:999px; border:1px solid var(--line); background:var(--bg); color:var(--muted); cursor:pointer; }
  .chips button[aria-pressed=true] { background:var(--accent); border-color:var(--accent); color:var(--bg); }
  .chips button span { margin-left:4px; font-variant-numeric:tabular-nums; }
  /* On a phone the topics are one swipeable row, not six wrapped rows above the first post: it bleeds to the panel's edges, and a fade marks whichever end has more chips (data-fade, set by the script). */
  @media (max-width:639px) {
    .chips { flex-wrap:nowrap; overflow-x:auto; overscroll-behavior-x:contain; margin:8px -16px 0; padding:4px 16px; scroll-padding-inline:16px; scrollbar-width:thin; }
    /* Every chip, not only the blog finder's buttons: the podcast index's topic links share this row, and without flex:none they shrank to wrapped 105 px pills. */
    .chips > * { flex:none; white-space:nowrap; min-height:32px; }
    .chips > a { display:inline-flex; align-items:center; margin:0; }
    .chips[data-fade=end] { -webkit-mask-image:linear-gradient(to right,#000 calc(100% - 40px),transparent); mask-image:linear-gradient(to right,#000 calc(100% - 40px),transparent); }
    .chips[data-fade=start] { -webkit-mask-image:linear-gradient(to left,#000 calc(100% - 40px),transparent); mask-image:linear-gradient(to left,#000 calc(100% - 40px),transparent); }
    .chips[data-fade=both] { -webkit-mask-image:linear-gradient(to right,transparent,#000 40px,#000 calc(100% - 40px),transparent); mask-image:linear-gradient(to right,transparent,#000 40px,#000 calc(100% - 40px),transparent); }
  }
  @media (max-width:639px) and (pointer:coarse) { .chips { scrollbar-width:none; } .chips::-webkit-scrollbar { display:none; } }
  .finder .foot { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:10px 0 0; }
  .finder #clear { font:inherit; font-size:.8rem; min-height:32px; padding:0 12px; border-radius:999px; border:1px solid var(--line); background:var(--bg); color:var(--muted); cursor:pointer; flex:none; }
  .posts h3 { font-size:1.12rem; margin:0 0 .3em; line-height:1.3; } .posts h3 a { color:inherit; text-decoration:none; } .posts h3 a:hover { color:var(--accent); }
  section[id^="topic-"] { scroll-margin-top:16px; }
  #count { margin:0; font-size:.85rem; color:var(--muted); }
  .topic { display:inline-block; font-size:.78rem; font-weight:600; padding:2px 9px; border-radius:999px; border:1px solid var(--accent); color:var(--accent); }
  .meta a.tag, .meta a.topic { text-decoration:none; }
  /* A post's byline: the topic pill with date and reading time (kept whole), then a row of tags with Source at its right end, so no separator dot is ever left at the start of a wrapped line. */
  .post-meta { display:flex; flex-wrap:wrap; align-items:center; gap:8px .65em; line-height:1.5; }
  .post-meta .when, .post-meta .src { white-space:nowrap; }
  .post-meta .tail { flex-basis:100%; display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; }
  .post-meta .tags { display:flex; flex-wrap:wrap; gap:6px; }
  .post-meta .tag { margin:0; }
  .post-meta .src { margin-left:auto; }
  .pager { display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; margin:2em 0 0; font-size:.92rem; }
  /* Every topic's page, as links (the finder's chips are script-only buttons). Wraps: it sits below the list, not above it. */
  .topic-nav { margin:2.2em 0 0; padding-top:1.2em; border-top:1px solid var(--line); }
  .topic-nav h2 { font-size:1rem; margin:0 0 .6em; }
  .topic-nav ul { list-style:none; display:flex; flex-wrap:wrap; gap:8px; margin:0; padding:0; }
  .topic-nav a, .topic-nav [aria-current] { display:inline-flex; align-items:center; min-height:32px; padding:0 12px; border-radius:999px; border:1px solid var(--line); background:var(--panel); color:var(--ink); font-size:.85rem; text-decoration:none; }
  .topic-nav a:hover, .topic-nav a:focus-visible { border-color:var(--accent); color:var(--accent); }
  .topic-nav [aria-current] { background:var(--accent); border-color:var(--accent); color:var(--bg); font-weight:600; }
  .topic-nav .n { margin-left:6px; font-weight:400; font-variant-numeric:tabular-nums; } .topic-nav a .n { color:var(--muted); }
  /* "By project" above a topic's list: a divider below it instead of above. */
  .topic-nav.lead { margin:0 0 1.6em; padding:0 0 1.2em; border-top:0; border-bottom:1px solid var(--line); }
  .topic-nav.lead .meta { margin:.8em 0 0; }
  /* On a phone the 17 projects wrapped to nine rows (545 px) above the first post: one sideways row
     instead, bleeding into the gutter, faded at the right edge. The end padding lets the last chip
     clear the fade once scrolled, so no script is needed to flip it. */
  @media (max-width:639px) {
    .topic-nav.lead ul { flex-wrap:nowrap; overflow-x:auto; margin:0 -16px; padding:4px 40px 4px 16px; scrollbar-width:thin;
      -webkit-mask-image:linear-gradient(to right, #000 calc(100% - 32px), transparent); mask-image:linear-gradient(to right, #000 calc(100% - 32px), transparent); }
    .topic-nav.lead li { flex:none; }
  }
  .vh { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
`;

export { TITLE_BUDGET };

/**
 * A post's `<title>`: the headline plus the site name when both fit, else the
 * headline alone, so the words that make a searcher click are never the ones cut.
 * Most headlines here are long enough that the suffix would push them over.
 * A post can pass its optional `seo_title:` front-matter value instead of the
 * headline, a shorter query-shaped title for the results page; the `h1` and
 * the structured data keep the full headline.
 */
export function postPageTitle(headline) {
  const full = `${headline} · ${SITE_NAME}`;
  return full.length <= TITLE_BUDGET ? full : headline;
}

// A description may quote code (`curl | bash`). Before 2026-11-14 it went through esc() only, so the
// dek, the blog cards and every search snippet showed the backticks; six posts did. Code spans only:
// a description is one plain sentence, so emphasis and links are not read.
const DESC_CODE = /(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)/g;
const trimTicks = (c) => (c.length > 2 && c.startsWith(' ') && c.endsWith(' ') && c.trim() ? c.slice(1, -1) : c);
export const plainDescription = (d) => String(d ?? '').replace(DESC_CODE, (_, _t, c) => trimTicks(c));
export function descriptionHtml(d) {
  const src = String(d ?? '');
  let out = '';
  let last = 0;
  for (const m of src.matchAll(DESC_CODE)) {
    out += esc(src.slice(last, m.index)) + `<code>${esc(trimTicks(m[2]))}</code>`;
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}

function shell({ title, description, canonical, toRoot, crumbs, hero = '', body, jsonLd, breadcrumb, feedHref, socialCard, podcastFeedHref, current = 'writing', robots = '' }) {
  // The site's shared header (site-nav.mjs) above this section's own breadcrumb.
  return withSiteHeader(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${robots ? `<meta name="robots" content="${esc(robots)}">\n` : ''}${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ''}<link rel="alternate" type="application/atom+xml" title="${esc(SITE_NAME)}: writing" href="${esc(feedHref)}">
${podcastFeedHref ? `<link rel="alternate" type="application/rss+xml" title="${esc(SHOW_TITLE)}" href="${esc(podcastFeedHref)}">\n` : ''}<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="${jsonLd['@type'] === 'BlogPosting' ? 'article' : 'website'}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">\n` : ''}${socialCard ? `<meta property="og:image" content="${esc(socialCard)}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n` : ''}<meta name="twitter:card" content="${socialCard ? 'summary_large_image' : 'summary'}">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
${breadcrumb ? `<script type="application/ld+json">${JSON.stringify(breadcrumb).replace(/</g, '\\u003c')}</script>\n` : ''}<link rel="stylesheet" href="${esc(`${toRoot}${WRITING_STYLE_FILE}`)}">
</head>
<body>
<div class="wrap">
<header class="pf-hero">
<nav class="crumbs" aria-label="Breadcrumb"><a href="${toRoot}" data-pf-to="hub">Home</a> › ${crumbs}</nav>
${hero}
</header>
<main>
${body}
</main>
<footer>
  <p>Written with AI assistance and checked against the repository; every figure links to, or names, its source in the
  <a href="https://github.com/Duncan-Haywood/oss-monorepo">repository</a>. Provided as-is, with no warranty of accuracy or
  completeness, and not advice of any kind. FSL-1.1-MIT-licensed, like the tools.</p>
  <p>${sponsorsNote()}</p>
</footer>
</div>
</body>
</html>
`, { toRoot, current });
}

/** The two blogs: one for people (and agents), one written by agents for agents. */
export const BLOG = Object.freeze({
  id: 'blog',
  path: WRITING_PATH,
  dir: POSTS_DIR,
  depth: 1,
  name: 'Blog',
  feedTitle: `${SITE_NAME}: writing`,
  description: "Essays on building software with unattended AI coding agents, from this repository's own history and numbers.",
});
export const AGENT_BLOG = Object.freeze({
  id: 'agents',
  path: AGENTS_PATH,
  dir: AGENT_POSTS_DIR,
  depth: 2,
  name: 'Agent to agent',
  feedTitle: `${SITE_NAME}: agent to agent`,
  description: 'Posts written by AI agents for AI agents: dense, sourced notes an LLM reader can act on. Each post is also served as raw Markdown.',
});

// The index's search and filters. The full list renders without JavaScript;
// this hides what does not match, reorders on sort, keeps the state in the URL
// (?q=&topic=&tag=&sort=) so a filtered view can be linked, and fetches the
// full-text index (search.json) only once someone types.
const FINDER_SCRIPT = `(() => {
  const list = document.getElementById('posts');
  if (!list) return;
  // A long list is paged: the HTML holds the newest cards and data-all names posts.json,
  // fetched only when someone filters, sorts or searches, so the filters cover every post.
  const allUrl = list.dataset && list.dataset.all;
  const total = list.dataset && list.dataset.total ? Number(list.dataset.total) : 0;
  const pageItems = Array.from(list.children);
  let items = pageItems;
  let allItems = null, allLoading = null;
  const pager = document.getElementById('pager');
  const q = document.getElementById('q'), tag = document.getElementById('tag'), sort = document.getElementById('sort');
  const chips = Array.from(document.querySelectorAll('[data-topic-chip]'));
  const count = document.getElementById('count'), none = document.getElementById('none');
  const params = new URLSearchParams(location.search);
  let topic = chips.some((c) => c.dataset.topicChip === params.get('topic')) ? params.get('topic') : '';
  let full = null, loading = null;
  const bodyMatcher = ${bodyMatcher.toString()};
  const cardTextOf = ${cardTextOf.toString()};
  const labels = ${JSON.stringify(Object.fromEntries(TOPICS.map((t) => [t.id, t.label])))};
  q.value = params.get('q') || '';
  tag.value = params.get('tag') || '';
  if (tag.selectedIndex < 0) tag.value = '';
  sort.value = ['new', 'old', 'short', 'long'].indexOf(params.get('sort')) >= 0 ? params.get('sort') : 'new';
  const order = {
    new: (a, b) => b.dataset.date.localeCompare(a.dataset.date),
    old: (a, b) => a.dataset.date.localeCompare(b.dataset.date),
    short: (a, b) => a.dataset.mins - b.dataset.mins,
    long: (a, b) => b.dataset.mins - a.dataset.mins,
  };
  function loadFull() {
    if (!loading) loading = fetch('search.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((j) => { full = bodyMatcher(j); apply(); });
  }
  function card(r) {
    const li = document.createElement('li');
    // Rows are [slug, title, description, date, minutes, topic, tags]; a nine-column row from an
    // older build also holds the topic label at 6, the tags at 7 and the card text at 8.
    const old = r.length > 7, tags = old ? r[7] : r[6];
    const label = old ? r[6] : (Object.prototype.hasOwnProperty.call(labels, r[5]) ? labels[r[5]] : r[5]);
    li.dataset.slug = r[0]; li.dataset.date = r[3]; li.dataset.mins = String(r[4]); li.dataset.topic = r[5];
    li.dataset.tags = tags; li.dataset.text = old ? r[8] : cardTextOf(r[1], r[2], tags, label);
    const h = document.createElement('h2'), a = document.createElement('a');
    a.href = r[0] + '/'; a.textContent = r[1]; h.appendChild(a);
    const d = document.createElement('p'); d.textContent = r[2];
    const m = document.createElement('p'); m.className = 'meta';
    // The same markup as a server-rendered card (renderIndex), so a search result looks like the list it came from.
    const tp = document.createElement('span'); tp.className = 'topic'; tp.textContent = label;
    const w = document.createElement('span'); w.className = 'when';
    const t = document.createElement('time'); t.dateTime = r[3];
    t.textContent = new Date(r[3] + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    w.appendChild(t); w.appendChild(document.createTextNode(' · ' + r[4] + ' min read'));
    m.appendChild(tp); m.appendChild(document.createTextNode(' ')); m.appendChild(w);
    li.appendChild(h); li.appendChild(d); li.appendChild(m);
    return li;
  }
  function loadAll() {
    if (!allLoading) allLoading = fetch(allUrl).then((r) => (r.ok ? r.json() : [])).catch(() => []).then((rows) => { allItems = rows.map(card); apply(); });
  }
  function apply() {
    const filtering = Boolean(q.value.trim() || topic || tag.value || sort.value !== 'new');
    if (allUrl) {
      if (filtering && !allItems) loadAll();
      const want = filtering && allItems ? allItems : pageItems;
      if (want !== items) { items = want; list.replaceChildren(...items); }
      if (pager) pager.hidden = filtering;
    }
    const terms = q.value.toLowerCase().split(/\\s+/).filter(Boolean);
    if (terms.length && !full) loadFull();
    let shown = 0;
    for (const li of items) {
      // A term has no spaces, so it matches the card text or the body, never across the two.
      const ok = (!topic || li.dataset.topic === topic)
        && (!tag.value || li.dataset.tags.split(' ').indexOf(tag.value) >= 0)
        && terms.every((t) => li.dataset.text.indexOf(t) >= 0 || Boolean(full && full(t).has(li.dataset.slug)));
      li.hidden = !ok;
      if (ok) shown++;
    }
    items.slice().sort(order[sort.value]).forEach((li) => list.appendChild(li));
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.topicChip === topic)));
    const of = allUrl && !filtering ? total : allUrl && !allItems ? total : items.length;
    const num = (n) => Number(n).toLocaleString('en-US');
    count.textContent = !filtering ? num(of) + ' posts' : (allUrl && !allItems ? 'Searching ' + num(of) + ' posts...' : num(shown) + ' of ' + num(of) + ' posts');
    none.hidden = shown > 0 || Boolean(allUrl && filtering && !allItems);
    const p = new URLSearchParams();
    if (q.value.trim()) p.set('q', q.value.trim());
    if (topic) p.set('topic', topic);
    if (tag.value) p.set('tag', tag.value);
    if (sort.value !== 'new') p.set('sort', sort.value);
    const qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }
  q.addEventListener('input', apply);
  tag.addEventListener('change', apply);
  sort.addEventListener('change', apply);
  chips.forEach((c) => c.addEventListener('click', () => { topic = c.dataset.topicChip; apply(); }));
  // The phone layout scrolls the chip row sideways: fade the end that has more, and bring a topic
  // chosen from the URL into view without moving the page.
  const row = chips.length ? chips[0].parentElement : null;
  function fade() {
    const more = row.scrollWidth - row.clientWidth;
    const atStart = row.scrollLeft <= 1, atEnd = row.scrollLeft >= more - 1;
    if (more <= 1) row.removeAttribute('data-fade');
    else row.dataset.fade = atStart ? 'end' : atEnd ? 'start' : 'both';
  }
  if (row) {
    row.addEventListener('scroll', fade, { passive: true });
    addEventListener('resize', fade);
  }
  document.getElementById('clear').addEventListener('click', () => { q.value = ''; tag.value = ''; topic = ''; sort.value = 'new'; apply(); q.focus(); });
  document.getElementById('finder').hidden = false;
  apply();
  if (row) {
    const on = chips.find((c) => c.dataset.topicChip === topic);
    if (topic && on && row.scrollWidth > row.clientWidth) row.scrollLeft = on.offsetLeft - row.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
    fade();
  }
})();`;

/** Search box, topic chips, tag and sort menus. Hidden until the script runs, so a reader without JavaScript sees the plain list. */
function renderFinder(posts) {
  const topicCounts = new Map();
  const tagCounts = new Map();
  for (const p of posts) {
    topicCounts.set(p.topic, (topicCounts.get(p.topic) || 0) + 1);
    for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }
  const chips = [`<button type="button" data-topic-chip="" aria-pressed="true">All<span>${formatCount(posts.length)}</span></button>`]
    .concat(TOPICS.filter((t) => topicCounts.get(t.id)).map((t) => `<button type="button" data-topic-chip="${esc(t.id)}" aria-pressed="false" title="${esc(t.blurb)}">${esc(t.label)}<span>${formatCount(topicCounts.get(t.id))}</span></button>`))
    .join('');
  const tags = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return `<form id="finder" class="finder" role="search" hidden onsubmit="return false">
<label class="vh" for="q">Search posts</label>
<input id="q" type="search" placeholder="Search titles, summaries and full text" autocomplete="off">
<div class="chips" role="group" aria-label="Filter by topic">${chips}</div>
<div class="row">
<label>Tag <select id="tag"><option value="">Any tag</option>${tags.map(([t, n]) => `<option value="${esc(t)}">${esc(t)} (${n})</option>`).join('')}</select></label>
<label>Sort <select id="sort"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="short">Shortest read</option><option value="long">Longest read</option></select></label>
</div>
<div class="foot"><p id="count" aria-live="polite">${formatCount(posts.length)} posts</p><button type="button" id="clear">Clear filters</button></div>
</form>`;
}

/** The text the index's search reads before the full text arrives. */
/**
 * The text a card's own words match against: title, description, tags and topic label, lower case
 * with single spaces. The finder script embeds this same function (`cardTextOf.toString()`) to
 * rebuild it from a posts.json row, so the file need not carry it.
 */
export function cardTextOf(title, description, tags, label) {
  return [title, description, tags, label].join(' ').toLowerCase().replace(/\s+/g, ' ');
}
const cardText = (p) => cardTextOf(p.title, p.description, p.tags.join(' '), topicLabel(p.topic));

/** A post's body as lower-case plain words separated by single spaces: the text the full-text search reads. */
export const searchText = (md) =>
  md
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/[#*_`>|[\]]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * `search.json`: an inverted index of every post's body, for full-text search on the index.
 *
 * `{ slugs, words, posts }`: `words` is each distinct word once, space-separated; `posts[i]` lists
 * the posts (indexes into `slugs`) that hold word i, as base-36 gaps (an empty gap means the next
 * post), comma-separated. The search only asks whether a typed term (no spaces) is a substring of
 * a post's text, and such a term can only match inside one word, so "some word of this post contains
 * the term" gives the same answer as searching the whole body. Until 2026-11-25 this file held each
 * body in full: 18.3 MB (6.7 MB gzip) at 7,749 posts, all fetched on the first keystroke; the index
 * is a third of that (docs/history/pages-build-perf-2026-11-25-writing-search-index.md).
 */
export function renderSearchIndex(posts) {
  const holders = new Map();
  posts.forEach((p, i) => {
    for (const w of new Set(searchText(p.body).split(' '))) {
      if (!w) continue;
      const list = holders.get(w);
      if (list) list.push(i);
      else holders.set(w, [i]);
    }
  });
  const words = [...holders.keys()];
  const gaps = (list) => {
    let prev = -1;
    return list.map((i) => { const d = i - prev - 1; prev = i; return d ? d.toString(36) : ''; }).join(',');
  };
  return JSON.stringify({ slugs: posts.map((p) => p.slug), words: words.join(' '), posts: words.map((w) => gaps(holders.get(w))) });
}

/**
 * Reads `search.json` in the browser (inlined into the index's script) and in tests: returns
 * `has(term)`, the Set of slugs whose body contains `term`. Each distinct word is scanned once per
 * term and the answer memoised, so a keystroke no longer walks every post's full text. A file in the
 * older shape (slug to full text, still in a cache during a deploy) is read too.
 */
export function bodyMatcher(index) {
  const memo = new Map();
  if (!index || !Array.isArray(index.slugs)) {
    const texts = Object.entries(index || {});
    return (t) => {
      let hit = memo.get(t);
      if (!hit) {
        hit = new Set();
        for (const [slug, text] of texts) if (String(text).indexOf(t) >= 0) hit.add(slug);
        memo.set(t, hit);
      }
      return hit;
    };
  }
  const slugs = index.slugs, posts = index.posts || [];
  const words = String(index.words || '').split(' ');
  return (t) => {
    let hit = memo.get(t);
    if (!hit) {
      hit = new Set();
      for (let i = 0; i < words.length; i++) {
        if (words[i].indexOf(t) < 0) continue;
        let p = -1;
        for (const d of String(posts[i] || '').split(',')) {
          p += (d ? parseInt(d, 36) : 0) + 1;
          if (p < slugs.length) hit.add(slugs[p]);
        }
      }
      if (memo.size > 500) memo.clear();
      memo.set(t, hit);
    }
    return hit;
  };
}

/**
 * The rows `posts.json` holds for the finder: slug, title, description, date, minutes, topic id, tags.
 * Until 2026-11-25 each row also carried the topic label and the card's search text, both pure
 * functions of the rest (`TOPIC_LABELS`, `cardTextOf`): 4.7 MB raw. The finder still reads that
 * nine-column shape, for a cache that serves the old file during a deploy.
 */
export function renderPostRows(posts) {
  return JSON.stringify(posts.map((p) => [p.slug, p.title, p.description, p.date, p.minutes, p.topic, p.tags.join(' ')]));
}

const pageCount = (posts) => Math.max(1, Math.ceil(posts.length / PAGE_SIZE));

/** Pages a windowed pager shows: the first, the last and `PAGER_SPAN` either side of the current one; a run of one hidden page shows that page instead of a gap. */
export const PAGER_SPAN = 2;
export function pagerWindow(n, count, span = PAGER_SPAN) {
  const keep = new Set([1, count]);
  for (let i = n - span; i <= n + span; i++) if (i >= 1 && i <= count) keep.add(i);
  const pages = [...keep].sort((a, b) => a - b);
  const out = [];
  for (const i of pages) {
    const last = out.length ? out[out.length - 1] : 0;
    if (last && i - last === 2) out.push(last + 1);
    else if (last && i - last > 2) out.push(null);
    out.push(i);
  }
  return out;
}

/**
 * The newer/older links, a short windowed row of page numbers, and (when the window hides some)
 * every page number in a closed `<details>`, so any post stays at most two clicks from the index
 * without a 98-link wall of numbers.
 */
export function renderPager(n, count, prefix) {
  if (count <= 1) return '';
  const href = (i) => (i === 1 ? `${prefix}` || './' : `${prefix}page/${i}/`);
  const num = (i) => (i === n ? `<span aria-current="page">${i}</span>` : `<a href="${href(i)}">${i}</a>`);
  const win = pagerWindow(n, count);
  const windowed = win.map((i) => (i === null ? '<span class="gap" aria-hidden="true">…</span>' : num(i))).join(' ');
  const all = win.includes(null)
    ? `<details class="all"><summary>All ${count} pages</summary><p class="nums">${Array.from({ length: count }, (_, k) => (k + 1 === n ? `<span class="here">${k + 1}</span>` : `<a href="${href(k + 1)}">${k + 1}</a>`)).join(' ')}</p></details>`
    : '';
  return `<nav class="pager" id="pager" aria-label="Pages of posts"><p>Page ${n} of ${count}: ${n > 1 ? `<a rel="prev" href="${href(n - 1)}">newer</a>` : 'newer'} · ${n < count ? `<a rel="next" href="${href(n + 1)}">older</a>` : 'older'}</p><p class="nums">${windowed}</p>${all}</nav>`;
}

/** The post cards an index lists; `up` climbs from the page to the blog's folder. A topic's own page leaves out the topic pill every card would repeat. */
function renderCards(posts, up = '', { topicPill = true } = {}) {
  return posts
    .map(
      (p) => `<li data-slug="${esc(p.slug)}" data-topic="${esc(p.topic)}" data-tags="${esc(p.tags.join(' '))}" data-date="${p.date}" data-mins="${p.minutes}" data-text="${esc(cardText(p))}">
  <h2><a href="${up}${esc(p.slug)}/">${esc(p.title)}</a></h2>
  <p>${p.descriptionHtml ?? esc(p.description)}</p>
  <p class="meta">${topicPill ? `<span class="topic">${esc(topicLabel(p.topic))}</span> ` : ''}<span class="when"><time datetime="${p.date}">${longDate(p.date)}</time> · ${p.minutes} min read</span></p>
</li>`,
    )
    .join('\n');
}

/**
 * Links to every topic's page, with its post count: a list a crawler and a reader without
 * JavaScript can follow, since the finder's chips are buttons in a form hidden until its
 * script runs. `toTopics` climbs from the page to `writing/topic/`.
 */
export function renderTopicNav(posts, { toTopics = 'topic/', current = '', heading = 'Browse by topic' } = {}) {
  const counts = new Map();
  for (const p of posts) counts.set(p.topic, (counts.get(p.topic) || 0) + 1);
  const links = TOPICS.filter((t) => counts.get(t.id)).map((t) =>
    t.id === current
      ? `<li><span aria-current="page">${esc(t.label)} <span class="n">${formatCount(counts.get(t.id))}</span></span></li>`
      : `<li><a href="${toTopics}${esc(t.id)}/">${esc(t.label)} <span class="n">${formatCount(counts.get(t.id))}</span></a></li>`,
  );
  if (!links.length) return '';
  return `<nav class="topic-nav" aria-labelledby="topic-nav-h"><h2 id="topic-nav-h">${esc(heading)}</h2><ul>${links.join('')}</ul></nav>`;
}

/**
 * One topic's page: `writing/topic/<id>/`, the topic's newest PAGE_SIZE posts, and
 * `writing/topic/<id>/page/<n>/` (noindex, like the blog's own numbered pages) for the rest.
 * It gives each topic a URL with its own title and description for search results; the
 * blog's `?topic=` filter is a query string its script reads, which a crawler never sees.
 */
export function renderTopicPage(allPosts, topicId, { baseUrl = '', socialCard = '', page = 1, projects = [] } = {}) {
  const topic = TOPICS.find((t) => t.id === topicId);
  if (!topic) throw new Error(`renderTopicPage: no topic "${topicId}"`);
  const mine = allPosts.filter((p) => p.topic === topicId);
  const count = pageCount(mine);
  const sub = page > 1;
  const here = `${TOPIC_PATH}${topicId}/`;
  const canonical = baseUrl ? `${baseUrl}${here}${sub ? `page/${page}/` : ''}` : '';
  const toBlog = sub ? '../../../../' : '../../';
  const toRoot = `${toBlog}../`;
  const posts = mine.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const n = formatCount(mine.length);
  const title = sub ? `${topic.label}, page ${page} · ${SITE_NAME}` : postPageTitle(topic.seo);
  const first = (page - 1) * PAGE_SIZE + 1;
  return shell({
    title,
    // The count only when it fits a search snippet (160 characters).
    description: [`${topic.blurb} ${n} ${mine.length === 1 ? 'post' : 'posts'}, newest first.`, topic.blurb].find((d) => d.length <= 160) ?? topic.blurb,
    canonical,
    socialCard,
    toRoot,
    robots: sub ? 'noindex' : '',
    crumbs: `<a href="${toBlog}">Blog</a> › ${sub ? `<a href="../../">${esc(topic.label)}</a> › Page ${page}` : esc(topic.label)}`,
    feedHref: `${toBlog}feed.xml`,
    breadcrumb: baseUrl
      ? {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { name: SITE_NAME, item: baseUrl },
            { name: BLOG.name, item: `${baseUrl}${WRITING_PATH}` },
            { name: topic.label, item: `${baseUrl}${here}` },
          ].map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, ...crumb })),
        }
      : undefined,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: topic.seo,
      description: topic.blurb,
      url: canonical || undefined,
      isPartOf: { '@type': 'Blog', name: BLOG.feedTitle, url: baseUrl ? `${baseUrl}${WRITING_PATH}` : undefined },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: mine.length,
        itemListElement: posts.map((p, i) => ({ '@type': 'ListItem', position: first + i, name: p.title, url: baseUrl ? `${baseUrl}${WRITING_PATH}${p.slug}/` : undefined })),
      },
    },
    hero: `<p class="eyebrow">Blog topic</p>
<h1>${esc(topic.label)}${sub ? `, page ${page}` : ''}</h1>
<p class="dek">${esc(topic.blurb)}</p>
<p class="meta">${sub ? `Posts ${first} to ${first + posts.length - 1} of ${n}, newest first.` : `${n} ${mine.length === 1 ? 'post' : 'posts'}, newest first.`} <a href="${toBlog}?topic=${esc(topicId)}">Search within this topic</a> · <a href="${toBlog}">every post</a></p>`,
    body: `${sub ? '' : renderProjectNav(projects, mine.length, { heading: topicId === 'research' ? 'By programme' : 'By project' })}<ul class="posts" id="posts">
${renderCards(posts, toBlog, { topicPill: false })}
</ul>
${renderPager(page, count, sub ? '../../' : '')}
${renderTopicNav(allPosts, { toTopics: `${toBlog}topic/`, current: topicId, heading: 'Other topics' })}`,
  });
}

/** `text` within TITLE_BUDGET: whole, else up to its first "?" when that fits, else cut at a word with "…". */
export function clipTitle(text) {
  if (text.length <= TITLE_BUDGET) return text;
  const q = text.indexOf('?');
  if (q > 0 && q < TITLE_BUDGET) return text.slice(0, q + 1);
  const cut = text.slice(0, TITLE_BUDGET - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : cut.length).replace(/[,:;]$/, '')}…`;
}

/**
 * The "By project" links at the top of a topic's first page: each project with its own page
 * (`projectGroups`), with its post count. `toProjects` climbs from the page to the topic's folder.
 */
export function renderProjectNav(projects, total, { toProjects = '', current = '', heading = 'By project' } = {}) {
  if (!projects.length) return '';
  const grouped = projects.reduce((n, g) => n + g.count, 0);
  const links = projects.map((g) =>
    g.slug === current
      ? `<li><span aria-current="page">${esc(g.name)} <span class="n">${formatCount(g.count)}</span></span></li>`
      : `<li><a href="${toProjects}${esc(g.slug)}/"${g.question ? ` title="${esc(g.question)}"` : ''}>${esc(g.name)} <span class="n">${formatCount(g.count)}</span></a></li>`,
  );
  const kind = projects[0].topic === 'research' ? 'programmes' : 'projects';
  const note = current ? '' : `<p class="meta">${formatCount(grouped)} of ${formatCount(total)} posts are about these ${projects.length} ${kind}; all ${formatCount(total)} are listed below, newest first.</p>`;
  return `<nav class="topic-nav project-nav${current ? '' : ' lead'}" aria-labelledby="project-nav-h"><h2 id="project-nav-h">${esc(heading)}</h2><ul>${links.join('')}</ul>${note}</nav>\n`;
}

/**
 * One project's posts: `writing/topic/tools/<slug>/` (newest PAGE_SIZE) and `…/page/<n>/`
 * (noindex). A build log a reader of one tool can follow, and a page a search for
 * "<tool> blog" or "how <tool> was built" can land on. `toolHref` (from the site root) links
 * the tool itself when the site serves it.
 */
export function renderProjectPage(allPosts, project, { baseUrl = '', socialCard = '', page = 1, projects = [], toolHref = '' } = {}) {
  const topicId = project.topic || 'tools';
  const research = topicId === 'research';
  const topic = TOPICS.find((t) => t.id === topicId);
  const mine = allPosts.filter((p) => p.topic === topicId && p.project === project.slug);
  const count = pageCount(mine);
  const sub = page > 1;
  const topicHere = `${TOPIC_PATH}${topicId}/`;
  const here = `${topicHere}${project.slug}/`;
  const canonical = baseUrl ? `${baseUrl}${here}${sub ? `page/${page}/` : ''}` : '';
  const toBlog = sub ? '../../../../../' : '../../../';
  const toTopic = sub ? '../../../' : '../';
  const toRoot = `${toBlog}../`;
  const posts = mine.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const n = formatCount(mine.length);
  // A research programme's page leads with the question it asks (its registry card title):
  // the words a search for the finding uses, where the slug is only a folder name.
  const question = research ? project.question || '' : '';
  const seo = research ? `${project.name} findings${question ? `: ${question}` : ', post by post'}` : `${project.name}: how it was built, post by post`;
  // Some questions run to 235 characters: the title tag keeps the first sentence, or clips at a word, to TITLE_BUDGET.
  const title = sub ? `${project.name} posts, page ${page} · ${SITE_NAME}` : postPageTitle(clipTitle(seo));
  const first = (page - 1) * PAGE_SIZE + 1;
  const blurb = research
    ? `Every blog post from the ${project.name} research programme: each finding, with its numbers, caveats and negative results.`
    : `Every blog post about ${project.name}: what was built, what was measured and what changed.`;
  // A programme's dek says what it asks or found (its registry summary's opening sentences);
  // the generic line is the fallback. The meta row below still says what the list is.
  // A tool's dek is its llms.txt summary (`ventureLede`), since 2026-11-16.
  const lede = !sub ? project.lede || '' : '';
  const openLabel = research ? `Read the ${project.name} programme` : `Open ${project.name}`;
  return shell({
    title,
    description: lede ? researchLede(lede, 160, { stretch: 1 }) : [`${blurb} ${n} posts, newest first.`, blurb].find((d) => d.length <= 160) ?? blurb,
    canonical,
    socialCard,
    toRoot,
    robots: sub ? 'noindex' : '',
    crumbs: `<a href="${toBlog}">Blog</a> › <a href="${toTopic}">${esc(topic.label)}</a> › ${sub ? `<a href="../../">${esc(project.name)}</a> › Page ${page}` : esc(project.name)}`,
    feedHref: `${toBlog}feed.xml`,
    breadcrumb: baseUrl
      ? {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { name: SITE_NAME, item: baseUrl },
            { name: BLOG.name, item: `${baseUrl}${WRITING_PATH}` },
            { name: topic.label, item: `${baseUrl}${topicHere}` },
            { name: project.name, item: `${baseUrl}${here}` },
          ].map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, ...crumb })),
        }
      : undefined,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: seo,
      description: lede || blurb,
      url: canonical || undefined,
      isPartOf: { '@type': 'Blog', name: BLOG.feedTitle, url: baseUrl ? `${baseUrl}${WRITING_PATH}` : undefined },
      ...(toolHref && baseUrl ? { about: { '@type': research ? 'ResearchProject' : 'SoftwareApplication', name: question || project.name, url: `${baseUrl}${toolHref}` } } : {}),
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: mine.length,
        itemListElement: posts.map((p, i) => ({ '@type': 'ListItem', position: first + i, name: p.title, url: baseUrl ? `${baseUrl}${WRITING_PATH}${p.slug}/` : undefined })),
      },
    },
    hero: `<p class="eyebrow">${research ? `Research programme · ${esc(project.name)}` : 'Project log'}</p>
<h1>${esc(question || project.name)}${sub ? `, page ${page}` : ''}</h1>
<p class="dek">${esc(lede || blurb)}</p>
<p class="meta">${sub ? `Posts ${first} to ${first + posts.length - 1} of ${n}, newest first.` : `${n} posts, newest first.`}${toolHref ? ` <a href="${toRoot}${esc(toolHref)}">${esc(openLabel)}</a> ·` : ''} <a href="${toTopic}">all ${esc(topic.label.toLowerCase())}</a></p>`,
    body: `<ul class="posts" id="posts">
${renderCards(posts, toBlog, { topicPill: false })}
</ul>
${renderPager(page, count, sub ? '../../' : '')}
${renderProjectNav(projects, 0, { toProjects: `${toTopic}`, current: project.slug, heading: research ? 'Other programmes' : 'Other projects' })}`,
  });
}

/** Newest customer posts pinned on the blog's first page. */
export const CUSTOMER_LEAD = 6;

/**
 * The first thing on the blog: the newest "For your business" posts (owner, 2026-11-25: "blogs
 * get moved from dev blog to marketing blog"), above the finder over every post. Empty when
 * there are none, so a build with no customer posts shows the plain index.
 */
export function renderCustomerLead(posts, { n = CUSTOMER_LEAD, toTopics = 'topic/' } = {}) {
  const mine = posts.filter((p) => p.topic === 'business').sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (!mine.length) return '';
  return `<section class="customer-lead" aria-labelledby="customer-lead-h">
<h2 id="customer-lead-h">For your business</h2>
<ul class="posts">
${renderCards(mine.slice(0, n), '', { topicPill: false })}
</ul>
<p class="meta"><a href="${toTopics}business/">All ${formatCount(mine.length)} guides for your business →</a></p>
</section>
`;
}

/**
 * One blog index. Page 1 (`page` omitted) is `<section>/index.html` with the
 * finder over every post; page n is `<section>/page/n/` with a plain list.
 */
export function renderIndex(allPosts, { baseUrl = '', socialCard = '', episodes = [], section = BLOG, agentPosts = 0, page = 1 } = {}) {
  const count = pageCount(allPosts);
  const paged = count > 1;
  const sub = page > 1;
  const canonical = baseUrl ? `${baseUrl}${section.path}${sub ? `page/${page}/` : ''}` : '';
  const toRoot = '../'.repeat(section.depth + (sub ? 2 : 0));
  const up = sub ? '../../' : '';
  const posts = allPosts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const items = renderCards(posts, up);
  const isAgents = section.id === 'agents';
  const dek = sub
    ? `<p class="dek">Older posts, ${(page - 1) * PAGE_SIZE + 1} to ${(page - 1) * PAGE_SIZE + posts.length} of ${formatCount(allPosts.length)}. <a href="${up}">Search and filter every post</a>, or subscribe with the <a href="${up}feed.xml">Atom feed</a>.</p>`
    : isAgents
    ? `<p class="dek">Written by AI agents, for AI agents. The audience is an LLM reading with tools: posts are dense, cite repository paths you can open,
and lead with what to do. People are welcome to read along. For a model, the plain-text entry points are
<a href="llms.txt">llms.txt</a> (the index), <a href="llms-full.txt">llms-full.txt</a> (every post in one file) and each post's
raw Markdown (<code>&lt;slug&gt;.txt</code>). New posts: the <a href="feed.xml">Atom feed</a>. The blog for people is <a href="../">here</a>.</p>`
    : `<p class="dek">Practical guides for the businesses our products serve: subcontractors and builders, machine shops, resellers, European firms facing e-invoicing, and nonprofits.
The build log (how AI agents make and test it all) and the research notes follow under their own topics. Subscribe with the <a href="feed.xml">Atom feed</a>.${episodes.length ? ` Or listen: <a href="podcast/">the podcast</a> has spoken versions of ${episodes.length} of these posts, by topic.` : ` The <a href="podcast/">podcast</a> will carry spoken versions.`} What shipped and what is next: <a href="../updates/">updates and roadmap</a>.${agentPosts ? ` There is also an <a href="agents/">agent-to-agent blog</a>, written by AI agents with other agents as the readers.` : ''}</p>`;
  const title = `${isAgents ? 'Agent-to-agent blog' : 'Blog'}${sub ? `, page ${page}` : ''} · ${SITE_NAME}`;
  const pager = renderPager(page, count, up ? '../../' : '');
  return shell({
    title,
    description: sub ? `Older posts, page ${page} of ${count}. ${section.description}`.slice(0, 160) : section.description,
    canonical,
    socialCard,
    toRoot,
    robots: sub ? 'noindex' : '',
    crumbs: sub ? `<a href="../../">Blog</a> › Page ${page}` : isAgents ? '<a href="../">Blog</a> › Agent to agent' : 'Blog',
    feedHref: `${up}feed.xml`,
    podcastFeedHref: episodes.length ? `${up}podcast/feed.xml` : '',
    jsonLd: { '@context': 'https://schema.org', '@type': 'Blog', name: section.feedTitle, url: canonical || undefined },
    hero: `<p class="eyebrow">${isAgents ? 'Agent to agent' : 'Blog'}</p>
<h1>${isAgents ? 'Agent-to-agent blog' : 'Blog'}${sub ? `, page ${page}` : ''}</h1>
${dek}`,
    body: !posts.length
      ? '<p>No posts yet.</p>'
      : sub
        ? `<ul class="posts" id="posts">
${items}
</ul>
${pager}`
        : `${isAgents ? '' : renderCustomerLead(allPosts)}${renderFinder(allPosts)}
<ul class="posts" id="posts"${paged ? ` data-all="posts.json" data-total="${allPosts.length}"` : ''}>
${items}
</ul>
${pager}
<p id="none" hidden>No post matches. <button type="button" onclick="document.getElementById('clear').click()">Clear the filters</button></p>
${isAgents ? '' : renderTopicNav(allPosts)}
<script>${FINDER_SCRIPT}</script>`,
  });
}

/** A link to another post's source file becomes a link to that post's page on this site. */
export function linkSiblings(html, posts) {
  // One pass over the page's hrefs, not one scan of the page per post. The
  // replacement never contains REPO_BLOB, so the old chain of replaces and this
  // lookup agree; the first post with a given source wins, as before.
  const to = siblingTargets(posts);
  return html.replace(/href="([^"]*)"/g, (m, v) => to.get(v) ?? m);
}

// The source -> page map for one posts array, built once and reused for every
// post page (as `relatedIndex` is). Rebuilding it per page was 3,700 posts x
// 3,700 pages x two `esc` calls, about 8 s of a warm build (2026-11-12). The
// length check rebuilds it if a caller grows the array between pages.
const SIBLING_TARGETS = new WeakMap();
function siblingTargets(posts) {
  const cached = SIBLING_TARGETS.get(posts);
  if (cached && cached.n === posts.length) return cached.to;
  const to = new Map();
  for (const p of posts) {
    const from = esc(REPO_BLOB + p.source);
    if (!to.has(from)) to.set(from, `href="../${esc(p.slug)}/"`);
  }
  SIBLING_TARGETS.set(posts, { n: posts.length, to });
  return to;
}

export function renderPost(post, posts, opts = {}) {
  const html = renderPostPage(post, posts, opts);
  const { baseUrl = '' } = opts;
  return baseUrl && baseUrl !== DEFAULT_SITE_ORIGIN ? html.split(DEFAULT_SITE_ORIGIN).join(baseUrl) : html;
}

// Title words too common to say two posts are about the same thing.
const RELATED_STOPWORDS = new Set(
  ('about after again against also although among another because been before being between both cannot could does doing ' +
    'down during each every first from have having here into itself just last made make more most much must never none ' +
    'only other over same should since some still such than that their them then there these they this those three ' +
    'through under until very were what when where which while whose will with without would your')
    .split(' '),
);
const titleWords = (title = '') =>
  new Set(String(title).toLowerCase().match(/[a-z0-9][a-z0-9'-]{3,}/g)?.filter((w) => !RELATED_STOPWORDS.has(w)) ?? []);

// The scoring index for one posts array, built once and reused for every post page.
const RELATED_INDEX = new WeakMap();
function relatedIndex(posts) {
  let index = RELATED_INDEX.get(posts);
  if (index) return index;
  const byTag = new Map();
  const byWord = new Map();
  const words = new Map();
  posts.forEach((p, i) => {
    for (const t of new Set(p.tags ?? [])) (byTag.get(t) ?? byTag.set(t, []).get(t)).push(i);
    const w = titleWords(p.title);
    words.set(p, w);
    for (const x of w) (byWord.get(x) ?? byWord.set(x, []).get(x)).push(i);
  });
  // A tag or word shared by more than a fifth of the posts says little; leaving it out
  // of the candidate lists also keeps the build linear-ish (3,700 posts, 2026-11-12).
  const cap = Math.max(2, Math.floor(posts.length / 5));
  const idf = (list) => (list && list.length > 1 && list.length <= cap ? Math.log(posts.length / list.length) : 0);
  // Each post's date as a day number, by index: the nearest-in-date sorts
  // below compare thousands of pairs per post page, and parsing the date in
  // every comparison was about 2 s of a warm build (2026-11-12).
  const days = posts.map((p) => dayNumber(p.date));
  // A score per post index, zeroed again after each ranking: one Float64Array
  // in place of a Map per post page (docs/history/pages-build-perf-2026-11-25-related-top-k.md).
  const scratch = new Float64Array(posts.length);
  // An unparseable date makes the nearest-in-date order inconsistent, so the
  // top-k selection below is only used when every date is a number.
  const finiteDays = days.every(Number.isFinite);
  index = { byTag, byWord, words, idf, days, scratch, finiteDays };
  RELATED_INDEX.set(posts, index);
  return index;
}

const dayNumber = (iso) => (iso ? Date.parse(`${iso}T00:00:00Z`) / 86400000 : 0);

/**
 * Up to `n` other posts ranked by how related they are to `post` (the list
 * before `relatedPosts` balances it).
 *
 * Until 2026-11-12 this was "same topic, newest first", so every post in a topic
 * linked to the same five posts (the newest ones, alphabetical within a day):
 * 36 of 3,717 posts received every related link and 3,681 received none. Now
 * the score is the shared tags plus half the shared title words, each weighted
 * by how rare it is (log N / df), ties going to the post nearest in date. When
 * fewer than `n` posts share anything, the rest are the same topic's posts
 * nearest in date, then the other topics' in the same order. A post never
 * lists itself.
 */
export function rankRelated(post, posts, n = 5) {
  const index = relatedIndex(posts);
  const day = dayNumber(post.date);
  // The sort handles the rare shapes: a list length that is not a whole number
  // of at least 1, a date that does not parse, or an array grown since its index.
  if (!(Number.isInteger(n) && n >= 1) || !index.finiteDays || !Number.isFinite(day) || index.days.length !== posts.length) {
    return rankRelatedBySort(post, posts, n, index);
  }
  const { byTag, byWord, words, idf, days, scratch } = index;
  // Same scores as rankRelatedBySort, added in the same order per post, so the
  // sums are the same floats.
  const touched = [];
  const add = (list, weight) => {
    if (!weight) return;
    for (const i of list) {
      if (scratch[i] === 0) touched.push(i);
      scratch[i] += weight;
    }
  };
  for (const t of new Set(post.tags ?? [])) add(byTag.get(t) ?? [], idf(byTag.get(t)));
  for (const w of words.get(post) ?? titleWords(post.title)) add(byWord.get(w) ?? [], idf(byWord.get(w)) / 2);
  // Both orders below are total (ties end on the index), so keeping the best k
  // as candidates arrive gives exactly the first k of the full sort.
  const gap = (i) => Math.abs(days[i] - day);
  const nearest = (a, b) => gap(a) - gap(b) || a - b;
  const byScore = (a, b) => scratch[b] - scratch[a] || nearest(a, b);
  const top = [];
  const keep = (i, k, cmp) => {
    if (top.length >= k && cmp(i, top[top.length - 1]) >= 0) return;
    let at = top.length;
    while (at > 0 && cmp(i, top[at - 1]) < 0) at--;
    top.splice(at, 0, i);
    if (top.length > k) top.pop();
  };
  for (const i of touched) if (scratch[i] > 0 && posts[i].slug !== post.slug) keep(i, n, byScore);
  for (const i of touched) scratch[i] = 0;
  const ranked = top.map((i) => posts[i]);
  if (ranked.length >= n) return ranked;
  const taken = new Set(ranked.map((p) => p.slug).concat(post.slug));
  for (const sameTopic of [true, false]) {
    const k = n - ranked.length;
    if (k <= 0) break;
    top.length = 0;
    posts.forEach((p, i) => {
      if ((p.topic === post.topic) === sameTopic && !taken.has(p.slug)) keep(i, k, nearest);
    });
    for (const i of top) ranked.push(posts[i]);
  }
  return ranked;
}

// The original full-sort ranking. rankRelated falls back to it when a date does
// not parse, and the tests pin rankRelated against it.
export function rankRelatedBySort(post, posts, n = 5, index = relatedIndex(posts)) {
  const { byTag, byWord, words, idf, days } = index;
  const score = new Map();
  const add = (list, weight) => {
    if (!weight) return;
    for (const i of list) score.set(i, (score.get(i) ?? 0) + weight);
  };
  for (const t of new Set(post.tags ?? [])) add(byTag.get(t) ?? [], idf(byTag.get(t)));
  for (const w of words.get(post) ?? titleWords(post.title)) add(byWord.get(w) ?? [], idf(byWord.get(w)) / 2);
  // Entries are { p: post, i: its index in `posts`, s: score }.
  const day = dayNumber(post.date);
  const gap = (x) => Math.abs((days[x.i] ?? dayNumber(x.p.date)) - day);
  const nearest = (a, b) => gap(a) - gap(b) || a.i - b.i;
  const ranked = [...score]
    .map(([i, s]) => ({ p: posts[i], i, s }))
    .filter((x) => x.s > 0 && x.p.slug !== post.slug)
    .sort((a, b) => b.s - a.s || nearest(a, b))
    .slice(0, n)
    .map((x) => x.p);
  if (ranked.length >= n) return ranked;
  const taken = new Set(ranked.map((p) => p.slug).concat(post.slug));
  const rest = posts.map((p, i) => ({ p, i })).filter((x) => !taken.has(x.p.slug));
  const fill = (xs) => xs.sort(nearest).map((x) => x.p);
  return ranked
    .concat(fill(rest.filter((x) => x.p.topic === post.topic)), fill(rest.filter((x) => x.p.topic !== post.topic)))
    .slice(0, n);
}

// The balanced lists for one posts array and list length, built once.
const RELATED_TABLES = new WeakMap();
// How far down an orphan's own ranking to look for a post that can link back.
const ORPHAN_REACH = 20;

/**
 * Up to `n` other posts a reader of `post` would most likely want next: the
 * `rankRelated` list, balanced so every post is linked from at least one other.
 *
 * Ranking alone left 204 of 3,936 posts with no inbound related link (2026-11-12):
 * a post whose best matches each had five closer matches of their own. For each
 * such orphan, in posts order, this walks the orphan's own ranking (its best
 * matches first) and gives the first post that can spare a slot a link back,
 * in that post's last (weakest) slot. A post spares a slot when it does not
 * already list the orphan, has not given a slot yet, and the post in its last
 * slot is linked from somewhere else too, so no fix makes a new orphan. The
 * score is symmetric, so the link back is as strong as the orphan's own link.
 */
export function relatedPosts(post, posts, n = 5) {
  // Rebuilt if a caller grows the array between pages, as `siblingTargets` is.
  let cached = RELATED_TABLES.get(posts);
  if (!cached || cached.length !== posts.length) RELATED_TABLES.set(posts, (cached = { length: posts.length, byN: new Map() }));
  let table = cached.byN.get(n);
  if (!table) cached.byN.set(n, (table = balancedRelated(posts, n)));
  // A post not in the array (a preview) gets the plain ranking.
  return table.get(post.slug) ?? rankRelated(post, posts, n);
}

function balancedRelated(posts, n) {
  const lists = new Map(posts.map((p) => [p.slug, rankRelated(p, posts, n)]));
  if (n < 1 || posts.length < 3) return lists;
  const inbound = new Map(posts.map((p) => [p.slug, 0]));
  for (const list of lists.values()) for (const r of list) inbound.set(r.slug, inbound.get(r.slug) + 1);
  const gave = new Set();
  const bySlug = new Map(posts.map((p) => [p.slug, p]));
  for (const orphan of posts) {
    if (inbound.get(orphan.slug) > 0) continue;
    for (const c of rankRelated(orphan, posts, ORPHAN_REACH)) {
      const list = lists.get(c.slug);
      if (gave.has(c.slug) || list.length < n || list.some((r) => r.slug === orphan.slug)) continue;
      const dropped = list[n - 1];
      if (inbound.get(dropped.slug) < 2) continue;
      lists.set(c.slug, list.slice(0, n - 1).concat(bySlug.get(orphan.slug)));
      inbound.set(dropped.slug, inbound.get(dropped.slug) - 1);
      inbound.set(orphan.slug, 1);
      gave.add(c.slug);
      break;
    }
  }
  return lists;
}

/** A post's BlogPosting with the url, image, author and publisher it would otherwise lack (article-ld.mjs). */
function withArticleDefaults(node, { canonical, baseUrl, image }) {
  if (baseUrl) completeArticleNode(node, { canonical, baseUrl, siteName: SITE_NAME, image });
  return node;
}

// The first index of each slug in one posts array, built once (as `siblingTargets`
// is): a findIndex per post page was 7,367 x 7,367 comparisons, about 0.3 s of a
// build (docs/history/pages-build-perf-2026-11-25-related-top-k.md). An index that
// no longer holds the slug (the array changed in place) falls back to findIndex.
const POST_INDEX = new WeakMap();
function postIndex(posts, slug) {
  let cached = POST_INDEX.get(posts);
  if (!cached || cached.n !== posts.length) {
    const at = new Map();
    posts.forEach((p, i) => { if (!at.has(p.slug)) at.set(p.slug, i); });
    POST_INDEX.set(posts, (cached = { n: posts.length, at }));
  }
  const i = cached.at.get(slug);
  return i !== undefined && posts[i]?.slug === slug ? i : posts.findIndex((p) => p.slug === slug);
}

function renderPostPage(post, posts, { baseUrl = '', socialCard = '', episode = null, section = BLOG, projects = [] } = {}) {
  const canonical = baseUrl ? `${baseUrl}${section.path}${post.slug}/` : '';
  const isAgents = section.id === 'agents';
  const toRoot = '../'.repeat(section.depth + 1);
  const at = postIndex(posts, post.slug);
  const newer = at > 0 ? posts[at - 1] : null;
  const older = at >= 0 && at < posts.length - 1 ? posts[at + 1] : null;
  const related = relatedPosts(post, posts);
  const tags = post.tags.map((t) => `<a class="tag" href="../?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('');
  // A post on the people's blog links its topic's own page; the agent blog has no topic pages.
  const topicHref = isAgents ? `../?topic=${esc(post.topic)}` : `../topic/${esc(post.topic)}/`;
  const topic = `<a class="topic" href="${topicHref}">${esc(topicLabel(post.topic))}</a>`;
  // The post's project page, when its project has one (`projectGroups`).
  const project = !isAgents && post.project ? projects.find((g) => g.slug === post.project && (g.topic || 'tools') === post.topic) : undefined;
  const projectLink = project ? ` · <a href="../${TOPIC_PATH.slice(WRITING_PATH.length)}${esc(post.topic)}/${esc(project.slug)}/">More on ${esc(project.name)}</a>` : '';
  const markdown = isAgents ? ` · <a href="../${esc(post.slug)}.txt" type="text/plain">Markdown (plain text)</a>` : '';
  return shell({
    title: postPageTitle(post.seoTitle || post.title),
    description: post.description,
    canonical,
    socialCard,
    toRoot,
    crumbs: isAgents ? '<a href="../../">Blog</a> › <a href="../">Agent to agent</a>' : '<a href="../">Blog</a>',
    // The same trail as the visible one above, for search results. Only with a
    // real origin: a fixture build has no absolute URL to name.
    breadcrumb: baseUrl
      ? {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { name: SITE_NAME, item: baseUrl },
            { name: BLOG.name, item: `${baseUrl}${WRITING_PATH}` },
            ...(isAgents ? [{ name: AGENT_BLOG.name, item: `${baseUrl}${AGENTS_PATH}` }] : []),
            { name: post.title, item: canonical },
          ].map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, ...crumb })),
        }
      : undefined,
    feedHref: '../feed.xml',
    jsonLd: withArticleDefaults({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      url: canonical || undefined,
      keywords: post.tags.join(', ') || undefined,
      articleSection: topicLabel(post.topic),
      wordCount: post.words,
      ...(episode && baseUrl
        ? { audio: { '@type': 'AudioObject', contentUrl: `${baseUrl}${PODCAST_PATH}audio/${episode.audioFile}`, encodingFormat: 'audio/mpeg', duration: `PT${Math.round(episode.seconds)}S` } }
        : {}),
    }, { canonical, baseUrl, image: socialCard }),
    hero: `<h1>${esc(post.title)}</h1>
<p class="dek">${post.descriptionHtml ?? esc(post.description)}</p>
<p class="meta post-meta">${topic} <span class="when"><time datetime="${post.date}">${longDate(post.date)}</time> · ${post.minutes}&nbsp;min&nbsp;read</span> <span class="tail">${tags ? `<span class="tags">${tags}</span> ` : ''}<span class="src"><a href="${REPO_BLOB}${esc(post.source)}">Source</a>${markdown}</span></span></p>`,
    body: `<article>
${episode ? `${renderPlayer(episode, '../podcast/')}\n` : ''}${relinkSite(linkSiblings(renderMarkdown(post.body, { fromPath: post.source, dropTitle: true }), posts), toRoot)}
</article>
<section class="more" aria-labelledby="related-h">
${related.length ? `<h2 id="related-h">Related posts</h2>
<ul class="related">${related.map((p) => `<li><a href="../${esc(p.slug)}/">${esc(p.title)}</a><span class="when"><time datetime="${p.date}">${longDate(p.date)}</time> · ${esc(topicLabel(p.topic))}</span></li>`).join('')}</ul>` : ''}
${newer || older ? `<nav class="pager steps" aria-label="Older and newer posts">${older ? `<a href="../${esc(older.slug)}/" rel="prev"><span class="dir">← Older</span>${esc(older.title)}</a>` : '<span></span>'}${newer ? `<a href="../${esc(newer.slug)}/" rel="next" class="next"><span class="dir">Newer →</span>${esc(newer.title)}</a>` : ''}</nav>` : ''}
<p class="all"><a href="../">All ${isAgents ? 'agent-to-agent posts' : 'writing'}</a> · <a href="${topicHref}">More in ${esc(topicLabel(post.topic))}</a>${projectLink} · <a href="${toRoot}">All tools and research</a></p>
</section>`,
  });
}

/** Atom feed. Absolute links need the base URL; without one (a fixture build) they stay relative. */
export function renderFeed(posts, { baseUrl = '', section = BLOG } = {}) {
  const root = `${baseUrl}${section.path}`;
  const updated = posts[0] ? `${posts[0].date}T00:00:00Z` : '1970-01-01T00:00:00Z';
  const entries = posts
    .map(
      (p) => `  <entry>
    <title>${esc(p.title)}</title>
    <link href="${esc(`${root}${p.slug}/`)}"/>
    <id>${esc(`${root}${p.slug}/`)}</id>
    <updated>${p.date}T00:00:00Z</updated>
    <category term="${esc(p.topic)}" label="${esc(topicLabel(p.topic))}"/>
    <summary>${esc(p.description)}</summary>
  </entry>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(section.feedTitle)}</title>
  <link href="${esc(root)}"/>
  <id>${esc(root)}</id>
  <updated>${updated}</updated>
${entries}
</feed>
`;
}

/** A post's Markdown with its repository-relative links made absolute GitHub links, so the raw file works off the repository. */
export function absoluteLinks(post) {
  return post.body.replace(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g, (m, rel) => `](${REPO_BLOB}${path.posix.normalize(path.posix.join(path.posix.dirname(post.source), rel))})`);
}

/** `llms.txt` for the agent-to-agent blog (llmstxt.org shape): one line per post, linking its raw Markdown. */
export function renderAgentLlmsTxt(posts, { baseUrl = '' } = {}) {
  const root = `${baseUrl}${AGENTS_PATH}`;
  return `# Agent-to-agent blog

> Posts written by AI agents for AI agents, from an open repository (${REPO_BLOB.replace(/blob\/main\/$/, '')}) that unattended agents build and an owner steers. Every claim cites a repository path; check it there before relying on it. Not advice of any kind.

Each post is Markdown, served as plain text at the linked URL. All of them in one file: ${root}llms-full.txt

## Posts

${posts.map((p) => `- [${p.title}](${root}${p.slug}.txt): ${p.description} (${p.date}; ${topicLabel(p.topic)})`).join('\n')}

## Optional

- [Atom feed](${root}feed.xml): new posts, newest first.
- [The blog for people](${baseUrl}${WRITING_PATH}): longer essays on the same work.
`;
}

/** Every agent-to-agent post in one Markdown file, newest first. */
export function renderAgentLlmsFull(posts, { baseUrl = '' } = {}) {
  return posts
    .map((p) => `<!-- ${baseUrl}${AGENTS_PATH}${p.slug}.txt · ${p.date} · ${topicLabel(p.topic)} -->\n# ${p.title}\n\n> ${p.description}\n\n${absoluteLinks(p).replace(/^\s*# .*\n+/, '').trim()}\n`)
    .join('\n---\n\n');
}

/** The podcast's page, in this section's shell (the same header, breadcrumb and disclaimer). */
export function renderPodcastIndex(episodes, { baseUrl = '', socialCard = '' } = {}) {
  const canonical = baseUrl ? `${baseUrl}${PODCAST_PATH}` : '';
  return shell({
    title: `Podcast · ${SITE_NAME}`,
    description: SHOW_DESCRIPTION.slice(0, 160).replace(/\s+\S*$/, ''),
    canonical,
    socialCard,
    toRoot: '../../',
    crumbs: `<a href="../">Blog</a> › Podcast`,
    current: 'writing',
    hero: renderPodcastHero(),
    feedHref: '../feed.xml',
    podcastFeedHref: 'feed.xml',
    jsonLd: { '@context': 'https://schema.org', '@type': 'PodcastSeries', name: SHOW_TITLE, url: canonical || undefined, webFeed: canonical ? `${canonical}feed.xml` : undefined },
    body: renderPodcastBody(episodes, TOPICS),
  });
}

/** Write one blog's pages, feed and search index into `<outDir>/<section.path>`. */
/** The ids of the topics at least one post has, in TOPICS order. */
export const topicIds = (posts) => TOPICS.map((t) => t.id).filter((id) => posts.some((p) => p.topic === id));

async function writeSection(outDir, posts, section, { baseUrl, socialCard, rebase, episodes = [], byPost = new Map(), agentPosts = 0, projects = [], published = new Set(), moved = [] }) {
  const dir = path.join(outDir, section.path);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), rebase(renderIndex(posts, { baseUrl, socialCard, episodes, section, agentPosts })));
  // Past one page the index lists the newest posts; the rest are numbered pages, and the finder reads posts.json.
  const pages = pageCount(posts);
  if (pages > 1) {
    await fs.writeFile(path.join(dir, 'posts.json'), rebase(renderPostRows(posts)));
    for (let n = 2; n <= pages; n++) {
      await fs.mkdir(path.join(dir, 'page', String(n)), { recursive: true });
      await fs.writeFile(path.join(dir, 'page', String(n), 'index.html'), rebase(renderIndex(posts, { baseUrl, socialCard, episodes, section, agentPosts, page: n })));
    }
  }
  if (section.id === BLOG.id) {
    for (const id of topicIds(posts)) {
      const tdir = path.join(outDir, TOPIC_PATH, id);
      await fs.mkdir(tdir, { recursive: true });
      const groups = projects.filter((g) => (g.topic || 'tools') === id);
      await fs.writeFile(path.join(tdir, 'index.html'), rebase(renderTopicPage(posts, id, { baseUrl, socialCard, projects: groups })));
      const pages = pageCount(posts.filter((p) => p.topic === id));
      for (let n = 2; n <= pages; n++) {
        await fs.mkdir(path.join(tdir, 'page', String(n)), { recursive: true });
        await fs.writeFile(path.join(tdir, 'page', String(n), 'index.html'), rebase(renderTopicPage(posts, id, { baseUrl, socialCard, page: n })));
      }
    }
    for (const g of projects) {
      const gtopic = g.topic || 'tools';
      const pdir = path.join(outDir, TOPIC_PATH, gtopic, g.slug);
      // A tool is served at `<slug>/`, a research programme at `research/<slug>/` (a registry entry has a page).
      const href = gtopic === 'research' ? (g.question ? `research/${g.slug}/` : '') : published.has(g.slug) ? `${g.slug}/` : '';
      const opts = { baseUrl, socialCard, projects: projects.filter((x) => (x.topic || 'tools') === gtopic), toolHref: href };
      await fs.mkdir(pdir, { recursive: true });
      await fs.writeFile(path.join(pdir, 'index.html'), rebase(renderProjectPage(posts, g, opts)));
      for (let n = 2; n <= pageCount(Array(g.count)); n++) {
        await fs.mkdir(path.join(pdir, 'page', String(n)), { recursive: true });
        await fs.writeFile(path.join(pdir, 'page', String(n), 'index.html'), rebase(renderProjectPage(posts, g, { ...opts, page: n })));
      }
    }
  }
  await fs.writeFile(path.join(dir, 'feed.xml'), rebase(renderFeed(posts, { baseUrl, section })));
  await fs.writeFile(path.join(dir, 'search.json'), rebase(renderSearchIndex(posts)));
  // Sync on purpose, as in build.mjs's rewritePagesSync. Awaiting an
  // fs.promises mkdir and write per post, one post at a time, sent ~9,500
  // round trips through libuv's thread pool for files that take microseconds
  // to write: the main thread sat idle for about 45% of this loop over 4,741
  // posts (2026-11-15, docs/history/pages-build-perf-2026-11-15-writing-sync-writes.md).
  // Nothing else in this process is in flight here (the research builder is a
  // child process with no pipe to drain), so blocking holds nothing up.
  for (const post of posts) {
    mkdirSync(path.join(dir, post.slug), { recursive: true });
    writeFileSync(path.join(dir, post.slug, 'index.html'), rebase(renderPost(post, posts, { baseUrl, socialCard, episode: byPost.get(post.slug), section, projects })));
  }
  for (const post of moved) {
    mkdirSync(path.join(dir, post.slug), { recursive: true });
    writeFileSync(path.join(dir, post.slug, 'index.html'), rebase(renderMovedPost(post, { baseUrl, section })));
  }
}

/**
 * The page left at a folded post's address: canonical, a zero-second refresh (which Google
 * treats as a permanent redirect) and noindex, the same stub the old GitHub Pages origin
 * serves (`redirect-stubs.mjs`). Without a base URL it points one directory up.
 */
export function renderMovedPost(post, { baseUrl = '', section = BLOG } = {}) {
  const target = baseUrl ? `${baseUrl}${section.path}${post.mergedInto}/` : `../${post.mergedInto}/`;
  return stubPage(target);
}

/**
 * Write `writing/` into outDir, with the podcast at `writing/podcast/` when an
 * episode's audio is committed, and the agent-to-agent blog at
 * `writing/agents/` when `docs/agent-posts/` has a post. Returns the page
 * slugs under `writing/` for the sitemap.
 */
// `originAlias` is the site's default address (build.mjs passes its
// DEFAULT_BASE_URL). A post that links to a tool by its full URL then follows
// the address the site is actually built for, the way rewriteOrigin in
// build.mjs treats venture pages. A relative link cannot do this: in a post,
// relative paths are repository paths and render as GitHub links.
// `published` holds the slugs the site serves at `<slug>/`, so a project page links its tool.
export async function buildWriting(outDir, baseUrl = '', { root = DEFAULT_ROOT, socialCard = '', originAlias = '', published = new Set() } = {}) {
  const moved = [];
  const posts = loadPosts(root, POSTS_DIR, { moved });
  const agentPosts = loadPosts(root, AGENT_POSTS_DIR);
  const topicByPost = new Map(posts.map((p) => [p.slug, p.topic]));
  const episodes = loadEpisodes(root, new Set(posts.map((p) => p.slug))).map((ep) => ({ ...ep, topic: topicByPost.get(ep.post) || 'tools' }));
  const byPost = new Map(episodes.map((ep) => [ep.post, ep]));
  const aliases = [].concat(originAlias || []).filter((a) => a && baseUrl && a !== baseUrl);
  const rebase = (html) => aliases.reduce((h, a) => h.split(a).join(baseUrl), html);
  const questions = researchQuestions(root);
  const ledes = researchLedes(root);
  const projects = [
    ...projectGroups(posts.filter((p) => p.topic === 'tools'), { root }),
    ...projectGroups(posts.filter((p) => p.topic === 'research'), { root, topic: 'research', questions: (slug) => questions.get(slug) || '', ledes: (slug) => ledes.get(slug) || '' }),
  ];
  await writeSection(outDir, posts, BLOG, { baseUrl, socialCard, rebase, episodes, byPost, agentPosts: agentPosts.length, projects, published, moved });
  // Every page writeSection wrote links this (shell(); writeSection made outDir).
  await fs.writeFile(path.join(outDir, WRITING_STYLE_FILE), renderWritingStyle());
  if (agentPosts.length) {
    await writeSection(outDir, agentPosts, AGENT_BLOG, { baseUrl, socialCard, rebase });
    const dir = path.join(outDir, AGENTS_PATH);
    for (const p of agentPosts) {
      writeFileSync(path.join(dir, `${p.slug}.txt`), rebase(`# ${p.title}\n\n> ${p.description}\n\n${p.date} · ${topicLabel(p.topic)} · source: ${REPO_BLOB}${p.source}\n\n${absoluteLinks(p).replace(/^\s*# .*\n+/, '').trim()}\n`));
    }
    await fs.writeFile(path.join(dir, 'llms.txt'), rebase(renderAgentLlmsTxt(agentPosts, { baseUrl })));
    await fs.writeFile(path.join(dir, 'llms-full.txt'), rebase(renderAgentLlmsFull(agentPosts, { baseUrl })));
  }
  // The podcast page is in the top navigation, so it is written even before any
  // episode has audio; the feeds and audio only once one does.
  if (episodes.length) await writePodcastAssets(outDir, episodes, { root, baseUrl, image: socialCard, topics: TOPICS });
  await fs.mkdir(path.join(outDir, PODCAST_PATH), { recursive: true });
  await fs.writeFile(path.join(outDir, PODCAST_PATH, 'index.html'), rebase(renderPodcastIndex(episodes, { baseUrl, socialCard })));
  return [
    ...posts.map((p) => p.slug),
    // Each topic's first page; its numbered pages are noindex, like the blog's.
    ...topicIds(posts).map((id) => `topic/${id}`),
    // Each project's first page under "Tools and projects" or "Research findings".
    ...projects.map((g) => `topic/${g.topic || 'tools'}/${g.slug}`),
    'podcast',
    ...(agentPosts.length ? ['agents', ...agentPosts.map((p) => `agents/${p.slug}`)] : []),
  ];
}

// By resolved path: a basename suffix match ran a full blog build when any script whose
// name `writing.mjs` ends with (`g.mjs`, `ing.mjs`) imported this module.
const invokedDirectly = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const out = arg('out') ?? path.join(HERE, 'dist');
  // Over a full build's dist, link the tools it already holds.
  const published = new Set(existsSync(out) ? readdirSync(out) : []);
  const pages = await buildWriting(out, arg('base-url') ?? '', { published });
  console.log(`writing: wrote ${path.join(out, WRITING_PATH)} (${pages.length} pages)`);
}
