import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";

/**
 * Shared shell for Terms and Privacy. Both are plain documents: the job is
 * legibility and a stable anchor for each section, not art direction.
 */
export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 py-12 lg:py-16">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Last updated {updated}
        </p>
        <div className="mt-10 space-y-8 text-sm leading-relaxed text-muted-foreground [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mb-2 [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-foreground">
          {children}
        </div>
      </main>
    </div>
  );
}
