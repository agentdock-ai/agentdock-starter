"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MessagesSquare, PanelLeft, X } from "lucide-react";
import { ChatIcon } from "./icon";
import { cn } from "./utils";
export function ChatWorkspace({
  children,
  sidebar,
  title = "New chat",
  brand = "Agentdock",
  actions,
  className,
}: {
  children: ReactNode;
  sidebar: ReactNode;
  title?: string;
  brand?: string;
  actions?: ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const mobile = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    mobile.current?.close();
  }, [title]);
  const brandRow = (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4 text-[13px]">
      <span className="flex items-center gap-2">
        <ChatIcon icon={MessagesSquare} size={16} aria-hidden="true" />
        {brand}
      </span>
      <button
        type="button"
        aria-label="Collapse thread sidebar"
        onClick={() => setExpanded(false)}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChatIcon icon={PanelLeft} size={14} />
      </button>
    </div>
  );
  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full overflow-hidden rounded-md border border-border bg-background font-sans text-foreground antialiased",
        className,
      )}
    >
      {expanded && (
        <aside
          aria-label="Thread sidebar"
          className="hidden w-60 shrink-0 flex-col border-r border-border bg-muted/70 md:flex"
        >
          {brandRow}
          <div className="min-h-0 flex-1">{sidebar}</div>
        </aside>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Open thread sidebar"
              onClick={() => {
                if (matchMedia("(min-width: 768px)").matches) setExpanded(true);
                else mobile.current?.showModal();
              }}
              className={cn(
                "flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                expanded && "md:hidden",
              )}
            >
              <ChatIcon icon={PanelLeft} size={15} />
            </button>
            <span className="truncate text-[13px]">{title}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            {actions}
          </div>
        </header>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
      </div>
      <dialog
        ref={mobile}
        aria-label="Thread sidebar"
        className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-none w-[min(19rem,85vw)] max-w-none border-0 border-r border-border bg-background p-0 text-foreground backdrop:bg-black/40"
      >
        <div className="flex h-full min-h-0 flex-col bg-muted/30">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4 text-[13px]">
            <span>{brand}</span>
            <button
              type="button"
              aria-label="Close thread sidebar"
              onClick={() => mobile.current?.close()}
              className="flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChatIcon icon={X} size={15} />
            </button>
          </div>
          <div
            className="min-h-0 flex-1"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("button"))
                mobile.current?.close();
            }}
          >
            {sidebar}
          </div>
        </div>
      </dialog>
    </div>
  );
}
