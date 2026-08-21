import DemoNav from "@/components/shared/DemoNav";
import PartnerCredentialVault from "@/components/PartnerCredentialVault";

export default function PartnerSetupPage() {
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <DemoNav current="/partner-setup" />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <PartnerCredentialVault />
      </main>
    </div>
  );
}
