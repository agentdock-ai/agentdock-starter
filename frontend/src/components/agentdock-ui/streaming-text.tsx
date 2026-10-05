import { MarkdownContent } from "./markdown-content";
export function StreamingText({
  text,
  active,
}: {
  text: string;
  active: boolean;
}) {
  return (
    <div data-streaming={active || undefined} className="relative min-w-0">
      <MarkdownContent text={text} />
    </div>
  );
}
