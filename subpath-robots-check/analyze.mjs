// Does the site at this URL actually govern its own robots.txt?
//
// The rule crawlers follow is in RFC 9309 §2.3: a robots.txt applies to the
// *origin* it is served from, and the only place a crawler looks for it is
// `<scheme>://<host>:<port>/robots.txt`. Nothing else is consulted. A site
// published under a path prefix -- `user.github.io/repo/`, `group.gitlab.io/
// project/`, a CDN or S3 subdirectory -- therefore publishes a robots.txt at
// `.../repo/robots.txt` that no crawler ever requests.
//
// The consequence that actually costs traffic is not the disallow rules. It
// is the `Sitemap:` line: sitemap auto-discovery reads that line out of the
// governing robots.txt, so a sitemap advertised only from a subpath is never
// found, and the site's pages are never enumerated. Crawling still works by
// following links -- which is why this failure is silent. Nothing 404s,
// nothing errors, and the site looks fine to every tool that checks the
// origin root.
//
// Everything here is pure: given a URL string and optional robots.txt text,
// it returns a report. No network calls anywhere in this module.

/** Severity ranking, high to low, used for sorting findings. */
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2, pass: 3 };

/**
 * Hosts whose project sites are always published under a path prefix, with
 * the origin root owned by a *different* repository or project than the one
 * publishing the site. Naming that other repository is the whole point: it is
 * the difference between "your sitemap is invisible" and "your sitemap is
 * invisible and here is the exact repo you would have to control to fix it".
 */
const KNOWN_HOSTS = [
  {
    id: "github-pages",
    // `<user>.github.io` -- personal or organization account.
    match: (host) => /^[a-z0-9-]+\.github\.io$/i.test(host),
    rootOwner: (host) => {
      const account = host.replace(/\.github\.io$/i, "");
      return {
        label: `the GitHub repository named \`${host}\``,
        account,
        note:
          `On GitHub Pages, \`https://${host}/robots.txt\` is served by the ` +
          `repository named \`${host}\` (the user or organization site). If ` +
          `\`${account}\` has no such repository, GitHub returns 404 for it, ` +
          `which crawlers treat as "no restrictions" -- so nothing blocks ` +
          `your pages, but there is also no file anywhere that could carry ` +
          `your \`Sitemap:\` line.`,
      };
    },
  },
  {
    id: "gitlab-pages",
    match: (host) => /^[a-z0-9-]+\.gitlab\.io$/i.test(host),
    rootOwner: (host) => {
      const group = host.replace(/\.gitlab\.io$/i, "");
      return {
        label: `the GitLab project named \`${group}.gitlab.io\``,
        account: group,
        note:
          `On GitLab Pages, \`https://${host}/robots.txt\` is served by the ` +
          `project named \`${group}.gitlab.io\` inside the \`${group}\` ` +
          `namespace. Every other project in that namespace is published ` +
          `under a path prefix and cannot reach it.`,
      };
    },
  },
];

/**
 * Parse a URL into the parts this check reasons about.
 *
 * Returns `{ ok: false, error }` rather than throwing, because the browser
 * page feeds user input straight in and an exception there is a blank screen.
 */
export function parseSiteUrl(input) {
  const raw = String(input == null ? "" : input).trim();
  if (!raw) return { ok: false, error: "Enter the URL your site is published at." };

  // A bare `user.github.io/repo/` is what people actually paste. Assume https
  // rather than rejecting it; the scheme does not change any conclusion here.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: `Not a URL this tool can read: ${raw}` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      error: `Only http and https URLs have a robots.txt. Got ${url.protocol.replace(":", "")}.`,
    };
  }

  // The path prefix the site occupies. A URL ending in a file name (`.../
  // index.html`) still describes a site rooted at that file's directory, so
  // trim the last segment when it looks like a file rather than a directory.
  let pathname = url.pathname || "/";
  const lastSegment = pathname.split("/").pop();
  if (lastSegment && lastSegment.includes(".")) {
    pathname = pathname.slice(0, pathname.length - lastSegment.length);
  }
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  if (!pathname.endsWith("/")) pathname += "/";

  const isSubpath = pathname !== "/";

  return {
    ok: true,
    origin: url.origin,
    host: url.host,
    pathname,
    isSubpath,
    // The file a crawler will actually request. Always origin-rooted.
    governingRobotsUrl: `${url.origin}/robots.txt`,
    // The file the site itself publishes, which is only the same file when
    // the site is at the origin root.
    publishedRobotsUrl: `${url.origin}${pathname}robots.txt`,
    publishedSitemapUrl: `${url.origin}${pathname}sitemap.xml`,
  };
}

