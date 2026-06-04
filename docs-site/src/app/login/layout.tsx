import { Suspense, type ReactNode } from "react";

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>{children}</Suspense>;
}
