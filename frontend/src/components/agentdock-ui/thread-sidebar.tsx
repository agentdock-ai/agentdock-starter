"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, LoaderCircle, Plus, Search, X } from "lucide-react";
import { ChatIcon } from "./icon";
const doubleClickDelayMs = 250;
export interface ChatThread {
  id: string;
  title: string;
  /** Show activity while the app's agent is running this thread. */
  isRunning?: boolean;
}
/** Controlled navigation only. The app owns threads, persistence and authorization. */
export function ThreadSidebar({
  threads,
  selectedId,
  onSelect,
  onNew,
  onRename,
  footer,
}: {
  threads: readonly ChatThread[];
  selectedId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename?: (id: string, title: string) => void;
  footer?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const pendingSelection = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pendingSelection.current) clearTimeout(pendingSelection.current);
    },
    [],
  );
  function selectThread(id: string) {
    if (pendingSelection.current) clearTimeout(pendingSelection.current);
    pendingSelection.current = setTimeout(() => {
      pendingSelection.current = null;
      onSelect(id);
    }, doubleClickDelayMs);
  }
  function renameThread(thread: ChatThread) {
    if (pendingSelection.current) clearTimeout(pendingSelection.current);
    pendingSelection.current = null;
    setDraft(thread.title);
    setRenamingId(thread.id);
  }
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
          data-thread-navigation
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
            className="min-w-0 flex-1 bg-transparent py-1 text-[13px] outline-none placeholder:text-muted-foreground"
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
              {renamingId === thread.id ? (
                <form
                  className="flex min-h-8 items-center gap-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const title = draft.trim();
                    if (title && onRename) onRename(thread.id, title);
                    setRenamingId(null);
                  }}
                >
                  <input
                    autoFocus
                    aria-label="Conversation title"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={200}
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <button
                    type="submit"
                    aria-label="Save title"
                    className="rounded p-1 hover:bg-muted"
                  >
                    <ChatIcon icon={Check} size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel rename"
                    onClick={() => setRenamingId(null)}
                    className="rounded p-1 hover:bg-muted"
                  >
                    <ChatIcon icon={X} size={14} />
                  </button>
                </form>
              ) : (
                <div className="group flex min-h-8 items-center gap-1">
                  <button
                    type="button"
                    aria-current={selectedId === thread.id ? "page" : undefined}
                    data-thread-navigation
                    data-thread-editable={onRename ? "" : undefined}
                    onClick={() =>
                      onRename ? selectThread(thread.id) : onSelect(thread.id)
                    }
                    onDoubleClick={() => onRename && renameThread(thread)}
                    title={thread.title}
                    aria-label={`${thread.title}${thread.isRunning ? ", agent is working" : ""}`}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId === thread.id ? "bg-background text-foreground shadow-sm ring-1 ring-border hover:bg-background" : "text-muted-foreground hover:bg-muted/60"}`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {thread.title}
                    </span>
                  </button>
                  {thread.isRunning && (
                    <span
                      title="Agent is working"
                      className="flex size-6 shrink-0 items-center justify-center text-muted-foreground"
                    >
                      <ChatIcon
                        icon={LoaderCircle}
                        size={13}
                        className="motion-safe:animate-spin"
                      />
                    </span>
                  )}
                </div>
              )}
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
