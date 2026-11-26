// @vitest-environment happy-dom
import { RESOURCE_ARTICLES } from "@client/content/resources";
import { render, screen, within } from "@testing-library/react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const params = vi.hoisted(() => ({ slug: "" }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params: p, ...rest }: Record<string, unknown>) => (
    <a
      href={String(to).replace("$doc", String((p as { doc?: string } | undefined)?.doc))}
      {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
    >
      {children as React.ReactNode}
    </a>
  ),
  useNavigate: () => () => Promise.resolve(),
  useParams: () => ({ slug: params.slug }),
}));

const { ResourcesPage } = await import("./resources");
const { ResourceArticlePage } = await import("./resource-article");

const [first] = RESOURCE_ARTICLES;
if (!first) throw new Error("no resource articles");

describe("<ResourcesPage>", () => {
  it("lists every article with a link to its page", () => {
    render(<ResourcesPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const list = within(screen.getByRole("region", { name: "All guides" }));
    expect(list.getAllByRole("article")).toHaveLength(RESOURCE_ARTICLES.length);
    for (const article of RESOURCE_ARTICLES) {
      expect(list.getByRole("link", { name: article.title })).toHaveAttribute(
        "href",
        `/resources/${article.slug}`,
      );
    }
    expect(document.title).toBe("Grant resources for small nonprofits · Grant Autopilot");
  });

  it("has breadcrumbs and a sign-up call to action", () => {
    render(<ResourcesPage />);
    const crumbs = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(crumbs.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(crumbs.getByText("Resources")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/signup");
    expect(screen.getAllByRole("link", { name: /Create your account/ })[0]).toHaveAttribute(
      "href",
      "/signup",
    );
  });
});

describe("<ResourceArticlePage>", () => {
  beforeEach(() => {
    params.slug = "";
  });

  it("renders the article's h1, body, sources and related guides", () => {
    params.slug = first.slug;
    render(<ResourceArticlePage />);

    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(first.title);
    expect(document.title).toBe(`${first.title} · Grant Autopilot`);

    const crumbs = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(crumbs.getByRole("link", { name: "Resources" })).toHaveAttribute("href", "/resources");
    expect(crumbs.getByText(first.title)).toHaveAttribute("aria-current", "page");

    // Markdown "##" headings become h2s under the page's h1.
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(3);

    const sources = within(screen.getByRole("region", { name: "Sources" }));
    const items = sources.getAllByRole("listitem");
    expect(items).toHaveLength(first.sources.length);
    first.sources.forEach((source, i) => {
      const link = within(items[i] as HTMLElement).getByRole("link");
      expect(link).toHaveAttribute("href", source.url);
      expect(link).toHaveTextContent(source.title);
    });

    const related = within(screen.getByRole("region", { name: "Related guides" }));
    const relatedLinks = related
      .getAllByRole("article")
      .map((a) => within(a).getByRole("link").getAttribute("href"));
    expect(relatedLinks).toHaveLength(3);
    expect(relatedLinks).not.toContain(`/resources/${first.slug}`);

    expect(
      within(screen.getByRole("region", { name: /Turn the documents you already have/ })).getByRole(
        "link",
        { name: /Create your account/ },
      ),
    ).toHaveAttribute("href", "/signup");
  });

  it("renders every article without crashing", () => {
    for (const article of RESOURCE_ARTICLES) {
      params.slug = article.slug;
      const { unmount } = render(<ResourceArticlePage />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(article.title);
      unmount();
    }
  });

  it("shows not-found for an unknown slug", () => {
    params.slug = "no-such-guide";
    render(<ResourceArticlePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Guide not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse all guides" })).toHaveAttribute(
      "href",
      "/resources",
    );
    expect(screen.queryByRole("region", { name: "Sources" })).not.toBeInTheDocument();
    expect(document.title).toBe("Guide not found · Grant Autopilot");
  });
});
