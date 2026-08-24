import { artworkToCheckoutLine, type CheckoutLineItem } from "./checkout";
import { catalogArtworks, roundCurrency, type CatalogArtwork } from "./marketplace";
import { filterStorefrontListings } from "./storefront-catalog";

export const TRADE_DISCOUNT_RATE = 0.32;
export const B2B_PROJECTS_STORAGE_KEY = "print-atelier-b2b-projects";
export const B2B_ACTIVE_PROJECT_STORAGE_KEY = "print-atelier-b2b-active-project";

export type B2BProjectLine = {
  artworkSlug: string;
  quantity: number;
};

export type B2BProject = {
  id: string;
  name: string;
  client: string;
  lines: B2BProjectLine[];
};

export type B2BProjectSummary = {
  pieces: number;
  distinctPrints: number;
  tradeSubtotal: number;
  retailSubtotal: number;
  savings: number;
  unknownSlugs: string[];
};

export type B2BCatalogFilters = {
  query?: string;
};

export function tradePriceFromRetail(retailPrice: number, discountRate = TRADE_DISCOUNT_RATE): number {
  const rate = Math.min(0.9, Math.max(0, discountRate));
  return roundCurrency(retailPrice * (1 - rate));
}

export function filterTradeCatalog(
  artworks: readonly CatalogArtwork[] = catalogArtworks,
  filters: B2BCatalogFilters = {},
): CatalogArtwork[] {
  return filterStorefrontListings(artworks, { query: filters.query });
}

export function seedDefaultB2BProjects(): B2BProject[] {
  return [
    {
      id: "hospitality-lobby",
      name: "Marriott Lobby Refresh",
      client: "Studio North Design",
      lines: [
        { artworkSlug: "midnight-coast", quantity: 4 },
        { artworkSlug: "desert-sun", quantity: 4 },
        { artworkSlug: "urban-geometry", quantity: 4 },
      ],
    },
    {
      id: "corporate-hq",
      name: "Tech HQ Floor 3",
      client: "Meridian Interiors",
      lines: [
        { artworkSlug: "urban-geometry", quantity: 5 },
        { artworkSlug: "desert-sun", quantity: 3 },
      ],
    },
    {
      id: "restaurant",
      name: "Farm-to-Table Restaurant",
      client: "Elena Rostova (direct)",
      lines: [{ artworkSlug: "spring-bloom", quantity: 6 }],
    },
  ];
}

export function slugifyB2BProjectName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `project-${Date.now()}`;
}

export function createB2BProject(name: string, client: string, existingIds: string[] = []): B2BProject {
  const trimmedName = name.trim();
  const trimmedClient = client.trim();
  if (!trimmedName) {
    throw new Error("Project name is required");
  }
  if (!trimmedClient) {
    throw new Error("Client name is required");
  }

  let id = slugifyB2BProjectName(trimmedName);
  if (existingIds.includes(id)) {
    id = `${id}-${Date.now()}`;
  }

  return {
    id,
    name: trimmedName,
    client: trimmedClient,
    lines: [],
  };
}

export function addLineToProject(project: B2BProject, artworkSlug: string, quantity = 1): B2BProject {
  const slug = artworkSlug.trim();
  const increment = Math.max(1, Math.floor(quantity));
  if (!slug) {
    return project;
  }

  const existing = project.lines.find((line) => line.artworkSlug === slug);
  if (existing) {
    return {
      ...project,
      lines: project.lines.map((line) =>
        line.artworkSlug === slug ? { ...line, quantity: line.quantity + increment } : line,
      ),
    };
  }

  return {
    ...project,
    lines: [...project.lines, { artworkSlug: slug, quantity: increment }],
  };
}

export function removeLineFromProject(project: B2BProject, artworkSlug: string): B2BProject {
  return {
    ...project,
    lines: project.lines.filter((line) => line.artworkSlug !== artworkSlug),
  };
}

export function setProjectLineQuantity(
  project: B2BProject,
  artworkSlug: string,
  quantity: number,
): B2BProject {
  const nextQuantity = Math.floor(quantity);
  if (nextQuantity <= 0) {
    return removeLineFromProject(project, artworkSlug);
  }

  if (!project.lines.some((line) => line.artworkSlug === artworkSlug)) {
    return addLineToProject(project, artworkSlug, nextQuantity);
  }

  return {
    ...project,
    lines: project.lines.map((line) =>
      line.artworkSlug === artworkSlug ? { ...line, quantity: nextQuantity } : line,
    ),
  };
}

