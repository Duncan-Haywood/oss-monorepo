// Reads `git ls-remote <remote> 'refs/heads/*' 'refs/pull/*/head'` output and
// lists branches whose tip is not the head of any pull request.
// This is the quick, browser-side half of stranded.py: a branch whose tip
// matches a PR head is covered; any other branch needs the full check, because
// a branch can sit ahead of its PR or have had no PR at all.
export function parseLsRemote(text) {
  if (typeof text !== "string") throw new Error("Paste the output of git ls-remote.");
  const heads = new Map();
  const pulls = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([0-9a-f]{40}(?:[0-9a-f]{24})?)\s+(\S+)$/);
    if (!m) continue;
    const [, sha, ref] = m;
    if (ref.startsWith("refs/heads/")) heads.set(ref.slice(11), sha);
    else {
      const p = ref.match(/^refs\/pull\/(\d+)\/head$/);
      if (p) {
        if (!pulls.has(sha)) pulls.set(sha, []);
        pulls.get(sha).push(Number(p[1]));
      }
    }
  }
  if (heads.size === 0) throw new Error("No refs/heads/ lines found. Run: git ls-remote origin 'refs/heads/*' 'refs/pull/*/head'");
  return { heads, pulls };
}

export function uncovered(text, { base = "main", ignore = [] } = {}) {
  const { heads, pulls } = parseLsRemote(text);
  const baseTip = heads.get(base);
  const out = [];
  for (const [name, sha] of heads) {
    if (name === base || ignore.some((p) => globMatch(p, name))) continue;
    if (pulls.has(sha)) continue;
    if (baseTip === sha) continue; // nothing beyond base
    out.push({ branch: name, tip: sha });
  }
  return out.sort((a, b) => a.branch.localeCompare(b.branch));
}

export function globMatch(pattern, name) {
  const re = new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
  return re.test(name);
}
