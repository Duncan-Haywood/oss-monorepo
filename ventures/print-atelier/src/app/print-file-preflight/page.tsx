import type { Metadata } from "next";
import DemoNav from "@/components/shared/DemoNav";
import PrintFilePreflight from "@/components/PrintFilePreflight";

const title = "Print file preflight for POD artists";
const description =
  "Check one JPEG or PNG print master, or compare up to five, for format, file size, pixel floor, implied DPI, crop, and web-export names before you order a paid proof. Artwork stays in your browser.";

export const metadata: Metadata = {
  title,
  description,
  robots: "index, follow",
  openGraph: {
    title,
    description,
    type: "website",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: "Print Atelier print-file preflight",
      applicationCategory: "DesignApplication",
      operatingSystem: "Any",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      description,
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Does this upload my artwork?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. The files are read in your browser. Dimensions and findings never leave the page except as a JSON file you choose to download.",
          },
        },
        {
          "@type": "Question",
          name: "Can I compare two exports before I order a proof?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Select up to five JPEG or PNG files and pick a print size. The tool ranks implied DPI at that size and names a better master when one file clearly clears the floor.",
          },
        },
        {
          "@type": "Question",
          name: "Is a clean report a print-ready warranty?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. The tool reports a limited automated floor. It does not inspect bleed, ICC profiles, fonts, or a lab's acceptance rules. Confirm requirements with your printer.",
          },
        },
        {
          "@type": "Question",
          name: "What file names trigger a finding?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Names that include web, thumbnail, lowres, instagram, or facebook are flagged as web-export tokens. A size token such as 11x14 is used to estimate implied DPI.",
          },
        },
      ],
    },
  ],
};

export default function PrintFilePreflightPage() {
  return (
    <div className="min-h-screen bg-[#f7f4ef] text-stone-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <DemoNav current="/print-file-preflight" />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
        <div className="mb-10 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-700">
            Print Atelier / studio tools
          </p>
          <h1 className="mt-3 font-serif text-4xl sm:text-6xl">A calmer handoff to print.</h1>
          <p className="mt-5 text-lg leading-8 text-stone-600">
            After using this, you can download a dated technical record of what
            your print master actually contains — format, pixels, implied DPI,
            and obvious web-export names — and see which of two exports is the
            better master at a chosen size, instead of discovering those
            problems on a paid proof.
          </p>
        </div>
        <PrintFilePreflight />
        <section className="mx-auto mt-10 max-w-3xl space-y-4 text-sm leading-7 text-stone-600">
          <h2 className="font-serif text-2xl text-stone-950">What this does not do</h2>
          <p>
            <strong>No warranty.</strong> This tool is provided free and as-is,
            without warranty of any kind, express or implied. It is not
            printing, production, or professional advice, and it does not
            replace a qualified printer or color manager.{" "}
            <strong>
              You are responsible for reviewing and verifying its output before
              relying on it
            </strong>
            , and for meeting any obligation it helps you prepare for. To the
            maximum extent permitted by law, the authors accept no liability for
            any loss or damage arising from its use.
          </p>
          <p>
            Usage counting is anonymous events only (check completed, files
            compared, record exported). No filename, image, IP, or identifying
            information is sent. Honour Do Not Track / Global Privacy Control,
            or use the on-page opt-out.
          </p>
        </section>
      </main>
    </div>
  );
}
