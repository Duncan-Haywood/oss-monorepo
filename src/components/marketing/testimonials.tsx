import { formatTestimonialAttribution, TESTIMONIALS } from "@/lib/marketing/testimonials";

/**
 * Renders nothing until TESTIMONIALS (src/lib/marketing/testimonials.ts) has
 * at least one real, operator-added entry — see that file's doc comment for
 * why this ships empty rather than with placeholder/fabricated quotes.
 */
export function Testimonials() {
  if (TESTIMONIALS.length === 0) {
    return null;
  }

  return (
    <section id="testimonials" className="border-y border-zinc-200 bg-zinc-50">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">What clients say</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((testimonial) => (
            <figure
              key={formatTestimonialAttribution(testimonial)}
              className="rounded-2xl bg-white p-6 shadow-sm"
            >
              <blockquote className="text-sm leading-6 text-zinc-700">
                &ldquo;{testimonial.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-4 text-sm font-medium text-zinc-500">
                {formatTestimonialAttribution(testimonial)}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
