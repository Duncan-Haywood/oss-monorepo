import Link from "next/link";

const docs = [
  {
    title: "Architecture",
    href: "/docs/ARCHITECTURE.md",
    description: "System design: ingestion, site generation, preview hosting, outreach, payments.",
  },
  {
    title: "Business model",
    href: "/docs/BUSINESS-MODEL.md",
    description: "Pricing, sales funnel, and outreach script outlines.",
  },
  {
    title: "Compliance",
    href: "/docs/COMPLIANCE.md",
    description: "Scraping ethics, email laws, GDPR, and data retention.",
  },
  {
    title: "Roadmap",
    href: "/docs/ROADMAP.md",
    description: "Phased implementation plan for Cursor Cloud continuation.",
  },
];

export default function DocsIndexPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Documentation</h1>
      <p className="mt-3 text-zinc-600">
        Project docs live in the <code className="text-sm">docs/</code> directory. Links
        below open the markdown files on GitHub after push, or read them locally in your
        editor.
      </p>

      <div className="mt-10 space-y-4">
        {docs.map((doc) => (
          <div
            key={doc.href}
            className="rounded-xl border border-zinc-200 p-5"
          >
            <h2 className="font-semibold">{doc.title}</h2>
            <p className="mt-1 text-sm text-zinc-600">{doc.description}</p>
            <p className="mt-2 font-mono text-xs text-zinc-500">{doc.href.replace("/docs/", "docs/")}</p>
          </div>
        ))}
      </div>

      <p className="mt-10 text-sm text-zinc-500">
        <Link href="/" className="underline underline-offset-2">
          Back to home
        </Link>
      </p>
    </main>
  );
}
