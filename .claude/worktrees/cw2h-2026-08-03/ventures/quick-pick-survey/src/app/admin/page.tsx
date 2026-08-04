import { AdminView } from "@/components/AdminView";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminView />;
}
