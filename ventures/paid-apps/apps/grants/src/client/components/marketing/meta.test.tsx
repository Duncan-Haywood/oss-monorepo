// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { canonicalUrl, pageTitle, SITE_URL, useDocumentMeta } from "./meta";

function Page({ title, path }: { title: string; path: string }) {
  useDocumentMeta({ title, description: `About ${title}`, canonicalPath: path });
  return null;
}

const meta = (sel: string) => document.head.querySelector(sel)?.getAttribute("content");

describe("useDocumentMeta", () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="description" content="Default description" />';
    document.title = "Grant Autopilot";
  });

  it("sets title, description, canonical and social tags, then restores them", () => {
    const { rerender, unmount } = render(<Page title="Pricing" path="/pricing" />);
    expect(document.title).toBe("Pricing · Grant Autopilot");
    expect(meta('meta[name="description"]')).toBe("About Pricing");
    expect(meta('meta[property="og:title"]')).toBe("Pricing · Grant Autopilot");
    expect(meta('meta[property="og:url"]')).toBe(`${SITE_URL}/pricing`);
    expect(meta('meta[name="twitter:description"]')).toBe("About Pricing");
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${SITE_URL}/pricing`,
    );

    rerender(<Page title="FAQ" path="/faq" />);
    expect(document.title).toBe("FAQ · Grant Autopilot");
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);

    unmount();
    expect(document.title).toBe("Grant Autopilot");
    expect(meta('meta[name="description"]')).toBe("Default description");
    expect(document.head.querySelector('meta[property="og:title"]')).toBeNull();
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it("builds titles and canonical URLs", () => {
    expect(pageTitle("About us")).toBe("About us · Grant Autopilot");
    expect(pageTitle("Grant Autopilot · Home")).toBe("Grant Autopilot · Home");
    expect(canonicalUrl("/trust")).toBe(`${SITE_URL}/trust`);
    expect(canonicalUrl("/trust")).toBe("https://marisstella.app/grants/trust");
    expect(canonicalUrl("/")).toBe("https://marisstella.app/grants/");
  });
});
