import Link from "next/link";

const docs = [
  {
    title: "Legal",
    href: "/docs/LEGAL.md",
    description: "Maris Stella Labs entity, Terms/Privacy outlines, CAN-SPAM, Stripe, voice disclosures.",
  },
  {
    title: "Architecture",
    href: "/docs/ARCHITECTURE.md",
    description: "Automated funnel, voice agents, preview hosting, payments.",
  },
  {
    title: "Business model",
    href: "/docs/BUSINESS-MODEL.md",
    description: "Pricing, automated funnel, outreach copy.",
  },
  {
    title: "Compliance",
    href: "/docs/COMPLIANCE.md",
    description: "CAN-SPAM, TCPA, Colorado CPA, scraping ethics, data retention.",
  },
  {
    title: "Roadmap",
    href: "/docs/ROADMAP.md",
    description: "Phased implementation plan.",
  },
];

export default function DocsIndexPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Documentation</h1>
      <p className="mt-3 text-zinc-600">
        Maris Stella Labs · Colorado, USA — Local Site Studio project docs in{" "}
        <code className="text-sm">docs/</code>.
      </p>

      <div className="mt-10 space-y-4">
        {docs.map((doc) => (
          <div
            key={doc.href}
            className="rounded-xl border border-zinc-200 p-5"
          >
            <h2 className="font-semibold">{doc.title}</h2>
            <p className="mt-1 text-sm text-zinc-600">{doc.description}</p>
            <p className="mt-2 font-mono text-xs text-zinc-500">
              {doc.href.replace("/docs/", "docs/")}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-10 flex gap-6 text-sm">
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy
        </Link>
        <Link href="/terms" className="underline underline-offset-2">
          Terms
        </Link>
        <Link href="/" className="underline underline-offset-2">
          Home
        </Link>
      </div>
    </main>
  );
}
