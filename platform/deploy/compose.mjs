// Assembles the files of one visitor's deploy repository. Pure: no fs, no
// network, so the browser page and the Node tests run the same code.
//
//   composeRepo({ slug, title, provider, appFiles, templates }) -> { path: string | Uint8Array }
//
// appFiles:  { 'index.html': { text } | { b64 } }  (the venture's static site)
// templates: { 'github-pages': { 'deploy.yml': '...' }, 'aws': { ... } }  (read from templates/)

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
  render: {
    label: 'Render (a running server)',
    blurb: 'For apps that need a process (webhooks, a database file). Lives in your own Render account (a paid plan; Render bills you). Needs only a GitHub token here; secrets are typed into Render, never here.',
    needs: ['github'],
    repoPrivate: false,
    serverOnly: true,
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

export function composeRepo({ slug, title, provider, appFiles, templates, serverFiles }) {
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
  for (const [rel, content] of Object.entries(tpl)) {
    if (rel.endsWith('.yml')) out[`.github/workflows/${rel}`] = content;
    else if (rel.startsWith('tofu/')) out[rel] = content;
    else out[rel] = content;
  }
  out['README.md'] = readme({ slug, title, provider });
  out['LICENSE'] = templates._license ?? '';
  return out;
}

function readme({ slug, title, provider }) {
  const aws = provider === 'aws';
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
  aws
    ? `
## Tear it down

**Actions -> Destroy -> Run workflow** removes the bucket and CloudFront
distribution. Your encrypted OpenTofu state lives in \`state/\`; the passphrase
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
