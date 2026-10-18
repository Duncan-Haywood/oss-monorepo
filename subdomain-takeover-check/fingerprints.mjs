// The provider fingerprint table this whole venture is built on: for each
// third-party host a CNAME can point at, a pattern that recognises the CNAME
// target and a body fingerprint that recognises that provider's own "nothing
// is claimed at this name" response page.
//
// A subdomain takeover happens when (1) a DNS CNAME still points at a
// third-party service, but (2) whatever used to be configured there (an S3
// bucket, a Heroku app, a GitHub Pages site) has been deleted or was never
// created, so (3) the service's own edge answers with a generic "not found"
// page instead of 404-ing the DNS name itself -- and (4) most of these
// services let *anyone* claim that unclaimed name on their platform, which
// then makes the victim's own subdomain serve the attacker's content, under
// the victim's own domain, including its cookies and any CSP/CORS trust that
// domain carries.
//
// This list is deliberately curated rather than exhaustive -- see
// README.md's "Coverage, deliberately partial" section. Every fingerprint
// below is public information: the same "which page comes back when nothing
// is configured" signatures documented across years of public security
// research and the open-source subdomain-takeover scanners that predate this
// tool (documented independently here, not reproduced from any one source).
// A miss (a real dangling record whose provider or wording isn't in this
// table) is reported as `no-known-provider`, never as a false "safe" --
// see analyze.mjs.
//
// `vulnerable` records this portfolio's own best current read of whether the
// provider still allows an unauthenticated visitor to claim an arbitrary
// unclaimed name (`true`), has shipped domain-verification or a similar
// mitigation since the class became well known (`false` -- worth knowing
// about but a materially lower real risk), or is genuinely unclear from
// public documentation alone (`null`). This can go stale as providers ship
// or roll back mitigations -- `note` says why the read is what it is, and
// `analyze.mjs` never escalates severity on the strength of `vulnerable`
// alone; see its own header.

