import Link from "next/link";
import { ArrowRight, FileText, Target, Settings, DollarSign, Megaphone } from "lucide-react";

const cards = [
  {
    title: "Business Plan",
    description: "Executive summary, market research, and GTM strategy.",
    href: "/business-plan",
    icon: FileText,
    color: "bg-blue-500",
  },
  {
    title: "Strategy",
    description: "Problem/solution, positioning, and growth tracks.",
    href: "/strategy",
    icon: Target,
    color: "bg-indigo-500",
  },
  {
    title: "Operations",
    description: "Capture workflow, POD fulfillment, and city expansion.",
    href: "/operations",
    icon: Settings,
    color: "bg-purple-500",
  },
  {
    title: "Revenue Model",
    description: "Core splits, unit economics, and fulfillment tiers.",
    href: "/revenue-model",
    icon: DollarSign,
    color: "bg-emerald-500",
  },
  {
    title: "Artist Pitch",
    description: "Value proposition, objection handling, and contract outline.",
    href: "/artist-pitch",
    icon: Megaphone,
    color: "bg-rose-500",
  },
];

export default function Dashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          Print Atelier Dashboard
        </h1>
        <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
          A two-sided art commerce business that digitizes original paintings and sells high-quality prints — without artists trading time for a single sale.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-6 shadow-sm transition-all hover:shadow-md dark:hover:border-gray-700"
          >
            <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${card.color} text-white shadow-sm`}>
              <card.icon className="h-6 w-6" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
              {card.title}
            </h3>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400 flex-1">
              {card.description}
            </p>
            <div className="flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300">
              View document
              <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Why This Scales</h2>
        <div className="prose dark:prose-invert max-w-none">
          <p>
            Revenue is decoupled from any single artist's hours. Each digitized piece becomes inventory that can sell indefinitely. Growth means:
          </p>
          <ol>
            <li><strong>Signing more artists</strong> (supply sales)</li>
            <li><strong>Driving more print buyers</strong> (demand / advertising)</li>
            <li><strong>Expanding to new cities</strong> with field photographers and a repeatable capture playbook</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