/**
 * Parse robots.txt into directive records.
 *
 * Deliberately lenient: this is not a validator, and a file that a crawler
 * would partly ignore is exactly the file a user is most likely to paste.
 * Unknown fields are kept rather than dropped so the inert-directive report
 * can name them.
 */
export function parseRobotsTxt(text) {
  const lines = String(text == null ? "" : text).split(/\r?\n/);
  const directives = [];
  const sitemaps = [];
  let currentAgents = [];
  // Consecutive `User-agent:` lines form one group; the first non-agent
  // directive closes the group and starts a new one on the next agent line.
  let groupOpen = false;

  lines.forEach((line, index) => {
    const withoutComment = line.replace(/#.*$/, "").trim();
    if (!withoutComment) return;
    const colon = withoutComment.indexOf(":");
    if (colon === -1) return;
    const field = withoutComment.slice(0, colon).trim().toLowerCase();
    const value = withoutComment.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (groupOpen) {
        currentAgents = [];
        groupOpen = false;
      }
      currentAgents.push(value);
      return;
    }
    if (field === "sitemap") {
      // `Sitemap:` is explicitly group-independent in RFC 9309 -- it belongs
      // to the file, not to any user-agent group.
      sitemaps.push({ line: index + 1, value });
      return;
    }
    groupOpen = true;
    directives.push({
      line: index + 1,
      field,
      value,
      agents: currentAgents.length ? [...currentAgents] : ["*"],
    });
  });

  return { directives, sitemaps };
}

/**
 * Does a robots.txt group's path rules allow a given path?
 *
 * Implements the longest-match rule from RFC 9309 §2.2.2: the most specific
 * matching rule wins, and Allow wins a tie. Only used for the *governing*
 * file, to answer "is my subpath blocked by a file I do not control?".
 */
export function pathAllowedBy(parsed, path, userAgent = "*") {
  const agent = String(userAgent).toLowerCase();
  const applicable = parsed.directives.filter(
    (d) =>
      (d.field === "allow" || d.field === "disallow") &&
      d.agents.some((a) => a === "*" || a.toLowerCase() === agent),
  );
  // A more specific group replaces the wildcard group entirely.
  const named = applicable.filter((d) => d.agents.some((a) => a.toLowerCase() === agent));
  const group = named.length ? named : applicable;

  let best = null;
  for (const rule of group) {
    if (!matchesRobotsPattern(rule.value, path)) continue;
    const specificity = rule.value.length;
    if (
      !best ||
      specificity > best.specificity ||
      (specificity === best.specificity && rule.field === "allow")
    ) {
      best = { specificity, field: rule.field, rule };
    }
  }
  if (!best) return { allowed: true, rule: null };
  // An empty `Disallow:` value means "allow everything" by convention.
  if (best.field === "disallow" && best.rule.value === "") return { allowed: true, rule: best.rule };
  return { allowed: best.field === "allow", rule: best.rule };
}

