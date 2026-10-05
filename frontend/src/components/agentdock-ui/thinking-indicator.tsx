export function ThinkingIndicator({
  label = "thinking",
}: {
  label?: "thinking" | "working";
}) {
  return (
    <div
      className="flex min-h-6 items-center gap-2 px-2 font-mono text-xs leading-5 text-muted-foreground"
      aria-hidden="true"
    >
      <span className="text-primary motion-safe:animate-pulse">&gt;</span>
      <span className="motion-safe:animate-pulse">{label}</span>
    </div>
  );
}
