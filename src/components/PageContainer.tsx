import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Standard page layout container — applies shared max-width, padding, and vertical rhythm.
 * Use across primary app pages for consistent spacing.
 */
export default function PageContainer({ children, className }: PageContainerProps) {
  return (
    <main className={cn("mx-auto max-w-7xl px-6 lg:px-10 py-10 space-y-8", className)}>
      {children}
    </main>
  );
}
