/**
 * What the blog has not written about yet: the research tracks with no post
 * and how long since the last post, so a run with spare scope can pick the
 * biggest untold body of work (prompts/goals.md, "Direction: write about the
 * work").
 *
 *   node platform/pages/writing-backlog.mjs           # table, biggest gap first
 *   node platform/pages/writing-backlog.mjs --all     # include single-project prefixes
 *   node platform/pages/writing-backlog.mjs --json
 *
 * A research track is the `research/<prefix>-*` projects sharing a slug
 * prefix (`house-adufees`, `house-energyprices` → `house`). A track counts as
 * covered once any post in `docs/posts/` links one of its projects by
 * repository path (`research/house-adufees/`). Advisory: always exits 0.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPosts } from './writing.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');

/** Research tracks under `research/`: { prefix, projects: [slug] }, projects with a README only. */
export function researchTracks(root = DEFAULT_ROOT) {
  const dir = path.join(root, 'research');
  if (!existsSync(dir)) return [];
  const tracks = new Map();
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory() || !/^[a-z0-9]/.test(ent.name)) continue;
    if (!existsSync(path.join(dir, ent.name, 'README.md'))) continue;
    const prefix = ent.name.split('-')[0];
    if (!tracks.has(prefix)) tracks.set(prefix, []);
    tracks.get(prefix).push(ent.name);
  }
  return [...tracks]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([prefix, projects]) => ({ prefix, projects: projects.sort() }));
}

/** Each track with the posts that link one of its projects, uncovered and largest first. */
export function writingBacklog(root = DEFAULT_ROOT, today = new Date().toISOString().slice(0, 10)) {
  const posts = loadPosts(root);
  const tracks = researchTracks(root).map((t) => {
    const covered = posts.filter((p) => t.projects.some((slug) => p.body.includes(`research/${slug}`)));
    return { prefix: t.prefix, projects: t.projects.length, posts: covered.map((p) => p.slug) };
  });
  tracks.sort((a, b) => (a.posts.length > 0) - (b.posts.length > 0) || b.projects - a.projects || a.prefix.localeCompare(b.prefix));
  const last = posts[0]?.date ?? null;
  const daysSinceLastPost = last ? Math.round((Date.parse(today) - Date.parse(last)) / 86400000) : null;
  return { posts: posts.length, lastPost: last, daysSinceLastPost, tracks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = writingBacklog();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const since = report.lastPost ? `last on ${report.lastPost}, ${report.daysSinceLastPost} days ago` : 'none yet';
    console.log(`${report.posts} posts in docs/posts/ (${since}).`);
    const open = report.tracks.filter((t) => t.posts.length === 0);
    console.log(`${open.length} of ${report.tracks.length} research tracks have no post. Biggest first:\n`);
    // Single-project prefixes are standalone projects, not tracks; count them, list the rest.
    const listed = report.tracks.filter((t) => t.projects > 1 || process.argv.includes('--all'));
    for (const t of listed) {
      const status = t.posts.length ? `covered by ${t.posts.join(', ')}` : 'no post';
      console.log(`  ${t.prefix.padEnd(14)} ${String(t.projects).padStart(4)} projects  ${status}`);
    }
    const hidden = report.tracks.length - listed.length;
    if (hidden) console.log(`\n  (${hidden} single-project prefixes not shown; --all lists them)`);
  }
}