/** `*` wildcard and `$` end-anchor matching, per RFC 9309 §2.2.3. */
function matchesRobotsPattern(pattern, path) {
  if (pattern === "") return true;
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`).exec(path) !== null;
}

/** Which named host, if any, this URL is published on. */
export function identifyHost(host) {
  for (const known of KNOWN_HOSTS) {
    if (known.match(host)) return { id: known.id, ...known.rootOwner(host) };
  }
  return null;
}

/**
 * The full report.
 *
 * @param {object} input
 * @param {string} input.siteUrl        where the site is published
 * @param {string} [input.publishedRobots] contents of the robots.txt the site
 *                                       itself publishes (optional)
 * @param {string} [input.governingRobots] contents of the origin-root
 *                                       robots.txt, if the user fetched it
 */
export function assess({ siteUrl, publishedRobots = "", governingRobots = "" } = {}) {
  const parsed = parseSiteUrl(siteUrl);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const hostInfo = identifyHost(parsed.host);
  const findings = [];

  if (!parsed.isSubpath) {
    findings.push({
      id: "origin-root",
      severity: "pass",
      title: "This site is at an origin root, so its own robots.txt governs it",
      detail:
        `\`${parsed.governingRobotsUrl}\` is both the file a crawler requests and ` +
        `the file this site publishes. Sitemap auto-discovery works, and the ` +
        `crawl directives you write apply.`,
      remedy: null,
    });
  } else {
    const owner = hostInfo
      ? hostInfo.label
      : "whoever controls the root of this origin";

    findings.push({
      id: "robots-not-yours",
      severity: "critical",
      title: "The robots.txt governing this site is not the one it publishes",
      detail:
        `This site is published under the path prefix \`${parsed.pathname}\`, but a ` +
        `crawler only ever requests \`${parsed.governingRobotsUrl}\` -- served by ` +
        `${owner}. The file at \`${parsed.publishedRobotsUrl}\` is fetched by ` +
        `nothing.` + (hostInfo ? ` ${hostInfo.note}` : ""),
      remedy:
        "Publish at an origin root instead -- a custom domain is the usual way -- " +
        "or accept that the origin owner's file is the one that applies.",
    });

    findings.push({
      id: "sitemap-never-discovered",
      severity: "critical",
      title: "Sitemap auto-discovery cannot happen for this site",
      detail:
        `Crawlers discover a sitemap from the \`Sitemap:\` line in the robots.txt ` +
        `they read -- the origin-root one. A \`Sitemap:\` line inside ` +
        `\`${parsed.publishedRobotsUrl}\` is never seen, so ` +
        `\`${parsed.publishedSitemapUrl}\` is never requested and this site's pages ` +
        `are never enumerated from it. Nothing errors when this happens, which ` +
        `is why it usually goes unnoticed: pages that are linked still get ` +
        `crawled, and pages that are only in the sitemap never do.`,
      remedy:
        "Submit the sitemap URL directly in Google Search Console and Bing " +
        "Webmaster Tools, and/or announce new URLs over IndexNow. Both bypass " +
        "robots.txt discovery entirely.",
    });
  }

  const published = parseRobotsTxt(publishedRobots);
  if (parsed.isSubpath && publishedRobots.trim()) {
    const inertRules = published.directives.filter(
      (d) => d.field === "disallow" || d.field === "allow" || d.field === "crawl-delay",
    );
    if (published.sitemaps.length) {
      findings.push({
        id: "inert-sitemap-line",
        severity: "warning",
        title: `${published.sitemaps.length} \`Sitemap:\` line${published.sitemaps.length === 1 ? "" : "s"} in this file will never be read`,
        detail:
          `Line${published.sitemaps.length === 1 ? "" : "s"} ` +
          published.sitemaps.map((s) => s.line).join(", ") +
          `: ${published.sitemaps.map((s) => `\`${s.value}\``).join(", ")}. ` +
          `These are correct entries in a file no crawler requests.`,
        remedy:
          "Keep them -- they cost nothing and become live the moment the site " +
          "moves to an origin root -- but do not count on them for discovery today.",
      });
    }
    if (inertRules.length) {
      findings.push({
        id: "inert-directives",
        severity: "warning",
        title: `${inertRules.length} crawl directive${inertRules.length === 1 ? "" : "s"} in this file ${inertRules.length === 1 ? "does" : "do"} not apply`,
        detail:
          `${inertRules
            .slice(0, 8)
            .map((d) => `line ${d.line}: \`${d.field}: ${d.value}\``)
            .join("; ")}${inertRules.length > 8 ? `; and ${inertRules.length - 8} more` : ""}. ` +
          `This cuts both ways, and the second direction is the one people miss: ` +
          `you cannot *block* a crawler from a subpath site either. A ` +
          `\`Disallow:\` you wrote to keep a draft page out of search is not ` +
          `being honoured.`,
        remedy:
          "Use a `<meta name=\"robots\" content=\"noindex\">` tag or an " +
          "`X-Robots-Tag` header on the pages themselves. Those are per-page and " +
          "need no origin-root file.",
      });
    }
  }

  // The governing file, when the user has gone and fetched it, answers the
  // question that actually decides whether anything gets indexed at all.
  if (governingRobots.trim()) {
    const governing = parseRobotsTxt(governingRobots);
    const verdict = pathAllowedBy(governing, parsed.pathname);
    if (!verdict.allowed) {
      findings.push({
        id: "blocked-by-origin-root",
        severity: "critical",
        title: "The origin-root robots.txt blocks this site's path",
        detail:
          `\`${verdict.rule.field}: ${verdict.rule.value}\` (line ${verdict.rule.line}) ` +
          `matches \`${parsed.pathname}\` and is the most specific matching rule, so ` +
          `compliant crawlers will not fetch these pages at all. This file is ` +
          `served by ${hostInfo ? hostInfo.label : "the origin owner"}, so it ` +
          `cannot be changed from this site's own repository.`,
        remedy:
          "Move to an origin root (custom domain), or change the origin-root " +
          "robots.txt if you control it.",
      });
    } else {
      findings.push({
        id: "allowed-by-origin-root",
        severity: "pass",
        title: "The origin-root robots.txt allows this site's path",
        detail: verdict.rule
          ? `\`${verdict.rule.field}: ${verdict.rule.value}\` (line ${verdict.rule.line}) is ` +
            `the most specific matching rule, and it allows \`${parsed.pathname}\`.`
          : `No rule in that file matches \`${parsed.pathname}\`, and an unmatched ` +
            `path is allowed by default.`,
        remedy: null,
      });
    }

    const listsOurSitemap = governing.sitemaps.some((s) =>
      s.value.includes(parsed.pathname),
    );
    if (parsed.isSubpath) {
      findings.push({
        id: listsOurSitemap ? "sitemap-listed-at-root" : "sitemap-absent-at-root",
        severity: listsOurSitemap ? "pass" : "warning",
        title: listsOurSitemap
          ? "The origin-root robots.txt does list a sitemap under this path"
          : "The origin-root robots.txt lists no sitemap under this path",
        detail: listsOurSitemap
          ? `${governing.sitemaps
              .filter((s) => s.value.includes(parsed.pathname))
              .map((s) => `\`${s.value}\``)
              .join(", ")} -- so auto-discovery can reach this site after all. ` +
            `Someone with access to the origin root added it.`
          : `Its \`Sitemap:\` lines are ` +
            (governing.sitemaps.length
              ? governing.sitemaps.map((s) => `\`${s.value}\``).join(", ")
              : "absent entirely") +
            `, none of which points under \`${parsed.pathname}\`. This confirms the ` +
            `discovery gap above rather than merely predicting it.`,
        remedy: listsOurSitemap
          ? null
          : "Ask whoever controls the origin root to add a `Sitemap:` line for " +
            "this site, or submit the sitemap directly to each search engine.",
      });
    }
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const critical = findings.filter((f) => f.severity === "critical").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;

  return {
    ok: true,
    site: {
      origin: parsed.origin,
      host: parsed.host,
      pathname: parsed.pathname,
      isSubpath: parsed.isSubpath,
      governingRobotsUrl: parsed.governingRobotsUrl,
      publishedRobotsUrl: parsed.publishedRobotsUrl,
      publishedSitemapUrl: parsed.publishedSitemapUrl,
    },
    hostKind: hostInfo ? hostInfo.id : parsed.isSubpath ? "generic-subpath" : "origin-root",
    governs: !parsed.isSubpath,
    counts: { critical, warnings },
    verdict: critical
      ? "does-not-govern"
      : warnings
        ? "governs-with-warnings"
        : "governs",
    findings,
    remedies: remediesFor(parsed, hostInfo),
  };
}

