import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        // Quiet by default: a badge reports state, it is not a call to action.
        // For "click me" use <Button>.
        default: "border-border bg-surface-2 text-muted-foreground",
        brand: "border-brand/30 bg-brand/10 text-brand",
        synced: "border-status-synced/30 bg-status-synced/10 text-status-synced",
        syncing: "border-status-syncing/30 bg-status-syncing/10 text-status-syncing",
        pending: "border-status-pending/30 bg-status-pending/10 text-status-pending",
        error: "border-status-error/30 bg-status-error/10 text-status-error",
        idle: "border-border bg-transparent text-subtle-foreground",
        secondary: "border-transparent bg-surface-3 text-secondary-foreground",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
