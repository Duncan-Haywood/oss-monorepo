// Search-engine ownership meta tags for the hub page, from
// `platform/seo/site-verification.json`. Verification is what unlocks Google
// Search Console and Bing Webmaster Tools: sitemap submission, the URL
// inspection tool and the clicks/impressions/position data the ranking
// feedback loop (`platform/seo/probe.py gsc`) reads. A meta tag rather than a
// `google<token>.html` file, because a bare root HTML file would trip the
// site's own page checks (title, h1, sitemap coverage) for no gain.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const VERIFICATION_FILE = fileURLToPath(new URL('../seo/site-verification.json', import.meta.url));

const META_NAME = {
  google: 'google-site-verification',
  bing: 'msvalidate.01',
  yandex: 'yandex-verification',
};

// Every engine's token is URL-safe base64 or hex; anything else is a paste
// mistake (a whole tag, quotes), refused loudly rather than published broken.
const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;

export function verificationTags(conf) {
  const tags = [];
  for (const [engine, name] of Object.entries(META_NAME)) {
    const tokens = conf?.[engine] ?? [];
    if (!Array.isArray(tokens)) throw new Error(`site-verification.json: ${engine} must be a list`);
    for (const token of tokens) {
      if (typeof token !== 'string' || !TOKEN_RE.test(token)) {
        throw new Error(
          `site-verification.json: ${engine} token ${JSON.stringify(token)} is not a bare token ` +
            '(paste only the content="..." value)',
        );
      }
      tags.push(`<meta name="${name}" content="${token}">`);
    }
  }
  return tags;
}

export function loadVerificationTags(file = VERIFICATION_FILE) {
  if (!fs.existsSync(file)) return [];
  return verificationTags(JSON.parse(fs.readFileSync(file, 'utf8')));
}

export const verificationHead = (file) =>
  loadVerificationTags(file).map((t) => `\n  ${t}`).join('');

