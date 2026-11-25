import { composeRepo, PROVIDERS, renderDeployUrl } from './compose.mjs';
import { sealSecretForGitHub } from './sealedbox.mjs';
import { zip } from './zip.mjs';
import { makeGh, storeSecrets, pushFiles, newProgress, failureMessage } from './publish.mjs';

const $ = (id) => document.getElementById(id);
const log = (m) => { $('log').textContent += `${m}\n`; };
/** Build an element from text and child nodes (never parses HTML, so names and logins stay text). */
const el = (tag, attrs, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  n.append(...kids);
  return n;
};
const link = (href, ...kids) => el('a', { href, rel: 'noopener' }, ...kids);
const showDone = (...kids) => { $('done').hidden = false; $('done').replaceChildren(el('div', { class: 'card' }, ...kids)); };

let catalog = [];
let provider = 'github-pages';

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

function renderApps(filter = '', keep = $('app').value) {
  const f = filter.toLowerCase();
  const sel = $('app');
  sel.innerHTML = '';
  const hits = catalog.filter((a) => !f || `${a.slug} ${a.title} ${a.description}`.toLowerCase().includes(f));
  // The list shows 400 options; the selected tool (a ?app= link from any tool
  // page's footer) stays in it even when it sorts past them.
  const shown = hits.slice(0, 400);
  const kept = hits.find((a) => a.slug === keep);
  if (kept && !shown.includes(kept)) shown.unshift(kept);
  for (const a of shown) sel.add(new Option(a.title || a.slug, a.slug));
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

/** Static apps: GitHub Pages / AWS / Google Cloud. Server apps: also Render. */
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
  showCreds();
}

function showCreds() {
  for (const c of ['aws', 'gcp', 'azure', 'cloudflare']) $(c).hidden = !PROVIDERS[provider].needs.includes(c);
}

function refresh() {
  const needs = PROVIDERS[provider].needs;
  const haveCreds = $('gh').value.trim()
    && (!needs.includes('aws') || ($('ak').value.trim() && $('sk').value.trim() && $('rg').value.trim()))
    && (!needs.includes('gcp') || ($('gk').value.trim() && $('gp').value.trim()))
    && (!needs.includes('azure') || ($('zc').value.trim() && $('zs').value.trim() && $('zt').value.trim() && $('zb').value.trim()))
    && (!needs.includes('cloudflare') || ($('cf').value.trim() && $('ca').value.trim()));
  $('go').disabled = PROVIDERS[provider].downloadOnly || !($('ack').checked && haveCreds && $('app').value);
  $('dl').disabled = !($('ack').checked && $('app').value);
}

async function build() {
  const slug = $('app').value;
  const title = catalog.find((a) => a.slug === slug)?.title ?? slug;
  if (provider === 'render' || provider === 'docker' || provider === 'fly') {
    const [templates, serverFiles] = await Promise.all([getJSON('templates.json'), getJSON(`servers/${slug}.json`)]);
    return { slug, files: composeRepo({ slug, title, provider, serverFiles, templates }) };
  }
  const [templates, appFiles] = await Promise.all([getJSON('templates.json'), getJSON(`apps/${slug}.json`)]);
  return { slug, files: composeRepo({ slug, title, provider, appFiles, templates }) };
}

