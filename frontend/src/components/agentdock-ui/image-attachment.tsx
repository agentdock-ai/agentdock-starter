"use client";
import { useRef, useState } from "react";
import { ExternalLink, ImageOff, X } from "lucide-react";
import { ChatIcon } from "./icon";

/** Presentation only: image URLs come from the consuming app's content blocks. */
export function ImageAttachment({ url }: { url: string }) {
  const preview = useRef<HTMLDialogElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  return (
    <div className="w-fit max-w-full">
      <button
        type="button"
        aria-label="Preview attached image"
        aria-haspopup="dialog"
        onClick={() => preview.current?.showModal()}
        className="flex size-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-border bg-muted outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {unavailable ? (
          <ChatIcon
            icon={ImageOff}
            size={20}
            className="text-muted-foreground"
          />
        ) : (
          <img
            src={url}
            alt="Attached image"
            loading="lazy"
            onError={() => setUnavailable(true)}
            className="size-full object-cover"
          />
        )}
      </button>
      <dialog
        ref={preview}
        aria-label="Attached image preview"
        onClick={(event) => {
          if (event.target === event.currentTarget) preview.current?.close();
        }}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl overflow-auto rounded-xl border border-border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/70"
      >
        <div>
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <span className="text-[13px]">Attached image</span>
            <div className="flex items-center gap-1">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open original image"
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChatIcon icon={ExternalLink} size={16} />
              </a>
              <button
                type="button"
                autoFocus
                aria-label="Close image preview"
                onClick={() => preview.current?.close()}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChatIcon icon={X} size={16} />
              </button>
            </div>
          </header>
          {unavailable ? (
            <p
              role="status"
              className="p-8 text-center text-sm text-muted-foreground"
            >
              Image preview unavailable.
            </p>
          ) : (
            <img
              src={url}
              alt="Attached image"
              loading="lazy"
              onError={() => setUnavailable(true)}
              className="max-h-[calc(100dvh-7rem)] w-full bg-muted/30 object-contain"
            />
          )}
        </div>
      </dialog>
    </div>
  );
}
