// One-click self-deploy for static ventures (PRODUCT_PLAYBOOK.md §2, "anyone can
// deploy it themselves"). Runs in the visitor's browser and under node --test.
//
// The visitor's GitHub token goes from their browser straight to api.github.com
// and nowhere else. Nothing of ours is in the path. The flow copies one
// venture's published directory into a new public repository in the visitor's
// own account and turns on GitHub Pages for it.

export const API = 'https://api.github.com';
export const SOURCE_DEFAULT = { owner: 'Duncan-Haywood', repo: 'oss-monorepo', ref: 'main' };
export const DONATE = {
  sponsors: 'https://github.com/sponsors/Duncan-Haywood',
  coffee: 'https://buymeacoffee.com/duncanhaywood',
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

export function validSlug(s) {
  return typeof s === 'string' && SLUG.test(s);
}

/** GitHub repo names: letters, digits, `-`, `_`, `.`; never `.` or `..`. */
export function validRepoName(s) {
  return typeof s === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(s) && s !== '.' && s !== '..';
}

export function defaultRepoName(slug) {
  return `${slug}`.slice(0, 100);
}

/** README written into the deployed copy: operator duties and the donate links. */
export function deployedReadme({ slug, title, pagesUrl, source }) {
  return `# ${title || slug}

This is your own copy of **${slug}**, deployed from
https://github.com/${source.owner}/${source.repo}/tree/${source.ref}/ventures/${slug}
with the one-click deploy page. It is MIT licensed (see \`LICENSE\` if present in
the original venture directory).

Live at: ${pagesUrl}

## You are the operator of this copy

You host it, so you are responsible for its domain, terms, privacy policy,
users and any change you make. The original disclaimers in the app ship with it;
keep them accurate. The software is provided as is, without warranty, and the
creator is not liable for your copy.

## Support the creator

If this saves you money or earns you some, a donation keeps the original going:

- GitHub Sponsors: ${DONATE.sponsors}
- Buy Me a Coffee: ${DONATE.coffee}
`;
}

function ghFetch(fetchFn, token) {
  return async (method, url, body) => {
    const res = await fetchFn(url.startsWith('http') ? url : API + url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const err = new Error(`${method} ${url} -> ${res.status}${data && data.message ? `: ${data.message}` : ''}`);
      err.status = res.status;
      throw err;
    }
    return data;
  };
}

/**
 * List every file under `dir` in the source repo, recursively, via the contents
 * API (the whole-repo tree is truncated at this repository's size).
 * Returns [{ path, sha }] with paths relative to `dir`.
 */
export async function listSourceFiles(fetchFn, source, dir) {
  const call = ghFetch(fetchFn, null);
  const out = [];
  async function walk(rel) {
    const p = rel ? `${dir}/${rel}` : dir;
    const items = await call('GET', `/repos/${source.owner}/${source.repo}/contents/${p}?ref=${encodeURIComponent(source.ref)}`);
    if (!Array.isArray(items)) throw new Error(`${p} is not a directory in the source repository`);
    for (const it of items) {
      const r = rel ? `${rel}/${it.name}` : it.name;
      if (it.type === 'dir') {
        if (it.name === 'node_modules' || it.name === '.git') continue;
        await walk(r);
      } else if (it.type === 'file') {
        out.push({ path: r, sha: it.sha, size: it.size });
      }
    }
  }
  await walk('');
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Deploy `entry` ({slug, title, dir}) into a new public repo of the token's owner.
 * `onStep(msg)` receives human-readable progress. Returns {repoUrl, pagesUrl}.
 */
export async function deployToGithubPages({ fetchFn, token, entry, repoName, source = SOURCE_DEFAULT, onStep = () => {}, wait = sleep }) {
  if (!token) throw new Error('A GitHub token is required.');
  if (!validSlug(entry.slug)) throw new Error('Unknown app.');
  const name = repoName || defaultRepoName(entry.slug);
  if (!validRepoName(name)) throw new Error('Repository name may only use letters, digits, ".", "-" and "_".');
  const gh = ghFetch(fetchFn, token);
  const anon = ghFetch(fetchFn, null); // source reads never carry the token

  onStep('Checking your GitHub account');
  const me = await gh('GET', '/user');
  const owner = me.login;

  onStep(`Reading ${entry.slug} from ${source.owner}/${source.repo}`);
  const files = await listSourceFiles(fetchFn, source, entry.dir);
  if (!files.some((f) => f.path === 'index.html')) throw new Error(`${entry.slug} has no index.html to serve.`);

  onStep(`Creating public repository ${owner}/${name}`);
  await gh('POST', '/user/repos', {
    name,
    description: `Own copy of ${entry.title || entry.slug}`,
    private: false,
    auto_init: true,
  });
  const base = `/repos/${owner}/${name}`;
  // auto_init commits asynchronously; wait until the default branch resolves.
  let repo;
  let head;
  for (let i = 0; i < 10 && !head; i++) {
    try {
      repo = await gh('GET', base);
      head = (await gh('GET', `${base}/git/ref/heads/${repo.default_branch}`)).object.sha;
    } catch (e) {
      if (e.status !== 404 && e.status !== 409) throw e;
      await wait(1000);
    }
  }
  if (!head) throw new Error('The new repository did not become ready in time.');
  const branch = repo.default_branch;
  const pagesUrl = `https://${owner.toLowerCase()}.github.io/${name}/`;

  const tree = [];
  let n = 0;
  for (const f of files) {
    n++;
    onStep(`Copying files (${n}/${files.length}): ${f.path}`);
    const blob = await anon('GET', `/repos/${source.owner}/${source.repo}/git/blobs/${f.sha}`);
    const created = await gh('POST', `${base}/git/blobs`, { content: blob.content.replace(/\n/g, ''), encoding: 'base64' });
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: created.sha });
  }
  const readme = await gh('POST', `${base}/git/blobs`, {
    content: deployedReadme({ slug: entry.slug, title: entry.title, pagesUrl, source }),
    encoding: 'utf-8',
  });
  const readmeIdx = tree.findIndex((t) => t.path === 'README.md');
  if (readmeIdx >= 0) tree[readmeIdx] = { path: 'ORIGINAL_README.md', mode: '100644', type: 'blob', sha: tree[readmeIdx].sha };
  tree.push({ path: 'README.md', mode: '100644', type: 'blob', sha: readme.sha });

  onStep('Committing');
  const newTree = await gh('POST', `${base}/git/trees`, { tree });
  const commit = await gh('POST', `${base}/git/commits`, {
    message: `Deploy ${entry.slug} from ${source.owner}/${source.repo}`,
    tree: newTree.sha,
    parents: [head],
  });
  await gh('PATCH', `${base}/git/refs/heads/${branch}`, { sha: commit.sha, force: true });

  onStep('Turning on GitHub Pages');
  try {
    await gh('POST', `${base}/pages`, { source: { branch, path: '/' } });
  } catch (e) {
    if (e.status !== 409) throw e; // 409: already enabled
  }
  return { repoUrl: `https://github.com/${owner}/${name}`, pagesUrl };
}
