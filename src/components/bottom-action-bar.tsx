import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Fixed bar in the thumb zone, per SPEC section 6: "one primary action per
// screen at the bottom". paddingBottom clears the home indicator on iOS.
export function BottomActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur",
        className,
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex min-h-14 max-w-md items-center justify-center gap-3 px-4 py-2">
        {children}
      </div>
    </div>
  );
}
