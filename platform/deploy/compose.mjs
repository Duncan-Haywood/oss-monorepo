// Assembles the files of one visitor's deploy repository. Pure: no fs, no
// network, so the browser page and the Node tests run the same code.
//
//   composeRepo({ slug, title, provider, appFiles, templates }) -> { path: string | Uint8Array }
//
// appFiles:  { 'index.html': { text } | { b64 } }  (the venture's static site)
// templates: { 'github-pages': { 'deploy.yml': '...' }, 'aws': { ... }, 'gcp': { ... } }  (read from templates/)

export const DONATE_URL = 'https://buymeacoffee.com/duncanhaywood';
export const PROVIDERS = {
  'github-pages': {
    label: 'GitHub Pages',
    blurb: 'Free. Lives in your own GitHub account. Needs only a GitHub token.',
    needs: ['github'],
    repoPrivate: false,
  },
  aws: {
    label: 'AWS (S3 + CloudFront)',
    blurb: 'Your own AWS account, set up with OpenTofu. Costs cents a month at low traffic.',
    needs: ['github', 'aws'],
    repoPrivate: true,
  },
  gcp: {
    label: 'Google Cloud Storage',
    blurb: 'Your own Google Cloud project, set up with OpenTofu. A public bucket served over HTTPS; costs cents a month at low traffic. Needs a service-account key.',
    needs: ['github', 'gcp'],
    repoPrivate: true,
  },
  azure: {
    label: 'Microsoft Azure (Storage static website)',
    blurb: 'Your own Azure subscription, set up with OpenTofu. A storage account serving the site over HTTPS; costs cents a month at low traffic. Needs a service principal.',
    needs: ['github', 'azure'],
    repoPrivate: true,
  },
  android: {
    label: 'Android app (APK + Play bundle)',
    blurb: 'Wraps this app in a native Android shell (Capacitor) and builds it in your own GitHub Actions: a debug APK you can install on your phone, and a signed Play Store bundle if you add your own keystore secrets. Free for a public repository. Publishing to Google Play stays your step, with your own developer account.',
    needs: ['github'],
    repoPrivate: false,
  },
  render: {
    label: 'Render (a running server)',
    blurb: 'For apps that need a process (webhooks, a database file). Lives in your own Render account (a paid plan; Render bills you). Needs only a GitHub token here; secrets are typed into Render, never here.',
    needs: ['github'],
    repoPrivate: false,
    serverOnly: true,
  },
  fly: {
    label: 'Fly.io (a running server, from your terminal)',
    blurb: 'For apps that need a process. Download a folder with a ready fly.toml and the exact flyctl commands; you deploy it from your own terminal into your own Fly.io account (Fly bills you). No token is typed here; secrets go straight to Fly with flyctl. Download only.',
    needs: [],
    repoPrivate: true,
    serverOnly: true,
    downloadOnly: true,
  },
  docker: {
    label: 'Docker Compose (any server you control)',
    blurb: 'For apps that need a process. Download a folder with a compose file and a setup script; run it on any VPS, Raspberry Pi or home server with Docker. No account, no token, no third party. Download only.',
    needs: [],
    repoPrivate: true,
    serverOnly: true,
    downloadOnly: true,
  },
};

const FOOTER_MARK = 'data-self-deployed-footer';

/** Operator notice + the donate-to-the-creator link, added once, before </body>. */
export function withDeployFooter(html) {
  if (html.includes(FOOTER_MARK)) return html;
  const footer =
    `<p ${FOOTER_MARK} style="font:13px/1.5 system-ui,sans-serif;text-align:center;color:#555;margin:2rem 1rem">` +
    `This is a self-hosted copy of an open-source tool (MIT). It is run by whoever deployed it, not by its creator, and comes with no warranty. ` +
    `<a href="${DONATE_URL}" rel="noopener">Buy the creator a coffee</a>.</p>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${footer}\n</body>`) : html + footer;
}

const decodeB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Link that opens Render's blueprint deploy for a repository URL. */
export const renderDeployUrl = (repoUrl) => `https://render.com/deploy?repo=${encodeURIComponent(repoUrl)}`;

