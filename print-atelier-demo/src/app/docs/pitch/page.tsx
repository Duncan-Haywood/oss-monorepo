export default function PitchPage() {
  return (
    <div className="max-w-4xl mx-auto p-10 space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-2">Artist Pitch</h1>
        <p className="text-xl text-gray-500">The Modern, Tech-Enabled Partnership</p>
      </div>

      <section className="bg-indigo-900 text-white p-8 rounded-xl shadow-lg">
        <h2 className="text-sm font-semibold tracking-wider uppercase text-indigo-300 mb-2">The One-Liner</h2>
        <p className="text-2xl font-medium leading-relaxed">
          &quot;We use AI to perfect digital masters of your work, plug them into our global fulfillment software, and auto-route 30% of profits to your bank account on every sale — you just keep painting.&quot;
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-8">
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold border-b pb-2">The Old Way</h2>
          <ul className="space-y-3">
            <li className="flex gap-2">
              <span className="text-red-500 font-bold">✕</span>
              <span className="text-gray-700">Spend weeks painting, sell it once.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-red-500 font-bold">✕</span>
              <span className="text-gray-700">Galleries take 50% of your original sale.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-red-500 font-bold">✕</span>
              <span className="text-gray-700">If you do prints, you handle packaging, post office runs, and customer service.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-red-500 font-bold">✕</span>
              <span className="text-gray-700">Marketing is a manual, soul-crushing grind on Instagram.</span>
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold border-b pb-2">The Print Atelier Way</h2>
          <ul className="space-y-3">
            <li className="flex gap-2">
              <span className="text-green-500 font-bold">✓</span>
              <span className="text-gray-700">Upload a photo. Our AI handles color-matching and upscaling.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-500 font-bold">✓</span>
              <span className="text-gray-700">Our B2B sales software pitches your work to interior designers globally.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-500 font-bold">✓</span>
              <span className="text-gray-700">Zero-touch fulfillment. We print and ship via API.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-500 font-bold">✓</span>
              <span className="text-gray-700">Stripe Connect dashboard shows your earnings in real-time.</span>
            </li>
          </ul>
        </section>
      </div>

      <section className="space-y-4 pt-6">
        <h2 className="text-2xl font-semibold border-b pb-2">Objection Handling</h2>
        <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200">
            <div className="p-5">
              <h3 className="font-semibold text-gray-900 mb-1">&quot;I already sell prints myself&quot;</h3>
              <p className="text-gray-600 text-sm">Great — we expand your reach to our B2B network (corporate, hospitality) without replacing your direct sales. Non-exclusive options available.</p>
            </div>
            <div className="p-5">
              <h3 className="font-semibold text-gray-900 mb-1">&quot;Will the prints look good?&quot;</h3>
              <p className="text-gray-600 text-sm">Our software enforces ICC color profiles and we use premium API-integrated labs. You approve a digital/physical proof before listing.</p>
            </div>
            <div className="p-5 border-t border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-1">&quot;30% sounds low&quot;</h3>
              <p className="text-gray-600 text-sm">Compare to a gallery taking 50% on one original sale. This is 30% of Net Profit on *every* print, forever, with zero labor, marketing cost, or software fees from you.</p>
            </div>
            <div className="p-5 border-t border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-1">&quot;What if it doesn&apos;t sell?&quot;</h3>
              <p className="text-gray-600 text-sm">Zero cost to you. Worst case: you get a free, AI-enhanced archival master file of your work to keep.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 pt-4">
        <h2 className="text-2xl font-semibold border-b pb-2">Digital Portal</h2>
        <p className="text-gray-700">
          Artists don&apos;t wait for monthly PDFs. They log into their <strong>Partner Dashboard</strong> to see real-time sales, geographic heatmaps of where their art is popular, and automatic payouts.
        </p>
      </section>
    </div>
  );
}
