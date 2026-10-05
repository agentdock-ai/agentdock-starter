import type { ReactNode } from "react";
import { cn } from "./utils";
export function ChatShell({
  children,
  footer,
  className,
  empty = false,
}: {
  children: ReactNode;
  footer: ReactNode;
  className?: string;
  empty?: boolean;
}) {
  return (
    <section
      aria-label="Agent conversation"
      className={cn(
        "relative flex h-full min-h-0 w-full min-w-0 flex-col bg-background font-sans text-[14px] text-foreground antialiased",
        empty ? "overflow-y-auto" : "overflow-hidden",
        className,
      )}
    >
      <div className={empty ? "hidden" : "contents"}>{children}</div>
      <div
        className={cn(
          "z-10 shrink-0 bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
          empty ? "my-auto w-full py-8" : "pt-2 sm:pb-5",
        )}
      >
        <div className="mx-auto w-full max-w-[42rem]">{footer}</div>
      </div>
    </section>
  );
}
