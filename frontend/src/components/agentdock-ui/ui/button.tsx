import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils";
export const Button = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & {
    variant?: "primary" | "ghost" | "outline";
  }
>(function Button(
  { className, variant = "ghost", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex min-h-7 shrink-0 items-center justify-center gap-2 rounded-lg px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none",
        variant === "primary"
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : variant === "outline"
            ? "border border-border bg-background text-foreground hover:bg-muted"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
});