function randomHex(n) {
  return [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const STATE_NOTE = 'The OpenTofu state passphrase was generated in this tab and stored only as a secret in your repository (GitHub never shows it again).';

/** The Actions secrets and variables each provider needs, read from the form. */
function credentials() {
  const v = (id) => $(id).value.trim();
  const needs = PROVIDERS[provider].needs;
  if (needs.includes('aws')) {
    return {
      what: 'AWS credentials',
      secrets: { AWS_ACCESS_KEY_ID: v('ak'), AWS_SECRET_ACCESS_KEY: v('sk'), TOFU_STATE_PASSPHRASE: randomHex(24) },
      variables: { AWS_REGION: v('rg'), BUDGET_EMAIL: v('ab') },
      note: STATE_NOTE,
    };
  }
  if (needs.includes('gcp')) {
    let sa;
    try { sa = JSON.parse($('gk').value); } catch { throw new Error('the service-account key is not valid JSON'); }
    if (sa.type !== 'service_account' || !sa.private_key) throw new Error('that does not look like a service-account key file');
    return {
      what: 'Google Cloud key',
      secrets: { GOOGLE_CREDENTIALS: JSON.stringify(sa), TOFU_STATE_PASSPHRASE: randomHex(24) },
      variables: { GCP_PROJECT: v('gp'), GCP_LOCATION: v('gl') || 'US', GCP_BILLING_ACCOUNT: v('gb') },
      note: STATE_NOTE,
    };
  }
  if (needs.includes('azure')) {
    return {
      what: 'Azure credentials',
      secrets: { ARM_CLIENT_ID: v('zc'), ARM_CLIENT_SECRET: v('zs'), ARM_TENANT_ID: v('zt'), ARM_SUBSCRIPTION_ID: v('zb'), TOFU_STATE_PASSPHRASE: randomHex(24) },
      variables: { AZURE_LOCATION: v('zl') || 'eastus', BUDGET_EMAIL: v('ze') },
      note: STATE_NOTE,
    };
  }
  if (needs.includes('cloudflare')) {
    return { what: 'Cloudflare credentials', secrets: { CLOUDFLARE_API_TOKEN: v('cf'), CLOUDFLARE_ACCOUNT_ID: v('ca') }, variables: {} };
  }
  return null;
}

async function deploy() {
  $('log').textContent = '';
  $('done').hidden = true;
  $('go').disabled = $('dl').disabled = true;
  const gh = makeGh($('gh').value.trim());
  const progress = newProgress();
  try {
    log('Composing your repository…');
    const { slug, files } = await build();
    const p = PROVIDERS[provider];
    const creds = credentials();

    const me = await gh('GET', '/user');
    log(`Signed in to GitHub as ${me.login}.`);
    let name = `${slug}`.slice(0, 80);
    if (await gh('GET', `/repos/${me.login}/${name}`, undefined, { allow404: true })) name = `${name}-${randomHex(2)}`;
    log(`Creating ${p.repoPrivate ? 'private' : 'public'} repository ${me.login}/${name}…`);
    const repo = await gh('POST', '/user/repos', { name, private: p.repoPrivate, auto_init: true, description: `Self-hosted copy of ${slug}` });
    const full = `${me.login}/${name}`;
    progress.repo = full;

    if (creds) {
      log(`Encrypting your ${creds.what} in this tab and storing them as Actions secrets…`);
      await storeSecrets(gh, full, creds.secrets, creds.variables, sealSecretForGitHub, progress);
      if (creds.note) log(creds.note);
    } else if (provider === 'render') {
      log('Render reads the blueprint from this repository; no secrets are stored in it.');
    } else if (provider === 'android') {
      log('The Android build runs in your repository\'s own GitHub Actions; no secrets are needed for the debug APK.');
    } else {
      log('Turning on GitHub Pages (build: GitHub Actions)…');
      await gh('POST', `/repos/${full}/pages`, { build_type: 'workflow' });
      progress.pages = true;
    }

    const branch = repo.default_branch ?? 'main';
    log(`Uploading ${Object.values(files).filter((v) => v !== '').length} files as one commit…`);
    await pushFiles(gh, full, branch, files, { message: `Add ${slug}` });
    progress.pushed = true;

    if (provider === 'render') {
      const repoUrl = `https://github.com/${full}`;
      showDone(el('strong', null, 'Your repository is ready:'), ' ', link(repoUrl, full), '. Last step: ',
        link(renderDeployUrl(repoUrl), el('strong', null, 'open it in Render')),
        ' (sign in to your own Render account; it asks for the secrets and shows the price). Then delete the GitHub token you used here.');
      log('Finished.');
      return;
    }
    // The commit already starts the workflow (it changes app/); the dispatch makes
    // sure a run starts even if GitHub skips that push event. A second run is a
    // harmless redeploy (each template sets a concurrency group).
    log('Starting the first deploy…');
    await gh('POST', `/repos/${full}/actions/workflows/deploy.yml/dispatches`, { ref: branch });

    const actions = `https://github.com/${full}/actions`;
    const live = provider === 'github-pages' ? `https://${me.login}.github.io/${name}/` : null;
    const next = live ? [' When it finishes (about a minute) your copy is at ', link(live, live), '.']
      : provider === 'android' ? [' When it finishes (about five minutes) open the run and download ', el('strong', null, 'app-debug-apk'), ' from its Artifacts.']
      : [' The live URL appears in the run’s summary.'];
    showDone(el('strong', null, 'Done.'), ' Your repository is ', link(`https://github.com/${full}`, full), '. The first deploy is running: ',
      link(actions, 'watch it here'), '.', ...next, ' Now delete the token you used.');
    log('Finished.');
  } catch (e) {
    log(`Stopped: ${e.message}`);
    log(failureMessage(progress));
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
      : provider === 'fly'
      ? 'Unzip, then follow README.md: fly launch --copy-config --no-deploy, set secrets, fly deploy.'
      : 'Unzip, push to a new repository (set the secrets listed in README.md) or run the tofu/ module locally.'));
  } catch (e) {
    log(`Stopped: ${e.message}`);
  }
}

async function main() {
  catalog = await getJSON('catalog.json');
  // Tools over the size limits are not in the list; say which, rather than let them vanish.
  getJSON('skipped.json').then((skipped) => {
    if (!skipped.length) return;
    $('toolarge').hidden = false;
    $('toolarge').textContent = `Not listed (${skipped.length}, too large for one-click deploy): ${skipped.map((s) => s.slug).join(', ')}. Their source is in the repository under ventures/; download it there and host the folder yourself.`;
  }).catch(() => {});
  const want = new URLSearchParams(location.search).get('app');
  renderApps('', want);
  $('q').addEventListener('input', () => renderApps($('q').value));
  $('app').addEventListener('change', showDesc);
  $('providers').addEventListener('change', (e) => {
    provider = e.target.value;
    showCreds();
    refresh();
  });
  for (const id of ['ack', 'gh', 'ak', 'sk', 'rg', 'gk', 'gp', 'gl']) $(id).addEventListener('input', refresh);
  $('go').addEventListener('click', deploy);
  $('dl').addEventListener('click', download);
  refresh();
}
main().catch((e) => log(`Could not load the catalogue: ${e.message}`));
