import type { LucideIcon, LucideProps } from "lucide-react";
import { cn } from "./utils";

/** Shared thin strokes and stable dimensions for the chat's decorative icons. */
export function ChatIcon({
  icon: Icon,
  className,
  ...props
}: LucideProps & { icon: LucideIcon }) {
  return (
    <Icon
      aria-hidden="true"
      {...props}
      strokeWidth={1.5}
      className={cn("shrink-0", className)}
    />
  );
}
