import { beforeEach, describe, expect, it, vi } from "vitest";
import CheckoutPage from "./page";

const mockGetLeadBySlug = vi.fn();

vi.mock("@/lib/db", () => ({
  getLeadBySlug: (...args: unknown[]) => mockGetLeadBySlug(...args),
}));

describe("CheckoutPage component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with default prefill when no searchParams are provided", async () => {
    mockGetLeadBySlug.mockResolvedValue(null);

    const jsx = await CheckoutPage({ searchParams: Promise.resolve({}) });
    expect(jsx).toBeDefined();
    expect(jsx.type).toBe("main");
    expect(mockGetLeadBySlug).not.toHaveBeenCalled();

    // Verify CheckoutForm receives default prefill
    const suspense = jsx.props.children[1];
    const checkoutForm = suspense.props.children;
    expect(checkoutForm.props.prefill).toEqual({
      slug: undefined,
      businessName: undefined,
      email: undefined,
      recommendedTier: undefined,
      initialTier: undefined,
      initialCommerce: false,
    });
  });

  it("fetches lead by slug and passes prefilled props to CheckoutForm", async () => {
    const mockLead = {
      slug: "acme-bakery",
      businessName: "Acme Bakery",
      email: "hello@acme.com",
      recommendedTier: "growth" as const,
    };
    mockGetLeadBySlug.mockResolvedValue(mockLead);

    const jsx = await CheckoutPage({
      searchParams: Promise.resolve({ slug: "acme-bakery", tier: "complete", commerce: "1" }),
    });

    expect(mockGetLeadBySlug).toHaveBeenCalledWith("acme-bakery");

    const suspense = jsx.props.children[1];
    const checkoutForm = suspense.props.children;
    expect(checkoutForm.props.prefill).toEqual({
      slug: "acme-bakery",
      businessName: "Acme Bakery",
      email: "hello@acme.com",
      recommendedTier: "growth",
      initialTier: "complete",
      initialCommerce: true,
    });
  });

  it("handles commerce='true' string flag in searchParams", async () => {
    mockGetLeadBySlug.mockResolvedValue(null);

    const jsx = await CheckoutPage({
      searchParams: Promise.resolve({ slug: "my-shop", commerce: "true" }),
    });

    const suspense = jsx.props.children[1];
    const checkoutForm = suspense.props.children;
    expect(checkoutForm.props.prefill.initialCommerce).toBe(true);
  });

  it("renders cancellation warning banner when cancelled searchParam is '1'", async () => {
    mockGetLeadBySlug.mockResolvedValue(null);

    const jsx = await CheckoutPage({
      searchParams: Promise.resolve({ cancelled: "1", slug: "my-cafe" }),
    });

    expect(jsx).toBeDefined();
    const children = jsx.props.children;
    const warningParagraph = children[0];
    expect(warningParagraph).not.toBeNull();
    expect(warningParagraph.props.className).toContain("bg-amber-50");
  });

  it("parses valid tier parameters correctly", async () => {
    mockGetLeadBySlug.mockResolvedValue(null);

    for (const tier of ["starter", "growth", "complete"] as const) {
      const jsx = await CheckoutPage({
        searchParams: Promise.resolve({ tier }),
      });
      const suspense = jsx.props.children[1];
      const checkoutForm = suspense.props.children;
      expect(checkoutForm.props.prefill.initialTier).toBe(tier);
    }
  });

  it("ignores invalid tier parameters", async () => {
    mockGetLeadBySlug.mockResolvedValue(null);

    const jsx = await CheckoutPage({
      searchParams: Promise.resolve({ tier: "invalid-tier" }),
    });

    const suspense = jsx.props.children[1];
    const checkoutForm = suspense.props.children;
    expect(checkoutForm.props.prefill.initialTier).toBeUndefined();
  });

  it("handles empty or whitespace slug gracefully without database call", async () => {
    const jsx = await CheckoutPage({
      searchParams: Promise.resolve({ slug: "   " }),
    });

    expect(mockGetLeadBySlug).not.toHaveBeenCalled();
    const suspense = jsx.props.children[1];
    const checkoutForm = suspense.props.children;
    expect(checkoutForm.props.prefill.slug).toBeUndefined();
  });
});
