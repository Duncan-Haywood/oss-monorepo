/**
 * Hashnode cross-poster: one article per newly launched tool, with
 * originalArticleURL (the canonical link) pointing at the tool page. Off by
 * default. See portfolio/distribution/README.md.
 *
 *   node platform/distribution/hashnode.mjs            # dry run: prints the articles
 *   DISTRIBUTE_HASHNODE=true HASHNODE_TOKEN=... HASHNODE_PUBLICATION_ID=... node platform/distribution/hashnode.mjs
 *
 * Articles are created as DRAFTS (createDraft) unless HASHNODE_PUBLISH=true
 * (publishPost), so the owner can read the first few before anything goes
 * public. At most MAX_PER_RUN per run. De-duplication is stateless: the
 * publication's own posts and drafts are read back and any tool whose URL is
 * already a canonical URL is skipped.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMeta, recentLaunches, toolUrl } from './bluesky.mjs';
import { composeArticle as composeDevto } from './devto.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const MAX_PER_RUN = 2;
export const ENDPOINT = 'https://gql.hashnode.com/';
const TAGS = [
  { name: 'Open Source', slug: 'opensource' },
  { name: 'Tools', slug: 'tools' },
  { name: 'Productivity', slug: 'productivity' },
];

/** Article input for one tool. Reuses the dev.to body so the disclosures stay identical across channels. */
export function composeArticle(meta, url) {
  const a = composeDevto(meta, url);
  return {
    title: a.title,
    contentMarkdown: a.body_markdown,
    originalArticleURL: url,
    subtitle: meta.description.slice(0, 150),
    tags: TAGS,
  };
}

/** Which articles would go out. `seenUrls` is the set of canonical URLs already on the publication. */
export async function plan({ launched, today, seenUrls = new Set(), readPage, max = MAX_PER_RUN }) {
  const out = [];
  for (const slug of recentLaunches(launched, today)) {
    const url = toolUrl(slug);
    if (seenUrls.has(url)) continue;
    const html = await readPage(slug);
    const meta = html && readMeta(html);
    if (!meta) continue;
    out.push({ slug, url, article: composeArticle(meta, url) });
    if (out.length >= max) break;
  }
  return out;
}

async function gql(fetchImpl, token, query, variables) {
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: token },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`hashnode: HTTP ${res.status}`);
  const j = await res.json();
  if (j.errors?.length) throw new Error(`hashnode: ${j.errors[0].message}`);
  return j.data;
}

const SEEN = `query($id: ObjectId!) { publication(id: $id) {
  posts(first: 50) { edges { node { canonicalUrl } } }
  drafts(first: 50) { edges { node { canonicalUrl } } } } }`;
const CREATE_DRAFT = 'mutation($input: CreateDraftInput!) { createDraft(input: $input) { draft { id } } }';
const PUBLISH = 'mutation($input: PublishPostInput!) { publishPost(input: $input) { post { id } } }';

export async function run({ env = process.env, fetchImpl = fetch, log = console.log, now = new Date() } = {}) {
  const launched = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'platform/pages/launched.json'), 'utf8')).launched;
  const readPage = (slug) => fs.readFile(path.join(REPO_ROOT, 'ventures', slug, 'index.html'), 'utf8').catch(() => null);
  const today = now.toISOString().slice(0, 10);
  const token = env.HASHNODE_TOKEN;
  const pub = env.HASHNODE_PUBLICATION_ID;
  const live = env.DISTRIBUTE_HASHNODE === 'true' && !!token && !!pub;
  const published = env.HASHNODE_PUBLISH === 'true';

  let seenUrls = new Set();
  if (live) {
    const d = await gql(fetchImpl, token, SEEN, { id: pub });
    const nodes = [...d.publication.posts.edges, ...d.publication.drafts.edges].map((e) => e.node.canonicalUrl);
    seenUrls = new Set(nodes.filter(Boolean));
  }
  const posts = await plan({ launched, today, seenUrls, readPage });
  if (!live) {
    log(`DRY RUN (set DISTRIBUTE_HASHNODE=true, HASHNODE_TOKEN and HASHNODE_PUBLICATION_ID to create ${published ? 'public articles' : 'drafts'}). ${posts.length} article(s):`);
    for (const p of posts) log(`--- ${p.slug}\n${p.article.title}\n${p.article.contentMarkdown}\n`);
    return { posted: 0, planned: posts.length };
  }
  for (const p of posts) {
    await gql(fetchImpl, token, published ? PUBLISH : CREATE_DRAFT, { input: { ...p.article, publicationId: pub } });
    log(`${published ? 'published' : 'drafted'} ${p.slug}`);
  }
  return { posted: posts.length, planned: posts.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((e) => { console.error(e.message); process.exit(1); });
}
