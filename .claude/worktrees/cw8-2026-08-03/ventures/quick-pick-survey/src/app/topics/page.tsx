import { TopicPickerView } from "@/components/TopicPickerView";

export default function TopicsPage() {
  return (
    <main className="flex min-h-screen flex-col bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-50">
      <TopicPickerView />
    </main>
  );
}
