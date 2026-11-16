// The GitHub half of the Deploy button, kept apart from the page (app.mjs) so
// node tests can drive it against a mocked API (publish.test.mjs). Nothing
// here touches the DOM; `fetch` and `sleep` are injected.
//
// Quality audit 2026-11-07 (portfolio/quality/audits/2026-11-07-deploy.json)
// found three faults this module replaces:
//   - files went up one contents-API PUT at a time: one commit per file, each
//     a push that started the visitor's deploy workflow, and a half-uploaded
//     repository when anything failed midway. pushFiles() now writes blobs
//     (binary files only; text rides inline in the tree), then one tree, one commit and one ref update: the
//     publish is atomic and starts one workflow run;
//   - gh() turned every 404 on a GET into null, so a token without access to
//     a repository read as "that repository does not exist". 404 is now null
//     only where the caller asks for it ({ allow404: true });
//   - the failure message always said "Nothing else was changed", even after a
//     repository and secrets had been created. Progress records what exists,
//     and failureMessage() says exactly that.

export const API = 'https://api.github.com';

export const toB64 = (v) => {
  const bytes = typeof v === 'string' ? new TextEncoder().encode(v) : v;
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export class GitHubError extends Error {
  constructor(method, path, status, text) {
    super(`GitHub ${method} ${path} -> ${status}${text ? ` ${text.slice(0, 200)}` : ''}`);
    this.status = status;
  }
}

/** gh(method, path, body?, { allow404 }) bound to one token. Throws GitHubError on any non-2xx, except a 404 the caller allowed (then null). */
export function makeGh(token, { fetch = globalThis.fetch, api = API } = {}) {
  return async function gh(method, path, body, { allow404 = false } = {}) {
    const r = await fetch(`${api}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 404 && allow404) return null;
    if (!r.ok) throw new GitHubError(method, path, r.status, await r.text().catch(() => ''));
    if (r.status === 204) return null;
    return r.json().catch(() => null);
  };
}

/** Seal and store Actions secrets, then set plain Actions variables (empty values skipped). */
export async function storeSecrets(gh, repo, secrets, variables, seal, progress = newProgress()) {
  const entries = Object.entries(secrets);
  if (entries.length) {
    const key = await gh('GET', `/repos/${repo}/actions/secrets/public-key`);
    for (const [k, v] of entries) {
      await gh('PUT', `/repos/${repo}/actions/secrets/${k}`, { encrypted_value: seal(v, key.key), key_id: key.key_id });
      progress.secrets.push(k);
    }
  }
  for (const [name, value] of Object.entries(variables ?? {})) {
    if (!value) continue;
    await gh('POST', `/repos/${repo}/actions/variables`, { name, value });
    progress.variables.push(name);
  }
}

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

/**
 * Publish `files` ({ path: string | Uint8Array }; '' entries are left out) to
 * `branch` of `repo` ("owner/name") as ONE commit on top of the branch head.
 * The repository must already have a commit (created with auto_init), since
 * the Git data API refuses an empty repository. Returns the new commit sha.
 */
export async function pushFiles(gh, repo, branch, files, { message = 'Add the app', sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onProgress = () => {} } = {}) {
  // A repository created a moment ago can answer 404 or 409 for its branch for a
  // second or two while GitHub writes the initial commit.
  let ref = null;
  for (let attempt = 0; attempt < 6 && !ref; attempt++) {
    if (attempt) await sleep(500 * 2 ** (attempt - 1));
    try {
      ref = await gh('GET', `/repos/${repo}/git/ref/heads/${encodePath(branch)}`, undefined, { allow404: true });
    } catch (e) {
      if (e.status !== 409) throw e;
    }
  }
  if (!ref) throw new Error(`branch ${branch} of ${repo} did not appear`);
  const parent = ref.object.sha;
  const base = await gh('GET', `/repos/${repo}/git/commits/${parent}`);

  // Text goes inline in the tree request; only binary files need a blob call
  // each. GitHub's secondary limit is about 80 content-creating requests a
  // minute, so a blob per file would throttle a 60-file app.
  const tree = [];
  const entries = Object.entries(files).filter(([, v]) => v !== '');
  const binary = entries.filter(([, v]) => typeof v !== 'string');
  for (const [path, content] of entries) if (typeof content === 'string') tree.push({ path, mode: '100644', type: 'blob', content });
  for (const [i, [path, content]] of binary.entries()) {
    const blob = await gh('POST', `/repos/${repo}/git/blobs`, { content: toB64(content), encoding: 'base64' });
    tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    onProgress(i + 1, binary.length);
  }
  const newTree = await gh('POST', `/repos/${repo}/git/trees`, { base_tree: base.tree.sha, tree });
  const commit = await gh('POST', `/repos/${repo}/git/commits`, { message, tree: newTree.sha, parents: [parent] });
  await gh('PATCH', `/repos/${repo}/git/refs/heads/${encodePath(branch)}`, { sha: commit.sha, force: false });
  return commit.sha;
}

/** What a run has created so far in the visitor's account, for an honest failure message. */
export function newProgress() {
  return { repo: null, secrets: [], variables: [], pages: false, pushed: false };
}

export function failureMessage(progress) {
  if (!progress.repo) return 'Nothing was created in your GitHub account. Fix the problem and run again.';
  const made = [`the repository ${progress.repo}`];
  if (progress.secrets.length) made.push(`its Actions secrets (${progress.secrets.join(', ')})`);
  if (progress.variables.length) made.push(`its Actions variables (${progress.variables.join(', ')})`);
  if (progress.pages) made.push('its GitHub Pages setting');
  made.push(progress.pushed ? 'the app files (one commit)' : 'no app files yet (the upload is all-or-nothing)');
  const list = made.length > 1 ? `${made.slice(0, -1).join(', ')} and ${made.at(-1)}` : made[0];
  return `Created so far: ${list}. Delete the repository at https://github.com/${progress.repo}/settings (bottom of the page), then fix the problem and run again; a new run makes a new repository.`;
}
