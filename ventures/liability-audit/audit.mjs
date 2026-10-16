// Liability Audit: the rules engine.
//
// Reads an application's files (source, built HTML, IaC, lockfiles) and
// reports signals of legal and financial exposure: a tracker with no consent
// step, a subscription with no renewal or cancellation terms, a live secret in
// the tree, an LLM endpoint anyone can drive with the deployer's key, cloud
// infrastructure with no budget alarm. Pure and dependency-free: the CLI, the
// browser page and the portfolio sweep all call auditFiles().
//
// Every finding is an observation with its evidence (file, line, matched
// text) and the rule or law that makes it worth a look. It is never a
// determination that something is or is not lawful: the reader decides, with
// counsel where it matters (PRODUCT_PLAYBOOK.md §5b).

export const SEVERITIES = Object.freeze(['high', 'medium', 'low']);
export const CATEGORIES = Object.freeze(['privacy', 'consumer', 'ai', 'ip', 'financial', 'security']);

const SOURCE_EXT = /\.(?:m?[jt]sx?|cjs|py|rb|go|php|java|kt|swift|cs|rs|vue|svelte|astro)$/i;
const PAGE_EXT = /\.(?:html?|md|mdx|txt|jsx|tsx|vue|svelte|astro|liquid|hbs|ejs|njk|erb|php)$/i;
const IAC_EXT = /\.(?:tf|tofu|tf\.json)$/i;

// ---- signal patterns -------------------------------------------------------