/**
 * Ranked remedies. Ordered by how completely each one fixes the problem
 * rather than by effort, with the effort stated so the reader can choose.
 */
export function remediesFor(parsed, hostInfo) {
  if (!parsed.isSubpath) return [];
  return [
    {
      id: "custom-domain",
      title: "Put the site on its own domain",
      effect: "complete",
      detail:
        `The site moves to an origin root, its own robots.txt becomes the ` +
        `governing file, and sitemap auto-discovery starts working with no ` +
        `further action.` +
        (hostInfo && hostInfo.id === "github-pages"
          ? " GitHub Pages supports this directly: set the custom domain in the repository's Pages settings and it serves a CNAME."
          : ""),
      cost: "A domain registration, plus one DNS record.",
    },
    {
      id: "direct-submission",
      title: "Submit the sitemap URL directly to each search engine",
      effect: "partial",
      detail:
        `Google Search Console and Bing Webmaster Tools both accept a sitemap ` +
        `URL typed in by hand, which skips robots.txt discovery entirely. This ` +
        `does not help crawlers that only auto-discover.`,
      cost: "Free, but needs a verified account per search engine, and site verification usually means adding a file or DNS record.",
    },
    {
      id: "indexnow",
      title: "Announce URLs over IndexNow",
      effect: "partial",
      detail:
        `IndexNow is a push protocol: you POST the list of URLs with a key file ` +
        `hosted on the site. It needs no robots.txt and no account. Bing, Yandex ` +
        `and Seznam consume it; Google does not.`,
      cost: "Free. The key file must be reachable at the submitted URLs' path prefix, which a subpath site can do.",
    },
    {
      id: "link-graph",
      title: "Make every page reachable by links from a page that is already crawled",
      effect: "partial",
      detail:
        `Link-following is unaffected by any of this -- it is only *enumeration* ` +
        `that breaks. A hub page linking every URL, itself linked from somewhere ` +
        `already indexed, gets the same pages crawled without a sitemap.`,
      cost: "Free, but slower than a sitemap and it needs at least one inbound link from an already-crawled site.",
    },
    {
      id: "meta-robots",
      title: "Use per-page robots meta tags for anything you need to exclude",
      effect: "complete for exclusion",
      detail:
        `\`<meta name="robots" content="noindex">\` and the \`X-Robots-Tag\` ` +
        `header work per page and need no origin-root file, so they are the only ` +
        `reliable way for a subpath site to keep a page out of an index.`,
      cost: "Free. One tag per page you want excluded.",
    },
  ];
}
