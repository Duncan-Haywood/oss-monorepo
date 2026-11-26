import { describe, expect, it } from "vitest";
import {
  crawlDelaySeconds,
  isAllowed,
  isAllowedByPolicy,
  matchesPattern,
  parseRobotsTxt,
  productToken,
} from "./robots";

const BOT = "GrantAutopilotBot";
const allowed = (txt: string, path: string, ua = BOT) => isAllowed(parseRobotsTxt(txt), ua, path);

describe("productToken", () => {
  it("extracts the product token from a full user agent", () => {
    expect(productToken("GrantAutopilotBot/0.1 (+https://x; respects robots.txt)")).toBe(
      "grantautopilotbot",
    );
    expect(productToken("Googlebot-Image/1.0")).toBe("googlebot-image");
  });
});

describe("path matching (Google spec examples)", () => {
  const cases: [string, string[], string[]][] = [
    [
      "/fish",
      [
        "/fish",
        "/fish.html",
        "/fish/salmon.html",
        "/fishheads",
        "/fishheads/yummy.html",
        "/fish.php?id=anything",
      ],
      ["/Fish.asp", "/catfish", "/?id=fish", "/desert/fish"],
    ],
    [
      "/fish*",
      [
        "/fish",
        "/fish.html",
        "/fish/salmon.html",
        "/fishheads",
        "/fishheads/yummy.html",
        "/fish.php?id=anything",
      ],
      ["/Fish.asp", "/catfish", "/?id=fish", "/desert/fish"],
    ],
    [
      "/fish/",
      ["/fish/", "/fish/?id=anything", "/fish/salmon.htm"],
      ["/fish", "/fish.html", "/animals/fish/", "/Fish/Salmon.asp"],
    ],
    [
      "/*.php",
      [
        "/index.php",
        "/filename.php",
        "/folder/filename.php",
        "/folder/filename.php?parameters",
        "/folder/any.php.file.html",
        "/filename.php/",
      ],
      ["/", "/windows.PHP"],
    ],
    [
      "/*.php$",
      ["/filename.php", "/folder/filename.php"],
      ["/filename.php?parameters", "/filename.php/", "/filename.php5", "/windows.PHP"],
    ],
    ["/fish*.php", ["/fish.php", "/fishheads/catfish.php?parameters"], ["/Fish.PHP"]],
    ["/", ["/", "/anything", "/a/b?c=d"], []],
    ["/*", ["/", "/anything"], []],
  ];
  for (const [pattern, yes, no] of cases) {
    it(`pattern ${pattern}`, () => {
      for (const p of yes) expect(matchesPattern(p, pattern), `${pattern} ~ ${p}`).toBe(true);
      for (const p of no) expect(matchesPattern(p, pattern), `${pattern} !~ ${p}`).toBe(false);
    });
  }

  it("treats $ in the middle of a pattern literally", () => {
    expect(matchesPattern("/a$b", "/a$b")).toBe(true);
    expect(matchesPattern("/ab", "/a$b")).toBe(false);
  });

  it("is linear on hostile wildcard patterns", () => {
    const path = `/${"a".repeat(5000)}`;
    const t0 = Date.now();
    expect(matchesPattern(path, "/*a*a*a*a*a*a*a*a*a*a*b")).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

describe("rule precedence (Google spec examples)", () => {
  const grp = (allow: string, disallow: string) =>
    `user-agent: *\nallow: ${allow}\ndisallow: ${disallow}\n`;
  it("more specific (longer) rule wins", () => {
    expect(allowed(grp("/p", "/"), "/page")).toBe(true);
    expect(allowed(grp("/page", "/*.htm"), "/page.htm")).toBe(false);
  });
  it("equal length: least restrictive (allow) wins", () => {
    expect(allowed(grp("/folder", "/folder"), "/folder/page")).toBe(true);
    expect(allowed(grp("/page", "/*.ph"), "/page.php5")).toBe(true);
  });
  it("$ anchors", () => {
    expect(allowed(grp("/$", "/"), "/")).toBe(true);
    expect(allowed(grp("/$", "/"), "/page.htm")).toBe(false);
  });
  it("no matching rule means allowed", () => {
    expect(allowed("user-agent: *\ndisallow: /private\n", "/public")).toBe(true);
  });
  it("empty disallow allows everything", () => {
    expect(allowed("user-agent: *\ndisallow:\n", "/anything")).toBe(true);
  });
  it("/robots.txt itself is always allowed", () => {
    expect(allowed("user-agent: *\ndisallow: /\n", "/robots.txt")).toBe(true);
  });
});

describe("group selection", () => {
  const txt = [
    "# comment line",
    "user-agent: a",
    "disallow: /c",
    "",
    "user-agent: b",
    "disallow: /d",
    "",
    "user-agent: e",
    "user-agent: f",
    "disallow: /g",
    "",
    "user-agent: h",
    "",
    "user-agent: *",
    "disallow: /star",
  ].join("\n");

  it("each agent gets its own group; consecutive UA lines share a group", () => {
    expect(allowed(txt, "/c", "a")).toBe(false);
    expect(allowed(txt, "/d", "a")).toBe(true);
    expect(allowed(txt, "/d", "b")).toBe(false);
    expect(allowed(txt, "/g", "e")).toBe(false);
    expect(allowed(txt, "/g", "f")).toBe(false);
  });

  it("user-agent lines separated only by blank lines form one group (h joins *)", () => {
    // Per RFC 9309 blank lines don't end a group: "h" and "*" share the /star rule.
    expect(allowed(txt, "/star", "h")).toBe(false);
  });

  it("falls back to * when no specific group matches, and specific beats *", () => {
    expect(allowed(txt, "/star", BOT)).toBe(false);
    expect(allowed(txt, "/c", BOT)).toBe(true);
    expect(allowed(txt, "/star", "a")).toBe(true);
  });

  it("matches our token case-insensitively and ignores version suffixes", () => {
    const t =
      "User-Agent: grantautopilotbot/1.0\nDisallow: /secret\n\nUser-agent: *\nDisallow: /\n";
    expect(allowed(t, "/secret", "GrantAutopilotBot/0.1 (+https://x)")).toBe(false);
    expect(allowed(t, "/open", "GrantAutopilotBot/0.1 (+https://x)")).toBe(true);
    expect(allowed(t, "/open", "OtherBot")).toBe(false);
  });

  it("merges multiple groups for the same agent", () => {
    const t =
      "user-agent: x\ndisallow: /a\n\nuser-agent: y\ndisallow: /q\n\nuser-agent: x\ndisallow: /b\n";
    expect(allowed(t, "/a", "x")).toBe(false);
    expect(allowed(t, "/b", "x")).toBe(false);
    expect(allowed(t, "/q", "x")).toBe(true);
  });

  it("ignores rules before any user-agent line and unknown keys", () => {
    const t = "disallow: /early\nfoo: bar\nuser-agent: *\ndisallow: /late\n";
    expect(allowed(t, "/early")).toBe(true);
    expect(allowed(t, "/late")).toBe(false);
  });

  it("no groups at all → allowed", () => {
    expect(allowed("", "/x")).toBe(true);
    expect(allowed("Sitemap: https://e.org/s.xml", "/x")).toBe(true);
  });
});

describe("parsing details", () => {
  it("handles BOM, CRLF, comments, odd casing and missing colon", () => {
    const t = "﻿USER-AGENT: *\r\nDisallow: /a # trailing comment\r\ndisallow /b\r\n";
    expect(allowed(t, "/a")).toBe(false);
    expect(allowed(t, "/b")).toBe(false);
    expect(allowed(t, "/c")).toBe(true);
  });

  it("accepts common typos of disallow and user-agent", () => {
    expect(allowed("useragent: *\ndissallow: /x\n", "/x")).toBe(false);
  });

  it("collects sitemaps without ending a user-agent run", () => {
    const r = parseRobotsTxt(
      "user-agent: a\nsitemap: https://e.org/s.xml\nuser-agent: b\ndisallow: /x\n",
    );
    expect(r.sitemaps).toEqual(["https://e.org/s.xml"]);
    expect(isAllowed(r, "a", "/x")).toBe(false);
  });

  it("normalizes percent-encoding and non-ASCII paths", () => {
    expect(allowed("user-agent: *\ndisallow: /caf%c3%a9\n", "/caf%C3%A9")).toBe(false);
    expect(allowed("user-agent: *\ndisallow: /café\n", "/caf%C3%A9")).toBe(false);
    expect(allowed("user-agent: *\ndisallow: /%7Ejoe\n", "/~joe")).toBe(false);
  });

  it("reads crawl-delay for the selected group", () => {
    const r = parseRobotsTxt(
      "user-agent: *\ncrawl-delay: 2.5\n\nuser-agent: grantautopilotbot\ncrawl-delay: 7\n",
    );
    expect(crawlDelaySeconds(r, BOT)).toBe(7);
    expect(crawlDelaySeconds(r, "other")).toBe(2.5);
    expect(crawlDelaySeconds(parseRobotsTxt("user-agent: *\ndisallow: /x"), BOT)).toBeNull();
  });
});

describe("isAllowedByPolicy", () => {
  it("allow_all / disallow_all", () => {
    expect(isAllowedByPolicy({ kind: "allow_all" }, BOT, "/x")).toBe(true);
    expect(isAllowedByPolicy({ kind: "disallow_all" }, BOT, "/x")).toBe(false);
    expect(isAllowedByPolicy({ kind: "disallow_all" }, BOT, "/robots.txt")).toBe(true);
  });
});
