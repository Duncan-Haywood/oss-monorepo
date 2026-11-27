// The launch switch (src/site/launch.ts): one setting moves every page from early access to
// "open now, start free", and paid plans are only described as on sale once checkout is on.
import { PAGE_LIST } from "@shared/site";
import { buildSite } from "@site/build";
import { launchOf, normaliseAppUrl, signupUrl } from "@site/launch";
import { describe, expect, it } from "vitest";

const SITE = "https://marisstella.app/payapps";
const APP = "https://payapps.example.com";
const htmlFiles = (files: Map<string, string>) =>
  [...files].filter(([f]) => f.endsWith(".html")) as [string, string][];

describe("launch switch", () => {
  it("is closed with no app URL and refuses addresses public pages must not link", () => {
    expect(launchOf({ appUrl: null })).toEqual({ open: false, appUrl: null, paidOn: false });
    // Paid plans cannot be on sale while the app is not open.
    expect(launchOf({ appUrl: null, paidOn: true }).paidOn).toBe(false);
    expect(normaliseAppUrl("https://payapps.example.com/")).toBe(APP);
    expect(() => normaliseAppUrl("http://payapps.example.com")).toThrow(/https/);
    expect(() => normaliseAppUrl("https://payapps.example.com/app")).toThrow(/no path/);
    expect(() => normaliseAppUrl("https://payapps.someone.workers.dev")).toThrow(/workers\.dev/);
  });

  it("names the page that sent the visitor", () => {
    expect(signupUrl(APP, "home")).toBe(`${APP}/?signup&from=payapps-site`);
    expect(signupUrl(APP, "pricing")).toBe(`${APP}/?signup&from=payapps-site%2Fpricing`);
  });

  it("before launch: every page says in development and links early access, none to an app", () => {
    const files = buildSite({ siteUrl: SITE, appUrl: null });
    for (const [file, doc] of htmlFiles(files)) {
      expect(doc, file).toContain("in development");
      expect(doc, file).not.toContain("?signup");
      expect(doc, file).not.toContain("open now");
    }
  });

  it("open, paid plans dark: sign-up links on every page, nothing says in development or on sale", () => {
    const files = buildSite({ siteUrl: SITE, appUrl: APP, paidOn: false });
    for (const [file, doc] of htmlFiles(files)) {
      expect(doc, file).not.toMatch(
        /in development|is not open to the public|nothing is for sale/i,
      );
      expect(doc, file).toContain(`href="${APP}/?signup&amp;from=payapps-site%2Fheader"`);
      expect(doc, file).toContain("Paid plans for more jobs are not on sale yet");
    }
    const home = files.get("index.html") ?? "";
    expect(home).toContain(`href="${APP}/?signup&amp;from=payapps-site"`);
    expect(home).toContain("Yes. PayApps is open");
    const pricing = files.get("pricing.html") ?? "";
    expect(pricing).toContain("Can I buy a paid plan today?");
    expect(pricing).toContain("they are not on sale yet");
    expect(pricing).toContain(`from=payapps-site%2Fpricing`);
    const llms = files.get("llms.txt") ?? "";
    expect(llms).toContain(`It is open now at ${APP}/`);
    expect(llms).toContain("Prices (paid plans not on sale yet)");
    expect(llms).not.toContain("in development");
    expect(files.get("feed.xml")).toContain("PayApps is open on the Free plan");
    // Every page still has a title and is still built.
    for (const p of PAGE_LIST) expect(files.has(p.file), p.file).toBe(true);
  });

  it("open with checkout on: prices are on sale, still no offers or ratings in JSON-LD", () => {
    const files = buildSite({ siteUrl: SITE, appUrl: APP, paidOn: true });
    const pricing = files.get("pricing.html") ?? "";
    expect(pricing).not.toContain("not on sale");
    expect(pricing).toContain("Do I need a card to start?");
    expect(files.get("index.html")).toContain("Free on one job, then $99 to $249 a month");
    for (const [file, doc] of htmlFiles(files)) {
      expect(doc, file).not.toMatch(/aggregateRating|"offers"|"review"/);
    }
  });
});
