// The site's standard legal pages: Privacy Policy, Terms of Use and Cookie
// Policy, served at /privacy/, /terms/ and /cookies/ on https://marisstella.app/.
//
// Owner, 2026-11-25: "the privacy policies that are like no data gathered
// kill those let's set up real analytics and standard privacy policies and
// other legal docs." They replace the footer's "nothing is collected"
// promise. Each statement here must match what the build actually ships, so
// the variable parts read the same switches the build does: `analytics`
// (platform/analytics/, Cloudflare Web Analytics), `counter`
// (platform/counter/), `feedback` (platform/edge/ form) and the list of
// tools that call an outside service. docs/legal/privacy-baseline.md is the
// legal floor these follow. The operator and governing law are the ones the
// paid products' documents already name (private-monorepo
// apps/grants/src/shared/legal.ts, LEGAL_ENTITY).
//
// The paid products (Grant Autopilot and the rest) have their own Terms and
// Privacy Policy covering accounts, billing and customer data; these pages
// cover this website and its free tools.

export const PRIVACY_PATH = 'privacy/';
export const TERMS_PATH = 'terms/';
export const COOKIES_PATH = 'cookies/';

export const LEGAL_OPERATOR = Object.freeze({
  name: 'Mary Stella Labs, LLC',
  jurisdiction: 'New Mexico',
  country: 'USA',
  email: 'hello@marisstella.app',
});

/** The date the text of these documents last changed. Bump with any edit. */
export const LEGAL_UPDATED = '2026-11-26';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const mail = `<a href="mailto:${LEGAL_OPERATOR.email}">${LEGAL_OPERATOR.email}</a>`;

/**
 * Body HTML (inside `<main class="prose">`) for each document.
 * @param {object} o
 * @param {string} o.toRoot      relative path to the site root
 * @param {boolean} o.analytics  Cloudflare Web Analytics beacon on every page
 * @param {boolean} o.counter    first-party page-view counter on
 * @param {boolean} o.feedback   feedback form on
 * @param {{title:string, slug:string, hosts:string[]}[]} o.exceptions tools that call an outside service
 */
