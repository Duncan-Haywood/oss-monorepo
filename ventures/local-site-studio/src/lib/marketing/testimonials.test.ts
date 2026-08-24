import { describe, expect, it } from "vitest";
import { formatTestimonialAttribution, TESTIMONIALS, type Testimonial } from "./testimonials";

describe("TESTIMONIALS", () => {
  it("starts empty — no fabricated content ships by default", () => {
    expect(TESTIMONIALS).toEqual([]);
  });
});

describe("formatTestimonialAttribution", () => {
  it("formats author and business name as an em-dash attribution line", () => {
    const testimonial: Testimonial = {
      quote: "They built exactly what we previewed, no surprises.",
      authorName: "Jane Doe",
      businessName: "Joe's Bakery",
    };
    expect(formatTestimonialAttribution(testimonial)).toBe("— Jane Doe, Joe's Bakery");
  });

  it("ignores the optional category field", () => {
    const testimonial: Testimonial = {
      quote: "Live in three days.",
      authorName: "Sam Lee",
      businessName: "Mountain Plumbing",
      category: "trades",
    };
    expect(formatTestimonialAttribution(testimonial)).toBe("— Sam Lee, Mountain Plumbing");
  });
});