export function summarizeB2BProject(
  project: B2BProject,
  artworks: readonly CatalogArtwork[] = catalogArtworks,
): B2BProjectSummary {
  const bySlug = new Map(artworks.map((artwork) => [artwork.slug, artwork]));
  let pieces = 0;
  let tradeSubtotal = 0;
  let retailSubtotal = 0;
  const unknownSlugs: string[] = [];

  for (const line of project.lines) {
    const artwork = bySlug.get(line.artworkSlug);
    if (!artwork || artwork.status !== "Live") {
      unknownSlugs.push(line.artworkSlug);
      continue;
    }
    const quantity = Math.max(0, line.quantity);
    pieces += quantity;
    retailSubtotal += artwork.retailPrice * quantity;
    tradeSubtotal += tradePriceFromRetail(artwork.retailPrice) * quantity;
  }

  return {
    pieces,
    distinctPrints: project.lines.length - unknownSlugs.length,
    tradeSubtotal: roundCurrency(tradeSubtotal),
    retailSubtotal: roundCurrency(retailSubtotal),
    savings: roundCurrency(retailSubtotal - tradeSubtotal),
    unknownSlugs,
  };
}

export function projectLinesToCheckoutItems(
  project: B2BProject,
  artworks: readonly CatalogArtwork[] = catalogArtworks,
): CheckoutLineItem[] {
  const bySlug = new Map(artworks.map((artwork) => [artwork.slug, artwork]));
  const lines: CheckoutLineItem[] = [];

  for (const line of project.lines) {
    const artwork = bySlug.get(line.artworkSlug);
    if (!artwork || artwork.status !== "Live" || line.quantity <= 0) {
      continue;
    }
    const checkoutLine = artworkToCheckoutLine(artwork, line.quantity);
    lines.push({
      ...checkoutLine,
      retailPrice: tradePriceFromRetail(artwork.retailPrice),
    });
  }

  return lines;
}

export function parseB2BProjects(raw: string | null): B2BProject[] | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }

    const projects: B2BProject[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const record = item as Partial<B2BProject>;
      if (typeof record.id !== "string" || typeof record.name !== "string" || typeof record.client !== "string") {
        continue;
      }
      const lines = Array.isArray(record.lines)
        ? record.lines
            .filter(
              (line): line is B2BProjectLine =>
                Boolean(
                  line &&
                    typeof line === "object" &&
                    typeof line.artworkSlug === "string" &&
                    typeof line.quantity === "number" &&
                    Number.isFinite(line.quantity),
                ),
            )
            .map((line) => ({
              artworkSlug: line.artworkSlug,
              quantity: Math.max(1, Math.floor(line.quantity)),
            }))
        : [];
      projects.push({
        id: record.id,
        name: record.name,
        client: record.client,
        lines,
      });
    }

    return projects.length > 0 ? projects : null;
  } catch {
    return null;
  }
}

export function loadB2BProjectsFromStorage(): B2BProject[] {
  if (typeof window === "undefined") {
    return seedDefaultB2BProjects();
  }
  return parseB2BProjects(window.localStorage.getItem(B2B_PROJECTS_STORAGE_KEY)) ?? seedDefaultB2BProjects();
}

export function saveB2BProjectsToStorage(projects: B2BProject[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(B2B_PROJECTS_STORAGE_KEY, JSON.stringify(projects));
}

export function loadActiveB2BProjectId(projects: B2BProject[]): string {
  const fallback = projects[0]?.id ?? "";
  if (typeof window === "undefined") {
    return fallback;
  }
  const stored = window.localStorage.getItem(B2B_ACTIVE_PROJECT_STORAGE_KEY);
  if (stored && projects.some((project) => project.id === stored)) {
    return stored;
  }
  return fallback;
}

export function saveActiveB2BProjectId(projectId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(B2B_ACTIVE_PROJECT_STORAGE_KEY, projectId);
}

export function buildB2BPortalHref(query?: string): string {
  const trimmed = query?.trim();
  if (!trimmed) {
    return "/b2b-portal";
  }
  return `/b2b-portal?q=${encodeURIComponent(trimmed)}`;
}