function composeServerRepo({ slug, title, serverFiles }) {
  if (!serverFiles || !serverFiles['render.yaml'] || !serverFiles['Dockerfile']) throw new Error('app has no server files');
  const out = {};
  for (const [rel, f] of Object.entries(serverFiles)) {
    if (rel.includes('..') || rel.startsWith('/')) throw new Error(`unsafe path: ${rel}`);
    // render.yaml in the venture points dockerContext at ventures/<slug>, so keep that layout.
    if (f.text !== undefined) out[`ventures/${slug}/${rel}`] = rel === 'index.html' ? withDeployFooter(f.text) : f.text;
    else out[`ventures/${slug}/${rel}`] = decodeB64(f.b64);
  }
  out['render.yaml'] = serverFiles['render.yaml'].text;
  out['README.md'] = `# ${title}

Your own copy of **${title}**, a server app from the open-source portfolio
(\`ventures/${slug}\`). It runs on **Render** in your own account.

## Finish the deploy

1. Open Render's blueprint page for this repository (the deploy page gave you the link).
2. Render reads \`render.yaml\`, shows the environment variables it needs, and asks you
   for the ones marked secret. Type them **into Render**; they never pass through the
   creator or the deploy page.
3. Read the comments at the top of \`render.yaml\` (some apps start in a safe dry-run mode).

## You are the operator

This copy runs in your account. You are responsible for it: its domain, terms, privacy
policy, customers' data and any changes you make. The creator does not host it, sees none
of its traffic, and provides it as-is under the MIT license, with no warranty.

## Tear it down

Delete the service in Render, then delete this repository.

## Support the creator

It is free. If it earns you money, [buy the creator a coffee](${DONATE_URL}).
`;
  out['LICENSE'] = '';
  return out;
}