const TRACKERS = [
  ['Google Analytics / Tag Manager', /googletagmanager\.com|google-analytics\.com|\bgtag\s*\(\s*['"]config['"]|\bga\s*\(\s*['"]create['"]/],
  ['Meta Pixel', /connect\.facebook\.net\/[^"']*fbevents|\bfbq\s*\(\s*['"]init['"]/],
  ['Hotjar', /static\.hotjar\.com|\bhj\s*\(\s*['"]/],
  ['Microsoft Clarity', /clarity\.ms\/tag/],
  ['Segment', /cdn\.segment\.com|analytics\.load\s*\(/],
  ['Mixpanel', /cdn\.mxpnl\.com|mixpanel\.init\s*\(/],
  ['TikTok Pixel', /analytics\.tiktok\.com|\bttq\.load\s*\(/],
  ['LinkedIn Insight', /snap\.licdn\.com|_linkedin_partner_id/],
  ['Amplitude', /cdn\.amplitude\.com|amplitude\.(?:init|getInstance)\s*\(/],
  ['PostHog', /posthog\.init\s*\(/],
  ['Heap', /heapanalytics\.com|heap\.load\s*\(/],
];
const CONSENT = /cookie[-\s_]?consent|cookieconsent|cookiebot|onetrust|optanon|klaro|tarteaucitron|iubenda|usercentrics|osano|termly|gtag\s*\(\s*['"]consent['"]|consent[-_ ]?(?:banner|manager|mode)|__tcfapi/i;

const PERSONAL_DATA_INPUT = /<input[^>]*\btype\s*=\s*["']?(?:email|tel)\b|<input[^>]*\bname\s*=\s*["'](?:e-?mail|phone|tel|full_?name|first_?name|last_?name|address|dob|birth_?date|ssn)["']|\bautocomplete\s*=\s*["'](?:email|tel|name|street-address|bday)["']/i;
// A password box for an API key is not an account system; one named or
// autocompleted as a password is.
const ACCOUNTS = /\bautocomplete\s*=\s*["'](?:current|new)-password|<input(?=[^>]*\btype\s*=\s*["']?password)(?=[^>]*\b(?:name|id)\s*=\s*["'][\w-]*(?:password|passwd|pwd))[^>]*>|supabase\.auth\.|firebase\/auth|getAuth\s*\(|signInWith(?:Password|OAuth|Popup|Redirect|EmailAndPassword)\s*\(|from ['"]next-auth|@clerk\/|auth0-spa-js|@auth0\/|passport\.authenticate\s*\(|django\.contrib\.auth|flask_login|devise_for\b/;

const PAYMENTS = /js\.stripe\.com\/v\d|\bnew Stripe\s*\(|\bStripe\s*\(\s*['"]pk_|from ['"]stripe['"]|require\(\s*['"]stripe['"]\s*\)|^\s*import stripe\b|stripe\.(?:checkout\.sessions|paymentIntents|subscriptions)\.create\s*\(|cdn\.paddle\.com|Paddle\.(?:Setup|Initialize)\s*\(|app\.lemonsqueezy\.com\/js|@lemonsqueezy\/|paypal\.com\/sdk\/js|braintree-web|braintree\.(?:BraintreeGateway|Gateway)\s*\(/m;
const SUBSCRIPTION = /\bmode\s*[:=]\s*['"]subscription['"]|stripe\.subscriptions\.create\s*\(|\brecurring\s*:\s*\{\s*interval|\bsubscription_data\s*[:=]|Paddle\.Checkout\.open[\s\S]{0,200}subscription/;
const RENEWAL_TERMS = /renews? automatically|automatically renew|auto[-\s]?renew(?:s|al|ing)?\b|cancel (?:at )?any ?time|how to cancel|cancel(?:lation)? (?:policy|your subscription)|billed (?:monthly|annually|every)/i;

const AFFILIATE_LINK = /href\s*=\s*["'][^"']*(?:amzn\.to\/|amazon\.[a-z.]+\/[^"']*[?&]tag=|shareasale\.com|anrdoezrs\.net|jdoqocy\.com|tkqlhce\.com|dpbolvw\.net|linksynergy\.com|click\.linksynergy|impact\.com|\.sjv\.io|awin1\.com|avantlink\.com|go\.skimresources\.com|redirect\.viglink\.com|rstyle\.me|shopstyle\.it)/i;
const AFFILIATE_DISCLOSURE = /affiliate (?:link|commission|disclosure)|earn(?:s)? (?:a )?(?:small )?commission|as an amazon associate|may earn|paid (?:link|partnership)|sponsored|#ad\b/i;

// A call site needs a receiver (`client.messages.create(`), which keeps the
// pattern lists inside scanners and docs from reading as calls.
const LLM_CALL = /(?<=[\w$\])])\.(?:chat\.completions\.create|responses\.create|messages\.(?:create|stream)|generate_?[cC]ontent(?:_?[sS]tream)?)\s*\(|api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|\bgenerateText\s*\(|\bstreamText\s*\(|\bChatOpenAI\s*\(|\bChatAnthropic\s*\(|litellm\.completion\s*\(/;
const LLM_CAP = /\b(?:max_tokens|max_completion_tokens|max_output_tokens|maxOutputTokens|maxTokens|max_tokens_to_sample)\b/;
const SERVER_KEY = /process\.env\.(?:OPENAI|ANTHROPIC|GEMINI|GOOGLE_GENERATIVE_AI|GROQ|MISTRAL|COHERE|LLM)_?API_KEY|os\.environ(?:\.get)?\s*[[(]\s*["'](?:OPENAI|ANTHROPIC|GEMINI|LLM)_API_KEY|os\.getenv\(\s*["'](?:OPENAI|ANTHROPIC|GEMINI|LLM)_API_KEY|Deno\.env\.get\(\s*["'](?:OPENAI|ANTHROPIC)_API_KEY/;
// The code serves requests: a key read here is spent by whoever reaches it.
const SERVES_REQUESTS = /\bcreateServer\s*\(|\bexpress\s*\(\s*\)|\bfastify\s*\(|new Hono\s*\(|\bDeno\.serve\s*\(|\bBun\.serve\s*\(|export\s+(?:async\s+)?function\s+(?:POST|GET|handler)\b|export\s+default\s*\{\s*(?:async\s+)?fetch\b|@app\.(?:post|get|route)\s*\(|FastAPI\s*\(|Flask\s*\(__name__|addEventListener\s*\(\s*['"]fetch['"]|exports\.handler\s*=|app\.listen\s*\(/;
// A budget, a rate or call limit, or an auth gate on the endpoint all count:
// the rule is about calls anyone can drive, not about which control is used.
const SPEND_CONTROL = /llm-spend-guard|createGuard\s*\(|\bmax_?budget\b|budget_?limit|spend_?limit|rate[-_]?limit|ratelimit|rateLimiter|limiter\.(?:consume|limit|check)|slowapi|throttle\s*\(|quota|\w+Limit\b|_LIMIT\b|per[-_ ]?(?:hour|day|minute|user)\b|Per(?:Hour|Day|Minute|User)\b|headers\.authorization|headers\[\s*['"]authorization['"]\s*\]|getServerSession\s*\(|auth\(\)\s*\.protect|requireAuth|login_required|Depends\(\s*get_current_user/i;
// Lenient on purpose: any plain mention that AI or a named model is involved counts.
const AI_DISCLOSURE = /\bA\.?I\.?\b|\bLLMs?\b|language model|artificial intelligence|\b(?:ChatGPT|GPT-\d|OpenAI|Claude|Anthropic|Gemini|Llama|Mistral)\b|chatbot/;

const PRIVACY_NOTICE_FILE = /(?:^|\/)(?:privacy(?:[-_ ]?(?:policy|notice))?|datenschutz)(?:\/index)?\.(?:html?|md|mdx|txt|jsx|tsx|astro|vue|svelte)$/i;
const PRIVACY_NOTICE_TEXT = /privacy (?:policy|notice)|<h[1-3][^>]*>\s*privacy\b|##\s*privacy\b|we (?:do not|don't|never) (?:collect|upload|store)|never (?:leaves|uploaded)|runs (?:entirely )?in your browser|is never uploaded/i;
const TERMS_FILE = /(?:^|\/)(?:terms(?:[-_ ]?(?:of[-_ ]?(?:service|use)|and[-_ ]?conditions|conditions))?|tos|eula)(?:\/index)?\.(?:html?|md|mdx|txt|jsx|tsx|astro|vue|svelte)$/i;
const TERMS_TEXT = /terms (?:of (?:service|use)|and conditions)|end[-\s]user licen[cs]e agreement/i;
const WARRANTY_TEXT = /no warranty|without warranty|as[-\s]is\b|"as is"|provided as is/i;
const ADVICE_TOPIC = /\b(?:tax(?:es)?|legal|lawyer|attorney|medical|diagnos(?:is|e)|dosage|invest(?:ment|ing)|retirement|mortgage|loan|insurance|financial|accounting|payroll)\b/i;
const NOT_ADVICE = /not (?:\w+[\s,/]+){0,8}advice|does not (?:constitute|replace) (?:\w+\s+){0,4}(?:advice|professional)|for (?:informational|educational) purposes only|consult (?:a|an|your) (?:qualified|licensed|professional|tax|legal|financial|medical)/i;
// "X vs QuickBooks" names a product; "Pallet vs Carton" and "vs Doing It by
// Hand" do not. A name counts when it is CamelCase, carries a mark symbol,
// or the page links to a domain spelled like it.
const VS_NAME = /\b[Vv]s\.?\s+((?:[A-Z][\w&+.'-]*)(?:\s+[A-Z][\w&+.'-]*){0,2})/g;
function namedProducts(html) {
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '';
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, '') ?? '';
  const hosts = [...html.matchAll(/href\s*=\s*["']https?:\/\/(?:www\.)?([^/"']+)/gi)].map((m) => m[1].toLowerCase().replace(/[^a-z0-9]/g, ''));
  const names = [];
  for (const m of `${title} | ${h1}`.matchAll(VS_NAME)) {
    const name = m[1].trim();
    const squashed = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const camel = /[a-z][A-Z]/.test(name);
    const mark = /[™®]/.test(name);
    const linked = squashed.length >= 4 && hosts.some((h) => h.startsWith(squashed));
    if (camel || mark || linked) names.push(name);
  }
  return [...new Set(names)];
}
const NOT_AFFILIATED = /not affiliated|no affiliation|is a (?:registered )?trademark|trademarks? of (?:their|its) (?:respective )?owners?/i;

// Live credentials. Matched values are masked in every report; a test-mode
// or example key is not reported.
const SECRETS = [
  ['Stripe live secret key', /\b(?:sk|rk)_live_[0-9a-zA-Z]{16,}\b/],
  ['Anthropic API key', /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{20,}/],
  ['OpenAI API key', /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}|\bsk-proj-[A-Za-z0-9_-]{40,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}/],
  ['Slack token', /\bxox[baprs]-[0-9A-Za-z-]{20,}/],
  // The header alone appears in docs ("paste the -----BEGIN … block"); a real key has a body.
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=]{40,}/],
];
const SEQUENTIAL = /ABCDEFGH|abcdefgh|12345678|(.)\1{5,}/;
const PLACEHOLDER = /x{6,}|0{8,}|your[-_]?(?:key|token)|example|placeholder|dummy|redacted|<[^>]+>|\.\.\./i;

const CLOUD_BUDGETS = [
  ['AWS', /provider\s+"aws"|"aws"\s*:\s*\{|resource\s+"aws_/, /aws_budgets_budget|aws_ce_anomaly_monitor|aws_cloudwatch_metric_alarm[\s\S]{0,400}EstimatedCharges/],
  ['Google Cloud', /provider\s+"google(?:-beta)?"|resource\s+"google_/, /google_billing_budget/],
  ['Azure', /provider\s+"azurerm"|resource\s+"azurerm_/, /azurerm_consumption_budget_(?:subscription|resource_group|management_group)|azurerm_cost_anomaly_alert/],
];
const STRONG_COPYLEFT = /\b(?:AGPL|SSPL|GPL)(?:-\d(?:\.\d)?)?(?:-only|-or-later|\+)?\b/;
const WEAK_COPYLEFT_OR = /\bOR\b/;

// ---- helpers ---------------------------------------------------------------

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

function firstMatch(file, re) {
  const m = re.exec(file.text);
  if (!m) return null;
  return { file: file.path, line: lineOf(file.text, m.index), match: m[0].slice(0, 120) };
}

function allMatches(file, re, limit = 20) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  const out = [];
  let m;
  while ((m = g.exec(file.text)) && out.length < limit) {
    out.push({ file: file.path, line: lineOf(file.text, m.index), match: m[0].slice(0, 120), index: m.index });
    if (m[0].length === 0) g.lastIndex++;
  }
  return out;
}

export function mask(secret) {
  const s = String(secret);
  return s.length <= 8 ? '****' : `${s.slice(0, 4)}…${s.slice(-2)} (${s.length} chars)`;
}

// Strip tags, scripts and styles so prose checks read what a visitor reads.
function visibleText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
}

// What the code does, not what it documents: <pre>/<code> samples in pages
// and regex pattern lines in source are blanked (newlines kept, so line
// numbers still point at the right place). Prose and secret checks read the
// raw text.
const blank = (s) => s.replace(/[^\n]/g, ' ');
const PATTERN_LINE = /\\[sdwb.(]|\(\?[:!=<]|new RegExp\s*\(|^\s*(?:\/\/|#|\*|\/\*)/;
export function codeView(file) {
  if (/\.html?$/i.test(file.path)) return file.text.replace(/<(pre|code)\b[\s\S]*?<\/\1>/gi, blank);
  if (/\.mdx?$/i.test(file.path)) return file.text.replace(/```[\s\S]*?```|`[^`\n]*`/g, blank);
  if (SOURCE_EXT.test(file.path)) return file.text.split('\n').map((l) => (PATTERN_LINE.test(l) ? blank(l) : l)).join('\n');
  return file.text;
}

const isTestPath = (p) => /(?:^|\/)(?:tests?|__tests__|spec|fixtures?|__mocks__|examples?)\/|\.(?:test|spec)\.[a-z]+$|_test\.(?:py|go)$|(?:^|\/)test_[^/]+\.py$|(?:^|\/)conftest\.py$/i.test(p);
const isPage = (f) => /\.html?$/i.test(f.path);

// ---- facts -----------------------------------------------------------------

/** What the application is and does, read once and shared by every rule. */
export function collectFacts(rawFiles) {
  const files = rawFiles.map((f) => ({ path: f.path, text: f.code ?? codeView(f) }));
  const pages = files.filter(isPage);
  const sources = files.filter((f) => SOURCE_EXT.test(f.path) && !isTestPath(f.path));
  const prose = rawFiles.filter((f) => PAGE_EXT.test(f.path) && !isTestPath(f.path));
  const code = [...pages, ...sources];
  const any = (list, re) => list.some((f) => re.test(f.text));
  const where = (list, re, limit = 5) => list.map((f) => firstMatch(f, re)).filter(Boolean).slice(0, limit);

  const trackers = [];
  for (const [name, re] of TRACKERS) {
    const ev = where(code, re, 3);
    if (ev.length) trackers.push({ name, evidence: ev });
  }
  // A call written inside a string ("examples: 'client.messages.create('") is documentation.
  const inString = (f, m) => {
    const lineStart = f.text.lastIndexOf('\n', m.index) + 1;
    const before = f.text.slice(lineStart, m.index);
    // Template literals span lines, so backticks are counted from the top of the file.
    return ['"', "'"].some((q) => (before.split(q).length - 1) % 2 === 1)
      || (f.text.slice(0, m.index).split('`').length - 1) % 2 === 1;
  };
  const llmCalls = [...sources, ...pages].flatMap((f) => allMatches(f, LLM_CALL, 50).filter((m) => /^\./.test(m.match) ? !inString(f, m) : true));

  return {
    fileCount: files.length,
    pageCount: pages.length,
    isWebApp: pages.length > 0 || files.some((f) => /(?:^|\/)(?:pages|app|routes|views|templates)\//.test(f.path) && PAGE_EXT.test(f.path)),
    hasLicense: rawFiles.some((f) => /(?:^|\/)(?:LICEN[CS]E|COPYING)(?:\.[a-z]+)?$/i.test(f.path) && !f.path.includes('/node_modules/') && f.path.split('/').length <= 2),
    packageJson: files.find((f) => /(?:^|\/)package\.json$/.test(f.path) && f.path.split('/').length <= 2) ?? null,
    trackers,
    consent: where(code, CONSENT, 3),
    personalData: where([...pages, ...sources.filter((f) => /\.(?:[jt]sx|vue|svelte|astro)$/.test(f.path))], PERSONAL_DATA_INPUT, 5),
    accounts: where(code, ACCOUNTS, 3),
    payments: where(sources.concat(pages), PAYMENTS, 5),
    subscriptions: where(sources.concat(pages), SUBSCRIPTION, 5),
    renewalTerms: any(prose, RENEWAL_TERMS),
    affiliateLinks: pages.concat(prose.filter((f) => /\.mdx?$/.test(f.path))).flatMap((f) => allMatches(f, AFFILIATE_LINK, 5)),
    llmCalls,
    serverKey: where(sources, SERVER_KEY, 5),
    serves: where(sources, SERVES_REQUESTS, 3),
    codeByPath: new Map(files.map((f) => [f.path, f.text])),
    spendControl: where(sources, SPEND_CONTROL, 3),
    aiDisclosure: prose.some((f) => AI_DISCLOSURE.test(isPage(f) ? visibleText(f.text) : f.text)),
    privacyNotice: files.some((f) => PRIVACY_NOTICE_FILE.test(f.path)) || prose.some((f) => PRIVACY_NOTICE_TEXT.test(isPage(f) ? visibleText(f.text) : f.text)),
    termsPage: files.some((f) => TERMS_FILE.test(f.path)) || prose.some((f) => TERMS_TEXT.test(isPage(f) ? visibleText(f.text) : f.text)),
    iac: files.filter((f) => IAC_EXT.test(f.path)),
  };
}

// ---- rules -----------------------------------------------------------------
//
// Each rule: id, category, severity, title, why (the exposure, with the law
// or norm it comes from), fix, and run(facts, files) -> evidence[] (empty
// means nothing to report). `applies` says whether the rule had anything to
// look at, so a report can say "not applicable" rather than "passed".

export const RULES = [
  {
    id: 'secret-in-tree',
    category: 'security',
    severity: 'high',
    title: 'Live credential committed to the repository',
    why: 'A key in the tree is readable by anyone with the repository, and by everyone forever once it is public. A stolen API or cloud key is spent on your account: providers generally hold the account owner liable for usage until the key is revoked.',
    fix: 'Revoke and rotate the key at the provider now (deleting the line does not remove it from history), then load it from an environment variable or secret store. Add a secret scanner to CI.',
    applies: () => true,
    run(facts, files) {
      const out = [];
      for (const f of files) {
        // Test fixtures are full of fake keys; a real one there is still a leak,
        // but the rule would be noise without this. Scan them with --only secret-in-tree.
        if (/(?:^|\/)\.env\.(?:example|sample|template)$/i.test(f.path) || isTestPath(f.path)) continue;
        for (const [name, re] of SECRETS) {
          for (const m of allMatches(f, re, 3)) {
            const around = f.text.slice(Math.max(0, m.index - 40), m.index + m.match.length + 10);
            if (PLACEHOLDER.test(m.match) || SEQUENTIAL.test(m.match) || /example|placeholder|dummy|fake|redacted/i.test(around)) continue;
            out.push({ file: m.file, line: m.line, match: `${name}: ${mask(m.match)}` });
          }
        }
      }
      return out;
    },
  },
  {
    id: 'llm-endpoint-no-spend-control',
    category: 'financial',
    severity: 'high',
    title: 'LLM calls on the deployer\'s key with no budget or rate limit in sight',
    why: 'Server code reads a provider API key from the environment and calls the model, but nothing in the source looks like a per-user budget, rate limit or spend cap. Then one abusive visitor, a scraper or a stuck agent loop can spend without bound, and the provider bills the account owner.',
    fix: 'Put a hard budget per user and per day in front of the calls, plus a loop breaker (for example ventures/llm-spend-guard, or your gateway\'s budget feature), and keep the provider-side spend limit on as a backstop.',
    applies: (facts) => facts.llmCalls.length > 0,
    run: (facts) => (facts.serverKey.length && facts.serves.length && !facts.spendControl.length ? [...facts.serverKey.slice(0, 2), ...facts.serves.slice(0, 1)] : []),
  },
  {
    id: 'llm-call-no-output-cap',
    category: 'financial',
    severity: 'medium',
    title: 'LLM call with no output-token cap',
    why: 'Without max_tokens (or its equivalent) one call can generate the model\'s full output limit, and output is usually the expensive side of the price. It bounds the worst case of every call.',
    fix: 'Set an explicit output cap on each call, sized to what the feature needs.',
    applies: (facts) => facts.llmCalls.length > 0,
    run(facts, files) {
      const out = [];
      for (const c of facts.llmCalls) {
        if (/api\.(?:openai|anthropic)\.com|generativelanguage/.test(c.match)) continue; // a URL, not a call site
        const window = facts.codeByPath.get(c.file).slice(c.index, c.index + 1200);
        const end = window.search(/\n\s*\)\s*[;,]?\s*\n|\)\s*;/);
        if (!LLM_CAP.test(end > 0 ? window.slice(0, end + 2) : window)) out.push({ file: c.file, line: c.line, match: c.match });
      }
      return out.slice(0, 20);
    },
  },
  {
    id: 'tracker-without-consent',
    category: 'privacy',
    severity: 'high',
    title: 'Analytics or ad tracker with no consent mechanism',
    why: 'In the EU and UK, the ePrivacy rules (PECR in the UK) require prior consent before non-essential cookies or similar tracking are set, and GDPR fines can follow. Several US state privacy laws give opt-out rights for "sale" or "sharing", which ad pixels can trigger.',
    fix: 'Load trackers only after consent (a consent banner or your tag manager\'s consent mode), honour Global Privacy Control, or switch to a cookieless, aggregate-only counter.',
    applies: (facts) => facts.isWebApp,
    run: (facts) => (facts.trackers.length && !facts.consent.length ? facts.trackers.map((t) => ({ ...t.evidence[0], match: `${t.name}: ${t.evidence[0].match}` })) : []),
  },
  {
    id: 'personal-data-no-privacy-notice',
    category: 'privacy',
    severity: 'high',
    title: 'Collects personal data or runs trackers, but no privacy notice was found',
    why: 'GDPR Articles 13 and 14 require telling people what is collected, why, and for how long. CalOPPA requires a posted privacy policy for any commercial site that collects personal information from California residents. App stores require one too.',
    fix: 'Publish a privacy notice that names what is collected, the purpose, the processors, retention and how to ask for deletion, and link it from every page that collects data.',
    applies: (facts) => facts.isWebApp,
    run: (facts) => (facts.privacyNotice ? [] : [...facts.personalData, ...facts.trackers.map((t) => t.evidence[0])].slice(0, 5)),
  },
  {
    id: 'subscription-no-renewal-terms',
    category: 'consumer',
    severity: 'high',
    title: 'Recurring billing with no renewal or cancellation terms found',
    why: 'US federal law (ROSCA) and state automatic-renewal laws, such as California\'s Business and Professions Code §17600 and following, require clear disclosure of recurring charges and an easy way to cancel before charging. The EU and UK consumer rules require pre-contract information on duration and cancellation. Failures lead to refunds, chargebacks and regulator action.',
    fix: 'Show the price, billing period, that it renews automatically and how to cancel next to the purchase button. Get affirmative consent, send a confirmation, and offer online cancellation as easy as sign-up.',
    applies: (facts) => facts.payments.length > 0 || facts.subscriptions.length > 0,
    run: (facts) => (facts.subscriptions.length && !facts.renewalTerms ? facts.subscriptions.slice(0, 3) : []),
  },
  {
    id: 'payments-no-terms',
    category: 'consumer',
    severity: 'medium',
    title: 'Takes payments or accounts, but no terms of service were found',
    why: 'Without terms there is no stated refund policy, no limit of liability, no acceptable-use rule to point to when terminating an abuser, and no governing law. Payment processors generally expect a refund policy and terms on the site.',
    fix: 'Publish terms that cover the service, payment and refunds, acceptable use, termination, limitation of liability and governing law, and link them at checkout and sign-up.',
    applies: (facts) => facts.payments.length > 0 || facts.accounts.length > 0,
    run: (facts) => (facts.termsPage ? [] : [...facts.payments, ...facts.accounts].slice(0, 3)),
  },
  {
    id: 'affiliate-links-no-disclosure',
    category: 'consumer',
    severity: 'medium',
    title: 'Affiliate links with no disclosure on the page',
    why: 'The FTC\'s Endorsement Guides (16 CFR Part 255) require a clear and conspicuous disclosure of a material connection, such as earning a commission. Amazon Associates requires its own exact statement. The UK CAP Code requires ads to be identifiable as ads.',
    fix: 'Put a plain disclosure ("We earn a commission if you buy through these links") before the first affiliate link, plus any program-specific statement.',
    applies: (facts) => facts.affiliateLinks.length > 0,
    run(facts, files) {
      const out = [];
      const seen = new Set();
      for (const l of facts.affiliateLinks) {
        if (seen.has(l.file)) continue;
        seen.add(l.file);
        const f = files.find((x) => x.path === l.file);
        if (!AFFILIATE_DISCLOSURE.test(f.text.slice(0, l.index))) out.push({ file: l.file, line: l.line, match: l.match });
      }
      return out;
    },
  },
  {
    id: 'ai-output-no-disclosure',
    category: 'ai',
    severity: 'medium',
    title: 'User-facing pages with LLM calls but no statement that AI is involved',
    why: 'The EU AI Act, Article 50 (applying from 2 August 2026), requires people to be told when they interact with an AI system, and certain AI-generated content to be marked. California\'s B.O.T. Act prohibits undisclosed bots used to influence a purchase or a vote. Users who rely on unlabelled AI output have a misrepresentation argument.',
    fix: 'Say on the page where AI is used, what it does, and that its output can be wrong, and label generated content.',
    applies: (facts) => facts.llmCalls.length > 0 && facts.isWebApp,
    run: (facts) => (facts.aiDisclosure ? [] : facts.llmCalls.slice(0, 3)),
  },
  {
    id: 'advice-without-disclaimer',
    category: 'consumer',
    severity: 'medium',
    title: 'Tool page on a tax, legal, medical or financial topic with no "not advice" statement',
    why: 'A calculator or checker that a reader may rely on for a regulated decision invites negligent-misrepresentation claims if it is wrong. Stating its limits and that it is not professional advice is the cheapest mitigation.',
    fix: 'Add a visible disclaimer: free and as-is, not [tax/legal/medical/financial] advice, verify before relying on it, limitation of liability.',
    applies: (facts) => facts.pageCount > 0,
    run(facts, files) {
      return files.filter(isPage).filter((f) => /<(?:input|select|textarea)\b/i.test(f.text)).filter((f) => {
        const text = visibleText(f.text);
        return ADVICE_TOPIC.test(text) && !NOT_ADVICE.test(text) && !WARRANTY_TEXT.test(text);
      }).slice(0, 10).map((f) => ({ file: f.path, line: 1, match: (ADVICE_TOPIC.exec(visibleText(f.text)) ?? [''])[0] }));
    },
  },
  {
    id: 'comparison-no-trademark-notice',
    category: 'ip',
    severity: 'low',
    title: 'Comparison page naming another product, with no non-affiliation notice',
    why: 'Naming a competitor to describe what your product is not is generally nominative fair use, but a reader may still take it as affiliation or endorsement. A one-line notice removes the ambiguity cheaply.',
    fix: 'Add "Not affiliated with, endorsed by, or sponsored by [Product]; [Product] is a trademark of its owner", and keep the comparison to sourced facts.',
    applies: (facts) => facts.pageCount > 0,
    run: (facts, files) => files.filter(isPage).filter((f) => !NOT_AFFILIATED.test(f.text)).map((f) => ({ f, names: namedProducts(f.text) })).filter((x) => x.names.length).slice(0, 10).map(({ f, names }) => ({ file: f.path, line: 1, match: `names ${names.join(', ')}` })),
  },
  {
    id: 'cloud-no-budget-alarm',
    category: 'financial',
    severity: 'medium',
    title: 'Cloud infrastructure as code with no budget or cost alarm',
    why: 'Cloud accounts have no spending ceiling by default. A misconfigured autoscaler, a public bucket serving large files, or a leaked key runs up charges until someone notices the invoice. A budget alert is free or nearly free on the major clouds.',
    fix: 'Declare a budget with email or webhook alerts in the same IaC: aws_budgets_budget, google_billing_budget or azurerm_consumption_budget_*. Add anomaly detection where the cloud offers it.',
    applies: (facts) => facts.iac.length > 0,
    run(facts) {
      const all = facts.iac.map((f) => f.text).join('\n');
      const out = [];
      for (const [cloud, uses, budget] of CLOUD_BUDGETS) {
        if (!uses.test(all) || budget.test(all)) continue;
        const f = facts.iac.find((x) => uses.test(x.text));
        out.push({ ...firstMatch(f, uses), match: `${cloud}: ${firstMatch(f, uses).match}` });
      }
      return out;
    },
  },
  {
    id: 'copyleft-dependency',
    category: 'ip',
    severity: 'medium',
    title: 'Strong-copyleft dependency in a distributed app',
    why: 'GPL dependencies can require releasing your own source when you distribute the combined work. AGPL extends that to users over a network, and SSPL to offering the software as a service. If the product is closed source, or licensed under terms that conflict, that is a licence breach.',
    fix: 'Check whether the dependency is shipped or only used at build time, and whether your licence is compatible. Replace it, isolate it, or license your work accordingly. A lawyer can confirm.',
    applies: (facts, files) => files.some((f) => /(?:^|\/)package-lock\.json$/.test(f.path)),
    run(facts, files) {
      const out = [];
      for (const f of files.filter((x) => /(?:^|\/)package-lock\.json$/.test(x.path) && !x.path.includes('node_modules/'))) {
        let lock;
        try { lock = JSON.parse(f.text); } catch { continue; }
        for (const [name, meta] of Object.entries(lock.packages ?? {})) {
          if (!name || meta.dev) continue;
          const lic = typeof meta.license === 'string' ? meta.license : '';
          // "GPL-2.0 OR MIT" lets you pick the permissive side.
          if (STRONG_COPYLEFT.test(lic) && !/LGPL/.test(lic) && !WEAK_COPYLEFT_OR.test(lic)) {
            out.push({ file: f.path, line: lineOf(f.text, f.text.indexOf(`"${name}"`)), match: `${name.replace(/^.*node_modules\//, '')}: ${lic}` });
          }
        }
      }
      return out.slice(0, 20);
    },
  },
  {
    id: 'no-license',
    category: 'ip',
    severity: 'low',
    title: 'No licence file at the root',
    why: 'Without a licence, others have no right to use, copy or modify the code, whatever the repository\'s visibility. Contributors\' rights are unclear too, which makes a later relicence or sale harder.',
    fix: 'Add a LICENSE file (MIT, Apache-2.0 or your own terms) and a matching "license" field in package.json.',
    applies: () => true,
    run: (facts) => (facts.hasLicense ? [] : [{ file: '.', line: 0, match: 'no LICENSE, LICENCE or COPYING at the root' }]),
  },
];

/**
 * Audit a set of files: [{ path, text }]. Paths are relative and use "/".
 * Returns { facts (summary), findings[], checks[] } where checks lists every
 * rule as raised | clear | not-applicable.
 */
export function auditFiles(files, { only = null, skip = [] } = {}) {
  const clean = files.filter((f) => typeof f.text === 'string').map((f) => ({ path: f.path.replace(/\\/g, '/').replace(/^\.\//, ''), text: f.text }));
  const facts = collectFacts(clean);
  const findings = [];
  const checks = [];
  for (const rule of RULES) {
    if ((only && !only.includes(rule.id)) || skip.includes(rule.id)) continue;
    if (!rule.applies(facts, clean)) { checks.push({ id: rule.id, status: 'not-applicable' }); continue; }
    const evidence = rule.run(facts, clean).map(({ index, ...e }) => e);
    checks.push({ id: rule.id, status: evidence.length ? 'raised' : 'clear' });
    if (evidence.length) {
      findings.push({ id: rule.id, category: rule.category, severity: rule.severity, title: rule.title, why: rule.why, fix: rule.fix, evidence });
    }
  }
  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.id.localeCompare(b.id));
  return {
    facts: {
      files: facts.fileCount,
      pages: facts.pageCount,
      trackers: facts.trackers.map((t) => t.name),
      collectsPersonalData: facts.personalData.length > 0,
      takesPayments: facts.payments.length > 0,
      recurringBilling: facts.subscriptions.length > 0,
      callsLlm: facts.llmCalls.length > 0,
      privacyNotice: facts.privacyNotice,
      termsPage: facts.termsPage,
      infrastructureAsCode: facts.iac.length > 0,
    },
    findings,
    checks,
  };
}

export function summarise(report) {
  const by = { high: 0, medium: 0, low: 0 };
  for (const f of report.findings) by[f.severity]++;
  const applicable = report.checks.filter((c) => c.status !== 'not-applicable').length;
  return { ...by, raised: report.findings.length, applicable, total: report.checks.length };
}
