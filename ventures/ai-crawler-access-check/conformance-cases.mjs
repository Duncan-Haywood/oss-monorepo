// Conformance cases for robots.txt matching: what a crawler following
// RFC 9309 as Google's open-source parser implements it
// (github.com/google/robotstxt, Apache-2.0, commit 22b355f, robots_test.cc)
// decides. Each case restates one behaviour that suite checks, in our own
// files and bot names; none of its text is copied. `group` names the
// behaviour; `rfc` marks behaviour the RFC requires, the rest are Google's
// documented leniencies.
//
// [robots.txt, agent, url, expected allowed]

const L = (...lines) => lines.join("\n") + "\n";

export const CASES = [
  {
    group: "empty file and empty url", rfc: false,
    cases: [
      ["", "GPTBot", "https://a.example/", true],
      [L("User-agent: GPTBot", "Disallow: /"), "GPTBot", "", false],
    ],
  },
  {
    group: "a missing colon is accepted when the line is two words", rfc: false,
    cases: [
      [L("User-agent GPTBot", "Disallow /"), "GPTBot", "https://a.example/x", false],
      [L("Bogus: GPTBot", "Other: /"), "GPTBot", "https://a.example/x", true],
    ],
  },
  {
    group: "every group naming the crawler is merged; rules outside groups are ignored", rfc: true,
    cases: (() => {
      const t = L(
        "Allow: /top/", "",
        "User-agent: GPTBot", "Disallow: /", "Allow: /a/",
        "User-agent: ClaudeBot", "Disallow: /", "Allow: /b/", "", "",
        "Allow: /c/",
        "User-agent: CCBot", "",
        "User-agent: GPTBot", "Allow: /d/", "Disallow: /",
      );
      return [
        [t, "GPTBot", "https://a.example/a/1", true],
        [t, "GPTBot", "https://a.example/d/1", true],
        [t, "GPTBot", "https://a.example/b/1", false],
        [t, "ClaudeBot", "https://a.example/b/1", true],
        [t, "ClaudeBot", "https://a.example/c/1", true],
        [t, "ClaudeBot", "https://a.example/d/1", false],
        [t, "CCBot", "https://a.example/d/1", true],
        [t, "GPTBot", "https://a.example/top/", false],
        [t, "CCBot", "https://a.example/top/", false],
      ];
    })(),
  },
  {
    group: "Sitemap and unknown lines do not close a group", rfc: true,
    cases: [
      [L("User-agent: ClaudeBot", "Sitemap: https://a.example/s.xml", "User-agent: *", "Disallow: /"), "ClaudeBot", "https://a.example/", false],
      [L("User-agent: ClaudeBot", "Crawl-delay: 5", "User-agent: *", "Disallow: /"), "ClaudeBot", "https://a.example/", false],
      [L("User-agent: ClaudeBot", "Crawl-delay: 5", "User-agent: *", "Disallow: /"), "GPTBot", "https://a.example/", false],
    ],
  },
  {
    group: "key names are case-insensitive", rfc: true,
    cases: [
      [L("USER-AGENT: GPTBot", "ALLOW: /x/", "DISALLOW: /"), "GPTBot", "https://a.example/x/y", true],
      [L("uSeR-aGeNt: GPTBot", "AlLoW: /x/", "dIsAlLoW: /"), "GPTBot", "https://a.example/a/b", false],
    ],
  },
  {
    group: "user-agent values are case-insensitive", rfc: true,
    cases: [
      [L("User-agent: GPTBOT", "Allow: /x/", "Disallow: /"), "GPTBot", "https://a.example/x/y", true],
      [L("User-agent: gptbot", "Allow: /x/", "Disallow: /"), "GPTBot", "https://a.example/a/b", false],
    ],
  },
  {
    group: "the user-agent value is cut to its product token", rfc: false,
    cases: [
      [L("User-agent: *", "Disallow: /", "User-agent: GPTBot Extra", "Allow: /x/", "Disallow: /"), "GPTBot", "https://a.example/x/y", true],
      [L("User-agent: CCBot/2.0", "Disallow: /"), "CCBot", "https://a.example/", false],
      [L("User-agent: ClaudeBot (+https://anthropic.com)", "Disallow: /"), "ClaudeBot", "https://a.example/", false],
    ],
  },
  {
    group: "the first matching group wins over *, and with neither nothing applies", rfc: true,
    cases: [
      ["", "GPTBot", "https://a.example/x/y", true],
      [L("User-agent: *", "Allow: /", "User-agent: GPTBot", "Disallow: /"), "GPTBot", "https://a.example/x/y", false],
      [L("User-agent: *", "Allow: /", "User-agent: GPTBot", "Disallow: /"), "ClaudeBot", "https://a.example/x/y", true],
      [L("User-agent: GPTBot", "Allow: /", "User-agent: CCBot", "Disallow: /"), "ClaudeBot", "https://a.example/x/y", true],
      [L("User-agent: *", "Disallow: /x/", "User-agent: GPTBot", "Disallow: /y/"), "GPTBot", "https://a.example/x/page", true],
    ],
  },
  {
    group: "a named group with no rules still shadows *", rfc: true,
    cases: [
      [L("User-agent: *", "Disallow: /", "", "User-agent: GPTBot"), "GPTBot", "https://a.example/", true],
      [L("User-agent: *", "Disallow: /", "", "User-agent: GPTBot", "Disallow:"), "GPTBot", "https://a.example/", true],
    ],
  },
  {
    group: "every * group is merged too", rfc: true,
    cases: [
      [L("User-agent: *", "Disallow: /a/", "", "User-agent: Googlebot", "Disallow: /", "", "User-agent: *", "Disallow: /b/"), "GPTBot", "https://a.example/b/1", false],
      [L("User-agent: * # everyone", "Disallow: /"), "GPTBot", "https://a.example/", false],
    ],
  },
  {
    group: "paths are case-sensitive", rfc: true,
    cases: [
      [L("User-agent: GPTBot", "Disallow: /x/"), "GPTBot", "https://a.example/x/y", false],
      [L("User-agent: GPTBot", "Disallow: /X/"), "GPTBot", "https://a.example/x/y", true],
    ],
  },
  {
    group: "longest match wins and a tie goes to Allow", rfc: true,
    cases: [
      [L("User-agent: GPTBot", "Disallow: /x/page.html", "Allow: /x/"), "GPTBot", "https://a.example/x/page.html", false],
      [L("User-agent: GPTBot", "Allow: /x/page.html", "Disallow: /x/"), "GPTBot", "https://a.example/x/", false],
      [L("User-agent: GPTBot", "Disallow:", "Allow:"), "GPTBot", "https://a.example/x/page.html", true],
      [L("User-agent: GPTBot", "Disallow: /", "Allow: /"), "GPTBot", "https://a.example/x/page.html", true],
      [L("User-agent: GPTBot", "Disallow: /x", "Allow: /x/"), "GPTBot", "https://a.example/x", false],
      [L("User-agent: GPTBot", "Disallow: /x", "Allow: /x/"), "GPTBot", "https://a.example/x/", true],
      [L("User-agent: GPTBot", "Allow: /page", "Disallow: /*.html"), "GPTBot", "https://a.example/page.html", false],
      [L("User-agent: GPTBot", "Allow: /x/page.", "Disallow: /*.html"), "GPTBot", "https://a.example/x/page.html", true],
      [L("User-agent: GPTBot", "Allow: /folder", "Disallow: /folder"), "GPTBot", "https://a.example/folder/page", true],
      [L("User-agent: GPTBot", "Allow: /$", "Disallow: /"), "GPTBot", "https://a.example/", true],
      [L("User-agent: GPTBot", "Allow: /$", "Disallow: /"), "GPTBot", "https://a.example/page.html", false],
    ],
  },
  {
    group: "non-ASCII in patterns is percent-encoded before comparing", rfc: true,
    cases: [
      [L("User-agent: GPTBot", "Disallow: /", "Allow: /café/"), "GPTBot", "https://a.example/caf%C3%A9/menu", true],
      [L("User-agent: GPTBot", "Disallow: /", "Allow: /caf%c3%a9/"), "GPTBot", "https://a.example/caf%C3%A9/menu", true],
      [L("User-agent: GPTBot", "Disallow: /", "Allow: /a?b=http://c.example?d&e"), "GPTBot", "https://a.example/a?b=http://c.example?d&e", true],
      [L("User-agent: GPTBot", "Disallow: /", "Allow: /a/%62%63"), "GPTBot", "https://a.example/a/bc", false],
    ],
  },
  {
    group: "* and a final $ are special; # starts a comment", rfc: true,
    cases: [
      [L("User-agent: GPTBot", "Disallow: /a/b/c", "Allow: /a/*/d"), "GPTBot", "https://a.example/a/b/c", false],
      [L("User-agent: GPTBot", "Disallow: /a/b/c", "Allow: /a/*/d"), "GPTBot", "https://a.example/a//c", true],
      [L("User-agent: GPTBot", "Disallow: /a/b$"), "GPTBot", "https://a.example/a/b", false],
      [L("User-agent: GPTBot", "Disallow: /a/b$"), "GPTBot", "https://a.example/a/b/", true],
      [L("User-agent: GPTBot", "# Disallow: /", "Disallow: /a/q#x", "Allow: /"), "GPTBot", "https://a.example/a/b", true],
      [L("User-agent: GPTBot", "# Disallow: /", "Disallow: /a/q#x", "Allow: /"), "GPTBot", "https://a.example/a/q", false],
      [L("User-agent: GPTBot", "Disallow: /", "Allow: /*.php$"), "GPTBot", "https://a.example/f.php?x=1", false],
      [L("User-agent: GPTBot", "Disallow: /", "Allow: /*.php"), "GPTBot", "https://a.example/index?f=x.php/", true],
      [L("User-agent: GPTBot", "Disallow: /", "Allow: /fish*.php"), "GPTBot", "https://a.example/fishheads/cat.php?p", true],
      [L("User-agent: GPTBot", "Disallow: /", "Allow: /fish"), "GPTBot", "https://a.example/?id=fish", false],
    ],
  },
  {
    group: "Allow: .../index.html also allows the directory", rfc: false,
    cases: [
      [L("User-agent: *", "Allow: /open/index.html", "Disallow: /"), "GPTBot", "https://a.example/open/", true],
      [L("User-agent: *", "Allow: /open/index.html", "Disallow: /"), "GPTBot", "https://a.example/open/index.htm", false],
      [L("User-agent: *", "Allow: /open/index.html", "Disallow: /"), "GPTBot", "https://a.example/open/index.html", true],
    ],
  },
  {
    group: "lines end in LF, CRLF or a lone CR; a final newline is optional", rfc: true,
    cases: [
      ["User-agent: GPTBot\r\nAllow: /x\r\n\r\nDisallow: /\r\n", "GPTBot", "https://a.example/y", false],
      ["User-agent: GPTBot\rAllow: /x\r\rDisallow: /\r", "GPTBot", "https://a.example/y", false],
      ["User-agent: GPTBot\nAllow: /x\nDisallow: /", "GPTBot", "https://a.example/y", false],
    ],
  },
  {
    group: "a UTF-8 byte-order mark is skipped", rfc: false,
    cases: [
      ["\uFEFFUser-agent: GPTBot\nDisallow: /\n", "GPTBot", "https://a.example/", false],
    ],
  },
  {
    group: "common misspellings of the keys are accepted", rfc: false,
    cases: [
      [L("Useragent: GPTBot", "Disallow: /"), "GPTBot", "https://a.example/", false],
      [L("User agent: GPTBot", "Disallow: /"), "GPTBot", "https://a.example/", false],
      [L("User-agent: GPTBot", "Dissallow: /"), "GPTBot", "https://a.example/", false],
      [L("User-agent: GPTBot", "Disalow: /"), "GPTBot", "https://a.example/", false],
    ],
  },
  {
    group: "robots.txt itself is never blocked", rfc: true,
    cases: [
      [L("User-agent: *", "Disallow: /"), "GPTBot", "https://a.example/robots.txt", true],
    ],
  },
];

export const ALL = CASES.flatMap((g) => g.cases.map((c) => ({ group: g.group, rfc: g.rfc, robots: c[0], agent: c[1], url: c[2], expected: c[3] })));
