import CheckoutLab from "@/components/CheckoutLab";
import DemoNav from "@/components/shared/DemoNav";

type CheckoutPageProps = {
  searchParams: Promise<{
    add?: string | string[];
    status?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const params = await searchParams;
  const addSlug = firstParam(params.add).trim();

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <DemoNav current="/checkout" />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <CheckoutLab addSlug={addSlug || undefined} />
      </main>
      <footer className="max-w-7xl mx-auto px-4 pb-8 text-xs leading-5 text-stone-500">
        <p>
          <strong>No warranty.</strong> This checkout lab is a free demo. It is not financial,
          tax, or legal advice and does not collect payment unless you configure your own Stripe
          test keys. You remain responsible for reviewing totals, rights, and fulfillment before
          any live sale. To the maximum extent permitted by law, the authors accept no liability
          for loss arising from its use.
        </p>
      </footer>
    </div>
  );
}
