import { FileText, LoaderCircle, RotateCw, X } from "lucide-react";
import { ChatIcon } from "./icon";
import type { AttachmentDraft } from "./use-chat-attachments";

export function ComposerAttachments({
  items,
  onRemove,
  onRetry,
}: {
  items: readonly AttachmentDraft[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  return (
    <ul
      aria-label="Message attachments"
      className="flex flex-wrap gap-2 px-1 pb-2 pt-1"
    >
      {items.map((item) => (
        <li
          key={item.id}
          className="flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-border bg-background/50 p-1.5"
        >
          {item.previewUrl ? (
            <img
              src={item.previewUrl}
              alt=""
              className="size-8 rounded-md object-cover"
            />
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
              <ChatIcon icon={FileText} size={16} />
            </span>
          )}
          <div className="min-w-0 max-w-44">
            <p className="truncate text-xs leading-4" title={item.file.name}>
              {item.file.name}
            </p>
            <p
              role="status"
              className={`text-[10px] leading-4 ${item.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
            >
              {item.status === "uploading"
                ? "Uploading…"
                : item.status === "error"
                  ? item.error || "Upload failed"
                  : `${Math.max(1, Math.round(item.file.size / 1_000))} KB`}
            </p>
          </div>
          {item.status === "uploading" && (
            <ChatIcon
              icon={LoaderCircle}
              size={12}
              className="motion-safe:animate-spin text-muted-foreground"
            />
          )}
          {item.status === "error" && (
            <button
              type="button"
              aria-label={`Retry upload ${item.file.name}`}
              onClick={() => onRetry(item.id)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChatIcon icon={RotateCw} size={12} />
            </button>
          )}
          <button
            type="button"
            aria-label={`Remove attachment ${item.file.name}`}
            onClick={() => onRemove(item.id)}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChatIcon icon={X} size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}
