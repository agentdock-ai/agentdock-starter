export function EmptyState({
  title = "How can I help you today?",
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="mb-8 px-2 text-center">
      <h1 className="text-[26px] font-semibold leading-9 tracking-[-0.045em] sm:text-[28px]">
        {title}
      </h1>
      {description && (
        <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
export function Suggestions({
  suggestions,
  disabled,
  onSubmit,
}: {
  suggestions: readonly string[];
  disabled?: boolean;
  onSubmit: (text: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      {suggestions.map((prompt) => (
        <button
          type="button"
          key={prompt}
          disabled={disabled}
          onClick={() => onSubmit(prompt)}
          className="min-h-8 rounded-lg border border-border px-3 py-1 text-[12px] leading-5 text-muted-foreground outline-none hover:bg-muted/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
