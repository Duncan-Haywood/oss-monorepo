import DemoNav from "@/components/shared/DemoNav";
import PrintFilePreflight from "@/components/PrintFilePreflight";

export const metadata = { title: "Print File Preflight | Print Atelier", description: "Run a private technical check on a print master before ordering a proof." };

export default function PrintFilePreflightPage() {
  return <div className="min-h-screen bg-[#f7f4ef] text-stone-900"><DemoNav current="/print-file-preflight" /><main className="mx-auto max-w-6xl px-4 py-10 sm:py-16"><div className="mb-10 max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-700">Print Atelier / studio tools</p><h1 className="mt-3 font-serif text-4xl sm:text-6xl">A calmer handoff to print.</h1><p className="mt-5 text-lg leading-8 text-stone-600">A private, no-upload preflight for artists preparing a master for print-on-demand. Find obvious file problems before they become an expensive physical proof.</p></div><PrintFilePreflight /><p className="mx-auto mt-8 max-w-3xl text-center text-sm text-stone-500">Your usage is counted locally in this browser to help us understand whether this free tool is useful. No filename, image, or identifying information leaves your device.</p></main></div>;
}
