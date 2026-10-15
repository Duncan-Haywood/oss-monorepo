import { composeRepo, PROVIDERS, renderDeployUrl } from './compose.mjs';
import { sealSecretForGitHub } from './sealedbox.mjs';
import { zip } from './zip.mjs';

const $ = (id) => document.getElementById(id);
const log = (m) => { $('log').textContent += `${m}\n`; };
const API = 'https://api.github.com';

let catalog = [];
let provider = 'github-pages';

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

function renderApps(filter = '') {
  const f = filter.toLowerCase();
  const sel = $('app');
  const keep = sel.value;
  sel.innerHTML = '';
  const hits = catalog.filter((a) => !f || `${a.slug} ${a.title} ${a.description}`.toLowerCase().includes(f));
  for (const a of hits.slice(0, 400)) sel.add(new Option(a.title || a.slug, a.slug));
  if (hits.some((a) => a.slug === keep)) sel.value = keep;
  $('count').textContent = `(${hits.length} of ${catalog.length})`;
  showDesc();
}

function showDesc() {
  const a = catalog.find((x) => x.slug === $('app').value);
  $('desc').textContent = a ? a.description : '';
  renderProviders();
  refresh();
}

const isServer = () => !!catalog.find((a) => a.slug === $('app').value)?.server;

/** Static apps: GitHub Pages / AWS. Server apps: also Render. */
function renderProviders() {
  const box = $('providers');
  box.innerHTML = '';
  if (PROVIDERS[provider].serverOnly && !isServer()) provider = 'github-pages';
  for (const [id, p] of Object.entries(PROVIDERS)) {
    if (p.serverOnly && !isServer()) continue;
    const l = document.createElement('label');
    l.className = 'opt';
    l.innerHTML = `<input type="radio" name="prov" value="${id}"${id === provider ? ' checked' : ''}> <span><strong>${p.label}</strong><br><span class="muted">${p.blurb}</span></span>`;
    box.append(l);
  }
  $('aws').hidden = !PROVIDERS[provider].needs.includes('aws');
}

function refresh() {
  const needs = PROVIDERS[provider].needs;
  const haveCreds = $('gh').value.trim() && (!needs.includes('aws') || ($('ak').value.trim() && $('sk').value.trim() && $('rg').value.trim()));
  $('go').disabled = PROVIDERS[provider].downloadOnly || !($('ack').checked && haveCreds && $('app').value);
  $('dl').disabled = !($('ack').checked && $('app').value);
}

async function build() {
  const slug = $('app').value;
  const title = catalog.find((a) => a.slug === slug)?.title ?? slug;
  if (provider === 'render' || provider === 'docker') {
    const [templates, serverFiles] = await Promise.all([getJSON('templates.json'), getJSON(`servers/${slug}.json`)]);
    return { slug, files: composeRepo({ slug, title, provider, serverFiles, templates }) };
  }
  const [templates, appFiles] = await Promise.all([getJSON('templates.json'), getJSON(`apps/${slug}.json`)]);
  return { slug, files: composeRepo({ slug, title, provider, appFiles, templates }) };
}

const toB64 = (v) => {
  const bytes = typeof v === 'string' ? new TextEncoder().encode(v) : v;
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

async function gh(token, method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok && !(r.status === 404 && method === 'GET')) {
    const t = await r.text();
    throw new Error(`GitHub ${method} ${path} -> ${r.status} ${t.slice(0, 200)}`);
  }
  return r.status === 204 ? null : r.status === 404 ? null : r.json().catch(() => null);
}