export const PROVIDERS = [
  {
    id: 'aws-s3',
    name: 'Amazon S3 (static website hosting)',
    cnamePattern: /(^|\.)s3(-website[.-][a-z0-9-]+)?\.amazonaws\.com$/i,
    fingerprint: /NoSuchBucket|The specified bucket does not exist/i,
    vulnerable: true,
    docsUrl: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html',
    note: 'Verified live against a real, deliberately nonexistent bucket while building this tool: a GET returns HTTP 404 with an XML body containing exactly this "NoSuchBucket" code.',
  },
  {
    id: 'heroku',
    name: 'Heroku',
    cnamePattern: /(^|\.)herokuapp\.com$/i,
    fingerprint: /No such app/i,
    vulnerable: true,
    docsUrl: 'https://blog.heroku.com/heroku-dns-target-record',
    note: 'A deleted or renamed app leaves the DNS target dangling; Heroku will let a new app claim the same name.',
  },
  {
    id: 'github-pages',
    name: 'GitHub Pages',
    cnamePattern: /(^|\.)github\.io$/i,
    fingerprint: /There isn'?t a GitHub Pages site here/i,
    vulnerable: true,
    docsUrl: 'https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages',
    note: 'GitHub added domain verification in 2018, which blocks a second account from attaching an already-verified custom domain to a different repository -- but a domain that was never verified, or whose verification lapsed, is still claimable.',
  },
  {
    id: 'azure-websites',
    name: 'Microsoft Azure App Service',
    cnamePattern: /(^|\.)azurewebsites\.net$/i,
    fingerprint: /404 Web Site not found|Error 404 - Web app not found/i,
    vulnerable: true,
    docsUrl: 'https://learn.microsoft.com/en-us/azure/app-service/app-service-web-tutorial-custom-domain',
    note: null,
  },
  {
    id: 'azure-blob',
    name: 'Microsoft Azure Blob Storage / static website',
    cnamePattern: /(^|\.)blob\.core\.windows\.net$/i,
    fingerprint: /BlobNotFound|The specified (blob|container) does not exist/i,
    vulnerable: true,
    docsUrl: 'https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-static-website',
    note: null,
  },
  {
    id: 'azure-trafficmanager',
    name: 'Microsoft Azure Traffic Manager',
    cnamePattern: /(^|\.)trafficmanager\.net$/i,
    fingerprint: /Error 404 - Web app not found|This Traffic Manager profile does not exist/i,
    vulnerable: true,
    docsUrl: 'https://learn.microsoft.com/en-us/azure/traffic-manager/traffic-manager-overview',
    note: null,
  },
  {
    id: 'fastly',
    name: 'Fastly',
    cnamePattern: /(^|\.)fastly\.net$/i,
    fingerprint: /Fastly error: unknown domain/i,
    vulnerable: null,
    docsUrl: 'https://www.fastly.com/documentation/guides/basics/domains/',
    note: 'Fastly requires a service to be configured for the domain; whether an arbitrary visitor can attach one to an unclaimed name depends on the specific Fastly account setup this tool cannot see from the outside.',
  },
  {
    id: 'shopify',
    name: 'Shopify',
    cnamePattern: /(^|\.)myshopify\.com$/i,
    fingerprint: /Sorry, this shop is currently unavailable/i,
    vulnerable: false,
    docsUrl: 'https://help.shopify.com/en/manual/domains',
    note: 'Shopify has shipped mitigations for this class since it became widely reported; treat a match here as worth a manual look rather than a confirmed live exposure.',
  },
  {
    id: 'unbounce',
    name: 'Unbounce',
    cnamePattern: /(^|\.)unbouncepages\.com$/i,
    fingerprint: /The requested URL was not found on this server/i,
    vulnerable: true,
    docsUrl: 'https://unbounce.com/',
    note: null,
  },
  {
    id: 'tumblr',
    name: 'Tumblr',
    cnamePattern: /(^|\.)tumblr\.com$/i,
    fingerprint: /Whatever you (are|were) looking for doesn'?t currently exist/i,
    vulnerable: true,
    docsUrl: 'https://tumblr.com/',
    note: null,
  },
  {
    id: 'wordpress-com',
    name: 'WordPress.com',
    cnamePattern: /(^|\.)wordpress\.com$/i,
    fingerprint: /Do you want to register/i,
    vulnerable: true,
    docsUrl: 'https://wordpress.com/support/domains/map-existing-domain/',
    note: null,
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    cnamePattern: /(^|\.)zendesk\.com$/i,
    fingerprint: /Help Center Closed/i,
    vulnerable: true,
    docsUrl: 'https://support.zendesk.com/hc/en-us/articles/4408845838746',
    note: null,
  },
  {
    id: 'statuspage',
    name: 'Statuspage (Atlassian)',
    cnamePattern: /(^|\.)statuspage\.io$/i,
    fingerprint: /You are being redirected|company not found/i,
    vulnerable: true,
    docsUrl: 'https://support.atlassian.com/statuspage/docs/getting-started-with-statuspage/',
    note: null,
  },
  {
    id: 'surge',
    name: 'Surge.sh',
    cnamePattern: /(^|\.)surge\.sh$/i,
    fingerprint: /project not found/i,
    vulnerable: true,
    docsUrl: 'https://surge.sh/help/adding-a-custom-domain',
    note: null,
  },
  {
    id: 'helpjuice',
    name: 'Helpjuice',
    cnamePattern: /(^|\.)helpjuice\.com$/i,
    fingerprint: /We could not find what you'?re looking for/i,
    vulnerable: true,
    docsUrl: 'https://helpjuice.com/',
    note: null,
  },
  {
    id: 'helpscout-docs',
    name: 'Help Scout Docs',
    cnamePattern: /(^|\.)helpscoutdocs\.com$/i,
    fingerprint: /No settings were found for this company/i,
    vulnerable: true,
    docsUrl: 'https://docs.helpscout.com/article/42-setting-up-custom-domains',
    note: null,
  },
  {
    id: 'cargocollective',
    name: 'Cargo Collective',
    cnamePattern: /(^|\.)cargocollective\.com$/i,
    fingerprint: /404 Not Found/i,
    vulnerable: true,
    docsUrl: 'https://cargocollective.com/',
    note: null,
  },
  {
    id: 'uservoice',
    name: 'UserVoice',
    cnamePattern: /(^|\.)uservoice\.com$/i,
    fingerprint: /This UserVoice subdomain is currently available/i,
    vulnerable: true,
    docsUrl: 'https://www.uservoice.com/',
    note: null,
  },
  {
    id: 'ghost',
    name: 'Ghost(Pro)',
    cnamePattern: /(^|\.)ghost\.io$/i,
    fingerprint: /The thing you were looking for is no longer here/i,
    vulnerable: null,
    docsUrl: 'https://ghost.org/help/custom-domains/',
    note: 'Ghost(Pro) ties a custom domain to a paid site\'s own settings; public documentation does not make clear whether an unclaimed subdomain name itself can be claimed by a new site.',
  },
  {
    id: 'webflow',
    name: 'Webflow',
    cnamePattern: /(^|\.)webflow\.io$/i,
    fingerprint: /The page you are looking for doesn'?t exist or has been moved/i,
    vulnerable: null,
    docsUrl: 'https://university.webflow.com/lesson/custom-domain',
    note: 'Webflow requires the custom domain to be added inside the claiming site\'s own project settings; public documentation does not confirm whether that step alone is sufficient with no further verification.',
  },
  {
    id: 'netlify',
    name: 'Netlify',
    cnamePattern: /(^|\.)netlify\.app$/i,
    fingerprint: /Not Found - Request ID/i,
    vulnerable: false,
    docsUrl: 'https://docs.netlify.com/domains-https/custom-domains/',
    note: 'Netlify requires the domain to be added to a specific site in the claiming account and has shipped anti-takeover checks; treat a match here as worth a manual look rather than a confirmed live exposure.',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    cnamePattern: /(^|\.)vercel-dns\.com$|(^|\.)vercel\.app$/i,
    fingerprint: /The deployment could not be found on Vercel|DEPLOYMENT_NOT_FOUND/i,
    vulnerable: false,
    docsUrl: 'https://vercel.com/docs/projects/domains/working-with-domains',
    note: 'Vercel requires per-project domain verification before a domain resolves; treat a match here as worth a manual look rather than a confirmed live exposure.',
  },
  {
    id: 'pantheon',
    name: 'Pantheon',
    cnamePattern: /(^|\.)pantheonsite\.io$/i,
    fingerprint: /The site you were looking for could not be found/i,
    vulnerable: true,
    docsUrl: 'https://docs.pantheon.io/domains',
    note: null,
  },
  {
    id: 'bitbucket',
    name: 'Bitbucket Cloud (static site)',
    cnamePattern: /(^|\.)bitbucket\.io$/i,
    fingerprint: /Repository not found/i,
    vulnerable: true,
    docsUrl: 'https://support.atlassian.com/bitbucket-cloud/docs/publishing-a-website-on-bitbucket-cloud/',
    note: null,
  },
];

/** Finds the first provider whose `cnamePattern` matches a CNAME target
 * hostname (already normalized: trailing dot stripped, lowercased). Returns
 * `null` when the target does not match any known provider -- see
 * analyze.mjs's `no-known-provider` category for what that means. */
export function matchProvider(targetHost) {
  if (!targetHost) return null;
  const host = String(targetHost).replace(/\.$/, '').toLowerCase();
  return PROVIDERS.find((p) => p.cnamePattern.test(host)) ?? null;
}
