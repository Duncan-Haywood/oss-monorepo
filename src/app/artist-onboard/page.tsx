import ArtistOnboardingIntakeForm from "@/components/ArtistOnboardingIntakeForm";
import DemoNav from "@/components/shared/DemoNav";

export default function ArtistOnboardPage() {
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-900">
      <DemoNav current="/artist-onboard" />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <ArtistOnboardingIntakeForm />
      </main>
    </div>
  );
}