export function legalDocuments({ toRoot = '../', analytics = false, counter = false, feedback = false, exceptions = [] } = {}) {
  const link = (p, label) => `<a href="${esc(`${toRoot}${p}`)}">${label}</a>`;
  const updated = `<p class="legal-meta"><strong>Last updated ${LEGAL_UPDATED}</strong> · ${esc(LEGAL_OPERATOR.name)}</p>`;
  const exceptionHosts = [...new Set(exceptions.flatMap((x) => x.hosts))];

  const collected = [
    `<li><strong>Request data our host sees.</strong> Like every website, each request for a page
      reaches our host, Cloudflare, with your IP address, browser string, the page asked for and the
      referring page. Cloudflare processes this to serve the page, block attacks and abuse, and give us
      aggregate traffic statistics (requests per day, country, status). We do not keep our own log of
      IP addresses.</li>`,
    analytics
      ? `<li><strong>Website analytics (Cloudflare Web Analytics).</strong> Every page loads Cloudflare's
      analytics script, which reports the page's address, the referring page, your browser and
      operating system type, screen size, the country your request came from, and page-load
      performance timings. It sets no cookie, stores nothing on your device and does not build a
      profile of you or follow you to other websites. We see the results only as aggregate reports
      (visits per page, top referrers, countries, devices). A page that puts your inputs into its own
      address, as a shareable link does, sends that address too.</li>`
      : '',
    counter
      ? `<li><strong>Our own page-view counter.</strong> Each page load also adds one to a daily per-page
      total on our open-source counter, labelled with the kind of site that sent you (such as
      "google", never its address), a campaign label if you followed one of our own links, the country
      as a two-letter code and the device class (phone, tablet or desktop). Pages that link to a paid
      product also count that the link was shown or clicked. Only the daily totals are kept, and they
      are published in our public repository; no IP address, cookie or browser string is stored.</li>`
      : '',
    `<li><strong>What you type into a free tool</strong> is processed in your browser and not sent to
      us.${exceptions.length ? ` The exception: ${exceptions.length === 1 ? 'one tool calls' : `${exceptions.length} tools call`}
      an outside service as its whole job (for example a public DNS or registry lookup), and send what
      you give ${exceptions.length === 1 ? 'it' : 'them'} to that service (${exceptionHosts.map(esc).join(', ')}).
      The ${link('about/#outside-services', 'About page')} lists them.` : ''} Some tools save your inputs
      and settings in your own browser's local storage so they are there next time; that data stays
      on your device until you clear it.</li>`,
    feedback
      ? `<li><strong>Feedback you send.</strong> A message sent through the
      ${link('feedback/', 'feedback form')} (its text, the type you pick and the page it is about) is
      published in our public GitHub repository. Email addresses are removed from the text first;
      do not include anything you would not want published.</li>`
      : '',
    feedback
      ? `<li><strong>Early-access sign-ups.</strong> If you ask for early access to a paid product on a
      page such as ${link('industries/construction/', 'Construction')}, we keep the email address you
      give, the product, the optional trade and note you add, the page and the time, privately with our
      host. Nothing from it is published: only the number of sign-ups per product is public. We use it
      to email you when that product opens and for nothing else; an AI assistant working for us may read
      the list to count and sort sign-ups. We keep it at most one year. Email ${mail} and we delete your
      address from every list.</li>`
      : '',
    `<li><strong>Email you send us.</strong> If you write to one of this site's addresses, we keep your
      message and address to answer you. An AI assistant reads and sorts the mail and drafts replies;
      anything about a legal matter, a refund, security, your personal data, or asking for a person goes
      to a person instead, and a reply the AI wrote says so. How long we keep it is under "How long we
      keep it" below. Ask and we delete it sooner, unless the law requires us to keep it.</li>`,
  ].filter(Boolean).join('\n      ');

  const privacy = `
      ${updated}
      <p>This policy explains what personal data ${esc(LEGAL_OPERATOR.name)} ("we", "us") collects when
      you use this website, ${esc('marisstella.app')}, and its free tools, why, and what rights you
      have. Our paid products have their own privacy policies, shown when you sign up, which cover
      accounts, billing and the data you store in them.</p>

      <h2>Who is responsible</h2>
      <p>${esc(LEGAL_OPERATOR.name)}, ${esc(LEGAL_OPERATOR.jurisdiction)}, ${esc(LEGAL_OPERATOR.country)},
      is the controller of the personal data described here. Contact: ${mail}.</p>

      <h2>What we collect</h2>
      <ul>
      ${collected}
      </ul>
      <p>We do not sell personal data, share it for cross-context behavioural advertising, run
      advertising networks, or use session-recording or third-party tracking pixels.</p>

      <h2>Why, and our legal basis</h2>
      <ul>
        <li><strong>Serving and securing the site</strong> (request data): our legitimate interest in
        running a working, secure website (GDPR art. 6(1)(f)).</li>
        <li><strong>Understanding how the site is used</strong>${analytics || counter ? ' (analytics and counts)' : ''}:
        our legitimate interest in knowing which pages and tools people use and where visitors come
        from, so we can improve them. The measurement is cookieless and aggregate, and you can object
        at any time (see "Your choices").</li>
${feedback ? `        <li><strong>Early-access sign-ups</strong>: your consent, given by ticking the box on the form
        (art. 6(1)(a)); you can withdraw it at any time by emailing us.</li>
` : ''}        <li><strong>Answering you</strong> (email and feedback): our legitimate interest in replying, or
        steps you ask for before entering a contract with us (art. 6(1)(b)).</li>
        <li><strong>Legal obligations</strong> where the law requires us to keep or disclose
        information (art. 6(1)(c)).</li>
      </ul>

      <h2>Who receives it</h2>
      <ul>
        <li><strong>Cloudflare, Inc.</strong> hosts the site${analytics ? ', provides the analytics' : ''}
        and stores email sent to us${feedback ? ' and early-access sign-ups' : ''}, as our processor, under its data processing addendum.</li>
        <li><strong>Anthropic, PBC</strong> provides the AI assistant that reads, sorts and drafts
        replies to email sent to us${feedback ? ', and may read the early-access list,' : ''} as our processor under its commercial terms.</li>
        <li><strong>GitHub, Inc.</strong> hosts our public repository, where aggregate
        counts${feedback ? ' and published feedback' : ''} are committed.</li>
        <li>Authorities or others where the law requires it, or to protect our rights.</li>
        <li>A buyer or successor if the business or a product is sold, under this policy.</li>
      </ul>

      <h2>International transfers</h2>
      <p>We are in the United States, and our providers process data in the US and elsewhere. Where
      data from the EU, EEA, UK or Switzerland is transferred, we rely on our providers' participation
      in the EU-US Data Privacy Framework (and its UK and Swiss extensions) or their standard
      contractual clauses.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Analytics and request statistics: kept by Cloudflare under its retention schedule; we
        copy only aggregate daily totals into our repository, where they stay.</li>
        <li>Email: up to 90 days for most addresses; security reports up to 1 year; privacy and data
        requests up to 3 years, to show how we handled them; billing and payment mail up to 7 years,
        for tax and accounting records. Longer only where we need it for a legal claim.</li>
${feedback ? `        <li>Early-access sign-ups: at most one year from the sign-up, then deleted automatically;
        sooner if you ask.</li>
` : ''}        <li>Local storage on your device: until you clear it; we never receive it.</li>
      </ul>

      <h2>Cookies and similar technologies</h2>
      <p>We set no advertising or tracking cookies. See the ${link(COOKIES_PATH, 'Cookie Policy')} for
      the local storage our tools use and the security cookies Cloudflare may set.</p>

      <h2>Your rights</h2>
      <p>Depending on where you live (for example under the GDPR, UK GDPR or US state privacy laws such
      as California's CCPA), you may have the right to access the personal data we hold about you, to
      have it corrected or deleted, to restrict or object to our processing, to data portability, and
      not to be treated differently for exercising these rights. Email ${mail}; we answer within one
      month (45 days where US state law allows). We may need to verify your request. Because our
      analytics and counts are aggregate and hold no identifier, we usually cannot single out your
      visits in them. You can also complain to your local data-protection authority.</p>
      <p><strong>California residents:</strong> in the last 12 months we collected identifiers (IP
      address, processed by our host) and internet activity (pages viewed, referrer) for the purposes
      above. We do not sell or share personal information, and we do not use or disclose sensitive
      personal information.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Blocking scripts, or a content blocker that blocks <code>static.cloudflareinsights.com</code>,
        stops the analytics; the tools still work.</li>${counter ? `
        <li>The opt-out checkbox at the foot of ${link('', 'the tool list')} stops our own counter and the
        tallies kept in your browser.</li>` : ''}
        <li>We treat a Global Privacy Control signal as an opt-out of sale and sharing; since we do
        neither, it changes nothing here. We do not respond to Do Not Track for aggregate counts that
        identify no one.</li>
        <li>Clearing this site's data in your browser removes everything the tools saved locally.</li>
      </ul>

      <h2>Children</h2>
      <p>This site is meant for businesses and adults. It is not directed to children under 16, and we
      do not knowingly collect their personal data. If you think a child has sent us personal data,
      email us and we will delete it.</p>

      <h2>Security</h2>
      <p>The site is served only over HTTPS, and we limit what we collect to what is described above.
      No method of transmission or storage is completely secure.</p>

      <h2>Changes</h2>
      <p>We will update this policy when what we collect changes, and change the date at the top. The
      full history of this page is public in our repository.</p>
`;

  const terms = `
      ${updated}
      <p>These Terms of Use govern your use of this website, ${esc('marisstella.app')}, and the free
      tools, guides, research and downloads on it (the "Site"), operated by ${esc(LEGAL_OPERATOR.name)}
      ("we", "us"). By using the Site you agree to them. If you do not agree, do not use the Site. Our
      paid products are governed by their own terms of service, which you accept when you sign up;
      if those conflict with these, the product terms win for that product.</p>

      <h2>1. The free tools</h2>
      <p>The free tools are provided free of charge, for general information. They are not legal,
      tax, financial, engineering, medical or other professional advice, and do not replace a qualified
      professional. You are responsible for checking any result before relying on it and for meeting
      any obligation it helps you prepare for.</p>

      <h2>2. Licence to use, and open source</h2>
      <p>You may use the Site for any lawful personal or business purpose. Source code published in our
      public repository is licensed under the licence stated there (for most of it, the MIT licence),
      and that licence governs your use of that code. Our names and logos are not licensed for use
      except to refer to us accurately.</p>

      <h2>3. Acceptable use</h2>
      <p>Do not use the Site to break the law or anyone's rights; attempt to disrupt, overload or gain
      unauthorised access to it or its hosting; scrape it at a rate that degrades it for others; submit
      malware, spam or unlawful content through the feedback form or email; or use a tool against a
      system or domain you are not authorised to test.</p>

      <h2>4. What you send us</h2>
      <p>Feedback, ideas and feature requests you send may be published in our public repository and
      used to improve our software, without obligation or payment to you. Work we build from a request
      is published under our repository's licence, and the requester receives no exclusive rights.
      Only send what you have the right to share.</p>

      <h2>5. Third-party links and services</h2>
      <p>The Site links to, and some tools call, services we do not control. Their own terms and
      policies apply, and we are not responsible for them.</p>

      <h2>6. Availability</h2>
      <p>The Site is provided on a best-effort basis. We may change, suspend or remove any part of it,
      including any tool or address, at any time and without notice. We do not promise uptime or keep
      backups of anything you enter. Do not use the Site as a system of record.</p>

      <h2>7. No warranty</h2>
      <p>THE SITE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
      IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY AND
      NON-INFRINGEMENT, TO THE FULLEST EXTENT THE LAW ALLOWS.</p>

      <h2>8. Limitation of liability</h2>
      <p>TO THE FULLEST EXTENT THE LAW ALLOWS, WE ARE NOT LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
      CONSEQUENTIAL OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA OR GOODWILL, ARISING FROM
      YOUR USE OF THE FREE SITE, AND OUR TOTAL LIABILITY FOR ANY CLAIM ABOUT IT IS LIMITED TO US$100.
      Nothing in these Terms limits liability that cannot be limited by law, such as for fraud, or for
      death or personal injury caused by negligence, or your statutory rights as a consumer.</p>

      <h2>9. Indemnity</h2>
      <p>If you use the Site in breach of these Terms or the law, you agree to cover our reasonable
      losses and costs from claims that result, to the extent the law allows.</p>

      <h2>10. Governing law</h2>
      <p>These Terms are governed by the laws of the State of ${esc(LEGAL_OPERATOR.jurisdiction)}, USA,
      without regard to conflict-of-law rules, and the courts located in ${esc(LEGAL_OPERATOR.jurisdiction)}
      have jurisdiction over disputes, unless the law of the country where you live as a consumer
      gives you the right to bring a claim there.</p>

      <h2>11. Changes</h2>
      <p>We may update these Terms. The date at the top shows the latest version, and continuing to use
      the Site after a change means you accept it.</p>

      <h2>12. Contact</h2>
      <p>${esc(LEGAL_OPERATOR.name)}, ${esc(LEGAL_OPERATOR.jurisdiction)}, ${esc(LEGAL_OPERATOR.country)} ·
      ${mail}. See also the ${link(PRIVACY_PATH, 'Privacy Policy')}.</p>
`;

  const cookies = `
      ${updated}
      <p>This policy explains the cookies and similar technologies (such as your browser's local
      storage) used on this website. It supplements the ${link(PRIVACY_PATH, 'Privacy Policy')}.</p>

      <h2>No advertising or tracking cookies</h2>
      <p>We set no advertising, social-media or cross-site tracking cookies, and we do not use
      third-party pixels.${analytics ? ' Our analytics, Cloudflare Web Analytics, is cookieless: it stores nothing on your device.' : ''}
      Because of that, there is no cookie banner to answer.</p>

      <h2>What may be stored, and why</h2>
      <table>
        <thead><tr><th>Name or kind</th><th>Set by</th><th>Purpose</th><th>Lasts</th></tr></thead>
        <tbody>
          <tr><td>Local storage: saved inputs, shop rates, saved bids and settings</td><td>This site, in your browser</td><td>Keeps what you entered in a tool for next time, at your request. Never sent to us.</td><td>Until you clear it</td></tr>
          <tr><td>Local storage: usage tallies and the opt-out choice</td><td>This site, in your browser</td><td>Counts which tools you open, on your device only, and remembers if you opted out${counter ? ' of counting' : ''}.</td><td>Until you clear it</td></tr>
          <tr><td>Offline cache (service worker)</td><td>This site, in your browser</td><td>Lets tools you have opened keep working without a connection.</td><td>Until you clear it or a new version replaces it</td></tr>
          <tr><td><code>__cf_bm</code>, <code>cf_clearance</code> and similar</td><td>Cloudflare</td><td>Strictly necessary security cookies, set only when Cloudflare needs to tell people from bots or after a security challenge.</td><td>Up to 30 minutes (<code>__cf_bm</code>) or as Cloudflare sets</td></tr>
        </tbody>
      </table>
      <p>All of these are strictly necessary for something you asked for or for the site's security, so
      the law (the EU ePrivacy Directive and the UK's PECR) does not require consent for them.</p>

      <h2>Your choices</h2>
      <p>You can delete cookies and site data at any time in your browser's settings, or block them;
      the tools will still work, but anything they saved for you will be gone. If we ever add a cookie
      that needs your consent, we will ask first and update this page.</p>

      <h2>Contact</h2>
      <p>${mail}</p>
`;

  return {
    privacy: {
      path: PRIVACY_PATH,
      title: 'Privacy Policy',
      description: `What ${LEGAL_OPERATOR.name} collects on marisstella.app (cookieless analytics, request data, email you send), why, who receives it, and your rights.`,
      body: privacy,
    },
    terms: {
      path: TERMS_PATH,
      title: 'Terms of Use',
      description: `The terms for using marisstella.app and its free tools: licence, acceptable use, no warranty, limitation of liability and governing law.`,
      body: terms,
    },
    cookies: {
      path: COOKIES_PATH,
      title: 'Cookie Policy',
      description: 'The cookies and local storage marisstella.app uses: no advertising or tracking cookies, only what a tool or security needs.',
      body: cookies,
    },
  };
}

/** The short Privacy section every page's footer carries now, in place of the
 *  old "nothing is collected" promise. */
export function legalFooterHtml(toRoot, { analytics = false, counter = false } = {}) {
  const link = (p, label) => `<a href="${esc(`${toRoot}${p}`)}">${label}</a>`;
  return `
      <h2>Privacy and terms</h2>
      <p>
        The free tools run in your browser. We measure how the site is used with
        ${[analytics && 'cookieless Cloudflare Web Analytics', counter && 'aggregate daily page counts', !analytics && !counter && 'what our host, Cloudflare, sees of each request'].filter(Boolean).join(' and ')}, and set no
        advertising or tracking cookies. The ${link(PRIVACY_PATH, 'Privacy Policy')} says exactly what is
        collected and your rights; use of the site is under the ${link(TERMS_PATH, 'Terms of Use')}
        and the ${link(COOKIES_PATH, 'Cookie Policy')}.
      </p>`;
}
