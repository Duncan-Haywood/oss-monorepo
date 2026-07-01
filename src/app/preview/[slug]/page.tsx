import Link from "next/link";
import { PlaceholderBanner } from "@/components/placeholder-banner";

type PreviewPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function PreviewPage({ params }: PreviewPageProps) {
  const { slug } = await params;
  const businessName = slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 to-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <PlaceholderBanner
          title="Client preview site (template placeholder)"
          description={`In production, this page would be deployed to ${slug}.preview.localsitestudio.com with business-specific content.`}
          docsHref="/docs/architecture#preview-hosting"
        />
      </div>

      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-amber-700">
          Preview for {businessName}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-900">
          Welcome to {businessName}
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-600">
          This is a placeholder landing page template. Your actual site will include
          your logo, photos, services, hours, and contact details.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/checkout"
            className="inline-flex h-12 items-center justify-center rounded-full bg-zinc-900 px-8 font-medium text-white"
          >
            Claim this site — $500
          </Link>
          <span className="text-sm text-zinc-500">
            Questions? Call our AI assistant or reply to your Maris Stella Labs email.
          </span>
        </div>
      </section>
    </main>
  );
}
