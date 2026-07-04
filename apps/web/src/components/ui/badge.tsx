import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap",
  {
    variants: {
      variant: {
        good: "border-transparent bg-emerald-600/15 text-emerald-700 dark:text-emerald-400",
        marginal: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
        poor: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "marginal" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
