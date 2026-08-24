import CheckoutLab from "@/components/CheckoutLab";
import DemoNav from "@/components/shared/DemoNav";

export const dynamic = "force-dynamic";

type CheckoutPageProps = {
  searchParams: Promise<{
    add?: string | string[];
    status?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const params = await searchParams;
  const addSlug = firstParam(params.add)?.trim();

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <DemoNav current="/checkout" />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <CheckoutLab addSlug={addSlug} />
      </main>
    </div>
  );
}
