"use client";
import { useState, type ReactNode } from "react";
import { Plus, Search } from "lucide-react";
import { ChatIcon } from "./icon";
export interface ChatThread {
  id: string;
  title: string;
}
/** Controlled navigation only. The app owns threads, persistence and authorization. */
export function ThreadSidebar({
  threads,
  selectedId,
  onSelect,
  onNew,
  footer,
}: {
  threads: readonly ChatThread[];
  selectedId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  footer?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const visible = threads.filter((thread) =>
    thread.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <nav
      aria-label="Threads"
      className="flex h-full min-h-0 flex-col text-[13px]"
    >
      <div className="space-y-1.5 p-3">
        <button
          type="button"
          onClick={onNew}
          className="flex min-h-8 w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChatIcon icon={Plus} size={14} aria-hidden="true" />
          New thread
        </button>
        <label className="flex min-h-8 items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-muted-foreground">
          <ChatIcon icon={Search} size={14} aria-hidden="true" />
          <input
            aria-label="Search threads"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search threads"
            className="min-w-0 flex-1 bg-transparent py-1 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        <p className="px-2 pb-2 pt-3 text-xs text-muted-foreground">
          Conversations
        </p>
        <ul className="space-y-0.5">
          {visible.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                aria-current={selectedId === thread.id ? "page" : undefined}
                onClick={() => onSelect(thread.id)}
                title={thread.title}
                className={`min-h-8 w-full truncate rounded-md px-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring ${selectedId === thread.id ? "bg-muted/60 text-foreground" : "text-muted-foreground"}`}
              >
                {thread.title}
              </button>
            </li>
          ))}
        </ul>
        {!visible.length && (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            No conversations found
          </p>
        )}
      </div>
      {footer && (
        <div className="shrink-0 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </nav>
  );
}
