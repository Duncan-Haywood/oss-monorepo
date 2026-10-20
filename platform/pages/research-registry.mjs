// Mirrors research/_homepage/registry.py: projects.json plus every
// research/<slug>/project.json card, appended to its theme in slug order.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export function loadResearchRegistry(repoRoot) {
  const research = path.join(repoRoot, 'research');
  const file = path.join(research, '_homepage', 'projects.json');
  if (!existsSync(file)) return null;
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const themes = new Map((data.themes ?? []).map((t) => [t.id, t]));
  const listed = new Set((data.themes ?? []).flatMap((t) => (t.projects ?? []).map((p) => p.slug)));
  for (const slug of readdirSync(research).sort()) {
    if (slug.startsWith('_') || slug.startsWith('.')) continue;
    const card = path.join(research, slug, 'project.json');
    if (listed.has(slug) || !existsSync(card)) continue;
    let c;
    try { c = JSON.parse(readFileSync(card, 'utf8')); } catch { continue; }
    const theme = themes.get(c.theme);
    if (theme) (theme.projects ??= []).push({ slug, title: c.title ?? '', summary: c.summary ?? '' });
  }
  return data;
}