function randomHex(n) {
  return [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function deploy() {
  $('log').textContent = '';
  $('done').hidden = true;
  $('go').disabled = $('dl').disabled = true;
  const token = $('gh').value.trim();
  try {
    log('Composing your repository…');
    const { slug, files } = await build();
    const p = PROVIDERS[provider];

    const me = await gh(token, 'GET', '/user');
    log(`Signed in to GitHub as ${me.login}.`);
    let name = `${slug}`.slice(0, 80);
    let repo = await gh(token, 'GET', `/repos/${me.login}/${name}`);
    if (repo) name = `${name}-${randomHex(2)}`;
    log(`Creating ${p.repoPrivate ? 'private' : 'public'} repository ${me.login}/${name}…`);
    repo = await gh(token, 'POST', '/user/repos', { name, private: p.repoPrivate, auto_init: true, description: `Self-hosted copy of ${slug}` });

    if (p.needs.includes('aws')) {
      log('Encrypting your AWS credentials in this tab and storing them as Actions secrets…');
      const key = await gh(token, 'GET', `/repos/${me.login}/${name}/actions/secrets/public-key`);
      const secrets = {
        AWS_ACCESS_KEY_ID: $('ak').value.trim(),
        AWS_SECRET_ACCESS_KEY: $('sk').value.trim(),
        TOFU_STATE_PASSPHRASE: randomHex(24),
      };
      for (const [k, v] of Object.entries(secrets)) {
        await gh(token, 'PUT', `/repos/${me.login}/${name}/actions/secrets/${k}`, { encrypted_value: sealSecretForGitHub(v, key.key), key_id: key.key_id });
      }
      await gh(token, 'POST', `/repos/${me.login}/${name}/actions/variables`, { name: 'AWS_REGION', value: $('rg').value.trim() });
      log('The OpenTofu state passphrase was generated in this tab and stored only as a secret in your repository (GitHub never shows it again).');
    } else if (provider === 'render') {
      log('Render reads the blueprint from this repository; no secrets are stored in it.');
    } else if (provider === 'android') {
      log('The Android build runs in your repository\'s own GitHub Actions; no secrets are needed for the debug APK.');
    } else {
      log('Turning on GitHub Pages (build: GitHub Actions)…');
      await gh(token, 'POST', `/repos/${me.login}/${name}/pages`, { build_type: 'workflow' });
    }

    const entries = Object.entries(files).filter(([, v]) => v !== '');
    log(`Uploading ${entries.length} files…`);
    for (const [path, content] of entries) {
      const url = `/repos/${me.login}/${name}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
      const existing = await gh(token, 'GET', url);
      await gh(token, 'PUT', url, { message: `Add ${path}`, content: toB64(content), ...(existing?.sha ? { sha: existing.sha } : {}) });
    }

    if (provider === 'render') {
      const repoUrl = `https://github.com/${me.login}/${name}`;
      $('done').hidden = false;
      $('done').innerHTML = `<div class="card"><strong>Your repository is ready:</strong> <a href="${repoUrl}" rel="noopener">${me.login}/${name}</a>. Last step: <a href="${renderDeployUrl(repoUrl)}" rel="noopener"><strong>open it in Render</strong></a> (sign in to your own Render account; it asks for the secrets and shows the price). Then delete the GitHub token you used here.</div>`;
      log('Finished.');
      return;
    }
    log('Starting the first deploy…');
    await gh(token, 'POST', `/repos/${me.login}/${name}/actions/workflows/deploy.yml/dispatches`, { ref: repo.default_branch ?? 'main' });

    const actions = `https://github.com/${me.login}/${name}/actions`;
    const live = provider === 'github-pages' ? `https://${me.login}.github.io/${name}/` : null;
    $('done').hidden = false;
    $('done').innerHTML = `<div class="card"><strong>Done.</strong> Your repository is <a href="https://github.com/${me.login}/${name}" rel="noopener">${me.login}/${name}</a>. The first deploy is running: <a href="${actions}" rel="noopener">watch it here</a>.` +
      (live ? ` When it finishes (about a minute) your copy is at <a href="${live}" rel="noopener">${live}</a>.` : provider === 'android' ? ` When it finishes (about five minutes) open the run and download <strong>app-debug-apk</strong> from its Artifacts.` : ` The live URL appears in the run’s summary.`) +
      ` Now delete the token you used.</div>`;
    log('Finished.');
  } catch (e) {
    log(`Stopped: ${e.message}`);
    log('Nothing else was changed. You can delete the repository it created, or fix the problem and run again.');
  } finally {
    refresh();
  }
}

async function download() {
  $('log').textContent = '';
  try {
    const { slug, files } = await build();
    const blob = new Blob([zip(files)], { type: 'application/zip' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${slug}-self-deploy.zip` });
    a.click();
    URL.revokeObjectURL(a.href);
    log(`Built ${Object.keys(files).length} files. ` + (provider === 'docker'
      ? 'Unzip, then follow README.md: sh setup.sh && docker compose up -d --build.'
      : 'Unzip, push to a new repository (set the secrets listed in README.md) or run the tofu/ module locally.'));
  } catch (e) {
    log(`Stopped: ${e.message}`);
  }
}

async function main() {
  catalog = await getJSON('catalog.json');
  const want = new URLSearchParams(location.search).get('app');
  renderApps();
  if (want && catalog.some((a) => a.slug === want)) { $('app').value = want; showDesc(); }
  $('q').addEventListener('input', () => renderApps($('q').value));
  $('app').addEventListener('change', showDesc);
  $('providers').addEventListener('change', (e) => {
    provider = e.target.value;
    $('aws').hidden = !PROVIDERS[provider].needs.includes('aws');
    refresh();
  });
  for (const id of ['ack', 'gh', 'ak', 'sk', 'rg']) $(id).addEventListener('input', refresh);
  $('go').addEventListener('click', deploy);
  $('dl').addEventListener('click', download);
  refresh();
}
main().catch((e) => log(`Could not load the catalogue: ${e.message}`));