/** envVars of a render.yaml blueprint: [{ key, value?, generate?, secret? }]. Line scan, no YAML dependency. */
export function blueprintEnv(yaml) {
  const out = [];
  let inEnv = false;
  let cur = null;
  for (const line of yaml.split('\n')) {
    if (/^\s*envVars:\s*$/.test(line)) { inEnv = true; continue; }
    if (!inEnv) continue;
    const k = line.match(/^\s*-\s*key:\s*(\S+)\s*$/);
    if (k) { cur = { key: k[1] }; out.push(cur); continue; }
    if (cur && /^\s+\S/.test(line)) {
      const v = line.match(/^\s+value:\s*(.*?)\s*$/);
      if (v) cur.value = v[1].replace(/^(["'])(.*)\1$/, '$2');
      if (/^\s+generateValue:\s*true/.test(line)) cur.generate = true;
      if (/^\s+sync:\s*false/.test(line)) cur.secret = true;
    } else if (line.trim() && !/^\s*#/.test(line)) { inEnv = false; cur = null; }
  }
  return out;
}

const shq = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;

function composeDockerBundle({ slug, title, serverFiles }) {
  if (!serverFiles || !serverFiles['render.yaml'] || !serverFiles['Dockerfile']) throw new Error('app has no server files');
  const out = {};
  for (const [rel, f] of Object.entries(serverFiles)) {
    if (rel.includes('..') || rel.startsWith('/')) throw new Error(`unsafe path: ${rel}`);
    if (rel === 'render.yaml') continue;
    if (f.text !== undefined) out[`app/${rel}`] = rel === 'index.html' ? withDeployFooter(f.text) : f.text;
    else out[`app/${rel}`] = decodeB64(f.b64);
  }
  const yaml = serverFiles['render.yaml'].text;
  const env = blueprintEnv(yaml);
  const port = serverFiles['Dockerfile'].text.match(/^\s*EXPOSE\s+(\d+)/m)?.[1] ?? '8080';
  const hasDisk = /^\s*disk:\s*$/m.test(yaml);
  const health = yaml.match(/healthCheckPath:\s*(\S+)/)?.[1];
  // Names come from our own blueprint, but refuse anything that is not a plain variable name.
  for (const e of env) if (!/^[A-Z][A-Z0-9_]*$/.test(e.key)) throw new Error(`unsafe env name: ${e.key}`);
  out['compose.yaml'] = `# Run: sh setup.sh && docker compose up -d --build
# Everything below runs on YOUR machine. Nothing is sent to the creator.
services:
  ${slug}:
    build: ./app
    restart: unless-stopped
    ports:
      - "\${HOST_PORT:-${port}}:${port}"
    env_file: .env
${hasDisk ? `    volumes:\n      - data:/data\n` : ''}${health ? `    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:${port}${health}"]
      interval: 30s
      timeout: 5s
      retries: 3
` : ''}${hasDisk ? 'volumes:\n  data:\n' : ''}`;
  // Unset variables are written commented out, so an app's own default applies instead of an empty string.
  out['.env.example'] = env.map((e) => (e.generate ? `# generated by setup.sh\n${e.key}=` : e.value !== undefined ? `${e.key}=${e.value}` : `# optional or fill in\n# ${e.key}=`)).join('\n') + '\n';
  out['setup.sh'] = `#!/bin/sh
# Creates .env from .env.example and fills the generated secrets with random values.
# Re-running never overwrites an existing .env.
set -eu
[ -e .env ] && { echo ".env already exists; leaving it alone."; exit 0; }
rand() { od -An -N24 -tx1 /dev/urandom | tr -d ' \\n'; }
{
${env.map((e) => (e.generate ? `  printf '%s=%s\\n' ${shq(e.key)} "$(rand)"` : e.value !== undefined ? `  printf '%s=%s\\n' ${shq(e.key)} ${shq(e.value)}` : `  printf '%s\\n' ${shq('# ' + e.key + '=')}`)).join('\n')}
} > .env
chmod 600 .env
echo "Wrote .env. Open it and uncomment and fill in the values you need, then: docker compose up -d --build"
`;
  out['README.md'] = `# ${title}

Your own copy of **${title}**, a server app from the open-source portfolio
(\`ventures/${slug}\`), packaged to run with Docker on a machine you control.

## Run it

\`\`\`
sh setup.sh                  # writes .env with random secrets; uncomment and fill in what you need
docker compose up -d --build
\`\`\`

Then open http://localhost:${port}/. To put it on the internet, run it on a VPS behind a
reverse proxy that terminates HTTPS (Caddy is one line), and set \`PUBLIC_URL\` in \`.env\`.
${hasDisk ? 'Its data lives in the \`data\` Docker volume; back that up.\n' : ''}
Secrets live only in \`.env\` on your machine (mode 600). Do not commit it.

## You are the operator

This copy runs on your machine. You are responsible for it: its domain, terms, privacy
policy, customers' data and any changes you make. The creator does not host it, sees none
of its traffic, and provides it as-is under the MIT license, with no warranty. Some apps
start in a safe dry-run mode; read \`.env.example\`.

## Tear it down

\`docker compose down -v\` (the \`-v\` also deletes its data), then delete this folder.

## Support the creator

It is free. If it earns you money, [buy the creator a coffee](${DONATE_URL}).
`;
  return out;
}

function composeFlyBundle({ slug, title, serverFiles }) {
  if (!serverFiles || !serverFiles['render.yaml'] || !serverFiles['Dockerfile']) throw new Error('app has no server files');
  const out = {};
  for (const [rel, f] of Object.entries(serverFiles)) {
    if (rel.includes('..') || rel.startsWith('/')) throw new Error(`unsafe path: ${rel}`);
    if (rel === 'render.yaml') continue;
    if (f.text !== undefined) out[`app/${rel}`] = rel === 'index.html' ? withDeployFooter(f.text) : f.text;
    else out[`app/${rel}`] = decodeB64(f.b64);
  }
  const yaml = serverFiles['render.yaml'].text;
  const env = blueprintEnv(yaml);
  for (const e of env) if (!/^[A-Z][A-Z0-9_]*$/.test(e.key)) throw new Error(`unsafe env name: ${e.key}`);
  const port = serverFiles['Dockerfile'].text.match(/^\s*EXPOSE\s+(\d+)/m)?.[1] ?? '8080';
  const mount = yaml.match(/^\s*mountPath:\s*(\S+)/m)?.[1];
  const health = yaml.match(/healthCheckPath:\s*(\S+)/)?.[1];
  const literals = env.filter((e) => !e.generate && !e.secret && e.value !== undefined);
  const generated = env.filter((e) => e.generate);
  const secrets = env.filter((e) => e.secret);
  const tomlStr = (v) => `'${String(v).replace(/'/g, '')}'`;
  // No `app = ...` line: Fly app names are global, so flyctl asks for the visitor's own.
  out['fly.toml'] = `# Fly.io config for ${title}. Deploy with the commands in README.md.
primary_region = 'iad'

[build]
  dockerfile = 'app/Dockerfile'

[http_service]
  internal_port = ${port}
  force_https = true
  auto_stop_machines = 'off'
  auto_start_machines = true
  min_machines_running = 1
${health ? `
  [[http_service.checks]]
    method = 'GET'
    path = ${tomlStr(health)}
    interval = '30s'
    timeout = '5s'
    grace_period = '10s'
` : ''}${mount ? `
[mounts]
  source = 'data'
  destination = ${tomlStr(mount)}
` : ''}${literals.length ? `
[env]
${literals.map((e) => `  ${e.key} = ${tomlStr(e.value)}`).join('\n')}
` : ''}`;
  const secretCmds = [
    ...generated.map((e) => `${e.key}=$(openssl rand -hex 24)`),
    ...secrets.map((e) => `${e.key}=...   # optional or required, see app/README.md`),
  ];
  out['README.md'] = `# ${title}

Your own copy of **${title}**, a server app from the open-source portfolio
(\`ventures/${slug}\`), set up to run on **Fly.io** in your own account.

## Deploy it

Install [flyctl](https://fly.io/docs/flyctl/install/) and sign in (\`fly auth login\`), then from this folder:

\`\`\`
fly launch --copy-config --no-deploy      # asks you to name the app; names are global
${mount ? 'fly volumes create data --size 1 --count 1   # its data lives here; back it up\n' : ''}${secretCmds.length ? `fly secrets set \\\n  ${secretCmds.join(' \\\n  ')}\n` : ''}fly deploy${mount ? ' --ha=false' : ''}
\`\`\`

Secrets go from your terminal straight to Fly. They never pass through the creator or
the deploy page${secrets.length ? '; replace each \`...\` above with your own value, or delete the line if you do not need that feature' : ''}.

## You are the operator

This copy runs in your own Fly.io account and Fly bills you. You are responsible for it:
its domain, terms, privacy policy, customers' data and any changes you make. The creator
does not host it, sees none of its traffic, and provides it as-is under the MIT license,
with no warranty. Some apps start in a safe dry-run mode; read \`fly.toml\` and the app's own notes.

## Tear it down

\`fly apps destroy <your-app-name>\` deletes the app and its volume.

## Support the creator

It is free. If it earns you money, [buy the creator a coffee](${DONATE_URL}).
`;
  return out;
}

export function composeRepo({ slug, title, provider, appFiles, templates, serverFiles }) {
  if (provider === 'docker') {
    const out = composeDockerBundle({ slug, title, serverFiles });
    out['LICENSE'] = templates?._license ?? '';
    return out;
  }
  if (provider === 'fly') {
    const out = composeFlyBundle({ slug, title, serverFiles });
    out['LICENSE'] = templates?._license ?? '';
    return out;
  }
  if (provider === 'render') {
    const out = composeServerRepo({ slug, title, serverFiles });
    out['LICENSE'] = templates?._license ?? '';
    return out;
  }
  const p = PROVIDERS[provider];
  if (!p) throw new Error(`unknown provider: ${provider}`);
  const tpl = templates[provider];
  if (!tpl) throw new Error(`no templates for provider: ${provider}`);
  if (!appFiles['index.html']) throw new Error('app has no index.html');

  const out = {};
  for (const [rel, f] of Object.entries(appFiles)) {
    if (rel.includes('..') || rel.startsWith('/')) throw new Error(`unsafe path: ${rel}`);
    if (f.text !== undefined) out[`app/${rel}`] = rel === 'index.html' ? withDeployFooter(f.text) : f.text;
    else out[`app/${rel}`] = decodeB64(f.b64);
  }
  if (provider === 'android') Object.assign(out, androidProject({ slug, title }));
  for (const [rel, content] of Object.entries(tpl)) {
    if (rel.endsWith('.yml')) out[`.github/workflows/${rel}`] = content;
    else if (rel.startsWith('tofu/')) out[rel] = content;
    else out[rel] = content;
  }
  out['README.md'] = readme({ slug, title, provider });
  out['LICENSE'] = templates._license ?? '';
  return out;
}

/** Reverse-DNS application id from a slug: lowercase letters and digits only, every segment starting with a letter. */
export function androidAppId(slug) {
  const seg = String(slug).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^[0-9]+/, '') || 'app';
  return `io.selfhosted.${seg}`;
}

function androidProject({ slug, title }) {
  const cleanTitle = String(title).replace(/[\u0000-\u001f"\\<>&]/g, '').trim().slice(0, 30) || 'App';
  return {
    'capacitor.config.json': JSON.stringify({ appId: androidAppId(slug), appName: cleanTitle, webDir: 'app', server: { androidScheme: 'https' } }, null, 2) + '\n',
    'package.json': JSON.stringify({
      name: String(slug).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      version: '1.0.0',
      private: true,
      description: `Android build of ${cleanTitle}`,
      license: 'MIT',
      dependencies: { '@capacitor/android': '6.2.0', '@capacitor/cli': '6.2.0', '@capacitor/core': '6.2.0' },
    }, null, 2) + '\n',
    '.gitignore': 'node_modules/\nandroid/\n',
  };
}

function readme({ slug, title, provider }) {
  const aws = provider === 'aws' || provider === 'gcp' || provider === 'azure';
  const android = provider === 'android';
  return `# ${title}

Your own copy of **${title}**, deployed from the open-source portfolio
(\`ventures/${slug}\`). Hosted on **${PROVIDERS[provider].label}**.

## You are the operator

This copy runs in your account. You are responsible for it: its domain, terms,
privacy policy, users and any changes you make. The creator does not host it,
sees none of its traffic, and provides it as-is under the MIT license, with no
warranty. Keep the notice at the bottom of the page accurate.

## Redeploy

Change anything under \`app/\` and push to \`main\`, or open **Actions -> Deploy -> Run workflow**.
${
  android
    ? `
## Get the app

Open **Actions -> Deploy** and download \`app-debug-apk\` from the finished run. Copy the
APK to an Android phone you own and open it (Android asks you to allow installs from that
source). It is a debug build: fine for you and your testers, not for the Play Store.

## Publish to Google Play (your account, your step)

1. Create a keystore once: \`keytool -genkeypair -v -keystore release.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000\` and keep it safe. Losing it can lock you out of updates.
2. Add four repository secrets (Settings -> Secrets and variables -> Actions): \`ANDROID_KEYSTORE_B64\` (\`base64 -w0 release.keystore\`), \`ANDROID_KEYSTORE_PASSWORD\`, \`ANDROID_KEY_ALIAS\`, \`ANDROID_KEY_PASSWORD\`.
3. Re-run **Deploy**; it also uploads \`app-release-aab\`. Upload that to your own Google Play Console (a one-time developer fee applies, charged by Google to you).

The app is the website in \`app/\` bundled inside the APK; it works offline. iOS builds need a Mac and an Apple developer account and are not part of this copy.

## Tear it down

Delete this repository.
`
    : aws
    ? `
## Tear it down

**Actions -> Destroy -> Run workflow** removes ${provider === 'gcp' ? 'the Cloud Storage bucket' : provider === 'azure' ? 'the resource group, storage account and site' : 'the bucket and CloudFront\ndistribution'}. Your encrypted OpenTofu state lives in \`state/\`; the passphrase
is the \`TOFU_STATE_PASSPHRASE\` secret. Without it the state cannot be read, so
keep a copy.

To run it from your own machine instead, see \`tofu/README.md\`.
`
    : `
## Tear it down

Delete this repository, or turn off Pages under **Settings -> Pages**.
`
}
## Support the creator

It is free. If it earns you money, [buy the creator a coffee](${DONATE_URL}).
`;
}
